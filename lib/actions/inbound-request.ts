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
import { COMMENT_EDIT_WINDOW_MS } from '@/lib/inbound/permissions';

const MAX_EXCEL_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 3;
const ALLOWED_EXCEL_EXT = ['.xlsx'];
const ALLOWED_IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const OOXML_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function nanoid(): string {
  return randomBytes(8).toString('hex');
}

function lower(s: string) {
  return s.toLowerCase();
}

function safeFilename(name: string) {
  return name.replace(/[^\w가-힣\.\-]+/g, '_');
}

export type SubmitResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string };

export async function submitInboundRequestAction(fd: FormData): Promise<SubmitResult> {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: '로그인이 필요합니다.' };

  const parsed = inboundRequestCreateSchema.safeParse({
    title: String(fd.get('title') ?? ''),
    body: String(fd.get('body') ?? ''),
  });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const excel = fd.get('excel');
  if (!(excel instanceof File) || excel.size === 0) {
    return { ok: false, error: '엑셀 파일을 첨부해주세요.' };
  }
  if (excel.size > MAX_EXCEL_BYTES) {
    return { ok: false, error: '엑셀은 5MB 이하여야 합니다.' };
  }
  if (!ALLOWED_EXCEL_EXT.some((ext) => lower(excel.name).endsWith(ext))) {
    return { ok: false, error: '.xlsx 만 첨부할 수 있습니다.' };
  }
  const excelBuf = Buffer.from(await excel.arrayBuffer());
  if (excelBuf.length < 4 || !excelBuf.subarray(0, 4).equals(OOXML_MAGIC)) {
    return { ok: false, error: '엑셀(.xlsx) 형식이 아닙니다.' };
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
  const excelPath = `${u.user.id}/${tmp}/excel/${safeFilename(excel.name)}`;
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
      await supabase.storage.from('inbound-requests').remove([excelPath, ...imagePaths]);
      return { ok: false, error: `이미지 업로드 실패: ${imgErr.message}` };
    }
    imagePaths.push(imgPath);
  }

  const { data: row, error: insErr } = await mutationTable(supabase, 'inbound_requests')
    .insert({
      user_id: u.user.id,
      title: parsed.data.title,
      body: parsed.data.body,
      status: 'open',
      excel_storage_path: excelPath,
      excel_original_name: excel.name,
      image_paths: imagePaths,
    })
    .select('id')
    .single();
  if (insErr || !row) {
    await supabase.storage.from('inbound-requests').remove([excelPath, ...imagePaths]);
    return { ok: false, error: `저장 실패: ${insErr?.message ?? 'unknown'}` };
  }

  revalidatePaths([
    '/inbound-requests',
    '/admin/inbound-requests',
  ]);
  return { ok: true, requestId: row.id as string };
}

export async function cancelInboundRequestAction(requestId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'cancel_inbound_request', { request_id: requestId });
  if (error) {
    if (error.message.includes('NOT_CANCELLABLE')) return { ok: false, error: '취소할 수 없는 상태입니다.' };
    if (error.message.includes('ALREADY_CLOSED')) return { ok: false, error: '이미 종결된 요청입니다.' };
    if (error.message.includes('FORBIDDEN')) return { ok: false, error: '권한이 없습니다.' };
    if (error.message.includes('NOT_FOUND')) return { ok: false, error: '요청을 찾을 수 없습니다.' };
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
    if (error.message.includes('FORBIDDEN')) return { ok: false, error: '관리자만 변경할 수 있습니다.' };
    if (error.message.includes('INVALID_TRANSITION')) return { ok: false, error: '허용되지 않은 상태 전이입니다.' };
    if (error.message.includes('NOT_FOUND')) return { ok: false, error: '요청을 찾을 수 없습니다.' };
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
    if (error.message.includes('LOCKED')) return { ok: false, error: '이미 종결되어 댓글을 작성할 수 없습니다.' };
    if (error.message.includes('FORBIDDEN')) return { ok: false, error: '권한이 없습니다.' };
    if (error.message.includes('INACTIVE')) return { ok: false, error: '계정이 활성 상태가 아닙니다.' };
    if (error.message.includes('INVALID_BODY')) return { ok: false, error: '댓글 내용을 확인해주세요.' };
    if (error.message.includes('NOT_FOUND')) return { ok: false, error: '요청을 찾을 수 없습니다.' };
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
  const { data: row } = (await (supabase.from as any)('inbound_request_comments')
    .select('author_id, created_at, request_id')
    .eq('id', commentId)
    .maybeSingle()) as { data: CommentRow | null; error: unknown };
  if (!row) return { ok: false, error: '댓글을 찾을 수 없습니다.' };

  const { data: prof } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', u.user.id)
    .single<{ role: 'user' | 'admin' }>();
  const isAdmin = prof?.role === 'admin';
  const isAuthor = row.author_id === u.user.id;
  if (!isAdmin && !isAuthor) return { ok: false, error: '권한이 없습니다.' };
  if (!isAdmin) {
    const ageMs = Date.now() - new Date(row.created_at).getTime();
    if (ageMs >= COMMENT_EDIT_WINDOW_MS) {
      return { ok: false, error: '댓글 수정 가능 시간이 지났습니다 (10분).' };
    }
  }

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

  const { data: row } = (await (supabase.from as any)('inbound_request_comments')
    .select('author_id, created_at, request_id')
    .eq('id', commentId)
    .maybeSingle()) as { data: CommentRow | null; error: unknown };
  if (!row) return { ok: false, error: '댓글을 찾을 수 없습니다.' };

  const { data: prof } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', u.user.id)
    .single<{ role: 'user' | 'admin' }>();
  const isAdmin = prof?.role === 'admin';
  const isAuthor = row.author_id === u.user.id;
  if (!isAdmin && !isAuthor) return { ok: false, error: '권한이 없습니다.' };
  if (!isAdmin) {
    const ageMs = Date.now() - new Date(row.created_at).getTime();
    if (ageMs >= COMMENT_EDIT_WINDOW_MS) {
      return { ok: false, error: '댓글 삭제 가능 시간이 지났습니다 (10분).' };
    }
  }

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
  const { data: req } = (await (supabase.from as any)('inbound_requests')
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
  const { data: row } = (await (supabase.from as any)('inbound_requests')
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
