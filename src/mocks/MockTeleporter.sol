// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {
    ITeleporterMessenger,
    ITeleporterReceiver,
    TeleporterMessageInput
} from "../interfaces/ITeleporter.sol";

/// @dev LOCAL TEST ONLY. Anyone can forge messages. This is NOT Warp/ICM authentication.
contract MockTeleporter is ITeleporterMessenger {
    bytes32 public immutable blockchainID;
    uint256 public nonce;
    mapping(bytes32 => bool) public delivered;
    event MessageQueued(
        bytes32 indexed messageId,
        bytes32 indexed destinationBlockchainID,
        address destinationAddress,
        address sender,
        bytes message
    );

    constructor(bytes32 blockchainID_) {
        blockchainID = blockchainID_;
    }

    function sendCrossChainMessage(TeleporterMessageInput calldata input) external returns (bytes32 id) {
        require(input.feeInfo.amount == 0, "ZERO_FEE_ONLY");
        id = keccak256(abi.encode(blockchainID, address(this), ++nonce));
        emit MessageQueued(
            id, input.destinationBlockchainID, input.destinationAddress, msg.sender, input.message
        );
    }

    function deliver(bytes32 id, bytes32 source, address sender, address destination, bytes calldata message)
        external
    {
        require(!delivered[id], "ALREADY_DELIVERED");
        delivered[id] = true;
        ITeleporterReceiver(destination).receiveTeleporterMessage(source, sender, message);
    }
}
