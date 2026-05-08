'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/actions/_guards';
import { mapShippingUploadError } from '@/lib/errors/shipping-upload';

export async function approveShippingUploadAction(
  uploadId: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await (guard.supabase.rpc as any)('approve_shipping_upload', {
    upload_id: uploadId,
  });
  if (error) {
    console.error('[admin-shipping-uploads] approve', { uploadId, error });
    return { ok: false, error: mapShippingUploadError(error.message) };
  }
  revalidatePath('/admin/shipping-uploads');
  revalidatePath('/shipping-uploads');
  return { ok: true };
}

export async function rejectShippingUploadAction(
  uploadId: string,
  memo: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!memo.trim()) return { ok: false, error: '반려 사유를 입력해주세요.' };
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await (guard.supabase.rpc as any)('reject_shipping_upload', {
    upload_id: uploadId,
    memo: memo.trim(),
  });
  if (error) {
    console.error('[admin-shipping-uploads] reject', { uploadId, error });
    return { ok: false, error: mapShippingUploadError(error.message) };
  }
  revalidatePath('/admin/shipping-uploads');
  revalidatePath('/shipping-uploads');
  return { ok: true };
}

export async function completeShippingUploadAction(
  uploadId: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await (guard.supabase.rpc as any)('complete_shipping_upload', {
    upload_id: uploadId,
  });
  if (error) {
    console.error('[admin-shipping-uploads] complete', { uploadId, error });
    return { ok: false, error: mapShippingUploadError(error.message) };
  }
  revalidatePath('/admin/shipping-uploads');
  revalidatePath('/shipping-uploads');
  return { ok: true };
}
