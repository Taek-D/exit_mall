'use server';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import {
  callRpc,
  mutationTable,
  revalidatePaths,
  formatZodError,
  type ActionResult,
} from '@/lib/actions/_shared';
import {
  inboundRequestCreateSchema,
  inboundCommentSchema,
} from '@/lib/schemas';
import { safeFilename } from '@/lib/inbound/storage';
import { safeStorageName, validateExcelUpload } from '@/lib/files/excel';
import { parseInboundInventoryExcel } from '@/lib/purchased-shipping';
import {
  applyInboundMoveOutcomes,
  chaseInboundPathsAfterRollback,
  inboundCleanupPaths,
  type InboundMoveOutcome,
} from '@/lib/inbound/upload-paths';
import {
  mapInboundCancelError,
  mapInboundCommentError,
  mapInboundStatusError,
  mapSubmitInboundRequestError,
} from '@/lib/inbound/action-errors';
import { getInboundCommentAccessError } from '@/lib/inbound/comment-access';

const MAX_EXCEL_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 3;
const ALLOWED_IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

function nanoid(): string {
  return randomBytes(8).toString('hex');
}

function lower(s: string) {
  return s.toLowerCase();
}

export type SubmitResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string };

export async function submitInboundRequestAction(
  _prevState: SubmitResult | null,
  fd: FormData,
): Promise<SubmitResult> {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: '로그인이 필요합니다.' };

  const parsed = inboundRequestCreateSchema.safeParse({
    title: String(fd.get('title') ?? ''),
    body: String(fd.get('body') ?? ''),
  });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const excelUpload = await validateExcelUpload(fd.get('excel'), {
    maxBytes: MAX_EXCEL_BYTES,
    sizeLabel: '5MB',
    emptyMessage: '엑셀 파일을 첨부해주세요.',
    sizeMessage: '엑셀은 5MB 이하여야 합니다.',
    extensionMessage: '.xlsx 만 첨부할 수 있습니다.',
    invalidTypeMessage: '엑셀(.xlsx) 형식이 아닙니다.',
  });
  if (!excelUpload.ok) return excelUpload;
  const { file: excel, buffer: excelBuf } = excelUpload;

  let inboundItems;
  try {
    inboundItems = await parseInboundInventoryExcel(excelBuf);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : '입고리스트 엑셀을 읽을 수 없습니다.',
    };
  }

  const images: File[] = [];
  for (let i = 0; i < MAX_IMAGES; i++) {
    const f = fd.get(`image${i}`);
    if (f instanceof File && f.size > 0) images.push(f);
  }
  if (images.length > MAX_IMAGES) {
    return { ok: false, error: `이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.` };
  }
  for (const img of images) {
    if (img.size > MAX_IMAGE_BYTES) {
      return { ok: false, error: '이미지는 장당 5MB 이하여야 합니다.' };
    }
    if (!ALLOWED_IMAGE_EXT.some((ext) => lower(img.name).endsWith(ext))) {
      return { ok: false, error: '이미지는 jpg/png/webp 만 가능합니다.' };
    }
  }

  // Upload files under temporary folder, then we rename after row insert.
  const tmp = `_pending_${nanoid()}`;
  const excelPath = `${u.user.id}/${tmp}/excel/${safeStorageName(excel.name, { allowKorean: true })}`;
  const { error: exUpErr } = await supabase.storage
    .from('inbound-requests')
    .upload(excelPath, excelBuf, { contentType: excel.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false });
  if (exUpErr) return { ok: false, error: `엑셀 업로드 실패: ${exUpErr.message}` };

  const imagePaths: string[] = [];
  for (const img of images) {
    const imgPath = `${u.user.id}/${tmp}/images/${nanoid()}-${safeFilename(img.name)}`;
    const buf = Buffer.from(await img.arrayBuffer());
    const { error: imgErr } = await supabase.storage
      .from('inbound-requests')
      .upload(imgPath, buf, { contentType: img.type || 'image/jpeg', upsert: false });
    if (imgErr) {
      // partial-upload cleanup attempt (best effort)
      await supabase.storage.from('inbound-requests').remove(inboundCleanupPaths(excelPath, imagePaths));
      return { ok: false, error: `이미지 업로드 실패: ${imgErr.message}` };
    }
    imagePaths.push(imgPath);
  }

  // Insert via RPC for atomic rate-limit + RLS chokepoint.
  // Direct `.from(...).insert(...)` is blocked by RLS (requires app.inbound_rpc=true).
  const { data: newId, error: rpcErr } = await callRpc(supabase, 'submit_inbound_request_rpc', {
    p_title: parsed.data.title,
    p_body: parsed.data.body,
    p_excel_path: excelPath,
    p_excel_name: excel.name,
    p_image_paths: imagePaths,
    p_items: inboundItems,
  });
  if (rpcErr || !newId) {
    await supabase.storage.from('inbound-requests').remove(inboundCleanupPaths(excelPath, imagePaths));
    const mapped = mapSubmitInboundRequestError(rpcErr?.message ?? '', MAX_IMAGES);
    if (mapped) return { ok: false, error: mapped };
    console.error('[inbound] submit_inbound_request_rpc', rpcErr);
    return { ok: false, error: `저장 실패: ${rpcErr?.message ?? 'unknown'}` };
  }

  // Best-effort rename: move files from _pending_* to canonical {request_id} path.
  // If a move succeeds but the subsequent DB update fails, attempt rollback so the
  // row's stored path stays valid. Cascade failure leaves the row in a mixed
  // state — chase-update DB to point at where files actually are.
  const requestId = newId as string;
  const originalExcelPath = excelPath;
  const originalImagePaths = [...imagePaths];

  const renamedExcel = `${u.user.id}/${requestId}/excel/${safeStorageName(excel.name, { allowKorean: true })}`;
  const { error: mvExcelErr } = await supabase.storage
    .from('inbound-requests')
    .move(originalExcelPath, renamedExcel);

  const imageMoves: InboundMoveOutcome[] = [];

  for (let i = 0; i < originalImagePaths.length; i++) {
    const old = originalImagePaths[i];
    const baseName = old.split('/').pop();
    if (!baseName) continue;
    const newName = `${u.user.id}/${requestId}/images/${baseName}`;
    const { error } = await supabase.storage.from('inbound-requests').move(old, newName);
    imageMoves.push({ ok: !error, from: old, to: newName });
  }

  const { finalExcelPath, finalImagePaths, renameHappened } = applyInboundMoveOutcomes({
    originalExcelPath,
    originalImagePaths,
    excelMove: { ok: !mvExcelErr, from: originalExcelPath, to: renamedExcel },
    imageMoves,
  });

  if (renameHappened) {
    const { error: upErr } = await mutationTable(supabase, 'inbound_requests')
      .update({ excel_storage_path: finalExcelPath, image_paths: finalImagePaths })
      .eq('id', requestId);

    if (upErr) {
      // Rollback attempt: move files back to _pending_* paths.
      console.error('[inbound] post-rename DB update failed; rolling back rename', upErr);
      const rollbackResults: InboundMoveOutcome[] = [];
      if (finalExcelPath !== originalExcelPath) {
        const { error } = await supabase.storage
          .from('inbound-requests')
          .move(finalExcelPath, originalExcelPath);
        rollbackResults.push({ ok: !error, from: finalExcelPath, to: originalExcelPath });
        if (error) console.error('[inbound] excel rename rollback failed', error);
      }
      for (let i = 0; i < finalImagePaths.length; i++) {
        if (finalImagePaths[i] !== originalImagePaths[i]) {
          const { error } = await supabase.storage
            .from('inbound-requests')
            .move(finalImagePaths[i], originalImagePaths[i]);
          rollbackResults.push({ ok: !error, from: finalImagePaths[i], to: originalImagePaths[i] });
          if (error) console.error('[inbound] image rename rollback failed', error);
        }
      }
      // Cascade failure: at least one rollback `move` also failed. We end up in a
      // mixed state where some files are at canonical {request_id}/... paths
      // (rollback failed) and others are back at _pending_* (rollback succeeded).
      // For each path, point the DB at where the file actually IS now:
      //   - rollback succeeded → use original _pending_* path
      //   - rollback failed    → use canonical path (file is still there)
      // The orphan cleanup function reclaims any abandoned _pending_* files.
      if (rollbackResults.some((r) => !r.ok)) {
        const { excelPath: chaseExcel, imagePaths: chaseImages } = chaseInboundPathsAfterRollback({
          originalExcelPath,
          originalImagePaths,
          finalExcelPath,
          finalImagePaths,
          rollbackResults,
        });
        const { error: chaseErr } = await mutationTable(supabase, 'inbound_requests')
          .update({ excel_storage_path: chaseExcel, image_paths: chaseImages })
          .eq('id', requestId);
        if (chaseErr) console.error('[inbound] chase-update also failed; orphan possible', chaseErr);
      }
    }
  }

  revalidatePaths([
    '/inbound-requests',
    '/admin/inbound-requests',
  ]);
  return { ok: true, requestId };
}

export async function cancelInboundRequestAction(requestId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'cancel_inbound_request', { request_id: requestId });
  if (error) {
    const mapped = mapInboundCancelError(error.message);
    if (mapped) return { ok: false, error: mapped };
    console.error('[inbound] cancel', { requestId, error });
    return { ok: false, error: '취소 처리에 실패했습니다.' };
  }
  revalidatePaths(['/inbound-requests', `/inbound-requests/${requestId}`, '/admin/inbound-requests', `/admin/inbound-requests/${requestId}`]);
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
  revalidatePaths([
    `/admin/inbound-requests/${requestId}`,
    `/inbound-requests/${requestId}`,
    '/admin/inbound-requests',
    '/inbound-requests',
  ]);
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
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: '로그인이 필요합니다.' };

  const parsed = inboundCommentSchema.safeParse({ body });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  // Fetch current comment to enforce 10-min edit window for non-admin authors.
  const { data: row } = (await supabase.from('inbound_request_comments')
    .select('author_id, created_at, request_id')
    .eq('id', commentId)
    .maybeSingle()) as { data: CommentRow | null; error: unknown };
  if (!row) return { ok: false, error: '댓글을 찾을 수 없습니다.' };

  const { data: prof } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', u.user.id)
    .single<{ role: 'user' | 'admin' }>();
  const accessError = getInboundCommentAccessError({
    authorId: row.author_id,
    currentUserId: u.user.id,
    createdAt: row.created_at,
    isAdmin: prof?.role === 'admin',
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
  revalidatePaths([`/inbound-requests/${row.request_id}`, `/admin/inbound-requests/${row.request_id}`]);
  return { ok: true };
}

export async function deleteInboundCommentAction(commentId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: '로그인이 필요합니다.' };

  const { data: row } = (await supabase.from('inbound_request_comments')
    .select('author_id, created_at, request_id')
    .eq('id', commentId)
    .maybeSingle()) as { data: CommentRow | null; error: unknown };
  if (!row) return { ok: false, error: '댓글을 찾을 수 없습니다.' };

  const { data: prof } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', u.user.id)
    .single<{ role: 'user' | 'admin' }>();
  const accessError = getInboundCommentAccessError({
    authorId: row.author_id,
    currentUserId: u.user.id,
    createdAt: row.created_at,
    isAdmin: prof?.role === 'admin',
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
  revalidatePaths([`/inbound-requests/${row.request_id}`, `/admin/inbound-requests/${row.request_id}`]);
  return { ok: true };
}

export type AttachmentUrlResult = { ok: true; url: string } | { ok: false; error: string };

export async function getInboundAttachmentUrlAction(
  requestId: string,
  path: string,
): Promise<AttachmentUrlResult> {
  const supabase = createClient();
  // Authorize: verify the path is referenced by a request the caller can read (RLS handles this).
  type InboundReqRow = { id: string; excel_storage_path: string; image_paths: string[] | null };
  const { data: req } = (await supabase.from('inbound_requests')
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
  // Fetch storage paths before delete so we can clean up after.
  type InboundStorageRow = { excel_storage_path: string; image_paths: string[] | null };
  const { data: row } = (await supabase.from('inbound_requests')
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
  revalidatePaths(['/inbound-requests', '/admin/inbound-requests']);
  return { ok: true };
}
