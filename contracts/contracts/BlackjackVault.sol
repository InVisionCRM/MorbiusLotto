// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IPulseXRouterV2 {
    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);
}

/**
 * @title BlackjackVault — stateless deposit router
 * @notice Successor to the BlackjackV2 "reserve" contract. This contract exists ONLY to
 *         accept deposits and announce them via events; the off-chain server credits the
 *         player's DB balance from those events, and all payouts are made off-chain from
 *         the hot wallet.
 *
 * @dev Why this design (the lesson from V7):
 *      V7 recorded a per-depositor `playerReserves` balance on-chain and guarded it, so the
 *      operator could never withdraw the pool. Because payouts run off-chain, that reserve
 *      counter only ever grew and permanently locked the contract's balance.
 *
 *      This contract holds NO per-player accounting and, by forwarding every deposit straight
 *      to the treasury in the same transaction, holds essentially NO balance at all. There is
 *      nothing to trap: no reserves, no totalReserves, no withdraw guard. A `rescueTokens` /
 *      `rescuePLS` hatch guarantees that anything which somehow lands here can always be
 *      recovered by the owner — so funds can never again be permanently stuck.
 *
 *      Event signatures are identical to V7 (`DepositMORBIUS`, `Deposit`) so the existing
 *      server deposit-watcher works by only changing the contract address it points at.
 */
contract BlackjackVault is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    /// @notice Minimum deposit (applies to both MORBIUS amount and PLS msg.value)
    uint256 public constant MIN_DEPOSIT = 1e18;

    // ============ Immutable State ============

    IERC20 public immutable MORBIUS_TOKEN;
    address public immutable WPLS_TOKEN;      // used only in the PulseX price path
    IPulseXRouterV2 public immutable pulseXRouter;

    // ============ Mutable State (owner-configurable) ============

    /// @notice Destination for MORBIUS deposits (e.g. the hot wallet that funds payouts)
    address public morbiusTreasury;
    /// @notice Destination for native PLS deposits
    address public plsTreasury;

    // ============ Events ============

    // Kept byte-for-byte compatible with BlackjackV2 so the server watcher is a config change.
    event DepositMORBIUS(address indexed player, uint256 amount);
    event Deposit(address indexed player, uint256 morbiusAmount, uint256 plsAmount);

    event MorbiusTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event PlsTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event TokensRescued(address indexed token, address indexed to, uint256 amount);
    event PLSRescued(address indexed to, uint256 amount);

    constructor(
        address _initialOwner,
        address _morbiusToken,
        address _wplsToken,
        address _pulseXRouter,
        address _morbiusTreasury,
        address _plsTreasury
    ) Ownable(_initialOwner) {
        require(_morbiusToken != address(0), "Invalid MORBIUS");
        require(_wplsToken != address(0), "Invalid WPLS");
        require(_pulseXRouter != address(0), "Invalid router");
        require(_morbiusTreasury != address(0), "Invalid MORBIUS treasury");
        require(_plsTreasury != address(0), "Invalid PLS treasury");
        MORBIUS_TOKEN = IERC20(_morbiusToken);
        WPLS_TOKEN = _wplsToken;
        pulseXRouter = IPulseXRouterV2(_pulseXRouter);
        morbiusTreasury = _morbiusTreasury;
        plsTreasury = _plsTreasury;
    }

    // ============ Deposits ============

    /**
     * @notice Deposit MORBIUS. Tokens are pulled straight to `morbiusTreasury` in the same
     *         transaction; the contract never holds them. Emits DepositMORBIUS for the server.
     * @dev Caller must ERC20-approve this contract for `amount` first.
     */
    function depositMORBIUS(uint256 amount) external nonReentrant whenNotPaused {
        require(amount >= MIN_DEPOSIT, "Deposit too small");
        MORBIUS_TOKEN.safeTransferFrom(msg.sender, morbiusTreasury, amount);
        emit DepositMORBIUS(msg.sender, amount);
    }

    /**
     * @notice Deposit native PLS. PLS is forwarded to `plsTreasury`; PulseX is used only for
     *         price discovery to record a MORBIUS-equivalent in the event (no on-chain swap).
     *         The server credits the player's DB balance from the emitted MORBIUS-equivalent.
     */
    function deposit() external payable nonReentrant whenNotPaused {
        require(msg.value >= MIN_DEPOSIT, "Deposit too small");

        address[] memory path = new address[](2);
        path[0] = WPLS_TOKEN;
        path[1] = address(MORBIUS_TOKEN);
        uint256[] memory amounts = pulseXRouter.getAmountsOut(msg.value, path);
        uint256 morbiusEquivalent = amounts[amounts.length - 1];
        require(morbiusEquivalent > 0, "Price query failed");

        (bool sent, ) = plsTreasury.call{value: msg.value}("");
        require(sent, "PLS transfer to treasury failed");

        emit Deposit(msg.sender, morbiusEquivalent, msg.value);
    }

    // ============ Fallback ============

    /// @notice Reject bare PLS transfers to force use of deposit(); anything forced in is rescuable.
    receive() external payable {
        revert("Use deposit() to add funds");
    }

    // ============ Admin ============

    function setMorbiusTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        emit MorbiusTreasuryUpdated(morbiusTreasury, _treasury);
        morbiusTreasury = _treasury;
    }

    function setPlsTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        emit PlsTreasuryUpdated(plsTreasury, _treasury);
        plsTreasury = _treasury;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Anti-trap hatch: recover any ERC20 that somehow ends up on this contract.
     * @dev The contract is not designed to hold tokens; this guarantees nothing can ever be
     *      permanently stuck (the exact failure mode that broke V7).
     */
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        IERC20(token).safeTransfer(to, amount);
        emit TokensRescued(token, to, amount);
    }

    /// @notice Anti-trap hatch for native PLS (e.g. force-sent via selfdestruct).
    function rescuePLS(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "PLS rescue failed");
        emit PLSRescued(to, amount);
    }
}
