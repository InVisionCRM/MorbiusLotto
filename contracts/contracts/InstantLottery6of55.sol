// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

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
 * @title InstantLottery6of55
 * @notice Instant 6-of-55 lottery: pick 6 numbers, wager, get drawn numbers and payout in same tx.
 * @dev Fee on wager only (5%, 4-way: distribution/burn/platform/LP). No fee on payout. MORBIUS: wager to contract, fee distributed, 95% to reserve. PLS: PLS to treasury, fee pulled from treasury as MORBIUS and distributed, payout on net wager, full payout pulled from treasury to player.
 */
contract InstantLottery6of55 is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    IERC20 public immutable MORBIUS_TOKEN;
    address public immutable WPLS_TOKEN;
    IPulseXRouter public immutable pulseXRouter;

    uint8 public constant NUMBERS_PER_TICKET = 6;
    uint8 public constant MIN_NUMBER = 1;
    uint8 public constant MAX_NUMBER = 55;
    uint256 public constant BPS_DENOMINATOR = 10000;

    // Match count -> multiplier in basis points (10000 = 1x). 0->0, 1->0.5x, 2->1.5x, 3->5x, 4->15x, 5->50x, 6->100x
    uint256[7] public MULTIPLIERS_BPS = [0, 5000, 15000, 50000, 150000, 500000, 1000000];

    // ============ Mutable State ============

    address public plsTreasury;

    uint256 public distributionFeeBps;
    address public distributionRecipient;
    uint256 public burnFeeBps;
    address public burnAddress;
    uint256 public platformFeeBps;
    address public platformFeeRecipient;
    uint256 public lpDistributionFeeBps;
    address public lpDistributionRecipient;

    uint256 public minWager;
    uint256 public maxWager;
    uint256 public contractReserve;

    uint256 public playNonce;
    uint256 public totalPlays;
    uint256 public totalWagered;
    uint256 public totalPayouts;

    /// @dev Operator (e.g. backend) allowed to call resolvePlay for provably-fair server-side RNG.
    address public operator;

    /// @dev Replay protection: playId = keccak256(abi.encodePacked(player, wager, playerNumbers, nonce)).
    mapping(bytes32 => bool) public usedPlayId;

    mapping(address => uint256) public playerTotalPlays;
    mapping(address => uint256) public playerTotalWagered;
    mapping(address => uint256) public playerTotalWon;

    // ============ Events ============

    event InstantLotteryResult(
        address indexed player,
        uint8[6] playerNumbers,
        uint8[6] winningNumbers,
        uint8 matchCount,
        uint256 wager,
        uint256 grossPayout,
        uint256 netPayout
    );
    event ContractFunded(address indexed funder, uint256 amount);
    event EmergencyWithdraw(uint256 amount);
    event MinWagerUpdated(uint256 oldVal, uint256 newVal);
    event MaxWagerUpdated(uint256 oldVal, uint256 newVal);
    event MultipliersUpdated(uint256[7] newMultipliers);
    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);

    // ============ Errors ============

    error InvalidWagerAmount();
    error InsufficientReserve();
    error InvalidNumbers();
    error ExceedsReserve();
    error OnlyOperator();
    error PlayIdAlreadyUsed();

    // ============ Constructor ============

    constructor(
        address _morbiusToken,
        address _wplsToken,
        address _pulseXRouter,
        uint256 _minWager,
        uint256 _maxWager,
        address _plsTreasury,
        address _distributionRecipient,
        address _burnAddress,
        address _platformFeeRecipient,
        address _lpDistributionRecipient
    ) Ownable(msg.sender) {
        require(_plsTreasury != address(0), "Invalid treasury");
        require(_distributionRecipient != address(0), "Invalid distribution");
        require(_burnAddress != address(0), "Invalid burn");
        require(_platformFeeRecipient != address(0), "Invalid platform");
        require(_lpDistributionRecipient != address(0), "Invalid LP");
        require(_minWager > 0 && _minWager < _maxWager, "Invalid wager range");

        MORBIUS_TOKEN = IERC20(_morbiusToken);
        WPLS_TOKEN = _wplsToken;
        pulseXRouter = IPulseXRouter(_pulseXRouter);
        minWager = _minWager;
        maxWager = _maxWager;
        plsTreasury = _plsTreasury;
        distributionFeeBps = 125;
        distributionRecipient = _distributionRecipient;
        burnFeeBps = 50;
        burnAddress = _burnAddress;
        platformFeeBps = 175;
        platformFeeRecipient = _platformFeeRecipient;
        lpDistributionFeeBps = 150;
        lpDistributionRecipient = _lpDistributionRecipient;
    }

    // ============ External: Play with MORBIUS ============

    /**
     * @notice Play one instant lottery round with MORBIUS. Payout (if any) is sent same tx.
     */
    function playLottery(uint8[6] calldata numbers, uint256 wager) external whenNotPaused nonReentrant {
        if (wager < minWager || wager > maxWager) revert InvalidWagerAmount();
        _validateNumbers(numbers);

        MORBIUS_TOKEN.safeTransferFrom(msg.sender, address(this), wager);
        uint256 toReserve = _distributeWagerFees(wager);
        contractReserve += toReserve;

        totalPlays += 1;
        totalWagered += wager;
        playerTotalPlays[msg.sender] += 1;
        playerTotalWagered[msg.sender] += wager;

        uint8[6] memory winningNumbers = _generateWinningNumbers();
        uint8[6] memory sortedPlayer = _sortNumbers(_toMemory(numbers));
        uint8 matchCount = _countMatches(sortedPlayer, winningNumbers);
        uint256 multiplierBps = MULTIPLIERS_BPS[matchCount];
        uint256 grossPayout = (toReserve * multiplierBps) / BPS_DENOMINATOR;

        if (grossPayout > contractReserve) revert InsufficientReserve();
        contractReserve -= grossPayout;

        if (grossPayout > 0) {
            MORBIUS_TOKEN.safeTransfer(msg.sender, grossPayout);
            totalPayouts += grossPayout;
            playerTotalWon[msg.sender] += grossPayout;
        }

        emit InstantLotteryResult(msg.sender, numbers, winningNumbers, matchCount, wager, grossPayout, grossPayout);
    }

    // ============ External: Operator resolve (provably fair server-side RNG) ============

    /**
     * @notice Resolve a single instant lottery play with server-provided winning numbers (MORBIUS only).
     * @dev Only callable by operator. Player must have approved this contract for wager. Replay-safe via playId.
     */
    function resolvePlay(
        address player,
        uint8[6] calldata playerNumbers,
        uint256 wager,
        uint8[6] calldata winningNumbers,
        uint256 nonce
    ) external whenNotPaused nonReentrant {
        if (msg.sender != operator) revert OnlyOperator();

        bytes32 playId = keccak256(abi.encodePacked(player, wager, playerNumbers, nonce));
        if (usedPlayId[playId]) revert PlayIdAlreadyUsed();
        usedPlayId[playId] = true;

        if (wager < minWager || wager > maxWager) revert InvalidWagerAmount();
        _validateNumbers(playerNumbers);
        _validateNumbers(winningNumbers);

        MORBIUS_TOKEN.safeTransferFrom(player, address(this), wager);
        uint256 toReserve = _distributeWagerFees(wager);
        contractReserve += toReserve;

        totalPlays += 1;
        totalWagered += wager;
        playerTotalPlays[player] += 1;
        playerTotalWagered[player] += wager;

        uint8[6] memory sortedPlayer = _sortNumbers(_toMemory(playerNumbers));
        uint8[6] memory sortedWinning = _sortNumbers(_toMemory(winningNumbers));
        uint8 matchCount = _countMatches(sortedPlayer, sortedWinning);
        uint256 multiplierBps = MULTIPLIERS_BPS[matchCount];
        uint256 grossPayout = (toReserve * multiplierBps) / BPS_DENOMINATOR;

        if (grossPayout > contractReserve) revert InsufficientReserve();
        contractReserve -= grossPayout;

        if (grossPayout > 0) {
            MORBIUS_TOKEN.safeTransfer(player, grossPayout);
            totalPayouts += grossPayout;
            playerTotalWon[player] += grossPayout;
        }

        emit InstantLotteryResult(player, playerNumbers, winningNumbers, matchCount, wager, grossPayout, grossPayout);
    }

    // ============ External: Play with PLS ============

    /**
     * @notice Play one instant lottery round with PLS. PLS sent to treasury; fee (5%, 4-way) pulled from treasury as MORBIUS and distributed; payout on net wager; full payout pulled from treasury to player.
     */
    function playLotteryWithPLS(uint8[6] calldata numbers) external payable whenNotPaused nonReentrant {
        _validateNumbers(numbers);
        require(msg.value > 0, "Must send PLS");

        address[] memory path = new address[](2);
        path[0] = WPLS_TOKEN;
        path[1] = address(MORBIUS_TOKEN);
        uint256[] memory amounts = pulseXRouter.getAmountsOut(msg.value, path);
        uint256 wager = amounts[1];

        if (wager < minWager || wager > maxWager) revert InvalidWagerAmount();

        (bool sent, ) = plsTreasury.call{value: msg.value}("");
        require(sent, "PLS transfer failed");

        uint256 netWager;
        uint256 feeDist;
        uint256 feeBurn;
        uint256 feePlatform;
        uint256 feeLp;
        (netWager, feeDist, feeBurn, feePlatform, feeLp) = _computeWagerFees(wager);
        uint256 totalFee = feeDist + feeBurn + feePlatform + feeLp;
        if (totalFee > 0) {
            MORBIUS_TOKEN.safeTransferFrom(plsTreasury, address(this), totalFee);
            if (feeDist > 0) MORBIUS_TOKEN.safeTransfer(distributionRecipient, feeDist);
            if (feeBurn > 0) MORBIUS_TOKEN.safeTransfer(burnAddress, feeBurn);
            if (feePlatform > 0) MORBIUS_TOKEN.safeTransfer(platformFeeRecipient, feePlatform);
            if (feeLp > 0) MORBIUS_TOKEN.safeTransfer(lpDistributionRecipient, feeLp);
        }

        totalPlays += 1;
        totalWagered += wager;
        playerTotalPlays[msg.sender] += 1;
        playerTotalWagered[msg.sender] += wager;

        uint8[6] memory winningNumbers = _generateWinningNumbers();
        uint8[6] memory sortedPlayer = _sortNumbers(_toMemory(numbers));
        uint8 matchCount = _countMatches(sortedPlayer, winningNumbers);
        uint256 multiplierBps = MULTIPLIERS_BPS[matchCount];
        uint256 grossPayout = (netWager * multiplierBps) / BPS_DENOMINATOR;

        if (grossPayout > 0) {
            MORBIUS_TOKEN.safeTransferFrom(plsTreasury, address(this), grossPayout);
            MORBIUS_TOKEN.safeTransfer(msg.sender, grossPayout);
            totalPayouts += grossPayout;
            playerTotalWon[msg.sender] += grossPayout;
        }

        emit InstantLotteryResult(msg.sender, numbers, winningNumbers, matchCount, wager, grossPayout, grossPayout);
    }

    // ============ Internal: RNG & match ============

    function _toMemory(uint8[6] calldata arr) internal pure returns (uint8[6] memory out) {
        for (uint256 i = 0; i < NUMBERS_PER_TICKET; i++) out[i] = arr[i];
    }

    function _validateNumbers(uint8[6] calldata numbers) internal pure {
        bool[56] memory used;
        for (uint256 i = 0; i < NUMBERS_PER_TICKET; i++) {
            uint8 n = numbers[i];
            if (n < MIN_NUMBER || n > MAX_NUMBER || used[n]) revert InvalidNumbers();
            used[n] = true;
        }
    }

    function _generateWinningNumbers() internal returns (uint8[6] memory) {
        uint256 seed = uint256(keccak256(abi.encodePacked(
            blockhash(block.number - 1),
            block.timestamp,
            msg.sender,
            playNonce++,
            tx.gasprice
        )));

        uint8[6] memory numbers;
        bool[56] memory used;

        for (uint256 i = 0; i < NUMBERS_PER_TICKET; i++) {
            uint256 attempts = 0;
            uint8 num;
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

    function _sortNumbers(uint8[6] memory numbers) internal pure returns (uint8[6] memory) {
        for (uint256 i = 0; i < NUMBERS_PER_TICKET - 1; i++) {
            for (uint256 j = 0; j < NUMBERS_PER_TICKET - 1 - i; j++) {
                if (numbers[j] > numbers[j + 1]) {
                    (numbers[j], numbers[j + 1]) = (numbers[j + 1], numbers[j]);
                }
            }
        }
        return numbers;
    }

    function _countMatches(uint8[6] memory ticket, uint8[6] memory winning) internal pure returns (uint8) {
        uint8 matches = 0;
        uint256 wi = 0;
        for (uint256 ti = 0; ti < NUMBERS_PER_TICKET && wi < NUMBERS_PER_TICKET; ti++) {
            while (wi < NUMBERS_PER_TICKET && winning[wi] < ticket[ti]) wi++;
            if (wi < NUMBERS_PER_TICKET && winning[wi] == ticket[ti]) {
                matches++;
                wi++;
            }
        }
        return matches;
    }

    // ============ Internal: Wager fees (5% total, 4-way). No fee on payout. ============

    function _computeWagerFees(uint256 wager)
        internal
        view
        returns (uint256 netWager, uint256 feeDist, uint256 feeBurn, uint256 feePlatform, uint256 feeLp)
    {
        feeDist = (wager * distributionFeeBps) / BPS_DENOMINATOR;
        feeBurn = (wager * burnFeeBps) / BPS_DENOMINATOR;
        feePlatform = (wager * platformFeeBps) / BPS_DENOMINATOR;
        feeLp = (wager * lpDistributionFeeBps) / BPS_DENOMINATOR;
        netWager = wager - feeDist - feeBurn - feePlatform - feeLp;
    }

    /// @return toReserve Amount to add to contractReserve (wager minus fees).
    function _distributeWagerFees(uint256 wager) internal returns (uint256 toReserve) {
        uint256 feeDist;
        uint256 feeBurn;
        uint256 feePlatform;
        uint256 feeLp;
        (toReserve, feeDist, feeBurn, feePlatform, feeLp) = _computeWagerFees(wager);
        if (feeDist > 0) MORBIUS_TOKEN.safeTransfer(distributionRecipient, feeDist);
        if (feeBurn > 0) MORBIUS_TOKEN.safeTransfer(burnAddress, feeBurn);
        if (feePlatform > 0) MORBIUS_TOKEN.safeTransfer(platformFeeRecipient, feePlatform);
        if (feeLp > 0) MORBIUS_TOKEN.safeTransfer(lpDistributionRecipient, feeLp);
    }

    // ============ Admin ============

    function fundContract(uint256 amount) external {
        MORBIUS_TOKEN.safeTransferFrom(msg.sender, address(this), amount);
        contractReserve += amount;
        emit ContractFunded(msg.sender, amount);
    }

    function emergencyWithdraw(uint256 amount) external onlyOwner {
        if (amount > contractReserve) revert ExceedsReserve();
        contractReserve -= amount;
        MORBIUS_TOKEN.safeTransfer(owner(), amount);
        emit EmergencyWithdraw(amount);
    }

    function setMinWager(uint256 newMin) external onlyOwner {
        require(newMin > 0 && newMin < maxWager, "Invalid min");
        uint256 old = minWager;
        minWager = newMin;
        emit MinWagerUpdated(old, newMin);
    }

    function setMaxWager(uint256 newMax) external onlyOwner {
        require(newMax > minWager, "Invalid max");
        uint256 old = maxWager;
        maxWager = newMax;
        emit MaxWagerUpdated(old, newMax);
    }

    function setMultipliers(uint256[7] calldata newMultipliers) external onlyOwner {
        MULTIPLIERS_BPS = newMultipliers;
        emit MultipliersUpdated(newMultipliers);
    }

    function setPlsTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury");
        plsTreasury = newTreasury;
    }

    function setOperator(address newOperator) external onlyOwner {
        address old = operator;
        operator = newOperator;
        emit OperatorUpdated(old, newOperator);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ View ============

    /**
     * @notice Max gross payout for a given wager (before fees).
     */
    function getMaxPayoutForWager(uint256 wager) external view returns (uint256) {
        return (wager * MULTIPLIERS_BPS[6]) / BPS_DENOMINATOR;
    }

    function getWagerLimits() external view returns (uint256 min, uint256 max) {
        return (minWager, maxWager);
    }

    function getMultipliersBps() external view returns (uint256[7] memory) {
        return MULTIPLIERS_BPS;
    }
}
