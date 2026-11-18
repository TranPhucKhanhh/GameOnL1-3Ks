import { spawn } from 'node:child_process';
import { startLocal } from './local-lib.mjs';
const lan = process.argv.includes('--lan');
const local = await startLocal();
const interval = setInterval(() => local.relay().catch(console.error), 500);
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'web', '--host', lan ? '0.0.0.0' : '127.0.0.1', '--port', '5173', '--strictPort'],
  { stdio: 'inherit', windowsHide: true });
local.children.push(vite);
function shutdown() { clearInterval(interval); local.stop(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
vite.on('exit', shutdown);
vite.on('error', error => { console.error(error); shutdown(); });
console.log('\nLOCAL DEMO: mock messenger, DEMO TIME (1 charge per minute, 10-minute bosses), test tokens only.');
console.log(`Open http://127.0.0.1:5173${lan ? ' (also reachable on your LAN IP, port 5173)' : ''}. Browser RPC goes through /rpc/game and /rpc/cchain.`);
console.log('Each browser tab can use its own local guest wallet: two tabs = two captains. Never reuse local keys on public networks.');
console.log('Ctrl+C stops both Anvil nodes and the frontend. State resets on each start.\n');
