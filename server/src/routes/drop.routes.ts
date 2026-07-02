/**
 * drop.routes.ts — "The Weekly Drop" raffle jackpot (WEEKLY_DROP_SPEC.md).
 *
 * Endpoints:
 *   GET  /api/drop                 — public: open pot (floored to the 25k
 *                                    guarantee), countdown target, optional
 *                                    ?address= personal entries/progress block,
 *                                    last draw's top-3 winners + commitment.
 *   POST /api/drop/daily           — SIWE-authed: claim the free daily entry
 *                                    (requires ≥1 lifetime settled wager,
 *                                    once per UTC day).
 *   GET  /api/drop/verify/:drawId  — public: commit-reveal fairness data
 *                                    (commitment, revealed seed, entry list
 *                                    snapshot + hash, winners, recipe).
 *
 * All chip amounts are whole chips (1 chip = 1 MORBIUS), as decimal strings.
 */

import type { Express, Request, Response } from 'express';
import type { AuthService } from '../services/auth.service';
import { WeeklyDropError, type WeeklyDropService } from '../services/weekly-drop.service';
import { requireAuth } from '../middleware/require-auth';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterDropRoutesOptions {
  app: Express;
  weeklyDropService: WeeklyDropService;
  authService: AuthService;
}

export function registerDropRoutes({ app, weeklyDropService, authService }: RegisterDropRoutesOptions): void {
  // GET /api/drop — the home-page module payload. Response contract (the
  // frontend depends on this exactly):
  //   {
  //     draw: { id, closesAt (ISO), potChips (string, floor applied),
  //             guaranteedMin (string), status },
  //     you: { entries, progressWagered (string), progressTarget (string) } | null,
  //     lastWinners: [{ rank, address, displayName (string|null), amountChips (string) }],
  //     commitment (string|null)
  //   }
  app.get('/api/drop', async (req: Request, res: Response) => {
    try {
      const address = typeof req.query.address === 'string' ? req.query.address : undefined;
      const current = await weeklyDropService.getCurrentDrop(address);
      if (!current) {
        // No open draw (boot race / manual intervention) — momentary; the
        // scheduler self-heals within a tick.
        return res.status(503).json({ error: 'No open draw', code: 'NO_OPEN_DRAW' });
      }
      sendJson(res, current);
    } catch (error) {
      logger.error('[Drop] GET /api/drop failed', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/drop/daily — free daily entry for the signed-in wallet.
  app.post('/api/drop/daily', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const address = req.user!.address; // trusted SIWE session, never from body
      const result = await weeklyDropService.claimDailyEntry(address);
      sendJson(res, { ok: true, entries: result.entries });
    } catch (error) {
      if (error instanceof WeeklyDropError) {
        const status =
          error.code === 'ALREADY_CLAIMED' ? 409 :
          error.code === 'NO_WAGER_HISTORY' ? 403 : 503;
        return res.status(status).json({ error: error.code, code: error.code });
      }
      logger.error('[Drop] daily claim failed', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/drop/verify/:drawId — provable-fairness data for a past draw.
  app.get('/api/drop/verify/:drawId', async (req: Request, res: Response) => {
    try {
      const data = await weeklyDropService.getVerifyData(req.params.drawId);
      if (!data) return res.status(404).json({ error: 'Draw not found' });
      sendJson(res, data);
    } catch (error) {
      logger.error('[Drop] verify failed', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
