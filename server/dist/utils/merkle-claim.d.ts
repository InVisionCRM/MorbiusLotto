/** Returns true if a keeper private key is configured. */
export declare function isMerkleKeeperConfigured(): boolean;
/** Returns the keeper wallet address, or null if not configured. */
export declare function getMerkleKeeperAddress(): string | null;
/** Returns true if the owner private key is configured (required for revokeEpoch). */
export declare function isMerkleOwnerConfigured(): boolean;
/** Returns the configured owner-key wallet address, or null if not configured. */
export declare function getMerkleOwnerKeyAddress(): string | null;
/**
 * Read the MORBIUS token balance held by the MerkleClaim contract on-chain.
 */
export declare function getContractMorbiusBalance(): Promise<bigint>;
/**
 * Check on-chain whether a wallet has claimed for a given epoch.
 */
export declare function checkHasClaimed(epochNumber: number, walletAddress: string): Promise<boolean>;
type TxResult = {
    success: boolean;
    txHash?: string;
    error?: string;
};
/**
 * Ensure the keeper wallet has approved the MerkleClaim contract to spend MORBIUS.
 * Does a max approval if current allowance is below the required amount.
 */
export declare function ensureMorbiusAllowance(requiredAmount: bigint): Promise<TxResult>;
/**
 * Deposit MORBIUS rewards into the MerkleClaim contract.
 */
export declare function depositMorbiusRewards(amount: bigint): Promise<TxResult>;
/**
 * Read the on-chain claimed amount for an epoch.
 * If > 0, revokeEpoch() will revert with "already has claims".
 */
export declare function getEpochClaimedAmount(epochNumber: number): Promise<bigint>;
/**
 * Revoke an epoch root on-chain. Only succeeds when no on-chain claims have
 * been made against this epoch yet (epochClaimedAmount[epochId] == 0).
 *
 * NOTE: revokeEpoch is onlyOwner on the contract. Signed by the wallet
 * derived from MERKLE_OWNER_PRIVATE_KEY (NOT the keeper).
 */
export declare function revokeEpochOnChain(epochNumber: number): Promise<TxResult>;
/**
 * Set the Merkle root for an epoch on-chain.
 */
export declare function setEpochRootOnChain(epochNumber: number, merkleRoot: `0x${string}`, totalAmount: bigint): Promise<TxResult>;
export {};
//# sourceMappingURL=merkle-claim.d.ts.map