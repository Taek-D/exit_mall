'use server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  signupSchema,
  loginSchema,
  passwordChangeSchema,
  findAccountSchema,
  directPasswordResetStartSchema,
  directPasswordResetCompleteSchema,
} from '@/lib/schemas';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { formatZodError, formatZodPathError } from '@/lib/actions/_shared';
import { submitSignupApplication } from '@/lib/auth/signup-application';
import { GROUP2_HOME } from '@/lib/auth/user-groups';
import {
  completeDirectPasswordReset,
  getDirectPasswordResetSecret,
  startDirectPasswordReset,
} from '@/lib/auth/direct-password-reset';

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

  const result = await submitSignupApplication(
    parsed.data,
    createClient(),
    process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceRoleClient() : undefined,
  );
  if (!result.ok) return { error: result.error };
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
    .from('profiles').select('role,status,user_group').eq('id', user.id)
    .single<{ role: string; status: string; user_group: string | null }>();
  if (!profile || profile.status !== 'active') {
    await supabase.auth.signOut();
    redirect(`/pending?status=${profile?.status ?? 'pending'}`);
  }
  redirect(
    profile.role === 'admin'
      ? '/admin'
      : profile.user_group === 'group2'
        ? GROUP2_HOME
        : '/shop',
  );
}

export async function logoutAction() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function logoutToSignupAction() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/signup');
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

function getRequestIp() {
  const headerStore = headers();
  const forwardedFor = headerStore.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    forwardedFor ||
    headerStore.get('x-real-ip') ||
    headerStore.get('cf-connecting-ip') ||
    null
  );
}

export async function startDirectPasswordResetAction(formData: FormData) {
  const parsed = directPasswordResetStartSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone'),
    email: formData.get('email'),
  });
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: '비밀번호 재설정 기능을 사용하려면 SUPABASE_SERVICE_ROLE_KEY가 필요합니다' };
  }

  try {
    const result = await startDirectPasswordReset(
      parsed.data,
      createServiceRoleClient(),
      {
        ip: getRequestIp(),
        secret: getDirectPasswordResetSecret(),
      },
    );
    if (!result.ok) return { error: result.error };
    return { ok: true, resetToken: result.resetToken };
  } catch (error) {
    console.error('[auth] direct password reset start', error);
    return { error: '비밀번호 재설정을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.' };
  }
}

export async function completeDirectPasswordResetAction(formData: FormData) {
  const parsed = directPasswordResetCompleteSchema.safeParse({
    resetToken: formData.get('resetToken'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: '비밀번호 재설정 기능을 사용하려면 SUPABASE_SERVICE_ROLE_KEY가 필요합니다' };
  }

  try {
    const result = await completeDirectPasswordReset(
      {
        resetToken: parsed.data.resetToken,
        newPassword: parsed.data.newPassword,
      },
      createServiceRoleClient(),
      { secret: getDirectPasswordResetSecret() },
    );
    if (!result.ok) return { error: result.error };
    return { ok: true };
  } catch (error) {
    console.error('[auth] direct password reset complete', error);
    return { error: '비밀번호를 재설정하지 못했습니다. 처음부터 다시 시도해주세요.' };
  }
}
