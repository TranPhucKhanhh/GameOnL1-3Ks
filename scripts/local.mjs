import { spawn } from 'node:child_process';
import { startLocal } from './local-lib.mjs';
const local = await startLocal();
const interval = setInterval(() => local.relay().catch(console.error), 500);
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'web', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
  { stdio: 'inherit', windowsHide: true });
local.children.push(vite);
function shutdown() { clearInterval(interval); local.stop(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
vite.on('exit', shutdown);
vite.on('error', error => { console.error(error); shutdown(); });
console.log('\nLOCAL DEMO: mock messenger, accelerated 60/120/180-second terms, test tokens.');
console.log('Open http://127.0.0.1:5173. RPCs: 8545 (game), 9545 (vault).');
console.log('For a wallet import the standard ANVIL TEST account #1 from README; never use it on public networks.');
console.log('Ctrl+C stops both Anvil nodes and the frontend. State resets on each start.\n');
