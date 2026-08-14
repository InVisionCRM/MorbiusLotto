/**
 * slot-machines-stats.routes.ts — metrics for community slot machines.
 *
 * Everything here is pure aggregation over ledgers that already exist —
 * community_slot_spins (every round, bet/payout/bonus), the sessions table
 * (whose `real` flag splits free play from real money), and the two money
 * event tables. No new data capture; the tables ARE the analytics.
 *
 * Creator (SIWE, owner-gated — works on disabled machines so a retired
 * machine's history stays readable):
 *   GET /api/slot-machines/mine/stats    — one summary row per machine
 *   GET /api/slot-machines/:slug/stats   — deep dive: mode split, money
 *                                          flows, best win, 30-day series
 *
 * Platform dashboard (the /activity page's Slots tab). Same gate as the
 * rest of /api/admin-ops: SIWE session + admin allowlist, reached through
 * the Next proxy at app/api/admin-ops/[...path]/route.ts:
 *   GET /api/admin-ops/slots/overview       — totals + every machine
 *   GET /api/admin-ops/slots/activity       — merged feed (?limit, ?slug)
 *   GET /api/admin-ops/slots/machine/:slug  — the same deep dive the
 *                                             creator sees, admin edition
 *
 * Amounts: spins/credits are integers; bankroll and base_units amounts are
 * token base-unit strings (client formats with token decimals).
 */

import type { Express, Request, Response, NextFunction, RequestHandler } from 'express';
import type { Pool } from 'pg';
import type { DatabaseService, CommunitySlotMachine } from '../services/database.service';
import type { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/require-auth';
import { isAdminWallet } from '../lib/cosmetics-catalog';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterSlotMachineStatsRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
}

/** Per-mode aggregate over a machine's spins. */
const MODE_SPLIT_SQL = `
  SELECT s.real,
         COUNT(*)::int                                   AS spins,
         COALESCE(SUM(sp.bet), 0)::text                  AS wagered,
         COALESCE(SUM(sp.payout), 0)::text               AS paid,
         COUNT(DISTINCT sp.player_address)::int          AS players,
         COUNT(*) FILTER (WHERE sp.bonus_kind IS NOT NULL)::int AS bonus_rounds,
         COALESCE(MAX(sp.payout), 0)::text               AS best_win,
         MAX(sp.created_at)                              AS last_spin_at
    FROM community_slot_spins sp
    JOIN community_slot_sessions s ON s.id = sp.session_id
   WHERE sp.machine_id = $1
   GROUP BY s.real`;

function emptyMode() {
  return { spins: 0, wagered: '0', paid: '0', players: 0, bonusRounds: 0, bestWin: '0', lastSpinAt: null as string | null, rtpPct: null as number | null };
}
function normalizeMode(row: any) {
  const wagered = Number(row.wagered);
  return {
    spins: Number(row.spins),
    wagered: String(row.wagered),
    paid: String(row.paid),
    players: Number(row.players),
    bonusRounds: Number(row.bonus_rounds),
    bestWin: String(row.best_win),
    lastSpinAt: row.last_spin_at,
    rtpPct: wagered > 0 ? Math.round((Number(row.paid) / wagered) * 10000) / 100 : null,
  };
}

/** The full deep dive for one machine — shared by the creator route and the admin dashboard. */
async function machineStats(pool: Pool, machine: CommunitySlotMachine) {
  const [modes, daily, bankrollFlows, playerFlows, liabilities, tokenRow] = await Promise.all([
    pool.query(MODE_SPLIT_SQL, [machine.id]),
    pool.query(
      `SELECT date_trunc('day', sp.created_at)::date AS day, s.real,
              COUNT(*)::int AS spins,
              COALESCE(SUM(sp.bet), 0)::text AS wagered,
              COALESCE(SUM(sp.bet - sp.payout), 0)::text AS net
         FROM community_slot_spins sp
         JOIN community_slot_sessions s ON s.id = sp.session_id
        WHERE sp.machine_id = $1 AND sp.created_at > NOW() - interval '30 days'
        GROUP BY 1, 2 ORDER BY 1`,
      [machine.id],
    ),
    pool.query(
      `SELECT kind, COALESCE(SUM(amount), 0)::text AS total, COUNT(*)::int AS n
         FROM community_slot_bankroll_events WHERE machine_id = $1 GROUP BY kind`,
      [machine.id],
    ),
    pool.query(
      `SELECT kind, COALESCE(SUM(base_units), 0)::text AS total, COUNT(*)::int AS n
         FROM community_slot_player_events WHERE machine_id = $1 GROUP BY kind`,
      [machine.id],
    ),
    pool.query(
      `SELECT COALESCE(SUM(balance), 0)::text AS total FROM community_slot_sessions
        WHERE machine_id = $1 AND real`,
      [machine.id],
    ),
    pool.query(
      `SELECT token_symbol, token_decimals, bankroll::text AS bankroll, credit_value::text AS credit_value
         FROM community_slot_machines WHERE id = $1`,
      [machine.id],
    ),
  ]);

  const byMode: Record<string, ReturnType<typeof normalizeMode> | ReturnType<typeof emptyMode>> = { credits: emptyMode(), real: emptyMode() };
  for (const row of modes.rows) byMode[row.real ? 'real' : 'credits'] = normalizeMode(row);
  const flows = (rows: any[]) => Object.fromEntries(rows.map((x: any) => [x.kind, { total: String(x.total), count: Number(x.n) }]));
  const t = tokenRow.rows[0];

  return {
    machine: { slug: machine.slug, name: machine.name, status: machine.status, owner: machine.owner_address, simRtpPct: machine.rtp_pct, winCapX: machine.win_cap_x },
    token: t.token_symbol ? { symbol: t.token_symbol, decimals: Number(t.token_decimals), creditValue: t.credit_value } : null,
    modes: byMode,
    money: {
      bankroll: t.bankroll ?? '0',
      playerLiabilities: String(liabilities.rows[0].total),
      bankrollFlows: flows(bankrollFlows.rows),
      playerFlows: flows(playerFlows.rows),
    },
    daily: daily.rows.map((row: any) => ({
      day: row.day, mode: row.real ? 'real' : 'credits',
      spins: Number(row.spins), wagered: String(row.wagered), net: String(row.net),
    })),
  };
}

export function registerSlotMachineStatsRoutes({ app, dbService, authService }: RegisterSlotMachineStatsRoutesOptions): void {
  const pool = dbService.getPool();

  // Same admin gate as the rest of /api/admin-ops (admin-ops.routes.ts):
  // requireAuth establishes req.user.address; then enforce the allowlist.
  const requireAdmin: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const addr = req.user?.address;
    if (!addr || !isAdminWallet(addr)) {
      return res.status(403).json({ error: 'admin only', code: 'NOT_ADMIN' });
    }
    return next();
  };

  // ---------------------------------------------------------------------
  // GET /api/slot-machines/mine/stats — one row per machine the caller owns.
  // (Registered before /:slug/stats so the literal `mine` never binds.)
  // ---------------------------------------------------------------------
  app.get('/api/slot-machines/mine/stats', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const wallet = req.user!.address.toLowerCase();
      const r = await pool.query(
        `SELECT m.slug, m.name, m.status, m.token_symbol, m.token_decimals, m.bankroll::text AS bankroll,
                m.rtp_pct::float AS sim_rtp_pct,
                COUNT(sp.id)::int AS spins,
                COUNT(sp.id) FILTER (WHERE s.real)::int AS real_spins,
                COALESCE(SUM(sp.bet) FILTER (WHERE s.real), 0)::text AS real_wagered,
                COALESCE(SUM(sp.bet - sp.payout) FILTER (WHERE s.real), 0)::text AS real_net,
                COUNT(DISTINCT sp.player_address)::int AS players,
                MAX(sp.created_at) AS last_spin_at
           FROM community_slot_machines m
           LEFT JOIN community_slot_spins sp ON sp.machine_id = m.id
           LEFT JOIN community_slot_sessions s ON s.id = sp.session_id
          WHERE m.owner_address = $1 AND m.status != 'disabled'
          GROUP BY m.id
          ORDER BY MAX(sp.created_at) DESC NULLS LAST, m.updated_at DESC`,
        [wallet],
      );
      return sendJson(res, {
        ok: true,
        machines: r.rows.map((row: any) => ({
          slug: row.slug, name: row.name, status: row.status,
          tokenSymbol: row.token_symbol, tokenDecimals: row.token_decimals != null ? Number(row.token_decimals) : null,
          bankroll: row.bankroll ?? '0',
          simRtpPct: row.sim_rtp_pct,
          spins: Number(row.spins), realSpins: Number(row.real_spins),
          realWagered: String(row.real_wagered), realNet: String(row.real_net),
          players: Number(row.players), lastSpinAt: row.last_spin_at,
        })),
      });
    } catch (error) {
      logger.error('[SlotStats] mine failed', error);
      return res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------
  // GET /api/admin-ops/slots/overview — platform totals + every machine.
  // ---------------------------------------------------------------------
  app.get('/api/admin-ops/slots/overview', requireAuth(authService), requireAdmin, async (_req: Request, res: Response) => {
    try {
      const totals = await pool.query(
        `SELECT COUNT(*)::int AS machines,
                COUNT(*) FILTER (WHERE status = 'published')::int AS published,
                COUNT(*) FILTER (WHERE token_address IS NOT NULL)::int AS token_machines
           FROM community_slot_machines`,
      );
      const spinTotals = await pool.query(
        `SELECT COUNT(*)::int AS spins,
                COUNT(*) FILTER (WHERE s.real)::int AS real_spins,
                COALESCE(SUM(sp.bet) FILTER (WHERE s.real), 0)::text AS real_wagered,
                COALESCE(SUM(sp.payout) FILTER (WHERE s.real), 0)::text AS real_paid,
                COUNT(DISTINCT sp.player_address)::int AS players
           FROM community_slot_spins sp
           JOIN community_slot_sessions s ON s.id = sp.session_id`,
      );
      const machines = await pool.query(
        `SELECT m.slug, m.name, m.status, m.owner_address, m.token_symbol, m.token_decimals,
                m.bankroll::text AS bankroll, m.token_fee_warning, m.rtp_pct::float AS sim_rtp_pct,
                COUNT(sp.id)::int AS spins,
                COUNT(sp.id) FILTER (WHERE s.real)::int AS real_spins,
                COALESCE(SUM(sp.bet) FILTER (WHERE s.real), 0)::text AS real_wagered,
                COALESCE(SUM(sp.bet - sp.payout) FILTER (WHERE s.real), 0)::text AS real_net,
                COUNT(DISTINCT sp.player_address)::int AS players,
                MAX(sp.created_at) AS last_spin_at,
                COALESCE((SELECT SUM(ps.balance) FROM community_slot_sessions ps
                           WHERE ps.machine_id = m.id AND ps.real), 0)::text AS player_liabilities
           FROM community_slot_machines m
           LEFT JOIN community_slot_spins sp ON sp.machine_id = m.id
           LEFT JOIN community_slot_sessions s ON s.id = sp.session_id
          GROUP BY m.id
          ORDER BY MAX(sp.created_at) DESC NULLS LAST, m.updated_at DESC
          LIMIT 500`,
      );
      return sendJson(res, {
        ok: true,
        totals: {
          machines: Number(totals.rows[0].machines),
          published: Number(totals.rows[0].published),
          tokenMachines: Number(totals.rows[0].token_machines),
          spins: Number(spinTotals.rows[0].spins),
          realSpins: Number(spinTotals.rows[0].real_spins),
          realWagered: String(spinTotals.rows[0].real_wagered),
          realPaid: String(spinTotals.rows[0].real_paid),
          players: Number(spinTotals.rows[0].players),
        },
        machines: machines.rows.map((row: any) => ({
          slug: row.slug, name: row.name, status: row.status, owner: row.owner_address,
          tokenSymbol: row.token_symbol, tokenDecimals: row.token_decimals != null ? Number(row.token_decimals) : null,
          bankroll: row.bankroll ?? '0', feeWarning: !!row.token_fee_warning,
          simRtpPct: row.sim_rtp_pct,
          spins: Number(row.spins), realSpins: Number(row.real_spins),
          realWagered: String(row.real_wagered), realNet: String(row.real_net),
          players: Number(row.players), lastSpinAt: row.last_spin_at,
          playerLiabilities: String(row.player_liabilities),
        })),
      });
    } catch (error) {
      logger.error('[SlotStats] admin overview failed', error);
      return res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------
  // GET /api/admin-ops/slots/activity — merged recent feed (?limit, ?slug).
  // ---------------------------------------------------------------------
  app.get('/api/admin-ops/slots/activity', requireAuth(authService), requireAdmin, async (req: Request, res: Response) => {
    try {
      const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit ?? '50'), 10) || 50));
      const slug = typeof req.query.slug === 'string' && req.query.slug.trim() ? req.query.slug.trim() : null;
      const r = await pool.query(
        `(SELECT 'spin' AS kind, m.slug, m.name, sp.player_address AS actor,
                 sp.bet::text AS a, sp.payout::text AS b,
                 (CASE WHEN s.real THEN 'real' ELSE 'credits' END) AS detail,
                 sp.created_at
            FROM community_slot_spins sp
            JOIN community_slot_machines m ON m.id = sp.machine_id
            JOIN community_slot_sessions s ON s.id = sp.session_id
           WHERE $2::text IS NULL OR m.slug = $2)
         UNION ALL
         (SELECT ('bankroll_' || e.kind) AS kind, m.slug, m.name, e.actor_address AS actor,
                 e.amount::text AS a, NULL AS b, e.tx_hash AS detail, e.created_at
            FROM community_slot_bankroll_events e
            JOIN community_slot_machines m ON m.id = e.machine_id
           WHERE $2::text IS NULL OR m.slug = $2)
         UNION ALL
         (SELECT ('player_' || e.kind) AS kind, m.slug, m.name, e.player_address AS actor,
                 e.base_units::text AS a, e.credits::text AS b, e.tx_hash AS detail, e.created_at
            FROM community_slot_player_events e
            JOIN community_slot_machines m ON m.id = e.machine_id
           WHERE $2::text IS NULL OR m.slug = $2)
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit, slug],
      );
      return sendJson(res, {
        ok: true,
        events: r.rows.map((row: any) => ({
          kind: row.kind, slug: row.slug, machine: row.name, actor: row.actor,
          a: row.a, b: row.b, detail: row.detail, at: row.created_at,
        })),
      });
    } catch (error) {
      logger.error('[SlotStats] admin activity failed', error);
      return res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------
  // GET /api/admin-ops/slots/machine/:slug — deep dive, admin edition.
  // ---------------------------------------------------------------------
  app.get('/api/admin-ops/slots/machine/:slug', requireAuth(authService), requireAdmin, async (req: Request, res: Response) => {
    try {
      const machine = await dbService.getSlotMachineBySlug(req.params.slug);
      if (!machine) return res.status(404).json({ ok: false, error: 'not found' });
      return sendJson(res, { ok: true, ...(await machineStats(pool as Pool, machine)) });
    } catch (error) {
      logger.error('[SlotStats] admin machine failed', error);
      return res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------
  // GET /api/slot-machines/:slug/stats — the creator's deep dive.
  // ---------------------------------------------------------------------
  app.get('/api/slot-machines/:slug/stats', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const machine = await dbService.getSlotMachineBySlug(req.params.slug);
      if (!machine) return res.status(404).json({ ok: false, error: 'not found' });
      if (machine.owner_address.toLowerCase() !== req.user!.address.toLowerCase()) {
        return res.status(403).json({ ok: false, error: 'not your machine', code: 'WRONG_WALLET' });
      }
      return sendJson(res, { ok: true, ...(await machineStats(pool as Pool, machine)) });
    } catch (error) {
      logger.error('[SlotStats] machine stats failed', error);
      return res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  });

  logger.info('[SlotStats] routes registered');
}
