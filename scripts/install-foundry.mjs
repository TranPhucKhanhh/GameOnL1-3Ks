import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const version = 'v1.7.1';
const platforms = { win32: 'win32', linux: 'linux', darwin: 'darwin' };
const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
const os = platforms[process.platform];
if (!os || !arch) throw new Error('Unsupported platform; install Foundry manually: https://getfoundry.sh');
const name = `foundry_${version}_${os}_${arch}.${os === 'win32' ? 'zip' : 'tar.gz'}`;
const base = `https://github.com/foundry-rs/foundry/releases/download/${version}`;
const dir = resolve('.tools/foundry');
await mkdir(dir, { recursive: true });
async function download(url, path) {
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}
const archive = resolve(dir, name);
try { await access(archive); } catch { await download(`${base}/${name}`, archive); }
const checksumPath = `${archive}.sha256`;
await download(`${base}/${name.replace(/\.(zip|tar\.gz)$/, '')}.sha256`, checksumPath);
const expected = (await readFile(checksumPath, 'utf8')).trim().split(/\s+/)[0].toLowerCase();
const actual = createHash('sha256').update(await readFile(archive)).digest('hex');
if (actual !== expected) throw new Error('Foundry SHA-256 mismatch. Refusing to extract.');
execFileSync('tar', ['-xf', archive, '-C', dir], { stdio: 'inherit' });
execFileSync(resolve(dir, os === 'win32' ? 'forge.exe' : 'forge'), ['--version'], { stdio: 'inherit' });
console.log('Foundry installed in .tools/foundry; no global PATH changes.');
