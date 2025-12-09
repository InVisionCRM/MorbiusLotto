// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SuperStakeLotterySimple
 * @notice Simplified lottery - just send PSSH tokens directly to contract to buy tickets
 * @dev Users send PSSH tokens directly, contract automatically enters them into lottery
 */
contract SuperStakeLotterySimple is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Constants
    IERC20 public immutable superstakeToken;
    address public constant SUPERSTAKE_HEX_STAKE_ADDRESS = 0xdC48205df8aF83c97de572241bB92DB45402Aa0E;
    address public constant HEX_TOKEN_ADDRESS = 0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39;
    uint256 public constant TOKENS_PER_TICKET = 1 * 10**9; // 1 token = 1 ticket (9 decimals for PSSH)

    // Distribution percentages (in basis points: 1% = 100 bp)
    uint256 public constant PRIZE_PERCENTAGE = 6000; // 60%
    uint256 public constant ROLLOVER_PERCENTAGE = 2000; // 20%
    uint256 public constant BURN_PERCENTAGE = 2000; // 20%
    uint256 public constant TOTAL_PERCENTAGE = 10000; // 100%

    // Lottery state
    uint256 public roundDuration;
    uint256 public currentRoundId;
    uint256 public currentRoundStartTime;
    uint256 public currentRoundTotalTokens;
    uint256 public rolloverAmount;

    // Current round participants
    address[] public currentRoundPlayers;
    mapping(address => uint256) public currentRoundTickets;
    mapping(address => bool) private hasEnteredCurrentRound;

    // Historical data
    struct RoundHistory {
        uint256 roundId;
        uint256 totalTokens;
        uint256 totalTickets;
        uint256 participantCount;
        address winner;
        uint256 prizeAmount;
        uint256 burnAmount;
        uint256 rolloverAmount;
        uint256 endTime;
    }

    mapping(uint256 => RoundHistory) public rounds;

    // Events
    event TicketsPurchased(
        address indexed player,
        uint256 indexed roundId,
        uint256 tokensDeposited,
        uint256 ticketsReceived
    );

    event RoundConcluded(
        uint256 indexed roundId,
        address indexed winner,
        uint256 prizeAmount,
        uint256 burnAmount,
        uint256 rolloverAmount,
        uint256 totalParticipants,
        uint256 totalTickets
    );

    event RoundStarted(
        uint256 indexed roundId,
        uint256 startTime,
        uint256 endTime,
        uint256 initialRollover
    );

    event RoundDurationUpdated(uint256 oldDuration, uint256 newDuration);

    /**
     * @notice Initialize the lottery contract
     * @param _tokenAddress Address of SuperStake token
     * @param _initialRoundDuration Duration of each round in seconds
     */
    constructor(
        address _tokenAddress,
        uint256 _initialRoundDuration
    ) Ownable(msg.sender) {
        require(_tokenAddress != address(0), "Invalid token address");
        require(_initialRoundDuration > 0, "Duration must be positive");

        superstakeToken = IERC20(_tokenAddress);
        roundDuration = _initialRoundDuration;

        // Start first round
        _startNewRound();
    }

    /**
     * @notice Receive function - automatically called when PSSH tokens are sent
     * @dev This won't work for token transfers, keeping for native token protection
     */
    receive() external payable {
        revert("Send PSSH tokens using transfer, not native tokens");
    }

    /**
     * @notice Manual ticket purchase (approve + call this function)
     * @param amount Amount of tokens to deposit
     */
    function buyTickets(uint256 amount) external nonReentrant {
        // If the round already expired, conclude it and start the next one automatically
        if (_roundExpired()) {
            _concludeRoundAndStart();
        }

        require(block.timestamp < currentRoundStartTime + roundDuration, "Round ended");
        require(amount > 0, "Amount must be greater than 0");

        uint256 balanceBefore = superstakeToken.balanceOf(address(this));

        // Transfer tokens from user to contract
        superstakeToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 balanceAfter = superstakeToken.balanceOf(address(this));
        uint256 tokensReceived = balanceAfter - balanceBefore;

        _processTicketPurchase(msg.sender, tokensReceived);
    }

    /**
     * @notice Process ticket purchase for a user
     * @param player Address of the player
     * @param tokensReceived Amount of tokens received
     */
    function _processTicketPurchase(address player, uint256 tokensReceived) private {
        require(tokensReceived > 0, "No tokens received");

        // Calculate tickets (using 9 decimal precision for PSSH)
        uint256 ticketsEarned = (tokensReceived * 10**9) / TOKENS_PER_TICKET;

        require(ticketsEarned > 0, "Insufficient tokens for ticket");

        // Add player to round if first time
        if (!hasEnteredCurrentRound[player]) {
            currentRoundPlayers.push(player);
            hasEnteredCurrentRound[player] = true;
        }

        // Update player tickets and round total
        currentRoundTickets[player] += ticketsEarned;
        currentRoundTotalTokens += tokensReceived;

        emit TicketsPurchased(player, currentRoundId, tokensReceived, ticketsEarned);
    }

    /**
     * @notice Conclude current round and start new one
     * @dev Can be called by anyone once round duration has elapsed
     */
    function concludeRound() external nonReentrant {
        _concludeRoundAndStart();
    }

    /**
     * @notice Sweep any HEX accidentally sent to this contract to the staking address
     */
    function sweepHexTokens() external nonReentrant {
        _forwardHexIfAny();
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
     * @notice Get current round information
     */
    function getRoundInfo()
        external
        view
        returns (
            uint256 roundId,
            uint256 startTime,
            uint256 endTime,
            uint256 totalTokens,
            uint256 participantCount,
            uint256 timeRemaining
        )
    {
        roundId = currentRoundId;
        startTime = currentRoundStartTime;
        endTime = currentRoundStartTime + roundDuration;
        totalTokens = currentRoundTotalTokens + rolloverAmount;
        participantCount = currentRoundPlayers.length;

        if (block.timestamp >= endTime) {
            timeRemaining = 0;
        } else {
            timeRemaining = endTime - block.timestamp;
        }
    }

    /**
     * @notice Get player's tickets in current round
     */
    function getPlayerTickets(address player) external view returns (uint256 tickets) {
        return currentRoundTickets[player];
    }

    /**
     * @notice Get historical round data
     */
    function getRoundHistory(uint256 roundId) external view returns (RoundHistory memory) {
        return rounds[roundId];
    }

    /**
     * @notice Get all players in current round
     */
    function getCurrentPlayers() external view returns (address[] memory) {
        return currentRoundPlayers;
    }

    /**
     * @notice Get total tickets in current round
     */
    function getCurrentTotalTickets() external view returns (uint256) {
        return _calculateTotalTickets();
    }

    /**
     * @dev Start a new round
     */
    function _startNewRound() private {
        currentRoundId++;
        currentRoundStartTime = block.timestamp;
        currentRoundTotalTokens = 0;

        // Clear previous round data
        for (uint256 i = 0; i < currentRoundPlayers.length; i++) {
            address player = currentRoundPlayers[i];
            delete currentRoundTickets[player];
            delete hasEnteredCurrentRound[player];
        }
        delete currentRoundPlayers;

        emit RoundStarted(
            currentRoundId,
            currentRoundStartTime,
            currentRoundStartTime + roundDuration,
            rolloverAmount
        );
    }

    /**
     * @dev Check whether the current round has expired
     */
    function _roundExpired() private view returns (bool) {
        return block.timestamp >= currentRoundStartTime + roundDuration;
    }

    /**
     * @dev Conclude the current round and start the next one
     */
    function _concludeRoundAndStart() private {
        require(_roundExpired(), "Round not ended");

        uint256 endingRoundId = currentRoundId;
        uint256 totalTokens = currentRoundTotalTokens + rolloverAmount;

        // Handle empty round
        if (currentRoundPlayers.length == 0) {
            rounds[endingRoundId] = RoundHistory({
                roundId: endingRoundId,
                totalTokens: totalTokens,
                totalTickets: 0,
                participantCount: 0,
                winner: address(0),
                prizeAmount: 0,
                burnAmount: 0,
                rolloverAmount: totalTokens,
                endTime: block.timestamp
            });

            emit RoundConcluded(
                endingRoundId,
                address(0),
                0,
                0,
                totalTokens,
                0,
                0
            );

            // Rollover increases for next round
            rolloverAmount = totalTokens;
            _startNewRound();
            _forwardHexIfAny();
            return;
        }

        // Select winner using randomness
        address winner = _selectWinner();

        // Calculate distributions
        uint256 prizeAmount = (totalTokens * PRIZE_PERCENTAGE) / TOTAL_PERCENTAGE;
        uint256 burnAmount = (totalTokens * BURN_PERCENTAGE) / TOTAL_PERCENTAGE;
        uint256 newRollover = totalTokens - prizeAmount - burnAmount;

        // Get total tickets for history
        uint256 totalTickets = _calculateTotalTickets();

        // Record history
        rounds[endingRoundId] = RoundHistory({
            roundId: endingRoundId,
            totalTokens: totalTokens,
            totalTickets: totalTickets,
            participantCount: currentRoundPlayers.length,
            winner: winner,
            prizeAmount: prizeAmount,
            burnAmount: burnAmount,
            rolloverAmount: newRollover,
            endTime: block.timestamp
        });

        // Execute transfers
        superstakeToken.safeTransfer(winner, prizeAmount);
        superstakeToken.safeTransfer(SUPERSTAKE_HEX_STAKE_ADDRESS, burnAmount);
        _forwardHexIfAny();

        emit RoundConcluded(
            endingRoundId,
            winner,
            prizeAmount,
            burnAmount,
            newRollover,
            currentRoundPlayers.length,
            totalTickets
        );

        // Update rollover for next round
        rolloverAmount = newRollover;

        // Start new round
        _startNewRound();
        _forwardHexIfAny();
    }

    /**
     * @dev Select winner using block hash randomness with weighted tickets
     */
    function _selectWinner() private view returns (address) {
        require(currentRoundPlayers.length > 0, "No players");

        uint256 randomSeed = uint256(
            keccak256(
                abi.encodePacked(
                    block.timestamp,
                    block.prevrandao,
                    blockhash(block.number - 1),
                    currentRoundTotalTokens,
                    currentRoundPlayers.length,
                    currentRoundId
                )
            )
        );

        uint256 totalTickets = _calculateTotalTickets();
        uint256 winningTicket = randomSeed % totalTickets;

        // Find winner based on weighted tickets
        uint256 cumulativeTickets = 0;
        for (uint256 i = 0; i < currentRoundPlayers.length; i++) {
            address player = currentRoundPlayers[i];
            cumulativeTickets += currentRoundTickets[player];

            if (winningTicket < cumulativeTickets) {
                return player;
            }
        }

        return currentRoundPlayers[currentRoundPlayers.length - 1];
    }

    /**
     * @dev Calculate total tickets in current round
     */
    function _calculateTotalTickets() private view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < currentRoundPlayers.length; i++) {
            total += currentRoundTickets[currentRoundPlayers[i]];
        }
        return total;
    }

    /**
     * @dev Forward any HEX tokens held by this contract to the staking address
     */
    function _forwardHexIfAny() private {
        IERC20 hexToken = IERC20(HEX_TOKEN_ADDRESS);
        uint256 hexBalance = hexToken.balanceOf(address(this));
        if (hexBalance > 0) {
            hexToken.safeTransfer(SUPERSTAKE_HEX_STAKE_ADDRESS, hexBalance);
        }
    }
}
