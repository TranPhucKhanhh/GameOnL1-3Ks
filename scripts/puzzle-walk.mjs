import { encodeAbiParameters, keccak256 } from 'viem';
import { moveBlank, isSolved } from '../web/src/world.js';

// Same walk as SlidePuzzle.walk. Tests use it to produce valid solutions; anyone can recompute it,
// so it is not a secret (documented limitation: the puzzle proves timing/coordination, not skill).
export function walk(seed, depth) {
  let cells = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0];
  let last = 255; const path = [];
  for (let i = 0; i < depth; i++) {
    const pick = BigInt(keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [seed, BigInt(i)])));
    const options = [0, 1, 2, 3].filter(m => moveBlank(cells, m) && (last === 255 || m !== (last ^ 1)));
    const move = options[Number(pick % BigInt(options.length))];
    cells = moveBlank(cells, move); last = move; path.push(move);
  }
  if (isSolved(cells)) { cells = moveBlank(cells, 2); path.push(2); }
  return { cells, path };
}

export function voyageSeed(coop, id, startedAt, captain) {
  return keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'uint64' }, { type: 'address' }],
    [coop, id, startedAt, captain]));
}

/** Blank moves that undo the scramble. */
export const solution = path => path.slice().reverse().map(m => m ^ 1);
