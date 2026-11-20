import { test, expect } from '@playwright/test';
import { walk, voyageSeed, solution } from '../../scripts/puzzle-walk.mjs';
import { act, findCaptainKey, gameClient, guestKey, loadAbi, loadConfig, tab, withCaptains } from './helpers.mjs';

async function startVoyage(proposer, partner) {
  await tab(proposer.page, 'Sea');
  await act(proposer.page, 'Plan crew voyage');
  await proposer.page.fill('#partner', partner.address);
  await act(proposer.page, 'Send invitation');
  await expect(proposer.page.locator('#sheet')).toContainText('Waiting for crewmate');

  await tab(partner.page, 'Crew');
  await partner.page.locator('#sheet button[data-act="join"]').click();
  await expect(partner.page.locator('.board')).toBeVisible();
}

test('co-op voyage: two captains pool charges, solve sliding puzzles and land together', async ({ browser }) => {
  const cfg = loadConfig();
  const game = gameClient(cfg);
  const coopAbi = loadAbi('CoopSail');
  const keyA = await findCaptainKey(cfg, 'lantern-ui-coop-a', ls => ls.some(l => l.coop));

  await withCaptains(browser, [keyA, guestKey('lantern-ui-coop-b')], async ([A, B]) => {
    await startVoyage(A, B);

    const id = await game.readContract({ address: cfg.coop, abi: coopAbi, functionName: 'voyageCount' });
    const voyage = /** @type {any} */ (await game.readContract({ address: cfg.coop, abi: coopAbi, functionName: 'voyages', args: [id] }));
    const startedAt = voyage[8];
    expect(startedAt > 0n).toBe(true);
    const depth = Number(await game.readContract({ address: cfg.coop, abi: coopAbi, functionName: 'scrambleDepth' }));

    // Both captains solve at the same time, like two real players: the co-op window is only 60 seconds.
    await Promise.all([A, B].map(async captainHandle => {
      await expect(captainHandle.page.locator('.board')).toBeVisible({ timeout: 20_000 });
      const scrambled = walk(voyageSeed(cfg.coop, id, startedAt, captainHandle.address), depth);
      const shown = await captainHandle.page.$$eval('.board .tile', els => els.map(e => Number(e.textContent || 0)));
      expect(shown, 'board on screen must match the on-chain puzzle').toEqual(scrambled.cells);
      if (captainHandle === A) await A.page.screenshot({ path: 'test-results/lantern-phone-puzzle.png' });
      let blank = scrambled.cells.indexOf(0);
      for (const m of solution(scrambled.path)) {
        const target = m === 0 ? blank - 4 : m === 1 ? blank + 4 : m === 2 ? blank - 1 : blank + 1;
        await captainHandle.page.locator(`.board .tile[data-cell="${target}"]`).click();
        blank = target; // the tapped tile slides into the gap, so the gap moves to where it was
      }
      await expect(captainHandle.page.locator('.board')).toBeHidden({ timeout: 20_000 });
    }));

    await tab(A.page, 'Crew');
    await expect(A.page.locator('#sheet')).toContainText('Landed', { timeout: 20_000 });
  });
});

test('co-op timeout closes the open puzzle and lets the captain mark the voyage lost', async ({ browser }) => {
  const cfg = loadConfig();
  const game = gameClient(cfg);
  const coopAbi = loadAbi('CoopSail');
  const key = await findCaptainKey(cfg, 'lantern-ui-timeout-proposer', routes => routes.some(lane => lane.coop));
  await withCaptains(browser, [key, guestKey('lantern-ui-timeout-partner')], async ([proposer, partner]) => {
    await startVoyage(proposer, partner);
    const id = await game.readContract({ address: cfg.coop, abi: coopAbi, functionName: 'voyageCount' });
    const deadline = await game.readContract({ address: cfg.coop, abi: coopAbi, functionName: 'deadlineOf', args: [id] });
    const expiredAt = Number(deadline) + 1;
    await game.request({ method: 'evm_setNextBlockTimestamp', params: [expiredAt] });
    await game.request({ method: 'evm_mine', params: [] });
    await partner.page.clock.setFixedTime(new Date(expiredAt * 1000));
    await expect(partner.page.locator('.board')).toBeHidden();
    await act(partner.page, 'Mark lost');
    await expect(partner.page.locator('#sheet')).toContainText('Lost at sea');
  });
});
