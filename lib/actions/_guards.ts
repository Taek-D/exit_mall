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
  // admin은 통과 (관리자는 권한 전권), 일반 사용자는 group1만 통과
  if (profile.role !== 'admin' && profile.user_group !== 'group1') {
    return { ok: false, error: '이 기능을 사용할 권한이 없습니다.' };
  }
  return { ok: true, supabase, user, profile };
}
