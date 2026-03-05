/** Returns true if a keeper private key is configured. */
export declare function isMerkleKeeperConfigured(): boolean;
/** Returns the keeper wallet address, or null if not configured. */
export declare function getMerkleKeeperAddress(): string | null;
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
 * Set the Merkle root for an epoch on-chain.
 */
export declare function setEpochRootOnChain(epochNumber: number, merkleRoot: `0x${string}`, totalAmount: bigint): Promise<TxResult>;
export {};
//# sourceMappingURL=merkle-claim.d.ts.map