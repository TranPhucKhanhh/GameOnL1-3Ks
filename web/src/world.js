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
