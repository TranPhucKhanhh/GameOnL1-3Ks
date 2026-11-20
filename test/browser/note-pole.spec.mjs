import { test, expect } from '@playwright/test';
import { giveCoins, guestKey, loadConfig, tab, withCaptains } from './helpers.mjs';

test('note pole: write the first note in the centre sign bubble, read it back, close by tapping elsewhere', async ({ browser }) => {
  const cfg = loadConfig();
  await withCaptains(browser, [guestKey('lantern-ui-note-a')], async ([A]) => {
    await giveCoins(cfg, A.address, 100); // a pole costs 25 coins
    await expect(A.page.locator('.meter.coin')).toContainText('100', { timeout: 20_000 });

    await tab(A.page, 'Sea');
    await A.page.locator('#sheet button', { hasText: 'Go ashore' }).click();
    await expect(A.page.locator('.backsea')).toBeVisible();
    await expect(A.page.locator('[data-act="zoom-in"]')).toHaveCount(0); // fixed size ashore (#6)
    await expect(A.page.locator('#sheet')).toContainText('Tap the "?" sign', { timeout: 20_000 });

    // Write the first note in the speech bubble on the centre sign (tile 40), not in the panel (#9).
    const centre = () => A.page.evaluate(() => window.__lantern.map.tileScreen(40, true));
    await expect.poll(centre).not.toBeNull();
    const c = await centre();
    await A.page.touchscreen.tap(c.x, c.y);
    await expect(A.page.locator('#bubble-text')).toBeVisible();
    await A.page.fill('#bubble-text', 'First lantern lit on this island!');
    const build = A.page.locator('#bubble button[data-act="note"]');
    await expect(build).toBeEnabled();
    await build.click();
    await expect(A.page.locator('#sheet .notes')).toContainText('Pole #1 · centre', { timeout: 20_000 });
    await expect(A.page.locator('.meter.coin')).toContainText('75', { timeout: 20_000 });

    // Tapping the pole shows its note in a bubble (#8); tapping elsewhere closes it.
    const c2 = await centre();
    await A.page.touchscreen.tap(c2.x, c2.y);
    await expect(A.page.locator('#bubble .bubble-text')).toHaveText('First lantern lit on this island!');
    await A.page.screenshot({ path: 'test-results/lantern-phone-island.png' });
    await A.page.touchscreen.tap(20, 200);
    await expect(A.page.locator('#bubble')).toBeHidden();
  });
});
