// Mirror of LanternSea's hash geometry, so the map can be drawn without one RPC call per lane.
// Plain JS (with JSDoc) so both the Vite frontend and Node test scripts can import it.
// scripts/e2e.mjs checks these results against the deployed contract.
import { encodeAbiParameters, keccak256 } from 'viem';

const enc = (types, values) => BigInt(keccak256(encodeAbiParameters(types.map(type => ({ type })), values)));

/** @param {`0x${string}`} seed @param {number} island @returns {number} lanes (1..4) */
export function directionCount(seed, island) {
  return 1 + Number(enc(['bytes32', 'uint16', 'string'], [seed, island, 'lanes']) % 4n);
}

/** @returns {{ to: number, cost: number, coop: boolean }} */
export function route(seed, mapSize, island, dir) {
  const h = enc(['bytes32', 'uint16', 'uint8'], [seed, island, dir]);
  let to = Number(h % BigInt(mapSize));
  if (to === island) to = (to + 1) % mapSize;
  const cls = Number((h >> 64n) % 10n);
  const cost = cls < 6 ? 1 : cls < 9 ? 2 : 4 + Number((h >> 128n) % 2n);
  return { to, cost, coop: cost >= 4 };
}

export function lanes(seed, mapSize, island) {
  return Array.from({ length: directionCount(seed, island) }, (_, dir) => ({ dir, ...route(seed, mapSize, island, dir) }));
}

export function gemTypeOf(seed, island) {
  return Number(enc(['bytes32', 'uint16', 'string'], [seed, island, 'gem']) % 4n);
}

export function homeOf(seed, mapSize, captain) {
  return Number(enc(['bytes32', 'address', 'string'], [seed, captain, 'home']) % BigInt(mapSize));
}

export function bossIsland(seed, mapSize, raidId) {
  return Number(enc(['bytes32', 'string', 'uint256'], [seed, 'boss', BigInt(raidId) - 1n]) % BigInt(mapSize));
}

/** 8x8 mirrored pixel mask (hash-shaped island). Returns 64 booleans, row-major. */
export function islandShape(seed, island) {
  const h = enc(['bytes32', 'uint16', 'string'], [seed, island, 'shape']);
  const cells = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const mx = x < 4 ? x : 7 - x;
      const dx = mx - 3.5, dy = y - 3.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const bit = Number((h >> BigInt(y * 4 + (x < 4 ? x : 7 - x))) & 1n);
      cells.push(dist < 2.2 || (dist < 3.6 && bit === 1));
    }
  }
  return cells;
}

/** Cartoon island outline: 4-6 overlapping circles placed by the island's hash, plus a decoration kind. */
export function islandBlobs(seed, island) {
  const h = enc(['bytes32', 'uint16', 'string'], [seed, island, 'shape']);
  const bits = (i, n) => Number((h >> BigInt(i)) & ((1n << BigInt(n)) - 1n));
  const count = 4 + bits(0, 2) % 3;
  const blobs = [{ x: 0, y: 0, r: 22 + bits(2, 3) }];
  for (let i = 1; i < count; i++) {
    const ang = (bits(8 + i * 10, 6) / 64) * Math.PI * 2;
    const dist = 10 + bits(14 + i * 10, 4);
    blobs.push({ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist * 0.7, r: 12 + bits(18 + i * 10, 4) });
  }
  return { blobs, deco: bits(80, 2) }; // 0 palm, 1 two palms, 2 rocks, 3 palm + bush
}

const ADJ = ['Lantern', 'Coral', 'Misty', 'Saltwind', 'Amber', 'Hollow', 'Moonlit', 'Driftwood', 'Sapphire', 'Gull', 'Ember', 'Kelp', 'Thunder', 'Pearl', 'Lonely', 'Whistling'];
const NOUN = ['Cay', 'Reef', 'Atoll', 'Isle', 'Rock', 'Key', 'Haven', 'Shoal', 'Cove', 'Spit', 'Bluff', 'Lagoon'];
export function islandName(island) {
  return `${ADJ[island % ADJ.length]} ${NOUN[Math.floor(island / ADJ.length) % NOUN.length]}`;
}

export const GEMS = ['Pearl', 'Emerald', 'Sapphire', 'Ruby'];
export const GEM_PRICE = [50, 80, 120, 200];

/** Board helpers for the 4x4 sliding puzzle (uint64, nibble per cell, 0 = blank). */
export function decodeBoard(board) {
  const b = BigInt(board);
  return Array.from({ length: 16 }, (_, i) => Number((b >> BigInt(i * 4)) & 0xFn));
}
export function isSolved(cells) {
  return cells.every((v, i) => (i === 15 ? v === 0 : v === i + 1));
}
/** Move the blank: 0 up, 1 down, 2 left, 3 right. Returns new cells or null if illegal. */
export function moveBlank(cells, move) {
  const blank = cells.indexOf(0);
  const row = Math.floor(blank / 4), col = blank % 4;
  const to = move === 0 && row > 0 ? blank - 4 : move === 1 && row < 3 ? blank + 4
    : move === 2 && col > 0 ? blank - 1 : move === 3 && col < 3 ? blank + 1 : -1;
  if (to < 0) return null;
  const next = cells.slice();
  next[blank] = next[to];
  next[to] = 0;
  return next;
}
/** Which blank move slides the tapped cell into the gap, or -1 if not adjacent. */
export function moveForTap(cells, cell) {
  const blank = cells.indexOf(0);
  if (cell === blank - 4 && blank >= 4) return 0;
  if (cell === blank + 4 && blank < 12) return 1;
  if (cell === blank - 1 && blank % 4 !== 0) return 2;
  if (cell === blank + 1 && blank % 4 !== 3) return 3;
  return -1;
}

// ---------------------------------------------------------------- island interior (mirrors LanternSea.isLand)
export const GRID = 9;
export const CENTER_TILE = 40;
export const NOTE_COST = 25;

/** Is interior tile 0..80 land? 8 radial sectors with hash radii; the 3x3 centre is always land. */
export function isLand(seed, island, tile) {
  if (tile < 0 || tile >= GRID * GRID) return false;
  const x = (tile % GRID) - 4, y = Math.floor(tile / GRID) - 4;
  const d2 = x * x + y * y;
  if (d2 <= 2) return true;
  const ax = Math.abs(x), ay = Math.abs(y);
  const sector = y >= 0 ? (x >= 0 ? (ax >= ay ? 0 : 1) : (ax >= ay ? 3 : 2)) : (x < 0 ? (ax >= ay ? 4 : 5) : (ax >= ay ? 7 : 6));
  const h = enc(['bytes32', 'uint16', 'string'], [seed, island, 'land']);
  const r2 = 5 + Number((h >> BigInt(sector * 8)) & 0xFFn) % 12;
  return d2 <= r2;
}

/** Scenery for a free land tile, from the island hash: 0 none, 1 palm, 2 rock, 3 bush, 4 flowers. Cosmetic only. */
export function tileDeco(seed, island, tile) {
  const h = enc(['bytes32', 'uint16', 'string', 'uint8'], [seed, island, 'deco', tile]);
  const v = Number(h % 20n);
  return v < 3 ? 1 : v < 5 ? 2 : v < 7 ? 3 : v < 9 ? 4 : 0;
}

/** Cosmetic island theme from the hash: 0 Tropical, 1 Jungle, 2 Volcanic, 3 Crystal. */
export function islandTheme(seed, island) {
  return Number(enc(['bytes32', 'uint16', 'string'], [seed, island, 'theme']) % 4n);
}
