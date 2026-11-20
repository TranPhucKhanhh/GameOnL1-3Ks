// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {LanternSea} from "../src/game/LanternSea.sol";
import {CoopSail} from "../src/game/CoopSail.sol";
import {Shipyard} from "../src/game/Shipyard.sol";
import {BossRaid} from "../src/game/BossRaid.sol";
import {RaidEscrow} from "../src/escrow/RaidEscrow.sol";
import {CrossChainEndpoint} from "../src/CrossChainEndpoint.sol";
import {MockTeleporter} from "../src/mocks/MockTeleporter.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {SlidePuzzle} from "../src/lib/SlidePuzzle.sol";

interface Vm {
    struct Log {
        bytes32[] topics;
        bytes data;
        address emitter;
    }

    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function recordLogs() external;
    function getRecordedLogs() external returns (Log[] memory);
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
}

/// @dev Harness using Foundry's cheatcode ABI directly; no forge-std download needed.
contract LanternSeaTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 private constant GAME = keccak256("game-l1");
    bytes32 private constant CCHAIN = keccak256("c-chain");
    bytes32 private constant QUEUED = keccak256("MessageQueued(bytes32,bytes32,address,address,bytes)");
    // Epoch 2000 of the 10-minute demo schedule: 2000 % 4 == 0, so the boss has 1500 HP.
    uint256 private constant RAID_TIME = 600 * 2000 + 5;

    LanternSea private sea;
    CoopSail private coop;
    Shipyard private yard;
    BossRaid private raid;
    RaidEscrow private escrow;
    MockTeleporter private gameMessenger;
    MockTeleporter private cMessenger;
    MockUSDC private usdc;

    uint256 private constant ALICE_PK = 0xA11CE;
    uint256 private constant BOB_PK = 0xB0B;
    address private alice;
    address private bob;

    struct Message {
        bytes32 id;
        address destination;
        address sender;
        bytes payload;
    }

    function setUp() public {
        vm.warp(1_000_000);
        alice = vm.addr(ALICE_PK);
        bob = vm.addr(BOB_PK);
        sea = new LanternSea(keccak256("test-world"), 256, true, address(this));
        yard = new Shipyard(sea);
        coop = new CoopSail(sea, 60, 14);
        gameMessenger = new MockTeleporter(GAME);
        cMessenger = new MockTeleporter(CCHAIN);
        raid = new BossRaid(sea, yard, address(gameMessenger), CCHAIN, address(this));
        sea.setModules(address(coop), address(yard), address(raid));
        usdc = new MockUSDC();
        escrow = new RaidEscrow(address(usdc), address(cMessenger), GAME, address(this), 100e6, 10 minutes);
        raid.setPeer(address(escrow));
        escrow.setPeer(address(raid));
    }

    // ------------------------------------------------------------ helpers

    function _eq(uint256 a, uint256 b, string memory why) private pure {
        if (a != b) revert(why);
    }

    function _ok(bool c, string memory why) private pure {
        if (!c) revert(why);
    }

    function _register(address who) private {
        vm.prank(who);
        sea.register();
    }

    /// Finds a captain (from a deterministic address pool) whose home has a lane matching `wantCoop`.
    function _captainWithLane(bool wantCoop, uint160 offset) private returns (address who, uint8 dir) {
        for (uint160 i = 1; i < 400; i++) {
            who = address(0x10000 + offset + i);
            uint16 home = sea.homeOf(who);
            uint8 n = sea.directionCount(home);
            for (uint8 d = 0; d < n; d++) {
                (, uint8 cost) = sea.route(home, d);
                if ((cost >= 4) == wantCoop) {
                    _register(who);
                    return (who, d);
                }
            }
        }
        revert("NO_CAPTAIN_FOUND");
    }

    function _coins(address who) private view returns (uint256) {
        return sea.captainView(who).coins;
    }

    function _solution(uint256 id, address captain) private view returns (bytes memory moves) {
        (, uint64 startedAt) = _started(id);
        (uint64 board, bytes memory path) = SlidePuzzle.walk(
            keccak256(abi.encode(address(coop), id, startedAt, captain)), coop.scrambleDepth()
        );
        _eq(board, coop.puzzleOf(id, captain), "BOARD_MISMATCH");
        moves = new bytes(path.length);
        for (uint256 i = 0; i < path.length; i++) {
            moves[i] = bytes1(uint8(path[path.length - 1 - i]) ^ 1);
        }
    }

    function _started(uint256 id) private view returns (uint8 status, uint64 startedAt) {
        CoopSail.Status s;
        (,,,,,,, s, startedAt,,,) = coop.voyages(id);
        status = uint8(s);
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

    function _toEscrow(Message memory m) private {
        cMessenger.deliver(m.id, GAME, m.sender, m.destination, m.payload);
    }

    function _toGame(Message memory m) private {
        gameMessenger.deliver(m.id, CCHAIN, m.sender, m.destination, m.payload);
    }

    function _parleyCode(uint256 pk, uint64 expiry) private returns (bytes memory) {
        bytes32 digest = sea.parleyDigest(vm.addr(pk), expiry);
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(pk, keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest)));
        return abi.encodePacked(r, s, v);
    }

    function _solvent() private view {
        _eq(usdc.balanceOf(address(escrow)), escrow.totalEscrowed() + escrow.totalClaimable(), "ESCROW_INSOLVENT");
    }

    // ------------------------------------------------------------ captains, charges, sailing

    function testRegisterGivesHomeAndFullCharges() public {
        _register(alice);
        LanternSea.CaptainView memory v = sea.captainView(alice);
        _ok(v.registered, "NOT_REGISTERED");
        _eq(v.home, sea.homeOf(alice), "HOME");
        _eq(v.charges, 3, "CHARGES");
        _ok(sea.visited(alice, v.home), "HOME_NOT_VISITED");
        vm.prank(alice);
        vm.expectRevert(LanternSea.AlreadyRegistered.selector);
        sea.register();
    }

    function testSoloSailPaysCoinsInCostRangeAndClaimsIsland() public {
        (address cap, uint8 dir) = _captainWithLane(false, 0);
        uint16 home = sea.homeOf(cap);
        (uint16 to, uint8 cost) = sea.route(home, dir);
        bool fresh = sea.firstFinder(to) == address(0);
        vm.prank(cap);
        sea.sail(home, dir);
        LanternSea.CaptainView memory v = sea.captainView(cap);
        _eq(v.charges, 3 - cost, "CHARGES_SPENT");
        _ok(sea.visited(cap, to), "NOT_VISITED");
        if (fresh) {
            _eq(uint160(sea.firstFinder(to)), uint160(cap), "FINDER");
            // First sail: streak 1 of 5, so min + span/5.
            uint256 expected = cost == 1 ? 10 + 10 / 5 : 25 + 15 / 5;
            _eq(v.coins, expected, "COINS_IN_RANGE");
        }
    }

    function testRevisitingClaimedIslandPaysNothing() public {
        (address cap, uint8 dir) = _captainWithLane(false, 0);
        uint16 home = sea.homeOf(cap);
        (uint16 to,) = sea.route(home, dir);
        vm.prank(cap);
        sea.sail(home, dir);
        uint256 before = _coins(cap);
        vm.warp(block.timestamp + 10 minutes); // recharge
        vm.prank(cap);
        sea.sail(home, dir);
        _eq(_coins(cap), before, "NO_SECOND_REWARD");
        _ok(sea.firstFinder(to) != address(0), "CLAIMED");
    }

    function testStreakRaisesCoinsInsideRange() public {
        (address cap, uint8 dir) = _captainWithLane(false, 0);
        uint16 home = sea.homeOf(cap);
        vm.prank(cap);
        sea.sail(home, dir);
        // Sail on consecutive demo "days" (5 minutes each); streak should climb and cap at 5.
        for (uint256 i = 0; i < 6; i++) {
            vm.warp(block.timestamp + 5 minutes);
            vm.prank(cap);
            sea.sail(home, dir);
        }
        _ok(sea.captainView(cap).streak >= 5, "STREAK_CLIMBS");
        vm.warp(block.timestamp + 20 minutes);
        _eq(sea.captainView(cap).streak, 0, "STREAK_BROKEN_VIEW");
    }

    function testChargesRegenerateAndCap() public {
        (address cap, uint8 dir) = _captainWithLane(false, 0);
        uint16 home = sea.homeOf(cap);
        (, uint8 cost) = sea.route(home, dir);
        vm.startPrank(cap);
        sea.sail(home, dir);
        if (cost == 1) sea.sail(home, dir);
        vm.stopPrank();
        (uint8 c,) = sea.chargesOf(cap);
        _eq(c, 1, "ONE_LEFT");
        vm.warp(block.timestamp + 60);
        (c,) = sea.chargesOf(cap);
        _eq(c, 2, "REGEN_ONE");
        vm.warp(block.timestamp + 1 days);
        (c,) = sea.chargesOf(cap);
        _eq(c, 3, "CAPPED");
    }

    function testSailRequiresVisitedIslandAndSoloLane() public {
        (address cap, uint8 dir) = _captainWithLane(true, 1000);
        uint16 home = sea.homeOf(cap);
        vm.prank(cap);
        vm.expectRevert(LanternSea.CoopRequired.selector);
        sea.sail(home, dir);
        vm.prank(cap);
        vm.expectRevert(LanternSea.NotVisited.selector);
        sea.sail(uint16((uint256(home) + 1) % 256), 0);
        vm.prank(cap);
        vm.expectRevert(LanternSea.BadDirection.selector);
        sea.sail(home, 9);
    }

    function testModuleHooksAreLocked() public {
        _register(alice);
        vm.expectRevert(LanternSea.Unauthorized.selector);
        sea.addCoins(alice, 1000);
        vm.expectRevert(LanternSea.ModulesAlreadySet.selector);
        sea.setModules(address(1), address(2), address(3));
    }

    // ------------------------------------------------------------ co-op voyage + sliding puzzle

    function _proposeCoop() private returns (uint256 id, address a, address b, uint16 to) {
        uint8 dir;
        (a, dir) = _captainWithLane(true, 1000);
        b = bob;
        _register(b);
        uint16 home = sea.homeOf(a);
        uint8 cost;
        (to, cost) = sea.route(home, dir);
        vm.prank(a);
        id = coop.propose(b, home, dir, 2);
        vm.prank(b);
        coop.join(id);
        _eq(sea.captainView(a).charges, 1, "A_PAID_2");
        _eq(sea.captainView(b).charges, 3 - (cost - 2), "B_PAID_REST");
    }

    function testCoopVoyageBothSolveInWindowLandsWithGem() public {
        (uint256 id, address a, address b, uint16 to) = _proposeCoop();
        _ok(sea.firstFinder(to) == address(0), "EXPECTED_FRESH_ISLAND");
        vm.warp(block.timestamp + 20);
        bytes memory solA = _solution(id, a);
        vm.prank(a);
        coop.solve(id, solA);
        vm.warp(block.timestamp + 10);
        bytes memory solB = _solution(id, b);
        vm.prank(b);
        coop.solve(id, solB);
        (uint8 status,) = _started(id);
        _eq(status, uint8(CoopSail.Status.Landed), "LANDED");
        _ok(sea.visited(a, to) && sea.visited(b, to), "BOTH_VISITED");
        uint8 gem = sea.gemTypeOf(to);
        _eq(sea.captainView(a).gems[gem], 1, "GEM_A");
        _eq(sea.captainView(b).gems[gem], 1, "GEM_B");
        // Slowest solver took 30 of 60 seconds: speed 50% -> 60 + 40 * 0.5 = 80 coins.
        _eq(_coins(a), 80, "COOP_COINS_A");
        _eq(_coins(b), 80, "COOP_COINS_B");

        (,, uint16 from,, uint8 dir,,,,,,,) = coop.voyages(id);
        vm.warp(block.timestamp + 3 minutes);
        vm.prank(a);
        uint256 repeat = coop.propose(b, from, dir, 2);
        vm.prank(b);
        coop.join(repeat);
        solA = _solution(repeat, a);
        solB = _solution(repeat, b);
        vm.prank(a);
        coop.solve(repeat, solA);
        vm.prank(b);
        coop.solve(repeat, solB);
        (,,,,,,, CoopSail.Status repeatedStatus,,,, bool fresh) = coop.voyages(repeat);
        _ok(repeatedStatus == CoopSail.Status.Landed && !fresh, "REVISIT_LANDED");
        _eq(_coins(a), 80, "REVISIT_NO_COINS_A");
        _eq(_coins(b), 80, "REVISIT_NO_COINS_B");
        _eq(sea.captainView(a).gems[gem], 1, "REVISIT_NO_GEMS_A");
        _eq(sea.captainView(b).gems[gem], 1, "REVISIT_NO_GEMS_B");
    }

    function testCoopWrongSolutionReverts() public {
        (uint256 id, address a,,) = _proposeCoop();
        vm.prank(a);
        vm.expectRevert(CoopSail.WrongSolution.selector);
        coop.solve(id, hex"");
    }

    function testCoopWindowClosesAndVoyageIsLost() public {
        (uint256 id, address a, address b, uint16 to) = _proposeCoop();
        bytes memory solA = _solution(id, a);
        vm.prank(a);
        coop.solve(id, solA);
        vm.warp(block.timestamp + 60);
        vm.expectRevert(CoopSail.WindowOpen.selector);
        coop.expire(id);
        vm.warp(block.timestamp + 1);
        vm.prank(bob);
        vm.expectRevert(CoopSail.WindowClosed.selector);
        coop.solve(id, hex"00");
        coop.expire(id);
        (uint8 status,) = _started(id);
        _eq(status, uint8(CoopSail.Status.Lost), "LOST");
        _ok(!sea.visited(a, to) && !sea.visited(b, to), "NO_LANDING");
        _eq(_coins(a) + _coins(b), 0, "NO_COINS");
    }

    function testCoopRejectsWrongAccountAndCancelsWithoutCharge() public {
        (address a, uint8 dir) = _captainWithLane(true, 1000);
        _register(bob);
        _register(alice);
        uint16 home = sea.homeOf(a);
        vm.prank(a);
        uint256 id = coop.propose(bob, home, dir, 2);
        vm.prank(alice);
        vm.expectRevert(CoopSail.NotCrew.selector);
        coop.join(id);
        vm.prank(alice);
        vm.expectRevert(CoopSail.NotCrew.selector);
        coop.cancel(id);
        vm.prank(a);
        coop.cancel(id);
        (uint8 status,) = _started(id);
        _eq(status, uint8(CoopSail.Status.Cancelled), "CANCELLED");
        vm.prank(bob);
        vm.expectRevert(CoopSail.WrongStatus.selector);
        coop.join(id);
        _eq(sea.captainView(a).charges, 3, "CANCEL_NO_CHARGE_A");
        _eq(sea.captainView(bob).charges, 3, "CANCEL_NO_CHARGE_B");
        vm.prank(a);
        vm.expectRevert(CoopSail.BadCharges.selector);
        coop.propose(bob, home, dir, 0);
    }

    function testFuzzScrambleInverseAlwaysSolves(bytes32 seed) public {
        (uint64 board, bytes memory path) = SlidePuzzle.walk(seed, 24);
        _ok(board != SlidePuzzle.SOLVED, "TRIVIAL");
        bytes memory moves = new bytes(path.length);
        for (uint256 i = 0; i < path.length; i++) {
            moves[i] = bytes1(uint8(path[path.length - 1 - i]) ^ 1);
        }
        _ok(new PuzzleProbe().check(board, moves), "INVERSE_FAILS");
    }

    // ------------------------------------------------------------ notes

    function testNotePolesCostCoinsCentreFirstThenFreeLand() public {
        _register(alice);
        _register(bob);
        uint16 home = sea.homeOf(alice);
        // Building a pole costs coins.
        vm.prank(alice);
        vm.expectRevert(LanternSea.NotEnoughCoins.selector);
        sea.leaveNote(home, "First to land. Ahoy!", 40);
        vm.prank(address(raid));
        sea.addCoins(alice, 100);
        // The first pole must stand on the centre tile.
        vm.prank(alice);
        vm.expectRevert(LanternSea.BadTile.selector);
        sea.leaveNote(home, "off centre", 41);
        vm.prank(alice);
        sea.leaveNote(home, "First to land. Ahoy!", 40);
        _eq(_coins(alice), 75, "NOTE_COST_PAID");
        vm.prank(alice);
        vm.expectRevert(LanternSea.AlreadyNoted.selector);
        sea.leaveNote(home, "again", 41);
        vm.prank(bob);
        vm.expectRevert(LanternSea.NotVisited.selector);
        sea.leaveNote(home, "hi", 41);

        // Bob reaches Alice's island through a Parley jump, then must pick a free land tile around the centre.
        uint64 expiry = uint64(block.timestamp + 60);
        bytes memory code = _parleyCode(ALICE_PK, expiry);
        vm.prank(bob);
        sea.parley(alice, expiry, code);
        if (!sea.visited(bob, home)) {
            vm.prank(bob);
            sea.parleyJump(alice, home);
        }
        vm.prank(address(raid));
        sea.addCoins(bob, 100);
        vm.prank(bob);
        vm.expectRevert(LanternSea.BadTile.selector);
        sea.leaveNote(home, "centre is taken", 40);
        _ok(!sea.isLand(home, 0), "CORNER_IS_SEA"); // corner: distance^2 32 > max radius^2 16
        vm.prank(bob);
        vm.expectRevert(LanternSea.BadTile.selector);
        sea.leaveNote(home, "in the sea", 0);
        _ok(sea.isLand(home, 41), "NEXT_TO_CENTRE_IS_LAND");
        vm.prank(bob);
        sea.leaveNote(home, "Parley crew was here", 41);

        LanternSea.Note[] memory list = sea.getNotes(home, 0, 10);
        _eq(list.length, 2, "TWO_POLES");
        _eq(uint160(list[0].author), uint160(alice), "FIRST_AUTHOR");
        _eq(list[0].tile, 40, "FIRST_AT_CENTRE");
        _eq(list[1].tile, 41, "SECOND_TILE");
        _ok(sea.tileTaken(home, 41), "TILE_TAKEN");
    }

    function testFuzzIslandCentreIsAlwaysLand(uint16 island) public view {
        for (uint8 t = 30; t <= 50; t++) {
            uint256 x = t % 9;
            uint256 y = t / 9;
            if (x >= 3 && x <= 5 && y >= 3 && y <= 5) _ok(sea.isLand(island, t), "CENTRE_3x3");
        }
        _ok(!sea.isLand(island, 81), "OUT_OF_GRID");
    }

    // ------------------------------------------------------------ parley

    function testParleyByQrSignatureSharesMapForOneCharge() public {
        _register(alice);
        _register(bob);
        uint64 expiry = uint64(block.timestamp + 60);
        bytes memory code = _parleyCode(ALICE_PK, expiry);
        vm.prank(bob);
        sea.parley(alice, expiry, code);
        _ok(sea.parleyActive(alice, bob), "ACTIVE");
        uint16 aliceHome = sea.homeOf(alice);
        if (!sea.visited(bob, aliceHome)) {
            vm.prank(bob);
            sea.parleyJump(alice, aliceHome);
            _ok(sea.visited(bob, aliceHome), "JUMPED");
            _eq(sea.captainView(bob).charges, 2, "ONE_CHARGE");
        }
        // Same pair, same day: rejected.
        bytes memory again = _parleyCode(ALICE_PK, expiry);
        vm.prank(bob);
        vm.expectRevert(LanternSea.ParleyUsedToday.selector);
        sea.parley(alice, expiry, again);
        // Parley ends after 10 demo minutes.
        vm.warp(block.timestamp + 11 minutes);
        _ok(!sea.parleyActive(alice, bob), "ENDED");
    }

    function testParleyRejectsExpiredForgedOrSelfCodes() public {
        _register(alice);
        _register(bob);
        uint64 expiry = uint64(block.timestamp + 60);
        bytes memory forged = _parleyCode(BOB_PK, expiry); // Bob signs pretending to be Alice
        vm.prank(bob);
        vm.expectRevert(LanternSea.BadParley.selector);
        sea.parley(alice, expiry, forged);
        bytes memory code = _parleyCode(ALICE_PK, expiry);
        vm.warp(block.timestamp + 61);
        vm.prank(bob);
        vm.expectRevert(LanternSea.BadParley.selector);
        sea.parley(alice, expiry, code);
        uint64 far = uint64(block.timestamp + 1 hours);
        bytes memory longCode = _parleyCode(ALICE_PK, far);
        vm.prank(bob);
        vm.expectRevert(LanternSea.BadParley.selector);
        sea.parley(alice, far, longCode);
    }

    // ------------------------------------------------------------ gems & shipyard

    function testShipPartsReplaceAndCombineBalatroStyle() public {
        _register(alice);
        _register(bob);
        vm.prank(address(raid));
        sea.addCoins(alice, 2000);
        _eq(yard.statsOf(alice).power, 10, "BASE_POWER");
        _eq(yard.crewPower(alice, bob), 40, "BASE_CREW");
        vm.startPrank(alice);
        yard.buyPart(2); // Iron Hull +50 dmg
        yard.buyPart(9); // Dragon Cannon x1.5
        yard.buyPart(1); // Oak Hull replaces Iron Hull
        yard.upgrade(false); // +0.10 mult
        vm.stopPrank();
        Shipyard.Stats memory s = yard.statsOf(alice);
        _eq(s.damage, 30, "DAMAGE");
        _eq(s.mult, 110, "MULT");
        _eq(s.xMult, 15_000, "XMULT");
        _eq(s.power, 49, "POWER"); // 30 * 1.10 * 1.5 = 49.5
        _eq(_coins(alice), 2000 - 300 - 800 - 100 - 60, "COINS_SPENT");
        vm.prank(alice);
        yard.buyPart(12); // 600 of the remaining 740
        vm.prank(alice);
        vm.expectRevert(LanternSea.NotEnoughCoins.selector);
        yard.buyPart(8);
    }

    function testGemsSellForCoinsOnly() public {
        (uint256 id, address a, address b, uint16 to) = _proposeCoop();
        _ok(sea.firstFinder(to) == address(0), "EXPECTED_FRESH_ISLAND");
        bytes memory solA = _solution(id, a);
        bytes memory solB = _solution(id, b);
        vm.prank(a);
        coop.solve(id, solA);
        vm.prank(b);
        coop.solve(id, solB);
        uint8 gem = sea.gemTypeOf(to);
        uint256 before = _coins(a);
        vm.prank(a);
        sea.sellGems(gem, 1);
        _eq(_coins(a), before + sea.gemPrice(gem), "GEM_PRICE");
        _eq(sea.captainView(a).gems[gem], 0, "GEM_DEDUCTED");
        vm.prank(a);
        vm.expectRevert(LanternSea.NotEnoughGems.selector);
        sea.sellGems(gem, 1);
    }

    // ------------------------------------------------------------ boss raid + ICM escrow

    function _acceptRaid() private returns (uint256 raidId, Message memory opening) {
        vm.warp(RAID_TIME);
        _register(alice);
        _register(bob);
        vm.prank(alice);
        raidId = raid.proposeLead(bob);
        vm.recordLogs();
        vm.prank(bob);
        raid.acceptLead(raidId);
        opening = _message(address(gameMessenger));
    }

    function _openRaid() private returns (uint256) {
        (uint256 raidId, Message memory opening) = _acceptRaid();
        _toEscrow(opening);
        (,, RaidEscrow.Status status,,,) = escrow.raids(raidId);
        _eq(uint8(status), uint8(RaidEscrow.Status.Open), "ESCROW_OPEN");
        return raidId;
    }

    function _fund(address who, uint256 amount, uint256 raidId) private {
        _toGame(_queueFunding(who, amount, raidId));
    }

    function _queueFunding(address who, uint256 amount, uint256 raidId) private returns (Message memory) {
        vm.startPrank(who);
        usdc.faucet();
        usdc.approve(address(escrow), amount);
        vm.recordLogs();
        escrow.fund(raidId, amount);
        vm.stopPrank();
        return _message(address(cMessenger));
    }

    function _powerUp(address who) private {
        vm.prank(address(raid));
        sea.addCoins(who, 5000);
        vm.startPrank(who);
        yard.buyPart(2);
        yard.buyPart(6);
        yard.buyPart(9);
        yard.buyPart(12);
        yard.buyPart(15);
        vm.stopPrank();
    }

    function testRaidDefeatedPaysHelpersByDamageShareAndRefundsRest() public {
        uint256 raidId = _openRaid();
        (, uint256 hp,,) = raid.bossOf(raidId);
        _eq(hp, 1500, "HP_TABLE");
        _fund(alice, 30e6, raidId);
        _fund(bob, 10e6, raidId);
        _eq(raid.raidView(raidId).bounty, 40e6, "BOUNTY_SYNCED_TO_L1");
        _solvent();

        address helper = address(0xBEEF);
        _register(helper);
        vm.prank(helper);
        raid.attack(raidId); // base power 10
        _eq(raid.damageOf(raidId, helper), 10, "HELPER_DMG");
        _eq(sea.captainView(helper).charges, 2, "HELPER_PAID_ONE_CHARGE");
        (address[] memory helpers, uint256[] memory damage) = raid.helpersOf(raidId);
        _ok(helpers.length == 1 && helpers[0] == helper && damage[0] == 10, "DAMAGE_BOARD");

        vm.prank(alice);
        raid.attack(raidId);
        _eq(raid.damageOf(raidId, alice), 40, "BASE_CREW_DAMAGE");

        _powerUp(alice);
        _powerUp(bob);
        uint256 crewBefore = yard.crewPower(alice, bob);
        vm.prank(alice);
        yard.upgrade(true);
        _ok(yard.crewPower(alice, bob) > crewBefore && crewBefore > 40, "PARTS_AND_UPGRADE_INCREASE_POWER");
        vm.prank(alice);
        raid.attack(raidId); // crew power ~1590 finishes the boss
        _eq(uint8(raid.raidView(raidId).status), uint8(BossRaid.Status.Defeated), "DEFEATED");

        vm.recordLogs();
        raid.settle(raidId);
        _toEscrow(_message(address(gameMessenger)));
        (,, uint256 coins,) = raid.bossOf(raidId);
        _eq(_coins(alice), 5000 - 2500 - 40 + coins / 2, "LEAD_A_COINS");
        _eq(_coins(bob), 5000 - 2500 + coins / 2, "LEAD_B_COINS");

        // Helper earns 40 USDC * 10 / 1500.
        uint256 bounty = 40e6;
        uint256 helperPay = (bounty * 10) / 1500;
        _eq(escrow.claimable(helper), helperPay, "HELPER_PAY");
        uint256 rest = 40e6 - helperPay;
        _eq(escrow.claimable(alice), (rest * 30e6) / 40e6, "ALICE_REFUND");
        _eq(escrow.claimable(bob), rest - (rest * 30e6) / 40e6, "BOB_REFUND");
        _solvent();
        vm.prank(helper);
        escrow.claim();
        _eq(usdc.balanceOf(helper), helperPay, "HELPER_CLAIMED");
        _solvent();
        vm.expectRevert(BossRaid.WrongStatus.selector);
        raid.settle(raidId);
    }

    function testRaidFailedRefundsFunders() public {
        uint256 raidId = _openRaid();
        _fund(alice, 20e6, raidId);
        _fund(bob, 35e6, raidId);
        address helper = address(0xBEEF);
        _register(helper);
        vm.prank(helper);
        raid.attack(raidId);
        vm.expectRevert(BossRaid.RaidRunning.selector);
        raid.settle(raidId);
        vm.warp(RAID_TIME + 600);
        _eq(raid.currentRaidId(), raidId + 1, "PREVIOUS_EPOCH");
        vm.prank(helper);
        vm.expectRevert(BossRaid.RaidOver.selector);
        raid.attack(raidId);
        vm.recordLogs();
        raid.settle(raidId);
        _toEscrow(_message(address(gameMessenger)));
        _eq(escrow.claimable(helper), 0, "NO_PAY_ON_FAIL");
        _eq(escrow.claimable(alice), 20e6, "FULL_REFUND");
        _eq(escrow.claimable(bob), 35e6, "PARTNER_FULL_REFUND");
        _eq(_coins(alice), 0, "NO_BOSS_COINS");
        _solvent();
    }

    function testEscrowExpiresIfSettleNeverArrives() public {
        uint256 raidId = _openRaid();
        _fund(bob, 15e6, raidId);
        vm.expectRevert(RaidEscrow.TooEarly.selector);
        escrow.refundExpired(raidId);
        vm.warp(RAID_TIME + 600 + 10 minutes);
        escrow.refundExpired(raidId);
        _eq(escrow.claimable(bob), 15e6, "EXPIRED_REFUND");
        _solvent();
    }

    function testEscrowOnlyLeadsFundWithinCapAndDeadline() public {
        uint256 raidId = _openRaid();
        _fund(alice, 60e6, raidId);
        _fund(bob, 40e6, raidId);
        _eq(raid.raidView(raidId).bounty, 100e6, "COMBINED_CAP");
        address stranger = address(0xCAFE);
        vm.startPrank(stranger);
        usdc.faucet();
        usdc.approve(address(escrow), 10e6);
        vm.expectRevert(RaidEscrow.NotLead.selector);
        escrow.fund(raidId, 10e6);
        vm.stopPrank();
        vm.startPrank(alice);
        usdc.approve(address(escrow), 1e6);
        vm.expectRevert(RaidEscrow.BadAmount.selector);
        escrow.fund(raidId, 1e6);
        vm.stopPrank();
        vm.warp(RAID_TIME + 600);
        vm.prank(alice);
        vm.expectRevert(RaidEscrow.TooLate.selector);
        escrow.fund(raidId, 1e6);
    }

    function testLateFundingReceiptDoesNotReduceBounty() public {
        uint256 raidId = _openRaid();
        Message memory first = _queueFunding(alice, 15e6, raidId);
        Message memory second = _queueFunding(bob, 20e6, raidId);
        _toGame(second);
        _toGame(first);
        _eq(raid.raidView(raidId).bounty, 35e6, "LATEST_TOTAL");
        _solvent();
    }

    function testSettlementBeforeOpeningLeavesEscrowClosed() public {
        (uint256 raidId, Message memory opening) = _acceptRaid();
        vm.warp(RAID_TIME + 600);
        vm.recordLogs();
        raid.settle(raidId);
        _toEscrow(_message(address(gameMessenger)));
        _toEscrow(opening);
        (,, RaidEscrow.Status status,,,) = escrow.raids(raidId);
        _eq(uint8(status), uint8(RaidEscrow.Status.Settled), "LATE_OPEN_CANNOT_REOPEN");
        _solvent();
    }

    function testEndpointsRejectForgedMessages() public {
        vm.expectRevert(CrossChainEndpoint.Unauthorized.selector);
        escrow.receiveTeleporterMessage(GAME, address(raid), hex"");
        vm.prank(address(gameMessenger));
        vm.expectRevert(CrossChainEndpoint.Unauthorized.selector);
        raid.receiveTeleporterMessage(GAME, address(escrow), hex"");
        vm.expectRevert(CrossChainEndpoint.PeerAlreadySet.selector);
        raid.setPeer(address(1));
    }

    function testRaidLeadMustBeAcceptedByPartner() public {
        vm.warp(RAID_TIME);
        _register(alice);
        _register(bob);
        vm.prank(alice);
        uint256 raidId = raid.proposeLead(bob);
        vm.prank(alice);
        vm.expectRevert(BossRaid.NotCrew.selector);
        raid.acceptLead(raidId);
        // An unaccepted proposal cannot be overwritten until it goes stale.
        vm.prank(bob);
        vm.expectRevert(BossRaid.WrongStatus.selector);
        raid.proposeLead(alice);
        vm.warp(RAID_TIME + 3 minutes);
        vm.prank(bob);
        raid.proposeLead(alice);
    }
}

contract PuzzleProbe {
    function check(uint64 board, bytes calldata moves) external pure returns (bool) {
        return SlidePuzzle.solves(board, moves);
    }
}
