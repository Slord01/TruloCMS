const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openStore, createSuperuser } = require('../store.cjs');
const { createServer } = require('../server.cjs');
const { imageMetadata, r2Configuration, createR2Storage, MAX_IMAGE_BYTES } = require('../r2-storage.cjs');
const { openTestStore } = require('./test-store.cjs');

test('uploads require superuser and website scope; publication, folders and deletion stay isolated', async t => {
  const db = await openTestStore();
  await createSuperuser(db, 'media@example.com', 'test-media-password-123');
  const deleted = [];
  let publications = 0;
  const server = await createServer({ db, storageFactory: () => ({
    async presign(channel, id) { return { key: `staging/${channel}/${id}`, upload_url: 'https://r2.example/signed', headers: { 'Content-Type': 'image/png' }, expires_in: 300 }; },
    async publish(pending) { publications++; return { object_key: `media/${pending.sales_channel_id}/${pending.id}.webp`, url: `https://media.example/${pending.id}.webp`, mime_type: 'image/webp', size: 32, width: 2, height: 2 }; },
    async delete(key) { deleted.push(key); },
  }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let token;
  async function request(route, { method = 'GET', body, scope = 'all', auth = true } = {}) {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', 'X-Sales-Channel-Id': scope, ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
  }
  token = (await request('/admin-hub/auth/login', { method: 'POST', body: { email: 'media@example.com', password: 'test-media-password-123' } })).body.token;
  const one = (await request('/admin-hub/sales-channels', { method: 'POST', body: { name: 'One', domain: 'one.example.com' } })).body.sales_channel;
  const two = (await request('/admin-hub/sales-channels', { method: 'POST', body: { name: 'Two', domain: 'two.example.com' } })).body.sales_channel;
  const image = { filename: 'photo.png', mime_type: 'image/png', size: 32 };
  const presign = '/admin-hub/v1/media/presign';
  assert.equal((await request(presign, { method: 'POST', body: image, scope: one.id, auth: false })).status, 401);
  assert.equal((await request(presign, { method: 'POST', body: image })).status, 409);
  assert.equal((await request(presign, { method: 'POST', body: { ...image, mime_type: 'image/svg+xml' }, scope: one.id })).status, 400);
  assert.equal((await request(presign, { method: 'POST', body: { ...image, size: MAX_IMAGE_BYTES + 1 }, scope: one.id })).status, 413);
  const folder = (await request('/admin-hub/v1/media/folders', { method: 'POST', body: { name: 'Images' }, scope: one.id })).body.folder;
  assert.equal((await request(presign, { method: 'POST', body: { ...image, folder_id: folder.id }, scope: two.id })).status, 404);
  const upload = await request(presign, { method: 'POST', body: { ...image, folder_id: folder.id }, scope: one.id });
  assert.equal(upload.status, 201);
  assert(!JSON.stringify(upload.body).includes('secret'));
  assert.equal((await request('/admin-hub/v1/media', { scope: one.id })).body.media.length, 0);
  assert.equal((await request('/admin-hub/v1/media/complete', { method: 'POST', body: { id: upload.body.id }, scope: two.id })).status, 404);
  const complete = await request('/admin-hub/v1/media/complete', { method: 'POST', body: { id: upload.body.id }, scope: one.id });
  assert.equal(complete.status, 201);
  assert.equal(complete.body.mime_type, 'image/webp');
  assert.equal(complete.body.folder_id, folder.id);
  assert.equal((await request('/admin-hub/v1/media/complete', { method: 'POST', body: { id: upload.body.id }, scope: one.id })).status, 200);
  assert.equal(publications, 1, 'completion retries must not publish twice');
  assert.equal((await request('/admin-hub/v1/media', { scope: two.id })).body.media.length, 0);
  const mediaRoute = `/admin-hub/v1/media/${upload.body.id}`;
  assert.equal((await request(mediaRoute, { method: 'PATCH', body: { object_key: 'media/other-site', url: 'https://evil.example' }, scope: one.id })).body.object_key, complete.body.object_key);
  assert.equal((await request(`/admin/media/${upload.body.id}`, { method: 'PATCH', body: { object_key: 'media/other-site' }, scope: one.id })).status, 405);
  assert.equal((await request(mediaRoute, { method: 'DELETE', scope: two.id })).status, 404);
  await request(`/admin-hub/v1/media/folders/${folder.id}`, { method: 'DELETE', scope: one.id });
  assert.equal((await request('/admin-hub/v1/media', { scope: one.id })).body.media[0].folder_id, null);
  assert.equal((await request(mediaRoute, { method: 'DELETE', scope: one.id })).status, 200);
  assert.deepEqual(deleted, [complete.body.object_key]);
  const secondUpload = (await request(presign, { method: 'POST', body: image, scope: one.id })).body;
  const secondMedia = (await request('/admin-hub/v1/media/complete', { method: 'POST', body: { id: secondUpload.id }, scope: one.id })).body;
  assert.equal((await request(`/admin-hub/sales-channels/${one.id}`, { method: 'DELETE' })).status, 200);
  assert(deleted.includes(secondMedia.object_key), 'website deletion removes its published image');
});

test('R2 configuration fails clearly and image upload metadata rejects unsafe files', () => {
  assert.throws(() => r2Configuration({}), /not configured/);
  assert.throws(() => imageMetadata({ filename: 'payload.svg', mime_type: 'image/svg+xml', size: 10 }), /Choose/);
  assert.throws(() => imageMetadata({ filename: 'photo.png', mime_type: 'image/png', size: -1 }), /15 MB/);
  assert.equal(imageMetadata({ filename: '../../photo.png', mime_type: 'image/png', size: 10 }).filename.includes('/'), false);
});

test('real R2 signing binds content type; publication decodes and sanitizes actual image bytes', async () => {
  const sharp = require('sharp');
  const original = await sharp({ create: { width: 12, height: 8, channels: 3, background: 'red' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const env = { R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'test-key', R2_SECRET_ACCESS_KEY: 'test-secret', R2_BUCKET_NAME: 'trulo-test-media', R2_PUBLIC_BASE_URL: 'https://media.example.com' };
  const operations = [];
  let stored;
  const storage = createR2Storage({ env, fetchImpl: async request => {
    operations.push({ method: request.method, path: new URL(request.url).pathname });
    assert.match(request.headers.get('authorization'), /^AWS4-HMAC-SHA256 /);
    if (request.method === 'GET') return new Response(original, { headers: { 'Content-Length': String(original.length) } });
    if (request.method === 'PUT') { stored = Buffer.from(await request.arrayBuffer()); assert.equal(request.headers.get('content-type'), 'image/webp'); }
    return new Response(null, { status: 204 });
  } });
  const upload = await storage.presign('website-one', 'upload-one', { mime_type: 'image/jpeg' });
  const url = new URL(upload.upload_url);
  assert.equal(url.hostname, `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
  assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
  assert(url.searchParams.get('X-Amz-SignedHeaders').split(';').includes('content-type'));
  assert(!upload.upload_url.includes(env.R2_SECRET_ACCESS_KEY));
  const published = await storage.publish({ key: upload.key, size: original.length, sales_channel_id: 'website-one' });
  assert.match(published.url, /^https:\/\/media\.example\.com\/media\/website-one\/.+\.webp$/);
  assert.notEqual(published.object_key, upload.key);
  const metadata = await sharp(stored).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 8); assert.equal(metadata.height, 12);
  assert.equal(metadata.exif, undefined);
  assert.deepEqual(operations.map(op => op.method), ['GET', 'PUT', 'DELETE']);
  assert.equal(operations[2].path, `/trulo-test-media/${upload.key}`);
});

test('fake/oversized images are removed without publication', async () => {
  const input = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>');
  const methods = [];
  const storage = createR2Storage({ env: { R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'test-key', R2_SECRET_ACCESS_KEY: 'test-secret', R2_BUCKET_NAME: 'trulo-test-media', R2_PUBLIC_BASE_URL: 'https://media.example.com' }, fetchImpl: async request => {
    methods.push(request.method);
    return request.method === 'GET' ? new Response(input, { headers: { 'Content-Length': String(input.length) } }) : new Response(null, { status: 204 });
  } });
  await assert.rejects(storage.publish({ key: 'staging/one/test', size: input.length, sales_channel_id: 'one' }), /valid supported image/);
  assert.deepEqual(methods, ['GET', 'DELETE']);
});
