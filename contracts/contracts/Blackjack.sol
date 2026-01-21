// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

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

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function getAmountsIn(
        uint256 amountOut,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);
}

/**
 * @title Blackjack Reserve System
 * @notice Hybrid blackjack game with reserve-based deposits/withdrawals
 * @dev Server-orchestrated gameplay with blockchain settlements
 *      All PLS deposits auto-swapped to MORBIUS, only MORBIUS withdrawals
 */
contract Blackjack is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    modifier onlyAuthorizedServer() {
        require(msg.sender == authorizedServer, "Not authorized server");
        _;
    }

    modifier onlyEmergencyAdmin() {
        require(msg.sender == emergencyAdmin || msg.sender == owner(), "Not emergency admin");
        _;
    }

    // ============ Constants ============

    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant WPLS_SWAP_BUFFER_PCT = 15000; // 50% buffer for slippage

    // House edge for settlements (10% of winnings)
    uint256 public constant HOUSE_EDGE_BPS = 1000; // 10%

    // Minimum deposit/withdrawal amounts
    uint256 public constant MIN_DEPOSIT = 1e18;     // 1 MORBIUS
    uint256 public constant MIN_WITHDRAWAL = 1e18;  // 1 MORBIUS

    // Maximum daily withdrawal limit (anti-fraud)
    uint256 public constant MAX_DAILY_WITHDRAWAL = 10000e18; // 10,000 MORBIUS

    // Authorized server for settlements
    address public authorizedServer;

    // Emergency admin
    address public emergencyAdmin;

    // ============ Removed Game Constants (No Longer Used) ============
    // These constants were for the old on-chain game logic
    // uint8 public constant DECKS = 6;
    // uint8 public constant CARDS_PER_DECK = 52;
    // uint8 public constant TOTAL_CARDS = DECKS * CARDS_PER_DECK;
    // uint8 public constant ACE_LOW = 1;
    // uint8 public constant ACE_HIGH = 11;
    // uint8 public constant FACE_VALUE = 10;

    // enum Action { HIT, STAND, DOUBLE_DOWN, SPLIT }

    // ============ Immutable State ============

    IERC20 public immutable MORBIUS_TOKEN;
    IWrappedPulse public immutable WPLS_TOKEN;
    IPulseXRouter public immutable pulseXRouter;

    // ============ Mutable State ============

    // Player reserves (MORBIUS only)
    mapping(address => uint256) public playerReserves;

    // Total MORBIUS in reserves
    uint256 public totalReserves;

    // Daily withdrawal tracking (for fraud prevention)
    mapping(address => mapping(uint256 => uint256)) public dailyWithdrawals; // player => day => amount
    mapping(uint256 => uint256) public dailyWithdrawalTotals; // day => total amount

    // Provably fair verification
    mapping(bytes32 => bool) public revealedSeeds; // Track revealed server seeds

    // Pending games (locked bets)
    mapping(bytes32 => PendingGame) public pendingGames; // gameHash => game data
    mapping(address => bytes32[]) public playerPendingGames; // player => array of game hashes

    // Emergency pause
    bool public emergencyPaused;

    // ============ Structs ============

    struct PendingGame {
        address player;
        uint256 betAmount;
        uint256 timestamp;
        bool settled;
    }

    // ============ Events ============

    event Deposit(
        address indexed player,
        uint256 morbiusAmount,
        uint256 plsAmount
    );

    event DepositMORBIUS(
        address indexed player,
        uint256 amount
    );

    event Withdrawal(
        address indexed player,
        uint256 amount
    );

    event GameSettled(
        address indexed player,
        int256 amount,
        bytes32 indexed gameHash
    );

    event ServerSeedRevealed(
        bytes32 indexed serverSeedHash,
        bytes32 serverSeed
    );

    event BetPlaced(
        address indexed player,
        bytes32 indexed gameHash,
        uint256 betAmount,
        uint256 timestamp
    );

    event AuthorizedServerUpdated(
        address indexed oldServer,
        address indexed newServer
    );

    event EmergencyAdminUpdated(
        address indexed oldAdmin,
        address indexed newAdmin
    );

    constructor(
        address _initialOwner,
        address _morbiusToken,
        address _wplsToken,
        address _pulseXRouter,
        address _authorizedServer,
        address _emergencyAdmin
    ) Ownable(_initialOwner) {
        MORBIUS_TOKEN = IERC20(_morbiusToken);
        WPLS_TOKEN = IWrappedPulse(_wplsToken);
        pulseXRouter = IPulseXRouter(_pulseXRouter);
        authorizedServer = _authorizedServer;
        emergencyAdmin = _emergencyAdmin;
    }

    // ============ External Functions ============

    /**
     * @notice Deposit PLS and automatically swap to MORBIUS
     * @dev PLS is wrapped to WPLS, then swapped to MORBIUS via PulseX
     */
    function deposit() external payable nonReentrant whenNotPaused {
        require(msg.value >= MIN_DEPOSIT, "Deposit too small");
        require(!emergencyPaused, "Emergency pause active");

        // Wrap PLS to WPLS
        WPLS_TOKEN.deposit{value: msg.value}();

        // Calculate MORBIUS amount to receive (with slippage protection)
        uint256 wplsBalance = WPLS_TOKEN.balanceOf(address(this));
        address[] memory path = new address[](2);
        path[0] = address(WPLS_TOKEN);
        path[1] = address(MORBIUS_TOKEN);

        uint256[] memory amounts = pulseXRouter.getAmountsIn(msg.value, path);
        uint256 minMorbiusOut = (amounts[amounts.length - 1] * (10000 - 500)) / 10000; // 5% slippage

        // Approve WPLS for swap
        WPLS_TOKEN.approve(address(pulseXRouter), msg.value);

        // Swap WPLS to MORBIUS
        uint256[] memory swapResult = pulseXRouter.swapExactTokensForTokens(
            msg.value,
            minMorbiusOut,
            path,
            address(this),
            block.timestamp + 300 // 5 minute deadline
        );

        uint256 morbiusReceived = swapResult[swapResult.length - 1];

        // Update player reserve
        playerReserves[msg.sender] += morbiusReceived;
        totalReserves += morbiusReceived;

        emit Deposit(msg.sender, morbiusReceived, msg.value);
    }

    /**
     * @notice Deposit MORBIUS directly (no swap needed)
     * @param amount Amount of MORBIUS to deposit
     */
    function depositMORBIUS(uint256 amount) external nonReentrant whenNotPaused {
        require(amount >= MIN_DEPOSIT, "Deposit too small");
        require(!emergencyPaused, "Emergency pause active");

        // Transfer MORBIUS from user
        MORBIUS_TOKEN.safeTransferFrom(msg.sender, address(this), amount);

        // Update player reserve
        playerReserves[msg.sender] += amount;
        totalReserves += amount;

        emit DepositMORBIUS(msg.sender, amount);
    }

    /**
     * @notice Withdraw MORBIUS from reserve
     * @param amount Amount of MORBIUS to withdraw
     */
    function withdraw(uint256 amount) external nonReentrant whenNotPaused {
        require(amount >= MIN_WITHDRAWAL, "Withdrawal too small");
        require(playerReserves[msg.sender] >= amount, "Insufficient reserve");
        require(!emergencyPaused, "Emergency pause active");

        // Check daily withdrawal limit
        uint256 today = block.timestamp / 86400; // Days since epoch
        require(dailyWithdrawals[msg.sender][today] + amount <= MAX_DAILY_WITHDRAWAL, "Daily withdrawal limit exceeded");
        require(dailyWithdrawalTotals[today] + amount <= MAX_DAILY_WITHDRAWAL * 10, "Global daily limit exceeded");

        // Update daily limits
        dailyWithdrawals[msg.sender][today] += amount;
        dailyWithdrawalTotals[today] += amount;

        // Update reserves
        playerReserves[msg.sender] -= amount;
        totalReserves -= amount;

        // Transfer MORBIUS to user
        MORBIUS_TOKEN.safeTransfer(msg.sender, amount);

        emit Withdrawal(msg.sender, amount);
    }

    /**
     * @notice Place a bet and lock funds for a game
     * @param gameHash Hash of game data (serverSeedHash + clientSeed + betAmount + nonce)
     * @param betAmount Amount to bet (must match gameHash)
     */
    function placeBet(bytes32 gameHash, uint256 betAmount) external nonReentrant whenNotPaused {
        require(betAmount > 0, "Bet amount must be greater than 0");
        require(!emergencyPaused, "Emergency pause active");
        require(playerReserves[msg.sender] >= betAmount, "Insufficient reserve");
        require(pendingGames[gameHash].player == address(0), "Game hash already used");

        // Lock the bet amount from player's reserve
        playerReserves[msg.sender] -= betAmount;
        totalReserves -= betAmount;

        // Store pending game
        pendingGames[gameHash] = PendingGame({
            player: msg.sender,
            betAmount: betAmount,
            timestamp: block.timestamp,
            settled: false
        });

        // Track pending games for this player
        playerPendingGames[msg.sender].push(gameHash);

        emit BetPlaced(msg.sender, gameHash, betAmount, block.timestamp);
    }

    /**
     * @notice Settle game result (only callable by authorized server)
     * @param player Player address
     * @param amount Settlement amount (positive = win, negative = loss)
     * @param gameHash Game hash for verification (must match placed bet)
     * @param gameData Encoded game data for verification
     */
    function settleGame(
        address player,
        int256 amount,
        bytes32 gameHash,
        bytes memory gameData
    ) external onlyAuthorizedServer nonReentrant {
        require(!emergencyPaused, "Emergency pause active");
        
        // Verify pending game exists and matches
        PendingGame storage pendingGame = pendingGames[gameHash];
        require(pendingGame.player == player, "Game hash mismatch");
        require(!pendingGame.settled, "Game already settled");

        // Mark as settled
        pendingGame.settled = true;

        if (amount > 0) {
            // Player win - amount represents total payout (bet + profit)
            // Bet was already locked, so we need to return bet + pay profit
            uint256 totalPayout = uint256(amount);
            require(totalPayout >= pendingGame.betAmount, "Payout less than bet");
            
            // Calculate profit (payout - bet)
            uint256 profit = totalPayout - pendingGame.betAmount;
            
            // Apply house edge to profit only (not the bet return)
            uint256 houseEdge = (profit * HOUSE_EDGE_BPS) / BPS_DENOMINATOR;
            uint256 netProfit = profit - houseEdge;
            
            // Total to add: bet back + net profit
            uint256 totalToAdd = pendingGame.betAmount + netProfit;

            // Pay from contract balance (should have enough from deposits)
            require(MORBIUS_TOKEN.balanceOf(address(this)) >= totalToAdd, "Insufficient contract balance");

            playerReserves[player] += totalToAdd;
            totalReserves += totalToAdd;
        } else if (amount < 0) {
            // Player loss - bet was already locked, no additional deduction needed
            // The locked bet amount is already deducted from reserves
            uint256 lossAmount = uint256(-amount);
            require(lossAmount == pendingGame.betAmount, "Loss amount must match locked bet");
        } else {
            // amount == 0 is a push - return locked bet
            playerReserves[player] += pendingGame.betAmount;
            totalReserves += pendingGame.betAmount;
        }

        emit GameSettled(player, amount, gameHash);
    }

    /**
     * @notice Reveal server seed for game verification
     * @param serverSeed The actual server seed to reveal
     */
    function revealServerSeed(bytes32 serverSeed) external {
        bytes32 seedHash = keccak256(abi.encodePacked(serverSeed));
        require(!revealedSeeds[seedHash], "Seed already revealed");

        revealedSeeds[seedHash] = true;
        emit ServerSeedRevealed(seedHash, serverSeed);
    }

    // ============ Fallback Functions ============

    /**
     * @notice Accept PLS deposits (forwards to deposit function)
     */
    receive() external payable {
        if (msg.value > 0) {
            // Wrap PLS to WPLS
            WPLS_TOKEN.deposit{value: msg.value}();

            // Calculate MORBIUS amount to receive (with slippage protection)
            uint256 wplsBalance = WPLS_TOKEN.balanceOf(address(this));
            address[] memory path = new address[](2);
            path[0] = address(WPLS_TOKEN);
            path[1] = address(MORBIUS_TOKEN);

            uint256[] memory amounts = pulseXRouter.getAmountsIn(msg.value, path);
            uint256 minMorbiusOut = (amounts[amounts.length - 1] * (10000 - 500)) / 10000; // 5% slippage

            // Approve WPLS for swap
            WPLS_TOKEN.approve(address(pulseXRouter), msg.value);

            // Swap WPLS to MORBIUS
            uint256[] memory swapResult = pulseXRouter.swapExactTokensForTokens(
                msg.value,
                minMorbiusOut,
                path,
                address(this),
                block.timestamp + 300 // 5 minute deadline
            );

            uint256 morbiusReceived = swapResult[swapResult.length - 1];

            // Update player reserve
            playerReserves[msg.sender] += morbiusReceived;
            totalReserves += morbiusReceived;

            emit Deposit(msg.sender, morbiusReceived, msg.value);
        }
    }

    // ============ View Functions ============

    /**
     * @notice Get player's MORBIUS reserve balance
     */
    function getPlayerReserve(address player) external view returns (uint256) {
        return playerReserves[player];
    }

    /**
     * @notice Get pending game information
     * @param gameHash Game hash to look up
     * @return player Player address
     * @return betAmount Locked bet amount
     * @return timestamp When bet was placed
     * @return settled Whether game has been settled
     */
    function getPendingGame(bytes32 gameHash) external view returns (
        address player,
        uint256 betAmount,
        uint256 timestamp,
        bool settled
    ) {
        PendingGame memory game = pendingGames[gameHash];
        return (game.player, game.betAmount, game.timestamp, game.settled);
    }

    /**
     * @notice Get count of pending games for a player
     * @param player Player address
     * @return count Number of pending games
     */
    function getPendingGamesCount(address player) external view returns (uint256) {
        return playerPendingGames[player].length;
    }

    /**
     * @notice Get pending game hash at index for a player
     * @param player Player address
     * @param index Index in the pending games array
     * @return gameHash Game hash
     */
    function getPendingGameHash(address player, uint256 index) external view returns (bytes32) {
        require(index < playerPendingGames[player].length, "Index out of bounds");
        return playerPendingGames[player][index];
    }

    /**
     * @notice Check if a server seed has been revealed
     */
    function isSeedRevealed(bytes32 seedHash) external view returns (bool) {
        return revealedSeeds[seedHash];
    }

    /**
     * @notice Get daily withdrawal info for a player
     */
    function getDailyWithdrawalInfo(address player) external view returns (
        uint256 today,
        uint256 playerWithdrawnToday,
        uint256 totalWithdrawnToday
    ) {
        today = block.timestamp / 86400;
        playerWithdrawnToday = dailyWithdrawals[player][today];
        totalWithdrawnToday = dailyWithdrawalTotals[today];
    }

    // ============ Admin Functions ============

    /**
     * @notice Update authorized server address
     */
    function setAuthorizedServer(address _server) external onlyOwner {
        emit AuthorizedServerUpdated(authorizedServer, _server);
        authorizedServer = _server;
    }

    /**
     * @notice Update emergency admin address
     */
    function setEmergencyAdmin(address _admin) external onlyOwner {
        emit EmergencyAdminUpdated(emergencyAdmin, _admin);
        emergencyAdmin = _admin;
    }

    /**
     * @notice Emergency pause all deposits/withdrawals
     */
    function setEmergencyPause(bool _paused) external onlyEmergencyAdmin {
        emergencyPaused = _paused;
    }

    /**
     * @notice Emergency withdraw MORBIUS (only in emergency situations)
     */
    function emergencyWithdraw(uint256 amount) external onlyEmergencyAdmin {
        require(emergencyPaused, "Must be emergency paused");
        require(amount <= MORBIUS_TOKEN.balanceOf(address(this)) - totalReserves, "Cannot withdraw from player reserves");

        MORBIUS_TOKEN.safeTransfer(emergencyAdmin, amount);
    }

    /**
     * @notice Standard contract pause/unpause
     */
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}