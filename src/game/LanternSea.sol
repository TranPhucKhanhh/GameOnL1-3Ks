// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/// @title LanternSea (Game L1 core)
/// @notice Captains, sailing charges, the hashed sea graph, island claims, captain's-log notes, coins, gems and Parley.
/// Coins and gems are free in-game points: they cannot be bought and have no withdrawal or bridge path.
/// Rewards depend only on the sail cost class and player behaviour (streak, puzzle speed), never on a random roll.
contract LanternSea {
    // ---------------------------------------------------------------- constants & config

    uint8 public constant MAX_CHARGES = 3;
    uint8 public constant COOP_MIN_COST = 4;
    uint256 public constant NOTE_MAX_BYTES = 140;
    uint256 public constant PARLEY_CODE_MAX_AGE = 120; // seconds a signed Parley QR stays valid

    /// Coin ranges per cost class: [min, span]. Exact amount inside the range comes from behaviour.
    uint256 public constant SAIL1_MIN = 10;
    uint256 public constant SAIL1_SPAN = 10;
    uint256 public constant SAIL2_MIN = 25;
    uint256 public constant SAIL2_SPAN = 15;
    uint256 public constant COOP_MIN = 60;
    uint256 public constant COOP_SPAN = 40;
    uint256 public constant STREAK_CAP = 5;

    bool public immutable demoMode;
    uint16 public immutable mapSize;
    bytes32 public immutable worldSeed;
    uint64 public immutable chargeInterval; // seconds to regain one charge
    uint64 public immutable dayLength; // streak "day"
    uint64 public immutable parleyDuration;
    address public immutable configurator;

    address public coopSail;
    address public shipyard;
    address public bossRaid;

    // ---------------------------------------------------------------- state

    struct Captain {
        bool registered;
        uint16 home;
        uint8 storedCharges;
        uint64 chargeUpdatedAt;
        uint64 lastSailDay;
        uint16 streak;
        uint32 sails;
        uint32 islandsFound;
        uint256 coins;
    }

    struct Note {
        address author;
        uint64 at;
        string text;
    }

    mapping(address => Captain) internal captains;
    mapping(address => uint256[4]) internal gemBalance; // 0 Pearl, 1 Emerald, 2 Sapphire, 3 Ruby
    mapping(address => mapping(uint16 => bool)) public visited;
    mapping(address => uint16[]) internal visitedList;
    mapping(uint16 => address) public firstFinder;
    mapping(uint16 => address[]) internal homesAt;
    mapping(uint16 => Note[]) internal notes;
    mapping(address => mapping(uint16 => bool)) public hasNoted;
    mapping(bytes32 => uint64) public parleyUntil;
    mapping(bytes32 => uint64) public parleyDay;

    // ---------------------------------------------------------------- events & errors

    event CaptainRegistered(address indexed captain, uint16 home);
    event Sailed(address indexed captain, uint16 indexed from, uint8 dir, uint16 indexed to, uint8 cost);
    event IslandDiscovered(uint16 indexed island, address indexed captain, uint256 coins);
    event IslandRevisited(uint16 indexed island, address indexed captain, address firstFinder);
    event GemFound(address indexed captain, uint8 gemType, uint16 island);
    event NoteLeft(uint16 indexed island, address indexed author, uint256 index);
    event ParleyStarted(address indexed a, address indexed b, uint64 until);
    event ParleyJump(address indexed captain, address indexed partner, uint16 island);
    event CoinsChanged(address indexed captain, uint256 balance);
    event GemSold(address indexed captain, uint8 gemType, uint256 count, uint256 coins);

    error NotRegistered();
    error AlreadyRegistered();
    error NotVisited();
    error BadDirection();
    error CoopRequired();
    error NotEnoughCharges(uint8 have, uint8 need);
    error NotEnoughCoins();
    error NotEnoughGems();
    error BadNote();
    error AlreadyNoted();
    error BadParley();
    error ParleyUsedToday();
    error NoActiveParley();
    error Unauthorized();
    error ModulesAlreadySet();
    error BadConfiguration();

    constructor(bytes32 worldSeed_, uint16 mapSize_, bool demoMode_, address configurator_) {
        if (mapSize_ < 16 || configurator_ == address(0)) revert BadConfiguration();
        worldSeed = worldSeed_;
        mapSize = mapSize_;
        demoMode = demoMode_;
        configurator = configurator_;
        // Normal: 3 charges refill over 8 hours. Demo: one charge per minute, declared in the UI and pitch.
        chargeInterval = demoMode_ ? 60 : 160 minutes;
        dayLength = demoMode_ ? 5 minutes : 1 days;
        parleyDuration = demoMode_ ? 10 minutes : 1 hours;
    }

    /// @notice One-time wiring of trusted game modules; no later admin power exists.
    function setModules(address coopSail_, address shipyard_, address bossRaid_) external {
        if (msg.sender != configurator) revert Unauthorized();
        if (coopSail != address(0)) revert ModulesAlreadySet();
        if (coopSail_ == address(0) || shipyard_ == address(0) || bossRaid_ == address(0)) revert BadConfiguration();
        coopSail = coopSail_;
        shipyard = shipyard_;
        bossRaid = bossRaid_;
    }

    modifier onlyModule() {
        if (msg.sender != coopSail && msg.sender != shipyard && msg.sender != bossRaid) revert Unauthorized();
        _;
    }

    // ---------------------------------------------------------------- world (pure hash geometry)

    /// @notice Number of sea lanes (1..4) leaving an island.
    function directionCount(uint16 island) public view returns (uint8) {
        return 1 + uint8(uint256(keccak256(abi.encode(worldSeed, island, "lanes"))) % 4);
    }

    /// @notice Destination and charge cost of lane `dir` from `island`. Costs: 1, 2, or co-op 4-5.
    /// The small map makes destinations collide on purpose, so captains stumble on each other's islands.
    function route(uint16 island, uint8 dir) public view returns (uint16 to, uint8 cost) {
        if (dir >= directionCount(island)) revert BadDirection();
        uint256 h = uint256(keccak256(abi.encode(worldSeed, island, dir)));
        to = uint16(h % mapSize);
        if (to == island) to = uint16((uint256(to) + 1) % mapSize);
        uint256 cls = (h >> 64) % 10;
        cost = cls < 6 ? 1 : cls < 9 ? 2 : COOP_MIN_COST + uint8((h >> 128) % 2);
    }

    /// @notice Gem guaranteed on the first co-op landing at an island.
    function gemTypeOf(uint16 island) public view returns (uint8) {
        return uint8(uint256(keccak256(abi.encode(worldSeed, island, "gem"))) % 4);
    }

    function homeOf(address captain) public view returns (uint16) {
        return uint16(uint256(keccak256(abi.encode(worldSeed, captain, "home"))) % mapSize);
    }

    // ---------------------------------------------------------------- captains & charges

    function register() external {
        Captain storage c = captains[msg.sender];
        if (c.registered) revert AlreadyRegistered();
        uint16 home = homeOf(msg.sender);
        c.registered = true;
        c.home = home;
        c.storedCharges = MAX_CHARGES;
        c.chargeUpdatedAt = uint64(block.timestamp);
        homesAt[home].push(msg.sender);
        // A home that collides with an unclaimed island becomes this captain's own discovery (no coins).
        if (firstFinder[home] == address(0)) firstFinder[home] = msg.sender;
        _markVisited(msg.sender, home);
        emit CaptainRegistered(msg.sender, home);
    }

    function chargesOf(address captain) public view returns (uint8 charges, uint64 nextChargeAt) {
        Captain storage c = captains[captain];
        if (!c.registered) return (0, 0);
        if (c.storedCharges >= MAX_CHARGES) return (MAX_CHARGES, 0);
        uint256 gained = (block.timestamp - c.chargeUpdatedAt) / chargeInterval;
        uint256 total = c.storedCharges + gained;
        if (total >= MAX_CHARGES) return (MAX_CHARGES, 0);
        charges = uint8(total);
        nextChargeAt = c.chargeUpdatedAt + uint64((gained + 1) * chargeInterval);
    }

    function _spendCharges(address captain, uint8 amount) internal {
        Captain storage c = captains[captain];
        if (!c.registered) revert NotRegistered();
        uint256 gained = (block.timestamp - c.chargeUpdatedAt) / chargeInterval;
        uint256 total = uint256(c.storedCharges) + gained;
        if (total >= MAX_CHARGES) {
            total = MAX_CHARGES;
            c.chargeUpdatedAt = uint64(block.timestamp);
        } else {
            c.chargeUpdatedAt += uint64(gained * chargeInterval);
        }
        if (total < amount) revert NotEnoughCharges(uint8(total), amount);
        c.storedCharges = uint8(total - amount);
    }

    // ---------------------------------------------------------------- sailing

    /// @notice Sail lane `dir` from an island you have visited. Co-op lanes must go through CoopSail.
    function sail(uint16 from, uint8 dir) external {
        if (!visited[msg.sender][from]) revert NotVisited();
        (uint16 to, uint8 cost) = route(from, dir);
        if (cost >= COOP_MIN_COST) revert CoopRequired();
        _spendCharges(msg.sender, cost);
        emit Sailed(msg.sender, from, dir, to, cost);
        _arrive(msg.sender, to, cost == 1 ? SAIL1_MIN : SAIL2_MIN, cost == 1 ? SAIL1_SPAN : SAIL2_SPAN);
    }

    function _bumpStreak(Captain storage c) internal {
        uint64 day = uint64(block.timestamp / dayLength);
        if (c.sails == 0 || day > c.lastSailDay + 1) c.streak = 1;
        else if (day == c.lastSailDay + 1) c.streak += 1;
        c.lastSailDay = day;
        c.sails += 1;
    }

    /// @dev Reward = min + span * min(streak, 5) / 5. Same behaviour always yields the same coins.
    function _arrive(address captain, uint16 to, uint256 minCoins, uint256 span) internal {
        Captain storage c = captains[captain];
        _bumpStreak(c);
        _markVisited(captain, to);
        address finder = firstFinder[to];
        if (finder != address(0)) {
            emit IslandRevisited(to, captain, finder);
            return;
        }
        firstFinder[to] = captain;
        c.islandsFound += 1;
        uint256 streak = c.streak > STREAK_CAP ? STREAK_CAP : c.streak;
        uint256 coins = minCoins + (span * streak) / STREAK_CAP;
        c.coins += coins;
        emit IslandDiscovered(to, captain, coins);
        emit CoinsChanged(captain, c.coins);
    }

    function _markVisited(address captain, uint16 island) internal {
        if (!visited[captain][island]) {
            visited[captain][island] = true;
            visitedList[captain].push(island);
        }
    }

    // ---------------------------------------------------------------- module hooks

    function spendCharges(address captain, uint8 amount) external onlyModule {
        _spendCharges(captain, amount);
    }

    /// @notice Co-op landing. Both captains pay charges in CoopSail first. speedBps (0..10000) rewards a fast puzzle.
    /// The first co-op crew to land claims the island: each captain gets coins plus the island's gem.
    function coopArrive(address a, address b, uint16 to, uint256 speedBps) external onlyModule returns (bool fresh) {
        if (speedBps > 10_000) speedBps = 10_000;
        fresh = firstFinder[to] == address(0);
        _bumpStreak(captains[a]);
        _bumpStreak(captains[b]);
        _markVisited(a, to);
        _markVisited(b, to);
        if (!fresh) {
            emit IslandRevisited(to, a, firstFinder[to]);
            return false;
        }
        firstFinder[to] = a;
        uint256 coins = COOP_MIN + (COOP_SPAN * speedBps) / 10_000;
        uint8 gem = gemTypeOf(to);
        for (uint256 i = 0; i < 2; i++) {
            address who = i == 0 ? a : b;
            Captain storage c = captains[who];
            c.islandsFound += 1;
            c.coins += coins;
            gemBalance[who][gem] += 1;
            emit GemFound(who, gem, to);
            emit CoinsChanged(who, c.coins);
        }
        emit IslandDiscovered(to, a, coins);
    }

    function addCoins(address captain, uint256 amount) external onlyModule {
        Captain storage c = captains[captain];
        if (!c.registered) revert NotRegistered();
        c.coins += amount;
        emit CoinsChanged(captain, c.coins);
    }

    function spendCoins(address captain, uint256 amount) external onlyModule {
        Captain storage c = captains[captain];
        if (c.coins < amount) revert NotEnoughCoins();
        c.coins -= amount;
        emit CoinsChanged(captain, c.coins);
    }

    // ---------------------------------------------------------------- gems

    function gemPrice(uint8 gemType) public pure returns (uint256) {
        if (gemType == 0) return 50;
        if (gemType == 1) return 80;
        if (gemType == 2) return 120;
        if (gemType == 3) return 200;
        revert BadConfiguration();
    }

    /// @notice Sell gems back to the harbour for coins at a fixed price. Gems are never sold for money.
    function sellGems(uint8 gemType, uint256 count) external {
        uint256 price = gemPrice(gemType);
        if (count == 0 || gemBalance[msg.sender][gemType] < count) revert NotEnoughGems();
        gemBalance[msg.sender][gemType] -= count;
        Captain storage c = captains[msg.sender];
        c.coins += price * count;
        emit GemSold(msg.sender, gemType, count, price * count);
        emit CoinsChanged(msg.sender, c.coins);
    }

    // ---------------------------------------------------------------- captain's log notes

    /// @notice Leave one short note on an island you have visited. Order is preserved; index 0 is usually the discoverer.
    /// Do not write personal data: notes are public and permanent.
    function leaveNote(uint16 island, string calldata text) external {
        if (!visited[msg.sender][island]) revert NotVisited();
        uint256 len = bytes(text).length;
        if (len == 0 || len > NOTE_MAX_BYTES) revert BadNote();
        if (hasNoted[msg.sender][island]) revert AlreadyNoted();
        hasNoted[msg.sender][island] = true;
        notes[island].push(Note(msg.sender, uint64(block.timestamp), text));
        emit NoteLeft(island, msg.sender, notes[island].length - 1);
    }

    // ---------------------------------------------------------------- Parley (in-person meeting)

    function pairKey(address a, address b) public pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    /// @notice Hash a captain signs (EIP-191 personal_sign over these 32 bytes) and shows as a QR code.
    function parleyDigest(address shower, uint64 expiry) public view returns (bytes32) {
        return keccak256(abi.encode("LanternSea Parley", block.chainid, address(this), shower, expiry));
    }

    /// @notice Scan another captain's QR (their signed, short-lived code) to start a Parley. One per pair per day.
    function parley(address shower, uint64 expiry, bytes calldata signature) external {
        if (shower == msg.sender || !captains[shower].registered || !captains[msg.sender].registered) {
            revert BadParley();
        }
        if (block.timestamp > expiry || expiry > block.timestamp + PARLEY_CODE_MAX_AGE) revert BadParley();
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", parleyDigest(shower, expiry)));
        if (_recover(ethHash, signature) != shower) revert BadParley();
        bytes32 key = pairKey(shower, msg.sender);
        uint64 day = uint64(block.timestamp / dayLength) + 1; // +1 so the zero value means "never"
        if (parleyDay[key] == day) revert ParleyUsedToday();
        parleyDay[key] = day;
        uint64 until = uint64(block.timestamp) + parleyDuration;
        parleyUntil[key] = until;
        emit ParleyStarted(shower, msg.sender, until);
    }

    function parleyActive(address a, address b) public view returns (bool) {
        return parleyUntil[pairKey(a, b)] >= block.timestamp;
    }

    /// @notice While a Parley is active, jump to any island your partner has visited for one charge.
    function parleyJump(address partner, uint16 island) external {
        if (!parleyActive(msg.sender, partner)) revert NoActiveParley();
        if (!visited[partner][island]) revert NotVisited();
        _spendCharges(msg.sender, 1);
        Captain storage c = captains[msg.sender];
        _bumpStreak(c);
        _markVisited(msg.sender, island);
        emit ParleyJump(msg.sender, partner, island);
    }

    function _recover(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v < 27) v += 27;
        // Reject malleable signatures (EIP-2).
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        return ecrecover(hash, v, r, s);
    }

    // ---------------------------------------------------------------- views

    struct CaptainView {
        bool registered;
        uint16 home;
        uint8 charges;
        uint64 nextChargeAt;
        uint16 streak;
        uint32 sails;
        uint32 islandsFound;
        uint256 coins;
        uint256[4] gems;
        uint256 visitedCount;
    }

    function captainView(address captain) external view returns (CaptainView memory v) {
        Captain storage c = captains[captain];
        (uint8 ch, uint64 next) = chargesOf(captain);
        uint16 streak = c.streak;
        if (c.sails > 0 && uint64(block.timestamp / dayLength) > c.lastSailDay + 1) streak = 0;
        v = CaptainView(
            c.registered,
            c.home,
            ch,
            next,
            streak,
            c.sails,
            c.islandsFound,
            c.coins,
            gemBalance[captain],
            visitedList[captain].length
        );
    }

    function isRegistered(address captain) external view returns (bool) {
        return captains[captain].registered;
    }

    function visitedIslands(address captain) external view returns (uint16[] memory) {
        return visitedList[captain];
    }

    function homesOn(uint16 island) external view returns (address[] memory) {
        return homesAt[island];
    }

    function noteCount(uint16 island) external view returns (uint256) {
        return notes[island].length;
    }

    function getNotes(uint16 island, uint256 start, uint256 count) external view returns (Note[] memory out) {
        Note[] storage all = notes[island];
        if (start >= all.length) return new Note[](0);
        uint256 end = start + count > all.length ? all.length : start + count;
        out = new Note[](end - start);
        for (uint256 i = start; i < end; i++) {
            out[i - start] = all[i];
        }
    }
}
