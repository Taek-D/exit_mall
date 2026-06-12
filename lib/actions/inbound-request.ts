'use server';

import { createClient } from '@/lib/supabase/server';
import {
  callRpc,
  formatZodError,
  mutationTable,
  revalidatePaths,
  type ActionResult,
} from '@/lib/actions/_shared';
import { inboundDetailPaths, inboundListPaths } from '@/lib/actions/_revalidate-paths';
import { requireSignedIn } from '@/lib/actions/_guards';
import {
  inboundRequestCreateSchema,
  inboundCommentSchema,
} from '@/lib/schemas';
import { inboundCleanupPaths } from '@/lib/inbound/upload-paths';
import {
  prepareInboundUploads,
  renameInboundUploadsToCanonical,
  submitInboundRequestRpc,
} from '@/lib/inbound/uploads';
import {
  mapInboundCancelError,
  mapInboundCommentError,
  mapInboundStatusError,
} from '@/lib/inbound/action-errors';
import { getInboundCommentAccessError } from '@/lib/inbound/comment-access';

export type SubmitResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string };

export async function submitInboundRequestAction(
  _prevState: SubmitResult | null,
  fd: FormData,
): Promise<SubmitResult> {
  const guard = await requireSignedIn();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase, user } = guard;

  const parsed = inboundRequestCreateSchema.safeParse({
    title: String(fd.get('title') ?? ''),
    body: String(fd.get('body') ?? ''),
  });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  // ① prepare uploads
  const prepared = await prepareInboundUploads(supabase, user.id, fd);
  if (!prepared.ok) return prepared;
  const { excelFile, excelPath, imagePaths, inboundItems } = prepared;

  // ② submit RPC
  const submitted = await submitInboundRequestRpc(
    supabase,
    parsed.data,
    excelPath,
    excelFile.name,
    imagePaths,
    inboundItems,
  );
  if (!submitted.ok) {
    await supabase.storage
      .from('inbound-requests')
      .remove(inboundCleanupPaths(excelPath, imagePaths));
    return submitted;
  }

  // ③ rename to canonical (DB update / rollback / chase-update 모두 내부 처리)
  await renameInboundUploadsToCanonical(
    supabase,
    user.id,
    submitted.requestId,
    excelFile.name,
    excelPath,
    imagePaths,
  );

  revalidatePaths(inboundListPaths());
  return { ok: true, requestId: submitted.requestId };
}

export async function cancelInboundRequestAction(requestId: string): Promise<ActionResult> {
  // RLS가 권한을 검증하므로 user.id가 필요 없는 액션은 createClient만으로 충분.
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'cancel_inbound_request', { request_id: requestId });
  if (error) {
    const mapped = mapInboundCancelError(error.message);
    if (mapped) return { ok: false, error: mapped };
    console.error('[inbound] cancel', { requestId, error });
    return { ok: false, error: '취소 처리에 실패했습니다.' };
  }
  revalidatePaths(inboundDetailPaths(requestId));
  return { ok: true };
}

export async function setInboundStatusAction(
  requestId: string,
  newStatus: 'in_progress' | 'completed' | 'cancelled',
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'set_inbound_status', {
    request_id: requestId,
    new_status: newStatus,
  });
  if (error) {
    const mapped = mapInboundStatusError(error.message);
    if (mapped) return { ok: false, error: mapped };
    console.error('[inbound] setStatus', { requestId, newStatus, error });
    return { ok: false, error: '상태 변경에 실패했습니다.' };
  }
  revalidatePaths(inboundDetailPaths(requestId));
  return { ok: true };
}

export async function markInboundReadAction(requestId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'mark_inbound_read', { request_id: requestId });
  if (error) {
    console.error('[inbound] markRead', { requestId, error });
    return { ok: false, error: '읽음 처리에 실패했습니다.' };
  }
  return { ok: true };
}

export async function addInboundCommentAction(
  requestId: string,
  body: string,
): Promise<ActionResult<{ id: string }>> {
  // 권한은 add_inbound_comment RPC + RLS가 검증한다(작성자/관리자/활성 계정).
  // user.id가 직접 필요 없어 requireSignedIn 가드를 생략한다(update/delete는 가드 사용).
  const supabase = createClient();
  const parsed = inboundCommentSchema.safeParse({ body });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const { data, error } = await callRpc(supabase, 'add_inbound_comment', {
    request_id: requestId,
    body: parsed.data.body,
  });
  if (error) {
    const mapped = mapInboundCommentError(error.message);
    if (mapped) return { ok: false, error: mapped };
    console.error('[inbound] addComment', { requestId, error });
    return { ok: false, error: '댓글 작성에 실패했습니다.' };
  }
  revalidatePaths([
    `/inbound-requests/${requestId}`,
    `/admin/inbound-requests/${requestId}`,
  ]);
  return { ok: true, id: data as string };
}

type CommentRow = { author_id: string; created_at: string; request_id: string };

export async function updateInboundCommentAction(
  commentId: string,
  body: string,
): Promise<ActionResult> {
  const guard = await requireSignedIn();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase, user, profile } = guard;

  const parsed = inboundCommentSchema.safeParse({ body });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const { data: row } = (await supabase
    .from('inbound_request_comments')
    .select('author_id, created_at, request_id')
    .eq('id', commentId)
    .maybeSingle()) as { data: CommentRow | null; error: unknown };
  if (!row) return { ok: false, error: '댓글을 찾을 수 없습니다.' };

  const accessError = getInboundCommentAccessError({
    authorId: row.author_id,
    currentUserId: user.id,
    createdAt: row.created_at,
    isAdmin: profile.role === 'admin',
    action: '수정',
  });
  if (accessError) return { ok: false, error: accessError };

  const { error } = await mutationTable(supabase, 'inbound_request_comments')
    .update({ body: parsed.data.body, updated_at: new Date().toISOString() })
    .eq('id', commentId);
  if (error) {
    console.error('[inbound] updateComment', { commentId, error });
    return { ok: false, error: '댓글 수정에 실패했습니다.' };
  }
  revalidatePaths([
    `/inbound-requests/${row.request_id}`,
    `/admin/inbound-requests/${row.request_id}`,
  ]);
  return { ok: true };
}

export async function deleteInboundCommentAction(commentId: string): Promise<ActionResult> {
  const guard = await requireSignedIn();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase, user, profile } = guard;

  const { data: row } = (await supabase
    .from('inbound_request_comments')
    .select('author_id, created_at, request_id')
    .eq('id', commentId)
    .maybeSingle()) as { data: CommentRow | null; error: unknown };
  if (!row) return { ok: false, error: '댓글을 찾을 수 없습니다.' };

  const accessError = getInboundCommentAccessError({
    authorId: row.author_id,
    currentUserId: user.id,
    createdAt: row.created_at,
    isAdmin: profile.role === 'admin',
    action: '삭제',
  });
  if (accessError) return { ok: false, error: accessError };

  const { error } = await mutationTable(supabase, 'inbound_request_comments')
    .delete()
    .eq('id', commentId);
  if (error) {
    console.error('[inbound] deleteComment', { commentId, error });
    return { ok: false, error: '댓글 삭제에 실패했습니다.' };
  }
  revalidatePaths([
    `/inbound-requests/${row.request_id}`,
    `/admin/inbound-requests/${row.request_id}`,
  ]);
  return { ok: true };
}

export type AttachmentUrlResult = { ok: true; url: string } | { ok: false; error: string };

export async function getInboundAttachmentUrlAction(
  requestId: string,
  path: string,
): Promise<AttachmentUrlResult> {
  const supabase = createClient();
  type InboundReqRow = {
    id: string;
    excel_storage_path: string;
    image_paths: string[] | null;
  };
  const { data: req } = (await supabase
    .from('inbound_requests')
    .select('id, excel_storage_path, image_paths')
    .eq('id', requestId)
    .maybeSingle()) as { data: InboundReqRow | null; error: unknown };
  if (!req) return { ok: false, error: '요청을 찾을 수 없습니다.' };
  const allowed =
    req.excel_storage_path === path ||
    (Array.isArray(req.image_paths) && req.image_paths.includes(path));
  if (!allowed) return { ok: false, error: '잘못된 첨부 경로입니다.' };

  const { data, error } = await supabase.storage
    .from('inbound-requests')
    .createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? '서명 URL 생성 실패' };
  }
  return { ok: true, url: data.signedUrl };
}

export async function deleteInboundRequestAction(requestId: string): Promise<ActionResult> {
  const supabase = createClient();
  type InboundStorageRow = { excel_storage_path: string; image_paths: string[] | null };
  const { data: row } = (await supabase
    .from('inbound_requests')
    .select('excel_storage_path, image_paths')
    .eq('id', requestId)
    .maybeSingle()) as { data: InboundStorageRow | null; error: unknown };

  const { error } = await mutationTable(supabase, 'inbound_requests')
    .delete()
    .eq('id', requestId);
  if (error) {
    console.error('[inbound] delete', { requestId, error });
    return { ok: false, error: '삭제할 수 없는 상태이거나 권한이 없습니다.' };
  }

  if (row) {
    const paths: string[] = [
      row.excel_storage_path,
      ...((row.image_paths as string[] | null) ?? []),
    ].filter(Boolean) as string[];
    if (paths.length > 0) {
      await supabase.storage.from('inbound-requests').remove(paths);
    }
  }
  revalidatePaths(inboundListPaths());
  return { ok: true };
}
