'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/actions/_guards';

export async function confirmDepositAction(requestId: string) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const { error } = await (guard.supabase.rpc as any)('confirm_deposit', { request_id: requestId });
  if (error) {
    if (error.message.includes('ALREADY_PROCESSED')) return { error: '이미 처리된 요청입니다' };
    console.error('[admin-deposits] confirm', { requestId, error });
    return { error: '입금을 확인하지 못했습니다.' };
  }
  revalidatePath('/admin/deposits');
  revalidatePath('/admin');
  return { ok: true };
}

export async function rejectDepositAction(requestId: string, memo: string) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const { error } = await (guard.supabase.rpc as any)('reject_deposit', { request_id: requestId, memo });
  if (error) {
    console.error('[admin-deposits] reject', { requestId, error });
    return { error: '입금 요청을 반려하지 못했습니다.' };
  }
  revalidatePath('/admin/deposits');
  return { ok: true };
}
