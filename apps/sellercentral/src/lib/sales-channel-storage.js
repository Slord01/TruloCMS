export const SALES_CHANNEL_KEY = 'trulo_sales_channel_id';
export const SALES_CHANNEL_EVENT = 'trulo-sales-channel-changed';

export function selectedChannelId() {
  if (typeof window === 'undefined') return 'all';
  return sessionStorage.getItem(SALES_CHANNEL_KEY) || 'all';
}

// Legacy screens also use fetch directly. Scope every request to the configured
// CMS backend, rather than relying on individual pages to remember the header.
export function installChannelFetch() {
  if (typeof window === 'undefined' || window.__truloChannelFetch) return;
  const original = window.fetch.bind(window);
  window.fetch = (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    const base = new URL(process.env.NEXT_PUBLIC_CMS_BACKEND_URL || "/api/cms", window.location.origin);
    if (url.origin === base.origin && url.pathname.startsWith(base.pathname === '/' ? '/' : base.pathname)) {
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      new Headers(options.headers).forEach((value, key) => headers.set(key, value));
      headers.set('X-Sales-Channel-Id', selectedChannelId());
      options = { ...options, headers };
    }
    return original(input, options);
  };
  window.__truloChannelFetch = true;
}
