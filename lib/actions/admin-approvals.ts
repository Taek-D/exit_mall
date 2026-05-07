'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/actions/_guards';

export async function approveUserAction(userId: string) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const { error } = await (guard.supabase.from('profiles') as any)
    .update({ status: 'active', approved_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) {
    console.error('[admin-approvals] approve', { userId, error });
    return { error: '가입을 승인하지 못했습니다.' };
  }
  revalidatePath('/admin/approvals');
  revalidatePath('/admin');
  return { ok: true };
}

export async function rejectUserAction(userId: string) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const { error } = await (guard.supabase.from('profiles') as any).update({ status: 'suspended' }).eq('id', userId);
  if (error) {
    console.error('[admin-approvals] reject', { userId, error });
    return { error: '가입을 반려하지 못했습니다.' };
  }
  revalidatePath('/admin/approvals');
  return { ok: true };
}
