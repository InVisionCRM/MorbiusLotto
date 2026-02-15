// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MorbiusHolderDistributor
 * @notice Receives MORBIUS over time; MORBIUS holders claim proportional share (reward-per-token).
 * @dev Circulating = totalSupply - burn - LP balances - this contract - excluded game contracts.
 *      Burn/LP/core contracts are hardcoded; owner can add more (new LPs/contracts) via addExcludedAddress.
 */
contract MorbiusHolderDistributor is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant SCALE = 1e18;

    // Hardcoded burn addresses (excluded from circulating)
    address public constant BURN_ADDRESS_DEAD = 0x000000000000000000000000000000000000dEaD;
    address public constant BURN_ADDRESS_0369 = 0x0000000000000000000000000000000000000369;

    // Hardcoded LP pairs (PulseX MORBIUS liquidity – excluded from circulating)
    address private constant LP1 = 0x81acd0AA872675678A25fbB154992A2baD4F6CEF;
    address private constant LP2 = 0x3208788Cf9BeAEDf8107EBb321b3890A3bD72CE7;
    address private constant LP3 = 0xC71e3C8a6Db933F827fCBBEa174A79E088BE2c5c;
    address private constant LP4 = 0xb876257C7550010f14a527d2bF8FDA9360F8597B;

    // Hardcoded excluded game/contract addresses (from lib/contracts.ts – cannot receive rewards)
    address private constant EX_LOTTERY = 0xD66b4489fbfF99A8d62f969203899840F2ec69c5;
    address private constant EX_LOTTERY_OLD = 0x25056D6159F6C7a7812d1B65aca2Ca14E3E0F4c3;
    address private constant EX_KENO = 0x734A1460b4131F8cFE4950894Be89d1a852c957A;
    address private constant EX_PLINKO = 0x37B1db8F06870BFFeFed862C06535BEFc4383ff8;
    address private constant EX_BIGWHEEL = 0x53331B63ef24904Ea470Cf07b924c7C13A699d8F;
    address private constant EX_BLACKJACK = 0xFCE49ab8b53366C397A0205c4c0CF42aE2B658A8; // BlackjackV2
    address private constant EX_TOURNAMENT_ESCROW = 0x59dec9419B32aA9CCC2C46A6fd8AeB68dE069C26;

    /// @notice Owner-added addresses (new LPs/contracts) excluded from circulating; 1-based index, 0 = not in list
    address[] private ownerExcluded;
    mapping(address => uint256) private ownerExcludedIndexPlus1;

    IERC20 public immutable MORBIUS_TOKEN;

    uint256 public rewardPerTokenStored;
    uint256 public lastBalance;
    mapping(address => uint256) public userRewardPerTokenPaid;

    event Claimed(address indexed account, uint256 amount);
    event PoolUpdated(uint256 newBalance, uint256 circulating);
    event ExcludedAddressAdded(address indexed addr);
    event ExcludedAddressRemoved(address indexed addr);

    constructor(address _morbiusToken) Ownable(msg.sender) {
        require(_morbiusToken != address(0), "Invalid token");
        MORBIUS_TOKEN = IERC20(_morbiusToken);
        lastBalance = MORBIUS_TOKEN.balanceOf(address(this));
    }

    /// @notice Circulating supply = totalSupply - burn - LP - this - excluded contracts.
    function getCirculating() public view returns (uint256) {
        uint256 supply = MORBIUS_TOKEN.totalSupply();
        uint256 burnBal = MORBIUS_TOKEN.balanceOf(BURN_ADDRESS_DEAD) + MORBIUS_TOKEN.balanceOf(BURN_ADDRESS_0369);
        uint256 exLP = MORBIUS_TOKEN.balanceOf(LP1) + MORBIUS_TOKEN.balanceOf(LP2)
            + MORBIUS_TOKEN.balanceOf(LP3) + MORBIUS_TOKEN.balanceOf(LP4);
        uint256 exContract = MORBIUS_TOKEN.balanceOf(EX_LOTTERY) + MORBIUS_TOKEN.balanceOf(EX_LOTTERY_OLD)
            + MORBIUS_TOKEN.balanceOf(EX_KENO) + MORBIUS_TOKEN.balanceOf(EX_PLINKO)
            + MORBIUS_TOKEN.balanceOf(EX_BIGWHEEL) + MORBIUS_TOKEN.balanceOf(EX_BLACKJACK)
            + MORBIUS_TOKEN.balanceOf(EX_TOURNAMENT_ESCROW);
        uint256 exOwner;
        for (uint256 i = 0; i < ownerExcluded.length; i++) {
            exOwner += MORBIUS_TOKEN.balanceOf(ownerExcluded[i]);
        }
        uint256 thisBal = MORBIUS_TOKEN.balanceOf(address(this));
        if (supply <= burnBal + exLP + exContract + exOwner + thisBal) return 1;
        return supply - burnBal - exLP - exContract - exOwner - thisBal;
    }

    /// @notice Call when MORBIUS has been sent to this contract to credit the pool.
    function updatePool() public {
        uint256 bal = MORBIUS_TOKEN.balanceOf(address(this));
        uint256 circ = getCirculating();
        if (circ > 0 && bal > lastBalance) {
            rewardPerTokenStored += ((bal - lastBalance) * SCALE) / circ;
        }
        lastBalance = bal;
        emit PoolUpdated(bal, circ);
    }

    function earned(address account) public view returns (uint256) {
        uint256 bal = MORBIUS_TOKEN.balanceOf(account);
        if (bal == 0) return 0;
        return (bal * (rewardPerTokenStored - userRewardPerTokenPaid[account])) / SCALE;
    }

    /// @notice Claim accumulated MORBIUS; caller pays gas.
    function claim() external nonReentrant {
        updatePool();
        uint256 amount = earned(msg.sender);
        require(amount > 0, "Nothing to claim");
        userRewardPerTokenPaid[msg.sender] = rewardPerTokenStored;
        lastBalance = MORBIUS_TOKEN.balanceOf(address(this)) - amount;
        MORBIUS_TOKEN.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    /// @notice Add an address to the exclusion list (new LP or contract); its MORBIUS balance is excluded from circulating.
    function addExcludedAddress(address addr) external onlyOwner {
        require(addr != address(0), "Zero address");
        require(addr != address(this), "Cannot add self");
        require(addr != BURN_ADDRESS_DEAD && addr != BURN_ADDRESS_0369, "Cannot add burn");
        require(addr != LP1 && addr != LP2 && addr != LP3 && addr != LP4, "Cannot add hardcoded LP");
        require(
            addr != EX_LOTTERY && addr != EX_LOTTERY_OLD && addr != EX_KENO && addr != EX_PLINKO
                && addr != EX_BIGWHEEL && addr != EX_BLACKJACK && addr != EX_TOURNAMENT_ESCROW,
            "Cannot add hardcoded contract"
        );
        require(ownerExcludedIndexPlus1[addr] == 0, "Already excluded");
        ownerExcluded.push(addr);
        ownerExcludedIndexPlus1[addr] = ownerExcluded.length;
        emit ExcludedAddressAdded(addr);
    }

    /// @notice Remove an address from the owner-managed exclusion list (cannot remove hardcoded addresses).
    function removeExcludedAddress(address addr) external onlyOwner {
        uint256 idx = ownerExcludedIndexPlus1[addr];
        require(idx != 0, "Not in list");
        uint256 lastIdx = ownerExcluded.length;
        if (idx != lastIdx) {
            address lastAddr = ownerExcluded[lastIdx - 1];
            ownerExcluded[idx - 1] = lastAddr;
            ownerExcludedIndexPlus1[lastAddr] = idx;
        }
        ownerExcluded.pop();
        ownerExcludedIndexPlus1[addr] = 0;
        emit ExcludedAddressRemoved(addr);
    }

    /// @notice List of owner-added excluded addresses (LPs/contracts).
    function getOwnerExcluded() external view returns (address[] memory) {
        return ownerExcluded;
    }

    /// @notice Rescue tokens other than MORBIUS, or owner emergency withdraw (use with care).
    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(MORBIUS_TOKEN), "Cannot rescue MORBIUS");
        IERC20(token).safeTransfer(to, amount);
    }
}
