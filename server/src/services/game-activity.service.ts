/**
 * GameActivityService — powers the public "Game Activity" page.
 *
 * Two reads:
 *   getGameSummaries() → every game with all-time totals (wagered, won, plays).
 *   getGamePlays(key)  → the most recent N plays for one game.
 *
 * Every covered game settles through the unified poker_chip_ledger (one *_bet
 * row + one *_payout row per round); we group those by (ref_type, ref_id,
 * wallet) to get one play. (Lottery, Wheel and Poker are intentionally excluded
 * — the first two are retired and Poker is PvP, which doesn't fit a single
 * wager→payout per play.)
 *
 * All amounts are whole MORBIUS (1 chip = 1 MORBIUS) returned as decimal strings.
 */

import type { Pool } from 'pg';
import { logger } from '../utils/logger';
import { classifyReason, reasonsForGame } from './activity-taxonomy';

/** gameKeys from the taxonomy that are not shown on the activity page. */
const NON_GAME_KEYS = new Set([
  'exchange', 'fees', 'rewards', 'system', 'other',
  'poker', 'poker_tournament', // PvP — excluded
  'lottery', // retired
]);

export type PlayResult = 'win' | 'loss' | 'push';

export interface GameSummary {
  key: string;
  label: string;
  wagered: string;
  won: string;
  plays: number;
  players: number;
}

export interface GameSummariesResult {
  games: GameSummary[];
  totalPlayers: number;
}

export interface GamePlay {
  wallet: string;
  displayName: string | null;
  wager: string;
  payout: string;
  net: string;
  result: PlayResult;
  at: string;
}

/** A play in the cross-game feed — carries which game it belongs to. */
export interface RecentPlay extends GamePlay {
  gameKey: string;
  gameLabel: string;
}

/** Windows the dashboard can slice by. `undefined`/`all` = no time filter. */
export type StatsWindow = '24h' | '7d' | '30d' | 'all';
const WINDOW_INTERVALS: Record<Exclude<StatsWindow, 'all'>, string> = {
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
};

/** Safe `AND created_at > NOW() - INTERVAL '…'` fragment (interval is whitelisted). */
function windowClause(win?: string): string {
  const iv = win && win !== 'all' ? WINDOW_INTERVALS[win as Exclude<StatsWindow, 'all'>] : undefined;
  return iv ? `AND created_at > NOW() - INTERVAL '${iv}'` : '';
}

function resultOf(wager: bigint, payout: bigint): PlayResult {
  const net = payout - wager;
  return net > 0n ? 'win' : net < 0n ? 'loss' : 'push';
}

export class GameActivityService {
  constructor(private pool: Pool) {}

  // ──────────────────────────────────────────────────────────────────
  // Summaries — all-time totals per game
  // ──────────────────────────────────────────────────────────────────

  async getGameSummaries(win?: StatsWindow): Promise<GameSummariesResult> {
    const wc = windowClause(win);
    const byKey = new Map<
      string,
      { key: string; label: string; w: bigint; won: bigint; plays: number; players: number }
    >();
    const bump = (key: string, label: string) => {
      let g = byKey.get(key);
      if (!g) {
        g = { key, label, w: 0n, won: 0n, plays: 0, players: 0 };
        byKey.set(key, g);
      }
      return g;
    };

    // One grouped query over the ledger, folded into games by taxonomy.
    // Each game has exactly one *_bet reason, so its bet-row distinct wallet
    // count is its unique-player count.
    try {
      const { rows } = await this.pool.query<{
        reason: string; sum_delta: string; n: string; players: string;
      }>(
        `SELECT reason,
                COALESCE(SUM(delta),0)::text AS sum_delta,
                COUNT(*)::text AS n,
                COUNT(DISTINCT wallet_address)::text AS players
         FROM poker_chip_ledger
         WHERE (reason LIKE '%\\_bet' OR reason LIKE '%\\_payout') ${wc}
         GROUP BY reason`,
      );
      for (const r of rows) {
        const cls = classifyReason(r.reason);
        if (NON_GAME_KEYS.has(cls.gameKey)) continue;
        const g = bump(cls.gameKey, cls.gameLabel);
        const sum = BigInt(r.sum_delta);
        if (cls.kind === 'bet') {
          g.w += -sum; // bets are negative deltas
          g.plays += Number(r.n);
          g.players += Number(r.players);
        } else if (cls.kind === 'payout') {
          g.won += sum;
        }
      }
    } catch (err) {
      logger.error('[activity] ledger summary failed', err);
    }

    // Platform-wide unique players (distinct across all games, not a sum).
    let totalPlayers = 0;
    try {
      const { rows } = await this.pool.query<{ players: string }>(
        `SELECT COUNT(DISTINCT wallet_address)::text AS players
         FROM poker_chip_ledger WHERE reason LIKE '%\\_bet' ${wc}`,
      );
      totalPlayers = Number(rows[0]?.players ?? '0');
    } catch (err) {
      logger.warn('[activity] total players query failed', (err as Error).message);
    }

    const games = [...byKey.values()]
      .map((g) => ({
        key: g.key,
        label: g.label,
        wagered: g.w.toString(),
        won: g.won.toString(),
        plays: g.plays,
        players: g.players,
      }))
      .filter((g) => g.plays > 0)
      .sort((a, b) => (BigInt(b.wagered) > BigInt(a.wagered) ? 1 : -1));

    return { games, totalPlayers };
  }

  // ──────────────────────────────────────────────────────────────────
  // Recent plays for one game
  // ──────────────────────────────────────────────────────────────────

  async getGamePlays(gameKey: string, limit: number): Promise<GamePlay[]> {
    const lim = Math.max(1, Math.min(500, Math.floor(limit) || 500));
    if (NON_GAME_KEYS.has(gameKey)) return [];
    return this.ledgerPlays(gameKey, lim);
  }

  private async ledgerPlays(gameKey: string, lim: number): Promise<GamePlay[]> {
    const reasons = reasonsForGame(gameKey);
    if (reasons.length === 0) return [];
    const bet = reasons.filter((r) => classifyReason(r).kind === 'bet');
    const payout = reasons.filter((r) => classifyReason(r).kind === 'payout');

    const { rows } = await this.pool.query<{
      wallet: string; wager: string; payout: string; at: string; display_name: string | null;
    }>(
      `WITH g AS (
         SELECT wallet_address AS wallet,
                COALESCE(SUM(CASE WHEN reason = ANY($2) THEN -delta ELSE 0 END),0)::text AS wager,
                COALESCE(SUM(CASE WHEN reason = ANY($3) THEN delta ELSE 0 END),0)::text AS payout,
                MAX(created_at) AS at
         FROM poker_chip_ledger
         WHERE reason = ANY($1) AND ref_id IS NOT NULL
         GROUP BY ref_type, ref_id, wallet_address
         ORDER BY MAX(created_at) DESC
         LIMIT $4
       )
       SELECT g.wallet, g.wager, g.payout, g.at, d.display_name
       FROM g LEFT JOIN chat_display_names d ON LOWER(d.wallet_address) = LOWER(g.wallet)
       ORDER BY g.at DESC`,
      [reasons, bet, payout, lim],
    );
    return rows.map((r) => this.toPlay(r));
  }

  // ──────────────────────────────────────────────────────────────────
  // Cross-game feed — the most recent plays across every game (for the
  // dashboard "latest plays" column). Each play carries its game so the UI
  // can label it and link the player through to their per-player dashboard.
  // ──────────────────────────────────────────────────────────────────

  async getRecentPlays(limit: number): Promise<RecentPlay[]> {
    const lim = Math.max(1, Math.min(200, Math.floor(limit) || 40));
    // Over-fetch so filtering out non-game plays (poker/lottery) still leaves
    // a full page; the excess is sliced off after classification.
    const over = Math.min(400, lim + 60);
    const { rows } = await this.pool.query<{
      wallet: string; wager: string; payout: string; at: string;
      bet_reason: string | null; display_name: string | null;
    }>(
      `WITH g AS (
         SELECT ref_type, ref_id, wallet_address AS wallet,
                COALESCE(SUM(CASE WHEN reason LIKE '%\\_bet' THEN -delta ELSE 0 END),0)::text AS wager,
                COALESCE(SUM(CASE WHEN reason LIKE '%\\_payout' THEN delta ELSE 0 END),0)::text AS payout,
                MAX(created_at) AS at,
                MAX(CASE WHEN reason LIKE '%\\_bet' THEN reason END) AS bet_reason
         FROM poker_chip_ledger
         WHERE (reason LIKE '%\\_bet' OR reason LIKE '%\\_payout') AND ref_id IS NOT NULL
         GROUP BY ref_type, ref_id, wallet_address
         ORDER BY MAX(created_at) DESC
         LIMIT $1
       )
       SELECT g.wallet, g.wager, g.payout, g.at, g.bet_reason, d.display_name
       FROM g LEFT JOIN chat_display_names d ON LOWER(d.wallet_address) = LOWER(g.wallet)
       ORDER BY g.at DESC`,
      [over],
    );

    const out: RecentPlay[] = [];
    for (const r of rows) {
      if (!r.bet_reason) continue;
      const cls = classifyReason(r.bet_reason);
      if (NON_GAME_KEYS.has(cls.gameKey)) continue;
      out.push({ ...this.toPlay(r), gameKey: cls.gameKey, gameLabel: cls.gameLabel });
      if (out.length >= lim) break;
    }
    return out;
  }

  private toPlay(r: {
    wallet: string; wager: string; payout: string; at: string; display_name: string | null;
  }): GamePlay {
    const wager = BigInt(r.wager || '0');
    const payout = BigInt(r.payout || '0');
    return {
      wallet: r.wallet,
      displayName: r.display_name,
      wager: wager.toString(),
      payout: payout.toString(),
      net: (payout - wager).toString(),
      result: resultOf(wager, payout),
      at: r.at,
    };
  }
}
