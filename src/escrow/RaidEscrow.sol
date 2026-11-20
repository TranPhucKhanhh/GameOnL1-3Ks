// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {CrossChainEndpoint} from "../CrossChainEndpoint.sol";
import {SeaMessages} from "../lib/SeaMessages.sol";

interface IERC20Min {
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

/// @title RaidEscrow (C-Chain)
/// @notice Holds a co-op lead crew's own test-USDC bounty for one raid. There is no sponsor pool and no yield:
/// every unit paid out was deposited by that raid's two lead captains. Helpers are paid by damage share;
/// whatever helpers did not earn goes back to the two funders in proportion to what each put in.
/// If the settle message never arrives, the funders can reclaim everything after a grace period.
/// No admin can move funds. Payouts are credited and pulled with claim() so one bad transfer cannot block a raid.
contract RaidEscrow is CrossChainEndpoint {
    enum Status {
        None,
        Open,
        Settled,
        Expired
    }

    struct Raid {
        address leadA;
        address leadB;
        Status status;
        uint64 deadline;
        uint256 fundedA;
        uint256 fundedB;
    }

    IERC20Min public immutable token;
    uint256 public immutable maxBounty; // per raid, keeps the demo small
    uint64 public immutable grace;

    mapping(uint256 => Raid) public raids;
    mapping(address => uint256) public claimable;
    uint256 public totalEscrowed;
    uint256 public totalClaimable;
    bool private locked;

    event RaidRegistered(uint256 indexed raidId, address leadA, address leadB, uint64 deadline);
    event Funded(uint256 indexed raidId, address indexed funder, uint256 amount, uint256 total);
    event Paid(uint256 indexed raidId, address indexed to, uint256 amount, bool helper);
    event RaidClosed(uint256 indexed raidId, Status status);
    event Claimed(address indexed to, uint256 amount);

    error WrongStatus();
    error NotLead();
    error BadAmount();
    error TooLate();
    error TooEarly();
    error TransferFailed();
    error Reentrancy();
    error BadMessage();

    modifier nonReentrant() {
        if (locked) revert Reentrancy();
        locked = true;
        _;
        locked = false;
    }

    constructor(
        address token_,
        address messenger_,
        bytes32 gameBlockchainID_,
        address configurator_,
        uint256 maxBounty_,
        uint64 grace_
    ) CrossChainEndpoint(messenger_, gameBlockchainID_, configurator_) {
        if (token_.code.length == 0 || maxBounty_ == 0) revert BadConfiguration();
        token = IERC20Min(token_);
        maxBounty = maxBounty_;
        grace = grace_;
    }

    function bountyOf(uint256 raidId) public view returns (uint256) {
        Raid storage r = raids[raidId];
        return r.fundedA + r.fundedB;
    }

    /// @notice A lead captain adds test USDC to their own raid's bounty (approve this contract first).
    function fund(uint256 raidId, uint256 amount) external nonReentrant {
        Raid storage r = raids[raidId];
        if (r.status != Status.Open) revert WrongStatus();
        if (block.timestamp >= r.deadline) revert TooLate();
        if (msg.sender != r.leadA && msg.sender != r.leadB) revert NotLead();
        if (amount == 0 || bountyOf(raidId) + amount > maxBounty) revert BadAmount();
        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        if (msg.sender == r.leadA) r.fundedA += amount;
        else r.fundedB += amount;
        totalEscrowed += amount;
        uint256 total = bountyOf(raidId);
        emit Funded(raidId, msg.sender, amount, total);
        _send(abi.encode(SeaMessages.BOUNTY_FUNDED, abi.encode(raidId, total)));
    }

    /// @notice Safety exit: if no settle message arrived by deadline + grace, funders get their deposits back.
    function refundExpired(uint256 raidId) external nonReentrant {
        Raid storage r = raids[raidId];
        if (r.status != Status.Open) revert WrongStatus();
        if (block.timestamp < uint256(r.deadline) + grace) revert TooEarly();
        r.status = Status.Expired;
        _refundLeads(raidId, r, r.fundedA, r.fundedB);
        emit RaidClosed(raidId, Status.Expired);
    }

    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert BadAmount();
        claimable[msg.sender] = 0;
        totalClaimable -= amount;
        if (!token.transfer(msg.sender, amount)) revert TransferFailed();
        emit Claimed(msg.sender, amount);
    }

    // ---------------------------------------------------------------- ICM

    function receiveTeleporterMessage(bytes32 sourceBlockchainID, address originSenderAddress, bytes calldata message)
        external
        nonReentrant
    {
        _authenticate(sourceBlockchainID, originSenderAddress);
        (uint8 kind, bytes memory body) = abi.decode(message, (uint8, bytes));
        if (kind == SeaMessages.RAID_OPENED) {
            (uint256 raidId, address a, address b, uint64 deadline) =
                abi.decode(body, (uint256, address, address, uint64));
            Raid storage r = raids[raidId];
            if (r.status != Status.None) return; // duplicate delivery is a no-op
            r.leadA = a;
            r.leadB = b;
            r.deadline = deadline;
            r.status = Status.Open;
            emit RaidRegistered(raidId, a, b, deadline);
        } else if (kind == SeaMessages.RAID_SETTLED) {
            (uint256 raidId, bool defeated, address[] memory helpers, uint256[] memory dmg, uint256 totalDamage) =
                abi.decode(body, (uint256, bool, address[], uint256[], uint256));
            _settle(raidId, defeated, helpers, dmg, totalDamage);
        } else {
            revert BadMessage();
        }
    }

    function _settle(
        uint256 raidId,
        bool defeated,
        address[] memory helpers,
        uint256[] memory dmg,
        uint256 totalDamage
    ) internal {
        Raid storage r = raids[raidId];
        // Settlement can arrive before registration. Record it so a late opening cannot accept deposits.
        if (r.status == Status.None) {
            r.status = Status.Settled;
            emit RaidClosed(raidId, Status.Settled);
            return;
        }
        // Settled or expired raids have no funds left to move.
        if (r.status != Status.Open) return;
        if (helpers.length != dmg.length) revert BadMessage();
        r.status = Status.Settled;
        uint256 bounty = r.fundedA + r.fundedB;
        uint256 paid;
        if (defeated && bounty > 0 && totalDamage > 0) {
            for (uint256 i = 0; i < helpers.length; i++) {
                uint256 share = (bounty * dmg[i]) / totalDamage;
                if (share == 0) continue;
                paid += share;
                _credit(raidId, helpers[i], share, true);
            }
        }
        if (paid > bounty) revert BadMessage();
        uint256 rest = bounty - paid;
        // Return the unearned remainder to the funders in proportion to their deposits.
        uint256 backA = bounty == 0 ? 0 : (rest * r.fundedA) / bounty;
        _refundLeads(raidId, r, backA, rest - backA);
        emit RaidClosed(raidId, Status.Settled);
    }

    function _refundLeads(uint256 raidId, Raid storage r, uint256 toA, uint256 toB) internal {
        if (toA > 0) _credit(raidId, r.leadA, toA, false);
        if (toB > 0) _credit(raidId, r.leadB, toB, false);
        // Any helper dust from rounding was already counted in `paid`; escrow total for this raid is released.
        totalEscrowed -= r.fundedA + r.fundedB;
    }

    function _credit(uint256 raidId, address to, uint256 amount, bool helper) internal {
        claimable[to] += amount;
        totalClaimable += amount;
        emit Paid(raidId, to, amount, helper);
    }
}
