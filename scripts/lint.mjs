import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const errors = [];

for (const file of walk('test/browser').filter(f => f.endsWith('.mjs'))) {
  const src = readFileSync(file, 'utf8');
  if (/\bwaitForTimeout\s*\(/.test(src)) {
    errors.push(`${file}: use state assertions instead of waitForTimeout()`);
  }
}

for (const dir of ['web/src', 'test/browser', 'scripts']) {
  for (const file of walk(dir).filter(f => /\.(ts|js|mjs)$/.test(f))) {
    const src = readFileSync(file, 'utf8');
    if (/\[DEBUG-[a-z0-9]+\]/i.test(src)) errors.push(`${file}: leftover [DEBUG-*] instrumentation`);
    if (file.endsWith('.mjs')) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Lint passed.');
