'use server';
import { adjustBalanceSchema, thresholdSchema } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/actions/_guards';

export async function adjustBalanceAction(userId: string, fd: FormData) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const parsed = adjustBalanceSchema.safeParse({ delta: Number(fd.get('delta')), memo: fd.get('memo') });
  if (!parsed.success) return { error: parsed.error.errors.map(e => e.message).join(' · ') };
  const { error } = await (guard.supabase.rpc as any)('adjust_balance', {
    target_user: userId, delta: parsed.data.delta, memo: parsed.data.memo,
  });
  if (error) {
    if (error.message.includes('NEGATIVE_BALANCE')) return { error: '잔액이 음수가 됩니다' };
    console.error('[admin-users] adjustBalance', { userId, error });
    return { error: '예치금 조정에 실패했습니다.' };
  }
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

export async function updateThresholdAction(userId: string, fd: FormData) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const parsed = thresholdSchema.safeParse({ threshold: Number(fd.get('threshold')) });
  if (!parsed.success) return { error: parsed.error.errors.map(e => e.message).join(' · ') };
  const { error } = await (guard.supabase.from('profiles') as any).update({ low_balance_threshold: parsed.data.threshold }).eq('id', userId);
  if (error) {
    console.error('[admin-users] updateThreshold', { userId, error });
    return { error: '알림 기준을 저장하지 못했습니다.' };
  }
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

export async function setUserStatusAction(userId: string, status: 'active'|'suspended') {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  if (guard.user.id === userId) return { error: '본인 상태는 변경할 수 없습니다' };
  const { error } = await (guard.supabase.from('profiles') as any).update({ status }).eq('id', userId);
  if (error) {
    console.error('[admin-users] setStatus', { userId, status, error });
    return { error: '계정 상태를 변경하지 못했습니다.' };
  }
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}
