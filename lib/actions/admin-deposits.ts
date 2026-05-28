'use server';
import { requireAdmin } from '@/lib/actions/_guards';
import { callRpc, revalidatePaths, type ActionResult } from '@/lib/actions/_shared';

export async function confirmDepositAction(requestId: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await callRpc(guard.supabase, 'confirm_deposit', { request_id: requestId });
  if (error) {
    if (error.message.includes('ALREADY_PROCESSED')) return { ok: false, error: '이미 처리된 요청입니다' };
    console.error('[admin-deposits] confirm', { requestId, error });
    return { ok: false, error: '입금을 확인하지 못했습니다.' };
  }
  revalidatePaths(['/admin/deposits', '/admin']);
  return { ok: true };
}

export async function rejectDepositAction(requestId: string, memo: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { error } = await callRpc(guard.supabase, 'reject_deposit', { request_id: requestId, memo });
  if (error) {
    console.error('[admin-deposits] reject', { requestId, error });
    return { ok: false, error: '입금 요청을 반려하지 못했습니다.' };
  }
  revalidatePaths(['/admin/deposits']);
  return { ok: true };
}
