// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title MorbiusLPStaking
 * @notice Stake Morbius/WPLS PLP tokens to earn proportional share of MORBIUS rewards.
 * @dev Synthetix StakingRewards pattern. Rewards are MORBIUS tokens sent to the contract;
 *      `updatePool()` detects new MORBIUS deposits and distributes them proportionally.
 *      5% unstake fee on PLP is burned (sent to dead address), permanently removing liquidity.
 */
contract MorbiusLPStaking is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 private constant SCALE = 1e18;
    uint256 public constant UNSTAKE_FEE_PCT = 500;  // 5% in basis points
    uint256 public constant TOTAL_PCT = 10_000;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    IERC20 public immutable PLP_TOKEN;
    IERC20 public immutable MORBIUS_TOKEN;

    uint256 public totalStaked;
    uint256 public totalStakers;
    uint256 public totalBurned;
    uint256 public totalRewardsClaimed;
    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public stakedAt;

    uint256 public rewardPerTokenStored;
    uint256 public lastRewardBalance;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    /// @notice Rewards received while no one was staking (owner can recover via rescueExcess).
    uint256 public unallocatedRewards;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount, uint256 burned);
    event Claimed(address indexed user, uint256 amount);
    event PoolUpdated(uint256 rewardBalance, uint256 totalStaked);
    event EmergencyUnstaked(address indexed user, uint256 amount);

    constructor(address _plpToken, address _morbiusToken) Ownable(msg.sender) {
        require(_plpToken != address(0), "Invalid PLP token");
        require(_morbiusToken != address(0), "Invalid MORBIUS token");
        PLP_TOKEN = IERC20(_plpToken);
        MORBIUS_TOKEN = IERC20(_morbiusToken);
    }

    // ───────────────────── Reward accounting ─────────────────────

    /// @notice Detect new MORBIUS sent to this contract and update the global reward rate.
    function updatePool() public {
        uint256 bal = MORBIUS_TOKEN.balanceOf(address(this));
        if (bal > lastRewardBalance) {
            uint256 newRewards = bal - lastRewardBalance;
            if (totalStaked > 0) {
                rewardPerTokenStored += (newRewards * SCALE) / totalStaked;
            } else {
                unallocatedRewards += newRewards;
            }
        }
        lastRewardBalance = bal;
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

    /// @notice View: unclaimed MORBIUS rewards for an account.
    function earned(address account) public view returns (uint256) {
        return rewards[account]
            + (stakedBalance[account] * (rewardPerTokenStored - userRewardPerTokenPaid[account])) / SCALE;
    }

    /// @notice View: total pending (unclaimed) MORBIUS rewards across all users.
    function totalPendingRewards() external view returns (uint256) {
        uint256 bal = MORBIUS_TOKEN.balanceOf(address(this));
        if (bal > unallocatedRewards) {
            return bal - unallocatedRewards;
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

    /// @notice Stake PLP tokens. Caller must have approved this contract first.
    function stake(uint256 amount) external nonReentrant whenNotPaused updateRewards(msg.sender) {
        require(amount > 0, "Cannot stake 0");
        if (stakedBalance[msg.sender] == 0) {
            totalStakers += 1;
            stakedAt[msg.sender] = block.timestamp;
        }
        totalStaked += amount;
        stakedBalance[msg.sender] += amount;
        PLP_TOKEN.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    /// @notice Unstake PLP tokens. 5% fee is burned (sent to dead address).
    ///         Immediate, no cooldown. Works even when paused.
    function unstake(uint256 amount) external nonReentrant updateRewards(msg.sender) {
        require(amount > 0, "Cannot unstake 0");
        require(stakedBalance[msg.sender] >= amount, "Exceeds staked balance");

        uint256 fee = (amount * UNSTAKE_FEE_PCT) / TOTAL_PCT;
        uint256 userReceives = amount - fee;

        totalStaked -= amount;
        totalBurned += fee;
        stakedBalance[msg.sender] -= amount;
        if (stakedBalance[msg.sender] == 0) {
            totalStakers -= 1;
            stakedAt[msg.sender] = 0;
        }

        PLP_TOKEN.safeTransfer(msg.sender, userReceives);
        PLP_TOKEN.safeTransfer(BURN_ADDRESS, fee);
        emit Unstaked(msg.sender, amount, fee);
    }

    /// @notice Claim accumulated MORBIUS rewards. Works even when paused.
    function claim() external nonReentrant updateRewards(msg.sender) {
        uint256 amount = rewards[msg.sender];
        require(amount > 0, "Nothing to claim");
        rewards[msg.sender] = 0;
        totalRewardsClaimed += amount;
        lastRewardBalance -= amount;
        MORBIUS_TOKEN.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    /// @notice Emergency unstake: withdraw PLP without claiming MORBIUS rewards.
    ///         Use only if normal unstake fails. Forfeits unclaimed rewards. Same 5% burn fee.
    function emergencyUnstake() external nonReentrant {
        uint256 amount = stakedBalance[msg.sender];
        require(amount > 0, "Nothing staked");

        uint256 fee = (amount * UNSTAKE_FEE_PCT) / TOTAL_PCT;
        uint256 userReceives = amount - fee;

        totalStaked -= amount;
        totalBurned += fee;
        stakedBalance[msg.sender] = 0;
        stakedAt[msg.sender] = 0;
        rewards[msg.sender] = 0;
        userRewardPerTokenPaid[msg.sender] = rewardPerTokenStored;
        if (totalStakers > 0) {
            totalStakers -= 1;
        }

        PLP_TOKEN.safeTransfer(msg.sender, userReceives);
        PLP_TOKEN.safeTransfer(BURN_ADDRESS, fee);
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

    /// @notice Rescue tokens other than PLP or MORBIUS accidentally sent to this contract.
    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(PLP_TOKEN), "Cannot rescue staked token");
        require(token != address(MORBIUS_TOKEN), "Use rescueExcess for MORBIUS");
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Recover unallocated MORBIUS rewards (sent while no one was staking).
    function rescueExcess(address to) external onlyOwner {
        require(unallocatedRewards > 0, "Nothing to rescue");
        uint256 amount = unallocatedRewards;
        unallocatedRewards = 0;
        lastRewardBalance -= amount;
        MORBIUS_TOKEN.safeTransfer(to, amount);
    }
}
