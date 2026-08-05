/**
 * game-limits.ts — the single source of truth for per-game bet limits.
 *
 * Both the HTTP routes and the pure game-math services validate bets, so a
 * limit has to be readable from both without either doing I/O. This module is
 * therefore SYNCHRONOUS and in-memory:
 *
 *   DEFAULT_BET_LIMITS  the values that used to live as *_MIN_BET / *_MAX_BET
 *                       constants in each service. Still the fallback, so the
 *                       app behaves identically with an empty database.
 *   overrides           admin-configured values, loaded from game_bet_limits at
 *                       boot and refreshed whenever an admin saves.
 *
 * `betLimits(key)` returns the effective pair. Nothing here touches the DB —
 * GameLimitsService owns loading and calls applyLimitOverrides().
 *
 * Units: whole MORBIUS (chips), matching how every game already validates.
 */

export interface BetLimits {
  min: number;
  max: number;
}

/**
 * Built-in defaults — these are the exact values the games shipped with.
 * Changing one here changes the fallback for any game with no override row.
 */
export const DEFAULT_BET_LIMITS = {
  dice: { min: 10, max: 2000 },
  dicex2: { min: 10, max: 2000 },
  limbo: { min: 10, max: 2000 },
  mines: { min: 10, max: 2000 },
  crash: { min: 10, max: 2000 },
  towers: { min: 10, max: 2000 },
  chicken: { min: 10, max: 2000 },
  hilo: { min: 10, max: 2000 },
  firewalk: { min: 10, max: 2000 },
  heist: { min: 10, max: 2000 },
  baccarat: { min: 10, max: 2000 },
  keno: { min: 1, max: 1000 },
  plinko: { min: 1, max: 1000 },
  /** Roulette's max is PER BETTING ZONE, not per spin — label it that way in UI. */
  roulette: { min: 5, max: 1000 },
  pachinko: { min: 10, max: 100_000 },
  cascade: { min: 100, max: 100_000 },
  cipher: { min: 100, max: 100_000 },
  greed_dice: { min: 100, max: 100_000 },
  andar_bahar: { min: 100, max: 50_000 },
  dragon_tiger: { min: 100, max: 50_000 },
  three_card_poker: { min: 100, max: 50_000 },
  pai_gow_poker: { min: 100, max: 10_000 },
  /**
   * Craps' max is PER BETTING ZONE and applies to the TOTAL resting on that
   * zone, not to a single chip — otherwise repeated small bets would walk
   * straight past the cap. Craps shipped with no limit at all; these are the
   * first ones it has ever had, sized to the chip ladder (top chip 1,000).
   */
  craps: { min: 5, max: 10_000 },
  video_poker: { min: 10, max: 2000 },
  ultimate_holdem: { min: 100, max: 10_000 },
  caribbean_stud: { min: 100, max: 10_000 },
} as const satisfies Record<string, BetLimits>;

export type GameLimitKey = keyof typeof DEFAULT_BET_LIMITS;

export const GAME_LIMIT_KEYS = Object.keys(DEFAULT_BET_LIMITS) as GameLimitKey[];

/** Human labels for the admin UI (taxonomy labels don't cover every key). */
export const GAME_LIMIT_LABELS: Record<GameLimitKey, string> = {
  dice: 'Dice',
  dicex2: 'Dice x2',
  limbo: 'Limbo',
  mines: 'Mines',
  crash: 'Crash',
  towers: 'Towers',
  chicken: 'Chicken',
  hilo: 'Hi-Lo',
  firewalk: 'Firewalk',
  heist: 'Heist',
  baccarat: 'Baccarat',
  keno: 'Keno',
  plinko: 'Plinko',
  roulette: 'Roulette',
  pachinko: 'Pachinko',
  cascade: 'Cascade',
  cipher: 'Cipher',
  greed_dice: 'Greed Dice',
  andar_bahar: 'Andar Bahar',
  dragon_tiger: 'Dragon Tiger',
  three_card_poker: 'Three Card Poker',
  pai_gow_poker: 'Pai Gow Poker',
  craps: 'Craps (per zone)',
  video_poker: 'Video Poker',
  ultimate_holdem: "Ultimate Texas Hold'em",
  caribbean_stud: 'Caribbean Stud',
};

/** Absolute sanity bounds an admin-set limit can never escape. */
export const LIMIT_FLOOR = 1;
export const LIMIT_CEILING = 100_000_000;

const overrides = new Map<string, BetLimits>();

/** Replace the override set (called by GameLimitsService after a DB read). */
export function applyLimitOverrides(rows: Array<{ gameKey: string; min: number; max: number }>): void {
  overrides.clear();
  for (const r of rows) {
    if (!isGameLimitKey(r.gameKey)) continue;
    if (!Number.isFinite(r.min) || !Number.isFinite(r.max) || r.min < 1 || r.max < r.min) continue;
    overrides.set(r.gameKey, { min: Math.floor(r.min), max: Math.floor(r.max) });
  }
}

export function isGameLimitKey(k: string): k is GameLimitKey {
  return Object.prototype.hasOwnProperty.call(DEFAULT_BET_LIMITS, k);
}

/**
 * Effective limits for a game: the admin override if one is set, otherwise the
 * built-in default. Never throws — an unknown key falls back to the widest
 * sane bounds so a new game can't be accidentally locked out before it is
 * registered here.
 */
export function betLimits(key: string): BetLimits {
  const o = overrides.get(key);
  if (o) return o;
  const d = (DEFAULT_BET_LIMITS as Record<string, BetLimits>)[key];
  return d ?? { min: LIMIT_FLOOR, max: LIMIT_CEILING };
}

/** True when the game is currently running on an admin override, not the default. */
export function hasOverride(key: string): boolean {
  return overrides.has(key);
}

/** Snapshot for the admin UI: default vs effective, per game. */
export function limitsSnapshot(): Array<{
  gameKey: GameLimitKey;
  label: string;
  min: number;
  max: number;
  defaultMin: number;
  defaultMax: number;
  overridden: boolean;
}> {
  return GAME_LIMIT_KEYS.map((k) => {
    const eff = betLimits(k);
    const def = DEFAULT_BET_LIMITS[k];
    return {
      gameKey: k,
      label: GAME_LIMIT_LABELS[k],
      min: eff.min,
      max: eff.max,
      defaultMin: def.min,
      defaultMax: def.max,
      overridden: overrides.has(k),
    };
  });
}
