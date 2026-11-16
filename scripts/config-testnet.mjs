import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAddress, zeroAddress, parseAbi } from 'viem';
import { artifact, clients } from './lib.mjs';

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
  game: { chainId: Number(required('GAME_CHAIN_ID')), name: 'DeFi Farm Game L1', symbol: process.env.GAME_GAS_SYMBOL || 'GAME',
    rpcUrl: required('GAME_RPC_URL'), blockchainId: blockchainID('GAME_BLOCKCHAIN_ID'), messenger: address('GAME_MESSENGER'),
    ...(process.env.GAME_EXPLORER_URL ? { explorerUrl: process.env.GAME_EXPLORER_URL } : {}) },
  vault: { chainId: 43113, name: 'Avalanche Fuji C-Chain', symbol: 'AVAX', rpcUrl: required('FUJI_RPC_URL'),
    blockchainId: blockchainID('VAULT_BLOCKCHAIN_ID'), messenger: address('VAULT_MESSENGER'), explorerUrl: 'https://testnet.snowtrace.io' },
  farm: address('FARM_ADDRESS'), tierVault: address('VAULT_ADDRESS'), token: address('TOKEN_ADDRESS')
};
if (!Number.isSafeInteger(config.game.chainId) || config.game.chainId <= 0 || [1, 43113, 43114].includes(config.game.chainId)) throw new Error('GAME_CHAIN_ID must be your separate test Game L1.');
for (const n of [config.game, config.vault]) {
  const url = new URL(n.rpcUrl);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('RPC URLs must be HTTP(S) public endpoints without embedded credentials.');
}
const game = clients(config.game), vault = clients(config.vault);
const warp = '0x0200000000000000000000000000000000000005';
const warpABI = parseAbi(['function getBlockchainID() view returns (bytes32)']);
for (const [c, n, contract] of [[game, config.game, config.farm], [vault, config.vault, config.tierVault]]) {
  if (await c.public.getChainId() !== n.chainId) throw new Error(`Wrong RPC chain ID: ${n.name}`);
  for (const a of [contract, n.messenger]) {
    if (!(await c.public.getCode({ address: a }))) throw new Error(`No contract bytecode: ${a} on ${n.name}`);
  }
  const id = await c.public.readContract({ address: warp, abi: warpABI, functionName: 'getBlockchainID' });
  if (id.toLowerCase() !== n.blockchainId.toLowerCase()) throw new Error(`Wrong Warp blockchain ID: ${n.name}; actual ${id}`);
}
const read = (c, a, name, args = []) => c.public.readContract({ address: a, abi: artifact(c === game ? 'Farm' : 'TierVault').abi, functionName: name, args });
const checks = [
  [await read(game, config.farm, 'peer'), config.tierVault, 'Farm peer'],
  [await read(vault, config.tierVault, 'peer'), config.farm, 'Vault peer'],
  [await read(game, config.farm, 'peerBlockchainID'), config.vault.blockchainId, 'Farm destination'],
  [await read(vault, config.tierVault, 'peerBlockchainID'), config.game.blockchainId, 'Vault destination'],
  [await read(game, config.farm, 'messenger'), config.game.messenger, 'Game messenger'],
  [await read(vault, config.tierVault, 'messenger'), config.vault.messenger, 'Vault messenger'],
  [await read(vault, config.tierVault, 'token'), config.token, 'Vault token']
];
for (const [actual, expected, label] of checks) if (actual.toLowerCase() !== expected.toLowerCase()) throw new Error(`${label} mismatch.`);
if (await vault.public.readContract({ address: config.token, abi: artifact('DemoUSD').abi, functionName: 'symbol' }) !== 'dUSD') throw new Error('This demo UI requires DemoUSD, not real USDC.');
await mkdir('web/public', { recursive: true });
await writeFile('web/public/config.json', JSON.stringify(config, null, 2) + '\n');
console.log('Verified both RPCs, Warp IDs, bytecode, peers, messengers and demo token. Wrote public config.json (no signing keys).');
console.log('Still required: verify official messenger deployment and run a real round trip with your ICM relayer.');
