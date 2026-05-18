import { safeSupportFilename } from '@/lib/support/storage';

export function supportAttachmentPath({
  userId,
  requestId,
  attachmentId,
  originalName,
}: {
  userId: string;
  requestId: string;
  attachmentId: string;
  originalName: string;
}): string {
  return `${userId}/${requestId}/attachments/${attachmentId}-${safeSupportFilename(originalName)}`;
}

export function supportCleanupPaths(paths: string[]): string[] {
  return paths.filter(Boolean);
}
