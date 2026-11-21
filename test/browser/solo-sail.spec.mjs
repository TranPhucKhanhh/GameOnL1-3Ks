import { test, expect } from '@playwright/test';
import { findCaptainKey, loadConfig, withCaptains } from './helpers.mjs';

test('solo sail: captain sails from shore across the sea and lands on a new island', async ({ browser }) => {
  const cfg = loadConfig();
  const keyA = await findCaptainKey(cfg, 'lantern-ui-solo-a', ls => ls.some(l => !l.coop));

  await withCaptains(browser, [keyA], async ([A]) => {
    await A.page.locator('#sheet button', { hasText: 'Go ashore' }).click();
    await expect(A.page.locator('.backsea')).toBeVisible();

    const sailBtn = A.page.locator('#sheet button.go', { hasText: 'Set sail' }).first();
    await expect(sailBtn).toBeEnabled({ timeout: 20_000 });
    const fromName = await A.page.locator('#sheet h2').first().innerText();
    await A.page.bringToFront(); // canvas animations only run in the foreground page
    await sailBtn.click();

    await expect(A.page.locator('.backsea')).toBeHidden({ timeout: 20_000 });
    await A.page.screenshot({ path: 'test-results/lantern-phone-sailing.png' });

    // Landing keeps the captain at sea on the new island's card; going ashore is a separate tap.
    await expect(A.page.locator('#sheet h2').first()).not.toHaveText(fromName, { timeout: 20_000 });
    await expect(A.page.locator('#sheet .badge').first()).toBeVisible({ timeout: 20_000 });
    await expect(A.page.locator('.backsea')).toBeHidden();
    await expect(A.page.locator('#sheet button', { hasText: 'Go ashore' })).toBeVisible();
    await A.page.locator('#sheet button', { hasText: 'Go ashore' }).click();
    await expect(A.page.locator('.backsea')).toBeVisible();
    await A.page.screenshot({ path: 'test-results/lantern-phone-island2.png' });
    await A.page.locator('.backsea').click();
    await expect(A.page.locator('.backsea')).toBeHidden();

    // Away from the ship, the home island offers "Sail to" instead of lanes or going ashore.
    const home = await A.page.evaluate(() => window.__lantern.map.game.scene.getScene('sea').data_.home);
    await A.page.evaluate(n => window.__lantern.map.game.scene.getScene('sea').onSelect(n), home);
    await expect(A.page.locator('#sheet h2').first()).toHaveText(fromName);
    await expect(A.page.locator('#sheet button', { hasText: 'Go ashore' })).toHaveCount(0);
    await expect(A.page.locator('#sheet button.go', { hasText: 'Set sail' })).toHaveCount(0);
    await A.page.locator('#sheet button[data-act="move"]').click();
    await expect(A.page.locator('#sheet button', { hasText: 'Go ashore' })).toBeVisible({ timeout: 20_000 });
    // Back home, the lane we sailed now leads to a known island: it is a free trip, not a lantern spend.
    await expect(A.page.locator('#sheet .lane button[data-act="move"]', { hasText: 'Sail there · free' }).first()).toBeVisible();
  });
});
