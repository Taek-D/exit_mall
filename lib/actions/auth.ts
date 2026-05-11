'use server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  signupSchema,
  loginSchema,
  passwordChangeSchema,
  findAccountSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
} from '@/lib/schemas';
import { PASSWORD_RECOVERY_COOKIE } from '@/lib/auth-constants';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { formatZodError, formatZodPathError } from '@/lib/actions/_shared';
import { formatSignupAuthError } from '@/lib/auth-error-messages';
import { buildAppUrl } from '@/lib/site-url';

export async function signupAction(formData: FormData) {
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    name: formData.get('name'),
    phone: formData.get('phone'),
  });
  if (!parsed.success) {
    return { error: formatZodPathError(parsed.error) };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { name: parsed.data.name, phone: parsed.data.phone } },
  });
  if (error) return { error: formatSignupAuthError(error.message) };
  redirect('/pending?status=pending&from=signup');
}

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: '이메일/비밀번호를 확인하세요' };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: '로그인 실패: 이메일 또는 비밀번호가 틀립니다' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '세션 오류' };

  const { data: profile } = await supabase
    .from('profiles').select('role,status').eq('id', user.id)
    .single<{ role: string; status: string }>();
  if (!profile || profile.status !== 'active') {
    await supabase.auth.signOut();
    redirect(`/pending?status=${profile?.status ?? 'pending'}`);
  }
  redirect(profile.role === 'admin' ? '/admin' : '/shop');
}

export async function logoutAction() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function changePasswordAction(formData: FormData) {
  const parsed = passwordChangeSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) };
  }

  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { error: '로그인이 필요합니다' };
  if (!user.email) return { error: '이메일 로그인 계정에서만 비밀번호를 변경할 수 있습니다' };

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (verifyError) return { error: '현재 비밀번호가 올바르지 않습니다' };

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (updateError) return { error: updateError.message };

  return { ok: true };
}

function normalizePhone(phone: string) {
  return phone.replace(/[^0-9]/g, '');
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const head = local.slice(0, Math.min(2, local.length));
  const tail = local.length > 3 ? local.slice(-1) : '';
  const maskedLocal = `${head}${'*'.repeat(Math.max(3, local.length - head.length - tail.length))}${tail}`;
  const dot = domain.lastIndexOf('.');
  const maskedDomain =
    dot > 1
      ? `${domain[0]}${'*'.repeat(Math.max(2, dot - 1))}${domain.slice(dot)}`
      : domain;
  return `${maskedLocal}@${maskedDomain}`;
}

export async function findAccountAction(formData: FormData) {
  const parsed = findAccountSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone'),
  });
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: '계정 찾기 기능을 사용하려면 SUPABASE_SERVICE_ROLE_KEY가 필요합니다' };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('email,phone,status')
    .eq('name', parsed.data.name);

  if (error) return { error: error.message };

  const targetPhone = normalizePhone(parsed.data.phone);
  const matched = (data ?? []).filter((p) => normalizePhone(p.phone ?? '') === targetPhone);
  if (matched.length === 0) {
    return { ok: true, accounts: [] as { email: string; status: string }[] };
  }

  return {
    ok: true,
    accounts: matched.map((p) => ({
      email: maskEmail(p.email),
      status: p.status,
    })),
  };
}

export async function requestPasswordResetAction(formData: FormData) {
  const parsed = passwordResetRequestSchema.safeParse({
    email: formData.get('email'),
  });
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) };
  }

  const supabase = createClient();
  const redirectTo = buildAppUrl('/auth/callback?next=/reset-password');
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo,
  });
  if (error) return { error: error.message };

  return { ok: true };
}

export async function resetRecoveredPasswordAction(formData: FormData) {
  const parsed = passwordResetSchema.safeParse({
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) };
  }

  const cookieStore = cookies();
  if (!cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value) {
    return { error: '비밀번호 재설정 링크가 만료되었거나 올바르지 않습니다' };
  }

  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { error: '비밀번호 재설정 세션이 만료되었습니다' };

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (updateError) return { error: updateError.message };

  cookieStore.delete(PASSWORD_RECOVERY_COOKIE);
  await supabase.auth.signOut();
  return { ok: true };
}
