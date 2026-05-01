// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TournamentPrizeEscrowV5
 * @notice V4 + `addToPrizePool` for multi-player buy-ins into the same bytes32 pool.
 *
 * `depositPrizePool` — unchanged one-shot creator funding (sets `depositor = msg.sender` for freerolls).
 * `addToPrizePool` — repeatable deposits if `token` matches; **never** sets `depositor`, so
 * `creatorReclaim` cannot drain multi-funded pools (depositor stays zero for add-only pools).
 */
contract TournamentPrizeEscrowV5 is Ownable, ReentrancyGuard {
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

    mapping(bytes32 => Pool) public pools;
    bytes32[] public tournamentIds;

    mapping(bytes32 => mapping(address => uint256)) public claimable;

    event PrizePoolDeposited(
        bytes32 indexed tournamentId,
        address indexed token,
        uint256 amount,
        address indexed depositor
    );
    /// @notice Emitted for each `addToPrizePool` (including the first that initializes the pool).
    event PrizePoolAdded(
        bytes32 indexed tournamentId,
        address indexed token,
        uint256 amount,
        address indexed contributor
    );
    event Payout(bytes32 indexed tournamentId, address indexed winner, uint256 amount);
    event ClaimableSet(bytes32 indexed tournamentId, address indexed winner, uint256 amount);
    event Claimed(bytes32 indexed tournamentId, address indexed winner, uint256 amount);
    event RemainderReclaimed(bytes32 indexed tournamentId, address indexed to, uint256 amount);
    event TournamentCancelled(bytes32 indexed tournamentId, address indexed depositor);
    event CreatorReclaimed(bytes32 indexed tournamentId, address indexed creator, uint256 amount);

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

    // ============ Funding ============

    /**
     * @notice Deposit prize pool. One call per tournamentId — second call reverts.
     *         Sets `depositor = msg.sender` for creator reclaim on cancel (freerolls).
     */
    function depositPrizePool(bytes32 tournamentId, address token, uint256 amount) external nonReentrant {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Zero amount");
        Pool storage pool = pools[tournamentId];
        require(pool.token == address(0), "Already deposited");

        pool.token = token;
        pool.depositor = msg.sender;
        pool.totalDeposited = amount;
        pool.depositedAt = block.timestamp;

        tournamentIds.push(tournamentId);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit PrizePoolDeposited(tournamentId, token, amount, msg.sender);
    }

    /**
     * @notice Add to an existing pool or create a buy-in-only pool (no single depositor).
     *         Multiple callers may top up as long as `token` matches and pool is not cancelled.
     */
    function addToPrizePool(bytes32 tournamentId, address token, uint256 amount) external nonReentrant {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Zero amount");

        Pool storage pool = pools[tournamentId];

        if (pool.token == address(0)) {
            pool.token = token;
            // Intentionally leave depositor as zero — multi-funder safety vs creatorReclaim.
            pool.totalDeposited = amount;
            pool.depositedAt = block.timestamp;
            tournamentIds.push(tournamentId);
        } else {
            require(pool.token == token, "Token mismatch");
            require(!pool.cancelled, "Cancelled");
            pool.totalDeposited += amount;
        }

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit PrizePoolAdded(tournamentId, token, amount, msg.sender);
    }

    // ============ Push payouts (default path) ============

    function payout(bytes32 tournamentId, address winner, uint256 amount)
        external
        onlyAuthorizedServer
        nonReentrant
    {
        _push(tournamentId, winner, amount);
    }

    function payoutMultiple(
        bytes32 tournamentId,
        address[] calldata winners,
        uint256[] calldata amounts
    ) external onlyAuthorizedServer nonReentrant {
        require(winners.length == amounts.length, "Length mismatch");
        require(winners.length > 0, "Empty");
        for (uint256 i = 0; i < winners.length; i++) {
            _push(tournamentId, winners[i], amounts[i]);
        }
    }

    function _push(bytes32 tournamentId, address winner, uint256 amount) internal {
        if (amount == 0) return;
        require(winner != address(0), "Invalid winner");
        Pool storage pool = pools[tournamentId];
        require(pool.token != address(0), "No pool");
        require(!pool.cancelled, "Cancelled");
        require(pool.amountPaidOut + amount <= pool.totalDeposited, "Exceeds pool");
        pool.amountPaidOut += amount;
        IERC20(pool.token).safeTransfer(winner, amount);
        emit Payout(tournamentId, winner, amount);
    }

    // ============ Pull payouts (winner backup path) ============

    function setUnclaimedShares(
        bytes32 tournamentId,
        address[] calldata winners,
        uint256[] calldata amounts
    ) external onlyAuthorizedServer {
        require(winners.length == amounts.length, "Length mismatch");
        Pool storage pool = pools[tournamentId];
        require(pool.token != address(0), "No pool");
        require(!pool.cancelled, "Cancelled");

        uint256 sum = 0;
        for (uint256 i = 0; i < winners.length; i++) {
            sum += amounts[i];
        }
        uint256 remaining = pool.totalDeposited - pool.amountPaidOut;
        require(sum <= remaining, "Shares exceed remaining");

        for (uint256 i = 0; i < winners.length; i++) {
            claimable[tournamentId][winners[i]] = amounts[i];
            emit ClaimableSet(tournamentId, winners[i], amounts[i]);
        }
    }

    function claim(bytes32 tournamentId) external nonReentrant {
        uint256 amount = claimable[tournamentId][msg.sender];
        require(amount > 0, "Nothing to claim");
        Pool storage pool = pools[tournamentId];
        require(pool.token != address(0), "No pool");
        require(pool.amountPaidOut + amount <= pool.totalDeposited, "Exceeds pool");

        claimable[tournamentId][msg.sender] = 0;
        pool.amountPaidOut += amount;

        IERC20(pool.token).safeTransfer(msg.sender, amount);
        emit Claimed(tournamentId, msg.sender, amount);
    }

    function unclaimedOf(bytes32 tournamentId, address winner) external view returns (uint256) {
        return claimable[tournamentId][winner];
    }

    // ============ Cancel + reclaim ============

    function cancelTournament(bytes32 tournamentId) external onlyAuthorizedServer {
        Pool storage pool = pools[tournamentId];
        require(pool.token != address(0), "No pool");
        require(!pool.cancelled, "Already cancelled");
        pool.cancelled = true;
        emit TournamentCancelled(tournamentId, pool.depositor);
    }

    function creatorReclaim(bytes32 tournamentId) external nonReentrant {
        Pool storage pool = pools[tournamentId];
        require(pool.token != address(0), "No pool");
        require(pool.cancelled, "Not cancelled");
        require(msg.sender == pool.depositor, "Not creator");
        uint256 remaining = pool.totalDeposited - pool.amountPaidOut;
        require(remaining > 0, "No remainder");
        pool.amountPaidOut = pool.totalDeposited;
        IERC20(pool.token).safeTransfer(msg.sender, remaining);
        emit CreatorReclaimed(tournamentId, msg.sender, remaining);
    }

    function payoutRemainderTo(bytes32 tournamentId, address to)
        external
        onlyAuthorizedServer
        nonReentrant
    {
        require(to != address(0), "Invalid recipient");
        Pool storage pool = pools[tournamentId];
        require(pool.token != address(0), "No pool");
        require(!pool.cancelled, "Cancelled");
        uint256 remaining = pool.totalDeposited - pool.amountPaidOut;
        require(remaining > 0, "No remainder");
        pool.amountPaidOut = pool.totalDeposited;
        IERC20(pool.token).safeTransfer(to, remaining);
        emit RemainderReclaimed(tournamentId, to, remaining);
    }

    // ============ Reads ============

    function getPool(bytes32 tournamentId)
        external
        view
        returns (
            address token,
            address depositor,
            uint256 totalDeposited,
            uint256 amountPaidOut,
            uint256 depositedAt,
            bool cancelled
        )
    {
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

    function getRemainingBalance(bytes32 tournamentId) external view returns (uint256) {
        Pool storage pool = pools[tournamentId];
        if (pool.token == address(0)) return 0;
        return pool.totalDeposited - pool.amountPaidOut;
    }

    function getTournamentCount() external view returns (uint256) {
        return tournamentIds.length;
    }

    function getAllTournamentIds() external view returns (bytes32[] memory) {
        return tournamentIds;
    }
}
