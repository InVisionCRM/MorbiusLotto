// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title MerkleClaimLP
 * @notice Multi-epoch Merkle drop contract for MORBIUS/WPLS LP staker rewards.
 *         Identical to MerkleClaimMorbius except rewards are funded by sending
 *         MORBIUS directly to this contract address — no approval or depositRewards
 *         call required. The backend snapshots LP token balances, builds a Merkle
 *         tree off-chain, publishes the root, and users claim their share.
 *
 * Funding flow:
 *   - Blackjack (or any source) sends MORBIUS directly to this contract address.
 *   - No transferFrom, no approval — just a plain transfer to the contract.
 *
 * Admin flow:
 *   1. Backend snapshots LP holders, calculates shares, builds Merkle tree.
 *   2. Owner/operator calls setEpochRoot(epochId, merkleRoot, totalAmount).
 *   3. Users call claim(epochId, amount, proof) to receive tokens.
 *
 * Leaf encoding (double-hash, OZ standard):
 *   leaf = keccak256(bytes.concat(keccak256(abi.encodePacked(epochId, claimant, amount))))
 */
contract MerkleClaimLP is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable morbiusToken;

    /// @notice Merkle root for each epoch (epochId => root)
    mapping(uint256 => bytes32) public epochRoots;

    /// @notice Total reward amount allocated for each epoch
    mapping(uint256 => uint256) public epochTotalAmount;

    /// @notice Total already claimed for each epoch
    mapping(uint256 => uint256) public epochClaimedAmount;

    /// @notice Whether a user has claimed for a given epoch
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    /// @notice Addresses authorized to set epoch roots
    mapping(address => bool) public operators;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event EpochCreated(uint256 indexed epochId, bytes32 root, uint256 totalAmount);
    event EpochRevoked(uint256 indexed epochId);
    event Claimed(uint256 indexed epochId, address indexed claimant, uint256 amount);
    event TokensRescued(address indexed token, uint256 amount);
    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyOwnerOrOperator() {
        require(
            msg.sender == owner() || operators[msg.sender],
            "MerkleClaimLP: not owner or operator"
        );
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _morbiusToken) Ownable(msg.sender) {
        require(_morbiusToken != address(0), "MerkleClaimLP: zero token");
        morbiusToken = IERC20(_morbiusToken);
    }

    // -------------------------------------------------------------------------
    // Operator Management (onlyOwner)
    // -------------------------------------------------------------------------

    function addOperator(address operator) external onlyOwner {
        require(operator != address(0), "MerkleClaimLP: zero address");
        operators[operator] = true;
        emit OperatorAdded(operator);
    }

    function removeOperator(address operator) external onlyOwner {
        operators[operator] = false;
        emit OperatorRemoved(operator);
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    /**
     * @notice Publish the Merkle root for an epoch, enabling claims.
     * @param epochId     Unique epoch identifier.
     * @param root        Merkle root of the {epochId, address, amount} leaves.
     * @param totalAmount Total MORBIUS allocated to this epoch (must be <= contract balance).
     */
    function setEpochRoot(
        uint256 epochId,
        bytes32 root,
        uint256 totalAmount
    ) external onlyOwnerOrOperator {
        require(root != bytes32(0), "MerkleClaimLP: empty root");
        require(epochRoots[epochId] == bytes32(0), "MerkleClaimLP: epoch already set");
        require(totalAmount > 0, "MerkleClaimLP: zero total");
        epochRoots[epochId] = root;
        epochTotalAmount[epochId] = totalAmount;
        emit EpochCreated(epochId, root, totalAmount);
    }

    /**
     * @notice Revoke an epoch that has not yet been claimed from.
     * @param epochId Epoch to revoke.
     */
    function revokeEpoch(uint256 epochId) external onlyOwner {
        require(epochRoots[epochId] != bytes32(0), "MerkleClaimLP: epoch not set");
        require(epochClaimedAmount[epochId] == 0, "MerkleClaimLP: already has claims");
        epochRoots[epochId] = bytes32(0);
        epochTotalAmount[epochId] = 0;
        emit EpochRevoked(epochId);
    }

    /**
     * @notice Rescue ERC-20 tokens accidentally sent to this contract.
     */
    function rescueTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amount);
        emit TokensRescued(token, amount);
    }

    // -------------------------------------------------------------------------
    // Claim
    // -------------------------------------------------------------------------

    /**
     * @notice Claim MORBIUS rewards for a given epoch.
     * @param epochId Epoch to claim for.
     * @param amount  Amount allocated to the caller in this epoch.
     * @param proof   Merkle proof verifying (epochId, msg.sender, amount).
     */
    function claim(
        uint256 epochId,
        uint256 amount,
        bytes32[] calldata proof
    ) external nonReentrant {
        require(epochRoots[epochId] != bytes32(0), "MerkleClaimLP: epoch not found");
        require(!hasClaimed[epochId][msg.sender], "MerkleClaimLP: already claimed");
        require(amount > 0, "MerkleClaimLP: zero amount");

        bytes32 leaf = keccak256(
            bytes.concat(keccak256(abi.encodePacked(epochId, msg.sender, amount)))
        );
        require(
            MerkleProof.verify(proof, epochRoots[epochId], leaf),
            "MerkleClaimLP: invalid proof"
        );

        hasClaimed[epochId][msg.sender] = true;
        epochClaimedAmount[epochId] += amount;

        morbiusToken.safeTransfer(msg.sender, amount);
        emit Claimed(epochId, msg.sender, amount);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /**
     * @notice Check whether a proof is valid without submitting a claim.
     */
    function verifyProof(
        uint256 epochId,
        address claimant,
        uint256 amount,
        bytes32[] calldata proof
    ) external view returns (bool) {
        bytes32 leaf = keccak256(
            bytes.concat(keccak256(abi.encodePacked(epochId, claimant, amount)))
        );
        return MerkleProof.verify(proof, epochRoots[epochId], leaf);
    }

    /**
     * @notice Remaining unclaimed tokens for an epoch.
     */
    function epochUnclaimedAmount(uint256 epochId) external view returns (uint256) {
        uint256 total = epochTotalAmount[epochId];
        uint256 claimed = epochClaimedAmount[epochId];
        return total > claimed ? total - claimed : 0;
    }

    /**
     * @notice Total MORBIUS held by this contract (funded via direct transfers).
     */
    function contractBalance() external view returns (uint256) {
        return morbiusToken.balanceOf(address(this));
    }
}
