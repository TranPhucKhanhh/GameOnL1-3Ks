// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

// Minimal ABI declarations, interoperable with Ava Labs Teleporter v1.
// Reference: https://github.com/ava-labs/icm-contracts/blob/main/contracts/teleporter/ITeleporterMessenger.sol
// These declarations are not an implementation of ICM or signature verification.
struct TeleporterFeeInfo {
    address feeTokenAddress;
    uint256 amount;
}

struct TeleporterMessageInput {
    bytes32 destinationBlockchainID;
    address destinationAddress;
    TeleporterFeeInfo feeInfo;
    uint256 requiredGasLimit;
    address[] allowedRelayerAddresses;
    bytes message;
}

interface ITeleporterMessenger {
    function sendCrossChainMessage(TeleporterMessageInput calldata input) external returns (bytes32);
}

interface ITeleporterReceiver {
    function receiveTeleporterMessage(
        bytes32 sourceBlockchainID,
        address originSenderAddress,
        bytes calldata message
    ) external;
}
