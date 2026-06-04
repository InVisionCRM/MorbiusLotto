import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { toBigIntSafe } from '../utils/safe-bigint';
import { isAdminWallet } from '../lib/cosmetics-catalog';
import { TournamentService } from './tournament.service';
import { PokerGameService } from './poker-game.service';
import { applyPokerChipDelta } from './poker-chip-wallet';
import { getServerPokerBotAddressSet } from '../lib/poker-server-bot-addresses';
import { getEscrowPoolStatus } from '../utils/escrow-status';
import { tournamentIdToBytes32 } from '../utils/tournament-id-bytes32';
import {
  cancelTournamentInEscrow,
  sendEscrowPayout,
  sendEscrowPayoutMultiple,
} from '../utils/escrow-payout';
import { verifyEscrowAddToPrizePoolJoinTx } from '../utils/escrow-join-verify';
import {
  railTournamentCreated,
  railPlayerJoined,
  railPlayerLeft,
  railTournamentFilled,
  railTournamentStarted,
  railTournamentCompleted,
  railTournamentCancelled,
  dmPlayersBusted,
} from './telegram-rail.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  handsPerLevel: number;
}

/** How posted blinds go up during the event (stored in `poker_config`). */
export type PokerBlindIncreaseMode = 'knockout' | 'by_hand' | 'by_time';

/**
 * How a poker tournament decides when to start (stored in `poker_config`):
 *  - `time` (default): starts at a fixed `scheduled_start_at` (classic scheduled tournament).
 *  - `fill`: a Sit & Go — no clock; starts when every seat is taken. On a full
 *    table the server sets a 60s countdown, then deals.
 */
export type PokerStartMode = 'time' | 'fill';

/** Allowed wall-clock interval (minutes) for `by_time` mode — integers 1–60 inclusive. */
export const BLIND_INTERVAL_MINUTES_MIN = 1;
export const BLIND_INTERVAL_MINUTES_MAX = 60;
export type BlindIntervalMinutes = number;

/** Inclusive cap on tournament seats per physical table. */
export const POKER_MTT_SEATS_PER_TABLE_MIN = 4;
export const POKER_MTT_SEATS_PER_TABLE_MAX = 10;
/** Number of players who reach the final table; below this we collapse remaining tables into one. */
export const POKER_MTT_FINAL_TABLE_SIZE_DEFAULT = 9;

export interface PokerTournamentConfig {
  startingStack: number;
  minPlayers: number;
  maxPlayers: number;
  blindSchedule: BlindLevel[];
  /**
   * `knockout` (default): blinds multiply when someone busts (legacy SNG behavior).
   * `by_hand`: blinds follow `blindSchedule` / `handsPerLevel` after each completed hand.
   * `by_time`: blinds advance one level every `blindIntervalMinutes` of wall-clock time.
   */
  blindIncreaseMode?: PokerBlindIncreaseMode;
  /** Required when `blindIncreaseMode === 'by_time'`. Integer minutes from `BLIND_INTERVAL_MINUTES_MIN` to `BLIND_INTERVAL_MINUTES_MAX`. */
  blindIntervalMinutes?: BlindIntervalMinutes;
  /** Start mode — defaults to `time` when absent (back-compat with pre-Sit-&-Go rows). */
  startMode?: PokerStartMode;
  /**
   * MTT: max seats per physical table (4–10). When unset or equal to maxPlayers,
   * the tournament runs as legacy single-table SNG. When set and < maxPlayers,
   * `activateTournament` spins up `ceil(playerCount / seatsPerTable)` tables and
   * consolidates them as players bust.
   */
  seatsPerTable?: number;
  /**
   * Late registration: minutes after `activated_at` during which new players can still buy in
   * and be seated at a live table. Absent / 0 disables late registration.
   */
  lateRegMinutes?: number;
}

export const DEFAULT_BLIND_SCHEDULE: BlindLevel[] = [
  { level: 1,  smallBlind: 25,    bigBlind: 50,     handsPerLevel: 10 },
  { level: 2,  smallBlind: 50,    bigBlind: 100,    handsPerLevel: 10 },
  { level: 3,  smallBlind: 75,    bigBlind: 150,    handsPerLevel: 8  },
  { level: 4,  smallBlind: 100,   bigBlind: 200,    handsPerLevel: 8  },
  { level: 5,  smallBlind: 150,   bigBlind: 300,    handsPerLevel: 6  },
  { level: 6,  smallBlind: 200,   bigBlind: 400,    handsPerLevel: 6  },
  { level: 7,  smallBlind: 300,   bigBlind: 600,    handsPerLevel: 5  },
  { level: 8,  smallBlind: 500,   bigBlind: 1000,   handsPerLevel: 5  },
  { level: 9,  smallBlind: 750,   bigBlind: 1500,   handsPerLevel: 5  },
  { level: 10, smallBlind: 1000,  bigBlind: 2000,   handsPerLevel: 5  },
  { level: 11, smallBlind: 1500,  bigBlind: 3000,   handsPerLevel: 5  },
  { level: 12, smallBlind: 2000,  bigBlind: 4000,   handsPerLevel: 5  },
  { level: 13, smallBlind: 3000,  bigBlind: 6000,   handsPerLevel: 5  },
  { level: 14, smallBlind: 5000,  bigBlind: 10000,  handsPerLevel: 5  },
  { level: 15, smallBlind: 7500,  bigBlind: 15000,  handsPerLevel: 5  },
  { level: 16, smallBlind: 10000, bigBlind: 20000,  handsPerLevel: 5  },
  { level: 17, smallBlind: 15000, bigBlind: 30000,  handsPerLevel: 5  },
  { level: 18, smallBlind: 20000, bigBlind: 40000,  handsPerLevel: 5  },
  { level: 19, smallBlind: 30000, bigBlind: 60000,  handsPerLevel: 5  },
  { level: 20, smallBlind: 50000, bigBlind: 100000, handsPerLevel: 999},
];

export interface PokerTournamentPlayer {
  playerAddress: string;
  /** From `chat_display_names`; null if unset. */
  displayName: string | null;
  entryId: string;
  chipsRemaining: number;
  status: 'playing' | 'busted' | 'completed';
  finalRank: number | null;
  prizeWon: string;
}

/** One row per live poker_tables row for the tournament. MTT lobby + HUD use these. */
export interface PokerTournamentTableSummary {
  tableId: string;
  /** 1-based label ("Table 1", "Table 2"). NULL for legacy single-table SNG. */
  seq: number | null;
  isFinalTable: boolean;
  /** Active seats currently sitting at this table (excludes already-busted players). */
  playerCount: number;
  smallBlind: number;
  bigBlind: number;
  handNumber: number;
}

export interface PokerTournamentState {
  tournamentId: string;
  name: string;
  status: string;
  tableId: string | null;
  blindLevel: number;
  smallBlind: number;
  bigBlind: number;
  handNumber: number;
  players: PokerTournamentPlayer[];
  /** All live tables for the tournament. Empty/undefined for pre-active SNG; one row for SNG-after-activate; N for MTT. */
  tables?: PokerTournamentTableSummary[];
  /** Chip-int for chips/promo; token-wei for custom-token (pair with `prizeTokenDecimals`). */
  prizePool: string;
  /** ERC-20 address when prize is a custom PRC-20; null/absent = chips. */
  prizeTokenAddress?: string | null;
  prizeTokenDecimals?: number | null;
  prizeTokenSymbol?: string | null;
  prizeTokenName?: string | null;
  buyInAmount: string;
  prizeDistributionType: string;
  pokerConfig?: PokerTournamentConfig;
  /** From `tournaments.action_timer_seconds`; null = default ~60s server turn clock. */
  actionTimerSeconds?: number | null;
  /** Percent of prize pool per finishing rank (index 0 = 1st place); integers summing to 100. */
  prizeSplitPercentages?: number[];
  /**
   * `by_time` mode only — wall-clock instant the current blind level became active.
   * Clients can subtract from `Date.now()` and compare against `pokerConfig.blindIntervalMinutes`
   * to render a countdown to the next bump. Null/absent for other modes or pre-activation.
   */
  currentBlindLevelStartedAt?: string | null;
}

export interface PokerTournamentSummary {
  tournamentId: string;
  name: string;
  status: string;
  buyInAmount: string;
  startingStack: number;
  registeredCount: number;
  maxPlayers: number;
  minPlayers: number;
  /**
   * For chip freerolls and platform-promo: chip amount.
   * For custom-token freerolls: amount in the token's smallest unit (wei). Pair with `prizeTokenDecimals`.
   */
  prizePool: string;
  /** ERC-20 contract address when prize is a custom PRC-20; null = chips. */
  prizeTokenAddress: string | null;
  /** 1–18 when `prizeTokenAddress` is set; null otherwise. */
  prizeTokenDecimals: number | null;
  /** Display ticker (e.g. "HEX"); null if missing or chips. */
  prizeTokenSymbol: string | null;
  /** Token contract name for UI (e.g. from PulseScan); null = use symbol / generic label. */
  prizeTokenName: string | null;
  tableId: string | null;
  /**
   * MTT: the requesting wallet's actual seat table. SNG: equals `tableId`. Null when the
   * caller isn't seated (spectator / busted / pre-activation / no wallet on request).
   * Clients should prefer `myTableId ?? tableId` for "navigate to my table" affordances —
   * the bare `tableId` is the lowest-table-seq table and is wrong for MTT players
   * who landed at table 2, 3, …
   */
  myTableId: string | null;
  createdAt: string;
  creatorAddress: string | null;
  prizeDistributionType: string;
  scheduledStartAt: string | null;
  isRegistered: boolean;
  /**
   * The caller's most recent `tournament_entries.status` for this tournament, or `null`
   * if they never registered. Lets the client distinguish active membership (`'playing'`)
   * from busted/completed entries that should re-attach as spectators on page refresh.
   */
  myEntryStatus: 'playing' | 'busted' | 'completed' | null;
  isPrivate: boolean;
  /** Level-1 or live table blinds (chip ints). */
  smallBlind: number;
  bigBlind: number;
  /** `knockout` = elimination bumps; `by_hand` = schedule after each hand; `by_time` = wall-clock interval. */
  blindIncreaseMode: PokerBlindIncreaseMode;
  /** Set only when `blindIncreaseMode === 'by_time'`. */
  blindIntervalMinutes?: BlindIntervalMinutes;
  /** `time` = classic scheduled start; `fill` = Sit & Go (starts when the table fills). */
  startMode: PokerStartMode;
  /** Creator-configured late-registration window in minutes (0 / absent = disabled). */
  lateRegMinutes?: number;
  /** True when the tournament is `active`, late reg is enabled, and the window has not elapsed. */
  lateRegOpen?: boolean;
}

/** Where the initial guaranteed pool is debited when buy-in is 0; `custom_token_buyin` is buy-in paid in PRC-20 via escrow. */
export type GuaranteedPrizePoolSource =
  | 'creator'
  | 'platform_promo'
  | 'custom_token'
  | 'custom_token_buyin';

/** Token metadata for poker tournaments where each player pays buy-in into escrow (no creator deposit at create). */
export interface CustomTokenBuyInMeta {
  tokenAddress: string;
  decimals: number;
  symbol?: string;
  name?: string;
}

/**
 * Funding payload supplied by the client when the prize pool is held in the
 * `TournamentPrizeEscrow` contract for an arbitrary PRC-20 token.
 *
 * The client deposits BEFORE this call; the server re-reads on-chain state to
 * verify the deposit is real, matches the supplied token + amount, and was made
 * by the creator. Only then is the tournament row written, with the same UUID
 * used for both the DB id and the bytes32 escrow key (keccak256(uuid)).
 */
export interface CustomTokenEscrowFunding {
  /** Client-generated UUID v4. Used as `tournaments.id` AND keccak'd to produce the on-chain bytes32 key. */
  tournamentId: string;
  /** Tx hash of the depositPrizePool call. Stored for auditability. */
  txHash: string;
  /** ERC-20 contract address that funded the pool. */
  tokenAddress: string;
  /** Wei (smallest unit) of the deposit. */
  amount: bigint;
  /** Token decimals (1–18). Used for display only; server trusts on-chain decimals for math. */
  decimals: number;
  /** Display ticker (e.g. "HEX"). Optional — server falls back to address tail in lobby/HUD if missing. */
  symbol?: string;
  /** Full token name (e.g. from picker / PulseScan). Optional; stored for history/lobby display. */
  name?: string;
}

export interface CreatePokerTournamentParams {
  creatorAddress: string;
  name: string;
  buyInAmount: bigint;
  /** Required when buyInAmount is 0: poker chips debited from creator at create; becomes initial prize_pool (chips). */
  guaranteedPrizePool?: bigint;
  /**
   * When buy-in is 0: debit the creator's `players.balance` (default).
   * `platform_promo`: same debit/refund wallet, but only allowed if the creator is in ADMIN_WALLETS (comma-separated `ADMIN_WALLETS` / `NEXT_PUBLIC_ADMIN_WALLETS`).
   * `custom_token`: prize pool is held in the on-chain escrow contract; `customTokenEscrow` must be supplied and is verified before the row is written.
   */
  guaranteedPrizePoolSource?: GuaranteedPrizePoolSource;
  /** Required when `guaranteedPrizePoolSource === 'custom_token'`. */
  customTokenEscrow?: CustomTokenEscrowFunding;
  /** Required when `guaranteedPrizePoolSource === 'custom_token_buyin'`. */
  customTokenBuyIn?: CustomTokenBuyInMeta;
  prizeDistributionType: string;
  /** Required when prizeDistributionType is `custom` (one integer % per rank, length = maxPlayers, sum 100). */
  prizePercentages?: number[];
  config: PokerTournamentConfig;
  isPrivate?: boolean;
  pinCode?: string | null;
  /**
   * Required for `time` start mode — must be a finite `Date` strictly in the
   * future. Omitted/undefined for `fill` mode (a Sit & Go has no scheduled time).
   */
  scheduledStartAt?: Date;
  /** Creator's chosen fee percent (0–15 integer). Clamped server-side; default 2. */
  creatorFeePercent?: number;
  /**
   * Per-turn action clock in seconds. Clamped to [`ACTION_TIMER_SECONDS_MIN`,
   * `ACTION_TIMER_SECONDS_MAX`]; when unset, stays NULL and the auto-fold sweep uses 60s.
   */
  actionTimerSeconds?: number;
}

/** Inclusive bounds for the per-turn action clock (seconds). */
export const ACTION_TIMER_SECONDS_MIN = 10;
export const ACTION_TIMER_SECONDS_MAX = 120;
/** Inclusive bounds for the late-registration window (minutes). 0 disables it. */
export const LATE_REG_MINUTES_MAX = 120;

/**
 * Validates creator prize % per finishing rank (index 0 = 1st place …).
 *
 * SNG (maxPlayers ≤ 10): array length must equal `maxPlayers`.
 * MTT (maxPlayers > 10): array length must equal 10 (paid ranks are capped at top-10).
 *
 * In both cases integers 0–100, unused trailing ranks may be 0, and the array must sum to
 * exactly 100. The cap matches the `buildPrizePercents` UI helper (also capped at 10).
 */
export function normalizePokerTournamentPrizePercents(maxPlayers: number, raw: unknown): number[] {
  if (!Number.isFinite(maxPlayers) || maxPlayers < 2) {
    throw new Error('maxPlayers must be at least 2');
  }
  const expectedLen = Math.min(10, Math.floor(maxPlayers));
  if (!Array.isArray(raw)) {
    throw new Error('prizePercentages must be an array');
  }
  if (raw.length !== expectedLen) {
    throw new Error(
      maxPlayers > 10
        ? `prizePercentages must have 10 entries (MTT pays top 10 ranks)`
        : `prizePercentages must have ${expectedLen} entries (one per max seat)`,
    );
  }
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < raw.length; i++) {
    const n = Number(raw[i]);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 100) {
      throw new Error(`prizePercentages[${i}] must be an integer from 0 to 100`);
    }
    out.push(n);
    sum += n;
  }
  if (sum !== 100) {
    throw new Error(`Prize percentages must sum to 100 (currently ${sum})`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PokerTournamentService {
  private broadcastCallback: ((room: string, message: object) => void) | null = null;

  constructor(
    private pool: Pool,
    private tournamentService: TournamentService,
    private pokerGameService: PokerGameService,
  ) {}

  /** Wire in a broadcast function so the service can push WS events. */
  setBroadcastCallback(cb: (room: string, message: object) => void): void {
    this.broadcastCallback = cb;
  }

  private broadcast(room: string, type: string, payload: object): void {
    if (this.broadcastCallback) {
      this.broadcastCallback(room, { type, payload });
    }
  }

  private normalizeAddress(address: string): string {
    return address?.toLowerCase() ?? address;
  }

  private parseBigInt(value: unknown): bigint {
    return toBigIntSafe(value);
  }

  /**
   * Who receives the **guaranteed** freeroll overlay (buy-in 0) when it is returned:
   * creator cancel (registration) or scheduled start with insufficient players.
   */
  private guaranteedPrizePoolRefundRecipient(tournament: {
    buy_in_amount: unknown;
    creator_address: unknown;
    guaranteed_prize_funder_address?: unknown;
  }): string | null {
    const buyIn = this.parseBigInt(tournament.buy_in_amount);
    if (buyIn > 0n) return null;
    const creatorRaw = tournament.creator_address as string | null | undefined;
    const creator = creatorRaw ? this.normalizeAddress(creatorRaw) : null;
    const funderRaw = tournament.guaranteed_prize_funder_address as string | null | undefined;
    if (funderRaw) return this.normalizeAddress(funderRaw);
    return creator;
  }

  // ---------------------------------------------------------------------------
  // Blind level calculation (pure, no DB)
  // ---------------------------------------------------------------------------

  /**
   * JSON/DB may return `handsPerLevel` as a string; `accumulated += "10"` would concatenate
   * instead of adding and breaks level boundaries — always coerce to a positive integer width.
   */
  private handsPerLevelNumeric(raw: unknown): number {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 1) return 1;
    return n;
  }

  /** Normalize stored / client-sent blind mode (case, kebab, legacy snake key handled in parse). */
  private normalizeBlindIncreaseMode(raw: unknown): PokerBlindIncreaseMode {
    if (raw == null || raw === '') return 'knockout';
    const s = String(raw).trim().toLowerCase().replace(/-/g, '_');
    if (s === 'by_hand') return 'by_hand';
    if (s === 'by_time') return 'by_time';
    return 'knockout';
  }

  /** Normalize stored / client-sent blind interval (minutes). Returns null when out of range. */
  private normalizeBlindIntervalMinutes(raw: unknown): BlindIntervalMinutes | null {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return null;
    if (n < BLIND_INTERVAL_MINUTES_MIN || n > BLIND_INTERVAL_MINUTES_MAX) return null;
    return n;
  }

  /** Return the BlindLevel that applies for a given hand number (1-indexed). */
  computeBlindLevel(blindSchedule: BlindLevel[], handNumber: number): BlindLevel {
    const hn = Math.floor(Number(handNumber));
    const safeHand = Number.isFinite(hn) && hn >= 1 ? hn : 1;
    let accumulated = 0;
    for (const level of blindSchedule) {
      accumulated += this.handsPerLevelNumeric(level.handsPerLevel as unknown);
      if (safeHand <= accumulated) return level;
    }
    return blindSchedule[blindSchedule.length - 1];
  }

  /**
   * SNG posted blinds use level-1 schedule amounts as a base, then double per elimination.
   * HUD / WS `newLevel` uses this tier: 1 + floor(log2(posted SB / level-1 SB)).
   */
  knockoutBlindDisplayLevel(blindSchedule: BlindLevel[], smallBlindChips: number): number {
    const l1 = blindSchedule[0];
    if (!l1 || l1.smallBlind <= 0 || smallBlindChips <= 0) return 1;
    const ratio = smallBlindChips / l1.smallBlind;
    if (ratio <= 1) return 1;
    const steps = Math.floor(Math.log2(ratio) + 1e-9);
    return 1 + steps;
  }

  /**
   * `by_time`: how many full intervals have elapsed since `levelStartedAt`.
   * Past the end of the schedule the function extrapolates additional levels
   * so blinds never freeze in `by_time` mode — see `extrapolateBlindLevel`.
   * Returns the level number (1-based) that should currently be in effect.
   *
   * Example: schedule has 8 levels, interval = 30 min, levelStartedAt was the
   * level-1 start. After 75 minutes (2 full 30-min intervals elapsed) the
   * effective level is `1 + 2 = 3`.
   */
  computeBlindLevelByTime(
    blindSchedule: BlindLevel[],
    intervalMinutes: number,
    levelStartedAt: Date,
    startingLevel: number,
    now: Date = new Date(),
  ): BlindLevel {
    if (!blindSchedule.length) {
      throw new Error('computeBlindLevelByTime: empty schedule');
    }
    const safeStart = Math.max(1, Math.floor(startingLevel));
    const safeInterval = Math.max(1, Math.floor(intervalMinutes));
    const elapsedMs = Math.max(0, now.getTime() - levelStartedAt.getTime());
    const intervalMs = safeInterval * 60_000;
    const stepsElapsed = Math.floor(elapsedMs / intervalMs);
    const targetIdx = safeStart - 1 + stepsElapsed;
    if (targetIdx < blindSchedule.length) {
      return blindSchedule[targetIdx];
    }
    return this.extrapolateBlindLevel(blindSchedule, targetIdx);
  }

  /**
   * Synthesize a blind level past the end of `blindSchedule` so tournaments
   * in `by_time` mode keep advancing instead of freezing once they reach the
   * last configured level. Growth rate is derived from the ratio between the
   * schedule's final two levels (falls back to 1.5x per step when the schedule
   * has only one level or the ratio is degenerate). Synthesized SB/BB values
   * are rounded to the nearest "nice" chip step matching their magnitude, and
   * are guaranteed to be strictly greater than the previous step.
   */
  extrapolateBlindLevel(blindSchedule: BlindLevel[], targetIdx: number): BlindLevel {
    if (!blindSchedule.length) {
      throw new Error('extrapolateBlindLevel: empty schedule');
    }
    const last = blindSchedule[blindSchedule.length - 1];
    const lastIdx = blindSchedule.length - 1;
    const extraSteps = Math.max(1, targetIdx - lastIdx);

    let multiplier = 1.5;
    if (blindSchedule.length >= 2) {
      const prev = blindSchedule[blindSchedule.length - 2];
      const ratio = prev.bigBlind > 0 ? last.bigBlind / prev.bigBlind : 0;
      if (Number.isFinite(ratio) && ratio > 1) multiplier = ratio;
    }

    let sb = last.smallBlind;
    let bb = last.bigBlind;
    for (let i = 0; i < extraSteps; i++) {
      const nextSB = this.roundChipStep(sb * multiplier);
      const nextBB = this.roundChipStep(bb * multiplier);
      sb = nextSB > sb ? nextSB : sb + 1;
      bb = nextBB > bb ? nextBB : bb + 1;
    }

    return {
      level: last.level + extraSteps,
      smallBlind: sb,
      bigBlind: bb,
      handsPerLevel: 999,
    };
  }

  /** Round a chip value to a 1/2/5-style step matching its magnitude (25, 100, 500, 1k, 10k, ...). */
  private roundChipStep(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 0;
    const mag = Math.pow(10, Math.floor(Math.log10(value)));
    let step: number;
    if (mag < 100) step = 25;
    else if (mag < 1_000) step = 50;
    else if (mag < 10_000) step = 250;
    else if (mag < 100_000) step = 1_000;
    else if (mag < 1_000_000) step = 10_000;
    else step = Math.floor(mag / 10);
    return Math.max(step, Math.ceil(value / step) * step);
  }

  /** Blinds that apply to the next hand after `completedHandNumber` (1-based) finishes. */
  blindsForNextHand(blindSchedule: BlindLevel[], completedHandNumber: number): BlindLevel {
    const completed = Math.floor(Number(completedHandNumber));
    const safeCompleted = Number.isFinite(completed) && completed >= 1 ? completed : 1;
    const nextHand = safeCompleted + 1;
    return this.computeBlindLevel(blindSchedule, nextHand);
  }

  private getBlindIncreaseMode(config: PokerTournamentConfig): PokerBlindIncreaseMode {
    return this.normalizeBlindIncreaseMode(config.blindIncreaseMode);
  }

  /** HUD / snapshot: schedule level index from posted blinds (by-hand mode). */
  private scheduleDisplayLevel(blindSchedule: BlindLevel[], smallBlindChips: number, bigBlindChips: number): number {
    const match = blindSchedule.find(
      (l) => l.smallBlind === smallBlindChips && l.bigBlind === bigBlindChips,
    );
    if (match) return match.level;
    return blindSchedule[0]?.level ?? 1;
  }

  private parsePokerConfig(raw: unknown): PokerTournamentConfig {
    if (!raw) {
      return {
        startingStack: 5000,
        minPlayers: 2,
        maxPlayers: 10,
        blindSchedule: DEFAULT_BLIND_SCHEDULE,
        blindIncreaseMode: 'knockout',
      };
    }
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>;
    const modeRaw = obj.blindIncreaseMode ?? obj.blind_increase_mode;
    const blindIncreaseMode = this.normalizeBlindIncreaseMode(modeRaw);
    const intervalRaw = obj.blindIntervalMinutes ?? obj.blind_interval_minutes;
    const interval = this.normalizeBlindIntervalMinutes(intervalRaw);
    // Back-compat: rows created before Sit & Go have no startMode → treat as 'time'.
    const startMode: PokerStartMode =
      (obj.startMode ?? obj.start_mode) === 'fill' ? 'fill' : 'time';
    const seatsPerTable = this.normalizeSeatsPerTable(
      obj.seatsPerTable ?? obj.seats_per_table,
      Number(obj.maxPlayers ?? 10),
    );
    return {
      startingStack: Number(obj.startingStack ?? 5000),
      minPlayers:    Number(obj.minPlayers    ?? 2),
      maxPlayers:    Number(obj.maxPlayers    ?? 10),
      blindSchedule: Array.isArray(obj.blindSchedule) && obj.blindSchedule.length > 0
        ? obj.blindSchedule as BlindLevel[]
        : DEFAULT_BLIND_SCHEDULE,
      blindIncreaseMode,
      startMode,
      ...(blindIncreaseMode === 'by_time' && interval ? { blindIntervalMinutes: interval } : {}),
      ...(seatsPerTable != null ? { seatsPerTable } : {}),
      ...((() => {
        const raw = Number(obj.lateRegMinutes ?? obj.late_reg_minutes);
        const v = Number.isFinite(raw) ? Math.max(0, Math.min(LATE_REG_MINUTES_MAX, Math.round(raw))) : 0;
        return v > 0 ? { lateRegMinutes: v } : {};
      })()),
    };
  }

  /**
   * MTT: clamp `seatsPerTable` into [POKER_MTT_SEATS_PER_TABLE_MIN, POKER_MTT_SEATS_PER_TABLE_MAX].
   * Returns null when not configured (single-table SNG) or out of range. When equal to or above
   * maxPlayers the tournament still runs as single-table SNG — N tables only spin up when
   * playerCount > seatsPerTable.
   */
  private normalizeSeatsPerTable(raw: unknown, maxPlayers: number): number | null {
    if (raw == null || raw === '') return null;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return null;
    if (n < POKER_MTT_SEATS_PER_TABLE_MIN || n > POKER_MTT_SEATS_PER_TABLE_MAX) return null;
    if (Number.isFinite(maxPlayers) && maxPlayers > 0 && n > maxPlayers) return maxPlayers;
    return n;
  }

  /**
   * Effective per-table seat cap for activation / consolidation. SNG fallback = maxPlayers
   * (capped at 10 to match the legacy chevtek table) so existing tournaments behave identically.
   */
  private effectiveSeatsPerTable(config: PokerTournamentConfig): number {
    const fromCfg = this.normalizeSeatsPerTable(config.seatsPerTable, config.maxPlayers);
    if (fromCfg != null) return fromCfg;
    return Math.min(POKER_MTT_SEATS_PER_TABLE_MAX, Math.max(2, Math.floor(config.maxPlayers || 10)));
  }

  /** Final table seat target: the smaller of seatsPerTable and POKER_MTT_FINAL_TABLE_SIZE_DEFAULT. */
  private effectiveFinalTableSize(config: PokerTournamentConfig): number {
    const seats = this.effectiveSeatsPerTable(config);
    return Math.min(seats, POKER_MTT_FINAL_TABLE_SIZE_DEFAULT);
  }

  /**
   * Fisher-Yates shuffle. Used for initial table assignment + final-table seat draw.
   * NOT card dealing (deck shuffles go through `pfService.fisherYatesShuffle` — see CLAUDE.md).
   */
  private shuffleInPlace<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  async createPokerTournament(
    params: CreatePokerTournamentParams,
  ): Promise<{ tournamentId: string; pinCode: string | null }> {
    const normalizedCreator = this.normalizeAddress(params.creatorAddress);
    const { config } = params;

    if (!config.blindSchedule || config.blindSchedule.length === 0) {
      throw new Error('Blind schedule must have at least one level');
    }
    const blindModeForCreate = this.normalizeBlindIncreaseMode(config.blindIncreaseMode);
    if (blindModeForCreate === 'by_time') {
      const interval = this.normalizeBlindIntervalMinutes(config.blindIntervalMinutes);
      if (!interval) {
        throw new Error(
          `blindIntervalMinutes is required when blindIncreaseMode is 'by_time' and must be an integer from ${BLIND_INTERVAL_MINUTES_MIN} to ${BLIND_INTERVAL_MINUTES_MAX} (minutes).`,
        );
      }
    }
    if (config.minPlayers < 2) throw new Error('minPlayers must be at least 2');
    if (config.maxPlayers < config.minPlayers) throw new Error('maxPlayers must be >= minPlayers');
    if (config.startingStack < 100) throw new Error('startingStack must be at least 100');
    if (!params.name?.trim()) throw new Error('Tournament name required');

    // Start mode: a Sit & Go ('fill') has no clock — it starts when the table
    // fills. A classic tournament ('time') requires a future scheduled start.
    const startMode: PokerStartMode = config.startMode === 'fill' ? 'fill' : 'time';
    // A Sit & Go has a fixed seat count: it only starts once every seat is
    // taken, so minPlayers and maxPlayers are the same number.
    if (startMode === 'fill') {
      config.minPlayers = config.maxPlayers;
    }

    let scheduled: Date | null = null;
    if (startMode === 'time') {
      const s = params.scheduledStartAt;
      if (!(s instanceof Date) || Number.isNaN(s.getTime())) {
        throw new Error('scheduledStartAt is required for scheduled poker tournaments');
      }
      if (s.getTime() <= Date.now()) {
        throw new Error('scheduledStartAt must be in the future');
      }
      scheduled = s;
    }

    const buyIn = params.buyInAmount;
    if (buyIn < 0n) throw new Error('buyInAmount cannot be negative');
    const guaranteed = params.guaranteedPrizePool ?? 0n;
    const poolSource: GuaranteedPrizePoolSource = params.guaranteedPrizePoolSource ?? 'creator';

    // Chip-denominated prize pool is only required for chip/promo freerolls.
    // For custom_token freerolls the prize lives on-chain in the escrow contract,
    // so off-chain `guaranteedPrizePool` (chips) is irrelevant.
    if (buyIn === 0n && poolSource !== 'custom_token') {
      if (guaranteed <= 0n) {
        throw new Error('guaranteedPrizePool is required and must be > 0 for freeroll (zero buy-in) poker tournaments');
      }
    } else if (buyIn > 0n && guaranteed > 0n) {
      throw new Error('guaranteedPrizePool is only allowed when buy-in is 0');
    }

    if (buyIn > 0n && poolSource !== 'creator' && poolSource !== 'custom_token_buyin') {
      throw new Error('Buy-in tournaments must use creator (chip) or custom_token_buyin funding');
    }
    if (buyIn === 0n && poolSource === 'custom_token_buyin') {
      throw new Error('custom_token_buyin requires a positive buy-in amount');
    }
    if (buyIn === 0n && poolSource === 'platform_promo') {
      if (!isAdminWallet(normalizedCreator)) {
        throw new Error('Platform-funded freerolls require an admin wallet');
      }
    }

    // Custom-token escrow path: verify on-chain deposit before we touch the DB.
    let escrowVerified: {
      tournamentId: string;
      tokenAddress: string;
      decimals: number;
      symbol: string | null;
      name: string | null;
      txHash: string;
      bytes32Id: string;
    } | null = null;

    let customBuyInRow: {
      tournamentId: string;
      tokenAddress: string;
      decimals: number;
      symbol: string | null;
      name: string | null;
      bytes32Id: `0x${string}`;
    } | null = null;

    if (poolSource === 'custom_token') {
      if (buyIn !== 0n) {
        throw new Error('custom_token prize source is only valid for freeroll (zero buy-in) tournaments');
      }
      const e = params.customTokenEscrow;
      if (!e) throw new Error('customTokenEscrow is required when guaranteedPrizePoolSource is custom_token');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.tournamentId)) {
        throw new Error('customTokenEscrow.tournamentId must be a UUID');
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(e.tokenAddress)) {
        throw new Error('customTokenEscrow.tokenAddress must be a 0x-prefixed 20-byte address');
      }
      if (!/^0x[a-fA-F0-9]{64}$/.test(e.txHash)) {
        throw new Error('customTokenEscrow.txHash must be a 0x-prefixed 32-byte tx hash');
      }
      if (e.amount <= 0n) {
        throw new Error('customTokenEscrow.amount must be positive');
      }
      const dec = Math.floor(Number(e.decimals));
      if (!Number.isFinite(dec) || dec < 1 || dec > 18) {
        throw new Error('customTokenEscrow.decimals must be an integer between 1 and 18');
      }
      // Symbol is display-only; sanitize to prevent garbage / injection in lobby cells.
      let symbolClean: string | null = null;
      if (typeof e.symbol === 'string') {
        const s = e.symbol.trim().slice(0, 32);
        // Tickers in the wild can include digits, dots, dashes; reject control chars and brackets.
        if (s && /^[A-Za-z0-9._\-+]+$/.test(s)) symbolClean = s;
      }
      let nameClean: string | null = null;
      if (typeof e.name === 'string') {
        const n = e.name.trim().slice(0, 64);
        if (n.length > 0 && !/[<>\x00-\x08\x0B\x0C\x0E-\x1F]/.test(n)) nameClean = n;
      }

      // Re-read the escrow contract; trust on-chain state, not the client's claims.
      const pool = await getEscrowPoolStatus(e.tournamentId);
      if (!pool) {
        throw new Error('Could not verify on-chain escrow deposit (RPC error)');
      }
      // Empty pool: contract returns the zero-struct when no deposit has landed at this bytes32.
      // Most common cause: the deposit tx was signed by the wallet but not broadcast/mined yet,
      // OR the wallet rejected silently after returning a hash. Check this FIRST so the error
      // message is accurate instead of falling through to "not active" / "underfunded".
      if (pool.token === '0x0000000000000000000000000000000000000000' || pool.totalDeposited === 0n) {
        logger.warn('Custom-token freeroll: no on-chain deposit found at bytes32', {
          tournamentId: e.tournamentId,
          bytes32Id: tournamentIdToBytes32(e.tournamentId),
          claimedTxHash: e.txHash,
          claimedAmount: e.amount.toString(),
        });
        throw new Error(
          'No on-chain deposit found for this tournament id yet. The deposit transaction may still be pending or was never broadcast. ' +
          'Check the tx hash in a block explorer; if it never landed, cancel and retry the create flow to start fresh.',
        );
      }
      if (pool.cancelled) {
        throw new Error('Escrow deposit has already been cancelled');
      }
      if (pool.token.toLowerCase() !== e.tokenAddress.toLowerCase()) {
        throw new Error(`Escrow token mismatch (on-chain: ${pool.token}, claimed: ${e.tokenAddress})`);
      }
      if (pool.depositor && pool.depositor.toLowerCase() !== normalizedCreator) {
        throw new Error('Escrow depositor must match the tournament creator');
      }
      if (pool.totalDeposited < e.amount) {
        throw new Error(`Escrow underfunded (on-chain: ${pool.totalDeposited.toString()}, claimed: ${e.amount.toString()})`);
      }
      if (pool.amountPaidOut > 0n) {
        // Surface enough context to debug a UUID/bytes32 collision in the wild.
        logger.error('Custom-token freeroll create rejected: bytes32 already has prior payout', {
          tournamentId: e.tournamentId,
          bytes32Id: tournamentIdToBytes32(e.tournamentId),
          totalDeposited: pool.totalDeposited.toString(),
          amountPaidOut: pool.amountPaidOut.toString(),
          depositor: pool.depositor,
          claimedTxHash: e.txHash,
        });
        throw new Error(
          `Escrow already has prior activity for this tournament id (paid out: ${pool.amountPaidOut.toString()}). ` +
          `If you just deposited, the deposit transaction likely targeted a previously-used bytes32 — ` +
          `cancel the create flow and try again to generate a fresh id.`,
        );
      }

      // tournamentIdToBytes32(uuid) is what the client used on-chain. We re-derive
      // server-side and store it so cancel/payout can rebuild the same key without
      // redoing the keccak.
      escrowVerified = {
        tournamentId: e.tournamentId,
        tokenAddress: e.tokenAddress.toLowerCase(),
        decimals: dec,
        symbol: symbolClean,
        name: nameClean,
        txHash: e.txHash.toLowerCase(),
        bytes32Id: tournamentIdToBytes32(e.tournamentId),
      };
    }

    if (poolSource === 'custom_token_buyin') {
      const m = params.customTokenBuyIn;
      if (!m) throw new Error('customTokenBuyIn is required when guaranteedPrizePoolSource is custom_token_buyin');
      if (!/^0x[a-fA-F0-9]{40}$/.test(m.tokenAddress)) {
        throw new Error('customTokenBuyIn.tokenAddress must be a 0x-prefixed 20-byte address');
      }
      const dec = Math.floor(Number(m.decimals));
      if (!Number.isFinite(dec) || dec < 1 || dec > 18) {
        throw new Error('customTokenBuyIn.decimals must be an integer between 1 and 18');
      }
      let symbolCleanBuyIn: string | null = null;
      if (typeof m.symbol === 'string') {
        const s = m.symbol.trim().slice(0, 32);
        if (s && /^[A-Za-z0-9._\-+]+$/.test(s)) symbolCleanBuyIn = s;
      }
      let nameCleanBuyIn: string | null = null;
      if (typeof m.name === 'string') {
        const n = m.name.trim().slice(0, 64);
        if (n.length > 0 && !/[<>\x00-\x08\x0B\x0C\x0E-\x1F]/.test(n)) nameCleanBuyIn = n;
      }
      const tidBuyIn = randomUUID();
      customBuyInRow = {
        tournamentId: tidBuyIn,
        tokenAddress: m.tokenAddress.toLowerCase(),
        decimals: dec,
        symbol: symbolCleanBuyIn,
        name: nameCleanBuyIn,
        bytes32Id: tournamentIdToBytes32(tidBuyIn),
      };
    }

    let pinCode: string | null = null;
    if (params.isPrivate) {
      const custom = params.pinCode?.trim();
      if (custom && /^\d{4,12}$/.test(custom)) {
        pinCode = custom;
      } else {
        pinCode = Math.floor(1000 + Math.random() * 9000).toString();
      }
    }

    const blindIncreaseMode = this.normalizeBlindIncreaseMode(config.blindIncreaseMode);
    const blindIntervalMinutes =
      blindIncreaseMode === 'by_time'
        ? this.normalizeBlindIntervalMinutes(config.blindIntervalMinutes) ?? undefined
        : undefined;
    // Late registration window (minutes). Clamp to [0, LATE_REG_MINUTES_MAX]; 0 = disabled.
    const rawLateReg = Number(config.lateRegMinutes);
    const lateRegMinutes = Number.isFinite(rawLateReg)
      ? Math.max(0, Math.min(LATE_REG_MINUTES_MAX, Math.round(rawLateReg)))
      : 0;
    const configForDb: PokerTournamentConfig = {
      ...config,
      blindIncreaseMode,
      startMode,
      ...(blindIntervalMinutes ? { blindIntervalMinutes } : {}),
      ...(lateRegMinutes > 0 ? { lateRegMinutes } : {}),
    };
    // Strip a stale interval if mode isn't by_time so it doesn't accidentally persist.
    if (blindIncreaseMode !== 'by_time') {
      delete (configForDb as Partial<PokerTournamentConfig>).blindIntervalMinutes;
    }
    if (lateRegMinutes <= 0) {
      delete (configForDb as Partial<PokerTournamentConfig>).lateRegMinutes;
    }

    // Per-turn action clock (seconds). NULL when unset → auto-fold sweep falls back to 60s.
    const rawActionTimer = Number(params.actionTimerSeconds);
    const actionTimerSeconds = Number.isFinite(rawActionTimer)
      ? Math.max(ACTION_TIMER_SECONDS_MIN, Math.min(ACTION_TIMER_SECONDS_MAX, Math.round(rawActionTimer)))
      : null;

    const prizePercentages =
      params.prizeDistributionType === 'custom'
        ? normalizePokerTournamentPrizePercents(config.maxPlayers, params.prizePercentages)
        : getPrizePercentagesForType(params.prizeDistributionType);
    // Off-chain freerolls store the chip pool. Custom-token freerolls store the on-chain
    // wei amount in `prize_pool` so `calculate_tournament_prizes` and `distributePrizes`
    // (in tournament.service.ts) compute and pay out in the token's wei units —
    // same pattern blackjack uses.
    let initialPrizePool: string;
    if (poolSource === 'custom_token' && params.customTokenEscrow) {
      initialPrizePool = params.customTokenEscrow.amount.toString();
    } else if (poolSource === 'custom_token_buyin') {
      initialPrizePool = '0';
    } else if (buyIn === 0n) {
      initialPrizePool = guaranteed.toString();
    } else {
      initialPrizePool = '0';
    }

    let guaranteedPrizeFunderAddress: string | null = null;
    let debitAddress: string | null = null;

    // Custom-token escrow path debits nothing off-chain — the prize is held in the contract.
    if (buyIn === 0n && poolSource !== 'custom_token') {
      debitAddress = normalizedCreator;
      guaranteedPrizeFunderAddress = null;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Creator-chosen fee (0–15 integer). Default 2 if missing/invalid. DB CHECK constraint
      // (migration 120) provides a second line of defense. Freerolls override to 0 at payout
      // time (server-side in tournament.service.ts:1083) but we still persist the user's choice.
      const rawCreatorFee = Number(params.creatorFeePercent);
      const creatorFeePercent = Number.isFinite(rawCreatorFee)
        ? Math.max(0, Math.min(15, Math.round(rawCreatorFee)))
        : 2;

      const result = await client.query(
        `INSERT INTO tournaments (
        id,
        name, creator_address, buy_in_amount, starting_chips, max_hands, min_players,
        max_players, rebuy_config, table_theme, is_private, pin_code,
        prize_distribution_type, prize_percentages, prize_pool, guaranteed_prize_funder_address,
        creator_fee_percent, platform_fee_percent, status,
        game_type, poker_config, scheduled_start_at,
        prize_token_address, prize_token_decimals, prize_token_symbol, prize_token_name,
        escrow_tx_hash, escrow_tournament_id_bytes32, action_timer_seconds
      ) VALUES (
        COALESCE($17::UUID, gen_random_uuid()),
        $1, $2, $3::NUMERIC, $4, 999, $5,
        $6, $7::JSONB, $8::JSONB, $9, $10,
        $11, $12::JSONB, $13::NUMERIC, $14,
        $24, 3, 'registration',
        'poker', $15::JSONB, $16,
        $18, $19, $20, $21,
        $22, $23, $25
      ) RETURNING id`,
        [
          params.name.trim(),
          normalizedCreator,
          buyIn.toString(),
          config.startingStack,
          config.minPlayers,
          config.maxPlayers,
          JSON.stringify({ enabled: false, maxRebuys: 0 }),
          JSON.stringify({ kind: 'image', id: 'BigRich' }),
          params.isPrivate ?? false,
          pinCode,
          params.prizeDistributionType,
          JSON.stringify(prizePercentages),
          initialPrizePool,
          guaranteedPrizeFunderAddress,
          JSON.stringify(configForDb),
          scheduled ? scheduled.toISOString() : null,
          escrowVerified?.tournamentId ?? customBuyInRow?.tournamentId ?? null,
          escrowVerified?.tokenAddress ?? customBuyInRow?.tokenAddress ?? null,
          escrowVerified?.decimals ?? customBuyInRow?.decimals ?? null,
          escrowVerified?.symbol ?? customBuyInRow?.symbol ?? null,
          escrowVerified?.name ?? customBuyInRow?.name ?? null,
          escrowVerified?.txHash ?? null,
          escrowVerified?.bytes32Id ?? customBuyInRow?.bytes32Id ?? null,
          creatorFeePercent,
          actionTimerSeconds,
        ]
      );

      const tournamentId = result.rows[0].id as string;

      if (buyIn === 0n && debitAddress) {
        await applyPokerChipDelta(
          client,
          debitAddress,
          -guaranteed,
          'tournament_create_guarantee',
          { type: 'tournament', id: tournamentId },
        );
      }

      // Fill-mode Sit & Gos have no scheduled start, so no poker_start event is
      // created here — joinPokerTournament schedules one when the table fills.
      if (scheduled) {
        await client.query(
          `INSERT INTO tournament_scheduled_events (tournament_id, event_type, scheduled_at, status)
           VALUES ($1, 'poker_start', $2, 'pending')`,
          [tournamentId, scheduled.toISOString()],
        );
      }

      await client.query('COMMIT');

      logger.info('Poker tournament created', {
        tournamentId,
        name: params.name,
        creator: normalizedCreator,
        startMode,
        scheduledStartAt: scheduled ? scheduled.toISOString() : null,
        buyIn: buyIn.toString(),
        guaranteedPrizePool: buyIn === 0n ? guaranteed.toString() : undefined,
        guaranteedPrizePoolSource:
          buyIn === 0n ? poolSource : poolSource === 'custom_token_buyin' ? poolSource : undefined,
      });

      // The Rail: post the tournament card to the Telegram group (best-effort).
      void railTournamentCreated(this.pool, tournamentId);

      return { tournamentId, pinCode: params.isPrivate ? pinCode : null };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Join
  // ---------------------------------------------------------------------------

  /**
   * Player joins the registration phase by paying the buy-in.
   * Uses SELECT ... FOR UPDATE to prevent race condition on auto-start.
   * Returns the entry and whether the tournament auto-started.
   */
  async joinPokerTournament(
    tournamentId: string,
    playerAddress: string,
    pinCode?: string,
    joinEscrowTxHash?: string | null,
  ): Promise<{ entryId: string; autoStarted: boolean; tableId: string | null }> {
    const normalized = this.normalizeAddress(playerAddress);

    // Cheap fast path: when the caller is already registered (very common — table HUD reconnects,
    // `refreshTournaments` re-subscribing to rooms, retry storms), skip opening a transaction with
    // `SELECT ... FOR UPDATE`. Two simple reads instead of the full lock + 5+ queries.
    //
    // Busted/completed entries are also returned here so the WS handler can subscribe the
    // socket to the tournament room for spectator events (blind level up, eliminations,
    // completed). Without this, refreshing the page after busting drops the player out of
    // the tournament room — they keep seeing the table HUD but get no tournament updates.
    const fastCheck = await this.pool.query(
      `SELECT te.id AS entry_id, te.status AS entry_status,
              t.status AS tournament_status, t.is_private, t.pin_code,
              /* MTT: prefer the caller's actual seat table over the lowest-seq table.
                 Falls back to the lowest-seq table for spectators / pre-activation. */
              COALESCE(
                (SELECT ps.table_id FROM poker_seats ps
                   JOIN poker_tables pkt ON pkt.id = ps.table_id
                  WHERE pkt.tournament_id = $1
                    AND LOWER(ps.player_address) = $2
                  LIMIT 1),
                (SELECT id FROM poker_tables
                  WHERE tournament_id = $1
                  ORDER BY table_seq NULLS LAST, created_at
                  LIMIT 1)
              ) AS table_id
         FROM tournament_entries te
         JOIN tournaments t ON t.id = te.tournament_id
        WHERE te.tournament_id = $1
          AND LOWER(te.player_address) = $2
        LIMIT 1`,
      [tournamentId, normalized]
    );
    if (fastCheck.rows.length > 0) {
      const row = fastCheck.rows[0];
      const status = String(row.tournament_status ?? '');
      const entryStatus = String(row.entry_status ?? '');
      const isSpectator = entryStatus === 'busted' || entryStatus === 'completed';
      if (status === 'registration' || status === 'active') {
        // PIN was already validated when this entry was first created; spectators don't re-prove it.
        if (!isSpectator && row.is_private && pinCode !== row.pin_code) {
          throw new Error('Incorrect PIN code');
        }
        return {
          entryId: row.entry_id,
          autoStarted: !!row.table_id,
          tableId: row.table_id ?? null,
        };
      }
    }

    /** Set only on successful new-registration path; idempotent path returns from inside `connect` block. */
    let committedEntryId: string | null = null;
    let committedShouldAutoStart = false;
    let committedFillCountdown = false;
    /** Set when a late-registration join seats the player at a live table — drives the return tableId. */
    let committedLateRegTableId: string | null = null;

    /** When join fails after an escrow deposit was verified (e.g. tournament full). */
    let refundEscrowAfterRollback: {
      tournamentId: string;
      player: string;
      buyIn: bigint;
      prizeToken: string;
      txHash: string;
    } | null = null;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the tournament row to serialize concurrent joins
      const tRow = await client.query(
        `SELECT t.*, t.poker_config, t.scheduled_start_at
         FROM tournaments t
         WHERE t.id = $1 AND t.game_type = 'poker'
         FOR UPDATE`,
        [tournamentId]
      );
      if (tRow.rows.length === 0) throw new Error('Poker tournament not found');

      const tournament = tRow.rows[0];

      // Already registered: idempotent join for retries, and for `poker_tournament_join` while **active**
      // (table HUD / reconnect calls join after SNG auto-start — must not require status=registration).
      const existing = await client.query(
        `SELECT id FROM tournament_entries
         WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)
           AND status NOT IN ('busted', 'completed')`,
        [tournamentId, normalized]
      );
      if (existing.rows.length > 0) {
        if (tournament.is_private && pinCode !== tournament.pin_code) {
          throw new Error('Incorrect PIN code');
        }
        const st = String(tournament.status ?? '');
        if (st !== 'registration' && st !== 'active') {
          throw new Error(`Cannot rejoin tournament (status: ${st})`);
        }
        await client.query('COMMIT');
        const entryId = existing.rows[0].id;
        // Use same checked-out client — do not call `pool.query` here while still holding `client`
        // (would consume two pool slots and contributes to "timeout exceeded when trying to connect").
        // MTT: caller's actual seat table comes first; fall back to the lowest-seq table for
        // spectators or any case where they aren't yet seated.
        const tableResult = await client.query(
          `SELECT COALESCE(
             (SELECT ps.table_id FROM poker_seats ps
                JOIN poker_tables pkt ON pkt.id = ps.table_id
               WHERE pkt.tournament_id = $1
                 AND LOWER(ps.player_address) = $2
               LIMIT 1),
             (SELECT id FROM poker_tables
                WHERE tournament_id = $1
                ORDER BY table_seq NULLS LAST, created_at
                LIMIT 1)
           ) AS id`,
          [tournamentId, normalized]
        );
        const tableId = tableResult.rows[0]?.id ?? null;
        logger.info('Player already registered for poker tournament, returning existing entry', { tournamentId, playerAddress: normalized, entryId, tableId });
        return { entryId, autoStarted: !!tableId, tableId };
      }

      const config = this.parsePokerConfig(tournament.poker_config);

      // Late registration: a still-`active` tournament accepts new buy-ins for
      // `lateRegMinutes` after activation, as long as a live table has an open
      // physical seat (freed by an earlier bust-out). The new entrant is seated
      // mid-tournament and dealt in on the next hand.
      let isLateReg = false;
      let lateRegTableId: string | null = null;
      if (tournament.status === 'registration') {
        // normal path
      } else if (tournament.status === 'active') {
        const lateRegMinutes = config.lateRegMinutes ?? 0;
        if (lateRegMinutes <= 0) {
          throw new Error('Registration for this tournament is closed');
        }
        const activatedAt = tournament.activated_at ? new Date(tournament.activated_at).getTime() : null;
        if (activatedAt == null || Date.now() > activatedAt + lateRegMinutes * 60_000) {
          throw new Error('Late registration has closed for this tournament');
        }
        // Pick the live table with the most room (non-final tables first), lowest
        // seated count → keeps MTT tables balanced; SNG just uses its one table.
        const seatTarget = await client.query(
          `SELECT pt.id, pt.max_seats, COUNT(ps.position) AS seated
             FROM poker_tables pt
             LEFT JOIN poker_seats ps ON ps.table_id = pt.id
            WHERE pt.tournament_id = $1
            GROUP BY pt.id, pt.max_seats, pt.is_final_table, pt.table_seq
           HAVING COUNT(ps.position) < pt.max_seats
            ORDER BY pt.is_final_table ASC, COUNT(ps.position) ASC, pt.table_seq NULLS LAST
            LIMIT 1`,
          [tournamentId],
        );
        if (seatTarget.rows.length === 0) {
          throw new Error('Late registration is open but every table is currently full');
        }
        isLateReg = true;
        lateRegTableId = String(seatTarget.rows[0].id);
      } else {
        throw new Error(`Tournament is not open for registration (status: ${tournament.status})`);
      }

      // Private tournament PIN check (new registration)
      if (tournament.is_private && pinCode !== tournament.pin_code) {
        throw new Error('Incorrect PIN code');
      }

      // Check if full
      const countRow = await client.query(
        `SELECT COUNT(*) AS c FROM tournament_entries
         WHERE tournament_id = $1 AND status NOT IN ('busted','completed')`,
        [tournamentId]
      );
      const registered = Number(countRow.rows[0].c);
      const buyIn = this.parseBigInt(tournament.buy_in_amount);
      const prizeTokRaw = tournament.prize_token_address
        ? String(tournament.prize_token_address).trim()
        : '';
      const isEscrowBuyIn = buyIn > 0n && prizeTokRaw.startsWith('0x');

      // Registration-phase fullness is the field cap; late reg uses live seat
      // availability (already verified above) so busted-out seats can be refilled.
      if (!isLateReg && registered >= config.maxPlayers) {
        const txh = joinEscrowTxHash?.trim();
        if (isEscrowBuyIn && txh && /^0x[a-fA-F0-9]{64}$/.test(txh)) {
          refundEscrowAfterRollback = {
            tournamentId,
            player: normalized,
            buyIn,
            prizeToken: prizeTokRaw,
            txHash: txh,
          };
        }
        throw new Error('Tournament is full');
      }

      let escrowTxForInsert: string | null = null;
      if (isEscrowBuyIn) {
        const txh = joinEscrowTxHash?.trim();
        if (!txh || !/^0x[a-fA-F0-9]{64}$/.test(txh)) {
          throw new Error(
            'joinEscrowTxHash required (hash of your successful addToPrizePool transaction)',
          );
        }
        const dupChk = await client.query(
          `SELECT id FROM tournament_entries WHERE LOWER(escrow_join_tx_hash) = LOWER($1) LIMIT 1`,
          [txh],
        );
        if (dupChk.rows.length > 0) {
          throw new Error('This escrow deposit transaction was already used to join a tournament');
        }
        const ver = await verifyEscrowAddToPrizePoolJoinTx({
          tournamentIdUuid: tournamentId,
          txHash: txh as `0x${string}`,
          playerAddress: normalized,
          prizeTokenAddress: prizeTokRaw,
          buyInAmountWei: buyIn,
        });
        if (!ver.ok) {
          throw new Error(ver.error);
        }
        escrowTxForInsert = txh.toLowerCase();

        await client.query(
          `UPDATE tournaments SET prize_pool = prize_pool + $1::NUMERIC WHERE id = $2`,
          [buyIn.toString(), tournamentId],
        );
      } else if (buyIn > 0n) {
        await applyPokerChipDelta(
          client,
          normalized,
          -buyIn,
          'tournament_buyin',
          { type: 'tournament', id: tournamentId },
        );

        await client.query(
          `UPDATE tournaments SET prize_pool = prize_pool + $1::NUMERIC WHERE id = $2`,
          [buyIn.toString(), tournamentId],
        );
      }

      // Create entry
      const entryRow = await client.query(
        `INSERT INTO tournament_entries (tournament_id, player_address, chips_remaining, highest_chip_count, escrow_join_tx_hash)
         VALUES ($1, $2, $3, $3, $4) RETURNING id`,
        [tournamentId, normalized, config.startingStack, escrowTxForInsert],
      );
      const entryId = entryRow.rows[0].id;

      // Late registration: seat the entrant at the chosen live table now (same
      // transaction as the buy-in debit + entry, so it's atomic). startHand reads
      // poker_seats fresh each hand, so they're dealt in on the next hand.
      if (isLateReg && lateRegTableId) {
        const posRows = await client.query(
          `SELECT position FROM poker_seats WHERE table_id = $1`,
          [lateRegTableId],
        );
        const used = new Set<number>(posRows.rows.map((r: { position: number }) => Number(r.position)));
        let seatPosition = 0;
        while (used.has(seatPosition)) seatPosition++;
        await client.query(
          `INSERT INTO poker_seats (table_id, position, player_address, stack, status)
           VALUES ($1, $2, $3, $4::NUMERIC, 'active')`,
          [lateRegTableId, seatPosition, normalized, String(config.startingStack)],
        );
        await client.query(
          `INSERT INTO poker_tournament_seats (tournament_id, entry_id, table_id, player_address)
           VALUES ($1, $2, $3, $4) ON CONFLICT (tournament_id, player_address) DO NOTHING`,
          [tournamentId, entryId, lateRegTableId, normalized],
        );
      }

      const newRegistered = registered + 1;
      // Fill-based Sit & Go: when the final seat is taken, lock in a 60-second
      // countdown instead of dealing instantly. That gives walked-away players
      // time to return and fires the Telegram "starting soon" pings. Activation
      // itself then runs via the scheduler's poker_start event — identical to a
      // time-based tournament. Classic time-based tournaments always already
      // have a scheduled_start_at, so this branch never fires for them.
      const startMode = config.startMode === 'fill' ? 'fill' : 'time';
      const hasScheduledStart = tournament.scheduled_start_at != null;
      const shouldStartFillCountdown =
        startMode === 'fill' && !hasScheduledStart && newRegistered >= config.maxPlayers;

      if (shouldStartFillCountdown) {
        // The `scheduled_start_at IS NULL` guard makes this idempotent — only
        // the first seat-filling join wins the countdown.
        await client.query(
          `UPDATE tournaments
             SET scheduled_start_at = NOW() + INTERVAL '60 seconds'
           WHERE id = $1 AND scheduled_start_at IS NULL`,
          [tournamentId],
        );
        await client.query(
          `INSERT INTO tournament_scheduled_events (tournament_id, event_type, scheduled_at, status)
           VALUES ($1, 'poker_start', NOW() + INTERVAL '60 seconds', 'pending')`,
          [tournamentId],
        );
      }

      await client.query('COMMIT');

      logger.info('Player joined poker tournament', {
        tournamentId,
        playerAddress: normalized,
        entryId,
        registered: newRegistered,
        startMode,
        fillCountdownStarted: shouldStartFillCountdown,
      });

      committedEntryId = entryId;
      // Fill countdown activates later via the scheduler, never inline here.
      committedShouldAutoStart = false;
      committedFillCountdown = shouldStartFillCountdown;
      committedLateRegTableId = isLateReg ? lateRegTableId : null;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore — e.g. connection already closed or not in a transaction */
      }
      const refund = refundEscrowAfterRollback;
      if (refund) {
        try {
          const v = await verifyEscrowAddToPrizePoolJoinTx({
            tournamentIdUuid: refund.tournamentId,
            txHash: refund.txHash as `0x${string}`,
            playerAddress: refund.player,
            prizeTokenAddress: refund.prizeToken,
            buyInAmountWei: refund.buyIn,
          });
          if (v.ok) {
            const pay = await sendEscrowPayout(refund.tournamentId, refund.player, refund.buyIn);
            if (!pay.success) {
              logger.error('Escrow buy-in refund after failed join failed', {
                tournamentId: refund.tournamentId,
                player: refund.player,
                error: pay.error,
              });
            }
          }
        } catch (refundErr) {
          logger.error('Escrow buy-in refund path threw', { refundErr, tournamentId: refund.tournamentId });
        }
      }
      throw err;
    } finally {
      client.release();
    }

    // The Rail: a seat-filling join flips the card to "full"; any other join
    // posts a "took a seat" line. Best-effort, fire-and-forget.
    if (committedEntryId) {
      if (committedFillCountdown) {
        void railTournamentFilled(this.pool, tournamentId);
      } else {
        void railPlayerJoined(this.pool, tournamentId, normalized);
      }
    }

    // Late registration: the player is already seated at a live table — return it
    // so the client lands them straight on the table (autoStarted = true).
    if (committedLateRegTableId && committedEntryId) {
      // Active tables pick the new seat up on their next hand (startHand reads
      // poker_seats fresh). Only nudge a *truly idle* table (status 'waiting', no
      // hand in flight) so the entrant is dealt in promptly without racing the
      // scheduled next-hand on a table that is mid-rotation.
      try {
        const idle = await this.pool.query(
          `SELECT 1 FROM poker_tables pt
            WHERE pt.id = $1 AND pt.status = 'waiting'
              AND NOT EXISTS (SELECT 1 FROM poker_hands ph WHERE ph.table_id = pt.id AND ph.completed_at IS NULL)
            LIMIT 1`,
          [committedLateRegTableId],
        );
        if (idle.rows.length > 0) {
          await this.pokerGameService.startHand(committedLateRegTableId);
        }
      } catch (err) {
        logger.warn('Late-reg idle-table nudge failed', {
          tournamentId,
          tableId: committedLateRegTableId,
          err,
        });
      }
      return { entryId: committedEntryId, autoStarted: true, tableId: committedLateRegTableId };
    }

    // Release pool slot before activation: `activateTournament` runs many queries and must not overlap
    // a held-but-idle transaction client (was exhausting the pool under lobby burst traffic).
    if (committedShouldAutoStart && committedEntryId) {
      const tableId = await this.activateTournament(tournamentId);
      return { entryId: committedEntryId, autoStarted: true, tableId };
    }
    if (committedEntryId) {
      return { entryId: committedEntryId, autoStarted: false, tableId: null };
    }

    throw new Error('joinPokerTournament: missing committed entry (internal error)');
  }

  /**
   * Registration-phase exit — "unregister". Returns the player's buy-in and
   * removes their entry. Works for every buy-in type:
   *  - custom-token escrow : on-chain refund pushed from the escrow contract
   *  - MORBIUS chip buy-in : chips credited straight back to the player
   *  - freeroll (zero buy-in): entry simply removed, nothing to refund
   *
   * Allowed only while the tournament is still in `registration`, and blocked
   * once a Sit & Go has filled and locked into its starting countdown.
   */
  async leavePokerTournamentRegistration(tournamentId: string, playerAddress: string): Promise<void> {
    const normalized = this.normalizeAddress(playerAddress);

    const tRow = await this.pool.query(
      `SELECT id, status, buy_in_amount, prize_token_address, poker_config, scheduled_start_at
       FROM tournaments WHERE id = $1 AND game_type = 'poker'`,
      [tournamentId],
    );
    if (tRow.rows.length === 0) throw new Error('Poker tournament not found');
    const t = tRow.rows[0];
    if (String(t.status ?? '') !== 'registration') {
      throw new Error('You can only unregister while the tournament is still in registration');
    }

    const config = this.parsePokerConfig(t.poker_config);
    // A Sit & Go that has filled has scheduled_start_at set and is counting down
    // to deal — seats are locked at that point, so no more unregistering.
    if (config.startMode === 'fill' && t.scheduled_start_at != null) {
      throw new Error('This Sit & Go is full and starting — you can no longer unregister');
    }

    const buyIn = this.parseBigInt(t.buy_in_amount);
    const prizeTok = t.prize_token_address ? String(t.prize_token_address).trim() : '';
    const isEscrowBuyIn = buyIn > 0n && prizeTok.startsWith('0x');

    const entryRow = await this.pool.query(
      `SELECT id FROM tournament_entries
       WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)
         AND status NOT IN ('busted', 'completed')`,
      [tournamentId, normalized],
    );
    if (entryRow.rows.length === 0) throw new Error('You are not registered for this tournament');

    if (isEscrowBuyIn) {
      // Custom-token buy-in — push the refund back from the on-chain escrow
      // first, then remove the entry. The payout can't be undone, so it must
      // precede the DB write.
      const pay = await sendEscrowPayout(tournamentId, normalized, buyIn);
      if (!pay.success) {
        throw new Error(pay.error || 'On-chain refund failed; try again or contact support');
      }
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE tournament_entries SET status = 'busted', finished_at = NOW() WHERE id = $1`,
          [entryRow.rows[0].id],
        );
        await client.query(
          `UPDATE tournaments SET prize_pool = GREATEST(prize_pool - $1::NUMERIC, 0) WHERE id = $2`,
          [buyIn.toString(), tournamentId],
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    } else {
      // MORBIUS-chip buy-in or freeroll — handled entirely in one DB transaction.
      // The tournament row is locked FOR UPDATE so this serializes against a
      // concurrent join that may be filling the table at the same instant.
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const lockRow = await client.query(
          `SELECT status, scheduled_start_at FROM tournaments WHERE id = $1 FOR UPDATE`,
          [tournamentId],
        );
        if (lockRow.rows.length === 0) throw new Error('Poker tournament not found');
        if (String(lockRow.rows[0].status ?? '') !== 'registration') {
          throw new Error('You can only unregister while the tournament is still in registration');
        }
        if (config.startMode === 'fill' && lockRow.rows[0].scheduled_start_at != null) {
          throw new Error('This Sit & Go is full and starting — you can no longer unregister');
        }
        // Re-find the entry under the lock — it could have changed since the
        // pre-check above.
        const liveEntry = await client.query(
          `SELECT id FROM tournament_entries
           WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)
             AND status NOT IN ('busted', 'completed')`,
          [tournamentId, normalized],
        );
        if (liveEntry.rows.length === 0) {
          throw new Error('You are not registered for this tournament');
        }
        await client.query(
          `UPDATE tournament_entries SET status = 'busted', finished_at = NOW() WHERE id = $1`,
          [liveEntry.rows[0].id],
        );
        if (buyIn > 0n) {
          // Chip buy-in — credit the chips straight back and unwind the pool.
          await applyPokerChipDelta(
            client,
            normalized,
            buyIn,
            'tournament_refund',
            { type: 'tournament', id: tournamentId },
          );
          await client.query(
            `UPDATE tournaments SET prize_pool = GREATEST(prize_pool - $1::NUMERIC, 0) WHERE id = $2`,
            [buyIn.toString(), tournamentId],
          );
        }
        // Freeroll (buyIn === 0): nothing to refund — removing the entry is all.
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    }

    logger.info('Player unregistered from poker tournament', {
      tournamentId,
      playerAddress: normalized,
      buyInType: isEscrowBuyIn ? 'escrow' : buyIn > 0n ? 'chips' : 'freeroll',
    });

    this.broadcast(`poker_tournament:${tournamentId}`, 'poker_tournament_registration_left', {
      tournamentId,
      playerAddress: normalized,
    });

    // The Rail: refresh the card + post a "left" line (best-effort).
    void railPlayerLeft(this.pool, tournamentId, normalized);
  }

  // ---------------------------------------------------------------------------
  // Scheduled start (min players, refunds)
  // ---------------------------------------------------------------------------

  /**
   * Called by FreerollSchedulerService when scheduled_start_at elapses.
   * Cancels + refunds if below minPlayers; otherwise activates (status must become active for sync + payouts).
   */
  async startScheduledPokerTournament(tournamentId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tRow = await client.query(
        `SELECT * FROM tournaments WHERE id = $1 AND game_type = 'poker' FOR UPDATE`,
        [tournamentId]
      );
      if (tRow.rows.length === 0) {
        await client.query('ROLLBACK');
        return;
      }
      const tournament = tRow.rows[0];
      if (tournament.status !== 'registration') {
        await client.query('COMMIT');
        return;
      }

      const config = this.parsePokerConfig(tournament.poker_config);
      const countRow = await client.query(
        `SELECT COUNT(*) AS c FROM tournament_entries
         WHERE tournament_id = $1 AND status NOT IN ('busted','completed')`,
        [tournamentId]
      );
      const registered = Number(countRow.rows[0].c);

      if (registered < config.minPlayers) {
        const buyIn = this.parseBigInt(tournament.buy_in_amount);
        const isCustomToken = !!tournament.prize_token_address;
        const isEscrowBuyIn = buyIn > 0n && isCustomToken;
        const entries = await client.query(
          `SELECT id, player_address FROM tournament_entries
           WHERE tournament_id = $1 AND status = 'playing'`,
          [tournamentId]
        );
        for (const entry of entries.rows) {
          if (buyIn > 0n && !isEscrowBuyIn) {
            await applyPokerChipDelta(
              client,
              entry.player_address,
              buyIn,
              'tournament_refund',
              { type: 'tournament', id: tournamentId },
            );
          }
          await client.query(
            `UPDATE tournament_entries SET status = 'busted', finished_at = NOW() WHERE id = $1`,
            [entry.id]
          );
        }
        // Chip-pool refund — skipped for custom_token (on-chain reclaim handled below).
        if (buyIn === 0n && !isCustomToken) {
          const poolRefund = this.parseBigInt(tournament.prize_pool);
          const refundTo = this.guaranteedPrizePoolRefundRecipient(tournament);
          if (poolRefund > 0n && refundTo) {
            await applyPokerChipDelta(
              client,
              refundTo,
              poolRefund,
              'tournament_refund',
              { type: 'tournament', id: tournamentId },
            );
          }
        }
        if (isCustomToken) {
          await client.query(
            `UPDATE tournaments SET status = 'cancelled', ended_at = NOW() WHERE id = $1`,
            [tournamentId]
          );
        } else {
          await client.query(
            `UPDATE tournaments SET status = 'cancelled', ended_at = NOW(), prize_pool = 0 WHERE id = $1`,
            [tournamentId]
          );
        }
        await client.query('COMMIT');
        // The Rail: cancellation notice + refund DMs (best-effort, fire-and-forget).
        void railTournamentCancelled(this.pool, tournamentId);
        // Custom-token buy-in: push refunds before marking escrow cancelled.
        if (isEscrowBuyIn && entries.rows.length > 0) {
          try {
            const recipients = entries.rows.map((e: { player_address: string }) => ({
              address: String(e.player_address),
              amount: buyIn,
            }));
            const pay = await sendEscrowPayoutMultiple(tournamentId, recipients);
            if (!pay.success) {
              logger.error('Escrow buy-in refund batch failed (scheduled insufficient players)', {
                tournamentId,
                error: pay.error,
              });
            }
          } catch (refundErr) {
            logger.error('Escrow buy-in refund threw (scheduled insufficient players)', {
              tournamentId,
              refundErr,
            });
          }
        }
        if (isCustomToken) {
          try {
            const result = await cancelTournamentInEscrow(tournamentId);
            if (!result.success) {
              logger.error('Custom-token freeroll auto-cancel: on-chain cancel failed; admin must retry', {
                tournamentId,
                error: result.error,
              });
            }
          } catch (err) {
            logger.error('Custom-token freeroll auto-cancel: on-chain cancel threw', { tournamentId, err });
          }
        }
        logger.info('Scheduled poker tournament cancelled (insufficient players)', {
          tournamentId,
          registered,
          minPlayers: config.minPlayers,
          isCustomToken,
        });
        this.broadcast(`poker_tournament:${tournamentId}`, 'poker_tournament_cancelled', {
          tournamentId,
          reason: 'insufficient_players',
        });
        return;
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await this.activateTournament(tournamentId);
  }

  // ---------------------------------------------------------------------------
  // In-process bot fill
  // ---------------------------------------------------------------------------

  /**
   * Periodic tick called by the WS service every few seconds. Finds freeroll
   * tournaments still in `registration` that need more players to start, and
   * registers in-house bot wallets (from `POKER_BOT_ADDRESSES`) directly via
   * `joinPokerTournament` — no WebSocket, no signed auth, no external CLI.
   *
   * Why in-process: bot scripts running as external clients have to go
   * through the same EIP-712 auth path as real users. The C1 production
   * guard (`REQUIRE_WS_AUTH=true`) closes the impersonation hole for real
   * users but bots have no private key to sign with — they would need a
   * permanent bypass token/allowlist. Calling the service directly from
   * inside the server process sidesteps that entire control surface.
   *
   * Behavior gates:
   *   - Disabled unless `POKER_BOT_FILL_ENABLED=true`. Default off so this
   *     never surprises someone running staging/prod without bots.
   *   - Only fills tournaments with `buy_in_amount = 0` (freerolls). Bots
   *     have no MORBIUS balance — joining a paid tournament would burn the
   *     wallet pool.
   *   - Optional pre-fill delay via `POKER_BOT_FILL_DELAY_SECONDS` (default 0).
   *     Set this if you want to give real players a window to join before bots
   *     show up. Default 0 so a created tournament fills on the next tick.
   *   - Adds up to `minPlayers - currentCount` bots per tick (or fewer if
   *     the wallet pool is exhausted).
   */
  async tickFillTournamentsWithBots(): Promise<void> {
    const flag = String(process.env.POKER_BOT_FILL_ENABLED ?? '').toLowerCase();
    if (flag !== 'true' && flag !== '1' && flag !== 'yes') return;

    const botSet = getServerPokerBotAddressSet();
    if (botSet.size === 0) return;

    const rawDelay = process.env.POKER_BOT_FILL_DELAY_SECONDS;
    let delaySeconds = 0;
    if (rawDelay) {
      const n = Number(rawDelay);
      if (Number.isFinite(n) && n >= 0 && n <= 3600) delaySeconds = Math.floor(n);
    }

    // Candidate: freerolls still registering, not past their scheduled start
    // time (the scheduler handles those). When `delaySeconds > 0`, also require
    // the tournament to have been open at least that long.
    const candidates = await this.pool.query<{
      id: string;
      poker_config: unknown;
    }>(
      `SELECT t.id, t.poker_config
         FROM tournaments t
        WHERE t.game_type = 'poker'
          AND t.status = 'registration'
          AND COALESCE(t.buy_in_amount, 0) = 0
          AND ($1 = 0 OR t.created_at < NOW() - ($1 * INTERVAL '1 second'))
          AND (t.scheduled_start_at IS NULL OR t.scheduled_start_at > NOW())
        ORDER BY t.created_at ASC
        LIMIT 25`,
      [delaySeconds],
    );

    if (candidates.rows.length === 0) return;

    for (const row of candidates.rows) {
      const tournamentId = row.id;
      try {
        const config = this.parsePokerConfig(row.poker_config);
        // Count current registered + identify which bots aren't already in.
        const reg = await this.pool.query<{ player_address: string }>(
          `SELECT player_address FROM tournament_entries
            WHERE tournament_id = $1 AND status NOT IN ('busted', 'completed')`,
          [tournamentId],
        );
        const registeredAddrs = new Set(
          reg.rows.map((r) => (r.player_address ?? '').toLowerCase()),
        );
        const currentCount = registeredAddrs.size;
        if (currentCount >= config.minPlayers) continue;

        const need = config.minPlayers - currentCount;
        const availableBots = [...botSet].filter((addr) => !registeredAddrs.has(addr));
        const toJoin = availableBots.slice(0, need);
        if (toJoin.length === 0) continue;

        for (const botAddr of toJoin) {
          try {
            await this.joinPokerTournament(tournamentId, botAddr);
          } catch (err) {
            logger.warn('Bot tournament join failed', {
              tournamentId,
              botAddr,
              err: err instanceof Error ? err.message : err,
            });
          }
        }
        logger.info('Filled poker tournament with bots', {
          tournamentId,
          minPlayers: config.minPlayers,
          beforeCount: currentCount,
          attempted: toJoin.length,
        });
      } catch (err) {
        logger.error('tickFillTournamentsWithBots: candidate error', {
          tournamentId,
          err: err instanceof Error ? err.message : err,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Activate
  // ---------------------------------------------------------------------------

  /**
   * Transition tournament from registration → active.
   * Creates a dedicated poker table (tournament_mode=TRUE), seats all players,
   * starts the first hand.
   */
  /**
   * Activate a registered poker tournament: flip status, spin up tables, seat players,
   * deal the first hand. Returns the **first** tableId (for legacy SNG / single-table
   * callers); MTT callers should use `getTournamentState` to enumerate all tables or
   * `getPlayerTableId` for the requesting player's assignment.
   *
   * MTT: when `config.seatsPerTable < playerCount`, players are shuffled randomly and
   * distributed across `ceil(playerCount / seatsPerTable)` tables. All tables share the
   * same `current_blind_level_started_at` instant so the by-time scheduler advances
   * blinds in lock-step. The `poker_tournament_started` broadcast includes
   * `tableAssignments` so each client can navigate to its own table URL.
   */
  async activateTournament(tournamentId: string): Promise<string> {
    const existing = await this.pool.query(
      `SELECT id FROM poker_tables WHERE tournament_id = $1 ORDER BY table_seq NULLS LAST, created_at LIMIT 1`,
      [tournamentId]
    );
    if (existing.rows.length > 0) {
      return existing.rows[0].id as string;
    }

    const tRow = await this.pool.query(
      `SELECT t.*, t.poker_config FROM tournaments t WHERE t.id = $1 AND t.game_type = 'poker'`,
      [tournamentId]
    );
    if (tRow.rows.length === 0) throw new Error('Tournament not found');
    const tournament = tRow.rows[0];
    if (tournament.status === 'cancelled' || tournament.status === 'completed') {
      throw new Error(`Cannot activate tournament in status: ${tournament.status}`);
    }

    const config = this.parsePokerConfig(tournament.poker_config);

    const entries = await this.pool.query(
      `SELECT id, player_address FROM tournament_entries
       WHERE tournament_id = $1 AND status = 'playing'
       ORDER BY bought_in_at ASC`,
      [tournamentId]
    );
    if (entries.rows.length === 0) {
      throw new Error('Cannot activate poker tournament with no players');
    }

    await this.pool.query(
      `UPDATE tournaments
       SET status = 'active', activated_at = COALESCE(activated_at, NOW())
       WHERE id = $1 AND status IN ('registration', 'active')`,
      [tournamentId]
    );

    const firstLevel = this.computeBlindLevel(config.blindSchedule, 1);

    const sbChips = BigInt(firstLevel.smallBlind).toString();
    const bbChips = BigInt(firstLevel.bigBlind).toString();
    const startingStackChips = BigInt(config.startingStack).toString();

    // MTT table layout. seatsPerTable applies only when player count exceeds it; otherwise
    // we fall back to the legacy single-table SNG path so existing tournaments are untouched.
    const seatsPerTable = this.effectiveSeatsPerTable(config);
    const playerCount = entries.rows.length;
    const tableCount = Math.max(1, Math.ceil(playerCount / seatsPerTable));
    const isMTT = tableCount > 1;

    // Shuffle entries before round-robin so seat order isn't bought_in_at ordering.
    const seating = this.shuffleInPlace(entries.rows.slice());

    const isByTime = this.getBlindIncreaseMode(config) === 'by_time';
    const sharedLevelStartedAt = isByTime ? new Date() : null;

    type CreatedTable = {
      id: string;
      seq: number | null;
      assignedAddresses: string[];
      assignedEntryIds: string[];
    };
    const created: CreatedTable[] = [];

    for (let t = 0; t < tableCount; t++) {
      const seq = isMTT ? t + 1 : null;
      const insertRes = await this.pool.query(
        `INSERT INTO poker_tables (
           small_blind, big_blind, max_seats, status, tournament_id, tournament_mode,
           current_blind_level, current_blind_level_started_at, table_seq, is_final_table
         )
         VALUES ($1::NUMERIC, $2::NUMERIC, $3, 'waiting', $4, TRUE, $5, $6, $7, FALSE)
         RETURNING id`,
        [
          sbChips,
          bbChips,
          seatsPerTable,
          tournamentId,
          isByTime ? firstLevel.level : null,
          sharedLevelStartedAt,
          seq,
        ]
      );
      created.push({
        id: insertRes.rows[0].id as string,
        seq,
        assignedAddresses: [],
        assignedEntryIds: [],
      });
    }

    // Round-robin (snake) deal: pick from shuffled `seating` into tables to balance counts.
    // For 18 players × 3 tables → 6/6/6. For 17 × 3 → 6/6/5.
    for (let i = 0; i < seating.length; i++) {
      const tableIdx = i % tableCount;
      const entry = seating[i];
      created[tableIdx].assignedAddresses.push(entry.player_address);
      created[tableIdx].assignedEntryIds.push(entry.id);
    }

    for (const table of created) {
      for (let i = 0; i < table.assignedAddresses.length; i++) {
        const addr = table.assignedAddresses[i];
        const entryId = table.assignedEntryIds[i];
        await this.pokerGameService.joinTableTournament(table.id, addr, startingStackChips);

        await this.pool.query(
          `INSERT INTO poker_tournament_seats (tournament_id, entry_id, table_id, player_address)
           VALUES ($1, $2, $3, $4) ON CONFLICT (tournament_id, player_address) DO NOTHING`,
          [tournamentId, entryId, table.id, addr.toLowerCase()]
        );
      }
    }

    // Start the first hand on each table. Tables with < 2 stacked seats no-op (startHand returns null).
    for (const table of created) {
      try {
        await this.pokerGameService.startHand(table.id);
      } catch (err) {
        logger.warn('MTT activate: startHand failed for table', { tournamentId, tableId: table.id, err });
      }
    }

    // Map for the broadcast: each client filters for its own assignment to navigate to /poker/{tableId}.
    const tableAssignments: Record<string, string> = {};
    for (const table of created) {
      for (const addr of table.assignedAddresses) {
        tableAssignments[addr.toLowerCase()] = table.id;
      }
    }

    const firstTableId = created[0].id;

    logger.info('Poker tournament activated', {
      tournamentId,
      tableId: firstTableId,
      tableCount,
      seatsPerTable,
      players: playerCount,
      mtt: isMTT,
    });

    this.broadcast(`poker_tournament:${tournamentId}`, 'poker_tournament_started', {
      tournamentId,
      tableId: firstTableId,
      blindLevel: firstLevel.level,
      smallBlind: firstLevel.smallBlind,
      bigBlind: firstLevel.bigBlind,
      playerCount,
      // MTT-specific. Legacy single-table clients ignore these.
      tableCount,
      tableAssignments,
    });

    // The Rail: flip the card to "live" (best-effort, fire-and-forget).
    void railTournamentStarted(this.pool, tournamentId, firstTableId);

    return firstTableId;
  }

  // ---------------------------------------------------------------------------
  // syncAfterHand — called by postHandCallback from poker-game.service.ts
  // ---------------------------------------------------------------------------

  /**
   * After each hand completes:
   * 1. Sync seat stacks → tournament_entries.chips_remaining
   * 2. Eliminate 0-chip players (mark busted, remove seat)
   * 3. Blind updates (see `blindIncreaseMode` in `poker_config`):
   *    - `knockout`: multiply SB/BB by 2^k when k players bust this hand
   *    - `by_hand`: set SB/BB from the blind schedule for the **next** hand (uses `handsPerLevel`)
   * 4. Complete tournament if ≤1 active player remains
   */
  async syncAfterHand(tableId: string, handNumber: number): Promise<void> {
    // Get tournament for this table
    const tableRow = await this.pool.query(
      `SELECT tournament_id, small_blind, big_blind FROM poker_tables WHERE id = $1 AND tournament_mode = TRUE`,
      [tableId]
    );
    if (tableRow.rows.length === 0 || !tableRow.rows[0].tournament_id) return;

    const tournamentId = tableRow.rows[0].tournament_id as string;

    const tRow = await this.pool.query(
      `SELECT poker_config, status FROM tournaments WHERE id = $1`,
      [tournamentId]
    );
    if (tRow.rows.length === 0 || tRow.rows[0].status !== 'active') return;

    const config = this.parsePokerConfig(tRow.rows[0].poker_config);

    // Read current seat stacks
    const seats = await this.pool.query(
      `SELECT ps.player_address, ps.stack
       FROM poker_seats ps
       WHERE ps.table_id = $1`,
      [tableId]
    );

    const bustedAddresses: string[] = [];
    for (const seat of seats.rows) {
      const stackChips = Number(toBigIntSafe(seat.stack ?? 0));
      const addr = seat.player_address as string;

      await this.pool.query(
        `UPDATE tournament_entries
         SET chips_remaining = $1,
             highest_chip_count = GREATEST(highest_chip_count, $1),
             hands_played = hands_played + 1
         WHERE tournament_id = $2 AND LOWER(player_address) = LOWER($3) AND status = 'playing'`,
        [stackChips, tournamentId, addr]
      );

      if (stackChips === 0) bustedAddresses.push(addr);
    }

    await this.eliminateBustedTournamentSeats(
      tableId,
      tournamentId,
      bustedAddresses,
      handNumber,
      seats.rows.length,
    );

    // DM busted players (best-effort, fire-and-forget).
    if (bustedAddresses.length > 0) {
      void dmPlayersBusted(this.pool, tournamentId, bustedAddresses);
    }

    let blindsUpdated = false;
    const blindMode = this.getBlindIncreaseMode(config);
    const elimCount = bustedAddresses.length;

    if (blindMode === 'knockout' && elimCount > 0) {
      const tblBlinds = await this.pool.query(
        `SELECT small_blind, big_blind FROM poker_tables WHERE id = $1`,
        [tableId]
      );
      if (tblBlinds.rows.length > 0) {
        const sbWei = toBigIntSafe(tblBlinds.rows[0].small_blind);
        const bbWei = toBigIntSafe(tblBlinds.rows[0].big_blind);
        if (sbWei > 0n && bbWei > 0n) {
          const mult = 1n << BigInt(elimCount);
          const doubledSB = (sbWei * mult).toString();
          const doubledBB = (bbWei * mult).toString();
          await this.pool.query(
            `UPDATE poker_tables SET small_blind = $2::NUMERIC, big_blind = $3::NUMERIC WHERE id = $1`,
            [tableId, doubledSB, doubledBB]
          );
          blindsUpdated = true;
          logger.info('Poker tournament blinds multiplied after elimination(s)', {
            tournamentId,
            tableId,
            handNumber,
            eliminations: elimCount,
            multiplier: mult.toString(),
          });
        }
      }
    } else if (blindMode === 'by_hand') {
      const scheduledLevel = this.blindsForNextHand(config.blindSchedule, handNumber);
      const tblBlinds = await this.pool.query(
        `SELECT small_blind, big_blind FROM poker_tables WHERE id = $1`,
        [tableId]
      );
      if (tblBlinds.rows.length > 0) {
        const curSB = Number(toBigIntSafe(tblBlinds.rows[0].small_blind));
        const curBB = Number(toBigIntSafe(tblBlinds.rows[0].big_blind));
        if (
          curSB !== scheduledLevel.smallBlind ||
          curBB !== scheduledLevel.bigBlind
        ) {
          await this.pool.query(
            `UPDATE poker_tables SET small_blind = $2::NUMERIC, big_blind = $3::NUMERIC WHERE id = $1`,
            [
              tableId,
              BigInt(scheduledLevel.smallBlind).toString(),
              BigInt(scheduledLevel.bigBlind).toString(),
            ]
          );
          blindsUpdated = true;
          logger.info('Poker tournament blinds advanced by schedule (by_hand)', {
            tournamentId,
            tableId,
            completedHand: handNumber,
            nextLevel: scheduledLevel.level,
            smallBlind: scheduledLevel.smallBlind,
            bigBlind: scheduledLevel.bigBlind,
          });
        }
      }
    }

    if (blindsUpdated) {
      const finalRow = await this.pool.query(
        `SELECT small_blind, big_blind FROM poker_tables WHERE id = $1`,
        [tableId]
      );
      if (finalRow.rows.length > 0) {
        const smallBlindChips = Number(toBigIntSafe(finalRow.rows[0].small_blind));
        const bigBlindChips = Number(toBigIntSafe(finalRow.rows[0].big_blind));
        const displayLevel =
          blindMode === 'by_hand'
            ? this.scheduleDisplayLevel(config.blindSchedule, smallBlindChips, bigBlindChips)
            : this.knockoutBlindDisplayLevel(config.blindSchedule, smallBlindChips);
        this.broadcast(`poker_tournament:${tournamentId}`, 'poker_tournament_blind_level_up', {
          tournamentId,
          tableId,
          newLevel: displayLevel,
          smallBlind: smallBlindChips,
          bigBlind: bigBlindChips,
          handNumber,
        });
      }
    }

    // Check if tournament is over (≤1 active player)
    const activePlayers = await this.pool.query(
      `SELECT COUNT(*) AS c FROM tournament_entries WHERE tournament_id = $1 AND status = 'playing'`,
      [tournamentId]
    );
    const activeCount = Number(activePlayers.rows[0].c);

    if (activeCount <= 1) {
      await this.completeTournament(tournamentId, tableId);
      return;
    }

    // MTT: after eliminations + blind adjust, fold short tables into the final table when the
    // total seated count drops to the final-table threshold. No-op for single-table SNG.
    try {
      await this.maybeConsolidateTables(tournamentId, config, tableId);
    } catch (err) {
      logger.error('MTT maybeConsolidateTables failed (continuing)', { tournamentId, tableId, err });
    }
  }

  /**
   * Bust a player from an active poker SNG (same DB path as chip bust: ranks, seat removal, WS event, blinds, may complete).
   * Turn timers no longer invoke this; kept for tests / parity with chip elimination.
   */
  async eliminatePlayerForConsecutiveTimeouts(tableId: string, playerAddress: string): Promise<void> {
    const normalized = this.normalizeAddress(playerAddress);

    const tableRow = await this.pool.query(
      `SELECT tournament_id, hand_number FROM poker_tables WHERE id = $1 AND tournament_mode = TRUE`,
      [tableId]
    );
    if (tableRow.rows.length === 0 || !tableRow.rows[0].tournament_id) {
      logger.warn('eliminatePlayerForConsecutiveTimeouts: not a tournament table', { tableId });
      return;
    }

    const tournamentId = tableRow.rows[0].tournament_id as string;
    const handNumber = Number(tableRow.rows[0].hand_number ?? 0);

    const tRow = await this.pool.query(
      `SELECT poker_config, status FROM tournaments WHERE id = $1`,
      [tournamentId]
    );
    if (tRow.rows.length === 0 || tRow.rows[0].status !== 'active') return;

    const config = this.parsePokerConfig(tRow.rows[0].poker_config);

    const seatCountRes = await this.pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM poker_seats WHERE table_id = $1`,
      [tableId]
    );
    const seatCount = Number(seatCountRes.rows[0]?.c ?? 0);
    if (seatCount <= 0) return;

    await this.eliminateBustedTournamentSeats(
      tableId,
      tournamentId,
      [normalized],
      handNumber,
      seatCount,
    );

    const blindMode = this.getBlindIncreaseMode(config);
    const elimCount = 1;

    if (blindMode === 'knockout') {
      const tblBlinds = await this.pool.query(
        `SELECT small_blind, big_blind FROM poker_tables WHERE id = $1`,
        [tableId]
      );
      if (tblBlinds.rows.length > 0) {
        const sbWei = toBigIntSafe(tblBlinds.rows[0].small_blind);
        const bbWei = toBigIntSafe(tblBlinds.rows[0].big_blind);
        if (sbWei > 0n && bbWei > 0n) {
          const mult = 1n << BigInt(elimCount);
          const doubledSB = (sbWei * mult).toString();
          const doubledBB = (bbWei * mult).toString();
          await this.pool.query(
            `UPDATE poker_tables SET small_blind = $2::NUMERIC, big_blind = $3::NUMERIC WHERE id = $1`,
            [tableId, doubledSB, doubledBB]
          );
          logger.info('Poker tournament blinds multiplied after timeout elimination', {
            tournamentId,
            tableId,
            handNumber,
            eliminations: elimCount,
            multiplier: mult.toString(),
          });

          const finalRow = await this.pool.query(
            `SELECT small_blind, big_blind FROM poker_tables WHERE id = $1`,
            [tableId]
          );
          if (finalRow.rows.length > 0) {
            const smallBlindChips = Number(toBigIntSafe(finalRow.rows[0].small_blind));
            const bigBlindChips = Number(toBigIntSafe(finalRow.rows[0].big_blind));
            const displayLevel = this.knockoutBlindDisplayLevel(config.blindSchedule, smallBlindChips);
            this.broadcast(`poker_tournament:${tournamentId}`, 'poker_tournament_blind_level_up', {
              tournamentId,
              tableId,
              newLevel: displayLevel,
              smallBlind: smallBlindChips,
              bigBlind: bigBlindChips,
              handNumber,
            });
          }
        }
      }
    }

    const activePlayers = await this.pool.query(
      `SELECT COUNT(*) AS c FROM tournament_entries WHERE tournament_id = $1 AND status = 'playing'`,
      [tournamentId]
    );
    const activeCount = Number(activePlayers.rows[0].c);

    if (activeCount <= 1) {
      await this.completeTournament(tournamentId, tableId);
    }
  }

  /**
   * Player-initiated forfeit: voluntarily eliminates the caller from an active poker tournament.
   * Same DB path as a chip bust (rank assigned, seat removed, WS event broadcast, knockout blind
   * multiplier applied, may complete the tournament). No refund — buy-in stays in the prize pool.
   *
   * No-ops cleanly when the player isn't seated or the tournament isn't active.
   */
  async forfeitPokerTournament(tournamentId: string, playerAddress: string): Promise<void> {
    const normalized = this.normalizeAddress(playerAddress);

    const tRow = await this.pool.query(
      `SELECT poker_config, status FROM tournaments WHERE id = $1`,
      [tournamentId]
    );
    if (tRow.rows.length === 0) {
      throw new Error('Tournament not found');
    }
    if (tRow.rows[0].status !== 'active') {
      throw new Error('Forfeit only valid for active tournaments');
    }

    const seatRow = await this.pool.query(
      `SELECT pts.table_id
         FROM poker_tournament_seats pts
         JOIN tournament_entries te ON te.id = pts.entry_id
        WHERE pts.tournament_id = $1
          AND LOWER(pts.player_address) = $2
          AND te.status = 'playing'
          AND pts.eliminated_at IS NULL
        LIMIT 1`,
      [tournamentId, normalized]
    );
    if (seatRow.rows.length === 0) {
      throw new Error('You are not seated in this tournament');
    }
    const tableId = seatRow.rows[0].table_id as string;

    const tableInfo = await this.pool.query(
      `SELECT hand_number FROM poker_tables WHERE id = $1 AND tournament_mode = TRUE`,
      [tableId]
    );
    if (tableInfo.rows.length === 0) {
      throw new Error('Tournament table not found');
    }
    const handNumber = Number(tableInfo.rows[0].hand_number ?? 0);

    const config = this.parsePokerConfig(tRow.rows[0].poker_config);

    const seatCountRes = await this.pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM poker_seats WHERE table_id = $1`,
      [tableId]
    );
    const seatCount = Number(seatCountRes.rows[0]?.c ?? 0);
    if (seatCount <= 0) return;

    await this.eliminateBustedTournamentSeats(
      tableId,
      tournamentId,
      [normalized],
      handNumber,
      seatCount,
    );

    const blindMode = this.getBlindIncreaseMode(config);
    if (blindMode === 'knockout') {
      const tblBlinds = await this.pool.query(
        `SELECT small_blind, big_blind FROM poker_tables WHERE id = $1`,
        [tableId]
      );
      if (tblBlinds.rows.length > 0) {
        const sbWei = toBigIntSafe(tblBlinds.rows[0].small_blind);
        const bbWei = toBigIntSafe(tblBlinds.rows[0].big_blind);
        if (sbWei > 0n && bbWei > 0n) {
          const doubledSB = (sbWei * 2n).toString();
          const doubledBB = (bbWei * 2n).toString();
          await this.pool.query(
            `UPDATE poker_tables SET small_blind = $2::NUMERIC, big_blind = $3::NUMERIC WHERE id = $1`,
            [tableId, doubledSB, doubledBB]
          );
          const finalRow = await this.pool.query(
            `SELECT small_blind, big_blind FROM poker_tables WHERE id = $1`,
            [tableId]
          );
          if (finalRow.rows.length > 0) {
            const smallBlindChips = Number(toBigIntSafe(finalRow.rows[0].small_blind));
            const bigBlindChips = Number(toBigIntSafe(finalRow.rows[0].big_blind));
            const displayLevel = this.knockoutBlindDisplayLevel(config.blindSchedule, smallBlindChips);
            this.broadcast(`poker_tournament:${tournamentId}`, 'poker_tournament_blind_level_up', {
              tournamentId,
              tableId,
              newLevel: displayLevel,
              smallBlind: smallBlindChips,
              bigBlind: bigBlindChips,
              handNumber,
            });
          }
        }
      }
    }

    const activePlayers = await this.pool.query(
      `SELECT COUNT(*) AS c FROM tournament_entries WHERE tournament_id = $1 AND status = 'playing'`,
      [tournamentId]
    );
    const activeCount = Number(activePlayers.rows[0].c);

    logger.info('Poker tournament player forfeited', { tournamentId, playerAddress: normalized, handNumber });

    if (activeCount <= 1) {
      await this.completeTournament(tournamentId, tableId);
    }
  }

  /**
   * `tryStartNextHand` refuses to deal when &lt; 2 seats have stack &gt; 0. If eliminations were not fully
   * applied (e.g. stack format mismatch), the table can stall with no winner. Re-sync entries from
   * seats, eliminate 0-chip players (no `hands_played` bump), then complete when ≤1 remain.
   */
  async recoverTournamentTableIfUnderTwoStackedSeats(tableId: string): Promise<void> {
    const tableRow = await this.pool.query(
      `SELECT tournament_id, hand_number FROM poker_tables WHERE id = $1 AND tournament_mode = TRUE`,
      [tableId]
    );
    if (tableRow.rows.length === 0 || !tableRow.rows[0].tournament_id) return;

    const tournamentId = tableRow.rows[0].tournament_id as string;
    const handNumber = Number(tableRow.rows[0].hand_number ?? 0);

    const tRow = await this.pool.query(
      `SELECT status, poker_config FROM tournaments WHERE id = $1`,
      [tournamentId]
    );
    if (tRow.rows.length === 0 || tRow.rows[0].status !== 'active') return;

    const config = this.parsePokerConfig(tRow.rows[0].poker_config);

    const seats = await this.pool.query(
      `SELECT ps.player_address, ps.stack FROM poker_seats ps WHERE ps.table_id = $1`,
      [tableId]
    );

    const stackedSeatCount = seats.rows.filter((s) => {
      return Number(toBigIntSafe(s.stack ?? 0)) > 0;
    }).length;
    if (stackedSeatCount >= 2) return;

    const bustedAddresses: string[] = [];
    for (const seat of seats.rows) {
      const stackChips = Number(toBigIntSafe(seat.stack ?? 0));
      const addr = seat.player_address as string;

      await this.pool.query(
        `UPDATE tournament_entries
         SET chips_remaining = $1,
             highest_chip_count = GREATEST(highest_chip_count, $1)
         WHERE tournament_id = $2 AND LOWER(player_address) = LOWER($3) AND status = 'playing'`,
        [stackChips, tournamentId, addr]
      );

      if (stackChips === 0) bustedAddresses.push(addr);
    }

    // `recoverTournamentTableIfUnderTwoStackedSeats` is invoked from inside
    // `tryStartNextHand`'s table-lock body. Pass `assumeLockHeld=true` so the
    // eliminations use the no-lock variant of leaveTableTournament — the
    // public variant re-acquires the same per-table lock and would deadlock.
    await this.eliminateBustedTournamentSeats(
      tableId,
      tournamentId,
      bustedAddresses,
      handNumber,
      seats.rows.length,
      true,
    );

    let blindsUpdated = false;
    const blindModeRecover = this.getBlindIncreaseMode(config);
    const elimCount = bustedAddresses.length;

    if (blindModeRecover === 'knockout' && elimCount > 0) {
      const tblBlinds = await this.pool.query(
        `SELECT small_blind, big_blind FROM poker_tables WHERE id = $1`,
        [tableId]
      );
      if (tblBlinds.rows.length > 0) {
        const sbWei = toBigIntSafe(tblBlinds.rows[0].small_blind);
        const bbWei = toBigIntSafe(tblBlinds.rows[0].big_blind);
        if (sbWei > 0n && bbWei > 0n) {
          const mult = 1n << BigInt(elimCount);
          await this.pool.query(
            `UPDATE poker_tables SET small_blind = $2::NUMERIC, big_blind = $3::NUMERIC WHERE id = $1`,
            [tableId, (sbWei * mult).toString(), (bbWei * mult).toString()]
          );
          blindsUpdated = true;
        }
      }
    } else if (blindModeRecover === 'by_hand') {
      const scheduledLevel = this.blindsForNextHand(config.blindSchedule, handNumber);
      const tblBlinds = await this.pool.query(
        `SELECT small_blind, big_blind FROM poker_tables WHERE id = $1`,
        [tableId]
      );
      if (tblBlinds.rows.length > 0) {
        const curSB = Number(toBigIntSafe(tblBlinds.rows[0].small_blind));
        const curBB = Number(toBigIntSafe(tblBlinds.rows[0].big_blind));
        if (
          curSB !== scheduledLevel.smallBlind ||
          curBB !== scheduledLevel.bigBlind
        ) {
          await this.pool.query(
            `UPDATE poker_tables SET small_blind = $2::NUMERIC, big_blind = $3::NUMERIC WHERE id = $1`,
            [
              tableId,
              BigInt(scheduledLevel.smallBlind).toString(),
              BigInt(scheduledLevel.bigBlind).toString(),
            ]
          );
          blindsUpdated = true;
        }
      }
    }

    if (blindsUpdated) {
      const finalRow = await this.pool.query(
        `SELECT small_blind, big_blind FROM poker_tables WHERE id = $1`,
        [tableId]
      );
      if (finalRow.rows.length > 0) {
        const smallBlindChips = Number(toBigIntSafe(finalRow.rows[0].small_blind));
        const bigBlindChips = Number(toBigIntSafe(finalRow.rows[0].big_blind));
        const displayLevel =
          blindModeRecover === 'by_hand'
            ? this.scheduleDisplayLevel(config.blindSchedule, smallBlindChips, bigBlindChips)
            : this.knockoutBlindDisplayLevel(config.blindSchedule, smallBlindChips);
        this.broadcast(`poker_tournament:${tournamentId}`, 'poker_tournament_blind_level_up', {
          tournamentId,
          tableId,
          newLevel: displayLevel,
          smallBlind: smallBlindChips,
          bigBlind: bigBlindChips,
          handNumber,
        });
      }
    }

    const activePlayers = await this.pool.query(
      `SELECT COUNT(*) AS c FROM tournament_entries WHERE tournament_id = $1 AND status = 'playing'`,
      [tournamentId]
    );
    if (Number(activePlayers.rows[0].c) <= 1) {
      await this.completeTournament(tournamentId, tableId);
    }
  }

  // ---------------------------------------------------------------------------
  // Time-based blind tick (by_time mode)
  // ---------------------------------------------------------------------------

  /**
   * Scheduler tick: advance blinds for all active poker tournaments running in
   * `by_time` mode whose current level has been live for ≥ `blindIntervalMinutes`.
   *
   * Called by `FreerollSchedulerService`. Cheap on average — the partial index on
   * `current_blind_level_started_at` keeps the scan tight and most tables won't
   * need an update on any given poll.
   *
   * One row per tournament-table; we step the level forward one at a time per
   * tick (even if multiple intervals have passed), so a brief outage doesn't
   * skip levels visually — but `computeBlindLevelByTime` still picks the
   * correct target so we'll catch up over the next few ticks.
   */
  async tickTimeBasedBlindAdvances(): Promise<void> {
    let tables: Array<{
      table_id: string;
      tournament_id: string;
      poker_config: unknown;
      current_blind_level: number | null;
      current_blind_level_started_at: Date | null;
      small_blind: unknown;
      big_blind: unknown;
      hand_number: number | null;
    }>;
    try {
      const res = await this.pool.query(
        `SELECT pt.id AS table_id,
                pt.tournament_id,
                t.poker_config,
                pt.current_blind_level,
                pt.current_blind_level_started_at,
                pt.small_blind,
                pt.big_blind,
                pt.hand_number
         FROM poker_tables pt
         JOIN tournaments t ON t.id = pt.tournament_id
         WHERE pt.tournament_mode = TRUE
           AND t.status = 'active'
           AND t.game_type = 'poker'
           AND pt.current_blind_level_started_at IS NOT NULL`,
      );
      tables = res.rows;
    } catch (err) {
      logger.error('tickTimeBasedBlindAdvances: query failed', { err });
      return;
    }

    for (const row of tables) {
      try {
        const config = this.parsePokerConfig(row.poker_config);
        if (this.getBlindIncreaseMode(config) !== 'by_time') continue;

        const interval = this.normalizeBlindIntervalMinutes(config.blindIntervalMinutes);
        if (!interval) continue;

        const startedAt = row.current_blind_level_started_at;
        if (!(startedAt instanceof Date) || Number.isNaN(startedAt.getTime())) continue;

        const startingLevel = Math.max(1, Math.floor(Number(row.current_blind_level ?? 1)));
        const target = this.computeBlindLevelByTime(
          config.blindSchedule,
          interval,
          startedAt,
          startingLevel,
        );

        if (target.level === startingLevel) continue; // not yet time

        const curSB = Number(toBigIntSafe(row.small_blind ?? 0));
        const curBB = Number(toBigIntSafe(row.big_blind ?? 0));
        const sameBlinds = curSB === target.smallBlind && curBB === target.bigBlind;

        // Reset the level clock to NOW so the next interval starts cleanly,
        // even if no on-table blind values changed (e.g. duplicate level rows).
        await this.pool.query(
          `UPDATE poker_tables
             SET small_blind = $2::NUMERIC,
                 big_blind   = $3::NUMERIC,
                 current_blind_level = $4,
                 current_blind_level_started_at = NOW()
           WHERE id = $1`,
          [
            row.table_id,
            BigInt(target.smallBlind).toString(),
            BigInt(target.bigBlind).toString(),
            target.level,
          ],
        );

        logger.info('Poker tournament blinds advanced by time', {
          tournamentId: row.tournament_id,
          tableId: row.table_id,
          intervalMinutes: interval,
          fromLevel: startingLevel,
          toLevel: target.level,
          smallBlind: target.smallBlind,
          bigBlind: target.bigBlind,
          sameBlinds,
        });

        if (!sameBlinds) {
          this.broadcast(`poker_tournament:${row.tournament_id}`, 'poker_tournament_blind_level_up', {
            tournamentId: row.tournament_id,
            tableId: row.table_id,
            newLevel: target.level,
            smallBlind: target.smallBlind,
            bigBlind: target.bigBlind,
            handNumber: Number(row.hand_number ?? 0),
          });
        }
      } catch (err) {
        logger.error('tickTimeBasedBlindAdvances: per-table tick failed', {
          tableId: row.table_id,
          tournamentId: row.tournament_id,
          err,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Complete
  // ---------------------------------------------------------------------------

  async completeTournament(tournamentId: string, tableId?: string): Promise<void> {
    const statusRow = await this.pool.query(`SELECT status FROM tournaments WHERE id = $1`, [tournamentId]);
    if (statusRow.rows.length === 0) return;
    if (statusRow.rows[0].status === 'completed') {
      // MTT: a re-entry into completeTournament after first completion should still GC every
      // poker_tables row, not only the "primary" one. Otherwise consolidation orphans linger.
      await this.deleteAllTournamentTables(tournamentId);
      return;
    }

    const resolvedTableId = tableId ?? (await this.getTableIdForTournament(tournamentId));

    const metaRes = await this.pool.query<{
      name: string;
      prize_pool: string;
      buy_in_amount: string;
      creator_fee_percent: number | null;
      platform_fee_percent: number | null;
      prize_token_address: string | null;
      prize_token_decimals: number | null;
      prize_token_symbol: string | null;
      prize_token_name: string | null;
    }>(
      `SELECT name, prize_pool::text, buy_in_amount::text,
              creator_fee_percent, platform_fee_percent,
              prize_token_address, prize_token_decimals, prize_token_symbol, prize_token_name
       FROM tournaments WHERE id = $1`,
      [tournamentId],
    );
    if (metaRes.rows.length === 0) return;
    const meta = metaRes.rows[0];
    const grossPool = toBigIntSafe(meta.prize_pool);
    // Creator fee bound to 0–15 (migration 120 + UI slider). Defense-in-depth clamp here in case
    // an old row predates the constraint or somehow holds a stale value.
    const creatorPct = Math.min(15, Math.max(0, Number(meta.creator_fee_percent ?? 2)));
    const platformPct = Math.min(100, Math.max(0, Number(meta.platform_fee_percent ?? 3)));

    let totalHands = 0;
    let totalRakeChips = 0n;
    let firstHandAt: Date | null = null;
    let lastHandAt: Date | null = null;
    if (resolvedTableId) {
      const hRes = await this.pool.query<{
        c: number;
        rake_sum: string;
        first_at: Date | null;
        last_at: Date | null;
      }>(
        `SELECT COUNT(*)::int AS c,
                COALESCE(SUM(rake_amount), 0)::text AS rake_sum,
                MIN(created_at) AS first_at,
                MAX(created_at) AS last_at
         FROM poker_hands WHERE table_id = $1::uuid`,
        [resolvedTableId],
      );
      if (hRes.rows[0]) {
        const row = hRes.rows[0];
        totalHands = Number(row.c) || 0;
        totalRakeChips = toBigIntSafe(row.rake_sum);
        firstHandAt = row.first_at ? new Date(row.first_at) : null;
        lastHandAt = row.last_at ? new Date(row.last_at) : null;
      }
    }

    let prizeDistributions: { player_address: string; final_rank: number; prize_amount: bigint }[] = [];
    try {
      const results = await this.tournamentService.distributePrizes(tournamentId);
      prizeDistributions = results.map((r) => ({
        player_address: r.player_address,
        final_rank: r.final_rank,
        prize_amount: r.prize_amount,
      }));
    } catch (err) {
      // distributePrizes commits Phase 1 (writes prize_won, flips status to 'completed')
      // BEFORE Phase 2 fires the on-chain payouts. If the throw happened after the commit,
      // the DB is in a half-state where re-running distributePrizes throws "Tournament already
      // completed" and we'd get stuck forever — winner row still 'playing', table never torn down.
      //
      // Re-read status: if it's already 'completed', Phase 1 succeeded → proceed with cleanup
      // (entry status flip, seat ranks, table teardown, broadcast). On-chain payouts can be
      // retried separately by an admin without reverting any DB state.
      const statusRecheck = await this.pool.query(`SELECT status FROM tournaments WHERE id = $1`, [tournamentId]);
      const isAlreadyCompleted = statusRecheck.rows[0]?.status === 'completed';
      if (!isAlreadyCompleted) {
        logger.error('Poker tournament prize distribution failed pre-commit — table kept for retry', { tournamentId, err });
        throw err;
      }
      logger.error(
        'distributePrizes Phase 2 failed AFTER commit — proceeding with cleanup; on-chain payouts need manual recovery',
        { tournamentId, err: (err as Error).message },
      );
      // Reload prizes from DB so the broadcast still includes correct standings.
      const reloaded = await this.pool.query<{ entry_id: string; player_address: string; final_rank: number; prize_won: string }>(
        `SELECT id AS entry_id, player_address, final_rank, COALESCE(prize_won, 0)::text AS prize_won
         FROM tournament_entries WHERE tournament_id = $1 AND final_rank IS NOT NULL`,
        [tournamentId],
      );
      prizeDistributions = reloaded.rows.map((r) => ({
        player_address: r.player_address,
        final_rank: Number(r.final_rank),
        prize_amount: BigInt(r.prize_won || '0'),
      }));
    }

    await this.pool.query(
      `UPDATE tournament_entries
       SET status = 'completed', finished_at = COALESCE(finished_at, NOW())
       WHERE tournament_id = $1 AND status = 'playing'`,
      [tournamentId]
    );

    await this.pool.query(
      `UPDATE poker_tournament_seats pts
       SET final_rank = te.final_rank
       FROM tournament_entries te
       WHERE pts.entry_id = te.id AND te.tournament_id = $1`,
      [tournamentId]
    );

    const standingsRes = await this.pool.query<{
      player_address: string;
      final_rank: number;
      prize_won: string;
      prize_payout_tx_hash: string | null;
    }>(
      `SELECT LOWER(player_address) AS player_address, final_rank,
              COALESCE(prize_won, 0)::text AS prize_won, prize_payout_tx_hash
       FROM tournament_entries
       WHERE tournament_id = $1 AND final_rank IS NOT NULL
       ORDER BY final_rank ASC`,
      [tournamentId],
    );
    const standings = standingsRes.rows.map((r) => ({
      address: r.player_address,
      rank: Number(r.final_rank),
      prizeAmount: r.prize_won,
      payoutTxHash: r.prize_payout_tx_hash ?? null,
    }));

    const endedRes = await this.pool.query<{ ended_at: Date | null }>(
      `SELECT ended_at FROM tournaments WHERE id = $1`,
      [tournamentId],
    );
    const endedAt = endedRes.rows[0]?.ended_at ? new Date(endedRes.rows[0].ended_at).toISOString() : null;

    // MTT: tear down every remaining table for this tournament (the final-table id is whatever
    // survived consolidation; resolvedTableId may point at the triggering — possibly empty —
    // table). Loop ensures any stragglers from a botched consolidation are also reaped.
    await this.deleteAllTournamentTables(tournamentId);

    const creatorFeeChips = (grossPool * BigInt(creatorPct)) / 100n;
    const platformFeeChips = (grossPool * BigInt(platformPct)) / 100n;
    const elapsedMs =
      firstHandAt && lastHandAt ? Math.max(0, lastHandAt.getTime() - firstHandAt.getTime()) : null;

    logger.info('Poker tournament completed', { tournamentId, winners: prizeDistributions });

    // The Rail: winner announcement + results DMs (best-effort, fire-and-forget).
    void railTournamentCompleted(this.pool, tournamentId, standings);

    this.broadcast(`poker_tournament:${tournamentId}`, 'poker_tournament_completed', {
      tournamentId,
      name: String(meta.name ?? 'Tournament'),
      buyInAmount: toBigIntSafe(meta.buy_in_amount).toString(),
      grossPrizePoolChips: grossPool.toString(),
      platformFeeChips: platformFeeChips.toString(),
      creatorFeeChips: creatorFeeChips.toString(),
      handRakeTotalChips: totalRakeChips.toString(),
      totalHands,
      elapsedMs,
      firstHandAt: firstHandAt?.toISOString() ?? null,
      lastHandAt: lastHandAt?.toISOString() ?? null,
      endedAt,
      standings,
      winners: standings,
      // For custom-token freerolls the chip-denominated `*Chips` fields above are
      // actually wei of this token. Clients display via prize_token_decimals.
      prizeTokenAddress: meta.prize_token_address ?? null,
      prizeTokenDecimals: meta.prize_token_decimals != null ? Number(meta.prize_token_decimals) : null,
      prizeTokenSymbol: meta.prize_token_symbol ?? null,
      prizeTokenName: meta.prize_token_name ?? null,
    });
  }

  // ---------------------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------------------

  async cancelPokerTournament(tournamentId: string, callerAddress: string): Promise<void> {
    const normalized = this.normalizeAddress(callerAddress);

    const tRow = await this.pool.query(
      `SELECT creator_address, status, buy_in_amount, prize_pool, guaranteed_prize_funder_address,
              prize_token_address
       FROM tournaments WHERE id = $1 AND game_type = 'poker'`,
      [tournamentId]
    );
    if (tRow.rows.length === 0) throw new Error('Poker tournament not found');
    const t = tRow.rows[0];
    if (t.status !== 'registration') throw new Error('Can only cancel tournaments in registration status');
    if (t.creator_address?.toLowerCase() !== normalized) throw new Error('Only the creator can cancel this tournament');

    const buyIn = this.parseBigInt(t.buy_in_amount);
    const isCustomToken = !!t.prize_token_address;
    const isEscrowBuyIn = buyIn > 0n && isCustomToken;

    const entries = await this.pool.query(
      `SELECT id, player_address FROM tournament_entries
       WHERE tournament_id = $1 AND status = 'playing'`,
      [tournamentId]
    );

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const entry of entries.rows) {
        // Escrow buy-ins are refunded on-chain below (push), not as poker chips.
        if (buyIn > 0n && !isEscrowBuyIn) {
          await applyPokerChipDelta(
            client,
            entry.player_address,
            buyIn,
            'tournament_refund',
            { type: 'tournament', id: tournamentId },
          );
        }
        await client.query(
          `UPDATE tournament_entries SET status = 'busted', finished_at = NOW() WHERE id = $1`,
          [entry.id]
        );
      }

      // Chip-pool refund (creator/promo wallet). Skipped for custom_token: those funds live
      // in the escrow contract, not in any chip wallet — we mark them cancelled on-chain
      // below so the creator can `creatorReclaim` from their wallet.
      if (buyIn === 0n && !isCustomToken) {
        const prizePoolRefund = this.parseBigInt(t.prize_pool);
        const refundTo = this.guaranteedPrizePoolRefundRecipient(t);
        if (prizePoolRefund > 0n && refundTo) {
          await applyPokerChipDelta(
            client,
            refundTo,
            prizePoolRefund,
            'tournament_refund',
            { type: 'tournament', id: tournamentId },
          );
        }
      }

      // For custom-token freerolls keep prize_pool intact for audit; the on-chain pool is the source of truth.
      if (isCustomToken) {
        await client.query(
          `UPDATE tournaments SET status = 'cancelled', ended_at = NOW() WHERE id = $1`,
          [tournamentId]
        );
      } else {
        await client.query(
          `UPDATE tournaments SET status = 'cancelled', ended_at = NOW(), prize_pool = 0 WHERE id = $1`,
          [tournamentId]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // The Rail: cancellation notice + refund DMs (best-effort, fire-and-forget).
    void railTournamentCancelled(this.pool, tournamentId);

    // On-chain cancel happens after the DB transaction so a failed RPC call doesn't roll back the cancel.
    // Worst case: DB shows cancelled but the escrow remains active — admins can retry, and the creator
    // can still reclaim once cancelled. We tolerate this asymmetry rather than risking a phantom-active
    // tournament if the DB commit fails after a successful on-chain cancel.
    if (isCustomToken) {
      try {
        if (isEscrowBuyIn && entries.rows.length > 0) {
          try {
            const recipients = entries.rows.map((e: { player_address: string }) => ({
              address: String(e.player_address),
              amount: buyIn,
            }));
            const pay = await sendEscrowPayoutMultiple(tournamentId, recipients);
            if (!pay.success) {
              logger.error('Escrow buy-in refund batch failed (creator cancel)', {
                tournamentId,
                error: pay.error,
              });
            }
          } catch (refundErr) {
            logger.error('Escrow buy-in refund threw (creator cancel)', { tournamentId, refundErr });
          }
        }
        const result = await cancelTournamentInEscrow(tournamentId);
        if (!result.success) {
          logger.error('Custom-token freeroll: on-chain cancel failed; creator must retry manually', {
            tournamentId,
            error: result.error,
          });
        }
      } catch (err) {
        logger.error('Custom-token freeroll: on-chain cancel threw', { tournamentId, err });
      }
    }

    logger.info('Poker tournament cancelled', {
      tournamentId,
      caller: normalized,
      refunded: entries.rows.length,
      isCustomToken,
      isEscrowBuyIn,
    });

    this.broadcast(`poker_tournament:${tournamentId}`, 'poker_tournament_cancelled', { tournamentId });
  }

  /**
   * **Dev / QA only** (HTTP layer must also enable `POKER_TOURNAMENT_DEV_RESET=true`):
   * Drops tournament poker table(s), cancels pending scheduled events, marks `playing`/`forfeited`
   * entries as busted, sets tournament `cancelled` and `prize_pool = 0`.
   * Does **not** credit player balances (including locked guarantee / buy-ins) — for local DB cleanup only.
   */
  async adminDevForceResetPokerTournament(tournamentId: string): Promise<{
    tournamentId: string;
    deletedTableIds: string[];
    priorStatus: string;
  }> {
    const id = tournamentId.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error('Invalid tournament id');
    }

    const tRow = await this.pool.query(
      `SELECT status FROM tournaments WHERE id = $1 AND game_type = 'poker'`,
      [id],
    );
    if (tRow.rows.length === 0) {
      throw new Error('Poker tournament not found');
    }
    const priorStatus = String(tRow.rows[0].status ?? '');

    const tables = await this.pool.query(`SELECT id FROM poker_tables WHERE tournament_id = $1`, [id]);
    const deletedTableIds: string[] = [];
    for (const row of tables.rows) {
      const tableId = row.id as string;
      await this.pokerGameService.deleteTableTournament(tableId);
      deletedTableIds.push(tableId);
    }

    await this.pool.query(
      `UPDATE tournament_scheduled_events SET status = 'cancelled' WHERE tournament_id = $1 AND status = 'pending'`,
      [id],
    );

    await this.pool.query(
      `UPDATE tournament_entries
       SET status = 'busted', chips_remaining = 0, finished_at = COALESCE(finished_at, NOW())
       WHERE tournament_id = $1 AND status IN ('playing', 'forfeited')`,
      [id],
    );

    await this.pool.query(
      `UPDATE tournaments
       SET status = 'cancelled', ended_at = COALESCE(ended_at, NOW()), prize_pool = 0
       WHERE id = $1 AND game_type = 'poker'`,
      [id],
    );

    logger.warn('Poker tournament DEV reset (no balance refunds)', {
      tournamentId: id,
      deletedTableIds,
      priorStatus,
    });

    this.broadcast(`poker_tournament:${id}`, 'poker_tournament_cancelled', {
      tournamentId: id,
      reason: 'dev_reset',
    });

    return { tournamentId: id, deletedTableIds, priorStatus };
  }

  // ---------------------------------------------------------------------------
  // Read methods
  // ---------------------------------------------------------------------------

  /** Entrants for lobby / modal (addresses + optional display name + registration time + entry status). */
  async getPokerTournamentRegistrants(tournamentId: string): Promise<
    Array<{
      playerAddress: string;
      displayName: string | null;
      registeredAt: string | null;
      status: 'playing' | 'busted' | 'completed';
    }>
  > {
    const id = tournamentId.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error('Invalid tournament id');
    }
    const t = await this.pool.query(
      `SELECT 1 FROM tournaments WHERE id = $1 AND game_type = 'poker'`,
      [id]
    );
    if (t.rows.length === 0) throw new Error('Tournament not found');

    const r = await this.pool.query(
      `SELECT te.player_address, te.bought_in_at, te.status, cdn.display_name
       FROM tournament_entries te
       LEFT JOIN chat_display_names cdn ON LOWER(cdn.wallet_address) = LOWER(te.player_address)
       WHERE te.tournament_id = $1
       ORDER BY
         CASE te.status WHEN 'playing' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,
         te.bought_in_at ASC NULLS LAST,
         LOWER(te.player_address) ASC`,
      [id]
    );

    return r.rows.map(
      (e: {
        player_address: string;
        bought_in_at: Date | null;
        status: string;
        display_name: string | null;
      }) => ({
        playerAddress: e.player_address,
        displayName:   e.display_name?.trim() ? e.display_name.trim() : null,
        registeredAt:  e.bought_in_at ? new Date(e.bought_in_at).toISOString() : null,
        status:        e.status as 'playing' | 'busted' | 'completed',
      })
    );
  }

  async listPokerTournaments(playerAddress?: string): Promise<PokerTournamentSummary[]> {
    const normalized = playerAddress ? this.normalizeAddress(playerAddress) : null;

    // The lobby shows EVERY poker tournament — nothing is hidden by age,
    // emptiness, or status (cancelled and completed rows are included too).
    // LOBBY_MAX_ROWS is only a defensive backstop against a pathological row
    // count; on normal traffic it is never reached.
    const LOBBY_MAX_ROWS = 1000;

    const result = await this.pool.query(
      `SELECT r.*,
         pt.small_blind AS table_small_blind,
         pt.big_blind AS table_big_blind,
         CASE WHEN $1::text IS NOT NULL AND EXISTS (
           SELECT 1 FROM tournament_entries te
           WHERE te.tournament_id = r.tournament_id
             AND LOWER(te.player_address) = $1::text
             AND te.status NOT IN ('busted', 'completed')
         ) THEN TRUE ELSE FALSE END AS is_registered,
         (SELECT te.status FROM tournament_entries te
            WHERE te.tournament_id = r.tournament_id
              AND $1::text IS NOT NULL
              AND LOWER(te.player_address) = $1::text
            LIMIT 1) AS my_entry_status,
         /* MTT: the caller's actual seat table (NULL for non-MTT or non-seated/spectator).
            Lobby uses this when present so each MTT player navigates to THEIR table, not the
            first one by table_seq. Falls back to r.table_id on the client when null. */
         CASE WHEN $1::text IS NOT NULL THEN (
           SELECT ps.table_id
             FROM poker_seats ps
             JOIN poker_tables pkt ON pkt.id = ps.table_id
            WHERE pkt.tournament_id = r.tournament_id
              AND LOWER(ps.player_address) = $1::text
            LIMIT 1
         ) ELSE NULL END AS my_table_id,
         tt.activated_at AS activated_at
       FROM poker_tournament_registrations r
       LEFT JOIN poker_tables pt ON pt.id = r.table_id
       LEFT JOIN tournaments tt ON tt.id = r.tournament_id
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [normalized, LOBBY_MAX_ROWS]
    );

    return result.rows.map((r) => {
      const config = this.parsePokerConfig(r.poker_config);
      const level0 = config.blindSchedule[0] ?? { smallBlind: 25, bigBlind: 50 };
      const sbTable = r.table_small_blind != null ? Number(toBigIntSafe(r.table_small_blind)) : null;
      const bbTable = r.table_big_blind != null ? Number(toBigIntSafe(r.table_big_blind)) : null;
      const smallBlind =
        sbTable != null && Number.isFinite(sbTable) && sbTable > 0 ? sbTable : level0.smallBlind;
      const bigBlind =
        bbTable != null && Number.isFinite(bbTable) && bbTable > 0 ? bbTable : level0.bigBlind;
      const blindIncreaseMode = this.getBlindIncreaseMode(config);
      // Late registration: open while the tournament is active and the configured
      // window (minutes after activated_at) has not yet elapsed.
      const lateRegMinutes = config.lateRegMinutes ?? 0;
      let lateRegOpen = false;
      if (r.status === 'active' && lateRegMinutes > 0 && r.activated_at) {
        const activatedMs = new Date(r.activated_at).getTime();
        lateRegOpen = Number.isFinite(activatedMs) && Date.now() < activatedMs + lateRegMinutes * 60_000;
      }
      return {
        tournamentId:          r.tournament_id,
        name:                  r.name,
        status:                r.status,
        buyInAmount:           r.buy_in_amount?.toString() ?? '0',
        startingStack:         Number(r.starting_chips ?? 5000),
        registeredCount:       Number(r.registered_count ?? 0),
        maxPlayers:            Number(r.max_players ?? 10),
        minPlayers:            Number(r.min_players ?? 2),
        prizePool:             r.prize_pool?.toString() ?? '0',
        prizeTokenAddress:     r.prize_token_address ?? null,
        prizeTokenDecimals:    r.prize_token_decimals != null ? Number(r.prize_token_decimals) : null,
        prizeTokenSymbol:      r.prize_token_symbol ?? null,
        prizeTokenName:        r.prize_token_name ?? null,
        tableId:               r.table_id ?? null,
        myTableId:             r.my_table_id ?? null,
        createdAt:             r.created_at?.toISOString() ?? '',
        creatorAddress:        r.creator_address ?? null,
        prizeDistributionType: r.prize_distribution_type ?? 'winner_takes_all',
        scheduledStartAt:      r.scheduled_start_at ? new Date(r.scheduled_start_at).toISOString() : null,
        isRegistered:          r.is_registered === true,
        myEntryStatus:         (r.my_entry_status === 'playing' || r.my_entry_status === 'busted' || r.my_entry_status === 'completed')
          ? r.my_entry_status
          : null,
        isPrivate:             Boolean(r.is_private),
        smallBlind,
        bigBlind,
        blindIncreaseMode,
        startMode:             config.startMode ?? 'time',
        // Exposed to clients so the buy-in panel + lobby can show "X% to creator, Y% to winners".
        // Migration 120 caps the column to 0–15; old rows default to 2 via DB default + JS fallback.
        creatorFeePercent:     r.creator_fee_percent != null ? Number(r.creator_fee_percent) : 2,
        ...(lateRegMinutes > 0 ? { lateRegMinutes } : {}),
        lateRegOpen,
      };
    });
  }

  /**
   * Cancelled custom-token poker tournaments where the caller is the creator and
   * funds may still be reclaimable from the escrow contract.
   *
   * Pure DB read — the client decides whether to surface a "Reclaim" button by
   * doing an on-chain `getPool` to confirm `cancelled === true && totalDeposited > amountPaidOut`.
   * We do NOT round-trip the chain here: this list could be 0 rows for many viewers
   * and we don't want to slow the lobby for everyone.
   */
  async listReclaimableCustomTokenPokerTournaments(creatorAddress: string): Promise<Array<{
    tournamentId: string;
    name: string;
    cancelledAt: string | null;
    prizeTokenAddress: string;
    prizeTokenDecimals: number;
    prizeTokenSymbol: string | null;
    prizeTokenName: string | null;
    prizePool: string;
    escrowTournamentIdBytes32: string | null;
  }>> {
    const normalized = this.normalizeAddress(creatorAddress);
    const result = await this.pool.query(
      `SELECT id, name, ended_at, prize_token_address, prize_token_decimals, prize_token_symbol,
              prize_token_name, prize_pool, escrow_tournament_id_bytes32
       FROM tournaments
       WHERE game_type = 'poker'
         AND status = 'cancelled'
         AND prize_token_address IS NOT NULL
         AND LOWER(creator_address) = $1
       ORDER BY ended_at DESC NULLS LAST
       LIMIT 50`,
      [normalized],
    );
    return result.rows.map((r) => ({
      tournamentId: r.id as string,
      name: String(r.name ?? ''),
      cancelledAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
      prizeTokenAddress: String(r.prize_token_address),
      prizeTokenDecimals: r.prize_token_decimals != null ? Number(r.prize_token_decimals) : 18,
      prizeTokenSymbol: r.prize_token_symbol ?? null,
      prizeTokenName: r.prize_token_name ?? null,
      prizePool: r.prize_pool?.toString() ?? '0',
      escrowTournamentIdBytes32: r.escrow_tournament_id_bytes32 ?? null,
    }));
  }

  /**
   * Completed custom-token poker tournaments where the caller has a positive `prize_won`
   * but no `prize_payout_tx_hash` recorded — i.e. the push payout didn't fire (or hasn't
   * yet) and the server-recorded claimable amount may still be pullable on-chain.
   *
   * Pure DB read; the client confirms each row via `unclaimedOf(bytes32, me)` before
   * surfacing a button. Cheap query — index on `tournament_id, player_address` already exists.
   */
  async listClaimableCustomTokenPokerTournaments(playerAddress: string): Promise<Array<{
    tournamentId: string;
    name: string;
    completedAt: string | null;
    prizeTokenAddress: string;
    prizeTokenDecimals: number;
    prizeTokenSymbol: string | null;
    prizeTokenName: string | null;
    /** Token-wei the player should be owed; pair with `prizeTokenDecimals` for display. */
    prizeWon: string;
    escrowTournamentIdBytes32: string | null;
  }>> {
    const normalized = this.normalizeAddress(playerAddress);
    const result = await this.pool.query(
      `SELECT t.id, t.name, t.ended_at,
              t.prize_token_address, t.prize_token_decimals, t.prize_token_symbol, t.prize_token_name,
              te.prize_won::text AS prize_won,
              t.escrow_tournament_id_bytes32
       FROM tournaments t
       JOIN tournament_entries te ON te.tournament_id = t.id
       WHERE t.game_type = 'poker'
         AND t.status = 'completed'
         AND t.prize_token_address IS NOT NULL
         AND LOWER(te.player_address) = $1
         AND te.prize_won IS NOT NULL
         AND te.prize_won::NUMERIC > 0
         AND te.prize_payout_tx_hash IS NULL
       ORDER BY t.ended_at DESC NULLS LAST
       LIMIT 50`,
      [normalized],
    );
    return result.rows.map((r) => ({
      tournamentId: r.id as string,
      name: String(r.name ?? ''),
      completedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
      prizeTokenAddress: String(r.prize_token_address),
      prizeTokenDecimals: r.prize_token_decimals != null ? Number(r.prize_token_decimals) : 18,
      prizeTokenSymbol: r.prize_token_symbol ?? null,
      prizeTokenName: r.prize_token_name ?? null,
      prizeWon: r.prize_won?.toString() ?? '0',
      escrowTournamentIdBytes32: r.escrow_tournament_id_bytes32 ?? null,
    }));
  }

  async getTournamentState(tournamentId: string): Promise<PokerTournamentState | null> {
    // For MTT we want the lobby/HUD's "primary" table_id to point at the final table once
    // consolidation has happened, falling back to the lowest table_seq otherwise. The
    // LEFT JOIN below picks whichever table the ORDER BY puts first; for SNG with a single
    // poker_tables row this is unchanged from the pre-MTT query.
    const tRow = await this.pool.query(
      `SELECT t.*, pt.id AS table_id, pt.hand_number, pt.small_blind, pt.big_blind,
              pt.current_blind_level, pt.current_blind_level_started_at
       FROM tournaments t
       LEFT JOIN LATERAL (
         SELECT id, hand_number, small_blind, big_blind,
                current_blind_level, current_blind_level_started_at
           FROM poker_tables
          WHERE tournament_id = t.id
          ORDER BY is_final_table DESC, table_seq NULLS LAST, created_at
          LIMIT 1
       ) pt ON TRUE
       WHERE t.id = $1 AND t.game_type = 'poker'`,
      [tournamentId]
    );
    if (tRow.rows.length === 0) return null;

    const t = tRow.rows[0];
    const config = this.parsePokerConfig(t.poker_config);
    const handNumber = Number(t.hand_number ?? 0);

    const entries = await this.pool.query(
      `SELECT te.id, te.player_address, te.chips_remaining, te.status, te.final_rank, te.prize_won,
              cdn.display_name
       FROM tournament_entries te
       LEFT JOIN chat_display_names cdn ON LOWER(cdn.wallet_address) = LOWER(te.player_address)
       WHERE te.tournament_id = $1
       ORDER BY te.final_rank ASC NULLS LAST, te.chips_remaining DESC`,
      [tournamentId]
    );

    const sbRaw = t.small_blind != null ? toBigIntSafe(t.small_blind) : null;
    const bbRaw = t.big_blind != null ? toBigIntSafe(t.big_blind) : null;
    const currentLevel = this.computeBlindLevel(config.blindSchedule, 1);
    const smallBlindChips = sbRaw != null && sbRaw > 0n
      ? Number(sbRaw)
      : currentLevel.smallBlind;
    const bigBlindChips = bbRaw != null && bbRaw > 0n
      ? Number(bbRaw)
      : currentLevel.bigBlind;
    const blindModeState = this.getBlindIncreaseMode(config);
    let blindLevelDisplay: number;
    if (blindModeState === 'by_hand') {
      blindLevelDisplay = this.scheduleDisplayLevel(config.blindSchedule, smallBlindChips, bigBlindChips);
    } else if (blindModeState === 'by_time') {
      // Prefer the persisted current_blind_level (set at activation, advanced by the tick).
      // Fall back to `scheduleDisplayLevel` so the UI doesn't show level 1 if the column is null.
      const persisted = t.current_blind_level != null ? Number(t.current_blind_level) : null;
      blindLevelDisplay = persisted && Number.isFinite(persisted) && persisted >= 1
        ? persisted
        : this.scheduleDisplayLevel(config.blindSchedule, smallBlindChips, bigBlindChips);
    } else {
      blindLevelDisplay = this.knockoutBlindDisplayLevel(config.blindSchedule, smallBlindChips);
    }
    const currentBlindLevelStartedAt: string | null =
      blindModeState === 'by_time' && t.current_blind_level_started_at
        ? new Date(t.current_blind_level_started_at).toISOString()
        : null;

    const prizeSplitPercentages = parsePrizePercentagesFromDb(
      t.prize_percentages,
      String(t.prize_distribution_type ?? 'winner_takes_all'),
    );

    // MTT tables snapshot: empty when no poker_tables rows exist yet (pre-activation SNG).
    const tableRows = await this.listTournamentTables(tournamentId);
    const tables: PokerTournamentTableSummary[] = tableRows.map((tr) => ({
      tableId: tr.id,
      seq: tr.seq,
      isFinalTable: tr.isFinalTable,
      playerCount: tr.seatCount,
      smallBlind: tr.smallBlind,
      bigBlind: tr.bigBlind,
      handNumber: tr.handNumber,
    }));

    const seatsPerTable = this.effectiveSeatsPerTable(config);

    return {
      tournamentId,
      name:                  t.name,
      status:                t.status,
      tableId:               t.table_id ?? null,
      blindLevel:            blindLevelDisplay,
      smallBlind:            smallBlindChips,
      bigBlind:              bigBlindChips,
      handNumber,
      players:               entries.rows.map((e: {
        player_address: string;
        id: string;
        chips_remaining: unknown;
        status: string;
        final_rank: number | null;
        prize_won: unknown;
        display_name: string | null;
      }) => ({
        playerAddress:   e.player_address,
        displayName:     e.display_name?.trim() ? e.display_name.trim() : null,
        entryId:         e.id as string,
        chipsRemaining:  Number(e.chips_remaining ?? 0),
        status:          e.status as 'playing' | 'busted' | 'completed',
        finalRank:       e.final_rank ?? null,
        prizeWon:        (e.prize_won ?? '0').toString(),
      })),
      tables: tables.length > 0 ? tables : undefined,
      prizePool:           t.prize_pool?.toString() ?? '0',
      prizeTokenAddress:   t.prize_token_address ?? null,
      prizeTokenDecimals:  t.prize_token_decimals != null ? Number(t.prize_token_decimals) : null,
      prizeTokenSymbol:    t.prize_token_symbol ?? null,
      prizeTokenName:      t.prize_token_name ?? null,
      buyInAmount:         t.buy_in_amount?.toString() ?? '0',
      prizeDistributionType: t.prize_distribution_type ?? 'winner_takes_all',
      /** For client HUD: schedule + meta + blind increase mode. */
      pokerConfig:         {
        blindSchedule: config.blindSchedule,
        startingStack: config.startingStack,
        minPlayers:    config.minPlayers,
        maxPlayers:    config.maxPlayers,
        blindIncreaseMode: blindModeState,
        ...(blindModeState === 'by_time' && config.blindIntervalMinutes
          ? { blindIntervalMinutes: config.blindIntervalMinutes }
          : {}),
        seatsPerTable,
        ...(config.lateRegMinutes && config.lateRegMinutes > 0
          ? { lateRegMinutes: config.lateRegMinutes }
          : {}),
      },
      actionTimerSeconds: t.action_timer_seconds != null ? Number(t.action_timer_seconds) : null,
      prizeSplitPercentages,
      currentBlindLevelStartedAt,
    };
  }

  async getPlayerEntryStatus(
    tournamentId: string,
    playerAddress: string,
  ): Promise<PokerTournamentPlayer | null> {
    const normalized = this.normalizeAddress(playerAddress);
    const row = await this.pool.query(
      `SELECT te.id, te.player_address, te.chips_remaining, te.status, te.final_rank, te.prize_won,
              cdn.display_name
       FROM tournament_entries te
       LEFT JOIN chat_display_names cdn ON LOWER(cdn.wallet_address) = LOWER(te.player_address)
       WHERE te.tournament_id = $1 AND LOWER(te.player_address) = LOWER($2)
       LIMIT 1`,
      [tournamentId, normalized]
    );
    if (row.rows.length === 0) return null;
    const e = row.rows[0];
    return {
      playerAddress: e.player_address,
      displayName:   e.display_name?.trim() ? e.display_name.trim() : null,
      entryId:       e.id,
      chipsRemaining: Number(e.chips_remaining ?? 0),
      status:        e.status,
      finalRank:     e.final_rank ?? null,
      prizeWon:      (e.prize_won ?? '0').toString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Eliminate a list of busted players from a tournament table.
   *
   * `assumeLockHeld` controls which `leaveTableTournament` variant is called:
   *   - `false` (default): used by `syncAfterHand` (post-hand callback), which
   *     runs OUTSIDE the per-table lock. The public `leaveTableTournament`
   *     re-acquires the lock cleanly.
   *   - `true`: used by `recoverTournamentTableIfUnderTwoStackedSeats`, which
   *     is invoked from inside `tryStartNextHand`'s lock body. Calling the
   *     lock-acquiring variant from that path would deadlock since
   *     `withTableLock` is not re-entrant.
   */
  private async eliminateBustedTournamentSeats(
    tableId: string,
    tournamentId: string,
    bustedAddresses: string[],
    handNumber: number,
    seatCount: number,
    assumeLockHeld: boolean = false,
  ): Promise<void> {
    let remainingAfterElim = seatCount - bustedAddresses.length;

    for (const addr of bustedAddresses) {
      const pts = await this.pool.query(
        `SELECT pts.entry_id FROM poker_tournament_seats pts
         WHERE pts.tournament_id = $1 AND LOWER(pts.player_address) = LOWER($2)`,
        [tournamentId, addr]
      );
      if (pts.rows.length === 0) continue;
      const entryId = pts.rows[0].entry_id as string;

      const rank = remainingAfterElim + 1;

      await this.pool.query(
        `UPDATE tournament_entries
         SET status = 'busted', chips_remaining = 0, finished_at = NOW(), final_rank = $2
         WHERE id = $1`,
        [entryId, rank]
      );

      await this.pool.query(
        `UPDATE poker_tournament_seats SET eliminated_at = NOW(), final_rank = $2
         WHERE entry_id = $1`,
        [entryId, rank]
      );

      if (assumeLockHeld) {
        await this.pokerGameService.leaveTableTournamentNoLock(tableId, addr);
      } else {
        await this.pokerGameService.leaveTableTournament(tableId, addr);
      }

      logger.info('Poker tournament player eliminated', { tournamentId, playerAddress: addr, rank, handNumber });

      this.broadcast(`poker_tournament:${tournamentId}`, 'poker_tournament_player_eliminated', {
        tournamentId,
        playerAddress: addr,
        finalRank: rank,
        handNumber,
      });
    }
  }

  private async getTableIdForTournament(tournamentId: string): Promise<string | null> {
    const r = await this.pool.query(
      `SELECT id FROM poker_tables WHERE tournament_id = $1 ORDER BY table_seq NULLS LAST, created_at LIMIT 1`,
      [tournamentId]
    );
    return r.rows[0]?.id ?? null;
  }

  /**
   * Tear down every poker_tables row for a tournament. Used by `completeTournament`
   * (MTT: many tables remain after consolidation if anything went sideways; SNG: one table)
   * and by re-entries when status is already 'completed'.
   */
  private async deleteAllTournamentTables(tournamentId: string): Promise<void> {
    const rows = await this.pool.query<{ id: string }>(
      `SELECT id FROM poker_tables WHERE tournament_id = $1`,
      [tournamentId],
    );
    for (const row of rows.rows) {
      try {
        await this.pokerGameService.deleteTableTournament(row.id);
      } catch (err) {
        logger.warn('Failed to delete tournament poker table', { tournamentId, tableId: row.id, err });
      }
    }
  }

  /**
   * All live poker_tables rows for a tournament with seat counts (active seats only — busted
   * players have already had their seat deleted by `eliminateBustedTournamentSeats`).
   * Ordered by table_seq so the lobby/HUD renders Table 1, Table 2, … consistently.
   */
  private async listTournamentTables(tournamentId: string): Promise<Array<{
    id: string;
    seq: number | null;
    isFinalTable: boolean;
    seatCount: number;
    smallBlind: number;
    bigBlind: number;
    handNumber: number;
  }>> {
    const res = await this.pool.query<{
      id: string;
      table_seq: number | null;
      is_final_table: boolean;
      seat_count: string;
      small_blind: unknown;
      big_blind: unknown;
      hand_number: number | null;
    }>(
      `SELECT pt.id, pt.table_seq, pt.is_final_table,
              (SELECT COUNT(*) FROM poker_seats ps WHERE ps.table_id = pt.id)::text AS seat_count,
              pt.small_blind, pt.big_blind, pt.hand_number
         FROM poker_tables pt
        WHERE pt.tournament_id = $1
        ORDER BY pt.table_seq NULLS LAST, pt.created_at`,
      [tournamentId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      seq: r.table_seq != null ? Number(r.table_seq) : null,
      isFinalTable: Boolean(r.is_final_table),
      seatCount: Number(r.seat_count) || 0,
      smallBlind: Number(toBigIntSafe(r.small_blind ?? 0)),
      bigBlind: Number(toBigIntSafe(r.big_blind ?? 0)),
      handNumber: Number(r.hand_number ?? 0),
    }));
  }

  /**
   * Find the live tableId for a specific player in an MTT (or single-table SNG).
   * Returns null if the player is busted, has never been seated, or the tournament has no tables.
   */
  async getPlayerTableId(tournamentId: string, playerAddress: string): Promise<string | null> {
    const normalized = this.normalizeAddress(playerAddress);
    const r = await this.pool.query<{ table_id: string }>(
      `SELECT ps.table_id
         FROM poker_seats ps
         JOIN poker_tables pt ON pt.id = ps.table_id
        WHERE pt.tournament_id = $1
          AND LOWER(ps.player_address) = $2
        LIMIT 1`,
      [tournamentId, normalized],
    );
    return r.rows[0]?.table_id ?? null;
  }

  /**
   * MTT primitive: move a still-stacked player from one poker_tables row to another. Used by
   * final-table consolidation and (future) lone-survivor consolidation. Safe to call **only**
   * when the source table is between hands (`syncAfterHand` is the canonical caller) — moving
   * a player mid-hand would break the active chevtek Table instance.
   *
   * Steps:
   *   1. SELECT the seated player's stack from the source table.
   *   2. INSERT a new seat at the first open position on the destination table.
   *   3. DELETE the original seat row.
   *   4. UPDATE poker_tournament_seats so future lookups resolve to the new table.
   *   5. Broadcast `poker_tournament_player_moved` to the tournament room.
   *
   * Throws when either table is missing, when the player isn't seated at the source, or when
   * the destination is full. Callers should catch + log and continue (the tournament loop
   * doesn't depend on every move succeeding).
   */
  private async movePlayerBetweenTables(
    tournamentId: string,
    fromTableId: string,
    toTableId: string,
    playerAddress: string,
  ): Promise<void> {
    const normalized = this.normalizeAddress(playerAddress);
    if (fromTableId === toTableId) return;

    const srcSeat = await this.pool.query<{ stack: unknown; status: string }>(
      `SELECT stack, status FROM poker_seats WHERE table_id = $1 AND LOWER(player_address) = $2`,
      [fromTableId, normalized],
    );
    if (srcSeat.rows.length === 0) {
      logger.warn('MTT move: source seat missing', { tournamentId, fromTableId, toTableId, normalized });
      return;
    }
    const stackChips = toBigIntSafe(srcSeat.rows[0].stack ?? 0).toString();
    const srcStatus = srcSeat.rows[0].status ?? 'active';

    const dstTable = await this.pool.query<{ max_seats: number; tournament_mode: boolean }>(
      `SELECT max_seats, tournament_mode FROM poker_tables WHERE id = $1`,
      [toTableId],
    );
    if (dstTable.rows.length === 0 || !dstTable.rows[0].tournament_mode) {
      throw new Error('Destination is not a tournament table');
    }
    const maxSeats = Number(dstTable.rows[0].max_seats) || POKER_MTT_SEATS_PER_TABLE_MAX;

    const dstSeats = await this.pool.query<{ position: number }>(
      `SELECT position FROM poker_seats WHERE table_id = $1`,
      [toTableId],
    );
    if (dstSeats.rows.length >= maxSeats) {
      throw new Error('Destination table full');
    }
    const usedPositions = new Set(dstSeats.rows.map((r) => Number(r.position)));
    let newPos = 0;
    while (usedPositions.has(newPos)) newPos++;

    // Sequence matters: insert into dest BEFORE delete-from-source so the player is never seatless.
    // Both rows share UNIQUE (table_id, player_address) so an accidental double-insert at the
    // source would also fail loudly — but the source UNIQUE doesn't block the dest insert.
    await this.pool.query(
      `INSERT INTO poker_seats (table_id, position, player_address, stack, status)
       VALUES ($1, $2, $3, $4::NUMERIC, $5)`,
      [toTableId, newPos, normalized, stackChips, srcStatus],
    );
    await this.pool.query(
      `DELETE FROM poker_seats WHERE table_id = $1 AND LOWER(player_address) = $2`,
      [fromTableId, normalized],
    );
    await this.pool.query(
      `UPDATE poker_tournament_seats SET table_id = $1 WHERE tournament_id = $2 AND LOWER(player_address) = $3`,
      [toTableId, tournamentId, normalized],
    );

    logger.info('MTT player moved', { tournamentId, fromTableId, toTableId, playerAddress: normalized, stackChips });

    this.broadcast(`poker_tournament:${tournamentId}`, 'poker_tournament_player_moved', {
      tournamentId,
      playerAddress: normalized,
      fromTableId,
      toTableId,
    });
  }

  /**
   * Drop tables that ended up with zero seats after eliminations / consolidation. Keeps the
   * tables list tight for the lobby + HUD and lets `tickTimeBasedBlindAdvances` scan fewer rows.
   * No-op on the final/winning table since the next-hand path keeps it alive until completion.
   */
  private async pruneEmptyTournamentTables(tournamentId: string, keepTableId?: string): Promise<void> {
    const emptyTables = await this.pool.query<{ id: string }>(
      `SELECT pt.id
         FROM poker_tables pt
        WHERE pt.tournament_id = $1
          AND NOT EXISTS (SELECT 1 FROM poker_seats ps WHERE ps.table_id = pt.id)
          ${keepTableId ? 'AND pt.id <> $2' : ''}`,
      keepTableId ? [tournamentId, keepTableId] : [tournamentId],
    );
    for (const row of emptyTables.rows) {
      try {
        await this.pokerGameService.deleteTableTournament(row.id);
        logger.info('MTT pruned empty table', { tournamentId, tableId: row.id });
      } catch (err) {
        logger.warn('MTT prune failed', { tournamentId, tableId: row.id, err });
      }
    }
  }

  /** True if the table has an uncompleted poker_hand row (still mid-deal). */
  private async isTableMidHand(tableId: string): Promise<boolean> {
    const r = await this.pool.query(
      `SELECT 1 FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL LIMIT 1`,
      [tableId],
    );
    return r.rows.length > 0;
  }

  /**
   * MTT post-hand hook. Two responsibilities:
   *
   *  1. Final-table collapse: when total seated (across all tables) ≤ final-table size AND
   *     there are 2+ tables, mark the triggering table as `is_final_table = TRUE` and move
   *     every player from the (between-hands) source tables onto it. Sources that are
   *     currently mid-hand are skipped — they'll be moved on their own post-hand pass, so
   *     consolidation completes incrementally over the next few hands.
   *
   *  2. Empty-table pruning: tables left without seats after eliminations are dropped from
   *     `poker_tables` so the scheduler + HUD ignore them.
   *
   * Why the triggering table is the target: it's guaranteed between hands (we're inside its
   * post-hand callback). Picking the "most populated" table as the target would risk moving
   * players INTO a mid-hand chevtek instance — the player's seat would exist in the DB but
   * the in-memory `Table` wouldn't know about them until the hand resolved.
   *
   * Lone-survivor consolidation (single player at a non-final table while another table still
   * has spots) is intentionally deferred to Phase 2.
   */
  private async maybeConsolidateTables(
    tournamentId: string,
    config: PokerTournamentConfig,
    triggeringTableId: string,
  ): Promise<void> {
    const tables = await this.listTournamentTables(tournamentId);
    if (tables.length <= 1) {
      // SNG or already-consolidated MTT — nothing to do beyond empty-table pruning (which
      // already happened in syncAfterHand's elimination loop).
      return;
    }

    const finalSize = this.effectiveFinalTableSize(config);
    const totalSeated = tables.reduce((sum, t) => sum + t.seatCount, 0);

    // Prune empty tables first so they don't show up as sources / inflate table count.
    const nonEmpty = tables.filter((t) => t.seatCount > 0);
    if (nonEmpty.length < tables.length) {
      await this.pruneEmptyTournamentTables(tournamentId, triggeringTableId);
    }

    if (nonEmpty.length <= 1) return;
    if (totalSeated > finalSize) return;
    if (totalSeated < 2) return; // Tournament is about to complete — let syncAfterHand handle it.

    // Target = the table we're already between hands on. If the triggering table is already
    // empty (everyone busted on it this hand) we cannot use it; fall back to *any* non-empty
    // table that isn't mid-hand. That fallback is rare enough that the simple linear scan is fine.
    let target = nonEmpty.find((t) => t.id === triggeringTableId) ?? null;
    if (!target) {
      for (const candidate of nonEmpty) {
        if (!(await this.isTableMidHand(candidate.id))) {
          target = candidate;
          break;
        }
      }
    }
    if (!target) {
      logger.info('MTT consolidation deferred: no safe target table (all mid-hand)', { tournamentId, totalSeated, finalSize });
      return;
    }

    // Filter source tables to those safe to move from RIGHT NOW (not mid-hand). Mid-hand
    // tables get skipped this pass — their own post-hand callback will pull them in next.
    const sourceCandidates = nonEmpty.filter((t) => t.id !== target!.id);
    const sources: typeof sourceCandidates = [];
    for (const src of sourceCandidates) {
      if (await this.isTableMidHand(src.id)) {
        logger.info('MTT consolidation: source table mid-hand, deferring', { tournamentId, sourceTableId: src.id });
        continue;
      }
      sources.push(src);
    }
    if (sources.length === 0) {
      // No-op this pass; the deferred sources will re-trigger consolidation on their own
      // post-hand callbacks. Still flip is_final_table on target so the HUD knows.
      await this.pool.query(`UPDATE poker_tables SET is_final_table = TRUE WHERE id = $1`, [target.id]);
      return;
    }

    logger.info('MTT consolidating to final table', {
      tournamentId,
      targetTableId: target.id,
      targetSeq: target.seq,
      totalSeated,
      finalSize,
      sourceTables: sources.map((s) => ({ id: s.id, seatCount: s.seatCount })),
    });

    // Mark target as the final table so the HUD can show the badge before the moves land.
    await this.pool.query(
      `UPDATE poker_tables SET is_final_table = TRUE WHERE id = $1`,
      [target.id],
    );

    const movedPlayers: Array<{ address: string; fromTableId: string; toTableId: string }> = [];
    for (const src of sources) {
      const seats = await this.pool.query<{ player_address: string }>(
        `SELECT player_address FROM poker_seats WHERE table_id = $1 ORDER BY position`,
        [src.id],
      );
      for (const seat of seats.rows) {
        const addr = seat.player_address;
        try {
          await this.movePlayerBetweenTables(tournamentId, src.id, target.id, addr);
          movedPlayers.push({ address: addr.toLowerCase(), fromTableId: src.id, toTableId: target.id });
        } catch (err) {
          logger.error('MTT move during consolidation failed', {
            tournamentId, fromTableId: src.id, toTableId: target.id, addr, err,
          });
        }
      }
    }

    await this.pruneEmptyTournamentTables(tournamentId, target.id);

    this.broadcast(`poker_tournament:${tournamentId}`, 'poker_tournament_table_consolidated', {
      tournamentId,
      finalTableId: target.id,
      finalTableSeq: target.seq,
      moves: movedPlayers,
    });

    // Kick the final table to start its next hand if it isn't already running one.
    try {
      await this.pokerGameService.startHand(target.id);
    } catch (err) {
      logger.warn('MTT final-table startHand after consolidation failed', { tournamentId, targetTableId: target.id, err });
    }
  }
}

// ---------------------------------------------------------------------------
// Prize percentage helpers — must match calculate_tournament_prizes (e.g. migration 033)
// ---------------------------------------------------------------------------

function getPrizePercentagesForType(type: string): number[] {
  switch (type) {
    case 'winner_takes_all':
      return [100];
    case 'top_3':
    case 'top_3_steep':
      return [50, 30, 20];
    case 'top_5':
      return [40, 25, 15, 12, 8];
    case 'top_10':
    case 'custom':
    default:
      return [56, 20, 10, 2, 2, 2, 2, 2, 2, 2];
  }
}

function parsePrizePercentagesFromDb(raw: unknown, distributionType: string): number[] {
  if (raw != null) {
    try {
      const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(v) && v.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        return v.map((n: number) => Math.round(n));
      }
    } catch {
      /* use preset below */
    }
  }
  return getPrizePercentagesForType(distributionType);
}
