// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/// @notice 4x4 sliding puzzle packed into 16 nibbles of a uint64.
/// Nibble at cell i (row-major, cell 0 is top-left) holds the tile number; 0 is the blank.
/// A move names the direction the BLANK travels: 0 up, 1 down, 2 left, 3 right.
/// The scramble is derived from a seed so every player and the contract see the same board;
/// it decides puzzle layout only, never a reward.
library SlidePuzzle {
    /// Tiles 1..15 in order, blank in the last cell.
    uint64 internal constant SOLVED = 0x0FEDCBA987654321;
    uint256 internal constant MAX_MOVES = 300;

    error IllegalMove(uint256 index);
    error TooManyMoves();

    function tileAt(uint64 board, uint256 cell) internal pure returns (uint8) {
        return uint8((board >> uint64(cell * 4)) & 0xF);
    }

    function blankOf(uint64 board) internal pure returns (uint256 cell) {
        for (cell = 0; cell < 16; cell++) {
            if (tileAt(board, cell) == 0) return cell;
        }
        revert IllegalMove(type(uint256).max);
    }

    function _target(uint256 blank, uint8 move) private pure returns (bool ok, uint256 to) {
        uint256 row = blank / 4;
        uint256 col = blank % 4;
        if (move == 0 && row > 0) return (true, blank - 4);
        if (move == 1 && row < 3) return (true, blank + 4);
        if (move == 2 && col > 0) return (true, blank - 1);
        if (move == 3 && col < 3) return (true, blank + 1);
        return (false, 0);
    }

    function _swap(uint64 board, uint256 blank, uint256 to) private pure returns (uint64) {
        uint64 tile = (board >> uint64(to * 4)) & 0xF;
        board &= ~(uint64(0xF) << uint64(to * 4));
        board |= tile << uint64(blank * 4);
        return board;
    }

    /// @notice Deterministic scramble: a walk of `depth` blank moves that never undoes the previous move.
    function scramble(bytes32 seed, uint256 depth) internal pure returns (uint64 board) {
        (board,) = walk(seed, depth);
    }

    /// @notice The scramble plus the blank's path (used by tests; anyone can recompute it, so it is not a secret).
    function walk(bytes32 seed, uint256 depth) internal pure returns (uint64 board, bytes memory path) {
        path = new bytes(depth + 1);
        board = SOLVED;
        uint256 blank = 15;
        uint8 last = 255;
        for (uint256 i = 0; i < depth; i++) {
            uint256 pick = uint256(keccak256(abi.encode(seed, i)));
            uint8[4] memory options;
            uint8 n;
            for (uint8 m = 0; m < 4; m++) {
                (bool ok,) = _target(blank, m);
                // m ^ 1 is the opposite direction (0<->1, 2<->3).
                if (ok && (last == 255 || m != (last ^ 1))) options[n++] = m;
            }
            uint8 move = options[pick % n];
            (, uint256 to) = _target(blank, move);
            board = _swap(board, blank, to);
            blank = to;
            last = move;
            path[i] = bytes1(move);
        }
        uint256 len = depth;
        // A non-reversing walk can, rarely, return to the solved state; nudge it so the puzzle is never trivial.
        if (board == SOLVED) {
            board = _swap(board, 15, 14);
            path[len++] = bytes1(uint8(2));
        }
        assembly {
            mstore(path, len)
        }
    }

    /// @notice Applies `moves` (one byte per move) and returns the resulting board. Reverts on an illegal move.
    function apply_(uint64 board, bytes calldata moves) internal pure returns (uint64) {
        if (moves.length > MAX_MOVES) revert TooManyMoves();
        uint256 blank = blankOf(board);
        for (uint256 i = 0; i < moves.length; i++) {
            (bool ok, uint256 to) = _target(blank, uint8(moves[i]));
            if (!ok) revert IllegalMove(i);
            board = _swap(board, blank, to);
            blank = to;
        }
        return board;
    }

    function solves(uint64 board, bytes calldata moves) internal pure returns (bool) {
        return apply_(board, moves) == SOLVED;
    }
}
