import { test, expect } from '@playwright/test';
import { walk, voyageSeed, solution } from '../../scripts/puzzle-walk.mjs';
import { act, findCaptainKey, gameClient, guestKey, loadAbi, loadConfig, tab, withCaptains } from './helpers.mjs';

test('co-op voyage: two captains pool charges, solve sliding puzzles and land together', async ({ browser }) => {
  const cfg = loadConfig();
  const game = gameClient(cfg);
  const coopAbi = loadAbi('CoopSail');
  const keyA = await findCaptainKey(cfg, 'lantern-ui-coop-a', ls => ls.some(l => l.coop));

  await withCaptains(browser, [keyA, guestKey('lantern-ui-coop-b')], async ([A, B]) => {
    await tab(A.page, 'Sea');
    await act(A.page, 'Plan crew voyage');
    await A.page.fill('#partner', B.address);
    await act(A.page, 'Send invitation');
    await expect(A.page.locator('#sheet')).toContainText('Waiting for crewmate', { timeout: 20_000 });

    await tab(B.page, 'Crew');
    await expect(B.page.locator('#sheet button', { hasText: /^Join/ })).toBeVisible({ timeout: 20_000 });
    await B.page.locator('#sheet button', { hasText: /^Join/ }).click();
    await expect(B.page.locator('.board')).toBeVisible({ timeout: 20_000 });

    const id = await game.readContract({ address: cfg.coop, abi: coopAbi, functionName: 'voyageCount' });
    const startedAt = (await game.readContract({ address: cfg.coop, abi: coopAbi, functionName: 'voyages', args: [id] }))[8];
    expect(startedAt > 0n).toBe(true);
    const depth = Number(await game.readContract({ address: cfg.coop, abi: coopAbi, functionName: 'scrambleDepth' }));

    for (const captainHandle of [A, B]) {
      await expect(captainHandle.page.locator('.board')).toBeVisible({ timeout: 20_000 });
      const scrambled = walk(voyageSeed(cfg.coop, id, startedAt, captainHandle.address), depth);
      const shown = await captainHandle.page.$$eval('.board .tile', els => els.map(e => Number(e.textContent || 0)));
      expect(shown, 'board on screen must match the on-chain puzzle').toEqual(scrambled.cells);
      const moves = solution(scrambled.path);
      if (captainHandle === A) await A.page.screenshot({ path: 'test-results/lantern-phone-puzzle.png' });
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        const cells = await captainHandle.page.$$eval('.board .tile', els => els.map(e => Number(e.textContent || 0)));
        const blank = cells.indexOf(0);
        const target = m === 0 ? blank - 4 : m === 1 ? blank + 4 : m === 2 ? blank - 1 : blank + 1;
        await captainHandle.page.locator(`.board .tile[data-cell="${target}"]`).click();
        if (i < moves.length - 1) {
          await expect(captainHandle.page.locator(`.board .tile[data-cell="${blank}"]`)).not.toHaveClass(/blank/);
        }
      }
      await expect(captainHandle.page.locator('.board')).toBeHidden({ timeout: 20_000 });
    }

    await tab(A.page, 'Crew');
    await expect(A.page.locator('#sheet')).toContainText('Landed', { timeout: 20_000 });
  });
});
