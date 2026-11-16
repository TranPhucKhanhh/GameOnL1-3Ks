// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {
    ITeleporterMessenger,
    ITeleporterReceiver,
    TeleporterMessageInput,
    TeleporterFeeInfo
} from "./interfaces/ITeleporter.sol";

abstract contract CrossChainEndpoint is ITeleporterReceiver {
    ITeleporterMessenger public immutable messenger;
    bytes32 public immutable peerBlockchainID;
    address public immutable configurator;
    address public peer;

    error Unauthorized();
    error BadConfiguration();
    error PeerAlreadySet();
    event PeerSet(address indexed peer);

    constructor(address messenger_, bytes32 peerBlockchainID_, address configurator_) {
        if (messenger_.code.length == 0 || peerBlockchainID_ == bytes32(0) || configurator_ == address(0)) {
            revert BadConfiguration();
        }
        messenger = ITeleporterMessenger(messenger_);
        peerBlockchainID = peerBlockchainID_;
        configurator = configurator_;
    }

    // One-time binding only; there is no admin withdrawal or upgrade function.
    function setPeer(address peer_) external {
        if (msg.sender != configurator) revert Unauthorized();
        if (peer != address(0)) revert PeerAlreadySet();
        if (peer_ == address(0)) revert BadConfiguration();
        peer = peer_;
        emit PeerSet(peer_);
    }

    function _authenticate(bytes32 sourceBlockchainID, address originSenderAddress) internal view {
        if (
            msg.sender != address(messenger) || peer == address(0) || sourceBlockchainID != peerBlockchainID
                || originSenderAddress != peer
        ) revert Unauthorized();
    }

    function _send(bytes memory message) internal returns (bytes32) {
        if (peer == address(0)) revert BadConfiguration();
        return messenger.sendCrossChainMessage(
            TeleporterMessageInput({
                destinationBlockchainID: peerBlockchainID,
                destinationAddress: peer,
                feeInfo: TeleporterFeeInfo({feeTokenAddress: address(0), amount: 0}),
                requiredGasLimit: 700_000,
                allowedRelayerAddresses: new address[](0),
                message: message
            })
        );
    }
}
