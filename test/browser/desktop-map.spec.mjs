import { test, expect } from '@playwright/test';
import { guestKey, withCaptains } from './helpers.mjs';

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
]) {
  test(`desktop ${viewport.width}x${viewport.height}: map canvas excludes right panel, resizes, centers, and pans`, async ({ browser }) => {
    test.setTimeout(120_000);
    await withCaptains(browser, [guestKey(`desktop-map-${viewport.width}`)], async ([desktopCaptain]) => {
      const { page } = desktopCaptain;
      await expect(page.locator('#sheet')).toBeVisible();

      // 1. Measure layout atomically so background #ui refreshes cannot detach #sheet mid-read.
      const layout = await page.evaluate(() => {
        const sea = document.querySelector('#sea')?.getBoundingClientRect();
        const canvas = document.querySelector('#sea canvas')?.getBoundingClientRect();
        const sheet = document.querySelector('#sheet')?.getBoundingClientRect();
        const seaScene = window.__lantern.map.game.scene.getScene('sea');
        return {
          seaRight: sea?.right ?? null,
          seaWidth: sea?.width ?? null,
          canvasRight: canvas?.right ?? null,
          canvasCenter: canvas ? { x: canvas.left + canvas.width / 2, y: canvas.top + canvas.height / 2 } : null,
          sheetLeft: sheet?.left ?? null,
          phaserWidth: seaScene.scale.width,
        };
      });
      expect(layout.seaRight).not.toBeNull();
      expect(layout.canvasRight).not.toBeNull();
      expect(layout.sheetLeft).not.toBeNull();
      expect(layout.seaRight).toBeLessThanOrEqual(layout.sheetLeft);
      expect(layout.canvasRight).toBeLessThanOrEqual(layout.sheetLeft);
      expect(layout.phaserWidth).toBeCloseTo(layout.seaWidth, -1);

      // 2. Camera scroll must pan when dragging across the sea canvas.
      const scrollBefore = await page.evaluate(() => {
        const cam = window.__lantern.map.game.scene.getScene('sea').cameras.main;
        return { x: cam.scrollX, y: cam.scrollY };
      });
      await page.mouse.move(layout.canvasCenter.x, layout.canvasCenter.y);
      await page.mouse.down();
      await page.mouse.move(layout.canvasCenter.x - 120, layout.canvasCenter.y - 80, { steps: 6 });
      await page.mouse.up();
      await expect.poll(() => page.evaluate(() => {
        const cam = window.__lantern.map.game.scene.getScene('sea').cameras.main;
        return { x: cam.scrollX, y: cam.scrollY };
      })).not.toEqual(scrollBefore);

      // 3. Island interior fit() centers world (0,0) inside the visible canvas (not shifted left for a hidden panel).
      await page.locator('#sheet button', { hasText: 'Go ashore' }).click();
      await expect(page.locator('[data-act="back-sea"]')).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => page.evaluate(() => {
        const cam = window.__lantern.map.game.scene.getScene('island').cameras.main;
        return Math.abs(cam.scrollX + cam.width / 2);
      })).toBeLessThan(1);
    }, { viewport, deviceScaleFactor: 1, hasTouch: false });
  });
}
