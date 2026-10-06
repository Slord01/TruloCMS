const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
const { openStore, checkPassword, createSuperuser, hashPassword } = require('./store.cjs');
const { normalizeChannel, dnsInstructions, verifyChannel } = require('./domain.cjs');
const { createMediaHandler } = require('./media.cjs');

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function signToken(user, secret) {
  const payload = { id: user.id, role: 'superuser', exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12 };
  const message = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}`;
  return `${message}.${crypto.createHmac('sha256', secret).update(message).digest('base64url')}`;
}
function readToken(token, secret) {
  try {
    const [header, body, signature, extra] = String(token || '').split('.');
    if (extra || !signature || JSON.parse(Buffer.from(header, 'base64url')).alg !== 'HS256') return null;
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const claims = JSON.parse(Buffer.from(body, 'base64url'));
    return claims.role === 'superuser' && claims.exp > Date.now() / 1000 ? claims : null;
  } catch { return null; }
}
function publicUser(user) {
  return { id: user.id, seller_id: user.id, email: user.email, role: 'superuser', is_superuser: true,
    store_name: 'Trulo GmbH', permissions: null, approval_status: 'approved', locale: 'de' };
}
function httpError(status, message) { return Object.assign(new Error(message), { status }); }
async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw httpError(413, 'Request too large.');
    chunks.push(chunk);
  }
  try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}; }
  catch { throw httpError(400, 'Invalid JSON body.'); }
}
const resources = { products: 'product', categories: 'category', 'product-categories': 'category',
  collections: 'collection', brands: 'brand', pages: 'page', menus: 'menu', media: 'media',
  banners: 'banner', customers: 'customer', orders: 'order', 'blog-posts': 'blog_post',
  metaobjects: 'metaobject', 'container-types': 'container_type', locations: 'location', coupons: 'coupon' };

async function createServer({ db, verify = verifyChannel, storageFactory, origins = ['http://localhost:3002', 'http://127.0.0.1:3002'] } = {}) {
  db ||= await openStore();
  const mediaHandler = createMediaHandler(db, storageFactory);
  const secret = (await db.prepare('SELECT value FROM secrets WHERE key = ?').get('jwt')).value;
  const loginAttempts = new Map();
  const channelById = async id => {
    const row = (await db.prepare('SELECT data FROM sales_channels WHERE id = ?').get(id));
    if (!row) throw httpError(404, 'Website not found.');
    return JSON.parse(row.data);
  };
  const decorate = channel => ({ ...channel, dns_records: dnsInstructions(channel),
    deployment_marker: { path: '/.well-known/trulo-cms.txt', value: channel.verification_token } });
  const saveChannel = async (channel, previous) => {
    const result = await db.prepare('UPDATE sales_channels SET domain = ?, data = ? WHERE id = ? AND data = ?').run(channel.domain, JSON.stringify(channel), channel.id, JSON.stringify(previous));
    if (!result.changes) throw httpError(409, 'Website changed during this request. Reload and try again.');
  };
  const server = http.createServer(async (req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    try {
      const origin = req.headers.origin;
      if (origin && !origins.includes(origin)) throw httpError(403, 'Origin not allowed.');
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Sales-Channel-Id');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname.replace(/\/$/, '') || '/';
      if (route === '/health' && req.method === 'GET') { send(200, { status: 'ok', service: 'trulo-cms' }); return; }
      if (route === '/admin-hub/auth/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress;
        const now = Date.now();
        for (const [key, attempt] of loginAttempts) if (now > attempt.until) loginAttempts.delete(key);
        const attempt = loginAttempts.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
        if (++attempt.count > 10) throw httpError(429, 'Too many login attempts. Try again in 15 minutes.');
        loginAttempts.set(ip, attempt);
        const body = await readBody(req);
        const user = (await db.prepare('SELECT * FROM users WHERE email = ?').get(String(body.email || '').trim().toLowerCase()));
        if (!user || typeof body.password !== 'string' || !checkPassword(body.password, user.password_hash)) throw httpError(401, 'Invalid email or password.');
        loginAttempts.delete(ip);
        send(200, { token: signToken(user, secret), user: publicUser(user) }); return;
      }
      const claims = readToken(req.headers.authorization?.replace(/^Bearer /, ''), secret);
      const user = claims && (await db.prepare('SELECT * FROM users WHERE id = ?').get(claims.id));
      if (!user) throw httpError(401, 'Superuser authentication required.');
      if (['/admin-hub/auth/me', '/admin-hub/account', '/admin-hub/profile', '/admin-hub/v1/seller/profile', '/admin-hub/v1/seller/account'].includes(route) && req.method === 'GET') {
        send(200, { user: publicUser(user) }); return;
      }
      if (route === '/admin-hub/users') {
        if (req.method === 'GET') { send(200, { users: (await db.prepare('SELECT * FROM users ORDER BY created_at').all()).map(publicUser) }); return; }
        if (req.method === 'POST') {
          const body = await readBody(req);
          if (body.role && body.role !== 'superuser' || body.is_superuser === false) throw httpError(400, 'Only superuser accounts are supported.');
          const id = (await createSuperuser(db, body.email, body.password));
          send(201, { user: publicUser((await db.prepare('SELECT * FROM users WHERE id = ?').get(id))) }); return;
        }
      }
      if (route === '/admin-hub/v1/seller/password' && req.method === 'PATCH') {
        const body = await readBody(req);
        if (!checkPassword(String(body.current_password || ''), user.password_hash)) throw httpError(403, 'Current password is incorrect.');
        if (typeof body.new_password !== 'string' || body.new_password.length < 12) throw httpError(400, 'Password must contain at least 12 characters.');
        (await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.new_password), user.id));
        send(200, { success: true }); return;
      }
      if (route === '/admin-hub/v1/seller/account' && req.method === 'PATCH') {
        const body = await readBody(req); const email = String(body.email || user.email).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'Valid email required.');
        (await db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, user.id));
        send(200, { user: publicUser({ ...user, email }) }); return;
      }
      if (req.method === 'GET' && route === '/admin-hub/v1/notifications/unread') { send(200, { orders: 0, returns: 0, verifications: 0, change_requests: 0, campaigns: 0, seller_errors: 0 }); return; }
      if (req.method === 'GET' && route === '/admin-hub/v1/notifications/feed') { send(200, { notifications: [], feed: [] }); return; }
      const channelRoute = route.match(/^\/admin-hub\/sales-channels(?:\/([^/]+))?(\/verify)?$/);
      if (channelRoute) {
        const [, id, action] = channelRoute;
        if (!id && req.method === 'GET') {
          send(200, { sales_channels: (await db.prepare('SELECT data FROM sales_channels ORDER BY domain').all()).map(row => decorate(JSON.parse(row.data))) }); return;
        }
        if (!id && req.method === 'POST') {
          const fields = normalizeChannel(await readBody(req));
          const channel = { ...fields, id: crypto.randomUUID(), status: 'draft', verification_token: crypto.randomBytes(24).toString('hex'), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
          (await db.prepare('INSERT INTO sales_channels VALUES (?, ?, ?)').run(channel.id, channel.domain, JSON.stringify(channel)));
          send(201, { sales_channel: decorate(channel) }); return;
        }
        const previous = (await channelById(id));
        if (action && req.method === 'POST') {
          let result;
          try { result = await verify(previous); }
          catch (error) { result = { status: 'pending_dns', verification_message: error.message }; }
          // Verification must never overwrite a concurrent hosting/domain edit.
          const current = (await channelById(id));
          if (current.updated_at !== previous.updated_at) throw httpError(409, 'Website changed during verification. Check again.');
          const channel = { ...current, ...result, checked_at: new Date().toISOString(), updated_at: new Date().toISOString() };
          (await saveChannel(channel, current)); send(200, { sales_channel: decorate(channel) }); return;
        }
        if (!action && req.method === 'GET') { send(200, { sales_channel: decorate(previous) }); return; }
        if (!action && req.method === 'PATCH') {
          const fields = normalizeChannel(await readBody(req), previous);
          const changed = ['domain', 'target', 'record_type'].some(key => fields[key] !== previous[key]);
          const channel = { ...previous, ...fields, updated_at: new Date().toISOString(),
            ...(changed ? { status: 'draft', checked_at: null, verification_message: '', verification_token: crypto.randomBytes(24).toString('hex') } : {}) };
          (await saveChannel(channel, previous)); send(200, { sales_channel: decorate(channel) }); return;
        }
        if (!action && req.method === 'DELETE') {
          await mediaHandler.cleanupChannel(id);
          (await db.prepare('DELETE FROM sales_channels WHERE id = ?').run(id)); send(200, { deleted: true }); return;
        }
        throw httpError(405, 'Method not allowed.');
      }
      const scope = String(req.headers['x-sales-channel-id'] || url.searchParams.get('sales_channel_id') || 'all');
      if (scope !== 'all') (await channelById(scope));
      const writeScope = () => { if (scope === 'all') throw httpError(409, 'Select one website before making changes.'); };
      if (await mediaHandler({ route, method: req.method, scope, readBody: () => readBody(req), send })) return;
      const documentKinds = {
        '/admin-hub/styles': 'styles',
        '/admin-hub/v1/platform-checkout-settings': 'checkout',
        '/admin-hub/v1/product-page-settings': 'product_page',
        '/admin-hub/landing-page': 'landing_page',
      };
      if (documentKinds[route]) {
        const kind = documentKinds[route];
        if (req.method === 'GET') {
          if (scope === 'all') {
            const documents = (await db.prepare('SELECT channel_id, data FROM channel_documents WHERE kind = ?').all(kind)).map(row => ({ sales_channel_id: row.channel_id, ...JSON.parse(row.data) }));
            send(200, { sales_channels_documents: documents }); return;
          }
          const row = (await db.prepare('SELECT data FROM channel_documents WHERE channel_id = ? AND kind = ?').get(scope, kind));
          send(200, row ? JSON.parse(row.data) : (kind === 'styles' ? { styles: {} } : {})); return;
        }
        if (['PUT', 'PATCH', 'POST'].includes(req.method)) {
          writeScope(); const data = await readBody(req);
          delete data.sales_channel_id; delete data.seller_id;
          (await db.prepare('INSERT INTO channel_documents VALUES (?, ?, ?) ON CONFLICT(channel_id, kind) DO UPDATE SET data = excluded.data').run(scope, kind, JSON.stringify(data)));
          send(200, { ...data, sales_channel_id: scope }); return;
        }
      }
      if (route === '/admin-hub/seller-settings') {
        if (req.method === 'GET') {
          if (scope === 'all') { send(200, { sales_channels_settings: (await db.prepare('SELECT channel_id, data FROM channel_settings').all()).map(row => ({ sales_channel_id: row.channel_id, ...JSON.parse(row.data) })) }); return; }
          const row = (await db.prepare('SELECT data FROM channel_settings WHERE channel_id = ?').get(scope));
          send(200, { ...(row ? JSON.parse(row.data) : {}), sales_channel_id: scope }); return;
        }
        if (req.method === 'PATCH') {
          writeScope(); const body = await readBody(req);
          delete body.seller_id; delete body.sales_channel_id;
          const row = (await db.prepare('SELECT data FROM channel_settings WHERE channel_id = ?').get(scope));
          const data = { ...(row ? JSON.parse(row.data) : {}), ...body };
          (await db.prepare('INSERT INTO channel_settings VALUES (?, ?) ON CONFLICT(channel_id) DO UPDATE SET data = excluded.data').run(scope, JSON.stringify(data)));
          send(200, { ...data, sales_channel_id: scope }); return;
        }
      }
      const resourceRoute = route.match(/^\/(?:admin|admin-hub)(?:\/v1)?\/([a-z-]+)(?:\/([^/]+))?$/);
      if (resourceRoute && resources[resourceRoute[1]]) {
        const [, resource, id] = resourceRoute; const kind = resources[resource];
        // Storage keys and URLs can only be created by verified R2 publication.
        if (kind === 'media' && req.method !== 'GET') throw httpError(405, 'Use the scoped media upload endpoints.');
        const responseKey = resource === 'product-categories' ? 'product_categories' : resource.replace(/-/g, '_');
        if (req.method === 'GET' && !id) {
          const rows = scope === 'all' ? (await db.prepare('SELECT * FROM content WHERE kind = ?').all(kind)) : (await db.prepare('SELECT * FROM content WHERE kind = ? AND channel_id = ?').all(kind, scope));
          let items = rows.map(row => ({ ...JSON.parse(row.data), id: row.id, sales_channel_id: row.channel_id }));
          if (url.searchParams.get('q')) { const q = url.searchParams.get('q').toLowerCase(); items = items.filter(item => JSON.stringify(item).toLowerCase().includes(q)); }
          const count = items.length;
          const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
          const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get('limit')) || 1000));
          send(200, { [responseKey]: items.slice(offset, offset + limit), ...(kind === 'category' ? { categories: items.slice(offset, offset + limit) } : {}), count, offset, limit }); return;
        }
        const row = id ? (await db.prepare('SELECT * FROM content WHERE id = ? AND kind = ?').get(id, kind)) : null;
        if (id && (!row || (scope !== 'all' && row.channel_id !== scope))) throw httpError(404, 'Record not found in this website.');
        if (req.method === 'GET' && row) { send(200, { [kind]: { ...JSON.parse(row.data), id, sales_channel_id: row.channel_id } }); return; }
        writeScope();
        if (req.method === 'DELETE' && id) { (await db.prepare('DELETE FROM content WHERE id = ? AND channel_id = ?').run(id, scope)); send(200, { deleted: true }); return; }
        if ((req.method === 'POST' && !id) || (['PATCH', 'PUT'].includes(req.method) && id)) {
          const body = await readBody(req);
          const recordId = id || crypto.randomUUID();
          const data = { ...(row ? JSON.parse(row.data) : {}), ...body, id: recordId, sales_channel_id: scope, updated_at: new Date().toISOString() };
          if (!row) data.created_at = data.updated_at;
          // Reject references to records belonging to another website.
          const references = [data.parent_category_id, data.parent_id, data.collection_id, ...(Array.isArray(data.category_ids) ? data.category_ids : [])].filter(Boolean);
          for (const reference of references) {
            if (!(await db.prepare('SELECT id FROM content WHERE id = ? AND channel_id = ?').get(String(reference), scope))) throw httpError(400, 'Referenced content must belong to this website.');
          }
          const saved = await db.prepare('INSERT INTO content VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data WHERE content.channel_id = ? AND content.kind = ? AND content.data = ?').run(recordId, scope, kind, JSON.stringify(data), scope, kind, row?.data || null);
          if (!saved.changes) throw httpError(409, 'Content changed during this request. Reload and try again.');
          send(id ? 200 : 201, { [kind]: data }); return;
        }
      }
      // Removed marketplace/payment integrations are deliberately unavailable.
      throw httpError(501, 'This legacy feature has not been connected to the Trulo backend.');
    } catch (error) {
      const duplicate = error.code === '23505' || /UNIQUE constraint failed/.test(error.message);
      send(error.status || (duplicate ? 409 : 400), { message: duplicate ? 'This email or domain is already registered.' : error.message });
    }
  });
  server.database = db;
  return server;
}
if (require.main === module) {
  (async () => {
  try { process.loadEnvFile(path.join(__dirname, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const origins = (process.env.CMS_ALLOWED_ORIGINS || 'http://localhost:3002,http://127.0.0.1:3002').split(',').map(value => value.trim());
  const server = await createServer({ origins });
  server.listen(Number(process.env.PORT) || 9000, process.env.CMS_BIND_HOST || '127.0.0.1', () => console.log('Trulo CMS backend listening; no legacy data or integrations loaded.'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(async () => { await server.database.close(); process.exit(0); }));
  })().catch(() => { console.error('CMS initialization failed. Check database configuration.'); process.exitCode = 1; });
}
module.exports = { createServer, signToken, readToken };
