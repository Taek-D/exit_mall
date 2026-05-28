'use server';

import { randomUUID } from 'crypto';
import { redirect } from 'next/navigation';
import {
  callRpc,
  formatZodError,
  mutationTable,
  revalidatePaths,
  type ActionResult,
} from '@/lib/actions/_shared';
import { supportDetailPaths } from '@/lib/actions/_revalidate-paths';
import { requireSignedIn, type SignedInContext } from '@/lib/actions/_guards';
import { fileToBuffer } from '@/lib/files/excel';
import { supportCommentSchema, supportRequestCreateSchema } from '@/lib/schemas';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  mapSubmitSupportRequestError,
  mapSupportCancelError,
  mapSupportCommentError,
  mapSupportStatusError,
} from '@/lib/support/action-errors';
import { getSupportCommentAccessError, isSupportLocked } from '@/lib/support/permissions';
import { supportAttachmentPath, supportCleanupPaths } from '@/lib/support/upload-paths';
import type { SupportStatus } from '@/lib/types';

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
const ATTACHMENT_CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
};
const SUPPORT_ATTACHMENT_SIGNED_URL_SECONDS = 30 * 60;

type PreparedAttachment = {
  file: File;
  buffer: Buffer;
  contentType: string;
};

export type SubmitSupportResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string };

function lower(value: string): string {
  return value.toLowerCase();
}

function attachmentExtension(file: File): string | null {
  const name = lower(file.name);
  return ALLOWED_ATTACHMENT_EXT.find((ext) => name.endsWith(ext)) ?? null;
}

function startsWithBytes(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

function isValidAttachmentBuffer(ext: string, buffer: Buffer): boolean {
  if (ext === '.jpg' || ext === '.jpeg') return startsWithBytes(buffer, [0xff, 0xd8, 0xff]);
  if (ext === '.png') {
    return startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (ext === '.webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (ext === '.pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (ext === '.xlsx' || ext === '.docx') return startsWithBytes(buffer, [0x50, 0x4b]);
  if (ext === '.xls') {
    return startsWithBytes(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  }
  if (ext === '.txt') return !buffer.includes(0);
  return false;
}

async function collectAttachments(fd: FormData): Promise<PreparedAttachment[] | { error: string }> {
  const files = fd
    .getAll('attachments')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length > MAX_ATTACHMENTS) {
    return { error: `첨부파일은 최대 ${MAX_ATTACHMENTS}개까지 업로드할 수 있습니다.` };
  }

  const prepared: PreparedAttachment[] = [];
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return { error: '첨부파일은 파일당 10MB 이하여야 합니다.' };
    }

    const ext = attachmentExtension(file);
    if (!ext) {
      return { error: '첨부파일은 jpg/jpeg/png/webp/pdf/xlsx/xls/docx/txt 형식만 가능합니다.' };
    }

    const buffer = await fileToBuffer(file);
    if (!isValidAttachmentBuffer(ext, buffer)) {
      return { error: '첨부파일 형식과 내용이 일치하지 않습니다.' };
    }

    prepared.push({
      file,
      buffer,
      contentType: ATTACHMENT_CONTENT_TYPES[ext],
    });
  }

  return prepared;
}

type SupportUploadProgress = { uploadedPaths: string[]; insertedAttachmentIds: string[] };
type SupportUploadError = Error & { partial?: SupportUploadProgress };

/**
 * Phase 2.4 분할: 첨부파일 업로드 + metadata insert.
 * 실패 시 throw하되, 이미 진행된 부분(uploadedPaths/insertedAttachmentIds)을
 * error.partial에 실어 호출자가 정확히 storage/메타데이터 cleanup을 수행하도록 한다.
 */
async function uploadSupportAttachments(
  supabase: SignedInContext['supabase'],
  userId: string,
  requestId: string,
  attachments: PreparedAttachment[],
): Promise<SupportUploadProgress> {
  const uploadedPaths: string[] = [];
  const insertedAttachmentIds: string[] = [];

  try {
    for (const attachment of attachments) {
      const attachmentId = randomUUID();
      const storagePath = supportAttachmentPath({
        userId,
        requestId,
        attachmentId,
        originalName: attachment.file.name,
      });
      const { error: uploadErr } = await supabase.storage
        .from('support-requests')
        .upload(storagePath, attachment.buffer, {
          contentType: attachment.contentType,
          upsert: false,
        });
      if (uploadErr) throw uploadErr;
      uploadedPaths.push(storagePath);

      const { error: metaErr } = await mutationTable(supabase, 'support_request_attachments').insert({
        id: attachmentId,
        request_id: requestId,
        user_id: userId,
        storage_path: storagePath,
        original_name: attachment.file.name,
        content_type: attachment.contentType,
        size_bytes: attachment.file.size,
      });
      if (metaErr) throw metaErr;
      insertedAttachmentIds.push(attachmentId);
    }

    return { uploadedPaths, insertedAttachmentIds };
  } catch (error) {
    const err: SupportUploadError =
      error instanceof Error ? error : new Error(String(error));
    err.partial = { uploadedPaths, insertedAttachmentIds };
    throw err;
  }
}

async function cleanupFailedSupportRequest({
  supabase,
  requestId,
  insertedAttachmentIds,
}: {
  supabase: ReturnType<typeof createClient>;
  requestId: string;
  insertedAttachmentIds: string[];
}): Promise<void> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const cleanupSupabase = createServiceRoleClient() as unknown as ReturnType<typeof createClient>;
    if (insertedAttachmentIds.length > 0) {
      const { error: metadataCleanupError } = await mutationTable(
        cleanupSupabase,
        'support_request_attachments',
      )
        .delete()
        .in('id', insertedAttachmentIds);
      if (metadataCleanupError) {
        console.error('[support] rollback attachment metadata failed', metadataCleanupError);
      }
    }

    const { error: requestCleanupError } = await mutationTable(cleanupSupabase, 'support_requests')
      .delete()
      .eq('id', requestId);
    if (requestCleanupError) {
      console.error('[support] rollback request cleanup failed', requestCleanupError);
    }
    return;
  }

  const { error: requestCleanupError } = await callRpc(supabase, 'cleanup_failed_support_request', {
    p_request_id: requestId,
  });
  if (requestCleanupError) {
    console.error('[support] rollback request cleanup failed', requestCleanupError);
  }
}

export async function submitSupportRequestAction(
  _prevState: SubmitSupportResult | null,
  fd: FormData,
): Promise<SubmitSupportResult> {
  const guard = await requireSignedIn();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase, user } = guard;

  const parsed = supportRequestCreateSchema.safeParse({
    category: String(fd.get('category') ?? ''),
    title: String(fd.get('title') ?? ''),
    body: String(fd.get('body') ?? ''),
    referenceType: String(fd.get('referenceType') ?? 'none'),
    referenceValue: String(fd.get('referenceValue') ?? ''),
  });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const attachments = await collectAttachments(fd);
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
    const detail = rpcErr?.message?.trim();
    return {
      ok: false,
      error: detail
        ? `문의 등록에 실패했습니다: ${detail}`
        : '문의 등록에 실패했습니다.',
    };
  }

  const requestId = String(requestIdData);

  try {
    await uploadSupportAttachments(supabase, user.id, requestId, attachments);
  } catch (error) {
    // 부분 진행 상태를 받아 정확히 cleanup. (분할 전 동일 함수에서 보장하던 동작 복구)
    const partial = (error as SupportUploadError).partial ?? {
      uploadedPaths: [],
      insertedAttachmentIds: [],
    };
    await cleanupFailedSupportRequest({
      supabase,
      requestId,
      insertedAttachmentIds: partial.insertedAttachmentIds,
    });
    // 업로드된 storage 객체 cleanup은 트랜잭션 외부이므로 best-effort.
    const cleanupPaths = supportCleanupPaths(partial.uploadedPaths);
    if (cleanupPaths.length > 0) {
      const cleanupSupabase = (
        process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceRoleClient() : supabase
      ) as ReturnType<typeof createClient>;
      const { error: storageCleanupError } = await cleanupSupabase.storage
        .from('support-requests')
        .remove(cleanupPaths);
      if (storageCleanupError) {
        console.error('[support] rollback storage cleanup failed', storageCleanupError);
      }
    }

    console.error('[support] attachment upload failed', error);
    return { ok: false, error: '첨부파일 업로드에 실패했습니다. 다시 시도해주세요.' };
  }

  revalidatePaths(['/support-requests', '/admin/support-requests']);
  // 서버 redirect로 네비게이션을 처리한다 — progressive enhancement로 JS/하이드레이션
  // 여부와 무관하게 동작한다. 클라이언트 중복 네비게이션(과거 useEffect router.push)은
  // 폼에서 제거됐다. 성공 경로는 throw(never)이므로 호출 측 state는 갱신되지 않는다.
  redirect(`/support-requests/${requestId}`);
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

export async function markSupportReadAction(
  requestId: string,
  seenLastCommentAt: string | null = null,
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await callRpc(supabase, 'mark_support_read', {
    p_request_id: requestId,
    p_seen_last_comment_at: seenLastCommentAt,
  });
  if (error) {
    console.error('[support] markRead', { requestId, error });
    return { ok: false, error: '읽음 처리에 실패했습니다.' };
  }
  revalidatePaths(supportDetailPaths(requestId));
  return { ok: true };
}

export async function addSupportCommentAction(
  requestId: string,
  body: string,
): Promise<ActionResult<{ id: string }>> {
  // 권한은 add_support_comment RPC + RLS가 검증한다(작성자/관리자/활성 계정).
  // user.id가 직접 필요 없어 requireSignedIn 가드를 생략한다(update/delete는 가드 사용).
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
  revalidatePaths(supportDetailPaths(requestId));
  return { ok: true, id: String(data) };
}

type CommentRow = { author_id: string; created_at: string; request_id: string };
type SupportRequestStatusRow = { status: SupportStatus };

async function assertSupportRequestEditable(
  supabase: ReturnType<typeof createClient>,
  requestId: string,
): Promise<ActionResult> {
  const { data: request, error } = (await supabase
    .from('support_requests')
    .select('status')
    .eq('id', requestId)
    .maybeSingle()) as { data: SupportRequestStatusRow | null; error: unknown };

  if (error || !request) {
    if (error) console.error('[support] fetch request for comment mutation', { requestId, error });
    return { ok: false, error: 'Support request not found.' };
  }

  if (isSupportLocked(request.status)) {
    return {
      ok: false,
      error: mapSupportCommentError('LOCKED') ?? 'Support request is locked.',
    };
  }

  return { ok: true };
}

export async function updateSupportCommentAction(
  commentId: string,
  body: string,
): Promise<ActionResult> {
  const guard = await requireSignedIn();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase, user, profile } = guard;

  const parsed = supportCommentSchema.safeParse({ body });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };

  const { data: row } = (await supabase
    .from('support_request_comments')
    .select('author_id, created_at, request_id')
    .eq('id', commentId)
    .maybeSingle()) as { data: CommentRow | null; error: unknown };
  if (!row) return { ok: false, error: '댓글을 찾을 수 없습니다.' };

  const accessError = getSupportCommentAccessError({
    authorId: row.author_id,
    currentUserId: user.id,
    createdAt: row.created_at,
    isAdmin: profile.role === 'admin',
    action: '수정',
  });
  if (accessError) return { ok: false, error: accessError };

  const editable = await assertSupportRequestEditable(supabase, row.request_id);
  if (!editable.ok) return editable;

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
  const guard = await requireSignedIn();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase, user, profile } = guard;

  const { data: row } = (await supabase
    .from('support_request_comments')
    .select('author_id, created_at, request_id')
    .eq('id', commentId)
    .maybeSingle()) as { data: CommentRow | null; error: unknown };
  if (!row) return { ok: false, error: '댓글을 찾을 수 없습니다.' };

  const accessError = getSupportCommentAccessError({
    authorId: row.author_id,
    currentUserId: user.id,
    createdAt: row.created_at,
    isAdmin: profile.role === 'admin',
    action: '삭제',
  });
  if (accessError) return { ok: false, error: accessError };

  const editable = await assertSupportRequestEditable(supabase, row.request_id);
  if (!editable.ok) return editable;

  const { error } = await callRpc(supabase, 'delete_support_comment', {
    p_comment_id: commentId,
  });
  if (error) {
    const mapped = mapSupportCommentError(error.message);
    if (mapped) return { ok: false, error: mapped };
    console.error('[support] deleteComment', { commentId, error });
    return { ok: false, error: '댓글 삭제에 실패했습니다.' };
  }
  revalidatePaths(supportDetailPaths(row.request_id));
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
    .createSignedUrl(attachment.storage_path, SUPPORT_ATTACHMENT_SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? '서명 URL 생성 실패' };
  }
  return { ok: true, url: data.signedUrl };
}
