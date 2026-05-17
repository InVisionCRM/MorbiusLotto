// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TournamentPrizeEscrowV6
 * @notice Gas-optimized successor to V5. Same external API + events; leaner storage.
 *
 * Changes vs V5:
 *  - Pool struct packed from 6 slots → 3 slots (token+depositedAt+cancelled, depositor, amounts as uint128 pair).
 *  - Removed unused `tournamentIds[]` array (and its push / enumeration views). Backend already indexes IDs in Postgres.
 *  - Added optional `depositPrizePoolWithPermit` / `addToPrizePoolWithPermit` variants for EIP-2612 tokens (one-tx flow).
 *  - All existing function signatures, revert messages, and event topics preserved for ABI compatibility.
 *
 * Limits:
 *  - Single per-tournament total cap of type(uint128).max (~3.4e38). For 18-decimal tokens that's 3.4e20 whole tokens.
 *
 * Known carry-over from V5:
 *  - Assumes non-rebasing, non-fee-on-transfer tokens. Tokens with transfer hooks that mutate balances mid-call
 *    will under-account. Use a balance-delta wrapper off-contract if needed.
 */
contract TournamentPrizeEscrowV6 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Storage ============

    address public authorizedServer;

    /// @dev Packed into 3 storage slots.
    struct Pool {
        // Slot 0 -----------------------------------
        address token;        // 160 bits
        uint64  depositedAt;  //  64 bits (good through year 584,554,051,223)
        bool    cancelled;    //   8 bits
        //                       24 bits free
        // Slot 1 -----------------------------------
        address depositor;    // 160 bits — zero for buy-in-only pools (multi-funder safety)
        //                       96 bits free
        // Slot 2 -----------------------------------
        uint128 totalDeposited; // 128 bits
        uint128 amountPaidOut;  // 128 bits
    }

    mapping(bytes32 => Pool) public pools;

    /// @dev Per-tournament per-winner pull-payout balance.
    mapping(bytes32 => mapping(address => uint256)) public claimable;

    // ============ Events (identical topics to V5) ============

    event PrizePoolDeposited(
        bytes32 indexed tournamentId,
        address indexed token,
        uint256 amount,
        address indexed depositor
    );
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

    // ============ Modifiers + constructor ============

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
     * @notice Single-creator funding (freeroll path). One call per tournamentId — subsequent calls revert.
     *         Sets `depositor = msg.sender` so creator can reclaim if the tournament is cancelled.
     */
    function depositPrizePool(bytes32 tournamentId, address token, uint256 amount)
        external
        nonReentrant
    {
        _deposit(tournamentId, token, amount, /* setDepositor */ true);
        emit PrizePoolDeposited(tournamentId, token, amount, msg.sender);
    }

    /**
     * @notice Multi-funder buy-in path. Repeatable as long as `token` matches and pool is not cancelled.
     *         Never sets `depositor` — prevents creatorReclaim drain of other players' funds.
     */
    function addToPrizePool(bytes32 tournamentId, address token, uint256 amount)
        external
        nonReentrant
    {
        _deposit(tournamentId, token, amount, /* setDepositor */ false);
        emit PrizePoolAdded(tournamentId, token, amount, msg.sender);
    }

    /**
     * @notice EIP-2612 permit + depositPrizePool in a single tx. Caller signs an approval off-chain,
     *         saving the separate approve tx (~46k gas + extra wallet popup).
     */
    function depositPrizePoolWithPermit(
        bytes32 tournamentId,
        address token,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        // Permit is best-effort: tokens that don't implement EIP-2612 will revert here.
        // We swallow nothing — caller chose this entrypoint, so they must have verified support.
        IERC20Permit(token).permit(msg.sender, address(this), amount, deadline, v, r, s);
        _deposit(tournamentId, token, amount, /* setDepositor */ true);
        emit PrizePoolDeposited(tournamentId, token, amount, msg.sender);
    }

    /**
     * @notice EIP-2612 permit + addToPrizePool in a single tx (buy-in path).
     */
    function addToPrizePoolWithPermit(
        bytes32 tournamentId,
        address token,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        IERC20Permit(token).permit(msg.sender, address(this), amount, deadline, v, r, s);
        _deposit(tournamentId, token, amount, /* setDepositor */ false);
        emit PrizePoolAdded(tournamentId, token, amount, msg.sender);
    }

    function _deposit(bytes32 tournamentId, address token, uint256 amount, bool setDepositor) internal {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Zero amount");
        require(amount <= type(uint128).max, "Amount too large");

        Pool storage pool = pools[tournamentId];

        if (pool.token == address(0)) {
            // First write: slot 0 (token + depositedAt + cancelled-default-false) in one SSTORE.
            pool.token = token;
            pool.depositedAt = uint64(block.timestamp);
            // Slot 2: totalDeposited (amountPaidOut stays 0).
            pool.totalDeposited = uint128(amount);
            if (setDepositor) {
                // Slot 1.
                pool.depositor = msg.sender;
            }
            // Note: depositPrizePool requires single-call semantics, enforced by re-check below.
        } else {
            require(pool.token == token, "Token mismatch");
            require(!pool.cancelled, "Cancelled");
            // depositPrizePool semantics: enforce single-shot for the depositor-set path.
            if (setDepositor) revert("Already deposited");
            // Top-up: read-modify-write totalDeposited. Cast safety: clamp to uint128 cap.
            uint256 newTotal = uint256(pool.totalDeposited) + amount;
            require(newTotal <= type(uint128).max, "Total overflow");
            pool.totalDeposited = uint128(newTotal);
        }

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
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

        uint256 newPaid = uint256(pool.amountPaidOut) + amount;
        require(newPaid <= uint256(pool.totalDeposited), "Exceeds pool");
        pool.amountPaidOut = uint128(newPaid); // safe: <= totalDeposited which is uint128

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
        uint256 remaining = uint256(pool.totalDeposited) - uint256(pool.amountPaidOut);
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

        uint256 newPaid = uint256(pool.amountPaidOut) + amount;
        require(newPaid <= uint256(pool.totalDeposited), "Exceeds pool");

        claimable[tournamentId][msg.sender] = 0;
        pool.amountPaidOut = uint128(newPaid);

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

        uint256 remaining = uint256(pool.totalDeposited) - uint256(pool.amountPaidOut);
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

        uint256 remaining = uint256(pool.totalDeposited) - uint256(pool.amountPaidOut);
        require(remaining > 0, "No remainder");
        pool.amountPaidOut = pool.totalDeposited;

        IERC20(pool.token).safeTransfer(to, remaining);
        emit RemainderReclaimed(tournamentId, to, remaining);
    }

    // ============ Reads (V5-compatible shape) ============

    /// @notice Returns the same 6-tuple shape as V5's `getPool` for drop-in ABI compatibility.
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
            uint256(pool.totalDeposited),
            uint256(pool.amountPaidOut),
            uint256(pool.depositedAt),
            pool.cancelled
        );
    }

    function getRemainingBalance(bytes32 tournamentId) external view returns (uint256) {
        Pool storage pool = pools[tournamentId];
        if (pool.token == address(0)) return 0;
        return uint256(pool.totalDeposited) - uint256(pool.amountPaidOut);
    }
}
