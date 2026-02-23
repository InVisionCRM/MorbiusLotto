"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PokerGameService = void 0;
const poker_hand_eval_1 = require("./poker-hand-eval");
const logger_1 = require("../utils/logger");
const crypto_1 = __importDefault(require("crypto"));
const STREETS = ['preflop', 'flop', 'turn', 'river', 'showdown'];
class PokerGameService {
    dbService;
    pfService;
    constructor(dbService, pfService) {
        this.dbService = dbService;
        this.pfService = pfService;
    }
    getPool() {
        return this.dbService.getPool();
    }
    normalizeAddress(addr) {
        return (addr || '').trim().toLowerCase();
    }
    async listTables() {
        const pool = this.getPool();
        const result = await pool.query(`SELECT t.id, t.small_blind, t.big_blind, t.max_seats, t.status,
              COUNT(s.id) FILTER (WHERE s.player_address IS NOT NULL) AS seated_count
       FROM poker_tables t
       LEFT JOIN poker_seats s ON s.table_id = t.id
       WHERE t.status IN ('waiting', 'playing')
       GROUP BY t.id ORDER BY t.created_at ASC`);
        return result.rows.map((r) => ({
            id: r.id,
            smallBlind: r.small_blind?.toString() ?? '0',
            bigBlind: r.big_blind?.toString() ?? '0',
            maxSeats: Number(r.max_seats) || 6,
            status: r.status,
            seatedCount: Number(r.seated_count) || 0,
            emptySeats: Math.max(0, (Number(r.max_seats) || 6) - (Number(r.seated_count) || 0)),
        }));
    }
    async getTable(tableId) {
        const pool = this.getPool();
        const r = await pool.query('SELECT id, small_blind, big_blind, max_seats, status FROM poker_tables WHERE id = $1', [tableId]);
        if (r.rows.length === 0)
            return null;
        const row = r.rows[0];
        return {
            id: row.id,
            smallBlind: row.small_blind?.toString() ?? '0',
            bigBlind: row.big_blind?.toString() ?? '0',
            maxSeats: Number(row.max_seats) || 6,
            status: row.status,
        };
    }
    async createTable(smallBlind, bigBlind, maxSeats) {
        const pool = this.getPool();
        const r = await pool.query(`INSERT INTO poker_tables (small_blind, big_blind, max_seats, status)
       VALUES ($1::NUMERIC, $2::NUMERIC, $3, 'waiting')
       RETURNING id`, [smallBlind.toString(), bigBlind.toString(), maxSeats]);
        return r.rows[0].id;
    }
    /**
     * Join a table: deduct buyIn from balance, add seat with stack = buyIn.
     */
    async joinTable(tableId, playerAddress, buyInChips) {
        const normalized = this.normalizeAddress(playerAddress);
        const buyIn = BigInt(buyInChips);
        if (buyIn <= 0n)
            throw new Error('Buy-in must be positive');
        const pool = this.getPool();
        const tableResult = await pool.query('SELECT id, small_blind, big_blind, max_seats FROM poker_tables WHERE id = $1', [tableId]);
        if (tableResult.rows.length === 0)
            throw new Error('Table not found');
        const table = tableResult.rows[0];
        const maxSeats = Number(table.max_seats) || 6;
        const existing = await pool.query('SELECT id FROM poker_seats WHERE table_id = $1 AND player_address = $2', [tableId, normalized]);
        if (existing.rows.length > 0)
            throw new Error('Already seated at this table');
        const seatCount = await pool.query('SELECT COUNT(*) AS c FROM poker_seats WHERE table_id = $1', [tableId]);
        const count = Number(seatCount.rows[0].c);
        if (count >= maxSeats)
            throw new Error('Table is full');
        await this.dbService.deductPlayerBalance(playerAddress, buyIn);
        const positions = await pool.query('SELECT position FROM poker_seats WHERE table_id = $1', [tableId]);
        const used = new Set(positions.rows.map((r) => r.position));
        let position = 0;
        while (used.has(position))
            position++;
        await pool.query(`INSERT INTO poker_seats (table_id, position, player_address, stack, status)
       VALUES ($1, $2, $3, $4::NUMERIC, 'active')`, [tableId, position, normalized, buyIn.toString()]);
        logger_1.logger.info('Poker join', { tableId, playerAddress: normalized, buyIn: buyIn.toString(), position });
        const tableRow = await pool.query('SELECT small_blind, big_blind, max_seats FROM poker_tables WHERE id = $1', [tableId]);
        const t = tableRow.rows[0];
        await this.tryStartNextHand(pool, tableId, t, Number(t.max_seats) || 6);
        return this.getTableState(tableId, normalized);
    }
    /**
     * Leave table: credit stack back to balance, remove seat.
     */
    async leaveTable(tableId, playerAddress) {
        const normalized = this.normalizeAddress(playerAddress);
        const pool = this.getPool();
        const seatResult = await pool.query('SELECT id, stack FROM poker_seats WHERE table_id = $1 AND player_address = $2', [tableId, normalized]);
        if (seatResult.rows.length === 0)
            throw new Error('Not seated at this table');
        const stack = BigInt(seatResult.rows[0].stack || '0');
        await pool.query('DELETE FROM poker_seats WHERE table_id = $1 AND player_address = $2', [tableId, normalized]);
        if (stack > 0n) {
            await this.dbService.addBalanceToAddress(playerAddress, stack);
        }
        logger_1.logger.info('Poker leave', { tableId, playerAddress: normalized, stack: stack.toString() });
        return this.getTableState(tableId, null);
    }
    /**
     * Get full table state. Hole cards only for forPlayerAddress.
     */
    async getTableState(tableId, forPlayerAddress) {
        const pool = this.getPool();
        const forPlayer = forPlayerAddress ? this.normalizeAddress(forPlayerAddress) : null;
        const tableRow = await pool.query('SELECT id, small_blind, big_blind, max_seats, status, hand_number, button_position FROM poker_tables WHERE id = $1', [tableId]);
        if (tableRow.rows.length === 0)
            throw new Error('Table not found');
        const tbl = tableRow.rows[0];
        const maxSeats = Number(tbl.max_seats) || 6;
        const seatsResult = await pool.query('SELECT position, player_address, stack, status FROM poker_seats WHERE table_id = $1 ORDER BY position', [tableId]);
        const seatMap = new Map();
        for (const r of seatsResult.rows) {
            seatMap.set(r.position, {
                playerAddress: r.player_address,
                stack: r.stack?.toString() ?? '0',
                status: r.status,
            });
        }
        const seats = [];
        for (let pos = 0; pos < maxSeats; pos++) {
            const s = seatMap.get(pos);
            seats.push({
                position: pos,
                playerAddress: s?.playerAddress ?? null,
                stack: s?.stack ?? '0',
                status: s?.status ?? 'empty',
                isDealer: false,
                isSmallBlind: false,
                isBigBlind: false,
                isActing: false,
                folded: false,
                currentBet: '0',
            });
        }
        let currentHand = null;
        let myHoleCards = null;
        const handRow = await pool.query(`SELECT id, hand_number, button_position, community_cards, pot_amount, street, acting_position
       FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL ORDER BY created_at DESC LIMIT 1`, [tableId]);
        if (handRow.rows.length > 0) {
            const h = handRow.rows[0];
            const buttonPosition = Number(h.button_position);
            const communityCards = Array.isArray(h.community_cards) ? h.community_cards : (h.community_cards ? JSON.parse(JSON.stringify(h.community_cards)) : []);
            const actionsResult = await pool.query(`SELECT player_address, street, action, amount, "order" FROM poker_hand_actions WHERE hand_id = $1 ORDER BY "order"`, [h.id]);
            const lastActionRow = actionsResult.rows.length > 0 ? actionsResult.rows[actionsResult.rows.length - 1] : null;
            const actingPosition = h.acting_position != null ? Number(h.acting_position) : null;
            const currentBetResult = await pool.query(`SELECT player_address, amount FROM poker_hand_actions WHERE hand_id = $1 AND action IN ('bet', 'raise', 'call') ORDER BY "order" DESC LIMIT 1`, [h.id]);
            let minRaise = tbl.big_blind?.toString() ?? '0';
            if (currentBetResult.rows.length > 0) {
                const lastBet = BigInt(currentBetResult.rows[0].amount || '0');
                minRaise = (lastBet + lastBet).toString();
            }
            const foldResult = await pool.query(`SELECT player_address FROM poker_hand_actions WHERE hand_id = $1 AND action = 'fold'`, [h.id]);
            const foldedSet = new Set(foldResult.rows.map((r) => r.player_address));
            for (const seat of seats) {
                if (!seat.playerAddress)
                    continue;
                const pos = seat.position;
                seat.isDealer = pos === buttonPosition;
                seat.isSmallBlind = pos === (buttonPosition + 1) % maxSeats && seatMap.has((buttonPosition + 1) % maxSeats);
                seat.isBigBlind = pos === (buttonPosition + 2) % maxSeats && seatMap.has((buttonPosition + 2) % maxSeats);
                seat.folded = foldedSet.has(seat.playerAddress);
                seat.isActing = actingPosition === pos;
            }
            const sbPos = (buttonPosition + 1) % maxSeats;
            const bbPos = (buttonPosition + 2) % maxSeats;
            if (seatMap.has(sbPos))
                seats[sbPos].isSmallBlind = true;
            if (seatMap.has(bbPos))
                seats[bbPos].isBigBlind = true;
            let lastAction = null;
            if (lastActionRow) {
                const pos = seats.findIndex((s) => s.playerAddress === lastActionRow.player_address);
                if (pos >= 0) {
                    lastAction = {
                        position: pos,
                        action: lastActionRow.action,
                        amount: lastActionRow.amount?.toString() ?? '0',
                    };
                }
            }
            let toCall = '0';
            if (actingPosition != null) {
                toCall = (await this.getCurrentBetToCall(pool, h.id, h.street, actingPosition, maxSeats)).toString();
            }
            currentHand = {
                handId: h.id,
                street: h.street,
                communityCards,
                pot: h.pot_amount?.toString() ?? '0',
                actingPosition,
                lastAction,
                minRaise,
                toCall,
            };
            if (forPlayer) {
                const holeResult = await pool.query('SELECT cards FROM poker_hand_hole_cards WHERE hand_id = $1 AND player_address = $2', [h.id, forPlayer]);
                if (holeResult.rows.length > 0 && holeResult.rows[0].cards) {
                    myHoleCards = Array.isArray(holeResult.rows[0].cards) ? holeResult.rows[0].cards : JSON.parse(holeResult.rows[0].cards);
                }
            }
        }
        return {
            tableId: tbl.id,
            smallBlind: tbl.small_blind?.toString() ?? '0',
            bigBlind: tbl.big_blind?.toString() ?? '0',
            maxSeats,
            status: tbl.status,
            seats,
            currentHand,
            myHoleCards,
        };
    }
    /**
     * Player action: fold, check, call, bet, raise.
     */
    async playerAction(tableId, handId, playerAddress, action, amount) {
        const normalized = this.normalizeAddress(playerAddress);
        const pool = this.getPool();
        const handRow = await pool.query('SELECT * FROM poker_hands WHERE id = $1 AND table_id = $2 AND completed_at IS NULL', [handId, tableId]);
        if (handRow.rows.length === 0)
            throw new Error('Hand not found or already completed');
        const hand = handRow.rows[0];
        const tableRow = await pool.query('SELECT small_blind, big_blind, max_seats FROM poker_tables WHERE id = $1', [tableId]);
        const table = tableRow.rows[0];
        const sb = BigInt(table.small_blind);
        const bb = BigInt(table.big_blind);
        const maxSeats = Number(table.max_seats) || 6;
        const actingPosition = hand.acting_position;
        if (actingPosition == null)
            throw new Error('No acting player');
        const seatsAtTable = await pool.query('SELECT position, player_address, stack FROM poker_seats WHERE table_id = $1 ORDER BY position', [tableId]);
        const actingAddress = seatsAtTable.rows.find((r) => r.position === actingPosition)?.player_address;
        if (actingAddress !== normalized)
            throw new Error('Not your turn');
        const orderResult = await pool.query('SELECT COALESCE(MAX("order"), 0) + 1 AS next_order FROM poker_hand_actions WHERE hand_id = $1', [handId]);
        const nextOrder = Number(orderResult.rows[0].next_order);
        const potAmount = BigInt(hand.pot_amount ?? '0');
        const street = hand.street;
        if (action === 'fold') {
            await pool.query(`INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order") VALUES ($1, $2, $3, 'fold', 0, $4)`, [handId, normalized, street, nextOrder]);
            await this.advanceOrShowdown(pool, tableId, handId, hand, table, maxSeats);
            return this.getTableState(tableId, normalized);
        }
        if (action === 'check') {
            const toCall = await this.getCurrentBetToCall(pool, handId, street, actingPosition, maxSeats);
            if (toCall > 0n)
                throw new Error('Cannot check when there is a bet to call');
            await pool.query(`INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order") VALUES ($1, $2, $3, 'check', 0, $4)`, [handId, normalized, street, nextOrder]);
            await this.advanceOrShowdown(pool, tableId, handId, hand, table, maxSeats);
            return this.getTableState(tableId, normalized);
        }
        const amt = action === 'call' || action === 'bet' || action === 'raise' ? BigInt(amount ?? '0') : 0n;
        if (action === 'call') {
            const toCall = await this.getCurrentBetToCall(pool, handId, street, actingPosition, maxSeats);
            const actualCall = toCall;
            const seatRow = await pool.query('SELECT stack FROM poker_seats WHERE table_id = $1 AND player_address = $2', [tableId, normalized]);
            const stack = BigInt(seatRow.rows[0].stack);
            const deduct = actualCall > stack ? stack : actualCall;
            await pool.query(`UPDATE poker_seats SET stack = stack - $3::NUMERIC WHERE table_id = $1 AND player_address = $2`, [tableId, normalized, deduct.toString()]);
            await pool.query(`UPDATE poker_hands SET pot_amount = pot_amount + $2::NUMERIC WHERE id = $1`, [handId, deduct.toString()]);
            await pool.query(`INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order") VALUES ($1, $2, $3, 'call', $4::NUMERIC, $5)`, [handId, normalized, street, deduct.toString(), nextOrder]);
            await this.advanceOrShowdown(pool, tableId, handId, hand, table, maxSeats);
            return this.getTableState(tableId, normalized);
        }
        if (action === 'bet' || action === 'raise') {
            const seatRow = await pool.query('SELECT stack FROM poker_seats WHERE table_id = $1 AND player_address = $2', [tableId, normalized]);
            const stack = BigInt(seatRow.rows[0].stack);
            const minRaise = await this.getMinRaise(pool, handId, street);
            if (amt < minRaise && amt < stack)
                throw new Error(`Minimum bet/raise is ${minRaise}`);
            const deduct = amt > stack ? stack : amt;
            await pool.query(`UPDATE poker_seats SET stack = stack - $3::NUMERIC WHERE table_id = $1 AND player_address = $2`, [tableId, normalized, deduct.toString()]);
            await pool.query(`UPDATE poker_hands SET pot_amount = pot_amount + $2::NUMERIC WHERE id = $1`, [handId, deduct.toString()]);
            await pool.query(`INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order") VALUES ($1, $2, $3, $4, $5::NUMERIC, $6)`, [handId, normalized, street, action, deduct.toString(), nextOrder]);
            await this.advanceOrShowdown(pool, tableId, handId, hand, table, maxSeats);
            return this.getTableState(tableId, normalized);
        }
        throw new Error('Invalid action');
    }
    async getCurrentBetToCall(pool, handId, street, actingPosition, maxSeats) {
        const r = await pool.query(`SELECT player_address, SUM(amount) AS total FROM poker_hand_actions WHERE hand_id = $1 AND street = $2 AND action IN ('bet', 'raise', 'call') GROUP BY player_address`, [handId, street]);
        let maxBet = 0n;
        for (const row of r.rows) {
            const t = BigInt(row.total ?? '0');
            if (t > maxBet)
                maxBet = t;
        }
        const actingAddr = await this.getPlayerAtPosition(pool, handId, actingPosition);
        const myBet = r.rows.find((x) => x.player_address === actingAddr);
        const myTotal = myBet ? BigInt(myBet.total ?? '0') : 0n;
        return maxBet > myTotal ? maxBet - myTotal : 0n;
    }
    async getPlayerAtPosition(pool, handId, position) {
        const tableIdResult = await pool.query('SELECT table_id FROM poker_hands WHERE id = $1', [handId]);
        if (tableIdResult.rows.length === 0)
            return null;
        const tableId = tableIdResult.rows[0].table_id;
        const r = await pool.query('SELECT player_address FROM poker_seats WHERE table_id = $1 AND position = $2', [tableId, position]);
        return r.rows[0]?.player_address ?? null;
    }
    async getMinRaise(pool, handId, street) {
        const r = await pool.query(`SELECT amount FROM poker_hand_actions WHERE hand_id = $1 AND street = $2 AND action IN ('bet', 'raise') ORDER BY "order" DESC LIMIT 1`, [handId, street]);
        const bigBlindResult = await pool.query('SELECT t.big_blind FROM poker_hands h JOIN poker_tables t ON t.id = h.table_id WHERE h.id = $1', [handId]);
        const bb = BigInt(bigBlindResult.rows[0]?.big_blind ?? '0');
        if (r.rows.length === 0)
            return bb;
        const lastRaise = BigInt(r.rows[0].amount);
        return lastRaise >= bb ? lastRaise : bb;
    }
    async advanceOrShowdown(pool, tableId, handId, hand, table, maxSeats) {
        const street = hand.street;
        const buttonPosition = Number(hand.button_position);
        const actingPosition = hand.acting_position;
        const foldResult = await pool.query('SELECT player_address FROM poker_hand_actions WHERE hand_id = $1 AND action = $2', [handId, 'fold']);
        const foldedSet = new Set(foldResult.rows.map((r) => r.player_address));
        const seatsResult = await pool.query('SELECT position, player_address FROM poker_seats WHERE table_id = $1 ORDER BY position', [tableId]);
        const stillIn = seatsResult.rows.filter((r) => !foldedSet.has(r.player_address));
        if (stillIn.length <= 1) {
            const winner = stillIn[0];
            if (winner) {
                const pot = BigInt(hand.pot_amount ?? '0');
                await pool.query(`UPDATE poker_seats SET stack = stack + $3::NUMERIC WHERE table_id = $1 AND player_address = $2`, [tableId, winner.player_address, pot.toString()]);
            }
            const resultJson = stillIn.length
                ? JSON.stringify({ winners: [{ address: stillIn[0].player_address, amount: hand.pot_amount }] })
                : '{}';
            await pool.query(`UPDATE poker_hands SET completed_at = NOW(), street = 'showdown', acting_position = NULL, result = $2 WHERE id = $1`, [handId, resultJson]);
            await pool.query('UPDATE poker_tables SET status = $2 WHERE id = $1', [tableId, 'waiting']);
            await this.tryStartNextHand(pool, tableId, table, maxSeats);
            return;
        }
        const nextPos = this.nextActivePosition(actingPosition, foldedSet, seatsResult.rows, maxSeats);
        const allCalled = await this.haveAllActedThisStreet(pool, handId, street, foldedSet, seatsResult.rows);
        const holeCountResult = await pool.query('SELECT COUNT(*) AS c FROM poker_hand_hole_cards WHERE hand_id = $1', [handId]);
        const numPlayersInHand = Number(holeCountResult.rows[0]?.c ?? 0);
        const boardStartIndex = numPlayersInHand * 2;
        if (street === 'preflop' && allCalled) {
            const nextStreet = 'flop';
            const deck = await this.getDeckForHand(pool, hand);
            const communityCards = deck.slice(boardStartIndex, boardStartIndex + 3);
            const firstActing = this.firstActivePosition(buttonPosition, nextStreet, foldedSet, seatsResult.rows, maxSeats);
            await pool.query(`UPDATE poker_hands SET street = $2, community_cards = $3::JSONB, acting_position = $4 WHERE id = $1`, [handId, nextStreet, JSON.stringify(communityCards), firstActing]);
            return;
        }
        if (allCalled && street !== 'preflop') {
            const nextStreet = STREETS[STREETS.indexOf(street) + 1];
            if (nextStreet === 'showdown') {
                await this.runShowdown(pool, tableId, handId, hand, table, maxSeats);
                return;
            }
            const deck = await this.getDeckForHand(pool, hand);
            const currentLen = Array.isArray(hand.community_cards) ? hand.community_cards.length : 0;
            const nextLen = nextStreet === 'flop' ? 3 : nextStreet === 'turn' ? 4 : 5;
            const communityCards = deck.slice(boardStartIndex, boardStartIndex + nextLen);
            await pool.query(`UPDATE poker_hands SET street = $2, community_cards = $3::JSONB, acting_position = $4 WHERE id = $1`, [handId, nextStreet, JSON.stringify(communityCards), this.firstActivePosition(buttonPosition, nextStreet, foldedSet, seatsResult.rows, maxSeats)]);
            return;
        }
        await pool.query('UPDATE poker_hands SET acting_position = $2 WHERE id = $1', [handId, nextPos]);
        await this.broadcastState(tableId);
    }
    firstActivePosition(buttonPosition, street, foldedSet, seats, maxSeats) {
        const start = street === 'preflop' ? (buttonPosition + 3) % maxSeats : (buttonPosition + 1) % maxSeats;
        for (let i = 0; i < maxSeats; i++) {
            const pos = (start + i) % maxSeats;
            const addr = seats.find((s) => s.position === pos)?.player_address;
            if (addr && !foldedSet.has(addr))
                return pos;
        }
        return start;
    }
    nextActiveSeatPosition(fromPosition, seats, maxSeats) {
        const positions = new Set(seats.map((s) => s.position));
        for (let i = 1; i <= maxSeats; i++) {
            const pos = (fromPosition + i) % maxSeats;
            if (positions.has(pos))
                return pos;
        }
        return fromPosition;
    }
    nextActivePosition(current, foldedSet, seats, maxSeats) {
        for (let i = 1; i <= maxSeats; i++) {
            const pos = (current + i) % maxSeats;
            const addr = seats.find((s) => s.position === pos)?.player_address;
            if (addr && !foldedSet.has(addr))
                return pos;
        }
        return current;
    }
    async haveAllActedThisStreet(pool, handId, street, foldedSet, seats) {
        const acted = await pool.query(`SELECT DISTINCT player_address FROM poker_hand_actions WHERE hand_id = $1 AND street = $2`, [handId, street]);
        const actedSet = new Set(acted.rows.map((r) => r.player_address));
        const inHand = seats.filter((s) => s.player_address && !foldedSet.has(s.player_address));
        return inHand.every((s) => actedSet.has(s.player_address));
    }
    async getDeckForHand(pool, hand) {
        const serverSeed = hand.server_seed;
        const clientSeed = hand.client_seed ?? 'default';
        const nonce = Number(hand.hand_number ?? 0);
        return this.pfService.fisherYatesShuffle(serverSeed, clientSeed, nonce);
    }
    async runShowdown(pool, tableId, handId, hand, table, maxSeats) {
        const communityCards = Array.isArray(hand.community_cards) ? hand.community_cards : [];
        const holeResult = await pool.query('SELECT player_address, cards FROM poker_hand_hole_cards WHERE hand_id = $1', [handId]);
        const pot = BigInt(hand.pot_amount ?? '0');
        const hands = [];
        const addresses = [];
        for (const row of holeResult.rows) {
            const cards = Array.isArray(row.cards) ? row.cards : JSON.parse(row.cards || '[]');
            const full = [...cards, ...communityCards];
            if (full.length >= 5) {
                hands.push(full);
                addresses.push(row.player_address);
            }
        }
        const winnerIndices = (0, poker_hand_eval_1.winners)(hands);
        const winAmount = pot / BigInt(winnerIndices.length);
        const remainder = pot - winAmount * BigInt(winnerIndices.length);
        const resultWinners = [];
        for (let i = 0; i < winnerIndices.length; i++) {
            const addr = addresses[winnerIndices[i]];
            const amt = winAmount + (i < remainder ? 1n : 0n);
            await pool.query(`UPDATE poker_seats SET stack = stack + $3::NUMERIC WHERE table_id = $1 AND player_address = $2`, [tableId, addr, amt.toString()]);
            resultWinners.push({ address: addr, amount: amt.toString() });
        }
        await pool.query(`UPDATE poker_hands SET completed_at = NOW(), street = 'showdown', acting_position = NULL, result = $2 WHERE id = $1`, [handId, JSON.stringify({ winners: resultWinners })]);
        await pool.query('UPDATE poker_tables SET status = $2 WHERE id = $1', [tableId, 'waiting']);
        await this.tryStartNextHand(pool, tableId, table, maxSeats);
    }
    async tryStartNextHand(pool, tableId, table, maxSeats) {
        const activeHand = await pool.query('SELECT id FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL LIMIT 1', [tableId]);
        if (activeHand.rows.length > 0)
            return;
        const seatsResult = await pool.query('SELECT position, player_address, stack FROM poker_seats WHERE table_id = $1', [tableId]);
        const active = seatsResult.rows.filter((r) => BigInt(r.stack) > 0n);
        if (active.length < 2)
            return;
        await this.startHand(tableId);
    }
    broadcastState(_tableId) {
        // Called after state change; actual broadcast is done by WebSocket layer when it receives the returned state.
    }
    /**
     * Start a new hand. Requires 2+ players with stack > 0.
     * Deal order (provably fair): hole1 P0, hole2 P0, hole1 P1, hole2 P1, ... then flop 3, turn 1, river 1.
     */
    async startHand(tableId) {
        const pool = this.getPool();
        const tableResult = await pool.query('SELECT id, small_blind, big_blind, max_seats, hand_number, button_position FROM poker_tables WHERE id = $1', [tableId]);
        if (tableResult.rows.length === 0)
            throw new Error('Table not found');
        const table = tableResult.rows[0];
        const maxSeats = Number(table.max_seats) || 6;
        const sb = BigInt(table.small_blind);
        const bb = BigInt(table.big_blind);
        const seatsResult = await pool.query('SELECT position, player_address, stack FROM poker_seats WHERE table_id = $1 ORDER BY position', [tableId]);
        const withStack = seatsResult.rows.filter((r) => BigInt(r.stack) > 0n);
        if (withStack.length < 2)
            return null;
        const handNumber = Number(table.hand_number) + 1;
        const lastButton = Number(table.button_position);
        const buttonSeatPos = this.nextActiveSeatPosition(lastButton, seatsResult.rows, maxSeats);
        const serverSeed = crypto_1.default.randomBytes(32).toString('hex');
        const serverSeedHash = this.pfService.createServerSeedHash(serverSeed);
        const clientSeed = crypto_1.default.randomBytes(16).toString('hex');
        const deck = this.pfService.fisherYatesShuffle(serverSeed, clientSeed, handNumber);
        let deckIndex = 0;
        const firstToAct = this.nextActiveSeatPosition((buttonSeatPos + 2) % maxSeats, seatsResult.rows, maxSeats);
        const handInsert = await pool.query(`INSERT INTO poker_hands (table_id, hand_number, button_position, server_seed_hash, server_seed, client_seed, community_cards, pot_amount, street, acting_position)
       VALUES ($1, $2, $3, $4, $5, $6, '[]', 0, 'preflop', $7) RETURNING id`, [tableId, handNumber, buttonSeatPos, serverSeedHash, serverSeed, clientSeed, firstToAct]);
        const handId = handInsert.rows[0].id;
        for (const seat of withStack) {
            const hole1 = deck[deckIndex++];
            const hole2 = deck[deckIndex++];
            await pool.query(`INSERT INTO poker_hand_hole_cards (hand_id, player_address, cards) VALUES ($1, $2, $3::JSONB)`, [handId, seat.player_address, JSON.stringify([hole1, hole2])]);
        }
        const sbPos = (buttonSeatPos + 1) % maxSeats;
        const bbPos = (buttonSeatPos + 2) % maxSeats;
        const sbSeat = seatsResult.rows.find((r) => r.position === sbPos);
        const bbSeat = seatsResult.rows.find((r) => r.position === bbPos);
        let pot = 0n;
        if (sbSeat) {
            const sbStack = BigInt(sbSeat.stack);
            const post = sb > sbStack ? sbStack : sb;
            await pool.query(`UPDATE poker_seats SET stack = stack - $3::NUMERIC WHERE table_id = $1 AND player_address = $2`, [tableId, sbSeat.player_address, post.toString()]);
            pot += post;
        }
        if (bbSeat) {
            const bbStack = BigInt(bbSeat.stack);
            const post = bb > bbStack ? bbStack : bb;
            await pool.query(`UPDATE poker_seats SET stack = stack - $3::NUMERIC WHERE table_id = $1 AND player_address = $2`, [tableId, bbSeat.player_address, post.toString()]);
            pot += post;
        }
        await pool.query(`UPDATE poker_hands SET pot_amount = $2::NUMERIC WHERE id = $1`, [handId, pot.toString()]);
        await pool.query(`UPDATE poker_tables SET status = 'playing', hand_number = $2, button_position = $3 WHERE id = $1`, [tableId, handNumber, buttonSeatPos]);
        await pool.query(`UPDATE poker_hands SET acting_position = $2 WHERE id = $1`, [handId, firstToAct]);
        return this.getTableState(tableId, null);
    }
}
exports.PokerGameService = PokerGameService;
//# sourceMappingURL=poker-game.service.js.map