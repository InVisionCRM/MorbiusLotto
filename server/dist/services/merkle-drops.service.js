"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MerkleDropsService = void 0;
const ethers_1 = require("ethers");
const logger_1 = require("../utils/logger");
const merkle_claim_1 = require("../utils/merkle-claim");
const MORBIUS_TOKEN_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';
const PULSECHAIN_API = 'https://api.scan.pulsechain.com/api/v2';
const HOLDERS_PAGE_SIZE = 50;
// ─────────────────────────────────────────────────────────────────────────────
// Merkle tree (OZ-compatible: sorted leaves, double-hash)
// ─────────────────────────────────────────────────────────────────────────────
function hashLeaf(epochId, address, amountWei) {
    const packed = ethers_1.ethers.solidityPacked(['uint256', 'address', 'uint256'], [BigInt(epochId), address, amountWei]);
    const inner = ethers_1.ethers.keccak256(packed);
    return ethers_1.ethers.keccak256(inner); // double-hash
}
function hashPair(a, b) {
    const [lo, hi] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
    return ethers_1.ethers.keccak256(ethers_1.ethers.concat([lo, hi]));
}
function buildMerkleTree(leaves) {
    if (leaves.length === 0)
        throw new Error('Cannot build Merkle tree from empty leaf set');
    const sorted = [...leaves].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    const layers = [sorted];
    while (layers[layers.length - 1].length > 1) {
        const current = layers[layers.length - 1];
        const next = [];
        for (let i = 0; i < current.length; i += 2) {
            if (i + 1 < current.length) {
                next.push(hashPair(current[i], current[i + 1]));
            }
            else {
                next.push(current[i]); // odd leaf carries up unchanged
            }
        }
        layers.push(next);
    }
    const root = layers[layers.length - 1][0];
    function getProof(leaf) {
        const proof = [];
        let idx = layers[0].findIndex((l) => l.toLowerCase() === leaf.toLowerCase());
        if (idx === -1)
            throw new Error(`Leaf not found: ${leaf}`);
        for (let level = 0; level < layers.length - 1; level++) {
            const layer = layers[level];
            const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
            if (siblingIdx < layer.length) {
                proof.push(layer[siblingIdx]);
            }
            idx = Math.floor(idx / 2);
        }
        return proof;
    }
    return { root, getProof };
}
// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────
class MerkleDropsService {
    pool;
    cronTimer = null;
    constructor(pool) {
        this.pool = pool;
    }
    // ──────────────────────────────────────────────────────────
    // Epoch management
    // ──────────────────────────────────────────────────────────
    /** Create a new epoch record and kick off the holder snapshot. */
    async createEpoch(options = {}) {
        const { minHoldingThreshold = 1000, snapshotBlock, cronTriggered = false } = options;
        // Get next epoch number
        const { rows } = await this.pool.query('SELECT MAX(epoch_number) AS max FROM merkle_epochs');
        const nextNumber = (rows[0].max ?? 0) + 1;
        const insert = await this.pool.query(`INSERT INTO merkle_epochs
         (epoch_number, min_holding_threshold, cron_triggered)
       VALUES ($1, $2, $3)
       RETURNING *`, [nextNumber, minHoldingThreshold, cronTriggered]);
        const epoch = insert.rows[0];
        logger_1.logger.info(`[MerkleDrops] Created epoch #${nextNumber} (id=${epoch.id})`);
        // Start snapshot immediately
        await this.takeSnapshot(epoch.id, snapshotBlock);
        return this.getEpoch(epoch.id);
    }
    /** Fetch a single epoch by DB id. */
    async getEpoch(epochId) {
        const { rows } = await this.pool.query('SELECT * FROM merkle_epochs WHERE id = $1', [epochId]);
        return rows[0] ?? null;
    }
    /** Fetch all epochs (newest first). */
    async listEpochs() {
        const { rows } = await this.pool.query('SELECT * FROM merkle_epochs ORDER BY epoch_number DESC');
        return rows;
    }
    /** Fetch published epochs (for public API). */
    async listPublishedEpochs() {
        const { rows } = await this.pool.query("SELECT * FROM merkle_epochs WHERE status = 'published' ORDER BY epoch_number DESC");
        return rows;
    }
    // ──────────────────────────────────────────────────────────
    // Snapshot
    // ──────────────────────────────────────────────────────────
    /**
     * Fetch all MORBIUS holders from PulseChain API, filter blocklist + dust,
     * and store results in merkle_snapshots.
     */
    async takeSnapshot(epochId, blockNumber) {
        const epoch = await this.getEpoch(epochId);
        if (!epoch)
            throw new Error(`Epoch ${epochId} not found`);
        const minThreshold = BigInt(
        // The threshold is stored as plain MORBIUS units (e.g. 1000), convert to wei
        Math.floor(Number(epoch.min_holding_threshold)) * 1e18);
        // Load blocklist from DB (includes ALL_DEPLOYMENTS.MD rows from migration 053)
        const { rows: blockedRows } = await this.pool.query('SELECT address FROM merkle_blocklist');
        const blocklist = new Set(blockedRows.map((r) => r.address.toLowerCase()));
        logger_1.logger.info(`[MerkleDrops] Snapshot epoch #${epoch.epoch_number}: fetching holders...`);
        const rawHolders = await this.fetchAllHolders();
        logger_1.logger.info(`[MerkleDrops] Total holders from API: ${rawHolders.length}`);
        // Deduplicate — PulseChain API can return the same address across pages.
        // Keep the highest balance if duplicated.
        const holderMap = new Map();
        for (const { address, balance } of rawHolders) {
            const key = address.toLowerCase();
            const existing = holderMap.get(key);
            if (existing === undefined || balance > existing) {
                holderMap.set(key, balance);
            }
        }
        const holders = Array.from(holderMap, ([address, balance]) => ({ address, balance }));
        if (holders.length !== rawHolders.length) {
            logger_1.logger.info(`[MerkleDrops] Deduplicated: ${rawHolders.length} → ${holders.length} unique holders`);
        }
        // Filter
        const eligible = holders.filter(({ address, balance }) => {
            if (blocklist.has(address))
                return false;
            return balance >= minThreshold;
        });
        logger_1.logger.info(`[MerkleDrops] Eligible after filtering: ${eligible.length}`);
        // Determine snapshot block
        let snapshotBlock = blockNumber ?? null;
        if (!snapshotBlock) {
            try {
                const resp = await fetch(`${PULSECHAIN_API}/blocks?type=block&page_size=1`);
                if (resp.ok) {
                    const data = await resp.json();
                    snapshotBlock = data.items?.[0]?.height ?? null;
                }
            }
            catch {
                // non-critical; leave null
            }
        }
        // Persist in a transaction (delete old snapshots for this epoch first)
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM merkle_snapshots WHERE epoch_id = $1', [epochId]);
            for (const { address, balance } of eligible) {
                await client.query(`INSERT INTO merkle_snapshots (epoch_id, wallet_address, morbius_balance)
           VALUES ($1, $2, $3)`, [epochId, address.toLowerCase(), balance.toString()]);
            }
            const totalBalance = eligible.reduce((sum, h) => sum + h.balance, 0n).toString();
            await client.query(`UPDATE merkle_epochs
         SET status = 'snapshot', total_holders = $1, total_balance = $2,
             snapshot_block = $3, snapshot_at = NOW()
         WHERE id = $4`, [eligible.length, totalBalance, snapshotBlock, epochId]);
            await client.query('COMMIT');
            logger_1.logger.info(`[MerkleDrops] Snapshot stored: ${eligible.length} holders, block ${snapshotBlock}`);
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    // ──────────────────────────────────────────────────────────
    // Reward calculation
    // ──────────────────────────────────────────────────────────
    /**
     * Assign proportional rewards to each snapshot holder, rolling up unclaimed
     * rewards from previous published epochs.
     *
     * @param epochId       DB epoch id
     * @param newRewardWei  NEW MORBIUS to distribute this epoch in wei (18 decimals, as string).
     *                      This is the amount the admin will physically deposit.
     *                      Unclaimed amounts from prior epochs are added automatically.
     */
    async calculateRewards(epochId, newRewardWei) {
        const epoch = await this.getEpoch(epochId);
        if (!epoch)
            throw new Error(`Epoch ${epochId} not found`);
        if (!['snapshot'].includes(epoch.status)) {
            throw new Error(`Epoch must be in 'snapshot' status to calculate rewards (current: ${epoch.status})`);
        }
        // Guard: prevent twin-epoch double-rollup.
        // If another epoch is already in 'calculated' or 'finalized' state, both
        // epochs would share the same rollup pool from prior published epochs.
        // When both get published the next epoch rolls them up together, counting
        // the same pool twice and creating phantom MORBIUS obligations.
        const { rows: pendingEpochs } = await this.pool.query(`SELECT id, epoch_number, status FROM merkle_epochs
       WHERE status IN ('calculated', 'finalized') AND id != $1`, [epochId]);
        if (pendingEpochs.length > 0) {
            throw new Error(`Cannot calculate rewards: epoch(s) ${pendingEpochs.map((e) => `#${e.epoch_number} (${e.status})`).join(', ')} ` +
                `are pending publication. Publish or revoke them before calculating a new epoch.`);
        }
        // Sync on-chain claim status so rollup only includes truly unclaimed amounts.
        // Otherwise we roll up prior rewards that were already claimed on-chain but have claimed_at = NULL in DB.
        try {
            await this.syncClaimStatus();
        }
        catch (err) {
            logger_1.logger.warn('[MerkleDrops] syncClaimStatus failed before calculateRewards — rollup may be inflated', err);
        }
        const { rows: snapshots } = await this.pool.query('SELECT wallet_address, morbius_balance FROM merkle_snapshots WHERE epoch_id = $1', [epochId]);
        if (snapshots.length === 0)
            throw new Error('No snapshots found for epoch');
        const newReward = BigInt(newRewardWei);
        const totalBalance = snapshots.reduce((s, r) => s + BigInt(r.morbius_balance), 0n);
        if (totalBalance === 0n)
            throw new Error('Total snapshot balance is zero');
        // ── Find unclaimed rewards from prior published epochs ──────────────────
        // "Unclaimed" = published epoch, no superseded_by_epoch_id, no claimed_at
        const walletAddresses = snapshots.map((s) => s.wallet_address);
        const { rows: priorRows } = await this.pool.query(`SELECT ms.id, ms.wallet_address, ms.reward_amount
       FROM merkle_snapshots ms
       JOIN merkle_epochs me ON me.id = ms.epoch_id
       WHERE ms.wallet_address = ANY($1)
         AND me.status = 'published'
         AND ms.superseded_by_epoch_id IS NULL
         AND ms.claimed_at IS NULL
         AND ms.epoch_id != $2
         AND CAST(ms.reward_amount AS NUMERIC) > 0`, [walletAddresses, epochId]);
        // wallet_address → total unclaimed from prior epochs
        const priorUnclaimedMap = new Map();
        const priorSnapshotIds = [];
        for (const row of priorRows) {
            const addr = row.wallet_address;
            priorUnclaimedMap.set(addr, (priorUnclaimedMap.get(addr) ?? 0n) + BigInt(row.reward_amount));
            priorSnapshotIds.push(row.id);
        }
        const totalRollup = [...priorUnclaimedMap.values()].reduce((s, v) => s + v, 0n);
        const totalReward = newReward + totalRollup;
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            // Strictly proportional to morbius_balance (not equal per holder): share = (balance / totalBalance) * newReward
            const SCALE = BigInt('1000000000000000000'); // 1e18
            let distributedNew = 0n;
            const assignments = [];
            for (let i = 0; i < snapshots.length; i++) {
                const { wallet_address, morbius_balance } = snapshots[i];
                let newShare;
                if (i === snapshots.length - 1) {
                    // Last holder gets the remainder to avoid dust from integer division
                    newShare = newReward - distributedNew;
                }
                else {
                    newShare = (BigInt(morbius_balance) * SCALE * newReward) / (totalBalance * SCALE);
                }
                distributedNew += newShare;
                // Add rolled-up prior unclaimed rewards
                const rolledUp = priorUnclaimedMap.get(wallet_address) ?? 0n;
                assignments.push({ address: wallet_address, reward: newShare + rolledUp });
            }
            for (const { address, reward } of assignments) {
                await client.query('UPDATE merkle_snapshots SET reward_amount = $1 WHERE epoch_id = $2 AND wallet_address = $3', [reward.toString(), epochId, address]);
            }
            // Safeguard: if every holder got the same amount, something may be wrong (e.g. equal split or identical snapshot balances)
            const { rows: distinctCheck } = await client.query('SELECT COUNT(DISTINCT reward_amount) AS cnt FROM merkle_snapshots WHERE epoch_id = $1', [epochId]);
            if (distinctCheck[0] && Number(distinctCheck[0].cnt) === 1) {
                logger_1.logger.warn(`[MerkleDrops] Epoch #${epoch.epoch_number}: all ${snapshots.length} holders have the same reward_amount. ` +
                    'Expected proportional distribution by MORBIUS balance. Check snapshot balances or recalculate.');
            }
            // Mark superseded prior snapshot rows
            if (priorSnapshotIds.length > 0) {
                await client.query('UPDATE merkle_snapshots SET superseded_by_epoch_id = $1 WHERE id = ANY($2)', [epochId, priorSnapshotIds]);
            }
            await client.query(`UPDATE merkle_epochs
         SET status = 'calculated',
             total_reward_amount = $1,
             new_reward_amount = $2,
             rollup_amount = $3,
             calculated_at = NOW()
         WHERE id = $4`, [totalReward.toString(), newRewardWei, totalRollup.toString(), epochId]);
            await client.query('COMMIT');
            logger_1.logger.info(`[MerkleDrops] Rewards calculated for epoch #${epoch.epoch_number}: ${snapshots.length} holders, ` +
                `${ethers_1.ethers.formatEther(newReward)} new + ${ethers_1.ethers.formatEther(totalRollup)} rolled-up = ` +
                `${ethers_1.ethers.formatEther(totalReward)} MORBIUS total`);
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    // ──────────────────────────────────────────────────────────
    // Merkle tree generation
    // ──────────────────────────────────────────────────────────
    /**
     * Build the Merkle tree from calculated snapshots, store proofs, and return the root.
     */
    async generateMerkleTree(epochId) {
        const epoch = await this.getEpoch(epochId);
        if (!epoch)
            throw new Error(`Epoch ${epochId} not found`);
        if (epoch.status !== 'calculated') {
            throw new Error(`Epoch must be in 'calculated' status to generate tree (current: ${epoch.status})`);
        }
        const { rows: snapshots } = await this.pool.query('SELECT wallet_address, reward_amount FROM merkle_snapshots WHERE epoch_id = $1 AND reward_amount > 0', [epochId]);
        if (snapshots.length === 0)
            throw new Error('No eligible snapshots with reward_amount > 0');
        // Build leaves
        const leafData = snapshots.map(({ wallet_address, reward_amount }) => {
            const amountWei = BigInt(reward_amount);
            const leaf = hashLeaf(epoch.epoch_number, wallet_address, amountWei);
            return { address: wallet_address, amountWei, leaf };
        });
        const { root, getProof } = buildMerkleTree(leafData.map((l) => l.leaf));
        logger_1.logger.info(`[MerkleDrops] Merkle root for epoch #${epoch.epoch_number}: ${root}`);
        // Store proofs
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const { address, leaf } of leafData) {
                const proof = getProof(leaf);
                await client.query('UPDATE merkle_snapshots SET merkle_proof = $1 WHERE epoch_id = $2 AND wallet_address = $3', [JSON.stringify(proof), epochId, address]);
            }
            await client.query(`UPDATE merkle_epochs
         SET status = 'finalized', merkle_root = $1, finalized_at = NOW()
         WHERE id = $2`, [root, epochId]);
            await client.query('COMMIT');
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
        return root;
    }
    // ──────────────────────────────────────────────────────────
    // Publish
    // ──────────────────────────────────────────────────────────
    /** Mark epoch as published (admin has set the root on-chain). */
    async markPublished(epochId) {
        const epoch = await this.getEpoch(epochId);
        if (!epoch)
            throw new Error(`Epoch ${epochId} not found`);
        if (epoch.status !== 'finalized') {
            throw new Error(`Epoch must be in 'finalized' status to publish (current: ${epoch.status})`);
        }
        await this.pool.query("UPDATE merkle_epochs SET status = 'published', published_at = NOW() WHERE id = $1", [epochId]);
        logger_1.logger.info(`[MerkleDrops] Epoch #${epoch.epoch_number} marked as published`);
    }
    /**
     * Revoke an epoch — reset DB status to 'finalized' after the on-chain revokeEpoch() call
     * clears the Merkle root. This allows re-publishing with a corrected root.
     */
    async revokeEpoch(epochId) {
        const epoch = await this.getEpoch(epochId);
        if (!epoch)
            throw new Error(`Epoch ${epochId} not found`);
        if (epoch.status !== 'finalized' && epoch.status !== 'published') {
            throw new Error(`Epoch must be finalized or published to revoke (current: ${epoch.status})`);
        }
        await this.pool.query("UPDATE merkle_epochs SET status = 'finalized', published_at = NULL WHERE id = $1", [epochId]);
        logger_1.logger.info(`[MerkleDrops] Epoch #${epoch.epoch_number} revoked — status reset to finalized`);
    }
    // ──────────────────────────────────────────────────────────
    // Claim proof lookup (public)
    // ──────────────────────────────────────────────────────────
    /**
     * Return the Merkle proof and reward amount for a given wallet in a published epoch.
     *
     * If the wallet's entry was superseded (rolled into a newer epoch), returns the
     * entry with `supersededByEpochNumber` set and an empty proof — the user should
     * claim from the newer epoch instead.
     *
     * Returns null if the wallet was not in this epoch at all.
     */
    async getClaimProof(epochNumber, walletAddress) {
        const { rows: epochRows } = await this.pool.query("SELECT * FROM merkle_epochs WHERE epoch_number = $1 AND status = 'published'", [epochNumber]);
        if (!epochRows[0])
            return null;
        const epoch = epochRows[0];
        const { rows } = await this.pool.query(`SELECT ms.wallet_address, ms.reward_amount, ms.merkle_proof,
              ms.superseded_by_epoch_id,
              me2.epoch_number AS superseded_by_epoch_number
       FROM merkle_snapshots ms
       LEFT JOIN merkle_epochs me2 ON me2.id = ms.superseded_by_epoch_id
       WHERE ms.epoch_id = $1 AND ms.wallet_address = $2`, [epoch.id, walletAddress.toLowerCase()]);
        if (!rows[0])
            return null;
        const row = rows[0];
        // Superseded: entry exists but was rolled into a newer epoch
        if (row.superseded_by_epoch_id !== null) {
            return {
                epochId: epoch.id,
                epochNumber: epoch.epoch_number,
                amount: row.reward_amount,
                proof: [],
                supersededByEpochNumber: row.superseded_by_epoch_number,
            };
        }
        if (!row.merkle_proof)
            return null;
        return {
            epochId: epoch.id,
            epochNumber: epoch.epoch_number,
            amount: row.reward_amount,
            proof: row.merkle_proof,
            supersededByEpochNumber: null,
        };
    }
    /** Paginated snapshot data for a single epoch (admin view). */
    async getSnapshotPage(epochId, page = 1, pageSize = 50) {
        const offset = (page - 1) * pageSize;
        const [data, count] = await Promise.all([
            this.pool.query('SELECT wallet_address, morbius_balance, reward_amount, merkle_proof FROM merkle_snapshots WHERE epoch_id = $1 ORDER BY morbius_balance DESC LIMIT $2 OFFSET $3', [epochId, pageSize, offset]),
            this.pool.query('SELECT COUNT(*) FROM merkle_snapshots WHERE epoch_id = $1', [epochId]),
        ]);
        return { rows: data.rows, total: Number(count.rows[0].count) };
    }
    // ──────────────────────────────────────────────────────────
    // Blocklist
    // ──────────────────────────────────────────────────────────
    async listBlocklist() {
        const { rows } = await this.pool.query('SELECT address, reason, added_at FROM merkle_blocklist ORDER BY added_at DESC');
        return rows;
    }
    async addToBlocklist(address, reason) {
        await this.pool.query('INSERT INTO merkle_blocklist (address, reason) VALUES ($1, $2) ON CONFLICT (address) DO UPDATE SET reason = $2', [address.toLowerCase(), reason]);
    }
    async removeFromBlocklist(address) {
        await this.pool.query('DELETE FROM merkle_blocklist WHERE address = $1', [address.toLowerCase()]);
    }
    // ──────────────────────────────────────────────────────────
    // Settings (schedule + default reward)
    // ──────────────────────────────────────────────────────────
    /** Read all settings into a plain key→value map. */
    async getSettings() {
        const { rows } = await this.pool.query('SELECT key, value FROM merkle_settings');
        const result = {};
        for (const r of rows)
            result[r.key] = r.value;
        return result;
    }
    /** Upsert one or more settings. Restarts cron if schedule keys changed. */
    async updateSettings(patch) {
        const scheduleKeys = new Set(['schedule_type', 'schedule_day', 'schedule_hour_utc']);
        const scheduleChanged = Object.keys(patch).some((k) => scheduleKeys.has(k));
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const [key, value] of Object.entries(patch)) {
                await client.query(`INSERT INTO merkle_settings (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`, [key, value]);
            }
            await client.query('COMMIT');
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
        if (scheduleChanged && this.cronTimer) {
            // Restart cron so new schedule takes effect
            this.restartCron();
        }
        logger_1.logger.info('[MerkleDrops] Settings updated', patch);
    }
    // ──────────────────────────────────────────────────────────
    // Auto-publish (server-side on-chain transactions)
    // ──────────────────────────────────────────────────────────
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
    async syncClaimStatus() {
        // Find all unclaimed snapshot rows from published epochs
        const { rows } = await this.pool.query(`SELECT ms.id, me.epoch_number, ms.wallet_address
       FROM merkle_snapshots ms
       JOIN merkle_epochs me ON me.id = ms.epoch_id
       WHERE me.status = 'published'
         AND ms.claimed_at IS NULL
         AND ms.superseded_by_epoch_id IS NULL
         AND CAST(ms.reward_amount AS NUMERIC) > 0`);
        if (rows.length === 0)
            return 0;
        let synced = 0;
        // Batch check in chunks to avoid overwhelming the RPC
        const BATCH_SIZE = 20;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(batch.map((r) => (0, merkle_claim_1.checkHasClaimed)(r.epoch_number, r.wallet_address)
                .then((claimed) => ({ id: r.id, claimed }))
                .catch(() => ({ id: r.id, claimed: false }))));
            const claimedIds = results.filter((r) => r.claimed).map((r) => r.id);
            if (claimedIds.length > 0) {
                await this.pool.query('UPDATE merkle_snapshots SET claimed_at = NOW() WHERE id = ANY($1)', [claimedIds]);
                synced += claimedIds.length;
            }
        }
        if (synced > 0) {
            logger_1.logger.info(`[MerkleDrops] Synced ${synced} on-chain claims into DB`);
        }
        return synced;
    }
    /**
     * Query the on-chain MORBIUS balance of the MerkleClaim contract,
     * subtract what's still owed to users (unclaimed rewards from published epochs),
     * and return the available amount for a new epoch.
     */
    async getAvailableContractBalance() {
        const contractBalance = await (0, merkle_claim_1.getContractMorbiusBalance)();
        // Sum only the UNCLAIMED reward amounts from published epochs.
        // Claimed rewards already left the contract, so we don't subtract those.
        // Superseded snapshots have been rolled into a newer epoch, so exclude those too.
        const { rows } = await this.pool.query(`SELECT COALESCE(SUM(CAST(ms.reward_amount AS NUMERIC)), 0) AS total
       FROM merkle_snapshots ms
       JOIN merkle_epochs me ON me.id = ms.epoch_id
       WHERE me.status = 'published'
         AND ms.claimed_at IS NULL
         AND ms.superseded_by_epoch_id IS NULL
         AND CAST(ms.reward_amount AS NUMERIC) > 0`);
        const owedWei = BigInt(rows[0]?.total ?? '0');
        const available = contractBalance > owedWei ? contractBalance - owedWei : 0n;
        logger_1.logger.info(`[MerkleDrops] Contract balance: ${contractBalance}, owed (unclaimed): ${owedWei}, available: ${available}`);
        return available;
    }
    async autoFinalizeAndPublish(epochId) {
        if (!(0, merkle_claim_1.isMerkleKeeperConfigured)()) {
            logger_1.logger.warn('[MerkleDrops] auto_publish_onchain enabled but no keeper key configured — skipping on-chain publish');
            return;
        }
        try {
            // Re-fetch epoch to check current status
            let epoch = await this.getEpoch(epochId);
            if (!epoch)
                throw new Error(`Epoch ${epochId} not found`);
            let root;
            if (epoch.status === 'finalized' && epoch.merkle_root) {
                // Already finalized — skip tree generation, just need to publish on-chain
                root = epoch.merkle_root;
                logger_1.logger.info(`[MerkleDrops] Epoch ${epochId} already finalized, root: ${root} — retrying on-chain publish`);
            }
            else {
                // 1. Finalize — build Merkle tree
                logger_1.logger.info(`[MerkleDrops] Auto-finalizing epoch ${epochId}`);
                root = await this.generateMerkleTree(epochId);
                logger_1.logger.info(`[MerkleDrops] Merkle root generated: ${root}`);
                epoch = await this.getEpoch(epochId);
                if (!epoch)
                    throw new Error(`Epoch ${epochId} not found after finalize`);
            }
            const totalWei = BigInt(epoch.total_reward_amount || '0');
            // 2. Set epoch root on-chain (tokens already in contract via game fees)
            const setRootResult = await (0, merkle_claim_1.setEpochRootOnChain)(epoch.epoch_number, root, totalWei);
            if (!setRootResult.success) {
                // If the root is already set on-chain, that's fine — just mark published in DB
                if (setRootResult.error && /epoch already set/i.test(setRootResult.error)) {
                    logger_1.logger.info(`[MerkleDrops] Epoch #${epoch.epoch_number} root already on-chain — marking published in DB`);
                }
                else {
                    logger_1.logger.error(`[MerkleDrops] Auto-publish: setEpochRoot failed — ${setRootResult.error}`);
                    return;
                }
            }
            // 3. Mark published in DB
            await this.markPublished(epochId);
            logger_1.logger.info(`[MerkleDrops] Auto-published epoch #${epoch.epoch_number} successfully`);
        }
        catch (err) {
            logger_1.logger.error('[MerkleDrops] Auto-finalize/publish failed', err);
        }
    }
    // ──────────────────────────────────────────────────────────
    // Cron
    // ──────────────────────────────────────────────────────────
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
    startCron() {
        if (this.cronTimer)
            return; // already running
        logger_1.logger.info('[MerkleDrops] Cron starting…');
        let lastFiredWeek = -1; // for biweekly tracking
        let lastIntervalFiredAt = 0; // timestamp of last interval fire
        this.cronTimer = setInterval(async () => {
            try {
                // Read settings fresh each tick so changes take effect without restart
                const settings = await this.getSettings();
                const scheduleType = settings['schedule_type'] ?? 'manual';
                if (scheduleType === 'manual')
                    return;
                const scheduleDay = parseInt(settings['schedule_day'] ?? process.env.MERKLE_DROP_WEEKLY_DAY ?? '5', 10);
                const scheduleHour = parseInt(settings['schedule_hour_utc'] ?? process.env.MERKLE_DROP_WEEKLY_HOUR ?? '12', 10);
                const scheduleInterval = parseInt(settings['schedule_interval'] ?? '60', 10);
                const defaultRewardWei = settings['default_reward_wei'] ?? '0';
                const now = new Date();
                const nowMs = now.getTime();
                const utcDay = now.getUTCDay(); // 0=Sun..6=Sat
                const utcDate = now.getUTCDate(); // 1-31
                const utcHour = now.getUTCHours();
                const utcMinute = now.getUTCMinutes();
                let shouldFire = false;
                if (scheduleType === 'interval_minutes') {
                    // Fire every N minutes, aligned to clock
                    const intervalMs = Math.max(scheduleInterval, 1) * 60_000;
                    const currentSlot = Math.floor(nowMs / intervalMs);
                    const lastSlot = Math.floor(lastIntervalFiredAt / intervalMs);
                    if (currentSlot > lastSlot) {
                        shouldFire = true;
                        lastIntervalFiredAt = nowMs;
                    }
                }
                else if (scheduleType === 'interval_hours') {
                    // Fire every N hours on the hour
                    if (utcMinute === 0) {
                        const intervalMs = Math.max(scheduleInterval, 1) * 3_600_000;
                        const currentSlot = Math.floor(nowMs / intervalMs);
                        const lastSlot = Math.floor(lastIntervalFiredAt / intervalMs);
                        if (currentSlot > lastSlot) {
                            shouldFire = true;
                            lastIntervalFiredAt = nowMs;
                        }
                    }
                }
                else {
                    // weekly / biweekly / monthly — only fire on the hour
                    if (utcMinute !== 0)
                        return;
                    if (scheduleType === 'weekly') {
                        shouldFire = utcDay === scheduleDay && utcHour === scheduleHour;
                    }
                    else if (scheduleType === 'biweekly') {
                        // Fire on the configured day/hour, but only every other week
                        if (utcDay === scheduleDay && utcHour === scheduleHour) {
                            const weekNum = Math.floor(now.getTime() / (7 * 24 * 3600 * 1000));
                            if (weekNum !== lastFiredWeek && weekNum % 2 === 0) {
                                shouldFire = true;
                                lastFiredWeek = weekNum;
                            }
                        }
                    }
                    else if (scheduleType === 'monthly') {
                        shouldFire = utcDate === scheduleDay && utcHour === scheduleHour;
                    }
                }
                if (!shouldFire)
                    return;
                logger_1.logger.info(`[MerkleDrops] Cron fired (${scheduleType}): creating epoch automatically`);
                // ── Recover stuck epochs before creating a new one ──────────────────
                // If a prior epoch is stuck at 'calculated' or 'finalized', the twin-epoch
                // guard will block calculateRewards for any new epoch. Recover first:
                //   - calculated with 0 rewards → reset to snapshot (harmless dead epoch)
                //   - calculated/finalized with rewards → retry finalize+publish
                const { rows: stuckEpochs } = await this.pool.query(`SELECT id, epoch_number, status, total_reward_amount FROM merkle_epochs
           WHERE status IN ('calculated', 'finalized') ORDER BY id`);
                if (stuckEpochs.length > 0) {
                    const autoPublish = settings['auto_publish_onchain'] === 'true';
                    for (const stuck of stuckEpochs) {
                        const totalReward = BigInt(stuck.total_reward_amount || '0');
                        if (totalReward === 0n) {
                            // Zero-reward epoch — just reset it so it stops blocking
                            logger_1.logger.info(`[MerkleDrops] Resetting stuck zero-reward epoch #${stuck.epoch_number} (${stuck.status}) → snapshot`);
                            await this.pool.query(`UPDATE merkle_epochs SET status = 'snapshot', calculated_at = NULL,
                 total_reward_amount = '0', new_reward_amount = '0', rollup_amount = '0'
                 WHERE id = $1`, [stuck.id]);
                        }
                        else if (autoPublish) {
                            // Has rewards — retry finalize+publish
                            logger_1.logger.info(`[MerkleDrops] Retrying finalize+publish for stuck epoch #${stuck.epoch_number} (${stuck.status})`);
                            try {
                                await this.autoFinalizeAndPublish(stuck.id);
                            }
                            catch (retryErr) {
                                logger_1.logger.error(`[MerkleDrops] Retry finalize+publish failed for epoch #${stuck.epoch_number}`, retryErr);
                                // Still stuck — skip creating a new epoch this tick
                                return;
                            }
                        }
                        else {
                            // Can't auto-publish — just warn and bail
                            logger_1.logger.warn(`[MerkleDrops] Epoch #${stuck.epoch_number} stuck at ${stuck.status} — manual intervention required`);
                            return;
                        }
                    }
                }
                // Sync on-chain claim status before calculating rollups
                try {
                    await this.syncClaimStatus();
                }
                catch (err) {
                    logger_1.logger.error('[MerkleDrops] Failed to sync claim status — continuing anyway', err);
                }
                // Determine reward amount:
                //   - If default_reward_wei is set, use that fixed amount
                //   - Otherwise, read the available contract balance (fees that have accumulated)
                let rewardWei = defaultRewardWei;
                if (rewardWei === '0' || BigInt(rewardWei) === 0n) {
                    try {
                        const available = await this.getAvailableContractBalance();
                        if (available === 0n) {
                            logger_1.logger.info('[MerkleDrops] No available MORBIUS in contract — skipping epoch');
                            return;
                        }
                        rewardWei = available.toString();
                        logger_1.logger.info(`[MerkleDrops] Using contract balance as reward: ${rewardWei} wei`);
                    }
                    catch (err) {
                        logger_1.logger.error('[MerkleDrops] Failed to read contract balance — skipping epoch', err);
                        return;
                    }
                }
                const epoch = await this.createEpoch({ cronTriggered: true });
                logger_1.logger.info(`[MerkleDrops] Auto-calculating rewards: ${rewardWei} wei`);
                await this.calculateRewards(epoch.id, rewardWei);
                // Auto-finalize + auto-publish on-chain if enabled
                const autoPublish = settings['auto_publish_onchain'] === 'true';
                if (autoPublish) {
                    await this.autoFinalizeAndPublish(epoch.id);
                }
            }
            catch (err) {
                logger_1.logger.error('[MerkleDrops] Cron epoch creation failed', err);
            }
        }, 60_000); // check every minute
    }
    stopCron() {
        if (this.cronTimer) {
            clearInterval(this.cronTimer);
            this.cronTimer = null;
        }
    }
    restartCron() {
        this.stopCron();
        this.startCron();
        logger_1.logger.info('[MerkleDrops] Cron restarted with updated schedule');
    }
    // ──────────────────────────────────────────────────────────
    // PulseChain API — holder fetch
    // ──────────────────────────────────────────────────────────
    async fetchAllHolders() {
        const holders = [];
        let nextPage = `${PULSECHAIN_API}/tokens/${MORBIUS_TOKEN_ADDRESS}/holders?page_size=${HOLDERS_PAGE_SIZE}`;
        while (nextPage) {
            let resp;
            try {
                resp = await fetch(nextPage);
            }
            catch (err) {
                logger_1.logger.error('[MerkleDrops] PulseChain API fetch error', err);
                break;
            }
            if (!resp.ok) {
                logger_1.logger.error(`[MerkleDrops] PulseChain API returned ${resp.status} for ${nextPage}`);
                break;
            }
            const data = await resp.json();
            for (const item of data.items ?? []) {
                const addr = item.address?.hash?.toLowerCase();
                const balance = BigInt(item.value ?? '0');
                if (addr)
                    holders.push({ address: addr, balance });
            }
            // Build next page URL from params (PulseChain blockscout pagination)
            if (data.next_page_params && Object.keys(data.next_page_params).length > 0) {
                const params = new URLSearchParams(Object.entries(data.next_page_params).map(([k, v]) => [k, String(v)]));
                nextPage = `${PULSECHAIN_API}/tokens/${MORBIUS_TOKEN_ADDRESS}/holders?page_size=${HOLDERS_PAGE_SIZE}&${params}`;
            }
            else {
                nextPage = null;
            }
            // Small delay to be respectful to the public API
            await new Promise((r) => setTimeout(r, 150));
        }
        return holders;
    }
}
exports.MerkleDropsService = MerkleDropsService;
//# sourceMappingURL=merkle-drops.service.js.map