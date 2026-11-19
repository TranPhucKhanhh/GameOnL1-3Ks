import Phaser from 'phaser';
import type { Hex } from 'viem';
import { lanes, islandBlobs, islandName, isLand, tileDeco, islandTheme, GRID, CENTER_TILE } from './world.js';
import { makeArt, THEMES, TEX, INK } from './art';

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

const CELL = 120;
const FONT = '"Lilita One", "Arial Rounded MT Bold", Arial, sans-serif';
const label = (size: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle =>
  ({ fontFamily: FONT, fontSize: `${size}px`, color: '#ffffff', stroke: '#3b2414', strokeThickness: Math.max(3, size / 4), resolution: 2, ...extra });

/** Deterministic position: grid cell plus a small jitter so islands don't line up. */
export function islandPos(island: number, mapSize: number) {
  const side = Math.round(Math.sqrt(mapSize));
  const x = island % side, y = Math.floor(island / side);
  const jx = ((island * 37) % 33) - 16, jy = ((island * 53) % 35) - 17;
  return { x: x * CELL + CELL / 2 + jx, y: y * CELL + CELL / 2 + jy };
}

/** Drag to pan, wheel or pinch to zoom, tap to select. Shared by the sea map and the island view. */
function panZoom(scene: Phaser.Scene, onTap: (wx: number, wy: number) => void, minZoom = 0.35, maxZoom = 2.4) {
  let drag: { x: number; y: number; sx: number; sy: number } | null = null;
  let pinch: { dist: number; zoom: number } | null = null;
  let moved = false;
  const input = scene.input;
  input.addPointer(1);
  input.on('pointerdown', (p: Phaser.Input.Pointer) => {
    moved = false;
    drag = { x: p.x, y: p.y, sx: scene.cameras.main.scrollX, sy: scene.cameras.main.scrollY };
  });
  input.on('pointermove', (p: Phaser.Input.Pointer) => {
    const cam = scene.cameras.main;
    const p1 = input.pointer1, p2 = input.pointer2;
    if (p1.isDown && p2.isDown) {
      const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
      if (!pinch) pinch = { dist, zoom: cam.zoom };
      cam.setZoom(Phaser.Math.Clamp(pinch.zoom * dist / pinch.dist, minZoom, maxZoom));
      moved = true;
      return;
    }
    if (!p.isDown || !drag) return;
    const dx = p.x - drag.x, dy = p.y - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 8) moved = true;
    cam.scrollX = drag.sx - dx / cam.zoom;
    cam.scrollY = drag.sy - dy / cam.zoom;
  });
  input.on('pointerup', (p: Phaser.Input.Pointer) => {
    if (!input.pointer1.isDown && !input.pointer2.isDown) pinch = null;
    const tap = !moved && drag;
    drag = null;
    if (!tap) return;
    const wp = scene.cameras.main.getWorldPoint(p.x, p.y);
    onTap(wp.x, wp.y);
  });
  input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
    const cam = scene.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), minZoom, maxZoom));
  });
}

/** Grow slightly while the pointer is over a game object (desktop hover feedback). */
function hoverGrow(scene: Phaser.Scene, obj: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, base = 1, grow = 1.12) {
  obj.on('pointerover', () => scene.tweens.add({ targets: obj, scale: base * grow, duration: 140, ease: 'Back.out' }));
  obj.on('pointerout', () => scene.tweens.add({ targets: obj, scale: base, duration: 140, ease: 'Sine.out' }));
}

// ================================================================ sea map

class SeaScene extends Phaser.Scene {
  data_: MapData | null = null;
  onSelect: (island: number) => void = () => {};
  insets = { top: 0, right: 0, bottom: 0 };
  private lanesG!: Phaser.GameObjects.Graphics;
  private layer!: Phaser.GameObjects.Container;
  private ship!: Phaser.GameObjects.Container;
  private hull!: Phaser.GameObjects.Image;
  private bossMark!: Phaser.GameObjects.Image;
  private ring!: Phaser.GameObjects.Graphics;
  private worldSize = 16 * CELL;
  private lastShip: number | null = null;
  private sailing = false;
  private drawnKey = '';
  private seen = new Set<number>();

  constructor() { super('sea'); }

  create() {
    makeArt(this);
    this.cameras.main.setBackgroundColor('#1aa3d4');
    this.add.tileSprite(-2000, -2000, 8000, 8000, 'water').setOrigin(0).setDepth(-10).setTileScale(1 / TEX);
    this.lanesG = this.add.graphics().setDepth(1);
    this.layer = this.add.container(0, 0).setDepth(2);
    this.ring = this.add.graphics().setDepth(3);
    this.bossMark = this.add.image(0, 0, 'boss').setScale(1 / TEX).setDepth(4).setVisible(false);
    // The bob animates the hull inside a container, so moving the container (sailing) never fights the tween.
    this.hull = this.add.image(0, 0, 'ship').setScale(1 / TEX);
    this.ship = this.add.container(0, 0, [this.hull]).setDepth(6).setVisible(false);
    this.tweens.add({ targets: this.hull, y: 5, angle: { from: -5, to: 5 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.tweens.add({ targets: this.bossMark, scale: 0.6, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    panZoom(this, (wx, wy) => {
      if (!this.data_ || this.sailing) return;
      const best = this.islandAt(wx, wy);
      if (best >= 0) this.onSelect(best);
    });
    this.cameras.main.setZoom(this.scale.width < 600 ? 0.95 : 1);
    if (this.data_) this.redraw();
  }

  private islandAt(wx: number, wy: number) {
    const d = this.data_!;
    let best = -1, bestD = 56;
    for (const island of new Set([...d.visited, ...d.partnerVisited])) {
      const pos = islandPos(island, d.mapSize);
      const dist = Phaser.Math.Distance.Between(wx, wy, pos.x, pos.y);
      if (dist < bestD) { best = island; bestD = dist; }
    }
    return best;
  }

  private islandTexture(island: number, kind: 'mine' | 'partner' | 'home' | 'other') {
    const key = `isl-${island}-${kind}`;
    if (this.textures.exists(key)) return key;
    const d = this.data_!;
    const { blobs, deco } = islandBlobs(d.seed, island) as { blobs: { x: number; y: number; r: number }[]; deco: number };
    const theme = THEMES[islandTheme(d.seed, island)];
    const s = TEX, size = 150, c = size / 2;
    const g = this.make.graphics({}, false);
    const at = (v: number) => (c + v) * s;
    g.fillStyle(0x7fe3f5, 0.75); for (const b of blobs) g.fillCircle(at(b.x), at(b.y + 4), (b.r + 9) * s);
    g.fillStyle(INK); for (const b of blobs) g.fillCircle(at(b.x), at(b.y + 2), (b.r + 2.5) * s);
    g.fillStyle(kind === 'partner' ? 0xe9dcc0 : theme.sand); for (const b of blobs) g.fillCircle(at(b.x), at(b.y), b.r * s);
    g.fillStyle(kind === 'partner' ? 0x9fbf9a : theme.grass); for (const b of blobs) g.fillCircle(at(b.x * 0.85), at(b.y * 0.85 - 4), Math.max(4, b.r - 7) * s);
    g.fillStyle(0xffffff, 0.35).fillCircle(at(blobs[0].x - 8), at(blobs[0].y - 10), 5 * s);
    g.generateTexture(key, size * s, size * s);
    g.destroy();
    void deco; // the sea view uses the theme tree instead (added in redraw)
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
    if (!this.data_ || !this.cameras?.main || this.sailing) return;
    const cam = this.cameras.main;
    const p = islandPos(island, this.data_.mapSize);
    const x = p.x + this.insets.right / 2 / cam.zoom;
    const y = p.y + (this.insets.bottom - this.insets.top) / 2 / cam.zoom;
    if (instant) cam.centerOn(x, y);
    else cam.pan(x, y, 450, 'Sine.easeInOut');
  }

  private dashed(x1: number, y1: number, x2: number, y2: number, color: number, width: number) {
    const len = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const steps = Math.max(2, Math.floor(len / 14));
    for (const [w, col] of [[width + 4, INK], [width, color]] as const) {
      this.lanesG.lineStyle(w, col, 1);
      for (let i = 0; i < steps; i += 2) {
        const a = i / steps, b = Math.min(1, (i + 1) / steps);
        this.lanesG.lineBetween(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, x1 + (x2 - x1) * b, y1 + (y2 - y1) * b);
      }
    }
  }

  private bubble(x: number, y: number, text: string, color: number) {
    const g = this.add.graphics();
    const w = text.length > 2 ? 54 : 34;
    g.fillStyle(INK).fillRoundedRect(x - w / 2, y - 14, w, 32, 16);
    g.fillStyle(color).fillRoundedRect(x - w / 2 + 3, y - 11, w - 6, 24, 12);
    g.fillStyle(0xffffff, 0.35).fillRoundedRect(x - w / 2 + 7, y - 9, w - 14, 6, 3);
    this.layer.add([g, this.add.text(x, y + 1, text, label(17)).setOrigin(0.5)]);
  }

  redraw(force = false) {
    const d = this.data_!;
    const key = JSON.stringify([[...d.visited].sort(), [...d.partnerVisited].sort(), d.home, [...d.otherHomes].sort(), d.boss, d.selected, d.ship]);
    if (!force && key === this.drawnKey) return; // nothing changed: keep hover and pop animations alive
    this.drawnKey = key;
    const firstDraw = this.seen.size === 0;
    this.lanesG.clear();
    this.layer.removeAll(true);
    this.ring.clear();
    const all = new Set([...d.visited, ...d.partnerVisited]);
    for (const island of d.visited) {
      const from = islandPos(island, d.mapSize);
      for (const lane of lanes(d.seed, d.mapSize, island)) {
        const to = islandPos(lane.to, d.mapSize);
        const color = lane.coop ? 0xb48bff : lane.cost === 2 ? 0xffc93c : 0x7ff0d8;
        if (d.visited.has(lane.to)) { this.dashed(from.x, from.y, to.x, to.y, 0xffffff, 3); continue; }
        // Unknown destination: a short arrow into open water showing only the cost.
        const ang = Math.atan2(to.y - from.y, to.x - from.x);
        const sx = from.x + Math.cos(ang) * 54, sy = from.y + Math.sin(ang) * 54;
        const ex = from.x + Math.cos(ang) * 100, ey = from.y + Math.sin(ang) * 100;
        this.dashed(sx, sy, ex, ey, color, 5);
        const tip = (a: number, r: number) => [ex + Math.cos(ang + a) * r, ey + Math.sin(ang + a) * r];
        const [ax, ay] = tip(0, 14), [bx, by] = tip(2.5, 11), [cx, cy] = tip(-2.5, 11);
        this.lanesG.fillStyle(INK).fillTriangle(ax + Math.cos(ang) * 3, ay + Math.sin(ang) * 3, bx + Math.cos(ang + 2.5) * 3, by + Math.sin(ang + 2.5) * 3, cx + Math.cos(ang - 2.5) * 3, cy + Math.sin(ang - 2.5) * 3);
        this.lanesG.fillStyle(color).fillTriangle(ax, ay, bx, by, cx, cy);
        this.bubble(ex + Math.cos(ang) * 30, ey + Math.sin(ang) * 30, lane.coop ? `${lane.cost}★` : `${lane.cost}`, color === 0x7ff0d8 ? 0x1fb59a : color === 0xffc93c ? 0xe8950c : 0x6a3fd0);
      }
    }
    for (const island of all) {
      const pos = islandPos(island, d.mapSize);
      const mine = d.visited.has(island);
      const kind = island === d.home ? 'home' : d.otherHomes.has(island) ? 'other' : mine ? 'mine' : 'partner';
      const img = this.add.image(pos.x, pos.y, this.islandTexture(island, kind)).setScale(1 / TEX).setAlpha(mine ? 1 : 0.6);
      img.setInteractive({ hitArea: new Phaser.Geom.Circle(150, 150, 110), hitAreaCallback: Phaser.Geom.Circle.Contains, useHandCursor: true });
      hoverGrow(this, img, 1 / TEX, 1.12);
      const parts: Phaser.GameObjects.GameObject[] = [img];
      // A little scenery on top of the island texture: theme tree plus a hut on bases.
      const theme = THEMES[islandTheme(d.seed, island)];
      const tree = this.add.image(pos.x + 8, pos.y + 6, mine ? theme.palm : 'palm').setOrigin(0.5, 0.95).setScale(0.3).setAlpha(mine ? 1 : 0.6);
      parts.push(tree);
      if (kind === 'home' || kind === 'other') parts.push(this.add.image(pos.x - 12, pos.y + 4, kind === 'home' ? 'hut' : 'hut-blue').setOrigin(0.5, 0.9).setScale(0.32));
      if (mine) parts.push(this.add.text(pos.x, pos.y + 50, islandName(island), label(15)).setOrigin(0.5, 0));
      this.layer.add(parts);
      if (!this.seen.has(island)) {
        this.seen.add(island);
        if (!firstDraw) { // freshly discovered: pop out of the fog
          for (const p of parts) {
            const t = p as unknown as Phaser.GameObjects.Components.Transform;
            const target = t.scaleX;
            t.setScale(0.01);
            this.tweens.add({ targets: p, scale: target, duration: 650, ease: 'Back.out' });
          }
        }
      }
    }
    if (d.selected !== null) {
      const p = islandPos(d.selected, d.mapSize);
      this.ring.lineStyle(8, INK, 1).strokeCircle(p.x, p.y, 44);
      this.ring.lineStyle(5, 0xffc93c, 1).strokeCircle(p.x, p.y, 44);
    }
    if (d.boss !== null) {
      const p = islandPos(d.boss, d.mapSize);
      this.bossMark.setPosition(p.x + 28, p.y - 30).setVisible(true);
    } else this.bossMark.setVisible(false);
    if (d.ship !== null && !this.sailing) {
      const p = islandPos(d.ship, d.mapSize);
      this.ship.setPosition(p.x - 40, p.y - 10).setVisible(true);
    }
    const pad = 4 * CELL;
    this.cameras.main.setBounds(-pad, -pad, this.worldSize + 2 * pad, this.worldSize + 2 * pad);
    if (d.ship !== null && d.ship !== this.lastShip && !this.sailing) {
      this.focus(d.ship, this.lastShip === null);
      this.lastShip = d.ship;
    }
  }

  /** Sail the ship from one island to another along a gentle curve, with the camera following and a wake. */
  sail(from: number, to: number): Promise<void> {
    return new Promise(resolve => {
      const d = this.data_;
      if (!d || !this.cameras?.main) return resolve();
      const a = islandPos(from, d.mapSize), b = islandPos(to, d.mapSize);
      const start = { x: a.x - 40, y: a.y - 10 }, end = { x: b.x - 40, y: b.y - 10 };
      const dx = end.x - start.x, dy = end.y - start.y, len = Math.hypot(dx, dy) || 1;
      const bend = Math.min(90, len * 0.2);
      const ctrl = { x: (start.x + end.x) / 2 - (dy / len) * bend, y: (start.y + end.y) / 2 + (dx / len) * bend };
      const cam = this.cameras.main;
      this.sailing = true;
      this.ship.setPosition(start.x, start.y).setVisible(true);
      this.hull.setFlipX(dx < 0);
      cam.removeBounds();
      cam.startFollow(this.ship, false, 0.2, 0.2);
      cam.setFollowOffset(-this.insets.right / 2 / cam.zoom, -(this.insets.bottom - this.insets.top) / 2 / cam.zoom);
      const baseZoom = cam.zoom;
      cam.zoomTo(baseZoom * 1.15, 700, 'Sine.easeInOut');
      const wake = this.time.addEvent({ delay: 70, loop: true, callback: () => {
        const w = this.add.image(this.ship.x + (dx < 0 ? 18 : -18), this.ship.y + 22, 'wake').setScale(0.4).setDepth(5).setAlpha(0.9);
        this.tweens.add({ targets: w, alpha: 0, scale: 1, duration: 900, onComplete: () => w.destroy() });
      } });
      const counter = { t: 0 };
      const duration = Phaser.Math.Clamp(len * 2.4, 1600, 3800);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        wake.remove();
        cam.stopFollow();
        this.ship.setPosition(end.x, end.y);
        this.sailing = false;
        this.lastShip = to;
        resolve();
      };
      // If the page is in the background the animation clock stops; never leave the voyage hanging.
      if (document.hidden) { cam.zoomTo(baseZoom, 0); return finish(); }
      window.setTimeout(finish, duration + 2500);
      this.tweens.add({
        targets: counter, t: 1, duration, ease: 'Sine.inOut',
        onUpdate: () => {
          const t = counter.t, u = 1 - t;
          this.ship.setPosition(u * u * start.x + 2 * u * t * ctrl.x + t * t * end.x, u * u * start.y + 2 * u * t * ctrl.y + t * t * end.y);
        },
        onComplete: () => {
          wake.remove();
          cam.zoomTo(baseZoom, 500, 'Sine.easeInOut');
          for (let i = 0; i < 6; i++) { // arrival splash
            const sp = this.add.image(b.x - 40, b.y, 'sparkle').setScale(0.5).setDepth(7);
            this.tweens.add({ targets: sp, x: sp.x + Math.cos(i) * 40, y: sp.y + Math.sin(i) * 30 - 20, alpha: 0, scale: 0.9, duration: 700, onComplete: () => sp.destroy() });
          }
          this.time.delayedCall(520, finish);
        }
      });
    });
  }

  floatText(island: number, text: string) {
    if (!this.data_ || !this.add) return;
    const p = islandPos(island, this.data_.mapSize);
    const t = this.add.text(p.x, p.y - 40, text, label(26, { color: '#ffd75e' })).setOrigin(0.5).setDepth(8);
    this.tweens.add({ targets: t, y: p.y - 110, alpha: 0, duration: 1800, ease: 'Sine.out', onComplete: () => t.destroy() });
  }
}

// ================================================================ island interior view

export type IslandPole = { author: string; tile: number; text: string };
export type IslandDock = { dir: number; cost: number; coop: boolean; angle: number; label: string };
export type IslandData = {
  seed: Hex;
  island: number;
  name: string;
  isHome: boolean;
  poles: IslandPole[];
  docks: IslandDock[];
  placing: boolean;
  pick: number | null;
  selectedPole: number | null;
};

const T = 64; // world size of one interior tile
const tileXY = (tile: number) => ({ x: ((tile % GRID) - 4) * T, y: (Math.floor(tile / GRID) - 4) * T });
const POLE_COLORS = [0xff5a4f, 0x3f9dff, 0x4cc552, 0xffc93c, 0x9b6bff, 0xff8fd0, 0x1fb59a, 0xff9a3c];
const colorOf = (addr: string) => POLE_COLORS[parseInt(addr.slice(2, 6), 16) % POLE_COLORS.length];
const depthAt = (y: number) => 10 + (y + 1000) / 100;

class IslandScene extends Phaser.Scene {
  data_: IslandData | null = null;
  onTile: (tile: number) => void = () => {};
  onPole: (index: number) => void = () => {};
  onDock: (dir: number) => void = () => {};
  insets = { top: 0, right: 0, bottom: 0 };
  private g!: Phaser.GameObjects.Graphics;
  private foam!: Phaser.GameObjects.Graphics;
  private layer!: Phaser.GameObjects.Container;
  private shownIsland: number | null = null;
  private drawnKey = '';
  private loops: Phaser.Time.TimerEvent[] = [];

  constructor() { super('island'); }

  create() {
    makeArt(this);
    this.cameras.main.setBackgroundColor('#1aa3d4');
    this.add.tileSprite(-3000, -3000, 6000, 6000, 'water').setOrigin(0).setDepth(-10).setTileScale(1 / TEX);
    this.foam = this.add.graphics().setDepth(-2);
    this.g = this.add.graphics().setDepth(0);
    this.layer = this.add.container(0, 0).setDepth(1);
    this.tweens.add({ targets: this.foam, alpha: { from: 0.35, to: 0.9 }, scale: { from: 1, to: 1.025 }, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    panZoom(this, (wx, wy) => this.tap(wx, wy), 0.3, 2.5);
    this.cameras.main.setBounds(-40 * T, -40 * T, 80 * T, 80 * T); // roomy, so fitting above the panel is never clamped
    if (this.data_) this.redraw();
  }

  setData(d: IslandData) {
    this.data_ = d;
    if (this.g) this.redraw();
  }

  /** Fit the whole island (with its docks) into the area not covered by the HUD and panel. */
  fit() {
    const cam = this.cameras?.main;
    if (!cam) return;
    const w = this.scale.width - this.insets.right, h = this.scale.height - this.insets.top - this.insets.bottom;
    cam.setZoom(Phaser.Math.Clamp(Math.min(w, h) / (12.6 * T), 0.3, 1.6));
    cam.centerOn(this.insets.right / 2 / cam.zoom, (this.insets.bottom - this.insets.top) / 2 / cam.zoom);
  }

  private dockPos(angle: number) {
    return { x: Math.cos(angle) * 5 * T, y: Math.sin(angle) * 5 * T };
  }

  private tap(wx: number, wy: number) {
    const d = this.data_;
    if (!d) return;
    for (const dock of d.docks) {
      const p = this.dockPos(dock.angle);
      if (Phaser.Math.Distance.Between(wx, wy, p.x, p.y) < 44) return this.onDock(dock.dir);
    }
    const col = Math.round(wx / T) + 4, row = Math.round(wy / T) + 4;
    if (col < 0 || col >= GRID || row < 0 || row >= GRID) return;
    const tile = row * GRID + col;
    const pole = d.poles.findIndex(p => p.tile === tile);
    if (pole >= 0) return this.onPole(pole);
    if (d.placing && isLand(d.seed, d.island, tile) && tile !== CENTER_TILE) this.onTile(tile);
  }

  private put(key: string, x: number, y: number, scale = 0.5, origin = 0.9) {
    const img = this.add.image(x, y, key).setOrigin(0.5, origin).setScale(scale).setDepth(depthAt(y));
    this.layer.add(img);
    return img;
  }

  private poleObj(x: number, y: number, color: number, text: string, big: boolean, selected: boolean, ghost = false) {
    const k = big ? 1.35 : 1;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.18).fillEllipse(0, 16 * k, 28 * k, 8 * k);
    g.fillStyle(INK).fillRoundedRect(-5 * k, -26 * k, 10 * k, 44 * k, 3 * k);
    g.fillStyle(0xa8672e).fillRoundedRect(-3 * k, -24 * k, 6 * k, 40 * k, 2 * k);
    g.fillStyle(INK).fillRoundedRect(-23 * k, -47 * k, 46 * k, 27 * k, 8 * k);
    g.fillStyle(color).fillRoundedRect(-20 * k, -44 * k, 40 * k, 21 * k, 6 * k);
    g.fillStyle(0xffffff, 0.35).fillRoundedRect(-16 * k, -42 * k, 32 * k, 5 * k, 2 * k);
    const parts: Phaser.GameObjects.GameObject[] = [g];
    if (big) {
      const glow = this.add.circle(0, -66, 26, 0xffd75e, 0.35);
      const lamp = this.add.graphics();
      lamp.fillStyle(INK).fillRoundedRect(-9, -76, 18, 20, 6);
      lamp.fillStyle(0xffc93c).fillRoundedRect(-6.5, -73.5, 13, 15, 4);
      lamp.fillStyle(0xfff6c0).fillRoundedRect(-3, -70, 6, 8, 2);
      parts.push(glow, lamp);
      this.tweens.add({ targets: glow, alpha: { from: 0.2, to: 0.6 }, scale: { from: 0.9, to: 1.15 }, duration: 900, yoyo: true, repeat: -1 });
    }
    parts.push(this.add.text(0, -34 * k, text, label(Math.round(16 * k))).setOrigin(0.5));
    const c = this.add.container(x, y, parts).setDepth(depthAt(y) + 0.5).setAlpha(ghost ? 0.6 : 1);
    c.setSize(56 * k, 100 * k);
    c.setInteractive({ hitArea: new Phaser.Geom.Rectangle(-28 * k, -80 * k, 56 * k, 100 * k), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    hoverGrow(this, c, 1, 1.1);
    if (selected) this.tweens.add({ targets: parts, y: '-=8', duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    if (ghost) this.tweens.add({ targets: c, alpha: { from: 0.35, to: 0.8 }, duration: 600, yoyo: true, repeat: -1 });
    this.layer.add(c);
    return c;
  }

  private dockObj(dock: IslandDock) {
    const p = this.dockPos(dock.angle);
    const inward = { x: -Math.cos(dock.angle), y: -Math.sin(dock.angle) };
    // Pier planks from the beach to the dock bubble.
    const pier = this.add.graphics().setDepth(depthAt(p.y) - 1);
    pier.lineStyle(18, INK, 1).lineBetween(p.x, p.y, p.x + inward.x * 72, p.y + inward.y * 72);
    pier.lineStyle(13, 0xc98a4b, 1).lineBetween(p.x, p.y, p.x + inward.x * 72, p.y + inward.y * 72);
    pier.lineStyle(2, 0x8b5a2b, 1);
    for (let i = 10; i < 72; i += 10) {
      const cx = p.x + inward.x * i, cy = p.y + inward.y * i;
      pier.lineBetween(cx - inward.y * 6, cy + inward.x * 6, cx + inward.y * 6, cy - inward.x * 6);
    }
    this.layer.add(pier);
    const boat = this.add.image(p.x - inward.y * 30, p.y + inward.x * 30, 'boat').setScale(0.55).setDepth(depthAt(p.y) - 0.5);
    this.tweens.add({ targets: boat, y: boat.y + 4, angle: { from: -4, to: 4 }, duration: 1300 + (dock.dir * 170), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.layer.add(boat);
    const color = dock.coop ? 0x6a3fd0 : dock.cost === 2 ? 0xe8950c : 0x1fb59a;
    const g = this.add.graphics();
    g.fillStyle(INK).fillCircle(0, 0, 31);
    g.fillStyle(color).fillCircle(0, 0, 27);
    g.fillStyle(0xffffff, 0.35).fillEllipse(-6, -12, 26, 8);
    const c = this.add.container(p.x, p.y, [g, this.add.text(0, 0, dock.coop ? `${dock.cost}★` : `${dock.cost}`, label(24)).setOrigin(0.5)])
      .setDepth(depthAt(p.y) + 1);
    c.setSize(70, 70).setInteractive({ hitArea: new Phaser.Geom.Circle(0, 0, 34), hitAreaCallback: Phaser.Geom.Circle.Contains, useHandCursor: true });
    hoverGrow(this, c, 1, 1.15);
    this.layer.add([c, this.add.text(p.x + Math.cos(dock.angle) * 46, p.y + Math.sin(dock.angle) * 46, dock.label, label(16, { align: 'center' })).setOrigin(0.5).setDepth(depthAt(p.y) + 1)]);
  }

  redraw() {
    const d = this.data_!;
    const key = JSON.stringify([d.island, d.isHome, d.poles, d.docks.map(x => [x.dir, x.label]), d.placing, d.pick, d.selectedPole]);
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    const g = this.g;
    g.clear(); this.foam.clear();
    this.layer.removeAll(true);
    for (const l of this.loops) l.remove();
    this.loops = [];
    this.tweens.killTweensOf(this.layer.list);
    const theme = THEMES[islandTheme(d.seed, d.island)];
    const land = Array.from({ length: GRID * GRID }, (_, t) => isLand(d.seed, d.island, t));
    const nb = (t: number) => [t - GRID, t + GRID, t % GRID ? t - 1 : -1, t % GRID < GRID - 1 ? t + 1 : -1];
    const inner = (t: number) => land[t] && nb(t).every(n => n >= 0 && land[n]);
    const tiles = land.map((l, t) => (l ? t : -1)).filter(t => t >= 0);

    // Surf, shallow water, ink outline, beach, grass, grass highlights: a soft cartoon island.
    this.foam.lineStyle(7, 0xffffff, 1);
    for (const t of tiles) if (!inner(t)) { const p = tileXY(t); this.foam.strokeCircle(p.x, p.y + 6, T * 1.02); }
    g.fillStyle(0x7fe3f5, 0.85); for (const t of tiles) { const p = tileXY(t); g.fillCircle(p.x, p.y + 6, T * 0.98); }
    g.fillStyle(INK); for (const t of tiles) { const p = tileXY(t); g.fillCircle(p.x, p.y + 5, T * 0.8); }
    g.fillStyle(theme.sand); for (const t of tiles) { const p = tileXY(t); g.fillCircle(p.x, p.y, T * 0.76); }
    g.fillStyle(0xffffff, 0.25); for (const t of tiles) if (!inner(t)) { const p = tileXY(t); g.fillCircle(p.x - 14, p.y + 12, T * 0.12); }
    g.fillStyle(theme.grass); for (const t of tiles) if (inner(t)) { const p = tileXY(t); g.fillCircle(p.x, p.y - 4, T * 0.66); }
    g.fillStyle(theme.light); for (const t of tiles) if (inner(t)) { const p = tileXY(t); g.fillCircle(p.x - 12, p.y - 16, T * 0.2); g.fillCircle(p.x + 14, p.y + 6, T * 0.1); }

    // Sandy paths from the centre to each dock; scenery stays off them.
    const onPath = new Set<number>();
    for (const dock of d.docks) {
      for (let r = 0.6; r < 5; r += 0.32) {
        const x = Math.cos(dock.angle) * r * T, y = Math.sin(dock.angle) * r * T;
        const t = (Math.round(y / T) + 4) * GRID + Math.round(x / T) + 4;
        if (Math.abs(x) > 4.6 * T || Math.abs(y) > 4.6 * T) break;
        if (!land[t]) continue;
        onPath.add(t);
        g.fillStyle(theme.path).fillEllipse(x, y, 22, 14);
      }
    }
    for (const dock of d.docks) this.dockObj(dock);

    const taken = new Set(d.poles.map(p => p.tile));
    const homeTiles = d.isHome ? new Set([30, 31]) : new Set<number>();
    let campfire = -1;
    for (const t of tiles) if (inner(t) && t !== CENTER_TILE && !taken.has(t) && !onPath.has(t) && !homeTiles.has(t) && tileDeco(d.seed, d.island, t) === 0) { campfire = t; break; }
    for (const t of tiles) {
      if (taken.has(t) || t === CENTER_TILE || t === d.pick || homeTiles.has(t)) continue;
      const p = tileXY(t);
      if (d.placing) {
        const hint = this.add.circle(p.x, p.y, T * 0.34, 0xffffff, 0.3).setStrokeStyle(4, 0xffffff, 0.95).setDepth(depthAt(p.y));
        hint.setInteractive({ useHandCursor: true });
        hint.on('pointerover', () => hint.setFillStyle(0xffd75e, 0.7));
        hint.on('pointerout', () => hint.setFillStyle(0xffffff, 0.3));
        this.tweens.add({ targets: hint, scale: { from: 0.9, to: 1.08 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: (t * 37) % 400 });
        this.layer.add(hint);
        continue;
      }
      if (onPath.has(t)) continue;
      if (t === campfire) {
        this.put('logs', p.x, p.y + 6, 0.55, 0.5);
        const flame = this.put('flame', p.x, p.y + 4, 0.55, 1);
        this.tweens.add({ targets: flame, scaleY: 0.68, scaleX: 0.5, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        continue;
      }
      const deco = tileDeco(d.seed, d.island, t);
      if (!inner(t)) { // beach tiles: palms, shells and crabs
        if (deco === 1) this.sway(this.put(theme.palm, p.x, p.y + 10, 0.52, 0.95));
        else if (deco === 2 || deco === 4) this.put('shell', p.x + 6, p.y + 8, 0.6, 0.5);
        else if (deco === 3) {
          const crab = this.put('crab', p.x, p.y + 6, 0.6, 0.5);
          this.tweens.add({ targets: crab, x: p.x + 14, duration: 900 + (t % 5) * 150, yoyo: true, repeat: -1, ease: 'Sine.inOut', hold: 600, repeatDelay: 900 });
        }
        continue;
      }
      if (deco === 1) this.sway(this.put(theme.palm, p.x, p.y + 12, 0.62, 0.95));
      else if (deco === 2) this.put(islandTheme(d.seed, d.island) === 3 ? 'crystal' : islandTheme(d.seed, d.island) === 2 ? 'barrel' : 'rock', p.x, p.y + 10, 0.6, 0.9);
      else if (deco === 3) this.put(islandTheme(d.seed, d.island) === 3 ? 'crystal' : 'bush', p.x, p.y + 10, 0.6, 0.9);
      else if (deco === 4) this.put('flowers', p.x, p.y + 8, 0.6, 0.7);
    }
    const themeId = islandTheme(d.seed, d.island);
    if (themeId === 2) { // volcano behind the island with rising smoke
      const top = Math.min(...tiles.map(t => tileXY(t).y));
      const v = this.put('volcano', 1.6 * T, top + 20, 0.75, 1).setDepth(depthAt(top - 200));
      this.loops.push(this.time.addEvent({ delay: 700, loop: true, callback: () => {
        const sm = this.add.image(v.x + 2, v.y - 62, 'smoke').setScale(0.35).setDepth(v.depth + 0.1).setAlpha(0.9);
        this.tweens.add({ targets: sm, y: sm.y - 70, x: sm.x + 18, scale: 0.9, alpha: 0, duration: 2200, onComplete: () => sm.destroy() });
      } }));
    }
    if (themeId === 3) { // crystal sparkles
      this.loops.push(this.time.addEvent({ delay: 380, loop: true, callback: () => {
        const t = tiles[Math.floor(Math.random() * tiles.length)], p = tileXY(t);
        const sp = this.add.image(p.x + (Math.random() - 0.5) * 40, p.y - 10, 'sparkle').setScale(0.1).setDepth(depthAt(p.y) + 2);
        this.tweens.add({ targets: sp, scale: 0.7, alpha: 0, angle: 90, duration: 900, onComplete: () => sp.destroy() });
      } }));
    }
    if (d.isHome) this.put('hut', -0.6 * T, -1.15 * T, 0.72, 0.9);

    // Note poles: the first stands in the centre with a lantern; others wherever their builders chose.
    if (!d.poles.length) { const c = tileXY(CENTER_TILE); this.poleObj(c.x, c.y, 0xfff6e0, d.placing ? '+' : '?', true, false, true); }
    d.poles.forEach((p, i) => {
      const xy = tileXY(p.tile);
      this.poleObj(xy.x, xy.y, i === 0 ? 0xffc93c : colorOf(p.author), String(i + 1), i === 0, d.selectedPole === i);
    });
    if (d.pick !== null) { const xy = tileXY(d.pick); this.poleObj(xy.x, xy.y, 0xffffff, '+', false, true, true); }

    // Life: gulls gliding over and cloud shadows drifting across.
    for (let i = 0; i < 2; i++) {
      const gull = this.add.image(-7 * T, (-3 + i * 4) * T, 'gull').setScale(0.6).setDepth(200);
      this.tweens.add({ targets: gull, x: 7 * T, duration: 9000 + i * 2500, repeat: -1, yoyo: true, delay: i * 1800,
        onYoyo: () => gull.setFlipX(true), onRepeat: () => gull.setFlipX(false) });
      this.tweens.add({ targets: gull, scaleY: 0.35, duration: 260, yoyo: true, repeat: -1 });
      this.layer.add(gull);
    }
    const cloud = this.add.image(-9 * T, -1 * T, 'cloud').setAlpha(0.08).setScale(1.2).setDepth(199);
    this.tweens.add({ targets: cloud, x: 9 * T, duration: 26000, repeat: -1 });
    this.layer.add(cloud);

    if (this.shownIsland !== d.island) { this.shownIsland = d.island; this.fit(); }
  }

  private sway(img: Phaser.GameObjects.Image) {
    this.tweens.add({ targets: img, angle: { from: -3, to: 3 }, duration: 1500 + Math.random() * 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }
}

// ================================================================ controller

export class SeaMap {
  readonly game: Phaser.Game;
  private scene: SeaScene;
  private islandScene: IslandScene;
  private inside = false;

  constructor(parent: HTMLElement, onSelect: (island: number) => void,
    island: { onTile: (tile: number) => void; onPole: (i: number) => void; onDock: (dir: number) => void }) {
    this.scene = new SeaScene();
    this.scene.onSelect = onSelect;
    this.islandScene = new IslandScene();
    Object.assign(this.islandScene, island);
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: '#1aa3d4',
      antialias: true,
      scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth || 360, height: parent.clientHeight || 640 },
      scene: [this.scene, this.islandScene],
      banner: false,
      input: { mouse: { preventDefaultWheel: true } }
    });
  }

  update(d: MapData) { this.scene.setData(d); }
  setInsets(top: number, right: number, bottom: number) {
    this.scene.insets = { top, right, bottom };
    this.islandScene.insets = { top, right, bottom };
  }
  focus(island: number) { this.scene.focus(island); }

  /** Show the island interior instead of the sea (the sea scene sleeps, keeping its camera). */
  enterIsland(d: IslandData) {
    this.islandScene.setData(d);
    if (this.inside) return;
    this.inside = true;
    this.game.scene.sleep('sea');
    if (this.islandScene.sys.settings.status === Phaser.Scenes.SLEEPING) this.game.scene.wake('island');
    else this.game.scene.start('island');
  }
  updateIsland(d: IslandData) { if (this.inside) this.islandScene.setData(d); }
  leaveIsland() {
    if (!this.inside) return;
    this.inside = false;
    this.game.scene.sleep('island');
    this.game.scene.wake('sea');
  }
  /** Animate the ship between two islands on the sea map (leaves the island view first). */
  async sailTo(from: number, to: number) {
    this.leaveIsland();
    await this.scene.sail(from, to);
  }
  floatText(island: number, text: string) { this.scene.floatText(island, text); }
  zoomBy(f: number) {
    const scene = this.inside ? this.islandScene : this.scene;
    const cam = scene.cameras?.main;
    if (cam) cam.zoomTo(Phaser.Math.Clamp(cam.zoom * f, 0.3, 2.5), 160);
  }
  fitIsland() { this.islandScene.fit(); }
}
