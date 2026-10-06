const { chromium, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { openStore, createSuperuser } = require('../apps/cms-backend/store.cjs');
const { createServer } = require('../apps/cms-backend/server.cjs');

async function freePort(port) {
  const socket = net.createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => socket.close(resolve));
}
async function main() {
  await freePort(9000); await freePort(3002);
  const db = (await openStore(':memory:'));
  const password = require('node:crypto').randomBytes(24).toString('base64url');
  (await createSuperuser(db, 'smoke@example.com', password));
  const uploaded = new Map();
  const backend = await createServer({ db, storageFactory: () => ({
    async presign(channel, id, metadata) { return { key: `staging/${channel}/${id}`, upload_url: `https://uploads.example.com/${id}`, headers: { 'Content-Type': metadata.mime_type }, expires_in: 300 }; },
    async publish(pending) {
      assert.equal(uploaded.get(pending.id)?.length, pending.size);
      return { object_key: `media/${pending.sales_channel_id}/${pending.id}.webp`, url: `https://media.example.com/${pending.id}.webp`, mime_type: 'image/webp', size: pending.size, width: 1, height: 1 };
    },
    async delete() {},
  }) });
  await new Promise(resolve => backend.listen(9000, '127.0.0.1', resolve));
  const frontend = spawn(process.execPath, [path.resolve('node_modules/next/dist/bin/next'), 'start', '-p', '3002'], { cwd: path.resolve('apps/sellercentral'), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let output = ''; frontend.stdout.on('data', chunk => { output += chunk; }); frontend.stderr.on('data', chunk => { output += chunk; });
  let browser;
  try {
    let available = false;
    for (let index = 0; index < 60; index++) {
      try { available = (await fetch('http://localhost:3002/en/login')).ok; if (available) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!available) throw new Error(`Frontend did not start: ${output.slice(-3000)}`);
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage();
    await page.route('https://uploads.example.com/**', async route => {
      const request = route.request();
      if (request.method() === 'PUT') {
        assert.equal(request.headers().authorization, undefined);
        assert.equal(request.headers()['x-sales-channel-id'], undefined);
        assert.equal(request.headers().cookie, undefined);
        uploaded.set(new URL(request.url()).pathname.slice(1), request.postDataBuffer());
      }
      await route.fulfill({ status: request.method() === 'OPTIONS' ? 204 : 200, headers: { 'Access-Control-Allow-Origin': 'http://localhost:3002', 'Access-Control-Allow-Methods': 'PUT', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' });
    });
    await page.route('https://media.example.com/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64') }));
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://localhost:3002/en/login');
    await page.locator('input[type="email"]').fill('smoke@example.com');
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/dashboard', { timeout: 30000 });
    await page.goto('http://localhost:3002/en/sales-channels');
    for (const name of ['Website one', 'Website two']) {
      await page.getByRole('button', { name: 'Add website', exact: true }).click();
      await page.getByLabel('Website name', { exact: true }).fill(name);
      await page.getByLabel('Domain', { exact: true }).fill(name === 'Website one' ? 'one.example.com' : 'two.example.com');
      await page.getByRole('button', { name: 'Save', exact: true }).last().click();
      await page.getByRole('heading', { name, exact: true }).waitFor();
    }
    await page.getByRole('button', { name: /Trulo GmbH/ }).first().click();
    await page.locator('.Polaris-ActionList__Item').filter({ hasText: /^All$/ }).waitFor();
    await page.locator('.Polaris-ActionList__Item').filter({ hasText: /^Website two$/ }).waitFor();
    await page.locator('.Polaris-ActionList__Item').filter({ hasText: /^Website one$/ }).click();
    await page.getByText('Superuser · Website one', { exact: true }).waitFor();
    await page.goto('http://localhost:3002/en/content/media');
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'smoke.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64') });
    await page.getByText('smoke.png', { exact: true }).first().waitFor();
    assert.equal(uploaded.size, 1);
    const uploadedRow = await db.prepare('SELECT * FROM content WHERE kind = ?').get('media');
    assert.equal(uploadedRow.channel_id, (await db.prepare('SELECT id FROM sales_channels WHERE domain = ?').get('one.example.com')).id);
    await page.goto('http://localhost:3002/en/settings/general');
    await page.getByLabel('Website display name', { exact: true }).fill('One settings');
    await page.getByRole('button', { name: 'Save', exact: true }).last().click();
    await page.getByText('Website settings saved.', { exact: true }).waitFor();
    await page.goto('http://localhost:3002/en/sales-channels');
    const channels = (await db.prepare('SELECT data FROM sales_channels').all()).map(row => JSON.parse(row.data));
    const one = channels.find(channel => channel.name === 'Website one');
    const two = channels.find(channel => channel.name === 'Website two');
    await page.getByLabel('Website', { exact: true }).selectOption(two.id);
    await page.goto('http://localhost:3002/en/settings/general');
    assert.equal(await page.getByLabel('Website display name', { exact: true }).inputValue(), '');
    await page.goto('http://localhost:3002/en/sales-channels');
    await page.getByLabel('Website', { exact: true }).selectOption(one.id);
    await page.goto('http://localhost:3002/en/settings/general');
    await page.getByLabel('Website display name', { exact: true }).waitFor();
    await expect(page.getByLabel('Website display name', { exact: true })).toHaveValue('One settings');
    await page.getByRole('button', { name: /Trulo GmbH|One settings/ }).first().click();
    await page.locator('.Polaris-ActionList__Item').filter({ hasText: /^All$/ }).click();
    await page.getByRole('heading', { name: 'All website settings', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Website display name', { exact: true }).count(), 0);
    const screenshotDir = path.resolve('e2e/artifacts'); fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'trulo-all-websites.png'), fullPage: true });
    assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
    console.log('PASS: login, two websites, profile selector, signed direct image upload without token leakage, scoped settings persistence and All read-only overview. No browser errors.');
  } catch (error) {
    console.error(error); process.exitCode = 1;
    if (browser) { const page = browser.contexts()[0]?.pages()[0]; if (page) { fs.mkdirSync('e2e/artifacts', { recursive: true }); await page.screenshot({ path: 'e2e/artifacts/trulo-failure.png', fullPage: true }).catch(() => {}); console.error((await page.locator('body').innerText()).slice(-1800)); } }
  } finally {
    if (browser) await browser.close();
    frontend.kill();
    await new Promise(resolve => backend.close(resolve)); (await db.close());
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
