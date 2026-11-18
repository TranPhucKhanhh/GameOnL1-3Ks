// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {LanternSea} from "../src/game/LanternSea.sol";
import {CoopSail} from "../src/game/CoopSail.sol";
import {Shipyard} from "../src/game/Shipyard.sol";
import {BossRaid} from "../src/game/BossRaid.sol";
import {RaidEscrow} from "../src/escrow/RaidEscrow.sol";

interface ScriptVm {
    function startBroadcast() external;
    function stopBroadcast() external;
    function envAddress(string calldata) external returns (address);
    function envBytes32(string calldata) external returns (bytes32);
    function envBool(string calldata) external returns (bool);
    function envUint(string calldata) external returns (uint256);
}

abstract contract TestnetScript {
    ScriptVm internal constant vm = ScriptVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function _guard() internal view {
        require(block.chainid != 43114 && block.chainid != 1, "TESTNET_ONLY");
    }
}

/// @notice Game L1: core, modules and the BossRaid ICM endpoint. Bind the peer afterwards with BindPeers.
contract DeployGame is TestnetScript {
    function run() external returns (LanternSea sea, CoopSail coop, Shipyard yard, BossRaid raid) {
        _guard();
        require(block.chainid != 43113, "USE_OWN_GAME_L1");
        require(block.chainid == vm.envUint("GAME_CHAIN_ID"), "WRONG_GAME_CHAIN_ID");
        address deployer = vm.envAddress("DEPLOYER");
        bool demo = vm.envBool("DEMO_MODE");
        uint16 mapSize = uint16(vm.envUint("MAP_SIZE"));
        vm.startBroadcast();
        sea = new LanternSea(vm.envBytes32("WORLD_SEED"), mapSize, demo, deployer);
        yard = new Shipyard(sea);
        coop = new CoopSail(sea, 60, demo ? 14 : 24);
        raid = new BossRaid(sea, yard, vm.envAddress("GAME_MESSENGER"), vm.envBytes32("ESCROW_BLOCKCHAIN_ID"), deployer);
        sea.setModules(address(coop), address(yard), address(raid));
        vm.stopBroadcast();
    }
}

/// @notice Fuji C-Chain: the raid bounty escrow, using Circle's test USDC (or another test token for rehearsals).
contract DeployEscrow is TestnetScript {
    function run() external returns (RaidEscrow escrow) {
        require(block.chainid == 43113, "FUJI_C_CHAIN_ONLY");
        bool demo = vm.envBool("DEMO_MODE");
        vm.startBroadcast();
        escrow = new RaidEscrow(
            vm.envAddress("USDC_ADDRESS"),
            vm.envAddress("ESCROW_MESSENGER"),
            vm.envBytes32("GAME_BLOCKCHAIN_ID"),
            vm.envAddress("DEPLOYER"),
            100e6,
            demo ? 10 minutes : 3 days
        );
        vm.stopBroadcast();
    }
}

/// @notice One-time peer binding, run on each chain after both deployments (configurator = DEPLOYER).
contract BindGamePeer is TestnetScript {
    function run() external {
        _guard();
        vm.startBroadcast();
        BossRaid(vm.envAddress("RAID_ADDRESS")).setPeer(vm.envAddress("ESCROW_ADDRESS"));
        vm.stopBroadcast();
    }
}

contract BindEscrowPeer is TestnetScript {
    function run() external {
        require(block.chainid == 43113, "FUJI_C_CHAIN_ONLY");
        vm.startBroadcast();
        RaidEscrow(vm.envAddress("ESCROW_ADDRESS")).setPeer(vm.envAddress("RAID_ADDRESS"));
        vm.stopBroadcast();
    }
}
