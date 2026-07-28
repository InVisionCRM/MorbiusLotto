/**
 * admin-ops.routes.ts — in-app admin tools for the /activity dashboard.
 *
 * SECURITY: unlike the legacy `/api/admin/*` routes (gated only by a shared
 * `x-admin-secret` the Next proxy attaches to EVERY caller), these routes are
 * gated per-caller by the real SIWE wallet session (`morb_session` cookie) plus
 * a server-side admin allowlist (`ADMIN_WALLETS`). That combination is what
 * makes a balance-minting endpoint safe to expose — the caller's wallet is
 * cryptographically established, not spoofable from the browser. Do NOT move
 * these under `/api/admin/*` or rely on the shared secret for them.
 *
 * Endpoints (all require an admin session):
 *   GET  /api/admin-ops/users/search?q=  — search players by address / display name
 *   POST /api/admin-ops/credit           — credit (or debit) a wallet's chip balance
 */

import type { Express, Request, Response, NextFunction, RequestHandler } from 'express';
import express from 'express';
import { isAddress } from 'viem';
import { logger } from '../utils/logger';
import { requireAuth } from '../middleware/require-auth';
import { isAdminWallet } from '../lib/cosmetics-catalog';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterAdminOpsRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
}

/** Max absolute size of a single manual adjustment, in whole MORBIUS. */
const CREDIT_MAX_MORBIUS = (() => {
  const raw = process.env.ADMIN_CREDIT_MAX_MORBIUS;
  const n = raw ? BigInt(raw.replace(/[_,\s]/g, '')) : 100_000_000n;
  return n > 0n ? n : 100_000_000n;
})();

export function registerAdminOpsRoutes({ app, dbService, authService }: RegisterAdminOpsRoutesOptions): void {
  // requireAuth establishes req.user.address from the session; then enforce the admin allowlist.
  const requireAdmin: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const addr = req.user?.address;
    if (!addr || !isAdminWallet(addr)) {
      return res.status(403).json({ error: 'admin only', code: 'NOT_ADMIN' });
    }
    return next();
  };

  app.get(
    '/api/admin-ops/users/search',
    requireAuth(authService),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const q = typeof req.query.q === 'string' ? req.query.q : '';
        if (q.trim().length < 2) {
          return res.json({ results: [] });
        }
        const results = await dbService.searchPlayers(q, 20);
        return res.json({ results });
      } catch (error) {
        logger.error('admin-ops user search failed', { error: error instanceof Error ? error.message : String(error) });
        return res.status(500).json({ error: 'search failed' });
      }
    },
  );

  app.post(
    '/api/admin-ops/credit',
    express.json(),
    requireAuth(authService),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const adminAddress = req.user!.address;
        const { address, amount, note } = (req.body ?? {}) as {
          address?: unknown;
          amount?: unknown;
          note?: unknown;
        };

        // Older viem: single-arg isAddress is shape-only (no checksum enforcement),
        // which is what we want so a pasted lowercase address is accepted.
        if (typeof address !== 'string' || !isAddress(address)) {
          return res.status(400).json({ error: 'valid wallet address required' });
        }

        // amount = whole MORBIUS (chip units), signed. Reject fractional / non-numeric.
        let amountChips: bigint;
        try {
          const s = String(amount).trim();
          if (!/^-?\d+$/.test(s)) throw new Error('not an integer');
          amountChips = BigInt(s);
        } catch {
          return res.status(400).json({ error: 'amount must be a whole number of MORBIUS' });
        }
        if (amountChips === 0n) {
          return res.status(400).json({ error: 'amount must be non-zero' });
        }
        const abs = amountChips < 0n ? -amountChips : amountChips;
        if (abs > CREDIT_MAX_MORBIUS) {
          return res.status(400).json({
            error: `amount exceeds the per-adjustment cap of ${CREDIT_MAX_MORBIUS.toString()} MORBIUS`,
            code: 'OVER_CAP',
          });
        }

        const cleanNote = typeof note === 'string' ? note.trim().slice(0, 500) : null;

        try {
          const { balance, logId } = await dbService.adminAdjustChips(
            adminAddress,
            address,
            amountChips,
            cleanNote && cleanNote.length > 0 ? cleanNote : null,
          );
          logger.info('admin balance adjustment', {
            admin: adminAddress.toLowerCase(),
            target: address.toLowerCase(),
            amount: amountChips.toString(),
            logId,
          });
          return res.json({ ok: true, address, balance, logId });
        } catch (e) {
          if (e instanceof Error && /Insufficient poker chips/.test(e.message)) {
            return res.status(400).json({ error: 'debit exceeds the player’s current balance', code: 'INSUFFICIENT' });
          }
          throw e;
        }
      } catch (error) {
        logger.error('admin-ops credit failed', { error: error instanceof Error ? error.message : String(error) });
        return res.status(500).json({ error: 'credit failed' });
      }
    },
  );
}
