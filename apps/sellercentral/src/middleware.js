import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);
export default async function middleware(request) {
  const { pathname } = request.nextUrl;
  const isPublic = /^(?:\/[^/]+)?\/(?:login|forgot-password)(?:\/|$)/.test(pathname) || pathname.startsWith('/api/') || pathname.startsWith('/_next/') || /\.\w+$/.test(pathname);
  if (!isPublic) {
    const token = request.cookies.get('sc_token')?.value;
    const base = (process.env.NEXT_PUBLIC_CMS_BACKEND_URL || 'http://localhost:9000').replace(/\/$/, '');
    let authenticated = false;
    if (token) {
      try {
        const response = await fetch(`${base}/admin-hub/auth/me`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
        authenticated = response.ok && (await response.json()).user?.role === 'superuser';
      } catch { /* Backend authentication is required. */ }
    }
    if (!authenticated) {
      const prefix = pathname.split('/')[1];
      const locale = routing.locales.includes(prefix) ? prefix : routing.defaultLocale;
      const login = new URL(`/${locale}/login`, request.url);
      login.searchParams.set('next', pathname);
      const response = NextResponse.redirect(login);
      response.cookies.set('sc_token', '', { path: '/', maxAge: 0 });
      return response;
    }
  }
  return intlMiddleware(request);
}
export const config = { matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'] };
