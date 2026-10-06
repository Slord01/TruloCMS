import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { cmsProxy, getCmsBackendUrl } from '../packages/lib/cms-service.js';

test('binding lookup happens at request time; public proxy preserves authentication and scope', async () => {
  const previous = process.env.CMS_BACKEND_URL;
  const upstream = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ url: req.url, authorization: req.headers.authorization, scope: req.headers['x-sales-channel-id'], origin: req.headers.origin, method: req.method }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  try {
    process.env.CMS_BACKEND_URL = `http://127.0.0.1:${upstream.address().port}`;
    assert.equal(getCmsBackendUrl(), process.env.CMS_BACKEND_URL);
    const proxy = cmsProxy(['admin-hub']);
    const response = await proxy(new Request('https://cms.example/api/cms/admin-hub/websites?limit=3', {
      headers: { Authorization: 'Bearer example', 'X-Sales-Channel-Id': 'website-1', Origin: 'https://cms.example' },
    }), { params: Promise.resolve({ path: ['admin-hub', 'websites'] }) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { url: '/admin-hub/websites?limit=3', authorization: 'Bearer example', scope: 'website-1', method: 'GET' });
    for (const path of [['store', 'products'], ['admin-hub', '..'], ['admin-hub', 'x/y']]) {
      assert.equal((await proxy(new Request('https://cms.example/api/cms/x'), { params: { path } })).status, 404);
    }
  } finally {
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
    if (previous === undefined) delete process.env.CMS_BACKEND_URL;
    else process.env.CMS_BACKEND_URL = previous;
  }
});

test('Vercel requests fail closed without the injected service binding', () => {
  const previousUrl = process.env.CMS_BACKEND_URL;
  const previousVercel = process.env.VERCEL;
  try {
    delete process.env.CMS_BACKEND_URL;
    process.env.VERCEL = '1';
    assert.throws(getCmsBackendUrl, /binding/);
  } finally {
    if (previousUrl === undefined) delete process.env.CMS_BACKEND_URL; else process.env.CMS_BACKEND_URL = previousUrl;
    if (previousVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousVercel;
  }
});
