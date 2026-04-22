import { NextResponse, type NextRequest } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase/middleware-client';

const PUBLIC_PATHS = ['/login', '/signup', '/pending', '/favicon.ico'];
const ADMIN_PREFIX = '/admin';

export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request);
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/_next') || pathname.startsWith('/api/public')) return response;
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) return response;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase
    .from('profiles').select('role, status').eq('id', user.id).single<{ role: string; status: string }>();

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

  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = profile.role === 'admin' ? '/admin' : '/shop';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
