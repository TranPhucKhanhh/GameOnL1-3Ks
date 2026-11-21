import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { DPR, guestKey } from './helpers.mjs';

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.CI && process.platform === 'darwin' && existsSync(macChrome)) {
  test.use({ launchOptions: { executablePath: macChrome } });
}

const PHONE = { width: 390, height: 844 };

async function openPhoneCaptain(browser, label) {
  const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: DPR, hasTouch: true });
  await context.addInitScript(key => sessionStorage.setItem('lantern-guest-key', key), guestKey(label));
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

async function drag(cdp, x, y, dx, dy, steps = 6) {
  const at = i => [{ x: Math.round(x + (dx * i) / steps), y: Math.round(y + (dy * i) / steps), id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const getScroll = page => page.evaluate(() => {
  const cam = window.__lantern.map.game.scene.getScene('sea').cameras.main;
  return { x: cam.scrollX, y: cam.scrollY };
});

/** Two fingers moved together (no spread) pan the sea: the fallback when a phone browser keeps one-finger swipes. */
async function twoFingerPan(cdp, x, y, dx, dy, steps = 6) {
  const at = i => [{ x: Math.round(x - 40 + (dx * i) / steps), y: Math.round(y + (dy * i) / steps), id: 1 },
    { x: Math.round(x + 40 + (dx * i) / steps), y: Math.round(y + (dy * i) / steps), id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** One-finger drag must move the sea camera (in world units: screen delta / zoom). */
async function expectDragPans(page, cdp, x, y) {
  const before = await getScroll(page);
  await drag(cdp, x, y, -120, -60);
  await expect.poll(async () => (await getScroll(page)).x - before.x).toBeGreaterThan(40);
}

test('mobile: pinch-to-zoom and +/- buttons zoom the sea map, the island keeps a fixed size, the page never zooms', async ({ browser }) => {
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

    // One-finger drag pans the sea, before and (below) after a pinch.
    await expectDragPans(page, cdp, centerX, centerY);

    const zoomBefore = await getSceneZoom(page, 'sea');
    await pinch(cdp, centerX, centerY, 30, 110);
    await expect.poll(() => getSceneZoom(page, 'sea')).toBeGreaterThan(zoomBefore * 1.15);
    const zoomAfterPinchOut = await getSceneZoom(page, 'sea');
    const pageScale = await page.evaluate(() => window.visualViewport?.scale ?? 1);
    expect(pageScale, 'visualViewport.scale').toBe(1);

    // 3. Pinch in on the sea map should zoom out
    await pinch(cdp, centerX, centerY, 110, 30);
    await expect.poll(() => getSceneZoom(page, 'sea')).toBeLessThan(zoomAfterPinchOut * 0.85);

    await expectDragPans(page, cdp, centerX, centerY);

    // Two fingers moved together pan without zooming.
    const zoomBeforePan = await getSceneZoom(page, 'sea');
    const beforePan = await getScroll(page);
    await twoFingerPan(cdp, centerX, centerY, -120, -60);
    await expect.poll(async () => (await getScroll(page)).x - beforePan.x).toBeGreaterThan(40);
    expect(await getSceneZoom(page, 'sea')).toBeCloseTo(zoomBeforePan, 1);

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
    // The island has a fixed size ashore (#6): pinch does nothing and the zoom buttons are hidden.
    const islZoomBefore = await getSceneZoom(page, 'island');
    await pinch(cdp, centerX, centerY, 30, 110);
    await page.waitForFunction(() => true); // let the input settle
    expect(await getSceneZoom(page, 'island')).toBeCloseTo(islZoomBefore, 5);
    await expect(page.locator('[data-act="zoom-in"]')).toHaveCount(0);

    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
