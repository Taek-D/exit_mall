'use server';
import { adjustBalanceSchema, adminUserContactSchema, thresholdSchema } from '@/lib/schemas';
import { requireAdmin } from '@/lib/actions/_guards';
import { callRpc, formatZodError, mutationTable, revalidatePaths } from '@/lib/actions/_shared';
import { isSelfUserGroupChange, isUserGroup, type UserGroup } from '@/lib/auth/user-groups';

export async function adjustBalanceAction(userId: string, fd: FormData) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const parsed = adjustBalanceSchema.safeParse({ delta: Number(fd.get('delta')), memo: fd.get('memo') });
  if (!parsed.success) return { error: formatZodError(parsed.error) };
  const { error } = await callRpc(guard.supabase, 'adjust_balance', {
    target_user: userId, delta: parsed.data.delta, memo: parsed.data.memo,
  });
  if (error) {
    if (error.message.includes('NEGATIVE_BALANCE')) return { error: '잔액이 음수가 됩니다' };
    console.error('[admin-users] adjustBalance', { userId, error });
    return { error: '예치금 조정에 실패했습니다.' };
  }
  revalidatePaths([`/admin/users/${userId}`]);
  return { ok: true };
}

export async function updateThresholdAction(userId: string, fd: FormData) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const parsed = thresholdSchema.safeParse({ threshold: Number(fd.get('threshold')) });
  if (!parsed.success) return { error: formatZodError(parsed.error) };
  const { error } = await mutationTable(guard.supabase, 'profiles').update({ low_balance_threshold: parsed.data.threshold }).eq('id', userId);
  if (error) {
    console.error('[admin-users] updateThreshold', { userId, error });
    return { error: '알림 기준을 저장하지 못했습니다.' };
  }
  revalidatePaths([`/admin/users/${userId}`]);
  return { ok: true };
}

export async function updateUserContactAction(userId: string, fd: FormData) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  const parsed = adminUserContactSchema.safeParse({
    name: fd.get('name'),
    phone: fd.get('phone'),
  });
  if (!parsed.success) return { error: formatZodError(parsed.error) };

  const { error } = await mutationTable(guard.supabase, 'profiles')
    .update({
      name: parsed.data.name,
      phone: parsed.data.phone,
    })
    .eq('id', userId);
  if (error) {
    console.error('[admin-users] updateContact', { userId, error });
    return { error: '사용자 기본정보를 저장하지 못했습니다.' };
  }
  revalidatePaths(['/admin/users', `/admin/users/${userId}`]);
  return { ok: true };
}

export async function setUserStatusAction(userId: string, status: 'active'|'suspended') {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  if (guard.user.id === userId) return { error: '본인 상태는 변경할 수 없습니다' };
  const { error } = await mutationTable(guard.supabase, 'profiles').update({ status }).eq('id', userId);
  if (error) {
    console.error('[admin-users] setStatus', { userId, status, error });
    return { error: '계정 상태를 변경하지 못했습니다.' };
  }
  revalidatePaths([`/admin/users/${userId}`]);
  return { ok: true };
}

export async function setUserGroupAction(userId: string, group: UserGroup) {
  const guard = await requireAdmin();
  if (!guard.ok) return { error: guard.error };
  if (!isUserGroup(group)) return { error: '그룹이 올바르지 않습니다.' };
  if (isSelfUserGroupChange(guard.user.id, userId)) return { error: '본인 그룹은 변경할 수 없습니다.' };

  const { data: before, error: readError } = await guard.supabase
    .from('profiles')
    .select('user_group, status, role')
    .eq('id', userId)
    .single<{ user_group: string | null; status: string; role: string }>();

  if (readError || !before) {
    console.error('[admin-users] setGroup read', { userId, error: readError });
    return { error: '사용자를 찾을 수 없습니다.' };
  }
  if (before.status !== 'active' || before.role === 'admin') {
    return { error: '그룹을 변경할 수 없는 사용자입니다.' };
  }
  if (before.user_group === group) {
    return { ok: true }; // 변경 없음
  }

  const { error } = await mutationTable(guard.supabase, 'profiles')
    .update({ user_group: group })
    .eq('id', userId);
  if (error) {
    console.error('[admin-users] setGroup', { userId, error });
    return { error: '그룹을 변경하지 못했습니다.' };
  }
  console.info('[admin-users] group-change', {
    userId,
    before: before.user_group,
    after: group,
    by: guard.user.id,
  });
  revalidatePaths(['/admin/users', `/admin/users/${userId}`]);
  return { ok: true };
}
