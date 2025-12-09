// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SuperStakeLottery6of55
 * @notice 6-of-55 number matching lottery with multiple prize brackets, MegaMillions, and HEX overlay jackpots
 * @dev Players pick 6 unique numbers from 1-55. Prizes awarded based on match count (1-6 matches).
 *      - 55% of pot distributed to winners across 6 brackets
 *      - 25% sent to SuperStake stake address
 *      - 20% added to MegaMillions bank (drops every 55th round)
 *      - HEX overlay jackpot triggers on bracket 6 wins
 *      - Free ticket credits awarded to non-winners
 */
contract SuperStakeLottery6of55 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    IERC20 public immutable pSSH_TOKEN;
    IERC20 public immutable HEX_TOKEN;

    address public constant SUPERSTAKE_HEX_STAKE_ADDRESS = 0xdC48205df8aF83c97de572241bB92DB45402Aa0E;
    address public constant HEX_TOKEN_ADDRESS = 0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39;

    uint256 public constant TICKET_PRICE = 1e9; // 1 pSSH (9 decimals)
    uint8 public constant NUMBERS_PER_TICKET = 6;
    uint8 public constant MIN_NUMBER = 1;
    uint8 public constant MAX_NUMBER = 55;
    uint256 public constant MEGA_MILLIONS_INTERVAL = 55; // Every 55th round

    // Distribution percentages (basis points, 1% = 100 bp)
    uint256 public constant WINNERS_POOL_PCT = 5500; // 55%
    uint256 public constant STAKE_ALLOCATION_PCT = 2500; // 25%
    uint256 public constant MEGA_BANK_PCT = 2000; // 20%
    uint256 public constant TOTAL_PCT = 10000; // 100%

    // Bracket percentages (of roundPot, in basis points)
    // Bracket 1: 2%, Bracket 2: 4%, Bracket 3: 6%, Bracket 4: 8%, Bracket 5: 10%, Bracket 6: 25%
    uint256[6] public BRACKET_PERCENTAGES = [200, 400, 600, 800, 1000, 2500];

    // Leftover split for high brackets (5 & 6)
    uint256 public constant LEFTOVER_TO_FREE_TICKETS_PCT = 4000; // 40%
    uint256 public constant LEFTOVER_TO_MEGA_PCT = 6000; // 60%

    // HEX overlay split when bracket 6 hit
    uint256 public constant HEX_TO_WINNERS_PCT = 7000; // 70%
    uint256 public constant HEX_TO_STAKE_PCT = 3000; // 30%

    // Randomness delay (configurable for testing)
    uint256 public blockDelay = 0; // No delay needed; use recent blockhash

    // ============ Enums ============

    enum RoundState { OPEN, LOCKED, FINALIZED }

    // ============ Structs ============

    struct Ticket {
        address player;
        uint8[6] numbers; // Sorted ascending
        uint256 ticketId;
        bool isFreeTicket;
    }

    struct BracketWinners {
        uint256 matchCount; // 1-6
        uint256 poolAmount; // pSSH allocated to this bracket
        uint256 winnerCount;
        uint256 payoutPerWinner;
        uint256[] winningTicketIds;
    }

    struct Round {
        uint256 roundId;
        uint256 startTime;
        uint256 endTime;
        uint256 closingBlock;
        uint8[6] winningNumbers; // Set when finalized
        uint256 totalPsshCollected;
        uint256 totalTickets;
        uint256 uniquePlayers;
        BracketWinners[6] brackets; // Index 0 = bracket 1 (1 match), index 5 = bracket 6 (6 matches)
        uint256 megaBankContribution;
        bool isMegaMillionsRound;
        bool hexOverlayTriggered;
        uint256 hexPrizeAmount;
        RoundState state;
    }

    // ============ State Variables ============

    uint256 public roundDuration;
    uint256 public currentRoundId;
    uint256 public currentRoundStartTime;
    RoundState public currentRoundState;

    // Banks
    uint256 public megaPsshBank;
    uint256 public freeTicketReserve;
    uint256 public hexBankTracked; // Track HEX separately for accounting

    // Current round tracking
    uint256 public currentRoundTotalPssh;
    uint256 public currentRoundTotalTickets;
    uint256 public nextTicketId; // Global ticket ID counter

    // Mappings
    mapping(uint256 => Round) public rounds; // roundId => Round
    mapping(uint256 => Ticket[]) public roundTickets; // roundId => tickets array
    mapping(uint256 => mapping(address => uint256[])) public playerTicketIds; // roundId => player => ticketIds
    mapping(uint256 => mapping(address => bool)) public hasEnteredRound; // roundId => player => hasEntered
    mapping(address => uint256) public freeTicketCredits; // player => credits for next round
    mapping(uint256 => address[]) public roundPlayers; // roundId => unique players

    // Claiming system (to avoid gas limit on distribution)
    mapping(uint256 => mapping(address => uint256)) public claimableWinnings; // roundId => player => amount
    mapping(uint256 => mapping(address => bool)) public hasClaimed; // roundId => player => claimed

    // ============ Events ============

    event RoundStarted(
        uint256 indexed roundId,
        uint256 startTime,
        uint256 endTime,
        bool isMegaMillionsRound
    );

    event TicketsPurchased(
        address indexed player,
        uint256 indexed roundId,
        uint256 ticketCount,
        uint256 freeTicketsUsed,
        uint256 psshSpent
    );

    event RoundLocked(
        uint256 indexed roundId,
        uint256 closingBlock,
        uint256 totalTickets,
        uint256 totalPssh
    );

    event RoundFinalized(
        uint256 indexed roundId,
        uint8[6] winningNumbers,
        uint256 totalPssh,
        uint256 totalTickets,
        uint256 uniquePlayers
    );

    event BracketResults(
        uint256 indexed roundId,
        uint256 bracket,
        uint256 winnerCount,
        uint256 poolAmount,
        uint256 payoutPerWinner
    );

    event MegaMillionsTriggered(
        uint256 indexed roundId,
        uint256 bankAmount,
        uint256 toBracket6,
        uint256 toBracket5
    );

    event HexOverlayTriggered(
        uint256 indexed roundId,
        uint256 hexAmount,
        uint256 toWinners,
        uint256 toStake
    );

    event WinningsClaimed(
        address indexed player,
        uint256 indexed roundId,
        uint256 amount
    );

    event FreeTicketsCredited(
        address indexed player,
        uint256 credits
    );

    event RoundDurationUpdated(uint256 oldDuration, uint256 newDuration);

    // ============ Constructor ============

    /**
     * @notice Initialize the lottery contract
     * @param _psshTokenAddress Address of SuperStake (pSSH) token
     * @param _initialRoundDuration Duration of each round in seconds
     */
    constructor(
        address _psshTokenAddress,
        uint256 _initialRoundDuration
    ) Ownable(msg.sender) {
        require(_psshTokenAddress != address(0), "Invalid pSSH address");
        require(_initialRoundDuration > 0, "Duration must be positive");

        pSSH_TOKEN = IERC20(_psshTokenAddress);
        HEX_TOKEN = IERC20(HEX_TOKEN_ADDRESS);
        roundDuration = _initialRoundDuration;

        // Start first round
        _startNewRound();
    }

    // ============ Public Functions ============

    /**
     * @notice Buy lottery tickets with user-selected numbers
     * @param ticketNumbers Array of tickets, each ticket is 6 numbers (1-55, unique per ticket)
     * @dev If round expired, automatically finalizes and starts new round
     *      Handles free ticket credits automatically
     */
    function buyTickets(uint8[6][] calldata ticketNumbers) external nonReentrant {
        // If round expired, finalize and start new
        if (_isRoundExpired()) {
            _finalizeRound();
            _startNewRound();
        }

        require(currentRoundState == RoundState.OPEN, "Round not open");
        require(ticketNumbers.length > 0, "Must buy at least 1 ticket");
        require(ticketNumbers.length <= 100, "Max 100 tickets per tx");

        uint256 freeTicketsToUse = 0;
        uint256 ticketsToBuy = ticketNumbers.length;

        // Apply free ticket credits
        if (freeTicketCredits[msg.sender] > 0) {
            freeTicketsToUse = freeTicketCredits[msg.sender] < ticketsToBuy
                ? freeTicketCredits[msg.sender]
                : ticketsToBuy;
            freeTicketCredits[msg.sender] -= freeTicketsToUse;
        }

        uint256 ticketsToPayFor = ticketsToBuy - freeTicketsToUse;
        uint256 psshRequired = ticketsToPayFor * TICKET_PRICE;

        // Transfer pSSH for paid tickets
        if (psshRequired > 0) {
            pSSH_TOKEN.safeTransferFrom(msg.sender, address(this), psshRequired);
            currentRoundTotalPssh += psshRequired;
        }

        // Validate and store tickets
        for (uint256 i = 0; i < ticketNumbers.length; i++) {
            _validateTicket(ticketNumbers[i]);

            Ticket memory ticket = Ticket({
                player: msg.sender,
                numbers: _sortNumbers(ticketNumbers[i]),
                ticketId: nextTicketId,
                isFreeTicket: i < freeTicketsToUse
            });

            roundTickets[currentRoundId].push(ticket);
            playerTicketIds[currentRoundId][msg.sender].push(nextTicketId);
            nextTicketId++;
        }

        // Track unique players
        if (!hasEnteredRound[currentRoundId][msg.sender]) {
            roundPlayers[currentRoundId].push(msg.sender);
            hasEnteredRound[currentRoundId][msg.sender] = true;
        }

        currentRoundTotalTickets += ticketNumbers.length;

        emit TicketsPurchased(
            msg.sender,
            currentRoundId,
            ticketNumbers.length,
            freeTicketsToUse,
            psshRequired
        );
    }

    /**
     * @notice Manually finalize the current round (if time expired)
     * @dev Can be called by anyone once round duration elapsed
     */
    function finalizeRound() external nonReentrant {
        require(_isRoundExpired(), "Round not expired");
        require(currentRoundState == RoundState.OPEN, "Round already finalized");

        _finalizeRound();
        _startNewRound();
    }

    /**
     * @notice Claim winnings from a specific round
     * @param roundId The round to claim from
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
     * @param _newDuration New duration in seconds
     */
    function updateRoundDuration(uint256 _newDuration) external onlyOwner {
        require(_newDuration > 0, "Duration must be positive");
        uint256 oldDuration = roundDuration;
        roundDuration = _newDuration;
        emit RoundDurationUpdated(oldDuration, _newDuration);
    }

    /**
     * @notice Update block delay for randomness (owner only, for testing)
     * @param _newDelay New block delay
     */
    function updateBlockDelay(uint256 _newDelay) external onlyOwner {
        blockDelay = _newDelay;
    }

    /**
     * @notice Emergency sweep of HEX tokens to stake address
     */
    function sweepHexTokens() external nonReentrant {
        _forwardHexIfAny();
    }

    // ============ View Functions ============

    /**
     * @notice Get current round information
     */
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

        if (block.timestamp >= endTime) {
            timeRemaining = 0;
        } else {
            timeRemaining = endTime - block.timestamp;
        }

        isMegaMillionsRound = (currentRoundId % MEGA_MILLIONS_INTERVAL == 0);
        state = currentRoundState;
    }

    /**
     * @notice Get player's tickets for a round
     */
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

    /**
     * @notice Get round history
     */
    function getRound(uint256 roundId) external view returns (Round memory) {
        return rounds[roundId];
    }

    /**
     * @notice Get MegaMillions bank balance
     */
    function getMegaMillionsBank() external view returns (uint256) {
        return megaPsshBank;
    }

    /**
     * @notice Get HEX jackpot balance
     */
    function getHexJackpot() external view returns (uint256) {
        return HEX_TOKEN.balanceOf(address(this));
    }

    /**
     * @notice Get player's free ticket credits
     */
    function getFreeTicketCredits(address player) external view returns (uint256) {
        return freeTicketCredits[player];
    }

    /**
     * @notice Get player's claimable winnings for a round
     */
    function getClaimableWinnings(uint256 roundId, address player) external view returns (uint256) {
        return claimableWinnings[roundId][player];
    }

    // ============ Internal Functions ============

    /**
     * @dev Validate ticket numbers
     */
    function _validateTicket(uint8[6] memory numbers) private pure {
        for (uint256 i = 0; i < NUMBERS_PER_TICKET; i++) {
            require(numbers[i] >= MIN_NUMBER && numbers[i] <= MAX_NUMBER, "Number out of range");

            // Check for duplicates
            for (uint256 j = i + 1; j < NUMBERS_PER_TICKET; j++) {
                require(numbers[i] != numbers[j], "Duplicate numbers");
            }
        }
    }

    /**
     * @dev Sort numbers in ascending order (bubble sort, efficient for 6 elements)
     */
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

    /**
     * @dev Check if current round has expired
     */
    function _isRoundExpired() private view returns (bool) {
        return block.timestamp >= currentRoundStartTime + roundDuration;
    }

    /**
     * @dev Start a new round
     */
    function _startNewRound() private {
        currentRoundId++;
        currentRoundStartTime = block.timestamp;
        currentRoundState = RoundState.OPEN;
        currentRoundTotalPssh = 0;
        currentRoundTotalTickets = 0;

        bool isMegaMillions = (currentRoundId % MEGA_MILLIONS_INTERVAL == 0);

        emit RoundStarted(
            currentRoundId,
            currentRoundStartTime,
            currentRoundStartTime + roundDuration,
            isMegaMillions
        );
    }

    /**
     * @dev Finalize the current round
     */
    function _finalizeRound() private {
        require(currentRoundState == RoundState.OPEN, "Round not open");

        uint256 finalizingRoundId = currentRoundId;
        uint256 closingBlock = block.number;

        // Lock the round
        currentRoundState = RoundState.LOCKED;

        emit RoundLocked(
            finalizingRoundId,
            closingBlock,
            currentRoundTotalTickets,
            currentRoundTotalPssh
        );

        // Handle empty round immediately
        if (currentRoundTotalTickets == 0) {
            _handleEmptyRound(finalizingRoundId);
            return;
        }

        // Generate winning numbers (no delay; use recent blockhash)
        uint8[6] memory winningNumbers = _generateWinningNumbers(finalizingRoundId, closingBlock);

        // Calculate matches and distribute to brackets
        _calculateBrackets(finalizingRoundId, winningNumbers);

        // Handle MegaMillions if applicable
        bool isMegaMillions = (finalizingRoundId % MEGA_MILLIONS_INTERVAL == 0);
        if (isMegaMillions) {
            _handleMegaMillions(finalizingRoundId);
        }

        // Distribute prizes
        _distributePrizes(finalizingRoundId);

        // Check for HEX overlay (bracket 6 winners)
        _checkHexOverlay(finalizingRoundId);

        // Award free tickets to non-winners
        _awardFreeTickets(finalizingRoundId);

        // Mark as finalized
        currentRoundState = RoundState.FINALIZED;
        rounds[finalizingRoundId].state = RoundState.FINALIZED;

        emit RoundFinalized(
            finalizingRoundId,
            winningNumbers,
            currentRoundTotalPssh,
            currentRoundTotalTickets,
            roundPlayers[finalizingRoundId].length
        );
    }

    /**
     * @dev Handle empty round (no tickets sold)
     */
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
            isMegaMillionsRound: (roundId % MEGA_MILLIONS_INTERVAL == 0),
            hexOverlayTriggered: false,
            hexPrizeAmount: 0,
            state: RoundState.FINALIZED
        });

        currentRoundState = RoundState.FINALIZED;
    }

    /**
     * @dev Generate 6 unique winning numbers (1-55)
     */
    function _generateWinningNumbers(uint256 roundId, uint256 closingBlock) private view returns (uint8[6] memory) {
        // Use the latest available blockhash (closingBlock) and an optional past block if delay is set
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
        bool[56] memory used; // Index 0 unused, 1-55 used

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

    /**
     * @dev Count how many numbers match between ticket and winning numbers
     */
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

    /**
     * @dev Calculate bracket results
     */
    function _calculateBrackets(uint256 roundId, uint8[6] memory winningNumbers) private {
        Ticket[] storage tickets = roundTickets[roundId];

        // Initialize bracket counts
        uint256[7] memory bracketCounts; // Index 0 unused, 1-6 for brackets
        uint256[][7] memory bracketTicketIds; // Store ticket IDs per bracket

        for (uint256 i = 1; i <= 6; i++) {
            bracketTicketIds[i] = new uint256[](tickets.length);
        }

        // Count matches for all tickets
        for (uint256 i = 0; i < tickets.length; i++) {
            uint8 matches = _countMatches(tickets[i].numbers, winningNumbers);

            if (matches > 0) {
                bracketTicketIds[matches][bracketCounts[matches]] = tickets[i].ticketId;
                bracketCounts[matches]++;
            }
        }

        // Calculate payouts per bracket
        for (uint256 bracket = 1; bracket <= 6; bracket++) {
            uint256 bracketPool = (currentRoundTotalPssh * BRACKET_PERCENTAGES[bracket - 1]) / TOTAL_PCT;

            if (bracketCounts[bracket] > 0) {
                // Resize winning ticket IDs array
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
                // No winners in this bracket - handle leftover
                if (bracket >= 5) {
                    // Brackets 5 & 6: split leftover
                    uint256 toReserve = (bracketPool * LEFTOVER_TO_FREE_TICKETS_PCT) / TOTAL_PCT;
                    uint256 toMega = bracketPool - toReserve;
                    freeTicketReserve += toReserve;
                    megaPsshBank += toMega;
                }

                rounds[roundId].brackets[bracket - 1] = BracketWinners({
                    matchCount: bracket,
                    poolAmount: bracketPool,
                    winnerCount: 0,
                    payoutPerWinner: 0,
                    winningTicketIds: new uint256[](0)
                });
            }

            emit BracketResults(
                roundId,
                bracket,
                bracketCounts[bracket],
                bracketPool,
                rounds[roundId].brackets[bracket - 1].payoutPerWinner
            );
        }

        // Store winning numbers
        rounds[roundId].winningNumbers = winningNumbers;
        rounds[roundId].totalPsshCollected = currentRoundTotalPssh;
        rounds[roundId].totalTickets = currentRoundTotalTickets;
        rounds[roundId].uniquePlayers = roundPlayers[roundId].length;
    }

    /**
     * @dev Distribute prizes to winners (via claimable system)
     */
    function _distributePrizes(uint256 roundId) private {
        Ticket[] storage tickets = roundTickets[roundId];

        // Calculate claimable amounts per player
        for (uint256 bracket = 0; bracket < 6; bracket++) {
            BracketWinners storage bw = rounds[roundId].brackets[bracket];

            if (bw.winnerCount > 0) {
                for (uint256 i = 0; i < bw.winningTicketIds.length; i++) {
                    uint256 ticketId = bw.winningTicketIds[i];

                    // Find ticket and credit player
                    for (uint256 j = 0; j < tickets.length; j++) {
                        if (tickets[j].ticketId == ticketId) {
                            claimableWinnings[roundId][tickets[j].player] += bw.payoutPerWinner;
                            break;
                        }
                    }
                }
            }
        }

        // Send 25% to stake address
        uint256 stakeAllocation = (currentRoundTotalPssh * STAKE_ALLOCATION_PCT) / TOTAL_PCT;
        if (stakeAllocation > 0) {
            pSSH_TOKEN.safeTransfer(SUPERSTAKE_HEX_STAKE_ADDRESS, stakeAllocation);
        }

        // Add 20% to MegaMillions bank
        uint256 megaContribution = (currentRoundTotalPssh * MEGA_BANK_PCT) / TOTAL_PCT;
        megaPsshBank += megaContribution;
        rounds[roundId].megaBankContribution = megaContribution;
    }

    /**
     * @dev Handle MegaMillions (every 55th round)
     */
    function _handleMegaMillions(uint256 roundId) private {
        if (megaPsshBank == 0) return;

        uint256 toBracket6 = (megaPsshBank * 80) / 100;
        uint256 toBracket5 = megaPsshBank - toBracket6;

        // Add to bracket pools
        rounds[roundId].brackets[5].poolAmount += toBracket6;
        rounds[roundId].brackets[4].poolAmount += toBracket5;

        // Recalculate payouts if there are winners
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

        // Reset bank
        megaPsshBank = 0;
    }

    /**
     * @dev Check and handle HEX overlay if bracket 6 hit
     */
    function _checkHexOverlay(uint256 roundId) private {
        if (rounds[roundId].brackets[5].winnerCount > 0) {
            uint256 hexBalance = HEX_TOKEN.balanceOf(address(this));

            if (hexBalance > 0) {
                uint256 toWinners = (hexBalance * HEX_TO_WINNERS_PCT) / TOTAL_PCT;
                uint256 toStake = hexBalance - toWinners;

                // Distribute HEX to bracket 6 winners (via claimable - would need separate claiming)
                // For now, send directly
                if (toWinners > 0) {
                    Ticket[] storage tickets = roundTickets[roundId];
                    BracketWinners storage bracket6 = rounds[roundId].brackets[5];
                    uint256 hexPerWinner = toWinners / bracket6.winnerCount;

                    for (uint256 i = 0; i < bracket6.winningTicketIds.length; i++) {
                        uint256 ticketId = bracket6.winningTicketIds[i];

                        for (uint256 j = 0; j < tickets.length; j++) {
                            if (tickets[j].ticketId == ticketId) {
                                HEX_TOKEN.safeTransfer(tickets[j].player, hexPerWinner);
                                break;
                            }
                        }
                    }
                }

                if (toStake > 0) {
                    HEX_TOKEN.safeTransfer(SUPERSTAKE_HEX_STAKE_ADDRESS, toStake);
                }

                rounds[roundId].hexOverlayTriggered = true;
                rounds[roundId].hexPrizeAmount = toWinners;

                emit HexOverlayTriggered(roundId, hexBalance, toWinners, toStake);
            }
        }
    }

    /**
     * @dev Award free tickets to non-winners
     */
    function _awardFreeTickets(uint256 roundId) private {
        address[] storage players = roundPlayers[roundId];
        Ticket[] storage tickets = roundTickets[roundId];

        for (uint256 i = 0; i < players.length; i++) {
            address player = players[i];
            bool wonAnyBracket = false;

            // Check if player won in any bracket
            for (uint256 j = 0; j < tickets.length; j++) {
                if (tickets[j].player == player) {
                    uint8 matches = _countMatches(tickets[j].numbers, rounds[roundId].winningNumbers);
                    if (matches > 0) {
                        wonAnyBracket = true;
                        break;
                    }
                }
            }

            // If didn't win anything, award 1 free ticket
            if (!wonAnyBracket && freeTicketReserve >= TICKET_PRICE) {
                freeTicketCredits[player]++;
                freeTicketReserve -= TICKET_PRICE;
                emit FreeTicketsCredited(player, 1);
            }
        }
    }

    /**
     * @dev Forward any HEX balance to stake address
     */
    function _forwardHexIfAny() private {
        uint256 hexBalance = HEX_TOKEN.balanceOf(address(this));
        if (hexBalance > 0) {
            HEX_TOKEN.safeTransfer(SUPERSTAKE_HEX_STAKE_ADDRESS, hexBalance);
        }
    }
}
