// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TournamentPrizeEscrowV2
 * @notice Holds ERC-20 prize tokens per tournament; authorized server pays out to winners.
 * @dev Enhanced version with creator tracking, timestamps, and active flag for tournaments.
 */
contract TournamentPrizeEscrowV2 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public authorizedServer;

    struct Pool {
        address token;
        address depositor; // Who deposited the funds (creator)
        uint256 totalDeposited;
        uint256 amountPaidOut;
        uint256 depositedAt; // Block timestamp when deposited
        bool cancelled; // Whether tournament was cancelled
        bool active; // Whether tournament is active
    }
    mapping(bytes32 => Pool) public pools;

    // Track all tournament IDs for enumeration
    bytes32[] public tournamentIds;

    event PrizePoolDeposited(
        bytes32 indexed tournamentId,
        address indexed token,
        uint256 amount,
        address indexed depositor
    );
    event Payout(
        bytes32 indexed tournamentId,
        address indexed winner,
        uint256 amount
    );
    event RemainderReclaimed(
        bytes32 indexed tournamentId,
        address indexed to,
        uint256 amount
    );
    event TournamentCancelled(
        bytes32 indexed tournamentId,
        address indexed depositor
    );
    event CreatorReclaimed(
        bytes32 indexed tournamentId,
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
     * @param tournamentId keccak256(abi.encodePacked(utf8(tournamentId))) from backend UUID
     * @param token ERC-20 token address
     * @param amount Amount in token's smallest unit (caller must approve this contract first)
     */
    function depositPrizePool(
        bytes32 tournamentId,
        address token,
        uint256 amount
    ) external nonReentrant {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Zero amount");
        Pool storage pool = pools[tournamentId];
        require(pool.token == address(0), "Already deposited");

        pool.token = token;
        pool.depositor = msg.sender;
        pool.totalDeposited = amount;
        pool.depositedAt = block.timestamp;
        pool.cancelled = false;
        pool.active = true;

        // Track tournament ID if not already tracked
        bool exists = false;
        for (uint i = 0; i < tournamentIds.length; i++) {
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

    /**
     * @notice Pay out prize to a winner. Only callable by authorizedServer.
     * @param tournamentId Same bytes32 as used in depositPrizePool
     * @param winner Winner address to receive tokens
     * @param amount Amount in token's smallest unit
     */
    function payout(
        bytes32 tournamentId,
        address winner,
        uint256 amount
    ) external onlyAuthorizedServer nonReentrant {
        require(winner != address(0), "Invalid winner");
        if (amount == 0) return;

        Pool storage pool = pools[tournamentId];
        require(pool.token != address(0), "No pool");
        require(pool.active, "Tournament not active");
        require(
            pool.amountPaidOut + amount <= pool.totalDeposited,
            "Exceeds pool"
        );

        pool.amountPaidOut += amount;
        if (pool.amountPaidOut == pool.totalDeposited) {
            pool.active = false;
        }

        IERC20(pool.token).safeTransfer(winner, amount);

        emit Payout(tournamentId, winner, amount);
    }
// ----------------------------------3D Tech Baby ------------------------------->
    /**
     * @notice Payout multiple winners in a single call based on percentages.
     * @param tournamentId Tournament to payout
     * @param winners Array of winner addresses
     * @param percentages Array of percentages corresponding to each winner (total should be <= 100)
     */
    function payoutMultiple(
        bytes32 tournamentId,
        address[] calldata winners,
        uint256[] calldata percentages
    ) external onlyAuthorizedServer nonReentrant {
        Pool storage pool = pools[tournamentId];
        require(pool.token != address(0), "No pool");
        require(pool.active, "Tournament not active");
        require(!pool.cancelled, "Tournament cancelled");
        require(winners.length == percentages.length, "Mismatched arrays");
        require(winners.length > 0, "No winners");

        uint256 totalPercent;
        for (uint256 i = 0; i < percentages.length; i++) {
            totalPercent += percentages[i];
        }
        require(totalPercent <= 100, "Percentages exceed 100");

        uint256 remaining = pool.totalDeposited - pool.amountPaidOut;
        require(remaining > 0, "No remaining balance");

        for (uint256 i = 0; i < winners.length; i++) {
            address winner = winners[i];
            require(winner != address(0), "Invalid winner");

            uint256 payoutAmount = (remaining * percentages[i]) / 100;
            if (payoutAmount > 0) {
                pool.amountPaidOut += payoutAmount;
                IERC20(pool.token).safeTransfer(winner, payoutAmount);
                emit Payout(tournamentId, winner, payoutAmount);
            }
        }

        // If fully paid out, mark inactive
        if (pool.amountPaidOut >= pool.totalDeposited) {
            pool.active = false;
        }
    }
// ---------------------------------------------------------------------------
    /**
     * @notice Mark tournament as cancelled. Only callable by authorizedServer.
     * @param tournamentId Tournament to cancel
     */
    function cancelTournament(
        bytes32 tournamentId
    ) external onlyAuthorizedServer {
        Pool storage pool = pools[tournamentId];
        require(pool.token != address(0), "No pool");
        require(!pool.cancelled, "Already cancelled");

        pool.cancelled = true;
        pool.active = false;

        emit TournamentCancelled(tournamentId, pool.depositor);
    }

    /**
     * @notice Creator can reclaim funds if tournament is cancelled.
     * @param tournamentId Tournament to reclaim from
     */
    function creatorReclaim(bytes32 tournamentId) external nonReentrant {
        Pool storage pool = pools[tournamentId];
        require(pool.token != address(0), "No pool");
        require(pool.cancelled, "Tournament not cancelled");
        require(msg.sender == pool.depositor, "Not creator");

        uint256 remaining = pool.totalDeposited - pool.amountPaidOut;
        require(remaining > 0, "No remainder");

        pool.amountPaidOut = pool.totalDeposited;
        pool.active = false;

        IERC20(pool.token).safeTransfer(msg.sender, remaining);

        emit CreatorReclaimed(tournamentId, msg.sender, remaining);
    }

    /**
     * @notice Send remaining (unclaimed) prize tokens for a tournament to an address.
     * Callable by authorized server only.
     */
    function payoutRemainderTo(
        bytes32 tournamentId,
        address to
    ) external onlyAuthorizedServer nonReentrant {
        require(to != address(0), "Invalid recipient");
        Pool storage pool = pools[tournamentId];
        require(pool.token != address(0), "No pool");
        require(pool.active, "Tournament not active");
        uint256 remaining = pool.totalDeposited - pool.amountPaidOut;
        require(remaining > 0, "No remainder");

        pool.amountPaidOut = pool.totalDeposited;
        pool.active = false;

        IERC20(pool.token).safeTransfer(to, remaining);
        emit RemainderReclaimed(tournamentId, to, remaining);
    }

    /**
     * @notice Owner can reclaim unclaimed prize tokens for a tournament (e.g. old/cancelled tournaments).
     */
    function reclaimUnclaimed(
        bytes32 tournamentId,
        address to
    ) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid recipient");
        Pool storage pool = pools[tournamentId];
        require(pool.token != address(0), "No pool");
        uint256 remaining = pool.totalDeposited - pool.amountPaidOut;
        require(remaining > 0, "No remainder");

        pool.amountPaidOut = pool.totalDeposited;
        pool.active = false;

        IERC20(pool.token).safeTransfer(to, remaining);
        emit RemainderReclaimed(tournamentId, to, remaining);
    }

    // ============ Read Functions for Oversight ============

    function getPool(
        bytes32 tournamentId
    )
        external
        view
        returns (
            address token,
            address depositor,
            uint256 totalDeposited,
            uint256 amountPaidOut,
            uint256 depositedAt,
            bool cancelled,
            bool active
        )
    {
        Pool storage pool = pools[tournamentId];
        return (
            pool.token,
            pool.depositor,
            pool.totalDeposited,
            pool.amountPaidOut,
            pool.depositedAt,
            pool.cancelled,
            pool.active
        );
    }

    function getRemainingBalance(
        bytes32 tournamentId
    ) external view returns (uint256) {
        Pool storage pool = pools[tournamentId];
        if (pool.token == address(0)) return 0;
        return pool.totalDeposited - pool.amountPaidOut;
    }

    function getTournamentCount() external view returns (uint256) {
        return tournamentIds.length;
    }

    function getTournamentId(uint256 index) external view returns (bytes32) {
        require(index < tournamentIds.length, "Index out of bounds");
        return tournamentIds[index];
    }

    function getAllTournamentIds() external view returns (bytes32[] memory) {
        return tournamentIds;
    }

    function getPoolsBatch(
        bytes32[] calldata tournamentIds_
    )
        external
        view
        returns (
            address[] memory tokens,
            address[] memory depositors,
            uint256[] memory totalDepositeds,
            uint256[] memory amountPaidOuts,
            uint256[] memory depositedAts,
            bool[] memory cancelleds,
            bool[] memory actives
        )
    {
        uint256 length = tournamentIds_.length;
        tokens = new address[](length);
        depositors = new address[](length);
        totalDepositeds = new uint256[](length);
        amountPaidOuts = new uint256[](length);
        depositedAts = new uint256[](length);
        cancelleds = new bool[](length);
        actives = new bool[](length);

        for (uint256 i = 0; i < length; i++) {
            Pool storage pool = pools[tournamentIds_[i]];
            tokens[i] = pool.token;
            depositors[i] = pool.depositor;
            totalDepositeds[i] = pool.totalDeposited;
            amountPaidOuts[i] = pool.amountPaidOut;
            depositedAts[i] = pool.depositedAt;
            cancelleds[i] = pool.cancelled;
            actives[i] = pool.active;
        }
    }

    function getActivePools()
        external
        view
        returns (bytes32[] memory activeIds, uint256[] memory balances)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < tournamentIds.length; i++) {
            Pool storage pool = pools[tournamentIds[i]];
            if (pool.active) {
                count++;
            }
        }

        activeIds = new bytes32[](count);
        balances = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < tournamentIds.length; i++) {
            Pool storage pool = pools[tournamentIds[i]];
            if (pool.active) {
                activeIds[index] = tournamentIds[i];
                balances[index] = pool.totalDeposited - pool.amountPaidOut;
                index++;
            }
        }
    }

    function getPoolsByDepositor(
        address depositor
    )
        external
        view
        returns (
            bytes32[] memory ids,
            address[] memory tokens,
            uint256[] memory totalDepositeds,
            uint256[] memory amountPaidOuts,
            uint256[] memory depositedAts,
            bool[] memory cancelleds,
            bool[] memory actives
        )
    {
        uint256 count = 0;
        for (uint256 i = 0; i < tournamentIds.length; i++) {
            Pool storage pool = pools[tournamentIds[i]];
            if (pool.depositor == depositor) {
                count++;
            }
        }

        ids = new bytes32[](count);
        tokens = new address[](count);
        totalDepositeds = new uint256[](count);
        amountPaidOuts = new uint256[](count);
        depositedAts = new uint256[](count);
        cancelleds = new bool[](count);
        actives = new bool[](count);

        uint256 index = 0;
        for (uint256 i = 0; i < tournamentIds.length; i++) {
            Pool storage pool = pools[tournamentIds[i]];
            if (pool.depositor == depositor) {
                ids[index] = tournamentIds[i];
                tokens[index] = pool.token;
                totalDepositeds[index] = pool.totalDeposited;
                amountPaidOuts[index] = pool.amountPaidOut;
                depositedAts[index] = pool.depositedAt;
                cancelleds[index] = pool.cancelled;
                actives[index] = pool.active;
                index++;
            }
        }
    }

    function getTotalValueLocked(
        address token
    ) external view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < tournamentIds.length; i++) {
            Pool storage pool = pools[tournamentIds[i]];
            if (pool.token == token && pool.active) {
                total += (pool.totalDeposited - pool.amountPaidOut);
            }
        }
        return total;
    }

    function getEscrowSummary()
        external
        view
        returns (
            uint256 totalTournaments,
            uint256 activeTournaments,
            uint256 cancelledTournaments,
            uint256 totalValueLocked
        )
    {
        totalTournaments = tournamentIds.length;
        for (uint256 i = 0; i < tournamentIds.length; i++) {
            Pool storage pool = pools[tournamentIds[i]];
            if (pool.token != address(0)) {
                if (pool.cancelled) {
                    cancelledTournaments++;
                } else if (pool.active) {
                    activeTournaments++;
                    totalValueLocked += (pool.totalDeposited -
                        pool.amountPaidOut);
                }
            }
        }
    }
}
