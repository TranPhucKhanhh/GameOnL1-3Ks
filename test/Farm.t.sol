// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Farm} from "../src/Farm.sol";
import {TierVault} from "../src/TierVault.sol";
import {DemoUSD} from "../src/DemoUSD.sol";
import {CrossChainEndpoint} from "../src/CrossChainEndpoint.sol";
import {FarmTypes as T} from "../src/FarmTypes.sol";
import {MockTeleporter} from "../src/mocks/MockTeleporter.sol";
import {ITeleporterMessenger} from "../src/interfaces/ITeleporter.sol";

interface Vm {
    struct Log {
        bytes32[] topics;
        bytes data;
        address emitter;
    }
    function prank(address) external;
    function warp(uint256) external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function recordLogs() external;
    function getRecordedLogs() external returns (Log[] memory);
    function mockCallRevert(address, bytes calldata, bytes calldata) external;
}

// Small test harness using Foundry's documented cheatcode ABI; no forge-std download needed.
contract FarmTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 private constant GAME = keccak256("game");
    bytes32 private constant VAULT = keccak256("vault");
    bytes32 private constant QUEUED = keccak256("MessageQueued(bytes32,bytes32,address,address,bytes)");
    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);
    DemoUSD private token;
    Farm private farm;
    TierVault private vault;
    MockTeleporter private gameMessenger;
    MockTeleporter private vaultMessenger;

    struct Message {
        bytes32 id;
        address destination;
        address sender;
        bytes payload;
    }

    function setUp() public {
        vm.warp(1000);
        gameMessenger = new MockTeleporter(GAME);
        vaultMessenger = new MockTeleporter(VAULT);
        farm = new Farm(address(gameMessenger), VAULT, address(this));
        token = new DemoUSD();
        vault = new TierVault(address(token), address(vaultMessenger), GAME, address(this), true);
        farm.setPeer(address(vault));
        vault.setPeer(address(farm));
        token.approve(address(vault), 10_000e6);
        vault.fundRewards(10_000e6);
        vm.prank(ALICE);
        token.faucet();
        vm.prank(ALICE);
        token.approve(address(vault), type(uint256).max);
    }

    function _eq(uint256 a, uint256 b) private pure {
        require(a == b, "ASSERT_EQ");
    }

    function _solvent() private view {
        _eq(
            token.balanceOf(address(vault)),
            vault.totalCredits() + vault.totalPrincipal() + vault.availableRewards() + vault.reservedRewards()
        );
    }

    function _message(address emitter) private returns (Message memory m) {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == emitter && logs[i].topics[0] == QUEUED) {
                m.id = logs[i].topics[1];
                (m.destination, m.sender, m.payload) = abi.decode(logs[i].data, (address, address, bytes));
                return m;
            }
        }
        revert("NO_MESSAGE");
    }

    function _queue(uint8 slot, uint8 tier, uint256 amount) private returns (Message memory) {
        vm.recordLogs();
        vm.prank(ALICE);
        farm.plant(slot, tier, amount);
        return _message(address(gameMessenger));
    }

    function _deliver(Message memory m) private returns (Message memory ack) {
        vm.recordLogs();
        vaultMessenger.deliver(m.id, GAME, m.sender, m.destination, m.payload);
        ack = _message(address(vaultMessenger));
    }

    function _ack(Message memory ack) private {
        gameMessenger.deliver(ack.id, VAULT, ack.sender, ack.destination, ack.payload);
    }

    function _roundTrip(Message memory m) private {
        _ack(_deliver(m));
    }

    function _deposit(uint256 amount) private {
        vm.prank(ALICE);
        vault.deposit(amount);
    }

    function _plant(uint8 tier, uint256 amount) private {
        _deposit(amount);
        _roundTrip(_queue(0, tier, amount));
    }

    function _finish(bool early) private {
        vm.recordLogs();
        vm.prank(ALICE);
        if (early) farm.uproot(0);
        else farm.harvest(0);
        _roundTrip(_message(address(gameMessenger)));
    }

    function testDepositAndWithdraw() public {
        _deposit(100e6);
        _eq(vault.credits(ALICE), 100e6);
        vm.prank(ALICE);
        vault.withdraw(100e6);
        _eq(token.balanceOf(ALICE), 1000e6);
        _solvent();
    }

    function testOtherPlayerCannotWithdrawCredits() public {
        _deposit(100e6);
        vm.expectRevert(TierVault.InvalidRequest.selector);
        vm.prank(BOB);
        vault.withdraw(1e6);
    }

    function testPlantWaitsForAcknowledgement() public {
        _deposit(100e6);
        Message memory m = _queue(0, 0, 100e6);
        _eq(uint8(farm.getPlot(ALICE, 0).status), uint8(T.Status.PlantPending));
        _eq(vault.totalPrincipal(), 0);
        Message memory ack = _deliver(m);
        _eq(vault.totalPrincipal(), 100e6);
        _eq(uint8(farm.getPlot(ALICE, 0).status), uint8(T.Status.PlantPending));
        _ack(ack);
        _eq(uint8(farm.getPlot(ALICE, 0).status), uint8(T.Status.Growing));
        _solvent();
    }

    function testHarvestAtExactMaturityCreditsPrincipalAndFixedReward() public {
        _plant(0, 100e6);
        vm.warp(farm.getPlot(ALICE, 0).unlockAt);
        _finish(false);
        _eq(vault.credits(ALICE), 101e6);
        _eq(farm.harvestCount(ALICE), 1);
        _eq(farm.totalRewards(ALICE), 1e6);
        _eq(token.balanceOf(ALICE), 900e6);
        vm.prank(ALICE);
        vault.withdraw(101e6);
        _eq(token.balanceOf(ALICE), 1001e6);
        _solvent();
    }

    function testEarlyHarvestRejectedAndPlotCanRetry() public {
        _plant(1, 100e6);
        _finish(false);
        _eq(uint8(farm.getPlot(ALICE, 0).status), uint8(T.Status.Growing));
        _eq(vault.totalPrincipal(), 100e6);
        vm.warp(farm.getPlot(ALICE, 0).unlockAt);
        _finish(false);
        _eq(vault.credits(ALICE), 103e6);
        _solvent();
    }

    function testUprootReturnsFullPrincipalAndReleasesReservedReward() public {
        _plant(2, 100e6);
        _eq(vault.reservedRewards(), 8e6);
        _finish(true);
        _eq(vault.credits(ALICE), 100e6);
        _eq(vault.availableRewards(), 10_000e6);
        _eq(vault.reservedRewards(), 0);
        _eq(farm.harvestCount(ALICE), 0);
        _solvent();
    }

    function testInsufficientCreditsResetsPendingPlot() public {
        _roundTrip(_queue(0, 0, 100e6));
        _eq(uint8(farm.getPlot(ALICE, 0).status), 0);
        _eq(vault.totalPrincipal(), 0);
        _solvent();
    }

    function testWithdrawalBeforePlantDeliveryDoesNotLoseMoney() public {
        _deposit(100e6);
        Message memory m = _queue(0, 0, 100e6);
        vm.prank(ALICE);
        vault.withdraw(100e6);
        _roundTrip(m);
        _eq(uint8(farm.getPlot(ALICE, 0).status), 0);
        _eq(token.balanceOf(ALICE), 1000e6);
        _solvent();
    }

    function testRewardBudgetRequiredBeforeAcceptingPlant() public {
        TierVault emptyVault =
            new TierVault(address(token), address(vaultMessenger), GAME, address(this), true);
        emptyVault.setPeer(address(farm));
        vm.prank(ALICE);
        token.approve(address(emptyVault), 100e6);
        vm.prank(ALICE);
        emptyVault.deposit(100e6);
        T.Request memory r = T.Request(1, ALICE, 0, T.Action.Plant, 2, 100e6);
        vaultMessenger.deliver(keccak256("empty"), GAME, address(farm), address(emptyVault), abi.encode(r));
        _eq(emptyVault.credits(ALICE), 100e6);
        _eq(emptyVault.totalPrincipal(), 0);
    }

    function testCannotPlantOccupiedOrPendingPlot() public {
        _deposit(100e6);
        _queue(0, 0, 100e6);
        vm.expectRevert(Farm.InvalidState.selector);
        vm.prank(ALICE);
        farm.plant(0, 0, 100e6);
    }

    function testOtherPlayerCannotHarvestAlicePlot() public {
        _plant(0, 100e6);
        vm.expectRevert(Farm.InvalidState.selector);
        vm.prank(BOB);
        farm.harvest(0);
    }

    function testDirectVaultMessageRejected() public {
        vm.expectRevert(CrossChainEndpoint.Unauthorized.selector);
        vault.receiveTeleporterMessage(GAME, address(farm), "");
    }

    function testDirectFarmReplyRejected() public {
        vm.expectRevert(CrossChainEndpoint.Unauthorized.selector);
        farm.receiveTeleporterMessage(VAULT, address(vault), "");
    }

    function testWrongSourceBlockchainRejected() public {
        Message memory m = _queue(0, 0, 100e6);
        vm.expectRevert(CrossChainEndpoint.Unauthorized.selector);
        vaultMessenger.deliver(m.id, keccak256("wrong"), address(farm), address(vault), m.payload);
    }

    function testWrongOriginContractRejected() public {
        Message memory m = _queue(0, 0, 100e6);
        vm.expectRevert(CrossChainEndpoint.Unauthorized.selector);
        vaultMessenger.deliver(m.id, GAME, BOB, address(vault), m.payload);
    }

    function testRequestReplayUnderNewMessageIdRejected() public {
        _deposit(100e6);
        Message memory m = _queue(0, 0, 100e6);
        _roundTrip(m);
        vm.expectRevert(TierVault.Replay.selector);
        vaultMessenger.deliver(keccak256("new-id"), GAME, m.sender, m.destination, m.payload);
        _solvent();
    }

    function testStaleReplyCannotReopenFinishedPlot() public {
        _deposit(100e6);
        Message memory ack = _deliver(_queue(0, 0, 100e6));
        _ack(ack);
        _finish(true);
        vm.expectRevert(Farm.StaleReply.selector);
        gameMessenger.deliver(keccak256("stale"), VAULT, ack.sender, ack.destination, ack.payload);
        _eq(uint8(farm.getPlot(ALICE, 0).status), 0);
    }

    function testAcknowledgementSendFailureRollsBackAccounting() public {
        _deposit(100e6);
        Message memory m = _queue(0, 0, 100e6);
        vm.mockCallRevert(
            address(vaultMessenger),
            abi.encodeWithSelector(ITeleporterMessenger.sendCrossChainMessage.selector),
            bytes("ACK_FAILED")
        );
        vm.expectRevert(bytes("ACK_FAILED"));
        vaultMessenger.deliver(m.id, GAME, m.sender, m.destination, m.payload);
        _eq(vault.credits(ALICE), 100e6);
        _eq(vault.totalPrincipal(), 0);
        require(!vault.processed(1), "MUST_ROLL_BACK_REPLAY_FLAG");
        _solvent();
    }

    function testSlotsCanReceiveOutOfOrderReplies() public {
        _deposit(200e6);
        Message memory first = _queue(0, 0, 100e6);
        Message memory second = _queue(1, 1, 100e6);
        _roundTrip(second);
        _roundTrip(first);
        _eq(farm.getPlot(ALICE, 0).principal, 100e6);
        _eq(farm.getPlot(ALICE, 1).principal, 100e6);
        _solvent();
    }

    function testPlotCanBeReusedAfterCompletion() public {
        _plant(0, 100e6);
        _finish(true);
        _roundTrip(_queue(0, 2, 100e6));
        _eq(farm.getPlot(ALICE, 0).tier, 2);
        _eq(farm.getPlot(ALICE, 0).requestId, 3);
        _solvent();
    }

    function testPeerBindingIsOneTimeAndAuthorized() public {
        vm.expectRevert(CrossChainEndpoint.Unauthorized.selector);
        vm.prank(BOB);
        farm.setPeer(BOB);
        vm.expectRevert(CrossChainEndpoint.PeerAlreadySet.selector);
        farm.setPeer(BOB);
    }

    function testRejectInvalidSlotTierAndAmount() public {
        vm.expectRevert(Farm.InvalidPlot.selector);
        farm.plant(6, 0, 1e6);
        vm.expectRevert(Farm.InvalidTier.selector);
        farm.plant(0, 3, 1e6);
        vm.expectRevert(Farm.InvalidAmount.selector);
        farm.plant(0, 0, 0);
    }

    function testNormalModeUsesRealDurations() public {
        TierVault realClock =
            new TierVault(address(token), address(vaultMessenger), GAME, address(this), false);
        (uint64 a,) = realClock.tierConfig(0);
        (uint64 b,) = realClock.tierConfig(1);
        (uint64 c,) = realClock.tierConfig(2);
        _eq(a, 7 days);
        _eq(b, 30 days);
        _eq(c, 90 days);
    }

    function testFaucetHasCooldown() public {
        vm.expectRevert(bytes("FAUCET_COOLDOWN"));
        vm.prank(ALICE);
        token.faucet();
        vm.warp(block.timestamp + 1 hours);
        vm.prank(ALICE);
        token.faucet();
        _eq(token.balanceOf(ALICE), 2000e6);
    }

    function testFuzzConservationAndReward(uint96 seed, uint8 tierSeed, bool early) public {
        uint256 amount = 1e6 + uint256(seed) % (999e6 + 1);
        uint8 tier = tierSeed % 3;
        _plant(tier, amount);
        _solvent();
        (, uint16 bps) = vault.tierConfig(tier);
        uint256 reward = amount * bps / 10_000;
        if (!early) vm.warp(farm.getPlot(ALICE, 0).unlockAt);
        _finish(early);
        _eq(vault.credits(ALICE), amount + (early ? 0 : reward));
        _solvent();
        uint256 balance = vault.credits(ALICE);
        vm.prank(ALICE);
        vault.withdraw(balance);
        _eq(token.balanceOf(ALICE), 1000e6 + (early ? 0 : reward));
        _solvent();
    }
}
