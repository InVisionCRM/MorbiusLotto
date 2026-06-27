/**
 * referral.routes.ts — referral program ("refer a friend").
 *
 *   GET  /api/referrals/config             — public: current terms (reward %, welcome bonus)
 *   GET  /api/referrals/:address/summary   — auth (same wallet): your code, referrer, stats
 *   POST /api/referrals/:address/bind      — auth (same wallet): bind a referrer's code { code }
 *
 * Reward accrual itself happens inside the VIP claim flow (VipService.claim →
 * ReferralService.payReferralReward); there is no separate "claim referral"
 * endpoint — earnings land straight in the referrer's chip balance.
 */

import express from 'express';
import type { Express, Request, Response } from 'express';
import type { AuthService } from '../services/auth.service';
import type { ReferralService } from '../services/referral.service';
import { requireAuth, requireSameAddress } from '../middleware/require-auth';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterReferralRoutesOptions {
  app: Express;
  referralService: ReferralService;
  authService: AuthService;
}

export function registerReferralRoutes({ app, referralService, authService }: RegisterReferralRoutesOptions): void {
  // GET /api/referrals/config — public terms so the UI can explain the program.
  app.get('/api/referrals/config', async (_req: Request, res: Response) => {
    try {
      const config = await referralService.getConfig();
      sendJson(res, config);
    } catch (error) {
      logger.error('[Referral] config failed', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/referrals/:address/summary — your code, who referred you, your stats.
  app.get(
    '/api/referrals/:address/summary',
    requireAuth(authService),
    requireSameAddress((req) => req.params.address),
    async (req: Request, res: Response) => {
      try {
        const summary = await referralService.getSummary(req.params.address);
        sendJson(res, summary);
      } catch (error) {
        logger.error('[Referral] summary failed', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  // POST /api/referrals/:address/bind { code } — bind to a referrer (once) + welcome bonus.
  app.post(
    '/api/referrals/:address/bind',
    express.json(),
    requireAuth(authService),
    requireSameAddress((req) => req.params.address),
    async (req: Request, res: Response) => {
      try {
        const code = String(req.body?.code ?? '');
        const result = await referralService.bind(req.params.address, code);
        sendJson(res, { ok: true, ...result });
      } catch (error) {
        // Binding errors are user-facing validation (bad code, already bound, …) —
        // surface the message at 400, not as a 500.
        const message = error instanceof Error ? error.message : 'Could not apply referral code.';
        logger.warn('[Referral] bind rejected', { message });
        res.status(400).json({ ok: false, error: message });
      }
    },
  );

  logger.info('[Referral] routes registered');
}
