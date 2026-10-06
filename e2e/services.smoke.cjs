const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const { once } = require('node:events');

async function main() {
  const upstream = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ path: req.url, binding: true }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const children = [];
  try {
    for (const [index, app] of ['shop', 'affiliate', 'developer'].entries()) {
      const port = 3210 + index;
      const child = spawn(process.execPath, [path.resolve('node_modules/next/dist/bin/next'), 'start', '-p', String(port)], {
        cwd: path.resolve(`apps/${app}`), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, CMS_BACKEND_URL: `http://127.0.0.1:${upstream.address().port}` },
      });
      children.push(child);
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { output += chunk; });
      const origin = `http://127.0.0.1:${port}`;
      let response;
      for (let attempt = 0; attempt < 40; attempt++) {
        try { response = await fetch(`${origin}/${app}/`, { redirect: 'manual' }); break; } catch {}
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      assert(response, `${app} failed to start: ${output.slice(-2000)}`);
      const location = response.headers.get('location');
      if (location) {
        const pathname = new URL(location, origin).pathname;
        assert(pathname === `/${app}` || pathname.startsWith(`/${app}/`), `${app} redirect escaped its prefix: ${location}`);
      }
      const page = await fetch(`${origin}/${app}/en/login`);
      assert.equal(page.status, 200, `${app} login route`);
      const html = await page.text();
      const asset = html.match(new RegExp(`src="(/${app}/_next/[^" ]+\\.js[^" ]*)"`));
      assert(asset, `${app} must serve assets below its public prefix`);
      assert.equal((await fetch(origin + asset[1].replaceAll('&amp;', '&'))).status, 200);
      const namespace = app === 'shop' ? 'store' : `${app}-api`;
      const proxy = await fetch(`${origin}/${app}/api/cms/${namespace}/test?scope=one`);
      assert.equal(proxy.status, 200);
      assert.deepEqual(await proxy.json(), { path: `/${namespace}/test?scope=one`, binding: true });
      assert.equal((await fetch(`${origin}/${app}/api/cms/admin-hub/users`)).status, 404);
      console.log(`${app}: public prefix, login, assets, runtime binding, namespace isolation passed`);
    }
  } finally {
    for (const child of children) child.kill();
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
