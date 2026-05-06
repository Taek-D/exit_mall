'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export type ApproveResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string };

export async function approveOrderUploadAction(uploadId: string): Promise<ApproveResult> {
  const supabase = createClient();
  const { data, error } = await (supabase.rpc as any)('approve_order_upload', {
    upload_id: uploadId,
  });
  if (error) {
    const msg = error.message;
    if (msg.includes('FORBIDDEN')) return { ok: false, error: '관리자만 승인할 수 있습니다.' };
    if (msg.includes('NOT_FOUND')) return { ok: false, error: '업로드를 찾을 수 없습니다.' };
    if (msg.includes('ALREADY_PROCESSED')) return { ok: false, error: '이미 처리된 업로드입니다.' };
    if (msg.includes('MISSING_SHIPPING')) return { ok: false, error: '배송 정보(받는 사람·연락처·주소)가 비어있습니다.' };
    if (msg.includes('USER_NOT_ACTIVE')) return { ok: false, error: '고객 계정이 활성 상태가 아닙니다.' };
    if (msg.includes('INSUFFICIENT_BALANCE')) return { ok: false, error: '고객의 예치금이 부족합니다.' };
    if (msg.includes('EMPTY_ITEMS')) return { ok: false, error: '주문 항목이 없습니다.' };
    if (msg.includes('INVALID_QUANTITY')) return { ok: false, error: '수량 값이 올바르지 않은 항목이 있습니다.' };
    if (msg.includes('INVALID_PRICE')) return { ok: false, error: '단가 값이 올바르지 않은 항목이 있습니다.' };
    return { ok: false, error: msg };
  }
  revalidatePath('/admin/order-uploads');
  revalidatePath('/admin/orders');
  return { ok: true, orderId: data as string };
}

export async function rejectOrderUploadAction(
  uploadId: string,
  memo: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!memo.trim()) return { ok: false, error: '반려 사유를 입력해주세요.' };
  const supabase = createClient();
  const { error } = await (supabase.rpc as any)('reject_order_upload', {
    upload_id: uploadId,
    memo: memo.trim(),
  });
  if (error) {
    if (error.message.includes('ALREADY_PROCESSED')) return { ok: false, error: '이미 처리된 업로드입니다.' };
    return { ok: false, error: error.message };
  }
  revalidatePath('/admin/order-uploads');
  return { ok: true };
}

export async function getOrderUploadDownloadUrl(
  storagePath: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from('order-uploads')
    .createSignedUrl(storagePath, 60 * 5); // 5 minutes
  if (error || !data) return { ok: false, error: error?.message ?? '서명 URL 생성 실패' };
  return { ok: true, url: data.signedUrl };
}
