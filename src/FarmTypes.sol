// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

library FarmTypes {
    enum Action {
        Plant,
        Harvest,
        Uproot
    }
    enum Status {
        Empty,
        PlantPending,
        Growing,
        HarvestPending,
        UprootPending
    }
    enum Result {
        Ok,
        InsufficientCredits,
        InsufficientRewards,
        Occupied,
        NoPosition,
        NotMature
    }

    struct Request {
        uint256 id;
        address player;
        uint8 slot;
        Action action;
        uint8 tier;
        uint256 amount;
    }

    struct Reply {
        uint256 id;
        address player;
        uint8 slot;
        Action action;
        Result result;
        uint64 plantedAt;
        uint64 unlockAt;
        uint256 principal;
        uint256 reward;
    }

    struct Plot {
        Status status;
        uint8 tier;
        uint256 requestId;
        uint64 plantedAt;
        uint64 unlockAt;
        uint256 principal;
        uint256 reward;
    }
}
