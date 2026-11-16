import assert from 'node:assert/strict';
import { startLocal } from './local-lib.mjs';
import { artifact, clients, write } from './lib.mjs';
const local = await startLocal();
try {
  const { config } = local;
  const player = local.accounts[1];
  const game = clients(config.game, player);
  const vault = clients(config.vault, player);
  const farmABI = artifact('Farm').abi;
  const vaultABI = artifact('TierVault').abi;
  const tokenABI = artifact('DemoUSD').abi;
  const read = (c, address, abi, functionName, args = []) => c.public.readContract({ address, abi, functionName, args });
  const plot = () => read(game, config.farm, farmABI, 'getPlot', [player, 0]);
  await write(vault, config.token, tokenABI, 'faucet');
  await write(vault, config.token, tokenABI, 'approve', [config.tierVault, 200_000000n]);
  await write(vault, config.tierVault, vaultABI, 'deposit', [200_000000n]);
  await write(game, config.farm, farmABI, 'plant', [0, 0, 100_000000n]);
  assert.equal((await plot()).status, 1, 'plant must await ACK');
  await local.relay();
  assert.equal((await plot()).status, 2);
  assert.equal(await read(vault, config.tierVault, vaultABI, 'credits', [player]), 100_000000n);
  // A real JSON-RPC time advance is local-only, never a contract backdoor.
  await write(game, config.farm, farmABI, 'harvest', [0]);
  await local.relay();
  assert.equal((await plot()).status, 2, 'early harvest must remain growing');
  await vault.public.request({ method: 'evm_increaseTime', params: [61] });
  await vault.public.request({ method: 'evm_mine', params: [] });
  await write(game, config.farm, farmABI, 'harvest', [0]);
  await local.relay();
  assert.equal((await plot()).status, 0);
  assert.equal(await read(game, config.farm, farmABI, 'harvestCount', [player]), 1n);
  assert.equal(await read(vault, config.tierVault, vaultABI, 'credits', [player]), 201_000000n);
  await write(game, config.farm, farmABI, 'plant', [0, 2, 100_000000n]);
  await local.relay();
  await write(game, config.farm, farmABI, 'uproot', [0]);
  await local.relay();
  assert.equal(await read(vault, config.tierVault, vaultABI, 'credits', [player]), 201_000000n);
  await write(vault, config.tierVault, vaultABI, 'withdraw', [201_000000n]);
  assert.equal(await read(vault, config.token, tokenABI, 'balanceOf', [player]), 1001_000000n);
  const totals = await Promise.all(['totalCredits', 'totalPrincipal', 'availableRewards', 'reservedRewards']
    .map(name => read(vault, config.tierVault, vaultABI, name)));
  assert.equal(await read(vault, config.token, tokenABI, 'balanceOf', [config.tierVault]), totals.reduce((a, b) => a + b));
  console.log('PASS: two Anvil chains, plant/ACK, early rejection, mature harvest, uproot, withdrawal and solvency.');
} finally { local.stop(); }
