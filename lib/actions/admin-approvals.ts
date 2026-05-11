'use server';
import { requireAdmin } from '@/lib/actions/_guards';
import { mutationTable, revalidatePaths } from '@/lib/actions/_shared';

export async function approveUserAction(userId: string) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const { error } = await mutationTable(guard.supabase, 'profiles')
    .update({ status: 'active', approved_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) {
    console.error('[admin-approvals] approve', { userId, error });
    return { error: '가입을 승인하지 못했습니다.' };
  }
  revalidatePaths(['/admin/approvals', '/admin/users', '/admin']);
  return { ok: true };
}

export async function rejectUserAction(userId: string) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const { error } = await mutationTable(guard.supabase, 'profiles').update({ status: 'rejected' }).eq('id', userId);
  if (error) {
    console.error('[admin-approvals] reject', { userId, error });
    return { error: '가입을 반려하지 못했습니다.' };
  }
  revalidatePaths(['/admin/approvals', '/admin/users', '/admin']);
  return { ok: true };
}
