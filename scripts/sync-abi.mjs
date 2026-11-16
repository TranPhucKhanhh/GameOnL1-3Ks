import { mkdir, writeFile } from 'node:fs/promises';
import { artifact } from './lib.mjs';
await mkdir('web/src/generated', { recursive: true });
for (const name of ['Farm', 'TierVault', 'DemoUSD']) {
  await writeFile(`web/src/generated/${name}.json`, JSON.stringify(artifact(name).abi, null, 2) + '\n');
}
console.log('Synced contract ABIs to web/src/generated.');
