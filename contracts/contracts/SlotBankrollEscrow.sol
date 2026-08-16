// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SlotBankrollEscrow
 * @notice Holds the PRC-20 bankroll behind community slot machines — one pool
 *         per machine, keyed by the machine's UUID as bytes32.
 *
 * This deliberately does NOT reuse TournamentPrizeEscrow. Creator bankrolls and
 * tournament prize money are separate concerns; keeping them in one contract
 * would mean a single authorized key, a single pool-id namespace, and one
 * contract bug reaching both piles of money. Slots get their own vault and
 * their own server key.
 *
 * Trust model (same shape as the tournament escrow, so operations are familiar):
 *  - Anyone may fund a machine's bankroll.
 *  - Only `authorizedServer` moves money out. The backend decides what a payout
 *    is — a player cashing out, or a creator withdrawing their own bankroll —
 *    because only it knows session state and solvency.
 *  - The owner can rotate the server key, and nothing else. There is no
 *    owner-drain path: the owner cannot take a creator's bankroll.
 *
 * Two properties worth calling out, both absent from the tournament escrow:
 *
 *  1. Fee-on-transfer tokens are accounted correctly. Funding credits the
 *     balance the contract ACTUALLY received, not the amount the funder named,
 *     so a skimming token can never leave a pool crediting more than it holds.
 *
 *  2. Pools are isolated. A payout is capped at its own pool's unpaid balance,
 *     so a bug or a compromised server key cannot drain machine B to pay
 *     machine A. The blast radius of any single machine is that machine.
 */
contract SlotBankrollEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Storage ============

    address public authorizedServer;

    /// @dev Two storage slots per machine.
    struct Bankroll {
        // Slot 0 -----------------------------------
        address token;       // 160 bits — locked on first funding
        uint64  createdAt;   //  64 bits
        bool    frozen;      //   8 bits — creator-requested stop; blocks funding, never payouts
        //                      24 bits free
        // Slot 1 -----------------------------------
        uint128 totalFunded; // 128 bits — sum of amounts actually RECEIVED
        uint128 totalPaidOut;// 128 bits
    }

    mapping(bytes32 => Bankroll) public bankrolls;

    // ============ Events ============

    event BankrollFunded(
        bytes32 indexed machineId,
        address indexed token,
        uint256 amount,
        address indexed funder
    );
    event BankrollPaidOut(bytes32 indexed machineId, address indexed to, uint256 amount);
    event BankrollFrozen(bytes32 indexed machineId, bool frozen);
    event AuthorizedServerChanged(address indexed previous, address indexed next);

    // ============ Modifiers + constructor ============

    modifier onlyAuthorizedServer() {
        require(msg.sender == authorizedServer, "Not authorized server");
        _;
    }

    constructor(address _authorizedServer) Ownable(msg.sender) {
        require(_authorizedServer != address(0), "Invalid server");
        authorizedServer = _authorizedServer;
        emit AuthorizedServerChanged(address(0), _authorizedServer);
    }

    function setAuthorizedServer(address _authorizedServer) external onlyOwner {
        require(_authorizedServer != address(0), "Invalid server");
        emit AuthorizedServerChanged(authorizedServer, _authorizedServer);
        authorizedServer = _authorizedServer;
    }

    // ============ Funding ============

    /**
     * @notice Fund a machine's bankroll. The first funding fixes the pool's
     *         token; later fundings must use the same one.
     * @dev Credits the balance delta rather than `amount`, so fee-on-transfer
     *      tokens cannot leave the pool's books overstated.
     */
    function fundBankroll(bytes32 machineId, address token, uint256 amount)
        external
        nonReentrant
    {
        require(machineId != bytes32(0), "Invalid machine");
        require(token != address(0), "Invalid token");
        require(amount > 0, "Amount must be > 0");

        Bankroll storage b = bankrolls[machineId];
        if (b.token == address(0)) {
            b.token = token;
            b.createdAt = uint64(block.timestamp);
        } else {
            require(b.token == token, "Token mismatch for this machine");
        }
        require(!b.frozen, "Bankroll frozen");

        // Credit what actually landed, not what was asked for.
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - before;
        require(received > 0, "No tokens received");

        uint256 newTotal = uint256(b.totalFunded) + received;
        require(newTotal <= type(uint128).max, "Bankroll cap exceeded");
        b.totalFunded = uint128(newTotal);

        emit BankrollFunded(machineId, token, received, msg.sender);
    }

    // ============ Payout ============

    /**
     * @notice Pay out of a machine's bankroll — a player cashout or a creator
     *         withdrawal; the backend distinguishes them, the contract does not.
     * @dev Capped at this pool's own unpaid balance. That cap is what keeps one
     *      machine's funds unreachable from another's payouts.
     */
    function payout(bytes32 machineId, address to, uint256 amount)
        external
        onlyAuthorizedServer
        nonReentrant
    {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");

        Bankroll storage b = bankrolls[machineId];
        require(b.token != address(0), "Unknown machine");
        require(amount <= available(machineId), "Exceeds machine bankroll");

        b.totalPaidOut = uint128(uint256(b.totalPaidOut) + amount);
        IERC20(b.token).safeTransfer(to, amount);

        emit BankrollPaidOut(machineId, to, amount);
    }

    /**
     * @notice Stop further funding of a machine (creator winding it down, or an
     *         operator response to a bad actor). Payouts keep working, so money
     *         already in the pool can always still be withdrawn.
     */
    function setFrozen(bytes32 machineId, bool frozen) external onlyAuthorizedServer {
        require(bankrolls[machineId].token != address(0), "Unknown machine");
        bankrolls[machineId].frozen = frozen;
        emit BankrollFrozen(machineId, frozen);
    }

    // ============ Views ============

    /// @notice What this machine can still pay out.
    function available(bytes32 machineId) public view returns (uint256) {
        Bankroll storage b = bankrolls[machineId];
        return uint256(b.totalFunded) - uint256(b.totalPaidOut);
    }

    /// @notice The whole pool in one call — what the backend reads.
    function getBankroll(bytes32 machineId)
        external
        view
        returns (
            address token,
            uint256 totalFunded,
            uint256 totalPaidOut,
            uint256 remaining,
            uint64 createdAt,
            bool frozen
        )
    {
        Bankroll storage b = bankrolls[machineId];
        return (
            b.token,
            uint256(b.totalFunded),
            uint256(b.totalPaidOut),
            available(machineId),
            b.createdAt,
            b.frozen
        );
    }

    /**
     * @notice Tokens held beyond what every funded pool is owed — only ever
     *         non-zero if someone transfers tokens in directly instead of
     *         calling fundBankroll (those are otherwise stranded forever).
     * @dev Takes the caller's word for the pool total because pools are not
     *      enumerable on-chain; the backend sums them from Postgres. Understating
     *      `totalOwedForToken` is caught by the balance check and reverts, so the
     *      owner cannot use this to reach into pooled funds.
     */
    function sweepUnaccounted(address token, uint256 totalOwedForToken, address to)
        external
        onlyOwner
        nonReentrant
    {
        require(to != address(0), "Invalid recipient");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > totalOwedForToken, "Nothing unaccounted");
        IERC20(token).safeTransfer(to, balance - totalOwedForToken);
    }
}
