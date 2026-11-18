// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {LanternSea} from "./LanternSea.sol";
import {SlidePuzzle} from "../lib/SlidePuzzle.sol";

/// @title CoopSail
/// @notice Co-op lanes cost 4-5 charges, more than one captain can hold (3), so two captains pool charges.
/// After both commit, each gets a 4x4 sliding puzzle; BOTH must submit a valid solution within the window.
/// The contract replays the moves, so the chain checks the result rather than trusting the client.
contract CoopSail {
    enum Status {
        None,
        Proposed,
        Sailing,
        Landed,
        Lost,
        Cancelled
    }

    struct Voyage {
        address a;
        address b;
        uint16 from;
        uint16 to;
        uint8 dir;
        uint8 cost;
        uint8 aCharges;
        Status status;
        uint64 startedAt;
        uint64 aSolvedAt;
        uint64 bSolvedAt;
        bool fresh;
    }

    LanternSea public immutable sea;
    uint64 public immutable window; // seconds both captains have to solve
    uint256 public immutable scrambleDepth;

    uint256 public voyageCount;
    mapping(uint256 => Voyage) public voyages;

    event VoyageProposed(uint256 indexed id, address indexed a, address indexed b, uint16 from, uint8 dir, uint16 to);
    event VoyageStarted(uint256 indexed id, uint64 startedAt, uint64 deadline);
    event PuzzleSolved(uint256 indexed id, address indexed captain, uint64 at);
    event VoyageLanded(uint256 indexed id, uint16 to, bool fresh, uint256 speedBps);
    event VoyageLost(uint256 indexed id);
    event VoyageCancelled(uint256 indexed id);

    error BadVoyage();
    error NotCoopLane();
    error BadCharges();
    error WrongStatus();
    error NotCrew();
    error WindowClosed();
    error WindowOpen();
    error AlreadySolved();
    error WrongSolution();

    constructor(LanternSea sea_, uint64 window_, uint256 scrambleDepth_) {
        sea = sea_;
        window = window_;
        scrambleDepth = scrambleDepth_;
    }

    /// @notice Propose a co-op voyage from an island you visited. `myCharges` is your share; the partner pays the rest.
    function propose(address partner, uint16 from, uint8 dir, uint8 myCharges) external returns (uint256 id) {
        if (partner == msg.sender || !sea.isRegistered(partner)) revert BadVoyage();
        if (!sea.visited(msg.sender, from)) revert BadVoyage();
        (uint16 to, uint8 cost) = sea.route(from, dir);
        if (cost < sea.COOP_MIN_COST()) revert NotCoopLane();
        uint8 max = sea.MAX_CHARGES();
        if (myCharges == 0 || myCharges > max || cost - myCharges > max || cost - myCharges == 0) revert BadCharges();
        id = ++voyageCount;
        Voyage storage v = voyages[id];
        v.a = msg.sender;
        v.b = partner;
        v.from = from;
        v.to = to;
        v.dir = dir;
        v.cost = cost;
        v.aCharges = myCharges;
        v.status = Status.Proposed;
        emit VoyageProposed(id, msg.sender, partner, from, dir, to);
    }

    /// @notice Partner accepts: both captains' charges are spent now and the puzzle clock starts.
    function join(uint256 id) external {
        Voyage storage v = voyages[id];
        if (v.status != Status.Proposed) revert WrongStatus();
        if (msg.sender != v.b) revert NotCrew();
        sea.spendCharges(v.a, v.aCharges);
        sea.spendCharges(v.b, v.cost - v.aCharges);
        v.status = Status.Sailing;
        v.startedAt = uint64(block.timestamp);
        emit VoyageStarted(id, v.startedAt, v.startedAt + window);
    }

    function cancel(uint256 id) external {
        Voyage storage v = voyages[id];
        if (v.status != Status.Proposed) revert WrongStatus();
        if (msg.sender != v.a && msg.sender != v.b) revert NotCrew();
        v.status = Status.Cancelled;
        emit VoyageCancelled(id);
    }

    /// @notice The board this captain must solve. Each captain gets a different layout of the same difficulty.
    function puzzleOf(uint256 id, address captain) public view returns (uint64) {
        Voyage storage v = voyages[id];
        if (v.status == Status.None || v.status == Status.Proposed || v.status == Status.Cancelled) revert WrongStatus();
        if (captain != v.a && captain != v.b) revert NotCrew();
        return SlidePuzzle.scramble(keccak256(abi.encode(address(this), id, v.startedAt, captain)), scrambleDepth);
    }

    /// @notice Submit your move list. When the second valid solution lands inside the window, the crew lands.
    function solve(uint256 id, bytes calldata moves) external {
        Voyage storage v = voyages[id];
        if (v.status != Status.Sailing) revert WrongStatus();
        if (block.timestamp > v.startedAt + window) revert WindowClosed();
        bool isA = msg.sender == v.a;
        if (!isA && msg.sender != v.b) revert NotCrew();
        if ((isA ? v.aSolvedAt : v.bSolvedAt) != 0) revert AlreadySolved();
        if (!SlidePuzzle.solves(puzzleOf(id, msg.sender), moves)) revert WrongSolution();
        uint64 now_ = uint64(block.timestamp);
        // Store at least 1 so "solved at the start second" is distinguishable from "not solved".
        uint64 mark = now_ - v.startedAt + 1;
        if (isA) v.aSolvedAt = mark;
        else v.bSolvedAt = mark;
        emit PuzzleSolved(id, msg.sender, now_);
        if (v.aSolvedAt != 0 && v.bSolvedAt != 0) {
            uint64 slowest = (v.aSolvedAt > v.bSolvedAt ? v.aSolvedAt : v.bSolvedAt) - 1;
            uint256 speedBps = slowest >= window ? 0 : (uint256(window - slowest) * 10_000) / window;
            v.status = Status.Landed;
            v.fresh = sea.coopArrive(v.a, v.b, v.to, speedBps);
            emit VoyageLanded(id, v.to, v.fresh, speedBps);
        }
    }

    /// @notice After the window, anyone can mark an unfinished voyage as lost. Charges are not returned.
    function expire(uint256 id) external {
        Voyage storage v = voyages[id];
        if (v.status != Status.Sailing) revert WrongStatus();
        if (block.timestamp <= v.startedAt + window) revert WindowOpen();
        v.status = Status.Lost;
        emit VoyageLost(id);
    }

    function deadlineOf(uint256 id) external view returns (uint64) {
        Voyage storage v = voyages[id];
        return v.startedAt == 0 ? 0 : v.startedAt + window;
    }
}
