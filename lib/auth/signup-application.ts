import type { SupabaseClient } from '@supabase/supabase-js';
import { formatSignupAuthError } from '@/lib/auth-error-messages';
import type { Database } from '@/lib/db-types';
import type { SignupInput } from '@/lib/schemas';

type SupabaseAuthClient = Pick<SupabaseClient<Database>, 'auth'>;
type SupabaseAdminClient = Pick<SupabaseClient<Database>, 'auth' | 'from'>;

type SignupApplicationResult =
  | { ok: true; reapplied: boolean }
  | { ok: false; error: string };

function isAlreadyRegisteredError(message: string) {
  return message.toLowerCase().includes('already registered');
}

function unavailableReapplicationMessage() {
  return '반려된 가입 신청을 다시 접수하지 못했습니다. 잠시 후 다시 시도해주세요.';
}

export async function submitSignupApplication(
  input: SignupInput,
  supabase: SupabaseAuthClient,
  serviceSupabase?: SupabaseAdminClient,
): Promise<SignupApplicationResult> {
  const email = input.email.trim().toLowerCase();
  const metadata = { name: input.name, phone: input.phone };

  const { error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: { data: metadata },
  });

  if (!error) return { ok: true, reapplied: false };
  if (!isAlreadyRegisteredError(error.message)) {
    return { ok: false, error: formatSignupAuthError(error.message) };
  }
  if (!serviceSupabase) {
    return { ok: false, error: formatSignupAuthError(error.message) };
  }

  const { data: profile, error: profileError } = await serviceSupabase
    .from('profiles')
    .select('id,status')
    .ilike('email', email)
    .maybeSingle<{ id: string; status: string }>();

  if (profileError) {
    console.error('[signup] lookup rejected profile', { email, error: profileError });
    return { ok: false, error: unavailableReapplicationMessage() };
  }

  if (!profile || profile.status !== 'rejected') {
    return { ok: false, error: formatSignupAuthError(error.message) };
  }

  const { error: authUpdateError } = await serviceSupabase.auth.admin.updateUserById(profile.id, {
    password: input.password,
    user_metadata: metadata,
    email_confirm: true,
  });

  if (authUpdateError) {
    console.error('[signup] update rejected auth user', { userId: profile.id, error: authUpdateError });
    return { ok: false, error: unavailableReapplicationMessage() };
  }

  const { data: updated, error: updateError } = await serviceSupabase
    .from('profiles')
    .update({
      email,
      name: input.name,
      phone: input.phone,
      status: 'pending',
      approved_at: null,
    })
    .eq('id', profile.id)
    .eq('status', 'rejected')
    .select('id,status')
    .maybeSingle<{ id: string; status: string }>();

  if (!updateError && updated?.status === 'pending') {
    return { ok: true, reapplied: true };
  }

  const { data: refreshed, error: refreshError } = await serviceSupabase
    .from('profiles')
    .select('id,status')
    .eq('id', profile.id)
    .maybeSingle<{ id: string; status: string }>();

  if (!refreshError && refreshed?.status === 'pending') {
    return { ok: true, reapplied: true };
  }

  console.error('[signup] update rejected profile', {
    userId: profile.id,
    error: updateError ?? refreshError,
  });
  return { ok: false, error: unavailableReapplicationMessage() };
}
