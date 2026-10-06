// Only call from a request handler, never from middleware or build configuration.
export function getCmsBackendUrl() {
  const value = process.env.CMS_BACKEND_URL;
  if (!value && process.env.VERCEL) throw new Error('CMS service binding is unavailable.');
  const url = new URL(value || 'http://127.0.0.1:9000');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid CMS service URL.');
  return url.href.replace(/\/$/, '');
}

export function cmsProxy(allowedPrefix) {
  return async function proxy(request, { params }) {
    try {
      const { path = [] } = await params;
      // Reject traversal before combining a public path with the internal service URL.
      if (!path.length || path.some(part => /[\\/?#]/.test(part) || part === '.' || part === '..') || !allowedPrefix.includes(path[0])) {
        return Response.json({ message: 'Unknown CMS route.' }, { status: 404 });
      }
      const url = new URL(`${getCmsBackendUrl()}/${path.map(encodeURIComponent).join('/')}`);
      url.search = new URL(request.url).search;
      const headers = new Headers();
      for (const name of ['authorization', 'content-type', 'x-sales-channel-id']) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }
      const response = await fetch(url, {
        method: request.method, headers, redirect: 'manual', cache: 'no-store',
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
        signal: AbortSignal.timeout(55000),
      });
      const outgoing = new Headers({ 'Cache-Control': 'no-store' });
      if (response.headers.has('content-type')) outgoing.set('Content-Type', response.headers.get('content-type'));
      return new Response(response.body, { status: response.status, headers: outgoing });
    } catch {
      return Response.json({ message: 'CMS backend unavailable.' }, { status: 503 });
    }
  };
}
