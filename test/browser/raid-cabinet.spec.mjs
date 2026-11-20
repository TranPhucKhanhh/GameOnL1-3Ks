import { test, expect } from '@playwright/test';
import { act, guestKey, tab, withCaptains } from './helpers.mjs';

test('raid and desktop cabinet: lead crew escrows USDC bounty, attacks, and views desktop cabinet', async ({ browser }) => {
  await withCaptains(browser, [guestKey('lantern-ui-raid-a'), guestKey('lantern-ui-raid-b')], async ([A, B]) => {
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
    try {
      const desktopPage = await desktop.newPage();
      await desktopPage.goto(`/?captain=${A.address}`);
      await expect(desktopPage.locator('#sheet')).toContainText('Treasure cabinet', { timeout: 20_000 });
      await desktopPage.screenshot({ path: 'test-results/lantern-desktop-cabinet.png' });
      // Nothing may sit on top of the map on desktop (regression: an empty overlay box used to block drag and zoom).
      expect(await desktopPage.evaluate(() => document.elementFromPoint(400, 450)?.tagName)).toBe('CANVAS');
    } finally {
      await desktop.close();
    }
  });
});
