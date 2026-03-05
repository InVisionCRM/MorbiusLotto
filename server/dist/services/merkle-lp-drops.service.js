"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MerkleDropsLPService = void 0;
const ethers_1 = require("ethers");
const logger_1 = require("../utils/logger");
const merkle_claim_lp_1 = require("../utils/merkle-claim-lp");
// ─────────────────────────────────────────────────────────────────────────────
// Merkle tree helpers (same OZ double-hash as MerkleDropsService)
// ─────────────────────────────────────────────────────────────────────────────
function hashLeaf(epochId, address, amountWei) {
    const packed = ethers_1.ethers.solidityPacked(['uint256', 'address', 'uint256'], [BigInt(epochId), address, amountWei]);
    const inner = ethers_1.ethers.keccak256(packed);
    return ethers_1.ethers.keccak256(inner);
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
                next.push(current[i]);
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
            if (siblingIdx < layer.length)
                proof.push(layer[siblingIdx]);
            idx = Math.floor(idx / 2);
        }
        return proof;
    }
    return { root, getProof };
}
// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────
class MerkleDropsLPService {
    pool;
    cronTimer = null;
    constructor(pool) {
        this.pool = pool;
    }
    // ── LP Pair management ──────────────────────────────────────────────────────
    async listPairs() {
        const { rows } = await this.pool.query('SELECT * FROM merkle_lp_pairs ORDER BY active DESC, id ASC');
        return rows;
    }
    async addPair(pairAddress, label, dexName) {
        const { rows } = await this.pool.query(`INSERT INTO merkle_lp_pairs (pair_address, label, dex_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (pair_address) DO UPDATE SET label = $2, dex_name = $3, active = TRUE
       RETURNING *`, [pairAddress.toLowerCase(), label, dexName ?? null]);
        return rows[0];
    }
    async setPairActive(pairAddress, active) {
        await this.pool.query('UPDATE merkle_lp_pairs SET active = $1 WHERE pair_address = $2', [active, pairAddress.toLowerCase()]);
    }
    async removePair(pairAddress) {
        await this.pool.query('DELETE FROM merkle_lp_pairs WHERE pair_address = $1', [pairAddress.toLowerCase()]);
    }
    // ── Epoch management ────────────────────────────────────────────────────────
    async createEpoch(options = {}) {
        const { cronTriggered = false } = options;
        const { rows } = await this.pool.query('SELECT MAX(epoch_number) AS max FROM merkle_lp_epochs');
        const nextNumber = (rows[0].max ?? 0) + 1;
        const insert = await this.pool.query(`INSERT INTO merkle_lp_epochs (epoch_number, cron_triggered)
       VALUES ($1, $2)
       RETURNING *`, [nextNumber, cronTriggered]);
        const epoch = insert.rows[0];
        logger_1.logger.info(`[MerkleLP] Created epoch #${nextNumber} (id=${epoch.id})`);
        await this.takeSnapshot(epoch.id);
        return this.getEpoch(epoch.id);
    }
    async getEpoch(epochId) {
        const { rows } = await this.pool.query('SELECT * FROM merkle_lp_epochs WHERE id = $1', [epochId]);
        return rows[0] ?? null;
    }
    async listEpochs() {
        const { rows } = await this.pool.query('SELECT * FROM merkle_lp_epochs ORDER BY epoch_number DESC');
        return rows;
    }
    async listPublishedEpochs() {
        const { rows } = await this.pool.query("SELECT * FROM merkle_lp_epochs WHERE status = 'published' ORDER BY epoch_number DESC");
        return rows;
    }
    // ── Snapshot ────────────────────────────────────────────────────────────────
    /**
     * Snapshot all active LP pairs:
     * 1. Fetch LP token holders from PulseChain API for each pair.
     * 2. Read pair reserves to compute MORBIUS-per-LP-token ratio.
     * 3. Calculate MORBIUS-equivalent per holder.
     * 4. Sum across all pairs per wallet.
     * 5. Apply blocklist; store in merkle_lp_snapshots.
     */
    async takeSnapshot(epochId, blockNumber) {
        const epoch = await this.getEpoch(epochId);
        if (!epoch)
            throw new Error(`LP Epoch ${epochId} not found`);
        // Load blocklist
        const { rows: blockedRows } = await this.pool.query('SELECT address FROM merkle_lp_blocklist');
        const blocklist = new Set(blockedRows.map((r) => r.address.toLowerCase()));
        // Load active pairs
        const { rows: pairs } = await this.pool.query("SELECT * FROM merkle_lp_pairs WHERE active = TRUE");
        if (pairs.length === 0) {
            logger_1.logger.warn('[MerkleLP] No active LP pairs configured — snapshot will be empty');
        }
        // wallet → total MORBIUS-equivalent (aggregated across all pairs)
        const walletMorbiusEquiv = new Map();
        for (const pair of pairs) {
            logger_1.logger.info(`[MerkleLP] Processing pair ${pair.label} (${pair.pair_address})`);
            let reserveInfo;
            try {
                reserveInfo = await (0, merkle_claim_lp_1.getPairReserveInfo)(pair.pair_address);
            }
            catch (err) {
                logger_1.logger.error(`[MerkleLP] Failed to read reserves for ${pair.pair_address}`, err);
                continue;
            }
            if (!reserveInfo.hasLiquidity) {
                logger_1.logger.info(`[MerkleLP] Pair ${pair.label} has no liquidity — skipping`);
                continue;
            }
            let holders;
            try {
                holders = await (0, merkle_claim_lp_1.fetchLPHolders)(pair.pair_address);
            }
            catch (err) {
                logger_1.logger.error(`[MerkleLP] Failed to fetch holders for ${pair.pair_address}`, err);
                continue;
            }
            logger_1.logger.info(`[MerkleLP] ${pair.label}: ${holders.length} holders`);
            for (const { address, balance } of holders) {
                if (blocklist.has(address))
                    continue;
                const morbiusEquiv = (0, merkle_claim_lp_1.calcMorbiusEquivalent)(balance, reserveInfo);
                if (morbiusEquiv === 0n)
                    continue;
                walletMorbiusEquiv.set(address, (walletMorbiusEquiv.get(address) ?? 0n) + morbiusEquiv);
            }
        }
        const eligible = Array.from(walletMorbiusEquiv.entries())
            .filter(([, v]) => v > 0n)
            .map(([address, morbiusEquivalent]) => ({ address, morbiusEquivalent }));
        logger_1.logger.info(`[MerkleLP] Eligible wallets after aggregation: ${eligible.length}`);
        const snapshotBlock = blockNumber ?? await (0, merkle_claim_lp_1.getLatestBlock)();
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM merkle_lp_snapshots WHERE epoch_id = $1', [epochId]);
            for (const { address, morbiusEquivalent } of eligible) {
                await client.query(`INSERT INTO merkle_lp_snapshots (epoch_id, wallet_address, morbius_equivalent)
           VALUES ($1, $2, $3)`, [epochId, address, morbiusEquivalent.toString()]);
            }
            const totalBalance = eligible.reduce((s, h) => s + h.morbiusEquivalent, 0n).toString();
            await client.query(`UPDATE merkle_lp_epochs
         SET status = 'snapshot', total_holders = $1, total_balance = $2,
             snapshot_block = $3, snapshot_at = NOW()
         WHERE id = $4`, [eligible.length, totalBalance, snapshotBlock, epochId]);
            await client.query('COMMIT');
            logger_1.logger.info(`[MerkleLP] Snapshot stored: ${eligible.length} wallets, block ${snapshotBlock}`);
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    // ── Reward calculation ──────────────────────────────────────────────────────
    async calculateRewards(epochId, newRewardWei) {
        const epoch = await this.getEpoch(epochId);
        if (!epoch)
            throw new Error(`LP Epoch ${epochId} not found`);
        if (epoch.status !== 'snapshot') {
            throw new Error(`Epoch must be in 'snapshot' status (current: ${epoch.status})`);
        }
        const { rows: snapshots } = await this.pool.query('SELECT wallet_address, morbius_equivalent FROM merkle_lp_snapshots WHERE epoch_id = $1', [epochId]);
        if (snapshots.length === 0)
            throw new Error('No snapshots found for epoch');
        const newReward = BigInt(newRewardWei);
        const totalBalance = snapshots.reduce((s, r) => s + BigInt(r.morbius_equivalent), 0n);
        if (totalBalance === 0n)
            throw new Error('Total snapshot balance is zero');
        // Find unclaimed rewards from prior published LP epochs (rollup)
        const walletAddresses = snapshots.map((s) => s.wallet_address);
        const { rows: priorRows } = await this.pool.query(`SELECT ms.id, ms.wallet_address, ms.reward_amount
       FROM merkle_lp_snapshots ms
       JOIN merkle_lp_epochs me ON me.id = ms.epoch_id
       WHERE ms.wallet_address = ANY($1)
         AND me.status = 'published'
         AND ms.superseded_by_epoch_id IS NULL
         AND ms.claimed_at IS NULL
         AND ms.epoch_id != $2
         AND CAST(ms.reward_amount AS NUMERIC) > 0`, [walletAddresses, epochId]);
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
            const SCALE = BigInt('1000000000000000000');
            let distributedNew = 0n;
            const assignments = [];
            for (let i = 0; i < snapshots.length; i++) {
                const { wallet_address, morbius_equivalent } = snapshots[i];
                let newShare;
                if (i === snapshots.length - 1) {
                    newShare = newReward - distributedNew;
                }
                else {
                    newShare = (BigInt(morbius_equivalent) * SCALE * newReward) / (totalBalance * SCALE);
                }
                distributedNew += newShare;
                const rolledUp = priorUnclaimedMap.get(wallet_address) ?? 0n;
                assignments.push({ address: wallet_address, reward: newShare + rolledUp });
            }
            for (const { address, reward } of assignments) {
                await client.query('UPDATE merkle_lp_snapshots SET reward_amount = $1 WHERE epoch_id = $2 AND wallet_address = $3', [reward.toString(), epochId, address]);
            }
            if (priorSnapshotIds.length > 0) {
                await client.query('UPDATE merkle_lp_snapshots SET superseded_by_epoch_id = $1 WHERE id = ANY($2)', [epochId, priorSnapshotIds]);
            }
            await client.query(`UPDATE merkle_lp_epochs
         SET status = 'calculated',
             total_reward_amount = $1,
             new_reward_amount = $2,
             rollup_amount = $3,
             calculated_at = NOW()
         WHERE id = $4`, [totalReward.toString(), newRewardWei, totalRollup.toString(), epochId]);
            await client.query('COMMIT');
            logger_1.logger.info(`[MerkleLP] Rewards calculated: ${snapshots.length} holders, ` +
                `${ethers_1.ethers.formatEther(newReward)} new + ${ethers_1.ethers.formatEther(totalRollup)} rollup = ` +
                `${ethers_1.ethers.formatEther(totalReward)} MORBIUS`);
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    // ── Merkle tree generation ──────────────────────────────────────────────────
    async generateMerkleTree(epochId) {
        const epoch = await this.getEpoch(epochId);
        if (!epoch)
            throw new Error(`LP Epoch ${epochId} not found`);
        if (epoch.status !== 'calculated') {
            throw new Error(`Epoch must be in 'calculated' status (current: ${epoch.status})`);
        }
        const { rows: snapshots } = await this.pool.query('SELECT wallet_address, reward_amount FROM merkle_lp_snapshots WHERE epoch_id = $1 AND reward_amount > 0', [epochId]);
        if (snapshots.length === 0)
            throw new Error('No eligible snapshots with reward_amount > 0');
        const leafData = snapshots.map(({ wallet_address, reward_amount }) => {
            const amountWei = BigInt(reward_amount);
            const leaf = hashLeaf(epoch.epoch_number, wallet_address, amountWei);
            return { address: wallet_address, amountWei, leaf };
        });
        const { root, getProof } = buildMerkleTree(leafData.map((l) => l.leaf));
        logger_1.logger.info(`[MerkleLP] Merkle root for epoch #${epoch.epoch_number}: ${root}`);
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const { address, leaf } of leafData) {
                const proof = getProof(leaf);
                await client.query('UPDATE merkle_lp_snapshots SET merkle_proof = $1 WHERE epoch_id = $2 AND wallet_address = $3', [JSON.stringify(proof), epochId, address]);
            }
            await client.query(`UPDATE merkle_lp_epochs
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
    // ── Publish ─────────────────────────────────────────────────────────────────
    async markPublished(epochId) {
        const epoch = await this.getEpoch(epochId);
        if (!epoch)
            throw new Error(`LP Epoch ${epochId} not found`);
        if (epoch.status !== 'finalized') {
            throw new Error(`Epoch must be 'finalized' to publish (current: ${epoch.status})`);
        }
        await this.pool.query("UPDATE merkle_lp_epochs SET status = 'published', published_at = NOW() WHERE id = $1", [epochId]);
        logger_1.logger.info(`[MerkleLP] Epoch #${epoch.epoch_number} published`);
    }
    async revokeEpoch(epochId) {
        const epoch = await this.getEpoch(epochId);
        if (!epoch)
            throw new Error(`LP Epoch ${epochId} not found`);
        if (epoch.status !== 'finalized' && epoch.status !== 'published') {
            throw new Error(`Epoch must be finalized or published to revoke (current: ${epoch.status})`);
        }
        await this.pool.query("UPDATE merkle_lp_epochs SET status = 'finalized', published_at = NULL WHERE id = $1", [epochId]);
        logger_1.logger.info(`[MerkleLP] Epoch #${epoch.epoch_number} revoked`);
    }
    // ── Claim proof lookup (public) ─────────────────────────────────────────────
    async getClaimProof(epochNumber, walletAddress) {
        const { rows: epochRows } = await this.pool.query("SELECT * FROM merkle_lp_epochs WHERE epoch_number = $1 AND status = 'published'", [epochNumber]);
        if (!epochRows[0])
            return null;
        const epoch = epochRows[0];
        const { rows } = await this.pool.query(`SELECT ms.wallet_address, ms.reward_amount, ms.merkle_proof,
              ms.superseded_by_epoch_id,
              me2.epoch_number AS superseded_by_epoch_number
       FROM merkle_lp_snapshots ms
       LEFT JOIN merkle_lp_epochs me2 ON me2.id = ms.superseded_by_epoch_id
       WHERE ms.epoch_id = $1 AND ms.wallet_address = $2`, [epoch.id, walletAddress.toLowerCase()]);
        if (!rows[0])
            return null;
        const row = rows[0];
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
    /** Paginated snapshot data for an epoch (admin). */
    async getSnapshotPage(epochId, page = 1, pageSize = 50) {
        const offset = (page - 1) * pageSize;
        const [data, count] = await Promise.all([
            this.pool.query('SELECT wallet_address, morbius_equivalent, reward_amount, merkle_proof, superseded_by_epoch_id FROM merkle_lp_snapshots WHERE epoch_id = $1 ORDER BY morbius_equivalent DESC LIMIT $2 OFFSET $3', [epochId, pageSize, offset]),
            this.pool.query('SELECT COUNT(*) FROM merkle_lp_snapshots WHERE epoch_id = $1', [epochId]),
        ]);
        return { rows: data.rows, total: Number(count.rows[0].count) };
    }
    // ── Blocklist ───────────────────────────────────────────────────────────────
    async listBlocklist() {
        const { rows } = await this.pool.query('SELECT address, reason, added_at FROM merkle_lp_blocklist ORDER BY added_at DESC');
        return rows;
    }
    async addToBlocklist(address, reason) {
        await this.pool.query('INSERT INTO merkle_lp_blocklist (address, reason) VALUES ($1, $2) ON CONFLICT (address) DO UPDATE SET reason = $2', [address.toLowerCase(), reason]);
    }
    async removeFromBlocklist(address) {
        await this.pool.query('DELETE FROM merkle_lp_blocklist WHERE address = $1', [address.toLowerCase()]);
    }
    // ── Settings ────────────────────────────────────────────────────────────────
    async getSettings() {
        const { rows } = await this.pool.query('SELECT key, value FROM merkle_lp_settings');
        const result = {};
        for (const r of rows)
            result[r.key] = r.value;
        return result;
    }
    async updateSettings(patch) {
        const scheduleKeys = new Set(['schedule_type', 'schedule_day', 'schedule_hour_utc']);
        const scheduleChanged = Object.keys(patch).some((k) => scheduleKeys.has(k));
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const [key, value] of Object.entries(patch)) {
                await client.query(`INSERT INTO merkle_lp_settings (key, value, updated_at)
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
        if (scheduleChanged && this.cronTimer)
            this.restartCron();
        logger_1.logger.info('[MerkleLP] Settings updated', patch);
    }
    // ── Available contract balance ──────────────────────────────────────────────
    async getAvailableContractBalance() {
        const contractBalance = await (0, merkle_claim_lp_1.getContractMorbiusBalance)();
        const { rows } = await this.pool.query(`SELECT COALESCE(SUM(CAST(ms.reward_amount AS NUMERIC)), 0) AS total
       FROM merkle_lp_snapshots ms
       JOIN merkle_lp_epochs me ON me.id = ms.epoch_id
       WHERE me.status = 'published'
         AND ms.claimed_at IS NULL
         AND ms.superseded_by_epoch_id IS NULL
         AND CAST(ms.reward_amount AS NUMERIC) > 0`);
        const owedWei = BigInt(rows[0]?.total ?? '0');
        const available = contractBalance > owedWei ? contractBalance - owedWei : 0n;
        logger_1.logger.info(`[MerkleLP] Contract balance: ${contractBalance}, owed: ${owedWei}, available: ${available}`);
        return available;
    }
    // ── Claim status sync ───────────────────────────────────────────────────────
    async syncClaimStatus() {
        const { rows } = await this.pool.query(`SELECT ms.id, me.epoch_number, ms.wallet_address
       FROM merkle_lp_snapshots ms
       JOIN merkle_lp_epochs me ON me.id = ms.epoch_id
       WHERE me.status = 'published'
         AND ms.claimed_at IS NULL
         AND ms.superseded_by_epoch_id IS NULL
         AND CAST(ms.reward_amount AS NUMERIC) > 0`);
        if (rows.length === 0)
            return 0;
        let synced = 0;
        const BATCH_SIZE = 20;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(batch.map((r) => (0, merkle_claim_lp_1.checkHasClaimed)(r.epoch_number, r.wallet_address)
                .then((claimed) => ({ id: r.id, claimed }))
                .catch(() => ({ id: r.id, claimed: false }))));
            const claimedIds = results.filter((r) => r.claimed).map((r) => r.id);
            if (claimedIds.length > 0) {
                await this.pool.query('UPDATE merkle_lp_snapshots SET claimed_at = NOW() WHERE id = ANY($1)', [claimedIds]);
                synced += claimedIds.length;
            }
        }
        if (synced > 0)
            logger_1.logger.info(`[MerkleLP] Synced ${synced} on-chain claims`);
        return synced;
    }
    // ── Auto-finalize + publish ─────────────────────────────────────────────────
    async autoFinalizeAndPublish(epochId) {
        if (!(0, merkle_claim_lp_1.isMerkleKeeperConfigured)()) {
            logger_1.logger.warn('[MerkleLP] auto_publish_onchain enabled but no keeper key — skipping');
            return;
        }
        try {
            const root = await this.generateMerkleTree(epochId);
            const epoch = await this.getEpoch(epochId);
            if (!epoch)
                throw new Error(`Epoch ${epochId} not found after finalize`);
            const totalWei = BigInt(epoch.total_reward_amount || '0');
            const result = await (0, merkle_claim_lp_1.setEpochRootOnChain)(epoch.epoch_number, root, totalWei);
            if (!result.success) {
                logger_1.logger.error(`[MerkleLP] Auto-publish setEpochRoot failed — ${result.error}`);
                return;
            }
            await this.markPublished(epochId);
            logger_1.logger.info(`[MerkleLP] Auto-published epoch #${epoch.epoch_number}`);
        }
        catch (err) {
            logger_1.logger.error('[MerkleLP] Auto-finalize/publish failed', err);
        }
    }
    // ── Schedule info ───────────────────────────────────────────────────────────
    async getScheduleInfo() {
        const settings = await this.getSettings();
        const type = settings['schedule_type'] || 'manual';
        const day = parseInt(settings['schedule_day'] || '5', 10);
        const hour = parseInt(settings['schedule_hour_utc'] || '14', 10);
        const interval = parseInt(settings['schedule_interval'] || '60', 10);
        let next_drop_at = null;
        let countdown_duration = 0;
        if (type === 'interval_minutes') {
            countdown_duration = interval * 60;
        }
        else if (type === 'interval_hours') {
            countdown_duration = interval * 3600;
        }
        else if (type === 'weekly') {
            const now = new Date();
            const nextDrop = new Date(now);
            nextDrop.setUTCHours(hour, 0, 0, 0);
            const daysUntil = (day - now.getUTCDay() + 7) % 7;
            nextDrop.setUTCDate(now.getUTCDate() + (daysUntil === 0 && now.getUTCHours() >= hour ? 7 : daysUntil));
            next_drop_at = nextDrop.toISOString();
        }
        else if (type === 'monthly') {
            const now = new Date();
            const nextDrop = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, hour));
            if (nextDrop <= now)
                nextDrop.setUTCMonth(nextDrop.getUTCMonth() + 1);
            next_drop_at = nextDrop.toISOString();
        }
        return { schedule_type: type, next_drop_at, countdown_duration };
    }
    // ── Cron ────────────────────────────────────────────────────────────────────
    startCron() {
        if (this.cronTimer)
            return;
        logger_1.logger.info('[MerkleLP] Cron starting…');
        let lastFiredWeek = -1;
        let lastIntervalFiredAt = 0;
        this.cronTimer = setInterval(async () => {
            try {
                const settings = await this.getSettings();
                const scheduleType = settings['schedule_type'] ?? 'manual';
                if (scheduleType === 'manual')
                    return;
                const scheduleDay = parseInt(settings['schedule_day'] ?? '5', 10);
                const scheduleHour = parseInt(settings['schedule_hour_utc'] ?? '14', 10);
                const scheduleInterval = parseInt(settings['schedule_interval'] ?? '60', 10);
                const defaultRewardWei = settings['default_reward_wei'] ?? '0';
                const now = new Date();
                const nowMs = now.getTime();
                const utcDay = now.getUTCDay();
                const utcDate = now.getUTCDate();
                const utcHour = now.getUTCHours();
                const utcMinute = now.getUTCMinutes();
                let shouldFire = false;
                if (scheduleType === 'interval_minutes') {
                    const intervalMs = Math.max(scheduleInterval, 1) * 60_000;
                    const currentSlot = Math.floor(nowMs / intervalMs);
                    const lastSlot = Math.floor(lastIntervalFiredAt / intervalMs);
                    if (currentSlot > lastSlot) {
                        shouldFire = true;
                        lastIntervalFiredAt = nowMs;
                    }
                }
                else if (scheduleType === 'interval_hours') {
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
                    if (utcMinute !== 0)
                        return;
                    if (scheduleType === 'weekly') {
                        shouldFire = utcDay === scheduleDay && utcHour === scheduleHour;
                    }
                    else if (scheduleType === 'biweekly') {
                        if (utcDay === scheduleDay && utcHour === scheduleHour) {
                            const weekNum = Math.floor(nowMs / (7 * 24 * 3600 * 1000));
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
                logger_1.logger.info(`[MerkleLP] Cron fired (${scheduleType}): creating LP epoch`);
                try {
                    await this.syncClaimStatus();
                }
                catch (err) {
                    logger_1.logger.error('[MerkleLP] Sync claim status failed — continuing', err);
                }
                let rewardWei = defaultRewardWei;
                if (rewardWei === '0' || BigInt(rewardWei) === 0n) {
                    try {
                        const available = await this.getAvailableContractBalance();
                        if (available === 0n) {
                            logger_1.logger.info('[MerkleLP] No MORBIUS available — skipping');
                            return;
                        }
                        rewardWei = available.toString();
                    }
                    catch (err) {
                        logger_1.logger.error('[MerkleLP] Failed to read contract balance — skipping', err);
                        return;
                    }
                }
                const epoch = await this.createEpoch({ cronTriggered: true });
                await this.calculateRewards(epoch.id, rewardWei);
                const autoPublish = settings['auto_publish_onchain'] === 'true';
                if (autoPublish)
                    await this.autoFinalizeAndPublish(epoch.id);
            }
            catch (err) {
                logger_1.logger.error('[MerkleLP] Cron epoch creation failed', err);
            }
        }, 60_000);
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
        logger_1.logger.info('[MerkleLP] Cron restarted');
    }
}
exports.MerkleDropsLPService = MerkleDropsLPService;
//# sourceMappingURL=merkle-lp-drops.service.js.map