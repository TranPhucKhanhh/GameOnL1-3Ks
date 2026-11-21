import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startLocal, worldSeed } from './local-lib.mjs';
import { artifact, clients, run } from './lib.mjs';

// Runs the real Forge deployment scripts against disposable Anvil chains that pretend to be
// the Game L1 (chain 202611) and Fuji (43113). Nothing touches a public network.
const local = await startLocal({ gameChainId: 202611, vaultChainId: 43113, persistConfig: false });
try {
  const { config, accounts } = local;
  const env = { ...process.env, DEPLOYER: accounts[0], GAME_CHAIN_ID: '202611', DEMO_MODE: 'true', MAP_SIZE: '256',
    WORLD_SEED: worldSeed, GAME_BLOCKCHAIN_ID: config.game.blockchainId, ESCROW_BLOCKCHAIN_ID: config.vault.blockchainId,
    GAME_MESSENGER: config.game.messenger, ESCROW_MESSENGER: config.vault.messenger, USDC_ADDRESS: config.usdc };
  // --slow sends one transaction at a time and waits for each receipt: broadcasting them all at once
  // occasionally stalled forever against Anvil in CI. Each call gets 2 minutes so a stall fails fast.
  const forge = (script, rpc, extra = {}) => run('forge', ['script', `script/Deploy.s.sol:${script}`, '--rpc-url', rpc,
    '--sender', accounts[0], '--unlocked', '--broadcast', '--slow'], { env: { ...env, ...extra }, timeout: 120_000 });
  forge('DeployEscrow', config.vault.rpcUrl);
  forge('DeployGame', config.game.rpcUrl);
  const created = (id, name) => JSON.parse(readFileSync(`broadcast/Deploy.s.sol/${id}/run-latest.json`, 'utf8')).transactions
    .find(tx => tx.contractName === name && tx.transactionType === 'CREATE')?.contractAddress;
  const escrow = created(43113, 'RaidEscrow');
  const sea = created(202611, 'LanternSea');
  const raid = created(202611, 'BossRaid');
  assert.ok(escrow && sea && raid, 'Forge broadcast must contain all deployment addresses');
  forge('BindGamePeer', config.game.rpcUrl, { RAID_ADDRESS: raid, ESCROW_ADDRESS: escrow });
  forge('BindEscrowPeer', config.vault.rpcUrl, { RAID_ADDRESS: raid, ESCROW_ADDRESS: escrow });
  const g = clients({ ...config.game, chainId: 202611 });
  const v = clients({ ...config.vault, chainId: 43113 });
  const read = (c, a, name, fn) => c.public.readContract({ address: a, abi: artifact(name).abi, functionName: fn });
  assert.equal(await read(g, sea, 'LanternSea', 'demoMode'), true);
  assert.equal(await read(g, sea, 'LanternSea', 'worldSeed'), worldSeed);
  assert.notEqual(await read(g, sea, 'LanternSea', 'bossRaid'), '0x0000000000000000000000000000000000000000');
  assert.equal((await read(g, raid, 'BossRaid', 'peer')).toLowerCase(), escrow.toLowerCase());
  assert.equal((await read(v, escrow, 'RaidEscrow', 'peer')).toLowerCase(), raid.toLowerCase());
  assert.equal((await read(v, escrow, 'RaidEscrow', 'token')).toLowerCase(), config.usdc.toLowerCase());
  console.log('PASS: Forge DeployGame/DeployEscrow/Bind* scripts on disposable Anvil chains (202611 + 43113).');
} finally { local.stop(); }
