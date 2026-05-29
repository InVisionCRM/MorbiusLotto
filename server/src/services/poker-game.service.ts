import { Pool } from 'pg';
import { Table, Card, CardRank, CardSuit, BettingRound } from '@chevtek/poker-engine';
import { bestHand } from './poker-hand-eval';
import { DatabaseService } from './database.service';
import { ProvablyFairService } from './provably-fair.service';
import { CosmeticsService } from './cosmetics.service';
import { randomPlaceholderConfig } from '../lib/cosmetics-catalog';
import { chipsToWei, getPokerRakeWallet, splitBigIntEqually, totalPotChips, POKER_CHIP_WEI } from '../lib/poker-chip-scale';
import { computeTableLogoChangePriceMorbiusChips } from '../lib/poker-table-logo-pricing';
// Sponsorship purchase length caps for trust-the-client token metadata.
const SPONSOR_TOKEN_NAME_MAX = 128;
const SPONSOR_TOKEN_SYMBOL_MAX = 32;
const SPONSOR_TOKEN_LOGO_URL_MAX = 1024;
const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
import { applyPokerChipDelta } from './poker-chip-wallet';
import {
  applyWheelWagerCredit,
  recordDailyMilestone,
  recordGameOutcome,
} from './wheel-spin-wallet';
import {
  getCashBuyInBoundsChips,
  POKER_CASH_MAX_BUY_IN_BB,
  POKER_CASH_MIN_BUY_IN_BB,
} from '../lib/poker-cash-buy-in';
import { decidePokerBotAction } from '../lib/poker-bot-ai';
import { getServerPokerBotAddressSet } from '../lib/poker-server-bot-addresses';
import {
  railCashPlayerJoined,
  railCashTableCreated,
  railCashBigPot,
} from './telegram-rail.service';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export type PokerStreet = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface PokerTableSummary {
  id: string;
  smallBlind: string;
  bigBlind: string;
  maxSeats: number;
  status: string;
  seatedCount: number;
  emptySeats: number;
  hasPin: boolean;
  /** Lowercase 0x creator; null for legacy tables. */
  creatorAddress: string | null;
  /** ISO8601 when the table row was created (server clock). */
  createdAt: string | null;
}

export interface PokerSeatState {
  position: number;
  playerAddress: string | null;
  stack: string;
  status: string;
  consecutiveTimeouts?: number;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isActing: boolean;
  folded: boolean;
  currentBet: string;
  displayName?: string | null;
  profileImageUrl?: string | null;
  avatarConfig?: Record<string, unknown> | null;
  profileDisplayMode?: 'avatar' | 'photo';
}

export interface PokerCurrentHand {
  handId: string;
  street: PokerStreet;
  communityCards: number[];
  /** Sum of all pots (kept as scalar for backward-compat clients). */
  pot: string;
  /**
   * Structured pot breakdown — main pot + each side/uncalled pot, in the
   * order chevtek created them. Lets the client render side pots as
   * separately labeled stacks instead of a single flat total, and drive
   * per-pot chip-flow animations at showdown (each pot's chips fly to
   * THAT pot's winner). Only populated while a hand is in progress with
   * an active in-memory table — falls back to the `pot` scalar otherwise.
   *
   * `winnerAddresses` is populated once chevtek's `showdown()` has run,
   * including for "uncalled" refund pots (sole eligible player) so the
   * client can fly those chips back to the over-bettor.
   */
  pots?: {
    amount: string;
    label: string;
    winnerAddresses?: string[];
  }[];
  actingPosition: number | null;
  lastAction: { position: number; action: string; amount: string } | null;
  /**
   * Recent non-blind actions across the hand, oldest → newest. Each carries its own
   * `street` and monotonic `order`, so the client can log every action even when
   * rapid server broadcasts are batched into a single React state update.
   */
  recentActions?: {
    order: number;
    street: PokerStreet;
    position: number;
    action: string;
    amount: string;
  }[];
  /** Latest non-blind action for each seat on the current street, keyed by seat position. */
  streetActions?: Record<number, { action: string; amount: string }>;
  minRaise: string;
  /** Amount the acting player must put in to call (0 if can check). */
  toCall: string;
  /** ISO timestamp of when the current player's turn started (for the 60s timer). */
  turnStartedAt: string | null;
  /** At showdown: all players' revealed hole cards keyed by address */
  showdownHands?: Record<string, number[]>;
  /**
   * At showdown: true when at least two dealt-in players did not fold (real showdown).
   * False on fold-out wins — clients must not expose uncalled winners' hole cards.
   */
  handWentToShowdown?: boolean;
  /**
   * Fold-out (uncontested) winner address when handWentToShowdown=false. Used by
   * the client to offer that player the "Show / Muck" choice during the brief
   * window after the hand resolves. Lowercase.
   */
  foldOutWinnerAddress?: string;
  /**
   * ISO wall time when the fold-out winner's Show/Muck choice expires. Set
   * while `foldOutShowDecision === 'pending'` and the window is still open.
   * Omitted once the player decides or the window closes.
   */
  foldOutShowMuckExpiresAt?: string;
  /**
   * Outcome of the fold-out winner's choice: `'pending'` while the window is
   * open, `'shown'` after they opted to reveal, `'mucked'` after they opted to
   * hide. Cleared on the next hand.
   */
  foldOutShowDecision?: 'pending' | 'shown' | 'mucked';
  /** At showdown: winner(s), amount each receives, optional hand name, and 5 card indices forming best hand */
  winners?: { address: string; amount: string; handName?: string; winningCardIndices?: number[] }[];
  /** ISO wall time when the server will auto-start the next hand (showdown intermission only). */
  nextHandAt?: string | null;
  /**
   * Provably-fair commitment — `SHA-256(serverSeed)` published at hand start.
   * Plaintext `serverSeed` stays hidden until showdown (see
   * `poker_hand_pending_seeds`); the hash lets the UI prove "deck was
   * locked in before the deal" in real time. After showdown, players can
   * verify the full proof at `/poker/verify?handId={handId}`.
   */
  serverSeedHash?: string;
}

export interface PokerTableState {
  tableId: string;
  smallBlind: string;
  bigBlind: string;
  maxSeats: number;
  status: string;
  seats: PokerSeatState[];
  currentHand: PokerCurrentHand | null;
  /** Hole cards only for the requesting player */
  myHoleCards: number[] | null;
  /**
   * Sponsored marketing logo filename (gallery file under `public/Marketing /LOGOS/`).
   * Null when idle — clients show the default Morbius logo on the felt.
   */
  tableLogo?: string | null;
  /** Logo opacity (0–1). */
  tableLogoOpacity?: number | null;
  /** ISO end time of current paid logo window, or null if idle. */
  tableLogoSponsoredUntil?: string | null;
  /** Last sponsor wallet (lowercase), for UI. */
  tableLogoSponsorAddress?: string | null;
  /** True when no active sponsorship (felt uses default Morbius token). */
  tableLogoIsDefault?: boolean;
  /** Whole MORBIUS chips (string) for the next logo change at this moment. */
  tableLogoPriceMorbiusChips?: string;
  /** Sponsored token contract address (lowercased), or null when idle. */
  tableLogoTokenAddress?: string | null;
  tableLogoTokenName?: string | null;
  tableLogoTokenSymbol?: string | null;
  tableLogoTokenLogoUrl?: string | null;
  /** Set when `poker_tables.tournament_id` is non-null (SNG / scheduled poker tournament). */
  tournamentId?: string | null;
}

// ---------------------------------------------------------------------------
// Card encoding helpers
// ---------------------------------------------------------------------------
// Our int encoding: suitIndex = floor(n/13), rankIndex = n%13
// Suits: clubs(0), diamonds(1), hearts(2), spades(3) → 'c','d','h','s'
// Ranks (index 0-12): 2,3,4,5,6,7,8,9,T,J,Q,K,A

const INT_RANKS: CardRank[] = [
  CardRank.TWO, CardRank.THREE, CardRank.FOUR, CardRank.FIVE,
  CardRank.SIX, CardRank.SEVEN, CardRank.EIGHT, CardRank.NINE,
  CardRank.TEN, CardRank.JACK, CardRank.QUEEN, CardRank.KING, CardRank.ACE,
];
const INT_SUITS: CardSuit[] = [CardSuit.CLUB, CardSuit.DIAMOND, CardSuit.HEART, CardSuit.SPADE];

function intToCard(n: number): Card {
  const rankIdx = n % 13;
  const suitIdx = Math.floor(n / 13);
  return new Card(INT_RANKS[rankIdx], INT_SUITS[suitIdx]);
}

function cardToInt(card: Card): number {
  const rankIdx = INT_RANKS.indexOf(card.rank);
  const suitIdx = INT_SUITS.indexOf(card.suit);
  return suitIdx * 13 + rankIdx;
}

/**
 * Patch a chevtek `Table` instance to fix a fold-out pot-award bug.
 *
 * Chevtek's `gatherBets` filters folded players out of `pot.eligiblePlayers`
 * only on the multi-bettor path (Table.js:346). On fold-out paths the
 * showdown→gatherBets call hits the early-return branch (≤1 bettor with
 * uncalled bet), and that filter never runs — so prior streets' pots still
 * list the folder as eligible. Pokersolver then evaluates the folder's
 * hand alongside the survivor's in `pot.winners = findWinners(eligibles)`
 * and may award the pot to the folder.
 *
 * We wrap `gatherBets` so the filter always runs, regardless of which
 * branch chevtek took. Side effect: also fixes any non-fold-out paths
 * that somehow skipped the filter.
 */
function applyEnginePatches(table: Table): void {
  const origGatherBets = table.gatherBets.bind(table);
  (table as any).gatherBets = function patchedGatherBets() {
    origGatherBets();
    for (const pot of this.pots) {
      pot.eligiblePlayers = pot.eligiblePlayers.filter(
        (p: any) => p && !p.folded && !p.left,
      );
    }
  };
}

function chevtekStreetToPoker(round: BettingRound | undefined, hasWinners: boolean): PokerStreet {
  if (round === undefined && hasWinners) return 'showdown';
  switch (round) {
    case BettingRound.PRE_FLOP: return 'preflop';
    case BettingRound.FLOP: return 'flop';
    case BettingRound.TURN: return 'turn';
    case BettingRound.RIVER: return 'river';
    default: return 'showdown';
  }
}

// ---------------------------------------------------------------------------
// Rake configuration (cash games only — tournaments use virtual chips)
// ---------------------------------------------------------------------------
const RAKE_PERCENT = 5; // 5% of each pot

// Cash-game AFK auto-sit-out threshold: after this many consecutive timeouts
// (auto-folds or auto-checks with no voluntary action between), the player is
// flipped to `status = 'sitting_out'` and dealt out of future hands until they
// click "I'm Back". In tournaments this counter still increments for UI/telemetry
// purposes, but does NOT change seat eligibility — AFK tournament players
// continue to be dealt in and post blinds until they bust out, since granting
// them a chip-preservation refuge would be unfair to the rest of the field.
const POKER_AFK_KICK_AFTER = 2;
// Hard-AFK fast-fold clock (seconds). Once a player's consecutive_timeouts
// reaches POKER_AFK_KICK_AFTER, the auto-fold sweep stops waiting the normal
// 60s/90s for their turn — it cuts them down to this much shorter window so
// the rest of the table isn't held hostage. In tournaments this is what
// actually drives the bleed-out (the player is still dealt and still posts
// blinds, but each acting turn folds within ~5s instead of 60s). Cleared by
// any voluntary action OR by clicking "I'm Back".
const POKER_AFK_FAST_FOLD_SECONDS = 5;
// Post-showdown pause before the next hand is dealt. Keep in sync with
// `POKER_BETWEEN_HANDS_DELAY_MS` in `lib/poker-between-hands-delay.ts`.
const SHOWDOWN_DELAY_MS = 15_000;
const SHOWDOWN_DELAY_SECONDS = SHOWDOWN_DELAY_MS / 1000;

// Server-driven all-in runout: per-street pause between broadcasts. The total
// time from "runout begins" to "showdown frame" is the sum of the steps that
// actually fire. Preflop all-in = flop + turn + river ≈ 5.5s before showdown.
// Tunable but kept close to the previous client-side cadence so the feel is
// preserved.
const RUNOUT_STEP_DELAY_MS = {
  toFlop: 2000,
  toTurn: 2000,
  toRiver: 1500,
  /** Tiny beat after the river frame before flipping hole cards + winners. */
  toShowdown: 600,
};
// Recovery sweep waits this long after `runout_resolved_at` before
// fast-forwarding a stuck mid-runout hand. Picked so a normal preflop runout
// (~6s wall clock) finishes well before the threshold.
const RUNOUT_STUCK_THRESHOLD_SECONDS = 30;

// Fold-out (uncontested) win: time the winning player has to choose "Show" vs
// "Muck" before the window closes and the cards stay hidden. Must be shorter
// than SHOWDOWN_DELAY_MS so the offer never overlaps the next hand's deal.
const FOLD_OUT_SHOW_WINDOW_MS = 8_000;

interface FoldOutShowEligibility {
  handId: string;
  /** Lowercase winner address. */
  winnerAddress: string;
  /** Epoch-ms after which the offer has expired. */
  expiresAt: number;
  decision: 'pending' | 'shown' | 'mucked';
  /** Populated once the winner clicks "Show". */
  revealedHoleCards?: number[];
}

// ---------------------------------------------------------------------------
// PokerGameService
// ---------------------------------------------------------------------------

export class PokerGameService {
  private broadcastCallback: ((tableId: string) => Promise<void>) | null = null;
  private postHandCallback: ((tableId: string, handNumber: number) => Promise<void>) | null = null;
  /** When &lt; 2 seated stacks remain, tournament tables may need a no-deal recovery pass. */
  private tournamentUnderfilledRecovery: ((tableId: string) => Promise<void>) | null = null;
  private notifyCallback: ((room: string, type: string, payload: any) => void) | null = null;
  private activeTables: Map<string, Table> = new Map();
  private nextHandTimers: Map<string, NodeJS.Timeout> = new Map();
  /** Per-table mutex to serialize playerAction / autoFold / leaveTable calls. */
  private tableLocks: Map<string, Promise<void>> = new Map();
  /** Starting stacks (whole chips) captured at hand deal, keyed by handId -> address. */
  private handStartingStacks: Map<string, Map<string, bigint>> = new Map();
  /**
   * Hand number of the most-recently-completed hand per tableId, stashed by
   * `persistShowdown` so the deferred post-hand callback (eliminations, blind
   * updates) can fire from inside the inter-hand timer instead of immediately
   * on showdown — that way the busted tournament player stays seated through
   * the full reveal + 15-second post-showdown window. Read+deleted by
   * `scheduleNextHandAfterShowdown`'s timer body.
   */
  private pendingPostHandHandNumbers: Map<string, number> = new Map();
  /** Bail flag for `recoverStuckPostHandTables` so overlapping ticks can't pile up. */
  private recoveryInFlight = false;
  /**
   * Active server-driven runout timers — one per table. Cleared on completion,
   * on `clearScheduledNextHand` (leaveTable / standUp mid-runout), and on
   * recovery fast-forward.
   */
  private runoutTimers: Map<string, NodeJS.Timeout> = new Map();
  /** Tables currently animating an all-in runout. Read by callers that need
   *  to know "is the table mid-resolve" without hitting the DB. */
  private runoutInFlight: Set<string> = new Set();
  /**
   * Per-table snapshot of each player's pre-payout chip stack, used to freeze
   * the displayed stacks during an all-in runout so the board reveal doesn't
   * leak the winner (otherwise the seat plate updates to the post-payout
   * value the instant chevtek auto-resolves). Keyed by tableId → (lowercase
   * player address → chip-int string). Populated in `scheduleRunout` before
   * the first staged broadcast and cleared at the showdown frame so the
   * stack change is revealed alongside the winner badges.
   */
  private runoutFrozenStacks: Map<string, Map<string, string>> = new Map();
  /**
   * Per-table fold-out show/muck offer state. Populated by `persistShowdown`
   * when the hand ended without a showdown (sole survivor), consumed by
   * `getTableState` (to expose offer / revealed cards) and `decideFoldOutShow`
   * (to record the winner's choice). Stale entries are harmless — readers
   * always gate on `handId === currentHand.handId`.
   */
  private foldOutShowEligibility: Map<string, FoldOutShowEligibility> = new Map();
  /**
   * Per-step runout delays default on in production, off under jest. When
   * disabled `scheduleRunout` runs all frames inline (no setTimeout chain),
   * so existing integration tests can assert on post-showdown DB state
   * immediately after the triggering action without polling. Toggle via
   * `setRunoutDelaysForTesting(enabled)` if a test needs the production
   * pacing.
   */
  private runoutDelaysEnabled = process.env.NODE_ENV !== 'test';

  constructor(
    private dbService: DatabaseService,
    private pfService: ProvablyFairService
  ) {}

  /** Wire in the WebSocket broadcast so actions push state to clients. */
  setBroadcastCallback(cb: (tableId: string) => Promise<void>): void {
    this.broadcastCallback = cb;
  }

  /** Register a callback for push notifications (e.g. player kicked, sitting out). */
  setNotifyCallback(cb: (room: string, type: string, payload: any) => void): void {
    this.notifyCallback = cb;
  }

  /** Register a callback fired after every showdown (used by PokerTournamentService to sync chips). */
  setPostHandCallback(cb: (tableId: string, handNumber: number) => Promise<void>): void {
    this.postHandCallback = cb;
  }

  /**
   * Called when a tournament table cannot start the next hand because fewer than two seats have stack &gt; 0.
   * Applies late eliminations and may complete the SNG.
   */
  setTournamentUnderfilledRecovery(cb: (tableId: string) => Promise<void>): void {
    this.tournamentUnderfilledRecovery = cb;
  }

  private getPool(): Pool {
    return this.dbService.getPool();
  }

  /**
   * Serialize async operations on a given table so that concurrent
   * playerAction / autoFold / leaveTable calls cannot interleave.
   */
  private async withTableLock<T>(tableId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tableLocks.get(tableId) ?? Promise.resolve();
    let resolve!: () => void;
    const next = new Promise<void>((r) => { resolve = r; });
    this.tableLocks.set(tableId, next);
    try {
      await prev; // wait for any in-flight operation on this table
      return await fn();
    } finally {
      resolve();
      // Clean up when no further work is queued
      if (this.tableLocks.get(tableId) === next) {
        this.tableLocks.delete(tableId);
      }
    }
  }

  /** Cached tournament-mode flag; invalidated on table delete. */
  private tournamentModeCache = new Map<string, boolean>();

  private invalidateTableScaling(tableId: string): void {
    this.tournamentModeCache.delete(tableId);
  }

  private async isTournamentTable(tableId: string): Promise<boolean> {
    const cached = this.tournamentModeCache.get(tableId);
    if (cached !== undefined) return cached;
    const pool = this.getPool();
    const r = await pool.query('SELECT tournament_mode FROM poker_tables WHERE id = $1', [tableId]);
    if (r.rows.length === 0) throw new Error('Table not found');
    const tournament = !!r.rows[0].tournament_mode;
    this.tournamentModeCache.set(tableId, tournament);
    return tournament;
  }

  private normalizeAddress(addr: string): string {
    return (addr || '').trim().toLowerCase();
  }

  /**
   * DB remains the canonical source of poker hand/seat state.
   * In-memory table state is an execution cache and can be reconstructed.
   */
  private async getOrReconstructActiveTable(
    tableId: string,
    pool: Pool,
    reason: 'player_action' | 'timeout_autofold',
  ): Promise<Table> {
    let table = this.activeTables.get(tableId);
    if (!table) {
      try {
        table = await this.reconstructTable(tableId, pool);
        this.activeTables.set(tableId, table);
        logger.warn('Poker table cache miss recovered via DB reconstruction', { tableId, reason });
      } catch (error) {
        logger.error('Poker table reconstruction failed', { tableId, reason, error });
        throw error;
      }
    }
    return table;
  }

  private clearScheduledNextHand(tableId: string): void {
    const timer = this.nextHandTimers.get(tableId);
    if (timer) {
      clearTimeout(timer);
      this.nextHandTimers.delete(tableId);
    }
    this.clearRunoutTimer(tableId);
  }

  private clearRunoutTimer(tableId: string): void {
    const timer = this.runoutTimers.get(tableId);
    if (timer) {
      clearTimeout(timer);
      this.runoutTimers.delete(tableId);
    }
    this.runoutInFlight.delete(tableId);
    this.runoutFrozenStacks.delete(tableId);
  }

  /**
   * Test-only: drop runout per-step delays to 0 so tests can drive a full
   * runout synchronously. Mirrors the production pacing in semantics — just
   * collapses the wall-clock waits.
   */
  setRunoutDelaysForTesting(enabled: boolean): void {
    this.runoutDelaysEnabled = enabled;
  }

  /**
   * Showdown entry point. Two paths:
   *
   * (a) Single-street showdown — river already on the board (or fold-out
   *     resolution): persist immediately. Caller schedules next hand.
   *
   * (b) Multi-street all-in runout — chevtek auto-resolved one or more
   *     streets in this action. Snapshot the final state, then chain
   *     intermediate broadcasts (flop / turn / river) before finally calling
   *     persistShowdown on the showdown frame. Caller does NOT schedule next
   *     hand; the final runout step schedules it.
   *
   * Returns `true` when the showdown work is deferred to runout timers; the
   * caller should NOT call `scheduleNextHandAfterShowdown` in that case
   * (the runout chain does it). Returns `false` when persistShowdown ran
   * inline.
   */
  private async completeShowdownWithOptionalRunout(
    pool: Pool,
    tableId: string,
    handId: string,
    table: Table,
    communityLenBefore: number,
  ): Promise<boolean> {
    const communityLenAfter = table.communityCards?.length ?? 0;
    const runoutSteps = Math.max(0, communityLenAfter - communityLenBefore);
    // ≥1 extra community card means chevtek dealt streets we haven't shown
    // the client yet. Stage them. Note: river already on board (communityLenBefore===5)
    // would be runoutSteps===0, falling through to inline persist — correct.
    if (runoutSteps >= 1) {
      await this.scheduleRunout(pool, tableId, handId, table, communityLenBefore);
      return true;
    }
    await this.persistShowdown(pool, tableId, handId, table);
    return false;
  }

  /**
   * Snapshot the resolved table + chain intermediate broadcasts. Each tick
   * updates `poker_hands.street` + `community_cards` to the in-progress
   * intermediate value and broadcasts. The final tick calls `persistShowdown`
   * (which writes winners, completed_at, etc.) and schedules the next hand.
   *
   * The full final board is also persisted to `runout_final_community_cards`
   * up-front so the recovery sweep can fast-forward if the server crashes
   * mid-stream.
   */
  private async scheduleRunout(
    pool: Pool,
    tableId: string,
    handId: string,
    table: Table,
    communityLenBefore: number,
  ): Promise<void> {
    const finalCommunityInts = table.communityCards.map(cardToInt);

    // Stamp the runout snapshot before any broadcast. After this point the
    // recovery sweep can finish the hand even if the server dies right now.
    //
    // chevtek's `nextAction` → `showdown` already auto-resolved the hand,
    // which means `player.stackSize` includes the pot awards. If we let the
    // staged flop/turn/river broadcasts go out with those values, the seat
    // plate updates before the cards reveal and the winner is leaked. So we
    // snapshot the *pre-payout* stack for each player here (post − winnings
    // from each pot they won) and serve that from getTableState until
    // finalizeShowdown clears the snapshot at the showdown frame. The DB
    // gets the true post-payout values from syncSeatsFromTable below (kept
    // current for crash recovery) — only the wire format is frozen.
    const winningsByAddr = new Map<string, bigint>();
    for (const pot of table.pots) {
      if (!pot.winners || pot.winners.length === 0) continue;
      const potChips = BigInt(Math.max(0, Math.round(pot.amount)));
      const ids = pot.winners.map((w: any) => w.id as string);
      const shares = splitBigIntEqually(potChips, ids.length);
      for (let i = 0; i < ids.length; i++) {
        winningsByAddr.set(ids[i], (winningsByAddr.get(ids[i]) ?? 0n) + shares[i]);
      }
    }
    const frozen = new Map<string, string>();
    for (const player of table.players) {
      if (!player) continue;
      const post = BigInt(Math.max(0, Math.round(player.stackSize)));
      const won = winningsByAddr.get(player.id) ?? 0n;
      const pre = post > won ? post - won : 0n;
      frozen.set(this.normalizeAddress(player.id), pre.toString());
    }
    this.runoutFrozenStacks.set(tableId, frozen);

    await this.syncSeatsFromTable(pool, tableId, table);
    await pool.query(
      `UPDATE poker_hands
          SET runout_resolved_at = NOW(),
              runout_final_community_cards = $2::JSONB
        WHERE id = $1`,
      [handId, JSON.stringify(finalCommunityInts)],
    );

    this.runoutInFlight.add(tableId);

    // Build the per-street schedule. Each entry: how many community cards
    // visible at this step (3/4/5) and the wait before publishing it.
    type Step = { count: 3 | 4 | 5; street: 'flop' | 'turn' | 'river'; delayMs: number };
    const steps: Step[] = [];
    if (communityLenBefore < 3) steps.push({ count: 3, street: 'flop', delayMs: RUNOUT_STEP_DELAY_MS.toFlop });
    if (communityLenBefore < 4) steps.push({ count: 4, street: 'turn', delayMs: RUNOUT_STEP_DELAY_MS.toTurn });
    if (communityLenBefore < 5) steps.push({ count: 5, street: 'river', delayMs: RUNOUT_STEP_DELAY_MS.toRiver });

    const publishStep = async (idx: number): Promise<void> => {
      const step = steps[idx];
      try {
        const partial = finalCommunityInts.slice(0, step.count);
        await pool.query(
          `UPDATE poker_hands
              SET street = $2, community_cards = $3::JSONB
            WHERE id = $1`,
          [handId, step.street, JSON.stringify(partial)],
        );
        await this.broadcastState(tableId);
      } catch (err) {
        logger.error('Poker runout step persist/broadcast failed', { tableId, handId, idx, err });
        // Don't abort the chain on a single step failure — the recovery sweep
        // will catch a fully stuck runout, but in the meantime keep moving
        // toward showdown so chips don't sit frozen indefinitely.
      }
    };

    const finalizeShowdown = async (): Promise<void> => {
      await this.persistShowdown(pool, tableId, handId, table);
      // Drop the frozen-stack overlay BEFORE the final broadcast so the
      // showdown frame reveals the true post-payout stacks alongside the
      // winner badges. Order matters: clear, then broadcast.
      this.runoutFrozenStacks.delete(tableId);
      await this.broadcastState(tableId);
      this.runoutInFlight.delete(tableId);
      this.runoutTimers.delete(tableId);
      this.scheduleNextHandAfterShowdown(tableId);
    };

    if (!this.runoutDelaysEnabled) {
      // Test / synchronous mode: skip the intermediate broadcasts and finalize
      // immediately. The intermediate frames are a UX concern, not a
      // correctness concern — collapsing them in tests preserves the pre-Phase-2
      // semantics existing assertions expect ("right after all-in →
      // completed_at is set"). Tests that specifically want to observe the
      // intermediate frames opt back into production pacing via
      // `setRunoutDelaysForTesting(true)`.
      await finalizeShowdown();
      return;
    }

    // Production: chain setTimeouts so observers see each frame paced. Each
    // tick acquires the per-table lock so a concurrent `playerAction`,
    // `leaveTable`, or `autoFoldTimedOutTurns` can't interleave with a
    // mid-flight DB UPDATE or broadcast. If something else already collapsed
    // the runout (e.g. a player left and triggered `finalizeRunoutImmediately`),
    // the `runoutInFlight` check at the top of the locked region makes this
    // tick a no-op.
    const runStep = async (idx: number): Promise<void> => {
      await this.withTableLock(tableId, async () => {
        if (!this.runoutInFlight.has(tableId)) {
          // Runout was finalized out from under us. The cleared timer should
          // already have prevented this tick from firing, but defensively
          // abort here in case the timer was already in flight when the
          // finalize ran.
          return;
        }
        if (idx >= steps.length) {
          await finalizeShowdown();
          return;
        }
        await publishStep(idx);
        const nextDelay = steps[idx + 1]?.delayMs ?? RUNOUT_STEP_DELAY_MS.toShowdown;
        const timer = setTimeout(() => {
          runStep(idx + 1).catch((err) =>
            logger.error('Poker runout chain error', { tableId, handId, err }),
          );
        }, nextDelay);
        this.runoutTimers.set(tableId, timer);
      });
    };

    const firstTimer = setTimeout(() => {
      runStep(0).catch((err) =>
        logger.error('Poker runout chain error (first step)', { tableId, handId, err }),
      );
    }, steps[0].delayMs);
    this.runoutTimers.set(tableId, firstTimer);
  }

  /**
   * Collapse an in-flight runout to its final showdown state right now.
   *
   * Two call sites:
   * 1. Live: player leaves mid-runout and we need their stack credited
   *    before we strip their seat. The in-memory chevtek table is present;
   *    we cancel pending timers and finalize.
   * 2. Recovery: server restarted with `runout_resolved_at IS NOT NULL AND
   *    completed_at IS NULL` rows on disk. In-memory state is gone; we
   *    reconstruct from DB, which deterministically produces the same
   *    final chevtek state.
   *
   * No-op when no hand is mid-runout (idempotent — safe to call repeatedly
   * from a recovery sweep that may double-fire after a race).
   */
  private async finalizeRunoutImmediately(tableId: string): Promise<void> {
    this.clearRunoutTimer(tableId);

    const pool = this.getPool();
    const handRow = await pool.query(
      `SELECT id FROM poker_hands
        WHERE table_id = $1 AND completed_at IS NULL AND runout_resolved_at IS NOT NULL
        ORDER BY hand_number DESC LIMIT 1`,
      [tableId],
    );
    if (handRow.rows.length === 0) return;
    const handId: string = handRow.rows[0].id;

    let table: Table;
    try {
      table = await this.getOrReconstructActiveTable(tableId, pool, 'player_action');
    } catch (err) {
      logger.error('finalizeRunoutImmediately: table reconstruction failed', { tableId, handId, err });
      return;
    }
    // If reconstruction didn't yield a resolved state (no winners), force
    // chevtek to advance through any remaining streets. Defensive — should
    // already be at showdown since runout_resolved_at was set.
    if (table.currentRound || !table.winners) {
      try {
        while (table.currentRound) table.nextAction();
      } catch (err) {
        logger.error('finalizeRunoutImmediately: forced advance failed', { tableId, handId, err });
        return;
      }
    }

    try {
      await this.persistShowdown(pool, tableId, handId, table);
      this.runoutFrozenStacks.delete(tableId);
      await this.broadcastState(tableId);
      this.scheduleNextHandAfterShowdown(tableId);
    } catch (err) {
      logger.error('finalizeRunoutImmediately: persist/broadcast failed', { tableId, handId, err });
    }
  }

  /**
   * Centralizes the post-showdown transition: waits SHOWDOWN_DELAY_MS, then
   * runs the tournament post-hand callback (eliminations + blind updates)
   * BEFORE starting the next hand. Eliminations are deliberately deferred to
   * this moment so a busted player remains seated through the full reveal
   * window (cards stay flipped, chat works, no surprise auto-leave) and the
   * tournament-end check runs in time to cancel a stale `tryStartNextHand`.
   */
  private scheduleNextHandAfterShowdown(tableId: string): void {
    if (this.nextHandTimers.has(tableId)) return;

    const timer = setTimeout(async () => {
      this.nextHandTimers.delete(tableId);
      try {
        const handNumber = this.pendingPostHandHandNumbers.get(tableId);
        if (handNumber != null) {
          this.pendingPostHandHandNumbers.delete(tableId);
          if (this.postHandCallback) {
            try {
              await this.postHandCallback(tableId, handNumber);
            } catch (err) {
              // Defensive: a failed post-hand callback (e.g. tournament sync
              // race) must NOT block the next hand from starting, otherwise
              // the table sits frozen until manual intervention.
              logger.error('Post-hand tournament callback error', { tableId, handNumber, err });
            }
          }
        }
        // Stamp ALL pending hands on this table as processed — happy path,
        // crash recovery, and "no callback registered" all converge here.
        // Marking after the callback (succeed OR throw) prevents the sweep
        // from retrying a perpetually-failing callback in a tight loop.
        await this.getPool().query(
          `UPDATE poker_hands
              SET post_hand_processed_at = NOW()
            WHERE table_id = $1
              AND completed_at IS NOT NULL
              AND post_hand_processed_at IS NULL`,
          [tableId],
        );
        await this.tryStartNextHand(tableId);
        await this.broadcastState(tableId);
      } catch (error) {
        logger.error('Failed to transition to next poker hand after showdown delay', { tableId, error });
      }
    }, SHOWDOWN_DELAY_MS);

    this.nextHandTimers.set(tableId, timer);
  }

  /**
   * Self-healing sweep — finds any showdown whose deferred post-hand work
   * never ran (server restart during the 15s window, lost in-memory timer,
   * etc.) and finishes it. Must be safe to call repeatedly: every step
   * re-checks the `post_hand_processed_at` marker under the per-table lock
   * before mutating, and the partial index keeps the scan cheap.
   *
   * Wired into the existing 5s `pokerAutoFoldInterval` and called once
   * during server bootstrap.
   */
  async recoverStuckPostHandTables(): Promise<void> {
    if (this.recoveryInFlight) return;
    this.recoveryInFlight = true;
    try {
      const pool = this.getPool();

      // ── Mid-runout recovery ───────────────────────────────────────────────
      // Hands whose runout timer was lost (server restart between
      // `runout_resolved_at` and `completed_at`). Wall-clock budget for a
      // normal runout is ~6s, so anything older than 30s is genuinely stuck.
      // `finalizeRunoutImmediately` is idempotent and re-acquires the table
      // lock via persistShowdown → syncSeatsFromTable; we wrap each call in
      // `withTableLock` so a live action can't race us.
      const stuckRunouts = await pool.query<{ table_id: string; hand_id: string }>(
        `SELECT table_id, id AS hand_id
           FROM poker_hands
          WHERE runout_resolved_at IS NOT NULL
            AND completed_at IS NULL
            AND runout_resolved_at < NOW() - INTERVAL '${RUNOUT_STUCK_THRESHOLD_SECONDS} seconds'
          ORDER BY runout_resolved_at ASC
          LIMIT 25`,
      );
      for (const row of stuckRunouts.rows) {
        try {
          await this.withTableLock(row.table_id, async () => {
            // Re-check inside lock — a live finalize may have just landed.
            const stillStuck = await pool.query(
              `SELECT 1 FROM poker_hands
                WHERE id = $1 AND completed_at IS NULL AND runout_resolved_at IS NOT NULL`,
              [row.hand_id],
            );
            if (stillStuck.rows.length === 0) return;
            await this.finalizeRunoutImmediately(row.table_id);
            logger.info('Recovered stuck poker runout', { tableId: row.table_id, handId: row.hand_id });
          });
        } catch (err) {
          logger.error('Recovery: failed to finalize stuck runout', {
            tableId: row.table_id,
            handId: row.hand_id,
            err,
          });
        }
      }

      // ── Post-hand recovery (unchanged) ────────────────────────────────────
      // 20s threshold = 15s SHOWDOWN_DELAY_MS + 5s margin so we never race
      // the happy-path timer. LIMIT 25 keeps a single tick bounded; the
      // sweep runs again every 5s until the backlog is drained.
      const stuck = await pool.query<{
        table_id: string;
        hand_id: string;
        hand_number: number;
        completed_at: Date | string;
      }>(
        `SELECT h.table_id, h.id AS hand_id, h.hand_number, h.completed_at
           FROM poker_hands h
          WHERE h.completed_at IS NOT NULL
            AND h.post_hand_processed_at IS NULL
            AND h.completed_at < NOW() - INTERVAL '20 seconds'
          ORDER BY h.completed_at ASC
          LIMIT 25`,
      );

      for (const row of stuck.rows) {
        const tableId = row.table_id;
        const handId = row.hand_id;
        const handNumber = Number(row.hand_number ?? 0);
        const completedAtMs =
          row.completed_at instanceof Date
            ? row.completed_at.getTime()
            : new Date(row.completed_at).getTime();
        const completedAtAgeSeconds = Number.isFinite(completedAtMs)
          ? Math.round((Date.now() - completedAtMs) / 1000)
          : -1;

        let claimed = false;
        try {
          // Phase 1: atomically claim the row under the table lock so a
          // concurrent player action / live finalize can't race us. We mark
          // processed BEFORE running the post-hand callback — the callback
          // may call back into PokerGameService methods that take this same
          // lock (`leaveTableTournament` → `withTableLock`), so we must
          // release before invoking it.
          await this.withTableLock(tableId, async () => {
            const stillPending = await pool.query(
              `SELECT 1 FROM poker_hands
                WHERE id = $1 AND post_hand_processed_at IS NULL`,
              [handId],
            );
            if (stillPending.rows.length === 0) return;

            const updated = await pool.query(
              `UPDATE poker_hands
                  SET post_hand_processed_at = NOW()
                WHERE id = $1 AND post_hand_processed_at IS NULL`,
              [handId],
            );
            if ((updated.rowCount ?? 0) === 0) return;
            claimed = true;

            // Drop any stale in-memory state from before the restart so the
            // happy-path timer can't fire on top of us.
            this.pendingPostHandHandNumbers.delete(tableId);
            const ghostTimer = this.nextHandTimers.get(tableId);
            if (ghostTimer) {
              clearTimeout(ghostTimer);
              this.nextHandTimers.delete(tableId);
            }
          });

          // Phase 2: run the post-hand callback OUTSIDE the per-table lock.
          // `syncAfterHand` ultimately calls `leaveTableTournament`, which
          // acquires this same lock — keeping the callback inside Phase 1
          // would deadlock. Order doesn't matter: marking processed before
          // the callback still prevents tight retry loops if the callback
          // throws (matches the original "mark after, succeed-or-throw"
          // intent — the marker is set unconditionally either way).
          if (claimed && this.postHandCallback) {
            try {
              await this.postHandCallback(tableId, handNumber);
            } catch (err) {
              logger.error('Recovery: post-hand callback error', {
                tableId,
                handNumber,
                err,
              });
            }
          }

          // Phase 3: kick off the next hand OUTSIDE the per-table lock —
          // `tryStartNextHand` acquires the same lock internally. We already
          // filtered on completed_at > 20s ago, so the SHOWDOWN_DELAY_MS
          // window has elapsed and there's no need to arm another timer.
          if (claimed) {
            await this.tryStartNextHand(tableId);
            await this.broadcastState(tableId);
            logger.info('Recovered stuck poker post-hand work', {
              tableId,
              handNumber,
              completedAtAgeSeconds,
            });
          }
        } catch (err) {
          // Per-row failures (e.g. table deleted between query + lock,
          // transient DB hiccup) must NOT poison the rest of the sweep.
          logger.error('Recovery: failed to process stuck poker hand', {
            tableId,
            handId,
            handNumber,
            err,
          });
        }
      }
    } catch (err) {
      logger.error('recoverStuckPostHandTables sweep error', { err });
    } finally {
      this.recoveryInFlight = false;
    }
  }

  private async broadcastState(tableId: string): Promise<void> {
    if (this.broadcastCallback) {
      await this.broadcastCallback(tableId).catch(() => {});
    }
  }

  // ---------------------------------------------------------------------------
  // Table CRUD
  // ---------------------------------------------------------------------------

  async listTables(): Promise<PokerTableSummary[]> {
    const pool = this.getPool();
    const result = await pool.query(
      `SELECT t.id, t.small_blind, t.big_blind, t.max_seats, t.status, t.pin_code, t.created_at, t.creator_address,
              COUNT(s.id) FILTER (WHERE s.player_address IS NOT NULL) AS seated_count
       FROM poker_tables t
       LEFT JOIN poker_seats s ON s.table_id = t.id
       WHERE t.status IN ('waiting', 'playing') AND (t.tournament_mode IS NULL OR t.tournament_mode = FALSE)
       GROUP BY t.id, t.small_blind, t.big_blind, t.max_seats, t.status, t.pin_code, t.created_at, t.creator_address
       ORDER BY t.created_at ASC`
    );
    return result.rows.map((r: any) => ({
      id: r.id,
      smallBlind: r.small_blind?.toString() ?? '0',
      bigBlind: r.big_blind?.toString() ?? '0',
      maxSeats: Number(r.max_seats) || 10,
      status: r.status,
      seatedCount: Number(r.seated_count) || 0,
      emptySeats: Math.max(0, (Number(r.max_seats) || 10) - (Number(r.seated_count) || 0)),
      hasPin: !!r.pin_code,
      creatorAddress: r.creator_address ? String(r.creator_address).toLowerCase() : null,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    }));
  }

  async createTable(
    smallBlindChips: number,
    bigBlindChips: number,
    maxSeats: number,
    pinCode?: string,
    creatorAddress?: string | null,
  ): Promise<string> {
    if (!Number.isInteger(smallBlindChips) || !Number.isInteger(bigBlindChips) || smallBlindChips <= 0 || bigBlindChips <= 0) {
      throw new Error('Blinds must be positive integers (chips)');
    }
    if (smallBlindChips * 2 !== bigBlindChips) {
      throw new Error('Big blind must equal 2× small blind');
    }
    if (pinCode != null && !/^\d{4}$/.test(pinCode)) {
      throw new Error('PIN must be exactly 4 digits');
    }
    if (!Number.isInteger(maxSeats) || maxSeats < 2 || maxSeats > 10) {
      throw new Error('maxSeats must be an integer from 2 to 10');
    }
    const pool = this.getPool();
    const normalizedCreator =
      typeof creatorAddress === 'string' && /^0x[a-fA-F0-9]{40}$/.test(creatorAddress)
        ? creatorAddress.toLowerCase()
        : null;
    const r = await pool.query(
      `INSERT INTO poker_tables (small_blind, big_blind, max_seats, status, pin_code, creator_address)
       VALUES ($1::NUMERIC, $2::NUMERIC, $3, 'waiting', $4, $5)
       RETURNING id`,
      [String(smallBlindChips), String(bigBlindChips), maxSeats, pinCode ?? null, normalizedCreator]
    );
    const tableId = r.rows[0].id as string;
    // The Rail: announce a player-created cash table to the group feed.
    // Boot-seeded house tables (no creator) are skipped.
    if (normalizedCreator) {
      void railCashTableCreated(pool, tableId);
    }
    return tableId;
  }

  async deleteTable(tableId: string): Promise<boolean> {
    const pool = this.getPool();
    const tableRow = await pool.query('SELECT id FROM poker_tables WHERE id = $1', [tableId]);
    if (tableRow.rows.length === 0) return false;

    await this.dbService.withTransaction(async (client) => {
      // Lock the table row to prevent concurrent deletes or joins
      await client.query('SELECT id FROM poker_tables WHERE id = $1 FOR UPDATE', [tableId]);

      const seats = await client.query(
        'SELECT player_address, stack FROM poker_seats WHERE table_id = $1',
        [tableId]
      );
      for (const row of seats.rows) {
        const stackChips = Number(row.stack ?? 0);
        if (stackChips > 0 && row.player_address) {
          await applyPokerChipDelta(
            client,
            row.player_address,
            BigInt(stackChips),
            'cash_admin_return',
            { type: 'poker_table', id: tableId },
          );
          logger.info('Poker admin delete table: credited chips', { tableId, playerAddress: row.player_address, stackChips });
        }
      }

      await client.query('DELETE FROM poker_tables WHERE id = $1', [tableId]);
    });

    this.clearScheduledNextHand(tableId);
    this.pendingPostHandHandNumbers.delete(tableId);
    this.activeTables.delete(tableId);
    this.invalidateTableScaling(tableId);
    logger.info('Poker admin delete table', { tableId });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Seat management
  // ---------------------------------------------------------------------------

  /** `buyInChips` is a stringified whole-chip count (not MORBIUS wei). */
  async joinTable(tableId: string, playerAddress: string, buyInChips: string, pinCode?: string): Promise<PokerTableState> {
    return this.withTableLock(tableId, () => this._joinTable(tableId, playerAddress, buyInChips, pinCode));
  }

  private async _joinTable(tableId: string, playerAddress: string, buyInChipsRaw: string, pinCode?: string): Promise<PokerTableState> {
    const normalized = this.normalizeAddress(playerAddress);
    const buyInChips = BigInt(buyInChipsRaw);
    if (buyInChips <= 0n) throw new Error('Buy-in must be a positive whole chip amount');
    if (buyInChips > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Buy-in too large');
    const buyInChipsNum = Number(buyInChips);

    const position = await this.dbService.withTransaction(async (client) => {
      // Lock the player row first — serializes concurrent join attempts by the same wallet
      const playerLock = await client.query(
        `SELECT id FROM players WHERE LOWER(wallet_address) = LOWER($1) FOR UPDATE`,
        [normalized]
      );
      if (playerLock.rows.length === 0) throw new Error('Player not found');

      // Prevent sitting at multiple cash tables simultaneously
      const otherSeat = await client.query(
        `SELECT s.table_id FROM poker_seats s
         JOIN poker_tables t ON t.id = s.table_id
         WHERE LOWER(s.player_address) = LOWER($1)
           AND (t.tournament_mode IS NULL OR t.tournament_mode = FALSE)`,
        [normalized]
      );
      if (otherSeat.rows.length > 0) {
        const otherTableId = String(otherSeat.rows[0].table_id ?? '');
        throw new Error(
          `Already seated at another cash table. Leave that table first. other_table_id=${otherTableId}`
        );
      }

      const tableResult = await client.query(
        'SELECT id, small_blind, big_blind, max_seats, pin_code, tournament_mode FROM poker_tables WHERE id = $1',
        [tableId]
      );
      if (tableResult.rows.length === 0) throw new Error('Table not found');
      const tblRow = tableResult.rows[0];
      const maxSeats = Number(tblRow.max_seats) || 10;

      if (tblRow.tournament_mode) {
        throw new Error(
          'Tournament table: register with poker_tournament_join. Cash poker_join_table is not allowed on tournament tables.',
        );
      }
      const bbChips = Number(tblRow.big_blind ?? 0);
      const { minChips, maxChips } = getCashBuyInBoundsChips(bbChips);
      if (buyInChipsNum < minChips || buyInChipsNum > maxChips) {
        throw new Error(
          `Buy-in must be between ${POKER_CASH_MIN_BUY_IN_BB} and ${POKER_CASH_MAX_BUY_IN_BB} big blinds (min ${minChips} chips, max ${maxChips} chips).`
        );
      }

      // Validate PIN for private tables
      if (tblRow.pin_code) {
        if (!pinCode || pinCode !== tblRow.pin_code) {
          throw new Error('Incorrect PIN');
        }
      }

      const existing = await client.query(
        'SELECT id FROM poker_seats WHERE table_id = $1 AND player_address = $2',
        [tableId, normalized]
      );
      if (existing.rows.length > 0) throw new Error('Already seated at this table');

      const seatCount = await client.query(
        'SELECT COUNT(*) AS c FROM poker_seats WHERE table_id = $1',
        [tableId]
      );
      if (Number(seatCount.rows[0].c) >= maxSeats) throw new Error('Table is full');

      await applyPokerChipDelta(client, normalized, -buyInChips, 'cash_join', { type: 'poker_table', id: tableId });

      const positions = await client.query(
        'SELECT position FROM poker_seats WHERE table_id = $1',
        [tableId]
      );
      const used = new Set(positions.rows.map((r: any) => r.position));
      let seatPosition = 0;
      while (used.has(seatPosition)) seatPosition++;

      await client.query(
        `INSERT INTO poker_seats (table_id, position, player_address, stack, status)
         VALUES ($1, $2, $3, $4::NUMERIC, 'active')`,
        [tableId, seatPosition, normalized, String(buyInChipsNum)]
      );
      return seatPosition;
    });

    // Sync in-memory table if it exists
    const activeTable = this.activeTables.get(tableId);
    if (activeTable && !activeTable.currentRound) {
      try {
        if (position === 0) {
          activeTable.sitDown(normalized, buyInChipsNum);
        } else {
          activeTable.sitDown(normalized, buyInChipsNum, position);
        }
      } catch {
        // If sitDown fails (e.g. already seated from previous run), ignore
      }
    }

    logger.info('Poker join', { tableId, playerAddress: normalized, buyInChips: buyInChips.toString(), position });

    // The Rail: announce the cash-table join to the Telegram group feed.
    // Fire-and-forget and best-effort; server bots are skipped so they don't
    // flood the feed, and railCashPlayerJoined rate-limits repeat joins itself.
    if (!getServerPokerBotAddressSet().has(normalized)) {
      void railCashPlayerJoined(this.getPool(), tableId, normalized);
    }

    // Auto-start if 2+ players ready
    const pool = this.getPool();
    const seatsResult = await pool.query(
      'SELECT stack FROM poker_seats WHERE table_id = $1',
      [tableId]
    );
    const withStack = seatsResult.rows.filter((r: any) => BigInt(r.stack ?? '0') > 0n);
    if (withStack.length >= 2) {
      const activeHand = await pool.query(
        'SELECT id FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL LIMIT 1',
        [tableId]
      );
      if (activeHand.rows.length === 0) {
        await this.startHand(tableId);
      }
    }

    return this.getTableState(tableId, normalized);
  }

  async leaveTable(tableId: string, playerAddress: string): Promise<PokerTableState | null> {
    return this.withTableLock(tableId, async () => {
      const pool = this.getPool();
      const modeRow = await pool.query('SELECT tournament_mode FROM poker_tables WHERE id = $1', [tableId]);
      if (modeRow.rows.length === 0) throw new Error('Table not found');
      if (modeRow.rows[0].tournament_mode) {
        // Call the internal helper, not the public method — we already hold
        // the lock here and the public method would re-acquire it (deadlock,
        // since withTableLock is not re-entrant).
        await this._leaveTableTournament(tableId, playerAddress);
        return this.getTableState(tableId, null);
      }
      return this._leaveTable(tableId, playerAddress);
    });
  }

  private async _leaveTable(tableId: string, playerAddress: string): Promise<PokerTableState | null> {
    const normalized = this.normalizeAddress(playerAddress);
    const pool = this.getPool();

    const seatResult = await pool.query(
      'SELECT id, stack, position FROM poker_seats WHERE table_id = $1 AND player_address = $2',
      [tableId, normalized]
    );
    if (seatResult.rows.length === 0) throw new Error('Not seated at this table');

    // If a server-driven runout is mid-flight, finalize it now so all stacks
    // (including the leaving player's all-in winnings) settle to poker_seats
    // BEFORE we strip the seat row. Other players at the table see the runout
    // collapse to showdown immediately — acceptable trade-off vs. forfeiting
    // a leaving player's committed pot share.
    if (this.runoutInFlight.has(tableId)) {
      await this.finalizeRunoutImmediately(tableId);
    }

    const activeHandResult = await pool.query(
      `SELECT id FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL LIMIT 1`,
      [tableId]
    );

    // If there's an active hand, use chevtek standUp so it handles fold + advance
    const activeTable = this.activeTables.get(tableId);
    if (activeHandResult.rows.length > 0 && activeTable) {
      try {
        const communityLenBeforeStandUp = activeTable.communityCards?.length ?? 0;
        // standUp folds the player and calls nextAction() if they were acting
        activeTable.standUp(normalized);

        // Persist any state changes from standUp
        const handId = activeHandResult.rows[0].id;
        await this.persistActionAfterStandUp(
          pool,
          tableId,
          handId,
          normalized,
          activeTable,
          communityLenBeforeStandUp,
        );
      } catch (err) {
        logger.warn('standUp error on leaveTable', { tableId, playerAddress: normalized, err });
      }
    }

    // Atomically remove seat and credit balance so a failed credit cannot strand chips.
    const creditedChips = await this.dbService.withTransaction(async (client) => {
      const del = await client.query(
        `DELETE FROM poker_seats WHERE table_id = $1 AND LOWER(player_address) = LOWER($2) RETURNING stack`,
        [tableId, normalized]
      );
      if (del.rows.length === 0) {
        throw new Error('Not seated at this table');
      }
      const stackChips = Number(del.rows[0].stack ?? 0);
      if (stackChips > 0) {
        await applyPokerChipDelta(
          client,
          normalized,
          BigInt(stackChips),
          'cash_leave',
          { type: 'poker_table', id: tableId },
        );
      }
      return BigInt(stackChips);
    });

    logger.info('Poker leave', { tableId, playerAddress: normalized, creditedChips: creditedChips.toString() });

    return this.getTableState(tableId, null);
  }

  private async persistActionAfterStandUp(
    pool: Pool,
    tableId: string,
    handId: string,
    playerAddress: string,
    table: Table,
    communityLenBeforeStandUp: number,
  ): Promise<void> {
    const handRow = await pool.query('SELECT street FROM poker_hands WHERE id = $1', [handId]);
    if (handRow.rows.length === 0) return;
    const street = handRow.rows[0].street;

    // Record fold action
    const alreadyFolded = await pool.query(
      `SELECT 1 FROM poker_hand_actions WHERE hand_id = $1 AND player_address = $2 AND action = 'fold'`,
      [handId, playerAddress]
    );
    if (alreadyFolded.rows.length === 0) {
      const orderResult = await pool.query(
        'SELECT COALESCE(MAX("order"), 0) + 1 AS next_order FROM poker_hand_actions WHERE hand_id = $1',
        [handId]
      );
      const nextOrder = Number(orderResult.rows[0].next_order);
      await pool.query(
        `INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order")
         VALUES ($1, $2, $3, 'fold', 0, $4)`,
        [handId, playerAddress, street, nextOrder]
      );
    }

    // Check if hand has concluded (showdown triggered by standUp)
    if (!table.currentRound && table.winners) {
      const deferred = await this.completeShowdownWithOptionalRunout(
        pool,
        tableId,
        handId,
        table,
        communityLenBeforeStandUp,
      );
      await this.broadcastState(tableId);
      if (!deferred) {
        this.scheduleNextHandAfterShowdown(tableId);
      }
    } else if (!table.currentRound) {
      // No winners yet but round ended — update acting position
      await pool.query(
        'UPDATE poker_hands SET acting_position = NULL WHERE id = $1',
        [handId]
      );
    } else {
      // Update acting position and pot
      const potStr = String(Math.max(0, Math.round(totalPotChips(table))));
      const actingPos = table.currentPosition ?? null;
      await pool.query(
        'UPDATE poker_hands SET acting_position = $2, pot_amount = $3::NUMERIC, turn_started_at = NOW() WHERE id = $1',
        [handId, actingPos, potStr]
      );
      await this.syncSeatsFromTable(pool, tableId, table);
    }
  }

  /** `amountChips` is a stringified whole-chip count to add from the player poker chip wallet. */
  async addChips(tableId: string, playerAddress: string, amountChips: string): Promise<PokerTableState> {
    return this.withTableLock(tableId, () => this._addChips(tableId, playerAddress, amountChips));
  }

  private async _addChips(_tableId: string, _playerAddress: string, _amountChipsRaw: string): Promise<PokerTableState> {
    const tableId = _tableId;
    const playerAddress = this.normalizeAddress(_playerAddress);
    const addChips = BigInt(_amountChipsRaw);
    if (addChips <= 0n) throw new Error('Re-up amount must be greater than zero');
    if (addChips > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Re-up too large');
    const amountChips = Number(addChips);

    if (await this.isTournamentTable(tableId)) throw new Error('Tournament tables do not support re-ups');

    await this.dbService.withTransaction(async (client) => {
      const seatResult = await client.query(
        `SELECT s.stack, t.big_blind
         FROM poker_seats s
         JOIN poker_tables t ON t.id = s.table_id
         WHERE s.table_id = $1 AND LOWER(s.player_address) = LOWER($2)
         FOR UPDATE`,
        [tableId, playerAddress]
      );
      if (seatResult.rows.length === 0) throw new Error('You are not seated at this table');

      const activeHand = await client.query(
        'SELECT id FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL LIMIT 1',
        [tableId]
      );
      if (activeHand.rows.length > 0) {
        throw new Error('Re-ups are only available between hands');
      }

      const currentStackChips = Number(seatResult.rows[0].stack ?? 0);
      const bigBlindChips = Number(seatResult.rows[0].big_blind ?? 0);
      const { minChips, maxChips } = getCashBuyInBoundsChips(bigBlindChips);
      const nextStackChips = currentStackChips + amountChips;

      if (currentStackChips === 0 && (amountChips < minChips || amountChips > maxChips)) {
        throw new Error(
          `Rebuy must be between ${POKER_CASH_MIN_BUY_IN_BB} and ${POKER_CASH_MAX_BUY_IN_BB} big blinds.`
        );
      }
      if (nextStackChips > maxChips) {
        throw new Error(`Stack cannot exceed ${POKER_CASH_MAX_BUY_IN_BB} big blinds after a re-up.`);
      }

      await applyPokerChipDelta(client, playerAddress, -addChips, 'cash_reup', { type: 'poker_table', id: tableId });

      await client.query(
        `UPDATE poker_seats
         SET stack = stack + $3::NUMERIC
         WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`,
        [tableId, playerAddress, String(amountChips)]
      );
    });

    const pool = this.getPool();
    const seatsResult = await pool.query(
      'SELECT stack FROM poker_seats WHERE table_id = $1',
      [tableId]
    );
    const withStack = seatsResult.rows.filter((r: any) => BigInt(r.stack ?? '0') > 0n);
    if (withStack.length >= 2) {
      const activeHand = await pool.query(
        'SELECT id FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL LIMIT 1',
        [tableId]
      );
      const recentShowdown = await pool.query(
        `SELECT id FROM poker_hands
         WHERE table_id = $1 AND street = 'showdown'
           AND completed_at > NOW() - INTERVAL '${SHOWDOWN_DELAY_SECONDS} seconds'
         LIMIT 1`,
        [tableId]
      );
      if (activeHand.rows.length === 0 && recentShowdown.rows.length === 0) {
        await this.startHand(tableId);
      }
    }

    return this.getTableState(tableId, playerAddress);
  }

  // ---------------------------------------------------------------------------
  // getTableState
  // ---------------------------------------------------------------------------

  /** Clear expired paid logo rows so all readers converge without a cron. */
  private async expirePokerTableLogoIfExpired(pool: Pool, tableId: string): Promise<void> {
    await pool.query(
      `UPDATE poker_tables
       SET table_logo = NULL,
           table_logo_sponsored_until = NULL,
           table_logo_sponsor_address = NULL,
           table_logo_token_address = NULL,
           table_logo_token_name = NULL,
           table_logo_token_symbol = NULL,
           table_logo_token_logo_url = NULL
       WHERE id = $1
         AND table_logo_sponsored_until IS NOT NULL
         AND table_logo_sponsored_until <= NOW()`,
      [tableId]
    );
  }

  async getTableState(tableId: string, forPlayer: string | null): Promise<PokerTableState> {
    const pool = this.getPool();
    const forPlayerAddr = forPlayer ? this.normalizeAddress(forPlayer) : null;

    await this.expirePokerTableLogoIfExpired(pool, tableId);

    const tableRow = await pool.query(
      `SELECT id, small_blind, big_blind, max_seats, status, table_logo, table_logo_opacity, tournament_id,
              table_logo_sponsored_until, table_logo_sponsor_address,
              table_logo_token_address, table_logo_token_name, table_logo_token_symbol, table_logo_token_logo_url
       FROM poker_tables WHERE id = $1`,
      [tableId]
    );
    if (tableRow.rows.length === 0) throw new Error('Table not found');
    const tbl = tableRow.rows[0];
    const maxSeats = Number(tbl.max_seats) || 10;
    const bigBlindChips = Number(tbl.big_blind ?? 0);

    // Load DB seats
    const seatsResult = await pool.query(
      'SELECT position, player_address, stack, status, consecutive_timeouts FROM poker_seats WHERE table_id = $1 ORDER BY position',
      [tableId]
    );
    const dbSeatMap = new Map<number, { playerAddress: string; stack: string; status: string; consecutiveTimeouts: number }>();
    for (const r of seatsResult.rows) {
      dbSeatMap.set(r.position, {
        playerAddress: r.player_address,
        stack: r.stack?.toString() ?? '0',
        status: r.status,
        consecutiveTimeouts: Number(r.consecutive_timeouts ?? 0),
      });
    }

    // Get in-memory table (if any) for live stack/bet/position data
    const liveTable = this.activeTables.get(tableId);

    // Build base seats from DB; overlay live data if table is active
    const seats: PokerSeatState[] = [];
    for (let pos = 0; pos < maxSeats; pos++) {
      const s = dbSeatMap.get(pos);
      let stack = s?.stack ?? '0';
      let currentBet = '0';

      if (liveTable && s) {
        const livePlayer = liveTable.players[pos];
        if (livePlayer && livePlayer.id === s.playerAddress) {
          stack = String(Math.max(0, Math.round(livePlayer.stackSize)));
          currentBet = String(Math.max(0, Math.round(livePlayer.bet)));
        }
      }

      // Freeze the displayed stack at its pre-payout value during an all-in
      // runout. Without this overlay the seat plate updates to the resolved
      // post-payout amount the moment chevtek auto-resolves, leaking the
      // winner before the staged board reveal completes. Cleared at the
      // showdown frame in finalizeShowdown.
      const frozen = this.runoutFrozenStacks.get(tableId);
      if (frozen && s?.playerAddress) {
        const override = frozen.get(this.normalizeAddress(s.playerAddress));
        if (override !== undefined) {
          stack = override;
        }
      }

      seats.push({
        position: pos,
        playerAddress: s?.playerAddress ?? null,
        stack,
        status: s?.status ?? 'empty',
        consecutiveTimeouts: s?.consecutiveTimeouts ?? 0,
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: false,
        isActing: false,
        folded: false,
        currentBet,
      });
    }

    const seatAddresses = seats.map((s) => s.playerAddress).filter((a): a is string => !!a);
    const placeholderByAddress = new Map<string, Record<string, unknown>>();
    if (seatAddresses.length > 0) {
      const profiles = await this.dbService.getProfiles(seatAddresses);
      const needPlaceholder = seatAddresses.filter((addr) => {
        const profile = profiles.get(this.normalizeAddress(addr));
        return !profile || profile.avatarConfig == null;
      });
      if (needPlaceholder.length > 0) {
        const cosmeticsService = new CosmeticsService(this.getPool());
        for (const addr of needPlaceholder) {
          try {
            const inventory = await cosmeticsService.getInventory(addr);
            const placeholder = randomPlaceholderConfig(new Set(inventory));
            await this.dbService.setDefaultAvatarIfNull(addr, placeholder);
            placeholderByAddress.set(this.normalizeAddress(addr), placeholder);
          } catch (err) {
            logger.warn(`Poker: failed to set placeholder avatar for ${addr}: ${(err as Error).message}`);
          }
        }
      }
      for (const seat of seats) {
        if (!seat.playerAddress) continue;
        const normalized = this.normalizeAddress(seat.playerAddress);
        const profile = profiles.get(normalized);
        seat.displayName = profile?.displayName ?? null;
        seat.profileImageUrl = profile?.profileImageUrl ?? null;
        seat.avatarConfig = profile?.avatarConfig ?? placeholderByAddress.get(normalized) ?? null;
        seat.profileDisplayMode = profile?.profileDisplayMode ?? 'avatar';
      }
    }

    let currentHand: PokerCurrentHand | null = null;
    let myHoleCards: number[] | null = null;

    const handRow = await pool.query(
      `SELECT id, hand_number, button_position, community_cards, pot_amount, street,
              acting_position, turn_started_at, result, last_raise_size, completed_at,
              runout_resolved_at, server_seed_hash
       FROM poker_hands WHERE table_id = $1
         AND (completed_at IS NULL OR (street = 'showdown' AND completed_at > NOW() - INTERVAL '${SHOWDOWN_DELAY_SECONDS} seconds'))
       ORDER BY CASE WHEN completed_at IS NULL THEN 0 ELSE 1 END, created_at DESC LIMIT 1`,
      [tableId]
    );

    if (handRow.rows.length > 0) {
      const h = handRow.rows[0];
      const handId: string = h.id;
      const buttonPosition = Number(h.button_position);
      const communityCards: number[] = Array.isArray(h.community_cards)
        ? h.community_cards
        : (h.community_cards ? JSON.parse(JSON.stringify(h.community_cards)) : []);

      const dbActingPosition: number | null = h.acting_position != null ? Number(h.acting_position) : null;
      // Authoritative while betting: chevtek's seat index. DB can be NULL/stale (e.g. run-out snapshot
      // windows or rare persist skew); without this overlay clients see no actor and toCall=0 → "frozen".
      const engineActingPosition =
        liveTable?.currentRound != null && liveTable.currentPosition != null
          ? liveTable.currentPosition
          : null;
      const actingPosition =
        engineActingPosition !== null ? engineActingPosition : dbActingPosition;
      const street: PokerStreet = h.street;

      // Fold/dealer/blind flags
      const foldResult = await pool.query(
        `SELECT player_address FROM poker_hand_actions WHERE hand_id = $1 AND action = 'fold'`,
        [handId]
      );
      const foldedSet = new Set(foldResult.rows.map((r: any) => this.normalizeAddress(r.player_address)));

      // Use live table for position flags if available, otherwise use DB
      let dealerPos = buttonPosition;
      let sbPos: number | null = null;
      let bbPos: number | null = null;

      if (liveTable && liveTable.currentRound) {
        dealerPos = liveTable.dealerPosition ?? buttonPosition;
        sbPos = liveTable.smallBlindPosition ?? null;
        bbPos = liveTable.bigBlindPosition ?? null;
      } else {
        // Derive from DB: find SB/BB positions by next active seats after button
        const seatPositions = seatsResult.rows.map((r: any) => r.position).sort((a: number, b: number) => a - b);
        const isHeadsUp = seatPositions.length === 2;
        if (isHeadsUp) {
          sbPos = buttonPosition;
          bbPos = this.nextSeatPosition(buttonPosition, seatPositions, maxSeats);
        } else {
          sbPos = this.nextSeatPosition(buttonPosition, seatPositions, maxSeats);
          bbPos = this.nextSeatPosition(sbPos, seatPositions, maxSeats);
        }
      }

      // toCall and minRaise (all chip ints)
      let toCall = '0';
      let minRaise = String(bigBlindChips);

      if (liveTable && liveTable.currentRound && actingPosition != null) {
        const actor = liveTable.players[actingPosition];
        if (actor) {
          const toCallChips = liveTable.currentBet !== undefined
            ? Math.max(0, liveTable.currentBet - actor.bet)
            : 0;
          const minRaiseChips = (liveTable.currentBet ?? 0)
            + Math.max(liveTable.lastRaise ?? bigBlindChips, bigBlindChips);
          toCall = String(Math.max(0, Math.round(toCallChips)));
          minRaise = String(Math.max(0, Math.round(minRaiseChips)));
        }
      } else if (actingPosition != null) {
        const lastRaiseSizeChips = Number(h.last_raise_size ?? 0);
        const minRaiseIncrement = Math.max(lastRaiseSizeChips, bigBlindChips);
        const contribResult = await pool.query(
          `SELECT player_address, SUM(amount) AS total FROM poker_hand_actions
           WHERE hand_id = $1 AND street = $2 AND action IN ('bet','raise','call','blind')
           GROUP BY player_address`,
          [handId, street]
        );
        let maxContrib = 0;
        let myContrib = 0;
        const actingAddr = dbSeatMap.get(actingPosition)?.playerAddress ?? null;
        for (const row of contribResult.rows) {
          const t = Number(row.total ?? 0);
          if (t > maxContrib) maxContrib = t;
          if (actingAddr && row.player_address === actingAddr) myContrib = t;
        }
        const toCallNum = maxContrib > myContrib ? maxContrib - myContrib : 0;
        toCall = String(toCallNum);
        // Standard No-Limit min-raise: current high bet + last raise increment
        // (NOT toCall + increment — that under-counts when the actor has
        // partial chips already in the pot, e.g. SB/BB facing a raise).
        minRaise = String(maxContrib + minRaiseIncrement);
      }

      // Recent actions (oldest → newest). We return the last 40 so the client's
      // activity feed can log every action even when rapid broadcasts are batched
      // into a single React state update. `lastAction` is kept for backward compat.
      const actionsResult = await pool.query(
        `SELECT "order", player_address, street, action, amount FROM poker_hand_actions
         WHERE hand_id = $1 AND action NOT IN ('blind')
         ORDER BY "order" DESC LIMIT 40`,
        [handId]
      );
      const recentActions: NonNullable<PokerCurrentHand['recentActions']> = [];
      for (let i = actionsResult.rows.length - 1; i >= 0; i--) {
        const row = actionsResult.rows[i];
        const pos = seats.findIndex((s) => s.playerAddress === row.player_address);
        if (pos < 0) continue;
        recentActions.push({
          order: Number(row.order),
          street: row.street as PokerStreet,
          position: pos,
          action: row.action,
          amount: row.amount?.toString() ?? '0',
        });
      }
      const lastAction: PokerCurrentHand['lastAction'] =
        recentActions.length > 0
          ? {
              position: recentActions[recentActions.length - 1].position,
              action: recentActions[recentActions.length - 1].action,
              amount: recentActions[recentActions.length - 1].amount,
            }
          : null;

      const streetActionsResult = await pool.query(
        `SELECT player_address, action, amount FROM poker_hand_actions
         WHERE hand_id = $1 AND street = $2 AND action NOT IN ('blind')
         ORDER BY "order" DESC`,
        [handId, street]
      );
      const streetActions: Record<number, { action: string; amount: string }> = {};
      for (const row of streetActionsResult.rows) {
        const pos = seats.findIndex((s) => s.playerAddress === row.player_address);
        if (pos < 0 || streetActions[pos]) continue;
        streetActions[pos] = {
          action: row.action,
          amount: row.amount?.toString() ?? '0',
        };
      }

      // Pot (chip int): prefer live table total
      const potStr = liveTable && liveTable.currentRound
        ? String(Math.max(0, Math.round(totalPotChips(liveTable))))
        : (h.pot_amount?.toString() ?? '0');

      // Update seat flags (dealer / blinds / acting apply to every chair — empty seats too — so the
      // client can place the dealer disc even if the button seat is momentarily empty.)
      for (const seat of seats) {
        const pos = seat.position;
        seat.isDealer = pos === dealerPos;
        seat.isSmallBlind = pos === sbPos;
        seat.isBigBlind = pos === bbPos;
        seat.isActing = actingPosition === pos;
        if (!seat.playerAddress) {
          seat.folded = false;
          continue;
        }
        seat.folded = foldedSet.has(this.normalizeAddress(seat.playerAddress));
        // Live bet override if not done above
        if (liveTable) {
          const livePlayer = liveTable.players[pos];
          if (livePlayer && livePlayer.id === seat.playerAddress) {
            seat.currentBet = String(Math.max(0, Math.round(livePlayer.bet)));
          }
        }
      }

      // Structured per-pot breakdown for the UI (main / side / uncalled).
      // Sourced from chevtek's live table.pots which is authoritative while
      // a hand is in progress. Skipped when no live table (e.g. between
      // hands) — the client falls back to the `pot` scalar.
      let potsArr: PokerCurrentHand['pots'] | undefined;
      if (liveTable && Array.isArray(liveTable.pots) && liveTable.pots.length > 0) {
        // Drop the trailing empty pot chevtek always pushes after the all-in loop.
        const realPots = liveTable.pots.filter((p: any) => p && p.amount > 0);
        if (realPots.length > 0) {
          potsArr = realPots.map((p: any, i: number) => {
            const isLast = i === realPots.length - 1;
            const isRefund =
              realPots.length > 1 &&
              isLast &&
              Array.isArray(p.eligiblePlayers) &&
              p.eligiblePlayers.length === 1;
            let label: string;
            if (realPots.length === 1) label = 'Pot';
            else if (i === 0) label = 'Main Pot';
            else if (isRefund) label = 'Uncalled';
            else label = realPots.length === 2 ? 'Side Pot' : `Side Pot ${i}`;
            const winnerAddresses =
              Array.isArray(p.winners) && p.winners.length > 0
                ? p.winners
                    .filter((w: any) => w && !w.folded)
                    .map((w: any) => this.normalizeAddress(w.id))
                : undefined;
            return {
              amount: String(Math.max(0, Math.round(p.amount))),
              label,
              winnerAddresses,
            };
          });
        }
      }

      currentHand = {
        handId,
        street,
        communityCards,
        pot: potStr,
        pots: potsArr,
        actingPosition,
        lastAction,
        recentActions,
        streetActions,
        minRaise,
        toCall,
        turnStartedAt: h.turn_started_at ? new Date(h.turn_started_at).toISOString() : null,
        // Provably-fair commitment — the hash of the server seed the deck was
        // derived from. Published at hand start; the plaintext seed stays
        // hidden until showdown. Lets the UI surface "the cards were locked in
        // before the deal" in real time.
        serverSeedHash: h.server_seed_hash ?? undefined,
      };

      // Hole cards for requesting player
      if (forPlayerAddr) {
        const holeResult = await pool.query(
          'SELECT cards FROM poker_hand_hole_cards WHERE hand_id = $1 AND player_address = $2',
          [handId, forPlayerAddr]
        );
        if (holeResult.rows.length > 0 && holeResult.rows[0].cards) {
          myHoleCards = Array.isArray(holeResult.rows[0].cards)
            ? holeResult.rows[0].cards
            : JSON.parse(holeResult.rows[0].cards);
        }
      }

      // Showdown (or mid-runout): winners on the final frame; hole cards exposed
      // as soon as the all-in is locked so the runout build-up matches real-poker
      // UX (cards revealed BEFORE the board runs out).
      const isMidRunout = h.runout_resolved_at != null && h.completed_at == null;
      if (street === 'showdown' || isMidRunout) {
        const dealtHoleResult = await pool.query(
          'SELECT player_address FROM poker_hand_hole_cards WHERE hand_id = $1',
          [handId]
        );
        const dealtAddrs = new Set(
          dealtHoleResult.rows.map((r: any) => this.normalizeAddress(r.player_address))
        );
        let nonFoldedDealtCount = 0;
        for (const addr of dealtAddrs) {
          if (!foldedSet.has(addr)) nonFoldedDealtCount += 1;
        }
        const handWentToShowdown = nonFoldedDealtCount >= 2;
        currentHand.handWentToShowdown = handWentToShowdown;

        if (handWentToShowdown) {
          const allHoleResult = await pool.query(
            'SELECT player_address, cards FROM poker_hand_hole_cards WHERE hand_id = $1',
            [handId]
          );
          const showdownHands: Record<string, number[]> = {};
          for (const row of allHoleResult.rows) {
            const cards = Array.isArray(row.cards) ? row.cards : JSON.parse(row.cards ?? '[]');
            // Exclude players who folded before the all-in — they shouldn't have
            // their cards exposed during the runout. (At final showdown we keep
            // the existing behavior of exposing all dealt-in hole cards.)
            if (isMidRunout && foldedSet.has(this.normalizeAddress(row.player_address))) continue;
            showdownHands[this.normalizeAddress(row.player_address)] = cards;
          }
          currentHand.showdownHands = showdownHands;
        } else {
          // Fold-out win: surface the Show/Muck offer (if still open) and any
          // already-revealed hole cards. handId-scoped so a stale entry from a
          // prior hand never leaks into the current one.
          const elig = this.foldOutShowEligibility.get(tableId);
          if (elig && elig.handId === handId) {
            const stillOpen = elig.decision === 'pending' && Date.now() < elig.expiresAt;
            currentHand.foldOutWinnerAddress = elig.winnerAddress;
            currentHand.foldOutShowDecision = elig.decision;
            if (stillOpen) {
              currentHand.foldOutShowMuckExpiresAt = new Date(elig.expiresAt).toISOString();
            }
            if (elig.decision === 'shown' && elig.revealedHoleCards) {
              currentHand.showdownHands = {
                ...(currentHand.showdownHands ?? {}),
                [elig.winnerAddress]: elig.revealedHoleCards,
              };
            }
          }
        }

        if (h.result) {
          try {
            const parsed = typeof h.result === 'string' ? JSON.parse(h.result) : h.result;
            if (parsed?.winners?.length) {
              const seatedAddresses = new Set(
                seats
                  .filter((seat) => !!seat.playerAddress)
                  .map((seat) => this.normalizeAddress(seat.playerAddress as string))
              );
              currentHand.winners = parsed.winners
                .map((w: any) => ({
                  address: this.normalizeAddress(w.address || ''),
                  amount: String(w.amount ?? '0'),
                  handName: w.handName,
                  winningCardIndices: Array.isArray(w.winningCardIndices) ? w.winningCardIndices : undefined,
                }))
                .filter((winner: any) => !!winner.address)
                .filter((winner: any) => seatedAddresses.has(winner.address))
                .filter((winner: any) => !foldedSet.has(winner.address));
            }
          } catch {
            // ignore
          }
        }

        if (h.completed_at) {
          const rawCompleted = h.completed_at as Date | string;
          const completedMs =
            rawCompleted instanceof Date ? rawCompleted.getTime() : new Date(rawCompleted).getTime();
          if (Number.isFinite(completedMs)) {
            currentHand.nextHandAt = new Date(completedMs + SHOWDOWN_DELAY_MS).toISOString();
          }
        }
      }
    }

    const tournamentIdRaw = tbl.tournament_id;
    const tournamentId =
      tournamentIdRaw != null && String(tournamentIdRaw).length > 0 ? String(tournamentIdRaw) : null;

    const sponsoredUntilRaw = tbl.table_logo_sponsored_until;
    const sponsoredUntil =
      sponsoredUntilRaw != null ? new Date(sponsoredUntilRaw as Date | string) : null;
    const nowDate = new Date();
    const sponsoredActive =
      sponsoredUntil != null &&
      !Number.isNaN(sponsoredUntil.getTime()) &&
      sponsoredUntil.getTime() > nowDate.getTime();
    const remainingMs = sponsoredActive ? sponsoredUntil.getTime() - nowDate.getTime() : 0;
    const priceChips = computeTableLogoChangePriceMorbiusChips({
      sponsoredActive,
      remainingMs,
    });
    const tableLogoEffective =
      sponsoredActive && tbl.table_logo != null && String(tbl.table_logo).length > 0
        ? String(tbl.table_logo)
        : null;

    return {
      tableId: tbl.id,
      smallBlind: tbl.small_blind?.toString() ?? '0',
      bigBlind: tbl.big_blind?.toString() ?? '0',
      maxSeats,
      status: tbl.status,
      seats,
      currentHand,
      myHoleCards,
      tableLogo: tableLogoEffective,
      tableLogoOpacity: tbl.table_logo_opacity != null ? Number(tbl.table_logo_opacity) : null,
      tableLogoSponsoredUntil: sponsoredActive ? sponsoredUntil.toISOString() : null,
      tableLogoSponsorAddress:
        sponsoredActive && tbl.table_logo_sponsor_address
          ? String(tbl.table_logo_sponsor_address).toLowerCase()
          : null,
      tableLogoIsDefault: !sponsoredActive,
      tableLogoPriceMorbiusChips: priceChips.toString(),
      tableLogoTokenAddress:
        sponsoredActive && tbl.table_logo_token_address
          ? String(tbl.table_logo_token_address).toLowerCase()
          : null,
      tableLogoTokenName:
        sponsoredActive && tbl.table_logo_token_name
          ? String(tbl.table_logo_token_name)
          : null,
      tableLogoTokenSymbol:
        sponsoredActive && tbl.table_logo_token_symbol
          ? String(tbl.table_logo_token_symbol)
          : null,
      tableLogoTokenLogoUrl:
        sponsoredActive && tbl.table_logo_token_logo_url
          ? String(tbl.table_logo_token_logo_url)
          : null,
      tournamentId,
    };
  }

  // ---------------------------------------------------------------------------
  // updateTableLogo — admin-only: set or clear marketing logo on felt
  // ---------------------------------------------------------------------------

  async updateTableLogo(tableId: string, logo: string | null, opacity: number): Promise<void> {
    const pool = this.getPool();
    const row = await pool.query<{ until: Date | null }>(
      'SELECT table_logo_sponsored_until AS until FROM poker_tables WHERE id = $1',
      [tableId]
    );
    if (row.rows.length === 0) throw new Error('Table not found');
    const until = row.rows[0].until;
    if (until != null && new Date(until).getTime() > Date.now()) {
      throw new Error('Cannot update table logo while a paid sponsorship is active');
    }
    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    await pool.query(
      'UPDATE poker_tables SET table_logo = $2, table_logo_opacity = $3 WHERE id = $1',
      [tableId, logo, clampedOpacity]
    );
  }

  /**
   * Pay MORBIUS (off-chain `players.balance`) to sponsor a token spotlight for 10 minutes.
   * Timer restarts on each purchase. Seated players only.
   *
   * Trust-the-client metadata: the client passes name/symbol/logoUrl pulled from DexScreener.
   * Only the address is structurally validated; lengths are capped server-side.
   */
  async purchaseTableLogoSponsorship(
    tableId: string,
    playerAddress: string,
    token: {
      address: string;
      name: string;
      symbol: string;
      logoUrl: string | null;
    }
  ): Promise<PokerTableState> {
    const pool = this.getPool();
    const normalized = this.normalizeAddress(playerAddress);

    const tokenAddress = String(token?.address ?? '').trim().toLowerCase();
    const tokenName = String(token?.name ?? '').trim().slice(0, SPONSOR_TOKEN_NAME_MAX);
    const tokenSymbol = String(token?.symbol ?? '').trim().slice(0, SPONSOR_TOKEN_SYMBOL_MAX);
    const tokenLogoUrlRaw = token?.logoUrl == null ? '' : String(token.logoUrl).trim();
    const tokenLogoUrl = tokenLogoUrlRaw.slice(0, SPONSOR_TOKEN_LOGO_URL_MAX) || null;

    if (!ETH_ADDRESS_RE.test(tokenAddress)) {
      throw new Error('Invalid token address');
    }
    if (!tokenName) throw new Error('Token name required');
    if (!tokenSymbol) throw new Error('Token symbol required');
    if (tokenLogoUrl && !/^https?:\/\//i.test(tokenLogoUrl)) {
      throw new Error('Token logo URL must be http(s)');
    }

    await this.expirePokerTableLogoIfExpired(pool, tableId);

    const seatCheck = await pool.query(
      `SELECT 1 FROM poker_seats
       WHERE table_id = $1 AND LOWER(player_address) = LOWER($2) AND player_address IS NOT NULL
       LIMIT 1`,
      [tableId, normalized]
    );
    if (seatCheck.rows.length === 0) {
      throw new Error('Must be seated at this table to sponsor the logo');
    }

    const trow = await pool.query<{ until: Date | null }>(
      'SELECT table_logo_sponsored_until AS until FROM poker_tables WHERE id = $1',
      [tableId]
    );
    if (trow.rows.length === 0) throw new Error('Table not found');
    const untilRaw = trow.rows[0].until;
    const sponsoredUntil = untilRaw != null ? new Date(untilRaw as Date | string) : null;
    const nowDate = new Date();
    const sponsoredActive =
      sponsoredUntil != null &&
      !Number.isNaN(sponsoredUntil.getTime()) &&
      sponsoredUntil.getTime() > nowDate.getTime();
    const remainingMs = sponsoredActive ? sponsoredUntil.getTime() - nowDate.getTime() : 0;
    const priceChips = computeTableLogoChangePriceMorbiusChips({
      sponsoredActive,
      remainingMs,
    });
    if (priceChips > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Price overflow');
    }
    const wei = chipsToWei(Number(priceChips));

    // table_logo column kept for back-compat (NOT NULL on some history rows); store the
    // address so legacy reads have something stable. New renderers use the token columns.
    const legacyLogoValue = tokenAddress;

    await this.dbService.withTransaction(async (client: any) => {
      const deduct = await client.query(
        `UPDATE players SET balance = balance - $2::NUMERIC
         WHERE LOWER(wallet_address) = LOWER($1) AND balance >= $2::NUMERIC
         RETURNING balance`,
        [normalized, wei.toString()]
      );
      if (deduct.rows.length === 0) {
        throw new Error('Insufficient MORBIUS balance for table logo sponsorship');
      }
      await client.query(
        `UPDATE poker_tables SET
           table_logo = $2,
           table_logo_sponsored_until = NOW() + INTERVAL '10 minutes',
           table_logo_sponsor_address = $3,
           table_logo_token_address = $4,
           table_logo_token_name = $5,
           table_logo_token_symbol = $6,
           table_logo_token_logo_url = $7
         WHERE id = $1`,
        [tableId, legacyLogoValue, normalized, tokenAddress, tokenName, tokenSymbol, tokenLogoUrl]
      );
      await client.query(
        `INSERT INTO poker_table_logo_purchases
           (table_id, wallet_address, morbius_chips, logo_filename, token_address, token_name, token_symbol)
         VALUES ($1::uuid, $2, $3::bigint, $4, $5, $6, $7)`,
        [tableId, normalized, priceChips.toString(), legacyLogoValue, tokenAddress, tokenName, tokenSymbol]
      );
    });

    await this.broadcastState(tableId);
    return this.getTableState(tableId, normalized);
  }

  // ---------------------------------------------------------------------------
  // setSitOut / setSitBack — voluntary sit-out for cash games
  // ---------------------------------------------------------------------------

  async setSitOut(tableId: string, playerAddress: string): Promise<PokerTableState> {
    // Defense in depth: the client hides the Sit Out button in tournaments,
    // but reject the RPC server-side too so a hand-crafted message can't be
    // used to dodge blinds in a tournament.
    if (await this.isTournamentTable(tableId)) {
      throw new Error('Cannot sit out in a tournament');
    }
    return this.withTableLock(tableId, async () => {
      const pool = this.getPool();
      const normalized = this.normalizeAddress(playerAddress);
      const result = await pool.query(
        `UPDATE poker_seats
         SET status = 'sitting_out', sit_out_since = NOW(), consecutive_timeouts = 0
         WHERE table_id = $1 AND player_address = $2
         RETURNING player_address`,
        [tableId, normalized]
      );
      if (result.rows.length === 0) throw new Error('Seat not found');
      this.notifyCallback?.(`poker:table:${tableId}`, 'poker_player_sitting_out', {
        tableId,
        playerAddress: normalized,
        reason: 'voluntary',
      });
      logger.info('Player voluntarily sitting out', { tableId, player: normalized });
      await this.broadcastState(tableId);
      return this.getTableState(tableId, normalized);
    });
  }

  async setSitBack(tableId: string, playerAddress: string): Promise<PokerTableState> {
    return this.withTableLock(tableId, async () => {
      const pool = this.getPool();
      const normalized = this.normalizeAddress(playerAddress);
      const result = await pool.query(
        `UPDATE poker_seats
         SET status = 'active', sit_out_since = NULL, consecutive_timeouts = 0
         WHERE table_id = $1 AND player_address = $2 AND status = 'sitting_out'
         RETURNING player_address`,
        [tableId, normalized]
      );
      if (result.rows.length === 0) throw new Error('Seat not found or not sitting out');
      logger.info('Player sitting back in', { tableId, player: normalized });
      await this.broadcastState(tableId);
      return this.getTableState(tableId, normalized);
    });
  }

  // ---------------------------------------------------------------------------
  // clearAfkStatus — "I'm Back" button
  // ---------------------------------------------------------------------------
  //
  // Resets the AFK flags on the player's seat in one shot:
  //   - consecutive_timeouts = 0  (lifts hard-AFK fast-fold mode)
  //   - disconnected_at = NULL    (lifts DC clock extension)
  //   - status: if cash and they were sitting_out via AFK kick, flip back to
  //     'active' so they get dealt back in. (Tournaments never set sitting_out
  //     via AFK, so the status update is a no-op there.)
  //
  // Idempotent — safe to call any number of times.

  async clearAfkStatus(tableId: string, playerAddress: string): Promise<PokerTableState> {
    return this.withTableLock(tableId, async () => {
      const pool = this.getPool();
      const normalized = this.normalizeAddress(playerAddress);
      const result = await pool.query(
        `UPDATE poker_seats
         SET consecutive_timeouts = 0,
             disconnected_at = NULL,
             status = CASE WHEN status = 'sitting_out' THEN 'active' ELSE status END,
             sit_out_since = CASE WHEN status = 'sitting_out' THEN NULL ELSE sit_out_since END
         WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)
         RETURNING player_address`,
        [tableId, normalized]
      );
      if (result.rows.length === 0) throw new Error('Seat not found');
      logger.info('Player cleared AFK status (I\'m Back)', { tableId, player: normalized });
      await this.broadcastState(tableId);
      return this.getTableState(tableId, normalized);
    });
  }

  // ---------------------------------------------------------------------------
  // Disconnect tracking — extends the auto-fold clock from 60s → 90s when the
  // player's WebSocket has dropped. See autoFoldTimedOutTurns and the
  // ws.on('close') handler in websocket.service.impl.js.
  // ---------------------------------------------------------------------------

  /** Stamp disconnected_at on the player's seat. No-op if seat doesn't exist. */
  async markSeatDisconnected(tableId: string, playerAddress: string): Promise<void> {
    const pool = this.getPool();
    const normalized = this.normalizeAddress(playerAddress);
    await pool.query(
      `UPDATE poker_seats
       SET disconnected_at = NOW()
       WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)
         AND disconnected_at IS NULL`,
      [tableId, normalized]
    );
  }

  /** Clear disconnected_at on the player's seat. Called on any reconnect signal. */
  async markSeatConnected(tableId: string, playerAddress: string): Promise<void> {
    const pool = this.getPool();
    const normalized = this.normalizeAddress(playerAddress);
    await pool.query(
      `UPDATE poker_seats
       SET disconnected_at = NULL
       WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)
         AND disconnected_at IS NOT NULL`,
      [tableId, normalized]
    );
  }

  /** Kick players who have been sitting out for >= 15 minutes (cash games only). */
  async kickStaleSitOuts(): Promise<void> {
    const pool = this.getPool();
    const stale = await pool.query(
      `SELECT ps.table_id, ps.player_address
       FROM poker_seats ps
       JOIN poker_tables pt ON pt.id = ps.table_id
       WHERE ps.status = 'sitting_out'
         AND ps.sit_out_since IS NOT NULL
         AND ps.sit_out_since < NOW() - INTERVAL '15 minutes'
         AND pt.tournament_mode = false`,
    );
    for (const row of stale.rows) {
      try {
        await this.withTableLock(row.table_id, async () => {
          await this._leaveTable(row.table_id, row.player_address);
          this.notifyCallback?.(`poker:table:${row.table_id}`, 'poker_player_kicked', {
            tableId: row.table_id,
            playerAddress: row.player_address,
            reason: 'sit_out_timeout',
          });
          logger.info('Sit-out timeout kick', { tableId: row.table_id, player: row.player_address });
        });
      } catch (err) {
        logger.error('Error kicking stale sit-out', { tableId: row.table_id, player: row.player_address, error: err });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // startHand
  // ---------------------------------------------------------------------------

  async startHand(tableId: string): Promise<PokerTableState | null> {
    const pool = this.getPool();

    const tableResult = await pool.query(
      'SELECT id, small_blind, big_blind, max_seats, hand_number, button_position, tournament_id FROM poker_tables WHERE id = $1',
      [tableId]
    );
    if (tableResult.rows.length === 0) throw new Error('Table not found');
    const tblRow = tableResult.rows[0];
    const maxSeats = Number(tblRow.max_seats) || 10;

    const sb = Number(tblRow.small_blind ?? 0);
    const bb = Number(tblRow.big_blind ?? 0);
    if (!Number.isFinite(sb) || !Number.isFinite(bb) || sb <= 0 || bb <= 0) {
      throw new Error('Invalid blinds');
    }

    // Sitting-out exclusion is CASH-ONLY. In tournaments, every seated player
    // (including AFK / "sitting out") is dealt in and posts blinds each hand,
    // bleeding out naturally — granting a chip-preservation refuge would be
    // unfair to the rest of the field. The voluntary Sit Out button is also
    // blocked server-side for tournament tables (see setSitOut below).
    const isTournament = await this.isTournamentTable(tableId);
    const seatsResult = await pool.query(
      isTournament
        ? `SELECT position, player_address, stack FROM poker_seats
           WHERE table_id = $1 ORDER BY position`
        : `SELECT position, player_address, stack FROM poker_seats
           WHERE table_id = $1 AND status != 'sitting_out' ORDER BY position`,
      [tableId]
    );
    const withStack = seatsResult.rows.filter((r: any) => Number(r.stack ?? 0) > 0);
    if (withStack.length < 2) return null;

    // Build or reset the in-memory Table (chevtek uses integer "chips", not wei)
    const table = new Table(0, sb, bb);
    applyEnginePatches(table);
    // autoMoveDealer=true: chevtek will advance dealer each hand. We need to
    // prime the dealer position so the FIRST call to dealCards() moves correctly.
    // dealCards() calls moveDealer(dealerPosition + 1) when handNumber > 1.
    // Since this is a fresh Table (handNumber=0), it won't auto-move on first deal.
    // We call moveDealer() explicitly to set up SB/BB before dealCards().

    // Sit all players at their DB positions
    for (const seat of withStack) {
      const pos = Number(seat.position);
      const addr = (seat.player_address || '').toLowerCase();
      const stackChips = Number(seat.stack ?? 0);
      if (pos === 0) {
        table.sitDown(addr, stackChips);
      } else {
        table.sitDown(addr, stackChips, pos);
      }
    }

    // Determine dealer position: advance from last button
    const lastButton = Number(tblRow.button_position ?? 0);
    const seatPositions = withStack.map((r: any) => Number(r.position)).sort((a: number, b: number) => a - b);

    // For hand 1 (first hand at this table), chevtek won't auto-move dealer.
    // For subsequent hands, we prime the dealer to lastButton so moveDealer(lastButton+1)
    // advances correctly. Since dealCards() calls moveDealer(dealerPosition+1) only
    // when handNumber > 1, and our Table starts fresh (handNumber=0), we set:
    // - If this is first hand (hand_number=0 in DB): set dealer to one position BEFORE
    //   the desired dealer so dealCards()'s move lands on the right spot... but
    //   dealCards() does NOT auto-move on handNumber===1 (first hand). So we just
    //   set the initial dealer position via moveDealer() directly.
    // The simplest correct approach: always call moveDealer() to the desired position
    // BEFORE dealCards() so the explicit position is set, then set table.handNumber=1
    // to prevent dealCards() from auto-moving again.

    // Compute desired dealer position (next active seat after lastButton)
    const desiredDealer = this.nextSeatPosition(lastButton, seatPositions, maxSeats);
    table.moveDealer(desiredDealer);
    // Set handNumber to 0 so dealCards() increments to 1, and (1 > 1) = false → no auto-move
    (table as any).handNumber = 0;

    // Provably-fair seeds for THIS hand. The plaintext server seed must never
    // hit the live `poker_hands` row — it stays in `poker_hand_pending_seeds`
    // until showdown, then moves into `poker_hands.server_seed` via
    // `persistShowdown`. The deck below is *deterministically* derived from
    // (serverSeed, clientSeed, nonce=0) — chevtek's Math.random() shuffle is
    // bypassed by overriding `table.newDeck` on the instance.
    const handNumber = Number(tblRow.hand_number) + 1;
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const serverSeedHash = this.pfService.createServerSeedHash(serverSeed);
    const clientSeed = crypto.randomBytes(16).toString('hex');
    const deckInts = this.pfService.fisherYatesShuffle(serverSeed, clientSeed, 0);
    const deckCards = deckInts.map(intToCard);
    // Instance method override — chevtek's `dealCards()` calls `this.newDeck()`
    // which now returns our seed-derived deck. `slice()` so each call gets a
    // fresh array (in case anything calls newDeck twice). Cards are popped
    // from the end; deckInts[51] is the first card dealt.
    (table as any).newDeck = () => deckCards.slice();

    // Capture starting stacks BEFORE dealCards() posts blinds.
    const startingStacksByAddr = new Map<string, bigint>();
    for (const player of table.players) {
      if (!player) continue;
      startingStacksByAddr.set(
        player.id,
        BigInt(Math.max(0, Math.round(player.stackSize)))
      );
    }

    // Deal cards: with our newDeck override above, chevtek now pops from the
    // deterministic deck. Blinds posted, currentRound set, currentPosition set.
    table.dealCards();

    // Store live table
    this.activeTables.set(tableId, table);

    // Extract hole cards for each player
    const holeCardsByAddr = new Map<string, number[]>();
    for (const player of table.players) {
      if (!player || !player.holeCards) continue;
      const cards = player.holeCards.map(cardToInt);
      holeCardsByAddr.set(player.id, cards);
    }

    // Capture blind amounts BEFORE any board-runout; gatherBets zeroes player.bet.
    const sbPlayer = table.players[table.smallBlindPosition!];
    const bbPlayer = table.players[table.bigBlindPosition!];
    const sbBlind = sbPlayer ? sbPlayer.bet : sb;
    const bbBlind = bbPlayer ? bbPlayer.bet : bb;

    // If no one can voluntarily act (e.g. heads-up where the SB went all-in on
    // posting the blind), chevtek's dealCards leaves currentPosition on an
    // all-in player and the hand deadlocks — no action will ever arrive, and
    // tryStartNextHand won't fire because completed_at stays NULL. Drive the
    // state machine forward; it auto-deals remaining streets and showdowns.
    if (table.currentRound && table.actingPlayers.length <= 1) {
      table.nextAction();
    }

    // Insert hand into DB (chip ints). Plaintext serverSeed goes into the
    // companion `poker_hand_pending_seeds` row, not the live `poker_hands`
    // row — both writes share a transaction so the seed is recoverable iff
    // the hand was committed.
    const potStr0 = String(Math.max(0, Math.round(totalPotChips(table))));
    const lastRaiseSizeStr = String(Math.round(bb));
    const tournamentIdForHand: string | null = tblRow.tournament_id ?? null;
    const handId: string = await this.dbService.withTransaction(async (client) => {
      const handInsert = await client.query(
        `INSERT INTO poker_hands
           (table_id, tournament_id, hand_number, button_position, server_seed_hash, server_seed, client_seed,
            community_cards, pot_amount, street, acting_position, turn_started_at, last_raise_size)
         VALUES ($1, $2, $3, $4, $5, NULL, $6, '[]'::JSONB, $7::NUMERIC, 'preflop', $8, NOW(), $9)
         RETURNING id`,
        [
          tableId,
          tournamentIdForHand,
          handNumber,
          table.dealerPosition,
          serverSeedHash,
          clientSeed,
          potStr0,
          table.currentPosition ?? null,
          lastRaiseSizeStr,
        ]
      );
      const id = handInsert.rows[0].id as string;
      await client.query(
        `INSERT INTO poker_hand_pending_seeds (hand_id, server_seed) VALUES ($1, $2)`,
        [id, serverSeed],
      );
      return id;
    });
    this.handStartingStacks.set(handId, startingStacksByAddr);

    // Insert hole cards
    for (const [addr, cards] of holeCardsByAddr) {
      await pool.query(
        `INSERT INTO poker_hand_hole_cards (hand_id, player_address, cards)
         VALUES ($1, $2, $3::JSONB)`,
        [handId, addr, JSON.stringify(cards)]
      );
    }

    // Insert blind actions (chip ints)
    const blindAmountStr = (chips: number) => String(Math.max(0, Math.round(chips)));
    let actionOrder = 1;
    if (sbPlayer) {
      await pool.query(
        `INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order")
         VALUES ($1, $2, 'preflop', 'blind', $3::NUMERIC, $4)`,
        [handId, sbPlayer.id, blindAmountStr(sbBlind), actionOrder++]
      );
    }
    if (bbPlayer) {
      await pool.query(
        `INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order")
         VALUES ($1, $2, 'preflop', 'blind', $3::NUMERIC, $4)`,
        [handId, bbPlayer.id, blindAmountStr(bbBlind), actionOrder++]
      );
    }

    // Update poker_tables
    await pool.query(
      `UPDATE poker_tables SET status = 'playing', hand_number = $2, button_position = $3 WHERE id = $1`,
      [tableId, handNumber, table.dealerPosition]
    );

    // Sync seat stacks (blinds already deducted by chevtek)
    await this.syncSeatsFromTable(pool, tableId, table);

    // If the hand already ran to showdown (all remaining players were all-in
    // from blinds), finalize now — no player actions will ever arrive.
    if (!table.currentRound && table.winners) {
      const showdownDeferred = await this.completeShowdownWithOptionalRunout(pool, tableId, handId, table, 0);
      await this.broadcastState(tableId);
      if (!showdownDeferred) {
        this.scheduleNextHandAfterShowdown(tableId);
      }
    }

    return this.getTableState(tableId, null);
  }

  // ---------------------------------------------------------------------------
  // playerAction
  // ---------------------------------------------------------------------------

  async playerAction(
    tableId: string,
    handId: string,
    playerAddress: string,
    action: string,
    amount?: string
  ): Promise<PokerTableState> {
    return this.withTableLock(tableId, () => this._playerAction(tableId, handId, playerAddress, action, amount));
  }

  private async _playerAction(
    tableId: string,
    handId: string,
    playerAddress: string,
    action: string,
    amount?: string
  ): Promise<PokerTableState> {
    const normalized = this.normalizeAddress(playerAddress);
    const pool = this.getPool();

    // Validate hand
    const handRow = await pool.query(
      'SELECT * FROM poker_hands WHERE id = $1 AND table_id = $2 AND completed_at IS NULL',
      [handId, tableId]
    );
    if (handRow.rows.length === 0) throw new Error('Hand not found or already completed');

    // In-memory table is recoverable; reconstruct from DB when cache is missing.
    const table = await this.getOrReconstructActiveTable(tableId, pool, 'player_action');

    // Validate it's this player's turn
    const actor = table.currentActor;
    if (!actor) throw new Error('No acting player');
    if (actor.id !== normalized) throw new Error('Not your turn');

    // Pre-validate action against engine's legal actions before executing
    const legal = actor.legalActions();
    const requestedAction = action === 'bet' || action === 'raise'
      ? (legal.includes(action) ? action : (action === 'bet' && legal.includes('raise') ? 'raise' : action))
      : action;
    if (!legal.includes(requestedAction) && requestedAction !== 'fold') {
      logger.warn('Poker illegal action rejected', {
        tableId, handId, player: normalized, action,
        legalActions: legal, currentBet: table.currentBet, playerBet: actor.bet,
      });
      throw new Error(`Illegal action: "${action}" is not allowed. Legal: ${legal.join(', ')}`);
    }

    // Execute the validated action — not the raw client label (e.g. open-raise must call raiseAction, not betAction).
    const effectiveAction = action === 'bet' || action === 'raise' ? requestedAction : action;

    // Capture street before action (for DB recording)
    const streetBefore = chevtekStreetToPoker(table.currentRound, !!table.winners);
    const communityLenBeforeAction = table.communityCards?.length ?? 0;

    const tableRow = await pool.query(
      'SELECT big_blind FROM poker_tables WHERE id = $1',
      [tableId]
    );
    const bbChips = Number(tableRow.rows[0]?.big_blind ?? 0);

    const parseAmountChips = (): number => {
      // Validate before BigInt() — BigInt throws on "NaN", "abc", "1e308",
      // decimals etc., which would surface as an uncaught error rather than
      // a clean "Invalid amount" response to the client.
      const raw = amount ?? '0';
      if (typeof raw !== 'string' || !/^-?\d+$/.test(raw)) {
        throw new Error('Invalid amount: must be a whole-number integer string');
      }
      let amt = Math.min(Number(BigInt(raw)), actor.stackSize);
      if (!Number.isFinite(amt) || amt < 0) amt = 0;
      return amt;
    };

    let actionAmountDb = '0';

    switch (effectiveAction) {
      case 'fold':
        actor.foldAction();
        break;
      case 'check':
        if ((table.currentBet ?? 0) > actor.bet) {
          throw new Error('Cannot check when facing a bet');
        }
        actor.checkAction();
        break;
      case 'call': {
        // Capture the call amount BEFORE callAction (which zeroes the difference)
        const callChips = (table.currentBet ?? 0) - actor.bet;
        if (callChips <= 0) {
          throw new Error('Nothing to call');
        }
        actor.callAction();
        actionAmountDb = String(Math.max(0, Math.round(callChips)));
        break;
      }
      case 'bet': {
        const amtChips = parseAmountChips();
        if (amtChips === 0 && actor.stackSize === 0) throw new Error('You are already all-in');
        actor.betAction(amtChips);
        // Chevtek only updates `table.lastRaise` when raising an existing bet,
        // so an opening bet on a new street leaves `lastRaise` stale from the
        // previous street. Standard No-Limit rule: an opening bet sets the
        // raise increment to the bet size, so the next minimum raise is
        // bet + bet (e.g. open 75 → min raise to 150).
        table.lastRaise = amtChips;
        actionAmountDb = String(Math.max(0, Math.round(amtChips)));
        break;
      }
      case 'raise': {
        const amtChips = parseAmountChips();
        if (amtChips === 0 && actor.stackSize === 0) throw new Error('You are already all-in');
        // Enforce min-raise *before* chevtek, because its `raiseAction` silently
        // accepts undersized raises whenever `amount >= stackSize` (treating
        // them as all-in-for-less). We only want that exception when the actor
        // actually goes all-in, not when the requested amount happens to match
        // their stack by coincidence with chips left over.
        const currentBetChips = table.currentBet ?? 0;
        const lastRaiseChips = table.lastRaise ?? bbChips;
        const minRaiseIncrement = Math.max(lastRaiseChips, bbChips);
        const minRaiseTotal = currentBetChips + minRaiseIncrement;
        const isAllIn = amtChips >= actor.stackSize;
        if (!isAllIn && amtChips < minRaiseTotal) {
          throw new Error(
            `Raise must be at least ${minRaiseTotal} (currentBet ${currentBetChips} + ${minRaiseIncrement}).`
          );
        }
        actor.raiseAction(amtChips);
        actionAmountDb = String(Math.max(0, Math.round(amtChips)));
        break;
      }
      default:
        throw new Error('Invalid action');
    }

    // Reset AFK timeout counter (and un-sit if sitting_out) on voluntary action.
    // Also clear disconnected_at — taking an action is irrefutable proof the
    // player is back, so the extended 90-second clock for disconnected seats
    // should revert to the normal 60-second one for their next turn.
    await pool.query(
      `UPDATE poker_seats
       SET consecutive_timeouts = 0, status = 'active', disconnected_at = NULL
       WHERE table_id = $1 AND player_address = $2`,
      [tableId, normalized]
    );

    // Determine what happened after the action
    const newStreet = chevtekStreetToPoker(table.currentRound, !!table.winners);
    const isShowdown = !table.currentRound && !!table.winners;
    const streetChanged = newStreet !== streetBefore || isShowdown;

    // Get next order number for DB
    const orderResult = await pool.query(
      'SELECT COALESCE(MAX("order"), 0) + 1 AS next_order FROM poker_hand_actions WHERE hand_id = $1',
      [handId]
    );
    const nextOrder = Number(orderResult.rows[0].next_order);

    await pool.query(
      `INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order")
       VALUES ($1, $2, $3, $4, $5::NUMERIC, $6)`,
      [handId, normalized, streetBefore, effectiveAction, actionAmountDb, nextOrder]
    );

    if (isShowdown) {
      const showdownDeferred = await this.completeShowdownWithOptionalRunout(
        pool,
        tableId,
        handId,
        table,
        communityLenBeforeAction,
      );
      await this.broadcastState(tableId);
      if (!showdownDeferred) {
        this.scheduleNextHandAfterShowdown(tableId);
      }
    } else {
      // Update community cards, pot, acting position, street (chip ints)
      const communityInts = table.communityCards.map(cardToInt);
      const potStr = String(Math.max(0, Math.round(totalPotChips(table))));
      const actingPos = table.currentPosition ?? null;
      const lrChips = table.lastRaise ?? bbChips;
      const lastRaiseSizeDb = streetChanged
        ? String(Math.round(bbChips))
        : String(Math.max(0, Math.round(lrChips)));

      await pool.query(
        `UPDATE poker_hands
         SET street = $2, community_cards = $3::JSONB, acting_position = $4,
             pot_amount = $5::NUMERIC, last_raise_size = $6::NUMERIC,
             turn_started_at = CASE WHEN $7 THEN NOW() ELSE turn_started_at END
         WHERE id = $1`,
        [
          handId,
          newStreet,
          JSON.stringify(communityInts),
          actingPos,
          potStr,
          lastRaiseSizeDb,
          // Reset turn_started_at when actor changes or street changes
          actingPos !== (handRow.rows[0].acting_position != null ? Number(handRow.rows[0].acting_position) : null) || streetChanged,
        ]
      );

      // Sync seat stacks
      await this.syncSeatsFromTable(pool, tableId, table);
      await this.broadcastState(tableId);
    }

    return this.getTableState(tableId, normalized);
  }

  // ---------------------------------------------------------------------------
  // persistShowdown
  // ---------------------------------------------------------------------------

  private async persistShowdown(pool: Pool, tableId: string, handId: string, table: Table): Promise<void> {
    const isTournament = await this.isTournamentTable(tableId);
    const resultWinners: { address: string; amount: string; handName?: string; winningCardIndices?: number[] }[] = [];

    // Integer chip split per pot (no float drift), then convert to wei for cash.
    const winnerChips = new Map<string, bigint>();
    // Refund-pot detection is gated on activePlayers.length >= 2 (a real
    // showdown). On a fold-out (single survivor), chevtek's line-346
    // filter strips folded players from each pot's eligibles, often
    // leaving the survivor as the sole eligible player even for the main
    // pot — that's a legit win, NOT a refund, so we must not skip those.
    const realShowdown = Array.isArray(table.activePlayers) && table.activePlayers.length >= 2;
    for (const pot of table.pots) {
      if (!pot.winners || pot.winners.length === 0) continue;
      const nonFoldedWinners = pot.winners.filter((w: any) => !w.folded);
      if (nonFoldedWinners.length === 0) continue;
      // Uncalled-bet refund pot — at a real showdown, a pot with only one
      // eligible player can only arise because that player over-bet the
      // covering opponent (e.g. SB posts 3,200 while the only opponent's
      // BB is all-in for 2,000; SB's 1,200 surplus comes back here).
      // Industry rooms don't treat this as winning the hand. Skip it from
      // winnerChips so the player gets no WINNER badge, no hand-name
      // pill, no rake, and no entry in the activity feed. Their stack
      // already reflects the refund — chevtek credits .stackSize during
      // showdown().
      if (realShowdown && Array.isArray(pot.eligiblePlayers) && pot.eligiblePlayers.length <= 1) continue;
      const potChips = BigInt(Math.max(0, Math.round(pot.amount)));
      const ids = nonFoldedWinners.map((w: any) => w.id as string);
      const shares = splitBigIntEqually(potChips, ids.length);
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        winnerChips.set(id, (winnerChips.get(id) ?? 0n) + shares[i]);
      }
    }

    // Compute per-player rake (cash games only) and build winner amounts (chip ints) for the result payload.
    let totalRakeChips = 0n;
    const rakeByAddr = new Map<string, bigint>(); // per-winner rake in chips
    const rakedWinnerAmounts = new Map<string, bigint>();
    if (isTournament) {
      for (const [addr, ch] of winnerChips) {
        rakedWinnerAmounts.set(addr, ch);
      }
    } else {
      const pct = BigInt(RAKE_PERCENT);
      for (const [addr, ch] of winnerChips) {
        const rakeChips = (ch * pct) / 100n;
        rakedWinnerAmounts.set(addr, ch - rakeChips);
        rakeByAddr.set(addr, rakeChips);
        totalRakeChips += rakeChips;
      }
    }

    // Sync engine stacks → DB (chip ints), applying rake deduction atomically for cash games.
    for (const player of table.players) {
      if (!player) continue;
      const grossChips = BigInt(Math.max(0, Math.round(player.stackSize)));
      const playerRake = rakeByAddr.get(player.id) ?? 0n;
      const netChips = grossChips > playerRake ? grossChips - playerRake : 0n;
      await pool.query(
        'UPDATE poker_seats SET stack = $3::NUMERIC WHERE table_id = $1 AND player_address = $2',
        [tableId, player.id, netChips.toString()]
      );
    }

    const rakeWallet = getPokerRakeWallet();
    if (totalRakeChips > 0n && !isTournament) {
      await this.dbService.withTransaction(async (c) => {
        await applyPokerChipDelta(c, rakeWallet, totalRakeChips, 'rake', { type: 'poker_hand', id: handId });
      });
      logger.info('Poker rake collected (chips)', { handId, tableId, rakeChips: totalRakeChips.toString(), wallet: rakeWallet });
    }

    // Get hole cards from DB for hand names
    const holeResult = await pool.query(
      'SELECT player_address, cards FROM poker_hand_hole_cards WHERE hand_id = $1',
      [handId]
    );
    const holeCardsByAddr = new Map<string, number[]>();
    for (const row of holeResult.rows) {
      const cards = Array.isArray(row.cards) ? row.cards : JSON.parse(row.cards ?? '[]');
      holeCardsByAddr.set(row.player_address, cards);
    }
    const communityInts = table.communityCards.map(cardToInt);

    for (const [addr, amount] of rakedWinnerAmounts) {
      const holeCards = holeCardsByAddr.get(addr) ?? [];
      const allCards = [...holeCards, ...communityInts];
      let handName: string | undefined;
      let winningCardIndices: number[] | undefined;
      if (allCards.length >= 5) {
        const ranked = bestHand(allCards);
        winningCardIndices = ranked.cards;
        const livePlayer = table.players.find((p) => p?.id === addr);
        if (livePlayer?.hand) {
          handName = livePlayer.hand.descr ?? undefined;
        }
      }
      resultWinners.push({ address: addr, amount: amount.toString(), handName, winningCardIndices });
    }

    // Reveal the provably-fair server seed: move the plaintext from
    // `poker_hand_pending_seeds` into `poker_hands.server_seed` and complete
    // the hand. Wrapped in a transaction so a crash between the reveal and
    // the completion can't leave the seed published before completed_at is
    // set (which is the integrity guarantee the verify endpoint relies on).
    // For legacy hands started before migration 119 the SELECT returns 0 rows
    // and the seed write is skipped — backward-safe.
    await this.dbService.withTransaction(async (client) => {
      const pending = await client.query(
        `SELECT server_seed FROM poker_hand_pending_seeds WHERE hand_id = $1`,
        [handId],
      );
      const revealedSeed: string | null = pending.rows[0]?.server_seed ?? null;

      // Refresh pot_amount from the engine's final gathered state. The
      // per-action UPDATE earlier in the hand snapshots pot_amount *before*
      // the final street's bets are gathered into chevtek's pots, so without
      // this refresh the stored pot is short by the last round of
      // contributions. Stack flow / `result.winners.amount` were always
      // correct; this just keeps the recorded pot consistent for stats.
      const finalPotChips = String(Math.max(0, Math.round(totalPotChips(table))));

      await client.query(
        `UPDATE poker_hands
         SET completed_at = NOW(), street = 'showdown', acting_position = NULL,
             community_cards = $2::JSONB, result = $3::JSONB, rake_amount = $4::NUMERIC,
             server_seed = COALESCE($5, server_seed),
             pot_amount = $6::NUMERIC
         WHERE id = $1`,
        [
          handId,
          JSON.stringify(communityInts),
          JSON.stringify({ winners: resultWinners }),
          totalRakeChips.toString(),
          revealedSeed,
          finalPotChips,
        ],
      );

      if (revealedSeed != null) {
        await client.query(
          `DELETE FROM poker_hand_pending_seeds WHERE hand_id = $1`,
          [handId],
        );
      }
    });

    try {
      await this.populateHandPlayers(pool, handId, table, {
        winnerChips,
        rakedWinnerAmounts,
        rakeByAddr,
        resultWinners,
      }, isTournament);
    } catch (err) {
      logger.error('populateHandPlayers failed', { handId, tableId, err });
    } finally {
      this.handStartingStacks.delete(handId);
    }

    await pool.query('UPDATE poker_tables SET status = $2 WHERE id = $1', [tableId, 'waiting']);

    // The Rail: surface a big cash-game pot to the group feed. railCashBigPot
    // applies the 100x-big-blind threshold itself; tournament tables excluded.
    if (!isTournament) {
      let totalPotChips = 0n;
      for (const ch of winnerChips.values()) totalPotChips += ch;
      void railCashBigPot(pool, tableId, totalPotChips, resultWinners);
    }

    // Stash the just-completed hand number so `scheduleNextHandAfterShowdown`
    // can fire the tournament post-hand callback (eliminations + blind
    // updates) when the inter-hand timer expires — NOT immediately. Keeping
    // the busted player seated through the full reveal + 15s post-showdown
    // window matches the cinematic UX the rest of the table sees and lets
    // them chat / react before the auto-leave kicks in.
    const handRow = await pool.query('SELECT hand_number FROM poker_hands WHERE id = $1', [handId]);
    const handNumber = Number(handRow.rows[0]?.hand_number ?? 0);
    this.pendingPostHandHandNumbers.set(tableId, handNumber);

    // Fold-out show/muck offer: when the hand ended with no showdown (sole
    // survivor — everyone else folded), give that winner a short window to
    // optionally reveal their hole cards. `realShowdown` here is the same
    // signal used above to skip refund pots — true if ≥2 players were still
    // in at resolution. A real showdown auto-exposes hole cards, so the
    // offer only makes sense for the fold-out branch.
    if (!realShowdown && resultWinners.length === 1) {
      this.foldOutShowEligibility.set(tableId, {
        handId,
        winnerAddress: this.normalizeAddress(resultWinners[0].address),
        expiresAt: Date.now() + FOLD_OUT_SHOW_WINDOW_MS,
        decision: 'pending',
      });
    } else {
      this.foldOutShowEligibility.delete(tableId);
    }
  }

  // ---------------------------------------------------------------------------
  // decideFoldOutShow — winner of an uncontested pot picks Show vs Muck
  // ---------------------------------------------------------------------------

  /**
   * Record the fold-out winner's Show/Muck decision. On 'show', looks up their
   * hole cards from `poker_hand_hole_cards` and stores them in-memory so the
   * next `getTableState` broadcast can reveal them to the room. On 'muck',
   * just marks the decision so the buttons disappear for everyone.
   *
   * Returns the updated table state for the caller; the websocket layer is
   * responsible for broadcasting it to the room.
   */
  async decideFoldOutShow(
    tableId: string,
    handId: string,
    playerAddress: string,
    decision: 'show' | 'muck',
  ): Promise<PokerTableState> {
    const elig = this.foldOutShowEligibility.get(tableId);
    if (!elig) throw new Error('No show/muck offer is active');
    if (elig.handId !== handId) throw new Error('Hand has already changed');
    if (elig.decision !== 'pending') throw new Error('Decision already made');
    if (Date.now() > elig.expiresAt) {
      elig.decision = 'mucked';
      throw new Error('Show/muck window has expired');
    }
    const normalized = this.normalizeAddress(playerAddress);
    if (elig.winnerAddress !== normalized) {
      throw new Error('Only the uncalled winner can show or muck');
    }

    if (decision === 'muck') {
      elig.decision = 'mucked';
    } else {
      const pool = this.getPool();
      const r = await pool.query(
        'SELECT cards FROM poker_hand_hole_cards WHERE hand_id = $1 AND player_address = $2',
        [handId, normalized],
      );
      if (r.rows.length === 0) {
        throw new Error('Hole cards no longer available');
      }
      const cards = Array.isArray(r.rows[0].cards)
        ? (r.rows[0].cards as number[])
        : (JSON.parse(r.rows[0].cards ?? '[]') as number[]);
      elig.decision = 'shown';
      elig.revealedHoleCards = cards;
    }

    return this.getTableState(tableId, normalized);
  }

  // ---------------------------------------------------------------------------
  // populateHandPlayers
  // ---------------------------------------------------------------------------

  /**
   * Denormalize per-player stats for a completed hand into poker_hand_players.
   * Reads poker_hand_actions (already persisted) and combines with in-memory
   * starting stacks + settlement data. Failure here must never corrupt a hand —
   * errors are swallowed by the caller.
   */
  private async populateHandPlayers(
    pool: Pool,
    handId: string,
    table: Table,
    settlement: {
      winnerChips: Map<string, bigint>;
      rakedWinnerAmounts: Map<string, bigint>;
      rakeByAddr: Map<string, bigint>;
      resultWinners: { address: string; amount: string; handName?: string }[];
    },
    isTournament: boolean = false,
  ): Promise<void> {
    const startingStacks = this.handStartingStacks.get(handId) ?? new Map<string, bigint>();
    const buttonPos = table.dealerPosition;
    const sbPos = table.smallBlindPosition;
    const bbPos = table.bigBlindPosition;

    // Map each seated player -> seat position
    const seatByAddr = new Map<string, number>();
    for (let i = 0; i < table.players.length; i++) {
      const p = table.players[i];
      if (p) seatByAddr.set(p.id, i);
    }

    if (seatByAddr.size === 0) return;

    // Load all actions for this hand
    const actionsRes = await pool.query(
      `SELECT player_address, street, action, amount
         FROM poker_hand_actions
        WHERE hand_id = $1
        ORDER BY "order" ASC`,
      [handId]
    );

    type StreetName = 'preflop' | 'flop' | 'turn' | 'river';
    const streets: StreetName[] = ['preflop', 'flop', 'turn', 'river'];

    type Counts = { bets: number; raises: number; calls: number; checks: number };
    const zeroCounts = (): Counts => ({ bets: 0, raises: 0, calls: 0, checks: 0 });

    interface PlayerAgg {
      contributed: bigint;
      folded: boolean;
      foldedStreet: StreetName | null;
      saw: Record<StreetName, boolean>;
      counts: Record<StreetName, Counts>;
      vpip: boolean;
      pfr: boolean;
      threeBet: boolean;
    }

    const aggByAddr = new Map<string, PlayerAgg>();
    for (const addr of seatByAddr.keys()) {
      aggByAddr.set(addr, {
        contributed: 0n,
        folded: false,
        foldedStreet: null,
        saw: { preflop: true, flop: false, turn: false, river: false },
        counts: { preflop: zeroCounts(), flop: zeroCounts(), turn: zeroCounts(), river: zeroCounts() },
        vpip: false,
        pfr: false,
        threeBet: false,
      });
    }

    // Track preflop raise count across the whole hand for 3-bet detection.
    let preflopRaiseCount = 0;

    for (const row of actionsRes.rows) {
      const addr = String(row.player_address).toLowerCase();
      const agg = aggByAddr.get(addr);
      if (!agg) continue;
      const street = row.street as StreetName;
      const action = String(row.action);
      const amount = BigInt(row.amount ?? '0');

      agg.contributed += amount;

      if (action === 'fold') {
        agg.folded = true;
        agg.foldedStreet = street;
        continue;
      }
      if (action === 'blind') {
        // Blinds don't count as voluntary; no counts update.
        continue;
      }

      if (street === 'preflop') {
        if (action === 'call' || action === 'bet' || action === 'raise') {
          agg.vpip = true;
        }
        if (action === 'raise' || action === 'bet') {
          agg.pfr = true;
          if (preflopRaiseCount >= 1) agg.threeBet = true;
          preflopRaiseCount += 1;
        }
      }

      const c = agg.counts[street];
      if (action === 'bet') c.bets += 1;
      else if (action === 'raise') c.raises += 1;
      else if (action === 'call') c.calls += 1;
      else if (action === 'check') c.checks += 1;
    }

    // Determine which streets each player "saw" (reached without folding earlier).
    for (const agg of aggByAddr.values()) {
      for (let i = 0; i < streets.length; i++) {
        const s = streets[i];
        if (agg.folded && agg.foldedStreet && streets.indexOf(agg.foldedStreet) < i) {
          agg.saw[s] = false;
        } else {
          agg.saw[s] = true;
        }
      }
    }

    // Build winner handName / showdown lookup
    const winnerMetaByAddr = new Map<string, { handName?: string }>();
    for (const w of settlement.resultWinners) {
      winnerMetaByAddr.set(w.address.toLowerCase(), { handName: w.handName });
    }

    // Did the hand reach showdown at all? (≥2 non-folded players remain)
    const nonFoldedCount = Array.from(aggByAddr.values()).filter((a) => !a.folded).length;
    const handWentToShowdown = nonFoldedCount >= 2;

    // Batch insert rows
    for (const [addr, seatPos] of seatByAddr) {
      const agg = aggByAddr.get(addr)!;
      const startingStack = startingStacks.get(addr) ?? 0n;
      const endingStackRaw = table.players[seatPos]?.stackSize ?? 0;
      const endingStack = BigInt(Math.max(0, Math.round(endingStackRaw)));
      const rakePaid = settlement.rakeByAddr.get(addr) ?? 0n;
      const wonNet = settlement.rakedWinnerAmounts.get(addr) ?? 0n;
      const won = wonNet > 0n;
      const meta = winnerMetaByAddr.get(addr);
      const sawShowdown = !agg.folded && handWentToShowdown;

      const c = agg.counts;
      await pool.query(
        `INSERT INTO poker_hand_players (
           hand_id, player_address, seat_position,
           is_button, is_small_blind, is_big_blind,
           starting_stack, ending_stack, contributed, won_amount, rake_paid,
           saw_flop, saw_turn, saw_river, saw_showdown,
           folded, folded_street, won, hand_name,
           vpip, pfr, three_bet,
           preflop_bets, preflop_raises, preflop_calls, preflop_checks,
           flop_bets, flop_raises, flop_calls, flop_checks,
           turn_bets, turn_raises, turn_calls, turn_checks,
           river_bets, river_raises, river_calls, river_checks
         )
         VALUES (
           $1, $2, $3,
           $4, $5, $6,
           $7::NUMERIC, $8::NUMERIC, $9::NUMERIC, $10::NUMERIC, $11::NUMERIC,
           $12, $13, $14, $15,
           $16, $17, $18, $19,
           $20, $21, $22,
           $23, $24, $25, $26,
           $27, $28, $29, $30,
           $31, $32, $33, $34,
           $35, $36, $37, $38
         )
         ON CONFLICT (hand_id, player_address) DO NOTHING`,
        [
          handId,
          addr,
          seatPos,
          seatPos === buttonPos,
          sbPos != null && seatPos === sbPos,
          bbPos != null && seatPos === bbPos,
          startingStack.toString(),
          endingStack.toString(),
          agg.contributed.toString(),
          wonNet.toString(),
          rakePaid.toString(),
          agg.saw.flop,
          agg.saw.turn,
          agg.saw.river,
          sawShowdown,
          agg.folded,
          agg.foldedStreet,
          won,
          meta?.handName ?? null,
          agg.vpip,
          agg.pfr,
          agg.threeBet,
          c.preflop.bets, c.preflop.raises, c.preflop.calls, c.preflop.checks,
          c.flop.bets, c.flop.raises, c.flop.calls, c.flop.checks,
          c.turn.bets, c.turn.raises, c.turn.calls, c.turn.checks,
          c.river.bets, c.river.raises, c.river.calls, c.river.checks,
        ]
      );

      if (!isTournament) {
        try {
          const wagerWei = agg.contributed * POKER_CHIP_WEI;
          if (wagerWei > 0n) {
            await applyWheelWagerCredit(
              pool,
              addr,
              wagerWei,
              'wager_volume_poker',
              { type: 'hand_player', id: `${handId}:${addr}` },
            );
            await recordDailyMilestone(pool, addr, 'first_poker');
            await recordGameOutcome(pool, addr, 'poker', won);
          }
        } catch (e) {
          logger.warn('wheel ledger update failed (poker)', {
            handId,
            addr,
            error: (e as Error).message,
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // autoFoldTimedOutTurns
  // ---------------------------------------------------------------------------

  async autoFoldTimedOutTurns(): Promise<string[]> {
    const pool = this.getPool();
    // Auto-fold clock has three tiers:
    //   - Hard AFK (consecutive_timeouts >= POKER_AFK_KICK_AFTER): ~5s. Once a
    //     player has missed two turns in a row, we stop letting them stall the
    //     table. In tournaments this is what drives the bleed-out — they keep
    //     being dealt and keep posting blinds, but each turn folds in 5s.
    //     Hard-AFK wins over the disconnect extension; once you've proven you
    //     aren't paying attention, the DC grace is moot.
    //   - Disconnected (disconnected_at IS NOT NULL): 90s. Browser closed,
    //     network dropped, etc. Extra room to reconnect.
    //   - Connected & engaged: 60s. Normal clock.
    // The hard-AFK counter is cleared on any voluntary action OR on poker_im_back.
    // The disconnect flag is cleared on any reconnect signal.
    const timedOut = await pool.query(
      `SELECT h.id AS hand_id, h.table_id, h.acting_position
       FROM poker_hands h
       JOIN poker_seats ps ON ps.table_id = h.table_id AND ps.position = h.acting_position
       WHERE h.completed_at IS NULL
         AND h.acting_position IS NOT NULL
         AND h.turn_started_at < NOW() - (
           CASE
             WHEN ps.consecutive_timeouts >= $1 THEN ($2 || ' seconds')::INTERVAL
             WHEN ps.disconnected_at IS NOT NULL THEN INTERVAL '90 seconds'
             ELSE INTERVAL '60 seconds'
           END
         )`,
      [POKER_AFK_KICK_AFTER, String(POKER_AFK_FAST_FOLD_SECONDS)]
    );

    const folded: string[] = [];
    for (const row of timedOut.rows) {
      try {
        // Serialize with player actions on the same table
        await this.withTableLock(row.table_id, async () => {
          const table = await this.getOrReconstructActiveTable(row.table_id, pool, 'timeout_autofold');

          const actor = table.currentActor;
          if (!actor) return;

          const actingAddr = actor.id;

          // Capture street before
          const streetBefore = chevtekStreetToPoker(table.currentRound, !!table.winners);
          const communityLenBeforeTimeout = table.communityCards?.length ?? 0;

          // Auto-check when not facing a bet; auto-fold when facing a bet
          const canCheck = !table.currentBet || actor.bet >= table.currentBet;
          const timeoutAction = canCheck ? 'check' : 'fold';
          if (canCheck) {
            actor.checkAction();
          } else {
            actor.foldAction();
          }

          // Record the timeout action
          const orderResult = await pool.query(
            'SELECT COALESCE(MAX("order"), 0) + 1 AS next_order FROM poker_hand_actions WHERE hand_id = $1',
            [row.hand_id]
          );
          const nextOrder = Number(orderResult.rows[0].next_order);
          await pool.query(
            `INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order")
             VALUES ($1, $2, $3, $4, 0, $5)`,
            [row.hand_id, actingAddr, streetBefore, timeoutAction, nextOrder]
          );

          // Increment AFK timeout counter for the player who just got auto-actioned.
          // The counter is reset to 0 on any voluntary action (see PlayerAction
          // handler) or on sit-back. In CASH games, hitting POKER_AFK_KICK_AFTER
          // flips the player to sitting_out so we stop auto-folding them
          // indefinitely; from there the 15-min kickStaleSitOuts sweep will
          // return their stack. In TOURNAMENTS the counter still increments for
          // UI/telemetry, but the status flip is suppressed — tournament AFK
          // players keep getting dealt in and posting blinds until they bust.
          const isTournament = await this.isTournamentTable(row.table_id);
          const timeoutUp = await pool.query(
            `UPDATE poker_seats
             SET consecutive_timeouts = consecutive_timeouts + 1
             WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)
             RETURNING consecutive_timeouts`,
            [row.table_id, actingAddr]
          );
          const newTimeoutCount = Number(timeoutUp.rows[0]?.consecutive_timeouts ?? 0);
          if (!isTournament && newTimeoutCount >= POKER_AFK_KICK_AFTER) {
            await pool.query(
              `UPDATE poker_seats
               SET status = 'sitting_out', sit_out_since = NOW()
               WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)
                 AND status != 'sitting_out'`,
              [row.table_id, actingAddr]
            );
            this.notifyCallback?.(`poker:table:${row.table_id}`, 'poker_player_sitting_out', {
              tableId: row.table_id,
              playerAddress: actingAddr,
              reason: 'afk_timeout',
            });
            logger.info('Auto sit-out after consecutive timeouts (cash)', {
              tableId: row.table_id,
              player: actingAddr,
              timeouts: newTimeoutCount,
            });
          }

          if (!table.currentRound && table.winners) {
            const showdownDeferred = await this.completeShowdownWithOptionalRunout(
              pool,
              row.table_id,
              row.hand_id,
              table,
              communityLenBeforeTimeout,
            );
            await this.broadcastState(row.table_id);
            if (!showdownDeferred) {
              this.scheduleNextHandAfterShowdown(row.table_id);
            }
          } else {
            const communityInts = table.communityCards.map(cardToInt);
            const potStr = String(Math.max(0, Math.round(totalPotChips(table))));
            const actingPos = table.currentPosition ?? null;
            const newStreet = chevtekStreetToPoker(table.currentRound, false);
            await pool.query(
              `UPDATE poker_hands
               SET street = $2, community_cards = $3::JSONB, acting_position = $4,
                   pot_amount = $5::NUMERIC, turn_started_at = NOW()
               WHERE id = $1`,
              [row.hand_id, newStreet, JSON.stringify(communityInts), actingPos, potStr]
            );
            await this.syncSeatsFromTable(pool, row.table_id, table);
            await this.broadcastState(row.table_id);
          }

          folded.push(actingAddr);
          logger.info(`Auto-${timeoutAction} timed-out turn`, { handId: row.hand_id, player: actingAddr, action: timeoutAction });
        });
      } catch (err) {
        logger.error('Error auto-folding timed-out turn', { handId: row.hand_id, error: err });
      }
    }
    return folded;
  }

  // ---------------------------------------------------------------------------
  // tickServerTournamentBots
  // ---------------------------------------------------------------------------
  //
  // Tournament "bots": in-process actions for seats whose address is in the same wallet pool as
  // CLI `poker-bot.ts` — POKER_BOT_ADDRESSES, then CYPRESS/POKER_TEST_PLAYERS, then built-in defaults.
  // Optional: POKER_SERVER_BOT_STRICT_ADDRESSES=true to require explicit POKER_BOT_ADDRESSES only.
  //
  // Disable: POKER_SERVER_TOURNAMENT_BOTS=false
  // Think delay (ms): POKER_SERVER_BOT_THINK_MS (default 1200, clamped 200–10000)

  async tickServerTournamentBots(): Promise<void> {
    const off = String(process.env.POKER_SERVER_TOURNAMENT_BOTS ?? '').toLowerCase();
    if (off === 'false' || off === '0' || off === 'no') return;

    const botSet = getServerPokerBotAddressSet();
    if (botSet.size === 0) return;

    let thinkMs = 1200;
    const rawThink = process.env.POKER_SERVER_BOT_THINK_MS;
    if (rawThink) {
      const n = Number(rawThink);
      if (Number.isFinite(n) && n >= 200 && n <= 10_000) thinkMs = Math.floor(n);
    }

    const pool = this.getPool();
    const result = await pool.query(
      `SELECT h.id AS hand_id, h.table_id, h.acting_position
       FROM poker_hands h
       INNER JOIN poker_tables pt ON pt.id = h.table_id
       WHERE h.completed_at IS NULL
         AND h.acting_position IS NOT NULL
         AND pt.tournament_id IS NOT NULL
         AND h.turn_started_at IS NOT NULL
         AND h.turn_started_at < NOW() - ($1 * INTERVAL '1 millisecond')`,
      [thinkMs]
    );

    for (const row of result.rows) {
      try {
        const seatQ = await pool.query(
          `SELECT player_address FROM poker_seats
           WHERE table_id = $1 AND position = $2 AND player_address IS NOT NULL`,
          [row.table_id, row.acting_position]
        );
        const rawAddr = seatQ.rows[0]?.player_address;
        if (!rawAddr) continue;
        const addr = this.normalizeAddress(String(rawAddr));
        if (!botSet.has(addr)) continue;

        const state = await this.getTableState(row.table_id, addr);
        const hand = state.currentHand;
        if (!hand || hand.handId !== row.hand_id) continue;
        if (hand.street === 'showdown') continue;
        if (hand.actingPosition == null) continue;
        const botSeatIdx = state.seats.findIndex(
          (s) => s.playerAddress && this.normalizeAddress(String(s.playerAddress)) === addr,
        );
        if (botSeatIdx < 0 || hand.actingPosition !== botSeatIdx) continue;
        if (!['preflop', 'flop', 'turn', 'river'].includes(hand.street)) continue;

        const mySeat = state.seats.find(
          (s) => s.playerAddress && this.normalizeAddress(s.playerAddress) === addr
        );
        const decision = decidePokerBotAction({
          street: hand.street,
          pot: hand.pot,
          toCall: hand.toCall,
          minRaise: hand.minRaise,
          myStack: mySeat?.stack ?? '0',
          myHoleCards: state.myHoleCards,
        });

        await this.playerAction(row.table_id, row.hand_id, addr, decision.action, decision.amount);
      } catch (err) {
        logger.warn('Poker server tournament bot tick failed', {
          tableId: row.table_id,
          handId: row.hand_id,
          message: (err as Error)?.message,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // reconstructTable
  // ---------------------------------------------------------------------------

  private async reconstructTable(tableId: string, pool: Pool): Promise<Table> {
    const tblRow = await pool.query(
      'SELECT small_blind, big_blind, max_seats, button_position, hand_number FROM poker_tables WHERE id = $1',
      [tableId]
    );
    if (tblRow.rows.length === 0) throw new Error('Table not found');
    const tbl = tblRow.rows[0];

    const sb = Number(tbl.small_blind ?? 0);
    const bb = Number(tbl.big_blind ?? 0);
    if (!Number.isFinite(sb) || !Number.isFinite(bb) || sb <= 0 || bb <= 0) {
      throw new Error('Invalid blinds');
    }

    const activeHand = await pool.query(
      `SELECT * FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [tableId]
    );

    const seatsResult = await pool.query(
      'SELECT position, player_address, stack FROM poker_seats WHERE table_id = $1 ORDER BY position',
      [tableId]
    );

    const table = new Table(0, sb, bb);
    applyEnginePatches(table);

    if (activeHand.rows.length === 0) {
      // No active hand — just seat players
      for (const seat of seatsResult.rows) {
        if (!seat.player_address || BigInt(seat.stack ?? '0') === 0n) continue;
        const pos = Number(seat.position);
        const addr = (seat.player_address || '').toLowerCase();
        const stackChips = Number(seat.stack ?? 0);
        if (pos === 0) {
          table.sitDown(addr, stackChips);
        } else {
          table.sitDown(addr, stackChips, pos);
        }
      }
      if (tbl.button_position != null) {
        try { table.moveDealer(Number(tbl.button_position)); } catch { /* ignore */ }
      }
      return table;
    }

    const hand = activeHand.rows[0];

    // Get hole cards from DB to know who was dealt in
    const holeCardsResult = await pool.query(
      'SELECT player_address, cards FROM poker_hand_hole_cards WHERE hand_id = $1',
      [hand.id]
    );
    const dealtAddrs = new Set(
      holeCardsResult.rows.map((r: any) => (r.player_address || '').toLowerCase()),
    );

    const actionsResult = await pool.query(
      `SELECT player_address, action, amount FROM poker_hand_actions WHERE hand_id = $1 ORDER BY "order"`,
      [hand.id]
    );

    const committedChips = new Map<string, number>();
    for (const row of actionsResult.rows) {
      const addr = (row.player_address || '').toLowerCase();
      if (!['bet', 'raise', 'call', 'blind'].includes(row.action)) continue;
      committedChips.set(addr, (committedChips.get(addr) ?? 0) + Number(row.amount ?? 0));
    }

    for (const seat of seatsResult.rows) {
      const addr = (seat.player_address || '').toLowerCase();
      if (!dealtAddrs.has(addr)) continue;
      const pos = Number(seat.position);
      const currentStack = Number(seat.stack ?? 0);
      const totalCommitted = committedChips.get(addr) ?? 0;
      const startingStack = currentStack + totalCommitted;

      if (pos === 0) {
        table.sitDown(addr, startingStack);
      } else {
        table.sitDown(addr, startingStack, pos);
      }
    }

    // Set dealer position; handNumber=0 so dealCards() increments to 1 and won't auto-move
    const dealerPos = Number(hand.button_position);
    table.moveDealer(dealerPos);
    (table as any).handNumber = 0;

    // Inject hole cards and deck
    // We need to give chevtek a deck; set table.deck so dealCards() uses our cards.
    // The deck order: dealCards() pops cards for each player (in player array order).
    // We reconstruct by manually assigning holeCards to each player after dealCards.

    // Build a dummy deck (dealCards will pop from it)
    // We'll set the deck to cards NOT used as hole cards (community + remaining)
    // Actually, the cleanest approach: call dealCards() with a proper deck,
    // then overwrite holeCards.

    // Collect all int cards used
    const holeCardInts = new Map<string, number[]>();
    for (const row of holeCardsResult.rows) {
      const addr = (row.player_address || '').toLowerCase();
      const cards = Array.isArray(row.cards) ? row.cards : JSON.parse(row.cards ?? '[]');
      holeCardInts.set(addr, cards);
    }

    const communityCardInts: number[] = Array.isArray(hand.community_cards)
      ? hand.community_cards
      : (hand.community_cards ? JSON.parse(JSON.stringify(hand.community_cards)) : []);

    // Build deck for dealCards(): must contain all player hole cards + community cards
    // in the right pop() order. Players are dealt in order of table.players array.
    // dealCards() does: for each player in players[], pop 2 cards.
    // Then nextRound() pops 3 (flop), 1 (turn), 1 (river).
    // We construct the deck so pop() yields them in the correct order.
    // Array order = [last popped, ..., first popped] (reversed from deal order).

    const dealtOrder: number[] = [];
    for (const p of table.players) {
      if (!p) continue;
      const cards = holeCardInts.get(p.id) ?? [];
      dealtOrder.push(...cards);
    }
    // Remaining community cards based on current street
    // We add all 5 community card slots (some may be placeholders for future streets)
    // Pad with placeholder cards from the unused portion of deck
    const allUsed = new Set([...dealtOrder, ...communityCardInts]);
    const placeholderDeck: number[] = [];
    for (let i = 0; i < 52; i++) {
      if (!allUsed.has(i)) placeholderDeck.push(i);
    }

    // Community cards to be popped: flop(3), turn(1), river(1) = 5 total after hole cards
    // For reconstruction we need all 5 even if not yet dealt (they'll be dealt during replay)
    const communityFull: number[] = [
      ...communityCardInts,
      ...placeholderDeck.slice(0, 5 - communityCardInts.length),
    ];

    // Build deck array: [river, turn, flop2, flop1, flop0, holeN2, holeN1, ..., hole12, hole11]
    // (last element = first popped by pop())
    const deckOrder = [...dealtOrder, ...communityFull];
    // Reverse so pop() gives deckOrder[0] first
    table.deck = deckOrder.reverse().map(intToCard);

    // Call dealCards() which will pop from our deck
    table.dealCards();

    // Overwrite hole cards with actual DB values (in case order differs)
    for (const p of table.players) {
      if (!p) continue;
      const cards = holeCardInts.get(p.id);
      if (cards && cards.length === 2) {
        p.holeCards = [intToCard(cards[0]), intToCard(cards[1])];
      }
    }

    // Inject community cards dealt so far
    table.communityCards = communityCardInts.map(intToCard);

    // Replay non-blind actions to advance chevtek's state
    const nonBlindActions = actionsResult.rows.filter((r: any) => r.action !== 'blind');
    const totalActions = nonBlindActions.length;
    let replayedCount = 0;
    let replayFailed = false;

    for (const actionRow of nonBlindActions) {
      const actor = table.currentActor;
      if (!actor) {
        logger.warn('Reconstruct: no currentActor mid-replay', {
          tableId, replayed: replayedCount, total: totalActions,
          currentRound: table.currentRound, hasWinners: !!table.winners,
        });
        break;
      }

      const addr = (actionRow.player_address || '').toLowerCase();
      if (actor.id !== addr) {
        logger.warn('Reconstruct: actor mismatch during replay', {
          tableId, expected: actor.id, got: addr,
          replayed: replayedCount, total: totalActions,
          currentBet: table.currentBet, actorBet: actor.bet,
        });
        replayFailed = true;
        break;
      }

      try {
        switch (actionRow.action) {
          case 'fold': actor.foldAction(); break;
          case 'check': actor.checkAction(); break;
          case 'call': actor.callAction(); break;
          case 'bet': {
            const chips = Number(actionRow.amount ?? 0);
            actor.betAction(chips);
            break;
          }
          case 'raise': {
            const chips = Number(actionRow.amount ?? 0);
            actor.raiseAction(chips);
            break;
          }
        }
        replayedCount++;
      } catch (err) {
        logger.warn('Reconstruct: replay action failed', {
          tableId, action: actionRow.action, player: addr,
          replayed: replayedCount, total: totalActions,
          currentBet: table.currentBet, actorBet: actor.bet,
          legalActions: actor.legalActions(),
          err,
        });
        replayFailed = true;
        break;
      }
    }

    // If replay was incomplete, patch engine state from DB so currentBet/bets are correct.
    // This prevents the engine from allowing illegal checks after a partial replay.
    if (replayFailed && replayedCount < totalActions) {
      logger.warn('Reconstruct: patching engine state after partial replay', {
        tableId, replayed: replayedCount, total: totalActions,
      });

      // Recompute per-player committed amounts for the current street only
      const dbStreet = hand.street as string;
      const streetContribResult = await pool.query(
        `SELECT player_address, SUM(amount) AS total FROM poker_hand_actions
         WHERE hand_id = $1 AND street = $2 AND action IN ('bet','raise','call','blind')
         GROUP BY player_address`,
        [hand.id, dbStreet]
      );
      let maxContrib = 0;
      for (const row of streetContribResult.rows) {
        const chips = Number(row.total ?? 0);
        if (chips > maxContrib) maxContrib = chips;
        const p = table.players.find((pl) => pl?.id === (row.player_address || '').toLowerCase());
        if (p) p.bet = chips;
      }
      if (maxContrib > 0) {
        table.currentBet = maxContrib;
      }

      // Advance community cards to match DB street
      const targetCommunity = communityCardInts.map(intToCard);
      table.communityCards = targetCommunity;

      // Set acting position from DB
      if (hand.acting_position != null) {
        (table as any).currentPosition = Number(hand.acting_position);
      }

      // Recompute lastPosition from DB so action rotation ends correctly.
      // lastPosition = the seat position of the last player who must act before the
      // round closes (the player just before the last bettor/raiser, clockwise).
      // Without this, the stale lastPosition from a partial replay would cause seats
      // to be skipped or the same seat to act twice.
      {
        const maxSeatsForLastPos = Number(tbl.max_seats) || 10;
        const dealerPosForLastPos = Number(hand.button_position);

        // Find the last bet/raise in the current street
        const lastAggressorResult = await pool.query(
          `SELECT player_address FROM poker_hand_actions
           WHERE hand_id = $1 AND street = $2 AND action IN ('bet','raise')
           ORDER BY "order" DESC LIMIT 1`,
          [hand.id, dbStreet]
        );

        // Build a seat-position map from the dealt players
        const addrToPos = new Map<string, number>();
        for (const seat of seatsResult.rows) {
          if (seat.player_address) {
            addrToPos.set((seat.player_address as string).toLowerCase(), Number(seat.position));
          }
        }

        // Determine which positions are still active (not folded) in this hand
        const foldedInHand = new Set<string>();
        for (const row of actionsResult.rows) {
          if (row.action === 'fold') foldedInHand.add((row.player_address || '').toLowerCase());
        }

        // All dealt, non-folded seat positions
        const activeSeatPositions: number[] = [];
        for (const seat of seatsResult.rows) {
          if (!seat.player_address) continue;
          const addr = (seat.player_address as string).toLowerCase();
          if (!dealtAddrs.has(addr)) continue;
          if (foldedInHand.has(addr)) continue;
          activeSeatPositions.push(Number(seat.position));
        }
        activeSeatPositions.sort((a, b) => a - b);

        // All dealt seat positions (including folded) — needed to reconstruct SB/BB positions
        const dealtSeatPositions: number[] = [];
        for (const seat of seatsResult.rows) {
          if (!seat.player_address) continue;
          const addr = (seat.player_address as string).toLowerCase();
          if (dealtAddrs.has(addr)) dealtSeatPositions.push(Number(seat.position));
        }
        dealtSeatPositions.sort((a, b) => a - b);

        // Derive SB and BB positions from button using the full dealt-seat list
        const dealtList = dealtSeatPositions.length > 0 ? dealtSeatPositions : [dealerPosForLastPos];
        const sbPos = this.nextSeatPosition(dealerPosForLastPos, dealtList, maxSeatsForLastPos);
        const bbPos = this.nextSeatPosition(sbPos, dealtList, maxSeatsForLastPos);

        // Default lastPosition: postflop = dealer; preflop = BB (action ends when BB acts last)
        const isPreflop = dbStreet === 'preflop';
        let computedLastPos: number = isPreflop ? bbPos : dealerPosForLastPos;

        if (lastAggressorResult.rows.length > 0) {
          // lastPosition = seat just before the last aggressor (clockwise), among active seats
          const aggressorAddr = (lastAggressorResult.rows[0].player_address || '').toLowerCase();
          const aggressorPos = addrToPos.get(aggressorAddr);
          if (aggressorPos != null && activeSeatPositions.length > 0) {
            // Walk backward from aggressorPos - 1 to find the last active seat before the aggressor
            for (let i = 1; i <= maxSeatsForLastPos; i++) {
              const candidate = ((aggressorPos - i) + maxSeatsForLastPos) % maxSeatsForLastPos;
              if (activeSeatPositions.includes(candidate)) {
                computedLastPos = candidate;
                break;
              }
            }
          }
        } else if (activeSeatPositions.length > 0 && !isPreflop) {
          // No aggressor postflop — last to act is the dealer (or first active seat at/before dealer)
          for (let i = 0; i <= maxSeatsForLastPos; i++) {
            const candidate = ((dealerPosForLastPos - i) + maxSeatsForLastPos) % maxSeatsForLastPos;
            if (activeSeatPositions.includes(candidate)) {
              computedLastPos = candidate;
              break;
            }
          }
        }
        // Preflop no-aggressor case: computedLastPos is already bbPos (set above)

        (table as any).lastPosition = computedLastPos;

        // Clear stale per-player raise flags from prior streets so actingPlayers is correct
        for (const p of table.players) {
          if (p) delete (p as any).raise;
        }

        // Re-apply raise flag only for the last aggressor on the current street (if they've matched
        // current bet), so actingPlayers correctly excludes them from acting again this street.
        if (lastAggressorResult.rows.length > 0 && maxContrib > 0) {
          const aggressorAddr = (lastAggressorResult.rows[0].player_address || '').toLowerCase();
          const aggressorPlayer = table.players.find((pl) => pl?.id === aggressorAddr);
          if (aggressorPlayer && aggressorPlayer.bet >= maxContrib) {
            // Mark as raiser so actingPlayers excludes them (they opened/re-raised and don't
            // get to act again unless someone re-raises them)
            (aggressorPlayer as any).raise = aggressorPlayer.bet;
          }
        }
      }
    }

    return table;
  }

  // ---------------------------------------------------------------------------
  // tryStartNextHand
  // ---------------------------------------------------------------------------

  private async tryStartNextHand(tableId: string): Promise<void> {
    this.clearScheduledNextHand(tableId);
    return this.withTableLock(tableId, async () => {
      const pool = this.getPool();

      const activeHand = await pool.query(
        'SELECT id FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL LIMIT 1',
        [tableId]
      );
      if (activeHand.rows.length > 0) return;

      // Remove players from in-memory table (cleanup for next hand)
      this.activeTables.delete(tableId);

      const seatsResult = await pool.query(
        'SELECT stack FROM poker_seats WHERE table_id = $1',
        [tableId]
      );
      const withStack = seatsResult.rows.filter((r: any) => BigInt(r.stack ?? '0') > 0n);
      if (withStack.length < 2) {
        const modeRow = await pool.query(
          'SELECT tournament_mode FROM poker_tables WHERE id = $1',
          [tableId]
        );
        if (modeRow.rows[0]?.tournament_mode && this.tournamentUnderfilledRecovery) {
          try {
            await this.tournamentUnderfilledRecovery(tableId);
          } catch (err) {
            logger.error('Tournament underfilled recovery failed', { tableId, err });
          }
        }
        return;
      }

      await this.startHand(tableId);
    });
  }

  // ---------------------------------------------------------------------------
  // syncSeatsFromTable
  // ---------------------------------------------------------------------------

  private async syncSeatsFromTable(
    pool: Pool,
    tableId: string,
    table: Table,
  ): Promise<void> {
    for (const player of table.players) {
      if (!player) continue;
      const stackStr = String(Math.max(0, Math.round(player.stackSize)));
      await pool.query(
        'UPDATE poker_seats SET stack = $3::NUMERIC WHERE table_id = $1 AND player_address = $2',
        [tableId, player.id, stackStr]
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Seat position helpers
  // ---------------------------------------------------------------------------

  private nextSeatPosition(fromPosition: number, sortedPositions: number[], maxSeats: number): number {
    for (let i = 1; i <= maxSeats; i++) {
      const pos = (fromPosition + i) % maxSeats;
      if (sortedPositions.includes(pos)) return pos;
    }
    return fromPosition;
  }

  // ---------------------------------------------------------------------------
  // Tournament-mode seat management (no real balance deduction/credit)
  // ---------------------------------------------------------------------------

  /**
   * Seat a player at a tournament table with virtual chips.
   * Unlike joinTable, this does NOT deduct from players.balance.
   * The buy-in was already collected by PokerTournamentService.
   * Does NOT auto-start a hand — the tournament service controls timing.
   */
  async joinTableTournament(tableId: string, playerAddress: string, startingChips: number | string): Promise<void> {
    const normalized = this.normalizeAddress(playerAddress);
    const pool = this.getPool();

    const tableResult = await pool.query(
      'SELECT id, max_seats, tournament_mode FROM poker_tables WHERE id = $1',
      [tableId]
    );
    if (tableResult.rows.length === 0) throw new Error('Table not found');
    if (!tableResult.rows[0].tournament_mode) throw new Error('Table is not in tournament mode');

    const maxSeats = Number(tableResult.rows[0].max_seats) || 10;

    const existing = await pool.query(
      'SELECT id FROM poker_seats WHERE table_id = $1 AND player_address = $2',
      [tableId, normalized]
    );
    if (existing.rows.length > 0) throw new Error('Already seated at this table');

    const seatCount = await pool.query(
      'SELECT COUNT(*) AS c FROM poker_seats WHERE table_id = $1',
      [tableId]
    );
    if (Number(seatCount.rows[0].c) >= maxSeats) throw new Error('Table is full');

    const positions = await pool.query('SELECT position FROM poker_seats WHERE table_id = $1', [tableId]);
    const used = new Set(positions.rows.map((r: any) => r.position));
    let seatPosition = 0;
    while (used.has(seatPosition)) seatPosition++;

    await pool.query(
      `INSERT INTO poker_seats (table_id, position, player_address, stack, status)
       VALUES ($1, $2, $3, $4::NUMERIC, 'active')`,
      [tableId, seatPosition, normalized, startingChips.toString()]
    );

    logger.info('Poker tournament join (virtual chips)', { tableId, playerAddress: normalized, startingChips, position: seatPosition });
  }

  /**
   * Remove a player from a tournament table without crediting their stack back.
   * Used by PokerTournamentService when a player is eliminated.
   */
  /**
   * Public entry: tournament-side leave / elimination. Takes the per-table
   * lock so concurrent `playerAction` / `autoFoldTimedOutTurns` ticks can't
   * race the `standUp` + DB writes. Called from `eliminateBustedTournamentSeats`
   * in the post-hand timer body (which does NOT hold the lock).
   *
   * **Do NOT call this from a code path that already holds the table lock**
   * (the lock is not re-entrant — it would deadlock). Internal callers under
   * a held lock should call `leaveTableTournamentNoLock` instead.
   */
  async leaveTableTournament(tableId: string, playerAddress: string): Promise<void> {
    return this.withTableLock(tableId, () => this._leaveTableTournament(tableId, playerAddress));
  }

  /**
   * Lock-free variant of {@link leaveTableTournament}. Assumes the caller
   * already holds the per-table lock — used by recovery paths fired from
   * inside `tryStartNextHand`'s lock body (e.g.
   * `recoverTournamentTableIfUnderTwoStackedSeats`). Using the lock-acquiring
   * public method from those paths would deadlock since `withTableLock` is
   * not re-entrant.
   */
  async leaveTableTournamentNoLock(tableId: string, playerAddress: string): Promise<void> {
    return this._leaveTableTournament(tableId, playerAddress);
  }

  private async _leaveTableTournament(tableId: string, playerAddress: string): Promise<void> {
    const normalized = this.normalizeAddress(playerAddress);
    const pool = this.getPool();

    // Collapse any in-flight runout so the leaving player's resolved stack
    // matches what they should be eliminated/credited with. Tournament leaves
    // (eliminations) typically arrive AFTER the hand completes, but a
    // forced-leave during a mid-runout window must finalize first.
    if (this.runoutInFlight.has(tableId)) {
      await this.finalizeRunoutImmediately(tableId);
    }

    const activeHandResult = await pool.query(
      `SELECT id FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL LIMIT 1`,
      [tableId]
    );

    const activeTable = this.activeTables.get(tableId);
    if (activeHandResult.rows.length > 0 && activeTable) {
      try {
        const communityLenBeforeStandUp = activeTable.communityCards?.length ?? 0;
        activeTable.standUp(normalized);
        const handId = activeHandResult.rows[0].id;
        await this.persistActionAfterStandUp(
          pool,
          tableId,
          handId,
          normalized,
          activeTable,
          communityLenBeforeStandUp,
        );
      } catch (err) {
        logger.warn('standUp error on leaveTableTournament', { tableId, playerAddress: normalized, err });
      }
    }

    await pool.query('DELETE FROM poker_seats WHERE table_id = $1 AND player_address = $2', [tableId, normalized]);
    // No balance credit — tournament chips are virtual
    logger.info('Poker tournament leave (no balance credit)', { tableId, playerAddress: normalized });
  }

  /**
   * Delete a tournament table without crediting player stacks back.
   * Used by PokerTournamentService after prize distribution.
   */
  async deleteTableTournament(tableId: string): Promise<void> {
    const pool = this.getPool();
    this.clearScheduledNextHand(tableId);
    this.pendingPostHandHandNumbers.delete(tableId);
    this.activeTables.delete(tableId);
    this.invalidateTableScaling(tableId);
    await pool.query('DELETE FROM poker_tables WHERE id = $1', [tableId]);
    logger.info('Poker tournament table deleted (no balance credit)', { tableId });
  }
}
