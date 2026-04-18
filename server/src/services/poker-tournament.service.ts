import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { toBigIntSafe } from '../utils/safe-bigint';
import { isAdminWallet } from '../lib/cosmetics-catalog';
import { TournamentService } from './tournament.service';
import { PokerGameService } from './poker-game.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  handsPerLevel: number;
}

export interface PokerTournamentConfig {
  startingStack: number;
  minPlayers: number;
  maxPlayers: number;
  blindSchedule: BlindLevel[];
}

export const DEFAULT_BLIND_SCHEDULE: BlindLevel[] = [
  { level: 1, smallBlind: 25,  bigBlind: 50,   handsPerLevel: 10 },
  { level: 2, smallBlind: 50,  bigBlind: 100,  handsPerLevel: 10 },
  { level: 3, smallBlind: 75,  bigBlind: 150,  handsPerLevel: 8  },
  { level: 4, smallBlind: 100, bigBlind: 200,  handsPerLevel: 8  },
  { level: 5, smallBlind: 150, bigBlind: 300,  handsPerLevel: 6  },
  { level: 6, smallBlind: 200, bigBlind: 400,  handsPerLevel: 6  },
  { level: 7, smallBlind: 300, bigBlind: 600,  handsPerLevel: 5  },
  { level: 8, smallBlind: 500, bigBlind: 1000, handsPerLevel: 999},
];

export interface PokerTournamentPlayer {
  playerAddress: string;
  entryId: string;
  chipsRemaining: number;
  status: 'playing' | 'busted' | 'completed';
  finalRank: number | null;
  prizeWon: string;
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
  prizePool: string;
  buyInAmount: string;
  prizeDistributionType: string;
  pokerConfig?: PokerTournamentConfig;
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
  prizePool: string;
  tableId: string | null;
  createdAt: string;
  creatorAddress: string | null;
  prizeDistributionType: string;
  scheduledStartAt: string | null;
  isRegistered: boolean;
  isPrivate: boolean;
}

/** Where the initial guaranteed pool is debited when buy-in is 0. */
export type GuaranteedPrizePoolSource = 'creator' | 'platform_promo';

export interface CreatePokerTournamentParams {
  creatorAddress: string;
  name: string;
  buyInAmount: bigint;
  /** Required when buyInAmount is 0: MORBIUS (wei) debited at create; becomes initial prize_pool. */
  guaranteedPrizePool?: bigint;
  /**
   * When buy-in is 0: debit the creator's `players.balance` (default).
   * `platform_promo`: same debit/refund wallet, but only allowed if the creator is in ADMIN_WALLETS (comma-separated `ADMIN_WALLETS` / `NEXT_PUBLIC_ADMIN_WALLETS`).
   */
  guaranteedPrizePoolSource?: GuaranteedPrizePoolSource;
  prizeDistributionType: string;
  /** Required when prizeDistributionType is `custom` (one integer % per rank, length = maxPlayers, sum 100). */
  prizePercentages?: number[];
  config: PokerTournamentConfig;
  isPrivate?: boolean;
  pinCode?: string | null;
  /** Required — must be a finite `Date` strictly in the future (enforced at create). */
  scheduledStartAt: Date;
}

/**
 * Validates creator prize % per finishing rank (index 0 = 1st place … index maxPlayers-1).
 * Integers 0–100; unused ranks may be 0; must sum to exactly 100.
 */
export function normalizePokerTournamentPrizePercents(maxPlayers: number, raw: unknown): number[] {
  if (!Number.isFinite(maxPlayers) || maxPlayers < 2 || maxPlayers > 10) {
    throw new Error('maxPlayers must be between 2 and 10');
  }
  if (!Array.isArray(raw)) {
    throw new Error('prizePercentages must be an array');
  }
  if (raw.length !== maxPlayers) {
    throw new Error(`prizePercentages must have ${maxPlayers} entries (one per max seat)`);
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
// Constants
// ---------------------------------------------------------------------------

/** Tournament uses integer chip counts; multiply by this to store in wei units (same as cash game). */
const CHIP_SCALE = BigInt('1000000000000000000'); // 10^18

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

  /** Return the BlindLevel that applies for a given hand number (1-indexed). */
  computeBlindLevel(blindSchedule: BlindLevel[], handNumber: number): BlindLevel {
    let accumulated = 0;
    for (const level of blindSchedule) {
      accumulated += level.handsPerLevel;
      if (handNumber <= accumulated) return level;
    }
    return blindSchedule[blindSchedule.length - 1];
  }

  private parsePokerConfig(raw: unknown): PokerTournamentConfig {
    if (!raw) {
      return { startingStack: 5000, minPlayers: 2, maxPlayers: 6, blindSchedule: DEFAULT_BLIND_SCHEDULE };
    }
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>;
    return {
      startingStack: Number(obj.startingStack ?? 5000),
      minPlayers:    Number(obj.minPlayers    ?? 2),
      maxPlayers:    Number(obj.maxPlayers    ?? 6),
      blindSchedule: Array.isArray(obj.blindSchedule) && obj.blindSchedule.length > 0
        ? obj.blindSchedule as BlindLevel[]
        : DEFAULT_BLIND_SCHEDULE,
    };
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
    if (config.minPlayers < 2) throw new Error('minPlayers must be at least 2');
    if (config.maxPlayers < config.minPlayers) throw new Error('maxPlayers must be >= minPlayers');
    if (config.startingStack < 100) throw new Error('startingStack must be at least 100');
    if (!params.name?.trim()) throw new Error('Tournament name required');

    const scheduled = params.scheduledStartAt;
    if (!(scheduled instanceof Date) || Number.isNaN(scheduled.getTime())) {
      throw new Error('scheduledStartAt is required for poker tournaments');
    }
    if (scheduled.getTime() <= Date.now()) {
      throw new Error('scheduledStartAt must be in the future');
    }

    const buyIn = params.buyInAmount;
    if (buyIn < 0n) throw new Error('buyInAmount cannot be negative');
    const guaranteed = params.guaranteedPrizePool ?? 0n;
    if (buyIn === 0n) {
      if (guaranteed <= 0n) {
        throw new Error('guaranteedPrizePool is required and must be > 0 for freeroll (zero buy-in) poker tournaments');
      }
    } else if (guaranteed > 0n) {
      throw new Error('guaranteedPrizePool is only allowed when buy-in is 0');
    }

    const poolSource: GuaranteedPrizePoolSource = params.guaranteedPrizePoolSource ?? 'creator';
    if (buyIn > 0n && poolSource !== 'creator') {
      throw new Error('guaranteedPrizePoolSource is only valid for zero buy-in tournaments');
    }
    if (buyIn === 0n && poolSource === 'platform_promo') {
      if (!isAdminWallet(normalizedCreator)) {
        throw new Error('Platform-funded freerolls require an admin wallet');
      }
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

    const prizePercentages =
      params.prizeDistributionType === 'custom'
        ? normalizePokerTournamentPrizePercents(config.maxPlayers, params.prizePercentages)
        : getPrizePercentagesForType(params.prizeDistributionType);
    const initialPrizePool = buyIn === 0n ? guaranteed.toString() : '0';

    let guaranteedPrizeFunderAddress: string | null = null;
    let debitAddress: string | null = null;

    if (buyIn === 0n) {
      debitAddress = normalizedCreator;
      guaranteedPrizeFunderAddress = null;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      if (buyIn === 0n && debitAddress) {
        const balRow = await client.query(
          `SELECT balance FROM players WHERE LOWER(wallet_address) = LOWER($1) FOR UPDATE`,
          [debitAddress]
        );
        if (balRow.rows.length === 0) {
          throw new Error(
            'Creator player record not found — fund the creator wallet in players.balance first',
          );
        }
        const bal = this.parseBigInt(balRow.rows[0].balance);
        if (bal < guaranteed) {
          throw new Error('Insufficient balance to fund guaranteed prize pool');
        }
        await client.query(
          `UPDATE players SET balance = balance - $1::NUMERIC WHERE LOWER(wallet_address) = LOWER($2)`,
          [guaranteed.toString(), debitAddress]
        );
      }

      const result = await client.query(
        `INSERT INTO tournaments (
        name, creator_address, buy_in_amount, starting_chips, max_hands, min_players,
        max_players, rebuy_config, table_theme, is_private, pin_code,
        prize_distribution_type, prize_percentages, prize_pool, guaranteed_prize_funder_address,
        creator_fee_percent, platform_fee_percent, status,
        game_type, poker_config, scheduled_start_at
      ) VALUES (
        $1, $2, $3::NUMERIC, $4, 999, $5,
        $6, $7::JSONB, $8::JSONB, $9, $10,
        $11, $12::JSONB, $13::NUMERIC, $14,
        2, 3, 'registration',
        'poker', $15::JSONB, $16
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
          JSON.stringify(config),
          scheduled.toISOString(),
        ]
      );

      const tournamentId = result.rows[0].id;

      await client.query(
        `INSERT INTO tournament_scheduled_events (tournament_id, event_type, scheduled_at, status)
         VALUES ($1, 'poker_start', $2, 'pending')`,
        [tournamentId, scheduled.toISOString()],
      );

      await client.query('COMMIT');

      logger.info('Poker tournament created', {
        tournamentId,
        name: params.name,
        creator: normalizedCreator,
        scheduledStartAt: scheduled.toISOString(),
        buyIn: buyIn.toString(),
        guaranteedPrizePool: buyIn === 0n ? guaranteed.toString() : undefined,
        guaranteedPrizePoolSource: buyIn === 0n ? poolSource : undefined,
      });

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
  ): Promise<{ entryId: string; autoStarted: boolean; tableId: string | null }> {
    const normalized = this.normalizeAddress(playerAddress);

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
        const tableResult = await this.pool.query(
          'SELECT id FROM poker_tables WHERE tournament_id = $1 LIMIT 1',
          [tournamentId]
        );
        const tableId = tableResult.rows[0]?.id ?? null;
        logger.info('Player already registered for poker tournament, returning existing entry', { tournamentId, playerAddress: normalized, entryId, tableId });
        return { entryId, autoStarted: !!tableId, tableId };
      }

      if (tournament.status !== 'registration') {
        throw new Error(`Tournament is not open for registration (status: ${tournament.status})`);
      }

      const config = this.parsePokerConfig(tournament.poker_config);

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
      if (registered >= config.maxPlayers) throw new Error('Tournament is full');

      const buyIn = this.parseBigInt(tournament.buy_in_amount);

      const balRow = await client.query(
        `SELECT balance FROM players WHERE LOWER(wallet_address) = LOWER($1) FOR UPDATE`,
        [normalized]
      );
      if (balRow.rows.length === 0) throw new Error('Player not found');

      if (buyIn > 0n) {
        const balance = this.parseBigInt(balRow.rows[0].balance);
        if (balance < buyIn) throw new Error(`Insufficient balance for buy-in`);

        await client.query(
          `UPDATE players SET balance = balance - $1::NUMERIC
         WHERE LOWER(wallet_address) = LOWER($2)`,
          [buyIn.toString(), normalized]
        );

        await client.query(
          `UPDATE tournaments SET prize_pool = prize_pool + $1::NUMERIC WHERE id = $2`,
          [buyIn.toString(), tournamentId]
        );
      }

      // Create entry
      const entryRow = await client.query(
        `INSERT INTO tournament_entries (tournament_id, player_address, chips_remaining, highest_chip_count)
         VALUES ($1, $2, $3, $3) RETURNING id`,
        [tournamentId, normalized, config.startingStack]
      );
      const entryId = entryRow.rows[0].id;

      const newRegistered = registered + 1;
      // Registration fills until scheduled_start_at; activation is always via startScheduledPokerTournament (scheduler).
      const hasScheduledStart = tournament.scheduled_start_at != null;
      const scheduledStart = tournament.scheduled_start_at ? new Date(tournament.scheduled_start_at) : null;
      const isScheduledInFuture = !!(scheduledStart && scheduledStart.getTime() > Date.now());
      const shouldAutoStart =
        !hasScheduledStart && !isScheduledInFuture && newRegistered >= config.minPlayers;

      if (shouldAutoStart) {
        await client.query(
          `UPDATE tournaments SET status = 'active', activated_at = COALESCE(activated_at, NOW()) WHERE id = $1`,
          [tournamentId]
        );
      }

      await client.query('COMMIT');

      logger.info('Player joined poker tournament', { tournamentId, playerAddress: normalized, entryId, registered: newRegistered });

      if (shouldAutoStart) {
        const tableId = await this.activateTournament(tournamentId);
        return { entryId, autoStarted: true, tableId };
      }

      return { entryId, autoStarted: false, tableId: null };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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
        const entries = await client.query(
          `SELECT id, player_address FROM tournament_entries
           WHERE tournament_id = $1 AND status = 'playing'`,
          [tournamentId]
        );
        for (const entry of entries.rows) {
          // Paid tournaments: return each player's buy-in only (prize_pool is buy-ins only here).
          if (buyIn > 0n) {
            await client.query(
              `UPDATE players SET balance = balance + $1::NUMERIC WHERE LOWER(wallet_address) = LOWER($2)`,
              [buyIn.toString(), entry.player_address]
            );
          }
          await client.query(
            `UPDATE tournament_entries SET status = 'busted', finished_at = NOW() WHERE id = $1`,
            [entry.id]
          );
        }
        // Freeroll (buy-in 0): the only MORBIUS refund is the creator/platform-funded guarantee back to the funder.
        // Do not credit entrants; do not also refund full prize_pool after buy-in loops (avoids double-pay on paid).
        if (buyIn === 0n) {
          const poolRefund = this.parseBigInt(tournament.prize_pool);
          const refundTo = this.guaranteedPrizePoolRefundRecipient(tournament);
          if (poolRefund > 0n && refundTo) {
            await client.query(
              `UPDATE players SET balance = balance + $1::NUMERIC WHERE LOWER(wallet_address) = LOWER($2)`,
              [poolRefund.toString(), refundTo]
            );
          }
        }
        await client.query(
          `UPDATE tournaments SET status = 'cancelled', ended_at = NOW(), prize_pool = 0 WHERE id = $1`,
          [tournamentId]
        );
        await client.query('COMMIT');
        logger.info('Scheduled poker tournament cancelled (insufficient players)', {
          tournamentId,
          registered,
          minPlayers: config.minPlayers,
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
  // Activate
  // ---------------------------------------------------------------------------

  /**
   * Transition tournament from registration → active.
   * Creates a dedicated poker table (tournament_mode=TRUE), seats all players,
   * starts the first hand.
   */
  async activateTournament(tournamentId: string): Promise<string> {
    const existing = await this.pool.query(
      `SELECT id FROM poker_tables WHERE tournament_id = $1 LIMIT 1`,
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

    // Scale chip counts to wei units so the poker UI (which uses formatEther) displays them correctly
    const sbWei  = (BigInt(firstLevel.smallBlind) * CHIP_SCALE).toString();
    const bbWei  = (BigInt(firstLevel.bigBlind)   * CHIP_SCALE).toString();
    const stackWei = (BigInt(config.startingStack) * CHIP_SCALE).toString();

    // Create dedicated tournament poker table
    const tableRow = await this.pool.query(
      `INSERT INTO poker_tables (small_blind, big_blind, max_seats, status, tournament_id, tournament_mode)
       VALUES ($1::NUMERIC, $2::NUMERIC, $3, 'waiting', $4, TRUE)
       RETURNING id`,
      [sbWei, bbWei, config.maxPlayers, tournamentId]
    );
    const tableId = tableRow.rows[0].id;

    // Seat all players with virtual chips (scaled to wei)
    for (const entry of entries.rows) {
      await this.pokerGameService.joinTableTournament(tableId, entry.player_address, stackWei);

      // Record in bridge table
      await this.pool.query(
        `INSERT INTO poker_tournament_seats (tournament_id, entry_id, table_id, player_address)
         VALUES ($1, $2, $3, $4) ON CONFLICT (tournament_id, player_address) DO NOTHING`,
        [tournamentId, entry.id, tableId, entry.player_address.toLowerCase()]
      );
    }

    // Start first hand
    await this.pokerGameService.startHand(tableId);

    logger.info('Poker tournament activated', { tournamentId, tableId, players: entries.rows.length });

    this.broadcast(`poker_tournament:${tournamentId}`, 'poker_tournament_started', {
      tournamentId,
      tableId,
      blindLevel: firstLevel.level,
      smallBlind: firstLevel.smallBlind,
      bigBlind: firstLevel.bigBlind,
      playerCount: entries.rows.length,
    });

    return tableId;
  }

  // ---------------------------------------------------------------------------
  // syncAfterHand — called by postHandCallback from poker-game.service.ts
  // ---------------------------------------------------------------------------

  /**
   * After each hand completes:
   * 1. Sync seat stacks → tournament_entries.chips_remaining
   * 2. Eliminate 0-chip players (mark busted, remove seat)
   * 3. Advance blind level if needed (schedule), then multiply SB/BB by 2^k for k eliminations this hand,
   *    then clamp SB/BB so nominal BB ≤ smallest eligible stack (≥2 chips), when applicable
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

    // Sync chips for each player and collect busted players
    // Stacks are stored in wei; convert to chip units for tournament_entries (which track integer chips)
    const bustedAddresses: string[] = [];
    for (const seat of seats.rows) {
      const stackWei = toBigIntSafe(seat.stack ?? 0);
      const stackChips = Number(stackWei / CHIP_SCALE);
      const addr = seat.player_address as string;

      await this.pool.query(
        `UPDATE tournament_entries
         SET chips_remaining = $1,
             highest_chip_count = GREATEST(highest_chip_count, $1),
             hands_played = hands_played + 1
         WHERE tournament_id = $2 AND LOWER(player_address) = LOWER($3) AND status = 'playing'`,
        [stackChips, tournamentId, addr]
      );

      if (stackWei === 0n) bustedAddresses.push(addr);
    }

    // Get bridge table entries for busted players to know their entry IDs
    let remainingAfterElim = seats.rows.length - bustedAddresses.length;

    for (const addr of bustedAddresses) {
      const pts = await this.pool.query(
        `SELECT pts.entry_id FROM poker_tournament_seats pts
         WHERE pts.tournament_id = $1 AND LOWER(pts.player_address) = LOWER($2)`,
        [tournamentId, addr]
      );
      if (pts.rows.length === 0) continue;
      const entryId = pts.rows[0].entry_id as string;

      // Determine current rank (players remaining + 1)
      const rank = remainingAfterElim + 1;

      // Mark entry as busted (skips checkAndDistributePrizes — we control completion)
      await this.pool.query(
        `UPDATE tournament_entries
         SET status = 'busted', chips_remaining = 0, finished_at = NOW(), final_rank = $2
         WHERE id = $1`,
        [entryId, rank]
      );

      // Mark in bridge table
      await this.pool.query(
        `UPDATE poker_tournament_seats SET eliminated_at = NOW(), final_rank = $2
         WHERE entry_id = $1`,
        [entryId, rank]
      );

      // Remove seat from poker table (no balance credit — tournament mode)
      await this.pokerGameService.leaveTableTournament(tableId, addr);

      logger.info('Poker tournament player eliminated', { tournamentId, playerAddress: addr, rank, handNumber });

      this.broadcast(`poker_tournament:${tournamentId}`, 'poker_tournament_player_eliminated', {
        tournamentId,
        playerAddress: addr,
        finalRank: rank,
        handNumber,
      });
    }

    // Blinds: (1) apply schedule for this hand number, (2) multiply by 2 per elimination this hand
    const newLevel = this.computeBlindLevel(config.blindSchedule, handNumber);
    const openingSBChips = Math.round(Number(toBigIntSafe(tableRow.rows[0].small_blind) / CHIP_SCALE));
    let blindsUpdated = false;

    if (newLevel.smallBlind !== openingSBChips) {
      const newSBWei = (BigInt(newLevel.smallBlind) * CHIP_SCALE).toString();
      const newBBWei = (BigInt(newLevel.bigBlind) * CHIP_SCALE).toString();
      await this.pool.query(
        `UPDATE poker_tables SET small_blind = $2::NUMERIC, big_blind = $3::NUMERIC WHERE id = $1`,
        [tableId, newSBWei, newBBWei]
      );
      blindsUpdated = true;
      logger.info('Poker tournament schedule blind level applied', { tournamentId, tableId, newLevel: newLevel.level });
    }

    const elimCount = bustedAddresses.length;
    if (elimCount > 0) {
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
    }

    // UX clamp (optional product rule): nominal BB must not exceed the smallest eligible stack.
    // Runs after schedule + elimination multiplier. Skips when min stack < 2 chips (cannot keep SB < BB in chip units).
    // Eligible seats: in the hand or active, not sitting_out — matches players still on the table.
    const minStackRes = await this.pool.query(
      `SELECT MIN(stack::numeric) AS min_stack
       FROM poker_seats
       WHERE table_id = $1
         AND status IN ('active', 'in_hand')
         AND stack::numeric > 0`,
      [tableId]
    );
    const minStackRaw = minStackRes.rows[0]?.min_stack;
    const minStackWei =
      minStackRaw !== null && minStackRaw !== undefined ? toBigIntSafe(minStackRaw) : null;

    if (minStackWei !== null && minStackWei >= 2n * CHIP_SCALE) {
      const curBlinds = await this.pool.query(
        `SELECT small_blind, big_blind FROM poker_tables WHERE id = $1`,
        [tableId]
      );
      if (curBlinds.rows.length > 0) {
        const sbWeiBefore = toBigIntSafe(curBlinds.rows[0].small_blind);
        const bbWeiBefore = toBigIntSafe(curBlinds.rows[0].big_blind);
        let bbWei = bbWeiBefore;
        let sbWei = sbWeiBefore;
        if (sbWei > 0n && bbWei > 0n && bbWei > minStackWei) {
          const minChips = minStackWei / CHIP_SCALE;
          let bbChips = bbWei / CHIP_SCALE;
          const origSbChips = sbWei / CHIP_SCALE;
          bbChips = bbChips < minChips ? bbChips : minChips;
          let sbChips = origSbChips < bbChips - 1n ? origSbChips : bbChips - 1n;
          if (sbChips < 1n) sbChips = 1n;
          if (sbChips >= bbChips) sbChips = bbChips - 1n;
          sbWei = sbChips * CHIP_SCALE;
          bbWei = bbChips * CHIP_SCALE;
          if (sbWei !== sbWeiBefore || bbWei !== bbWeiBefore) {
            await this.pool.query(
              `UPDATE poker_tables SET small_blind = $2::NUMERIC, big_blind = $3::NUMERIC WHERE id = $1`,
              [tableId, sbWei.toString(), bbWei.toString()]
            );
            blindsUpdated = true;
            logger.info('Poker tournament blinds clamped to smallest stack', {
              tournamentId,
              tableId,
              handNumber,
              minStackWei: minStackWei.toString(),
            });
          }
        }
      }
    }

    if (blindsUpdated) {
      const finalRow = await this.pool.query(
        `SELECT small_blind, big_blind FROM poker_tables WHERE id = $1`,
        [tableId]
      );
      if (finalRow.rows.length > 0) {
        const smallBlindChips = Number(toBigIntSafe(finalRow.rows[0].small_blind) / CHIP_SCALE);
        const bigBlindChips = Number(toBigIntSafe(finalRow.rows[0].big_blind) / CHIP_SCALE);
        this.broadcast(`poker_tournament:${tournamentId}`, 'poker_tournament_blind_level_up', {
          tournamentId,
          tableId,
          newLevel: newLevel.level,
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
    }
  }

  // ---------------------------------------------------------------------------
  // Complete
  // ---------------------------------------------------------------------------

  async completeTournament(tournamentId: string, tableId?: string): Promise<void> {
    const statusRow = await this.pool.query(`SELECT status FROM tournaments WHERE id = $1`, [tournamentId]);
    if (statusRow.rows.length === 0) return;
    if (statusRow.rows[0].status === 'completed') {
      const resolvedTableId = tableId ?? await this.getTableIdForTournament(tournamentId);
      if (resolvedTableId) {
        try {
          await this.pokerGameService.deleteTableTournament(resolvedTableId);
        } catch (err) {
          logger.warn('Failed to delete tournament poker table (already completed)', { resolvedTableId, err });
        }
      }
      return;
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
      logger.error('Poker tournament prize distribution failed — table kept for retry', { tournamentId, err });
      throw err;
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

    const resolvedTableId = tableId ?? await this.getTableIdForTournament(tournamentId);
    if (resolvedTableId) {
      try {
        await this.pokerGameService.deleteTableTournament(resolvedTableId);
      } catch (err) {
        logger.warn('Failed to delete tournament poker table', { resolvedTableId, err });
      }
    }

    logger.info('Poker tournament completed', { tournamentId, winners: prizeDistributions });

    this.broadcast(`poker_tournament:${tournamentId}`, 'poker_tournament_completed', {
      tournamentId,
      winners: prizeDistributions.map((w) => ({
        address: w.player_address,
        rank: w.final_rank,
        prizeAmount: w.prize_amount.toString(),
      })),
    });
  }

  // ---------------------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------------------

  async cancelPokerTournament(tournamentId: string, callerAddress: string): Promise<void> {
    const normalized = this.normalizeAddress(callerAddress);

    const tRow = await this.pool.query(
      `SELECT creator_address, status, buy_in_amount, prize_pool, guaranteed_prize_funder_address
       FROM tournaments WHERE id = $1 AND game_type = 'poker'`,
      [tournamentId]
    );
    if (tRow.rows.length === 0) throw new Error('Poker tournament not found');
    const t = tRow.rows[0];
    if (t.status !== 'registration') throw new Error('Can only cancel tournaments in registration status');
    if (t.creator_address?.toLowerCase() !== normalized) throw new Error('Only the creator can cancel this tournament');

    const buyIn = this.parseBigInt(t.buy_in_amount);

    const entries = await this.pool.query(
      `SELECT id, player_address FROM tournament_entries
       WHERE tournament_id = $1 AND status = 'playing'`,
      [tournamentId]
    );

    for (const entry of entries.rows) {
      // Creator cancel during registration: paid events return buy-ins to entrants only.
      // Freerolls: entrants never receive balance (they never paid a buy-in).
      if (buyIn > 0n) {
        await this.pool.query(
          `UPDATE players SET balance = balance + $1::NUMERIC WHERE LOWER(wallet_address) = LOWER($2)`,
          [buyIn.toString(), entry.player_address]
        );
      }
      await this.pool.query(
        `UPDATE tournament_entries SET status = 'busted', finished_at = NOW() WHERE id = $1`,
        [entry.id]
      );
    }

    // Freeroll: return the locked guarantee to whoever funded prize_pool (creator / funder only).
    if (buyIn === 0n) {
      const prizePoolRefund = this.parseBigInt(t.prize_pool);
      const refundTo = this.guaranteedPrizePoolRefundRecipient(t);
      if (prizePoolRefund > 0n && refundTo) {
        await this.pool.query(
          `UPDATE players SET balance = balance + $1::NUMERIC WHERE LOWER(wallet_address) = LOWER($2)`,
          [prizePoolRefund.toString(), refundTo]
        );
      }
    }

    await this.pool.query(
      `UPDATE tournaments SET status = 'cancelled', ended_at = NOW(), prize_pool = 0 WHERE id = $1`,
      [tournamentId]
    );

    logger.info('Poker tournament cancelled', { tournamentId, caller: normalized, refunded: entries.rows.length });

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

  /** Entrants for lobby / modal (addresses + registration time + entry status). */
  async getPokerTournamentRegistrants(tournamentId: string): Promise<
    Array<{ playerAddress: string; registeredAt: string | null; status: 'playing' | 'busted' | 'completed' }>
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
      `SELECT player_address, bought_in_at, status
       FROM tournament_entries
       WHERE tournament_id = $1
       ORDER BY
         CASE status WHEN 'playing' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,
         bought_in_at ASC NULLS LAST,
         LOWER(player_address) ASC`,
      [id]
    );

    return r.rows.map((e: { player_address: string; bought_in_at: Date | null; status: string }) => ({
      playerAddress: e.player_address,
      registeredAt:  e.bought_in_at ? new Date(e.bought_in_at).toISOString() : null,
      status:        e.status as 'playing' | 'busted' | 'completed',
    }));
  }

  async listPokerTournaments(playerAddress?: string): Promise<PokerTournamentSummary[]> {
    const normalized = playerAddress ? this.normalizeAddress(playerAddress) : null;

    /** Cuts lobby noise: hide stale empty registration buckets; always show active, any with players, recent creates, upcoming scheduled, or rows the viewer is in. */
    const LOBBY_MAX_ROWS = 50;
    const STALE_EMPTY_REG_DAYS = 7;

    const result = await this.pool.query(
      `SELECT r.*,
         CASE WHEN $1::text IS NOT NULL AND EXISTS (
           SELECT 1 FROM tournament_entries te
           WHERE te.tournament_id = r.tournament_id
             AND LOWER(te.player_address) = $1::text
             AND te.status NOT IN ('busted', 'completed')
         ) THEN TRUE ELSE FALSE END AS is_registered
       FROM poker_tournament_registrations r
       WHERE (
         r.status = 'active'
         OR COALESCE(r.registered_count, 0) > 0
         OR r.created_at >= NOW() - ($2::int * INTERVAL '1 day')
         OR (r.scheduled_start_at IS NOT NULL AND r.scheduled_start_at > NOW())
         OR (
           $1::text IS NOT NULL AND EXISTS (
             SELECT 1 FROM tournament_entries te
             WHERE te.tournament_id = r.tournament_id
               AND LOWER(te.player_address) = $1::text
               AND te.status NOT IN ('busted', 'completed')
           )
         )
       )
       ORDER BY r.created_at DESC
       LIMIT $3`,
      [normalized, STALE_EMPTY_REG_DAYS, LOBBY_MAX_ROWS]
    );

    return result.rows.map((r) => ({
      tournamentId:          r.tournament_id,
      name:                  r.name,
      status:                r.status,
      buyInAmount:           r.buy_in_amount?.toString() ?? '0',
      startingStack:         Number(r.starting_chips ?? 5000),
      registeredCount:       Number(r.registered_count ?? 0),
      maxPlayers:            Number(r.max_players ?? 6),
      minPlayers:            Number(r.min_players ?? 2),
      prizePool:             r.prize_pool?.toString() ?? '0',
      tableId:               r.table_id ?? null,
      createdAt:             r.created_at?.toISOString() ?? '',
      creatorAddress:        r.creator_address ?? null,
      prizeDistributionType: r.prize_distribution_type ?? 'winner_takes_all',
      scheduledStartAt:      r.scheduled_start_at ? new Date(r.scheduled_start_at).toISOString() : null,
      isRegistered:          r.is_registered === true,
      isPrivate:             Boolean(r.is_private),
    }));
  }

  async getTournamentState(tournamentId: string): Promise<PokerTournamentState | null> {
    const tRow = await this.pool.query(
      `SELECT t.*, pt.id AS table_id, pt.hand_number, pt.small_blind, pt.big_blind
       FROM tournaments t
       LEFT JOIN poker_tables pt ON pt.tournament_id = t.id
       WHERE t.id = $1 AND t.game_type = 'poker'`,
      [tournamentId]
    );
    if (tRow.rows.length === 0) return null;

    const t = tRow.rows[0];
    const config = this.parsePokerConfig(t.poker_config);
    const handNumber = Number(t.hand_number ?? 0);
    const currentLevel = this.computeBlindLevel(config.blindSchedule, handNumber);

    const entries = await this.pool.query(
      `SELECT id, player_address, chips_remaining, status, final_rank, prize_won
       FROM tournament_entries WHERE tournament_id = $1
       ORDER BY final_rank ASC NULLS LAST, chips_remaining DESC`,
      [tournamentId]
    );

    const sbRaw = t.small_blind != null ? toBigIntSafe(t.small_blind) : null;
    const bbRaw = t.big_blind != null ? toBigIntSafe(t.big_blind) : null;
    const smallBlindChips = sbRaw != null && sbRaw > 0n
      ? Number(sbRaw / CHIP_SCALE)
      : currentLevel.smallBlind;
    const bigBlindChips = bbRaw != null && bbRaw > 0n
      ? Number(bbRaw / CHIP_SCALE)
      : currentLevel.bigBlind;

    return {
      tournamentId,
      name:                  t.name,
      status:                t.status,
      tableId:               t.table_id ?? null,
      blindLevel:            currentLevel.level,
      smallBlind:            smallBlindChips,
      bigBlind:              bigBlindChips,
      handNumber,
      players:               entries.rows.map((e) => ({
        playerAddress:   e.player_address,
        entryId:         e.id as string,
        chipsRemaining:  Number(e.chips_remaining ?? 0),
        status:          e.status,
        finalRank:       e.final_rank ?? null,
        prizeWon:        (e.prize_won ?? '0').toString(),
      })),
      prizePool:           t.prize_pool?.toString() ?? '0',
      buyInAmount:         t.buy_in_amount?.toString() ?? '0',
      prizeDistributionType: t.prize_distribution_type ?? 'winner_takes_all',
      /** For client HUD: schedule + meta (actual posted blinds may differ after elim multiplier / clamp). */
      pokerConfig:         {
        blindSchedule: config.blindSchedule,
        startingStack: config.startingStack,
        minPlayers:    config.minPlayers,
        maxPlayers:    config.maxPlayers,
      },
    };
  }

  async getPlayerEntryStatus(
    tournamentId: string,
    playerAddress: string,
  ): Promise<PokerTournamentPlayer | null> {
    const normalized = this.normalizeAddress(playerAddress);
    const row = await this.pool.query(
      `SELECT id, player_address, chips_remaining, status, final_rank, prize_won
       FROM tournament_entries
       WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)
       LIMIT 1`,
      [tournamentId, normalized]
    );
    if (row.rows.length === 0) return null;
    const e = row.rows[0];
    return {
      playerAddress: e.player_address,
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

  private async getTableIdForTournament(tournamentId: string): Promise<string | null> {
    const r = await this.pool.query(
      `SELECT id FROM poker_tables WHERE tournament_id = $1 LIMIT 1`,
      [tournamentId]
    );
    return r.rows[0]?.id ?? null;
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
