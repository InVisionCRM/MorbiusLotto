// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MorbiusTournament
 * @notice On-chain tournament creation and join. Uses uint256 tournament IDs.
 * @dev Buy-in tournaments: players pay MORBIUS to join; prize pool held in contract.
 *      Custom token tournaments: creator deposits to separate escrow; buy-ins go to platform.
 */
contract MorbiusTournament is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable MORBIUS_TOKEN;
    address public authorizedServer;
    address public platformFeeWallet;

    uint256 public tournamentCounter;

    enum TournamentStatus { Open, Active, Completed, Cancelled }

    struct Tournament {
        address creator;
        uint256 buyInAmount;
        uint256 maxPlayers;       // 0 = unlimited
        address prizeToken;        // address(0) = platform MORBIUS from buy-ins
        uint256 prizeAmount;      // for custom token; 0 for platform MORBIUS
        uint256 prizePool;        // accumulated from buy-ins (platform MORBIUS only)
        uint256 entryCount;
        TournamentStatus status;
        uint256 createdAt;
    }

    mapping(uint256 => Tournament) public tournaments;
    mapping(uint256 => mapping(address => bool)) public hasJoined;

    event TournamentCreated(
        uint256 indexed tournamentId,
        address indexed creator,
        uint256 buyInAmount,
        uint256 maxPlayers,
        address prizeToken,
        uint256 prizeAmount
    );
    event TournamentJoined(uint256 indexed tournamentId, address indexed player);
    event TournamentCancelled(uint256 indexed tournamentId, address indexed creator);
    event Payout(uint256 indexed tournamentId, address indexed winner, uint256 amount);

    modifier onlyAuthorizedServer() {
        require(msg.sender == authorizedServer, "Not authorized server");
        _;
    }

    constructor(
        address _morbiusToken,
        address _authorizedServer,
        address _platformFeeWallet
    ) Ownable(msg.sender) {
        require(_morbiusToken != address(0), "Invalid MORBIUS");
        require(_authorizedServer != address(0), "Invalid server");
        require(_platformFeeWallet != address(0), "Invalid platform wallet");
        MORBIUS_TOKEN = IERC20(_morbiusToken);
        authorizedServer = _authorizedServer;
        platformFeeWallet = _platformFeeWallet;
    }

    function setAuthorizedServer(address _authorizedServer) external onlyOwner {
        require(_authorizedServer != address(0), "Invalid server");
        authorizedServer = _authorizedServer;
    }

    function setPlatformFeeWallet(address _platformFeeWallet) external onlyOwner {
        require(_platformFeeWallet != address(0), "Invalid wallet");
        platformFeeWallet = _platformFeeWallet;
    }

    /**
     * @notice Create a tournament. Returns uint256 tournament ID.
     * @param buyInAmount MORBIUS wei for buy-in
     * @param maxPlayers 0 = unlimited
     * @param prizeToken address(0) = platform MORBIUS (prize from buy-ins); else custom token
     * @param prizeAmount For custom token only; 0 for platform MORBIUS
     */
    function createTournament(
        uint256 buyInAmount,
        uint256 maxPlayers,
        address prizeToken,
        uint256 prizeAmount
    ) external returns (uint256 tournamentId) {
        tournamentId = ++tournamentCounter;

        tournaments[tournamentId] = Tournament({
            creator: msg.sender,
            buyInAmount: buyInAmount,
            maxPlayers: maxPlayers,
            prizeToken: prizeToken,
            prizeAmount: prizeAmount,
            prizePool: 0,
            entryCount: 0,
            status: TournamentStatus.Open,
            createdAt: block.timestamp
        });

        emit TournamentCreated(tournamentId, msg.sender, buyInAmount, maxPlayers, prizeToken, prizeAmount);
        return tournamentId;
    }

    /**
     * @notice Join a tournament. Player must approve this contract for buyInAmount MORBIUS.
     */
    function joinTournament(uint256 tournamentId) external nonReentrant {
        Tournament storage t = tournaments[tournamentId];
        require(t.creator != address(0), "Tournament does not exist");
        require(t.status == TournamentStatus.Open, "Tournament not open");
        require(!hasJoined[tournamentId][msg.sender], "Already joined");
        if (t.maxPlayers > 0) {
            require(t.entryCount < t.maxPlayers, "Tournament full");
        }

        hasJoined[tournamentId][msg.sender] = true;
        t.entryCount++;

        if (t.buyInAmount > 0) {
            if (t.prizeToken == address(0)) {
                t.prizePool += t.buyInAmount;
                MORBIUS_TOKEN.safeTransferFrom(msg.sender, address(this), t.buyInAmount);
            } else {
                MORBIUS_TOKEN.safeTransferFrom(msg.sender, platformFeeWallet, t.buyInAmount);
            }
        }

        emit TournamentJoined(tournamentId, msg.sender);
    }

    /**
     * @notice Mark tournament as active (e.g. when game starts). Only authorized server.
     */
    function setActive(uint256 tournamentId) external onlyAuthorizedServer {
        Tournament storage t = tournaments[tournamentId];
        require(t.creator != address(0), "Tournament does not exist");
        require(t.status == TournamentStatus.Open, "Not open");
        t.status = TournamentStatus.Active;
    }

    /**
     * @notice Cancel tournament. Creator or authorized server.
     */
    function cancelTournament(uint256 tournamentId) external {
        Tournament storage t = tournaments[tournamentId];
        require(t.creator != address(0), "Tournament does not exist");
        require(t.status == TournamentStatus.Open || t.status == TournamentStatus.Active, "Cannot cancel");
        require(msg.sender == t.creator || msg.sender == authorizedServer, "Not creator or server");

        t.status = TournamentStatus.Cancelled;
        emit TournamentCancelled(tournamentId, t.creator);
    }

    /**
     * @notice Pay out prize to winner. Only for platform MORBIUS tournaments.
     *         Custom token payouts go through TournamentPrizeEscrow.
     */
    function payout(uint256 tournamentId, address winner, uint256 amount) external onlyAuthorizedServer nonReentrant {
        require(winner != address(0), "Invalid winner");
        if (amount == 0) return;

        Tournament storage t = tournaments[tournamentId];
        require(t.prizeToken == address(0), "Use escrow for custom token");
        require(t.status == TournamentStatus.Active || t.status == TournamentStatus.Completed, "Invalid status");
        require(amount <= t.prizePool, "Exceeds pool");

        t.prizePool -= amount;
        MORBIUS_TOKEN.safeTransfer(winner, amount);

        emit Payout(tournamentId, winner, amount);
    }

    /**
     * @notice Mark tournament completed. Only authorized server.
     */
    function setCompleted(uint256 tournamentId) external onlyAuthorizedServer {
        Tournament storage t = tournaments[tournamentId];
        require(t.creator != address(0), "Tournament does not exist");
        t.status = TournamentStatus.Completed;
    }

    /**
     * @notice Refund a player from a cancelled tournament (platform MORBIUS only).
     */
    function refund(uint256 tournamentId, address player) external nonReentrant {
        Tournament storage t = tournaments[tournamentId];
        require(t.status == TournamentStatus.Cancelled, "Not cancelled");
        require(t.prizeToken == address(0), "Custom token: use escrow creatorReclaim");
        require(hasJoined[tournamentId][player], "Not joined");

        hasJoined[tournamentId][player] = false;
        t.entryCount--;
        t.prizePool -= t.buyInAmount;

        MORBIUS_TOKEN.safeTransfer(player, t.buyInAmount);
    }

    // ============ View ============

    function getTournament(uint256 tournamentId) external view returns (
        address creator,
        uint256 buyInAmount,
        uint256 maxPlayers,
        address prizeToken,
        uint256 prizeAmount,
        uint256 prizePool,
        uint256 entryCount,
        TournamentStatus status,
        uint256 createdAt
    ) {
        Tournament storage t = tournaments[tournamentId];
        return (
            t.creator,
            t.buyInAmount,
            t.maxPlayers,
            t.prizeToken,
            t.prizeAmount,
            t.prizePool,
            t.entryCount,
            t.status,
            t.createdAt
        );
    }

    function getTournamentCount() external view returns (uint256) {
        return tournamentCounter;
    }
}
