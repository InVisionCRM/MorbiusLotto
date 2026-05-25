// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MorbiusBatchDisperse
 * @notice Owner-only batch ERC20 payouts for holder/LP reward delivery.
 *
 * Typical ops flow (off-chain steps are separate):
 *   1. rescueTokens on MerkleClaim* → owner wallet (or fund this contract)
 *   2. disperseFromOwner / disperseFromBalance with snapshot amounts
 *   3. Mark merkle_snapshots.claimed_at in DB + revoke on-chain merkle roots
 */
contract MorbiusBatchDisperse is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    event BatchDispersed(
        uint256 indexed epochId,
        address indexed token,
        address indexed operator,
        uint256 recipientCount,
        uint256 totalAmount
    );

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Pull `token` from owner (allowance required) and send to each recipient.
     * @param epochId Backend merkle epoch number (audit trail only; not validated on-chain).
     */
    function disperseFromOwner(
        uint256 epochId,
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        _disperse(epochId, token, recipients, amounts, true);
    }

    /**
     * @notice Send `token` already held by this contract.
     */
    function disperseFromBalance(
        uint256 epochId,
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        _disperse(epochId, token, recipients, amounts, false);
    }

    /// @notice Rescue tokens sent here by mistake (or sweep leftover dust).
    function rescueTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    function _disperse(
        uint256 epochId,
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts,
        bool fromOwner
    ) internal {
        require(token != address(0), "zero token");
        uint256 n = recipients.length;
        require(n > 0, "zero recipients");
        require(n == amounts.length, "length mismatch");

        uint256 total;
        for (uint256 i = 0; i < n; ) {
            address to = recipients[i];
            uint256 amt = amounts[i];
            require(to != address(0), "zero recipient");
            require(amt > 0, "zero amount");
            total += amt;
            if (fromOwner) {
                IERC20(token).safeTransferFrom(msg.sender, to, amt);
            } else {
                IERC20(token).safeTransfer(to, amt);
            }
            unchecked {
                ++i;
            }
        }

        emit BatchDispersed(epochId, token, msg.sender, n, total);
    }
}
