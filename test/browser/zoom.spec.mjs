import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { keccak256, toHex } from 'viem';

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.CI && process.platform === 'darwin' && existsSync(macChrome)) {
  test.use({ launchOptions: { executablePath: macChrome } });
}

const PHONE = { width: 390, height: 844 };

async function openPhoneCaptain(browser, label) {
  const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, hasTouch: true });
  await context.addInitScript(guestKey => sessionStorage.setItem('lantern-guest-key', guestKey), keccak256(toHex(label)));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', pageError => errors.push(pageError.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Claim my island' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Claim my island' }).click();
  await expect(page.locator('.badge.home')).toBeVisible({ timeout: 20_000 });
  return { context, page, errors };
}

function getSceneZoom(page, sceneKey) {
  return page.evaluate(key => window.__lantern.map.game.scene.getScene(key).cameras.main.zoom, sceneKey);
}

async function pinch(cdp, centerX, centerY, startHalfDist, endHalfDist, steps = 4) {
  const send = (type, halfDist) => cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [
      { x: Math.round(centerX - halfDist), y: Math.round(centerY), id: 1 },
      { x: Math.round(centerX + halfDist), y: Math.round(centerY), id: 2 },
    ],
  });
  await send('touchStart', startHalfDist);
  for (let step = 1; step <= steps; step++) {
    const halfDist = startHalfDist + ((endHalfDist - startHalfDist) * step) / steps;
    await send('touchMove', halfDist);
  }
  await send('touchEnd', endHalfDist);
}

test('mobile: pinch-to-zoom and +/- buttons zoom the sea map and island without zooming the page', async ({ browser }) => {
  test.setTimeout(120_000);
  const { context, page, errors } = await openPhoneCaptain(browser, 'lantern-zoom-test-1');
  try {
    const cdp = await context.newCDPSession(page);
    // 1. Viewport meta & canvas touch-action must prevent browser page zoom
    const metaContent = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(metaContent, 'viewport meta').toMatch(/user-scalable=no|maximum-scale=1(\.0)?/);
    const canvasTouchAction = await page.locator('.sea canvas').evaluate(el => getComputedStyle(el).touchAction);
    expect(canvasTouchAction, 'canvas touch-action').toBe('none');

    // 2. Pinch out on the sea map should zoom in without changing visualViewport.scale
    const canvasBox = await page.locator('.sea canvas').boundingBox();
    expect(canvasBox).toBeTruthy();
    const centerX = canvasBox.x + canvasBox.width / 2;
    const centerY = canvasBox.y + 180; // upper half above the bottom sheet

    const zoomBefore = await getSceneZoom(page, 'sea');
    await pinch(cdp, centerX, centerY, 30, 110);
    await expect.poll(() => getSceneZoom(page, 'sea')).toBeGreaterThan(zoomBefore * 1.15);
    const zoomAfterPinchOut = await getSceneZoom(page, 'sea');
    const pageScale = await page.evaluate(() => window.visualViewport?.scale ?? 1);
    expect(pageScale, 'visualViewport.scale').toBe(1);

    // 3. Pinch in on the sea map should zoom out
    await pinch(cdp, centerX, centerY, 110, 30);
    await expect.poll(() => getSceneZoom(page, 'sea')).toBeLessThan(zoomAfterPinchOut * 0.85);

    // 4. Tap + and - buttons on phone (sea view)
    const zoomBeforeBtn = await getSceneZoom(page, 'sea');
    await page.locator('[data-act="zoom-in"]').tap();
    await expect.poll(() => getSceneZoom(page, 'sea')).toBeGreaterThan(zoomBeforeBtn * 1.1);
    const zoomAfterPlus = await getSceneZoom(page, 'sea');

    await page.locator('[data-act="zoom-out"]').tap();
    await expect.poll(() => getSceneZoom(page, 'sea')).toBeLessThan(zoomAfterPlus * 0.9);

    // 5. Enter island and verify both pinch-to-zoom and +/- buttons work on the island view
    await page.locator('#sheet button', { hasText: 'Go ashore' }).click();
    await expect(page.locator('[data-act="back-sea"]')).toBeVisible({ timeout: 10_000 });
    const islZoomBefore = await getSceneZoom(page, 'island');
    await pinch(cdp, centerX, centerY, 30, 110);
    await expect.poll(() => getSceneZoom(page, 'island')).toBeGreaterThan(islZoomBefore * 1.15);
    const islZoomAfterPinch = await getSceneZoom(page, 'island');

    await page.locator('[data-act="zoom-out"]').tap();
    await expect.poll(() => getSceneZoom(page, 'island')).toBeLessThan(islZoomAfterPinch * 0.9);

    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
