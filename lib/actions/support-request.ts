'use server';

import { randomUUID } from 'crypto';
import {
  callRpc,
  formatZodError,
  mutationTable,
  revalidatePaths,
  type ActionResult,
} from '@/lib/actions/_shared';
import { fileToBuffer } from '@/lib/files/excel';
import { supportCommentSchema, supportRequestCreateSchema } from '@/lib/schemas';
import { createClient } from '@/lib/supabase/server';
import {
  mapSubmitSupportRequestError,
  mapSupportCancelError,
  mapSupportCommentError,
  mapSupportStatusError,
} from '@/lib/support/action-errors';
import { getSupportCommentAccessError } from '@/lib/support/permissions';
import { supportAttachmentPath, supportCleanupPaths } from '@/lib/support/upload-paths';

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXT = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.pdf',
  '.xlsx',
  '.xls',
  '.docx',
  '.txt',
];

export type SubmitSupportResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string };

function lower(value: string): string {
  return value.toLowerCase();
}

function isAllowedAttachment(file: File): boolean {
  const name = lower(file.name);
  return ALLOWED_ATTACHMENT_EXT.some((ext) => name.endsWith(ext));
}

function collectAttachments(fd: FormData): File[] | { error: string } {
  const files = fd
    .getAll('attachments')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length > MAX_ATTACHMENTS) {
    return { error: `첨부파일은 최대 ${MAX_ATTACHMENTS}개까지 업로드할 수 있습니다.` };
  }

  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return { error: '첨부파일은 파일당 10MB 이하여야 합니다.' };
    }
    if (!isAllowedAttachment(file)) {
      return { error: '첨부파일은 jpg/jpeg/png/webp/pdf/xlsx/xls/docx/txt 형식만 가능합니다.' };
    }
  }

  return files;
}

function supportDetailPaths(requestId: string): string[] {
  return [
    '/support-requests',
    `/support-requests/${requestId}`,
    '/admin/support-requests',
    `/admin/support-requests/${requestId}`,
  ];
}

export async function submitSupportRequestAction(
  _prevState: SubmitSupportResult | null,
  fd: FormData,
): Promise<SubmitSupportResult> {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: '로그인이 필요합니다.' };

  const parsed = supportRequestCreateSchema.safeParse({
    category: String(fd.get('category') ?? ''),
    title: String(fd.get('title') ?? ''),
    body: String(fd.get('body') ?? ''),
    referenceType: String(fd.get('referenceType') ?? 'none'),
    referenceValue: String(fd.get('referenceValue') ?? ''),
  });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const attachments = collectAttachments(fd);
  if (!Array.isArray(attachments)) return { ok: false, error: attachments.error };

  const { data: requestIdData, error: rpcErr } = await callRpc(
    supabase,
    'submit_support_request_rpc',
    {
      p_category: parsed.data.category,
      p_title: parsed.data.title,
      p_body: parsed.data.body,
      p_reference_type: parsed.data.referenceType,
      p_reference_value: parsed.data.referenceValue,
    },
  );

  if (rpcErr || !requestIdData) {
    const mapped = mapSubmitSupportRequestError(rpcErr?.message ?? '');
    if (mapped) return { ok: false, error: mapped };
    console.error('[support] submit_support_request_rpc', rpcErr);
    return { ok: false, error: '문의 등록에 실패했습니다.' };
  }

  const requestId = String(requestIdData);
  const uploadedPaths: string[] = [];
  const insertedAttachmentIds: string[] = [];

  try {
    for (const file of attachments) {
      const attachmentId = randomUUID();
      const storagePath = supportAttachmentPath({
        userId: u.user.id,
        requestId,
        attachmentId,
        originalName: file.name,
      });
      const buffer = await fileToBuffer(file);
      const { error: uploadErr } = await supabase.storage
        .from('support-requests')
        .upload(storagePath, buffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });
      if (uploadErr) throw uploadErr;
      uploadedPaths.push(storagePath);

      const { error: metaErr } = await mutationTable(supabase, 'support_request_attachments').insert({
        id: attachmentId,
        request_id: requestId,
        user_id: u.user.id,
        storage_path: storagePath,
        original_name: file.name,
        content_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
      });
      if (metaErr) throw metaErr;
      insertedAttachmentIds.push(attachmentId);
    }
  } catch (error) {
    if (insertedAttachmentIds.length > 0) {
      await mutationTable(supabase, 'support_request_attachments')
        .delete()
        .in('id', insertedAttachmentIds);
    }
    await supabase.storage.from('support-requests').remove(supportCleanupPaths(uploadedPaths));
    await mutationTable(supabase, 'support_requests').delete().eq('id', requestId);
    console.error('[support] attachment upload failed', error);
    return { ok: false, error: '첨부파일 업로드에 실패했습니다. 다시 시도해주세요.' };
  }

  revalidatePaths(['/support-requests', '/admin/support-requests']);
  return { ok: true, requestId };
}

export async function cancelSupportRequestAction(requestId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'cancel_support_request', {
    p_request_id: requestId,
  });
  if (error) {
    const mapped = mapSupportCancelError(error.message);
    if (mapped) return { ok: false, error: mapped };
    console.error('[support] cancel', { requestId, error });
    return { ok: false, error: '취소 처리에 실패했습니다.' };
  }
  revalidatePaths(supportDetailPaths(requestId));
  return { ok: true };
}

export async function setSupportStatusAction(
  requestId: string,
  newStatus: 'in_progress' | 'completed' | 'cancelled',
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'set_support_status', {
    p_request_id: requestId,
    p_new_status: newStatus,
  });
  if (error) {
    const mapped = mapSupportStatusError(error.message);
    if (mapped) return { ok: false, error: mapped };
    console.error('[support] setStatus', { requestId, newStatus, error });
    return { ok: false, error: '상태 변경에 실패했습니다.' };
  }
  revalidatePaths(supportDetailPaths(requestId));
  return { ok: true };
}

export async function markSupportReadAction(requestId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'mark_support_read', {
    p_request_id: requestId,
  });
  if (error) {
    console.error('[support] markRead', { requestId, error });
    return { ok: false, error: '읽음 처리에 실패했습니다.' };
  }
  return { ok: true };
}

export async function addSupportCommentAction(
  requestId: string,
  body: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = createClient();
  const parsed = supportCommentSchema.safeParse({ body });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const { data, error } = await callRpc(supabase, 'add_support_comment', {
    p_request_id: requestId,
    p_body: parsed.data.body,
  });
  if (error) {
    const mapped = mapSupportCommentError(error.message);
    if (mapped) return { ok: false, error: mapped };
    console.error('[support] addComment', { requestId, error });
    return { ok: false, error: '댓글 작성에 실패했습니다.' };
  }
  revalidatePaths([`/support-requests/${requestId}`, `/admin/support-requests/${requestId}`]);
  return { ok: true, id: String(data) };
}

type CommentRow = { author_id: string; created_at: string; request_id: string };

export async function updateSupportCommentAction(
  commentId: string,
  body: string,
): Promise<ActionResult> {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: '로그인이 필요합니다.' };

  const parsed = supportCommentSchema.safeParse({ body });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const { data: row } = (await supabase
    .from('support_request_comments')
    .select('author_id, created_at, request_id')
    .eq('id', commentId)
    .maybeSingle()) as { data: CommentRow | null; error: unknown };
  if (!row) return { ok: false, error: '댓글을 찾을 수 없습니다.' };

  const { data: prof } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', u.user.id)
    .single<{ role: 'user' | 'admin' }>();
  const accessError = getSupportCommentAccessError({
    authorId: row.author_id,
    currentUserId: u.user.id,
    createdAt: row.created_at,
    isAdmin: prof?.role === 'admin',
    action: '수정',
  });
  if (accessError) return { ok: false, error: accessError };

  const { error } = await mutationTable(supabase, 'support_request_comments')
    .update({ body: parsed.data.body, updated_at: new Date().toISOString() })
    .eq('id', commentId);
  if (error) {
    console.error('[support] updateComment', { commentId, error });
    return { ok: false, error: '댓글 수정에 실패했습니다.' };
  }
  revalidatePaths([`/support-requests/${row.request_id}`, `/admin/support-requests/${row.request_id}`]);
  return { ok: true };
}

export async function deleteSupportCommentAction(commentId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: '로그인이 필요합니다.' };

  const { data: row } = (await supabase
    .from('support_request_comments')
    .select('author_id, created_at, request_id')
    .eq('id', commentId)
    .maybeSingle()) as { data: CommentRow | null; error: unknown };
  if (!row) return { ok: false, error: '댓글을 찾을 수 없습니다.' };

  const { data: prof } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', u.user.id)
    .single<{ role: 'user' | 'admin' }>();
  const accessError = getSupportCommentAccessError({
    authorId: row.author_id,
    currentUserId: u.user.id,
    createdAt: row.created_at,
    isAdmin: prof?.role === 'admin',
    action: '삭제',
  });
  if (accessError) return { ok: false, error: accessError };

  const { error } = await mutationTable(supabase, 'support_request_comments')
    .delete()
    .eq('id', commentId);
  if (error) {
    console.error('[support] deleteComment', { commentId, error });
    return { ok: false, error: '댓글 삭제에 실패했습니다.' };
  }
  revalidatePaths([`/support-requests/${row.request_id}`, `/admin/support-requests/${row.request_id}`]);
  return { ok: true };
}

export type SupportAttachmentUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function getSupportAttachmentUrlAction(
  requestId: string,
  attachmentId: string,
): Promise<SupportAttachmentUrlResult> {
  const supabase = createClient();
  const { data: attachment } = (await supabase
    .from('support_request_attachments')
    .select('id,request_id,storage_path')
    .eq('id', attachmentId)
    .eq('request_id', requestId)
    .maybeSingle()) as { data: { storage_path: string } | null; error: unknown };
  if (!attachment) return { ok: false, error: '첨부파일을 찾을 수 없습니다.' };

  const { data, error } = await supabase.storage
    .from('support-requests')
    .createSignedUrl(attachment.storage_path, 60);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? '서명 URL 생성 실패' };
  }
  return { ok: true, url: data.signedUrl };
}
