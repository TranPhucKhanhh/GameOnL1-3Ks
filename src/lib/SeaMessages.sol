// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/// @notice ICM message kinds exchanged between BossRaid (Game L1) and RaidEscrow (C-Chain).
/// Every message is abi.encode(uint8 kind, bytes body).
library SeaMessages {
    /// L1 -> C-Chain: a co-op crew opened a raid. body = (raidId, leadA, leadB, deadline)
    uint8 internal constant RAID_OPENED = 1;
    /// C-Chain -> L1: the crew's escrowed bounty changed. body = (raidId, totalBounty)
    uint8 internal constant BOUNTY_FUNDED = 2;
    /// L1 -> C-Chain: raid finished. body = (raidId, defeated, helpers[], helperDamage[], totalDamage)
    uint8 internal constant RAID_SETTLED = 3;
}
