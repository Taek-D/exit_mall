import { NextResponse } from 'next/server';
import { formatZodPathError } from '@/lib/actions/_shared';
import { formatSignupAuthError } from '@/lib/auth-error-messages';
import { signupSchema } from '@/lib/schemas';
import { createClient } from '@/lib/supabase/server';

function redirectToSignup(request: Request, error: string) {
  const url = new URL('/signup', request.url);
  url.searchParams.set('error', error);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    name: formData.get('name'),
    phone: formData.get('phone'),
  });

  if (!parsed.success) {
    return redirectToSignup(request, formatZodPathError(parsed.error));
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { name: parsed.data.name, phone: parsed.data.phone } },
  });

  if (error) {
    return redirectToSignup(request, formatSignupAuthError(error.message));
  }

  return NextResponse.redirect(new URL('/pending?status=pending&from=signup', request.url), {
    status: 303,
  });
}
