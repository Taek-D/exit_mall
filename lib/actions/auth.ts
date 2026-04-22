'use server';
import { createClient } from '@/lib/supabase/server';
import { signupSchema, loginSchema } from '@/lib/schemas';
import { redirect } from 'next/navigation';

export async function signupAction(formData: FormData) {
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    name: formData.get('name'),
    phone: formData.get('phone'),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { name: parsed.data.name, phone: parsed.data.phone } },
  });
  if (error) return { error: error.message };
  redirect('/pending?status=pending');
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
