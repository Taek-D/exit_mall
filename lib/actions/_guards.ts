'use server';
import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

export type SupabaseServerClient = ReturnType<typeof createClient>;

export type AdminContext = {
  ok: true;
  supabase: SupabaseServerClient;
  user: User;
  profile: { role: string; status: string };
};

type GuardError = { ok: false; error: string };

export async function requireAdmin(): Promise<AdminContext | GuardError> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,status')
    .eq('id', user.id)
    .single<{ role: string; status: string }>();

  if (!profile || profile.role !== 'admin' || profile.status !== 'active') {
    return { ok: false, error: '관리자 권한이 필요합니다.' };
  }
  return { ok: true, supabase, user, profile };
}

export type SignedInContext = {
  ok: true;
  supabase: SupabaseServerClient;
  user: User;
  profile: { role: string; status: string };
};

/**
 * 로그인 + status='active'만 검증한다 (role/user_group 검사 없음).
 *
 * support-request, inbound-request 등 모든 활성 사용자가 접근해야 하는 액션에
 * 사용한다. group2 제한이 필요한 액션은 requireUserGroup1을, 관리자 전용은
 * requireAdmin을 사용할 것.
 */
export async function requireSignedIn(): Promise<SignedInContext | GuardError> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,status')
    .eq('id', user.id)
    .single<{ role: string; status: string }>();

  if (!profile || profile.status !== 'active') {
    return { ok: false, error: '계정이 활성 상태가 아닙니다.' };
  }
  return { ok: true, supabase, user, profile };
}

export type UserGroup1Context = {
  ok: true;
  supabase: SupabaseServerClient;
  user: User;
  profile: { role: string; status: string; user_group: string | null };
};

export async function requireUserGroup1(): Promise<UserGroup1Context | GuardError> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,status,user_group')
    .eq('id', user.id)
    .single<{ role: string; status: string; user_group: string | null }>();

  if (!profile || profile.status !== 'active') {
    return { ok: false, error: '계정이 활성 상태가 아닙니다.' };
  }
  // admin은 통과 (관리자는 권한 전권). 일반 사용자는 group2만 거부 —
  // NULL은 middleware/UI와 같이 group1로 취급해 백필 누락이나 setUserStatus만
  // 호출한 경로에서 정상 사용자가 차단되는 일이 없도록 한다.
  if (profile.role !== 'admin' && profile.user_group === 'group2') {
    return { ok: false, error: '이 기능을 사용할 권한이 없습니다.' };
  }
  return { ok: true, supabase, user, profile };
}
