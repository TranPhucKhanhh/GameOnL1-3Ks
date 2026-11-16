// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {CrossChainEndpoint} from "./CrossChainEndpoint.sol";
import {FarmTypes as T} from "./FarmTypes.sol";

interface IERC20 {
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

/// @notice Fixed-term, sponsor-funded TEST rewards. No yield oracle and no admin access to user principal.
contract TierVault is CrossChainEndpoint {
    IERC20 public immutable token;
    bool public immutable demoMode;
    uint256 public totalCredits;
    uint256 public totalPrincipal;
    uint256 public availableRewards;
    uint256 public reservedRewards;
    mapping(address => uint256) public credits;
    mapping(address => mapping(uint8 => Position)) public positions;
    mapping(uint256 => bool) public processed;
    bool private entered;

    struct Position {
        uint256 principal;
        uint256 reward;
        uint64 plantedAt;
        uint64 unlockAt;
    }
    error Reentrant();
    error InvalidRequest();
    error Replay();
    event Deposited(address indexed player, uint256 amount);
    event Withdrawn(address indexed player, uint256 amount);
    event RewardsFunded(address indexed sponsor, uint256 amount);
    event RequestProcessed(
        uint256 indexed id, address indexed player, uint8 slot, T.Action action, T.Result result
    );

    modifier nonReentrant() {
        if (entered) revert Reentrant();
        entered = true;
        _;
        entered = false;
    }

    constructor(
        address token_,
        address messenger_,
        bytes32 gameBlockchainID_,
        address configurator_,
        bool demoMode_
    ) CrossChainEndpoint(messenger_, gameBlockchainID_, configurator_) {
        if (token_.code.length == 0) revert BadConfiguration();
        token = IERC20(token_);
        demoMode = demoMode_;
    }

    function tierConfig(uint8 tier) public view returns (uint64 duration, uint16 rewardBps) {
        if (tier > 2) revert InvalidRequest();
        if (demoMode) duration = tier == 0 ? 60 : tier == 1 ? 120 : 180;
        else duration = tier == 0 ? uint64(7 days) : tier == 1 ? uint64(30 days) : uint64(90 days);
        rewardBps = tier == 0 ? 100 : tier == 1 ? 300 : 800;
    }

    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidRequest();
        require(token.transferFrom(msg.sender, address(this), amount), "TRANSFER_FAILED");
        credits[msg.sender] += amount;
        totalCredits += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0 || amount > credits[msg.sender]) revert InvalidRequest();
        credits[msg.sender] -= amount;
        totalCredits -= amount;
        require(token.transfer(msg.sender, amount), "TRANSFER_FAILED");
        emit Withdrawn(msg.sender, amount);
    }

    function fundRewards(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidRequest();
        require(token.transferFrom(msg.sender, address(this), amount), "TRANSFER_FAILED");
        availableRewards += amount;
        emit RewardsFunded(msg.sender, amount);
    }

    function receiveTeleporterMessage(bytes32 source, address sender, bytes calldata message)
        external
        override
        nonReentrant
    {
        _authenticate(source, sender);
        T.Request memory r = abi.decode(message, (T.Request));
        if (r.id == 0 || r.player == address(0) || r.slot >= 6 || r.tier > 2) revert InvalidRequest();
        if (processed[r.id]) revert Replay();
        processed[r.id] = true;
        T.Reply memory reply = T.Reply(r.id, r.player, r.slot, r.action, T.Result.Ok, 0, 0, 0, 0);
        if (r.action == T.Action.Plant) _plant(r, reply);
        else _finish(r, reply);
        // If queuing the ACK fails, the entire accounting transition rolls back.
        _send(abi.encode(reply));
        emit RequestProcessed(r.id, r.player, r.slot, r.action, reply.result);
    }

    function _plant(T.Request memory r, T.Reply memory reply) private {
        if (r.amount < 1e6 || r.amount > 1000e6) revert InvalidRequest();
        Position storage p = positions[r.player][r.slot];
        (uint64 duration, uint16 bps) = tierConfig(r.tier);
        uint256 reward = r.amount * bps / 10_000;
        if (p.principal != 0) {
            reply.result = T.Result.Occupied;
            return;
        }
        if (credits[r.player] < r.amount) {
            reply.result = T.Result.InsufficientCredits;
            return;
        }
        if (availableRewards < reward) {
            reply.result = T.Result.InsufficientRewards;
            return;
        }
        credits[r.player] -= r.amount;
        totalCredits -= r.amount;
        totalPrincipal += r.amount;
        availableRewards -= reward;
        reservedRewards += reward;
        p.principal = r.amount;
        p.reward = reward;
        p.plantedAt = uint64(block.timestamp);
        p.unlockAt = uint64(block.timestamp) + duration;
        _copy(p, reply);
    }

    function _finish(T.Request memory r, T.Reply memory reply) private {
        Position storage p = positions[r.player][r.slot];
        if (p.principal == 0) {
            reply.result = T.Result.NoPosition;
            return;
        }
        if (r.action == T.Action.Harvest && block.timestamp < p.unlockAt) {
            reply.result = T.Result.NotMature;
            return;
        }
        _copy(p, reply);
        uint256 payout = p.principal;
        totalPrincipal -= p.principal;
        reservedRewards -= p.reward;
        if (r.action == T.Action.Harvest) {
            payout += p.reward;
        } else {
            availableRewards += p.reward;
            reply.reward = 0;
        }
        credits[r.player] += payout;
        totalCredits += payout;
        delete positions[r.player][r.slot];
    }

    function _copy(Position storage p, T.Reply memory reply) private view {
        reply.plantedAt = p.plantedAt;
        reply.unlockAt = p.unlockAt;
        reply.principal = p.principal;
        reply.reward = p.reward;
    }
}
