// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IWrappedPulseV2 is IERC20 {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}

interface IPulseXRouterV2 {
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

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);
}

/**
 * @title Blackjack Reserve System V2
 * @notice Hybrid blackjack game with reserve-based deposits/withdrawals
 * @dev Security fixes over V1:
 *      - receive() reverts (force use of deposit())
 *      - totalOffChainPayouts tracking for accurate reserve accounting
 *      - getAmountsIn → getAmountsOut for correct slippage calculation
 *      - emergencyWithdraw accounts for off-chain payouts
 */
contract BlackjackV2 is Ownable, ReentrancyGuard, Pausable {
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

    // House edge for settlements (10% of winnings)
    uint256 public constant HOUSE_EDGE_BPS = 1000; // 10%

    // Minimum deposit/withdrawal amounts
    uint256 public constant MIN_DEPOSIT = 1e18;     // 1 MORBIUS
    uint256 public constant MIN_WITHDRAWAL = 1e18;  // 1 MORBIUS

    // Maximum daily withdrawal limit (anti-fraud)
    uint256 public constant MAX_DAILY_WITHDRAWAL = 1000000e18; // 1,000,000 MORBIUS

    // Authorized server for settlements
    address public authorizedServer;

    // Emergency admin
    address public emergencyAdmin;

    // ============ Immutable State ============

    IERC20 public immutable MORBIUS_TOKEN;
    IWrappedPulseV2 public immutable WPLS_TOKEN;
    IPulseXRouterV2 public immutable pulseXRouter;

    // ============ Mutable State ============

    // Player reserves (MORBIUS only)
    mapping(address => uint256) public playerReserves;

    // Total MORBIUS in reserves
    uint256 public totalReserves;

    // Total off-chain payouts (withdrawals from off-chain winnings where reserves were 0)
    uint256 public totalOffChainPayouts;

    // Daily withdrawal tracking (for fraud prevention)
    mapping(address => mapping(uint256 => uint256)) public dailyWithdrawals;
    mapping(uint256 => uint256) public dailyWithdrawalTotals;

    // Provably fair verification
    mapping(bytes32 => bool) public revealedSeeds;

    // Pending games (locked bets)
    mapping(bytes32 => PendingGame) public pendingGames;
    mapping(address => bytes32[]) public playerPendingGames;

    // Emergency pause
    bool public emergencyPaused;

    // Used nonces for signature-based withdrawals (prevents replay attacks)
    mapping(uint256 => bool) public usedNonces;

    // Withdrawal fees: percentage of requested (gross) amount; user receives net = amount - distributionFee - platformFee
    uint256 public distributionFeeBps;           // 0–2000 (0%–20%), default 250 (2.5%)
    address public distributionRecipient;        // receives distribution fee (e.g. MORBIUS holder distributor)
    uint256 public platformFeeBps;               // 0–2000 (0%–20%), default 250 (2.5%)
    address public platformFeeRecipient;         // receives platform fee
    uint256 public totalDistributionFeesCollected;
    uint256 public totalPlatformFeesCollected;

    // PLS deposit fee: percentage of PLS skimmed before swap, sent as raw PLS to recipient
    uint256 public plsDepositFeeBps;             // 0–2000 (0%–20%), default 150 (1.5%)
    address public plsDepositFeeRecipient;       // receives PLS deposit fee
    uint256 public totalPlsDepositFeesCollected;

    // EIP-712 Domain Separator
    bytes32 public immutable DOMAIN_SEPARATOR;

    // EIP-712 TypeHash for WithdrawApproval
    bytes32 public constant WITHDRAW_APPROVAL_TYPEHASH = keccak256(
        "WithdrawApproval(address player,uint256 amount,uint256 nonce)"
    );

    // ============ Structs ============

    struct PendingGame {
        address player;
        uint256 betAmount;
        uint256 timestamp;
        bool settled;
    }

    // ============ Events ============

    event Deposit(address indexed player, uint256 morbiusAmount, uint256 plsAmount);
    event DepositMORBIUS(address indexed player, uint256 amount);
    event Withdrawal(address indexed player, uint256 amount);
    event GameSettled(address indexed player, int256 amount, bytes32 indexed gameHash);
    event ServerSeedRevealed(bytes32 indexed serverSeedHash, bytes32 serverSeed);
    event BetPlaced(address indexed player, bytes32 indexed gameHash, uint256 betAmount, uint256 timestamp);
    event AuthorizedServerUpdated(address indexed oldServer, address indexed newServer);
    event EmergencyAdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event DistributionFeeUpdated(uint256 oldBps, uint256 newBps);
    event DistributionRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event PlatformFeeUpdated(uint256 oldBps, uint256 newBps);
    event PlatformFeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event WithdrawalFeesCollected(address indexed player, uint256 amount, uint256 distributionFee, uint256 platformFee, uint256 netToUser);
    event PlsDepositFeeCollected(address indexed player, uint256 plsAmount, uint256 feeAmount);
    event PlsDepositFeeUpdated(uint256 oldBps, uint256 newBps);
    event PlsDepositFeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    constructor(
        address _initialOwner,
        address _morbiusToken,
        address _wplsToken,
        address _pulseXRouter,
        address _authorizedServer,
        address _emergencyAdmin,
        address _distributionRecipient,
        address _platformFeeRecipient
    ) Ownable(_initialOwner) {
        MORBIUS_TOKEN = IERC20(_morbiusToken);
        WPLS_TOKEN = IWrappedPulseV2(_wplsToken);
        pulseXRouter = IPulseXRouterV2(_pulseXRouter);
        authorizedServer = _authorizedServer;
        emergencyAdmin = _emergencyAdmin;

        distributionFeeBps = 250; // 2.5%
        distributionRecipient = _distributionRecipient;
        platformFeeBps = 250; // 2.5%
        platformFeeRecipient = _platformFeeRecipient;
        plsDepositFeeBps = 150; // 1.5%
        plsDepositFeeRecipient = _platformFeeRecipient;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("Blackjack")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    // ============ Internal Helpers ============

    function _computeWithdrawalFees(uint256 amount) internal view returns (uint256 netToUser, uint256 feeDistribution, uint256 feePlatform) {
        feeDistribution = (amount * distributionFeeBps) / BPS_DENOMINATOR;
        feePlatform = (amount * platformFeeBps) / BPS_DENOMINATOR;
        netToUser = amount - feeDistribution - feePlatform;
    }

    // ============ External Functions ============

    /**
     * @notice Deposit PLS and automatically swap to MORBIUS
     * @dev PLS is wrapped to WPLS, then swapped to MORBIUS via PulseX.
     *      A configurable PLS fee is skimmed before the swap and sent to plsDepositFeeRecipient.
     */
    function deposit() external payable nonReentrant whenNotPaused {
        require(msg.value >= MIN_DEPOSIT, "Deposit too small");
        require(!emergencyPaused, "Emergency pause active");

        // Skim PLS deposit fee before swap
        uint256 plsFee = (msg.value * plsDepositFeeBps) / BPS_DENOMINATOR;
        uint256 swapAmount = msg.value - plsFee;

        if (plsFee > 0 && plsDepositFeeRecipient != address(0)) {
            (bool sent, ) = plsDepositFeeRecipient.call{value: plsFee}("");
            require(sent, "PLS fee transfer failed");
            totalPlsDepositFeesCollected += plsFee;
            emit PlsDepositFeeCollected(msg.sender, msg.value, plsFee);
        }

        // Wrap remaining PLS to WPLS
        WPLS_TOKEN.deposit{value: swapAmount}();

        // Calculate minimum MORBIUS output (with slippage protection)
        address[] memory path = new address[](2);
        path[0] = address(WPLS_TOKEN);
        path[1] = address(MORBIUS_TOKEN);

        uint256[] memory amounts = pulseXRouter.getAmountsOut(swapAmount, path);
        uint256 minMorbiusOut = (amounts[amounts.length - 1] * (10000 - 500)) / 10000; // 5% slippage

        // Approve WPLS for swap
        WPLS_TOKEN.approve(address(pulseXRouter), swapAmount);

        // Swap WPLS to MORBIUS
        uint256[] memory swapResult = pulseXRouter.swapExactTokensForTokens(
            swapAmount,
            minMorbiusOut,
            path,
            address(this),
            block.timestamp + 300
        );

        uint256 morbiusReceived = swapResult[swapResult.length - 1];

        playerReserves[msg.sender] += morbiusReceived;
        totalReserves += morbiusReceived;

        emit Deposit(msg.sender, morbiusReceived, msg.value);
    }

    /**
     * @notice Deposit MORBIUS directly (no swap needed)
     */
    function depositMORBIUS(uint256 amount) external nonReentrant whenNotPaused {
        require(amount >= MIN_DEPOSIT, "Deposit too small");
        require(!emergencyPaused, "Emergency pause active");

        MORBIUS_TOKEN.safeTransferFrom(msg.sender, address(this), amount);

        playerReserves[msg.sender] += amount;
        totalReserves += amount;

        emit DepositMORBIUS(msg.sender, amount);
    }

    /**
     * @notice Withdraw MORBIUS from reserve. Amount is gross (requested); fees are deducted and sent to distribution/platform; user receives net.
     */
    function withdraw(uint256 amount) external nonReentrant whenNotPaused {
        require(amount >= MIN_WITHDRAWAL, "Withdrawal too small");
        require(playerReserves[msg.sender] >= amount, "Insufficient reserve");
        require(!emergencyPaused, "Emergency pause active");

        uint256 today = block.timestamp / 86400;
        require(dailyWithdrawals[msg.sender][today] + amount <= MAX_DAILY_WITHDRAWAL, "Daily withdrawal limit exceeded");
        require(dailyWithdrawalTotals[today] + amount <= MAX_DAILY_WITHDRAWAL * 10, "Global daily limit exceeded");

        (uint256 netToUser, uint256 feeDistribution, uint256 feePlatform) = _computeWithdrawalFees(amount);

        dailyWithdrawals[msg.sender][today] += amount;
        dailyWithdrawalTotals[today] += amount;

        playerReserves[msg.sender] -= amount;
        totalReserves -= amount;

        require(MORBIUS_TOKEN.balanceOf(address(this)) >= amount, "Insufficient contract balance");

        MORBIUS_TOKEN.safeTransfer(msg.sender, netToUser);
        if (feeDistribution > 0 && distributionRecipient != address(0)) {
            MORBIUS_TOKEN.safeTransfer(distributionRecipient, feeDistribution);
            totalDistributionFeesCollected += feeDistribution;
        }
        if (feePlatform > 0 && platformFeeRecipient != address(0)) {
            MORBIUS_TOKEN.safeTransfer(platformFeeRecipient, feePlatform);
            totalPlatformFeesCollected += feePlatform;
        }

        emit Withdrawal(msg.sender, amount);
        emit WithdrawalFeesCollected(msg.sender, amount, feeDistribution, feePlatform, netToUser);
    }

    /**
     * @notice Withdraw MORBIUS with server signature (for off-chain balance withdrawals). Amount is gross; fees deducted same as withdraw().
     * @dev V2 fix: tracks totalOffChainPayouts when withdrawing beyond reserves
     */
    function withdrawWithSignature(
        uint256 amount,
        uint256 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant whenNotPaused {
        require(amount >= MIN_WITHDRAWAL, "Withdrawal too small");
        require(!emergencyPaused, "Emergency pause active");
        require(!usedNonces[nonce], "Nonce already used");

        // Verify signature from authorized server
        bytes32 structHash = keccak256(
            abi.encode(WITHDRAW_APPROVAL_TYPEHASH, msg.sender, amount, nonce)
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );
        address signer = ecrecover(digest, v, r, s);
        require(signer == authorizedServer, "Invalid signature");

        usedNonces[nonce] = true;

        uint256 today = block.timestamp / 86400;
        require(dailyWithdrawals[msg.sender][today] + amount <= MAX_DAILY_WITHDRAWAL, "Daily withdrawal limit exceeded");
        require(dailyWithdrawalTotals[today] + amount <= MAX_DAILY_WITHDRAWAL * 10, "Global daily limit exceeded");

        (uint256 netToUser, uint256 feeDistribution, uint256 feePlatform) = _computeWithdrawalFees(amount);

        dailyWithdrawals[msg.sender][today] += amount;
        dailyWithdrawalTotals[today] += amount;

        // V2 fix: track off-chain payouts for accurate accounting
        if (playerReserves[msg.sender] >= amount) {
            playerReserves[msg.sender] -= amount;
            totalReserves -= amount;
        } else {
            // Partial or full off-chain withdrawal
            uint256 fromReserve = playerReserves[msg.sender];
            uint256 fromOffChain = amount - fromReserve;
            if (fromReserve > 0) {
                totalReserves -= fromReserve;
                playerReserves[msg.sender] = 0;
            }
            totalOffChainPayouts += fromOffChain;
        }

        require(MORBIUS_TOKEN.balanceOf(address(this)) >= amount, "Insufficient contract balance");

        MORBIUS_TOKEN.safeTransfer(msg.sender, netToUser);
        if (feeDistribution > 0 && distributionRecipient != address(0)) {
            MORBIUS_TOKEN.safeTransfer(distributionRecipient, feeDistribution);
            totalDistributionFeesCollected += feeDistribution;
        }
        if (feePlatform > 0 && platformFeeRecipient != address(0)) {
            MORBIUS_TOKEN.safeTransfer(platformFeeRecipient, feePlatform);
            totalPlatformFeesCollected += feePlatform;
        }

        emit Withdrawal(msg.sender, amount);
        emit WithdrawalFeesCollected(msg.sender, amount, feeDistribution, feePlatform, netToUser);
    }

    /**
     * @notice Place a bet and lock funds for a game. No fees on bets; fees apply only on withdrawals.
     */
    function placeBet(bytes32 gameHash, uint256 betAmount) external nonReentrant whenNotPaused {
        require(betAmount > 0, "Bet amount must be greater than 0");
        require(!emergencyPaused, "Emergency pause active");
        require(playerReserves[msg.sender] >= betAmount, "Insufficient reserve");
        require(pendingGames[gameHash].player == address(0), "Game hash already used");

        playerReserves[msg.sender] -= betAmount;
        totalReserves -= betAmount;

        pendingGames[gameHash] = PendingGame({
            player: msg.sender,
            betAmount: betAmount,
            timestamp: block.timestamp,
            settled: false
        });

        playerPendingGames[msg.sender].push(gameHash);

        emit BetPlaced(msg.sender, gameHash, betAmount, block.timestamp);
    }

    /**
     * @notice Settle game result (only callable by authorized server)
     */
    function settleGame(
        address player,
        int256 amount,
        bytes32 gameHash,
        bytes memory gameData
    ) external onlyAuthorizedServer nonReentrant {
        require(!emergencyPaused, "Emergency pause active");

        PendingGame storage pendingGame = pendingGames[gameHash];
        require(pendingGame.player == player, "Game hash mismatch");
        require(!pendingGame.settled, "Game already settled");

        pendingGame.settled = true;

        if (amount > 0) {
            uint256 totalPayout = uint256(amount);
            require(totalPayout >= pendingGame.betAmount, "Payout less than bet");

            uint256 profit = totalPayout - pendingGame.betAmount;
            uint256 houseEdge = (profit * HOUSE_EDGE_BPS) / BPS_DENOMINATOR;
            uint256 netProfit = profit - houseEdge;
            uint256 totalToAdd = pendingGame.betAmount + netProfit;

            require(MORBIUS_TOKEN.balanceOf(address(this)) >= totalToAdd, "Insufficient contract balance");

            playerReserves[player] += totalToAdd;
            totalReserves += totalToAdd;
        } else if (amount < 0) {
            uint256 lossAmount = uint256(-amount);
            require(lossAmount == pendingGame.betAmount, "Loss amount must match locked bet");
        } else {
            playerReserves[player] += pendingGame.betAmount;
            totalReserves += pendingGame.betAmount;
        }

        emit GameSettled(player, amount, gameHash);
    }

    /**
     * @notice Reveal server seed for game verification
     */
    function revealServerSeed(bytes32 serverSeed) external {
        bytes32 seedHash = keccak256(abi.encodePacked(serverSeed));
        require(!revealedSeeds[seedHash], "Seed already revealed");

        revealedSeeds[seedHash] = true;
        emit ServerSeedRevealed(seedHash, serverSeed);
    }

    // ============ Fallback Functions ============

    /**
     * @notice V2 fix: receive() reverts to force use of deposit()
     * @dev Prevents unaccounted PLS from entering the contract
     */
    receive() external payable {
        revert("Use deposit() to add funds");
    }

    // ============ View Functions ============

    function getPlayerReserve(address player) external view returns (uint256) {
        return playerReserves[player];
    }

    function getPendingGame(bytes32 gameHash) external view returns (
        address player,
        uint256 betAmount,
        uint256 timestamp,
        bool settled
    ) {
        PendingGame memory game = pendingGames[gameHash];
        return (game.player, game.betAmount, game.timestamp, game.settled);
    }

    function getPendingGamesCount(address player) external view returns (uint256) {
        return playerPendingGames[player].length;
    }

    function getPendingGameHash(address player, uint256 index) external view returns (bytes32) {
        require(index < playerPendingGames[player].length, "Index out of bounds");
        return playerPendingGames[player][index];
    }

    function isSeedRevealed(bytes32 seedHash) external view returns (bool) {
        return revealedSeeds[seedHash];
    }

    function getDailyWithdrawalInfo(address player) external view returns (
        uint256 today,
        uint256 playerWithdrawnToday,
        uint256 totalWithdrawnToday
    ) {
        today = block.timestamp / 86400;
        playerWithdrawnToday = dailyWithdrawals[player][today];
        totalWithdrawnToday = dailyWithdrawalTotals[today];
    }

    /**
     * @notice Get net amount and fee breakdown for a given gross withdrawal amount
     */
    function getWithdrawalNet(uint256 amount) external view returns (
        uint256 netToUser,
        uint256 feeDistribution,
        uint256 feePlatform
    ) {
        return _computeWithdrawalFees(amount);
    }

    // ============ Admin Functions ============

    function setAuthorizedServer(address _server) external onlyOwner {
        emit AuthorizedServerUpdated(authorizedServer, _server);
        authorizedServer = _server;
    }

    function setEmergencyAdmin(address _admin) external onlyOwner {
        emit EmergencyAdminUpdated(emergencyAdmin, _admin);
        emergencyAdmin = _admin;
    }

    function setDistributionFee(uint256 _distributionFeeBps) external onlyOwner {
        require(_distributionFeeBps <= 2000, "Distribution fee cannot exceed 20%");
        emit DistributionFeeUpdated(distributionFeeBps, _distributionFeeBps);
        distributionFeeBps = _distributionFeeBps;
    }

    function setDistributionRecipient(address _distributionRecipient) external onlyOwner {
        emit DistributionRecipientUpdated(distributionRecipient, _distributionRecipient);
        distributionRecipient = _distributionRecipient;
    }

    function setPlatformFee(uint256 _platformFeeBps) external onlyOwner {
        require(_platformFeeBps <= 2000, "Platform fee cannot exceed 20%");
        emit PlatformFeeUpdated(platformFeeBps, _platformFeeBps);
        platformFeeBps = _platformFeeBps;
    }

    function setPlatformFeeRecipient(address _platformFeeRecipient) external onlyOwner {
        emit PlatformFeeRecipientUpdated(platformFeeRecipient, _platformFeeRecipient);
        platformFeeRecipient = _platformFeeRecipient;
    }

    function setPlsDepositFee(uint256 _plsDepositFeeBps) external onlyOwner {
        require(_plsDepositFeeBps <= 2000, "PLS deposit fee cannot exceed 20%");
        emit PlsDepositFeeUpdated(plsDepositFeeBps, _plsDepositFeeBps);
        plsDepositFeeBps = _plsDepositFeeBps;
    }

    function setPlsDepositFeeRecipient(address _plsDepositFeeRecipient) external onlyOwner {
        emit PlsDepositFeeRecipientUpdated(plsDepositFeeRecipient, _plsDepositFeeRecipient);
        plsDepositFeeRecipient = _plsDepositFeeRecipient;
    }

    function setEmergencyPause(bool _paused) external onlyEmergencyAdmin {
        emergencyPaused = _paused;
    }

    /**
     * @notice Emergency withdraw MORBIUS (only in emergency situations)
     * @dev V2 fix: accounts for totalOffChainPayouts in protected amount calculation
     */
    function emergencyWithdraw(uint256 amount) external onlyEmergencyAdmin {
        require(emergencyPaused, "Must be emergency paused");
        // Protect player reserves. Off-chain payouts have already left the contract,
        // so they don't need to be protected (those tokens are gone).
        require(amount <= MORBIUS_TOKEN.balanceOf(address(this)) - totalReserves, "Cannot withdraw from player reserves");

        MORBIUS_TOKEN.safeTransfer(emergencyAdmin, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
