/**
 * Admin endpoints for chip-only holder + LP rewards.
 *
 * Replaces /api/admin/merkle/*. Two mutation endpoints model the entire
 * lifecycle (pending → snapshot → credited):
 *
 *   POST  /api/admin/holder-rewards/epochs                    body: { cohort, minHoldingThreshold? }
 *     → creates epoch + takes snapshot immediately. Returns the epoch row.
 *
 *   POST  /api/admin/holder-rewards/epochs/:epochId/finalize  body: { }
 *     → rescue MORBIUS from MerkleClaim vault → owner → hot wallet
 *     → credit chips proportionally to player_poker_chips
 *     → status = 'credited'. Returns the final epoch row.
 *
 * Plus read endpoints for admin UI:
 *   GET   /api/admin/holder-rewards/epochs?cohort=morbius|lp
 *   GET   /api/admin/holder-rewards/epochs/:epochId
 *   GET   /api/admin/holder-rewards/epochs/:epochId/credits
 *   GET   /api/admin/holder-rewards/vault-balance?cohort=morbius|lp
 *
 * Auth: x-admin-wallet header → isAdminWallet(). Both legs of the on-chain
 * flow use MERKLE_OWNER_PRIVATE_KEY.
 */

import type { Express } from 'express';
import type { HolderChipRewardsService, Cohort } from '../services/holder-chip-rewards.service';
import { rescueAndTopUpHotWallet, readVaultBalance, isHolderRescueConfigured, getHolderRescueOwnerAddress } from '../utils/holder-rescue';
import { isAdminWallet } from '../lib/cosmetics-catalog';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterHolderRewardsAdminRoutesOptions {
  app: Express;
  holderChipRewardsService: HolderChipRewardsService;
}

function isValidCohort(v: unknown): v is Cohort {
  return v === 'morbius' || v === 'lp';
}

function adminGate(req: { headers: Record<string, unknown> }): string | null {
  const wallet = (req.headers['x-admin-wallet'] as string | undefined)?.trim();
  if (!wallet || !isAdminWallet(wallet)) return null;
  return wallet.toLowerCase();
}

export function registerHolderRewardsAdminRoutes(
  { app, holderChipRewardsService }: RegisterHolderRewardsAdminRoutesOptions,
): void {

  // ──────────────────────────────────────────────────────────────────
  // Reads
  // ──────────────────────────────────────────────────────────────────

  app.get('/api/admin/holder-rewards/epochs', async (req, res) => {
    if (!adminGate(req)) { res.status(403).json({ error: 'admin only' }); return; }
    try {
      const cohort = typeof req.query.cohort === 'string' ? req.query.cohort : undefined;
      const filter = isValidCohort(cohort) ? cohort : undefined;
      const epochs = await holderChipRewardsService.listEpochs(filter);
      sendJson(res, epochs);
    } catch (err) {
      logger.error('[HolderRewardsAdmin] listEpochs failed', err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/admin/holder-rewards/epochs/:epochId', async (req, res) => {
    if (!adminGate(req)) { res.status(403).json({ error: 'admin only' }); return; }
    try {
      const epoch = await holderChipRewardsService.getEpoch(req.params.epochId);
      if (!epoch) { res.status(404).json({ error: 'epoch not found' }); return; }
      sendJson(res, epoch);
    } catch (err) {
      logger.error('[HolderRewardsAdmin] getEpoch failed', err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/admin/holder-rewards/vault-balance', async (req, res) => {
    if (!adminGate(req)) { res.status(403).json({ error: 'admin only' }); return; }
    try {
      const cohort = req.query.cohort;
      if (!isValidCohort(cohort)) { res.status(400).json({ error: "cohort must be 'morbius' | 'lp'" }); return; }
      const balanceWei = await readVaultBalance(cohort);
      sendJson(res, {
        cohort,
        balanceWei: balanceWei.toString(),
        ownerWallet: getHolderRescueOwnerAddress(),
        ownerConfigured: isHolderRescueConfigured(),
      });
    } catch (err) {
      logger.error('[HolderRewardsAdmin] vault-balance failed', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // Mutations
  // ──────────────────────────────────────────────────────────────────

  /** Create epoch + take snapshot. status: pending → snapshot. */
  app.post('/api/admin/holder-rewards/epochs', async (req, res) => {
    if (!adminGate(req)) { res.status(403).json({ error: 'admin only' }); return; }
    try {
      const { cohort, minHoldingThreshold } = req.body as {
        cohort?: unknown;
        minHoldingThreshold?: unknown;
      };
      if (!isValidCohort(cohort)) {
        res.status(400).json({ error: "cohort must be 'morbius' | 'lp'" });
        return;
      }
      const threshold =
        typeof minHoldingThreshold === 'number' && Number.isFinite(minHoldingThreshold) && minHoldingThreshold >= 0
          ? minHoldingThreshold
          : undefined;
      const epoch = await holderChipRewardsService.createEpoch({
        cohort,
        minHoldingThreshold: threshold,
        cronTriggered: false,
      });
      sendJson(res, epoch);
    } catch (err) {
      logger.error('[HolderRewardsAdmin] createEpoch failed', err);
      res.status(500).json({ error: String(err) });
    }
  });

  /**
   * Manual credit — recovery escape hatch.
   *
   * Use when the on-chain legs of /finalize succeeded but the DB credit
   * transaction rolled back (rare; e.g. transient pg failure). Operator passes
   * the on-chain proof manually so we can skip the rescue and just credit.
   *
   * Body: { morbiusPoolWei (string), rescueTxHash, topupTxHash }
   */
  app.post('/api/admin/holder-rewards/epochs/:epochId/credit', async (req, res) => {
    if (!adminGate(req)) { res.status(403).json({ error: 'admin only' }); return; }
    const { epochId } = req.params;
    try {
      const { morbiusPoolWei, rescueTxHash, topupTxHash } = req.body as {
        morbiusPoolWei?: unknown;
        rescueTxHash?: unknown;
        topupTxHash?: unknown;
      };
      if (typeof morbiusPoolWei !== 'string' || !/^\d+$/.test(morbiusPoolWei)) {
        res.status(400).json({ error: 'morbiusPoolWei must be a positive integer string (wei)' });
        return;
      }
      if (typeof rescueTxHash !== 'string' || typeof topupTxHash !== 'string') {
        res.status(400).json({ error: 'rescueTxHash and topupTxHash required' });
        return;
      }
      const final = await holderChipRewardsService.creditChips({
        epochId,
        morbiusPoolWei: BigInt(morbiusPoolWei),
        rescueTxHash,
        topupTxHash,
      });
      sendJson(res, { epoch: final });
    } catch (err) {
      logger.error('[HolderRewardsAdmin] manual credit failed', err);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /**
   * Rescue → topup hot wallet → credit chips. Single atomic admin action.
   * status: snapshot → credited.
   *
   * Failure modes:
   *   - vault balance 0 → 409, status unchanged
   *   - rescue tx revert → 502, status unchanged (no MORBIUS moved)
   *   - topup tx revert → 502, status unchanged (MORBIUS is in owner wallet; logged for manual recovery)
   *   - credit txn fails → 500, status unchanged (rollback inside service)
   */
  app.post('/api/admin/holder-rewards/epochs/:epochId/finalize', async (req, res) => {
    if (!adminGate(req)) { res.status(403).json({ error: 'admin only' }); return; }
    if (!isHolderRescueConfigured()) {
      res.status(503).json({ error: 'MERKLE_OWNER_PRIVATE_KEY not configured on server' });
      return;
    }
    const { epochId } = req.params;
    try {
      const epoch = await holderChipRewardsService.getEpoch(epochId);
      if (!epoch) { res.status(404).json({ error: 'epoch not found' }); return; }
      if (epoch.status !== 'snapshot') {
        res.status(409).json({ error: `epoch must be 'snapshot' to finalize (current: ${epoch.status})` });
        return;
      }

      logger.info(`[HolderRewardsAdmin] finalize start: ${epoch.cohort} epoch #${epoch.epoch_number} (id=${epochId})`);

      // (1+2) on-chain: rescue → topup hot wallet
      let rescue;
      try {
        rescue = await rescueAndTopUpHotWallet(epoch.cohort);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const noPool = /balance is 0/.test(msg);
        logger.error(`[HolderRewardsAdmin] on-chain rescue/topup failed: ${msg}`);
        res.status(noPool ? 409 : 502).json({ error: msg });
        return;
      }

      // (3) off-chain: credit chips
      const final = await holderChipRewardsService.creditChips({
        epochId,
        morbiusPoolWei: rescue.amountWei,
        rescueTxHash: rescue.rescueTxHash,
        topupTxHash: rescue.topupTxHash,
      });

      logger.info(
        `[HolderRewardsAdmin] finalize complete: ${epoch.cohort} epoch #${epoch.epoch_number} `
        + `credited ${final.total_chips_credited} chips to ${final.total_holders} holders`,
      );
      sendJson(res, { epoch: final, rescue });
    } catch (err) {
      logger.error('[HolderRewardsAdmin] finalize failed', err);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
