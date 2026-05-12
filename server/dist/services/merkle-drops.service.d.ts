/**
 * MerkleDropsService
 *
 * Off-chain epoch management for MORBIUS holder reward drops:
 *   1. Snapshot MORBIUS holders from PulseChain API
 *   2. Filter excluded addresses (blocklist) and dust wallets
 *   3. Calculate proportional rewards
 *   4. Generate Merkle tree (OZ-compatible double-hash, sorted leaves)
 *   5. Store proofs in DB for user claim lookups
 *   6. Admin publishes root + deposits on-chain (separate step)
 *
 * Cron: optional weekly auto-create via MERKLE_DROP_CRON_SCHEDULE env var
 *       default: '0 12 * * 5' (every Friday at 12:00 UTC)
 */
import { Pool } from 'pg';
export interface EpochRecord {
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
    min_holding_threshold: string;
    cron_triggered: boolean;
    created_at: string;
    snapshot_at: string | null;
    calculated_at: string | null;
    finalized_at: string | null;
    published_at: string | null;
}
export interface SnapshotRow {
    wallet_address: string;
    morbius_balance: string;
    reward_amount: string;
    merkle_proof: string[] | null;
    superseded_by_epoch_id: number | null;
}
export interface ClaimProof {
    epochId: number;
    epochNumber: number;
    amount: string;
    proof: string[];
    supersededByEpochNumber: number | null;
}
export declare class MerkleDropsService {
    private pool;
    private cronTimer;
    constructor(pool: Pool);
    /** Create a new epoch record and kick off the holder snapshot. */
    createEpoch(options?: {
        minHoldingThreshold?: number;
        snapshotBlock?: number;
        cronTriggered?: boolean;
    }): Promise<EpochRecord>;
    /** Fetch a single epoch by DB id. */
    getEpoch(epochId: number): Promise<EpochRecord | null>;
    /** Fetch all epochs (newest first). */
    listEpochs(): Promise<EpochRecord[]>;
    /** Fetch published epochs (for public API). */
    listPublishedEpochs(): Promise<EpochRecord[]>;
    /**
     * Fetch all MORBIUS holders from PulseChain API, filter blocklist + dust,
     * and store results in merkle_snapshots.
     */
    takeSnapshot(epochId: number, blockNumber?: number): Promise<void>;
    /**
     * Assign proportional rewards to each snapshot holder, rolling up unclaimed
     * rewards from previous published epochs.
     *
     * @param epochId       DB epoch id
     * @param newRewardWei  NEW MORBIUS to distribute this epoch in wei (18 decimals, as string).
     *                      This is the amount the admin will physically deposit.
     *                      Unclaimed amounts from prior epochs are added automatically.
     */
    calculateRewards(epochId: number, newRewardWei: string): Promise<void>;
    /**
     * Build the Merkle tree from calculated snapshots, store proofs, and return the root.
     */
    generateMerkleTree(epochId: number): Promise<string>;
    /** Mark epoch as published (admin has set the root on-chain). */
    markPublished(epochId: number): Promise<void>;
    /**
     * Revoke an epoch — reset DB status to 'finalized' after the on-chain revokeEpoch() call
     * clears the Merkle root. This allows re-publishing with a corrected root.
     */
    revokeEpoch(epochId: number): Promise<void>;
    /**
     * Return the Merkle proof and reward amount for a given wallet in a published epoch.
     *
     * If the wallet's entry was superseded (rolled into a newer epoch), returns the
     * entry with `supersededByEpochNumber` set and an empty proof — the user should
     * claim from the newer epoch instead.
     *
     * Returns null if the wallet was not in this epoch at all.
     */
    getClaimProof(epochNumber: number, walletAddress: string): Promise<ClaimProof | null>;
    /** Paginated snapshot data for a single epoch (admin view). */
    getSnapshotPage(epochId: number, page?: number, pageSize?: number): Promise<{
        rows: SnapshotRow[];
        total: number;
    }>;
    listBlocklist(): Promise<Array<{
        address: string;
        reason: string;
        added_at: string;
    }>>;
    addToBlocklist(address: string, reason: string): Promise<void>;
    removeFromBlocklist(address: string): Promise<void>;
    /** Read all settings into a plain key→value map. */
    getSettings(): Promise<Record<string, string>>;
    /** Upsert one or more settings. Restarts cron if schedule keys changed. */
    updateSettings(patch: Record<string, string>): Promise<void>;
    /**
     * Finalize the Merkle tree, then submit on-chain transactions
     * (setEpochRoot) and mark the epoch as published.
     * Called by the cron when auto_publish_onchain is enabled.
     *
     * MORBIUS tokens are expected to already be in the contract
     * (sent directly by game contracts via distributionRecipient).
     * The keeper wallet only needs PLS for gas.
     */
    /**
     * Sync on-chain claim status into the DB.
     * Checks hasClaimed() on-chain for all unclaimed snapshots in published epochs
     * and sets claimed_at where the user has already claimed on-chain.
     */
    syncClaimStatus(): Promise<number>;
    /**
     * Preview which published epochs are eligible for stale-snapshot reclamation.
     * Returns the per-epoch breakdown without making any on-chain or DB writes.
     *
     * An epoch is eligible when:
     *   - status = 'published'
     *   - published_at < NOW() - reclaim_stale_age_days
     *   - epoch_number <= max(epoch_number) - reclaim_min_epochs_back
     *   - it has at least one snapshot with reward > 0 that is unclaimed,
     *     not superseded, and not already reclaimed
     *   - on-chain epochClaimedAmount[epoch_number] == 0  (otherwise revokeEpoch reverts)
     */
    previewReclaimStaleSnapshots(): Promise<{
        ageDays: number;
        minEpochsBack: number;
        candidates: Array<{
            epochNumber: number;
            epochId: number;
            publishedAt: string;
            unclaimedSnapshots: number;
            reclaimableWei: string;
            onChainClaimedWei: string;
            revocable: boolean;
        }>;
        totalReclaimableWei: string;
    }>;
    /**
     * Execute reclamation: for every eligible epoch (per previewReclaimStaleSnapshots),
     * call revokeEpoch() on-chain and mark matching snapshot rows as reclaimed_at.
     *
     * On-chain revoke MUST succeed before the DB row is marked. If revoke reverts
     * (e.g. someone claimed directly from the old root in the meantime), the
     * snapshot row stays as-is and is excluded from this reclamation pass.
     *
     * Returns the per-epoch result and the total wei freed.
     */
    reclaimStaleSnapshots(): Promise<{
        results: Array<{
            epochNumber: number;
            epochId: number;
            reclaimableWei: string;
            reclaimedSnapshots: number;
            revoked: boolean;
            txHash?: string;
            error?: string;
        }>;
        totalReclaimedWei: string;
    }>;
    /**
     * Query the on-chain MORBIUS balance of the MerkleClaim contract,
     * subtract what's still owed to users (unclaimed rewards from published epochs),
     * and return the available amount for a new epoch.
     */
    getAvailableContractBalance(): Promise<bigint>;
    private autoFinalizeAndPublish;
    /**
     * Start the auto-epoch cron.
     * Reads schedule from DB (schedule_type, schedule_day, schedule_hour_utc) first,
     * falling back to env vars (MERKLE_DROP_WEEKLY_DAY, MERKLE_DROP_WEEKLY_HOUR) for
     * backward compatibility.
     *
     * schedule_type:
     *   'manual'   — cron does nothing even if running
     *   'weekly'   — fires once a week on schedule_day at schedule_hour_utc
     *   'biweekly' — fires every other week (tracks last-fired week)
     *   'monthly'  — fires on schedule_day (1–28) of each month at schedule_hour_utc
     */
    startCron(): void;
    stopCron(): void;
    restartCron(): void;
    private fetchAllHolders;
}
//# sourceMappingURL=merkle-drops.service.d.ts.map