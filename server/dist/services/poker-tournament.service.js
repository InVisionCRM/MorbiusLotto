"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PokerTournamentService = exports.DEFAULT_BLIND_SCHEDULE = void 0;
const logger_1 = require("../utils/logger");
const safe_bigint_1 = require("../utils/safe-bigint");
exports.DEFAULT_BLIND_SCHEDULE = [
    { level: 1, smallBlind: 25, bigBlind: 50, handsPerLevel: 10 },
    { level: 2, smallBlind: 50, bigBlind: 100, handsPerLevel: 10 },
    { level: 3, smallBlind: 75, bigBlind: 150, handsPerLevel: 8 },
    { level: 4, smallBlind: 100, bigBlind: 200, handsPerLevel: 8 },
    { level: 5, smallBlind: 150, bigBlind: 300, handsPerLevel: 6 },
    { level: 6, smallBlind: 200, bigBlind: 400, handsPerLevel: 6 },
    { level: 7, smallBlind: 300, bigBlind: 600, handsPerLevel: 5 },
    { level: 8, smallBlind: 500, bigBlind: 1000, handsPerLevel: 999 },
];
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Tournament uses integer chip counts; multiply by this to store in wei units (same as cash game). */
const CHIP_SCALE = BigInt('1000000000000000000'); // 10^18
// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
class PokerTournamentService {
    pool;
    tournamentService;
    pokerGameService;
    broadcastCallback = null;
    constructor(pool, tournamentService, pokerGameService) {
        this.pool = pool;
        this.tournamentService = tournamentService;
        this.pokerGameService = pokerGameService;
    }
    /** Wire in a broadcast function so the service can push WS events. */
    setBroadcastCallback(cb) {
        this.broadcastCallback = cb;
    }
    broadcast(room, type, payload) {
        if (this.broadcastCallback) {
            this.broadcastCallback(room, { type, payload });
        }
    }
    normalizeAddress(address) {
        return address?.toLowerCase() ?? address;
    }
    parseBigInt(value) {
        return (0, safe_bigint_1.toBigIntSafe)(value);
    }
    // ---------------------------------------------------------------------------
    // Blind level calculation (pure, no DB)
    // ---------------------------------------------------------------------------
    /** Return the BlindLevel that applies for a given hand number (1-indexed). */
    computeBlindLevel(blindSchedule, handNumber) {
        let accumulated = 0;
        for (const level of blindSchedule) {
            accumulated += level.handsPerLevel;
            if (handNumber <= accumulated)
                return level;
        }
        return blindSchedule[blindSchedule.length - 1];
    }
    parsePokerConfig(raw) {
        if (!raw) {
            return { startingStack: 5000, minPlayers: 2, maxPlayers: 6, blindSchedule: exports.DEFAULT_BLIND_SCHEDULE };
        }
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return {
            startingStack: Number(obj.startingStack ?? 5000),
            minPlayers: Number(obj.minPlayers ?? 2),
            maxPlayers: Number(obj.maxPlayers ?? 6),
            blindSchedule: Array.isArray(obj.blindSchedule) && obj.blindSchedule.length > 0
                ? obj.blindSchedule
                : exports.DEFAULT_BLIND_SCHEDULE,
        };
    }
    // ---------------------------------------------------------------------------
    // Create
    // ---------------------------------------------------------------------------
    async createPokerTournament(params) {
        const normalizedCreator = this.normalizeAddress(params.creatorAddress);
        const { config } = params;
        if (!config.blindSchedule || config.blindSchedule.length === 0) {
            throw new Error('Blind schedule must have at least one level');
        }
        if (config.minPlayers < 2)
            throw new Error('minPlayers must be at least 2');
        if (config.maxPlayers < config.minPlayers)
            throw new Error('maxPlayers must be >= minPlayers');
        if (config.startingStack < 100)
            throw new Error('startingStack must be at least 100');
        if (!params.name?.trim())
            throw new Error('Tournament name required');
        let pinCode = null;
        if (params.isPrivate) {
            const custom = params.pinCode?.trim();
            if (custom && /^\d{4,12}$/.test(custom)) {
                pinCode = custom;
            }
            else {
                pinCode = Math.floor(1000 + Math.random() * 9000).toString();
            }
        }
        const prizePercentages = getPrizePercentagesForType(params.prizeDistributionType);
        const result = await this.pool.query(`INSERT INTO tournaments (
        name, creator_address, buy_in_amount, starting_chips, max_hands, min_players,
        max_players, rebuy_config, table_theme, is_private, pin_code,
        prize_distribution_type, prize_percentages, prize_pool,
        creator_fee_percent, platform_fee_percent, status,
        game_type, poker_config, scheduled_start_at
      ) VALUES (
        $1, $2, $3::NUMERIC, $4, 999, $5,
        $6, $7::JSONB, $8::JSONB, $9, $10,
        $11, $12::JSONB, '0',
        2, 3, 'registration',
        'poker', $13::JSONB, $14
      ) RETURNING id`, [
            params.name.trim(),
            normalizedCreator,
            params.buyInAmount.toString(),
            config.startingStack,
            config.minPlayers,
            config.maxPlayers,
            JSON.stringify({ enabled: false, maxRebuys: 0 }),
            JSON.stringify({ kind: 'image', id: 'BigRich' }),
            params.isPrivate ?? false,
            pinCode,
            params.prizeDistributionType,
            JSON.stringify(prizePercentages),
            JSON.stringify(config),
            params.scheduledStartAt ?? null,
        ]);
        const tournamentId = result.rows[0].id;
        // If a future start time was provided, queue the scheduled event for FreerollSchedulerService
        if (params.scheduledStartAt && params.scheduledStartAt > new Date()) {
            await this.pool.query(`INSERT INTO tournament_scheduled_events (tournament_id, event_type, scheduled_at, status)
         VALUES ($1, 'poker_start', $2, 'pending')`, [tournamentId, params.scheduledStartAt.toISOString()]);
        }
        logger_1.logger.info('Poker tournament created', {
            tournamentId, name: params.name, creator: normalizedCreator,
            scheduledStartAt: params.scheduledStartAt ?? 'SNG (auto-start)',
        });
        return { tournamentId };
    }
    // ---------------------------------------------------------------------------
    // Join
    // ---------------------------------------------------------------------------
    /**
     * Player joins the registration phase by paying the buy-in.
     * Uses SELECT ... FOR UPDATE to prevent race condition on auto-start.
     * Returns the entry and whether the tournament auto-started.
     */
    async joinPokerTournament(tournamentId, playerAddress, pinCode) {
        const normalized = this.normalizeAddress(playerAddress);
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            // Lock the tournament row to serialize concurrent joins
            const tRow = await client.query(`SELECT t.*, t.poker_config, t.scheduled_start_at
         FROM tournaments t
         WHERE t.id = $1 AND t.game_type = 'poker'
         FOR UPDATE`, [tournamentId]);
            if (tRow.rows.length === 0)
                throw new Error('Poker tournament not found');
            const tournament = tRow.rows[0];
            if (tournament.status !== 'registration') {
                throw new Error(`Tournament is not open for registration (status: ${tournament.status})`);
            }
            const config = this.parsePokerConfig(tournament.poker_config);
            // Private tournament PIN check
            if (tournament.is_private && pinCode !== tournament.pin_code) {
                throw new Error('Incorrect PIN code');
            }
            // Check if player already joined — return success with existing entry so client can recover from timeout/retry
            const existing = await client.query(`SELECT id FROM tournament_entries
         WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)
           AND status NOT IN ('busted', 'completed')`, [tournamentId, normalized]);
            if (existing.rows.length > 0) {
                await client.query('COMMIT');
                const entryId = existing.rows[0].id;
                const tableResult = await this.pool.query('SELECT id FROM poker_tables WHERE tournament_id = $1 LIMIT 1', [tournamentId]);
                const tableId = tableResult.rows[0]?.id ?? null;
                logger_1.logger.info('Player already registered for poker tournament, returning existing entry', { tournamentId, playerAddress: normalized, entryId, tableId });
                return { entryId, autoStarted: !!tableId, tableId };
            }
            // Check if full
            const countRow = await client.query(`SELECT COUNT(*) AS c FROM tournament_entries
         WHERE tournament_id = $1 AND status NOT IN ('busted','completed')`, [tournamentId]);
            const registered = Number(countRow.rows[0].c);
            if (registered >= config.maxPlayers)
                throw new Error('Tournament is full');
            // Check player balance
            const balRow = await client.query(`SELECT balance FROM players WHERE LOWER(wallet_address) = LOWER($1) FOR UPDATE`, [normalized]);
            if (balRow.rows.length === 0)
                throw new Error('Player not found');
            const balance = this.parseBigInt(balRow.rows[0].balance);
            const buyIn = this.parseBigInt(tournament.buy_in_amount);
            if (balance < buyIn)
                throw new Error(`Insufficient balance for buy-in`);
            // Deduct buy-in
            await client.query(`UPDATE players SET balance = balance - $1::NUMERIC
         WHERE LOWER(wallet_address) = LOWER($2)`, [buyIn.toString(), normalized]);
            // Add to prize pool
            await client.query(`UPDATE tournaments SET prize_pool = prize_pool + $1::NUMERIC WHERE id = $2`, [buyIn.toString(), tournamentId]);
            // Create entry
            const entryRow = await client.query(`INSERT INTO tournament_entries (tournament_id, player_address, chips_remaining, highest_chip_count)
         VALUES ($1, $2, $3, $3) RETURNING id`, [tournamentId, normalized, config.startingStack]);
            const entryId = entryRow.rows[0].id;
            const newRegistered = registered + 1;
            // Only auto-start SNGs (no scheduled time) or if scheduled time has already passed
            const scheduledStart = tournament.scheduled_start_at ? new Date(tournament.scheduled_start_at) : null;
            const isScheduledInFuture = scheduledStart && scheduledStart > new Date();
            const shouldAutoStart = !isScheduledInFuture && newRegistered >= config.minPlayers;
            if (shouldAutoStart) {
                await client.query(`UPDATE tournaments SET status = 'active' WHERE id = $1`, [tournamentId]);
            }
            await client.query('COMMIT');
            logger_1.logger.info('Player joined poker tournament', { tournamentId, playerAddress: normalized, entryId, registered: newRegistered });
            if (shouldAutoStart) {
                const tableId = await this.activateTournament(tournamentId);
                return { entryId, autoStarted: true, tableId };
            }
            return { entryId, autoStarted: false, tableId: null };
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
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
    async activateTournament(tournamentId) {
        const tRow = await this.pool.query(`SELECT t.*, t.poker_config FROM tournaments t WHERE t.id = $1`, [tournamentId]);
        if (tRow.rows.length === 0)
            throw new Error('Tournament not found');
        const tournament = tRow.rows[0];
        const config = this.parsePokerConfig(tournament.poker_config);
        const firstLevel = this.computeBlindLevel(config.blindSchedule, 1);
        // Scale chip counts to wei units so the poker UI (which uses formatEther) displays them correctly
        const sbWei = (BigInt(firstLevel.smallBlind) * CHIP_SCALE).toString();
        const bbWei = (BigInt(firstLevel.bigBlind) * CHIP_SCALE).toString();
        const stackWei = (BigInt(config.startingStack) * CHIP_SCALE).toString();
        // Create dedicated tournament poker table
        const tableRow = await this.pool.query(`INSERT INTO poker_tables (small_blind, big_blind, max_seats, status, tournament_id, tournament_mode)
       VALUES ($1::NUMERIC, $2::NUMERIC, $3, 'waiting', $4, TRUE)
       RETURNING id`, [sbWei, bbWei, config.maxPlayers, tournamentId]);
        const tableId = tableRow.rows[0].id;
        // Get all registered entries (ordered by registration time for seat assignment)
        const entries = await this.pool.query(`SELECT id, player_address FROM tournament_entries
       WHERE tournament_id = $1 AND status = 'playing'
       ORDER BY bought_in_at ASC`, [tournamentId]);
        // Seat all players with virtual chips (scaled to wei)
        for (const entry of entries.rows) {
            await this.pokerGameService.joinTableTournament(tableId, entry.player_address, stackWei);
            // Record in bridge table
            await this.pool.query(`INSERT INTO poker_tournament_seats (tournament_id, entry_id, table_id, player_address)
         VALUES ($1, $2, $3, $4) ON CONFLICT (tournament_id, player_address) DO NOTHING`, [tournamentId, entry.id, tableId, entry.player_address.toLowerCase()]);
        }
        // Start first hand
        await this.pokerGameService.startHand(tableId);
        logger_1.logger.info('Poker tournament activated', { tournamentId, tableId, players: entries.rows.length });
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
     * 3. Advance blind level if needed
     * 4. Complete tournament if ≤1 active player remains
     */
    async syncAfterHand(tableId, handNumber) {
        // Get tournament for this table
        const tableRow = await this.pool.query(`SELECT tournament_id, small_blind, big_blind FROM poker_tables WHERE id = $1 AND tournament_mode = TRUE`, [tableId]);
        if (tableRow.rows.length === 0 || !tableRow.rows[0].tournament_id)
            return;
        const tournamentId = tableRow.rows[0].tournament_id;
        const tRow = await this.pool.query(`SELECT poker_config, status FROM tournaments WHERE id = $1`, [tournamentId]);
        if (tRow.rows.length === 0 || tRow.rows[0].status !== 'active')
            return;
        const config = this.parsePokerConfig(tRow.rows[0].poker_config);
        // Read current seat stacks
        const seats = await this.pool.query(`SELECT ps.player_address, ps.stack
       FROM poker_seats ps
       WHERE ps.table_id = $1`, [tableId]);
        // Sync chips for each player and collect busted players
        // Stacks are stored in wei; convert to chip units for tournament_entries (which track integer chips)
        const bustedAddresses = [];
        for (const seat of seats.rows) {
            const stackWei = (0, safe_bigint_1.toBigIntSafe)(seat.stack ?? 0);
            const stackChips = Number(stackWei / CHIP_SCALE);
            const addr = seat.player_address;
            await this.pool.query(`UPDATE tournament_entries
         SET chips_remaining = $1,
             highest_chip_count = GREATEST(highest_chip_count, $1),
             hands_played = hands_played + 1
         WHERE tournament_id = $2 AND LOWER(player_address) = LOWER($3) AND status = 'playing'`, [stackChips, tournamentId, addr]);
            if (stackWei === 0n)
                bustedAddresses.push(addr);
        }
        // Get bridge table entries for busted players to know their entry IDs
        let remainingAfterElim = seats.rows.length - bustedAddresses.length;
        for (const addr of bustedAddresses) {
            const pts = await this.pool.query(`SELECT pts.entry_id FROM poker_tournament_seats pts
         WHERE pts.tournament_id = $1 AND LOWER(pts.player_address) = LOWER($2)`, [tournamentId, addr]);
            if (pts.rows.length === 0)
                continue;
            const entryId = pts.rows[0].entry_id;
            // Determine current rank (players remaining + 1)
            const rank = remainingAfterElim + 1;
            // Mark entry as busted (skips checkAndDistributePrizes — we control completion)
            await this.pool.query(`UPDATE tournament_entries
         SET status = 'busted', chips_remaining = 0, finished_at = NOW(), final_rank = $2
         WHERE id = $1`, [entryId, rank]);
            // Mark in bridge table
            await this.pool.query(`UPDATE poker_tournament_seats SET eliminated_at = NOW(), final_rank = $2
         WHERE entry_id = $1`, [entryId, rank]);
            // Remove seat from poker table (no balance credit — tournament mode)
            await this.pokerGameService.leaveTableTournament(tableId, addr);
            logger_1.logger.info('Poker tournament player eliminated', { tournamentId, playerAddress: addr, rank, handNumber });
            this.broadcast(`poker_tournament:${tournamentId}`, 'poker_tournament_player_eliminated', {
                tournamentId,
                playerAddress: addr,
                finalRank: rank,
                handNumber,
            });
        }
        // Advance blind level if needed
        // Stored blinds are in wei (chip * 10^18); convert back to chip units for level comparison
        const newLevel = this.computeBlindLevel(config.blindSchedule, handNumber);
        const currentSBChips = Math.round(Number((0, safe_bigint_1.toBigIntSafe)(tableRow.rows[0].small_blind) / CHIP_SCALE));
        if (newLevel.smallBlind !== currentSBChips) {
            const newSBWei = (BigInt(newLevel.smallBlind) * CHIP_SCALE).toString();
            const newBBWei = (BigInt(newLevel.bigBlind) * CHIP_SCALE).toString();
            await this.pool.query(`UPDATE poker_tables SET small_blind = $2::NUMERIC, big_blind = $3::NUMERIC WHERE id = $1`, [tableId, newSBWei, newBBWei]);
            this.broadcast(`poker_tournament:${tournamentId}`, 'poker_tournament_blind_level_up', {
                tournamentId,
                tableId,
                newLevel: newLevel.level,
                smallBlind: newLevel.smallBlind,
                bigBlind: newLevel.bigBlind,
                handNumber,
            });
            logger_1.logger.info('Poker tournament blind level up', { tournamentId, tableId, newLevel: newLevel.level });
        }
        // Check if tournament is over (≤1 active player)
        const activePlayers = await this.pool.query(`SELECT COUNT(*) AS c FROM tournament_entries WHERE tournament_id = $1 AND status = 'playing'`, [tournamentId]);
        const activeCount = Number(activePlayers.rows[0].c);
        if (activeCount <= 1) {
            await this.completeTournament(tournamentId, tableId);
        }
    }
    // ---------------------------------------------------------------------------
    // Complete
    // ---------------------------------------------------------------------------
    async completeTournament(tournamentId, tableId) {
        // Find the winner (last remaining 'playing' entry)
        const winnerRow = await this.pool.query(`SELECT id, player_address FROM tournament_entries
       WHERE tournament_id = $1 AND status = 'playing'
       LIMIT 1`, [tournamentId]);
        if (winnerRow.rows.length > 0) {
            const winnerId = winnerRow.rows[0].id;
            await this.pool.query(`UPDATE tournament_entries
         SET status = 'completed', finished_at = NOW(), final_rank = 1
         WHERE id = $1`, [winnerId]);
            await this.pool.query(`UPDATE poker_tournament_seats SET final_rank = 1
         WHERE entry_id = $1`, [winnerId]);
        }
        // Distribute prizes (uses existing tournament service logic)
        let prizeDistributions = [];
        try {
            const results = await this.tournamentService.distributePrizes(tournamentId);
            prizeDistributions = results.map((r) => ({
                player_address: r.player_address,
                final_rank: r.final_rank,
                prize_amount: r.prize_amount,
            }));
        }
        catch (err) {
            logger_1.logger.error('Poker tournament prize distribution failed', { tournamentId, err });
        }
        // Clean up the poker table
        const resolvedTableId = tableId ?? await this.getTableIdForTournament(tournamentId);
        if (resolvedTableId) {
            try {
                await this.pokerGameService.deleteTableTournament(resolvedTableId);
            }
            catch (err) {
                logger_1.logger.warn('Failed to delete tournament poker table', { resolvedTableId, err });
            }
        }
        logger_1.logger.info('Poker tournament completed', { tournamentId, winners: prizeDistributions });
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
    async cancelPokerTournament(tournamentId, callerAddress) {
        const normalized = this.normalizeAddress(callerAddress);
        const tRow = await this.pool.query(`SELECT creator_address, status, buy_in_amount FROM tournaments WHERE id = $1 AND game_type = 'poker'`, [tournamentId]);
        if (tRow.rows.length === 0)
            throw new Error('Poker tournament not found');
        const t = tRow.rows[0];
        if (t.status !== 'registration')
            throw new Error('Can only cancel tournaments in registration status');
        if (t.creator_address?.toLowerCase() !== normalized)
            throw new Error('Only the creator can cancel this tournament');
        const buyIn = this.parseBigInt(t.buy_in_amount);
        // Refund all entries
        const entries = await this.pool.query(`SELECT id, player_address FROM tournament_entries
       WHERE tournament_id = $1 AND status = 'playing'`, [tournamentId]);
        for (const entry of entries.rows) {
            await this.pool.query(`UPDATE players SET balance = balance + $1::NUMERIC WHERE LOWER(wallet_address) = LOWER($2)`, [buyIn.toString(), entry.player_address]);
            await this.pool.query(`UPDATE tournament_entries SET status = 'busted', finished_at = NOW() WHERE id = $1`, [entry.id]);
        }
        await this.pool.query(`UPDATE tournaments SET status = 'cancelled', ended_at = NOW(), prize_pool = 0 WHERE id = $1`, [tournamentId]);
        logger_1.logger.info('Poker tournament cancelled', { tournamentId, caller: normalized, refunded: entries.rows.length });
        this.broadcast(`poker_tournament:${tournamentId}`, 'poker_tournament_cancelled', { tournamentId });
    }
    // ---------------------------------------------------------------------------
    // Read methods
    // ---------------------------------------------------------------------------
    async listPokerTournaments(playerAddress) {
        const normalized = playerAddress ? this.normalizeAddress(playerAddress) : null;
        const result = await this.pool.query(`SELECT r.*,
         CASE WHEN $1::text IS NOT NULL AND EXISTS (
           SELECT 1 FROM tournament_entries te
           WHERE te.tournament_id = r.tournament_id
             AND LOWER(te.player_address) = $1::text
             AND te.status NOT IN ('busted', 'completed')
         ) THEN TRUE ELSE FALSE END AS is_registered
       FROM poker_tournament_registrations r
       ORDER BY
         CASE WHEN r.scheduled_start_at IS NOT NULL THEN r.scheduled_start_at ELSE r.created_at END ASC`, [normalized]);
        return result.rows.map((r) => ({
            tournamentId: r.tournament_id,
            name: r.name,
            status: r.status,
            buyInAmount: r.buy_in_amount?.toString() ?? '0',
            startingStack: Number(r.starting_chips ?? 5000),
            registeredCount: Number(r.registered_count ?? 0),
            maxPlayers: Number(r.max_players ?? 6),
            minPlayers: Number(r.min_players ?? 2),
            prizePool: r.prize_pool?.toString() ?? '0',
            tableId: r.table_id ?? null,
            createdAt: r.created_at?.toISOString() ?? '',
            creatorAddress: r.creator_address ?? null,
            prizeDistributionType: r.prize_distribution_type ?? 'winner_takes_all',
            scheduledStartAt: r.scheduled_start_at ? new Date(r.scheduled_start_at).toISOString() : null,
            isRegistered: r.is_registered === true,
        }));
    }
    async getTournamentState(tournamentId) {
        const tRow = await this.pool.query(`SELECT t.*, pt.id AS table_id, pt.hand_number, pt.small_blind, pt.big_blind
       FROM tournaments t
       LEFT JOIN poker_tables pt ON pt.tournament_id = t.id
       WHERE t.id = $1 AND t.game_type = 'poker'`, [tournamentId]);
        if (tRow.rows.length === 0)
            return null;
        const t = tRow.rows[0];
        const config = this.parsePokerConfig(t.poker_config);
        const handNumber = Number(t.hand_number ?? 0);
        const currentLevel = this.computeBlindLevel(config.blindSchedule, handNumber);
        const entries = await this.pool.query(`SELECT player_address, chips_remaining, status, final_rank, prize_won
       FROM tournament_entries WHERE tournament_id = $1
       ORDER BY final_rank ASC NULLS LAST, chips_remaining DESC`, [tournamentId]);
        return {
            tournamentId,
            name: t.name,
            status: t.status,
            tableId: t.table_id ?? null,
            blindLevel: currentLevel.level,
            smallBlind: Number(t.small_blind ?? currentLevel.smallBlind),
            bigBlind: Number(t.big_blind ?? currentLevel.bigBlind),
            handNumber,
            players: entries.rows.map((e) => ({
                playerAddress: e.player_address,
                entryId: '', // populated if needed
                chipsRemaining: Number(e.chips_remaining ?? 0),
                status: e.status,
                finalRank: e.final_rank ?? null,
                prizeWon: (e.prize_won ?? '0').toString(),
            })),
            prizePool: t.prize_pool?.toString() ?? '0',
            buyInAmount: t.buy_in_amount?.toString() ?? '0',
            prizeDistributionType: t.prize_distribution_type ?? 'winner_takes_all',
        };
    }
    async getPlayerEntryStatus(tournamentId, playerAddress) {
        const normalized = this.normalizeAddress(playerAddress);
        const row = await this.pool.query(`SELECT id, player_address, chips_remaining, status, final_rank, prize_won
       FROM tournament_entries
       WHERE tournament_id = $1 AND LOWER(player_address) = LOWER($2)
       LIMIT 1`, [tournamentId, normalized]);
        if (row.rows.length === 0)
            return null;
        const e = row.rows[0];
        return {
            playerAddress: e.player_address,
            entryId: e.id,
            chipsRemaining: Number(e.chips_remaining ?? 0),
            status: e.status,
            finalRank: e.final_rank ?? null,
            prizeWon: (e.prize_won ?? '0').toString(),
        };
    }
    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------
    async getTableIdForTournament(tournamentId) {
        const r = await this.pool.query(`SELECT id FROM poker_tables WHERE tournament_id = $1 LIMIT 1`, [tournamentId]);
        return r.rows[0]?.id ?? null;
    }
}
exports.PokerTournamentService = PokerTournamentService;
// ---------------------------------------------------------------------------
// Prize percentage helpers (mirrors tournament.service.ts)
// ---------------------------------------------------------------------------
function getPrizePercentagesForType(type) {
    switch (type) {
        case 'winner_takes_all': return [100];
        case 'top_3': return [60, 30, 10];
        case 'top_3_steep': return [70, 20, 10];
        case 'top_5': return [50, 25, 15, 6, 4];
        case 'top_10': return [56, 20, 10, 2, 2, 2, 2, 2, 2, 2];
        default: return [100];
    }
}
//# sourceMappingURL=poker-tournament.service.js.map