import { test, expect } from '@playwright/test';
import { createWalletClient, http } from 'viem';
import { act, findCaptainKey, gameClient, giveCoins, guestKey, loadAbi, loadConfig, withCaptains } from './helpers.mjs';

const openTab = (page, name) => page.locator(`.tabs button[data-tab="${name}"]`).click();

/** Local chain only: land a crew on an unclaimed island so captain `a` owns a gem (impersonates CoopSail). */
async function grantGem(cfg, a, b) {
  const game = gameClient(cfg);
  const seaAbi = loadAbi('LanternSea');
  let island = 255;
  while (await game.readContract({ address: cfg.sea, abi: seaAbi, functionName: 'firstFinder', args: [island] })
    !== '0x0000000000000000000000000000000000000000') island--;
  await game.request({ method: 'anvil_impersonateAccount', params: [cfg.coop] });
  await game.request({ method: 'anvil_setBalance', params: [cfg.coop, '0x56BC75E2D63100000'] });
  const wallet = createWalletClient({ account: cfg.coop, transport: http(cfg.game.rpcUrl) });
  const hash = await wallet.writeContract({ address: cfg.sea, abi: seaAbi, functionName: 'coopArrive',
    args: [a, b, island, 0n], account: cfg.coop, chain: null });
  await game.waitForTransactionReceipt({ hash, pollingInterval: 100 });
  await game.request({ method: 'anvil_stopImpersonatingAccount', params: [cfg.coop] });
  const gem = Number(await game.readContract({ address: cfg.sea, abi: seaAbi, functionName: 'gemTypeOf', args: [island] }));
  return { island, gem };
}

test('buttons not covered elsewhere: mult upgrade, gem sale, cancel voyage, Parley jump, copy, disconnect, exit view',
  async ({ browser }) => {
    const cfg = loadConfig();
    const game = gameClient(cfg);
    const seaAbi = loadAbi('LanternSea');
    const keyA = await findCaptainKey(cfg, 'lantern-ui-buttons-a', ls => ls.some(l => l.coop));
    await withCaptains(browser, [keyA, guestKey('lantern-ui-buttons-b')], async ([A, B]) => {
      await A.context.grantPermissions(['clipboard-read', 'clipboard-write']);
      const coins = async addr => (await game.readContract({ address: cfg.sea, abi: seaAbi, functionName: 'captainView',
        args: [addr] })).coins;

      // Ship: +0.10 mult costs 60 coins and lifts power from 10 to 11.
      await giveCoins(cfg, A.address, 60);
      await openTab(A.page, 'ship');
      await expect(A.page.locator('#sheet .power b')).toHaveText('10');
      await A.page.locator('#sheet button[data-act="up-mult"]').click();
      await expect(A.page.locator('#sheet .power b')).toHaveText('11');

      // Cabinet: sell the gem from a crew landing for its fixed coin price.
      const { gem } = await grantGem(cfg, A.address, B.address);
      const before = await coins(A.address);
      await openTab(A.page, 'cabinet');
      const sell = A.page.locator(`#sheet button[data-act="sell"][data-gem="${gem}"]`);
      await expect(sell).toBeEnabled();
      await sell.click();
      const price = BigInt(await game.readContract({ address: cfg.sea, abi: seaAbi, functionName: 'gemPrice', args: [gem] }));
      await expect.poll(() => coins(A.address)).toBe(before + price);
      await expect(sell).toBeDisabled();

      // Copy cabinet link puts the read-only link on the clipboard.
      await A.page.locator('#sheet button[data-act="copy-link"]').click();
      await expect(A.page.locator('#sheet')).toContainText('Copied.');
      expect(await A.page.evaluate(() => navigator.clipboard.readText())).toContain(`?captain=${A.address}`);

      // The crew landing moved A's ship there, so home now offers a free "Sail to" instead of its lanes.
      await openTab(A.page, 'island');
      await expect(A.page.locator('#sheet button[data-act="sail"], #sheet button[data-act="coop-form"]')).toHaveCount(0);
      await A.page.locator('#sheet button[data-act="move"]').click();

      // Crew: an invitation can be cancelled before the crewmate joins.
      await act(A.page, 'Plan crew voyage');
      await A.page.fill('#partner', B.address);
      await act(A.page, 'Send invitation');
      await expect(A.page.locator('#sheet')).toContainText('Waiting for crewmate');
      await A.page.locator('#sheet button[data-act="cancel"]').click();
      await expect(A.page.locator('#sheet')).toContainText('Cancelled');

      // Parley, then B jumps to an island only A has visited (A's home) for one charge.
      await openTab(A.page, 'crew');
      await act(A.page, 'Show my code');
      const code = await A.page.locator('.modal [data-copy]').getAttribute('data-copy');
      await act(A.page, 'Close');
      await openTab(B.page, 'crew');
      await B.page.locator('summary', { hasText: 'Paste a code' }).click();
      await B.page.fill('#paste', code);
      await B.page.locator('#sheet button', { hasText: /^Parley$/ }).click();
      await expect(B.page.locator('#sheet')).toContainText('Active Parleys');
      const home = Number((await game.readContract({ address: cfg.sea, abi: seaAbi, functionName: 'captainView',
        args: [A.address] })).home);
      const target = home; // A's home: B has not been there
      expect(await game.readContract({ address: cfg.sea, abi: seaAbi, functionName: 'visited', args: [B.address, target] })).toBe(false);
      await B.page.evaluate(n => window.__lantern.map.game.scene.getScene('sea').onSelect(n), target);
      const jump = B.page.locator('#sheet button[data-act="jump"]');
      await expect(jump).toBeEnabled();
      await jump.click();
      await expect.poll(() => game.readContract({ address: cfg.sea, abi: seaAbi, functionName: 'visited',
        args: [B.address, target] })).toBe(true);

      // Read-only link: "Play your own captain" leaves the view.
      const viewer = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      try {
        const page = await viewer.newPage();
        await page.goto(`/?captain=${A.address}`);
        await expect(page.locator('#sheet')).toContainText('Treasure cabinet', { timeout: 60_000 });
        await openTab(page, 'island');
        await page.locator('#sheet button[data-act="exit-view"]').click();
        await expect(page.locator('#sheet')).toContainText('Play as a local guest captain');
        expect(new URL(page.url()).search).toBe('');
      } finally { await viewer.close(); }

      // Help: the local debug button adds coins.
      await openTab(B.page, 'help');
      const bBefore = await coins(B.address);
      await B.page.locator('#sheet button[data-act="debug-coins"][data-amount="100"]').click();
      await expect.poll(() => coins(B.address)).toBe(bBefore + 100n);
      await expect(B.page.locator('.meter.coin')).toHaveText(String(bBefore + 100n));

      // Help: Disconnect returns to the connect box.
      await B.page.locator('#sheet button[data-act="disconnect"]').click();
      await expect(B.page.locator('#sheet')).toContainText('Play as a local guest captain');
    });
  });
