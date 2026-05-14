import { NextResponse, type NextRequest } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase/middleware-client';
import {
  GROUP2_HOME,
  isPathAllowedForGroup2,
} from '@/lib/auth/user-groups';

const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/pending',
  '/find-account',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/favicon.ico',
];
const ADMIN_PREFIX = '/admin';

export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request);
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/_next') || pathname.startsWith('/api/public')) return response;
  if (pathname.startsWith('/api/orders/') && pathname.endsWith('/tracking')) return response;
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) return response;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, user_group')
    .eq('id', user.id)
    .single<{ role: string; status: string; user_group: string | null }>();

  if (!profile) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (profile.status !== 'active') {
    const url = request.nextUrl.clone();
    url.pathname = '/pending';
    url.searchParams.set('status', profile.status);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith(ADMIN_PREFIX) && profile.role !== 'admin') {
    const url = request.nextUrl.clone();
    url.pathname = '/shop';
    return NextResponse.redirect(url);
  }

  // group2 라우트 가드: 일반 사용자(admin 제외)이고 group2이면 허용 경로 외 차단
  if (
    profile.role === 'user' &&
    profile.user_group === 'group2' &&
    !pathname.startsWith(ADMIN_PREFIX) &&
    !isPathAllowedForGroup2(pathname)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = GROUP2_HOME;
    return NextResponse.redirect(url);
  }

  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname =
      profile.role === 'admin'
        ? '/admin'
        : profile.user_group === 'group2'
          ? GROUP2_HOME
          : '/shop';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
