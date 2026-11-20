import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { keccak256, toHex } from 'viem';

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.CI && process.platform === 'darwin' && existsSync(macChrome)) {
  test.use({ launchOptions: { executablePath: macChrome } });
}

async function openDesktopCaptain(browser, viewport, label) {
  const context = await browser.newContext({ viewport });
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

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
]) {
  test(`desktop ${viewport.width}x${viewport.height}: map canvas excludes right panel, resizes, centers, and pans`, async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page, errors } = await openDesktopCaptain(
      browser,
      viewport,
      `lantern-desktop-map-${viewport.width}`,
    );
    try {
      const seaBox = await page.locator('#sea').boundingBox();
      const canvasBox = await page.locator('#sea canvas').boundingBox();
      const sheetBox = await page.locator('#sheet').boundingBox();
      expect(seaBox).toBeTruthy();
      expect(canvasBox).toBeTruthy();
      expect(sheetBox).toBeTruthy();

      // 1. Map container and canvas must end at or left of the right panel.
      expect(seaBox.x + seaBox.width).toBeLessThanOrEqual(sheetBox.x);
      expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(sheetBox.x);

      // 2. Phaser scale width must match the shrunk .sea container.
      const phaserSize = await page.evaluate(() => {
        const sea = window.__lantern.map.game.scene.getScene('sea');
        return { width: sea.scale.width, height: sea.scale.height };
      });
      expect(phaserSize.width).toBeCloseTo(seaBox.width, -1);

      // 3. Camera scroll must pan when dragging across the sea canvas.
      const scrollBefore = await page.evaluate(() => {
        const cam = window.__lantern.map.game.scene.getScene('sea').cameras.main;
        return { x: cam.scrollX, y: cam.scrollY };
      });
      const dragX = canvasBox.x + canvasBox.width / 2;
      const dragY = canvasBox.y + canvasBox.height / 2;
      await page.mouse.move(dragX, dragY);
      await page.mouse.down();
      await page.mouse.move(dragX - 120, dragY - 80, { steps: 6 });
      await page.mouse.up();
      await expect.poll(() => page.evaluate(() => {
        const cam = window.__lantern.map.game.scene.getScene('sea').cameras.main;
        return { x: cam.scrollX, y: cam.scrollY };
      })).not.toEqual(scrollBefore);

      // 4. Island interior fit() centers world (0,0) inside the visible canvas (not shifted left for a hidden panel).
      await page.locator('#sheet button', { hasText: 'Go ashore' }).click();
      await expect(page.locator('[data-act="back-sea"]')).toBeVisible({ timeout: 10_000 });
      const islandCenterOffset = await page.evaluate(() => {
        const isl = window.__lantern.map.game.scene.getScene('island');
        const cam = isl.cameras.main;
        const centerWorldX = cam.scrollX + cam.width / 2;
        return Math.abs(centerWorldX);
      });
      expect(islandCenterOffset).toBeLessThan(1);

      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
