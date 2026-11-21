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
    const centre = () => A.page.evaluate(() => {
      const { map } = window.__lantern;
      const position = map.tileScreen(40, true);
      if (!position) return null;
      // CSS pixels per world unit: the camera zoom also carries the canvas pixel density.
      const cssPerCanvasPx = map.game.canvas.getBoundingClientRect().width / map.game.scale.width;
      return { ...position, zoom: map.game.scene.getScene('island').cameras.main.zoom * cssPerCanvasPx };
    });
    // Wait until the island has finished fitting around the panel: two consecutive poll reads agree.
    let last = null;
    await expect.poll(async () => {
      const now = await centre();
      const settled = !!now && !!last && Math.abs(now.x - last.x) + Math.abs(now.y - last.y) < 1;
      last = now;
      return settled;
    }, { intervals: [250] }).toBe(true);
    const c = await centre();
    await A.page.touchscreen.tap(c.x + 17 * c.zoom, c.y + 12 * c.zoom);
    await expect(A.page.locator('#bubble')).toBeHidden();
    await A.page.touchscreen.tap(c.x + 16 * c.zoom, c.y - 46 * c.zoom);
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
