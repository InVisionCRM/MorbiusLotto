/**
 * AdminDashboardService — the numbers behind the admin financial dashboard.
 *
 * Everything an operator needs to watch the book: P&L, cash in/out, per-player
 * exposure, referral cost, and the outlier feeds used to spot someone beating
 * (or gaming) the house.
 *
 * UNITS: the chip ledger is whole MORBIUS (1 chip = 1 MORBIUS = 10^18 wei).
 * player_deposits.amount and hot_withdrawal_jobs.*_wei are WEI, so those are
 * floored to whole MORBIUS here — every figure this service returns is whole
 * MORBIUS as a decimal string, so the UI never mixes scales.
 *
 * Read-only: this service never writes.
 */

import type { Pool } from 'pg';
import { logger } from '../utils/logger';
import { classifyReason } from './activity-taxonomy';

/** wei → whole MORBIUS, as SQL. */
const TO_CHIPS = (col: string) => `FLOOR(COALESCE(${col},0) / 1000000000000000000)`;

export type DashWindow = '24h' | '7d' | '30d' | 'all';

const WINDOW_INTERVALS: Record<Exclude<DashWindow, 'all'>, string> = {
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
};

/** Whitelisted interval fragment — never interpolates user input directly. */
function intervalOf(win?: string): string | null {
  if (!win || win === 'all') return null;
  return WINDOW_INTERVALS[win as Exclude<DashWindow, 'all'>] ?? null;
}
function whereWindow(win: string | undefined, col = 'created_at'): string {
  const iv = intervalOf(win);
  return iv ? `${col} > NOW() - INTERVAL '${iv}'` : 'TRUE';
}

export interface Financials {
  window: DashWindow;
  /** Gameplay */
  wagered: string;
  won: string;
  ggr: string;            // wagered − won = house gross gaming revenue
  holdPct: number;        // ggr / wagered, %
  plays: number;
  activePlayers: number;
  newPlayers: number;
  /** Cash flow (on-chain) */
  depositsTotal: string;
  depositsCount: number;
  withdrawalsTotal: string;   // gross debited from players
  withdrawalsNet: string;     // actually sent to users
  withdrawalFees: string;
  withdrawalsCount: number;
  withdrawalsPending: number;
  netFlow: string;            // deposits − withdrawals(gross)
  /** Player-value-back cost centres */
  rakebackPaid: string;
  referralPaid: string;
  dropPrizesPaid: string;
  adminAdjustments: string;
  bonusCostTotal: string;
  /** Balance-sheet */
  playerLiability: string;    // every chip the house owes players right now
  netRevenue: string;         // ggr − bonusCostTotal
}

export interface PlayerRow {
  wallet: string;
  displayName: string | null;
  wagered: string;
  won: string;
  net: string;       // player net (positive = player up on the house)
  plays: number;
  balance: string;
  lastAt: string;
}

export interface DepositRow {
  wallet: string;
  displayName: string | null;
  amount: string;
  txHash: string;
  at: string;
}

export interface WithdrawalRow {
  wallet: string;
  displayName: string | null;
  amount: string;
  net: string;
  fee: string;
  status: string;
  txHash: string | null;
  at: string;
}

export interface BigWinRow {
  wallet: string;
  displayName: string | null;
  gameKey: string;
  gameLabel: string;
  wager: string;
  payout: string;
  net: string;
  multiplier: number | null;
  at: string;
}

export interface ReferrerRow {
  wallet: string;
  displayName: string | null;
  referees: number;
  earned: string;
  welcomePaid: string;
  lastBoundAt: string;
}

/** Who is playing right now — drives the dashboard's live badge. */
export interface LiveNowPlayer {
  wallet: string;
  displayName: string | null;
  gameKey: string;
  gameLabel: string;
  plays: number;
  wagered: string;
  lastAt: string;
}

export interface LiveNow {
  minutes: number;
  players: number;
  plays: number;
  wagered: string;
  lastPlayAt: string | null;
  active: LiveNowPlayer[];
}

export class AdminDashboardService {
  constructor(private pool: Pool) {}

  // ────────────────────────────────────────────────────────────────────
  // Financial summary
  // ────────────────────────────────────────────────────────────────────
  async getFinancials(win: DashWindow = '24h'): Promise<Financials> {
    const w = whereWindow(win);

    const ledgerQ = this.pool.query<{
      wagered: string; won: string; rakeback: string; referral: string;
      drop_prizes: string; admin_adj: string; plays: string; active_players: string;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN reason LIKE '%\\_bet'    THEN -delta ELSE 0 END),0)::text AS wagered,
         COALESCE(SUM(CASE WHEN reason LIKE '%\\_payout' THEN  delta ELSE 0 END),0)::text AS won,
         COALESCE(SUM(CASE WHEN reason = 'vip_rakeback'  THEN  delta ELSE 0 END),0)::text AS rakeback,
         COALESCE(SUM(CASE WHEN reason IN ('referral_reward','referral_welcome') THEN delta ELSE 0 END),0)::text AS referral,
         COALESCE(SUM(CASE WHEN reason = 'weekly_drop_prize' THEN delta ELSE 0 END),0)::text AS drop_prizes,
         COALESCE(SUM(CASE WHEN reason IN ('admin_credit','admin_debit') THEN delta ELSE 0 END),0)::text AS admin_adj,
         COUNT(*) FILTER (WHERE reason LIKE '%\\_bet')::text AS plays,
         COUNT(DISTINCT CASE WHEN reason LIKE '%\\_bet' THEN wallet_address END)::text AS active_players
       FROM poker_chip_ledger
       WHERE ${w}`,
    );

    const depositsQ = this.pool.query<{ total: string; n: string }>(
      `SELECT ${TO_CHIPS('SUM(amount)')}::text AS total, COUNT(*)::text AS n
       FROM player_deposits WHERE ${w}`,
    );

    const withdrawalsQ = this.pool.query<{
      total: string; net: string; fee: string; n: string; pending: string;
    }>(
      `SELECT ${TO_CHIPS(`SUM(CASE WHEN status = 'completed' THEN amount_wei END)`)}::text AS total,
              ${TO_CHIPS(`SUM(CASE WHEN status = 'completed' THEN net_to_user_wei END)`)}::text AS net,
              ${TO_CHIPS(`SUM(CASE WHEN status = 'completed' THEN fee_wei END)`)}::text AS fee,
              COUNT(*) FILTER (WHERE status = 'completed')::text AS n,
              COUNT(*) FILTER (WHERE status IN ('queued','broadcasting','pending_confirmation'))::text AS pending
       FROM hot_withdrawal_jobs WHERE ${w}`,
    );

    const newPlayersQ = this.pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM players WHERE ${w}`,
    );

    const liabilityQ = this.pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(balance),0)::text AS total FROM player_poker_chips`,
    );

    const [ledger, dep, wd, np, liab] = await Promise.all([
      ledgerQ, depositsQ, withdrawalsQ, newPlayersQ, liabilityQ,
    ]);

    const L = ledger.rows[0];
    const wagered = BigInt(L?.wagered ?? '0');
    const won = BigInt(L?.won ?? '0');
    const ggr = wagered - won;
    const rakeback = BigInt(L?.rakeback ?? '0');
    const referral = BigInt(L?.referral ?? '0');
    const dropPrizes = BigInt(L?.drop_prizes ?? '0');
    const adminAdj = BigInt(L?.admin_adj ?? '0');
    const bonusCost = rakeback + referral + dropPrizes + adminAdj;

    const depositsTotal = BigInt(dep.rows[0]?.total ?? '0');
    const wdTotal = BigInt(wd.rows[0]?.total ?? '0');

    return {
      window: win,
      wagered: wagered.toString(),
      won: won.toString(),
      ggr: ggr.toString(),
      holdPct: wagered > 0n ? Number((ggr * 10000n) / wagered) / 100 : 0,
      plays: Number(L?.plays ?? '0'),
      activePlayers: Number(L?.active_players ?? '0'),
      newPlayers: Number(np.rows[0]?.n ?? '0'),
      depositsTotal: depositsTotal.toString(),
      depositsCount: Number(dep.rows[0]?.n ?? '0'),
      withdrawalsTotal: wdTotal.toString(),
      withdrawalsNet: (wd.rows[0]?.net ?? '0').toString(),
      withdrawalFees: (wd.rows[0]?.fee ?? '0').toString(),
      withdrawalsCount: Number(wd.rows[0]?.n ?? '0'),
      withdrawalsPending: Number(wd.rows[0]?.pending ?? '0'),
      netFlow: (depositsTotal - wdTotal).toString(),
      rakebackPaid: rakeback.toString(),
      referralPaid: referral.toString(),
      dropPrizesPaid: dropPrizes.toString(),
      adminAdjustments: adminAdj.toString(),
      bonusCostTotal: bonusCost.toString(),
      playerLiability: (liab.rows[0]?.total ?? '0').toString(),
      netRevenue: (ggr - bonusCost).toString(),
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Players active in a window, ranked by how far up they are on the house
  // (the anti-cheat view: whoever is beating the book sits at the top).
  // ────────────────────────────────────────────────────────────────────
  async getPlayers(win: DashWindow = '24h', limit = 250): Promise<PlayerRow[]> {
    const lim = Math.max(1, Math.min(1000, Math.floor(limit) || 250));
    const { rows } = await this.pool.query<{
      wallet: string; display_name: string | null; wagered: string; won: string;
      plays: string; balance: string; last_at: string;
    }>(
      `WITH l AS (
         SELECT wallet_address AS wallet,
                COALESCE(SUM(CASE WHEN reason LIKE '%\\_bet'    THEN -delta ELSE 0 END),0) AS wagered,
                COALESCE(SUM(CASE WHEN reason LIKE '%\\_payout' THEN  delta ELSE 0 END),0) AS won,
                COUNT(*) FILTER (WHERE reason LIKE '%\\_bet') AS plays,
                MAX(created_at) AS last_at
         FROM poker_chip_ledger
         WHERE (reason LIKE '%\\_bet' OR reason LIKE '%\\_payout') AND ${whereWindow(win)}
         GROUP BY wallet_address
       )
       SELECT l.wallet, d.display_name,
              l.wagered::text, l.won::text, l.plays::text,
              COALESCE(c.balance,0)::text AS balance, l.last_at
       FROM l
       LEFT JOIN chat_display_names d ON LOWER(d.wallet_address) = LOWER(l.wallet)
       LEFT JOIN player_poker_chips  c ON LOWER(c.wallet_address) = LOWER(l.wallet)
       WHERE l.wagered > 0
       ORDER BY (l.won - l.wagered) DESC
       LIMIT $1`,
      [lim],
    );
    return rows.map((r) => {
      const wagered = BigInt(r.wagered || '0');
      const won = BigInt(r.won || '0');
      return {
        wallet: r.wallet,
        displayName: r.display_name,
        wagered: wagered.toString(),
        won: won.toString(),
        net: (won - wagered).toString(),
        plays: Number(r.plays || '0'),
        balance: r.balance ?? '0',
        lastAt: r.last_at,
      };
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Cash in / cash out
  // ────────────────────────────────────────────────────────────────────
  async getDeposits(win: DashWindow = '7d', limit = 500): Promise<DepositRow[]> {
    const lim = Math.max(1, Math.min(2000, Math.floor(limit) || 500));
    const { rows } = await this.pool.query<{
      wallet: string; display_name: string | null; amount: string; tx_hash: string; at: string;
    }>(
      `SELECT p.wallet_address AS wallet, d.display_name,
              ${TO_CHIPS('p.amount')}::text AS amount,
              p.tx_hash, p.created_at AS at
       FROM player_deposits p
       LEFT JOIN chat_display_names d ON LOWER(d.wallet_address) = LOWER(p.wallet_address)
       WHERE ${whereWindow(win, 'p.created_at')}
       ORDER BY p.created_at DESC
       LIMIT $1`,
      [lim],
    );
    return rows.map((r) => ({
      wallet: r.wallet,
      displayName: r.display_name,
      amount: r.amount ?? '0',
      txHash: r.tx_hash,
      at: r.at,
    }));
  }

  async getWithdrawals(win: DashWindow = '7d', limit = 500): Promise<WithdrawalRow[]> {
    const lim = Math.max(1, Math.min(2000, Math.floor(limit) || 500));
    const { rows } = await this.pool.query<{
      wallet: string; display_name: string | null; amount: string; net: string;
      fee: string; status: string; tx_hash: string | null; at: string;
    }>(
      `SELECT j.wallet_address AS wallet, d.display_name,
              ${TO_CHIPS('j.amount_wei')}::text AS amount,
              ${TO_CHIPS('j.net_to_user_wei')}::text AS net,
              ${TO_CHIPS('j.fee_wei')}::text AS fee,
              j.status, j.tx_hash, j.created_at AS at
       FROM hot_withdrawal_jobs j
       LEFT JOIN chat_display_names d ON LOWER(d.wallet_address) = LOWER(j.wallet_address)
       WHERE ${whereWindow(win, 'j.created_at')}
       ORDER BY j.created_at DESC
       LIMIT $1`,
      [lim],
    );
    return rows.map((r) => ({
      wallet: r.wallet,
      displayName: r.display_name,
      amount: r.amount ?? '0',
      net: r.net ?? '0',
      fee: r.fee ?? '0',
      status: r.status,
      txHash: r.tx_hash,
      at: r.at,
    }));
  }

  // ────────────────────────────────────────────────────────────────────
  // Big wins — every single play paying out at or above the threshold.
  // ────────────────────────────────────────────────────────────────────
  async getBigWins(
    win: DashWindow = '7d',
    minPayout = 100000n,
    limit = 200,
  ): Promise<BigWinRow[]> {
    const lim = Math.max(1, Math.min(1000, Math.floor(limit) || 200));
    const { rows } = await this.pool.query<{
      wallet: string; display_name: string | null; wager: string; payout: string;
      bet_reason: string | null; at: string;
    }>(
      `WITH g AS (
         SELECT ref_type, ref_id, wallet_address AS wallet,
                COALESCE(SUM(CASE WHEN reason LIKE '%\\_bet'    THEN -delta ELSE 0 END),0) AS wager,
                COALESCE(SUM(CASE WHEN reason LIKE '%\\_payout' THEN  delta ELSE 0 END),0) AS payout,
                MAX(created_at) AS at,
                MAX(CASE WHEN reason LIKE '%\\_bet' THEN reason END) AS bet_reason
         FROM poker_chip_ledger
         WHERE (reason LIKE '%\\_bet' OR reason LIKE '%\\_payout')
           AND ref_id IS NOT NULL AND ${whereWindow(win)}
         GROUP BY ref_type, ref_id, wallet_address
         HAVING COALESCE(SUM(CASE WHEN reason LIKE '%\\_payout' THEN delta ELSE 0 END),0) >= $1::NUMERIC
       )
       SELECT g.wallet, d.display_name, g.wager::text, g.payout::text, g.bet_reason, g.at
       FROM g
       LEFT JOIN chat_display_names d ON LOWER(d.wallet_address) = LOWER(g.wallet)
       ORDER BY g.payout DESC
       LIMIT $2`,
      [minPayout.toString(), lim],
    );
    return rows.map((r) => {
      const wager = BigInt(r.wager || '0');
      const payout = BigInt(r.payout || '0');
      const cls = classifyReason(r.bet_reason ?? '');
      return {
        wallet: r.wallet,
        displayName: r.display_name,
        gameKey: cls.gameKey,
        gameLabel: cls.gameLabel,
        wager: wager.toString(),
        payout: payout.toString(),
        net: (payout - wager).toString(),
        multiplier: wager > 0n ? Number((payout * 100n) / wager) / 100 : null,
        at: r.at,
      };
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Referrals — who is earning, and what it costs
  // ────────────────────────────────────────────────────────────────────
  async getReferrers(limit = 200): Promise<{ referrers: ReferrerRow[]; totals: {
    referrers: number; referees: number; earned: string; welcomePaid: string;
  } }> {
    const lim = Math.max(1, Math.min(1000, Math.floor(limit) || 200));
    const listQ = this.pool.query<{
      wallet: string; display_name: string | null; referees: string;
      earned: string; welcome_paid: string; last_bound: string;
    }>(
      `SELECT r.referrer_address AS wallet, d.display_name,
              COUNT(*)::text AS referees,
              COALESCE(SUM(r.total_reward_chips),0)::text  AS earned,
              COALESCE(SUM(r.welcome_bonus_chips),0)::text AS welcome_paid,
              MAX(r.bound_at) AS last_bound
       FROM referrals r
       LEFT JOIN chat_display_names d ON LOWER(d.wallet_address) = LOWER(r.referrer_address)
       GROUP BY r.referrer_address, d.display_name
       ORDER BY COALESCE(SUM(r.total_reward_chips),0) DESC, COUNT(*) DESC
       LIMIT $1`,
      [lim],
    );
    const totalsQ = this.pool.query<{
      referrers: string; referees: string; earned: string; welcome_paid: string;
    }>(
      `SELECT COUNT(DISTINCT referrer_address)::text AS referrers,
              COUNT(*)::text AS referees,
              COALESCE(SUM(total_reward_chips),0)::text  AS earned,
              COALESCE(SUM(welcome_bonus_chips),0)::text AS welcome_paid
       FROM referrals`,
    );
    const [list, totals] = await Promise.all([listQ, totalsQ]);
    return {
      referrers: list.rows.map((r) => ({
        wallet: r.wallet,
        displayName: r.display_name,
        referees: Number(r.referees || '0'),
        earned: r.earned ?? '0',
        welcomePaid: r.welcome_paid ?? '0',
        lastBoundAt: r.last_bound,
      })),
      totals: {
        referrers: Number(totals.rows[0]?.referrers ?? '0'),
        referees: Number(totals.rows[0]?.referees ?? '0'),
        earned: totals.rows[0]?.earned ?? '0',
        welcomePaid: totals.rows[0]?.welcome_paid ?? '0',
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Daily history — one row per day for trend charts
  // ────────────────────────────────────────────────────────────────────
  async getDailyHistory(days = 30): Promise<Array<{
    day: string; wagered: string; won: string; ggr: string; plays: number; players: number;
  }>> {
    const d = Math.max(1, Math.min(365, Math.floor(days) || 30));
    const { rows } = await this.pool.query<{
      day: string; wagered: string; won: string; plays: string; players: string;
    }>(
      `SELECT DATE_TRUNC('day', created_at)::date::text AS day,
              COALESCE(SUM(CASE WHEN reason LIKE '%\\_bet'    THEN -delta ELSE 0 END),0)::text AS wagered,
              COALESCE(SUM(CASE WHEN reason LIKE '%\\_payout' THEN  delta ELSE 0 END),0)::text AS won,
              COUNT(*) FILTER (WHERE reason LIKE '%\\_bet')::text AS plays,
              COUNT(DISTINCT CASE WHEN reason LIKE '%\\_bet' THEN wallet_address END)::text AS players
       FROM poker_chip_ledger
       WHERE (reason LIKE '%\\_bet' OR reason LIKE '%\\_payout')
         AND created_at > NOW() - ($1::int * INTERVAL '1 day')
       GROUP BY 1
       ORDER BY 1 DESC`,
      [d],
    );
    return rows.map((r) => {
      const wagered = BigInt(r.wagered || '0');
      const won = BigInt(r.won || '0');
      return {
        day: r.day,
        wagered: wagered.toString(),
        won: won.toString(),
        ggr: (wagered - won).toString(),
        plays: Number(r.plays || '0'),
        players: Number(r.players || '0'),
      };
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Live now — is anyone actually playing this minute?
  // ────────────────────────────────────────────────────────────────────

  /**
   * Betting activity in the last `minutes`, plus who is behind it. Polled far
   * more often than the rest of the dashboard, so it is deliberately two small
   * indexed reads over a narrow time slice.
   */
  async getLiveNow(minutes = 5): Promise<LiveNow> {
    const m = Math.max(1, Math.min(180, Math.floor(minutes) || 5));

    const totalsQ = this.pool.query<{
      players: string; plays: string; wagered: string; last_at: string | null;
    }>(
      `SELECT COUNT(DISTINCT wallet_address)::text AS players,
              COUNT(*)::text AS plays,
              COALESCE(SUM(-delta),0)::text AS wagered,
              MAX(created_at) AS last_at
       FROM poker_chip_ledger
       WHERE reason LIKE '%\\_bet'
         AND created_at > NOW() - ($1::int * INTERVAL '1 minute')`,
      [m],
    );

    const activeQ = this.pool.query<{
      wallet: string; display_name: string | null; plays: string;
      wagered: string; last_at: string; bet_reason: string | null;
    }>(
      `WITH a AS (
         SELECT wallet_address AS wallet,
                COUNT(*) AS plays,
                COALESCE(SUM(-delta),0) AS wagered,
                MAX(created_at) AS last_at,
                (ARRAY_AGG(reason ORDER BY created_at DESC))[1] AS bet_reason
         FROM poker_chip_ledger
         WHERE reason LIKE '%\\_bet'
           AND created_at > NOW() - ($1::int * INTERVAL '1 minute')
         GROUP BY wallet_address
       )
       SELECT a.wallet, d.display_name, a.plays::text, a.wagered::text,
              a.last_at, a.bet_reason
       FROM a
       LEFT JOIN chat_display_names d ON LOWER(d.wallet_address) = LOWER(a.wallet)
       ORDER BY a.last_at DESC
       LIMIT 12`,
      [m],
    );

    const [totals, active] = await Promise.all([totalsQ, activeQ]);
    const T = totals.rows[0];

    return {
      minutes: m,
      players: Number(T?.players ?? '0'),
      plays: Number(T?.plays ?? '0'),
      wagered: (T?.wagered ?? '0').toString(),
      lastPlayAt: T?.last_at ?? null,
      active: active.rows.map((r) => {
        const cls = classifyReason(r.bet_reason ?? '');
        return {
          wallet: r.wallet,
          displayName: r.display_name,
          gameKey: cls.gameKey,
          gameLabel: cls.gameLabel,
          plays: Number(r.plays || '0'),
          wagered: (r.wagered ?? '0').toString(),
          lastAt: r.last_at,
        };
      }),
    };
  }

  /** Everything the dashboard needs in one round trip. */
  async getOverview(win: DashWindow, bigWinMin: bigint) {
    const [financials, players, deposits, withdrawals, bigWins, referrals, history] =
      await Promise.all([
        this.getFinancials(win),
        this.getPlayers(win, 250),
        this.getDeposits(win === 'all' ? 'all' : win, 500),
        this.getWithdrawals(win === 'all' ? 'all' : win, 500),
        this.getBigWins(win, bigWinMin, 200),
        this.getReferrers(200),
        this.getDailyHistory(30),
      ]);
    return { financials, players, deposits, withdrawals, bigWins, referrals, history };
  }
}
