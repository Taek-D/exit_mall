import { NextResponse } from 'next/server';
import { formatZodPathError } from '@/lib/actions/_shared';
import { submitSignupApplication } from '@/lib/auth/signup-application';
import { signupSchema } from '@/lib/schemas';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

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

  const result = await submitSignupApplication(
    parsed.data,
    createClient(),
    process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceRoleClient() : undefined,
  );

  if (!result.ok) {
    return redirectToSignup(request, result.error);
  }

  return NextResponse.redirect(new URL('/pending?status=pending&from=signup', request.url), {
    status: 303,
  });
}
