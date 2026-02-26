// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title MerkleClaimMorbius
 * @notice Multi-epoch Merkle drop contract for MORBIUS holder rewards.
 *         Each epoch has a Merkle root computed off-chain from a holder snapshot.
 *         Users prove inclusion and claim their proportional MORBIUS reward.
 *
 * Admin flow:
 *   1. Backend snapshots MORBIUS holders, calculates shares, builds Merkle tree.
 *   2. Owner/operator calls depositRewards(amount) to fund the epoch.
 *   3. Owner/operator calls setEpochRoot(epochId, merkleRoot, totalAmount) to publish the root.
 *   4. Users call claim(epochId, amount, proof) to receive their tokens.
 *
 * Leaf encoding (double-hash, OZ standard):
 *   leaf = keccak256(bytes.concat(keccak256(abi.encodePacked(epochId, claimant, amount))))
 */
contract MerkleClaimMorbius is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable morbiusToken;

    /// @notice Merkle root for each epoch (epochId => root)
    mapping(uint256 => bytes32) public epochRoots;

    /// @notice Total reward amount deposited for each epoch
    mapping(uint256 => uint256) public epochTotalAmount;

    /// @notice Total already claimed for each epoch
    mapping(uint256 => uint256) public epochClaimedAmount;

    /// @notice Whether a user has claimed for a given epoch
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    /// @notice Addresses authorized to deposit rewards and set epoch roots
    mapping(address => bool) public operators;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event EpochCreated(uint256 indexed epochId, bytes32 root, uint256 totalAmount);
    event EpochRevoked(uint256 indexed epochId);
    event Claimed(uint256 indexed epochId, address indexed claimant, uint256 amount);
    event RewardsDeposited(uint256 amount);
    event TokensRescued(address indexed token, uint256 amount);
    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyOwnerOrOperator() {
        require(
            msg.sender == owner() || operators[msg.sender],
            "MerkleClaimMorbius: not owner or operator"
        );
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _morbiusToken) Ownable(msg.sender) {
        require(_morbiusToken != address(0), "MerkleClaimMorbius: zero token");
        morbiusToken = IERC20(_morbiusToken);
    }

    // -------------------------------------------------------------------------
    // Operator Management (onlyOwner)
    // -------------------------------------------------------------------------

    function addOperator(address operator) external onlyOwner {
        require(operator != address(0), "MerkleClaimMorbius: zero address");
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
     * @notice Deposit MORBIUS rewards into the contract for distribution.
     * @param amount Amount of MORBIUS to deposit (18 decimals).
     */
    function depositRewards(uint256 amount) external onlyOwnerOrOperator nonReentrant {
        require(amount > 0, "MerkleClaimMorbius: zero amount");
        morbiusToken.safeTransferFrom(msg.sender, address(this), amount);
        emit RewardsDeposited(amount);
    }

    /**
     * @notice Publish the Merkle root for an epoch, enabling claims.
     * @param epochId    Unique epoch identifier (matches backend epoch number).
     * @param root       Merkle root of the {epochId, address, amount} leaves.
     * @param totalAmount Total MORBIUS allocated to this epoch (informational; must be <= contract balance).
     */
    function setEpochRoot(
        uint256 epochId,
        bytes32 root,
        uint256 totalAmount
    ) external onlyOwnerOrOperator {
        require(root != bytes32(0), "MerkleClaimMorbius: empty root");
        require(epochRoots[epochId] == bytes32(0), "MerkleClaimMorbius: epoch already set");
        require(totalAmount > 0, "MerkleClaimMorbius: zero total");
        epochRoots[epochId] = root;
        epochTotalAmount[epochId] = totalAmount;
        emit EpochCreated(epochId, root, totalAmount);
    }

    /**
     * @notice Revoke an epoch that has not yet been claimed from.
     *         Clears the root so the epochId can potentially be reused.
     * @param epochId Epoch to revoke.
     */
    function revokeEpoch(uint256 epochId) external onlyOwner {
        require(epochRoots[epochId] != bytes32(0), "MerkleClaimMorbius: epoch not set");
        require(epochClaimedAmount[epochId] == 0, "MerkleClaimMorbius: already has claims");
        epochRoots[epochId] = bytes32(0);
        epochTotalAmount[epochId] = 0;
        emit EpochRevoked(epochId);
    }

    /**
     * @notice Rescue ERC-20 tokens accidentally sent to this contract.
     *         Cannot rescue more than the unclaimed balance of any active epoch.
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
        require(epochRoots[epochId] != bytes32(0), "MerkleClaimMorbius: epoch not found");
        require(!hasClaimed[epochId][msg.sender], "MerkleClaimMorbius: already claimed");
        require(amount > 0, "MerkleClaimMorbius: zero amount");

        // Verify Merkle proof (double-hash leaf)
        bytes32 leaf = keccak256(
            bytes.concat(keccak256(abi.encodePacked(epochId, msg.sender, amount)))
        );
        require(
            MerkleProof.verify(proof, epochRoots[epochId], leaf),
            "MerkleClaimMorbius: invalid proof"
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
}
