import assert from 'node:assert/strict';
import { toHex } from 'viem';
import { startLocal, worldSeed } from './local-lib.mjs';
import { artifact, clients, write } from './lib.mjs';
import { route, directionCount, homeOf, decodeBoard } from '../web/src/world.js';
import { walk, voyageSeed, solution } from './puzzle-walk.mjs';

const local = await startLocal({ persistConfig: false });
try {
  const { config, accounts } = local;
  const abi = name => artifact(name).abi;
  const g = who => clients(config.game, who);
  const c = who => clients(config.vault, who);
  const readG = (address, name, fn, args = []) => g().public.readContract({ address, abi: abi(name), functionName: fn, args });
  const readC = (address, name, fn, args = []) => c().public.readContract({ address, abi: abi(name), functionName: fn, args });
  const mapSize = 256;

  // 1. The browser's hash geometry must match the contract exactly.
  for (let island = 0; island < 40; island++) {
    const n = directionCount(worldSeed, island);
    assert.equal(Number(await readG(config.sea, 'LanternSea', 'directionCount', [island])), n, `lanes ${island}`);
    for (let d = 0; d < n; d++) {
      const [to, cost] = await readG(config.sea, 'LanternSea', 'route', [island, d]);
      const js = route(worldSeed, mapSize, island, d);
      assert.deepEqual([Number(to), Number(cost)], [js.to, js.cost], `route ${island}/${d}`);
    }
  }

  // 2. Register captains; find one whose home has a co-op lane and one with a solo lane.
  const pool = accounts.slice(1, 10);
  const lanesOf = who => {
    const home = homeOf(worldSeed, mapSize, who);
    return Array.from({ length: directionCount(worldSeed, home) }, (_, dir) => ({ home, dir, ...route(worldSeed, mapSize, home, dir) }));
  };
  const leader = pool.find(who => lanesOf(who).some(l => l.coop));
  assert.ok(leader, 'test pool must include a home with a co-op lane');
  const partner = pool.find(who => who !== leader);
  const sailor = pool.find(who => who !== leader && who !== partner && lanesOf(who).some(l => !l.coop));
  assert.ok(sailor, 'test pool must include a home with a solo lane');
  const helper = pool.find(who => who !== leader && who !== partner);
  for (const who of new Set([leader, sailor, partner, helper])) await write(g(who), config.sea, abi('LanternSea'), 'register');
  assert.equal(Number((await readG(config.sea, 'LanternSea', 'captainView', [leader])).home), homeOf(worldSeed, mapSize, leader));

  // 3. Solo sail.
  const solo = lanesOf(sailor).find(l => !l.coop);
  await write(g(sailor), config.sea, abi('LanternSea'), 'sail', [solo.home, solo.dir]);
  assert.ok(await readG(config.sea, 'LanternSea', 'visited', [sailor, solo.to]), 'solo sail must visit');

  // 4. Co-op voyage: two captains pool charges and both solve their sliding puzzles on-chain.
  const lane = lanesOf(leader).find(l => l.coop);
  const proposal = await write(g(leader), config.coop, abi('CoopSail'), 'propose', [partner, lane.home, lane.dir, 2]);
  const id = await readG(config.coop, 'CoopSail', 'voyageCount');
  assert.ok(proposal);
  await write(g(partner), config.coop, abi('CoopSail'), 'join', [id]);
  const voyage = await readG(config.coop, 'CoopSail', 'voyages', [id]);
  const startedAt = voyage[8];
  const depth = await readG(config.coop, 'CoopSail', 'scrambleDepth');
  for (const who of [leader, partner]) {
    const seed = voyageSeed(config.coop, id, startedAt, who);
    const { cells, path } = walk(seed, Number(depth));
    const board = await readG(config.coop, 'CoopSail', 'puzzleOf', [id, who]);
    assert.deepEqual(decodeBoard(board), cells, 'JS board must match contract board');
    const moves = toHex(Uint8Array.from(solution(path)));
    await write(g(who), config.coop, abi('CoopSail'), 'solve', [id, moves]);
  }
  assert.equal(Number((await readG(config.coop, 'CoopSail', 'voyages', [id]))[7]), 3, 'voyage must land');
  assert.ok(await readG(config.sea, 'LanternSea', 'visited', [partner, lane.to]));

  // 5. Parley: the partner signs a short-lived code, the leader submits it.
  const block = await g().public.getBlock();
  const expiry = block.timestamp + 60n;
  const digest = await readG(config.sea, 'LanternSea', 'parleyDigest', [partner, expiry]);
  const signature = await g(partner).wallet.signMessage({ message: { raw: digest } });
  await write(g(helper), config.sea, abi('LanternSea'), 'parley', [partner, expiry, signature]);
  assert.ok(await readG(config.sea, 'LanternSea', 'parleyActive', [partner, helper]));

  // 6. Boss raid over the (mock) ICM round trip: open -> escrow, fund -> L1, settle (failed) -> refund.
  const raidId = await readG(config.raid, 'BossRaid', 'currentRaidId');
  await write(g(leader), config.raid, abi('BossRaid'), 'proposeLead', [partner]);
  await write(g(partner), config.raid, abi('BossRaid'), 'acceptLead', [raidId]);
  await local.relay();
  assert.equal(Number((await readC(config.escrow, 'RaidEscrow', 'raids', [raidId]))[2]), 1, 'escrow must open via ICM');
  await write(c(leader), config.usdc, abi('MockUSDC'), 'faucet');
  await write(c(leader), config.usdc, abi('MockUSDC'), 'approve', [config.escrow, 10_000000n]);
  await write(c(leader), config.escrow, abi('RaidEscrow'), 'fund', [raidId, 10_000000n]);
  await local.relay();
  assert.equal((await readG(config.raid, 'BossRaid', 'raidView', [raidId])).bounty, 10_000000n, 'bounty must reach L1');
  await write(g(helper), config.raid, abi('BossRaid'), 'attack', [raidId]);
  assert.equal(await readG(config.raid, 'BossRaid', 'damageOf', [raidId, helper]), 10n);
  // Local-only JSON-RPC time travel to the end of the boss window; never a contract backdoor.
  await g().public.request({ method: 'evm_increaseTime', params: [601] });
  await g().public.request({ method: 'evm_mine', params: [] });
  await write(g(helper), config.raid, abi('BossRaid'), 'settle', [raidId]);
  await local.relay();
  assert.equal(await readC(config.escrow, 'RaidEscrow', 'claimable', [leader]), 10_000000n, 'failed raid refunds the funder');
  assert.equal(await readC(config.escrow, 'RaidEscrow', 'claimable', [helper]), 0n);
  await write(c(leader), config.escrow, abi('RaidEscrow'), 'claim');
  const [bal, escrowed, claimable] = await Promise.all([
    readC(config.usdc, 'MockUSDC', 'balanceOf', [config.escrow]),
    readC(config.escrow, 'RaidEscrow', 'totalEscrowed'), readC(config.escrow, 'RaidEscrow', 'totalClaimable')]);
  assert.equal(bal, escrowed + claimable, 'escrow solvency');
  console.log('PASS: JS world == contract, register, solo sail, co-op sliding-puzzle voyage, Parley signature, raid ICM open/fund/settle/refund.');
} finally { local.stop(); }
