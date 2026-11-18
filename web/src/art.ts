import Phaser from 'phaser';

// All cartoon art is drawn here once, as textures, with Phaser vector graphics (no external assets).
// Textures are drawn at TEX x resolution and displayed at 1/TEX scale so they stay sharp on phones.
export const TEX = 2;
export const INK = 0x3b2414;

type G = Phaser.GameObjects.Graphics;

/** Draw with a local coordinate system scaled by TEX, then save as a texture. */
function tex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G, s: number) => void) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({}, false);
  draw(g, TEX);
  g.generateTexture(key, w * TEX, h * TEX);
  g.destroy();
}

function poly(g: G, s: number, pts: number[], fill: number, stroke = true, width = 3) {
  g.fillStyle(fill, 1);
  g.beginPath();
  g.moveTo(pts[0] * s, pts[1] * s);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i] * s, pts[i + 1] * s);
  g.closePath();
  g.fillPath();
  if (stroke) { g.lineStyle(width * s, INK, 1); g.strokePath(); }
}

function blob(g: G, s: number, x: number, y: number, r: number, fill: number, outline = 3) {
  if (outline) g.fillStyle(INK, 1).fillCircle(x * s, y * s, (r + outline / 2 + 0.5) * s);
  g.fillStyle(fill, 1).fillCircle(x * s, y * s, r * s);
}

function palm(g: G, s: number, leaf: number, leafDark: number, trunk: number, coconuts: boolean) {
  // Trunk: a curved stack of rings, origin at bottom-centre (35, 88).
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const x = 35 + Math.sin(t * 1.3) * 8, y = 86 - t * 50;
    g.fillStyle(INK).fillEllipse(x * s, y * s, 15 * s, 11 * s);
    g.fillStyle(trunk).fillEllipse(x * s, y * s, 11 * s, 8 * s);
  }
  const tx = 43, ty = 34;
  const leaves: [number, number, number][] = [[-20, 6, -0.5], [20, 6, 0.5], [-14, -6, -0.9], [14, -6, 0.9], [0, -12, 0], [-24, 14, -0.3], [24, 14, 0.3]];
  for (const [dx, dy, rot] of leaves) {
    const cx = tx + dx, cy = ty + dy;
    const pts: number[] = [];
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const ex = Math.cos(a) * 15, ey = Math.sin(a) * 6;
      pts.push(cx + ex * Math.cos(rot) - ey * Math.sin(rot), cy + ex * Math.sin(rot) + ey * Math.cos(rot));
    }
    poly(g, s, pts, leaf, true, 2.6);
    g.lineStyle(1.6 * s, leafDark, 1).lineBetween((cx - Math.cos(rot) * 11) * s, (cy - Math.sin(rot) * 11) * s, (cx + Math.cos(rot) * 11) * s, (cy + Math.sin(rot) * 11) * s);
  }
  if (coconuts) for (const [dx, dy] of [[-4, 6], [3, 8], [0, 2]]) blob(g, s, tx + dx, ty + dy, 4, 0x8b5a2b, 2);
}

export function makeArt(scene: Phaser.Scene) {
  // ---------------------------------------------------------------- sea
  tex(scene, 'water', 256, 256, (g, s) => {
    g.fillStyle(0x1aa3d4).fillRect(0, 0, 256 * s, 256 * s);
    g.fillStyle(0x27b3e0, 1);
    for (const [x, y, r] of [[40, 45, 35], [165, 30, 30], [210, 165, 40], [75, 190, 32], [130, 115, 25]]) g.fillCircle(x * s, y * s, r * s);
    g.lineStyle(3 * s, 0xffffff, 0.55);
    for (const [x, y] of [[30, 100], [150, 75], [210, 235], [70, 150], [190, 130], [110, 220], [235, 35]]) {
      g.beginPath(); g.arc(x * s, y * s, 7 * s, Math.PI * 1.1, Math.PI * 1.9); g.strokePath();
      g.beginPath(); g.arc((x + 13) * s, y * s, 7 * s, Math.PI * 1.1, Math.PI * 1.9); g.strokePath();
    }
  });
  tex(scene, 'ship', 72, 72, (g, s) => {
    g.fillStyle(0x000000, 0.18).fillEllipse(36 * s, 62 * s, 58 * s, 10 * s);
    poly(g, s, [6, 40, 66, 40, 56, 56, 16, 56], 0xa8672e);
    g.lineStyle(2 * s, 0x6b4423).lineBetween(11 * s, 46 * s, 61 * s, 46 * s);
    for (const x of [22, 36, 50]) blob(g, s, x, 50, 2.4, 0xffc93c, 1.4);
    g.lineStyle(3.4 * s, INK).lineBetween(36 * s, 6 * s, 36 * s, 40 * s);
    poly(g, s, [37, 9, 58, 32, 37, 34], 0xfff6e0);
    poly(g, s, [35, 12, 16, 34, 35, 34], 0xffffff);
    blob(g, s, 46, 25, 4, 0xffc93c, 2);
    poly(g, s, [36, 3, 50, 7, 36, 11], 0xff5a4f, true, 2.4);
  });
  tex(scene, 'boss', 64, 64, (g, s) => {
    g.fillStyle(0xff5a4f, 0.35).fillCircle(32 * s, 32 * s, 30 * s);
    blob(g, s, 32, 32, 22, 0xff5a4f);
    blob(g, s, 32, 29, 13, 0xfff6e0);
    g.fillStyle(0xfff6e0).fillRoundedRect(25 * s, 36 * s, 14 * s, 9 * s, 3 * s);
    g.lineStyle(3 * s, INK).strokeRoundedRect(25 * s, 36 * s, 14 * s, 9 * s, 3 * s);
    g.fillStyle(INK).fillCircle(27 * s, 29 * s, 3.6 * s).fillCircle(37 * s, 29 * s, 3.6 * s);
    g.fillTriangle(32 * s, 33 * s, 30 * s, 37 * s, 34 * s, 37 * s);
  });
  tex(scene, 'wake', 20, 12, (g, s) => { g.fillStyle(0xffffff, 0.9).fillEllipse(10 * s, 6 * s, 18 * s, 9 * s); });
  tex(scene, 'sparkle', 18, 18, (g, s) => poly(g, s, [9, 0, 11, 7, 18, 9, 11, 11, 9, 18, 7, 11, 0, 9, 7, 7], 0xfff6a8, true, 1.6));

  // ---------------------------------------------------------------- island scenery
  palmTex(scene, 'palm', 0x4cc552, 0x2e8f34, 0xb07a45, true);
  palmTex(scene, 'palm-jungle', 0x2fae4f, 0x1d7a35, 0x8b5a2b, true);
  palmTex(scene, 'palm-crystal', 0xb7a4ff, 0x7d62e0, 0xc9b9a6, false);
  tex(scene, 'deadtree', 60, 80, (g, s) => {
    g.lineStyle(9 * s, INK).lineBetween(30 * s, 78 * s, 30 * s, 30 * s);
    g.lineStyle(6 * s, 0x6b5a4a).lineBetween(30 * s, 78 * s, 30 * s, 30 * s);
    for (const [x1, y1, x2, y2] of [[30, 48, 14, 34], [30, 40, 46, 26], [30, 32, 22, 18]]) {
      g.lineStyle(7 * s, INK).lineBetween(x1 * s, y1 * s, x2 * s, y2 * s);
      g.lineStyle(4 * s, 0x6b5a4a).lineBetween(x1 * s, y1 * s, x2 * s, y2 * s);
    }
    blob(g, s, 14, 32, 4, 0xff7a3c, 2);
  });
  tex(scene, 'rock', 44, 34, (g, s) => {
    g.fillStyle(0x000000, 0.15).fillEllipse(22 * s, 30 * s, 40 * s, 8 * s);
    blob(g, s, 17, 18, 12, 0x9aa5b1); blob(g, s, 31, 22, 8, 0xb8c2cc);
    g.fillStyle(0xffffff, 0.5).fillEllipse(13 * s, 12 * s, 8 * s, 4 * s);
  });
  tex(scene, 'bush', 40, 32, (g, s) => {
    g.fillStyle(0x000000, 0.15).fillEllipse(20 * s, 28 * s, 36 * s, 7 * s);
    blob(g, s, 12, 18, 9, 0x2e8f34); blob(g, s, 28, 18, 9, 0x2e8f34); blob(g, s, 20, 12, 10, 0x3fb04a);
    for (const [x, y] of [[14, 14], [26, 20], [21, 8]]) blob(g, s, x, y, 2.6, 0xff5a4f, 1.4);
  });
  tex(scene, 'flowers', 40, 26, (g, s) => {
    for (const [x, y, c] of [[8, 16, 0xff8fd0], [20, 10, 0xffc93c], [32, 17, 0xffffff], [16, 21, 0xff5a4f]] as const) {
      g.lineStyle(2 * s, 0x2e8f34).lineBetween(x * s, (y + 3) * s, x * s, (y + 8) * s);
      for (let a = 0; a < 5; a++) blob(g, s, x + Math.cos(a * 1.26) * 3.4, y + Math.sin(a * 1.26) * 3.4, 2.6, c, 1.2);
      blob(g, s, x, y, 1.8, 0xffc93c, 0);
    }
  });
  tex(scene, 'crystal', 36, 44, (g, s) => {
    g.fillStyle(0x000000, 0.15).fillEllipse(18 * s, 41 * s, 30 * s, 6 * s);
    poly(g, s, [18, 2, 25, 18, 18, 40, 11, 18], 0x7ff0ff);
    poly(g, s, [8, 16, 13, 26, 9, 40, 3, 27], 0xc9a8ff);
    poly(g, s, [28, 14, 34, 25, 29, 40, 23, 26], 0xff9de2);
    g.fillStyle(0xffffff, 0.7).fillTriangle(17 * s, 8 * s, 20 * s, 18 * s, 16 * s, 18 * s);
  });
  tex(scene, 'shell', 18, 16, (g, s) => {
    poly(g, s, [9, 1, 17, 12, 9, 15, 1, 12], 0xffc2d6, true, 2);
    g.lineStyle(1.4 * s, 0xd97a9c).lineBetween(9 * s, 3 * s, 9 * s, 14 * s).lineBetween(9 * s, 3 * s, 4 * s, 12 * s).lineBetween(9 * s, 3 * s, 14 * s, 12 * s);
  });
  tex(scene, 'crab', 30, 22, (g, s) => {
    g.lineStyle(2.2 * s, INK);
    for (const x of [6, 10, 20, 24]) g.lineBetween(x * s, 14 * s, (x < 15 ? x - 4 : x + 4) * s, 20 * s);
    blob(g, s, 4, 8, 4, 0xff5a4f, 2); blob(g, s, 26, 8, 4, 0xff5a4f, 2);
    g.fillStyle(INK).fillEllipse(15 * s, 13 * s, 20 * s, 13 * s);
    g.fillStyle(0xff5a4f).fillEllipse(15 * s, 13 * s, 17 * s, 10 * s);
    blob(g, s, 12, 7, 2.4, 0xffffff, 1.4); blob(g, s, 18, 7, 2.4, 0xffffff, 1.4);
    g.fillStyle(INK).fillCircle(12 * s, 7 * s, 1.1 * s).fillCircle(18 * s, 7 * s, 1.1 * s);
  });
  tex(scene, 'barrel', 30, 34, (g, s) => {
    g.fillStyle(0x000000, 0.15).fillEllipse(15 * s, 31 * s, 26 * s, 6 * s);
    g.fillStyle(INK).fillRoundedRect(3 * s, 3 * s, 24 * s, 28 * s, 7 * s);
    g.fillStyle(0xb07a45).fillRoundedRect(5.5 * s, 5.5 * s, 19 * s, 23 * s, 5 * s);
    g.fillStyle(0x6b4423).fillRect(5.5 * s, 10 * s, 19 * s, 3 * s).fillRect(5.5 * s, 21 * s, 19 * s, 3 * s);
  });
  tex(scene, 'logs', 34, 18, (g, s) => {
    g.lineStyle(7 * s, INK).lineBetween(5 * s, 14 * s, 29 * s, 6 * s).lineBetween(5 * s, 6 * s, 29 * s, 14 * s);
    g.lineStyle(4 * s, 0x8b5a2b).lineBetween(5 * s, 14 * s, 29 * s, 6 * s).lineBetween(5 * s, 6 * s, 29 * s, 14 * s);
  });
  tex(scene, 'flame', 22, 30, (g, s) => {
    poly(g, s, [11, 1, 19, 16, 17, 26, 11, 29, 5, 26, 3, 16], 0xff7a3c, true, 2.2);
    poly(g, s, [11, 10, 15, 19, 11, 26, 7, 19], 0xffd75e, false);
  });
  tex(scene, 'volcano', 120, 90, (g, s) => {
    poly(g, s, [8, 86, 46, 18, 74, 18, 112, 86], 0x7a5a48, true, 3.4);
    poly(g, s, [46, 18, 74, 18, 66, 34, 60, 28, 54, 36], 0xff5a3c, true, 2.4);
    g.fillStyle(0x9a7a64).fillTriangle(30 * s, 60 * s, 46 * s, 22 * s, 40 * s, 70 * s);
    poly(g, s, [62, 30, 68, 50, 64, 64, 58, 46], 0xff7a3c, false);
  });
  tex(scene, 'smoke', 34, 34, (g, s) => { blob(g, s, 17, 17, 13, 0xd9d4cc, 2.4); g.fillStyle(0xffffff, 0.5).fillCircle(12 * s, 12 * s, 5 * s); });
  tex(scene, 'gull', 34, 16, (g, s) => {
    g.lineStyle(5 * s, INK).beginPath(); g.moveTo(3 * s, 6 * s); g.lineTo(11 * s, 12 * s); g.lineTo(17 * s, 7 * s); g.lineTo(23 * s, 12 * s); g.lineTo(31 * s, 6 * s); g.strokePath();
    g.lineStyle(2.6 * s, 0xffffff).beginPath(); g.moveTo(3 * s, 6 * s); g.lineTo(11 * s, 12 * s); g.lineTo(17 * s, 7 * s); g.lineTo(23 * s, 12 * s); g.lineTo(31 * s, 6 * s); g.strokePath();
  });
  tex(scene, 'cloud', 180, 80, (g, s) => {
    g.fillStyle(0x000000, 1);
    for (const [x, y, r] of [[50, 45, 30], [90, 35, 38], [130, 45, 30], [70, 55, 26], [112, 56, 26]]) g.fillCircle(x * s, y * s, r * s);
  });
  tex(scene, 'boat', 46, 24, (g, s) => {
    poly(g, s, [2, 8, 44, 8, 36, 20, 10, 20], 0xc98a4b, true, 2.6);
    g.lineStyle(2 * s, 0x6b4423).lineBetween(8 * s, 12 * s, 38 * s, 12 * s);
    g.lineStyle(2.4 * s, INK).lineBetween(18 * s, 3 * s, 30 * s, 16 * s);
  });
  for (const [key, roof] of [['hut', 0xff5a4f], ['hut-blue', 0x3f9dff]] as const) {
    tex(scene, key, 70, 64, (g, s) => {
      g.fillStyle(0x000000, 0.15).fillEllipse(35 * s, 60 * s, 60 * s, 8 * s);
      g.fillStyle(INK).fillRect(11 * s, 28 * s, 48 * s, 32 * s);
      g.fillStyle(0xc98a4b).fillRect(14 * s, 31 * s, 42 * s, 26 * s);
      g.lineStyle(1.6 * s, 0x8b5a2b);
      for (let y = 37; y < 57; y += 6) g.lineBetween(14 * s, y * s, 56 * s, y * s);
      g.fillStyle(INK).fillRoundedRect(28 * s, 40 * s, 14 * s, 20 * s, 6 * s);
      g.fillStyle(0x6b4423).fillRoundedRect(30.5 * s, 42.5 * s, 9 * s, 17 * s, 4 * s);
      blob(g, s, 48, 42, 4, 0xfff4b8, 2.4);
      poly(g, s, [3, 31, 35, 5, 67, 31], roof, true, 3.2);
      g.fillStyle(0xffffff, 0.35).fillTriangle(20 * s, 24 * s, 35 * s, 11 * s, 30 * s, 24 * s);
    });
  }
}

function palmTex(scene: Phaser.Scene, key: string, leaf: number, dark: number, trunk: number, coconuts: boolean) {
  tex(scene, key, 80, 92, (g, s) => {
    g.fillStyle(0x000000, 0.15).fillEllipse(36 * s, 88 * s, 40 * s, 8 * s);
    palm(g, s, leaf, dark, trunk, coconuts);
  });
}

/** Colours per island theme. The theme is picked by the island hash (cosmetic only). */
export const THEMES = [
  { name: 'Tropical', sand: 0xffd37a, grass: 0x5fd35a, light: 0x8ae86f, palm: 'palm', path: 0xffe6a8 },
  { name: 'Jungle', sand: 0xf4c56a, grass: 0x2fae4f, light: 0x5cd06a, palm: 'palm-jungle', path: 0xf9dc9a },
  { name: 'Volcanic', sand: 0xd9b48a, grass: 0x8f7258, light: 0xae9070, palm: 'deadtree', path: 0xe9cfa8 },
  { name: 'Crystal', sand: 0xfbe3c4, grass: 0xb7a4ff, light: 0xd8ccff, palm: 'palm-crystal', path: 0xfff1de }
];
