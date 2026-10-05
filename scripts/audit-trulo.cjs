const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const skip = new Set(['node_modules', '.git', '.next', '.turbo', '.agents', '.codex', '.aws', 'artifacts']);
const issues = [];
const brand = new RegExp(['ander', 'tal', '|belu', 'cha'].join(''), 'i');
const credentials = /(?:sk_live_|sk_test_|AKIA[A-Z0-9]{16}|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@)/;
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) { walk(filename); continue; }
    const relative = path.relative(root, filename);
    if (brand.test(entry.name)) issues.push(`${relative}: legacy filename`);
    if (!/\.(?:js|jsx|cjs|mjs|ts|tsx|json|jsonl|md|txt|css|html|yml|yaml|csv|py)$/.test(filename) && !entry.name.startsWith('.env')) continue;
    const text = fs.readFileSync(filename, 'utf8');
    // Preserve the user's original task wording, including the names to remove.
    if (relative !== path.join('docs', 'TASKS.md') && brand.test(text)) issues.push(`${relative}: legacy branding`);
    if (filename !== __filename && credentials.test(text)) issues.push(`${relative}: credential/connection value`);
    if (entry.name.startsWith('.env')) {
      for (const match of text.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=([^\r\n]*)/gm)) {
        if (match[2].trim()) issues.push(`${relative}: nonempty ${match[1]}`);
      }
    }
  }
}
walk(root);
if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
else console.log('PASS: no legacy branding, detected credentials, or populated environment files in implementation/configuration files. Original task wording preserved.');
