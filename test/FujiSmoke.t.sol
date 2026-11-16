// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Farm} from "../src/Farm.sol";
import {TierVault} from "../src/TierVault.sol";

interface ForkVm {
    function envOr(string calldata, bool) external returns (bool);
    function envString(string calldata) external returns (string memory);
    function envAddress(string calldata) external returns (address);
    function envBytes32(string calldata) external returns (bytes32);
    function envUint(string calldata) external returns (uint256);
    function createSelectFork(string calldata) external returns (uint256);
    function skip(bool) external;
}

interface Warp {
    function getBlockchainID() external view returns (bytes32);
}

/// @notice Read-only remote deployment checks. A fork does not relay real ICM messages or broadcast transactions.
contract FujiSmokeTest {
    ForkVm private constant vm = ForkVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    Warp private constant warp = Warp(0x0200000000000000000000000000000000000005);

    function testRemoteDeploymentWiring() public {
        if (!vm.envOr("RUN_FUJI_SMOKE", false)) vm.skip(true);
        address farmAddress = vm.envAddress("FARM_ADDRESS");
        address vaultAddress = vm.envAddress("VAULT_ADDRESS");
        bytes32 gameID = vm.envBytes32("GAME_BLOCKCHAIN_ID");
        bytes32 vaultID = vm.envBytes32("VAULT_BLOCKCHAIN_ID");
        address vaultMessenger = vm.envAddress("VAULT_MESSENGER");
        address gameMessenger = vm.envAddress("GAME_MESSENGER");
        address token = vm.envAddress("TOKEN_ADDRESS");
        vm.createSelectFork(vm.envString("FUJI_RPC_URL"));
        require(block.chainid == 43113, "NOT_FUJI");
        require(warp.getBlockchainID() == vaultID, "VAULT_WARP_ID");
        TierVault vault = TierVault(vaultAddress);
        require(vault.peer() == farmAddress && vault.peerBlockchainID() == gameID, "VAULT_PEER");
        require(
            address(vault.messenger()) == vaultMessenger && vaultMessenger.code.length > 0, "VAULT_MESSENGER"
        );
        require(address(vault.token()) == token && token.code.length > 0, "TOKEN");
        vm.createSelectFork(vm.envString("GAME_RPC_URL"));
        require(block.chainid == vm.envUint("GAME_CHAIN_ID"), "NOT_GAME_L1");
        require(warp.getBlockchainID() == gameID, "GAME_WARP_ID");
        Farm farm = Farm(farmAddress);
        require(farm.peer() == vaultAddress && farm.peerBlockchainID() == vaultID, "FARM_PEER");
        require(address(farm.messenger()) == gameMessenger && gameMessenger.code.length > 0, "GAME_MESSENGER");
    }
}
