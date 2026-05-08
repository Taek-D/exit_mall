'use server';
import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

type SupabaseServerClient = ReturnType<typeof createClient>;

type AdminContext = {
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
