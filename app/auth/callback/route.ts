import { createClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  const code = url.searchParams.get('code');
  const rawNext = url.searchParams.get('next') ?? '/shop';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/shop';
  const redirectUrl = new URL(next, url.origin);

  if (!code) {
    redirectUrl.pathname = '/forgot-password';
    redirectUrl.searchParams.set('error', 'missing-code');
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    redirectUrl.pathname = '/forgot-password';
    redirectUrl.searchParams.set('error', 'invalid-code');
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.redirect(redirectUrl);
}
