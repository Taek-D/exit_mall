'use server';
import { createClient } from '@/lib/supabase/server';
import { adjustBalanceSchema, thresholdSchema } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';

export async function adjustBalanceAction(userId: string, fd: FormData) {
  const parsed = adjustBalanceSchema.safeParse({ delta: Number(fd.get('delta')), memo: fd.get('memo') });
  if (!parsed.success) return { error: parsed.error.errors.map(e => e.message).join(' · ') };
  const supabase = createClient();
  const { error } = await (supabase.rpc as any)('adjust_balance', {
    target_user: userId, delta: parsed.data.delta, memo: parsed.data.memo,
  });
  if (error) {
    if (error.message.includes('NEGATIVE_BALANCE')) return { error: '잔액이 음수가 됩니다' };
    return { error: error.message };
  }
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

export async function updateThresholdAction(userId: string, fd: FormData) {
  const parsed = thresholdSchema.safeParse({ threshold: Number(fd.get('threshold')) });
  if (!parsed.success) return { error: parsed.error.errors.map(e => e.message).join(' · ') };
  const supabase = createClient();
  const { error } = await (supabase.from('profiles') as any).update({ low_balance_threshold: parsed.data.threshold }).eq('id', userId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

export async function setUserStatusAction(userId: string, status: 'active'|'suspended') {
  const supabase = createClient();
  const { data: { user: me } } = await supabase.auth.getUser();
  if (me!.id === userId) return { error: '본인 상태는 변경할 수 없습니다' };
  const { error } = await (supabase.from('profiles') as any).update({ status }).eq('id', userId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}
