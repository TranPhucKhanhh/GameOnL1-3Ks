import Phaser from 'phaser';
import type { Hex } from 'viem';
import { lanes, islandShape, islandName } from './world.js';

export type MapData = {
  seed: Hex;
  mapSize: number;
  visited: Set<number>;
  partnerVisited: Set<number>;
  home: number | null;
  ship: number | null;
  otherHomes: Set<number>;
  boss: number | null;
  selected: number | null;
};

const CELL = 96;
const PX = 6; // one "pixel" of island art

/** Deterministic position: grid cell plus a small hash-free jitter so islands don't line up. */
export function islandPos(island: number, mapSize: number) {
  const side = Math.round(Math.sqrt(mapSize));
  const x = island % side, y = Math.floor(island / side);
  const jx = ((island * 37) % 29) - 14, jy = ((island * 53) % 31) - 15;
  return { x: x * CELL + CELL / 2 + jx, y: y * CELL + CELL / 2 + jy };
}

class SeaScene extends Phaser.Scene {
  data_: MapData | null = null;
  onSelect: (island: number) => void = () => {};
  private lanesG!: Phaser.GameObjects.Graphics;
  private layer!: Phaser.GameObjects.Container;
  private ship!: Phaser.GameObjects.Image;
  private bossMark!: Phaser.GameObjects.Image;
  private ring!: Phaser.GameObjects.Graphics;
  private dragStart: { x: number; y: number; sx: number; sy: number } | null = null;
  private pinch: { dist: number; zoom: number } | null = null;
  private moved = false;
  private worldSize = 16 * CELL;
  private lastShip: number | null = null;
  insets = { top: 0, right: 0, bottom: 0 };

  constructor() { super('sea'); }

  create() {
    this.makeTextures();
    this.cameras.main.setBackgroundColor('#0d2a3a');
    this.add.tileSprite(0, 0, 4000, 4000, 'water').setOrigin(0).setScrollFactor(1).setDepth(-10);
    this.lanesG = this.add.graphics().setDepth(1);
    this.layer = this.add.container(0, 0).setDepth(2);
    this.ring = this.add.graphics().setDepth(3);
    this.bossMark = this.add.image(0, 0, 'boss').setDepth(4).setVisible(false);
    this.ship = this.add.image(0, 0, 'ship').setDepth(5).setVisible(false);
    this.tweens.add({ targets: this.ship, y: '+=4', duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.tweens.add({ targets: this.bossMark, scale: 1.15, duration: 700, yoyo: true, repeat: -1 });
    this.input.addPointer(1);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.moved = false;
      this.dragStart = { x: p.x, y: p.y, sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const cam = this.cameras.main;
      const p1 = this.input.pointer1, p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown) {
        const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (!this.pinch) this.pinch = { dist, zoom: cam.zoom };
        cam.setZoom(Phaser.Math.Clamp(this.pinch.zoom * dist / this.pinch.dist, 0.35, 2.5));
        this.moved = true;
        return;
      }
      if (!p.isDown || !this.dragStart) return;
      const dx = p.x - this.dragStart.x, dy = p.y - this.dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 8) this.moved = true;
      cam.scrollX = this.dragStart.sx - dx / cam.zoom;
      cam.scrollY = this.dragStart.sy - dy / cam.zoom;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) this.pinch = null;
      if (this.moved || !this.data_) { this.dragStart = null; return; }
      this.dragStart = null;
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      let best = -1, bestD = 46;
      for (const island of this.data_.visited) {
        const pos = islandPos(island, this.data_.mapSize);
        const d = Phaser.Math.Distance.Between(wp.x, wp.y, pos.x, pos.y);
        if (d < bestD) { best = island; bestD = d; }
      }
      if (best >= 0) this.onSelect(best);
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.35, 2.5));
    });
    this.cameras.main.setZoom(this.scale.width < 600 ? 1.1 : 1);
    if (this.data_) this.redraw();
  }

  private makeTextures() {
    const g = this.make.graphics({}, false);
    // Water tile: two shades with a few pixel wave marks.
    g.fillStyle(0x0f3347).fillRect(0, 0, 48, 48);
    g.fillStyle(0x134058).fillRect(0, 0, 24, 24).fillRect(24, 24, 24, 24);
    g.fillStyle(0x2a6b82).fillRect(6, 10, 8, 2).fillRect(30, 34, 8, 2).fillRect(32, 8, 6, 2);
    g.generateTexture('water', 48, 48); g.clear();
    // Ship: hull, mast, lantern-yellow sail.
    const ship = [
      '....Y....', '...YYY...', '..YYYYY..', '....W....', '....W....', 'BBBBBBBBB', '.BBBBBBB.', '..BBBBB..'
    ];
    this.pixelArt(g, ship, { Y: 0xf5c451, W: 0x6b4423, B: 0x7a3b1d }, 4, 'ship');
    const skull = ['.RRRRR.', 'RRRRRRR', 'RWRRRWR', 'RRRRRRR', '.RWRWR.', '.RRRRR.'];
    this.pixelArt(g, skull, { R: 0xd94f3d, W: 0x1a0d0d }, 5, 'boss');
    g.destroy();
  }

  private pixelArt(g: Phaser.GameObjects.Graphics, rows: string[], colors: Record<string, number>, size: number, key: string) {
    g.clear();
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (colors[ch] !== undefined) g.fillStyle(colors[ch]).fillRect(x * size, y * size, size, size);
    }));
    g.generateTexture(key, rows[0].length * size, rows.length * size);
    g.clear();
  }

  private islandTexture(island: number, kind: 'mine' | 'partner' | 'home' | 'other') {
    const key = `isl-${island}-${kind}`;
    if (this.textures.exists(key)) return key;
    const d = this.data_!;
    const mask = islandShape(d.seed, island);
    const g = this.make.graphics({}, false);
    const sand = kind === 'partner' ? 0x8f8a76 : 0xe8cf8f;
    const grass = kind === 'partner' ? 0x5d7363 : kind === 'home' ? 0x5fae5a : 0x4f9a4a;
    for (let i = 0; i < 64; i++) {
      if (!mask[i]) continue;
      const x = i % 8, y = Math.floor(i / 8);
      const edge = [i - 8, i + 8, x > 0 ? i - 1 : -1, x < 7 ? i + 1 : -1].some(j => j < 0 || j > 63 || !mask[j]);
      g.fillStyle(edge ? sand : grass).fillRect(x * PX, y * PX, PX, PX);
    }
    if (kind === 'home' || kind === 'other') {
      // Hut with a lantern roof marks a captain's base.
      g.fillStyle(0x6b4423).fillRect(3 * PX, 3 * PX, 2 * PX, 2 * PX);
      g.fillStyle(kind === 'home' ? 0xf5c451 : 0xd98b5f).fillRect(3 * PX - 2, 2 * PX + 2, 2 * PX + 4, PX - 2);
    }
    g.generateTexture(key, 8 * PX, 8 * PX);
    g.destroy();
    return key;
  }

  setData(d: MapData) {
    this.data_ = d;
    this.worldSize = Math.round(Math.sqrt(d.mapSize)) * CELL;
    if (!this.lanesG) return; // scene not created yet; create() draws and focuses
    this.redraw();
  }

  /** Centre an island in the part of the canvas not covered by the HUD and the panel. */
  focus(island: number, instant = false) {
    if (!this.data_ || !this.cameras?.main) return;
    const cam = this.cameras.main;
    const p = islandPos(island, this.data_.mapSize);
    const x = p.x + this.insets.right / 2 / cam.zoom;
    const y = p.y + (this.insets.bottom - this.insets.top) / 2 / cam.zoom;
    if (instant) cam.centerOn(x, y);
    else cam.pan(x, y, 450, 'Sine.easeInOut');
  }

  private dashed(x1: number, y1: number, x2: number, y2: number, color: number, alpha: number) {
    const len = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const steps = Math.floor(len / 10);
    this.lanesG.lineStyle(2, color, alpha);
    for (let i = 0; i < steps; i += 2) {
      const a = i / steps, b = Math.min(1, (i + 1) / steps);
      this.lanesG.lineBetween(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, x1 + (x2 - x1) * b, y1 + (y2 - y1) * b);
    }
  }

  redraw() {
    const d = this.data_!;
    this.lanesG.clear();
    this.layer.removeAll(true);
    this.ring.clear();
    const all = new Set([...d.visited, ...d.partnerVisited]);
    // Lanes from every island I have visited: full line if I know the destination, otherwise a short
    // arrow into the fog with only its cost shown, so the destination stays a surprise.
    for (const island of d.visited) {
      const from = islandPos(island, d.mapSize);
      for (const lane of lanes(d.seed, d.mapSize, island)) {
        const to = islandPos(lane.to, d.mapSize);
        const known = d.visited.has(lane.to);
        const color = lane.coop ? 0xc78bff : lane.cost === 2 ? 0xf5c451 : 0x9fe0d0;
        if (known) {
          this.dashed(from.x, from.y, to.x, to.y, color, 0.55);
        } else {
          const ang = Math.atan2(to.y - from.y, to.x - from.x);
          const ex = from.x + Math.cos(ang) * 70, ey = from.y + Math.sin(ang) * 70;
          this.dashed(from.x, from.y, ex, ey, color, 0.95);
          this.lanesG.fillStyle(color, 1).fillTriangle(
            ex + Math.cos(ang) * 10, ey + Math.sin(ang) * 10,
            ex + Math.cos(ang + 2.4) * 8, ey + Math.sin(ang + 2.4) * 8,
            ex + Math.cos(ang - 2.4) * 8, ey + Math.sin(ang - 2.4) * 8);
          const label = this.add.text(ex + Math.cos(ang) * 18, ey + Math.sin(ang) * 18,
            lane.coop ? `⚓${lane.cost}·crew` : `⚓${lane.cost}`,
            { fontFamily: 'monospace', fontSize: '12px', color: '#0d2a3a', backgroundColor: Phaser.Display.Color.IntegerToColor(color).rgba, padding: { x: 3, y: 1 } })
            .setOrigin(0.5);
          this.layer.add(label);
        }
      }
    }
    for (const island of all) {
      const pos = islandPos(island, d.mapSize);
      const mine = d.visited.has(island);
      const kind = island === d.home ? 'home' : d.otherHomes.has(island) ? 'other' : mine ? 'mine' : 'partner';
      const img = this.add.image(pos.x, pos.y, this.islandTexture(island, kind)).setAlpha(mine ? 1 : 0.55);
      this.layer.add(img);
      if (mine) {
        const name = this.add.text(pos.x, pos.y + 30, islandName(island),
          { fontFamily: 'monospace', fontSize: '11px', color: '#f3ead2' }).setOrigin(0.5, 0).setAlpha(0.85);
        this.layer.add(name);
      }
    }
    if (d.selected !== null) {
      const p = islandPos(d.selected, d.mapSize);
      this.ring.lineStyle(3, 0xf5c451, 1).strokeCircle(p.x, p.y, 34);
    }
    if (d.boss !== null) {
      const p = islandPos(d.boss, d.mapSize);
      this.bossMark.setPosition(p.x + 22, p.y - 26).setVisible(true);
    } else this.bossMark.setVisible(false);
    if (d.ship !== null) {
      const p = islandPos(d.ship, d.mapSize);
      this.ship.setPosition(p.x - 24, p.y - 20).setVisible(true);
    }
    // Generous bounds so an island near the edge can still be centred above the panel.
    const pad = 4 * CELL;
    this.cameras.main.setBounds(-pad, -pad, this.worldSize + 2 * pad, this.worldSize + 2 * pad);
    if (d.ship !== null && d.ship !== this.lastShip) {
      this.focus(d.ship, this.lastShip === null);
      this.lastShip = d.ship;
    }
  }
}

export class SeaMap {
  private game: Phaser.Game;
  private scene: SeaScene;

  constructor(parent: HTMLElement, onSelect: (island: number) => void) {
    this.scene = new SeaScene();
    this.scene.onSelect = onSelect;
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: '#0d2a3a',
      pixelArt: true,
      scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth || 360, height: parent.clientHeight || 640 },
      scene: this.scene,
      banner: false,
      input: { mouse: { preventDefaultWheel: true } }
    });
  }

  update(d: MapData) { this.scene.setData(d); }
  setInsets(top: number, right: number, bottom: number) { this.scene.insets = { top, right, bottom }; }
  focus(island: number) { this.scene.focus(island); }
  destroy() { this.game.destroy(true); }
}
