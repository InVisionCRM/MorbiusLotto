"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PokerGameService = void 0;
const poker_engine_1 = require("@chevtek/poker-engine");
const poker_hand_eval_1 = require("./poker-hand-eval");
const cosmetics_service_1 = require("./cosmetics.service");
const cosmetics_catalog_1 = require("../lib/cosmetics-catalog");
const poker_chip_scale_1 = require("../lib/poker-chip-scale");
const poker_table_logo_pricing_1 = require("../lib/poker-table-logo-pricing");
// Sponsorship purchase length caps for trust-the-client token metadata.
const SPONSOR_TOKEN_NAME_MAX = 128;
const SPONSOR_TOKEN_SYMBOL_MAX = 32;
const SPONSOR_TOKEN_LOGO_URL_MAX = 1024;
const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const poker_chip_wallet_1 = require("./poker-chip-wallet");
const poker_cash_buy_in_1 = require("../lib/poker-cash-buy-in");
const poker_bot_ai_1 = require("../lib/poker-bot-ai");
const poker_server_bot_addresses_1 = require("../lib/poker-server-bot-addresses");
const logger_1 = require("../utils/logger");
const crypto_1 = __importDefault(require("crypto"));
/** Consecutive turn-timer auto-folds before cash kick / tournament elimination-AFK (voluntary action resets to 0). */
const POKER_AFK_CONSECUTIVE_TIMEOUT_KICK = 3;
// ---------------------------------------------------------------------------
// Card encoding helpers
// ---------------------------------------------------------------------------
// Our int encoding: suitIndex = floor(n/13), rankIndex = n%13
// Suits: clubs(0), diamonds(1), hearts(2), spades(3) → 'c','d','h','s'
// Ranks (index 0-12): 2,3,4,5,6,7,8,9,T,J,Q,K,A
const INT_RANKS = [
    poker_engine_1.CardRank.TWO, poker_engine_1.CardRank.THREE, poker_engine_1.CardRank.FOUR, poker_engine_1.CardRank.FIVE,
    poker_engine_1.CardRank.SIX, poker_engine_1.CardRank.SEVEN, poker_engine_1.CardRank.EIGHT, poker_engine_1.CardRank.NINE,
    poker_engine_1.CardRank.TEN, poker_engine_1.CardRank.JACK, poker_engine_1.CardRank.QUEEN, poker_engine_1.CardRank.KING, poker_engine_1.CardRank.ACE,
];
const INT_SUITS = [poker_engine_1.CardSuit.CLUB, poker_engine_1.CardSuit.DIAMOND, poker_engine_1.CardSuit.HEART, poker_engine_1.CardSuit.SPADE];
function intToCard(n) {
    const rankIdx = n % 13;
    const suitIdx = Math.floor(n / 13);
    return new poker_engine_1.Card(INT_RANKS[rankIdx], INT_SUITS[suitIdx]);
}
function cardToInt(card) {
    const rankIdx = INT_RANKS.indexOf(card.rank);
    const suitIdx = INT_SUITS.indexOf(card.suit);
    return suitIdx * 13 + rankIdx;
}
function chevtekStreetToPoker(round, hasWinners) {
    if (round === undefined && hasWinners)
        return 'showdown';
    switch (round) {
        case poker_engine_1.BettingRound.PRE_FLOP: return 'preflop';
        case poker_engine_1.BettingRound.FLOP: return 'flop';
        case poker_engine_1.BettingRound.TURN: return 'turn';
        case poker_engine_1.BettingRound.RIVER: return 'river';
        default: return 'showdown';
    }
}
// ---------------------------------------------------------------------------
// Rake configuration (cash games only — tournaments use virtual chips)
// ---------------------------------------------------------------------------
const RAKE_PERCENT = 5; // 5% of each pot
// Post-showdown pause before the next hand is dealt. Keep in sync with
// `POKER_BETWEEN_HANDS_DELAY_MS` in `lib/poker-between-hands-delay.ts`.
const SHOWDOWN_DELAY_MS = 15_000;
const SHOWDOWN_DELAY_SECONDS = SHOWDOWN_DELAY_MS / 1000;
// ---------------------------------------------------------------------------
// PokerGameService
// ---------------------------------------------------------------------------
class PokerGameService {
    dbService;
    pfService;
    broadcastCallback = null;
    postHandCallback = null;
    /** When &lt; 2 seated stacks remain, tournament tables may need a no-deal recovery pass. */
    tournamentUnderfilledRecovery = null;
    notifyCallback = null;
    activeTables = new Map();
    nextHandTimers = new Map();
    /** Per-table mutex to serialize playerAction / autoFold / leaveTable calls. */
    tableLocks = new Map();
    /** Starting stacks (whole chips) captured at hand deal, keyed by handId -> address. */
    handStartingStacks = new Map();
    constructor(dbService, pfService) {
        this.dbService = dbService;
        this.pfService = pfService;
    }
    /** Wire in the WebSocket broadcast so actions push state to clients. */
    setBroadcastCallback(cb) {
        this.broadcastCallback = cb;
    }
    /** Register a callback for push notifications (e.g. player kicked, sitting out). */
    setNotifyCallback(cb) {
        this.notifyCallback = cb;
    }
    /** Register a callback fired after every showdown (used by PokerTournamentService to sync chips). */
    setPostHandCallback(cb) {
        this.postHandCallback = cb;
    }
    /**
     * Called when a tournament table cannot start the next hand because fewer than two seats have stack &gt; 0.
     * Applies late eliminations and may complete the SNG.
     */
    setTournamentUnderfilledRecovery(cb) {
        this.tournamentUnderfilledRecovery = cb;
    }
    /**
     * After N consecutive turn-timer auto-folds on a tournament table, bust the player (same as chip elimination).
     * Wired at runtime from PokerTournamentService.
     */
    tournamentTimeoutEliminationCallback = null;
    setTournamentTimeoutEliminationCallback(cb) {
        this.tournamentTimeoutEliminationCallback = cb;
    }
    getPool() {
        return this.dbService.getPool();
    }
    /**
     * Serialize async operations on a given table so that concurrent
     * playerAction / autoFold / leaveTable calls cannot interleave.
     */
    async withTableLock(tableId, fn) {
        const prev = this.tableLocks.get(tableId) ?? Promise.resolve();
        let resolve;
        const next = new Promise((r) => { resolve = r; });
        this.tableLocks.set(tableId, next);
        try {
            await prev; // wait for any in-flight operation on this table
            return await fn();
        }
        finally {
            resolve();
            // Clean up when no further work is queued
            if (this.tableLocks.get(tableId) === next) {
                this.tableLocks.delete(tableId);
            }
        }
    }
    /** Cached tournament-mode flag; invalidated on table delete. */
    tournamentModeCache = new Map();
    invalidateTableScaling(tableId) {
        this.tournamentModeCache.delete(tableId);
    }
    async isTournamentTable(tableId) {
        const cached = this.tournamentModeCache.get(tableId);
        if (cached !== undefined)
            return cached;
        const pool = this.getPool();
        const r = await pool.query('SELECT tournament_mode FROM poker_tables WHERE id = $1', [tableId]);
        if (r.rows.length === 0)
            throw new Error('Table not found');
        const tournament = !!r.rows[0].tournament_mode;
        this.tournamentModeCache.set(tableId, tournament);
        return tournament;
    }
    normalizeAddress(addr) {
        return (addr || '').trim().toLowerCase();
    }
    /**
     * DB remains the canonical source of poker hand/seat state.
     * In-memory table state is an execution cache and can be reconstructed.
     */
    async getOrReconstructActiveTable(tableId, pool, reason) {
        let table = this.activeTables.get(tableId);
        if (!table) {
            try {
                table = await this.reconstructTable(tableId, pool);
                this.activeTables.set(tableId, table);
                logger_1.logger.warn('Poker table cache miss recovered via DB reconstruction', { tableId, reason });
            }
            catch (error) {
                logger_1.logger.error('Poker table reconstruction failed', { tableId, reason, error });
                throw error;
            }
        }
        return table;
    }
    clearScheduledNextHand(tableId) {
        const timer = this.nextHandTimers.get(tableId);
        if (timer) {
            clearTimeout(timer);
            this.nextHandTimers.delete(tableId);
        }
    }
    /**
     * Keep showdown delay transition behavior centralized for deterministic restart/reconnect handling.
     */
    scheduleNextHandAfterShowdown(tableId) {
        if (this.nextHandTimers.has(tableId))
            return;
        const timer = setTimeout(async () => {
            this.nextHandTimers.delete(tableId);
            try {
                await this.tryStartNextHand(tableId);
                await this.broadcastState(tableId);
            }
            catch (error) {
                logger_1.logger.error('Failed to transition to next poker hand after showdown delay', { tableId, error });
            }
        }, SHOWDOWN_DELAY_MS);
        this.nextHandTimers.set(tableId, timer);
    }
    async broadcastState(tableId) {
        if (this.broadcastCallback) {
            await this.broadcastCallback(tableId).catch(() => { });
        }
    }
    // ---------------------------------------------------------------------------
    // Table CRUD
    // ---------------------------------------------------------------------------
    async listTables() {
        const pool = this.getPool();
        const result = await pool.query(`SELECT t.id, t.small_blind, t.big_blind, t.max_seats, t.status, t.pin_code, t.created_at, t.creator_address,
              COUNT(s.id) FILTER (WHERE s.player_address IS NOT NULL) AS seated_count
       FROM poker_tables t
       LEFT JOIN poker_seats s ON s.table_id = t.id
       WHERE t.status IN ('waiting', 'playing') AND (t.tournament_mode IS NULL OR t.tournament_mode = FALSE)
       GROUP BY t.id, t.small_blind, t.big_blind, t.max_seats, t.status, t.pin_code, t.created_at, t.creator_address
       ORDER BY t.created_at ASC`);
        return result.rows.map((r) => ({
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
    async createTable(smallBlindChips, bigBlindChips, maxSeats, pinCode, creatorAddress) {
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
        const normalizedCreator = typeof creatorAddress === 'string' && /^0x[a-fA-F0-9]{40}$/.test(creatorAddress)
            ? creatorAddress.toLowerCase()
            : null;
        const r = await pool.query(`INSERT INTO poker_tables (small_blind, big_blind, max_seats, status, pin_code, creator_address)
       VALUES ($1::NUMERIC, $2::NUMERIC, $3, 'waiting', $4, $5)
       RETURNING id`, [String(smallBlindChips), String(bigBlindChips), maxSeats, pinCode ?? null, normalizedCreator]);
        return r.rows[0].id;
    }
    async deleteTable(tableId) {
        const pool = this.getPool();
        const tableRow = await pool.query('SELECT id FROM poker_tables WHERE id = $1', [tableId]);
        if (tableRow.rows.length === 0)
            return false;
        await this.dbService.withTransaction(async (client) => {
            // Lock the table row to prevent concurrent deletes or joins
            await client.query('SELECT id FROM poker_tables WHERE id = $1 FOR UPDATE', [tableId]);
            const seats = await client.query('SELECT player_address, stack FROM poker_seats WHERE table_id = $1', [tableId]);
            for (const row of seats.rows) {
                const stackChips = Number(row.stack ?? 0);
                if (stackChips > 0 && row.player_address) {
                    await (0, poker_chip_wallet_1.applyPokerChipDelta)(client, row.player_address, BigInt(stackChips), 'cash_admin_return', { type: 'poker_table', id: tableId });
                    logger_1.logger.info('Poker admin delete table: credited chips', { tableId, playerAddress: row.player_address, stackChips });
                }
            }
            await client.query('DELETE FROM poker_tables WHERE id = $1', [tableId]);
        });
        this.clearScheduledNextHand(tableId);
        this.activeTables.delete(tableId);
        this.invalidateTableScaling(tableId);
        logger_1.logger.info('Poker admin delete table', { tableId });
        return true;
    }
    // ---------------------------------------------------------------------------
    // Seat management
    // ---------------------------------------------------------------------------
    /** `buyInChips` is a stringified whole-chip count (not MORBIUS wei). */
    async joinTable(tableId, playerAddress, buyInChips, pinCode) {
        return this.withTableLock(tableId, () => this._joinTable(tableId, playerAddress, buyInChips, pinCode));
    }
    async _joinTable(tableId, playerAddress, buyInChipsRaw, pinCode) {
        const normalized = this.normalizeAddress(playerAddress);
        const buyInChips = BigInt(buyInChipsRaw);
        if (buyInChips <= 0n)
            throw new Error('Buy-in must be a positive whole chip amount');
        if (buyInChips > BigInt(Number.MAX_SAFE_INTEGER))
            throw new Error('Buy-in too large');
        const buyInChipsNum = Number(buyInChips);
        const position = await this.dbService.withTransaction(async (client) => {
            // Lock the player row first — serializes concurrent join attempts by the same wallet
            const playerLock = await client.query(`SELECT id FROM players WHERE LOWER(wallet_address) = LOWER($1) FOR UPDATE`, [normalized]);
            if (playerLock.rows.length === 0)
                throw new Error('Player not found');
            // Prevent sitting at multiple cash tables simultaneously
            const otherSeat = await client.query(`SELECT s.table_id FROM poker_seats s
         JOIN poker_tables t ON t.id = s.table_id
         WHERE LOWER(s.player_address) = LOWER($1)
           AND (t.tournament_mode IS NULL OR t.tournament_mode = FALSE)`, [normalized]);
            if (otherSeat.rows.length > 0) {
                const otherTableId = String(otherSeat.rows[0].table_id ?? '');
                throw new Error(`Already seated at another cash table. Leave that table first. other_table_id=${otherTableId}`);
            }
            const tableResult = await client.query('SELECT id, small_blind, big_blind, max_seats, pin_code, tournament_mode FROM poker_tables WHERE id = $1', [tableId]);
            if (tableResult.rows.length === 0)
                throw new Error('Table not found');
            const tblRow = tableResult.rows[0];
            const maxSeats = Number(tblRow.max_seats) || 10;
            if (tblRow.tournament_mode) {
                throw new Error('Tournament table: register with poker_tournament_join. Cash poker_join_table is not allowed on tournament tables.');
            }
            const bbChips = Number(tblRow.big_blind ?? 0);
            const { minChips, maxChips } = (0, poker_cash_buy_in_1.getCashBuyInBoundsChips)(bbChips);
            if (buyInChipsNum < minChips || buyInChipsNum > maxChips) {
                throw new Error(`Buy-in must be between ${poker_cash_buy_in_1.POKER_CASH_MIN_BUY_IN_BB} and ${poker_cash_buy_in_1.POKER_CASH_MAX_BUY_IN_BB} big blinds (min ${minChips} chips, max ${maxChips} chips).`);
            }
            // Validate PIN for private tables
            if (tblRow.pin_code) {
                if (!pinCode || pinCode !== tblRow.pin_code) {
                    throw new Error('Incorrect PIN');
                }
            }
            const existing = await client.query('SELECT id FROM poker_seats WHERE table_id = $1 AND player_address = $2', [tableId, normalized]);
            if (existing.rows.length > 0)
                throw new Error('Already seated at this table');
            const seatCount = await client.query('SELECT COUNT(*) AS c FROM poker_seats WHERE table_id = $1', [tableId]);
            if (Number(seatCount.rows[0].c) >= maxSeats)
                throw new Error('Table is full');
            await (0, poker_chip_wallet_1.applyPokerChipDelta)(client, normalized, -buyInChips, 'cash_join', { type: 'poker_table', id: tableId });
            const positions = await client.query('SELECT position FROM poker_seats WHERE table_id = $1', [tableId]);
            const used = new Set(positions.rows.map((r) => r.position));
            let seatPosition = 0;
            while (used.has(seatPosition))
                seatPosition++;
            await client.query(`INSERT INTO poker_seats (table_id, position, player_address, stack, status)
         VALUES ($1, $2, $3, $4::NUMERIC, 'active')`, [tableId, seatPosition, normalized, String(buyInChipsNum)]);
            return seatPosition;
        });
        // Sync in-memory table if it exists
        const activeTable = this.activeTables.get(tableId);
        if (activeTable && !activeTable.currentRound) {
            try {
                if (position === 0) {
                    activeTable.sitDown(normalized, buyInChipsNum);
                }
                else {
                    activeTable.sitDown(normalized, buyInChipsNum, position);
                }
            }
            catch {
                // If sitDown fails (e.g. already seated from previous run), ignore
            }
        }
        logger_1.logger.info('Poker join', { tableId, playerAddress: normalized, buyInChips: buyInChips.toString(), position });
        // Auto-start if 2+ players ready
        const pool = this.getPool();
        const seatsResult = await pool.query('SELECT stack FROM poker_seats WHERE table_id = $1', [tableId]);
        const withStack = seatsResult.rows.filter((r) => BigInt(r.stack ?? '0') > 0n);
        if (withStack.length >= 2) {
            const activeHand = await pool.query('SELECT id FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL LIMIT 1', [tableId]);
            if (activeHand.rows.length === 0) {
                await this.startHand(tableId);
            }
        }
        return this.getTableState(tableId, normalized);
    }
    async leaveTable(tableId, playerAddress) {
        return this.withTableLock(tableId, async () => {
            const pool = this.getPool();
            const modeRow = await pool.query('SELECT tournament_mode FROM poker_tables WHERE id = $1', [tableId]);
            if (modeRow.rows.length === 0)
                throw new Error('Table not found');
            if (modeRow.rows[0].tournament_mode) {
                await this.leaveTableTournament(tableId, playerAddress);
                return this.getTableState(tableId, null);
            }
            return this._leaveTable(tableId, playerAddress);
        });
    }
    async _leaveTable(tableId, playerAddress) {
        const normalized = this.normalizeAddress(playerAddress);
        const pool = this.getPool();
        const seatResult = await pool.query('SELECT id, stack, position FROM poker_seats WHERE table_id = $1 AND player_address = $2', [tableId, normalized]);
        if (seatResult.rows.length === 0)
            throw new Error('Not seated at this table');
        const activeHandResult = await pool.query(`SELECT id FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL LIMIT 1`, [tableId]);
        // If there's an active hand, use chevtek standUp so it handles fold + advance
        const activeTable = this.activeTables.get(tableId);
        if (activeHandResult.rows.length > 0 && activeTable) {
            try {
                // standUp folds the player and calls nextAction() if they were acting
                activeTable.standUp(normalized);
                // Persist any state changes from standUp
                const handId = activeHandResult.rows[0].id;
                await this.persistActionAfterStandUp(pool, tableId, handId, normalized, activeTable);
            }
            catch (err) {
                logger_1.logger.warn('standUp error on leaveTable', { tableId, playerAddress: normalized, err });
            }
        }
        // Atomically remove seat and credit balance so a failed credit cannot strand chips.
        const creditedChips = await this.dbService.withTransaction(async (client) => {
            const del = await client.query(`DELETE FROM poker_seats WHERE table_id = $1 AND LOWER(player_address) = LOWER($2) RETURNING stack`, [tableId, normalized]);
            if (del.rows.length === 0) {
                throw new Error('Not seated at this table');
            }
            const stackChips = Number(del.rows[0].stack ?? 0);
            if (stackChips > 0) {
                await (0, poker_chip_wallet_1.applyPokerChipDelta)(client, normalized, BigInt(stackChips), 'cash_leave', { type: 'poker_table', id: tableId });
            }
            return BigInt(stackChips);
        });
        logger_1.logger.info('Poker leave', { tableId, playerAddress: normalized, creditedChips: creditedChips.toString() });
        return this.getTableState(tableId, null);
    }
    async persistActionAfterStandUp(pool, tableId, handId, playerAddress, table) {
        const handRow = await pool.query('SELECT street FROM poker_hands WHERE id = $1', [handId]);
        if (handRow.rows.length === 0)
            return;
        const street = handRow.rows[0].street;
        // Record fold action
        const alreadyFolded = await pool.query(`SELECT 1 FROM poker_hand_actions WHERE hand_id = $1 AND player_address = $2 AND action = 'fold'`, [handId, playerAddress]);
        if (alreadyFolded.rows.length === 0) {
            const orderResult = await pool.query('SELECT COALESCE(MAX("order"), 0) + 1 AS next_order FROM poker_hand_actions WHERE hand_id = $1', [handId]);
            const nextOrder = Number(orderResult.rows[0].next_order);
            await pool.query(`INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order")
         VALUES ($1, $2, $3, 'fold', 0, $4)`, [handId, playerAddress, street, nextOrder]);
        }
        // Check if hand has concluded (showdown triggered by standUp)
        if (!table.currentRound && table.winners) {
            await this.persistShowdown(pool, tableId, handId, table);
            await this.broadcastState(tableId);
            this.scheduleNextHandAfterShowdown(tableId);
        }
        else if (!table.currentRound) {
            // No winners yet but round ended — update acting position
            await pool.query('UPDATE poker_hands SET acting_position = NULL WHERE id = $1', [handId]);
        }
        else {
            // Update acting position and pot
            const potStr = String(Math.max(0, Math.round((0, poker_chip_scale_1.totalPotChips)(table))));
            const actingPos = table.currentPosition ?? null;
            await pool.query('UPDATE poker_hands SET acting_position = $2, pot_amount = $3::NUMERIC, turn_started_at = NOW() WHERE id = $1', [handId, actingPos, potStr]);
            await this.syncSeatsFromTable(pool, tableId, table);
        }
    }
    /** `amountChips` is a stringified whole-chip count to add from the player poker chip wallet. */
    async addChips(tableId, playerAddress, amountChips) {
        return this.withTableLock(tableId, () => this._addChips(tableId, playerAddress, amountChips));
    }
    async _addChips(_tableId, _playerAddress, _amountChipsRaw) {
        const tableId = _tableId;
        const playerAddress = this.normalizeAddress(_playerAddress);
        const addChips = BigInt(_amountChipsRaw);
        if (addChips <= 0n)
            throw new Error('Re-up amount must be greater than zero');
        if (addChips > BigInt(Number.MAX_SAFE_INTEGER))
            throw new Error('Re-up too large');
        const amountChips = Number(addChips);
        if (await this.isTournamentTable(tableId))
            throw new Error('Tournament tables do not support re-ups');
        await this.dbService.withTransaction(async (client) => {
            const seatResult = await client.query(`SELECT s.stack, t.big_blind
         FROM poker_seats s
         JOIN poker_tables t ON t.id = s.table_id
         WHERE s.table_id = $1 AND LOWER(s.player_address) = LOWER($2)
         FOR UPDATE`, [tableId, playerAddress]);
            if (seatResult.rows.length === 0)
                throw new Error('You are not seated at this table');
            const activeHand = await client.query('SELECT id FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL LIMIT 1', [tableId]);
            if (activeHand.rows.length > 0) {
                throw new Error('Re-ups are only available between hands');
            }
            const currentStackChips = Number(seatResult.rows[0].stack ?? 0);
            const bigBlindChips = Number(seatResult.rows[0].big_blind ?? 0);
            const { minChips, maxChips } = (0, poker_cash_buy_in_1.getCashBuyInBoundsChips)(bigBlindChips);
            const nextStackChips = currentStackChips + amountChips;
            if (currentStackChips === 0 && (amountChips < minChips || amountChips > maxChips)) {
                throw new Error(`Rebuy must be between ${poker_cash_buy_in_1.POKER_CASH_MIN_BUY_IN_BB} and ${poker_cash_buy_in_1.POKER_CASH_MAX_BUY_IN_BB} big blinds.`);
            }
            if (nextStackChips > maxChips) {
                throw new Error(`Stack cannot exceed ${poker_cash_buy_in_1.POKER_CASH_MAX_BUY_IN_BB} big blinds after a re-up.`);
            }
            await (0, poker_chip_wallet_1.applyPokerChipDelta)(client, playerAddress, -addChips, 'cash_reup', { type: 'poker_table', id: tableId });
            await client.query(`UPDATE poker_seats
         SET stack = stack + $3::NUMERIC
         WHERE table_id = $1 AND LOWER(player_address) = LOWER($2)`, [tableId, playerAddress, String(amountChips)]);
        });
        const pool = this.getPool();
        const seatsResult = await pool.query('SELECT stack FROM poker_seats WHERE table_id = $1', [tableId]);
        const withStack = seatsResult.rows.filter((r) => BigInt(r.stack ?? '0') > 0n);
        if (withStack.length >= 2) {
            const activeHand = await pool.query('SELECT id FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL LIMIT 1', [tableId]);
            const recentShowdown = await pool.query(`SELECT id FROM poker_hands
         WHERE table_id = $1 AND street = 'showdown'
           AND completed_at > NOW() - INTERVAL '${SHOWDOWN_DELAY_SECONDS} seconds'
         LIMIT 1`, [tableId]);
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
    async expirePokerTableLogoIfExpired(pool, tableId) {
        await pool.query(`UPDATE poker_tables
       SET table_logo = NULL,
           table_logo_sponsored_until = NULL,
           table_logo_sponsor_address = NULL,
           table_logo_token_address = NULL,
           table_logo_token_name = NULL,
           table_logo_token_symbol = NULL,
           table_logo_token_logo_url = NULL
       WHERE id = $1
         AND table_logo_sponsored_until IS NOT NULL
         AND table_logo_sponsored_until <= NOW()`, [tableId]);
    }
    async getTableState(tableId, forPlayer) {
        const pool = this.getPool();
        const forPlayerAddr = forPlayer ? this.normalizeAddress(forPlayer) : null;
        await this.expirePokerTableLogoIfExpired(pool, tableId);
        const tableRow = await pool.query(`SELECT id, small_blind, big_blind, max_seats, status, table_logo, table_logo_opacity, tournament_id,
              table_logo_sponsored_until, table_logo_sponsor_address,
              table_logo_token_address, table_logo_token_name, table_logo_token_symbol, table_logo_token_logo_url
       FROM poker_tables WHERE id = $1`, [tableId]);
        if (tableRow.rows.length === 0)
            throw new Error('Table not found');
        const tbl = tableRow.rows[0];
        const maxSeats = Number(tbl.max_seats) || 10;
        const bigBlindChips = Number(tbl.big_blind ?? 0);
        // Load DB seats
        const seatsResult = await pool.query('SELECT position, player_address, stack, status, consecutive_timeouts FROM poker_seats WHERE table_id = $1 ORDER BY position', [tableId]);
        const dbSeatMap = new Map();
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
        const seats = [];
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
        const seatAddresses = seats.map((s) => s.playerAddress).filter((a) => !!a);
        const placeholderByAddress = new Map();
        if (seatAddresses.length > 0) {
            const profiles = await this.dbService.getProfiles(seatAddresses);
            const needPlaceholder = seatAddresses.filter((addr) => {
                const profile = profiles.get(this.normalizeAddress(addr));
                return !profile || profile.avatarConfig == null;
            });
            if (needPlaceholder.length > 0) {
                const cosmeticsService = new cosmetics_service_1.CosmeticsService(this.getPool());
                for (const addr of needPlaceholder) {
                    try {
                        const inventory = await cosmeticsService.getInventory(addr);
                        const placeholder = (0, cosmetics_catalog_1.randomPlaceholderConfig)(new Set(inventory));
                        await this.dbService.setDefaultAvatarIfNull(addr, placeholder);
                        placeholderByAddress.set(this.normalizeAddress(addr), placeholder);
                    }
                    catch (err) {
                        logger_1.logger.warn(`Poker: failed to set placeholder avatar for ${addr}: ${err.message}`);
                    }
                }
            }
            for (const seat of seats) {
                if (!seat.playerAddress)
                    continue;
                const normalized = this.normalizeAddress(seat.playerAddress);
                const profile = profiles.get(normalized);
                seat.displayName = profile?.displayName ?? null;
                seat.profileImageUrl = profile?.profileImageUrl ?? null;
                seat.avatarConfig = profile?.avatarConfig ?? placeholderByAddress.get(normalized) ?? null;
                seat.profileDisplayMode = profile?.profileDisplayMode ?? 'avatar';
            }
        }
        let currentHand = null;
        let myHoleCards = null;
        const handRow = await pool.query(`SELECT id, hand_number, button_position, community_cards, pot_amount, street,
              acting_position, turn_started_at, result, last_raise_size, completed_at
       FROM poker_hands WHERE table_id = $1
         AND (completed_at IS NULL OR (street = 'showdown' AND completed_at > NOW() - INTERVAL '${SHOWDOWN_DELAY_SECONDS} seconds'))
       ORDER BY CASE WHEN completed_at IS NULL THEN 0 ELSE 1 END, created_at DESC LIMIT 1`, [tableId]);
        if (handRow.rows.length > 0) {
            const h = handRow.rows[0];
            const handId = h.id;
            const buttonPosition = Number(h.button_position);
            const communityCards = Array.isArray(h.community_cards)
                ? h.community_cards
                : (h.community_cards ? JSON.parse(JSON.stringify(h.community_cards)) : []);
            const actingPosition = h.acting_position != null ? Number(h.acting_position) : null;
            const street = h.street;
            // Fold/dealer/blind flags
            const foldResult = await pool.query(`SELECT player_address FROM poker_hand_actions WHERE hand_id = $1 AND action = 'fold'`, [handId]);
            const foldedSet = new Set(foldResult.rows.map((r) => this.normalizeAddress(r.player_address)));
            // Use live table for position flags if available, otherwise use DB
            let dealerPos = buttonPosition;
            let sbPos = null;
            let bbPos = null;
            if (liveTable && liveTable.currentRound) {
                dealerPos = liveTable.dealerPosition ?? buttonPosition;
                sbPos = liveTable.smallBlindPosition ?? null;
                bbPos = liveTable.bigBlindPosition ?? null;
            }
            else {
                // Derive from DB: find SB/BB positions by next active seats after button
                const seatPositions = seatsResult.rows.map((r) => r.position).sort((a, b) => a - b);
                const isHeadsUp = seatPositions.length === 2;
                if (isHeadsUp) {
                    sbPos = buttonPosition;
                    bbPos = this.nextSeatPosition(buttonPosition, seatPositions, maxSeats);
                }
                else {
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
            }
            else if (actingPosition != null) {
                const lastRaiseSizeChips = Number(h.last_raise_size ?? 0);
                const minRaiseIncrement = Math.max(lastRaiseSizeChips, bigBlindChips);
                const contribResult = await pool.query(`SELECT player_address, SUM(amount) AS total FROM poker_hand_actions
           WHERE hand_id = $1 AND street = $2 AND action IN ('bet','raise','call','blind')
           GROUP BY player_address`, [handId, street]);
                let maxContrib = 0;
                let myContrib = 0;
                const actingAddr = dbSeatMap.get(actingPosition)?.playerAddress ?? null;
                for (const row of contribResult.rows) {
                    const t = Number(row.total ?? 0);
                    if (t > maxContrib)
                        maxContrib = t;
                    if (actingAddr && row.player_address === actingAddr)
                        myContrib = t;
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
            const actionsResult = await pool.query(`SELECT "order", player_address, street, action, amount FROM poker_hand_actions
         WHERE hand_id = $1 AND action NOT IN ('blind')
         ORDER BY "order" DESC LIMIT 40`, [handId]);
            const recentActions = [];
            for (let i = actionsResult.rows.length - 1; i >= 0; i--) {
                const row = actionsResult.rows[i];
                const pos = seats.findIndex((s) => s.playerAddress === row.player_address);
                if (pos < 0)
                    continue;
                recentActions.push({
                    order: Number(row.order),
                    street: row.street,
                    position: pos,
                    action: row.action,
                    amount: row.amount?.toString() ?? '0',
                });
            }
            const lastAction = recentActions.length > 0
                ? {
                    position: recentActions[recentActions.length - 1].position,
                    action: recentActions[recentActions.length - 1].action,
                    amount: recentActions[recentActions.length - 1].amount,
                }
                : null;
            const streetActionsResult = await pool.query(`SELECT player_address, action, amount FROM poker_hand_actions
         WHERE hand_id = $1 AND street = $2 AND action NOT IN ('blind')
         ORDER BY "order" DESC`, [handId, street]);
            const streetActions = {};
            for (const row of streetActionsResult.rows) {
                const pos = seats.findIndex((s) => s.playerAddress === row.player_address);
                if (pos < 0 || streetActions[pos])
                    continue;
                streetActions[pos] = {
                    action: row.action,
                    amount: row.amount?.toString() ?? '0',
                };
            }
            // Pot (chip int): prefer live table total
            const potStr = liveTable && liveTable.currentRound
                ? String(Math.max(0, Math.round((0, poker_chip_scale_1.totalPotChips)(liveTable))))
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
            currentHand = {
                handId,
                street,
                communityCards,
                pot: potStr,
                actingPosition,
                lastAction,
                recentActions,
                streetActions,
                minRaise,
                toCall,
                turnStartedAt: h.turn_started_at ? new Date(h.turn_started_at).toISOString() : null,
            };
            // Hole cards for requesting player
            if (forPlayerAddr) {
                const holeResult = await pool.query('SELECT cards FROM poker_hand_hole_cards WHERE hand_id = $1 AND player_address = $2', [handId, forPlayerAddr]);
                if (holeResult.rows.length > 0 && holeResult.rows[0].cards) {
                    myHoleCards = Array.isArray(holeResult.rows[0].cards)
                        ? holeResult.rows[0].cards
                        : JSON.parse(holeResult.rows[0].cards);
                }
            }
            // Showdown: winners always; hole cards only when ≥2 dealt players reached the end without folding.
            if (street === 'showdown') {
                const dealtHoleResult = await pool.query('SELECT player_address FROM poker_hand_hole_cards WHERE hand_id = $1', [handId]);
                const dealtAddrs = new Set(dealtHoleResult.rows.map((r) => this.normalizeAddress(r.player_address)));
                let nonFoldedDealtCount = 0;
                for (const addr of dealtAddrs) {
                    if (!foldedSet.has(addr))
                        nonFoldedDealtCount += 1;
                }
                const handWentToShowdown = nonFoldedDealtCount >= 2;
                currentHand.handWentToShowdown = handWentToShowdown;
                if (handWentToShowdown) {
                    const allHoleResult = await pool.query('SELECT player_address, cards FROM poker_hand_hole_cards WHERE hand_id = $1', [handId]);
                    const showdownHands = {};
                    for (const row of allHoleResult.rows) {
                        const cards = Array.isArray(row.cards) ? row.cards : JSON.parse(row.cards ?? '[]');
                        showdownHands[this.normalizeAddress(row.player_address)] = cards;
                    }
                    currentHand.showdownHands = showdownHands;
                }
                if (h.result) {
                    try {
                        const parsed = typeof h.result === 'string' ? JSON.parse(h.result) : h.result;
                        if (parsed?.winners?.length) {
                            const seatedAddresses = new Set(seats
                                .filter((seat) => !!seat.playerAddress)
                                .map((seat) => this.normalizeAddress(seat.playerAddress)));
                            currentHand.winners = parsed.winners
                                .map((w) => ({
                                address: this.normalizeAddress(w.address || ''),
                                amount: String(w.amount ?? '0'),
                                handName: w.handName,
                                winningCardIndices: Array.isArray(w.winningCardIndices) ? w.winningCardIndices : undefined,
                            }))
                                .filter((winner) => !!winner.address)
                                .filter((winner) => seatedAddresses.has(winner.address))
                                .filter((winner) => !foldedSet.has(winner.address));
                        }
                    }
                    catch {
                        // ignore
                    }
                }
                if (h.completed_at) {
                    const rawCompleted = h.completed_at;
                    const completedMs = rawCompleted instanceof Date ? rawCompleted.getTime() : new Date(rawCompleted).getTime();
                    if (Number.isFinite(completedMs)) {
                        currentHand.nextHandAt = new Date(completedMs + SHOWDOWN_DELAY_MS).toISOString();
                    }
                }
            }
        }
        const tournamentIdRaw = tbl.tournament_id;
        const tournamentId = tournamentIdRaw != null && String(tournamentIdRaw).length > 0 ? String(tournamentIdRaw) : null;
        const sponsoredUntilRaw = tbl.table_logo_sponsored_until;
        const sponsoredUntil = sponsoredUntilRaw != null ? new Date(sponsoredUntilRaw) : null;
        const nowDate = new Date();
        const sponsoredActive = sponsoredUntil != null &&
            !Number.isNaN(sponsoredUntil.getTime()) &&
            sponsoredUntil.getTime() > nowDate.getTime();
        const remainingMs = sponsoredActive ? sponsoredUntil.getTime() - nowDate.getTime() : 0;
        const priceChips = (0, poker_table_logo_pricing_1.computeTableLogoChangePriceMorbiusChips)({
            sponsoredActive,
            remainingMs,
        });
        const tableLogoEffective = sponsoredActive && tbl.table_logo != null && String(tbl.table_logo).length > 0
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
            tableLogoSponsorAddress: sponsoredActive && tbl.table_logo_sponsor_address
                ? String(tbl.table_logo_sponsor_address).toLowerCase()
                : null,
            tableLogoIsDefault: !sponsoredActive,
            tableLogoPriceMorbiusChips: priceChips.toString(),
            tableLogoTokenAddress: sponsoredActive && tbl.table_logo_token_address
                ? String(tbl.table_logo_token_address).toLowerCase()
                : null,
            tableLogoTokenName: sponsoredActive && tbl.table_logo_token_name
                ? String(tbl.table_logo_token_name)
                : null,
            tableLogoTokenSymbol: sponsoredActive && tbl.table_logo_token_symbol
                ? String(tbl.table_logo_token_symbol)
                : null,
            tableLogoTokenLogoUrl: sponsoredActive && tbl.table_logo_token_logo_url
                ? String(tbl.table_logo_token_logo_url)
                : null,
            tournamentId,
        };
    }
    // ---------------------------------------------------------------------------
    // updateTableLogo — admin-only: set or clear marketing logo on felt
    // ---------------------------------------------------------------------------
    async updateTableLogo(tableId, logo, opacity) {
        const pool = this.getPool();
        const row = await pool.query('SELECT table_logo_sponsored_until AS until FROM poker_tables WHERE id = $1', [tableId]);
        if (row.rows.length === 0)
            throw new Error('Table not found');
        const until = row.rows[0].until;
        if (until != null && new Date(until).getTime() > Date.now()) {
            throw new Error('Cannot update table logo while a paid sponsorship is active');
        }
        const clampedOpacity = Math.max(0, Math.min(1, opacity));
        await pool.query('UPDATE poker_tables SET table_logo = $2, table_logo_opacity = $3 WHERE id = $1', [tableId, logo, clampedOpacity]);
    }
    /**
     * Pay MORBIUS (off-chain `players.balance`) to sponsor a token spotlight for 10 minutes.
     * Timer restarts on each purchase. Seated players only.
     *
     * Trust-the-client metadata: the client passes name/symbol/logoUrl pulled from DexScreener.
     * Only the address is structurally validated; lengths are capped server-side.
     */
    async purchaseTableLogoSponsorship(tableId, playerAddress, token) {
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
        if (!tokenName)
            throw new Error('Token name required');
        if (!tokenSymbol)
            throw new Error('Token symbol required');
        if (tokenLogoUrl && !/^https?:\/\//i.test(tokenLogoUrl)) {
            throw new Error('Token logo URL must be http(s)');
        }
        await this.expirePokerTableLogoIfExpired(pool, tableId);
        const seatCheck = await pool.query(`SELECT 1 FROM poker_seats
       WHERE table_id = $1 AND LOWER(player_address) = LOWER($2) AND player_address IS NOT NULL
       LIMIT 1`, [tableId, normalized]);
        if (seatCheck.rows.length === 0) {
            throw new Error('Must be seated at this table to sponsor the logo');
        }
        const trow = await pool.query('SELECT table_logo_sponsored_until AS until FROM poker_tables WHERE id = $1', [tableId]);
        if (trow.rows.length === 0)
            throw new Error('Table not found');
        const untilRaw = trow.rows[0].until;
        const sponsoredUntil = untilRaw != null ? new Date(untilRaw) : null;
        const nowDate = new Date();
        const sponsoredActive = sponsoredUntil != null &&
            !Number.isNaN(sponsoredUntil.getTime()) &&
            sponsoredUntil.getTime() > nowDate.getTime();
        const remainingMs = sponsoredActive ? sponsoredUntil.getTime() - nowDate.getTime() : 0;
        const priceChips = (0, poker_table_logo_pricing_1.computeTableLogoChangePriceMorbiusChips)({
            sponsoredActive,
            remainingMs,
        });
        if (priceChips > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new Error('Price overflow');
        }
        const wei = (0, poker_chip_scale_1.chipsToWei)(Number(priceChips));
        // table_logo column kept for back-compat (NOT NULL on some history rows); store the
        // address so legacy reads have something stable. New renderers use the token columns.
        const legacyLogoValue = tokenAddress;
        await this.dbService.withTransaction(async (client) => {
            const deduct = await client.query(`UPDATE players SET balance = balance - $2::NUMERIC
         WHERE LOWER(wallet_address) = LOWER($1) AND balance >= $2::NUMERIC
         RETURNING balance`, [normalized, wei.toString()]);
            if (deduct.rows.length === 0) {
                throw new Error('Insufficient MORBIUS balance for table logo sponsorship');
            }
            await client.query(`UPDATE poker_tables SET
           table_logo = $2,
           table_logo_sponsored_until = NOW() + INTERVAL '10 minutes',
           table_logo_sponsor_address = $3,
           table_logo_token_address = $4,
           table_logo_token_name = $5,
           table_logo_token_symbol = $6,
           table_logo_token_logo_url = $7
         WHERE id = $1`, [tableId, legacyLogoValue, normalized, tokenAddress, tokenName, tokenSymbol, tokenLogoUrl]);
            await client.query(`INSERT INTO poker_table_logo_purchases
           (table_id, wallet_address, morbius_chips, logo_filename, token_address, token_name, token_symbol)
         VALUES ($1::uuid, $2, $3::bigint, $4, $5, $6, $7)`, [tableId, normalized, priceChips.toString(), legacyLogoValue, tokenAddress, tokenName, tokenSymbol]);
        });
        await this.broadcastState(tableId);
        return this.getTableState(tableId, normalized);
    }
    // ---------------------------------------------------------------------------
    // setSitOut / setSitBack — voluntary sit-out for cash games
    // ---------------------------------------------------------------------------
    async setSitOut(tableId, playerAddress) {
        const pool = this.getPool();
        const normalized = playerAddress.toLowerCase();
        const result = await pool.query(`UPDATE poker_seats
       SET status = 'sitting_out', sit_out_since = NOW(), consecutive_timeouts = 0
       WHERE table_id = $1 AND player_address = $2
       RETURNING player_address`, [tableId, normalized]);
        if (result.rows.length === 0)
            throw new Error('Seat not found');
        this.notifyCallback?.(`poker:table:${tableId}`, 'poker_player_sitting_out', {
            tableId,
            playerAddress: normalized,
            reason: 'voluntary',
        });
        logger_1.logger.info('Player voluntarily sitting out', { tableId, player: normalized });
        await this.broadcastState(tableId);
        return this.getTableState(tableId, normalized);
    }
    async setSitBack(tableId, playerAddress) {
        const pool = this.getPool();
        const normalized = playerAddress.toLowerCase();
        const result = await pool.query(`UPDATE poker_seats
       SET status = 'active', sit_out_since = NULL, consecutive_timeouts = 0
       WHERE table_id = $1 AND player_address = $2 AND status = 'sitting_out'
       RETURNING player_address`, [tableId, normalized]);
        if (result.rows.length === 0)
            throw new Error('Seat not found or not sitting out');
        logger_1.logger.info('Player sitting back in', { tableId, player: normalized });
        await this.broadcastState(tableId);
        return this.getTableState(tableId, normalized);
    }
    /** Kick players who have been sitting out for >= 15 minutes (cash games only). */
    async kickStaleSitOuts() {
        const pool = this.getPool();
        const stale = await pool.query(`SELECT ps.table_id, ps.player_address
       FROM poker_seats ps
       JOIN poker_tables pt ON pt.id = ps.table_id
       WHERE ps.status = 'sitting_out'
         AND ps.sit_out_since IS NOT NULL
         AND ps.sit_out_since < NOW() - INTERVAL '15 minutes'
         AND pt.tournament_mode = false`);
        for (const row of stale.rows) {
            try {
                await this.withTableLock(row.table_id, async () => {
                    await this._leaveTable(row.table_id, row.player_address);
                    this.notifyCallback?.(`poker:table:${row.table_id}`, 'poker_player_kicked', {
                        tableId: row.table_id,
                        playerAddress: row.player_address,
                        reason: 'sit_out_timeout',
                    });
                    logger_1.logger.info('Sit-out timeout kick', { tableId: row.table_id, player: row.player_address });
                });
            }
            catch (err) {
                logger_1.logger.error('Error kicking stale sit-out', { tableId: row.table_id, player: row.player_address, error: err });
            }
        }
    }
    // ---------------------------------------------------------------------------
    // startHand
    // ---------------------------------------------------------------------------
    async startHand(tableId) {
        const pool = this.getPool();
        const tableResult = await pool.query('SELECT id, small_blind, big_blind, max_seats, hand_number, button_position, tournament_id FROM poker_tables WHERE id = $1', [tableId]);
        if (tableResult.rows.length === 0)
            throw new Error('Table not found');
        const tblRow = tableResult.rows[0];
        const maxSeats = Number(tblRow.max_seats) || 10;
        const sb = Number(tblRow.small_blind ?? 0);
        const bb = Number(tblRow.big_blind ?? 0);
        if (!Number.isFinite(sb) || !Number.isFinite(bb) || sb <= 0 || bb <= 0) {
            throw new Error('Invalid blinds');
        }
        const seatsResult = await pool.query(`SELECT position, player_address, stack FROM poker_seats
       WHERE table_id = $1 AND status != 'sitting_out' ORDER BY position`, [tableId]);
        const withStack = seatsResult.rows.filter((r) => Number(r.stack ?? 0) > 0);
        if (withStack.length < 2)
            return null;
        // Build or reset the in-memory Table (chevtek uses integer "chips", not wei)
        const table = new poker_engine_1.Table(0, sb, bb);
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
            }
            else {
                table.sitDown(addr, stackChips, pos);
            }
        }
        // Determine dealer position: advance from last button
        const lastButton = Number(tblRow.button_position ?? 0);
        const seatPositions = withStack.map((r) => Number(r.position)).sort((a, b) => a - b);
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
        table.handNumber = 0;
        // Generate seeds for DB record (deck is chevtek's internal shuffle)
        const handNumber = Number(tblRow.hand_number) + 1;
        const serverSeed = crypto_1.default.randomBytes(32).toString('hex');
        const serverSeedHash = this.pfService.createServerSeedHash(serverSeed);
        const clientSeed = crypto_1.default.randomBytes(16).toString('hex');
        // Capture starting stacks BEFORE dealCards() posts blinds.
        const startingStacksByAddr = new Map();
        for (const player of table.players) {
            if (!player)
                continue;
            startingStacksByAddr.set(player.id, BigInt(Math.max(0, Math.round(player.stackSize))));
        }
        // Deal cards (sets currentRound, posts blinds, sets currentPosition, shuffles deck internally)
        table.dealCards();
        // Store live table
        this.activeTables.set(tableId, table);
        // Extract hole cards for each player
        const holeCardsByAddr = new Map();
        for (const player of table.players) {
            if (!player || !player.holeCards)
                continue;
            const cards = player.holeCards.map(cardToInt);
            holeCardsByAddr.set(player.id, cards);
        }
        // Capture blind amounts BEFORE any board-runout; gatherBets zeroes player.bet.
        const sbPlayer = table.players[table.smallBlindPosition];
        const bbPlayer = table.players[table.bigBlindPosition];
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
        // Insert hand into DB (chip ints)
        const potStr0 = String(Math.max(0, Math.round((0, poker_chip_scale_1.totalPotChips)(table))));
        const lastRaiseSizeStr = String(Math.round(bb));
        const tournamentIdForHand = tblRow.tournament_id ?? null;
        const handInsert = await pool.query(`INSERT INTO poker_hands
         (table_id, tournament_id, hand_number, button_position, server_seed_hash, server_seed, client_seed,
          community_cards, pot_amount, street, acting_position, turn_started_at, last_raise_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '[]'::JSONB, $8::NUMERIC, 'preflop', $9, NOW(), $10)
       RETURNING id`, [
            tableId,
            tournamentIdForHand,
            handNumber,
            table.dealerPosition,
            serverSeedHash,
            serverSeed,
            clientSeed,
            potStr0,
            table.currentPosition ?? null,
            lastRaiseSizeStr,
        ]);
        const handId = handInsert.rows[0].id;
        this.handStartingStacks.set(handId, startingStacksByAddr);
        // Insert hole cards
        for (const [addr, cards] of holeCardsByAddr) {
            await pool.query(`INSERT INTO poker_hand_hole_cards (hand_id, player_address, cards)
         VALUES ($1, $2, $3::JSONB)`, [handId, addr, JSON.stringify(cards)]);
        }
        // Insert blind actions (chip ints)
        const blindAmountStr = (chips) => String(Math.max(0, Math.round(chips)));
        let actionOrder = 1;
        if (sbPlayer) {
            await pool.query(`INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order")
         VALUES ($1, $2, 'preflop', 'blind', $3::NUMERIC, $4)`, [handId, sbPlayer.id, blindAmountStr(sbBlind), actionOrder++]);
        }
        if (bbPlayer) {
            await pool.query(`INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order")
         VALUES ($1, $2, 'preflop', 'blind', $3::NUMERIC, $4)`, [handId, bbPlayer.id, blindAmountStr(bbBlind), actionOrder++]);
        }
        // Update poker_tables
        await pool.query(`UPDATE poker_tables SET status = 'playing', hand_number = $2, button_position = $3 WHERE id = $1`, [tableId, handNumber, table.dealerPosition]);
        // Sync seat stacks (blinds already deducted by chevtek)
        await this.syncSeatsFromTable(pool, tableId, table);
        // If the hand already ran to showdown (all remaining players were all-in
        // from blinds), finalize now — no player actions will ever arrive.
        if (!table.currentRound && table.winners) {
            await this.persistShowdown(pool, tableId, handId, table);
            this.scheduleNextHandAfterShowdown(tableId);
        }
        return this.getTableState(tableId, null);
    }
    // ---------------------------------------------------------------------------
    // playerAction
    // ---------------------------------------------------------------------------
    async playerAction(tableId, handId, playerAddress, action, amount) {
        return this.withTableLock(tableId, () => this._playerAction(tableId, handId, playerAddress, action, amount));
    }
    async _playerAction(tableId, handId, playerAddress, action, amount) {
        const normalized = this.normalizeAddress(playerAddress);
        const pool = this.getPool();
        // Validate hand
        const handRow = await pool.query('SELECT * FROM poker_hands WHERE id = $1 AND table_id = $2 AND completed_at IS NULL', [handId, tableId]);
        if (handRow.rows.length === 0)
            throw new Error('Hand not found or already completed');
        // In-memory table is recoverable; reconstruct from DB when cache is missing.
        const table = await this.getOrReconstructActiveTable(tableId, pool, 'player_action');
        // Validate it's this player's turn
        const actor = table.currentActor;
        if (!actor)
            throw new Error('No acting player');
        if (actor.id !== normalized)
            throw new Error('Not your turn');
        // Pre-validate action against engine's legal actions before executing
        const legal = actor.legalActions();
        const requestedAction = action === 'bet' || action === 'raise'
            ? (legal.includes(action) ? action : (action === 'bet' && legal.includes('raise') ? 'raise' : action))
            : action;
        if (!legal.includes(requestedAction) && requestedAction !== 'fold') {
            logger_1.logger.warn('Poker illegal action rejected', {
                tableId, handId, player: normalized, action,
                legalActions: legal, currentBet: table.currentBet, playerBet: actor.bet,
            });
            throw new Error(`Illegal action: "${action}" is not allowed. Legal: ${legal.join(', ')}`);
        }
        // Execute the validated action — not the raw client label (e.g. open-raise must call raiseAction, not betAction).
        const effectiveAction = action === 'bet' || action === 'raise' ? requestedAction : action;
        // Capture street before action (for DB recording)
        const streetBefore = chevtekStreetToPoker(table.currentRound, !!table.winners);
        const tableRow = await pool.query('SELECT big_blind FROM poker_tables WHERE id = $1', [tableId]);
        const bbChips = Number(tableRow.rows[0]?.big_blind ?? 0);
        const parseAmountChips = () => {
            const raw = BigInt(amount ?? '0');
            let amt = Math.min(Number(raw), actor.stackSize);
            if (!Number.isFinite(amt) || amt < 0)
                amt = 0;
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
                if (amtChips === 0 && actor.stackSize === 0)
                    throw new Error('You are already all-in');
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
                if (amtChips === 0 && actor.stackSize === 0)
                    throw new Error('You are already all-in');
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
                    throw new Error(`Raise must be at least ${minRaiseTotal} (currentBet ${currentBetChips} + ${minRaiseIncrement}).`);
                }
                actor.raiseAction(amtChips);
                actionAmountDb = String(Math.max(0, Math.round(amtChips)));
                break;
            }
            default:
                throw new Error('Invalid action');
        }
        // Reset AFK timeout counter (and un-sit if sitting_out) on voluntary action
        await pool.query(`UPDATE poker_seats SET consecutive_timeouts = 0, status = 'active'
       WHERE table_id = $1 AND player_address = $2`, [tableId, normalized]);
        // Determine what happened after the action
        const newStreet = chevtekStreetToPoker(table.currentRound, !!table.winners);
        const isShowdown = !table.currentRound && !!table.winners;
        const streetChanged = newStreet !== streetBefore || isShowdown;
        // Get next order number for DB
        const orderResult = await pool.query('SELECT COALESCE(MAX("order"), 0) + 1 AS next_order FROM poker_hand_actions WHERE hand_id = $1', [handId]);
        const nextOrder = Number(orderResult.rows[0].next_order);
        await pool.query(`INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order")
       VALUES ($1, $2, $3, $4, $5::NUMERIC, $6)`, [handId, normalized, streetBefore, effectiveAction, actionAmountDb, nextOrder]);
        if (isShowdown) {
            // Persist showdown results
            await this.persistShowdown(pool, tableId, handId, table);
            await this.broadcastState(tableId);
            this.scheduleNextHandAfterShowdown(tableId);
        }
        else {
            // Update community cards, pot, acting position, street (chip ints)
            const communityInts = table.communityCards.map(cardToInt);
            const potStr = String(Math.max(0, Math.round((0, poker_chip_scale_1.totalPotChips)(table))));
            const actingPos = table.currentPosition ?? null;
            const lrChips = table.lastRaise ?? bbChips;
            const lastRaiseSizeDb = streetChanged
                ? String(Math.round(bbChips))
                : String(Math.max(0, Math.round(lrChips)));
            await pool.query(`UPDATE poker_hands
         SET street = $2, community_cards = $3::JSONB, acting_position = $4,
             pot_amount = $5::NUMERIC, last_raise_size = $6::NUMERIC,
             turn_started_at = CASE WHEN $7 THEN NOW() ELSE turn_started_at END
         WHERE id = $1`, [
                handId,
                newStreet,
                JSON.stringify(communityInts),
                actingPos,
                potStr,
                lastRaiseSizeDb,
                // Reset turn_started_at when actor changes or street changes
                actingPos !== (handRow.rows[0].acting_position != null ? Number(handRow.rows[0].acting_position) : null) || streetChanged,
            ]);
            // Sync seat stacks
            await this.syncSeatsFromTable(pool, tableId, table);
            await this.broadcastState(tableId);
        }
        return this.getTableState(tableId, normalized);
    }
    // ---------------------------------------------------------------------------
    // persistShowdown
    // ---------------------------------------------------------------------------
    async persistShowdown(pool, tableId, handId, table) {
        const isTournament = await this.isTournamentTable(tableId);
        const resultWinners = [];
        // Integer chip split per pot (no float drift), then convert to wei for cash.
        const winnerChips = new Map();
        for (const pot of table.pots) {
            if (!pot.winners || pot.winners.length === 0)
                continue;
            const nonFoldedWinners = pot.winners.filter((w) => !w.folded);
            if (nonFoldedWinners.length === 0)
                continue;
            const potChips = BigInt(Math.max(0, Math.round(pot.amount)));
            const ids = nonFoldedWinners.map((w) => w.id);
            const shares = (0, poker_chip_scale_1.splitBigIntEqually)(potChips, ids.length);
            for (let i = 0; i < ids.length; i++) {
                const id = ids[i];
                winnerChips.set(id, (winnerChips.get(id) ?? 0n) + shares[i]);
            }
        }
        // Compute per-player rake (cash games only) and build winner amounts (chip ints) for the result payload.
        let totalRakeChips = 0n;
        const rakeByAddr = new Map(); // per-winner rake in chips
        const rakedWinnerAmounts = new Map();
        if (isTournament) {
            for (const [addr, ch] of winnerChips) {
                rakedWinnerAmounts.set(addr, ch);
            }
        }
        else {
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
            if (!player)
                continue;
            const grossChips = BigInt(Math.max(0, Math.round(player.stackSize)));
            const playerRake = rakeByAddr.get(player.id) ?? 0n;
            const netChips = grossChips > playerRake ? grossChips - playerRake : 0n;
            await pool.query('UPDATE poker_seats SET stack = $3::NUMERIC WHERE table_id = $1 AND player_address = $2', [tableId, player.id, netChips.toString()]);
        }
        const rakeWallet = (0, poker_chip_scale_1.getPokerRakeWallet)();
        if (totalRakeChips > 0n && !isTournament) {
            await this.dbService.withTransaction(async (c) => {
                await (0, poker_chip_wallet_1.applyPokerChipDelta)(c, rakeWallet, totalRakeChips, 'rake', { type: 'poker_hand', id: handId });
            });
            logger_1.logger.info('Poker rake collected (chips)', { handId, tableId, rakeChips: totalRakeChips.toString(), wallet: rakeWallet });
        }
        // Get hole cards from DB for hand names
        const holeResult = await pool.query('SELECT player_address, cards FROM poker_hand_hole_cards WHERE hand_id = $1', [handId]);
        const holeCardsByAddr = new Map();
        for (const row of holeResult.rows) {
            const cards = Array.isArray(row.cards) ? row.cards : JSON.parse(row.cards ?? '[]');
            holeCardsByAddr.set(row.player_address, cards);
        }
        const communityInts = table.communityCards.map(cardToInt);
        for (const [addr, amount] of rakedWinnerAmounts) {
            const holeCards = holeCardsByAddr.get(addr) ?? [];
            const allCards = [...holeCards, ...communityInts];
            let handName;
            let winningCardIndices;
            if (allCards.length >= 5) {
                const ranked = (0, poker_hand_eval_1.bestHand)(allCards);
                winningCardIndices = ranked.cards;
                const livePlayer = table.players.find((p) => p?.id === addr);
                if (livePlayer?.hand) {
                    handName = livePlayer.hand.descr ?? undefined;
                }
            }
            resultWinners.push({ address: addr, amount: amount.toString(), handName, winningCardIndices });
        }
        await pool.query(`UPDATE poker_hands
       SET completed_at = NOW(), street = 'showdown', acting_position = NULL,
           community_cards = $2::JSONB, result = $3::JSONB, rake_amount = $4::NUMERIC
       WHERE id = $1`, [handId, JSON.stringify(communityInts), JSON.stringify({ winners: resultWinners }), totalRakeChips.toString()]);
        try {
            await this.populateHandPlayers(pool, handId, table, {
                winnerChips,
                rakedWinnerAmounts,
                rakeByAddr,
                resultWinners,
            });
        }
        catch (err) {
            logger_1.logger.error('populateHandPlayers failed', { handId, tableId, err });
        }
        finally {
            this.handStartingStacks.delete(handId);
        }
        await pool.query('UPDATE poker_tables SET status = $2 WHERE id = $1', [tableId, 'waiting']);
        // Fire tournament post-hand hook (awaited so eliminations complete before tryStartNextHand)
        if (this.postHandCallback) {
            const handRow = await pool.query('SELECT hand_number FROM poker_hands WHERE id = $1', [handId]);
            const handNumber = Number(handRow.rows[0]?.hand_number ?? 0);
            try {
                await this.postHandCallback(tableId, handNumber);
            }
            catch (err) {
                logger_1.logger.error('Post-hand tournament callback error', { tableId, err });
            }
        }
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
    async populateHandPlayers(pool, handId, table, settlement) {
        const startingStacks = this.handStartingStacks.get(handId) ?? new Map();
        const buttonPos = table.dealerPosition;
        const sbPos = table.smallBlindPosition;
        const bbPos = table.bigBlindPosition;
        // Map each seated player -> seat position
        const seatByAddr = new Map();
        for (let i = 0; i < table.players.length; i++) {
            const p = table.players[i];
            if (p)
                seatByAddr.set(p.id, i);
        }
        if (seatByAddr.size === 0)
            return;
        // Load all actions for this hand
        const actionsRes = await pool.query(`SELECT player_address, street, action, amount
         FROM poker_hand_actions
        WHERE hand_id = $1
        ORDER BY "order" ASC`, [handId]);
        const streets = ['preflop', 'flop', 'turn', 'river'];
        const zeroCounts = () => ({ bets: 0, raises: 0, calls: 0, checks: 0 });
        const aggByAddr = new Map();
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
            if (!agg)
                continue;
            const street = row.street;
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
                    if (preflopRaiseCount >= 1)
                        agg.threeBet = true;
                    preflopRaiseCount += 1;
                }
            }
            const c = agg.counts[street];
            if (action === 'bet')
                c.bets += 1;
            else if (action === 'raise')
                c.raises += 1;
            else if (action === 'call')
                c.calls += 1;
            else if (action === 'check')
                c.checks += 1;
        }
        // Determine which streets each player "saw" (reached without folding earlier).
        for (const agg of aggByAddr.values()) {
            for (let i = 0; i < streets.length; i++) {
                const s = streets[i];
                if (agg.folded && agg.foldedStreet && streets.indexOf(agg.foldedStreet) < i) {
                    agg.saw[s] = false;
                }
                else {
                    agg.saw[s] = true;
                }
            }
        }
        // Build winner handName / showdown lookup
        const winnerMetaByAddr = new Map();
        for (const w of settlement.resultWinners) {
            winnerMetaByAddr.set(w.address.toLowerCase(), { handName: w.handName });
        }
        // Did the hand reach showdown at all? (≥2 non-folded players remain)
        const nonFoldedCount = Array.from(aggByAddr.values()).filter((a) => !a.folded).length;
        const handWentToShowdown = nonFoldedCount >= 2;
        // Batch insert rows
        for (const [addr, seatPos] of seatByAddr) {
            const agg = aggByAddr.get(addr);
            const startingStack = startingStacks.get(addr) ?? 0n;
            const endingStackRaw = table.players[seatPos]?.stackSize ?? 0;
            const endingStack = BigInt(Math.max(0, Math.round(endingStackRaw)));
            const rakePaid = settlement.rakeByAddr.get(addr) ?? 0n;
            const wonNet = settlement.rakedWinnerAmounts.get(addr) ?? 0n;
            const won = wonNet > 0n;
            const meta = winnerMetaByAddr.get(addr);
            const sawShowdown = !agg.folded && handWentToShowdown;
            const c = agg.counts;
            await pool.query(`INSERT INTO poker_hand_players (
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
         ON CONFLICT (hand_id, player_address) DO NOTHING`, [
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
            ]);
        }
    }
    // ---------------------------------------------------------------------------
    // autoFoldTimedOutTurns
    // ---------------------------------------------------------------------------
    async autoFoldTimedOutTurns() {
        const pool = this.getPool();
        const timedOut = await pool.query(`SELECT h.id AS hand_id, h.table_id, h.acting_position
       FROM poker_hands h
       WHERE h.completed_at IS NULL
         AND h.acting_position IS NOT NULL
         AND h.turn_started_at < NOW() - INTERVAL '60 seconds'`);
        const folded = [];
        for (const row of timedOut.rows) {
            try {
                // Serialize with player actions on the same table
                await this.withTableLock(row.table_id, async () => {
                    const table = await this.getOrReconstructActiveTable(row.table_id, pool, 'timeout_autofold');
                    const actor = table.currentActor;
                    if (!actor)
                        return;
                    const actingAddr = actor.id;
                    // Capture street before
                    const streetBefore = chevtekStreetToPoker(table.currentRound, !!table.winners);
                    // Auto-check when not facing a bet; auto-fold when facing a bet
                    const canCheck = !table.currentBet || actor.bet >= table.currentBet;
                    const timeoutAction = canCheck ? 'check' : 'fold';
                    if (canCheck) {
                        actor.checkAction();
                    }
                    else {
                        actor.foldAction();
                    }
                    // Record the timeout action
                    const orderResult = await pool.query('SELECT COALESCE(MAX("order"), 0) + 1 AS next_order FROM poker_hand_actions WHERE hand_id = $1', [row.hand_id]);
                    const nextOrder = Number(orderResult.rows[0].next_order);
                    await pool.query(`INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order")
             VALUES ($1, $2, $3, $4, 0, $5)`, [row.hand_id, actingAddr, streetBefore, timeoutAction, nextOrder]);
                    if (!table.currentRound && table.winners) {
                        await this.persistShowdown(pool, row.table_id, row.hand_id, table);
                        await this.broadcastState(row.table_id);
                        this.scheduleNextHandAfterShowdown(row.table_id);
                    }
                    else {
                        const communityInts = table.communityCards.map(cardToInt);
                        const potStr = String(Math.max(0, Math.round((0, poker_chip_scale_1.totalPotChips)(table))));
                        const actingPos = table.currentPosition ?? null;
                        const newStreet = chevtekStreetToPoker(table.currentRound, false);
                        await pool.query(`UPDATE poker_hands
               SET street = $2, community_cards = $3::JSONB, acting_position = $4,
                   pot_amount = $5::NUMERIC, turn_started_at = NOW()
               WHERE id = $1`, [row.hand_id, newStreet, JSON.stringify(communityInts), actingPos, potStr]);
                        await this.syncSeatsFromTable(pool, row.table_id, table);
                        await this.broadcastState(row.table_id);
                    }
                    folded.push(actingAddr);
                    logger_1.logger.info(`Auto-${timeoutAction} timed-out turn`, { handId: row.hand_id, player: actingAddr, action: timeoutAction });
                    // Track consecutive timeouts and auto-kick/sit-out AFK players
                    try {
                        const tableInfoResult = await pool.query('SELECT tournament_mode FROM poker_tables WHERE id = $1', [row.table_id]);
                        const isTournament = tableInfoResult.rows[0]?.tournament_mode ?? false;
                        const timeoutResult = await pool.query(`UPDATE poker_seats
               SET consecutive_timeouts = consecutive_timeouts + 1
               WHERE table_id = $1 AND player_address = $2
               RETURNING consecutive_timeouts`, [row.table_id, actingAddr]);
                        const consecutiveTimeouts = Number(timeoutResult.rows[0]?.consecutive_timeouts ?? 0);
                        if (consecutiveTimeouts >= POKER_AFK_CONSECUTIVE_TIMEOUT_KICK) {
                            if (isTournament) {
                                if (this.tournamentTimeoutEliminationCallback) {
                                    try {
                                        await this.tournamentTimeoutEliminationCallback(row.table_id, actingAddr);
                                        await this.broadcastState(row.table_id);
                                    }
                                    catch (elimErr) {
                                        logger_1.logger.error('Tournament AFK timeout elimination failed', {
                                            tableId: row.table_id,
                                            player: actingAddr,
                                            error: elimErr,
                                        });
                                    }
                                }
                                else {
                                    logger_1.logger.warn('Tournament timeout elimination callback not set; AFK player not eliminated', {
                                        tableId: row.table_id,
                                        player: actingAddr,
                                    });
                                }
                            }
                            else {
                                // Cash game — kick and return stack (call _leaveTable directly; we already hold the lock)
                                await this._leaveTable(row.table_id, actingAddr);
                                this.notifyCallback?.(`poker:table:${row.table_id}`, 'poker_player_kicked', {
                                    tableId: row.table_id,
                                    playerAddress: actingAddr,
                                    reason: 'afk',
                                });
                                logger_1.logger.info('Cash game AFK player kicked', { tableId: row.table_id, player: actingAddr });
                            }
                        }
                    }
                    catch (kickErr) {
                        logger_1.logger.error('Error handling AFK kick/sitout', { handId: row.hand_id, player: actingAddr, error: kickErr });
                    }
                });
            }
            catch (err) {
                logger_1.logger.error('Error auto-folding timed-out turn', { handId: row.hand_id, error: err });
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
    async tickServerTournamentBots() {
        const off = String(process.env.POKER_SERVER_TOURNAMENT_BOTS ?? '').toLowerCase();
        if (off === 'false' || off === '0' || off === 'no')
            return;
        const botSet = (0, poker_server_bot_addresses_1.getServerPokerBotAddressSet)();
        if (botSet.size === 0)
            return;
        let thinkMs = 1200;
        const rawThink = process.env.POKER_SERVER_BOT_THINK_MS;
        if (rawThink) {
            const n = Number(rawThink);
            if (Number.isFinite(n) && n >= 200 && n <= 10_000)
                thinkMs = Math.floor(n);
        }
        const pool = this.getPool();
        const result = await pool.query(`SELECT h.id AS hand_id, h.table_id, h.acting_position
       FROM poker_hands h
       INNER JOIN poker_tables pt ON pt.id = h.table_id
       WHERE h.completed_at IS NULL
         AND h.acting_position IS NOT NULL
         AND pt.tournament_id IS NOT NULL
         AND h.turn_started_at IS NOT NULL
         AND h.turn_started_at < NOW() - ($1 * INTERVAL '1 millisecond')`, [thinkMs]);
        for (const row of result.rows) {
            try {
                const seatQ = await pool.query(`SELECT player_address FROM poker_seats
           WHERE table_id = $1 AND position = $2 AND player_address IS NOT NULL`, [row.table_id, row.acting_position]);
                const rawAddr = seatQ.rows[0]?.player_address;
                if (!rawAddr)
                    continue;
                const addr = this.normalizeAddress(String(rawAddr));
                if (!botSet.has(addr))
                    continue;
                const state = await this.getTableState(row.table_id, addr);
                const hand = state.currentHand;
                if (!hand || hand.handId !== row.hand_id)
                    continue;
                if (hand.street === 'showdown')
                    continue;
                if (hand.actingPosition !== row.acting_position)
                    continue;
                if (!['preflop', 'flop', 'turn', 'river'].includes(hand.street))
                    continue;
                const mySeat = state.seats.find((s) => s.playerAddress && this.normalizeAddress(s.playerAddress) === addr);
                const decision = (0, poker_bot_ai_1.decidePokerBotAction)({
                    street: hand.street,
                    pot: hand.pot,
                    toCall: hand.toCall,
                    minRaise: hand.minRaise,
                    myStack: mySeat?.stack ?? '0',
                    myHoleCards: state.myHoleCards,
                });
                await this.playerAction(row.table_id, row.hand_id, addr, decision.action, decision.amount);
            }
            catch (err) {
                logger_1.logger.warn('Poker server tournament bot tick failed', {
                    tableId: row.table_id,
                    handId: row.hand_id,
                    message: err?.message,
                });
            }
        }
    }
    // ---------------------------------------------------------------------------
    // reconstructTable
    // ---------------------------------------------------------------------------
    async reconstructTable(tableId, pool) {
        const tblRow = await pool.query('SELECT small_blind, big_blind, max_seats, button_position, hand_number FROM poker_tables WHERE id = $1', [tableId]);
        if (tblRow.rows.length === 0)
            throw new Error('Table not found');
        const tbl = tblRow.rows[0];
        const sb = Number(tbl.small_blind ?? 0);
        const bb = Number(tbl.big_blind ?? 0);
        if (!Number.isFinite(sb) || !Number.isFinite(bb) || sb <= 0 || bb <= 0) {
            throw new Error('Invalid blinds');
        }
        const activeHand = await pool.query(`SELECT * FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL ORDER BY created_at DESC LIMIT 1`, [tableId]);
        const seatsResult = await pool.query('SELECT position, player_address, stack FROM poker_seats WHERE table_id = $1 ORDER BY position', [tableId]);
        const table = new poker_engine_1.Table(0, sb, bb);
        if (activeHand.rows.length === 0) {
            // No active hand — just seat players
            for (const seat of seatsResult.rows) {
                if (!seat.player_address || BigInt(seat.stack ?? '0') === 0n)
                    continue;
                const pos = Number(seat.position);
                const addr = (seat.player_address || '').toLowerCase();
                const stackChips = Number(seat.stack ?? 0);
                if (pos === 0) {
                    table.sitDown(addr, stackChips);
                }
                else {
                    table.sitDown(addr, stackChips, pos);
                }
            }
            if (tbl.button_position != null) {
                try {
                    table.moveDealer(Number(tbl.button_position));
                }
                catch { /* ignore */ }
            }
            return table;
        }
        const hand = activeHand.rows[0];
        // Get hole cards from DB to know who was dealt in
        const holeCardsResult = await pool.query('SELECT player_address, cards FROM poker_hand_hole_cards WHERE hand_id = $1', [hand.id]);
        const dealtAddrs = new Set(holeCardsResult.rows.map((r) => (r.player_address || '').toLowerCase()));
        const actionsResult = await pool.query(`SELECT player_address, action, amount FROM poker_hand_actions WHERE hand_id = $1 ORDER BY "order"`, [hand.id]);
        const committedChips = new Map();
        for (const row of actionsResult.rows) {
            const addr = (row.player_address || '').toLowerCase();
            if (!['bet', 'raise', 'call', 'blind'].includes(row.action))
                continue;
            committedChips.set(addr, (committedChips.get(addr) ?? 0) + Number(row.amount ?? 0));
        }
        for (const seat of seatsResult.rows) {
            const addr = (seat.player_address || '').toLowerCase();
            if (!dealtAddrs.has(addr))
                continue;
            const pos = Number(seat.position);
            const currentStack = Number(seat.stack ?? 0);
            const totalCommitted = committedChips.get(addr) ?? 0;
            const startingStack = currentStack + totalCommitted;
            if (pos === 0) {
                table.sitDown(addr, startingStack);
            }
            else {
                table.sitDown(addr, startingStack, pos);
            }
        }
        // Set dealer position; handNumber=0 so dealCards() increments to 1 and won't auto-move
        const dealerPos = Number(hand.button_position);
        table.moveDealer(dealerPos);
        table.handNumber = 0;
        // Inject hole cards and deck
        // We need to give chevtek a deck; set table.deck so dealCards() uses our cards.
        // The deck order: dealCards() pops cards for each player (in player array order).
        // We reconstruct by manually assigning holeCards to each player after dealCards.
        // Build a dummy deck (dealCards will pop from it)
        // We'll set the deck to cards NOT used as hole cards (community + remaining)
        // Actually, the cleanest approach: call dealCards() with a proper deck,
        // then overwrite holeCards.
        // Collect all int cards used
        const holeCardInts = new Map();
        for (const row of holeCardsResult.rows) {
            const addr = (row.player_address || '').toLowerCase();
            const cards = Array.isArray(row.cards) ? row.cards : JSON.parse(row.cards ?? '[]');
            holeCardInts.set(addr, cards);
        }
        const communityCardInts = Array.isArray(hand.community_cards)
            ? hand.community_cards
            : (hand.community_cards ? JSON.parse(JSON.stringify(hand.community_cards)) : []);
        // Build deck for dealCards(): must contain all player hole cards + community cards
        // in the right pop() order. Players are dealt in order of table.players array.
        // dealCards() does: for each player in players[], pop 2 cards.
        // Then nextRound() pops 3 (flop), 1 (turn), 1 (river).
        // We construct the deck so pop() yields them in the correct order.
        // Array order = [last popped, ..., first popped] (reversed from deal order).
        const dealtOrder = [];
        for (const p of table.players) {
            if (!p)
                continue;
            const cards = holeCardInts.get(p.id) ?? [];
            dealtOrder.push(...cards);
        }
        // Remaining community cards based on current street
        // We add all 5 community card slots (some may be placeholders for future streets)
        // Pad with placeholder cards from the unused portion of deck
        const allUsed = new Set([...dealtOrder, ...communityCardInts]);
        const placeholderDeck = [];
        for (let i = 0; i < 52; i++) {
            if (!allUsed.has(i))
                placeholderDeck.push(i);
        }
        // Community cards to be popped: flop(3), turn(1), river(1) = 5 total after hole cards
        // For reconstruction we need all 5 even if not yet dealt (they'll be dealt during replay)
        const communityFull = [
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
            if (!p)
                continue;
            const cards = holeCardInts.get(p.id);
            if (cards && cards.length === 2) {
                p.holeCards = [intToCard(cards[0]), intToCard(cards[1])];
            }
        }
        // Inject community cards dealt so far
        table.communityCards = communityCardInts.map(intToCard);
        // Replay non-blind actions to advance chevtek's state
        const nonBlindActions = actionsResult.rows.filter((r) => r.action !== 'blind');
        const totalActions = nonBlindActions.length;
        let replayedCount = 0;
        let replayFailed = false;
        for (const actionRow of nonBlindActions) {
            const actor = table.currentActor;
            if (!actor) {
                logger_1.logger.warn('Reconstruct: no currentActor mid-replay', {
                    tableId, replayed: replayedCount, total: totalActions,
                    currentRound: table.currentRound, hasWinners: !!table.winners,
                });
                break;
            }
            const addr = (actionRow.player_address || '').toLowerCase();
            if (actor.id !== addr) {
                logger_1.logger.warn('Reconstruct: actor mismatch during replay', {
                    tableId, expected: actor.id, got: addr,
                    replayed: replayedCount, total: totalActions,
                    currentBet: table.currentBet, actorBet: actor.bet,
                });
                replayFailed = true;
                break;
            }
            try {
                switch (actionRow.action) {
                    case 'fold':
                        actor.foldAction();
                        break;
                    case 'check':
                        actor.checkAction();
                        break;
                    case 'call':
                        actor.callAction();
                        break;
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
            }
            catch (err) {
                logger_1.logger.warn('Reconstruct: replay action failed', {
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
            logger_1.logger.warn('Reconstruct: patching engine state after partial replay', {
                tableId, replayed: replayedCount, total: totalActions,
            });
            // Recompute per-player committed amounts for the current street only
            const dbStreet = hand.street;
            const streetContribResult = await pool.query(`SELECT player_address, SUM(amount) AS total FROM poker_hand_actions
         WHERE hand_id = $1 AND street = $2 AND action IN ('bet','raise','call','blind')
         GROUP BY player_address`, [hand.id, dbStreet]);
            let maxContrib = 0;
            for (const row of streetContribResult.rows) {
                const chips = Number(row.total ?? 0);
                if (chips > maxContrib)
                    maxContrib = chips;
                const p = table.players.find((pl) => pl?.id === (row.player_address || '').toLowerCase());
                if (p)
                    p.bet = chips;
            }
            if (maxContrib > 0) {
                table.currentBet = maxContrib;
            }
            // Advance community cards to match DB street
            const targetCommunity = communityCardInts.map(intToCard);
            table.communityCards = targetCommunity;
            // Set acting position from DB
            if (hand.acting_position != null) {
                table.currentPosition = Number(hand.acting_position);
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
                const lastAggressorResult = await pool.query(`SELECT player_address FROM poker_hand_actions
           WHERE hand_id = $1 AND street = $2 AND action IN ('bet','raise')
           ORDER BY "order" DESC LIMIT 1`, [hand.id, dbStreet]);
                // Build a seat-position map from the dealt players
                const addrToPos = new Map();
                for (const seat of seatsResult.rows) {
                    if (seat.player_address) {
                        addrToPos.set(seat.player_address.toLowerCase(), Number(seat.position));
                    }
                }
                // Determine which positions are still active (not folded) in this hand
                const foldedInHand = new Set();
                for (const row of actionsResult.rows) {
                    if (row.action === 'fold')
                        foldedInHand.add((row.player_address || '').toLowerCase());
                }
                // All dealt, non-folded seat positions
                const activeSeatPositions = [];
                for (const seat of seatsResult.rows) {
                    if (!seat.player_address)
                        continue;
                    const addr = seat.player_address.toLowerCase();
                    if (!dealtAddrs.has(addr))
                        continue;
                    if (foldedInHand.has(addr))
                        continue;
                    activeSeatPositions.push(Number(seat.position));
                }
                activeSeatPositions.sort((a, b) => a - b);
                // All dealt seat positions (including folded) — needed to reconstruct SB/BB positions
                const dealtSeatPositions = [];
                for (const seat of seatsResult.rows) {
                    if (!seat.player_address)
                        continue;
                    const addr = seat.player_address.toLowerCase();
                    if (dealtAddrs.has(addr))
                        dealtSeatPositions.push(Number(seat.position));
                }
                dealtSeatPositions.sort((a, b) => a - b);
                // Derive SB and BB positions from button using the full dealt-seat list
                const dealtList = dealtSeatPositions.length > 0 ? dealtSeatPositions : [dealerPosForLastPos];
                const sbPos = this.nextSeatPosition(dealerPosForLastPos, dealtList, maxSeatsForLastPos);
                const bbPos = this.nextSeatPosition(sbPos, dealtList, maxSeatsForLastPos);
                // Default lastPosition: postflop = dealer; preflop = BB (action ends when BB acts last)
                const isPreflop = dbStreet === 'preflop';
                let computedLastPos = isPreflop ? bbPos : dealerPosForLastPos;
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
                }
                else if (activeSeatPositions.length > 0 && !isPreflop) {
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
                table.lastPosition = computedLastPos;
                // Clear stale per-player raise flags from prior streets so actingPlayers is correct
                for (const p of table.players) {
                    if (p)
                        delete p.raise;
                }
                // Re-apply raise flag only for the last aggressor on the current street (if they've matched
                // current bet), so actingPlayers correctly excludes them from acting again this street.
                if (lastAggressorResult.rows.length > 0 && maxContrib > 0) {
                    const aggressorAddr = (lastAggressorResult.rows[0].player_address || '').toLowerCase();
                    const aggressorPlayer = table.players.find((pl) => pl?.id === aggressorAddr);
                    if (aggressorPlayer && aggressorPlayer.bet >= maxContrib) {
                        // Mark as raiser so actingPlayers excludes them (they opened/re-raised and don't
                        // get to act again unless someone re-raises them)
                        aggressorPlayer.raise = aggressorPlayer.bet;
                    }
                }
            }
        }
        return table;
    }
    // ---------------------------------------------------------------------------
    // tryStartNextHand
    // ---------------------------------------------------------------------------
    async tryStartNextHand(tableId) {
        this.clearScheduledNextHand(tableId);
        return this.withTableLock(tableId, async () => {
            const pool = this.getPool();
            const activeHand = await pool.query('SELECT id FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL LIMIT 1', [tableId]);
            if (activeHand.rows.length > 0)
                return;
            // Remove players from in-memory table (cleanup for next hand)
            this.activeTables.delete(tableId);
            const seatsResult = await pool.query('SELECT stack FROM poker_seats WHERE table_id = $1', [tableId]);
            const withStack = seatsResult.rows.filter((r) => BigInt(r.stack ?? '0') > 0n);
            if (withStack.length < 2) {
                const modeRow = await pool.query('SELECT tournament_mode FROM poker_tables WHERE id = $1', [tableId]);
                if (modeRow.rows[0]?.tournament_mode && this.tournamentUnderfilledRecovery) {
                    try {
                        await this.tournamentUnderfilledRecovery(tableId);
                    }
                    catch (err) {
                        logger_1.logger.error('Tournament underfilled recovery failed', { tableId, err });
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
    async syncSeatsFromTable(pool, tableId, table) {
        for (const player of table.players) {
            if (!player)
                continue;
            const stackStr = String(Math.max(0, Math.round(player.stackSize)));
            await pool.query('UPDATE poker_seats SET stack = $3::NUMERIC WHERE table_id = $1 AND player_address = $2', [tableId, player.id, stackStr]);
        }
    }
    // ---------------------------------------------------------------------------
    // Seat position helpers
    // ---------------------------------------------------------------------------
    nextSeatPosition(fromPosition, sortedPositions, maxSeats) {
        for (let i = 1; i <= maxSeats; i++) {
            const pos = (fromPosition + i) % maxSeats;
            if (sortedPositions.includes(pos))
                return pos;
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
    async joinTableTournament(tableId, playerAddress, startingChips) {
        const normalized = this.normalizeAddress(playerAddress);
        const pool = this.getPool();
        const tableResult = await pool.query('SELECT id, max_seats, tournament_mode FROM poker_tables WHERE id = $1', [tableId]);
        if (tableResult.rows.length === 0)
            throw new Error('Table not found');
        if (!tableResult.rows[0].tournament_mode)
            throw new Error('Table is not in tournament mode');
        const maxSeats = Number(tableResult.rows[0].max_seats) || 10;
        const existing = await pool.query('SELECT id FROM poker_seats WHERE table_id = $1 AND player_address = $2', [tableId, normalized]);
        if (existing.rows.length > 0)
            throw new Error('Already seated at this table');
        const seatCount = await pool.query('SELECT COUNT(*) AS c FROM poker_seats WHERE table_id = $1', [tableId]);
        if (Number(seatCount.rows[0].c) >= maxSeats)
            throw new Error('Table is full');
        const positions = await pool.query('SELECT position FROM poker_seats WHERE table_id = $1', [tableId]);
        const used = new Set(positions.rows.map((r) => r.position));
        let seatPosition = 0;
        while (used.has(seatPosition))
            seatPosition++;
        await pool.query(`INSERT INTO poker_seats (table_id, position, player_address, stack, status)
       VALUES ($1, $2, $3, $4::NUMERIC, 'active')`, [tableId, seatPosition, normalized, startingChips.toString()]);
        logger_1.logger.info('Poker tournament join (virtual chips)', { tableId, playerAddress: normalized, startingChips, position: seatPosition });
    }
    /**
     * Remove a player from a tournament table without crediting their stack back.
     * Used by PokerTournamentService when a player is eliminated.
     */
    async leaveTableTournament(tableId, playerAddress) {
        const normalized = this.normalizeAddress(playerAddress);
        const pool = this.getPool();
        const activeHandResult = await pool.query(`SELECT id FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL LIMIT 1`, [tableId]);
        const activeTable = this.activeTables.get(tableId);
        if (activeHandResult.rows.length > 0 && activeTable) {
            try {
                activeTable.standUp(normalized);
                const handId = activeHandResult.rows[0].id;
                await this.persistActionAfterStandUp(pool, tableId, handId, normalized, activeTable);
            }
            catch (err) {
                logger_1.logger.warn('standUp error on leaveTableTournament', { tableId, playerAddress: normalized, err });
            }
        }
        await pool.query('DELETE FROM poker_seats WHERE table_id = $1 AND player_address = $2', [tableId, normalized]);
        // No balance credit — tournament chips are virtual
        logger_1.logger.info('Poker tournament leave (no balance credit)', { tableId, playerAddress: normalized });
    }
    /**
     * Delete a tournament table without crediting player stacks back.
     * Used by PokerTournamentService after prize distribution.
     */
    async deleteTableTournament(tableId) {
        const pool = this.getPool();
        this.clearScheduledNextHand(tableId);
        this.activeTables.delete(tableId);
        this.invalidateTableScaling(tableId);
        await pool.query('DELETE FROM poker_tables WHERE id = $1', [tableId]);
        logger_1.logger.info('Poker tournament table deleted (no balance credit)', { tableId });
    }
}
exports.PokerGameService = PokerGameService;
//# sourceMappingURL=poker-game.service.js.map