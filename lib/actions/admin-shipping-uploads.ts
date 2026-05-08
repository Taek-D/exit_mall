'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/actions/_guards';

export function mapShippingUploadError(message: string): string {
  if (message.startsWith('FORBIDDEN')) return '관리자만 처리할 수 있습니다.';
  if (message.startsWith('NOT_FOUND')) return '업로드를 찾을 수 없습니다.';
  if (message.startsWith('ALREADY_PROCESSED')) return '이미 처리된 업로드입니다.';
  if (message.startsWith('USER_NOT_FOUND')) return '사용자를 찾을 수 없습니다.';
  if (message.startsWith('USER_NOT_ACTIVE')) return '사용자 계정이 활성 상태가 아닙니다.';
  if (message.startsWith('EMPTY_ITEMS')) return '주문 항목이 없습니다.';
  if (message.startsWith('INVALID_QUANTITY')) return '수량 값이 올바르지 않은 항목이 있습니다.';
  if (message.startsWith('INSUFFICIENT_INVENTORY')) {
    const parts = message.split(':');
    const need = parts[2] ?? '?';
    const have = parts[3] ?? '?';
    return `보유 재고가 부족합니다 (필요 ${need}개, 보유 ${have}개).`;
  }
  if (message.startsWith('INSUFFICIENT_BALANCE')) return '고객의 가용 예치금이 부족합니다.';
  if (message.startsWith('PRODUCT_NOT_FOUND')) return '존재하지 않는 상품(관리코드)이 있습니다.';
  if (message.startsWith('ROW_COUNT_MISMATCH')) {
    const parts = message.split(':');
    return `원본과 행 수가 다릅니다 (원본 ${parts[1]}행, 새 파일 ${parts[2]}행).`;
  }
  if (message.startsWith('INVALID_STATE')) {
    const cur = message.split(':')[1] ?? '?';
    return `현재 상태에서는 처리할 수 없습니다 (${cur}).`;
  }
  if (message.startsWith('NOT_CANCELLABLE')) return '취소할 수 없는 상태입니다.';
  return '처리 중 오류가 발생했습니다.';
}

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
