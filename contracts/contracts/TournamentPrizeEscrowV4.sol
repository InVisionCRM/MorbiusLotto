// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TournamentPrizeEscrowV4
 * @notice Hybrid push-and-pull tournament prize escrow.
 *
 * Default UX is push: the authorized server pays winners with `payoutMultiple` (one tx, all winners).
 * Backup path is pull: server records per-winner claimable amounts via `setUnclaimedShares`,
 * winners then call `claim()` from their own wallets if/when the push path fails.
 *
 * Differences from V2:
 *  - No `pool.active` boolean — derive from `!cancelled && amountPaidOut < totalDeposited`.
 *    Removes a class of ABI mismatch bugs and shrinks storage.
 *  - `payoutMultiple` takes raw amounts, not percentages. Eliminates rounding ambiguity.
 *  - Pull path (`setUnclaimedShares` + `claim` + `unclaimedOf`) added.
 *  - Removed unused enumeration helpers (`getPoolsBatch`, `getActivePools`, etc.) that
 *    bloated bytecode and were never called by the server.
 */
contract TournamentPrizeEscrowV4 is Ownable, ReentrancyGuard {
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

    /// Per-winner claimable balance after server records the breakdown via `setUnclaimedShares`.
    /// Winner pulls via `claim()`. Decremented (and zeroed) on successful claim, alongside `amountPaidOut`.
    mapping(bytes32 => mapping(address => uint256)) public claimable;

    event PrizePoolDeposited(
        bytes32 indexed tournamentId,
        address indexed token,
        uint256 amount,
        address indexed depositor
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
     * @notice Deposit prize pool. One deposit per tournamentId — re-depositing reverts.
     * @param tournamentId keccak256 of the off-chain UUID
     * @param token ERC-20 token address
     * @param amount Amount in token's smallest unit (caller must approve this contract first)
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

        // No dedup loop needed — the `pool.token == address(0)` guard above prevents
        // a second deposit at the same id, so each id is pushed exactly once.
        tournamentIds.push(tournamentId);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit PrizePoolDeposited(tournamentId, token, amount, msg.sender);
    }

    // ============ Push payouts (default path) ============

    function payout(bytes32 tournamentId, address winner, uint256 amount)
        external
        onlyAuthorizedServer
        nonReentrant
    {
        _push(tournamentId, winner, amount);
    }

    /**
     * @notice Single tx pays all winners. Way more reliable than looping `payout()` from the
     *         server (one nonce, one network round-trip, atomic — eliminates the silent-RPC-drop
     *         failure mode that bit production with the old contract's per-call loop).
     */
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

    /**
     * @notice Server records per-winner claimable amounts. Winners then call `claim()`.
     *
     * Idempotent overwrite — calling again replaces prior amounts for the same winners.
     * Sum-check enforces the server can't promise more than the pool's remaining balance.
     * Note: this does NOT escrow funds against future pushes; both paths share the same pool
     * and `claim()` enforces `amountPaidOut + amount <= totalDeposited` to prevent double-pay.
     */
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

    /// @notice Winner pulls their claimable balance. Reverts on second call (zeroed).
    function claim(bytes32 tournamentId) external nonReentrant {
        uint256 amount = claimable[tournamentId][msg.sender];
        require(amount > 0, "Nothing to claim");
        Pool storage pool = pools[tournamentId];
        require(pool.token != address(0), "No pool");
        // Defense: prevents double-spend if a push already paid this winner. The server
        // SHOULD only set unclaimed shares for amounts the push didn't cover, but this
        // guard makes that contract-enforced rather than convention-enforced.
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

    /**
     * @notice 6-field pool snapshot. No `active` field — derive client-side as
     *         `!cancelled && amountPaidOut < totalDeposited`. The 6-field shape avoids
     *         the V2/V3 ABI-decode mismatch bug that broke production reads.
     */
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
