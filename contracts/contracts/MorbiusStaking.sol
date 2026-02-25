// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title MorbiusStaking
 * @notice Stake MORBIUS to earn proportional share of rewards sent to this contract.
 * @dev Synthetix StakingRewards pattern. Rewards are MORBIUS tokens sent to the contract;
 *      `updatePool()` detects new deposits and distributes them proportionally to stakers.
 */
contract MorbiusStaking is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 private constant SCALE = 1e18;
    uint256 public constant UNSTAKE_FEE_PCT = 500;  // 5% in basis points
    uint256 public constant TOTAL_PCT = 10_000;

    IERC20 public immutable MORBIUS_TOKEN;
    address public immutable PLATFORM_FEE_WALLET;

    uint256 public totalStaked;
    uint256 public totalStakers;
    uint256 public totalRewardsClaimed;
    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public stakedAt;

    uint256 public rewardPerTokenStored;
    uint256 public lastBalance;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    /// @notice Rewards received while no one was staking (owner can recover via rescueExcess).
    uint256 public unallocatedRewards;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount, uint256 fee);
    event Claimed(address indexed user, uint256 amount);
    event PoolUpdated(uint256 newBalance, uint256 totalStaked);
    event EmergencyUnstaked(address indexed user, uint256 amount);

    constructor(address _morbiusToken, address _platformFeeWallet) Ownable(msg.sender) {
        require(_morbiusToken != address(0), "Invalid token");
        require(_platformFeeWallet != address(0), "Invalid fee wallet");
        MORBIUS_TOKEN = IERC20(_morbiusToken);
        PLATFORM_FEE_WALLET = _platformFeeWallet;
    }

    // ───────────────────── Reward accounting ─────────────────────

    /// @notice Detect new MORBIUS sent to this contract and update the global reward rate.
    function updatePool() public {
        uint256 bal = MORBIUS_TOKEN.balanceOf(address(this));
        if (bal > lastBalance) {
            uint256 newRewards = bal - lastBalance;
            if (totalStaked > 0) {
                rewardPerTokenStored += (newRewards * SCALE) / totalStaked;
            } else {
                // No stakers — track so owner can recover later
                unallocatedRewards += newRewards;
            }
        }
        lastBalance = bal;
        emit PoolUpdated(bal, totalStaked);
    }

    /// @dev Checkpoint a user's rewards before any balance change.
    modifier updateRewards(address account) {
        updatePool();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    /// @notice View: unclaimed rewards for an account.
    function earned(address account) public view returns (uint256) {
        return rewards[account]
            + (stakedBalance[account] * (rewardPerTokenStored - userRewardPerTokenPaid[account])) / SCALE;
    }

    /// @notice View: total pending (unclaimed) rewards across all users. Useful for stats display.
    function totalPendingRewards() external view returns (uint256) {
        uint256 bal = MORBIUS_TOKEN.balanceOf(address(this));
        if (bal > totalStaked) {
            return bal - totalStaked - unallocatedRewards;
        }
        return 0;
    }

    /// @notice View: returns staked balance, earned rewards, and staked-at timestamp in one call.
    function getStakerInfo(address account) external view returns (uint256 staked, uint256 pendingRewards, uint256 stakedSince) {
        staked = stakedBalance[account];
        pendingRewards = earned(account);
        stakedSince = stakedAt[account];
    }

    // ───────────────────── User actions ─────────────────────

    /// @notice Stake MORBIUS tokens. Caller must have approved this contract first.
    function stake(uint256 amount) external nonReentrant whenNotPaused updateRewards(msg.sender) {
        require(amount > 0, "Cannot stake 0");
        if (stakedBalance[msg.sender] == 0) {
            totalStakers += 1;
            stakedAt[msg.sender] = block.timestamp;
        }
        totalStaked += amount;
        stakedBalance[msg.sender] += amount;
        lastBalance += amount;
        MORBIUS_TOKEN.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    /// @notice Unstake MORBIUS tokens. 5% fee: 2.5% to staking pool, 2.5% to platform.
    ///         Immediate, no cooldown. Works even when paused.
    function unstake(uint256 amount) external nonReentrant updateRewards(msg.sender) {
        require(amount > 0, "Cannot unstake 0");
        require(stakedBalance[msg.sender] >= amount, "Exceeds staked balance");

        uint256 fee = (amount * UNSTAKE_FEE_PCT) / TOTAL_PCT;
        uint256 platformShare = fee / 2;
        // Remaining fee (fee - platformShare) stays in contract as future staker reward
        uint256 userReceives = amount - fee;

        totalStaked -= amount;
        stakedBalance[msg.sender] -= amount;
        if (stakedBalance[msg.sender] == 0) {
            totalStakers -= 1;
            stakedAt[msg.sender] = 0;
        }

        // Only subtract what actually leaves the contract (user + platform); pool share stays
        lastBalance -= (userReceives + platformShare);

        MORBIUS_TOKEN.safeTransfer(msg.sender, userReceives);
        MORBIUS_TOKEN.safeTransfer(PLATFORM_FEE_WALLET, platformShare);
        emit Unstaked(msg.sender, amount, fee);
    }

    /// @notice Claim accumulated MORBIUS rewards. Works even when paused.
    function claim() external nonReentrant updateRewards(msg.sender) {
        uint256 amount = rewards[msg.sender];
        require(amount > 0, "Nothing to claim");
        rewards[msg.sender] = 0;
        totalRewardsClaimed += amount;
        lastBalance -= amount;
        MORBIUS_TOKEN.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    /// @notice Emergency unstake: withdraw staked tokens without claiming rewards. Skips reward math.
    ///         Use only if normal unstake fails. Forfeits any unclaimed rewards. Same 5% fee applies.
    function emergencyUnstake() external nonReentrant {
        uint256 amount = stakedBalance[msg.sender];
        require(amount > 0, "Nothing staked");

        uint256 fee = (amount * UNSTAKE_FEE_PCT) / TOTAL_PCT;
        uint256 platformShare = fee / 2;
        uint256 userReceives = amount - fee;

        totalStaked -= amount;
        stakedBalance[msg.sender] = 0;
        stakedAt[msg.sender] = 0;
        rewards[msg.sender] = 0;
        userRewardPerTokenPaid[msg.sender] = rewardPerTokenStored;
        if (totalStakers > 0) {
            totalStakers -= 1;
        }
        lastBalance -= (userReceives + platformShare);
        MORBIUS_TOKEN.safeTransfer(msg.sender, userReceives);
        MORBIUS_TOKEN.safeTransfer(PLATFORM_FEE_WALLET, platformShare);
        emit EmergencyUnstaked(msg.sender, amount);
    }

    // ───────────────────── Admin ─────────────────────

    /// @notice Pause staking in an emergency. Unstake and claim remain available.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Rescue tokens other than MORBIUS accidentally sent to this contract.
    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(MORBIUS_TOKEN), "Use rescueExcess for MORBIUS");
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Recover unallocated MORBIUS rewards (sent while no one was staking) or rounding dust.
    function rescueExcess(address to) external onlyOwner {
        require(unallocatedRewards > 0, "Nothing to rescue");
        uint256 amount = unallocatedRewards;
        unallocatedRewards = 0;
        lastBalance -= amount;
        MORBIUS_TOKEN.safeTransfer(to, amount);
    }
}
