import { Pool } from 'pg';
import { Table, Card, CardRank, CardSuit, BettingRound } from '@chevtek/poker-engine';
import { DatabaseService } from './database.service';
import { ProvablyFairService } from './provably-fair.service';
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
  displayName?: string | null;
  profileImageUrl?: string | null;
  avatarConfig?: Record<string, unknown> | null;
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
  /** At showdown: winner(s), amount each receives, and optional hand name */
  winners?: { address: string; amount: string; handName?: string }[];
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

function totalPot(table: Table): number {
  const potSum = table.pots.reduce((sum, p) => sum + p.amount, 0);
  const betSum = table.players.reduce((sum, p) => sum + (p?.bet ?? 0), 0);
  return potSum + betSum;
}

// ---------------------------------------------------------------------------
// PokerGameService
// ---------------------------------------------------------------------------

export class PokerGameService {
  private broadcastCallback: ((tableId: string) => Promise<void>) | null = null;
  private activeTables: Map<string, Table> = new Map();

  constructor(
    private dbService: DatabaseService,
    private pfService: ProvablyFairService
  ) {}

  /** Wire in the WebSocket broadcast so actions push state to clients. */
  setBroadcastCallback(cb: (tableId: string) => Promise<void>): void {
    this.broadcastCallback = cb;
  }

  private getPool(): Pool {
    return this.dbService.getPool();
  }

  private normalizeAddress(addr: string): string {
    return (addr || '').trim().toLowerCase();
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

    this.activeTables.delete(tableId);
    await pool.query('DELETE FROM poker_tables WHERE id = $1', [tableId]);
    logger.info('Poker admin delete table', { tableId });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Seat management
  // ---------------------------------------------------------------------------

  async joinTable(tableId: string, playerAddress: string, buyInChips: string): Promise<PokerTableState> {
    const normalized = this.normalizeAddress(playerAddress);
    const buyIn = BigInt(buyInChips);
    if (buyIn <= 0n) throw new Error('Buy-in must be positive');

    let position = 0;

    await this.dbService.withTransaction(async (client) => {
      // Lock the player row first — serializes concurrent join attempts by the same wallet
      const playerLock = await client.query(
        `SELECT id FROM players WHERE LOWER(wallet_address) = LOWER($1) FOR UPDATE`,
        [normalized]
      );
      if (playerLock.rows.length === 0) throw new Error('Player not found');

      const tableResult = await client.query(
        'SELECT id, small_blind, big_blind, max_seats FROM poker_tables WHERE id = $1',
        [tableId]
      );
      if (tableResult.rows.length === 0) throw new Error('Table not found');
      const maxSeats = Number(tableResult.rows[0].max_seats) || 6;

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

      // Deduct balance atomically within the same transaction
      const deductResult = await client.query(
        `UPDATE players SET balance = balance - $2::NUMERIC
         WHERE LOWER(wallet_address) = LOWER($1) AND balance >= $2::NUMERIC
         RETURNING balance`,
        [normalized, buyIn.toString()]
      );
      if (deductResult.rows.length === 0) throw new Error('Insufficient balance');

      const positions = await client.query(
        'SELECT position FROM poker_seats WHERE table_id = $1',
        [tableId]
      );
      const used = new Set(positions.rows.map((r: any) => r.position));
      position = 0;
      while (used.has(position)) position++;

      await client.query(
        `INSERT INTO poker_seats (table_id, position, player_address, stack, status)
         VALUES ($1, $2, $3, $4::NUMERIC, 'active')`,
        [tableId, position, normalized, buyIn.toString()]
      );
    });

    // Sync in-memory table if it exists
    const activeTable = this.activeTables.get(tableId);
    if (activeTable && !activeTable.currentRound) {
      try {
        if (position === 0) {
          activeTable.sitDown(normalized, Number(buyIn));
        } else {
          activeTable.sitDown(normalized, Number(buyIn), position);
        }
      } catch {
        // If sitDown fails (e.g. already seated from previous run), ignore
      }
    }

    logger.info('Poker join', { tableId, playerAddress: normalized, buyIn: buyIn.toString(), position });

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
    const normalized = this.normalizeAddress(playerAddress);
    const pool = this.getPool();

    const seatResult = await pool.query(
      'SELECT id, stack, position FROM poker_seats WHERE table_id = $1 AND player_address = $2',
      [tableId, normalized]
    );
    if (seatResult.rows.length === 0) throw new Error('Not seated at this table');

    const stack = BigInt(seatResult.rows[0].stack || '0');

    const activeHandResult = await pool.query(
      `SELECT id FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL LIMIT 1`,
      [tableId]
    );

    // If there's an active hand, use chevtek standUp so it handles fold + advance
    const activeTable = this.activeTables.get(tableId);
    if (activeHandResult.rows.length > 0 && activeTable) {
      try {
        // standUp folds the player and calls nextAction() if they were acting
        activeTable.standUp(normalized);

        // Persist any state changes from standUp
        const handId = activeHandResult.rows[0].id;
        await this.persistActionAfterStandUp(pool, tableId, handId, normalized, activeTable);
      } catch (err) {
        logger.warn('standUp error on leaveTable', { tableId, playerAddress: normalized, err });
      }
    }

    await pool.query('DELETE FROM poker_seats WHERE table_id = $1 AND player_address = $2', [tableId, normalized]);
    if (stack > 0n) {
      await this.dbService.addBalanceToAddress(playerAddress, stack);
    }

    logger.info('Poker leave', { tableId, playerAddress: normalized, stack: stack.toString() });

    return this.getTableState(tableId, null);
  }

  private async persistActionAfterStandUp(
    pool: Pool,
    tableId: string,
    handId: string,
    playerAddress: string,
    table: Table
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
      await this.persistShowdown(pool, tableId, handId, table);
      await this.broadcastState(tableId);
      setTimeout(async () => {
        await this.tryStartNextHand(tableId);
        await this.broadcastState(tableId);
      }, 5000);
    } else if (!table.currentRound) {
      // No winners yet but round ended — update acting position
      await pool.query(
        'UPDATE poker_hands SET acting_position = NULL WHERE id = $1',
        [handId]
      );
    } else {
      // Update acting position and pot
      const pot = totalPot(table);
      const actingPos = table.currentPosition ?? null;
      await pool.query(
        'UPDATE poker_hands SET acting_position = $2, pot_amount = $3::NUMERIC, turn_started_at = NOW() WHERE id = $1',
        [handId, actingPos, pot.toString()]
      );
      await this.syncSeatsFromTable(pool, tableId, table);
    }
  }

  async addChips(tableId: string, playerAddress: string, amount: string): Promise<PokerTableState> {
    const normalized = this.normalizeAddress(playerAddress);
    const chips = BigInt(amount);
    if (chips <= 0n) throw new Error('Amount must be positive');

    await this.dbService.withTransaction(async (client) => {
      // Lock the player row to serialize concurrent addChips calls
      const playerLock = await client.query(
        `SELECT id FROM players WHERE LOWER(wallet_address) = LOWER($1) FOR UPDATE`,
        [normalized]
      );
      if (playerLock.rows.length === 0) throw new Error('Player not found');

      const seatResult = await client.query(
        'SELECT id FROM poker_seats WHERE table_id = $1 AND player_address = $2',
        [tableId, normalized]
      );
      if (seatResult.rows.length === 0) throw new Error('Not seated at this table');

      const deductResult = await client.query(
        `UPDATE players SET balance = balance - $2::NUMERIC
         WHERE LOWER(wallet_address) = LOWER($1) AND balance >= $2::NUMERIC
         RETURNING balance`,
        [normalized, chips.toString()]
      );
      if (deductResult.rows.length === 0) throw new Error('Insufficient balance');

      await client.query(
        'UPDATE poker_seats SET stack = stack + $3::NUMERIC WHERE table_id = $1 AND player_address = $2',
        [tableId, normalized, chips.toString()]
      );
    });

    logger.info('Poker add chips', { tableId, playerAddress: normalized, amount: chips.toString() });
    return this.getTableState(tableId, normalized);
  }

  // ---------------------------------------------------------------------------
  // getTableState
  // ---------------------------------------------------------------------------

  async getTableState(tableId: string, forPlayer: string | null): Promise<PokerTableState> {
    const pool = this.getPool();
    const forPlayerAddr = forPlayer ? this.normalizeAddress(forPlayer) : null;

    const tableRow = await pool.query(
      'SELECT id, small_blind, big_blind, max_seats, status FROM poker_tables WHERE id = $1',
      [tableId]
    );
    if (tableRow.rows.length === 0) throw new Error('Table not found');
    const tbl = tableRow.rows[0];
    const maxSeats = Number(tbl.max_seats) || 6;
    const bigBlind = Number(tbl.big_blind ?? 0);

    // Load DB seats
    const seatsResult = await pool.query(
      'SELECT position, player_address, stack, status FROM poker_seats WHERE table_id = $1 ORDER BY position',
      [tableId]
    );
    const dbSeatMap = new Map<number, { playerAddress: string; stack: string; status: string }>();
    for (const r of seatsResult.rows) {
      dbSeatMap.set(r.position, {
        playerAddress: r.player_address,
        stack: r.stack?.toString() ?? '0',
        status: r.status,
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
          stack = livePlayer.stackSize.toString();
          currentBet = livePlayer.bet.toString();
        }
      }

      seats.push({
        position: pos,
        playerAddress: s?.playerAddress ?? null,
        stack,
        status: s?.status ?? 'empty',
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: false,
        isActing: false,
        folded: false,
        currentBet,
      });
    }

    const seatAddresses = seats.map((s) => s.playerAddress).filter((a): a is string => !!a);
    if (seatAddresses.length > 0) {
      const profiles = await this.dbService.getProfiles(seatAddresses);
      for (const seat of seats) {
        if (!seat.playerAddress) continue;
        const normalized = this.normalizeAddress(seat.playerAddress);
        const profile = profiles.get(normalized);
        if (profile) {
          seat.displayName = profile.displayName;
          seat.profileImageUrl = profile.profileImageUrl;
          seat.avatarConfig = profile.avatarConfig;
        }
      }
    }

    let currentHand: PokerCurrentHand | null = null;
    let myHoleCards: number[] | null = null;

    const handRow = await pool.query(
      `SELECT id, hand_number, button_position, community_cards, pot_amount, street,
              acting_position, turn_started_at, result, last_raise_size
       FROM poker_hands WHERE table_id = $1
         AND (completed_at IS NULL OR (street = 'showdown' AND completed_at > NOW() - INTERVAL '8 seconds'))
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

      const actingPosition: number | null = h.acting_position != null ? Number(h.acting_position) : null;
      const street: PokerStreet = h.street;

      // Fold/dealer/blind flags
      const foldResult = await pool.query(
        `SELECT player_address FROM poker_hand_actions WHERE hand_id = $1 AND action = 'fold'`,
        [handId]
      );
      const foldedSet = new Set(foldResult.rows.map((r: any) => r.player_address));

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

      // toCall and minRaise from live table
      let toCall = '0';
      let minRaise = bigBlind.toString();

      if (liveTable && liveTable.currentRound && actingPosition != null) {
        const actor = liveTable.players[actingPosition];
        if (actor) {
          const toCallNum = liveTable.currentBet !== undefined
            ? Math.max(0, liveTable.currentBet - actor.bet)
            : 0;
          toCall = toCallNum.toString();
          const minRaiseNum = (liveTable.currentBet ?? 0) + Math.max(liveTable.lastRaise ?? bigBlind, bigBlind);
          minRaise = minRaiseNum.toString();
        }
      } else if (actingPosition != null) {
        // Fall back to DB-computed values
        const lastRaiseSize = Number(h.last_raise_size ?? 0);
        const minRaiseIncrement = Math.max(lastRaiseSize, bigBlind);
        // toCall: from actions
        const contribResult = await pool.query(
          `SELECT player_address, SUM(amount) AS total FROM poker_hand_actions
           WHERE hand_id = $1 AND street = $2 AND action IN ('bet','raise','call','blind')
           GROUP BY player_address`,
          [handId, street]
        );
        let maxContrib = 0n;
        let myContrib = 0n;
        const actingAddr = dbSeatMap.get(actingPosition)?.playerAddress ?? null;
        for (const row of contribResult.rows) {
          const t = BigInt(row.total ?? '0');
          if (t > maxContrib) maxContrib = t;
          if (actingAddr && row.player_address === actingAddr) myContrib = t;
        }
        const toCallBig = maxContrib > myContrib ? maxContrib - myContrib : 0n;
        toCall = toCallBig.toString();
        minRaise = (toCallBig + BigInt(minRaiseIncrement)).toString();
      }

      // Last action
      const actionsResult = await pool.query(
        `SELECT player_address, action, amount FROM poker_hand_actions
         WHERE hand_id = $1 AND action NOT IN ('blind')
         ORDER BY "order" DESC LIMIT 1`,
        [handId]
      );
      let lastAction: PokerCurrentHand['lastAction'] = null;
      if (actionsResult.rows.length > 0) {
        const la = actionsResult.rows[0];
        const pos = seats.findIndex((s) => s.playerAddress === la.player_address);
        if (pos >= 0) {
          lastAction = { position: pos, action: la.action, amount: la.amount?.toString() ?? '0' };
        }
      }

      // Pot: prefer live table total
      const potStr = liveTable && liveTable.currentRound
        ? totalPot(liveTable).toString()
        : (h.pot_amount?.toString() ?? '0');

      // Update seat flags
      for (const seat of seats) {
        if (!seat.playerAddress) continue;
        const pos = seat.position;
        seat.isDealer = pos === dealerPos;
        seat.isSmallBlind = pos === sbPos;
        seat.isBigBlind = pos === bbPos;
        seat.isActing = actingPosition === pos;
        seat.folded = foldedSet.has(seat.playerAddress);
        // Live bet override if not done above
        if (liveTable) {
          const livePlayer = liveTable.players[pos];
          if (livePlayer && livePlayer.id === seat.playerAddress) {
            seat.currentBet = livePlayer.bet.toString();
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
        minRaise,
        toCall,
        turnStartedAt: h.turn_started_at ? new Date(h.turn_started_at).toISOString() : null,
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

      // Showdown: reveal all hands and winners
      if (street === 'showdown') {
        const allHoleResult = await pool.query(
          'SELECT player_address, cards FROM poker_hand_hole_cards WHERE hand_id = $1',
          [handId]
        );
        const showdownHands: Record<string, number[]> = {};
        for (const row of allHoleResult.rows) {
          const cards = Array.isArray(row.cards) ? row.cards : JSON.parse(row.cards ?? '[]');
          showdownHands[row.player_address] = cards;
        }
        currentHand.showdownHands = showdownHands;

        if (h.result) {
          try {
            const parsed = typeof h.result === 'string' ? JSON.parse(h.result) : h.result;
            if (parsed?.winners?.length) {
              currentHand.winners = parsed.winners.map((w: any) => ({
                address: (w.address || '').toLowerCase(),
                amount: String(w.amount ?? '0'),
                handName: w.handName,
              }));
            }
          } catch {
            // ignore
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

  // ---------------------------------------------------------------------------
  // startHand
  // ---------------------------------------------------------------------------

  async startHand(tableId: string): Promise<PokerTableState | null> {
    const pool = this.getPool();
    const tableResult = await pool.query(
      'SELECT id, small_blind, big_blind, max_seats, hand_number, button_position FROM poker_tables WHERE id = $1',
      [tableId]
    );
    if (tableResult.rows.length === 0) throw new Error('Table not found');
    const tblRow = tableResult.rows[0];
    const maxSeats = Number(tblRow.max_seats) || 6;
    const sb = Number(tblRow.small_blind);
    const bb = Number(tblRow.big_blind);

    const seatsResult = await pool.query(
      'SELECT position, player_address, stack FROM poker_seats WHERE table_id = $1 ORDER BY position',
      [tableId]
    );
    const withStack = seatsResult.rows.filter((r: any) => BigInt(r.stack ?? '0') > 0n);
    if (withStack.length < 2) return null;

    // Build or reset the in-memory Table
    // We use minBuyIn=0 to allow any stack size
    const table = new Table(0, sb, bb);
    // autoMoveDealer=true: chevtek will advance dealer each hand. We need to
    // prime the dealer position so the FIRST call to dealCards() moves correctly.
    // dealCards() calls moveDealer(dealerPosition + 1) when handNumber > 1.
    // Since this is a fresh Table (handNumber=0), it won't auto-move on first deal.
    // We call moveDealer() explicitly to set up SB/BB before dealCards().

    // Sit all players at their DB positions
    for (const seat of withStack) {
      const pos = Number(seat.position);
      const addr = (seat.player_address || '').toLowerCase();
      const stack = Number(BigInt(seat.stack));
      if (pos === 0) {
        table.sitDown(addr, stack);
      } else {
        table.sitDown(addr, stack, pos);
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

    // Generate seeds for DB record (deck is chevtek's internal shuffle)
    const handNumber = Number(tblRow.hand_number) + 1;
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const serverSeedHash = this.pfService.createServerSeedHash(serverSeed);
    const clientSeed = crypto.randomBytes(16).toString('hex');

    // Deal cards (sets currentRound, posts blinds, sets currentPosition, shuffles deck internally)
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

    // Extract blind amounts from table state
    const sbPlayer = table.players[table.smallBlindPosition!];
    const bbPlayer = table.players[table.bigBlindPosition!];
    const sbBlind = sbPlayer ? sbPlayer.bet : sb;  // bet already deducted by dealCards
    const bbBlind = bbPlayer ? bbPlayer.bet : bb;

    // Insert hand into DB
    const pot = totalPot(table);
    const handInsert = await pool.query(
      `INSERT INTO poker_hands
         (table_id, hand_number, button_position, server_seed_hash, server_seed, client_seed,
          community_cards, pot_amount, street, acting_position, turn_started_at, last_raise_size)
       VALUES ($1, $2, $3, $4, $5, $6, '[]'::JSONB, $7::NUMERIC, 'preflop', $8, NOW(), $9)
       RETURNING id`,
      [
        tableId,
        handNumber,
        table.dealerPosition,
        serverSeedHash,
        serverSeed,
        clientSeed,
        pot.toString(),
        table.currentPosition ?? null,
        bb.toString(),
      ]
    );
    const handId: string = handInsert.rows[0].id;

    // Insert hole cards
    for (const [addr, cards] of holeCardsByAddr) {
      await pool.query(
        `INSERT INTO poker_hand_hole_cards (hand_id, player_address, cards)
         VALUES ($1, $2, $3::JSONB)`,
        [handId, addr, JSON.stringify(cards)]
      );
    }

    // Insert blind actions
    let actionOrder = 1;
    if (sbPlayer) {
      await pool.query(
        `INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order")
         VALUES ($1, $2, 'preflop', 'blind', $3::NUMERIC, $4)`,
        [handId, sbPlayer.id, sbBlind.toString(), actionOrder++]
      );
    }
    if (bbPlayer) {
      await pool.query(
        `INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order")
         VALUES ($1, $2, 'preflop', 'blind', $3::NUMERIC, $4)`,
        [handId, bbPlayer.id, bbBlind.toString(), actionOrder++]
      );
    }

    // Update poker_tables
    await pool.query(
      `UPDATE poker_tables SET status = 'playing', hand_number = $2, button_position = $3 WHERE id = $1`,
      [tableId, handNumber, table.dealerPosition]
    );

    // Sync seat stacks (blinds already deducted by chevtek)
    await this.syncSeatsFromTable(pool, tableId, table);

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
    const normalized = this.normalizeAddress(playerAddress);
    const pool = this.getPool();

    // Validate hand
    const handRow = await pool.query(
      'SELECT * FROM poker_hands WHERE id = $1 AND table_id = $2 AND completed_at IS NULL',
      [handId, tableId]
    );
    if (handRow.rows.length === 0) throw new Error('Hand not found or already completed');

    // Get or reconstruct live table
    let table = this.activeTables.get(tableId);
    if (!table) {
      table = await this.reconstructTable(tableId, pool);
      this.activeTables.set(tableId, table);
    }

    // Validate it's this player's turn
    const actor = table.currentActor;
    if (!actor) throw new Error('No acting player');
    if (actor.id !== normalized) throw new Error('Not your turn');

    // Capture street before action (for DB recording)
    const streetBefore = chevtekStreetToPoker(table.currentRound, !!table.winners);

    // Perform action
    const tableRow = await pool.query(
      'SELECT big_blind FROM poker_tables WHERE id = $1',
      [tableId]
    );
    const bb = Number(tableRow.rows[0].big_blind);
    /** Effective amount for bet/raise (clamped to stack); used for DB record. */
    let effectiveActionAmount: number | null = null;

    switch (action) {
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
        let amt = Number(amount ?? '0');
        if (!Number.isFinite(amt) || amt < 0) amt = 0;
        amt = Math.min(amt, actor.stackSize);
        if (amt === 0 && actor.stackSize === 0) throw new Error('You are already all-in');
        effectiveActionAmount = amt;
        actor.betAction(amt);
        break;
      }
      case 'raise': {
        let amt = Number(amount ?? '0');
        if (!Number.isFinite(amt) || amt < 0) amt = 0;
        amt = Math.min(amt, actor.stackSize);
        if (amt === 0 && actor.stackSize === 0) throw new Error('You are already all-in');
        effectiveActionAmount = amt;
        actor.raiseAction(amt);
        break;
      }
      default:
        throw new Error('Invalid action');
    }

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

    // Record action (use effective clamped amount for bet/raise)
    const actionAmount = effectiveActionAmount !== null
      ? effectiveActionAmount
      : (action === 'fold' || action === 'check' ? 0 : Number(amount ?? '0'));
    await pool.query(
      `INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order")
       VALUES ($1, $2, $3, $4, $5::NUMERIC, $6)`,
      [handId, normalized, streetBefore, action, actionAmount.toString(), nextOrder]
    );

    if (isShowdown) {
      // Persist showdown results
      await this.persistShowdown(pool, tableId, handId, table);
      await this.broadcastState(tableId);
      setTimeout(async () => {
        await this.tryStartNextHand(tableId);
        await this.broadcastState(tableId);
      }, 5000);
    } else {
      // Update community cards, pot, acting position, street
      const communityInts = table.communityCards.map(cardToInt);
      const pot = totalPot(table);
      const actingPos = table.currentPosition ?? null;
      const lastRaise = table.lastRaise ?? bb;

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
          pot.toString(),
          (streetChanged ? bb : lastRaise).toString(),
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
    // Credit stacks from chevtek's showdown calculation
    // table.winners is the overall winner list; table.pots[].winners has per-pot winners
    const resultWinners: { address: string; amount: string; handName?: string }[] = [];

    // We need to know how much each player won — compute by comparing pre/post stacks.
    // Chevtek already credited stackSize in showdown(). We sync those values to DB.
    await this.syncSeatsFromTable(pool, tableId, table);

    // Build winners list from table.pots, explicitly skipping folded players.
    // chevtek's gatherBets() has an early-return when bettingPlayers.length <= 1
    // (e.g. everyone checked the river) that skips removing folded players from
    // pot.eligiblePlayers, so findWinners() can incorrectly include them.
    const winnerAmounts = new Map<string, number>();
    for (const pot of table.pots) {
      if (!pot.winners || pot.winners.length === 0) continue;
      const nonFoldedWinners = pot.winners.filter((w: any) => !w.folded);
      if (nonFoldedWinners.length === 0) continue;
      const share = pot.amount / nonFoldedWinners.length;
      for (const w of nonFoldedWinners) {
        winnerAmounts.set(w.id, (winnerAmounts.get(w.id) ?? 0) + share);
      }
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

    for (const [addr, amount] of winnerAmounts) {
      const holeCards = holeCardsByAddr.get(addr) ?? [];
      const allCards = [...holeCards, ...communityInts];
      let handName: string | undefined;
      if (allCards.length >= 5) {
        // Use chevtek's pokersolver hand description
        const livePlayer = table.players.find((p) => p?.id === addr);
        if (livePlayer?.hand) {
          handName = livePlayer.hand.descr ?? undefined;
        }
      }
      resultWinners.push({ address: addr, amount: Math.round(amount).toString(), handName });
    }

    const communityInts2 = table.communityCards.map(cardToInt);
    await pool.query(
      `UPDATE poker_hands
       SET completed_at = NOW(), street = 'showdown', acting_position = NULL,
           community_cards = $2::JSONB, result = $3::JSONB
       WHERE id = $1`,
      [handId, JSON.stringify(communityInts2), JSON.stringify({ winners: resultWinners })]
    );
    await pool.query('UPDATE poker_tables SET status = $2 WHERE id = $1', [tableId, 'waiting']);
  }

  // ---------------------------------------------------------------------------
  // autoFoldTimedOutTurns
  // ---------------------------------------------------------------------------

  async autoFoldTimedOutTurns(): Promise<string[]> {
    const pool = this.getPool();
    const timedOut = await pool.query(
      `SELECT h.id AS hand_id, h.table_id, h.acting_position
       FROM poker_hands h
       WHERE h.completed_at IS NULL
         AND h.acting_position IS NOT NULL
         AND h.turn_started_at < NOW() - INTERVAL '30 seconds'`
    );

    const folded: string[] = [];
    for (const row of timedOut.rows) {
      try {
        let table = this.activeTables.get(row.table_id);
        if (!table) {
          table = await this.reconstructTable(row.table_id, pool);
          this.activeTables.set(row.table_id, table);
        }

        const actor = table.currentActor;
        if (!actor) continue;

        const actingAddr = actor.id;

        // Capture street before
        const streetBefore = chevtekStreetToPoker(table.currentRound, !!table.winners);

        // Fold
        actor.foldAction();

        // Record fold action
        const orderResult = await pool.query(
          'SELECT COALESCE(MAX("order"), 0) + 1 AS next_order FROM poker_hand_actions WHERE hand_id = $1',
          [row.hand_id]
        );
        const nextOrder = Number(orderResult.rows[0].next_order);
        await pool.query(
          `INSERT INTO poker_hand_actions (hand_id, player_address, street, action, amount, "order")
           VALUES ($1, $2, $3, 'fold', 0, $4)`,
          [row.hand_id, actingAddr, streetBefore, nextOrder]
        );

        if (!table.currentRound && table.winners) {
          await this.persistShowdown(pool, row.table_id, row.hand_id, table);
          await this.broadcastState(row.table_id);
          const tid = row.table_id;
          setTimeout(async () => {
            await this.tryStartNextHand(tid);
            await this.broadcastState(tid);
          }, 5000);
        } else {
          const communityInts = table.communityCards.map(cardToInt);
          const pot = totalPot(table);
          const actingPos = table.currentPosition ?? null;
          const newStreet = chevtekStreetToPoker(table.currentRound, false);
          await pool.query(
            `UPDATE poker_hands
             SET street = $2, community_cards = $3::JSONB, acting_position = $4,
                 pot_amount = $5::NUMERIC, turn_started_at = NOW()
             WHERE id = $1`,
            [row.hand_id, newStreet, JSON.stringify(communityInts), actingPos, pot.toString()]
          );
          await this.syncSeatsFromTable(pool, row.table_id, table);
          await this.broadcastState(row.table_id);
        }

        folded.push(actingAddr);
        logger.info('Auto-folded timed-out turn', { handId: row.hand_id, player: actingAddr });
      } catch (err) {
        logger.error('Error auto-folding timed-out turn', { handId: row.hand_id, error: err });
      }
    }
    return folded;
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
    const sb = Number(tbl.small_blind);
    const bb = Number(tbl.big_blind);
    const maxSeats = Number(tbl.max_seats) || 6;

    const activeHand = await pool.query(
      `SELECT * FROM poker_hands WHERE table_id = $1 AND completed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [tableId]
    );

    const seatsResult = await pool.query(
      'SELECT position, player_address, stack FROM poker_seats WHERE table_id = $1 ORDER BY position',
      [tableId]
    );

    const table = new Table(0, sb, bb);

    if (activeHand.rows.length === 0) {
      // No active hand — just seat players
      for (const seat of seatsResult.rows) {
        if (!seat.player_address || BigInt(seat.stack ?? '0') === 0n) continue;
        const pos = Number(seat.position);
        const addr = (seat.player_address || '').toLowerCase();
        const stack = Number(BigInt(seat.stack));
        if (pos === 0) {
          table.sitDown(addr, stack);
        } else {
          table.sitDown(addr, stack, pos);
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
    const dealtAddrs = new Set(holeCardsResult.rows.map((r: any) => r.player_address));

    // Sit only dealt players (using their stacks from DB seats)
    // We need stacks BEFORE any street betting for the replay to work.
    // We'll sit them with current DB stack and let replay reconstruct.
    // Actually, we need to compute their stacks AT THE START of the hand.
    // The easiest approach: sit with current stack + what they've bet/committed so far.
    const actionsResult = await pool.query(
      `SELECT player_address, action, amount FROM poker_hand_actions WHERE hand_id = $1 ORDER BY "order"`,
      [hand.id]
    );

    // Compute chips committed per player (bet/raise/call/blind)
    const committed = new Map<string, number>();
    for (const row of actionsResult.rows) {
      const addr = (row.player_address || '').toLowerCase();
      if (['bet', 'raise', 'call', 'blind'].includes(row.action)) {
        committed.set(addr, (committed.get(addr) ?? 0) + Number(row.amount ?? 0));
      }
    }

    // Sit players with reconstructed starting stacks
    const seatMap = new Map<number, any>();
    for (const seat of seatsResult.rows) {
      seatMap.set(Number(seat.position), seat);
    }

    for (const seat of seatsResult.rows) {
      const addr = (seat.player_address || '').toLowerCase();
      if (!dealtAddrs.has(addr)) continue;
      const pos = Number(seat.position);
      const currentStack = Number(BigInt(seat.stack ?? '0'));
      const totalCommitted = committed.get(addr) ?? 0;
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
    for (const actionRow of nonBlindActions) {
      const actor = table.currentActor;
      if (!actor) break;

      const addr = (actionRow.player_address || '').toLowerCase();
      if (actor.id !== addr) {
        // State mismatch — stop replay
        logger.warn('Reconstruct: actor mismatch during replay', {
          tableId,
          expected: actor.id,
          got: addr,
        });
        break;
      }

      try {
        switch (actionRow.action) {
          case 'fold': actor.foldAction(); break;
          case 'check': actor.checkAction(); break;
          case 'call': actor.callAction(); break;
          case 'bet': actor.betAction(Number(actionRow.amount)); break;
          case 'raise': actor.raiseAction(Number(actionRow.amount)); break;
        }
      } catch (err) {
        logger.warn('Reconstruct: replay action failed', { tableId, action: actionRow.action, err });
        break;
      }
    }

    return table;
  }

  // ---------------------------------------------------------------------------
  // tryStartNextHand
  // ---------------------------------------------------------------------------

  private async tryStartNextHand(tableId: string): Promise<void> {
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
    if (withStack.length < 2) return;

    await this.startHand(tableId);
  }

  // ---------------------------------------------------------------------------
  // syncSeatsFromTable
  // ---------------------------------------------------------------------------

  private async syncSeatsFromTable(pool: Pool, tableId: string, table: Table): Promise<void> {
    for (const player of table.players) {
      if (!player) continue;
      await pool.query(
        'UPDATE poker_seats SET stack = $3::NUMERIC WHERE table_id = $1 AND player_address = $2',
        [tableId, player.id, player.stackSize.toString()]
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
}
