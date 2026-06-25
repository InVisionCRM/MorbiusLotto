/**
 * vip.routes.ts — VIP loyalty / rewards program (off-chain chips).
 *
 * Endpoints (main web app):
 *   GET  /api/vip/config            — public: the tier ladder (thresholds, rakeback, bonuses)
 *   GET  /api/vip/:address/status   — auth (same wallet): personal tier, progress, claimable
 *   POST /api/vip/:address/claim    — auth (same wallet): claim rakeback + level-up bonuses
 *
 * Status is gated to the owning wallet so rakeback accrual starts from the
 * player's own first interaction (the state row is lazily created with a
 * forward-looking cursor — see VipService / migration 166).
 */

import type { Express, Request, Response } from 'express';
import type { AuthService } from '../services/auth.service';
import type { VipService } from '../services/vip.service';
import { requireAuth, requireSameAddress } from '../middleware/require-auth';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterVipRoutesOptions {
  app: Express;
  vipService: VipService;
  authService: AuthService;
}

export function registerVipRoutes({ app, vipService, authService }: RegisterVipRoutesOptions): void {
  // GET /api/vip/config — public tier ladder so the UI can render it for anyone.
  app.get('/api/vip/config', async (_req: Request, res: Response) => {
    try {
      const tiers = await vipService.getTiers();
      sendJson(res, { tiers });
    } catch (error) {
      logger.error('[VIP] config failed', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/vip/:address/status — personal status (owning wallet only).
  app.get(
    '/api/vip/:address/status',
    requireAuth(authService),
    requireSameAddress((req) => req.params.address),
    async (req: Request, res: Response) => {
      try {
        const status = await vipService.getStatus(req.params.address);
        sendJson(res, status);
      } catch (error) {
        logger.error('[VIP] status failed', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  // POST /api/vip/:address/claim — claim rakeback + pending level-up bonuses.
  app.post(
    '/api/vip/:address/claim',
    requireAuth(authService),
    requireSameAddress((req) => req.params.address),
    async (req: Request, res: Response) => {
      try {
        const result = await vipService.claim(req.params.address);
        sendJson(res, { ok: true, ...result });
      } catch (error) {
        logger.error('[VIP] claim failed', error);
        res.status(500).json({ ok: false, error: 'Could not claim rewards.' });
      }
    },
  );

  logger.info('[VIP] routes registered');
}
