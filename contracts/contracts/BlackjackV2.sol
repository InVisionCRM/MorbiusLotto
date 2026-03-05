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

    // PLS treasury (receives all PLS from PLS-based deposits; no on-chain swap)
    address public plsTreasury;

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

    // Withdrawal fees: percentage of requested (gross) amount; user receives net = amount - distributionFee - burnFee - platformFee - lpDistributionFee
    uint256 public distributionFeeBps;           // 0–2000 (0%–20%), default 125 (1.25%) — MORBIUS holders
    address public distributionRecipient;        // receives distribution fee (e.g. MORBIUS holder distributor)
    uint256 public burnFeeBps;                   // 0–2000 (0%–20%), default 50 (0.5%) — burned
    address public burnAddress;                  // receives burned tokens
    uint256 public platformFeeBps;               // 0–2000 (0%–20%), default 175 (1.75%) — house
    address public platformFeeRecipient;         // receives platform fee
    uint256 public lpDistributionFeeBps;         // 0–2000 (0%–20%), default 150 (1.5%) — LP holders
    address public lpDistributionRecipient;      // receives LP distribution fee
    uint256 public totalDistributionFeesCollected;
    uint256 public totalBurnFeesCollected;
    uint256 public totalPlatformFeesCollected;
    uint256 public totalLpDistributionFeesCollected;

    // EIP-712 Domain Separator
    bytes32 public immutable DOMAIN_SEPARATOR;

    // EIP-712 TypeHash for WithdrawApproval
    bytes32 public constant WITHDRAW_APPROVAL_TYPEHASH = keccak256(
        "WithdrawApproval(address player,uint256 amount,uint256 nonce,uint256 expiryTimestamp)"
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
    event BurnFeeUpdated(uint256 oldBps, uint256 newBps);
    event BurnAddressUpdated(address indexed oldAddress, address indexed newAddress);
    event PlatformFeeUpdated(uint256 oldBps, uint256 newBps);
    event PlatformFeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event LpDistributionFeeUpdated(uint256 oldBps, uint256 newBps);
    event LpDistributionRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event WithdrawalFeesCollected(address indexed player, uint256 amount, uint256 distributionFee, uint256 burnFee, uint256 platformFee, uint256 lpDistributionFee, uint256 netToUser);

    constructor(
        address _initialOwner,
        address _morbiusToken,
        address _wplsToken,
        address _pulseXRouter,
        address _authorizedServer,
        address _emergencyAdmin,
        address _distributionRecipient,
        address _burnAddress,
        address _platformFeeRecipient,
        address _lpDistributionRecipient,
        address _plsTreasury
    ) Ownable(_initialOwner) {
        require(_burnAddress != address(0), "Invalid burn address");
        require(_lpDistributionRecipient != address(0), "Invalid LP distribution recipient");
        require(_plsTreasury != address(0), "Invalid treasury address");
        MORBIUS_TOKEN = IERC20(_morbiusToken);
        WPLS_TOKEN = IWrappedPulseV2(_wplsToken);
        pulseXRouter = IPulseXRouterV2(_pulseXRouter);
        authorizedServer = _authorizedServer;
        emergencyAdmin = _emergencyAdmin;
        plsTreasury = _plsTreasury;

        distributionFeeBps = 125; // 1.25% to MORBIUS holders
        distributionRecipient = _distributionRecipient;
        burnFeeBps = 50;          // 0.5% burned
        burnAddress = _burnAddress;
        platformFeeBps = 175;     // 1.75% to house
        platformFeeRecipient = _platformFeeRecipient;
        lpDistributionFeeBps = 150; // 1.5% to LP holders
        lpDistributionRecipient = _lpDistributionRecipient;
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

    function _computeWithdrawalFees(uint256 amount) internal view returns (uint256 netToUser, uint256 feeDistribution, uint256 feeBurn, uint256 feePlatform, uint256 feeLpDistribution) {
        feeDistribution = (amount * distributionFeeBps) / BPS_DENOMINATOR;
        feeBurn = (amount * burnFeeBps) / BPS_DENOMINATOR;
        feePlatform = (amount * platformFeeBps) / BPS_DENOMINATOR;
        feeLpDistribution = (amount * lpDistributionFeeBps) / BPS_DENOMINATOR;
        netToUser = amount - feeDistribution - feeBurn - feePlatform - feeLpDistribution;
    }

    // ============ External Functions ============

    /**
     * @notice Deposit PLS — PLS is sent to treasury, MORBIUS equivalent credited via PulseX spot price.
     * @dev No on-chain swap. PulseX is used only for price discovery. Treasury must fund
     *      the contract with MORBIUS separately to cover payouts.
     */
    function deposit() external payable nonReentrant whenNotPaused {
        require(msg.value >= MIN_DEPOSIT, "Deposit too small");
        require(!emergencyPaused, "Emergency pause active");

        // Price discovery via PulseX spot rate (no swap)
        address[] memory path = new address[](2);
        path[0] = address(WPLS_TOKEN);
        path[1] = address(MORBIUS_TOKEN);

        uint256[] memory amounts = pulseXRouter.getAmountsOut(msg.value, path);
        uint256 morbiusEquivalent = amounts[amounts.length - 1];
        require(morbiusEquivalent > 0, "Price query failed");

        // Send PLS to treasury (no wrapping, no swap)
        (bool sent, ) = plsTreasury.call{value: msg.value}("");
        require(sent, "PLS transfer to treasury failed");

        playerReserves[msg.sender] += morbiusEquivalent;
        totalReserves += morbiusEquivalent;

        emit Deposit(msg.sender, morbiusEquivalent, msg.value);
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

        (uint256 netToUser, uint256 feeDistribution, uint256 feeBurn, uint256 feePlatform, uint256 feeLpDistribution) = _computeWithdrawalFees(amount);

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
        if (feeBurn > 0 && burnAddress != address(0)) {
            MORBIUS_TOKEN.safeTransfer(burnAddress, feeBurn);
            totalBurnFeesCollected += feeBurn;
        }
        if (feePlatform > 0 && platformFeeRecipient != address(0)) {
            MORBIUS_TOKEN.safeTransfer(platformFeeRecipient, feePlatform);
            totalPlatformFeesCollected += feePlatform;
        }
        if (feeLpDistribution > 0 && lpDistributionRecipient != address(0)) {
            MORBIUS_TOKEN.safeTransfer(lpDistributionRecipient, feeLpDistribution);
            totalLpDistributionFeesCollected += feeLpDistribution;
        }

        emit Withdrawal(msg.sender, amount);
        emit WithdrawalFeesCollected(msg.sender, amount, feeDistribution, feeBurn, feePlatform, feeLpDistribution, netToUser);
    }

    /**
     * @notice Withdraw MORBIUS with server signature (for off-chain balance withdrawals). Amount is gross; fees deducted same as withdraw().
     * @dev V2 fix: tracks totalOffChainPayouts when withdrawing beyond reserves
     */
    function withdrawWithSignature(
        uint256 amount,
        uint256 nonce,
        uint256 expiryTimestamp,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant whenNotPaused {
        require(amount >= MIN_WITHDRAWAL, "Withdrawal too small");
        require(!emergencyPaused, "Emergency pause active");
        require(block.timestamp <= expiryTimestamp, "Signature expired");
        require(!usedNonces[nonce], "Nonce already used");

        // Verify signature from authorized server
        bytes32 structHash = keccak256(
            abi.encode(WITHDRAW_APPROVAL_TYPEHASH, msg.sender, amount, nonce, expiryTimestamp)
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "Invalid signature recovery");
        require(signer == authorizedServer, "Invalid signature");

        usedNonces[nonce] = true;

        uint256 today = block.timestamp / 86400;
        require(dailyWithdrawals[msg.sender][today] + amount <= MAX_DAILY_WITHDRAWAL, "Daily withdrawal limit exceeded");
        require(dailyWithdrawalTotals[today] + amount <= MAX_DAILY_WITHDRAWAL * 10, "Global daily limit exceeded");

        (uint256 netToUser, uint256 feeDistribution, uint256 feeBurn, uint256 feePlatform, uint256 feeLpDistribution) = _computeWithdrawalFees(amount);

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
        if (feeBurn > 0 && burnAddress != address(0)) {
            MORBIUS_TOKEN.safeTransfer(burnAddress, feeBurn);
            totalBurnFeesCollected += feeBurn;
        }
        if (feePlatform > 0 && platformFeeRecipient != address(0)) {
            MORBIUS_TOKEN.safeTransfer(platformFeeRecipient, feePlatform);
            totalPlatformFeesCollected += feePlatform;
        }
        if (feeLpDistribution > 0 && lpDistributionRecipient != address(0)) {
            MORBIUS_TOKEN.safeTransfer(lpDistributionRecipient, feeLpDistribution);
            totalLpDistributionFeesCollected += feeLpDistribution;
        }

        emit Withdrawal(msg.sender, amount);
        emit WithdrawalFeesCollected(msg.sender, amount, feeDistribution, feeBurn, feePlatform, feeLpDistribution, netToUser);
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
            require(totalPayout <= pendingGame.betAmount * 3, "Payout exceeds maximum multiplier");

            require(MORBIUS_TOKEN.balanceOf(address(this)) >= totalPayout, "Insufficient contract balance");

            playerReserves[player] += totalPayout;
            totalReserves += totalPayout;
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
        uint256 feeBurn,
        uint256 feePlatform,
        uint256 feeLpDistribution
    ) {
        return _computeWithdrawalFees(amount);
    }

    // ============ Admin Functions ============

    function setAuthorizedServer(address _server) external onlyOwner {
        require(_server != address(0), "Invalid server address");
        emit AuthorizedServerUpdated(authorizedServer, _server);
        authorizedServer = _server;
    }

    function setEmergencyAdmin(address _admin) external onlyOwner {
        require(_admin != address(0), "Invalid admin address");
        emit EmergencyAdminUpdated(emergencyAdmin, _admin);
        emergencyAdmin = _admin;
    }

    function setDistributionFee(uint256 _distributionFeeBps) external onlyOwner {
        require(_distributionFeeBps <= 2000, "Distribution fee cannot exceed 20%");
        require(_distributionFeeBps + burnFeeBps + platformFeeBps + lpDistributionFeeBps <= 3000, "Total fees cannot exceed 30%");
        emit DistributionFeeUpdated(distributionFeeBps, _distributionFeeBps);
        distributionFeeBps = _distributionFeeBps;
    }

    function setDistributionRecipient(address _distributionRecipient) external onlyOwner {
        require(_distributionRecipient != address(0), "Invalid distribution recipient");
        emit DistributionRecipientUpdated(distributionRecipient, _distributionRecipient);
        distributionRecipient = _distributionRecipient;
    }

    function setBurnFee(uint256 _burnFeeBps) external onlyOwner {
        require(_burnFeeBps <= 2000, "Burn fee cannot exceed 20%");
        require(distributionFeeBps + _burnFeeBps + platformFeeBps + lpDistributionFeeBps <= 3000, "Total fees cannot exceed 30%");
        emit BurnFeeUpdated(burnFeeBps, _burnFeeBps);
        burnFeeBps = _burnFeeBps;
    }

    function setBurnAddress(address _burnAddress) external onlyOwner {
        require(_burnAddress != address(0), "Invalid burn address");
        emit BurnAddressUpdated(burnAddress, _burnAddress);
        burnAddress = _burnAddress;
    }

    function setPlatformFee(uint256 _platformFeeBps) external onlyOwner {
        require(_platformFeeBps <= 2000, "Platform fee cannot exceed 20%");
        require(distributionFeeBps + burnFeeBps + _platformFeeBps + lpDistributionFeeBps <= 3000, "Total fees cannot exceed 30%");
        emit PlatformFeeUpdated(platformFeeBps, _platformFeeBps);
        platformFeeBps = _platformFeeBps;
    }

    function setPlatformFeeRecipient(address _platformFeeRecipient) external onlyOwner {
        require(_platformFeeRecipient != address(0), "Invalid platform fee recipient");
        emit PlatformFeeRecipientUpdated(platformFeeRecipient, _platformFeeRecipient);
        platformFeeRecipient = _platformFeeRecipient;
    }

    function setLpDistributionFee(uint256 _lpDistributionFeeBps) external onlyOwner {
        require(_lpDistributionFeeBps <= 2000, "LP distribution fee cannot exceed 20%");
        require(distributionFeeBps + burnFeeBps + platformFeeBps + _lpDistributionFeeBps <= 3000, "Total fees cannot exceed 30%");
        emit LpDistributionFeeUpdated(lpDistributionFeeBps, _lpDistributionFeeBps);
        lpDistributionFeeBps = _lpDistributionFeeBps;
    }

    function setLpDistributionRecipient(address _lpDistributionRecipient) external onlyOwner {
        require(_lpDistributionRecipient != address(0), "Invalid LP distribution recipient");
        emit LpDistributionRecipientUpdated(lpDistributionRecipient, _lpDistributionRecipient);
        lpDistributionRecipient = _lpDistributionRecipient;
    }

    function setPlsTreasury(address _plsTreasury) external onlyOwner {
        require(_plsTreasury != address(0), "Invalid treasury address");
        plsTreasury = _plsTreasury;
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
        uint256 balance = MORBIUS_TOKEN.balanceOf(address(this));
        require(balance >= totalReserves, "Balance below reserves");
        require(amount <= balance - totalReserves, "Cannot withdraw from player reserves");

        MORBIUS_TOKEN.safeTransfer(emergencyAdmin, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
