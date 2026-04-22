'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function confirmDepositAction(requestId: string) {
  const supabase = createClient();
  const { error } = await (supabase.rpc as any)('confirm_deposit', { request_id: requestId });
  if (error) {
    if (error.message.includes('ALREADY_PROCESSED')) return { error: '이미 처리된 요청입니다' };
    return { error: error.message };
  }
  revalidatePath('/admin/deposits');
  revalidatePath('/admin');
  return { ok: true };
}

export async function rejectDepositAction(requestId: string, memo: string) {
  const supabase = createClient();
  const { error } = await (supabase.rpc as any)('reject_deposit', { request_id: requestId, memo });
  if (error) return { error: error.message };
  revalidatePath('/admin/deposits');
  return { ok: true };
}
