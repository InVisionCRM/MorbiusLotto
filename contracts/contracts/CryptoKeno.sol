// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*

                                       ▄▄_
                                   ,▓███████▄_
                               _▄███████████████▄_
                            ▄▓██████████████████████▄_
                        ,▌█████████████▌─╩██████████████▄_
                     ▄█████████████▓"        ▀██████████████▄
                 ,▓████████████▌╙               └▓█████████████▓▄
             _▌█████████████╨         ▄▄_           ╩██████████████▓▄
           ▓████████████▀         _▌██████▓▄            ▀██████████████
           ██████████▌_        ▄▓█████████████▌▄           └▓██████████
           ██████████████▄_ ▄█████████████████████▌_           ╨███████
             └▀███████████████████████████████████████▄_           ▀███
                 └▀█████████████████▀      ▀█████████████▓            ╙
                     '▀█████████████▌_         ▀██████████
                         ╙▌█████████████▄_        └▀██████
                             ╙▌████████████▌▄         ╙▓██
                                 ╙▌████████████▄_
                        ▌▄           ╙▀███████████▓▄
                        ████▌_           ╙▌███████████▄_
                        ████████▄_           ╙▓██████████▓▄
                        ████████████▄_     ,▄████████████████▌_
          ╒▄             '▀████████████▓▄▌██████████████████████▓▄_
          ▐██▓▄_             ╙▓████████████████████▀    ╙▓██████████▌▄
          ▐██████▓▄_             ╨█████████████▀"         ,▌███████████
          ▐██████████▌▄_            `▀██████▀          ▄▌██████████████
          └██████████████▌▄             ╙"         ╓▄████████████████▀`
             ╙▀█████████████▓▄▄                _▄▓███████████████▀"
                 ╙▀█████████████▓▄_         ▄Φ███████████████▌"
                     ╙▀█████████████▓▄_ ,▄▓██████████████▓╙
                         ╙▀██████████████████████████▓▀
                             ╙▀██████████████████▓▀`
                                 ╙▀▓▓▓▓▓▓▓▓▓█▓▀"
                                     ╙▀▓▓▓▀"

*/

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IPulseXRouter {
    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);
}

/**
 * @title Crypto Keno — Quick Play (Instant)
 * @notice On-chain 20-of-80 Keno with 1-10 spots. Single-transaction instant play:
 *         player picks numbers, wagers, and receives payout atomically.
 * @dev Bankrolled by contract reserve. Fee structure matches Plinko (5% from payouts).
 *      PLS purchases route through treasury.
 */
contract CryptoKeno is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    uint8 public constant NUMBERS = 80;
    uint8 public constant DRAWN = 20;
    uint8 public constant MIN_SPOT = 1;
    uint256 public constant MIN_WAGER = 1 * 10**18; // 1 MORBIUS minimum
    uint256 public constant BPS_DENOMINATOR = 10_000;
    /// @notice Maximum gross payout per ticket (2.5M MORBIUS). 100k wager × 25x = 2.5M.
    uint256 public constant MAX_PAYOUT = 2_500_000 * 10**18;

    // ============ Structs ============

    struct Ticket {
        address player;
        uint8 spotSize;
        uint256 wager;
        uint256 numbersBitmap;        // Player's picks (bit i = number i+1)
        uint8[DRAWN] winningNumbers;  // 20 drawn numbers for this ticket
        uint256 hits;
        uint256 grossPayout;          // Pre-fee payout
        uint256 netPayout;            // Post-fee payout to player
        uint64 timestamp;
        bool paidWithPLS;
    }

    // ============ State Variables ============

    IERC20 public immutable token;
    address public immutable wrappedPulse; // WPLS address for router price queries
    IPulseXRouter public immutable pulseXRouter;
    uint8 public immutable maxSpot;

    uint256 public nextTicketId = 1;
    uint256 public maxWagerPerDraw;
    uint256 public contractReserve; // Available funds for payouts

    // Treasury (receives PLS from PLS-based purchases)
    address public plsTreasury;

    // Fee configuration (matches Plinko: 5% total from payouts)
    uint256 public distributionFeeBps;    // 125 (1.25%) — MORBIUS holders
    address public distributionRecipient;
    uint256 public burnFeeBps;            // 50 (0.5%) — burned
    address public burnAddress;
    uint256 public platformFeeBps;        // 175 (1.75%) — house
    address public platformFeeRecipient;
    uint256 public lpDistributionFeeBps;  // 150 (1.5%) — LP holders
    address public lpDistributionRecipient;

    // Fee tracking
    uint256 public totalDistributionFeesCollected;
    uint256 public totalBurnFeesCollected;
    uint256 public totalPlatformFeesCollected;
    uint256 public totalLpDistributionFeesCollected;

    // Paytable: paytable[spot][hits] = multiplier
    mapping(uint8 => uint256[16]) public paytable;

    // Tickets
    mapping(uint256 => Ticket) public tickets;

    // Player Statistics
    mapping(address => uint256[]) public playerTickets;
    mapping(address => uint256) public playerTotalWagered;
    mapping(address => uint256) public playerTotalWon;
    mapping(address => uint256) public playerTicketCount;
    mapping(address => uint256) public playerWinCount;
    mapping(address => uint256) public playerBiggestWin;

    // Global Statistics
    uint256 public globalTotalWagered;
    uint256 public globalTotalWon;
    uint256 public globalTicketCount;

    // ============ Events ============

    event KenoPlayed(
        address indexed player,
        uint256 indexed ticketId,
        uint8 spotSize,
        uint256 wager,
        uint256 hits,
        uint256 grossPayout,
        uint256 netPayout,
        bool paidWithPLS
    );

    event ContractFunded(address indexed funder, uint256 amount);
    event EmergencyWithdraw(uint256 amount);
    event PaytableUpdated(uint8 spotSize, uint8 hits, uint256 multiplier);
    event MaxWagerUpdated(uint256 maxWagerPerDraw);
    event PlsTreasuryUpdated(address newTreasury);
    event DistributionFeeUpdated(uint256 bps, address recipient);
    event BurnFeeUpdated(uint256 bps, address burnAddr);
    event PlatformFeeUpdated(uint256 bps, address recipient);
    event LpDistributionFeeUpdated(uint256 bps, address recipient);

    // ============ Errors ============

    error InvalidSpotSize();
    error InvalidNumbers();
    error WagerTooHigh();
    error WagerTooLow();
    error InsufficientContractBalance();
    error ExceedsReserve();

    // ============ Constructor ============

    constructor(
        address token_,
        uint8 maxSpot_,
        address wrappedPulse_,
        address pulseXRouter_,
        address plsTreasury_,
        address distributionRecipient_,
        address burnAddress_,
        address platformFeeRecipient_,
        address lpDistributionRecipient_
    ) Ownable(msg.sender) {
        require(token_ != address(0), "token required");
        require(maxSpot_ >= MIN_SPOT && maxSpot_ <= 20, "maxSpot bounds");
        require(wrappedPulse_ != address(0), "wrapped PLS required");
        require(pulseXRouter_ != address(0), "router required");
        require(plsTreasury_ != address(0), "treasury required");
        require(distributionRecipient_ != address(0), "distribution recipient required");
        require(burnAddress_ != address(0), "burn address required");
        require(platformFeeRecipient_ != address(0), "platform recipient required");
        require(lpDistributionRecipient_ != address(0), "lp recipient required");

        token = IERC20(token_);
        wrappedPulse = wrappedPulse_;
        pulseXRouter = IPulseXRouter(pulseXRouter_);
        maxSpot = maxSpot_;
        plsTreasury = plsTreasury_;
        maxWagerPerDraw = 100_000 * 10**18;

        // Fee recipients
        distributionRecipient = distributionRecipient_;
        burnAddress = burnAddress_;
        platformFeeRecipient = platformFeeRecipient_;
        lpDistributionRecipient = lpDistributionRecipient_;

        // Fee BPS (matches Plinko: 5% total)
        distributionFeeBps = 125;   // 1.25%
        burnFeeBps = 50;            // 0.5%
        platformFeeBps = 175;       // 1.75%
        lpDistributionFeeBps = 150; // 1.5%

        _initDefaultPaytables();
    }

    // ============ Player Actions ============

    /**
     * @notice Play Keno instantly with MORBIUS tokens.
     * @param numbers Player picks (length == spotSize, unique ints in [1,80]).
     * @param spotSize Number of spots (1-10).
     * @param wager Wager amount in MORBIUS.
     */
    function playKeno(
        uint8[] calldata numbers,
        uint8 spotSize,
        uint256 wager
    ) external whenNotPaused nonReentrant {
        if (spotSize < MIN_SPOT || spotSize > maxSpot) revert InvalidSpotSize();
        if (wager < MIN_WAGER) revert WagerTooLow();
        if (maxWagerPerDraw > 0 && wager > maxWagerPerDraw) revert WagerTooHigh();

        uint256 numbersBitmap = _packNumbers(numbers, spotSize);

        // Transfer wager to contract
        token.safeTransferFrom(msg.sender, address(this), wager);

        // Deduct fees from wager upfront
        (uint256 netWager, uint256 feeDist, uint256 feeBurn, uint256 feePlatform, uint256 feeLp) =
            _computeWagerFees(wager);

        // Distribute fees from wager
        if (feeDist > 0) {
            token.safeTransfer(distributionRecipient, feeDist);
            totalDistributionFeesCollected += feeDist;
        }
        if (feeBurn > 0) {
            token.safeTransfer(burnAddress, feeBurn);
            totalBurnFeesCollected += feeBurn;
        }
        if (feePlatform > 0) {
            token.safeTransfer(platformFeeRecipient, feePlatform);
            totalPlatformFeesCollected += feePlatform;
        }
        if (feeLp > 0) {
            token.safeTransfer(lpDistributionRecipient, feeLp);
            totalLpDistributionFeesCollected += feeLp;
        }

        // Net wager goes into reserve
        contractReserve += netWager;

        // Generate randomness and draw
        uint256 seed = uint256(keccak256(abi.encodePacked(
            blockhash(block.number - 1),
            block.timestamp,
            msg.sender,
            globalTicketCount,
            tx.gasprice
        )));
        uint8[DRAWN] memory winning = _drawNumbers(seed);
        uint256 hits = _scoreTicket(numbersBitmap, winning);

        // Calculate payout from net wager (no further fee deduction), capped at 2.5M MORBIUS
        uint256 grossPayout = netWager * paytable[spotSize][hits];
        if (grossPayout > MAX_PAYOUT) grossPayout = MAX_PAYOUT;
        uint256 netPayout = grossPayout;

        if (grossPayout > 0) {
            if (contractReserve < grossPayout) revert InsufficientContractBalance();
            contractReserve -= grossPayout;

            // Pay player full payout (fees already taken from wager)
            token.safeTransfer(msg.sender, grossPayout);
        }

        // Store ticket
        uint256 ticketId = nextTicketId++;
        tickets[ticketId] = Ticket({
            player: msg.sender,
            spotSize: spotSize,
            wager: wager,
            numbersBitmap: numbersBitmap,
            winningNumbers: winning,
            hits: hits,
            grossPayout: grossPayout,
            netPayout: netPayout,
            timestamp: uint64(block.timestamp),
            paidWithPLS: false
        });

        // Update stats
        playerTickets[msg.sender].push(ticketId);
        playerTicketCount[msg.sender]++;
        playerTotalWagered[msg.sender] += wager;
        globalTicketCount++;
        globalTotalWagered += wager;

        if (netPayout > 0) {
            playerTotalWon[msg.sender] += netPayout;
            playerWinCount[msg.sender]++;
            if (netPayout > playerBiggestWin[msg.sender]) {
                playerBiggestWin[msg.sender] = netPayout;
            }
            globalTotalWon += netPayout;
        }

        emit KenoPlayed(msg.sender, ticketId, spotSize, wager, uint256(hits), grossPayout, netPayout, false);
    }

    /**
     * @notice Play Keno instantly using native PLS. PLS is sent to treasury,
     *         MORBIUS payouts pulled from treasury.
     * @param numbers Player picks (length == spotSize, unique ints in [1,80]).
     * @param spotSize Number of spots (1-10).
     */
    function playKenoWithPLS(
        uint8[] calldata numbers,
        uint8 spotSize
    ) external payable whenNotPaused nonReentrant {
        if (spotSize < MIN_SPOT || spotSize > maxSpot) revert InvalidSpotSize();
        require(msg.value > 0, "No PLS sent");

        // Get MORBIUS equivalent via router
        address[] memory path = new address[](2);
        path[0] = wrappedPulse;
        path[1] = address(token);
        uint256[] memory amounts = pulseXRouter.getAmountsOut(msg.value, path);
        uint256 morbiusEquivalent = amounts[1];

        if (morbiusEquivalent < MIN_WAGER) revert WagerTooLow();
        if (maxWagerPerDraw > 0 && morbiusEquivalent > maxWagerPerDraw) revert WagerTooHigh();

        uint256 numbersBitmap = _packNumbers(numbers, spotSize);

        // Send PLS to treasury
        (bool sent, ) = plsTreasury.call{value: msg.value}("");
        require(sent, "PLS transfer to treasury failed");

        // Deduct fees from wager upfront — pull fee portion in MORBIUS from treasury
        (uint256 netWager, uint256 feeDist, uint256 feeBurn, uint256 feePlatform, uint256 feeLp) =
            _computeWagerFees(morbiusEquivalent);

        uint256 totalFee = feeDist + feeBurn + feePlatform + feeLp;
        if (totalFee > 0) {
            token.safeTransferFrom(plsTreasury, address(this), totalFee);

            if (feeDist > 0) {
                token.safeTransfer(distributionRecipient, feeDist);
                totalDistributionFeesCollected += feeDist;
            }
            if (feeBurn > 0) {
                token.safeTransfer(burnAddress, feeBurn);
                totalBurnFeesCollected += feeBurn;
            }
            if (feePlatform > 0) {
                token.safeTransfer(platformFeeRecipient, feePlatform);
                totalPlatformFeesCollected += feePlatform;
            }
            if (feeLp > 0) {
                token.safeTransfer(lpDistributionRecipient, feeLp);
                totalLpDistributionFeesCollected += feeLp;
            }
        }

        // Generate randomness and draw
        uint256 seed = uint256(keccak256(abi.encodePacked(
            blockhash(block.number - 1),
            block.timestamp,
            msg.sender,
            globalTicketCount,
            tx.gasprice
        )));
        uint8[DRAWN] memory winning = _drawNumbers(seed);
        uint256 hits = _scoreTicket(numbersBitmap, winning);

        // Calculate payout from net wager (no further fee deduction), capped at 2.5M MORBIUS
        uint256 grossPayout = netWager * paytable[spotSize][hits];
        if (grossPayout > MAX_PAYOUT) grossPayout = MAX_PAYOUT;
        uint256 netPayout = grossPayout;

        if (grossPayout > 0) {
            // Pull MORBIUS payout from treasury
            token.safeTransferFrom(plsTreasury, address(this), grossPayout);

            // Pay player full payout (fees already taken from wager)
            token.safeTransfer(msg.sender, grossPayout);
        }

        // Store ticket
        uint256 ticketId = nextTicketId++;
        tickets[ticketId] = Ticket({
            player: msg.sender,
            spotSize: spotSize,
            wager: morbiusEquivalent,
            numbersBitmap: numbersBitmap,
            winningNumbers: winning,
            hits: hits,
            grossPayout: grossPayout,
            netPayout: netPayout,
            timestamp: uint64(block.timestamp),
            paidWithPLS: true
        });

        // Update stats
        playerTickets[msg.sender].push(ticketId);
        playerTicketCount[msg.sender]++;
        playerTotalWagered[msg.sender] += morbiusEquivalent;
        globalTicketCount++;
        globalTotalWagered += morbiusEquivalent;

        if (netPayout > 0) {
            playerTotalWon[msg.sender] += netPayout;
            playerWinCount[msg.sender]++;
            if (netPayout > playerBiggestWin[msg.sender]) {
                playerBiggestWin[msg.sender] = netPayout;
            }
            globalTotalWon += netPayout;
        }

        emit KenoPlayed(msg.sender, ticketId, spotSize, morbiusEquivalent, uint256(hits), grossPayout, netPayout, true);
    }

    // ============ Admin ============

    function setPaytable(uint8 spotSize, uint8 hits, uint256 multiplier_) external onlyOwner {
        require(spotSize >= MIN_SPOT && spotSize <= maxSpot, "spot out of range");
        require(hits <= spotSize, "hits out of range");
        paytable[spotSize][hits] = multiplier_;
        emit PaytableUpdated(spotSize, hits, multiplier_);
    }

    function setMaxWagerPerDraw(uint256 maxWager) external onlyOwner {
        maxWagerPerDraw = maxWager;
        emit MaxWagerUpdated(maxWager);
    }

    function setPlsTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury address");
        plsTreasury = newTreasury;
        emit PlsTreasuryUpdated(newTreasury);
    }

    function setDistributionFee(uint256 bps, address recipient) external onlyOwner {
        require(recipient != address(0), "zero address");
        distributionFeeBps = bps;
        distributionRecipient = recipient;
        emit DistributionFeeUpdated(bps, recipient);
    }

    function setBurnFee(uint256 bps, address burnAddr) external onlyOwner {
        require(burnAddr != address(0), "zero address");
        burnFeeBps = bps;
        burnAddress = burnAddr;
        emit BurnFeeUpdated(bps, burnAddr);
    }

    function setPlatformFee(uint256 bps, address recipient) external onlyOwner {
        require(recipient != address(0), "zero address");
        platformFeeBps = bps;
        platformFeeRecipient = recipient;
        emit PlatformFeeUpdated(bps, recipient);
    }

    function setLpDistributionFee(uint256 bps, address recipient) external onlyOwner {
        require(recipient != address(0), "zero address");
        lpDistributionFeeBps = bps;
        lpDistributionRecipient = recipient;
        emit LpDistributionFeeUpdated(bps, recipient);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ Bankroll ============

    function fundContract(uint256 amount) external {
        token.safeTransferFrom(msg.sender, address(this), amount);
        contractReserve += amount;
        emit ContractFunded(msg.sender, amount);
    }

    function emergencyWithdraw(uint256 amount) external onlyOwner {
        if (amount > contractReserve) revert ExceedsReserve();
        contractReserve -= amount;
        token.safeTransfer(owner(), amount);
        emit EmergencyWithdraw(amount);
    }

    // ============ Views ============

    function getTicket(uint256 ticketId) external view returns (Ticket memory) {
        return tickets[ticketId];
    }

    function getTickets(uint256[] calldata ticketIds) external view returns (Ticket[] memory) {
        Ticket[] memory results = new Ticket[](ticketIds.length);
        for (uint256 i = 0; i < ticketIds.length; i++) {
            results[i] = tickets[ticketIds[i]];
        }
        return results;
    }

    function getContractReserve() external view returns (uint256) {
        return contractReserve;
    }

    function getPlayerStats(address player)
        external
        view
        returns (
            uint256 totalWagered,
            uint256 totalWon,
            uint256 ticketCount,
            uint256 winCount,
            uint256 winRateBps,
            int256 netPnL,
            uint256 biggestWin
        )
    {
        totalWagered = playerTotalWagered[player];
        totalWon = playerTotalWon[player];
        ticketCount = playerTicketCount[player];
        winCount = playerWinCount[player];
        winRateBps = ticketCount > 0 ? (winCount * 10000) / ticketCount : 0;
        netPnL = int256(totalWon) - int256(totalWagered);
        biggestWin = playerBiggestWin[player];
    }

    function getGlobalStats()
        external
        view
        returns (
            uint256 totalWagered,
            uint256 totalWon,
            uint256 ticketCount
        )
    {
        return (globalTotalWagered, globalTotalWon, globalTicketCount);
    }

    function getPlayerTickets(
        address player,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory) {
        uint256[] storage allTickets = playerTickets[player];
        if (offset >= allTickets.length) {
            return new uint256[](0);
        }

        uint256 end = offset + limit;
        if (end > allTickets.length) {
            end = allTickets.length;
        }

        uint256 resultLength = end - offset;
        uint256[] memory result = new uint256[](resultLength);

        for (uint256 i = 0; i < resultLength; i++) {
            result[i] = allTickets[offset + i];
        }

        return result;
    }

    function getAllPlayerTickets(address player) external view returns (uint256[] memory) {
        return playerTickets[player];
    }

    /**
     * @notice Get the full paytable for a given spot size
     * @param spotSize Number of spots (1-10)
     * @return multipliers Array of multipliers indexed by hits (0..spotSize)
     */
    function getPaytable(uint8 spotSize) external view returns (uint256[] memory multipliers) {
        require(spotSize >= MIN_SPOT && spotSize <= maxSpot, "spot out of range");
        multipliers = new uint256[](spotSize + 1);
        for (uint8 i = 0; i <= spotSize; i++) {
            multipliers[i] = paytable[spotSize][i];
        }
    }

    /**
     * @notice Get all fee stats in one call
     */
    function getFeeStats()
        external
        view
        returns (
            uint256 distributionTotal,
            uint256 burnTotal,
            uint256 platformTotal,
            uint256 lpDistributionTotal
        )
    {
        return (totalDistributionFeesCollected, totalBurnFeesCollected, totalPlatformFeesCollected, totalLpDistributionFeesCollected);
    }

    // Accept PLS (e.g. refunds, accidental sends)
    receive() external payable {}

    // ============ Internal Logic ============

    function _computeWagerFees(uint256 wagerAmount)
        internal
        view
        returns (uint256 netWager, uint256 feeDist, uint256 feeBurn, uint256 feePlatform, uint256 feeLp)
    {
        feeDist = (wagerAmount * distributionFeeBps) / BPS_DENOMINATOR;
        feeBurn = (wagerAmount * burnFeeBps) / BPS_DENOMINATOR;
        feePlatform = (wagerAmount * platformFeeBps) / BPS_DENOMINATOR;
        feeLp = (wagerAmount * lpDistributionFeeBps) / BPS_DENOMINATOR;
        netWager = wagerAmount - feeDist - feeBurn - feePlatform - feeLp;
    }

    function _drawNumbers(uint256 seed) internal pure returns (uint8[DRAWN] memory result) {
        // Partial Fisher-Yates to get 20 unique numbers from 1..80
        uint8[NUMBERS] memory pool;
        for (uint8 i = 0; i < NUMBERS; i++) {
            pool[i] = i + 1;
        }
        uint256 randomSeed = seed;
        for (uint8 i = 0; i < DRAWN; i++) {
            uint256 swapIndex = i + (uint256(keccak256(abi.encode(randomSeed, i))) % (NUMBERS - i));
            uint8 temp = pool[i];
            pool[i] = pool[swapIndex];
            pool[swapIndex] = temp;
            result[i] = pool[i];
        }
    }

    function _scoreTicket(uint256 numbersBitmap, uint8[DRAWN] memory winning) internal pure returns (uint256 hits) {
        for (uint8 i = 0; i < DRAWN; i++) {
            uint8 n = winning[i];
            if ((numbersBitmap & (uint256(1) << (n - 1))) != 0) {
                hits++;
            }
        }
    }

    function _packNumbers(uint8[] calldata numbers, uint8 spotSize) internal pure returns (uint256 bitmap) {
        if (numbers.length != spotSize) revert InvalidNumbers();
        for (uint256 i = 0; i < numbers.length; i++) {
            uint8 n = numbers[i];
            if (n == 0 || n > NUMBERS) revert InvalidNumbers();
            uint256 bit = uint256(1) << (n - 1);
            if ((bitmap & bit) != 0) revert InvalidNumbers();
            bitmap |= bit;
        }
    }

// ============ Default Paytables ============

    /// @notice Paytable: top wager 100k MORBIUS, top win 25x (10/10) = 2.5M cap. Anchors then scaled down.
    function _initDefaultPaytables() internal {
        // 1-SPOT: 1/1 = 2x
        paytable[1][1] = 2;

        // 2-SPOT: 2/2 = 3x
        paytable[2][2] = 3;

        // 3-SPOT: 3/3 = 4x, 3/2 = 2x
        paytable[3][3] = 4;
        paytable[3][2] = 2;

        // 4-SPOT: 4/4 = 7x, 4/3 = 3x, 4/2 = 1x
        paytable[4][4] = 7;
        paytable[4][3] = 3;
        paytable[4][2] = 1;

        // 5-SPOT: 5/5 = 10x, 5/4 = 4x, 5/3 = 2x
        paytable[5][5] = 10;
        paytable[5][4] = 7;
        paytable[5][3] = 2;

        // 6-SPOT: 6/6 = 12x, 6/5 = 5x, 6/4 = 2x, 6/3 = 1x
        paytable[6][6] = 12;
        paytable[6][5] = 10;
        paytable[6][4] = 5;
        paytable[6][3] = 1; // (1.5x not possible; use 1x)

        // 7-SPOT: 7/7 = 15x, 7/6 = 6x, 7/5 = 3x, 7/4 = 1x, 7/3 = 1x
        paytable[7][7] = 15;
        paytable[7][6] = 12;
        paytable[7][5] = 9;
        paytable[7][4] = 5;
        paytable[7][3] = 1; // (1.5x not possible; use 1x)

        // 8-SPOT: 8/8 = 17x, 8/7 = 7x, 8/6 = 3x, 8/5 = 2x, 8/4 = 1x
        paytable[8][8] = 17;
        paytable[8][7] = 12;
        paytable[8][6] = 7;
        paytable[8][5] = 5;
        paytable[8][4] = 2;

        // 9-SPOT: 9/9 = 20x, 9/8 = 8x, 9/7 = 4x, 9/6 = 2x, 9/5 = 1x, 9/4 = 1x
        paytable[9][9] = 20;
        paytable[9][8] = 15;
        paytable[9][7] = 10;
        paytable[9][6] = 7;
        paytable[9][5] = 4;
        paytable[9][4] = 2;

        // 10-SPOT: 10/10 = 25x, 10/9 = 10x, 10/8 = 5x, 10/7 = 2x, 10/6 = 1x, 10/5 = 1x, 10/0 = 1x (consolation)
        paytable[10][10] = 25;
        paytable[10][9] = 20;
        paytable[10][8] = 15;
        paytable[10][7] = 12;
        paytable[10][6] = 5;
        paytable[10][5] = 2;
        paytable[10][0] = 3; // consolation (catch 0)
    }
}
