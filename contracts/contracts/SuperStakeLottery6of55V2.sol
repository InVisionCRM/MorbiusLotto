// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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
 * @dev Changes from V1:
 *      - 60% to winners (up from 55%), 20% to SuperStake (down from 25%), 20% to MegaMillions
 *      - Rebalanced brackets: focus on high brackets (5-6 matches)
 *      - Smart rollover: Low brackets → Mega, High brackets ↔ each other
 *      - WPLS payment with auto-swap to pSSH (accounts for 5.5% tax + 5% slippage)
 */
contract SuperStakeLottery6of55 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    IERC20 public immutable pSSH_TOKEN;
    IERC20 public immutable WPLS_TOKEN;
    IPulseXRouter public immutable pulseXRouter;

    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    uint256 public constant TICKET_PRICE = 1e18; // 1 token (18 decimals)
    uint8 public constant NUMBERS_PER_TICKET = 6;
    uint8 public constant MIN_NUMBER = 1;
    uint8 public constant MAX_NUMBER = 55;
    // Distribution percentages (basis points, 1% = 100 bp)
    uint256 public constant WINNERS_POOL_PCT = 6000; // 60% to winners
    uint256 public constant BURN_PCT = 2000; // 20% burn (replaces stake allocation)
    uint256 public constant MEGA_BANK_PCT = 2000; // 20% to MegaMorbius
    uint256 public constant TOTAL_PCT = 10000; // 100%
    uint256 public constant MAX_FUTURE_ROUND_OFFSET = 10; // allow scheduling up to 10 rounds ahead

    // Bracket percentages (of 60% winners pool, in basis points)
    // Rebalanced to focus on high brackets
    uint256[6] public BRACKET_PERCENTAGES = [400, 600, 1000, 1500, 2000, 4500];
    // Bracket 1: 4%, Bracket 2: 6%, Bracket 3: 10%, Bracket 4: 15%, Bracket 5: 20%, Bracket 6: 45% (of Winners Pool)

    // Rollover rule for any bracket with zero winners: 75% next round, 25% MegaMorbius
    uint256 public constant ROLLOVER_TO_NEXT_ROUND_PCT = 7500; // 75%
    uint256 public constant ROLLOVER_TO_MEGA_PCT = 2500; // 25%

    // WPLS swap buffer (5.5% tax + 5% slippage)
    uint256 public constant WPLS_SWAP_BUFFER_PCT = 11100; // 11.1% extra

    // Randomness delay (configurable for testing)
    uint256 public blockDelay = 0;

    // ============ Enums ============

    enum RoundState { OPEN, LOCKED, FINALIZED }

    // ============ Structs ============

    struct Ticket {
        address player;
        uint8[6] numbers;
        uint256 ticketId;
        bool isFreeTicket;
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
        uint256 closingBlock;
        uint8[6] winningNumbers;
        uint256 totalPsshCollected;
        uint256 totalTickets;
        uint256 uniquePlayers;
        BracketWinners[6] brackets;
        uint256 megaBankContribution;
        bool isMegaMillionsRound;
        RoundState state;
    }

    // ============ State Variables ============

    uint256 public roundDuration;
    uint256 public currentRoundId;
    uint256 public currentRoundStartTime;
    RoundState public currentRoundState;

    // Banks
    uint256 public megaPsshBank;
    uint256 public rolloverReserve; // carries 75% of unclaimed bracket pools to next round winners pool
    uint256 public megaMillionsInterval;
    mapping(uint256 => uint256) public pendingRoundPssh; // prepaid Morbius for future rounds
    mapping(uint256 => uint256) public pendingRoundTickets; // prepaid ticket counts for future rounds

    // Current round tracking
    uint256 public currentRoundTotalPssh;
    uint256 public currentRoundTotalTickets;
    uint256 public nextTicketId;

    // Mappings
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => Ticket[]) public roundTickets;
    mapping(uint256 => mapping(address => uint256[])) public playerTicketIds;
    mapping(uint256 => mapping(address => bool)) public hasEnteredRound;
    mapping(uint256 => address[]) public roundPlayers;

    // Claiming system
    mapping(uint256 => mapping(address => uint256)) public claimableWinnings;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    // ============ Events ============

    event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 endTime, bool isMegaMillionsRound);
    event TicketsPurchased(address indexed player, uint256 indexed roundId, uint256 ticketCount, uint256 freeTicketsUsed, uint256 psshSpent);
    event TicketsPurchasedForRounds(address indexed player, uint256[] roundIds, uint256[] ticketCounts, uint256 psshSpent);
    event WPLSSwappedForTickets(address indexed player, uint256 wplsSpent, uint256 psshReceived);
    event RoundLocked(uint256 indexed roundId, uint256 closingBlock, uint256 totalTickets, uint256 totalPssh);
    event RoundFinalized(uint256 indexed roundId, uint8[6] winningNumbers, uint256 totalPssh, uint256 totalTickets, uint256 uniquePlayers);
    event BracketResults(uint256 indexed roundId, uint256 bracket, uint256 winnerCount, uint256 poolAmount, uint256 payoutPerWinner);
    event MegaMillionsTriggered(uint256 indexed roundId, uint256 bankAmount, uint256 toBracket6, uint256 toBracket5);
    event WinningsClaimed(address indexed player, uint256 indexed roundId, uint256 amount);
    event RoundDurationUpdated(uint256 oldDuration, uint256 newDuration);
    event UnclaimedPrizeRolledOver(uint256 indexed roundId, uint256 bracket, uint256 amount, string destination);

    // ============ Constructor ============

    constructor(
        address _psshTokenAddress,
        address _wplsTokenAddress,
        address _pulseXRouterAddress,
        uint256 _initialRoundDuration,
        uint256 _megaMillionsInterval
    ) Ownable(msg.sender) {
        require(_psshTokenAddress != address(0), "Invalid pSSH address");
        require(_wplsTokenAddress != address(0), "Invalid WPLS address");
        require(_pulseXRouterAddress != address(0), "Invalid router address");
        require(_initialRoundDuration > 0, "Duration must be positive");
        require(_megaMillionsInterval > 0, "Mega interval must be positive");

        pSSH_TOKEN = IERC20(_psshTokenAddress);
        WPLS_TOKEN = IERC20(_wplsTokenAddress);
        pulseXRouter = IPulseXRouter(_pulseXRouterAddress);
        roundDuration = _initialRoundDuration;
        megaMillionsInterval = _megaMillionsInterval;

        _startNewRound();
    }

    // ============ Public Functions ============

    /**
     * @notice Buy lottery tickets with pSSH
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
        uint256 psshRequired = ticketsToBuy * TICKET_PRICE;

        if (psshRequired > 0) {
            pSSH_TOKEN.safeTransferFrom(msg.sender, address(this), psshRequired);
            currentRoundTotalPssh += psshRequired;
        }

        _processTickets(msg.sender, ticketNumbers, currentRoundId);

        emit TicketsPurchased(msg.sender, currentRoundId, ticketNumbers.length, 0, psshRequired);
    }

    /**
     * @notice Buy tickets for multiple future rounds (pSSH only)
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
            totalCost += count * TICKET_PRICE;
        }

        require(totalTickets > 0, "No tickets");
        require(totalTickets <= 500, "Too many tickets");

        if (totalCost > 0) {
            pSSH_TOKEN.safeTransferFrom(msg.sender, address(this), totalCost);
        }

        // Allocate tickets per target round and track balances
        for (uint256 i = 0; i < ticketGroups.length; i++) {
            uint256 targetRoundId = targetRoundIds[i];
            uint256 count = ticketCounts[i];
            uint8[6][] calldata ticketsForRound = ticketGroups[i];

            _processTickets(msg.sender, ticketsForRound, targetRoundId);

            if (targetRoundId == currentRoundId) {
                currentRoundTotalPssh += count * TICKET_PRICE;
            } else {
                pendingRoundPssh[targetRoundId] += count * TICKET_PRICE;
            }
        }

        emit TicketsPurchasedForRounds(msg.sender, targetRoundIds, ticketCounts, totalCost);
    }

    /**
     * @notice Buy lottery tickets with WPLS (auto-swaps to pSSH)
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
        uint256 psshRequired = ticketsToBuy * TICKET_PRICE;

        if (psshRequired > 0) {
            // Account for 5.5% tax + 5% slippage
            uint256 psshToRequest = (psshRequired * WPLS_SWAP_BUFFER_PCT) / TOTAL_PCT;

            address[] memory path = new address[](2);
            path[0] = address(WPLS_TOKEN);
            path[1] = address(pSSH_TOKEN);

            uint256[] memory amountsIn = pulseXRouter.getAmountsIn(psshToRequest, path);
            uint256 wplsNeeded = amountsIn[0];

            WPLS_TOKEN.safeTransferFrom(msg.sender, address(this), wplsNeeded);
            WPLS_TOKEN.approve(address(pulseXRouter), wplsNeeded);

            uint256 psshBefore = pSSH_TOKEN.balanceOf(address(this));

            // Set amountOutMin to 0 to avoid revert due to tax/slippage
            // We verify the actual received amount after the swap instead
            pulseXRouter.swapExactTokensForTokens(
                wplsNeeded,
                0,  // Allow any amount, we check psshReceived below
                path,
                address(this),
                block.timestamp + 300
            );

            uint256 psshReceived = pSSH_TOKEN.balanceOf(address(this)) - psshBefore;
            require(psshReceived >= psshRequired, "Insufficient pSSH after swap");

            currentRoundTotalPssh += psshReceived;

            emit WPLSSwappedForTickets(msg.sender, wplsNeeded, psshReceived);
        }

        _processTickets(msg.sender, ticketNumbers, currentRoundId);

        emit TicketsPurchased(msg.sender, currentRoundId, ticketNumbers.length, 0, psshRequired);
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
        uint256 psshRequired = ticketsToBuy * TICKET_PRICE;

        if (psshRequired > 0) {
            // Apply base buffer (tax/slippage) and caller-provided extra buffer
            uint256 baseBuffered = (psshRequired * WPLS_SWAP_BUFFER_PCT) / TOTAL_PCT;
            uint256 psshToRequest = (baseBuffered * (TOTAL_PCT + extraBufferBp)) / TOTAL_PCT;

            address[] memory path = new address[](2);
            path[0] = address(WPLS_TOKEN);
            path[1] = address(pSSH_TOKEN);

            uint256[] memory amountsIn = pulseXRouter.getAmountsIn(psshToRequest, path);
            uint256 wplsNeeded = amountsIn[0];

            WPLS_TOKEN.safeTransferFrom(msg.sender, address(this), wplsNeeded);
            WPLS_TOKEN.approve(address(pulseXRouter), wplsNeeded);

            uint256 psshBefore = pSSH_TOKEN.balanceOf(address(this));

            // Keep amountOutMin at 0; enforce received amount via post-swap check
            pulseXRouter.swapExactTokensForTokens(
                wplsNeeded,
                0,
                path,
                address(this),
                block.timestamp + 300
            );

            uint256 psshReceived = pSSH_TOKEN.balanceOf(address(this)) - psshBefore;
            require(psshReceived >= psshRequired, "Insufficient pSSH after swap");

            currentRoundTotalPssh += psshReceived;
            emit WPLSSwappedForTickets(msg.sender, wplsNeeded, psshReceived);
        }

        _processTickets(msg.sender, ticketNumbers, currentRoundId);

        emit TicketsPurchased(msg.sender, currentRoundId, ticketNumbers.length, 0, psshRequired);
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

        pSSH_TOKEN.safeTransfer(msg.sender, amount);

        emit WinningsClaimed(msg.sender, roundId, amount);
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
     * @notice Update block delay for randomness (owner only)
     */
    function updateBlockDelay(uint256 _newDelay) external onlyOwner {
        blockDelay = _newDelay;
    }

    // ============ View Functions ============

    function getCurrentRoundInfo() external view returns (
        uint256 roundId,
        uint256 startTime,
        uint256 endTime,
        uint256 totalPssh,
        uint256 totalTickets,
        uint256 uniquePlayers,
        uint256 timeRemaining,
        bool isMegaMillionsRound,
        RoundState state
    ) {
        roundId = currentRoundId;
        startTime = currentRoundStartTime;
        endTime = currentRoundStartTime + roundDuration;
        totalPssh = currentRoundTotalPssh;
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
        return megaPsshBank;
    }

    function getClaimableWinnings(uint256 roundId, address player) external view returns (uint256) {
        return claimableWinnings[roundId][player];
    }

    // ============ Internal Functions ============

    function _processTickets(address player, uint8[6][] calldata ticketNumbers, uint256 roundId) private {
        for (uint256 i = 0; i < ticketNumbers.length; i++) {
            _validateTicket(ticketNumbers[i]);

            Ticket memory ticket = Ticket({
                player: player,
                numbers: _sortNumbers(ticketNumbers[i]),
                ticketId: nextTicketId,
                isFreeTicket: false
            });

            roundTickets[roundId].push(ticket);
            playerTicketIds[roundId][player].push(nextTicketId);
            nextTicketId++;
        }

        if (!hasEnteredRound[roundId][player]) {
            roundPlayers[roundId].push(player);
            hasEnteredRound[roundId][player] = true;
        }

        if (roundId == currentRoundId) {
            currentRoundTotalTickets += ticketNumbers.length;
        } else {
            pendingRoundTickets[roundId] += ticketNumbers.length;
        }
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
        currentRoundTotalPssh = rolloverReserve + pendingRoundPssh[currentRoundId];
        rolloverReserve = 0;
        currentRoundTotalTickets = pendingRoundTickets[currentRoundId];
        pendingRoundPssh[currentRoundId] = 0;
        pendingRoundTickets[currentRoundId] = 0;

        bool isMegaMillions = (currentRoundId % megaMillionsInterval == 0);

        emit RoundStarted(currentRoundId, currentRoundStartTime, currentRoundStartTime + roundDuration, isMegaMillions);
    }

    function _finalizeRound() private {
        require(currentRoundState == RoundState.OPEN, "Round not open");

        uint256 finalizingRoundId = currentRoundId;
        uint256 closingBlock = block.number;

        currentRoundState = RoundState.LOCKED;

        emit RoundLocked(finalizingRoundId, closingBlock, currentRoundTotalTickets, currentRoundTotalPssh);

        if (currentRoundTotalTickets == 0) {
            _handleEmptyRound(finalizingRoundId);
            return;
        }

        uint8[6] memory winningNumbers = _generateWinningNumbers(finalizingRoundId, closingBlock);
        _calculateBrackets(finalizingRoundId, winningNumbers);

        bool isMegaMillions = (finalizingRoundId % megaMillionsInterval == 0);
        if (isMegaMillions) {
            _handleMegaMillions(finalizingRoundId);
        }

        _distributePrizes(finalizingRoundId);
        currentRoundState = RoundState.FINALIZED;
        rounds[finalizingRoundId].state = RoundState.FINALIZED;

        emit RoundFinalized(finalizingRoundId, winningNumbers, currentRoundTotalPssh, currentRoundTotalTickets, roundPlayers[finalizingRoundId].length);
    }

    function _handleEmptyRound(uint256 roundId) private {
        rounds[roundId] = Round({
            roundId: roundId,
            startTime: currentRoundStartTime,
            endTime: block.timestamp,
            closingBlock: block.number,
            winningNumbers: [0, 0, 0, 0, 0, 0],
            totalPsshCollected: 0,
            totalTickets: 0,
            uniquePlayers: 0,
            brackets: [
                BracketWinners(1, 0, 0, 0, new uint256[](0)),
                BracketWinners(2, 0, 0, 0, new uint256[](0)),
                BracketWinners(3, 0, 0, 0, new uint256[](0)),
                BracketWinners(4, 0, 0, 0, new uint256[](0)),
                BracketWinners(5, 0, 0, 0, new uint256[](0)),
                BracketWinners(6, 0, 0, 0, new uint256[](0))
            ],
            megaBankContribution: 0,
            isMegaMillionsRound: (roundId % megaMillionsInterval == 0),
            state: RoundState.FINALIZED
        });

        currentRoundState = RoundState.FINALIZED;
    }

    function _generateWinningNumbers(uint256 roundId, uint256 closingBlock) private view returns (uint8[6] memory) {
        uint256 targetBlock = closingBlock > blockDelay ? closingBlock - blockDelay : closingBlock;

        uint256 seed = uint256(keccak256(abi.encodePacked(
            blockhash(targetBlock),
            blockhash(closingBlock),
            roundId,
            currentRoundTotalPssh,
            currentRoundTotalTickets,
            block.timestamp
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
            uint256 bracketPool = (currentRoundTotalPssh * BRACKET_PERCENTAGES[bracket - 1]) / TOTAL_PCT;

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
        rounds[roundId].totalPsshCollected = currentRoundTotalPssh;
        rounds[roundId].totalTickets = currentRoundTotalTickets;
        rounds[roundId].uniquePlayers = roundPlayers[roundId].length;
    }

    function _handleUnclaimedBracket(uint256 roundId, uint256 bracket, uint256 amount) private {
        if (bracket <= 4) {
            // New rule: 75% to next round winners pool, 25% to MegaMorbius
            uint256 toNextRound = (amount * ROLLOVER_TO_NEXT_ROUND_PCT) / TOTAL_PCT;
            uint256 toMega = amount - toNextRound;

            rolloverReserve += toNextRound;
            megaPsshBank += toMega;

            emit UnclaimedPrizeRolledOver(roundId, bracket, toNextRound, "NextRoundWinnersPool");
            emit UnclaimedPrizeRolledOver(roundId, bracket, toMega, "MegaMorbius");
        } else {
            // New rule applies to all brackets uniformly
            uint256 toNextRound = (amount * ROLLOVER_TO_NEXT_ROUND_PCT) / TOTAL_PCT;
            uint256 toMega = amount - toNextRound;

            rolloverReserve += toNextRound;
            megaPsshBank += toMega;

            emit UnclaimedPrizeRolledOver(roundId, bracket, toNextRound, "NextRoundWinnersPool");
            emit UnclaimedPrizeRolledOver(roundId, bracket, toMega, "MegaMorbius");
        }
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
                            claimableWinnings[roundId][tickets[j].player] += bw.payoutPerWinner;
                            break;
                        }
                    }
                }
            }
        }

        // Burn allocation (replaces stake)
        uint256 burnAllocation = (currentRoundTotalPssh * BURN_PCT) / TOTAL_PCT;
        if (burnAllocation > 0) {
            pSSH_TOKEN.safeTransfer(BURN_ADDRESS, burnAllocation);
        }

        // Add 20% to MegaMorbius bank
        uint256 megaContribution = (currentRoundTotalPssh * MEGA_BANK_PCT) / TOTAL_PCT;
        megaPsshBank += megaContribution;
        rounds[roundId].megaBankContribution = megaContribution;
    }

    function _handleMegaMillions(uint256 roundId) private {
        if (megaPsshBank == 0) return;

        uint256 toBracket6 = (megaPsshBank * 80) / 100;
        uint256 toBracket5 = megaPsshBank - toBracket6;

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

        emit MegaMillionsTriggered(roundId, megaPsshBank, toBracket6, toBracket5);

        megaPsshBank = 0;
    }

}
