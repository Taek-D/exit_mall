import { randomUUID } from 'crypto';
import { callRpc, formatZodError, mutationTable, type ActionResult } from '@/lib/actions/_shared';
import type { SignedInContext } from '@/lib/actions/_guards';
import { fileToBuffer } from '@/lib/files/excel';
import { supportCommentSchema } from '@/lib/schemas';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  supportAttachmentPath,
  supportCleanupPaths,
  supportCommentImagePath,
} from '@/lib/support/upload-paths';

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_COMMENT_IMAGE_BYTES = 5 * 1024 * 1024;
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
const ALLOWED_COMMENT_IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
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

type PreparedAttachment = {
  file: File;
  buffer: Buffer;
  contentType: string;
};

export type PreparedCommentImage = PreparedAttachment;

export type SupportUploadProgress = {
  uploadedPaths: string[];
  insertedAttachmentIds: string[];
};

export type SupportUploadError = Error & { partial?: SupportUploadProgress };

function lower(value: string): string {
  return value.toLowerCase();
}

function attachmentExtension(file: File): string | null {
  const name = lower(file.name);
  return ALLOWED_ATTACHMENT_EXT.find((ext) => name.endsWith(ext)) ?? null;
}

function commentImageExtension(file: File): string | null {
  const name = lower(file.name);
  return ALLOWED_COMMENT_IMAGE_EXT.find((ext) => name.endsWith(ext)) ?? null;
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

export async function collectAttachments(
  fd: FormData,
): Promise<PreparedAttachment[] | { error: string }> {
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

export async function collectCommentImage(
  fd: FormData,
): Promise<PreparedCommentImage | null | { error: string }> {
  const files = fd
    .getAll('image')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length === 0) return null;
  if (files.length > 1) {
    return { error: '댓글 이미지는 1장만 첨부할 수 있습니다.' };
  }

  const file = files[0];
  if (file.size > MAX_COMMENT_IMAGE_BYTES) {
    return { error: '댓글 이미지는 5MB 이하만 첨부할 수 있습니다.' };
  }

  const ext = commentImageExtension(file);
  if (!ext) {
    return { error: '댓글 이미지는 jpg/jpeg/png/webp 형식만 첨부할 수 있습니다.' };
  }

  const buffer = await fileToBuffer(file);
  if (!isValidAttachmentBuffer(ext, buffer)) {
    return { error: '댓글 이미지 형식과 내용이 일치하지 않습니다.' };
  }

  return {
    file,
    buffer,
    contentType: ATTACHMENT_CONTENT_TYPES[ext],
  };
}

export function validateSupportCommentBody({
  body,
  hasImage,
  isAdmin,
}: {
  body: string;
  hasImage: boolean;
  isAdmin: boolean;
}): ActionResult<{ body: string }> {
  const trimmed = body.trim();
  if (trimmed.length === 0 && isAdmin && hasImage) {
    return { ok: true, body: '' };
  }

  const parsed = supportCommentSchema.safeParse({ body });
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  return { ok: true, body: parsed.data.body };
}

export async function uploadSupportAttachments(
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

export async function uploadSupportCommentImage({
  supabase,
  userId,
  requestId,
  commentId,
  image,
}: {
  supabase: SignedInContext['supabase'];
  userId: string;
  requestId: string;
  commentId: string;
  image: PreparedCommentImage;
}): Promise<{ imageId: string; storagePath: string }> {
  const imageId = randomUUID();
  const storagePath = supportCommentImagePath({
    userId,
    requestId,
    commentId,
    imageId,
    originalName: image.file.name,
  });

  const { error: uploadErr } = await supabase.storage
    .from('support-requests')
    .upload(storagePath, image.buffer, {
      contentType: image.contentType,
      upsert: false,
    });
  if (uploadErr) throw uploadErr;

  const { error: metaErr } = await mutationTable(supabase, 'support_request_comment_images').insert({
    id: imageId,
    comment_id: commentId,
    request_id: requestId,
    user_id: userId,
    storage_path: storagePath,
    original_name: image.file.name,
    content_type: image.contentType,
    size_bytes: image.file.size,
  });
  if (metaErr) {
    const { error: cleanupError } = await supabase.storage
      .from('support-requests')
      .remove([storagePath]);
    if (cleanupError) {
      console.error('[support] comment image upload cleanup failed', cleanupError);
    }
    throw metaErr;
  }

  return { imageId, storagePath };
}

export async function cleanupCommentImageStorage(
  supabase: ReturnType<typeof createClient>,
  paths: string[],
): Promise<void> {
  const cleanupPaths = supportCleanupPaths(paths);
  if (cleanupPaths.length === 0) return;
  const { error } = await supabase.storage.from('support-requests').remove(cleanupPaths);
  if (error) {
    console.error('[support] comment image storage cleanup failed', error);
  }
}

export async function cleanupFailedSupportRequest({
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
