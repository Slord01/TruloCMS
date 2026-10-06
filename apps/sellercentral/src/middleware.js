import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);
export default async function middleware(request) {
  const { pathname } = request.nextUrl;
  const isPublic = /^(?:\/[^/]+)?\/(?:login|forgot-password)(?:\/|$)/.test(pathname) || pathname.startsWith('/api/') || pathname.startsWith('/_next/') || /\.\w+$/.test(pathname);
  if (!isPublic) {
    const token = request.cookies.get('sc_token')?.value;
    // Bindings are unavailable here. The server layout verifies the session.
    if (!token) {
      const prefix = pathname.split('/')[1];
      const locale = routing.locales.includes(prefix) ? prefix : routing.defaultLocale;
      const login = new URL(`/${locale}/login`, request.url);
      login.searchParams.set('next', pathname);
      const response = NextResponse.redirect(login);
      response.cookies.set('sc_token', '', { path: '/', maxAge: 0 });
      return response;
    }
  }
  const response = intlMiddleware(request);
  // Next's request-header override passes this to the server layout. Always overwrite
  // the incoming value, so clients cannot mark protected pages as public.
  const override = response.headers.get('x-middleware-override-headers');
  response.headers.set('x-middleware-override-headers', [override, 'x-trulo-protected-path'].filter(Boolean).join(','));
  response.headers.set('x-middleware-request-x-trulo-protected-path', isPublic ? '' : pathname);
  return response;
}
export const config = { matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'] };
