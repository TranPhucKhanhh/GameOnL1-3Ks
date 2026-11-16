// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Farm} from "../src/Farm.sol";
import {TierVault} from "../src/TierVault.sol";
import {DemoUSD} from "../src/DemoUSD.sol";

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

    // Explicit test-only deployments: Fuji C-Chain + user's own L1 chain ID.
    function _guard() internal view {
        require(block.chainid != 43114 && block.chainid != 1, "TESTNET_ONLY");
    }
}

contract DeployVault is TestnetScript {
    function run() external returns (DemoUSD token, TierVault vault) {
        require(block.chainid == 43113, "FUJI_C_CHAIN_ONLY");
        address deployer = vm.envAddress("DEPLOYER");
        address messenger = vm.envAddress("VAULT_MESSENGER");
        bytes32 gameID = vm.envBytes32("GAME_BLOCKCHAIN_ID");
        bool demo = vm.envBool("DEMO_MODE");
        vm.startBroadcast();
        token = new DemoUSD();
        vault = new TierVault(address(token), messenger, gameID, deployer, demo);
        vm.stopBroadcast();
    }
}

contract DeployFarm is TestnetScript {
    function run() external returns (Farm farm) {
        _guard();
        require(block.chainid != 43113, "USE_OWN_GAME_L1");
        require(block.chainid == vm.envUint("GAME_CHAIN_ID"), "WRONG_GAME_CHAIN_ID");
        address deployer = vm.envAddress("DEPLOYER");
        address messenger = vm.envAddress("GAME_MESSENGER");
        bytes32 vaultID = vm.envBytes32("VAULT_BLOCKCHAIN_ID");
        vm.startBroadcast();
        farm = new Farm(messenger, vaultID, deployer);
        vm.stopBroadcast();
    }
}
