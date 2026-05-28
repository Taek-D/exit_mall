'use server';

import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import {
  callRpc,
  formatZodError,
  mutationTable,
  revalidatePaths,
  type ActionResult,
} from '@/lib/actions/_shared';
import { inboundDetailPaths, inboundListPaths } from '@/lib/actions/_revalidate-paths';
import { requireSignedIn, type SignedInContext } from '@/lib/actions/_guards';
import {
  inboundRequestCreateSchema,
  inboundCommentSchema,
} from '@/lib/schemas';
import { safeFilename } from '@/lib/inbound/storage';
import { safeStorageName, validateExcelUpload } from '@/lib/files/excel';
import {
  parseInboundInventoryExcel,
  type ParsedInboundInventoryItem,
} from '@/lib/purchased-shipping';
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

// ─────────────────────────────────────────────────────────────────────────────
// Submit flow helpers (Phase 2.4 split — 시멘틱 보존 안전망: submit-inbound-request-action.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

type PreparedInboundUploads =
  | {
      ok: true;
      excelFile: File;
      excelPath: string;
      imagePaths: string[];
      inboundItems: ParsedInboundInventoryItem[];
    }
  | { ok: false; error: string };

/** ① 입력 검증 + 임시 경로 storage 업로드. 부분 실패 시 자체 cleanup 후 에러 반환. */
async function prepareInboundUploads(
  supabase: SignedInContext['supabase'],
  userId: string,
  fd: FormData,
): Promise<PreparedInboundUploads> {
  const excelUpload = await validateExcelUpload(fd.get('excel'), {
    maxBytes: MAX_EXCEL_BYTES,
    sizeLabel: '5MB',
    emptyMessage: '엑셀 파일을 첨부해주세요.',
    sizeMessage: '엑셀은 5MB 이하여야 합니다.',
    extensionMessage: '.xlsx 만 첨부할 수 있습니다.',
    invalidTypeMessage: '엑셀(.xlsx) 형식이 아닙니다.',
  });
  if (!excelUpload.ok) return excelUpload;
  const { file: excelFile, buffer: excelBuf } = excelUpload;

  let inboundItems: ParsedInboundInventoryItem[];
  try {
    inboundItems = await parseInboundInventoryExcel(excelBuf);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : '입고리스트 엑셀을 읽을 수 없습니다.',
    };
  }

  const imageFiles: File[] = [];
  for (let i = 0; i < MAX_IMAGES; i++) {
    const f = fd.get(`image${i}`);
    if (f instanceof File && f.size > 0) imageFiles.push(f);
  }
  if (imageFiles.length > MAX_IMAGES) {
    return { ok: false, error: `이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.` };
  }
  for (const img of imageFiles) {
    if (img.size > MAX_IMAGE_BYTES) {
      return { ok: false, error: '이미지는 장당 5MB 이하여야 합니다.' };
    }
    if (!ALLOWED_IMAGE_EXT.some((ext) => lower(img.name).endsWith(ext))) {
      return { ok: false, error: '이미지는 jpg/png/webp 만 가능합니다.' };
    }
  }

  const tmp = `_pending_${nanoid()}`;
  const excelPath = `${userId}/${tmp}/excel/${safeStorageName(excelFile.name, { allowKorean: true })}`;
  const { error: exUpErr } = await supabase.storage
    .from('inbound-requests')
    .upload(excelPath, excelBuf, {
      contentType:
        excelFile.type ||
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    });
  if (exUpErr) return { ok: false, error: `엑셀 업로드 실패: ${exUpErr.message}` };

  const imagePaths: string[] = [];
  for (const img of imageFiles) {
    const imgPath = `${userId}/${tmp}/images/${nanoid()}-${safeFilename(img.name)}`;
    const buf = Buffer.from(await img.arrayBuffer());
    const { error: imgErr } = await supabase.storage
      .from('inbound-requests')
      .upload(imgPath, buf, { contentType: img.type || 'image/jpeg', upsert: false });
    if (imgErr) {
      // 부분 업로드 cleanup (best-effort)
      await supabase.storage
        .from('inbound-requests')
        .remove(inboundCleanupPaths(excelPath, imagePaths));
      return { ok: false, error: `이미지 업로드 실패: ${imgErr.message}` };
    }
    imagePaths.push(imgPath);
  }

  return { ok: true, excelFile, excelPath, imagePaths, inboundItems };
}

/** ② 원자성 RPC 호출. 실패 시 에러 매핑된 결과 반환 (cleanup은 호출자 책임). */
async function submitInboundRequestRpc(
  supabase: SignedInContext['supabase'],
  input: { title: string; body: string },
  excelPath: string,
  excelName: string,
  imagePaths: string[],
  inboundItems: ParsedInboundInventoryItem[],
): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  const { data: newId, error: rpcErr } = await callRpc(
    supabase,
    'submit_inbound_request_rpc',
    {
      p_title: input.title,
      p_body: input.body,
      p_excel_path: excelPath,
      p_excel_name: excelName,
      p_image_paths: imagePaths,
      p_items: inboundItems,
    },
  );
  if (rpcErr || !newId) {
    const mapped = mapSubmitInboundRequestError(rpcErr?.message ?? '', MAX_IMAGES);
    if (mapped) return { ok: false, error: mapped };
    console.error('[inbound] submit_inbound_request_rpc', rpcErr);
    return { ok: false, error: `저장 실패: ${rpcErr?.message ?? 'unknown'}` };
  }
  return { ok: true, requestId: newId as string };
}

/** ③ _pending_* → {request_id}/* rename + DB update + rollback + chase-update 오케스트레이션. */
async function renameInboundUploadsToCanonical(
  supabase: SignedInContext['supabase'],
  userId: string,
  requestId: string,
  excelName: string,
  originalExcelPath: string,
  originalImagePaths: string[],
): Promise<void> {
  const renamedExcel = `${userId}/${requestId}/excel/${safeStorageName(excelName, { allowKorean: true })}`;
  const { error: mvExcelErr } = await supabase.storage
    .from('inbound-requests')
    .move(originalExcelPath, renamedExcel);

  const imageMoves: InboundMoveOutcome[] = [];
  for (let i = 0; i < originalImagePaths.length; i++) {
    const old = originalImagePaths[i];
    const baseName = old.split('/').pop();
    if (!baseName) continue;
    const newName = `${userId}/${requestId}/images/${baseName}`;
    const { error } = await supabase.storage.from('inbound-requests').move(old, newName);
    imageMoves.push({ ok: !error, from: old, to: newName });
  }

  const { finalExcelPath, finalImagePaths, renameHappened } = applyInboundMoveOutcomes({
    originalExcelPath,
    originalImagePaths,
    excelMove: { ok: !mvExcelErr, from: originalExcelPath, to: renamedExcel },
    imageMoves,
  });

  if (!renameHappened) return;

  const { error: upErr } = await mutationTable(supabase, 'inbound_requests')
    .update({ excel_storage_path: finalExcelPath, image_paths: finalImagePaths })
    .eq('id', requestId);

  if (!upErr) return;

  // Rollback: move 파일들을 _pending_* 위치로 되돌린다.
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

  // chase-update: rollback 일부 실패 시 DB가 실제 파일 위치를 가리키도록 갱신.
  if (rollbackResults.some((r) => !r.ok)) {
    const { excelPath: chaseExcel, imagePaths: chaseImages } =
      chaseInboundPathsAfterRollback({
        originalExcelPath,
        originalImagePaths,
        finalExcelPath,
        finalImagePaths,
        rollbackResults,
      });
    const { error: chaseErr } = await mutationTable(supabase, 'inbound_requests')
      .update({ excel_storage_path: chaseExcel, image_paths: chaseImages })
      .eq('id', requestId);
    if (chaseErr)
      console.error('[inbound] chase-update also failed; orphan possible', chaseErr);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public actions
// ─────────────────────────────────────────────────────────────────────────────

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
