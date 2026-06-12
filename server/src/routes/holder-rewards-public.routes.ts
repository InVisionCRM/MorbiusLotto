/**
 * Public read endpoints for the /claim page panels.
 *
 *   GET /api/holder-rewards/wallet/:address
 *     → { morbius: WalletPanelData, lp: WalletPanelData }
 *
 *   GET /api/holder-rewards/latest?cohort=morbius|lp
 *     → most recent credited epoch (anonymous summary, for the analytics tile)
 *
 * No auth — anyone can look up any wallet's credit history (the on-chain
 * funding model means everything is already public anyway).
 */

import type { Express } from 'express';
import type { HolderChipRewardsService, Cohort } from '../services/holder-chip-rewards.service';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterHolderRewardsPublicRoutesOptions {
  app: Express;
  holderChipRewardsService: HolderChipRewardsService;
}

function isValidCohort(v: unknown): v is Cohort {
  return v === 'morbius' || v === 'lp';
}

function isValidAddress(s: unknown): s is string {
  return typeof s === 'string' && /^0x[a-fA-F0-9]{40}$/.test(s);
}

export function registerHolderRewardsPublicRoutes({
  app,
  holderChipRewardsService,
}: RegisterHolderRewardsPublicRoutesOptions): void {

  /**
   * Combined wallet panel data: lifetime totals + per-cohort credit history.
   * Single endpoint → single round-trip from the UI.
   */
  app.get('/api/holder-rewards/wallet/:address', async (req, res) => {
    const { address } = req.params;
    if (!isValidAddress(address)) {
      res.status(400).json({ error: 'Invalid wallet address' });
      return;
    }

    try {
      const [totals, morbiusHistory, lpHistory] = await Promise.all([
        holderChipRewardsService.getWalletTotals(address),
        holderChipRewardsService.getWalletHistory(address, 'morbius', 12),
        holderChipRewardsService.getWalletHistory(address, 'lp', 12),
      ]);
      sendJson(res, {
        morbius: { ...totals.morbius, history: morbiusHistory },
        lp:      { ...totals.lp,      history: lpHistory },
      });
    } catch (err) {
      logger.error('[HolderRewardsPublic] wallet lookup failed', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Latest credited epoch for a cohort (no wallet context required).
   * Powers the "next drop" / "last drop" stats on the public Analytics tab.
   */
  app.get('/api/holder-rewards/latest', async (req, res) => {
    const cohort = req.query.cohort;
    if (!isValidCohort(cohort)) {
      res.status(400).json({ error: "cohort must be 'morbius' | 'lp'" });
      return;
    }
    try {
      const epoch = await holderChipRewardsService.getLatestCreditedEpoch(cohort);
      sendJson(res, epoch);
    } catch (err) {
      logger.error('[HolderRewardsPublic] latest lookup failed', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
