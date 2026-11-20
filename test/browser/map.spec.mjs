import { expect, test } from '@playwright/test';
import { DPR, PHONE } from './helpers.mjs';

async function setupMap(page) {
  await page.route('**/config.json', route => route.fulfill({ status: 404, body: '' }));
  await page.goto('/');
  await page.evaluate(async () => {
    const { SeaMap, islandPos } = await import('/src/map.ts');
    const { islandBlobs, lanes } = await import('/src/world.js');
    const parent = document.createElement('div');
    parent.style.cssText = 'position: fixed; inset: 0; z-index: 100';
    document.body.append(parent);
    const hits = [];
    const map = new SeaMap(parent, id => hits.push(['island', id]), {
      onTile: tile => hits.push(['tile', tile]),
      onPole: pole => hits.push(['pole', pole]),
      onDock: dir => hits.push(['dock', dir])
    });
    const seed = '0x' + '42'.repeat(32);
    const island = 118;
    const author = '0x' + '11'.repeat(20);
    const data = {
      seed, island, name: 'Test Island', isHome: false,
      poles: [{ author, tile: 40, text: 'Centre' }, { author, tile: 41, text: 'Second' }],
      docks: [{ dir: 2, cost: 1, coop: false, angle: 0, label: '?' }],
      placing: false, pick: null, selectedPole: null
    };
    map.update({
      seed, mapSize: 256, visited: new Set([island]), partnerVisited: new Set(),
      home: island, ship: null, otherHomes: new Set(), boss: null, selected: null
    });
    const blobs = islandBlobs(seed, island).blobs;
    const rightmost = blobs.reduce((a, b) => a.x + a.r > b.x + b.r ? a : b);
    const pos = islandPos(island, 256);
    const to = islandPos(lanes(seed, 256, island)[0].to, 256);
    const angle = Math.atan2(to.y - pos.y, to.x - pos.x);
    const bubble = { x: pos.x + Math.cos(angle) * 130, y: pos.y + Math.sin(angle) * 130 };
    window.mapFixture = { map, hits, data, pos, bubble,
      shore: { x: rightmost.x + rightmost.r + 7, y: rightmost.y + 4 } };
  });
  await expect.poll(() => page.evaluate(() => window.mapFixture.map.game.scene.isActive('sea')), { timeout: 45_000 }).toBe(true);
}

async function center(page, sceneName, zoom, x, y) {
  await page.evaluate(async ({ sceneName, zoom, x, y }) => {
    const scene = window.mapFixture.map.game.scene.getScene(sceneName);
    scene.cameras.main.setZoom(zoom).centerOn(x, y);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { sceneName, zoom, x, y });
}

async function screenPoint(page, sceneName, x, y) {
  return page.evaluate(({ sceneName, x, y }) => {
    const game = window.mapFixture.map.game;
    const cam = game.scene.getScene(sceneName).cameras.main;
    const p = cam.matrix.transformPoint(x - cam.scrollX, y - cam.scrollY);
    const rect = game.canvas.getBoundingClientRect();
    return { x: rect.left + p.x * rect.width / game.scale.width, y: rect.top + p.y * rect.height / game.scale.height };
  }, { sceneName, x, y });
}

async function screenshotHitAreas(page, sceneName, testInfo) {
  await page.evaluate(sceneName => {
    const scene = window.mapFixture.map.game.scene.getScene(sceneName);
    for (const obj of scene.layer.list) if (obj.input) scene.input.enableDebug(obj);
  }, sceneName);
  await page.screenshot({ path: testInfo.outputPath(`${sceneName}-hit-area-debug.png`) });
}

for (const { name, viewport, zoom, touch } of [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, zoom: 1.8, touch: false },
  { name: 'phone', viewport: PHONE, zoom: 0.48, touch: true }
]) {
  test.describe(name, () => {
    test.use({ viewport, hasTouch: touch, deviceScaleFactor: touch ? DPR : 1 });

    test('map targets use the same shapes for hover and selection', async ({ page }, testInfo) => {
      test.setTimeout(100_000);
      await setupMap(page);
      const hits = [];
      const cursor = () => page.evaluate(() => window.mapFixture.map.game.canvas.style.cursor);
      async function probe(scene, x, y, hit) {
        const p = await screenPoint(page, scene, x, y);
        // Approach every point from empty space so a previous hover tween cannot widen the target.
        await page.mouse.move(5, 5);
        await expect.poll(cursor).not.toBe('pointer');
        await page.mouse.move(p.x, p.y);
        if (hit) await expect.poll(cursor).toBe('pointer');
        else expect(await cursor()).not.toBe('pointer');
        if (touch) await page.touchscreen.tap(p.x, p.y);
        else await page.mouse.click(p.x, p.y);
        if (hit) hits.push(hit);
        expect(await page.evaluate(() => window.mapFixture.hits)).toEqual(hits);
      }

      const { pos, shore, bubble } = await page.evaluate(() => {
        const { pos, shore, bubble } = window.mapFixture;
        return { pos, shore, bubble };
      });
      await center(page, 'sea', zoom, pos.x, pos.y);
      await probe('sea', pos.x, pos.y - 53); // transparent pixel inside the old 56-unit tap circle
      await probe('sea', pos.x + shore.x, pos.y + shore.y, ['island', 118]); // shoreline that extends past the old circle
      await probe('sea', bubble.x, bubble.y);
      await screenshotHitAreas(page, 'sea', testInfo);
      const start = await screenPoint(page, 'sea', pos.x, pos.y);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 40, start.y + 32, { steps: 5 });
      await page.mouse.up();
      expect(await page.evaluate(() => window.mapFixture.hits)).toEqual(hits);

      await page.evaluate(() => {
        const { map, data } = window.mapFixture;
        map.enterIsland(data);
      });
      await expect.poll(() => page.evaluate(() => window.mapFixture.map.game.scene.isActive('island'))).toBe(true);
      await center(page, 'island', zoom, 35, -20);
      await probe('island', 17, 12); // empty space on the pole's tile
      await probe('island', 29, -62); // outside a rounded corner of the sign
      await probe('island', 18, -47, ['pole', 0]); // sign above its tile
      await probe('island', 0, 15, ['pole', 0]); // thin post
      await probe('island', 0, -69, ['pole', 0]); // the centre lantern
      await probe('island', 65, -38, ['pole', 1]);

      await center(page, 'island', zoom, 270, 0);
      await probe('island', 357, 0); // old 44-unit dock ring, outside the 31-unit button
      await probe('island', 347, 0, ['dock', 2]);

      // Phaser shows the registered bounding boxes for composite shapes and the exact circle for docks.
      await center(page, 'island', touch ? 0.55 : 1.2, 153, -20);
      await screenshotHitAreas(page, 'island', testInfo);
    });
  });
}
