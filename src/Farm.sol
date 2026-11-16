// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {CrossChainEndpoint} from "./CrossChainEndpoint.sol";
import {FarmTypes as T} from "./FarmTypes.sol";

/// @notice Game state on the Game L1. Balances and rewards are authoritative on TierVault's chain.
contract Farm is CrossChainEndpoint {
    uint8 public constant PLOTS = 6;
    uint256 public nextRequestId;
    mapping(address => mapping(uint8 => T.Plot)) private plots;
    mapping(address => uint256) public harvestCount;
    mapping(address => uint256) public totalRewards;

    error InvalidPlot();
    error InvalidTier();
    error InvalidAmount();
    error InvalidState();
    error StaleReply();
    event ActionRequested(
        uint256 indexed id, address indexed player, uint8 slot, T.Action action, bytes32 messageId
    );
    event ActionResolved(
        uint256 indexed id, address indexed player, uint8 slot, T.Action action, T.Result result
    );

    constructor(address messenger_, bytes32 vaultBlockchainID_, address configurator_)
        CrossChainEndpoint(messenger_, vaultBlockchainID_, configurator_)
    {}

    function getPlot(address player, uint8 slot) external view returns (T.Plot memory) {
        return plots[player][slot];
    }

    function plant(uint8 slot, uint8 tier, uint256 amount) external {
        if (slot >= PLOTS) revert InvalidPlot();
        if (tier > 2) revert InvalidTier();
        if (amount < 1e6 || amount > 1000e6) revert InvalidAmount();
        T.Plot storage p = plots[msg.sender][slot];
        if (p.status != T.Status.Empty) revert InvalidState();
        p.tier = tier;
        p.status = T.Status.PlantPending;
        _request(slot, T.Action.Plant, tier, amount);
    }

    function harvest(uint8 slot) external {
        _finish(slot, T.Action.Harvest);
    }

    function uproot(uint8 slot) external {
        _finish(slot, T.Action.Uproot);
    }

    function _finish(uint8 slot, T.Action action) private {
        if (slot >= PLOTS) revert InvalidPlot();
        T.Plot storage p = plots[msg.sender][slot];
        if (p.status != T.Status.Growing) revert InvalidState();
        p.status = action == T.Action.Harvest ? T.Status.HarvestPending : T.Status.UprootPending;
        _request(slot, action, p.tier, p.principal);
    }

    function _request(uint8 slot, T.Action action, uint8 tier, uint256 amount) private {
        uint256 id = ++nextRequestId;
        plots[msg.sender][slot].requestId = id;
        bytes32 messageId = _send(abi.encode(T.Request(id, msg.sender, slot, action, tier, amount)));
        emit ActionRequested(id, msg.sender, slot, action, messageId);
    }

    function receiveTeleporterMessage(bytes32 source, address sender, bytes calldata message)
        external
        override
    {
        _authenticate(source, sender);
        T.Reply memory r = abi.decode(message, (T.Reply));
        T.Plot storage p = plots[r.player][r.slot];
        T.Status expected = r.action == T.Action.Plant
            ? T.Status.PlantPending
            : r.action == T.Action.Harvest ? T.Status.HarvestPending : T.Status.UprootPending;
        if (p.requestId != r.id || p.status != expected) revert StaleReply();
        if (r.action == T.Action.Plant) {
            if (r.result == T.Result.Ok) {
                p.status = T.Status.Growing;
                p.plantedAt = r.plantedAt;
                p.unlockAt = r.unlockAt;
                p.principal = r.principal;
                p.reward = r.reward;
            } else {
                delete plots[r.player][r.slot];
            }
        } else if (r.result == T.Result.Ok) {
            if (r.action == T.Action.Harvest) {
                ++harvestCount[r.player];
                totalRewards[r.player] += r.reward;
            }
            delete plots[r.player][r.slot];
        } else {
            p.status = T.Status.Growing;
        }
        emit ActionResolved(r.id, r.player, r.slot, r.action, r.result);
    }
}
