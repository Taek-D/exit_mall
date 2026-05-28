'use server';
import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

/**
 * 액션 인증 가드 정책.
 *
 * - requireAdmin      : role='admin' && status='active' (관리자 전용 액션)
 * - requireUserGroup1 : status='active' && group2 차단 (구매/주문 등 group1 한정)
 * - requireSignedIn   : status='active'만 (group 무관, 모든 활성 사용자)
 *
 * 가드를 생략하고 RLS만으로 권한을 보장하는 액션도 있다. RPC가 자체적으로
 * 작성자/관리자/활성 여부를 검증하고 user.id가 직접 필요 없는 경우
 * (예: *CommentAction의 add 계열, setStatus/markRead)에는 createClient()만
 * 사용하고 해당 액션에 "RLS가 검증" 주석을 남긴다. 반면 user.id로 추가 검증이
 * 필요한 액션(예: 댓글 수정/삭제의 작성자 확인)은 반드시 가드를 사용한다.
 */

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
