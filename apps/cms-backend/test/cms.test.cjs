const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openStore, createSuperuser } = require('../store.cjs');
const { createServer, readToken } = require('../server.cjs');
const { domainName, normalizeChannel, publicIp, verifyChannel } = require('../domain.cjs');

async function fixture(t, options = {}) {
  const db = openStore(':memory:');
  createSuperuser(db, 'admin@example.com', 'test-password-12345');
  const server = createServer({ db, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let token;
  async function request(route, { method = 'GET', body, scope = 'all', authenticated = true, headers = {} } = {}) {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', 'X-Sales-Channel-Id': scope, ...(token && authenticated ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }
  token = (await request('/admin-hub/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'test-password-12345' } })).body.token;
  return { request, db, token, server };
}

test('fresh database is empty; only signed superusers can access CMS', async t => {
  const { request, token, db } = await fixture(t);
  assert.equal((await request('/admin-hub/sales-channels', { authenticated: false })).status, 401);
  assert.deepEqual((await request('/admin-hub/sales-channels')).body.sales_channels, []);
  assert.deepEqual((await request('/admin-hub/products')).body.products, []);
  const me = await request('/admin-hub/auth/me');
  assert.equal(me.body.user.role, 'superuser'); assert.equal(me.body.user.is_superuser, true);
  const secret = db.prepare("SELECT value FROM secrets WHERE key = 'jwt'").get().value;
  assert.equal(readToken(token + 'tampered', secret), null);
  assert.equal((await request('/admin-hub/sales-channels', { headers: { Authorization: 'Bearer forged' } })).status, 401);
  assert.equal((await request('/admin-hub/auth/register', { method: 'POST', body: { email: 'seller@example.com', password: 'test-password-12345' }, authenticated: false })).status, 401);
});

test('website settings and content are isolated; All aggregates and rejects writes', async t => {
  const { request } = await fixture(t);
  const one = (await request('/admin-hub/sales-channels', { method: 'POST', body: { name: 'One', domain: 'one.example.com' } })).body.sales_channel;
  const two = (await request('/admin-hub/sales-channels', { method: 'POST', body: { name: 'Two', domain: 'two.example.com' } })).body.sales_channel;
  assert.equal(one.status, 'draft'); assert.equal(one.dns_records[0].type, 'TXT');
  assert.equal((await request('/admin-hub/seller-settings', { method: 'PATCH', body: { store_name: 'One store', seller_id: two.id, sales_channel_id: two.id }, scope: one.id })).status, 200);
  assert.equal((await request('/admin-hub/seller-settings', { scope: one.id })).body.store_name, 'One store');
  assert.equal((await request('/admin-hub/seller-settings', { scope: two.id })).body.store_name, undefined);
  const a = (await request('/admin-hub/products', { method: 'POST', body: { title: 'Product one' }, scope: one.id })).body.product;
  await request('/admin-hub/products', { method: 'POST', body: { title: 'Product two' }, scope: two.id });
  assert.equal((await request('/admin-hub/products', { scope: one.id })).body.products.length, 1);
  assert.equal((await request('/admin-hub/products')).body.products.length, 2);
  assert.equal((await request(`/admin-hub/products/${a.id}`, { scope: two.id })).status, 404);
  assert.equal((await request(`/admin-hub/products/${a.id}`, { method: 'PATCH', scope: two.id, body: { title: 'Attack' } })).status, 404);
  assert.equal((await request('/admin-hub/products', { method: 'POST', body: { title: 'No scope' } })).status, 409);
  assert.equal((await request('/admin-hub/seller-settings', { method: 'PATCH', body: { store_name: 'All edit' } })).status, 409);
  assert.equal((await request('/admin-hub/products', { scope: 'unknown' })).status, 404);
  assert.equal((await request('/admin-hub/products', { method: 'POST', scope: two.id, body: { parent_id: a.id } })).status, 400);
  assert.equal((await request('/admin-hub/seller-settings')).body.sales_channels_settings.length, 1);
});

test('duplicate domains are rejected and deleting a website cascades only its own data', async t => {
  const { request } = await fixture(t);
  const one = (await request('/admin-hub/sales-channels', { method: 'POST', body: { name: 'One', domain: 'one.example.com' } })).body.sales_channel;
  const two = (await request('/admin-hub/sales-channels', { method: 'POST', body: { name: 'Two', domain: 'two.example.com' } })).body.sales_channel;
  assert.equal((await request('/admin-hub/sales-channels', { method: 'POST', body: { name: 'Duplicate', domain: 'ONE.EXAMPLE.COM' } })).status, 409);
  for (const channel of [one, two]) {
    await request('/admin-hub/seller-settings', { method: 'PATCH', scope: channel.id, body: { store_name: channel.name } });
    await request('/admin-hub/products', { method: 'POST', scope: channel.id, body: { title: channel.name } });
  }
  assert.equal((await request(`/admin-hub/sales-channels/${one.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await request('/admin-hub/products')).body.products[0].sales_channel_id, two.id);
  assert.equal((await request('/admin-hub/seller-settings')).body.sales_channels_settings[0].sales_channel_id, two.id);
});

test('verification cannot activate a draft without checks and edits reset verification', async t => {
  const { request } = await fixture(t, { verify: async () => ({ status: 'active', verification_message: 'Verified by test double' }) });
  let channel = (await request('/admin-hub/sales-channels', { method: 'POST', body: { name: 'One', domain: 'one.example.com', record_type: 'A', target: '8.8.8.8', status: 'active' } })).body.sales_channel;
  assert.equal(channel.status, 'draft');
  const token = channel.verification_token;
  channel = (await request(`/admin-hub/sales-channels/${channel.id}/verify`, { method: 'POST' })).body.sales_channel;
  assert.equal(channel.status, 'active');
  channel = (await request(`/admin-hub/sales-channels/${channel.id}`, { method: 'PATCH', body: { target: '1.1.1.1', status: 'active' } })).body.sales_channel;
  assert.equal(channel.status, 'draft'); assert.notEqual(channel.verification_token, token); assert.equal(channel.checked_at, null);
});

test('verification failures remain pending and unavailable integrations fail explicitly', async t => {
  const { request } = await fixture(t, { verify: async () => { throw new Error('TXT missing'); } });
  const channel = (await request('/admin-hub/sales-channels', { method: 'POST', body: { name: 'One', domain: 'one.example.com' } })).body.sales_channel;
  const result = await request(`/admin-hub/sales-channels/${channel.id}/verify`, { method: 'POST' });
  assert.equal(result.body.sales_channel.status, 'pending_dns');
  assert.equal((await request('/admin-hub/v1/stripe-connect/status')).status, 501);
});

test('users can only be created as superusers and have no public password data', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('/admin-hub/users', { method: 'POST', body: { email: 'seller@example.com', password: 'password-123456', role: 'seller' } })).status, 400);
  assert.equal((await request('/admin-hub/users', { method: 'POST', body: { email: 'team@example.com', password: 'password-123456' } })).status, 201);
  const users = (await request('/admin-hub/users')).body.users;
  assert.equal(users.length, 2); assert.ok(users.every(user => user.role === 'superuser' && !user.password_hash));
});

test('DNS inputs reject private targets, paths, invalid labels and CNAME loops', () => {
  for (const domain of ['https://example.com', 'example.com/path', 'localhost', 'foo.local', '-bad.example.com', '127.0.0.1']) assert.throws(() => domainName(domain));
  assert.equal(domainName('WWW.Example.COM.'), 'www.example.com');
  for (const ip of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', '::ffff:127.0.0.1', '2001:db8::1']) assert.equal(publicIp(ip), false, ip);
  assert.equal(publicIp('8.8.8.8'), true);
  assert.equal(publicIp('2001:4860:4860::8888'), true);
  assert.equal(publicIp('2001:0db8::1'), false);
  assert.throws(() => normalizeChannel({ name: 'One', domain: 'one.example.com', record_type: 'A', target: '10.0.0.1' }));
  assert.throws(() => normalizeChannel({ name: 'One', domain: 'one.example.com', record_type: 'CNAME', target: 'one.example.com' }));
});

test('domain verification requires ownership, expected DNS and the HTTPS marker', async () => {
  const channel = { domain: 'one.example.com', target: '8.8.8.8', record_type: 'A', verification_token: 'ownership-token' };
  const resolver = { resolveTxt: async () => [['trulo-verification=', 'ownership-token']], resolve4: async () => ['8.8.8.8'], resolve6: async () => [], resolveCname: async () => ['hosting.example.com'] };
  assert.equal((await verifyChannel(channel, { resolver, marker: async () => true })).status, 'active');
  assert.equal((await verifyChannel(channel, { resolver, marker: async () => false })).status, 'dns_verified');
  assert.equal((await verifyChannel(channel, { resolver, marker: async () => { throw new Error('TLS failed'); } })).status, 'dns_verified');
  await assert.rejects(verifyChannel(channel, { resolver: { ...resolver, resolveTxt: async () => [['wrong-token']] }, marker: async () => true }), /TXT/);
  await assert.rejects(verifyChannel(channel, { resolver: { ...resolver, resolve4: async () => ['1.1.1.1'] }, marker: async () => true }), /DNS does not match/);
  let touchedPrivateTarget = false;
  await assert.rejects(verifyChannel(channel, { resolver: { ...resolver, resolve4: async () => ['127.0.0.1'] }, marker: async () => { touchedPrivateTarget = true; return true; } }), /public hosting/);
  assert.equal(touchedPrivateTarget, false);
  assert.equal((await verifyChannel({ ...channel, record_type: 'CNAME', target: 'hosting.example.com' }, { resolver, marker: async () => true })).status, 'active');
  await assert.rejects(verifyChannel({ ...channel, record_type: 'CNAME', target: 'wrong.example.com' }, { resolver, marker: async () => true }), /CNAME does not match/);
});

test('theme settings are scoped like website settings', async t => {
  const { request } = await fixture(t);
  const one = (await request('/admin-hub/sales-channels', { method: 'POST', body: { name: 'One', domain: 'one.example.com' } })).body.sales_channel;
  const two = (await request('/admin-hub/sales-channels', { method: 'POST', body: { name: 'Two', domain: 'two.example.com' } })).body.sales_channel;
  assert.equal((await request('/admin-hub/styles', { method: 'PUT', scope: one.id, body: { styles: { header: { color: 'blue' } } } })).status, 200);
  assert.equal((await request('/admin-hub/styles', { scope: one.id })).body.styles.header.color, 'blue');
  assert.deepEqual((await request('/admin-hub/styles', { scope: two.id })).body.styles, {});
  assert.equal((await request('/admin-hub/styles')).body.sales_channels_documents.length, 1);
  assert.equal((await request('/admin-hub/styles', { method: 'PUT', body: { styles: {} } })).status, 409);
});
