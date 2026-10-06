const { spawnSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const path = require('node:path');
const files = readdirSync(__dirname).filter(file => file.endsWith('.test.cjs')).map(file => path.join(__dirname, file));
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit', env: { ...process.env, CMS_TEST_DATABASE: 'postgres' }, windowsHide: true });
process.exitCode = result.status ?? 1;
