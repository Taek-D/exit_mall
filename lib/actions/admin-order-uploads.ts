'use server';
import { requireAdmin } from '@/lib/actions/_guards';
import { callRpc, revalidatePaths, type ActionResult } from '@/lib/actions/_shared';
import { mapOrderUploadError } from '@/lib/errors/order-upload';

export type ApproveResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string };

export async function approveOrderUploadAction(uploadId: string): Promise<ApproveResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { data, error } = await callRpc(guard.supabase, 'approve_order_upload', {
    upload_id: uploadId,
  });
  if (error) {
    const mapped = mapOrderUploadError(error.message);
    return { ok: false, error: mapped ?? error.message };
  }
  revalidatePaths(['/admin/order-uploads', '/admin/orders']);
  return { ok: true, orderId: data as string };
}

export async function rejectOrderUploadAction(
  uploadId: string,
  memo: string,
): Promise<ActionResult> {
  if (!memo.trim()) return { ok: false, error: '반려 사유를 입력해주세요.' };
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await callRpc(guard.supabase, 'reject_order_upload', {
    upload_id: uploadId,
    memo: memo.trim(),
  });
  if (error) {
    const mapped = mapOrderUploadError(error.message);
    return { ok: false, error: mapped ?? error.message };
  }
  revalidatePaths(['/admin/order-uploads']);
  return { ok: true };
}

export async function getOrderUploadDownloadUrl(
  storagePath: string,
  originalName?: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  // `download: <name>` adds Content-Disposition: attachment with the original
  // filename, so the browser saves the file rather than navigating to it.
  const { data, error } = await guard.supabase.storage
    .from('order-uploads')
    .createSignedUrl(storagePath, 60 * 5, { download: originalName || true });
  if (error || !data) {
    console.error('[admin-order-uploads] signedUrl', { storagePath, error });
    return { ok: false, error: '다운로드 URL을 만들지 못했습니다.' };
  }
  return { ok: true, url: data.signedUrl };
}
