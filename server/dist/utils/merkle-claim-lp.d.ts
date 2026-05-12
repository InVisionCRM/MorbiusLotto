/**
 * merkle-claim-lp.ts
 *
 * On-chain utilities for the MerkleClaimLP contract.
 * Unlike MerkleClaimMorbius, MerkleClaimLP is funded by direct MORBIUS transfers —
 * no approval or depositRewards call required.
 *
 * Also contains helpers for reading LP pair reserves (to calculate MORBIUS-equivalent
 * per LP token) and fetching LP token holders from the PulseChain API.
 */
export declare function isMerkleKeeperConfigured(): boolean;
/** Returns true if the owner private key is configured (required for revokeEpoch). */
export declare function isMerkleOwnerConfigured(): boolean;
/** Returns the configured owner-key wallet address, or null if not configured. */
export declare function getMerkleOwnerKeyAddress(): string | null;
/**
 * Read the MORBIUS balance held by the MerkleClaimLP contract.
 */
export declare function getContractMorbiusBalance(): Promise<bigint>;
/**
 * Check on-chain whether a wallet has claimed for a given LP epoch.
 */
export declare function checkHasClaimed(epochNumber: number, walletAddress: string): Promise<boolean>;
type TxResult = {
    success: boolean;
    txHash?: string;
    error?: string;
};
/**
 * Read the on-chain claimed amount for an LP epoch.
 * If > 0, revokeEpoch() will revert with "already has claims".
 */
export declare function getEpochClaimedAmount(epochNumber: number): Promise<bigint>;
/**
 * Revoke an LP epoch root on-chain. Only succeeds when no on-chain claims
 * have been made against this epoch yet.
 *
 * NOTE: revokeEpoch is onlyOwner. Signed by MERKLE_OWNER_PRIVATE_KEY.
 */
export declare function revokeEpochOnChain(epochNumber: number): Promise<TxResult>;
/**
 * Publish the Merkle root for an epoch on-chain.
 * Tokens must already be in the contract (sent directly via MORBIUS transfer).
 */
export declare function setEpochRootOnChain(epochNumber: number, merkleRoot: `0x${string}`, totalAmount: bigint): Promise<TxResult>;
export interface PairReserveInfo {
    morbiusReserve: bigint;
    totalLPSupply: bigint;
    morbiusPerLP: bigint;
    hasLiquidity: boolean;
}
/**
 * Read a UniswapV2-style pair's reserves and determine the MORBIUS-per-LP-token ratio.
 * Returns hasLiquidity=false if the pair is empty or totalSupply is zero.
 */
export declare function getPairReserveInfo(pairAddress: `0x${string}`): Promise<PairReserveInfo>;
/**
 * Given a holder's LP balance and pair reserve info, calculate the MORBIUS-equivalent.
 */
export declare function calcMorbiusEquivalent(lpBalance: bigint, reserveInfo: PairReserveInfo): bigint;
export interface LPHolder {
    address: string;
    balance: bigint;
}
/**
 * Fetch all holders of an LP token from the PulseChain blockscout API.
 * Returns raw LP balances — MORBIUS-equivalent must be calculated separately.
 */
export declare function fetchLPHolders(pairAddress: string): Promise<LPHolder[]>;
/**
 * Get the latest block number from PulseChain API.
 */
export declare function getLatestBlock(): Promise<number | null>;
export {};
//# sourceMappingURL=merkle-claim-lp.d.ts.map