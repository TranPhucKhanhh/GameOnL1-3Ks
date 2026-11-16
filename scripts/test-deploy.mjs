import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startLocal } from './local-lib.mjs';
import { artifact, clients, run } from './lib.mjs';

// Check the actual Forge deployment scripts on disposable Anvil nodes, not public networks.
const local = await startLocal({ gameChainId: 202611, vaultChainId: 43113, persistConfig: false });
try {
  const { config, accounts } = local;
  const env = { ...process.env, DEPLOYER: accounts[0], GAME_CHAIN_ID: '202611',
    GAME_BLOCKCHAIN_ID: config.game.blockchainId, VAULT_BLOCKCHAIN_ID: config.vault.blockchainId,
    GAME_MESSENGER: config.game.messenger, VAULT_MESSENGER: config.vault.messenger, DEMO_MODE: 'true' };
  for (const [script, rpc] of [['DeployVault', config.vault.rpcUrl], ['DeployFarm', config.game.rpcUrl]]) {
    run('forge', ['script', `script/Deploy.s.sol:${script}`, '--rpc-url', rpc,
      '--sender', accounts[0], '--unlocked', '--broadcast'], { env });
  }
  const deployments = id => JSON.parse(readFileSync(`broadcast/Deploy.s.sol/${id}/run-latest.json`, 'utf8')).transactions;
  const address = (id, name) => deployments(id).find(tx => tx.contractName === name && tx.transactionType === 'CREATE')?.contractAddress;
  const farm = address(202611, 'Farm');
  const vault = address(43113, 'TierVault');
  const token = address(43113, 'DemoUSD');
  assert.ok(farm && vault && token, 'Forge broadcast must contain all deployment addresses');
  const g = clients({ ...config.game, chainId: 202611 });
  const v = clients({ ...config.vault, chainId: 43113 });
  const read = (c, a, abi, name, args = []) => c.public.readContract({ address: a, abi, functionName: name, args });
  assert.equal((await read(g, farm, artifact('Farm').abi, 'configurator')).toLowerCase(), accounts[0].toLowerCase());
  assert.equal(await read(v, vault, artifact('TierVault').abi, 'demoMode'), true);
  assert.equal((await read(v, vault, artifact('TierVault').abi, 'token')).toLowerCase(), token.toLowerCase());
  assert.equal(await read(v, token, artifact('DemoUSD').abi, 'balanceOf', [accounts[0]]), 1_000_000_000000n);
  console.log('PASS: actual Forge DeployVault/DeployFarm broadcasts and constructor settings on disposable Anvil test chains.');
} finally { local.stop(); }
