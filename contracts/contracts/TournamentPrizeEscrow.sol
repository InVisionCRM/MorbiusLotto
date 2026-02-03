// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TournamentPrizeEscrow
 * @notice Holds ERC-20 prize tokens per tournament; authorized server pays out to winners.
 * @dev One deposit per tournamentId; payouts only by authorizedServer up to total deposited.
 */
contract TournamentPrizeEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public authorizedServer;

    struct Pool {
        address token;
        uint256 totalDeposited;
        uint256 amountPaidOut;
    }
    mapping(bytes32 => Pool) public pools;

    event PrizePoolDeposited(bytes32 indexed tournamentId, address indexed token, uint256 amount, address depositor);
    event Payout(bytes32 indexed tournamentId, address indexed winner, uint256 amount);

    modifier onlyAuthorizedServer() {
        require(msg.sender == authorizedServer, "Not authorized server");
        _;
    }

    constructor(address _authorizedServer) Ownable(msg.sender) {
        require(_authorizedServer != address(0), "Invalid server");
        authorizedServer = _authorizedServer;
    }

    function setAuthorizedServer(address _authorizedServer) external onlyOwner {
        require(_authorizedServer != address(0), "Invalid server");
        authorizedServer = _authorizedServer;
    }

    /**
     * @notice Deposit prize pool for a tournament. One deposit per tournamentId.
     * @param tournamentId keccak256(abi.encodePacked(utf8(tournamentId))) from backend UUID
     * @param token ERC-20 token address
     * @param amount Amount in token's smallest unit (caller must approve this contract first)
     */
    function depositPrizePool(bytes32 tournamentId, address token, uint256 amount) external nonReentrant {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Zero amount");
        Pool storage pool = pools[tournamentId];
        require(pool.token == address(0), "Already deposited");

        pool.token = token;
        pool.totalDeposited = amount;

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit PrizePoolDeposited(tournamentId, token, amount, msg.sender);
    }

    /**
     * @notice Pay out prize to a winner. Only callable by authorizedServer.
     * @param tournamentId Same bytes32 as used in depositPrizePool
     * @param winner Winner address to receive tokens
     * @param amount Amount in token's smallest unit
     */
    function payout(bytes32 tournamentId, address winner, uint256 amount) external onlyAuthorizedServer nonReentrant {
        require(winner != address(0), "Invalid winner");
        if (amount == 0) return;

        Pool storage pool = pools[tournamentId];
        require(pool.token != address(0), "No pool");
        require(pool.amountPaidOut + amount <= pool.totalDeposited, "Exceeds pool");

        pool.amountPaidOut += amount;
        IERC20(pool.token).safeTransfer(winner, amount);

        emit Payout(tournamentId, winner, amount);
    }

    /**
     * @notice View pool info for a tournament.
     */
    function getPool(bytes32 tournamentId) external view returns (address token, uint256 totalDeposited, uint256 amountPaidOut) {
        Pool storage pool = pools[tournamentId];
        return (pool.token, pool.totalDeposited, pool.amountPaidOut);
    }
}
