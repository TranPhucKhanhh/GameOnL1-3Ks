import { test, expect } from '@playwright/test';
import { act, gameClient, guestKey, loadAbi, loadConfig, tab, withCaptains } from './helpers.mjs';

test('parley: two captains exchange a code without modal DOM detachment', async ({ browser }) => {
  const cfg = loadConfig();
  const game = gameClient(cfg);
  const seaAbi = loadAbi('LanternSea');
  const keys = ['lantern-ui-parley-a', 'lantern-ui-parley-b', 'lantern-ui-parley-scanner'].map(guestKey);
  await withCaptains(browser, keys, async ([A, B, scanner]) => {
    await A.page.screenshot({ path: 'test-results/lantern-phone-home.png' });

    await tab(A.page, 'Crew');
    await act(A.page, 'Show my code');
    const code = await A.page.locator('.modal [data-copy]').getAttribute('data-copy');
    const qrImage = await A.page.locator('.modal img').getAttribute('src');
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
    for (const [viewer, partner] of [[A, B], [B, A]]) {
      const { home } = /** @type {any} */ (await game.readContract({ address: cfg.sea, abi: seaAbi, functionName: 'captainView', args: [partner.address] }));
      await expect.poll(() => viewer.page.evaluate(id => window.__lantern.map.scene.data_.partnerVisited.has(id), Number(home))).toBe(true);
    }

    // Exercise the real scanner with the signed QR image as a synthetic camera frame.
    await scanner.page.evaluate(image => {
      navigator.mediaDevices.getUserMedia = async () => {
        const qr = new Image();
        qr.src = image;
        await qr.decode();
        const canvas = document.createElement('canvas');
        canvas.width = qr.width;
        canvas.height = qr.height;
        const stream = canvas.captureStream();
        canvas.getContext('2d')?.drawImage(qr, 0, 0);
        return stream;
      };
    }, qrImage);
    await scanner.page.bringToFront();
    await tab(scanner.page, 'Crew');
    await act(scanner.page, 'Scan a code');
    await expect(scanner.page.locator('#sheet')).toContainText('Active Parleys');
    await expect(scanner.page.locator('#cam')).toBeHidden();
  });
});
