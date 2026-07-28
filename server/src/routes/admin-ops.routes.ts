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
 *   GET  /api/admin-ops/dashboard        — full financial dashboard payload
 *   GET  /api/admin-ops/dashboard/players|deposits|withdrawals|big-wins|referrals|history
 */

import type { Express, Request, Response, NextFunction, RequestHandler } from 'express';
import express from 'express';
import { isAddress } from 'viem';
import { logger } from '../utils/logger';
import { requireAuth } from '../middleware/require-auth';
import { isAdminWallet } from '../lib/cosmetics-catalog';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';
import type { ReferralService } from '../services/referral.service';
import { AdminDashboardService, type DashWindow } from '../services/admin-dashboard.service';
import { GameLimitsService } from '../services/game-limits.service';

interface RegisterAdminOpsRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
  referralService: ReferralService;
}

const WINDOWS = new Set<DashWindow>(['24h', '7d', '30d', 'all']);
/** Parse ?window=, defaulting to 24h. */
function winOf(q: unknown, fallback: DashWindow = '24h'): DashWindow {
  return typeof q === 'string' && WINDOWS.has(q as DashWindow) ? (q as DashWindow) : fallback;
}
/** Default "big win" alert threshold, in whole MORBIUS. */
const BIG_WIN_DEFAULT = 100000n;
function minPayoutOf(q: unknown): bigint {
  if (typeof q !== 'string' || !/^\d+$/.test(q)) return BIG_WIN_DEFAULT;
  try {
    const n = BigInt(q);
    return n > 0n ? n : BIG_WIN_DEFAULT;
  } catch {
    return BIG_WIN_DEFAULT;
  }
}

/** Max absolute size of a single manual adjustment, in whole MORBIUS. */
const CREDIT_MAX_MORBIUS = (() => {
  const raw = process.env.ADMIN_CREDIT_MAX_MORBIUS;
  const n = raw ? BigInt(raw.replace(/[_,\s]/g, '')) : 100_000_000n;
  return n > 0n ? n : 100_000_000n;
})();

export function registerAdminOpsRoutes({ app, dbService, authService, referralService }: RegisterAdminOpsRoutesOptions): void {
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

  // ──────────────────────────────────────────────────────────────────────
  // Financial dashboard
  // ──────────────────────────────────────────────────────────────────────
  const dash = new AdminDashboardService(dbService.getPool());

  /** Wrap a dashboard read with admin auth + uniform error handling. */
  const dashRoute = (path: string, handler: (req: Request) => Promise<unknown>) => {
    app.get(path, requireAuth(authService), requireAdmin, async (req: Request, res: Response) => {
      try {
        return res.json(await handler(req));
      } catch (error) {
        logger.error(`admin-ops ${path} failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
        return res.status(500).json({ error: 'dashboard query failed' });
      }
    });
  };

  /** Multiplier thresholds arrive as decimals ("2.5"); clamp to something sane. */
  const multOf = (q: unknown, fallback: number): number => {
    const n = typeof q === 'string' ? Number(q) : NaN;
    return Number.isFinite(n) && n > 0 ? Math.min(n, 1_000_000) : fallback;
  };

  // Everything in one round trip — what the dashboard loads on mount.
  dashRoute('/api/admin-ops/dashboard', (req) =>
    dash.getOverview(
      winOf(req.query.window),
      minPayoutOf(req.query.minPayout),
      multOf(req.query.minMultiplier, 0),
      multOf(req.query.freqMultiplier, 10),
    ),
  );

  // Frequency scan: who clears a multiplier threshold, and how often.
  dashRoute('/api/admin-ops/dashboard/multiplier-frequency', (req) =>
    dash.getMultiplierFrequency(
      winOf(req.query.window, '7d'),
      multOf(req.query.minMultiplier, 10),
      Number(req.query.limit) || 100,
    ),
  );

  dashRoute('/api/admin-ops/dashboard/financials', (req) =>
    dash.getFinancials(winOf(req.query.window)),
  );
  dashRoute('/api/admin-ops/dashboard/players', async (req) => ({
    players: await dash.getPlayers(winOf(req.query.window), Number(req.query.limit) || 250),
  }));
  dashRoute('/api/admin-ops/dashboard/deposits', async (req) => ({
    deposits: await dash.getDeposits(winOf(req.query.window, '7d'), Number(req.query.limit) || 500),
  }));
  dashRoute('/api/admin-ops/dashboard/withdrawals', async (req) => ({
    withdrawals: await dash.getWithdrawals(winOf(req.query.window, '7d'), Number(req.query.limit) || 500),
  }));
  dashRoute('/api/admin-ops/dashboard/big-wins', async (req) => ({
    bigWins: await dash.getBigWins(
      winOf(req.query.window, '7d'),
      minPayoutOf(req.query.minPayout),
      Number(req.query.limit) || 200,
      multOf(req.query.minMultiplier, 0),
    ),
  }));
  dashRoute('/api/admin-ops/dashboard/referrals', () => dash.getReferrers(200));

  // ── Per-game bet limits ────────────────────────────────────────────────
  const limitsSvc = new GameLimitsService(dbService.getPool());
  void limitsSvc.start().catch((e) =>
    logger.error('[game-limits] initial load failed', { error: (e as Error).message }),
  );

  /** Limits + per-game performance, everything the /activity/games page needs. */
  dashRoute('/api/admin-ops/game-limits', async (req) => {
    const win = winOf(req.query.window, '7d');
    const [stats, history] = await Promise.all([
      dash.getGameLimitStats(win),
      limitsSvc.history(30),
    ]);
    const byKey = new Map(stats.map((s) => [s.gameKey, s]));
    return {
      window: win,
      games: limitsSvc.list().map((g) => ({ ...g, stats: byKey.get(g.gameKey) ?? null })),
      history,
    };
  });

  app.put(
    '/api/admin-ops/game-limits',
    express.json(),
    requireAuth(authService),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const body = (req.body ?? {}) as { changes?: unknown };
        if (!Array.isArray(body.changes) || body.changes.length === 0) {
          return res.status(400).json({ error: 'changes[] required' });
        }
        const result = await limitsSvc.save(
          req.user!.address,
          body.changes as Array<{ gameKey: string; min: number; max: number }>,
        );
        return res.json({ ok: true, ...result });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'save failed';
        logger.error('admin-ops game-limits save failed', { error: msg });
        // Validation errors are the caller's fault; surface them verbatim. The
        // missing-migration message is surfaced too — it is actionable.
        const bad = /Unknown game|must be|exceeds|at least/.test(msg);
        const setup = /run migration/i.test(msg);
        return res
          .status(bad ? 400 : setup ? 503 : 500)
          .json({ error: bad || setup ? msg : 'save failed' });
      }
    },
  );

  app.post(
    '/api/admin-ops/game-limits/reset',
    express.json(),
    requireAuth(authService),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const key = String((req.body ?? {}).gameKey ?? '');
        await limitsSvc.reset(req.user!.address, key);
        return res.json({ ok: true, gameKey: key });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'reset failed';
        return res.status(/Unknown game/.test(msg) ? 400 : 500).json({ error: msg });
      }
    },
  );
  // Polled every ~10s by the dashboard's live badge — keep it cheap.
  dashRoute('/api/admin-ops/dashboard/live', (req) =>
    dash.getLiveNow(Number(req.query.minutes) || 5),
  );
  dashRoute('/api/admin-ops/dashboard/history', async (req) => ({
    history: await dash.getDailyHistory(Number(req.query.days) || 30),
  }));

  // ── Referral anti-abuse ────────────────────────────────────────────────
  // Global pause (kill switch), per-referrer drill-down, and blacklist.

  app.post(
    '/api/admin-ops/referrals/enabled',
    requireAuth(authService),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const enabled = (req.body ?? {}).enabled === true;
        const config = await referralService.setEnabled(enabled);
        return res.json({ ok: true, config });
      } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'toggle failed' });
      }
    },
  );

  app.get(
    '/api/admin-ops/referrals/referrer/:address',
    requireAuth(authService),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        return res.json(await referralService.getReferrerDetail(String(req.params.address)));
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'lookup failed';
        return res.status(/Invalid wallet/.test(msg) ? 400 : 500).json({ error: msg });
      }
    },
  );

  // Blacklist any wallets directly (they need not be referrers) + list/remove.
  app.get(
    '/api/admin-ops/referrals/blacklist',
    requireAuth(authService),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const limit = Number(req.query.limit) || 200;
        return res.json({ entries: await referralService.listBlacklist(limit) });
      } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'list failed' });
      }
    },
  );

  app.post(
    '/api/admin-ops/referrals/blacklist',
    requireAuth(authService),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const body = req.body ?? {};
        const raw = Array.isArray(body.addresses) ? body.addresses : [body.address];
        const list = raw.filter((x: unknown) => typeof x === 'string' && x.trim() !== '').map(String);
        if (list.length === 0) return res.status(400).json({ error: 'No addresses supplied' });
        const result = await referralService.blacklistMany(list, {
          reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : undefined,
          by: req.user!.address,
        });
        return res.json({ ok: true, ...result });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'blacklist failed';
        return res.status(/Invalid wallet/.test(msg) ? 400 : 500).json({ error: msg });
      }
    },
  );

  app.post(
    '/api/admin-ops/referrals/referrer/:address/clawback-welcome',
    requireAuth(authService),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const list = (req.body ?? {}).referees;
        if (!Array.isArray(list) || list.length === 0) {
          return res.status(400).json({ error: 'Select at least one referred wallet' });
        }
        const result = await referralService.clawbackWelcomeBonuses(
          String(req.params.address),
          list.map((x: unknown) => String(x)),
        );
        return res.json({ ok: true, ...result });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'clawback failed';
        return res.status(/Invalid wallet/.test(msg) ? 400 : 500).json({ error: msg });
      }
    },
  );

  app.post(
    '/api/admin-ops/referrals/referrer/:address/blacklist',
    requireAuth(authService),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const body = req.body ?? {};
        const address = String(req.params.address);
        if (body.undo === true) {
          return res.json({ ok: true, ...(await referralService.unblacklist(address)) });
        }
        const result = await referralService.blacklist(address, {
          reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : undefined,
          clawback: body.clawback !== false, // default: claw back earned referral rewards
          by: req.user!.address,
        });
        return res.json({ ok: true, ...result });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'blacklist failed';
        return res.status(/Invalid wallet/.test(msg) ? 400 : 500).json({ error: msg });
      }
    },
  );
}
