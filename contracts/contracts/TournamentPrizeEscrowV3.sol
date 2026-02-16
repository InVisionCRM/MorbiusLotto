// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TournamentPrizeEscrowV3
 * @notice Holds ERC-20 prize tokens per tournament; uses uint256 tournament IDs.
 * @dev Works with MorbiusTournament contract. Authorized server pays out to winners.
 */
contract TournamentPrizeEscrowV3 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public authorizedServer;

    struct Pool {
        address token;
        address depositor;
        uint256 totalDeposited;
        uint256 amountPaidOut;
        uint256 depositedAt;
        bool cancelled;
    }
    mapping(uint256 => Pool) public pools;

    uint256[] public tournamentIds;

    event PrizePoolDeposited(
        uint256 indexed tournamentId,
        address indexed token,
        uint256 amount,
        address indexed depositor
    );
    event Payout(
        uint256 indexed tournamentId,
        address indexed winner,
        uint256 amount
    );
    event RemainderReclaimed(
        uint256 indexed tournamentId,
        address indexed to,
        uint256 amount
    );
    event TournamentCancelled(
        uint256 indexed tournamentId,
        address indexed depositor
    );
    event CreatorReclaimed(
        uint256 indexed tournamentId,
        address indexed creator,
        uint256 amount
    );

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
     * @param tournamentId uint256 from MorbiusTournament.createTournament
     */
    function depositPrizePool(uint256 tournamentId, address token, uint256 amount) external nonReentrant {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Zero amount");
        Pool storage pool = pools[tournamentId];
        require(pool.token == address(0), "Already deposited");

        pool.token = token;
        pool.depositor = msg.sender;
        pool.totalDeposited = amount;
        pool.depositedAt = block.timestamp;
        pool.cancelled = false;

        bool exists = false;
        for (uint256 i = 0; i < tournamentIds.length; i++) {
            if (tournamentIds[i] == tournamentId) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            tournamentIds.push(tournamentId);
        }

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit PrizePoolDeposited(tournamentId, token, amount, msg.sender);
    }

    function payout(uint256 tournamentId, address winner, uint256 amount) external onlyAuthorizedServer nonReentrant {
        require(winner != address(0), "Invalid winner");
        if (amount == 0) return;

        Pool storage pool = pools[tournamentId];
        require(pool.token != address(0), "No pool");
        require(!pool.cancelled, "Tournament cancelled");
        require(pool.amountPaidOut + amount <= pool.totalDeposited, "Exceeds pool");

        pool.amountPaidOut += amount;
        IERC20(pool.token).safeTransfer(winner, amount);

        emit Payout(tournamentId, winner, amount);
    }

    function cancelTournament(uint256 tournamentId) external onlyAuthorizedServer {
        Pool storage pool = pools[tournamentId];
        require(pool.token != address(0), "No pool");
        require(!pool.cancelled, "Already cancelled");

        pool.cancelled = true;
        emit TournamentCancelled(tournamentId, pool.depositor);
    }

    function creatorReclaim(uint256 tournamentId) external nonReentrant {
        Pool storage pool = pools[tournamentId];
        require(pool.token != address(0), "No pool");
        require(pool.cancelled, "Tournament not cancelled");
        require(msg.sender == pool.depositor, "Not creator");

        uint256 remaining = pool.totalDeposited - pool.amountPaidOut;
        require(remaining > 0, "No remainder");

        pool.amountPaidOut = pool.totalDeposited;
        IERC20(pool.token).safeTransfer(msg.sender, remaining);

        emit CreatorReclaimed(tournamentId, msg.sender, remaining);
    }

    function payoutRemainderTo(uint256 tournamentId, address to) external onlyAuthorizedServer nonReentrant {
        require(to != address(0), "Invalid recipient");
        Pool storage pool = pools[tournamentId];
        require(pool.token != address(0), "No pool");
        require(!pool.cancelled, "Tournament cancelled");
        uint256 remaining = pool.totalDeposited - pool.amountPaidOut;
        require(remaining > 0, "No remainder");
        pool.amountPaidOut = pool.totalDeposited;
        IERC20(pool.token).safeTransfer(to, remaining);
        emit RemainderReclaimed(tournamentId, to, remaining);
    }

    function reclaimUnclaimed(uint256 tournamentId, address to) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid recipient");
        Pool storage pool = pools[tournamentId];
        require(pool.token != address(0), "No pool");
        uint256 remaining = pool.totalDeposited - pool.amountPaidOut;
        require(remaining > 0, "No remainder");
        pool.amountPaidOut = pool.totalDeposited;
        IERC20(pool.token).safeTransfer(to, remaining);
        emit RemainderReclaimed(tournamentId, to, remaining);
    }

    // ============ View ============

    function getPool(uint256 tournamentId) external view returns (
        address token,
        address depositor,
        uint256 totalDeposited,
        uint256 amountPaidOut,
        uint256 depositedAt,
        bool cancelled
    ) {
        Pool storage pool = pools[tournamentId];
        return (
            pool.token,
            pool.depositor,
            pool.totalDeposited,
            pool.amountPaidOut,
            pool.depositedAt,
            pool.cancelled
        );
    }

    function getRemainingBalance(uint256 tournamentId) external view returns (uint256) {
        Pool storage pool = pools[tournamentId];
        if (pool.token == address(0)) return 0;
        return pool.totalDeposited - pool.amountPaidOut;
    }

    function getTournamentCount() external view returns (uint256) {
        return tournamentIds.length;
    }

    function getTournamentId(uint256 index) external view returns (uint256) {
        require(index < tournamentIds.length, "Index out of bounds");
        return tournamentIds[index];
    }
}
