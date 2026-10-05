import { NextResponse } from 'next/server';

export async function POST(request) {
  let token;
  try { const body = await request.json(); token = typeof body.token === 'string' ? body.token.trim() : ''; }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });
  const base = (process.env.NEXT_PUBLIC_CMS_BACKEND_URL || 'http://localhost:9000').replace(/\/$/, '');
  try {
    const auth = await fetch(`${base}/admin-hub/auth/me`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!auth.ok || (await auth.json()).user?.role !== 'superuser') return NextResponse.json({ error: 'Invalid superuser session' }, { status: 401 });
  } catch { return NextResponse.json({ error: 'CMS backend unavailable' }, { status: 503 }); }
  const response = NextResponse.json({ ok: true });
  response.cookies.set('sc_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 60 * 60 * 12 });
  return response;
}
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('sc_token', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 });
  return response;
}
