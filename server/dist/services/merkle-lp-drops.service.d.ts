/**
 * MerkleDropsLPService
 *
 * Epoch-based MORBIUS reward drops for LP token holders across all supported MORBIUS pairs.
 * Snapshot logic: reads LP token holders from PulseChain API for each active pair,
 * calculates MORBIUS-equivalent (lpBalance × morbiusReserve / totalLPSupply),
 * sums per wallet, then builds a Merkle tree for claiming via MerkleClaimLP.
 *
 * No staking required — any wallet holding LP tokens from a supported MORBIUS pair qualifies.
 */
import { Pool } from 'pg';
export interface LPEpochRecord {
    id: number;
    epoch_number: number;
    snapshot_block: string | null;
    total_holders: number;
    total_balance: string;
    total_reward_amount: string;
    new_reward_amount: string;
    rollup_amount: string;
    merkle_root: string | null;
    status: 'pending' | 'snapshot' | 'calculated' | 'finalized' | 'published';
    cron_triggered: boolean;
    created_at: string;
    snapshot_at: string | null;
    calculated_at: string | null;
    finalized_at: string | null;
    published_at: string | null;
}
export interface LPSnapshotRow {
    wallet_address: string;
    morbius_equivalent: string;
    reward_amount: string;
    merkle_proof: string[] | null;
    superseded_by_epoch_id: number | null;
}
export interface LPClaimProof {
    epochId: number;
    epochNumber: number;
    amount: string;
    proof: string[];
    supersededByEpochNumber: number | null;
}
export interface LPPair {
    id: number;
    pair_address: string;
    label: string;
    dex_name: string | null;
    active: boolean;
    added_at: string;
}
export declare class MerkleDropsLPService {
    private pool;
    private cronTimer;
    constructor(pool: Pool);
    listPairs(): Promise<LPPair[]>;
    addPair(pairAddress: string, label: string, dexName?: string): Promise<LPPair>;
    setPairActive(pairAddress: string, active: boolean): Promise<void>;
    removePair(pairAddress: string): Promise<void>;
    createEpoch(options?: {
        cronTriggered?: boolean;
    }): Promise<LPEpochRecord>;
    getEpoch(epochId: number): Promise<LPEpochRecord | null>;
    listEpochs(): Promise<LPEpochRecord[]>;
    listPublishedEpochs(): Promise<LPEpochRecord[]>;
    /**
     * Snapshot all active LP pairs:
     * 1. Fetch LP token holders from PulseChain API for each pair.
     * 2. Read pair reserves to compute MORBIUS-per-LP-token ratio.
     * 3. Calculate MORBIUS-equivalent per holder.
     * 4. Sum across all pairs per wallet.
     * 5. Apply blocklist; store in merkle_lp_snapshots.
     */
    takeSnapshot(epochId: number, blockNumber?: number): Promise<void>;
    calculateRewards(epochId: number, newRewardWei: string): Promise<void>;
    generateMerkleTree(epochId: number): Promise<string>;
    markPublished(epochId: number): Promise<void>;
    revokeEpoch(epochId: number): Promise<void>;
    getClaimProof(epochNumber: number, walletAddress: string): Promise<LPClaimProof | null>;
    /** Paginated snapshot data for an epoch (admin). */
    getSnapshotPage(epochId: number, page?: number, pageSize?: number): Promise<{
        rows: LPSnapshotRow[];
        total: number;
    }>;
    listBlocklist(): Promise<Array<{
        address: string;
        reason: string;
        added_at: string;
    }>>;
    addToBlocklist(address: string, reason: string): Promise<void>;
    removeFromBlocklist(address: string): Promise<void>;
    getSettings(): Promise<Record<string, string>>;
    updateSettings(patch: Record<string, string>): Promise<void>;
    getAvailableContractBalance(): Promise<bigint>;
    syncClaimStatus(): Promise<number>;
    private autoFinalizeAndPublish;
    getScheduleInfo(): Promise<{
        schedule_type: string;
        next_drop_at: string | null;
        countdown_duration: number;
    }>;
    startCron(): void;
    stopCron(): void;
    restartCron(): void;
}
//# sourceMappingURL=merkle-lp-drops.service.d.ts.map