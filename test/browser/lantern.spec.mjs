import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createPublicClient, http, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { homeOf, lanes } from '../../web/src/world.js';
import { walk, voyageSeed, solution } from '../../scripts/puzzle-walk.mjs';

// Two local guest captains in two browser contexts play the co-op features end to end:
// register, Parley by code, a co-op voyage with both sliding puzzles, and a raid with a USDC bounty.
const PHONE = { width: 390, height: 844 };
const config = () => JSON.parse(readFileSync('.local/config.json', 'utf8'));
const coopAbi = JSON.parse(readFileSync('web/src/generated/CoopSail.json', 'utf8'));
const seaAbi = JSON.parse(readFileSync('web/src/generated/LanternSea.json', 'utf8'));

async function captain(browser, key) {
  const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, hasTouch: true });
  await context.addInitScript(k => sessionStorage.setItem('lantern-guest-key', k), key);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  return { page, errors, address: privateKeyToAccount(key).address };
}

const tab = (page, name) => page.locator('.tabs button', { hasText: name }).click();
const act = (page, text) => page.locator('#sheet button, .modal button', { hasText: text }).first().click();

test('two captains: parley, co-op puzzle voyage and raid bounty on phones', async ({ browser }) => {
  test.setTimeout(300_000);
  const cfg = config();
  const game = createPublicClient({ transport: http(cfg.game.rpcUrl) });
  const seed = await game.readContract({ address: cfg.sea, abi: seaAbi, functionName: 'worldSeed' });
  // Deterministic test keys: captain A's home must have a crew lane.
  let keyA;
  for (let i = 1; !keyA; i++) {
    const key = keccak256(toHex(`lantern-ui-test-${i}`));
    if (lanes(seed, 256, homeOf(seed, 256, privateKeyToAccount(key).address)).some(l => l.coop)) keyA = key;
  }
  const keyB = keccak256(toHex('lantern-ui-test-partner'));
  const A = await captain(browser, keyA);
  const B = await captain(browser, keyB);

  for (const c of [A, B]) {
    await expect(c.page.getByRole('button', { name: 'Claim my island' })).toBeVisible({ timeout: 20_000 });
    await c.page.getByRole('button', { name: 'Claim my island' }).click();
    await expect(c.page.locator('.badge.home')).toBeVisible({ timeout: 20_000 });
    expect(await c.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await A.page.screenshot({ path: 'test-results/lantern-phone-home.png' });

  // Parley: A shows a code, B pastes it.
  await tab(A.page, 'Crew');
  await act(A.page, 'Show my code');
  const code = await A.page.locator('.modal [data-copy]').getAttribute('data-copy');
  await A.page.screenshot({ path: 'test-results/lantern-phone-parley.png' });
  await act(A.page, 'Close');
  await tab(B.page, 'Crew');
  await B.page.locator('summary', { hasText: 'Paste a code' }).click();
  await B.page.fill('#paste', code);
  await B.page.locator('#sheet button', { hasText: /^Parley$/ }).click();
  await expect(B.page.locator('#sheet')).toContainText('Active Parleys', { timeout: 20_000 });

  // Co-op voyage: A invites B on a crew lane; both solve their puzzles.
  await tab(A.page, 'Sea');
  await act(A.page, 'Plan crew voyage');
  await A.page.fill('#partner', B.address);
  await act(A.page, 'Send invitation');
  await expect(A.page.locator('#sheet')).toContainText('Waiting for crewmate', { timeout: 20_000 });
  await expect(B.page.locator('#sheet button', { hasText: /^Join/ })).toBeVisible({ timeout: 20_000 });
  await B.page.locator('#sheet button', { hasText: /^Join/ }).click();
  await expect(B.page.locator('.board')).toBeVisible({ timeout: 20_000 }); // join mined
  const id = await game.readContract({ address: cfg.coop, abi: coopAbi, functionName: 'voyageCount' });
  const startedAt = (await game.readContract({ address: cfg.coop, abi: coopAbi, functionName: 'voyages', args: [id] }))[8];
  expect(startedAt > 0n).toBe(true);
  const depth = Number(await game.readContract({ address: cfg.coop, abi: coopAbi, functionName: 'scrambleDepth' }));
  for (const c of [A, B]) {
    await expect(c.page.locator('.board')).toBeVisible({ timeout: 20_000 });
    const scrambled = walk(voyageSeed(cfg.coop, id, startedAt, c.address), depth);
    const shown = await c.page.$$eval('.board .tile', els => els.map(e => Number(e.textContent || 0)));
    expect(shown, 'board on screen must match the on-chain puzzle').toEqual(scrambled.cells);
    const moves = solution(scrambled.path);
    if (c === A) await A.page.screenshot({ path: 'test-results/lantern-phone-puzzle.png' });
    for (const m of moves) {
      // Tap the tile that sits where the blank should move.
      const cells = await c.page.$$eval('.board .tile', els => els.map(e => Number(e.textContent || 0)));
      const blank = cells.indexOf(0);
      const target = m === 0 ? blank - 4 : m === 1 ? blank + 4 : m === 2 ? blank - 1 : blank + 1;
      await c.page.locator(`.board .tile[data-cell="${target}"]`).click();
      await expect(c.page.locator(`.board .tile[data-cell="${blank}"]`)).not.toHaveClass(/blank/);
    }
    await expect(c.page.locator('.board')).toBeHidden({ timeout: 20_000 });
  }
  await tab(A.page, 'Crew');
  await expect(A.page.locator('#sheet')).toContainText('Landed', { timeout: 20_000 });

  // Go ashore on A's home and build the first note pole (it must stand in the centre and cost coins).
  await tab(A.page, 'Sea');
  await A.page.locator('#sheet button', { hasText: 'Go ashore' }).click();
  await expect(A.page.locator('.backsea')).toBeVisible();
  await A.page.fill('#note', 'First lantern lit on Pearl Bluff!');
  // The co-op reward may still be arriving; the button enables once coins cover the cost (while the field keeps focus).
  await expect(A.page.locator('#sheet button', { hasText: 'Build note pole' })).toBeEnabled({ timeout: 20_000 });
  await expect(A.page.locator('#note')).toHaveValue('First lantern lit on Pearl Bluff!');
  const coinsBefore = Number((await A.page.locator('.meter.coin').innerText()).replace(/\D/g, ''));
  await act(A.page, 'Build note pole');
  await expect(A.page.locator('#sheet .notes')).toContainText('Pole #1 · centre', { timeout: 20_000 });
  await expect(A.page.locator('.meter.coin')).toHaveText(String(coinsBefore - 25), { timeout: 20_000 });
  await A.page.screenshot({ path: 'test-results/lantern-phone-island.png' });
  // Sail a solo lane from the island: the ship animates across the sea, then we land on the new island.
  const sailBtn = A.page.locator('#sheet button.go', { hasText: 'Set sail' }).first();
  await expect(sailBtn).toBeEnabled({ timeout: 70_000 }); // a charge refills within a demo minute
  const fromName = await A.page.locator('#sheet h2').first().innerText();
  await A.page.bringToFront(); // canvas animations only run in the foreground page
  await sailBtn.click();
  await expect(A.page.locator('.backsea')).toBeHidden({ timeout: 20_000 }); // back on the sea for the voyage
  await A.page.waitForTimeout(900);
  await A.page.screenshot({ path: 'test-results/lantern-phone-sailing.png' });
  await expect(A.page.locator('.backsea')).toBeVisible({ timeout: 20_000 }); // ashore on arrival
  await expect(A.page.locator('#sheet h2').first()).not.toHaveText(fromName);
  await A.page.waitForTimeout(1500);
  await A.page.screenshot({ path: 'test-results/lantern-phone-island2.png' });
  await A.page.locator('.backsea').click();
  await expect(A.page.locator('.backsea')).toBeHidden();

  // Raid: A proposes, B accepts, A escrows a bounty on the C-Chain stand-in, B attacks.
  await tab(A.page, 'Raid');
  await A.page.fill('#lead-partner', B.address);
  await act(A.page, 'Propose to lead');
  await tab(B.page, 'Raid');
  await expect(B.page.locator('#sheet button', { hasText: 'Accept and open' })).toBeVisible({ timeout: 20_000 });
  await act(B.page, 'Accept and open');
  await expect(A.page.locator('#sheet button', { hasText: 'Get 100 test USDC' })).toBeVisible({ timeout: 20_000 });
  await act(A.page, 'Get 100 test USDC');
  await expect(A.page.locator('#sheet')).toContainText('Your wallet: 100', { timeout: 20_000 });
  await A.page.fill('#bounty', '10');
  await act(A.page, 'Escrow on C-Chain');
  await expect(A.page.locator('#sheet')).toContainText('bounty 10 USDC', { timeout: 30_000 });
  await B.page.locator('#sheet button', { hasText: 'Sail & attack' }).click();
  await expect(B.page.locator('#sheet')).toContainText('Your damage', { timeout: 20_000 });
  await B.page.screenshot({ path: 'test-results/lantern-phone-raid.png' });

  await tab(A.page, 'Ship');
  await A.page.screenshot({ path: 'test-results/lantern-phone-ship.png' });
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const d = await desktop.newPage();
  await d.goto(`/?captain=${A.address}`);
  await expect(d.locator('#sheet')).toContainText('Treasure cabinet', { timeout: 20_000 });
  await d.screenshot({ path: 'test-results/lantern-desktop-cabinet.png' });
  // Nothing may sit on top of the map on desktop (regression: an empty overlay box used to block drag and zoom).
  expect(await d.evaluate(() => document.elementFromPoint(400, 450)?.tagName)).toBe('CANVAS');
  expect([...A.errors, ...B.errors]).toEqual([]);
});
