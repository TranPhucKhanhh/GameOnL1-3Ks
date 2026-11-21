// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {CrossChainEndpoint} from "../CrossChainEndpoint.sol";
import {LanternSea} from "./LanternSea.sol";
import {Shipyard} from "./Shipyard.sol";
import {SeaMessages} from "../lib/SeaMessages.sol";

/// @title BossRaid (Game L1)
/// @notice One boss per epoch on a fixed schedule (hash of the epoch picks its island; HP follows a fixed table).
/// A two-captain co-op crew leads the raid and may escrow test USDC on C-Chain as a bounty for helpers.
/// Every attack costs one sailing charge (the trip to the boss). If the boss falls before the epoch ends,
/// the lead crew gets the boss coins, and helpers are paid from the escrow by their share of total damage.
/// The game never pays money itself; the escrow only moves what the lead crew put in.
contract BossRaid is CrossChainEndpoint {
    enum Status {
        None,
        Proposed,
        Active,
        Defeated,
        Failed
    }

    struct Raid {
        address leadA;
        address leadB;
        Status status;
        bool settled;
        uint16 island;
        uint64 proposedAt;
        uint64 deadline;
        uint256 maxHp;
        uint256 hp;
        uint256 totalDamage;
        uint256 bounty;
    }

    uint256 public constant MAX_HELPERS = 20;
    uint64 public constant PROPOSAL_TTL = 2 minutes;

    LanternSea public immutable sea;
    Shipyard public immutable shipyard;
    uint64 public immutable bossEpoch;

    mapping(uint256 => Raid) public raids;
    mapping(uint256 => address[]) internal helperList;
    mapping(uint256 => mapping(address => uint256)) public damageOf;

    event RaidProposed(uint256 indexed raidId, address indexed leadA, address indexed leadB);
    event RaidOpened(uint256 indexed raidId, address leadA, address leadB, uint16 island, uint256 hp, uint64 deadline);
    event Attacked(uint256 indexed raidId, address indexed captain, uint256 damage, uint256 hpLeft, bool lead);
    event BossDefeated(uint256 indexed raidId);
    event RaidSettled(uint256 indexed raidId, bool defeated, uint256 coinsPerLead);
    event BountyUpdated(uint256 indexed raidId, uint256 bounty);

    error WrongStatus();
    error NotCrew();
    error RaidOver();
    error RaidRunning();
    error HelpersFull();
    error NotThisEpoch();
    error BadMessage();

    constructor(
        LanternSea sea_,
        Shipyard shipyard_,
        address messenger_,
        bytes32 escrowBlockchainID_,
        address configurator_
    ) CrossChainEndpoint(messenger_, escrowBlockchainID_, configurator_) {
        sea = sea_;
        shipyard = shipyard_;
        bossEpoch = sea_.demoMode() ? 10 minutes : 1 days;
    }

    // ---------------------------------------------------------------- schedule

    function currentRaidId() public view returns (uint256) {
        return block.timestamp / bossEpoch + 1;
    }

    /// @notice Boss for a raid id: island, hit points, coin reward for the lead crew, and when it leaves.
    function bossOf(uint256 raidId) public view returns (uint16 island, uint256 maxHp, uint256 coins, uint64 endsAt) {
        uint256 epoch = raidId - 1;
        island = uint16(uint256(keccak256(abi.encode(sea.worldSeed(), "boss", epoch))) % sea.mapSize());
        uint256 tier = epoch % 4;
        maxHp = tier == 0 ? 1500 : tier == 1 ? 2500 : tier == 2 ? 4000 : 6000;
        coins = maxHp / 5;
        endsAt = uint64((epoch + 1) * bossEpoch);
    }

    // ---------------------------------------------------------------- lead crew

    /// @notice Propose leading this epoch's raid with a partner. A stale, unaccepted proposal can be replaced.
    function proposeLead(address partner) external returns (uint256 raidId) {
        raidId = currentRaidId();
        Raid storage r = raids[raidId];
        if (partner == msg.sender || !sea.isRegistered(msg.sender) || !sea.isRegistered(partner)) revert NotCrew();
        if (r.status == Status.Proposed && block.timestamp <= r.proposedAt + PROPOSAL_TTL) revert WrongStatus();
        if (r.status != Status.None && r.status != Status.Proposed) revert WrongStatus();
        r.leadA = msg.sender;
        r.leadB = partner;
        r.status = Status.Proposed;
        r.proposedAt = uint64(block.timestamp);
        emit RaidProposed(raidId, msg.sender, partner);
    }

    /// @notice Partner accepts; the raid opens and the escrow on C-Chain is told who may fund it.
    function acceptLead(uint256 raidId) external {
        if (raidId != currentRaidId()) revert NotThisEpoch();
        Raid storage r = raids[raidId];
        if (r.status != Status.Proposed) revert WrongStatus();
        if (msg.sender != r.leadB) revert NotCrew();
        (uint16 island, uint256 maxHp,, uint64 endsAt) = bossOf(raidId);
        r.status = Status.Active;
        r.island = island;
        r.maxHp = maxHp;
        r.hp = maxHp;
        r.deadline = endsAt;
        _send(abi.encode(SeaMessages.RAID_OPENED, abi.encode(raidId, r.leadA, r.leadB, endsAt)));
        emit RaidOpened(raidId, r.leadA, r.leadB, island, maxHp, endsAt);
    }

    // ---------------------------------------------------------------- combat

    /// @notice Sail to the boss (1 charge) and attack. Lead captains hit with combined crew power.
    function attack(uint256 raidId) external {
        Raid storage r = raids[raidId];
        if (r.status != Status.Active) revert WrongStatus();
        if (block.timestamp >= r.deadline) revert RaidOver();
        bool lead = msg.sender == r.leadA || msg.sender == r.leadB;
        if (!lead && damageOf[raidId][msg.sender] == 0) {
            if (helperList[raidId].length >= MAX_HELPERS) revert HelpersFull();
            helperList[raidId].push(msg.sender);
        }
        sea.spendCharges(msg.sender, 1);
        uint256 dmg = lead ? shipyard.crewPower(r.leadA, r.leadB) : shipyard.statsOf(msg.sender).power;
        if (dmg > r.hp) dmg = r.hp;
        r.hp -= dmg;
        r.totalDamage += dmg;
        damageOf[raidId][msg.sender] += dmg;
        emit Attacked(raidId, msg.sender, dmg, r.hp, lead);
        if (r.hp == 0) {
            r.status = Status.Defeated;
            emit BossDefeated(raidId);
        }
    }

    /// @notice Close a finished raid and tell the escrow how to pay. Anyone may call it.
    function settle(uint256 raidId) external {
        Raid storage r = raids[raidId];
        if (r.settled) revert WrongStatus();
        if (r.status == Status.Active) {
            if (block.timestamp < r.deadline) revert RaidRunning();
            r.status = Status.Failed;
        } else if (r.status != Status.Defeated) {
            revert WrongStatus();
        }
        r.settled = true;
        bool defeated = r.status == Status.Defeated;
        uint256 perLead;
        if (defeated) {
            (,, uint256 coins,) = bossOf(raidId);
            perLead = coins / 2;
            sea.addCoins(r.leadA, perLead);
            sea.addCoins(r.leadB, perLead);
        }
        address[] storage list = helperList[raidId];
        uint256[] memory dmg = new uint256[](list.length);
        for (uint256 i = 0; i < list.length; i++) {
            dmg[i] = damageOf[raidId][list[i]];
        }
        _send(abi.encode(SeaMessages.RAID_SETTLED, abi.encode(raidId, defeated, list, dmg, r.totalDamage)));
        emit RaidSettled(raidId, defeated, perLead);
    }

    // ---------------------------------------------------------------- ICM

    function receiveTeleporterMessage(bytes32 sourceBlockchainID, address originSenderAddress, bytes calldata message)
        external
    {
        _authenticate(sourceBlockchainID, originSenderAddress);
        (uint8 kind, bytes memory body) = abi.decode(message, (uint8, bytes));
        if (kind != SeaMessages.BOUNTY_FUNDED) revert BadMessage();
        (uint256 raidId, uint256 total) = abi.decode(body, (uint256, uint256));
        // Funding messages carry cumulative totals and may arrive out of order.
        if (total <= raids[raidId].bounty) return;
        raids[raidId].bounty = total;
        emit BountyUpdated(raidId, total);
    }

    // ---------------------------------------------------------------- views

    function helpersOf(uint256 raidId) external view returns (address[] memory list, uint256[] memory dmg) {
        list = helperList[raidId];
        dmg = new uint256[](list.length);
        for (uint256 i = 0; i < list.length; i++) {
            dmg[i] = damageOf[raidId][list[i]];
        }
    }

    /// @notice Until when `a` and `b` lead this epoch's open raid together; 0 if they do not.
    /// LanternSea uses it so a lead crew can visit each other's islands while the raid lasts.
    function crewUntil(address a, address b) external view returns (uint64) {
        Raid storage r = raids[currentRaidId()];
        if (r.status != Status.Active && r.status != Status.Defeated) return 0;
        bool pair = (a == r.leadA && b == r.leadB) || (a == r.leadB && b == r.leadA);
        return pair ? r.deadline : 0;
    }

    function raidView(uint256 raidId) external view returns (Raid memory) {
        return raids[raidId];
    }
}
