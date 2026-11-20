import { test, expect } from '@playwright/test';
import { DPR, guestKey, tab, withCaptains } from './helpers.mjs';

async function dragGrip(page, deltaY) {
  const box = await page.locator('.grip').boundingBox();
  expect(box).toBeTruthy();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + deltaY, { steps: 6 });
  await page.mouse.up();
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`phone ${viewport.width}x${viewport.height}: compact controls, single-line demo banner, collapsed sheet, >=60% map`, async ({ browser }) => {
    test.setTimeout(120_000);
    await withCaptains(browser, [guestKey(`mobile-layout-${viewport.width}`)], async ([phoneCaptain]) => {
      const { page } = phoneCaptain;
      await expect(page.locator('#sheet')).toBeVisible();

      const metrics = await page.evaluate(() => {
        const hud = document.querySelector('.hud')?.getBoundingClientRect();
        const meter = document.querySelector('.hud .meter')?.getBoundingClientRect();
        const chip = document.querySelector('.hud .chip')?.getBoundingClientRect();
        const demoFlag = document.querySelector('.demo-flag');
        const demoRect = demoFlag?.getBoundingClientRect();
        const demoStyle = demoFlag ? getComputedStyle(demoFlag) : null;
        const sheet = document.querySelector('#sheet')?.getBoundingClientRect();
        const tabBtn = document.querySelector('.tabs button')?.getBoundingClientRect();
        const tabsBar = document.querySelector('.tabs')?.getBoundingClientRect();
        const actionBtn = document.querySelector('#sheet button:not(.grip)')?.getBoundingClientRect();
        const zoomBtn = document.querySelector('.mapctl button')?.getBoundingClientRect();
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          hudBottom: hud?.bottom ?? 0,
          meterHeight: meter?.height ?? 0,
          chipHeight: chip?.height ?? 0,
          demoHeight: demoRect?.height ?? 0,
          demoWhiteSpace: demoStyle?.whiteSpace ?? '',
          demoOverflow: demoStyle?.overflow ?? '',
          demoTextOverflow: demoStyle?.textOverflow ?? '',
          sheetHeight: sheet?.height ?? 0,
          sheetTop: sheet?.top ?? 0,
          tabsHeight: tabsBar?.height ?? 0,
          tabBtnHeight: tabBtn?.height ?? 0,
          actionBtnHeight: actionBtn?.height ?? 0,
          zoomBtnWidth: zoomBtn?.width ?? 0,
          zoomBtnHeight: zoomBtn?.height ?? 0,
        };
      });

      expect(metrics.innerWidth).toBe(viewport.width);
      expect(metrics.innerHeight).toBe(viewport.height);
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
      expect(metrics.meterHeight).toBeLessThanOrEqual(34);
      expect(metrics.chipHeight).toBeLessThanOrEqual(34);
      expect(metrics.demoWhiteSpace).toBe('nowrap');
      expect(metrics.demoOverflow).toBe('hidden');
      expect(metrics.demoTextOverflow).toBe('ellipsis');
      expect(metrics.demoHeight).toBeLessThanOrEqual(28);
      expect(metrics.tabsHeight).toBeLessThanOrEqual(68);
      expect(metrics.tabBtnHeight).toBeLessThanOrEqual(58);
      expect(metrics.actionBtnHeight).toBeLessThanOrEqual(48);
      expect(metrics.zoomBtnWidth).toBeLessThanOrEqual(46);
      expect(metrics.zoomBtnHeight).toBeLessThanOrEqual(46);
      expect(metrics.sheetHeight).toBeLessThanOrEqual(viewport.height * 0.32);

      if (viewport.width === 390) {
        const clearMapHeight = metrics.sheetTop - metrics.hudBottom;
        expect(clearMapHeight / viewport.height).toBeGreaterThanOrEqual(0.6);
      }
      await page.screenshot({ path: `test-results/lantern-phone-${viewport.width}x${viewport.height}.png` });
    }, { viewport, deviceScaleFactor: DPR, hasTouch: true });
  });
}

test('phone 390x844: bottom sheet expands and collapses via grip drag, grip tap, and tab tap', async ({ browser }) => {
  test.setTimeout(120_000);
  await withCaptains(browser, [guestKey('mobile-sheet-gestures')], async ([phoneCaptain]) => {
    const { page } = phoneCaptain;
    const sheet = page.locator('#sheet');
    const grip = page.locator('.grip');
    await expect(sheet).toHaveClass(/\bmin\b/);

    // 1. Dragging the grip upward expands the sheet (without double-toggling on click).
    await dragGrip(page, -120);
    await expect(sheet).not.toHaveClass(/\bmin\b/);
    await expect.poll(() => page.evaluate(() => document.querySelector('#sheet')?.getBoundingClientRect().height ?? 0)).toBeGreaterThan(844 * 0.42);

    // 2. Dragging the grip downward collapses the sheet.
    await dragGrip(page, 120);
    await expect(sheet).toHaveClass(/\bmin\b/);

    // 3. Tapping the grip toggles expand and collapse.
    await grip.tap();
    await expect(sheet).not.toHaveClass(/\bmin\b/);
    await grip.tap();
    await expect(sheet).toHaveClass(/\bmin\b/);

    // 4. Tapping a bottom tab auto-expands the collapsed sheet.
    await tab(page, 'Ship');
    await expect(sheet).not.toHaveClass(/\bmin\b/);
  });
});
