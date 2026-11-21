import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAddress, zeroAddress, parseAbi } from 'viem';
import { artifact, clients } from './lib.mjs';

// Verifies a Fuji + Game L1 deployment and writes the public frontend config (no keys).
if (existsSync('.env')) process.loadEnvFile('.env');
function required(name) {
  const value = process.env[name];
  if (!value || value.includes('REPLACE')) throw new Error(`Set ${name} in .env or terminal first.`);
  return value;
}
function address(name) {
  const value = required(name);
  if (!isAddress(value) || value === zeroAddress) throw new Error(`Invalid address: ${name}`);
  return value;
}
function blockchainID(name) {
  const value = required(name);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value) || /^0x0+$/.test(value)) throw new Error(`${name} must be bytes32 hex (not EVM chain ID or CB58).`);
  return value;
}
const config = {
  mode: 'fuji-icm',
  demoMode: process.env.DEMO_MODE !== 'false',
  game: { chainId: Number(required('GAME_CHAIN_ID')), name: process.env.GAME_CHAIN_NAME || 'Lantern Sea L1', symbol: process.env.GAME_GAS_SYMBOL || 'TIDE',
    rpcUrl: required('GAME_RPC_URL'), blockchainId: blockchainID('GAME_BLOCKCHAIN_ID'), messenger: address('GAME_MESSENGER'),
    ...(process.env.GAME_EXPLORER_URL ? { explorerUrl: process.env.GAME_EXPLORER_URL } : {}) },
  vault: { chainId: 43113, name: 'Avalanche Fuji C-Chain', symbol: 'AVAX', rpcUrl: required('FUJI_RPC_URL'),
    blockchainId: blockchainID('ESCROW_BLOCKCHAIN_ID'), messenger: address('ESCROW_MESSENGER'), explorerUrl: 'https://testnet.snowtrace.io' },
  sea: address('SEA_ADDRESS'), coop: address('COOP_ADDRESS'), shipyard: address('SHIPYARD_ADDRESS'),
  raid: address('RAID_ADDRESS'), escrow: address('ESCROW_ADDRESS'), usdc: address('USDC_ADDRESS')
};
// The app reads the game's event history from the deploy block (public RPCs cap a log query's block range).
// GAME_START_BLOCK wins; else the earliest block in Forge's DeployGame receipts.
{
  let start = process.env.GAME_START_BLOCK ? Number(process.env.GAME_START_BLOCK) : undefined;
  const receipts = `broadcast/Deploy.s.sol/${config.game.chainId}/run-latest.json`;
  if (start === undefined && existsSync(receipts)) {
    const blocks = JSON.parse(readFileSync(receipts, 'utf8')).receipts.map(r => Number(r.blockNumber));
    if (blocks.length) start = Math.min(...blocks);
  }
  if (start !== undefined && Number.isSafeInteger(start) && start >= 0) config.game.startBlock = start;
  else console.warn('No GAME_START_BLOCK and no DeployGame receipts: the app will read only recent game events.');
}
if (!Number.isSafeInteger(config.game.chainId) || config.game.chainId <= 0 || [1, 43113, 43114].includes(config.game.chainId)) {
  throw new Error('GAME_CHAIN_ID must be your separate test Game L1.');
}
for (const n of [config.game, config.vault]) {
  const url = new URL(n.rpcUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('RPC URLs must be public HTTPS endpoints without credentials (phones need HTTPS).');
}
const game = clients(config.game), fuji = clients(config.vault);
const warp = '0x0200000000000000000000000000000000000005';
const warpABI = parseAbi(['function getBlockchainID() view returns (bytes32)']);
for (const [c, n, contracts] of [[game, config.game, [config.sea, config.coop, config.shipyard, config.raid]], [fuji, config.vault, [config.escrow, config.usdc]]]) {
  if (await c.public.getChainId() !== n.chainId) throw new Error(`Wrong RPC chain ID: ${n.name}`);
  for (const a of [...contracts, n.messenger]) {
    if (!(await c.public.getCode({ address: a }))) throw new Error(`No contract bytecode: ${a} on ${n.name}`);
  }
  const id = await c.public.readContract({ address: warp, abi: warpABI, functionName: 'getBlockchainID' });
  if (id.toLowerCase() !== n.blockchainId.toLowerCase()) throw new Error(`Wrong Warp blockchain ID: ${n.name}; actual ${id}`);
}
const read = (c, a, name, fn) => c.public.readContract({ address: a, abi: artifact(name).abi, functionName: fn });
const checks = [
  [await read(game, config.sea, 'LanternSea', 'coopSail'), config.coop, 'Sea -> CoopSail module'],
  [await read(game, config.sea, 'LanternSea', 'shipyard'), config.shipyard, 'Sea -> Shipyard module'],
  [await read(game, config.sea, 'LanternSea', 'bossRaid'), config.raid, 'Sea -> BossRaid module'],
  [await read(game, config.raid, 'BossRaid', 'peer'), config.escrow, 'BossRaid peer'],
  [await read(fuji, config.escrow, 'RaidEscrow', 'peer'), config.raid, 'Escrow peer'],
  [await read(game, config.raid, 'BossRaid', 'peerBlockchainID'), config.vault.blockchainId, 'BossRaid destination'],
  [await read(fuji, config.escrow, 'RaidEscrow', 'peerBlockchainID'), config.game.blockchainId, 'Escrow destination'],
  [await read(game, config.raid, 'BossRaid', 'messenger'), config.game.messenger, 'Game messenger'],
  [await read(fuji, config.escrow, 'RaidEscrow', 'messenger'), config.vault.messenger, 'Escrow messenger'],
  [await read(fuji, config.escrow, 'RaidEscrow', 'token'), config.usdc, 'Escrow token']
];
for (const [actual, expected, label] of checks) if (actual.toLowerCase() !== expected.toLowerCase()) throw new Error(`${label} mismatch.`);
config.worldSeed = await read(game, config.sea, 'LanternSea', 'worldSeed');
config.mapSize = Number(await read(game, config.sea, 'LanternSea', 'mapSize'));
config.demoMode = await read(game, config.sea, 'LanternSea', 'demoMode');
await mkdir('web/public', { recursive: true });
await writeFile('web/public/config.json', JSON.stringify(config, null, 2) + '\n');
console.log('Verified RPCs, Warp IDs, bytecode, modules, peers, messengers and token. Wrote web/public/config.json (no keys).');
console.log('Still required: run your ICM relayer and do one real raid round trip (open -> fund -> settle) before the demo.');
