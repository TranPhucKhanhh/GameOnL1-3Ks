// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {LanternSea} from "./LanternSea.sol";

/// @title Shipyard
/// @notice Ships have two stats, damage and multiplier, plus five part slots (hull, sails, cannon, figurehead, flag).
/// Power = damage x mult x (product of x-mult parts). Parts and upgrades cost free in-game coins only.
/// Units: mult is in hundredths (100 = x1.00); xMult is in basis points (10000 = x1.0).
contract Shipyard {
    uint8 public constant SLOTS = 5;
    uint8 public constant PART_COUNT = 15;
    uint256 public constant BASE_DAMAGE = 10;
    uint256 public constant BASE_MULT = 100;
    uint256 public constant DAMAGE_PER_LEVEL = 5;
    uint256 public constant MULT_PER_LEVEL = 10;
    uint8 public constant MAX_LEVEL = 20;

    struct Part {
        uint8 slot;
        uint32 price;
        uint32 addDamage;
        uint32 addMult;
        uint32 xMult;
    }

    struct Stats {
        uint256 damage;
        uint256 mult;
        uint256 xMult;
        uint256 power;
    }

    LanternSea public immutable sea;
    mapping(address => uint8[5]) internal equipped; // part id per slot, 0 = empty
    mapping(address => uint8) public damageLevel;
    mapping(address => uint8) public multLevel;

    event PartInstalled(address indexed captain, uint8 indexed slot, uint8 partId, uint8 replaced);
    event Upgraded(address indexed captain, bool damage, uint8 level);

    error BadPart();
    error AlreadyInstalled();
    error MaxLevel();

    constructor(LanternSea sea_) {
        sea = sea_;
    }

    /// @notice Fixed catalogue. Ids 1-3 hull, 4-6 sails, 7-9 cannon, 10-12 figurehead, 13-15 flag.
    function part(uint8 id) public pure returns (Part memory) {
        if (id == 1) return Part(0, 100, 20, 0, 10_000); // Oak Hull
        if (id == 2) return Part(0, 300, 50, 0, 10_000); // Iron Hull
        if (id == 3) return Part(0, 350, 0, 50, 10_000); // Coral Hull
        if (id == 4) return Part(1, 120, 0, 30, 10_000); // Canvas Sails
        if (id == 5) return Part(1, 320, 0, 60, 10_000); // Silk Sails
        if (id == 6) return Part(1, 500, 0, 0, 12_000); // Storm Sails
        if (id == 7) return Part(2, 150, 30, 0, 10_000); // Bronze Cannon
        if (id == 8) return Part(2, 400, 60, 0, 10_000); // Twin Cannons
        if (id == 9) return Part(2, 800, 0, 0, 15_000); // Dragon Cannon
        if (id == 10) return Part(3, 200, 0, 40, 10_000); // Mermaid Figurehead
        if (id == 11) return Part(3, 450, 40, 20, 10_000); // Lantern Figurehead
        if (id == 12) return Part(3, 600, 0, 0, 13_000); // Kraken Figurehead
        if (id == 13) return Part(4, 50, 10, 0, 10_000); // Jolly Flag
        if (id == 14) return Part(4, 150, 0, 20, 10_000); // Crimson Flag
        if (id == 15) return Part(4, 300, 0, 0, 11_000); // Lantern Banner
        revert BadPart();
    }

    /// @notice Buy a part with coins. It replaces (and discards) whatever was in that slot.
    function buyPart(uint8 id) external {
        Part memory p = part(id);
        uint8 old = equipped[msg.sender][p.slot];
        if (old == id) revert AlreadyInstalled();
        sea.spendCoins(msg.sender, p.price);
        equipped[msg.sender][p.slot] = id;
        emit PartInstalled(msg.sender, p.slot, id, old);
    }

    function upgradeCost(uint8 level, bool damage) public pure returns (uint256) {
        return (damage ? 40 : 60) * (uint256(level) + 1);
    }

    function upgrade(bool damage) external {
        uint8 level = damage ? damageLevel[msg.sender] : multLevel[msg.sender];
        if (level >= MAX_LEVEL) revert MaxLevel();
        sea.spendCoins(msg.sender, upgradeCost(level, damage));
        level += 1;
        if (damage) damageLevel[msg.sender] = level;
        else multLevel[msg.sender] = level;
        emit Upgraded(msg.sender, damage, level);
    }

    function equippedOf(address captain) external view returns (uint8[5] memory) {
        return equipped[captain];
    }

    function statsOf(address captain) public view returns (Stats memory s) {
        s.damage = BASE_DAMAGE + DAMAGE_PER_LEVEL * damageLevel[captain];
        s.mult = BASE_MULT + MULT_PER_LEVEL * multLevel[captain];
        s.xMult = 10_000;
        uint8[5] memory parts = equipped[captain];
        for (uint256 i = 0; i < SLOTS; i++) {
            if (parts[i] == 0) continue;
            Part memory p = part(parts[i]);
            s.damage += p.addDamage;
            s.mult += p.addMult;
            s.xMult = (s.xMult * p.xMult) / 10_000;
        }
        s.power = (s.damage * s.mult * s.xMult) / 1_000_000;
    }

    /// @notice Two captains attacking together: damage and mult add up, x-mults stack.
    function crewPower(address a, address b) external view returns (uint256) {
        Stats memory sa = statsOf(a);
        Stats memory sb = statsOf(b);
        return ((sa.damage + sb.damage) * (sa.mult + sb.mult) * ((sa.xMult * sb.xMult) / 10_000)) / 1_000_000;
    }
}
