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
import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import {
  isMerkleKeeperConfigured,
  setEpochRootOnChain,
} from '../utils/merkle-claim';

const MORBIUS_TOKEN_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';
const PULSECHAIN_API = 'https://api.scan.pulsechain.com/api/v2';
const HOLDERS_PAGE_SIZE = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EpochRecord {
  id: number;
  epoch_number: number;
  snapshot_block: string | null;
  total_holders: number;
  total_balance: string;
  total_reward_amount: string;   // new_reward_amount + rollup_amount (sum of all Merkle leaves)
  new_reward_amount: string;     // freshly deposited MORBIUS for this epoch
  rollup_amount: string;         // unclaimed MORBIUS rolled up from prior epochs
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
  amount: string;       // raw 18-decimal string (no ether formatting)
  proof: string[];      // array of 0x-prefixed hex strings
  supersededByEpochNumber: number | null; // null = claimable; set = rolled into a newer epoch
}

// ─────────────────────────────────────────────────────────────────────────────
// Merkle tree (OZ-compatible: sorted leaves, double-hash)
// ─────────────────────────────────────────────────────────────────────────────

function hashLeaf(epochId: number, address: string, amountWei: bigint): string {
  const packed = ethers.solidityPacked(
    ['uint256', 'address', 'uint256'],
    [BigInt(epochId), address, amountWei],
  );
  const inner = ethers.keccak256(packed);
  return ethers.keccak256(inner); // double-hash
}

function hashPair(a: string, b: string): string {
  const [lo, hi] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return ethers.keccak256(ethers.concat([lo, hi]));
}

interface MerkleResult {
  root: string;
  getProof: (leaf: string) => string[];
}

function buildMerkleTree(leaves: string[]): MerkleResult {
  if (leaves.length === 0) throw new Error('Cannot build Merkle tree from empty leaf set');

  const sorted = [...leaves].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const layers: string[][] = [sorted];

  while (layers[layers.length - 1].length > 1) {
    const current = layers[layers.length - 1];
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 < current.length) {
        next.push(hashPair(current[i], current[i + 1]));
      } else {
        next.push(current[i]); // odd leaf carries up unchanged
      }
    }
    layers.push(next);
  }

  const root = layers[layers.length - 1][0];

  function getProof(leaf: string): string[] {
    const proof: string[] = [];
    let idx = layers[0].findIndex((l) => l.toLowerCase() === leaf.toLowerCase());
    if (idx === -1) throw new Error(`Leaf not found: ${leaf}`);

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

export class MerkleDropsService {
  private pool: Pool;
  private cronTimer: NodeJS.Timeout | null = null;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  // ──────────────────────────────────────────────────────────
  // Epoch management
  // ──────────────────────────────────────────────────────────

  /** Create a new epoch record and kick off the holder snapshot. */
  async createEpoch(options: {
    minHoldingThreshold?: number;
    snapshotBlock?: number;
    cronTriggered?: boolean;
  } = {}): Promise<EpochRecord> {
    const { minHoldingThreshold = 1000, snapshotBlock, cronTriggered = false } = options;

    // Get next epoch number
    const { rows } = await this.pool.query<{ max: number | null }>(
      'SELECT MAX(epoch_number) AS max FROM merkle_epochs',
    );
    const nextNumber = (rows[0].max ?? 0) + 1;

    const insert = await this.pool.query<EpochRecord>(
      `INSERT INTO merkle_epochs
         (epoch_number, min_holding_threshold, cron_triggered)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [nextNumber, minHoldingThreshold, cronTriggered],
    );
    const epoch = insert.rows[0];
    logger.info(`[MerkleDrops] Created epoch #${nextNumber} (id=${epoch.id})`);

    // Start snapshot immediately
    await this.takeSnapshot(epoch.id, snapshotBlock);
    return this.getEpoch(epoch.id) as Promise<EpochRecord>;
  }

  /** Fetch a single epoch by DB id. */
  async getEpoch(epochId: number): Promise<EpochRecord | null> {
    const { rows } = await this.pool.query<EpochRecord>(
      'SELECT * FROM merkle_epochs WHERE id = $1',
      [epochId],
    );
    return rows[0] ?? null;
  }

  /** Fetch all epochs (newest first). */
  async listEpochs(): Promise<EpochRecord[]> {
    const { rows } = await this.pool.query<EpochRecord>(
      'SELECT * FROM merkle_epochs ORDER BY epoch_number DESC',
    );
    return rows;
  }

  /** Fetch published epochs (for public API). */
  async listPublishedEpochs(): Promise<EpochRecord[]> {
    const { rows } = await this.pool.query<EpochRecord>(
      "SELECT * FROM merkle_epochs WHERE status = 'published' ORDER BY epoch_number DESC",
    );
    return rows;
  }

  // ──────────────────────────────────────────────────────────
  // Snapshot
  // ──────────────────────────────────────────────────────────

  /**
   * Fetch all MORBIUS holders from PulseChain API, filter blocklist + dust,
   * and store results in merkle_snapshots.
   */
  async takeSnapshot(epochId: number, blockNumber?: number): Promise<void> {
    const epoch = await this.getEpoch(epochId);
    if (!epoch) throw new Error(`Epoch ${epochId} not found`);

    const minThreshold = BigInt(
      // The threshold is stored as plain MORBIUS units (e.g. 1000), convert to wei
      Math.floor(Number(epoch.min_holding_threshold)) * 1e18,
    );

    // Load blocklist
    const { rows: blockedRows } = await this.pool.query<{ address: string }>(
      'SELECT address FROM merkle_blocklist',
    );
    const blocklist = new Set(blockedRows.map((r) => r.address.toLowerCase()));

    logger.info(`[MerkleDrops] Snapshot epoch #${epoch.epoch_number}: fetching holders...`);

    const rawHolders = await this.fetchAllHolders();
    logger.info(`[MerkleDrops] Total holders from API: ${rawHolders.length}`);

    // Deduplicate — PulseChain API can return the same address across pages.
    // Keep the highest balance if duplicated.
    const holderMap = new Map<string, bigint>();
    for (const { address, balance } of rawHolders) {
      const key = address.toLowerCase();
      const existing = holderMap.get(key);
      if (existing === undefined || balance > existing) {
        holderMap.set(key, balance);
      }
    }
    const holders = Array.from(holderMap, ([address, balance]) => ({ address, balance }));
    if (holders.length !== rawHolders.length) {
      logger.info(`[MerkleDrops] Deduplicated: ${rawHolders.length} → ${holders.length} unique holders`);
    }

    // Filter
    const eligible = holders.filter(({ address, balance }) => {
      if (blocklist.has(address)) return false;
      return balance >= minThreshold;
    });
    logger.info(`[MerkleDrops] Eligible after filtering: ${eligible.length}`);

    // Determine snapshot block
    let snapshotBlock = blockNumber ?? null;
    if (!snapshotBlock) {
      try {
        const resp = await fetch(`${PULSECHAIN_API}/blocks?type=block&page_size=1`);
        if (resp.ok) {
          const data = await resp.json() as { items?: Array<{ height: number }> };
          snapshotBlock = data.items?.[0]?.height ?? null;
        }
      } catch {
        // non-critical; leave null
      }
    }

    // Persist in a transaction (delete old snapshots for this epoch first)
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM merkle_snapshots WHERE epoch_id = $1', [epochId]);

      for (const { address, balance } of eligible) {
        await client.query(
          `INSERT INTO merkle_snapshots (epoch_id, wallet_address, morbius_balance)
           VALUES ($1, $2, $3)`,
          [epochId, address.toLowerCase(), balance.toString()],
        );
      }

      const totalBalance = eligible.reduce((sum, h) => sum + h.balance, 0n).toString();
      await client.query(
        `UPDATE merkle_epochs
         SET status = 'snapshot', total_holders = $1, total_balance = $2,
             snapshot_block = $3, snapshot_at = NOW()
         WHERE id = $4`,
        [eligible.length, totalBalance, snapshotBlock, epochId],
      );
      await client.query('COMMIT');
      logger.info(`[MerkleDrops] Snapshot stored: ${eligible.length} holders, block ${snapshotBlock}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
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
  async calculateRewards(epochId: number, newRewardWei: string): Promise<void> {
    const epoch = await this.getEpoch(epochId);
    if (!epoch) throw new Error(`Epoch ${epochId} not found`);
    if (!['snapshot'].includes(epoch.status)) {
      throw new Error(`Epoch must be in 'snapshot' status to calculate rewards (current: ${epoch.status})`);
    }

    const { rows: snapshots } = await this.pool.query<{ wallet_address: string; morbius_balance: string }>(
      'SELECT wallet_address, morbius_balance FROM merkle_snapshots WHERE epoch_id = $1',
      [epochId],
    );
    if (snapshots.length === 0) throw new Error('No snapshots found for epoch');

    const newReward = BigInt(newRewardWei);
    const totalBalance = snapshots.reduce((s, r) => s + BigInt(r.morbius_balance), 0n);
    if (totalBalance === 0n) throw new Error('Total snapshot balance is zero');

    // ── Find unclaimed rewards from prior published epochs ──────────────────
    // "Unclaimed" = published epoch, no superseded_by_epoch_id, no claimed_at
    const walletAddresses = snapshots.map((s) => s.wallet_address);
    const { rows: priorRows } = await this.pool.query<{
      id: number;
      wallet_address: string;
      reward_amount: string;
    }>(
      `SELECT ms.id, ms.wallet_address, ms.reward_amount
       FROM merkle_snapshots ms
       JOIN merkle_epochs me ON me.id = ms.epoch_id
       WHERE ms.wallet_address = ANY($1)
         AND me.status = 'published'
         AND ms.superseded_by_epoch_id IS NULL
         AND ms.claimed_at IS NULL
         AND ms.epoch_id != $2
         AND CAST(ms.reward_amount AS NUMERIC) > 0`,
      [walletAddresses, epochId],
    );

    // wallet_address → total unclaimed from prior epochs
    const priorUnclaimedMap = new Map<string, bigint>();
    const priorSnapshotIds: number[] = [];
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

      // Proportional share of NEW rewards per wallet
      const SCALE = BigInt('1000000000000000000'); // 1e18
      let distributedNew = 0n;
      const assignments: Array<{ address: string; reward: bigint }> = [];

      for (let i = 0; i < snapshots.length; i++) {
        const { wallet_address, morbius_balance } = snapshots[i];
        let newShare: bigint;
        if (i === snapshots.length - 1) {
          // Last holder gets the remainder to avoid dust from integer division
          newShare = newReward - distributedNew;
        } else {
          newShare = (BigInt(morbius_balance) * SCALE * newReward) / (totalBalance * SCALE);
        }
        distributedNew += newShare;
        // Add rolled-up prior unclaimed rewards
        const rolledUp = priorUnclaimedMap.get(wallet_address) ?? 0n;
        assignments.push({ address: wallet_address, reward: newShare + rolledUp });
      }

      for (const { address, reward } of assignments) {
        await client.query(
          'UPDATE merkle_snapshots SET reward_amount = $1 WHERE epoch_id = $2 AND wallet_address = $3',
          [reward.toString(), epochId, address],
        );
      }

      // Mark superseded prior snapshot rows
      if (priorSnapshotIds.length > 0) {
        await client.query(
          'UPDATE merkle_snapshots SET superseded_by_epoch_id = $1 WHERE id = ANY($2)',
          [epochId, priorSnapshotIds],
        );
      }

      await client.query(
        `UPDATE merkle_epochs
         SET status = 'calculated',
             total_reward_amount = $1,
             new_reward_amount = $2,
             rollup_amount = $3,
             calculated_at = NOW()
         WHERE id = $4`,
        [totalReward.toString(), newRewardWei, totalRollup.toString(), epochId],
      );
      await client.query('COMMIT');
      logger.info(
        `[MerkleDrops] Rewards calculated for epoch #${epoch.epoch_number}: ${snapshots.length} holders, ` +
        `${ethers.formatEther(newReward)} new + ${ethers.formatEther(totalRollup)} rolled-up = ` +
        `${ethers.formatEther(totalReward)} MORBIUS total`,
      );
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ──────────────────────────────────────────────────────────
  // Merkle tree generation
  // ──────────────────────────────────────────────────────────

  /**
   * Build the Merkle tree from calculated snapshots, store proofs, and return the root.
   */
  async generateMerkleTree(epochId: number): Promise<string> {
    const epoch = await this.getEpoch(epochId);
    if (!epoch) throw new Error(`Epoch ${epochId} not found`);
    if (epoch.status !== 'calculated') {
      throw new Error(`Epoch must be in 'calculated' status to generate tree (current: ${epoch.status})`);
    }

    const { rows: snapshots } = await this.pool.query<{ wallet_address: string; reward_amount: string }>(
      'SELECT wallet_address, reward_amount FROM merkle_snapshots WHERE epoch_id = $1 AND reward_amount > 0',
      [epochId],
    );
    if (snapshots.length === 0) throw new Error('No eligible snapshots with reward_amount > 0');

    // Build leaves
    const leafData: Array<{ address: string; amountWei: bigint; leaf: string }> = snapshots.map(
      ({ wallet_address, reward_amount }) => {
        const amountWei = BigInt(reward_amount);
        const leaf = hashLeaf(epoch.epoch_number, wallet_address, amountWei);
        return { address: wallet_address, amountWei, leaf };
      },
    );

    const { root, getProof } = buildMerkleTree(leafData.map((l) => l.leaf));
    logger.info(`[MerkleDrops] Merkle root for epoch #${epoch.epoch_number}: ${root}`);

    // Store proofs
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const { address, leaf } of leafData) {
        const proof = getProof(leaf);
        await client.query(
          'UPDATE merkle_snapshots SET merkle_proof = $1 WHERE epoch_id = $2 AND wallet_address = $3',
          [JSON.stringify(proof), epochId, address],
        );
      }
      await client.query(
        `UPDATE merkle_epochs
         SET status = 'finalized', merkle_root = $1, finalized_at = NOW()
         WHERE id = $2`,
        [root, epochId],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return root;
  }

  // ──────────────────────────────────────────────────────────
  // Publish
  // ──────────────────────────────────────────────────────────

  /** Mark epoch as published (admin has set the root on-chain). */
  async markPublished(epochId: number): Promise<void> {
    const epoch = await this.getEpoch(epochId);
    if (!epoch) throw new Error(`Epoch ${epochId} not found`);
    if (epoch.status !== 'finalized') {
      throw new Error(`Epoch must be in 'finalized' status to publish (current: ${epoch.status})`);
    }
    await this.pool.query(
      "UPDATE merkle_epochs SET status = 'published', published_at = NOW() WHERE id = $1",
      [epochId],
    );
    logger.info(`[MerkleDrops] Epoch #${epoch.epoch_number} marked as published`);
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
  async getClaimProof(epochNumber: number, walletAddress: string): Promise<ClaimProof | null> {
    const { rows: epochRows } = await this.pool.query<EpochRecord>(
      "SELECT * FROM merkle_epochs WHERE epoch_number = $1 AND status = 'published'",
      [epochNumber],
    );
    if (!epochRows[0]) return null;
    const epoch = epochRows[0];

    const { rows } = await this.pool.query<{
      wallet_address: string;
      reward_amount: string;
      merkle_proof: string[] | null;
      superseded_by_epoch_id: number | null;
      superseded_by_epoch_number: number | null;
    }>(
      `SELECT ms.wallet_address, ms.reward_amount, ms.merkle_proof,
              ms.superseded_by_epoch_id,
              me2.epoch_number AS superseded_by_epoch_number
       FROM merkle_snapshots ms
       LEFT JOIN merkle_epochs me2 ON me2.id = ms.superseded_by_epoch_id
       WHERE ms.epoch_id = $1 AND ms.wallet_address = $2`,
      [epoch.id, walletAddress.toLowerCase()],
    );
    if (!rows[0]) return null;

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

    if (!row.merkle_proof) return null;

    return {
      epochId: epoch.id,
      epochNumber: epoch.epoch_number,
      amount: row.reward_amount,
      proof: row.merkle_proof,
      supersededByEpochNumber: null,
    };
  }

  /** Paginated snapshot data for a single epoch (admin view). */
  async getSnapshotPage(epochId: number, page = 1, pageSize = 50): Promise<{
    rows: SnapshotRow[];
    total: number;
  }> {
    const offset = (page - 1) * pageSize;
    const [data, count] = await Promise.all([
      this.pool.query<SnapshotRow>(
        'SELECT wallet_address, morbius_balance, reward_amount, merkle_proof FROM merkle_snapshots WHERE epoch_id = $1 ORDER BY morbius_balance DESC LIMIT $2 OFFSET $3',
        [epochId, pageSize, offset],
      ),
      this.pool.query<{ count: string }>(
        'SELECT COUNT(*) FROM merkle_snapshots WHERE epoch_id = $1',
        [epochId],
      ),
    ]);
    return { rows: data.rows, total: Number(count.rows[0].count) };
  }

  // ──────────────────────────────────────────────────────────
  // Blocklist
  // ──────────────────────────────────────────────────────────

  async listBlocklist(): Promise<Array<{ address: string; reason: string; added_at: string }>> {
    const { rows } = await this.pool.query(
      'SELECT address, reason, added_at FROM merkle_blocklist ORDER BY added_at DESC',
    );
    return rows;
  }

  async addToBlocklist(address: string, reason: string): Promise<void> {
    await this.pool.query(
      'INSERT INTO merkle_blocklist (address, reason) VALUES ($1, $2) ON CONFLICT (address) DO UPDATE SET reason = $2',
      [address.toLowerCase(), reason],
    );
  }

  async removeFromBlocklist(address: string): Promise<void> {
    await this.pool.query('DELETE FROM merkle_blocklist WHERE address = $1', [address.toLowerCase()]);
  }

  // ──────────────────────────────────────────────────────────
  // Settings (schedule + default reward)
  // ──────────────────────────────────────────────────────────

  /** Read all settings into a plain key→value map. */
  async getSettings(): Promise<Record<string, string>> {
    const { rows } = await this.pool.query<{ key: string; value: string }>(
      'SELECT key, value FROM merkle_settings',
    );
    const result: Record<string, string> = {};
    for (const r of rows) result[r.key] = r.value;
    return result;
  }

  /** Upsert one or more settings. Restarts cron if schedule keys changed. */
  async updateSettings(patch: Record<string, string>): Promise<void> {
    const scheduleKeys = new Set(['schedule_type', 'schedule_day', 'schedule_hour_utc']);
    const scheduleChanged = Object.keys(patch).some((k) => scheduleKeys.has(k));

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of Object.entries(patch)) {
        await client.query(
          `INSERT INTO merkle_settings (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
          [key, value],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (scheduleChanged && this.cronTimer) {
      // Restart cron so new schedule takes effect
      this.restartCron();
    }
    logger.info('[MerkleDrops] Settings updated', patch);
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
  private async autoFinalizeAndPublish(epochId: number): Promise<void> {
    if (!isMerkleKeeperConfigured()) {
      logger.warn('[MerkleDrops] auto_publish_onchain enabled but no keeper key configured — skipping on-chain publish');
      return;
    }

    try {
      // 1. Finalize — build Merkle tree
      logger.info(`[MerkleDrops] Auto-finalizing epoch ${epochId}`);
      const root = await this.generateMerkleTree(epochId);
      logger.info(`[MerkleDrops] Merkle root generated: ${root}`);

      // Re-fetch epoch to get amounts
      const epoch = await this.getEpoch(epochId);
      if (!epoch) throw new Error(`Epoch ${epochId} not found after finalize`);

      const totalWei = BigInt(epoch.total_reward_amount || '0');

      // 2. Set epoch root on-chain (tokens already in contract via game fees)
      const setRootResult = await setEpochRootOnChain(
        epoch.epoch_number,
        root as `0x${string}`,
        totalWei,
      );
      if (!setRootResult.success) {
        logger.error(`[MerkleDrops] Auto-publish: setEpochRoot failed — ${setRootResult.error}`);
        return;
      }

      // 3. Mark published in DB
      await this.markPublished(epochId);
      logger.info(`[MerkleDrops] Auto-published epoch #${epoch.epoch_number} successfully`);
    } catch (err) {
      logger.error('[MerkleDrops] Auto-finalize/publish failed', err);
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
  startCron(): void {
    if (this.cronTimer) return; // already running

    logger.info('[MerkleDrops] Cron starting…');

    let lastFiredWeek = -1; // for biweekly tracking
    let lastIntervalFiredAt = 0; // timestamp of last interval fire

    this.cronTimer = setInterval(async () => {
      try {
        // Read settings fresh each tick so changes take effect without restart
        const settings = await this.getSettings();
        const scheduleType = settings['schedule_type'] ?? 'manual';
        if (scheduleType === 'manual') return;

        const scheduleDay = parseInt(settings['schedule_day'] ?? process.env.MERKLE_DROP_WEEKLY_DAY ?? '5', 10);
        const scheduleHour = parseInt(settings['schedule_hour_utc'] ?? process.env.MERKLE_DROP_WEEKLY_HOUR ?? '12', 10);
        const scheduleInterval = parseInt(settings['schedule_interval'] ?? '60', 10);
        const defaultRewardWei = settings['default_reward_wei'] ?? '0';

        const now = new Date();
        const nowMs = now.getTime();
        const utcDay = now.getUTCDay();       // 0=Sun..6=Sat
        const utcDate = now.getUTCDate();      // 1-31
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
        } else if (scheduleType === 'interval_hours') {
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
        } else {
          // weekly / biweekly / monthly — only fire on the hour
          if (utcMinute !== 0) return;

          if (scheduleType === 'weekly') {
            shouldFire = utcDay === scheduleDay && utcHour === scheduleHour;
          } else if (scheduleType === 'biweekly') {
            // Fire on the configured day/hour, but only every other week
            if (utcDay === scheduleDay && utcHour === scheduleHour) {
              const weekNum = Math.floor(now.getTime() / (7 * 24 * 3600 * 1000));
              if (weekNum !== lastFiredWeek && weekNum % 2 === 0) {
                shouldFire = true;
                lastFiredWeek = weekNum;
              }
            }
          } else if (scheduleType === 'monthly') {
            shouldFire = utcDate === scheduleDay && utcHour === scheduleHour;
          }
        }

        if (!shouldFire) return;

        logger.info(`[MerkleDrops] Cron fired (${scheduleType}): creating epoch automatically`);
        const epoch = await this.createEpoch({ cronTriggered: true });

        // Auto-calculate if default_reward_wei is configured
        if (defaultRewardWei !== '0' && BigInt(defaultRewardWei) > 0n) {
          logger.info(`[MerkleDrops] Auto-calculating rewards: ${defaultRewardWei} wei`);
          await this.calculateRewards(epoch.id, defaultRewardWei);
        }

        // Auto-finalize + auto-publish on-chain if enabled
        const autoPublish = settings['auto_publish_onchain'] === 'true';
        if (autoPublish && defaultRewardWei !== '0' && BigInt(defaultRewardWei) > 0n) {
          await this.autoFinalizeAndPublish(epoch.id);
        }
      } catch (err) {
        logger.error('[MerkleDrops] Cron epoch creation failed', err);
      }
    }, 60_000); // check every minute
  }

  stopCron(): void {
    if (this.cronTimer) {
      clearInterval(this.cronTimer);
      this.cronTimer = null;
    }
  }

  restartCron(): void {
    this.stopCron();
    this.startCron();
    logger.info('[MerkleDrops] Cron restarted with updated schedule');
  }

  // ──────────────────────────────────────────────────────────
  // PulseChain API — holder fetch
  // ──────────────────────────────────────────────────────────

  private async fetchAllHolders(): Promise<Array<{ address: string; balance: bigint }>> {
    const holders: Array<{ address: string; balance: bigint }> = [];
    let nextPage: string | null =
      `${PULSECHAIN_API}/tokens/${MORBIUS_TOKEN_ADDRESS}/holders?page_size=${HOLDERS_PAGE_SIZE}`;

    while (nextPage) {
      let resp: Response;
      try {
        resp = await fetch(nextPage);
      } catch (err) {
        logger.error('[MerkleDrops] PulseChain API fetch error', err);
        break;
      }

      if (!resp.ok) {
        logger.error(`[MerkleDrops] PulseChain API returned ${resp.status} for ${nextPage}`);
        break;
      }

      const data = await resp.json() as {
        items?: Array<{ address: { hash: string }; value: string }>;
        next_page_params?: Record<string, string> | null;
      };

      for (const item of data.items ?? []) {
        const addr = item.address?.hash?.toLowerCase();
        const balance = BigInt(item.value ?? '0');
        if (addr) holders.push({ address: addr, balance });
      }

      // Build next page URL from params (PulseChain blockscout pagination)
      if (data.next_page_params && Object.keys(data.next_page_params).length > 0) {
        const params = new URLSearchParams(
          Object.entries(data.next_page_params).map(([k, v]) => [k, String(v)] as [string, string]),
        );
        nextPage = `${PULSECHAIN_API}/tokens/${MORBIUS_TOKEN_ADDRESS}/holders?page_size=${HOLDERS_PAGE_SIZE}&${params}`;
      } else {
        nextPage = null;
      }

      // Small delay to be respectful to the public API
      await new Promise((r) => setTimeout(r, 150));
    }

    return holders;
  }
}
