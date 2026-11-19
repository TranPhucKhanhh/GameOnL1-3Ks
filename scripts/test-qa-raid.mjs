import assert from 'node:assert/strict';
import { parseUnits } from 'viem';
import { startLocal } from './local-lib.mjs';
import { artifact, clients, write } from './lib.mjs';

const local = await startLocal({ persistConfig: false });
try {
  const { config, accounts } = local;
  const abi = name => artifact(name).abi;
  const g = who => clients(config.game, who);
  const c = who => clients(config.vault, who);
  const readG = (address, name, fn, args = []) => g().public.readContract({ address, abi: abi(name), functionName: fn, args });
  const readC = (address, name, fn, args = []) => c().public.readContract({ address, abi: abi(name), functionName: fn, args });

  const [leadA, leadB, helper] = accounts.slice(1, 4);
  for (const who of [leadA, leadB, helper]) await write(g(who), config.sea, abi('LanternSea'), 'register');

  console.log('--- 1. Propose & Accept lead crew ---');
  let raidId = await readG(config.raid, 'BossRaid', 'currentRaidId');
  await write(g(leadA), config.raid, abi('BossRaid'), 'proposeLead', [leadB]);
  await write(g(leadB), config.raid, abi('BossRaid'), 'acceptLead', [raidId]);
  await local.relay();
  const escrowRaid1 = await readC(config.escrow, 'RaidEscrow', 'raids', [raidId]);
  assert.equal(Number(escrowRaid1[2]), 1, 'Escrow must be Open (Status 1)');
  console.log('✓ Escrow registered raid over relay');

  console.log('--- 2. Faucet, fund bounty & 100 USDC cap ---');
  for (const lead of [leadA, leadB]) {
    await write(c(lead), config.usdc, abi('MockUSDC'), 'faucet');
  }
  // Lead A funds 60 USDC
  await write(c(leadA), config.usdc, abi('MockUSDC'), 'approve', [config.escrow, parseUnits('60', 6)]);
  await write(c(leadA), config.escrow, abi('RaidEscrow'), 'fund', [raidId, parseUnits('60', 6)]);
  await local.relay();
  let l1Raid = await readG(config.raid, 'BossRaid', 'raidView', [raidId]);
  assert.equal(l1Raid.bounty, parseUnits('60', 6), 'L1 bounty should be 60 USDC');

  // Lead B funds 40 USDC
  await write(c(leadB), config.usdc, abi('MockUSDC'), 'approve', [config.escrow, parseUnits('40', 6)]);
  await write(c(leadB), config.escrow, abi('RaidEscrow'), 'fund', [raidId, parseUnits('40', 6)]);
  await local.relay();
  l1Raid = await readG(config.raid, 'BossRaid', 'raidView', [raidId]);
  assert.equal(l1Raid.bounty, parseUnits('100', 6), 'L1 bounty should be 100 USDC');

  // 100 USDC cap enforced: funding 1 more should revert
  await write(c(leadA), config.usdc, abi('MockUSDC'), 'approve', [config.escrow, parseUnits('1', 6)]);
  let capReverted = false;
  try {
    await write(c(leadA), config.escrow, abi('RaidEscrow'), 'fund', [raidId, parseUnits('1', 6)]);
  } catch (err) {
    capReverted = true;
  }
  assert.ok(capReverted, 'Funding over 100 USDC cap must revert');
  console.log('✓ 100 USDC cap enforced & bounty shown on L1');

  console.log('--- 3. Helper attacks & Lead crew combined power ---');
  const helperChargesBefore = (await readG(config.sea, 'LanternSea', 'captainView', [helper])).charges;
  await write(g(helper), config.raid, abi('BossRaid'), 'attack', [raidId]);
  const helperChargesAfter = (await readG(config.sea, 'LanternSea', 'captainView', [helper])).charges;
  assert.equal(helperChargesBefore - helperChargesAfter, 1, 'Helper must spend 1 charge');
  const [helpers, dmgs] = await readG(config.raid, 'BossRaid', 'helpersOf', [raidId]);
  assert.equal(helpers.length, 1);
  assert.equal(dmgs[0], 10n, 'Helper damage must be base power 10');
  console.log('✓ Helper attacked for 10 dmg (1 charge)');

  const baseCrewPower = await readG(config.shipyard, 'Shipyard', 'crewPower', [leadA, leadB]);
  assert.equal(baseCrewPower, 40n, 'Base combined crew power should be 40');
  console.log('✓ Base crew power is 40');

  console.log('--- 4. Upgrade ship and buy parts ---');
  // Impersonate raid module to give coins for testing upgrades
  await g().public.request({ method: 'anvil_setBalance', params: [config.raid, '0x1000000000000000000'] });
  await g().public.request({ method: 'anvil_impersonateAccount', params: [config.raid] });
  await write(clients(config.game, config.raid), config.sea, abi('LanternSea'), 'addCoins', [leadA, 25000n]);
  await write(clients(config.game, config.raid), config.sea, abi('LanternSea'), 'addCoins', [leadB, 25000n]);
  await g().public.request({ method: 'anvil_stopImpersonatingAccount', params: [config.raid] });

  // Lead A upgrades damage and mult, and buys parts
  for (let i = 0; i < 12; i++) {
    await write(g(leadA), config.shipyard, abi('Shipyard'), 'upgrade', [true]); // damage +5
    await write(g(leadA), config.shipyard, abi('Shipyard'), 'upgrade', [false]); // mult +10
  }
  await write(g(leadA), config.shipyard, abi('Shipyard'), 'buyPart', [2]); // Iron Hull (+50 dmg)
  await write(g(leadA), config.shipyard, abi('Shipyard'), 'buyPart', [6]); // Storm Sails (x1.2 power)
  await write(g(leadA), config.shipyard, abi('Shipyard'), 'buyPart', [9]); // Dragon Cannon (x1.5 power)
  await write(g(leadA), config.shipyard, abi('Shipyard'), 'buyPart', [12]); // Kraken Figurehead (x1.3 power)
  await write(g(leadA), config.shipyard, abi('Shipyard'), 'buyPart', [15]); // Lantern Banner (x1.1 power)

  // Lead B upgrades and buys parts too
  for (let i = 0; i < 12; i++) {
    await write(g(leadB), config.shipyard, abi('Shipyard'), 'upgrade', [true]);
    await write(g(leadB), config.shipyard, abi('Shipyard'), 'upgrade', [false]);
  }
  await write(g(leadB), config.shipyard, abi('Shipyard'), 'buyPart', [2]);
  await write(g(leadB), config.shipyard, abi('Shipyard'), 'buyPart', [6]);
  await write(g(leadB), config.shipyard, abi('Shipyard'), 'buyPart', [9]);
  await write(g(leadB), config.shipyard, abi('Shipyard'), 'buyPart', [12]);
  await write(g(leadB), config.shipyard, abi('Shipyard'), 'buyPart', [15]);

  const upgradedCrewPower = await readG(config.shipyard, 'Shipyard', 'crewPower', [leadA, leadB]);
  console.log(`✓ Crew power after upgrades & parts: ${upgradedCrewPower} (was 40)`);
  assert.ok(upgradedCrewPower > 6000n, 'Upgraded crew power can defeat any boss tier in one attack');

  console.log('--- 5. Boss defeated, settle, damage share, coins, claim ---');
  let rView = await readG(config.raid, 'BossRaid', 'raidView', [raidId]);
  console.log(`Boss HP before attack: ${rView.hp}`);
  while (rView.hp > 0n) {
    await write(g(leadA), config.raid, abi('BossRaid'), 'attack', [raidId]);
    rView = await readG(config.raid, 'BossRaid', 'raidView', [raidId]);
  }
  const rAfter = rView;
  console.log(`Boss HP after attack: ${rAfter.hp}, Status: ${rAfter.status} (3=Defeated)`);
  assert.equal(rAfter.status, 3, 'Boss must be defeated');

  const coinsABefore = (await readG(config.sea, 'LanternSea', 'captainView', [leadA])).coins;
  const coinsBBefore = (await readG(config.sea, 'LanternSea', 'captainView', [leadB])).coins;

  // Settle
  await write(g(helper), config.raid, abi('BossRaid'), 'settle', [raidId]);
  await local.relay();

  // Boss coins
  const coinsAAfter = (await readG(config.sea, 'LanternSea', 'captainView', [leadA])).coins;
  const coinsBAfter = (await readG(config.sea, 'LanternSea', 'captainView', [leadB])).coins;
  const bossCoins = (await readG(config.raid, 'BossRaid', 'bossOf', [raidId]))[2];
  assert.equal(coinsAAfter - coinsABefore, bossCoins / 2n, 'Lead A must get half of boss coins');
  assert.equal(coinsBAfter - coinsBBefore, bossCoins / 2n, 'Lead B must get half of boss coins');
  console.log(`✓ Leads received boss coins: +${bossCoins / 2n} each`);

  // Escrow payouts
  const totalDmg = rAfter.totalDamage; // 10 helper + 1490 leadA
  const bounty = 100_000000n;
  const helperExpected = (bounty * 10n) / totalDmg;
  const rest = bounty - helperExpected;
  const leadAExpected = (rest * 60_000000n) / bounty;
  const leadBExpected = rest - leadAExpected;

  const helperClaimable = await readC(config.escrow, 'RaidEscrow', 'claimable', [helper]);
  const leadAClaimable = await readC(config.escrow, 'RaidEscrow', 'claimable', [leadA]);
  const leadBClaimable = await readC(config.escrow, 'RaidEscrow', 'claimable', [leadB]);
  assert.equal(helperClaimable, helperExpected, 'Helper gets damage share');
  assert.equal(leadAClaimable, leadAExpected, 'Lead A gets remainder by deposit');
  assert.equal(leadBClaimable, leadBExpected, 'Lead B gets remainder by deposit');
  console.log(`✓ Helper paid damage share (${helperClaimable} USDC)`);
  console.log(`✓ Lead A refunded remainder (${leadAClaimable} USDC)`);
  console.log(`✓ Lead B refunded remainder (${leadBClaimable} USDC)`);

  // Claim
  const helperBalBefore = await readC(config.usdc, 'MockUSDC', 'balanceOf', [helper]);
  await write(c(helper), config.escrow, abi('RaidEscrow'), 'claim');
  const helperBalAfter = await readC(config.usdc, 'MockUSDC', 'balanceOf', [helper]);
  assert.equal(helperBalAfter - helperBalBefore, helperClaimable, 'Helper claim works');

  const leadABalBefore = await readC(config.usdc, 'MockUSDC', 'balanceOf', [leadA]);
  await write(c(leadA), config.escrow, abi('RaidEscrow'), 'claim');
  const leadABalAfter = await readC(config.usdc, 'MockUSDC', 'balanceOf', [leadA]);
  assert.equal(leadABalAfter - leadABalBefore, leadAClaimable, 'Lead A claim works');
  console.log('✓ Claim USDC works');

  console.log('--- 6. Boss survives 10-minute window -> full refund ---');
  // Advance to next epoch
  await g().public.request({ method: 'evm_increaseTime', params: [601] });
  await g().public.request({ method: 'evm_mine', params: [] });
  const raidId2 = await readG(config.raid, 'BossRaid', 'currentRaidId');

  await write(g(leadA), config.raid, abi('BossRaid'), 'proposeLead', [leadB]);
  await write(g(leadB), config.raid, abi('BossRaid'), 'acceptLead', [raidId2]);
  await local.relay();

  await write(c(leadA), config.usdc, abi('MockUSDC'), 'approve', [config.escrow, parseUnits('50', 6)]);
  await write(c(leadA), config.escrow, abi('RaidEscrow'), 'fund', [raidId2, parseUnits('50', 6)]);
  await local.relay();

  // Helper attacks, but boss survives
  await write(g(helper), config.raid, abi('BossRaid'), 'attack', [raidId2]);

  // Advance time past 10 minutes into epoch 3
  await g().public.request({ method: 'evm_increaseTime', params: [601] });
  await g().public.request({ method: 'evm_mine', params: [] });

  console.log('--- 7. "Settle last raid" works for the previous epoch ---');
  const raidId3 = await readG(config.raid, 'BossRaid', 'currentRaidId');
  assert.ok(raidId3 > raidId2, 'Current raid is in new epoch');

  // Settle last raid (raidId2)
  await write(g(helper), config.raid, abi('BossRaid'), 'settle', [raidId2]);
  await local.relay();

  const refundA = await readC(config.escrow, 'RaidEscrow', 'claimable', [leadA]);
  const helperClaim2 = await readC(config.escrow, 'RaidEscrow', 'claimable', [helper]);
  assert.equal(refundA, parseUnits('50', 6), '100% full refund on failed raid');
  assert.equal(helperClaim2, 0n, 'Helper gets nothing on failed raid');
  console.log('✓ Full refund given to funder on failed raid');
  console.log('✓ Settle last raid works for previous epoch');

  console.log('\n========================================');
  console.log('ALL 7 CHECKLIST ITEMS VERIFIED AND PASSING!');
  console.log('========================================');
} finally {
  local.stop();
}
