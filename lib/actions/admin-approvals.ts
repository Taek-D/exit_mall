'use server';
import { requireAdmin } from '@/lib/actions/_guards';
import { mutationTable, revalidatePaths } from '@/lib/actions/_shared';
import { isUserGroup, type UserGroup } from '@/lib/auth/user-groups';

export async function approveUserAction(userId: string, group: UserGroup) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };

  if (!isUserGroup(group)) {
    return { error: '그룹이 올바르지 않습니다.' };
  }

  const { error } = await mutationTable(guard.supabase, 'profiles')
    .update({
      status: 'active',
      user_group: group,
      approved_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) {
    console.error('[admin-approvals] approve', { userId, group, error });
    return { error: '가입을 승인하지 못했습니다.' };
  }
  console.info('[admin-approvals] approved', {
    userId,
    group,
    by: guard.user.id,
  });
  revalidatePaths(['/admin/approvals', '/admin/users', '/admin']);
  return { ok: true };
}

export async function rejectUserAction(userId: string) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const { error } = await mutationTable(guard.supabase, 'profiles')
    .update({ status: 'rejected' })
    .eq('id', userId);
  if (error) {
    console.error('[admin-approvals] reject', { userId, error });
    return { error: '가입을 반려하지 못했습니다.' };
  }
  revalidatePaths(['/admin/approvals', '/admin/users', '/admin']);
  return { ok: true };
}
