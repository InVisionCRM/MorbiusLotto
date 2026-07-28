/**
 * GameLimitsService — loads admin bet-limit overrides into the in-memory
 * registry and persists changes.
 *
 * The registry (lib/game-limits.ts) is what routes and game math actually read,
 * synchronously. This service is the only thing that touches the database: it
 * hydrates the registry at boot, and re-hydrates after every save so a change
 * takes effect immediately on this process.
 *
 * NOTE ON MULTI-INSTANCE: overrides are cached per process. With more than one
 * server instance, a save only takes effect immediately on the instance that
 * handled it; others pick it up on the refresh interval (default 60s). That is
 * deliberate — reading the table on every bet would put a query in the hot path
 * of every game round.
 */

import type { Pool } from 'pg';
import { logger } from '../utils/logger';
import {
  applyLimitOverrides,
  betLimits,
  DEFAULT_BET_LIMITS,
  isGameLimitKey,
  LIMIT_CEILING,
  LIMIT_FLOOR,
  limitsSnapshot,
  type GameLimitKey,
} from '../lib/game-limits';

export interface LimitChange {
  gameKey: string;
  min: number;
  max: number;
}

export class GameLimitsService {
  private timer: NodeJS.Timeout | null = null;

  constructor(private pool: Pool) {}

  /** Hydrate the registry and start periodic refresh. Safe to call once at boot. */
  async start(refreshMs = 60_000): Promise<void> {
    await this.reload();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.reload().catch((e) =>
        logger.warn('[game-limits] refresh failed', { error: (e as Error).message }),
      );
    }, refreshMs);
    // Don't hold the process open just for the refresh timer.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Read overrides into the registry. A failure here is non-fatal on purpose:
   * the registry keeps whatever it had (at worst the built-in defaults), so a
   * database blip can never take every game offline.
   */
  async reload(): Promise<void> {
    try {
      const { rows } = await this.pool.query<{ game_key: string; min_bet: string; max_bet: string }>(
        `SELECT game_key, min_bet::text, max_bet::text FROM game_bet_limits`,
      );
      applyLimitOverrides(
        rows.map((r) => ({ gameKey: r.game_key, min: Number(r.min_bet), max: Number(r.max_bet) })),
      );
    } catch (e) {
      const msg = (e as Error).message ?? '';
      // Migration 177 not applied yet — run on built-in defaults, don't shout.
      if (/relation .*game_bet_limits.* does not exist/i.test(msg)) {
        logger.info('[game-limits] game_bet_limits table absent — using built-in defaults');
        return;
      }
      throw e;
    }
  }

  /** Effective limits + defaults for every game, for the admin UI. */
  list() {
    return limitsSnapshot();
  }

  /**
   * Apply admin limit changes. Validates each, writes the override, records an
   * audit row with the previous values, then re-hydrates the registry.
   * Returns the games actually changed.
   */
  async save(adminAddress: string, changes: LimitChange[]): Promise<{ updated: string[] }> {
    const admin = adminAddress.toLowerCase();
    const valid: Array<{ key: GameLimitKey; min: number; max: number }> = [];

    for (const c of changes) {
      if (!isGameLimitKey(c.gameKey)) throw new Error(`Unknown game '${c.gameKey}'`);
      const min = Math.floor(Number(c.min));
      const max = Math.floor(Number(c.max));
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new Error(`${c.gameKey}: limits must be numbers`);
      }
      if (min < LIMIT_FLOOR || max < LIMIT_FLOOR) {
        throw new Error(`${c.gameKey}: limits must be at least ${LIMIT_FLOOR}`);
      }
      if (max > LIMIT_CEILING) {
        throw new Error(`${c.gameKey}: max exceeds the ${LIMIT_CEILING.toLocaleString()} ceiling`);
      }
      if (max < min) throw new Error(`${c.gameKey}: max must be greater than or equal to min`);
      valid.push({ key: c.gameKey, min, max });
    }

    const updated: string[] = [];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const v of valid) {
        // Previous effective values, for the audit trail. NULL old_* means the
        // game was running on the code default rather than an override.
        const prev = await client.query<{ min_bet: string; max_bet: string }>(
          `SELECT min_bet::text, max_bet::text FROM game_bet_limits WHERE game_key = $1`,
          [v.key],
        );
        const oldMin = prev.rows[0] ? Number(prev.rows[0].min_bet) : null;
        const oldMax = prev.rows[0] ? Number(prev.rows[0].max_bet) : null;

        // Skip no-op saves so the audit log stays meaningful.
        const effective = betLimits(v.key);
        if (effective.min === v.min && effective.max === v.max) continue;

        await client.query(
          `INSERT INTO game_bet_limits (game_key, min_bet, max_bet, updated_by, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (game_key) DO UPDATE
             SET min_bet = EXCLUDED.min_bet, max_bet = EXCLUDED.max_bet,
                 updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
          [v.key, v.min, v.max, admin],
        );
        await client.query(
          `INSERT INTO game_bet_limit_log (game_key, admin_address, old_min, old_max, new_min, new_max)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [v.key, admin, oldMin, oldMax, v.min, v.max],
        );
        updated.push(v.key);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      // Say WHICH migration is missing — "save failed" sends people hunting.
      if (/relation .*game_bet_limit.* does not exist/i.test((e as Error).message ?? '')) {
        throw new Error(
          'Bet-limit tables are missing — run migration 177_game_bet_limits.sql, then try again.',
        );
      }
      throw e;
    } finally {
      client.release();
    }

    if (updated.length > 0) {
      await this.reload();
      logger.info('[game-limits] limits updated', { admin, games: updated });
    }
    return { updated };
  }

  /** Drop an override so the game falls back to its built-in default. */
  async reset(adminAddress: string, gameKey: string): Promise<void> {
    if (!isGameLimitKey(gameKey)) throw new Error(`Unknown game '${gameKey}'`);
    const admin = adminAddress.toLowerCase();
    const def = DEFAULT_BET_LIMITS[gameKey];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const prev = await client.query<{ min_bet: string; max_bet: string }>(
        `DELETE FROM game_bet_limits WHERE game_key = $1 RETURNING min_bet::text, max_bet::text`,
        [gameKey],
      );
      if (prev.rows[0]) {
        await client.query(
          `INSERT INTO game_bet_limit_log (game_key, admin_address, old_min, old_max, new_min, new_max)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [gameKey, admin, Number(prev.rows[0].min_bet), Number(prev.rows[0].max_bet), def.min, def.max],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    await this.reload();
  }

  /**
   * Recent limit changes across all games, for the admin audit view.
   *
   * Returns [] rather than throwing when migration 177 has not been applied —
   * the page is perfectly usable on built-in defaults without a history table,
   * and letting this throw took the whole game-limits endpoint down with a 500.
   */
  async history(limit = 50) {
    const lim = Math.max(1, Math.min(500, Math.floor(limit) || 50));
    let rows: Array<{
      game_key: string; admin_address: string; old_min: string | null; old_max: string | null;
      new_min: string; new_max: string; created_at: string;
    }> = [];
    try {
      const r = await this.pool.query<{
        game_key: string; admin_address: string; old_min: string | null; old_max: string | null;
        new_min: string; new_max: string; created_at: string;
      }>(
        `SELECT game_key, admin_address, old_min::text, old_max::text,
                new_min::text, new_max::text, created_at
         FROM game_bet_limit_log ORDER BY created_at DESC LIMIT $1`,
        [lim],
      );
      rows = r.rows;
    } catch (e) {
      const msg = (e as Error).message ?? '';
      if (/relation .*game_bet_limit_log.* does not exist/i.test(msg)) {
        logger.info('[game-limits] game_bet_limit_log absent — no change history yet');
        return [];
      }
      throw e;
    }
    return rows.map((r) => ({
      gameKey: r.game_key,
      admin: r.admin_address,
      oldMin: r.old_min == null ? null : Number(r.old_min),
      oldMax: r.old_max == null ? null : Number(r.old_max),
      newMin: Number(r.new_min),
      newMax: Number(r.new_max),
      at: r.created_at,
    }));
  }
}
