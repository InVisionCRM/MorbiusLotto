// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IWrappedPulse is IERC20 {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}

interface IPulseXRouter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsIn(
        uint256 amountOut,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);
}

/**
 * @title SuperStakeLottery6of55 V2
 * @notice 6-of-55 lottery with improved bracket allocation, smart rollovers, and WPLS payment support
 * @dev Distribution (applied ONLY on ticket purchases, NOT rollovers):
 *      - 5% to Keeper wallet
 *      - 5% to Deployer wallet
 *      - 10% to Burn (dead address)
 *      - 10% to MegaMorbius Bank
 *      - 70% to Winners Pool (prize brackets)
 *      - Rebalanced brackets: focus on high brackets (5-6 matches)
 *      - Smart rollover: Unclaimed prizes → 70% next round, 15% burn, 15% MegaMorbius
 *      - WPLS payment with auto-swap to Morbius (accounts for 5.5% tax + 5% slippage)
 */
contract SuperStakeLottery6of55 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    IERC20 public immutable MORBIUS_TOKEN;
    IWrappedPulse public immutable WPLS_TOKEN;
    IPulseXRouter public immutable pulseXRouter;

    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    uint256 public constant TICKET_PRICE_DEFAULT = 1000 * 1e18; // 1000 Morbius (18 decimals)
    uint8 public constant NUMBERS_PER_TICKET = 6;
    uint8 public constant MIN_NUMBER = 1;
    uint8 public constant MAX_NUMBER = 55;
    // Distribution percentages (basis points, 1% = 100 bp)
    // ONLY applied on ticket purchases, NOT on rollovers
    uint256 public constant KEEPER_FEE_PCT = 500; // 5% to keeper
    uint256 public constant DEPLOYER_FEE_PCT = 500; // 5% to deployer
    uint256 public constant BURN_PCT = 1000; // 10% burn (only on purchases)
    uint256 public constant MEGA_BANK_PCT = 1000; // 10% to MegaMorbius (only on purchases)
    uint256 public constant WINNERS_POOL_PCT = 7000; // 70% to winners
    uint256 public constant TOTAL_PCT = 10000; // 100%
    uint256 public constant MAX_FUTURE_ROUND_OFFSET = 100; // allow scheduling up to 100 rounds ahead

    // Bracket percentages (of 70% winners pool, in basis points)
    // Rebalanced to focus on high brackets
    uint256[6] public BRACKET_PERCENTAGES = [400, 600, 1000, 1500, 2000, 4500];
    // Bracket 1: 4%, Bracket 2: 6%, Bracket 3: 10%, Bracket 4: 15%, Bracket 5: 20%, Bracket 6: 45% (of Winners Pool)

    // Rollover rule: unclaimed pools → 70% next round, 15% burn, 15% MegaMorbius
    uint256 public constant ROLLOVER_TO_NEXT_ROUND_PCT = 7000; // 70%
    uint256 public constant ROLLOVER_TO_BURN_PCT = 1500; // 15%
    uint256 public constant ROLLOVER_TO_MEGA_PCT = 1500; // 15%

    // WPLS swap buffer (5.5% tax + 5% slippage)
    uint256 public constant WPLS_SWAP_BUFFER_PCT = 11100; // 11.1% extra

    // ============ Enums ============

    enum RoundState { OPEN, FINALIZED }

    // ============ Structs ============

    struct Ticket {
        address player;
        uint8[6] numbers;
        uint256 ticketId;
        bool isFreeTicket;
        bool isHouseTicket;
    }

    struct BracketWinners {
        uint256 matchCount;
        uint256 poolAmount;
        uint256 winnerCount;
        uint256 payoutPerWinner;
        uint256[] winningTicketIds;
    }

    struct Round {
        uint256 roundId;
        uint256 startTime;
        uint256 endTime;
        uint256 closingBlock; // Block when round was locked
        uint256 drawBlock; // Future block to use for randomness
        uint8[6] winningNumbers;
        uint256 totalMorbiusCollected; // Full amount collected from players (100%)
        uint256 totalTickets;
        uint256 uniquePlayers;
        BracketWinners[6] brackets;
        uint256 megaBankContribution;
        bool isMegaMillionsRound;
        RoundState state;
    }

    // ============ State Variables ============

    address public keeperWallet;
    address public deployerWallet;

    uint256 public roundDuration;
    uint256 public currentRoundId;
    uint256 public currentRoundStartTime;
    RoundState public currentRoundState;

    // Ticket pricing (modifiable by owner)
    uint256 public ticketPriceMorbius;
    uint256 public ticketPricePls;

    // Banks
    uint256 public megaMorbiusBank;
    uint256 public rolloverReserve; // carries 75% of unclaimed bracket pools to next round winners pool
    uint256 public megaMillionsInterval;
    mapping(uint256 => uint256) public pendingRoundMorbius; // prepaid Morbius for future rounds
    mapping(uint256 => uint256) public pendingRoundTickets; // prepaid ticket counts for future rounds

    // Current round tracking
    uint256 public currentRoundTotalMorbius; // Only winners pool (70% of purchases + rollovers)
    uint256 public currentRoundTotalCollectedFromPlayers; // Full amount collected from ticket sales
    uint256 public currentRoundTotalTickets;
    uint256 public nextTicketId;

    // Burn accumulator
    uint256 public burnThreshold = 100_000 * 1e18; // 100k Morbius default threshold
    uint256 public pendingBurnMorbius;

    // Lifetime counters
    uint256 public totalTicketsEver;
    uint256 public totalMorbiusEverCollected;
    uint256 public totalMorbiusEverClaimed;
    uint256 public totalMorbiusClaimableOutstanding;

    // Mappings
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => Ticket[]) public roundTickets;
    mapping(uint256 => mapping(address => uint256[])) public playerTicketIds;
    mapping(uint256 => mapping(address => bool)) public hasEnteredRound;
    mapping(uint256 => address[]) public roundPlayers;

    // Claiming system
    mapping(uint256 => mapping(address => uint256)) public claimableWinnings;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    mapping(address => uint256) public playerOutstandingClaimable;

    struct PlayerTotals {
        uint256 ticketsBought;
        uint256 totalSpent;
        uint256 totalClaimed;
    }
    mapping(address => PlayerTotals) public playerTotals;
    mapping(address => uint256[]) private playerRounds;
    mapping(address => mapping(uint256 => bool)) private playerRoundSeen;

    // House ticket config
    bool public houseTicketEnabled = true;
    uint8[6] public houseTicketNumbers; // optional fixed numbers; if all zero, auto-generate
    bool public houseTicketUseFixed = false;
    uint256 public houseTicketLastRound;

    // ============ Events ============

    event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 endTime, bool isMegaMillionsRound);
    event TicketsPurchased(address indexed player, uint256 indexed roundId, uint256 ticketCount, uint256 freeTicketsUsed, uint256 morbiusSpent);
    event TicketsPurchasedForRounds(address indexed player, uint256[] roundIds, uint256[] ticketCounts, uint256 morbiusSpent);
    event WPLSSwappedForTickets(address indexed player, uint256 wplsSpent, uint256 morbiusReceived);
    event NumbersDrawn(uint256 indexed roundId, uint8[6] winningNumbers, uint256 drawBlock);
    event RoundFinalized(uint256 indexed roundId, uint8[6] winningNumbers, uint256 totalMorbius, uint256 totalTickets, uint256 uniquePlayers);
    event BracketResults(uint256 indexed roundId, uint256 bracket, uint256 winnerCount, uint256 poolAmount, uint256 payoutPerWinner);
    event MegaMillionsTriggered(uint256 indexed roundId, uint256 bankAmount, uint256 toBracket6, uint256 toBracket5);
    event WinningsClaimed(address indexed player, uint256 indexed roundId, uint256 amount);
    event RoundDurationUpdated(uint256 oldDuration, uint256 newDuration);
    event UnclaimedPrizeRolledOver(uint256 indexed roundId, uint256 bracket, uint256 amount, string destination);
    event TicketPricesUpdated(uint256 morbiusPrice, uint256 plsPrice);
    event BurnExecuted(uint256 amount);
    event BurnThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);

    // ============ Constructor ============

    constructor(
        address _morbiusTokenAddress,
        address _wplsTokenAddress,
        address _pulseXRouterAddress,
        uint256 _initialRoundDuration,
        uint256 _megaMillionsInterval,
        address _keeperWallet,
        address _deployerWallet
    ) Ownable(msg.sender) {
        require(_morbiusTokenAddress != address(0), "Invalid Morbius address");
        require(_wplsTokenAddress != address(0), "Invalid WPLS address");
        require(_pulseXRouterAddress != address(0), "Invalid router address");
        require(_initialRoundDuration > 0, "Duration must be positive");
        require(_megaMillionsInterval > 0, "Mega interval must be positive");
        require(_keeperWallet != address(0), "Invalid keeper address");
        require(_deployerWallet != address(0), "Invalid deployer address");

        MORBIUS_TOKEN = IERC20(_morbiusTokenAddress);
        WPLS_TOKEN = IWrappedPulse(_wplsTokenAddress);
        pulseXRouter = IPulseXRouter(_pulseXRouterAddress);
        roundDuration = _initialRoundDuration;
        megaMillionsInterval = _megaMillionsInterval;
        keeperWallet = _keeperWallet;
        deployerWallet = _deployerWallet;

        ticketPriceMorbius = TICKET_PRICE_DEFAULT;
        ticketPricePls = TICKET_PRICE_DEFAULT;

        _startNewRound();
    }

    // ============ Public Functions ============

    /**
     * @notice Buy lottery tickets with Morbius
     */
    function buyTickets(uint8[6][] calldata ticketNumbers) external nonReentrant {
        if (_isRoundExpired()) {
            _finalizeRound();
            _startNewRound();
        }

        require(currentRoundState == RoundState.OPEN, "Round not open");
        require(ticketNumbers.length > 0, "Must buy at least 1 ticket");
        require(ticketNumbers.length <= 100, "Max 100 tickets per tx");

        uint256 ticketsToBuy = ticketNumbers.length;
        uint256 morbiusRequired = ticketsToBuy * ticketPriceMorbius;

        if (morbiusRequired > 0) {
            // Transfer full amount from player
            MORBIUS_TOKEN.safeTransferFrom(msg.sender, address(this), morbiusRequired);

            // Calculate distribution (ONLY on purchases, NOT rollovers)
            uint256 keeperFee = (morbiusRequired * KEEPER_FEE_PCT) / TOTAL_PCT;
            uint256 deployerFee = (morbiusRequired * DEPLOYER_FEE_PCT) / TOTAL_PCT;
            uint256 burnAmount = (morbiusRequired * BURN_PCT) / TOTAL_PCT;
            uint256 megaContribution = (morbiusRequired * MEGA_BANK_PCT) / TOTAL_PCT;
            uint256 toWinnersPool = morbiusRequired - keeperFee - deployerFee - burnAmount - megaContribution;

            // Distribute immediately
            if (keeperFee > 0) {
                MORBIUS_TOKEN.safeTransfer(keeperWallet, keeperFee);
            }
            if (deployerFee > 0) {
                MORBIUS_TOKEN.safeTransfer(deployerWallet, deployerFee);
            }
            if (burnAmount > 0) {
                _accrueBurn(burnAmount);
            }
            if (megaContribution > 0) {
                megaMorbiusBank += megaContribution;
            }

            // Only the winners pool (70%) goes to the round
            currentRoundTotalMorbius += toWinnersPool;
            currentRoundTotalCollectedFromPlayers += morbiusRequired; // Track full amount for display
            totalMorbiusEverCollected += morbiusRequired;
            totalTicketsEver += ticketsToBuy;
            playerTotals[msg.sender].ticketsBought += ticketsToBuy;
            playerTotals[msg.sender].totalSpent += morbiusRequired;
        }

        _processTickets(msg.sender, ticketNumbers, currentRoundId);

        emit TicketsPurchased(msg.sender, currentRoundId, ticketNumbers.length, 0, morbiusRequired);
    }

    /**
     * @notice Buy tickets for multiple future rounds (Morbius only)
     * @param ticketGroups Array of ticket arrays per round offset (uint8[6][] per round)
     * @param roundOffsets Array of offsets (0 = current round, 1 = next, etc.)
     */
    function buyTicketsForRounds(
        uint8[6][][] calldata ticketGroups,
        uint256[] calldata roundOffsets
    ) external nonReentrant {
        if (_isRoundExpired()) {
            _finalizeRound();
            _startNewRound();
        }

        require(ticketGroups.length > 0, "No tickets");
        require(ticketGroups.length == roundOffsets.length, "Length mismatch");

        uint256 totalTickets = 0;
        uint256 totalCost = 0;
        uint256[] memory targetRoundIds = new uint256[](ticketGroups.length);
        uint256[] memory ticketCounts = new uint256[](ticketGroups.length);

        for (uint256 i = 0; i < ticketGroups.length; i++) {
            uint256 offset = roundOffsets[i];
            require(offset <= MAX_FUTURE_ROUND_OFFSET, "Offset too large");
            uint256 targetRoundId = currentRoundId + offset;
            targetRoundIds[i] = targetRoundId;

            uint256 count = ticketGroups[i].length;
            require(count > 0, "Empty ticket group");
            require(count <= 100, "Max 100 tickets per group");

            ticketCounts[i] = count;
            totalTickets += count;
            totalCost += count * ticketPriceMorbius;
        }

        require(totalTickets > 0, "No tickets");
        require(totalTickets <= 500, "Too many tickets");

        if (totalCost > 0) {
            MORBIUS_TOKEN.safeTransferFrom(msg.sender, address(this), totalCost);
            totalMorbiusEverCollected += totalCost;
            totalTicketsEver += totalTickets;
            playerTotals[msg.sender].ticketsBought += totalTickets;
            playerTotals[msg.sender].totalSpent += totalCost;
        }

        // Allocate tickets per target round and track balances
        for (uint256 i = 0; i < ticketGroups.length; i++) {
            uint256 targetRoundId = targetRoundIds[i];
            uint256 count = ticketCounts[i];
            uint8[6][] calldata ticketsForRound = ticketGroups[i];

            _processTickets(msg.sender, ticketsForRound, targetRoundId);

            if (targetRoundId == currentRoundId) {
                currentRoundTotalMorbius += count * ticketPriceMorbius;
            } else {
                pendingRoundMorbius[targetRoundId] += count * ticketPriceMorbius;
            }
        }

        emit TicketsPurchasedForRounds(msg.sender, targetRoundIds, ticketCounts, totalCost);
    }

    /**
     * @notice Buy lottery tickets with WPLS (auto-swaps to Morbius)
     */
    function buyTicketsWithWPLS(uint8[6][] calldata ticketNumbers) external nonReentrant {
        if (_isRoundExpired()) {
            _finalizeRound();
            _startNewRound();
        }

        require(currentRoundState == RoundState.OPEN, "Round not open");
        require(ticketNumbers.length > 0, "Must buy at least 1 ticket");
        require(ticketNumbers.length <= 100, "Max 100 tickets per tx");

        uint256 ticketsToBuy = ticketNumbers.length;
        uint256 morbiusRequired = ticketsToBuy * ticketPriceMorbius;

        if (morbiusRequired > 0) {
            // Account for 5.5% tax + 5% slippage
            uint256 morbiusToRequest = (morbiusRequired * WPLS_SWAP_BUFFER_PCT) / TOTAL_PCT;

            address[] memory path = new address[](2);
            path[0] = address(WPLS_TOKEN);
            path[1] = address(MORBIUS_TOKEN);

            uint256[] memory amountsIn = pulseXRouter.getAmountsIn(morbiusToRequest, path);
            uint256 wplsNeeded = amountsIn[0];

            IERC20(address(WPLS_TOKEN)).safeTransferFrom(msg.sender, address(this), wplsNeeded);
            IERC20(address(WPLS_TOKEN)).approve(address(pulseXRouter), wplsNeeded);

            uint256 morbiusBefore = MORBIUS_TOKEN.balanceOf(address(this));

            // Set amountOutMin to 0 to avoid revert due to tax/slippage
            // We verify the actual received amount after the swap instead
            pulseXRouter.swapExactTokensForTokens(
                wplsNeeded,
                0,  // Allow any amount, we check morbiusReceived below
                path,
                address(this),
                block.timestamp + 300
            );

            uint256 morbiusReceived = MORBIUS_TOKEN.balanceOf(address(this)) - morbiusBefore;
            require(morbiusReceived >= morbiusRequired, "Insufficient Morbius after swap");

            currentRoundTotalMorbius += morbiusReceived;
            totalMorbiusEverCollected += morbiusReceived;
            totalTicketsEver += ticketsToBuy;
            playerTotals[msg.sender].ticketsBought += ticketsToBuy;
            playerTotals[msg.sender].totalSpent += morbiusReceived;

            emit WPLSSwappedForTickets(msg.sender, wplsNeeded, morbiusReceived);
        }

        _processTickets(msg.sender, ticketNumbers, currentRoundId);

        emit TicketsPurchased(msg.sender, currentRoundId, ticketNumbers.length, 0, morbiusRequired);
    }

    /**
     * @notice Buy lottery tickets with WPLS and a caller-specified extra buffer
     * @dev Adds extraBufferBp (basis points) on top of the built-in swap buffer
     * @param ticketNumbers Ticket selections
     * @param extraBufferBp Extra buffer in basis points (0 - 10_000) added to WPLS_SWAP_BUFFER_PCT
     */
    function buyTicketsWithWPLSAndBuffer(
        uint8[6][] calldata ticketNumbers,
        uint256 extraBufferBp
    ) external nonReentrant {
        if (_isRoundExpired()) {
            _finalizeRound();
            _startNewRound();
        }

        require(currentRoundState == RoundState.OPEN, "Round not open");
        require(ticketNumbers.length > 0, "Must buy at least 1 ticket");
        require(ticketNumbers.length <= 100, "Max 100 tickets per tx");
        require(extraBufferBp <= TOTAL_PCT, "Extra buffer too large"); // cap at +100%

        uint256 ticketsToBuy = ticketNumbers.length;
        uint256 morbiusRequired = ticketsToBuy * ticketPriceMorbius;

        if (morbiusRequired > 0) {
            // Apply base buffer (tax/slippage) and caller-provided extra buffer
            uint256 baseBuffered = (morbiusRequired * WPLS_SWAP_BUFFER_PCT) / TOTAL_PCT;
            uint256 morbiusToRequest = (baseBuffered * (TOTAL_PCT + extraBufferBp)) / TOTAL_PCT;

            address[] memory path = new address[](2);
            path[0] = address(WPLS_TOKEN);
            path[1] = address(MORBIUS_TOKEN);

            uint256[] memory amountsIn = pulseXRouter.getAmountsIn(morbiusToRequest, path);
            uint256 wplsNeeded = amountsIn[0];

            IERC20(address(WPLS_TOKEN)).safeTransferFrom(msg.sender, address(this), wplsNeeded);
            IERC20(address(WPLS_TOKEN)).approve(address(pulseXRouter), wplsNeeded);

            uint256 morbiusBefore = MORBIUS_TOKEN.balanceOf(address(this));

            // Keep amountOutMin at 0; enforce received amount via post-swap check
            pulseXRouter.swapExactTokensForTokens(
                wplsNeeded,
                0,
                path,
                address(this),
                block.timestamp + 300
            );

            uint256 morbiusReceived = MORBIUS_TOKEN.balanceOf(address(this)) - morbiusBefore;
            require(morbiusReceived >= morbiusRequired, "Insufficient Morbius after swap");

            currentRoundTotalMorbius += morbiusReceived;
            totalMorbiusEverCollected += morbiusReceived;
            totalTicketsEver += ticketsToBuy;
            playerTotals[msg.sender].ticketsBought += ticketsToBuy;
            playerTotals[msg.sender].totalSpent += morbiusReceived;
            emit WPLSSwappedForTickets(msg.sender, wplsNeeded, morbiusReceived);
        }

        _processTickets(msg.sender, ticketNumbers, currentRoundId);

        emit TicketsPurchased(msg.sender, currentRoundId, ticketNumbers.length, 0, morbiusRequired);
    }

    /**
     * @notice Buy lottery tickets with native PLS (wraps to WPLS then swaps to Morbius)
     * @dev Accepts msg.value in beats, applies the same swap buffer used for WPLS purchases,
     *      and refunds any excess PLS to the caller.
     */
    function buyTicketsWithPLS(uint8[6][] calldata ticketNumbers) external payable nonReentrant {
        if (_isRoundExpired()) {
            _finalizeRound();
            _startNewRound();
        }

        require(currentRoundState == RoundState.OPEN, "Round not open");
        require(ticketNumbers.length > 0, "Must buy at least 1 ticket");
        require(ticketNumbers.length <= 100, "Max 100 tickets per tx");

        uint256 ticketsToBuy = ticketNumbers.length;
        uint256 morbiusRequired = ticketsToBuy * ticketPriceMorbius;
        uint256 morbiusToRequest = (morbiusRequired * WPLS_SWAP_BUFFER_PCT) / TOTAL_PCT;

        address[] memory path = new address[](2);
        path[0] = address(WPLS_TOKEN);
        path[1] = address(MORBIUS_TOKEN);

        uint256[] memory amountsIn = pulseXRouter.getAmountsIn(morbiusToRequest, path);
        uint256 wplsNeeded = amountsIn[0];

        require(msg.value >= wplsNeeded, "PLS below swap requirement");

        WPLS_TOKEN.deposit{value: wplsNeeded}();
        IERC20(address(WPLS_TOKEN)).approve(address(pulseXRouter), wplsNeeded);

        uint256 morbiusBefore = MORBIUS_TOKEN.balanceOf(address(this));

        pulseXRouter.swapExactTokensForTokens(
            wplsNeeded,
            0, // allow any output; enforce via received check
            path,
            address(this),
            block.timestamp + 300
        );

        uint256 morbiusReceived = MORBIUS_TOKEN.balanceOf(address(this)) - morbiusBefore;
        require(morbiusReceived >= morbiusRequired, "Insufficient Morbius after swap");

        if (msg.value > wplsNeeded) {
            payable(msg.sender).transfer(msg.value - wplsNeeded);
        }

        currentRoundTotalMorbius += morbiusReceived;
        totalMorbiusEverCollected += morbiusReceived;
        totalTicketsEver += ticketsToBuy;
        playerTotals[msg.sender].ticketsBought += ticketsToBuy;
        playerTotals[msg.sender].totalSpent += morbiusReceived;

        emit WPLSSwappedForTickets(msg.sender, wplsNeeded, morbiusReceived);

        _processTickets(msg.sender, ticketNumbers, currentRoundId);

        emit TicketsPurchased(msg.sender, currentRoundId, ticketNumbers.length, 0, morbiusRequired);
    }

    /**
     * @notice Manually finalize the current round
     */
    function finalizeRound() external nonReentrant {
        require(_isRoundExpired(), "Round not expired");
        require(currentRoundState == RoundState.OPEN, "Round already finalized");

        _finalizeRound();
        _startNewRound();
    }

    /**
     * @notice Claim winnings from a specific round
     */
    function claimWinnings(uint256 roundId) external nonReentrant {
        require(rounds[roundId].state == RoundState.FINALIZED, "Round not finalized");
        require(!hasClaimed[roundId][msg.sender], "Already claimed");
        require(claimableWinnings[roundId][msg.sender] > 0, "Nothing to claim");

        uint256 amount = claimableWinnings[roundId][msg.sender];
        hasClaimed[roundId][msg.sender] = true;

        MORBIUS_TOKEN.safeTransfer(msg.sender, amount);
        totalMorbiusClaimableOutstanding = totalMorbiusClaimableOutstanding >= amount ? totalMorbiusClaimableOutstanding - amount : 0;
        totalMorbiusEverClaimed += amount;
        playerTotals[msg.sender].totalClaimed += amount;
        playerOutstandingClaimable[msg.sender] = playerOutstandingClaimable[msg.sender] >= amount ? playerOutstandingClaimable[msg.sender] - amount : 0;

        emit WinningsClaimed(msg.sender, roundId, amount);
    }

    /**
     * @notice Claim winnings from multiple rounds in a single transaction
     */
    function claimWinningsMultiple(uint256[] calldata roundIds) external nonReentrant {
        require(roundIds.length > 0, "Must specify at least one round");
        require(roundIds.length <= 50, "Max 50 rounds per claim");

        uint256 totalClaimed = 0;

        for (uint256 i = 0; i < roundIds.length; i++) {
            uint256 roundId = roundIds[i];
            require(rounds[roundId].state == RoundState.FINALIZED, "Round not finalized");
            require(!hasClaimed[roundId][msg.sender], "Already claimed this round");
            require(claimableWinnings[roundId][msg.sender] > 0, "Nothing to claim for this round");

            uint256 amount = claimableWinnings[roundId][msg.sender];
            hasClaimed[roundId][msg.sender] = true;
            totalClaimed += amount;

            // Update accounting per round
            totalMorbiusClaimableOutstanding = totalMorbiusClaimableOutstanding >= amount ? totalMorbiusClaimableOutstanding - amount : 0;
            playerOutstandingClaimable[msg.sender] = playerOutstandingClaimable[msg.sender] >= amount ? playerOutstandingClaimable[msg.sender] - amount : 0;
            playerTotals[msg.sender].totalClaimed += amount;

            emit WinningsClaimed(msg.sender, roundId, amount);
        }

        // Single transfer for all rounds
        MORBIUS_TOKEN.safeTransfer(msg.sender, totalClaimed);
        totalMorbiusEverClaimed += totalClaimed;
    }

    /**
     * @notice Update round duration (owner only)
     */
    function updateRoundDuration(uint256 _newDuration) external onlyOwner {
        require(_newDuration > 0, "Duration must be positive");
        uint256 oldDuration = roundDuration;
        roundDuration = _newDuration;
        emit RoundDurationUpdated(oldDuration, _newDuration);
    }

    /**
     * @notice Update MegaMorbius interval (owner only)
     */
    function updateMegaMillionsInterval(uint256 _newInterval) external onlyOwner {
        require(_newInterval > 0, "Interval must be positive");
        megaMillionsInterval = _newInterval;
    }

    /**
     * @notice Update ticket prices for Morbius and PLS payment paths
     * @param newMorbiusPrice Price per ticket when paying in Morbius (18 decimals)
     * @param newPlsPrice Price per ticket when paying in native PLS (beats)
     */
    function updateTicketPrices(uint256 newMorbiusPrice, uint256 newPlsPrice) external onlyOwner {
        require(newMorbiusPrice > 0, "Morbius price must be positive");
        require(newPlsPrice > 0, "PLS price must be positive");
        ticketPriceMorbius = newMorbiusPrice;
        ticketPricePls = newPlsPrice;
        emit TicketPricesUpdated(newMorbiusPrice, newPlsPrice);
    }

    // ============ View Functions ============

    function getCurrentRoundInfo() external view returns (
        uint256 roundId,
        uint256 startTime,
        uint256 endTime,
        uint256 totalMorbius,
        uint256 totalTickets,
        uint256 uniquePlayers,
        uint256 timeRemaining,
        bool isMegaMillionsRound,
        RoundState state
    ) {
        roundId = currentRoundId;
        startTime = currentRoundStartTime;
        endTime = currentRoundStartTime + roundDuration;
        totalMorbius = currentRoundTotalMorbius;
        totalTickets = currentRoundTotalTickets;
        uniquePlayers = roundPlayers[currentRoundId].length;
        timeRemaining = block.timestamp >= endTime ? 0 : endTime - block.timestamp;
        isMegaMillionsRound = (currentRoundId % megaMillionsInterval == 0);
        state = currentRoundState;
    }

    function getPlayerTickets(uint256 roundId, address player) external view returns (Ticket[] memory) {
        uint256[] memory ticketIds = playerTicketIds[roundId][player];
        Ticket[] memory tickets = new Ticket[](ticketIds.length);
        Ticket[] storage allTickets = roundTickets[roundId];
        uint256 foundCount = 0;

        for (uint256 i = 0; i < allTickets.length && foundCount < ticketIds.length; i++) {
            if (allTickets[i].player == player) {
                tickets[foundCount] = allTickets[i];
                foundCount++;
            }
        }

        return tickets;
    }

    function getRound(uint256 roundId) external view returns (Round memory) {
        return rounds[roundId];
    }

    function getMegaMillionsBank() external view returns (uint256) {
        return megaMorbiusBank;
    }

    function getClaimableWinnings(uint256 roundId, address player) external view returns (uint256) {
        return claimableWinnings[roundId][player];
    }

    function getCurrentRoundTotals() external view returns (
        uint256 roundId,
        uint256 totalMorbius,
        uint256 totalTickets,
        uint256 uniquePlayers,
        uint256 rolloverBalance,
        uint256 megaMorbiusBalance,
        RoundState state
    ) {
        roundId = currentRoundId;
        totalMorbius = currentRoundTotalMorbius;
        totalTickets = currentRoundTotalTickets;
        uniquePlayers = roundPlayers[currentRoundId].length;
        rolloverBalance = rolloverReserve;
        megaMorbiusBalance = megaMorbiusBank;
        state = currentRoundState;
    }

    function getPendingForRound(uint256 roundId) external view returns (uint256 morbiusAmount, uint256 ticketCount) {
        morbiusAmount = pendingRoundMorbius[roundId];
        ticketCount = pendingRoundTickets[roundId];
    }

    function getRolloverState() external view returns (uint256 rolloverBalance, uint256 megaMorbiusBalance) {
        rolloverBalance = rolloverReserve;
        megaMorbiusBalance = megaMorbiusBank;
    }

    function getBracketConfig() external view returns (
        uint256[6] memory bracketPercents,
        uint256 winnersPoolPercent,
        uint256 burnPercent,
        uint256 megaBankPercent,
        uint256 keeperFeePercent,
        uint256 deployerFeePercent
    ) {
        bracketPercents = BRACKET_PERCENTAGES;
        winnersPoolPercent = WINNERS_POOL_PCT;
        burnPercent = BURN_PCT;
        megaBankPercent = MEGA_BANK_PCT;
        keeperFeePercent = KEEPER_FEE_PCT;
        deployerFeePercent = DEPLOYER_FEE_PCT;
    }

    function getUnclaimedForRound(uint256 roundId) external view returns (
        uint256[] memory poolAmounts,
        uint256[] memory winnerCounts,
        uint256[] memory paidPerBracket,
        uint256[] memory unclaimedPerBracket,
        uint256 totalUnclaimed,
        uint256 winnersPoolTotal,
        uint256 burnTotal,
        uint256 megaTotal
    ) {
        Round storage r = rounds[roundId];
        poolAmounts = new uint256[](6);
        winnerCounts = new uint256[](6);
        paidPerBracket = new uint256[](6);
        unclaimedPerBracket = new uint256[](6);

        winnersPoolTotal = (r.totalMorbiusCollected * WINNERS_POOL_PCT) / TOTAL_PCT;
        burnTotal = (r.totalMorbiusCollected * BURN_PCT) / TOTAL_PCT;
        megaTotal = (r.totalMorbiusCollected * MEGA_BANK_PCT) / TOTAL_PCT;

        for (uint256 i = 0; i < 6; i++) {
            BracketWinners storage bw = r.brackets[i];
            poolAmounts[i] = bw.poolAmount;
            winnerCounts[i] = bw.winnerCount;
            uint256 paid = bw.payoutPerWinner * bw.winnerCount;
            paidPerBracket[i] = paid;
            uint256 unclaimed = bw.poolAmount > paid ? bw.poolAmount - paid : 0;
            unclaimedPerBracket[i] = unclaimed;
            totalUnclaimed += unclaimed;
        }
    }

    function getTotalTicketsEver() external view returns (uint256) {
        return totalTicketsEver;
    }

    function getTotalMorbiusEverCollected() external view returns (uint256) {
        return totalMorbiusEverCollected;
    }

    function getTotalMorbiusEverClaimed() external view returns (uint256) {
        return totalMorbiusEverClaimed;
    }

    function getTotalMorbiusClaimableAll() external view returns (uint256) {
        return totalMorbiusClaimableOutstanding;
    }

    function getPlayerLifetime(address player) external view returns (
        uint256 ticketsBought,
        uint256 totalSpent,
        uint256 totalClaimed,
        uint256 totalClaimable
    ) {
        PlayerTotals storage pt = playerTotals[player];
        ticketsBought = pt.ticketsBought;
        totalSpent = pt.totalSpent;
        totalClaimed = pt.totalClaimed;
        totalClaimable = playerOutstandingClaimable[player];
    }

    function getPlayerRoundHistory(
        address player,
        uint256 start,
        uint256 count
    ) external view returns (
        uint256[] memory roundIds,
        uint256[] memory ticketsBoughtPerRound,
        uint256[] memory claimablePerRound
    ) {
        uint256 total = playerRounds[player].length;
        if (start >= total) {
            return (new uint256[](0), new uint256[](0), new uint256[](0));
        }
        uint256 end = start + count;
        if (end > total) {
            end = total;
        }
        uint256 size = end - start;
        roundIds = new uint256[](size);
        ticketsBoughtPerRound = new uint256[](size);
        claimablePerRound = new uint256[](size);

        for (uint256 i = 0; i < size; i++) {
            uint256 roundId = playerRounds[player][start + i];
            roundIds[i] = roundId;
            ticketsBoughtPerRound[i] = playerTicketIds[roundId][player].length;
            claimablePerRound[i] = claimableWinnings[roundId][player];
        }
    }

    function getRoundHistoryTotals(uint256 roundId) external view returns (
        uint256 totalMorbius,
        uint256 totalTickets,
        uint256 winnersPoolTotal,
        uint256 burnTotal,
        uint256 megaTotal,
        uint256 totalUnclaimed
    ) {
        Round storage r = rounds[roundId];
        totalMorbius = r.totalMorbiusCollected;
        totalTickets = r.totalTickets;
        winnersPoolTotal = (r.totalMorbiusCollected * WINNERS_POOL_PCT) / TOTAL_PCT;
        burnTotal = (r.totalMorbiusCollected * BURN_PCT) / TOTAL_PCT;
        megaTotal = (r.totalMorbiusCollected * MEGA_BANK_PCT) / TOTAL_PCT;

        for (uint256 i = 0; i < 6; i++) {
            BracketWinners storage bw = r.brackets[i];
            uint256 paid = bw.payoutPerWinner * bw.winnerCount;
            if (bw.poolAmount > paid) {
                totalUnclaimed += (bw.poolAmount - paid);
            }
        }
    }

    // ============ Internal Functions ============

    function _processTickets(address player, uint8[6][] calldata ticketNumbers, uint256 roundId) private {
        for (uint256 i = 0; i < ticketNumbers.length; i++) {
            _validateTicket(ticketNumbers[i]);

            Ticket memory ticket = Ticket({
                player: player,
                numbers: _sortNumbers(ticketNumbers[i]),
                ticketId: nextTicketId,
                isFreeTicket: false,
                isHouseTicket: false
            });

            roundTickets[roundId].push(ticket);
            playerTicketIds[roundId][player].push(nextTicketId);
            nextTicketId++;
        }

        if (!hasEnteredRound[roundId][player]) {
            roundPlayers[roundId].push(player);
            hasEnteredRound[roundId][player] = true;
            rounds[roundId].uniquePlayers += 1;
        }

        if (!playerRoundSeen[player][roundId]) {
            playerRoundSeen[player][roundId] = true;
            playerRounds[player].push(roundId);
        }

        if (roundId == currentRoundId) {
            currentRoundTotalTickets += ticketNumbers.length;
        } else {
            pendingRoundTickets[roundId] += ticketNumbers.length;
        }
    }

    function _mintHouseTicket(uint256 roundId) private {
        uint8[6] memory numbers;
        if (houseTicketUseFixed && !_allZeros(houseTicketNumbers)) {
            numbers = _sortNumbers(houseTicketNumbers);
        } else {
            uint256 seed = uint256(keccak256(abi.encodePacked(block.timestamp, roundId, block.prevrandao, nextTicketId)));
            bool[56] memory used;
            for (uint256 i = 0; i < NUMBERS_PER_TICKET; i++) {
                uint8 num;
                uint256 attempts = 0;
                do {
                    seed = uint256(keccak256(abi.encodePacked(seed, i, attempts)));
                    num = uint8((seed % MAX_NUMBER) + 1);
                    attempts++;
                } while (used[num] && attempts < 100);
                require(!used[num], "RNG failed house ticket");
                numbers[i] = num;
                used[num] = true;
            }
            numbers = _sortNumbers(numbers);
        }

        Ticket memory ticket = Ticket({
            player: address(this),
            numbers: numbers,
            ticketId: nextTicketId,
            isFreeTicket: false,
            isHouseTicket: true
        });

        roundTickets[roundId].push(ticket);
        nextTicketId++;
        currentRoundTotalTickets += 1;
        houseTicketLastRound = roundId;
    }

    function _allZeros(uint8[6] memory nums) private pure returns (bool) {
        for (uint256 i = 0; i < nums.length; i++) {
            if (nums[i] != 0) return false;
        }
        return true;
    }

    function _validateTicket(uint8[6] memory numbers) private pure {
        for (uint256 i = 0; i < NUMBERS_PER_TICKET; i++) {
            require(numbers[i] >= MIN_NUMBER && numbers[i] <= MAX_NUMBER, "Number out of range");
            for (uint256 j = i + 1; j < NUMBERS_PER_TICKET; j++) {
                require(numbers[i] != numbers[j], "Duplicate numbers");
            }
        }
    }

    function _sortNumbers(uint8[6] memory numbers) private pure returns (uint8[6] memory) {
        for (uint256 i = 0; i < NUMBERS_PER_TICKET - 1; i++) {
            for (uint256 j = 0; j < NUMBERS_PER_TICKET - 1 - i; j++) {
                if (numbers[j] > numbers[j + 1]) {
                    (numbers[j], numbers[j + 1]) = (numbers[j + 1], numbers[j]);
                }
            }
        }
        return numbers;
    }

    function _isRoundExpired() private view returns (bool) {
        return block.timestamp >= currentRoundStartTime + roundDuration;
    }

    function _startNewRound() private {
        currentRoundId++;
        currentRoundStartTime = block.timestamp;
        currentRoundState = RoundState.OPEN;
        currentRoundTotalMorbius = rolloverReserve + pendingRoundMorbius[currentRoundId];
        currentRoundTotalCollectedFromPlayers = 0; // Reset for new round
        rolloverReserve = 0;
        currentRoundTotalTickets = pendingRoundTickets[currentRoundId];
        pendingRoundMorbius[currentRoundId] = 0;
        pendingRoundTickets[currentRoundId] = 0;

        bool isMegaMillions = (currentRoundId % megaMillionsInterval == 0);

        // Auto-mint house ticket if enabled
        if (houseTicketEnabled) {
            _mintHouseTicket(currentRoundId);
        }

        emit RoundStarted(currentRoundId, currentRoundStartTime, currentRoundStartTime + roundDuration, isMegaMillions);
    }

    /**
     * @notice Finalize round and draw numbers immediately
     */
    function _finalizeRound() private {
        require(currentRoundState == RoundState.OPEN, "Round not open");

        uint256 finalizingRoundId = currentRoundId;
        uint256 closingBlock = block.number;

        // Store basic round info
        rounds[finalizingRoundId].roundId = finalizingRoundId;
        rounds[finalizingRoundId].startTime = currentRoundStartTime;
        rounds[finalizingRoundId].endTime = block.timestamp;
        rounds[finalizingRoundId].closingBlock = closingBlock;
        rounds[finalizingRoundId].drawBlock = closingBlock;
        rounds[finalizingRoundId].totalMorbiusCollected = currentRoundTotalCollectedFromPlayers;
        rounds[finalizingRoundId].totalTickets = currentRoundTotalTickets;
        rounds[finalizingRoundId].uniquePlayers = roundPlayers[finalizingRoundId].length;

        // Handle empty round or draw numbers
        if (currentRoundTotalTickets == 0) {
            _handleEmptyRound(finalizingRoundId);
        } else {
            // Generate winning numbers immediately
            uint8[6] memory winningNumbers = _generateWinningNumbers(finalizingRoundId, closingBlock);
            rounds[finalizingRoundId].winningNumbers = winningNumbers;

            emit NumbersDrawn(finalizingRoundId, winningNumbers, closingBlock);

            // Calculate brackets and distribute prizes
            _calculateBrackets(finalizingRoundId, winningNumbers);

            bool isMegaMillions = (finalizingRoundId % megaMillionsInterval == 0);
            if (isMegaMillions) {
                _handleMegaMillions(finalizingRoundId);
            }

            _distributePrizes(finalizingRoundId);
        }

        // Finalize the round
        rounds[finalizingRoundId].state = RoundState.FINALIZED;
        currentRoundState = RoundState.FINALIZED;

        emit RoundFinalized(finalizingRoundId, rounds[finalizingRoundId].winningNumbers, rounds[finalizingRoundId].totalMorbiusCollected, rounds[finalizingRoundId].totalTickets, rounds[finalizingRoundId].uniquePlayers);
    }

    function _handleEmptyRound(uint256 roundId) private {
        // Round is already partially filled by _finalizeRound, just complete it
        rounds[roundId].winningNumbers = [0, 0, 0, 0, 0, 0];
        rounds[roundId].brackets = [
            BracketWinners(1, 0, 0, 0, new uint256[](0)),
            BracketWinners(2, 0, 0, 0, new uint256[](0)),
            BracketWinners(3, 0, 0, 0, new uint256[](0)),
            BracketWinners(4, 0, 0, 0, new uint256[](0)),
            BracketWinners(5, 0, 0, 0, new uint256[](0)),
            BracketWinners(6, 0, 0, 0, new uint256[](0))
        ];
        rounds[roundId].megaBankContribution = 0;
        rounds[roundId].isMegaMillionsRound = (roundId % megaMillionsInterval == 0);
    }

    function _generateWinningNumbers(uint256 roundId, uint256 closingBlock) private view returns (uint8[6] memory) {
        // Use previous block hash for randomness
        uint256 prevBlock = closingBlock > 0 ? closingBlock - 1 : 0;

        uint256 seed = uint256(keccak256(abi.encodePacked(
            blockhash(prevBlock),
            blockhash(closingBlock),
            roundId,
            currentRoundTotalMorbius,
            currentRoundTotalTickets,
            block.timestamp,
            tx.origin
        )));

        uint8[6] memory numbers;
        bool[56] memory used;

        for (uint256 i = 0; i < NUMBERS_PER_TICKET; i++) {
            uint8 num;
            uint256 attempts = 0;

            do {
                seed = uint256(keccak256(abi.encodePacked(seed, i, attempts)));
                num = uint8((seed % MAX_NUMBER) + 1);
                attempts++;
            } while (used[num] && attempts < 100);

            require(!used[num], "RNG failed");
            numbers[i] = num;
            used[num] = true;
        }

        return _sortNumbers(numbers);
    }

    function _countMatches(uint8[6] memory ticket, uint8[6] memory winning) private pure returns (uint8) {
        uint8 matches = 0;
        uint256 wi = 0;

        for (uint256 ti = 0; ti < NUMBERS_PER_TICKET && wi < NUMBERS_PER_TICKET; ti++) {
            while (wi < NUMBERS_PER_TICKET && winning[wi] < ticket[ti]) {
                wi++;
            }
            if (wi < NUMBERS_PER_TICKET && winning[wi] == ticket[ti]) {
                matches++;
                wi++;
            }
        }

        return matches;
    }

    function _calculateBrackets(uint256 roundId, uint8[6] memory winningNumbers) private {
        Ticket[] storage tickets = roundTickets[roundId];

        uint256[7] memory bracketCounts;
        uint256[][7] memory bracketTicketIds;

        for (uint256 i = 1; i <= 6; i++) {
            bracketTicketIds[i] = new uint256[](tickets.length);
        }

        for (uint256 i = 0; i < tickets.length; i++) {
            uint8 matches = _countMatches(tickets[i].numbers, winningNumbers);

            if (matches > 0) {
                bracketTicketIds[matches][bracketCounts[matches]] = tickets[i].ticketId;
                bracketCounts[matches]++;
            }
        }

        for (uint256 bracket = 1; bracket <= 6; bracket++) {
            // currentRoundTotalMorbius already contains ONLY the winners pool (70% of purchases + rollovers)
            uint256 bracketPool = (currentRoundTotalMorbius * BRACKET_PERCENTAGES[bracket - 1]) / TOTAL_PCT;

            if (bracketCounts[bracket] > 0) {
                uint256[] memory winningIds = new uint256[](bracketCounts[bracket]);
                for (uint256 i = 0; i < bracketCounts[bracket]; i++) {
                    winningIds[i] = bracketTicketIds[bracket][i];
                }

                rounds[roundId].brackets[bracket - 1] = BracketWinners({
                    matchCount: bracket,
                    poolAmount: bracketPool,
                    winnerCount: bracketCounts[bracket],
                    payoutPerWinner: bracketPool / bracketCounts[bracket],
                    winningTicketIds: winningIds
                });
            } else {
                // Handle unclaimed prizes with smart rollover
                _handleUnclaimedBracket(roundId, bracket, bracketPool);

                rounds[roundId].brackets[bracket - 1] = BracketWinners({
                    matchCount: bracket,
                    poolAmount: 0,
                    winnerCount: 0,
                    payoutPerWinner: 0,
                    winningTicketIds: new uint256[](0)
                });
            }

            emit BracketResults(roundId, bracket, bracketCounts[bracket], bracketPool, rounds[roundId].brackets[bracket - 1].payoutPerWinner);
        }

        rounds[roundId].winningNumbers = winningNumbers;
        rounds[roundId].totalMorbiusCollected = currentRoundTotalCollectedFromPlayers; // Full amount from players
        rounds[roundId].totalTickets = currentRoundTotalTickets;
        rounds[roundId].uniquePlayers = roundPlayers[roundId].length;
        rounds[roundId].roundId = roundId;
        rounds[roundId].startTime = currentRoundStartTime;
        rounds[roundId].endTime = block.timestamp;
        rounds[roundId].closingBlock = block.number;
    }

    function _handleUnclaimedBracket(uint256 roundId, uint256 bracket, uint256 amount) private {
        // Split unclaimed funds: next round, burn, MegaMorbius
            uint256 toNextRound = (amount * ROLLOVER_TO_NEXT_ROUND_PCT) / TOTAL_PCT;
        uint256 toBurn = (amount * ROLLOVER_TO_BURN_PCT) / TOTAL_PCT;
        uint256 toMega = amount - toNextRound - toBurn;

            rolloverReserve += toNextRound;
        if (toBurn > 0) {
            _accrueBurn(toBurn);
        }
        if (toMega > 0) {
            megaMorbiusBank += toMega;
        }

            emit UnclaimedPrizeRolledOver(roundId, bracket, toNextRound, "NextRoundWinnersPool");
        if (toBurn > 0) emit UnclaimedPrizeRolledOver(roundId, bracket, toBurn, "Burn");
        if (toMega > 0) emit UnclaimedPrizeRolledOver(roundId, bracket, toMega, "MegaMorbius");
    }

    function _distributePrizes(uint256 roundId) private {
        Ticket[] storage tickets = roundTickets[roundId];

        for (uint256 bracket = 0; bracket < 6; bracket++) {
            BracketWinners storage bw = rounds[roundId].brackets[bracket];

            if (bw.winnerCount > 0) {
                for (uint256 i = 0; i < bw.winningTicketIds.length; i++) {
                    uint256 ticketId = bw.winningTicketIds[i];

                    for (uint256 j = 0; j < tickets.length; j++) {
                        if (tickets[j].ticketId == ticketId) {
                            if (tickets[j].isHouseTicket) {
                                megaMorbiusBank += bw.payoutPerWinner;
                            } else {
                            claimableWinnings[roundId][tickets[j].player] += bw.payoutPerWinner;
                                totalMorbiusClaimableOutstanding += bw.payoutPerWinner;
                                playerOutstandingClaimable[tickets[j].player] += bw.payoutPerWinner;
                            }
                            break;
                        }
                    }
                }
            }
        }

        // NOTE: Burn and MegaMorbius are now allocated at ticket purchase time, not here
        // This function only distributes prizes from the winners pool
        rounds[roundId].megaBankContribution = 0; // Tracked separately at purchase time
    }

    function _handleMegaMillions(uint256 roundId) private {
        if (megaMorbiusBank == 0) return;

        uint256 toBracket6 = (megaMorbiusBank * 80) / 100;
        uint256 toBracket5 = megaMorbiusBank - toBracket6;

        rounds[roundId].brackets[5].poolAmount += toBracket6;
        rounds[roundId].brackets[4].poolAmount += toBracket5;

        if (rounds[roundId].brackets[5].winnerCount > 0) {
            rounds[roundId].brackets[5].payoutPerWinner =
                rounds[roundId].brackets[5].poolAmount / rounds[roundId].brackets[5].winnerCount;
        }

        if (rounds[roundId].brackets[4].winnerCount > 0) {
            rounds[roundId].brackets[4].payoutPerWinner =
                rounds[roundId].brackets[4].poolAmount / rounds[roundId].brackets[4].winnerCount;
        }

        rounds[roundId].isMegaMillionsRound = true;

        emit MegaMillionsTriggered(roundId, megaMorbiusBank, toBracket6, toBracket5);

        megaMorbiusBank = 0;
    }

    // ============ Burn Accumulator ============

    function _accrueBurn(uint256 amount) private {
        if (amount == 0) return;
        pendingBurnMorbius += amount;
        if (pendingBurnMorbius >= burnThreshold) {
            _flushBurn();
        }
    }

    function _flushBurn() private {
        uint256 amount = pendingBurnMorbius;
        if (amount == 0) return;
        pendingBurnMorbius = 0;
        MORBIUS_TOKEN.safeTransfer(BURN_ADDRESS, amount);
        emit BurnExecuted(amount);
    }

    /**
     * @notice Manually flush the burn accumulator when threshold met
     */
    function flushBurn() external nonReentrant {
        require(pendingBurnMorbius >= burnThreshold, "Below threshold");
        _flushBurn();
    }

    /**
     * @notice Update the burn threshold (owner)
     */
    function updateBurnThreshold(uint256 newThreshold) external onlyOwner {
        require(newThreshold > 0, "Threshold must be > 0");
        uint256 old = burnThreshold;
        burnThreshold = newThreshold;
        emit BurnThresholdUpdated(old, newThreshold);
    }

}
