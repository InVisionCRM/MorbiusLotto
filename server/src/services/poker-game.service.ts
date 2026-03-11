import { Pool } from 'pg';
import { DatabaseService } from './database.service';
import { ProvablyFairService } from './provably-fair.service';
import { bestHand, compareHands, winners } from './poker-hand-eval';
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
}

export interface PokerSeatState {
  position: number;
  playerAddress: string | null;
  stack: string;
  status: string;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isActing: boolean;
  folded: boolean;
  currentBet: string;
}

export interface PokerCurrentHand {
  handId: string;
  street: PokerStreet;
  communityCards: number[];
  pot: string;
  actingPosition: number | null;
  lastAction: { position: number; action: string; amount: string } | null;
  minRaise: string;
  /** Amount the acting player must put in to call (0 if can check). */
  toCall: string;
  /** ISO timestamp of when the current player's turn started (for the 30s timer). */
  turnStartedAt: string | null;
  /** At showdown: all players' revealed hole cards keyed by address */
  showdownHands?: Record<string, number[]>;
  /** At showdown: winner(s) and amount each receives (from hand result) */
  winners?: { address: string; amount: string }[];
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
}

const STREETS: PokerStreet[] = ['preflop', 'flop', 'turn', 'river', 'showdown'];

/** Aggregate total contributed chips per player for a given hand+street. */
async function getStreetContributions(
  pool: Pool,
  handId: string,
  street: string
): Promise<Map<string, bigint>> {
  const r = await pool.query(
    `SELECT player_address, SUM(amount) AS total
       FROM poker_hand_actions
      WHERE hand_id = $1 AND street = $2
        AND action IN ('bet', 'raise', 'call')
      GROUP BY player_address`,
    [handId, street]
  );
  const map = new Map<string, bigint>();
  for (const row of r.rows) {
    const addr = (row.player_address || '').toLowerCase();
    const total = BigInt(row.total ?? '0');
    map.set(addr, total);
  }
  return map;
}

export class PokerGameService {
  private broadcastCallback: ((tableId: string) => Promise<void>) | null = null;

  constructor(
    private dbService: DatabaseService,
    private pfService: ProvablyFairService
  ) {}

  /** Wire in the WebSocket broadcast so bot actions push state to clients. */
  setBroadcastCallback(cb: (tableId: string) => Promise<void>): void {
    this.broadcastCallback = cb;
  }

  private getPool(): Pool {
    return this.dbService.getPool();
  }

  private normalizeAddress(addr: string): string {
    return (addr || '').trim().toLowerCase();
  }

  async listTables(): Promise<PokerTableSummary[]> {
    const pool = this.getPool();
    const result = await pool.query(
      `SELECT t.id, t.small_blind, t.big_blind, t.max_seats, t.status,
              COUNT(s.id) FILTER (WHERE s.player_address IS NOT NULL) AS seated_count
       FROM poker_tables t
       LEFT JOIN poker_seats s ON s.table_id = t.id
       WHERE t.status IN ('waiting', 'playing')
       GROUP BY t.id ORDER BY t.created_at ASC`
    );
    return result.rows.map((r: any) => ({
      id: r.id,
      smallBlind: r.small_blind?.toString() ?? '0',
      bigBlind: r.big_blind?.toString() ?? '0',
      maxSeats: Number(r.max_seats) || 6,
      status: r.status,
      seatedCount: Number(r.seated_count) || 0,
      emptySeats: Math.max(0, (Number(r.max_seats) || 6) - (Number(r.seated_count) || 0)),
    }));
  }

  async getTable(tableId: string): Promise<{ id: string; smallBlind: string; bigBlind: string; maxSeats: number; status: string } | null> {
    const pool = this.getPool();
    const r = await pool.query(
      'SELECT id, small_blind, big_blind, max_seats, status FROM poker_tables WHERE id = $1',
      [tableId]
    );
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    return {
      id: row.id,
      smallBlind: row.small_blind?.toString() ?? '0',
      bigBlind: row.big_blind?.toString() ?? '0',
      maxSeats: Number(row.max_seats) || 6,
      status: row.status,
    };
  }

  async createTable(smallBlind: bigint, bigBlind: bigint, maxSeats: number): Promise<string> {
    const pool = this.getPool();
    const r = await pool.query(
      `INSERT INTO poker_tables (small_blind, big_blind, max_seats, status)
       VALUES ($1::NUMERIC, $2::NUMERIC, $3, 'waiting')
       RETURNING id`,
      [smallBlind.toString(), bigBlind.toString(), maxSeats]
    );
    return r.rows[0].id;
  }

  /**
   * Admin: Remove a table. Credits each seated player's stack back to balance, then deletes the table (CASCADE removes seats/hands).
   */
  async deleteTable(tableId: string): Promise<boolean> {
    const pool = this.getPool();
    const tableRow = await pool.query('SELECT id FROM poker_tables WHERE id = $1', [tableId]);
    if (tableRow.rows.length === 0) return false;

    const seats = await pool.query(
      'SELECT player_address, stack FROM poker_seats WHERE table_id = $1',
      [tableId]
    );
    for (const row of seats.rows) {
      const stack = BigInt(row.stack ?? '0');
      if (stack > 0n && row.player_address) {
        await this.dbService.addBalanceToAddress(row.player_address, stack);
        logger.info('Poker admin delete table: credited stack', { tableId, playerAddress: row.player_address, stack: stack.toString() });
      }
    }

    await pool.query('DELETE FROM poker_tables WHERE id = $1', [tableId]);
    logger.info('Poker admin delete table', { tableId });
    return true;
  }

  /**
   * Join a table: deduct buyIn from balance, add seat with stack = buyIn.
   */
  async joinTable(tableId: string, playerAddress: string, buyInChips: string): Promise<PokerTableState> {
    const normalized = this.normalizeAddress(playerAddress);
    const buyIn = BigInt(buyInChips);
    if (buyIn <= 0n) throw new Error('Buy-in must be positive');

    const pool = this.getPool();
    const tableResult = await pool.query(
      'SELECT id, small_blind, big_blind, max_seats FROM poker_tables WHERE id = $1',
      [tableId]
    );
    if (tableResult.rows.length === 0) throw new Error('Table not found');

    const table = tableResult.rows[0];
    const maxSeats = Number(table.max_seats) || 6;

    const existing = await pool.query(
      'SELECT id FROM poker_seats WHERE table_id = $1 AND player_address = $2',
      [tableId, normalized]
    );
    if (existing.rows.length > 0) throw new Error('Already seated at this table');

    const seatCount = await pool.query(
      'SELECT COUNT(*) AS c FROM poker_seats WHERE table_id = $1',
      [tableId]
    );
    const count = Number(seatCount.rows[0].c);
    if (count >= maxSeats) throw new Error('Table is full');

    await this.dbService.deductPlayerBalance(playerAddress, buyIn);

    const positions = await pool.query(
      'SELECT position FROM poker_seats WHERE table_id = $1',
      [tableId]
    );
    const used = new Set(positions.rows.map((r: any) => r.position));
    let position = 0;
    while (used.has(position)) position++;

    await pool.query(
      `INSERT INTO poker_seats (table_id, position, player_address, stack, status)
       VALUES ($1, $2, $3, $4::NUMERIC, 'active')`,
      [tableId, position, normalized, buyIn.toString()]
    );

    logger.info('Poker join', { tableId, playerAddress: normalized, buyIn: buyIn.toString(), position });

    const tableRow = await pool.query(
      'SELECT small_blind, big_blind, max_seats FROM poker_tables WHERE id = $1',
      [tableId]
    );
    const t = tableRow.rows[0];
    await this.tryStartNextHand(pool, tableId, t, Number(t.max_seats) || 6);

    return this.getTableState(tableId, normalized);
  }

  /**
   * Leave table: credit stack back to balance, remove seat.
   */
  async leaveTable(tableId: string, playerAddress: string): Promise<PokerTableState | null> {
    const normalized = this.normalizeAddress(playerAddress);
    const pool = this.getPool();

    const seatResult = await pool.query(
      'SELECT id, stack, position FROM poker_seats WHERE table_id = $1 AND player_address = $2',
      [tableId, normalized]
    );
    if (seatResult.rows.length === 0) throw new Error('Not seated at this table');

    const stack = BigInt(seatResult.rows[0].stack || '0');
    const leavingPosition = seatResult.rows[0].position;

    // Check for active hand before removing seat
    const activeHandResult = await pool.query(
      `SELECT id, acting_position, pot_amount, street, button_position, community_cards, hand_number
       FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL LIMIT 1`,
      [tableId]
    );

    await pool.query('DELETE FROM poker_seats WHERE table_id = $1 AND player_address = $2', [tableId, normalized]);
    if (stack > 0n) {
      await this.dbService.addBalanceToAddress(playerAddress, stack);
    }

    logger.info('Poker leave', { tableId, playerAddress: normalized, stack: stack.toString() });

    if (activeHandResult.rows.length > 0) {
      const hand = activeHandResult.rows[0];
      const handId = hand.id;
      const actingPosition = hand.acting_position;

      // Check if this player is in the hand (has hole cards)
      const inHandResult = await pool.query(
        'SELECT 1 FROM poker_hand_hole_cards WHERE hand_id = $1 AND player_address = $2',
        [handId, normalized]
      );
      const isInHand = inHandResult.rows.length > 0;

      if (isInHand) {
        // Auto-fold the leaving player
        const alreadyFolded = await pool.query(
          'SELECT 1 FROM poker_hand_actions WHERE hand_id = $1 AND player_address = $2 AND action = \'fold\'',
          [handId, normalized]
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
            [handId, normalized, hand.street, nextOrder]
          );
        }

        // If this player was acting, advance the hand
        if (actingPosition === leavingPosition) {
          const tableRow = await pool.query(
            'SELECT small_blind, big_blind, max_seats FROM poker_tables WHERE id = $1',
            [tableId]
          );
          if (tableRow.rows.length > 0) {
            const table = tableRow.rows[0];
            const maxSeats = Number(table.max_seats) || 6;
            // Re-fetch hand with updated state
            const updatedHand = await pool.query(
              'SELECT * FROM poker_hands WHERE id = $1',
              [handId]
            );
            if (updatedHand.rows.length > 0) {
              await this.advanceOrShowdown(pool, tableId, handId, updatedHand.rows[0], table, maxSeats);
            }
          }
        }
      }
    }

    return this.getTableState(tableId, null);
  }

  /**
   * Add chips to an existing seat (re-up): deduct from balance, credit to stack.
   */
  async addChips(tableId: string, playerAddress: string, amount: string): Promise<PokerTableState> {
    const normalized = this.normalizeAddress(playerAddress);
    const pool = this.getPool();
    const chips = BigInt(amount);
    if (chips <= 0n) throw new Error('Amount must be positive');

    const seatResult = await pool.query(
      'SELECT id FROM poker_seats WHERE table_id = $1 AND player_address = $2',
      [tableId, normalized]
    );
    if (seatResult.rows.length === 0) throw new Error('Not seated at this table');

    await this.dbService.deductPlayerBalance(playerAddress, chips);
    await pool.query(
      'UPDATE poker_seats SET stack = stack + $3::NUMERIC WHERE table_id = $1 AND player_address = $2',
      [tableId, normalized, chips.toString()]
    );

    logger.info('Poker add chips', { tableId, playerAddress: normalized, amount: chips.toString() });
    return this.getTableState(tableId, normalized);
  }

  /**
   * Get full table state. Hole cards only for the requesting player (forPlayerAddress).
   */
  async getTableState(tableId: string, forPlayerAddress: string | null): Promise<PokerTableState> {
    const pool = this.getPool();
    const forPlayer = forPlayerAddress ? this.normalizeAddress(forPlayerAddress) : null;

    const tableRow = await pool.query(
      'SELECT id, small_blind, big_blind, max_seats, status, hand_number, button_position FROM poker_tables WHERE id = $1',
      [tableId]
    );
    if (tableRow.rows.length === 0) throw new Error('Table not found');
    const tbl = tableRow.rows[0];
    const maxSeats = Number(tbl.max_seats) || 6;

    const seatsResult = await pool.query(
      'SELECT position, player_address, stack, status FROM poker_seats WHERE table_id = $1 ORDER BY position',
      [tableId]
    );
    const seatMap = new Map<number, { playerAddress: string; stack: string; status: string }>();
    for (const r of seatsResult.rows) {
      seatMap.set(r.position, {
        playerAddress: r.player_address,
        stack: r.stack?.toString() ?? '0',
        status: r.status,
      });
    }

    const seats: PokerSeatState[] = [];
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

    let currentHand: PokerCurrentHand | null = null;
    let myHoleCards: number[] | null = null;

    const handRow = await pool.query(
      `SELECT id, hand_number, button_position, community_cards, pot_amount, street, acting_position, turn_started_at, result
       FROM poker_hands WHERE table_id = $1
         AND (completed_at IS NULL OR (street = 'showdown' AND completed_at > NOW() - INTERVAL '8 seconds'))
       ORDER BY CASE WHEN completed_at IS NULL THEN 0 ELSE 1 END, created_at DESC LIMIT 1`,
      [tableId]
    );

    if (handRow.rows.length > 0) {
      const h = handRow.rows[0];
      const buttonPosition = Number(h.button_position);
      const communityCards = Array.isArray(h.community_cards) ? h.community_cards : (h.community_cards ? JSON.parse(JSON.stringify(h.community_cards)) : []);

      const actionsResult = await pool.query(
        `SELECT player_address, street, action, amount, "order" FROM poker_hand_actions WHERE hand_id = $1 ORDER BY "order"`,
        [h.id]
      );
      const lastActionRow = actionsResult.rows.length > 0 ? actionsResult.rows[actionsResult.rows.length - 1] : null;
      const actingPosition = h.acting_position != null ? Number(h.acting_position) : null;

      // minRaise = what the acting player must put in BEYOND the call to make a valid raise.
      // Uses last_raise_size stored on the hand (updated each bet/raise) so re-raises are
      // correctly sized: each raise increment >= the previous one (standard NL rules).
      const bb = BigInt(tbl.big_blind ?? '0');
      const lastRaiseSizeResult = await pool.query(
        'SELECT last_raise_size FROM poker_hands WHERE id = $1',
        [h.id]
      );
      const lastRaiseSize = BigInt(lastRaiseSizeResult.rows[0]?.last_raise_size ?? '0');
      const minRaiseIncrement = lastRaiseSize > bb ? lastRaiseSize : bb;
      // toCall for the acting player is computed below; compute minRaise after it.
      // We'll overwrite minRaise once toCall is known.
      let minRaise = (minRaiseIncrement).toString(); // placeholder — updated below

      const foldResult = await pool.query(
        `SELECT player_address FROM poker_hand_actions WHERE hand_id = $1 AND action = 'fold'`,
        [h.id]
      );
      const foldedSet = new Set(foldResult.rows.map((r: any) => r.player_address));

      const isHeadsUp = seatMap.size === 2;
      const sbDisplayPos = isHeadsUp ? buttonPosition : this.nextActiveSeatPosition(buttonPosition, seatsResult.rows, maxSeats);
      const bbDisplayPos = this.nextActiveSeatPosition(sbDisplayPos, seatsResult.rows, maxSeats);

      for (const seat of seats) {
        if (!seat.playerAddress) continue;
        const pos = seat.position;
        seat.isDealer = pos === buttonPosition;
        seat.isSmallBlind = pos === sbDisplayPos;
        seat.isBigBlind = pos === bbDisplayPos;
        seat.folded = foldedSet.has(seat.playerAddress);
        seat.isActing = actingPosition === pos;
      }

      let lastAction: PokerCurrentHand['lastAction'] = null;
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
        const toCallBig = await this.getCurrentBetToCall(pool, h.id, h.street, actingPosition, maxSeats);
        toCall = toCallBig.toString();
        // Now that we know toCall, finalise minRaise = toCall + minRaiseIncrement.
        minRaise = (toCallBig + minRaiseIncrement).toString();
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
        turnStartedAt: h.turn_started_at ? new Date(h.turn_started_at).toISOString() : null,
      };

      if (forPlayer) {
        const holeResult = await pool.query(
          'SELECT cards FROM poker_hand_hole_cards WHERE hand_id = $1 AND player_address = $2',
          [h.id, forPlayer]
        );
        if (holeResult.rows.length > 0 && holeResult.rows[0].cards) {
          myHoleCards = Array.isArray(holeResult.rows[0].cards) ? holeResult.rows[0].cards : JSON.parse(holeResult.rows[0].cards);
        }
      }

      // At showdown reveal all hole cards to everyone and include winners from result
      if (h.street === 'showdown') {
        const allHoleResult = await pool.query(
          'SELECT player_address, cards FROM poker_hand_hole_cards WHERE hand_id = $1',
          [h.id]
        );
        const showdownHands: Record<string, number[]> = {};
        for (const row of allHoleResult.rows) {
          const cards = Array.isArray(row.cards) ? row.cards : JSON.parse(row.cards ?? '[]');
          showdownHands[row.player_address] = cards;
        }
        currentHand!.showdownHands = showdownHands;
        if (h.result) {
          try {
            const parsed = typeof h.result === 'string' ? JSON.parse(h.result) : h.result;
            if (parsed?.winners?.length) {
              currentHand!.winners = parsed.winners.map((w: { address: string; amount: string }) => ({
                address: (w.address || '').toLowerCase(),
                amount: String(w.amount ?? '0'),
              }));
            }
          } catch {
            // ignore invalid result json
          }
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
  async playerAction(
    tableId: string,
    handId: string,
    playerAddress: string,
    action: string,
    amount?: string
  ): Promise<PokerTableState> {
    const normalized = this.normalizeAddress(playerAddress);
    const pool = this.getPool();

    const handRow = await pool.query(
      'SELECT * FROM poker_hands WHERE id = $1 AND table_id = $2 AND completed_at IS NULL',
      [handId, tableId]
    );
    if (handRow.rows.length === 0) throw new Error('Hand not found or already completed');
    const hand = handRow.rows[0];
    const tableRow = await pool.query('SELECT small_blind, big_blind, max_seats FROM poker_tables WHERE id = $1', [tableId]);
    const table = tableRow.rows[0];
    const sb = BigInt(table.small_blind);
    const bb = BigInt(table.big_blind);
    const maxSeats = Number(table.max_seats) || 6;

    const actingPosition = hand.acting_position;
    if (actingPosition == null) throw new Error('No acting player');
    const seatsAtTable = await pool.query(
      'SELECT position, player_address, stack FROM poker_seats WHERE table_id = $1 ORDER BY position',
      [tableId]
    );
    const actingAddress = seatsAtTable.rows.find((r: any) => r.position === actingPosition)?.player_address;
    if (actingAddress !== normalized) throw new Error('Not your turn');

    const orderResult = await pool.query('SELECT COALESCE(MAX("order"), 0) + 1 AS next_order FROM poker_hand_actions WHERE hand_id = $1', [handId]);
    const nextOrder = Number(orderResult.rows[0].next_order);

    const potAmount = BigInt(hand.pot_amount ?? '0');
    const street = hand.street as PokerStreet;

    if (action === 'fold') {
      await pool.query(
        `INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order") VALUES ($1, $2, $3, 'fold', 0, $4)`,
        [handId, normalized, street, nextOrder]
      );
      await this.advanceOrShowdown(pool, tableId, handId, hand, table, maxSeats);
      return this.getTableState(tableId, normalized);
    }

    if (action === 'check') {
      const toCall = await this.getCurrentBetToCall(pool, handId, street, actingPosition, maxSeats);
      if (toCall > 0n) throw new Error('Cannot check when there is a bet to call');
      await pool.query(
        `INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order") VALUES ($1, $2, $3, 'check', 0, $4)`,
        [handId, normalized, street, nextOrder]
      );
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
      await pool.query(
        `UPDATE poker_seats SET stack = stack - $3::NUMERIC WHERE table_id = $1 AND player_address = $2`,
        [tableId, normalized, deduct.toString()]
      );
      await pool.query(
        `UPDATE poker_hands SET pot_amount = pot_amount + $2::NUMERIC WHERE id = $1`,
        [handId, deduct.toString()]
      );
      await pool.query(
        `INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order") VALUES ($1, $2, $3, 'call', $4::NUMERIC, $5)`,
        [handId, normalized, street, deduct.toString(), nextOrder]
      );
      await this.advanceOrShowdown(pool, tableId, handId, hand, table, maxSeats);
      return this.getTableState(tableId, normalized);
    }

    if (action === 'bet' || action === 'raise') {
      const seatRow = await pool.query('SELECT stack FROM poker_seats WHERE table_id = $1 AND player_address = $2', [tableId, normalized]);
      const stack = BigInt(seatRow.rows[0].stack);

      // Compute minimum chips to put in for this bet/raise:
      //   minPutIn = toCall + max(lastRaiseSize, BB)
      // where toCall = what the player owes just to call the current bet.
      // This enforces the standard NL rule: a re-raise must be at least as large
      // as the previous raise increment.
      const toCallForRaise = await this.getCurrentBetToCall(pool, handId, street, actingPosition, maxSeats);
      const lastRaiseSizeRow = await pool.query('SELECT last_raise_size FROM poker_hands WHERE id = $1', [handId]);
      const lastRaiseSize = BigInt(lastRaiseSizeRow.rows[0]?.last_raise_size ?? '0');
      const minRaiseIncrement = lastRaiseSize > bb ? lastRaiseSize : bb;
      const minPutIn = toCallForRaise + minRaiseIncrement;

      // Short-stack all-in: if amt >= stack the player is going all-in — allow even
      // if below minPutIn (correct poker rules behaviour for short stacks).
      if (amt < minPutIn && amt < stack) throw new Error(`Minimum bet/raise is ${minPutIn}`);
      const deduct = amt > stack ? stack : amt;
      await pool.query(
        `UPDATE poker_seats SET stack = stack - $3::NUMERIC WHERE table_id = $1 AND player_address = $2`,
        [tableId, normalized, deduct.toString()]
      );
      await pool.query(
        `UPDATE poker_hands SET pot_amount = pot_amount + $2::NUMERIC WHERE id = $1`,
        [handId, deduct.toString()]
      );
      await pool.query(
        `INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order") VALUES ($1, $2, $3, $4, $5::NUMERIC, $6)`,
        [handId, normalized, street, action, deduct.toString(), nextOrder]
      );
      // Record the raise increment so subsequent re-raises respect the same minimum.
      // raiseIncrement = chips committed beyond the call portion.
      const raiseIncrement = deduct > toCallForRaise ? deduct - toCallForRaise : deduct;
      const newLastRaiseSize = raiseIncrement > bb ? raiseIncrement : bb;
      await pool.query('UPDATE poker_hands SET last_raise_size = $2::NUMERIC WHERE id = $1', [handId, newLastRaiseSize.toString()]);
      await this.advanceOrShowdown(pool, tableId, handId, hand, table, maxSeats);
      return this.getTableState(tableId, normalized);
    }

    throw new Error('Invalid action');
  }

  private async getCurrentBetToCall(
    pool: Pool,
    handId: string,
    street: string,
    actingPosition: number,
    maxSeats: number
  ): Promise<bigint> {
    const r = await pool.query(
      `SELECT player_address, SUM(amount) AS total FROM poker_hand_actions WHERE hand_id = $1 AND street = $2 AND action IN ('bet', 'raise', 'call', 'blind') GROUP BY player_address`,
      [handId, street]
    );
    let maxBet = 0n;
    for (const row of r.rows) {
      const t = BigInt(row.total ?? '0');
      if (t > maxBet) maxBet = t;
    }
    const actingAddr = await this.getPlayerAtPosition(pool, handId, actingPosition);
    const myBet = r.rows.find((x: any) => x.player_address === actingAddr);
    const myTotal = myBet ? BigInt(myBet.total ?? '0') : 0n;
    return maxBet > myTotal ? maxBet - myTotal : 0n;
  }

  private async getPlayerAtPosition(pool: Pool, handId: string, position: number): Promise<string | null> {
    const tableIdResult = await pool.query('SELECT table_id FROM poker_hands WHERE id = $1', [handId]);
    if (tableIdResult.rows.length === 0) return null;
    const tableId = tableIdResult.rows[0].table_id;
    const r = await pool.query('SELECT player_address FROM poker_seats WHERE table_id = $1 AND position = $2', [tableId, position]);
    return r.rows[0]?.player_address ?? null;
  }


  /** Sum all chips each player put into this hand across all streets. */
  private async getTotalContributions(pool: Pool, handId: string): Promise<Map<string, bigint>> {
    const r = await pool.query(
      `SELECT player_address, SUM(amount) AS total
         FROM poker_hand_actions
        WHERE hand_id = $1 AND action IN ('bet', 'raise', 'call', 'blind')
        GROUP BY player_address`,
      [handId]
    );
    const map = new Map<string, bigint>();
    for (const row of r.rows) {
      map.set((row.player_address || '').toLowerCase(), BigInt(row.total ?? '0'));
    }
    return map;
  }

  /**
   * Build side pots from per-player total contributions.
   * Returns pots from main pot outward. Folded players' chips enter each pot
   * but they are ineligible to win it.
   *
   * Example — D=30(folded), A=50(all-in), B=100(all-in), C=100(active):
   *   Pot 1: 30×4=120, eligible [A,B,C]
   *   Pot 2: 20×3= 60, eligible [A,B,C]
   *   Pot 3: 50×2=100, eligible [B,C]
   */
  private buildSidePots(
    contributions: Map<string, bigint>,
    foldedSet: Set<string>
  ): { amount: bigint; eligible: string[] }[] {
    const sorted = [...contributions.entries()]
      .filter(([, v]) => v > 0n)
      .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));

    const pots: { amount: bigint; eligible: string[] }[] = [];
    let level = 0n;
    let remaining = sorted;

    while (remaining.length > 0) {
      const minContrib = remaining[0][1];
      const cap = minContrib - level;
      if (cap > 0n) {
        const potAmount = cap * BigInt(remaining.length);
        const eligible = remaining
          .filter(([addr]) => !foldedSet.has(addr))
          .map(([addr]) => addr);
        pots.push({ amount: potAmount, eligible });
      }
      level = minContrib;
      // Players who contributed exactly minContrib are tapped out of higher pots
      remaining = remaining.filter(([, c]) => c > minContrib);
    }

    return pots;
  }

  private async advanceOrShowdown(
    pool: Pool,
    tableId: string,
    handId: string,
    hand: any,
    table: any,
    maxSeats: number
  ): Promise<void> {
    const street = hand.street as PokerStreet;
    const buttonPosition = Number(hand.button_position);
    const actingPosition = hand.acting_position;

    const foldResult = await pool.query('SELECT player_address FROM poker_hand_actions WHERE hand_id = $1 AND action = $2', [handId, 'fold']);
    const foldedSet = new Set(foldResult.rows.map((r: any) => (r.player_address || '').toLowerCase()));

    const seatsResult = await pool.query('SELECT position, player_address, stack FROM poker_seats WHERE table_id = $1 ORDER BY position', [tableId]);

    // Players with stack=0 are all-in and cannot act on future streets
    const allInSet = new Set<string>(
      seatsResult.rows
        .filter((r: any) => BigInt(r.stack ?? '0') === 0n)
        .map((r: any) => (r.player_address || '').toLowerCase())
    );

    // Only count players who were dealt into this hand — mid-hand joiners are excluded
    const dealtResult = await pool.query('SELECT player_address FROM poker_hand_hole_cards WHERE hand_id = $1', [handId]);
    const dealtSet = new Set(dealtResult.rows.map((r: any) => (r.player_address || '').toLowerCase()));
    const stillIn = seatsResult.rows.filter((r: any) => {
      const addr = (r.player_address || '').toLowerCase();
      return dealtSet.has(addr) && !foldedSet.has(addr);
    });

    if (stillIn.length <= 1) {
      const winner = stillIn[0];
      if (winner) {
        const pot = BigInt(hand.pot_amount ?? '0');
        await pool.query(
          `UPDATE poker_seats SET stack = stack + $3::NUMERIC WHERE table_id = $1 AND player_address = $2`,
          [tableId, winner.player_address, pot.toString()]
        );
      }
      const resultJson = stillIn.length
        ? JSON.stringify({ winners: [{ address: stillIn[0].player_address, amount: hand.pot_amount }] })
        : '{}';
      await pool.query(
        `UPDATE poker_hands SET completed_at = NOW(), street = 'showdown', acting_position = NULL, result = $2 WHERE id = $1`,
        [handId, resultJson]
      );
      await pool.query('UPDATE poker_tables SET status = $2 WHERE id = $1', [tableId, 'waiting']);
      await this.broadcastState(tableId);
      // Delay next hand so clients can see the fold-win result
      setTimeout(async () => {
        await this.tryStartNextHand(pool, tableId, table, maxSeats);
        await this.broadcastState(tableId);
      }, 5000);
      return;
    }

    // All remaining non-folded players are all-in — no more voluntary action possible
    const allAllIn = stillIn.every((s: any) => allInSet.has((s.player_address || '').toLowerCase()));

    const nextPos = this.nextActivePosition(actingPosition, foldedSet, seatsResult.rows, maxSeats, allInSet);
    const allCalled = await this.haveAllActedThisStreet(pool, handId, street, foldedSet, seatsResult.rows, allInSet);

    const holeCountResult = await pool.query('SELECT COUNT(*) AS c FROM poker_hand_hole_cards WHERE hand_id = $1', [handId]);
    const numPlayersInHand = Number(holeCountResult.rows[0]?.c ?? 0);
    const boardStartIndex = numPlayersInHand * 2;

    // When everyone is all-in (or action is complete), deal the full board and go straight to showdown.
    const runAllInRunout = async () => {
      const deck = await this.getDeckForHand(pool, hand);
      const fullBoard = deck.slice(boardStartIndex, boardStartIndex + 5);
      await pool.query(
        `UPDATE poker_hands SET community_cards = $2::JSONB WHERE id = $1`,
        [handId, JSON.stringify(fullBoard)]
      );
      const updatedHand = { ...hand, community_cards: fullBoard };
      await this.runShowdown(pool, tableId, handId, updatedHand, table, maxSeats);
      await this.broadcastState(tableId);
      setTimeout(async () => {
        await this.tryStartNextHand(pool, tableId, table, maxSeats);
        await this.broadcastState(tableId);
      }, 5000);
    };

    if (street === 'preflop' && allCalled) {
      if (allAllIn) {
        await runAllInRunout();
        return;
      }
      const deck = await this.getDeckForHand(pool, hand);
      const communityCards = deck.slice(boardStartIndex, boardStartIndex + 3);
      const firstActing = this.firstActivePosition(buttonPosition, 'flop', foldedSet, seatsResult.rows, maxSeats, allInSet);
      await pool.query(
        `UPDATE poker_hands SET street = 'flop', community_cards = $2::JSONB, acting_position = $3, last_raise_size = 0, turn_started_at = NOW() WHERE id = $1`,
        [handId, JSON.stringify(communityCards), firstActing]
      );
      await this.broadcastState(tableId);
      return;
    }

    if (allCalled && street !== 'preflop') {
      const nextStreet = STREETS[STREETS.indexOf(street) + 1];
      if (nextStreet === 'showdown') {
        await this.runShowdown(pool, tableId, handId, hand, table, maxSeats);
        await this.broadcastState(tableId);
        setTimeout(async () => {
          await this.tryStartNextHand(pool, tableId, table, maxSeats);
          await this.broadcastState(tableId);
        }, 5000);
        return;
      }
      if (allAllIn) {
        // Deal remaining board cards all at once and go to showdown
        await runAllInRunout();
        return;
      }
      const deck = await this.getDeckForHand(pool, hand);
      const nextLen = nextStreet === 'flop' ? 3 : nextStreet === 'turn' ? 4 : 5;
      const communityCards = deck.slice(boardStartIndex, boardStartIndex + nextLen);
      const firstActing = this.firstActivePosition(buttonPosition, nextStreet, foldedSet, seatsResult.rows, maxSeats, allInSet);
      await pool.query(
        // Reset last_raise_size to 0 for the new street (fresh betting round).
        `UPDATE poker_hands SET street = $2, community_cards = $3::JSONB, acting_position = $4, last_raise_size = 0, turn_started_at = NOW() WHERE id = $1`,
        [handId, nextStreet, JSON.stringify(communityCards), firstActing]
      );
      await this.broadcastState(tableId);
      return;
    }

    await pool.query('UPDATE poker_hands SET acting_position = $2, turn_started_at = NOW() WHERE id = $1', [handId, nextPos]);
    await this.broadcastState(tableId);
  }

  private firstActivePosition(buttonPosition: number, street: string, foldedSet: Set<string>, seats: any[], maxSeats: number, allInSet: Set<string> = new Set()): number {
    const start = street === 'preflop' ? (buttonPosition + 3) % maxSeats : (buttonPosition + 1) % maxSeats;
    for (let i = 0; i < maxSeats; i++) {
      const pos = (start + i) % maxSeats;
      const addr = (seats.find((s: any) => s.position === pos)?.player_address || '').toLowerCase();
      if (addr && !foldedSet.has(addr) && !allInSet.has(addr)) return pos;
    }
    return start;
  }

  private nextActiveSeatPosition(fromPosition: number, seats: any[], maxSeats: number): number {
    const positions = new Set(seats.map((s: any) => s.position));
    for (let i = 1; i <= maxSeats; i++) {
      const pos = (fromPosition + i) % maxSeats;
      if (positions.has(pos)) return pos;
    }
    return fromPosition;
  }

  private nextActivePosition(current: number, foldedSet: Set<string>, seats: any[], maxSeats: number, allInSet: Set<string> = new Set()): number {
    for (let i = 1; i <= maxSeats; i++) {
      const pos = (current + i) % maxSeats;
      const addr = (seats.find((s: any) => s.position === pos)?.player_address || '').toLowerCase();
      if (addr && !foldedSet.has(addr) && !allInSet.has(addr)) return pos;
    }
    return current;
  }

  private async haveAllActedThisStreet(pool: Pool, handId: string, street: string, foldedSet: Set<string>, seats: any[], allInSet: Set<string> = new Set()): Promise<boolean> {
    // 'blind' posts don't count as a real action — only voluntary actions (fold, check, call, bet, raise) do
    const acted = await pool.query(
      `SELECT DISTINCT player_address FROM poker_hand_actions WHERE hand_id = $1 AND street = $2 AND action != 'blind'`,
      [handId, street]
    );
    // Only consider players who were dealt into this hand (have hole cards), not mid-hand joiners
    const dealtResult = await pool.query(
      'SELECT player_address FROM poker_hand_hole_cards WHERE hand_id = $1',
      [handId]
    );
    const dealtSet = new Set(dealtResult.rows.map((r: any) => (r.player_address || '').toLowerCase()));
    const actedSet = new Set(acted.rows.map((r: any) => (r.player_address || '').toLowerCase()));
    // Exclude all-in players — they cannot act, so they must not block street advancement
    const inHand = seats.filter((s: any) => {
      const addr = (s.player_address || '').toLowerCase();
      return addr && dealtSet.has(addr) && !foldedSet.has(addr) && !allInSet.has(addr);
    });
    // If every remaining non-folded player is all-in, there is nothing to wait for
    if (inHand.length === 0) return true;
    // Every active player must have taken at least one voluntary action
    const allActed = inHand.every((s: any) => actedSet.has((s.player_address || '').toLowerCase()));
    if (!allActed) return false;
    // AND all bets must be equalized — i.e. no one still owes chips on this street.
    // This catches the case where BB raises after SB called: SB acted (call) but the
    // raise means SB still has a non-zero amount to call, so we must NOT advance yet.
    // Include blinds in the sum (same accounting as getCurrentBetToCall).
    const contribResult = await pool.query(
      `SELECT player_address, SUM(amount) AS total FROM poker_hand_actions
       WHERE hand_id = $1 AND street = $2 AND action IN ('bet', 'raise', 'call', 'blind')
       GROUP BY player_address`,
      [handId, street]
    );
    const contribMap = new Map<string, bigint>();
    for (const row of contribResult.rows) {
      contribMap.set((row.player_address || '').toLowerCase(), BigInt(row.total ?? '0'));
    }
    let maxContrib = 0n;
    for (const v of contribMap.values()) if (v > maxContrib) maxContrib = v;
    for (const s of inHand) {
      const addr = (s.player_address || '').toLowerCase();
      const contrib = contribMap.get(addr) ?? 0n;
      if (contrib < maxContrib) return false;
    }
    return true;
  }

  private async getDeckForHand(pool: Pool, hand: any): Promise<number[]> {
    const serverSeed = hand.server_seed;
    const clientSeed = hand.client_seed ?? 'default';
    const nonce = Number(hand.hand_number ?? 0);
    return this.pfService.fisherYatesShuffle(serverSeed, clientSeed, nonce);
  }

  private async runShowdown(
    pool: Pool,
    tableId: string,
    handId: string,
    hand: any,
    table: any,
    maxSeats: number
  ): Promise<void> {
    const communityCards = Array.isArray(hand.community_cards) ? hand.community_cards : [];
    const foldResult = await pool.query('SELECT player_address FROM poker_hand_actions WHERE hand_id = $1 AND action = $2', [handId, 'fold']);
    const foldedSet = new Set((foldResult.rows as { player_address: string }[]).map((r) => (r.player_address || '').toLowerCase()));

    const holeResult = await pool.query('SELECT player_address, cards FROM poker_hand_hole_cards WHERE hand_id = $1', [handId]);

    // Build a map of addr → full 7-card hand for all non-folded players
    const handsByAddr = new Map<string, number[]>();
    for (const row of holeResult.rows) {
      const addr = (row.player_address || '').toLowerCase();
      if (foldedSet.has(addr)) continue;
      const cards = Array.isArray(row.cards) ? row.cards : JSON.parse(row.cards || '[]');
      const full = [...cards, ...communityCards];
      if (full.length >= 5) {
        handsByAddr.set(addr, full);
      }
    }

    // Build side pots from per-player contributions across all streets.
    // Folded players' chips enter each pot they contributed to, but only
    // non-folded, eligible players can win a given pot.
    const contributions = await this.getTotalContributions(pool, handId);
    const sidePots = this.buildSidePots(contributions, foldedSet);

    // Award each pot to its winner(s) and accumulate per-address totals
    const winningsByAddr = new Map<string, bigint>();
    for (const pot of sidePots) {
      const eligibleWithHands = pot.eligible.filter((addr) => handsByAddr.has(addr));
      if (eligibleWithHands.length === 0) continue; // all eligible players folded (shouldn't happen)

      const hands = eligibleWithHands.map((addr) => handsByAddr.get(addr)!);
      const winnerIndices = winners(hands);
      const share = pot.amount / BigInt(winnerIndices.length);
      const rem = pot.amount % BigInt(winnerIndices.length);

      for (let i = 0; i < winnerIndices.length; i++) {
        const addr = eligibleWithHands[winnerIndices[i]];
        // Distribute remainder chips one per winner starting from index 0
        const amt = share + (BigInt(i) < rem ? 1n : 0n);
        winningsByAddr.set(addr, (winningsByAddr.get(addr) ?? 0n) + amt);
      }
    }

    // Credit stacks and build result record
    const resultWinners: { address: string; amount: string }[] = [];
    for (const [addr, amt] of winningsByAddr) {
      await pool.query(
        `UPDATE poker_seats SET stack = stack + $3::NUMERIC WHERE table_id = $1 AND player_address = $2`,
        [tableId, addr, amt.toString()]
      );
      resultWinners.push({ address: addr, amount: amt.toString() });
    }

    await pool.query(
      `UPDATE poker_hands SET completed_at = NOW(), street = 'showdown', acting_position = NULL, result = $2 WHERE id = $1`,
      [handId, JSON.stringify({ winners: resultWinners })]
    );
    await pool.query('UPDATE poker_tables SET status = $2 WHERE id = $1', [tableId, 'waiting']);
    // Next hand is started by the caller after broadcasting showdown state
  }

  private async tryStartNextHand(pool: Pool, tableId: string, table: any, maxSeats: number): Promise<void> {
    const activeHand = await pool.query(
      'SELECT id, acting_position FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL LIMIT 1',
      [tableId]
    );
    if (activeHand.rows.length > 0) {
      const handId = activeHand.rows[0].id;
      const actingPos = activeHand.rows[0].acting_position;

      // If the acting player is no longer seated, the hand is stuck — clean it up
      if (actingPos != null) {
        const seatCheck = await pool.query(
          'SELECT player_address FROM poker_seats WHERE table_id = $1 AND position = $2',
          [tableId, actingPos]
        );
        if (seatCheck.rows.length === 0) {
          // Acting player left without folding — award pot to the last remaining in-hand player
          const foldResult = await pool.query(
            'SELECT player_address FROM poker_hand_actions WHERE hand_id = $1 AND action = \'fold\'',
            [handId]
          );
          const foldedSet = new Set(foldResult.rows.map((r: any) => r.player_address));
          const seatedNow = await pool.query('SELECT player_address FROM poker_seats WHERE table_id = $1', [tableId]);
          const potResult = await pool.query('SELECT pot_amount FROM poker_hands WHERE id = $1', [handId]);
          const pot = BigInt(potResult.rows[0]?.pot_amount ?? '0');

          const stillIn = seatedNow.rows.filter((r: any) => !foldedSet.has(r.player_address));
          if (stillIn.length === 1 && pot > 0n) {
            await pool.query(
              'UPDATE poker_seats SET stack = stack + $3::NUMERIC WHERE table_id = $1 AND player_address = $2',
              [tableId, stillIn[0].player_address, pot.toString()]
            );
          }

          await pool.query(
            `UPDATE poker_hands SET completed_at = NOW(), acting_position = NULL WHERE id = $1`,
            [handId]
          );
          await pool.query('UPDATE poker_tables SET status = $2 WHERE id = $1', [tableId, 'waiting']);
          // Fall through to start a new hand
        } else {
          return; // Hand is genuinely active
        }
      } else {
        return; // acting_position is null — hand completing or stuck; don't interfere
      }
    }

    const seatsResult = await pool.query('SELECT position, player_address, stack FROM poker_seats WHERE table_id = $1', [tableId]);
    const active = seatsResult.rows.filter((r: any) => BigInt(r.stack) > 0n);
    if (active.length < 2) return;

    await this.startHand(tableId);
  }

  private async broadcastState(tableId: string): Promise<void> {
    if (this.broadcastCallback) {
      await this.broadcastCallback(tableId).catch(() => {});
    }
  }

  /**
   * Start a new hand. Requires 2+ players with stack > 0.
   * Deal order (provably fair): hole1 P0, hole2 P0, hole1 P1, hole2 P1, ... then flop 3, turn 1, river 1.
   */
  async startHand(tableId: string): Promise<PokerTableState | null> {
    const pool = this.getPool();
    const tableResult = await pool.query(
      'SELECT id, small_blind, big_blind, max_seats, hand_number, button_position FROM poker_tables WHERE id = $1',
      [tableId]
    );
    if (tableResult.rows.length === 0) throw new Error('Table not found');
    const table = tableResult.rows[0];
    const maxSeats = Number(table.max_seats) || 6;
    const sb = BigInt(table.small_blind);
    const bb = BigInt(table.big_blind);

    const seatsResult = await pool.query(
      'SELECT position, player_address, stack FROM poker_seats WHERE table_id = $1 ORDER BY position',
      [tableId]
    );
    const withStack = seatsResult.rows.filter((r: any) => BigInt(r.stack) > 0n);
    if (withStack.length < 2) return null;

    const handNumber = Number(table.hand_number) + 1;
    const lastButton = Number(table.button_position);
    const buttonSeatPos = this.nextActiveSeatPosition(lastButton, seatsResult.rows, maxSeats);

    const serverSeed = crypto.randomBytes(32).toString('hex');
    const serverSeedHash = this.pfService.createServerSeedHash(serverSeed);
    const clientSeed = crypto.randomBytes(16).toString('hex');

    const deck = this.pfService.fisherYatesShuffle(serverSeed, clientSeed, handNumber);
    let deckIndex = 0;

    // SB/BB by next active seat so heads-up and sparse seating work (e.g. players at 0 and 2 only).
    const isHeadsUp = withStack.length === 2;
    const sbSeatPos = isHeadsUp ? buttonSeatPos : this.nextActiveSeatPosition(buttonSeatPos, seatsResult.rows, maxSeats);
    const bbSeatPos = this.nextActiveSeatPosition(sbSeatPos, seatsResult.rows, maxSeats);
    const sbSeat = seatsResult.rows.find((r: any) => r.position === sbSeatPos);
    const bbSeat = seatsResult.rows.find((r: any) => r.position === bbSeatPos);

    // Preflop: heads-up the button (SB) acts first; otherwise first to act is after the BB.
    const firstToAct = isHeadsUp ? buttonSeatPos : this.nextActiveSeatPosition(bbSeatPos, seatsResult.rows, maxSeats);

    const handInsert = await pool.query(
      `INSERT INTO poker_hands (table_id, hand_number, button_position, server_seed_hash, server_seed, client_seed, community_cards, pot_amount, street, acting_position)
       VALUES ($1, $2, $3, $4, $5, $6, '[]', 0, 'preflop', $7) RETURNING id`,
      [tableId, handNumber, buttonSeatPos, serverSeedHash, serverSeed, clientSeed, firstToAct]
    );
    const handId = handInsert.rows[0].id;

    for (const seat of withStack) {
      const hole1 = deck[deckIndex++];
      const hole2 = deck[deckIndex++];
      await pool.query(
        `INSERT INTO poker_hand_hole_cards (hand_id, player_address, cards) VALUES ($1, $2, $3::JSONB)`,
        [handId, seat.player_address, JSON.stringify([hole1, hole2])]
      );
    }

    let pot = 0n;
    let actionOrder = 1;
    if (sbSeat) {
      const sbStack = BigInt(sbSeat.stack);
      const post = sb > sbStack ? sbStack : sb;
      await pool.query(`UPDATE poker_seats SET stack = stack - $3::NUMERIC WHERE table_id = $1 AND player_address = $2`, [tableId, sbSeat.player_address, post.toString()]);
      await pool.query(
        `INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order") VALUES ($1, $2, 'preflop', 'blind', $3::NUMERIC, $4)`,
        [handId, sbSeat.player_address, post.toString(), actionOrder++]
      );
      pot += post;
    }
    if (bbSeat) {
      const bbStack = BigInt(bbSeat.stack);
      const post = bb > bbStack ? bbStack : bb;
      await pool.query(`UPDATE poker_seats SET stack = stack - $3::NUMERIC WHERE table_id = $1 AND player_address = $2`, [tableId, bbSeat.player_address, post.toString()]);
      await pool.query(
        `INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order") VALUES ($1, $2, 'preflop', 'blind', $3::NUMERIC, $4)`,
        [handId, bbSeat.player_address, post.toString(), actionOrder++]
      );
      pot += post;
    }

    await pool.query(`UPDATE poker_hands SET pot_amount = $2::NUMERIC WHERE id = $1`, [handId, pot.toString()]);
    await pool.query(`UPDATE poker_tables SET status = 'playing', hand_number = $2, button_position = $3 WHERE id = $1`, [tableId, handNumber, buttonSeatPos]);

    await pool.query(`UPDATE poker_hands SET acting_position = $2, turn_started_at = NOW() WHERE id = $1`, [handId, firstToAct]);

    return this.getTableState(tableId, null);
  }

  /**
   * Auto-fold any player whose 30-second turn timer has expired.
   * Called periodically by the WebSocket service watchdog.
   */
  async autoFoldTimedOutTurns(): Promise<string[]> {
    const pool = this.getPool();
    const timedOut = await pool.query(
      `SELECT h.id AS hand_id, h.table_id, h.acting_position, h.street,
              h.button_position, h.community_cards, h.pot_amount,
              h.hand_number, h.server_seed, h.client_seed, h.last_raise_size
       FROM poker_hands h
       WHERE h.completed_at IS NULL
         AND h.acting_position IS NOT NULL
         AND h.turn_started_at < NOW() - INTERVAL '30 seconds'`
    );
    const folded: string[] = [];
    for (const row of timedOut.rows) {
      try {
        const actingAddr = await this.getPlayerAtPosition(pool, row.hand_id, row.acting_position);
        if (!actingAddr) continue;
        const orderResult = await pool.query(
          'SELECT COALESCE(MAX("order"), 0) + 1 AS next_order FROM poker_hand_actions WHERE hand_id = $1',
          [row.hand_id]
        );
        const nextOrder = Number(orderResult.rows[0].next_order);
        await pool.query(
          `INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order") VALUES ($1, $2, $3, 'fold', 0, $4)`,
          [row.hand_id, actingAddr, row.street, nextOrder]
        );
        const tableRow = await pool.query(
          'SELECT small_blind, big_blind, max_seats FROM poker_tables WHERE id = $1',
          [row.table_id]
        );
        if (tableRow.rows.length === 0) continue;
        const table = tableRow.rows[0];
        const maxSeats = Number(table.max_seats) || 6;
        await this.advanceOrShowdown(pool, row.table_id, row.hand_id, row, table, maxSeats);
        await this.broadcastState(row.table_id);
        folded.push(actingAddr);
        logger.info('Auto-folded timed-out turn', { handId: row.hand_id, player: actingAddr });
      } catch (err) {
        logger.error('Error auto-folding timed-out turn', { handId: row.hand_id, error: err });
      }
    }
    return folded;
  }
}
