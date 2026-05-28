'use server';
import { requireAdmin } from '@/lib/actions/_guards';
import { callRpc, revalidatePaths, type ActionResult } from '@/lib/actions/_shared';
import { shippingUploadAllPaths } from '@/lib/actions/_revalidate-paths';
import { mapShippingUploadError } from '@/lib/errors/shipping-upload';

export async function approveShippingUploadAction(
  uploadId: string,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await callRpc(guard.supabase, 'approve_shipping_upload', {
    upload_id: uploadId,
  });
  if (error) {
    console.error('[admin-shipping-uploads] approve', { uploadId, error });
    return { ok: false, error: mapShippingUploadError(error.message) };
  }
  revalidatePaths(shippingUploadAllPaths());
  return { ok: true };
}

export async function rejectShippingUploadAction(
  uploadId: string,
  memo: string,
): Promise<ActionResult> {
  if (!memo.trim()) return { ok: false, error: '반려 사유를 입력해주세요.' };
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await callRpc(guard.supabase, 'reject_shipping_upload', {
    upload_id: uploadId,
    memo: memo.trim(),
  });
  if (error) {
    console.error('[admin-shipping-uploads] reject', { uploadId, error });
    return { ok: false, error: mapShippingUploadError(error.message) };
  }
  revalidatePaths(shippingUploadAllPaths());
  return { ok: true };
}

export async function completeShippingUploadAction(
  uploadId: string,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await callRpc(guard.supabase, 'complete_shipping_upload', {
    upload_id: uploadId,
  });
  if (error) {
    console.error('[admin-shipping-uploads] complete', { uploadId, error });
    return { ok: false, error: mapShippingUploadError(error.message) };
  }
  revalidatePaths(shippingUploadAllPaths());
  return { ok: true };
}
