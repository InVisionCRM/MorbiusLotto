/**
 * HolderChipRewardsService
 *
 * Chip-only holder + LP rewards. Replaces MerkleDropsService and MerkleDropsLPService
 * at the runtime layer. No merkle tree, no on-chain claim, no rollup — the existing
 * MerkleClaimMorbius (0x3807…75d2) and MerkleClaimLP (0x64Dd…1A1A) contracts still
 * receive the 1.25% / 1.5% slice from games; per epoch the owner rescues the
 * accumulated MORBIUS into the hot wallet (0x8f6D…35F2e), then this service
 * credits chips proportionally (1 chip = 10^18 wei, per poker-chip-scale.ts).
 *
 * Lifecycle per epoch: pending → snapshot → credited.
 *   - createEpoch(cohort) → takes snapshot immediately, status → 'snapshot'
 *   - creditChips({ epochId, morbiusPoolWei, rescueTxHash, topupTxHash })
 *       → applies chip deltas to player_poker_chips inside one transaction,
 *         status → 'credited'. Fails fast if either tx hash is missing.
 *
 * Schema: migration 148_holder_chip_epochs.sql.
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { POKER_CHIP_WEI } from '../lib/poker-chip-scale';
import { applyPokerChipDelta, type PokerChipLedgerReason } from './poker-chip-wallet';
import { getPublicClient } from '../utils/chain-client';
import { fetchMorbiusHoldersFromChain } from '../utils/morbius-holders-rpc';
import {
  fetchMorbiusHoldersFromMoralis,
  isMoralisHoldersConfigured,
} from '../utils/morbius-holders-moralis';
import {
  fetchLPHolders,
  getPairReserveInfo,
  calcMorbiusEquivalent,
  getLatestBlock,
} from '../utils/merkle-claim-lp';
import {
  loadHolderSnapshotBlocklist,
  loadLpSnapshotBlocklist,
} from './merkle-snapshot-blocklist';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type Cohort = 'morbius' | 'lp';

export interface HolderChipEpoch {
  id: string;
  cohort: Cohort;
  epoch_number: number;
  snapshot_block: string | null;
  total_holders: number;
  total_basis_wei: string;
  morbius_pool_wei: string;
  total_chips_credited: string;
  rescue_tx_hash: string | null;
  topup_tx_hash: string | null;
  min_holding_threshold: string;
  status: 'pending' | 'snapshot' | 'credited';
  cron_triggered: boolean;
  created_at: string;
  snapshot_at: string | null;
  credited_at: string | null;
}

export interface EligibleHolder {
  address: string;   // lowercase 0x…
  basisWei: bigint;  // MORBIUS balance OR LP MORBIUS-equivalent
}

export interface WalletHistoryRow {
  epoch_id: string;
  cohort: Cohort;
  epoch_number: number;
  credited_at: string | null;
  basis_wei: string;
  chips_credited: string;
  morbius_pool_wei: string;
  total_basis_wei: string;
}

export interface WalletCohortTotals {
  lifetimeChips: string;
  epochs: number;
  lastCreditedAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class HolderChipRewardsService {
  constructor(private pool: Pool) {}

  // ──────────────────────────────────────────────────────────────────
  // Epoch CRUD
  // ──────────────────────────────────────────────────────────────────

  /** Create an epoch and immediately take its snapshot. */
  async createEpoch(options: {
    cohort: Cohort;
    minHoldingThreshold?: number;
    cronTriggered?: boolean;
  }): Promise<HolderChipEpoch> {
    const { cohort, cronTriggered = false } = options;
    // Defaults match the prior merkle services: 1000 MORBIUS for holders, 0 for LP.
    const minHoldingThreshold =
      options.minHoldingThreshold ?? (cohort === 'morbius' ? 1000 : 0);

    const { rows: maxRows } = await this.pool.query<{ max: number | null }>(
      'SELECT MAX(epoch_number) AS max FROM holder_chip_epochs WHERE cohort = $1',
      [cohort],
    );
    const nextNumber = (maxRows[0].max ?? 0) + 1;

    const insert = await this.pool.query<HolderChipEpoch>(
      `INSERT INTO holder_chip_epochs
         (cohort, epoch_number, min_holding_threshold, cron_triggered)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [cohort, nextNumber, minHoldingThreshold, cronTriggered],
    );
    const epoch = insert.rows[0];
    logger.info(`[HolderChips] Created ${cohort} epoch #${nextNumber} (id=${epoch.id})`);

    await this.takeSnapshot(epoch.id);
    const final = await this.getEpoch(epoch.id);
    if (!final) throw new Error('Epoch disappeared after creation');
    return final;
  }

  async getEpoch(epochId: string): Promise<HolderChipEpoch | null> {
    const { rows } = await this.pool.query<HolderChipEpoch>(
      'SELECT * FROM holder_chip_epochs WHERE id = $1',
      [epochId],
    );
    return rows[0] ?? null;
  }

  async listEpochs(cohort?: Cohort): Promise<HolderChipEpoch[]> {
    if (cohort) {
      const { rows } = await this.pool.query<HolderChipEpoch>(
        `SELECT * FROM holder_chip_epochs WHERE cohort = $1
         ORDER BY epoch_number DESC`,
        [cohort],
      );
      return rows;
    }
    const { rows } = await this.pool.query<HolderChipEpoch>(
      'SELECT * FROM holder_chip_epochs ORDER BY created_at DESC',
    );
    return rows;
  }

  /** Latest credited epoch per cohort (for the public stats panel). */
  async getLatestCreditedEpoch(cohort: Cohort): Promise<HolderChipEpoch | null> {
    const { rows } = await this.pool.query<HolderChipEpoch>(
      `SELECT * FROM holder_chip_epochs
       WHERE cohort = $1 AND status = 'credited'
       ORDER BY credited_at DESC NULLS LAST
       LIMIT 1`,
      [cohort],
    );
    return rows[0] ?? null;
  }

  // ──────────────────────────────────────────────────────────────────
  // Snapshot
  // ──────────────────────────────────────────────────────────────────

  async takeSnapshot(epochId: string): Promise<void> {
    const epoch = await this.getEpoch(epochId);
    if (!epoch) throw new Error(`Epoch ${epochId} not found`);
    if (epoch.status !== 'pending') {
      throw new Error(`Epoch must be 'pending' to snapshot (current: ${epoch.status})`);
    }

    const snap =
      epoch.cohort === 'morbius'
        ? await this.snapshotMorbiusHolders(epoch)
        : await this.snapshotLpHolders(epoch);

    if (snap.holders.length === 0) {
      throw new Error(`[HolderChips] Snapshot produced 0 eligible holders — aborting`);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Idempotent: replace any prior snapshot rows for this epoch.
      await client.query('DELETE FROM holder_chip_credits WHERE epoch_id = $1', [epochId]);

      for (const h of snap.holders) {
        await client.query(
          `INSERT INTO holder_chip_credits (epoch_id, wallet_address, basis_wei)
           VALUES ($1, $2, $3)`,
          [epochId, h.address, h.basisWei.toString()],
        );
      }

      const totalBasis = snap.holders.reduce((s, h) => s + h.basisWei, 0n);
      await client.query(
        `UPDATE holder_chip_epochs
         SET status = 'snapshot',
             total_holders = $1,
             total_basis_wei = $2,
             snapshot_block = $3,
             snapshot_at = NOW()
         WHERE id = $4`,
        [snap.holders.length, totalBasis.toString(), snap.snapshotBlock, epochId],
      );
      await client.query('COMMIT');
      logger.info(
        `[HolderChips] ${epoch.cohort} epoch #${epoch.epoch_number} snapshot: `
          + `${snap.holders.length} holders, block ${snap.snapshotBlock}`,
      );
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async snapshotMorbiusHolders(
    epoch: HolderChipEpoch,
  ): Promise<{ holders: EligibleHolder[]; snapshotBlock: number | null }> {
    const minThreshold = BigInt(
      Math.floor(Number(epoch.min_holding_threshold)) * 1e18,
    );
    const blocklist = await loadHolderSnapshotBlocklist(this.pool);
    logger.info(`[HolderChips] Holder blocklist size: ${blocklist.size}`);

    let holders: Array<{ address: string; balance: bigint }>;
    let snapshotBlock: number | null;

    if (isMoralisHoldersConfigured()) {
      holders = await fetchMorbiusHoldersFromMoralis();
      // Moralis is latest-state; record the block we observed snapshot at.
      const bn = await getPublicClient().getBlockNumber();
      snapshotBlock = Number(bn);
    } else {
      const out = await fetchMorbiusHoldersFromChain();
      holders = out.holders;
      snapshotBlock = Number(out.blockNumber);
    }

    const eligible: EligibleHolder[] = [];
    for (const h of holders) {
      const addr = h.address.toLowerCase();
      if (blocklist.has(addr)) continue;
      if (h.balance < minThreshold) continue;
      eligible.push({ address: addr, basisWei: h.balance });
    }
    return { holders: eligible, snapshotBlock };
  }

  private async snapshotLpHolders(
    _epoch: HolderChipEpoch,
  ): Promise<{ holders: EligibleHolder[]; snapshotBlock: number | null }> {
    const { rows: pairs } = await this.pool.query<{ pair_address: string }>(
      `SELECT pair_address FROM merkle_lp_pairs WHERE active = TRUE`,
    );
    if (pairs.length === 0) {
      throw new Error('[HolderChips] No active LP pairs configured');
    }
    const blocklist = await loadLpSnapshotBlocklist(this.pool);
    const snapshotBlock = await getLatestBlock();

    // wallet → aggregated MORBIUS-equivalent across all pairs
    const agg = new Map<string, bigint>();

    for (const { pair_address } of pairs) {
      try {
        const reserves = await getPairReserveInfo(pair_address as `0x${string}`);
        if (!reserves.hasLiquidity) continue;
        const lpHolders = await fetchLPHolders(pair_address);
        for (const h of lpHolders) {
          const addr = h.address.toLowerCase();
          if (blocklist.has(addr)) continue;
          const morbiusEq = calcMorbiusEquivalent(h.balance, reserves);
          if (morbiusEq <= 0n) continue;
          agg.set(addr, (agg.get(addr) ?? 0n) + morbiusEq);
        }
      } catch (err) {
        logger.warn(
          `[HolderChips] LP pair ${pair_address} snapshot failed: ${(err as Error).message}`,
        );
      }
    }

    const eligible: EligibleHolder[] = [];
    for (const [addr, basisWei] of agg.entries()) {
      eligible.push({ address: addr, basisWei });
    }
    return { holders: eligible, snapshotBlock };
  }

  // ──────────────────────────────────────────────────────────────────
  // Credit (terminal step)
  // ──────────────────────────────────────────────────────────────────

  /**
   * Distribute morbiusPoolWei as chips across the snapshot in a single
   * transaction. Fail-fast: both rescue + topup tx hashes are required (the
   * DB constraint enforces this on status='credited' too).
   */
  async creditChips(opts: {
    epochId: string;
    morbiusPoolWei: bigint;
    rescueTxHash: string;
    topupTxHash: string;
  }): Promise<HolderChipEpoch> {
    const { epochId, morbiusPoolWei, rescueTxHash, topupTxHash } = opts;
    if (morbiusPoolWei <= 0n) throw new Error('morbiusPoolWei must be > 0');
    if (!/^0x[a-fA-F0-9]{64}$/.test(rescueTxHash)) throw new Error('Invalid rescueTxHash');
    if (!/^0x[a-fA-F0-9]{64}$/.test(topupTxHash)) throw new Error('Invalid topupTxHash');

    const epoch = await this.getEpoch(epochId);
    if (!epoch) throw new Error(`Epoch ${epochId} not found`);
    if (epoch.status !== 'snapshot') {
      throw new Error(`Epoch must be 'snapshot' to credit (current: ${epoch.status})`);
    }
    const totalBasis = BigInt(epoch.total_basis_wei);
    if (totalBasis <= 0n) throw new Error('total_basis_wei is 0 — nothing to allocate');

    // Pull snapshot rows ordered by basis DESC so the remainder loop in
    // allocateChips() spills extra chips to the largest holders first.
    const { rows: snapRows } = await this.pool.query<{
      id: number; wallet_address: string; basis_wei: string;
    }>(
      `SELECT id, wallet_address, basis_wei
       FROM holder_chip_credits
       WHERE epoch_id = $1
       ORDER BY basis_wei DESC, wallet_address`,
      [epochId],
    );
    if (snapRows.length === 0) throw new Error('No snapshot rows for epoch');

    const allocations = allocateChips(
      snapRows.map((r) => ({
        id: r.id,
        wallet: r.wallet_address,
        basisWei: BigInt(r.basis_wei),
      })),
      morbiusPoolWei,
      totalBasis,
    );

    const reason: PokerChipLedgerReason =
      epoch.cohort === 'morbius' ? 'holder_reward' : 'lp_holder_reward';
    const totalChips = allocations.reduce((s, a) => s + a.chips, 0n);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Record proofs + pool size BEFORE crediting. The CHECK constraint
      // (credited_has_tx) ensures we can't reach 'credited' without these.
      await client.query(
        `UPDATE holder_chip_epochs
         SET morbius_pool_wei = $1,
             rescue_tx_hash   = $2,
             topup_tx_hash    = $3
         WHERE id = $4`,
        [morbiusPoolWei.toString(), rescueTxHash, topupTxHash, epochId],
      );

      for (const a of allocations) {
        if (a.chips === 0n) continue; // dust holder — skip ledger row

        await applyPokerChipDelta(
          client,
          a.wallet,
          a.chips,
          reason,
          { type: 'holder_epoch', id: epochId },
        );

        // ref (type='holder_epoch', id=epochId) + wallet + reason is unique per
        // holder per epoch — deterministic lookup.
        const { rows: ledgerRows } = await client.query<{ id: string }>(
          `SELECT id FROM poker_chip_ledger
           WHERE wallet_address = $1
             AND ref_type = 'holder_epoch'
             AND ref_id   = $2
             AND reason   = $3
           ORDER BY created_at DESC
           LIMIT 1`,
          [a.wallet, epochId, reason],
        );
        const ledgerId = ledgerRows[0]?.id ?? null;

        await client.query(
          `UPDATE holder_chip_credits
           SET chips_credited = $1, ledger_id = $2
           WHERE id = $3`,
          [a.chips.toString(), ledgerId, a.id],
        );
      }

      await client.query(
        `UPDATE holder_chip_epochs
         SET status = 'credited',
             total_chips_credited = $1,
             credited_at = NOW()
         WHERE id = $2`,
        [totalChips.toString(), epochId],
      );

      await client.query('COMMIT');
      logger.info(
        `[HolderChips] ${epoch.cohort} epoch #${epoch.epoch_number} credited: `
          + `${totalChips} chips across ${allocations.length} holders`,
      );
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const final = await this.getEpoch(epochId);
    if (!final) throw new Error('Epoch disappeared after credit');
    return final;
  }

  // ──────────────────────────────────────────────────────────────────
  // Read APIs (power the /claim panels)
  // ──────────────────────────────────────────────────────────────────

  /** Most recent credited epochs for a wallet (any cohort, or filtered). */
  async getWalletHistory(
    walletAddress: string,
    cohort?: Cohort,
    limit = 12,
  ): Promise<WalletHistoryRow[]> {
    const addr = walletAddress.toLowerCase();
    const params: unknown[] = [addr];
    let cohortClause = '';
    if (cohort) {
      params.push(cohort);
      cohortClause = `AND e.cohort = $${params.length}`;
    }
    params.push(limit);
    const { rows } = await this.pool.query<WalletHistoryRow>(
      `SELECT
         e.id            AS epoch_id,
         e.cohort        AS cohort,
         e.epoch_number  AS epoch_number,
         e.credited_at   AS credited_at,
         c.basis_wei::text       AS basis_wei,
         c.chips_credited::text  AS chips_credited,
         e.morbius_pool_wei::text AS morbius_pool_wei,
         e.total_basis_wei::text  AS total_basis_wei
       FROM holder_chip_credits c
       JOIN holder_chip_epochs  e ON e.id = c.epoch_id
       WHERE c.wallet_address = $1
         AND e.status = 'credited'
         ${cohortClause}
       ORDER BY e.credited_at DESC NULLS LAST
       LIMIT $${params.length}`,
      params,
    );
    return rows;
  }

  /** Lifetime chip totals + last-credited timestamp, split by cohort. */
  async getWalletTotals(walletAddress: string): Promise<{
    morbius: WalletCohortTotals;
    lp: WalletCohortTotals;
  }> {
    const addr = walletAddress.toLowerCase();
    const { rows } = await this.pool.query<{
      cohort: Cohort; sum: string; n: string; last: string | null;
    }>(
      `SELECT e.cohort                                AS cohort,
              COALESCE(SUM(c.chips_credited), 0)::text AS sum,
              COUNT(*)::text                          AS n,
              MAX(e.credited_at)                      AS last
       FROM holder_chip_credits c
       JOIN holder_chip_epochs  e ON e.id = c.epoch_id
       WHERE c.wallet_address = $1 AND e.status = 'credited'
       GROUP BY e.cohort`,
      [addr],
    );
    const empty: WalletCohortTotals = { lifetimeChips: '0', epochs: 0, lastCreditedAt: null };
    const out = { morbius: { ...empty }, lp: { ...empty } };
    for (const r of rows) {
      out[r.cohort] = {
        lifetimeChips: r.sum,
        epochs: Number(r.n),
        lastCreditedAt: r.last,
      };
    }
    return out;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Allocation math — pure, exported for unit testing
// ─────────────────────────────────────────────────────────────────────────────

export interface AllocationInput {
  id: number;
  wallet: string;
  basisWei: bigint;
}

export interface AllocationResult {
  id: number;
  wallet: string;
  chips: bigint;
}

/**
 * Distribute `poolWei` (MORBIUS wei) as whole chips across holders by basis share.
 *
 * Algorithm:
 *   1. poolChips = floor(poolWei / 10^18)  — sub-chip dust stays in the vault.
 *   2. each holder gets floor(basis_i × poolChips / totalBasis).
 *   3. leftover whole chips (poolChips − Σfloor) are handed out one at a time
 *      starting with the highest-basis holder (caller pre-sorts DESC).
 *
 * Pure function: no DB, no side effects. Holders may end up with 0 chips
 * (sub-basis dust) — caller must skip those when posting to ledger.
 */
export function allocateChips(
  holders: AllocationInput[],
  poolWei: bigint,
  totalBasisWei: bigint,
): AllocationResult[] {
  if (poolWei < 0n) throw new Error('poolWei must be ≥ 0');
  if (totalBasisWei <= 0n) throw new Error('totalBasisWei must be > 0');
  if (holders.length === 0) return [];

  const poolChips = poolWei / POKER_CHIP_WEI;
  if (poolChips === 0n) {
    return holders.map((h) => ({ id: h.id, wallet: h.wallet, chips: 0n }));
  }

  const allocs: AllocationResult[] = holders.map((h) => ({
    id: h.id,
    wallet: h.wallet,
    chips: (h.basisWei * poolChips) / totalBasisWei,
  }));

  const floored = allocs.reduce((s, a) => s + a.chips, 0n);
  let remainder = poolChips - floored;
  let i = 0;
  while (remainder > 0n) {
    allocs[i % allocs.length].chips += 1n;
    remainder -= 1n;
    i += 1;
  }
  return allocs;
}
