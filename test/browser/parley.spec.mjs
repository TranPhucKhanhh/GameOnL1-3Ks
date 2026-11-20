import { test, expect } from '@playwright/test';
import { act, guestKey, tab, withCaptains } from './helpers.mjs';

test('parley: two captains exchange a code without modal DOM detachment', async ({ browser }) => {
  await withCaptains(browser, [guestKey('lantern-ui-parley-a'), guestKey('lantern-ui-parley-b')], async ([A, B]) => {
    await A.page.screenshot({ path: 'test-results/lantern-phone-home.png' });

    await tab(A.page, 'Crew');
    await act(A.page, 'Show my code');
    const code = await A.page.locator('.modal [data-copy]').getAttribute('data-copy');
    await A.page.screenshot({ path: 'test-results/lantern-phone-parley.png' });

    // Regression check: the 1s countdown tick must not detach the Close button.
    const stayedAttached = await A.page.evaluate(() => new Promise(resolve => {
      const btn = document.querySelector('[data-act="close-overlay"]');
      setTimeout(() => resolve(!!btn?.isConnected), 1500);
    }));
    expect(stayedAttached).toBe(true);

    await act(A.page, 'Close');
    await expect(A.page.locator('.modal')).toBeHidden();

    await tab(B.page, 'Crew');
    await B.page.locator('summary', { hasText: 'Paste a code' }).click();
    await B.page.fill('#paste', code);
    await B.page.locator('#sheet button', { hasText: /^Parley$/ }).click();
    await expect(B.page.locator('#sheet')).toContainText('Active Parleys', { timeout: 20_000 });
  });
});
