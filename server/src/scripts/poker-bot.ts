/**
 * Poker Bot Script
 *
 * Spawns 1-10 AI bot opponents that join a poker table and play automatically.
 * Bots use a simple strategy: tight-aggressive preflop, semi-random postflop.
 *
 * Usage (from server/ directory):
 *   npx ts-node src/scripts/poker-bot.ts [tableId] [numBots]
 *
 * If tableId is omitted, the script lists tables and uses the first with empty seats,
 * or creates a new table. numBots is 1-10 (default 2).
 *
 * Or via npm script:
 *   npm run poker:bot -- [tableId] [numBots]
 *
 * Env:
 *   NEXT_PUBLIC_WEBSOCKET_URL or WS_URL - WebSocket URL
 *   DATABASE_URL - PostgreSQL connection string (to give bots balance)
 *   POKER_BOT_BUY_IN - Buy-in amount in human chips (default: 1000)
 *   POKER_BOT_ADDRESSES - Comma-separated bot wallet addresses (preferred in production)
 *   CYPRESS_POKER_TEST_PLAYERS / POKER_TEST_PLAYERS - fallback wallet list
 */

import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config();

import WebSocket from 'ws';
import { Pool } from 'pg';
import { randomPlaceholderConfig } from '../lib/cosmetics-catalog';

// --------------- Config ---------------

const WS_URL =
  process.env.NEXT_PUBLIC_WEBSOCKET_URL ||
  process.env.WS_URL ||
  'ws://localhost:3001';

const DATABASE_URL = process.env.DATABASE_URL;

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const MAX_BOTS = 10;

// Default list mirrors Cypress poker real-backend players.
const CYPRESS_DEFAULT_ADDRESSES = [
  '0x2775dd8242c4f589536113475b7c80f42ab4a70a',
  '0x70444750eedf1b2c9b777cbf096a5919a14895e5',
  '0xEdEe8515897281CcF27999a121A90d76E3Cde016',
  '0x41682815B05fE6b54a6C0f8813bB99423EE0309D',
  '0x031E727436173278B92Dad7405fc94FBfc4A18a6',
  '0x33cedDc21b78414b1a59ba70Ede0B27761FfA556',
  '0x1b9894ddEf9c19b9a971FBE9fba85135B9348Db0',
  '0x2D6f6a61cFDc7C7d000C9279bD7a743D277736bB',
  '0x7aC342321a814c66A0cc38E997DBEC46b8dE8372',
  '0xaA899ca4658C17B9fFa52490219540c9d49AA86f',
  '0x8f6Dc8FD8A5115fdec3CCbE36BE6cf9B28635F2e',
  '0xAfd3Cc199167B396be71911637fcb30bAF22cC67',
];

function parseAddressCsv(input?: string): string[] {
  if (!input) return [];
  return [...new Set(
    input
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
      .filter((a) => ADDRESS_RE.test(a))
      .map((a) => a.toLowerCase())
  )];
}

function getBotAddresses(): string[] {
  const envPreferred = parseAddressCsv(process.env.POKER_BOT_ADDRESSES);
  if (envPreferred.length > 0) {
    return envPreferred;
  }
  const cypressFallback = parseAddressCsv(process.env.CYPRESS_POKER_TEST_PLAYERS);
  const genericFallback = parseAddressCsv(process.env.POKER_TEST_PLAYERS);
  const fallback = cypressFallback.length > 0 ? cypressFallback : genericFallback;
  if (fallback.length > 0) {
    return fallback;
  }
  return CYPRESS_DEFAULT_ADDRESSES.map((a) => a.toLowerCase());
}

const BOT_ADDRESSES = getBotAddresses();

const BUY_IN_HUMAN = process.env.POKER_BOT_BUY_IN || '1000';
// Convert human-readable chips to wei (1 chip = 1e18 wei)
const BUY_IN_WEI = BigInt(BUY_IN_HUMAN) * 10n ** 18n;

// Bot thinking delay range (ms) — makes it feel more human
const THINK_MIN_MS = 800;
const THINK_MAX_MS = 2500;

// --------------- WebSocket helpers ---------------

/** Normalize WS message to string (handles Buffer, Buffer[], ArrayBuffer). */
function dataToString(data: WebSocket.Data): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data as Buffer[]).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return String(data);
}

/** Parse JSON from WebSocket message; log and rethrow on invalid JSON. */
function parseMessage(data: WebSocket.Data): Record<string, unknown> {
  const raw = dataToString(data);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Bot] Invalid JSON:', msg, '| raw (first 200 chars):', raw.slice(0, 200));
    throw err;
  }
  console.error('[Bot] Message was not a JSON object | raw:', raw.slice(0, 200));
  throw new Error('Invalid JSON: expected object');
}

function formatError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  try {
    const raw = JSON.stringify(err);
    if (raw && raw !== '{}') return raw;
  } catch {
    // ignore
  }
  return String(err || 'Unknown error');
}

function createWsClient(address: string): Promise<WebSocket> {
  const url = WS_URL.replace(/^https/, 'wss').replace(/^http/, 'ws');
  const withAuth = `${url}${url.includes('?') ? '&' : '?'}address=${address.toLowerCase()}`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(withAuth);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WS connect timeout'));
    }, 15000);
    const cleanup = () => {
      clearTimeout(timeout);
      ws.removeAllListeners('open');
      ws.removeAllListeners('error');
      ws.removeAllListeners('close');
    };
    ws.on('open', () => {
      cleanup();
      resolve(ws);
    });
    ws.on('error', (err) => {
      cleanup();
      reject(new Error(`WS connect error: ${formatError(err)}`));
    });
    ws.on('close', (code, reason) => {
      cleanup();
      reject(new Error(`WS closed before open (code=${code}, reason=${reason.toString('utf8') || 'n/a'})`));
    });
  });
}

function waitForAuth(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Auth timeout')), 10000);
    const handler = (data: WebSocket.Data) => {
      try {
        const msg = parseMessage(data);
        if (
          msg.type === 'auth_success' ||
          msg.type === 'connection_established'
        ) {
          clearTimeout(timeout);
          ws.removeListener('message', handler);
          resolve();
        }
        if (msg.type === 'auth_challenge' && (msg.payload as any)?.claimedAddress) {
          clearTimeout(timeout);
          ws.removeListener('message', handler);
          reject(new Error(
            'Server requires signed WebSocket auth challenge. Bots cannot sign. Set DISABLE_WS_AUTH=true on server for local bot testing.'
          ));
        }
        if (msg.type === 'error') {
          clearTimeout(timeout);
          ws.removeListener('message', handler);
          reject(new Error((msg.payload as any)?.message || 'Auth failed'));
        }
      } catch {
        /* ignore non-JSON or non-matching messages */
      }
    };
    ws.on('message', handler);
  });
}

function sendRequest(ws: WebSocket, type: string, payload: Record<string, unknown>): Promise<any> {
  const requestId = `bot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error(`Request timeout: ${type}`));
    }, 30000);

    const handler = (data: WebSocket.Data) => {
      try {
        const msg = parseMessage(data);
        if (msg.requestId !== requestId) return;
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        if (msg.type === 'error') {
          const payload = msg.payload as any;
          reject(new Error(payload?.message || payload?.error || 'Request failed'));
        } else {
          resolve(msg.payload);
        }
      } catch {
        /* ignore parse errors for non-matching messages */
      }
    };

    ws.on('message', handler);
    ws.send(JSON.stringify({ type, payload, requestId }));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function thinkDelay(): Promise<void> {
  return sleep(THINK_MIN_MS + Math.random() * (THINK_MAX_MS - THINK_MIN_MS));
}

// --------------- Bot AI Strategy ---------------

interface BotState {
  tableId: string;
  handId: string | null;
  street: string;
  pot: string;
  toCall: string;
  minRaise: string;
  myPosition: number;
  actingPosition: number | null;
  myStack: string;
  myHoleCards: number[] | null;
  communityCards: number[];
}

function parseState(payload: any, botAddress: string): BotState | null {
  if (!payload) return null;
  const seats = payload.seats || [];
  const mySeat = seats.find((s: any) => s.playerAddress?.toLowerCase() === botAddress.toLowerCase());
  if (!mySeat) return null;
  const hand = payload.currentHand;
  return {
    tableId: payload.tableId,
    handId: hand?.handId ?? null,
    street: hand?.street ?? 'waiting',
    pot: hand?.pot ?? '0',
    toCall: hand?.toCall ?? '0',
    minRaise: hand?.minRaise ?? '0',
    myPosition: mySeat.position,
    actingPosition: hand?.actingPosition ?? null,
    myStack: mySeat.stack,
    myHoleCards: payload.myHoleCards ?? null,
    communityCards: hand?.communityCards ?? [],
  };
}

/** Simple hand strength heuristic (0-1) for preflop hole cards. */
function preflopStrength(cards: number[]): number {
  if (!cards || cards.length < 2) return 0.3;
  const r1 = cards[0] % 13; // 0=A, 1=2, ..., 12=K
  const r2 = cards[1] % 13;
  const s1 = Math.floor(cards[0] / 13);
  const s2 = Math.floor(cards[1] / 13);
  const suited = s1 === s2;
  const hi = Math.max(r1, r2);
  const lo = Math.min(r1, r2);

  // Pocket pair
  if (r1 === r2) {
    if (r1 === 0) return 0.95; // AA
    if (r1 >= 10) return 0.88; // KK, QQ, JJ
    if (r1 >= 7) return 0.72;
    return 0.55;
  }

  // Ace-high
  if (hi === 0 || lo === 0) {
    const kicker = hi === 0 ? lo : hi;
    if (kicker >= 10) return suited ? 0.82 : 0.75; // AK, AQ, AJ
    if (kicker >= 7) return suited ? 0.62 : 0.55;
    return suited ? 0.45 : 0.35;
  }

  // Connected / broadway
  const gap = Math.abs(r1 - r2);
  let score = 0.25;
  if (hi >= 9 && lo >= 9) score += 0.35; // Both broadway
  else if (hi >= 9) score += 0.15;
  if (gap <= 1) score += 0.15; // Connected
  else if (gap <= 2) score += 0.08;
  if (suited) score += 0.1;

  return Math.min(score, 0.9);
}

/**
 * Decide what action to take. Returns { action, amount? }.
 * Strategy: tight-aggressive preflop, semi-random postflop.
 */
function decideAction(state: BotState): { action: string; amount?: string } {
  const toCall = BigInt(state.toCall || '0');
  const pot = BigInt(state.pot || '0');
  const minRaise = BigInt(state.minRaise || '0');
  const stack = BigInt(state.myStack || '0');
  const canCheck = toCall === 0n;
  const rand = Math.random();

  // ---- Preflop ----
  if (state.street === 'preflop') {
    const strength = preflopStrength(state.myHoleCards ?? []);

    // Premium hands: raise/re-raise
    if (strength >= 0.8) {
      const raiseAmt = minRaise > stack ? stack : minRaise;
      if (raiseAmt > 0n && raiseAmt > toCall) {
        return { action: toCall > 0n ? 'raise' : 'bet', amount: raiseAmt.toString() };
      }
      return canCheck ? { action: 'check' } : { action: 'call' };
    }

    // Medium hands: call or small raise
    if (strength >= 0.5) {
      if (canCheck) return { action: 'check' };
      // Call if bet isn't too big relative to pot
      if (toCall <= pot / 2n || toCall <= stack / 10n) {
        return { action: 'call' };
      }
      // Fold big bets with medium hands sometimes
      return rand < 0.4 ? { action: 'call' } : { action: 'fold' };
    }

    // Weak hands: mostly fold, occasionally limp
    if (canCheck) return { action: 'check' };
    if (toCall <= BigInt(state.minRaise) && rand < 0.2) return { action: 'call' };
    return { action: 'fold' };
  }

  // ---- Postflop (flop/turn/river) ----
  // Simplified: bet/raise sometimes, check/call often, fold to big bets with nothing

  if (canCheck) {
    // Bet ~30% of the time with a pot-sized or half-pot bet
    if (rand < 0.3 && stack > 0n && minRaise > 0n) {
      const betSize = pot / 2n;
      const betAmt = betSize < minRaise ? minRaise : betSize > stack ? stack : betSize;
      return { action: 'bet', amount: betAmt.toString() };
    }
    return { action: 'check' };
  }

  // Facing a bet
  const potOdds = pot > 0n ? Number(toCall) / Number(pot + toCall) : 1;

  // Always call small bets
  if (potOdds < 0.2) {
    return { action: 'call' };
  }

  // Raise sometimes (bluff or value)
  if (rand < 0.15 && stack > minRaise && minRaise > 0n) {
    const raiseAmt = minRaise > stack ? stack : minRaise;
    return { action: 'raise', amount: raiseAmt.toString() };
  }

  // Call with decent probability
  if (rand < 0.6) {
    return { action: 'call' };
  }

  // Fold the rest
  return { action: 'fold' };
}

// --------------- Database: give bots balance ---------------

async function ensureBotBalance(addresses: string[], amount: bigint): Promise<void> {
  if (!DATABASE_URL) {
    console.log('[Bot] No DATABASE_URL set — skipping balance top-up. Bots must already have balance.');
    return;
  }
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_URL.includes('neon') ? { rejectUnauthorized: false } : undefined });
  try {
    for (const addr of addresses) {
      const normalized = addr.toLowerCase();
      // Upsert player and set balance to at least `amount`
      await pool.query(
        `INSERT INTO players (wallet_address, balance)
         VALUES ($1, $2::NUMERIC)
         ON CONFLICT (wallet_address)
         DO UPDATE SET balance = GREATEST(players.balance, $2::NUMERIC), last_seen = NOW()`,
        [normalized, amount.toString()]
      );

      // Give bot a random placeholder avatar if it has no avatar_config yet.
      // This keeps bot seats visually distinct in production without overriding real profiles.
      const fallbackDisplayName = `Bot ${normalized.slice(2, 6)}${normalized.slice(-2)}`.toUpperCase();
      const avatarConfig = randomPlaceholderConfig(new Set());
      await pool.query(
        `INSERT INTO chat_display_names (wallet_address, display_name, profile_image_url, avatar_config, bio, x_handle, tg_handle)
         VALUES ($1, $2, NULL, $3::jsonb, NULL, NULL, NULL)
         ON CONFLICT (wallet_address)
         DO UPDATE SET
           display_name = COALESCE(chat_display_names.display_name, EXCLUDED.display_name),
           avatar_config = COALESCE(chat_display_names.avatar_config, EXCLUDED.avatar_config),
           updated_at = NOW()`,
        [normalized, fallbackDisplayName, JSON.stringify(avatarConfig)]
      );

      console.log(`[Bot] Ensured balance for ${normalized}: ${amount.toString()} wei`);
    }
  } finally {
    await pool.end();
  }
}

// --------------- Table discovery (when tableId not provided) ---------------

interface TableSummary {
  id: string;
  smallBlind: string;
  bigBlind: string;
  maxSeats: number;
  status: string;
  seatedCount: number;
  emptySeats: number;
}

/** Connect with one bot, list tables (or create one), return tableId, then disconnect. */
async function discoverOrCreateTable(): Promise<string> {
  if (BOT_ADDRESSES.length === 0) {
    throw new Error('No valid bot addresses configured. Set POKER_BOT_ADDRESSES.');
  }
  const scoutAddr = BOT_ADDRESSES[0];
  const ws = await createWsClient(scoutAddr);
  await waitForAuth(ws);

  try {
    const listPayload = await sendRequest(ws, 'poker_list_tables', {});
    const tables = (listPayload?.tables ?? []) as TableSummary[];
    const withSeats = tables.filter((t) => t.emptySeats != null && t.emptySeats > 0);
    if (withSeats.length > 0) {
      const picked = withSeats[0];
      console.log(`[Bot] Using existing table ${picked.id} (${picked.seatedCount}/${picked.maxSeats} seats)`);
      return picked.id;
    }
    if (tables.length > 0) {
      const full = tables[0];
      console.log(`[Bot] All tables full; using first table ${full.id} (will join when seat opens or create next)`);
      return full.id;
    }

    const createPayload = await sendRequest(ws, 'poker_create_table', {
      smallBlind: '10',
      bigBlind: '20',
      maxSeats: 6,
    });
    const tableId = (createPayload as any)?.tableId;
    if (tableId) {
      console.log(`[Bot] Created new table ${tableId}`);
      return tableId;
    }
  } finally {
    ws.close();
  }

  throw new Error('Could not list or create a table');
}

// --------------- Bot main loop ---------------

async function runBot(address: string, tableId: string): Promise<void> {
  const tag = `[Bot ${address.slice(0, 8)}]`;
  console.log(`${tag} Connecting...`);

  const ws = await createWsClient(address);
  await waitForAuth(ws);
  console.log(`${tag} Authenticated.`);

  // Join the table
  try {
    await sendRequest(ws, 'poker_join_table', { tableId, buyInChips: BUY_IN_WEI.toString() });
    console.log(`${tag} Joined table ${tableId} with ${BUY_IN_HUMAN} chips.`);
  } catch (err: any) {
    if (err.message?.includes('Already seated')) {
      console.log(`${tag} Already seated, continuing.`);
    } else {
      throw err;
    }
  }

  // Join the room for broadcasts
  try {
    await sendRequest(ws, 'join_room', { roomId: `poker:table:${tableId}` });
  } catch { /* non-fatal */ }

  // Listen for state broadcasts and act when it's our turn
  let lastActedHandAction = '';

  ws.on('message', async (data: WebSocket.Data) => {
    try {
      const msg = parseMessage(data);
      if (msg.type !== 'poker_table_state') return;

      const state = parseState((msg as any).payload, address);
      if (!state || !state.handId) return;
      if (state.actingPosition !== state.myPosition) return;

      // Avoid double-acting on the same state
      const actionKey = `${state.handId}:${state.street}:${state.actingPosition}`;
      if (actionKey === lastActedHandAction) return;
      lastActedHandAction = actionKey;

      // Think for a bit
      await thinkDelay();

      // Get fresh state (our hole cards might only come from get_state)
      let freshState = state;
      try {
        const freshPayload = await sendRequest(ws, 'poker_get_state', { tableId });
        const parsed = parseState(freshPayload, address);
        if (parsed && parsed.handId === state.handId && parsed.actingPosition === state.myPosition) {
          freshState = parsed;
        }
      } catch { /* use broadcast state */ }

      const decision = decideAction(freshState);
      console.log(`${tag} Hand ${freshState.handId?.slice(0, 8)} | ${freshState.street} | pot=${freshState.pot} toCall=${freshState.toCall} -> ${decision.action}${decision.amount ? ' ' + decision.amount : ''}`);

      try {
        await sendRequest(ws, 'poker_action', {
          tableId,
          handId: freshState.handId,
          action: decision.action,
          amount: decision.amount,
        });
      } catch (err: any) {
        console.error(`${tag} Action failed: ${err.message}`);
      }
    } catch { /* ignore parse errors */ }
  });

  // Also poll periodically in case broadcasts are missed
  const pollInterval = setInterval(async () => {
    try {
      const payload = await sendRequest(ws, 'poker_get_state', { tableId });
      const state = parseState(payload, address);
      if (!state || !state.handId) return;
      if (state.actingPosition !== state.myPosition) return;

      const actionKey = `${state.handId}:${state.street}:${state.actingPosition}`;
      if (actionKey === lastActedHandAction) return;
      lastActedHandAction = actionKey;

      await thinkDelay();

      const decision = decideAction(state);
      console.log(`${tag} [poll] ${state.street} | pot=${state.pot} toCall=${state.toCall} -> ${decision.action}${decision.amount ? ' ' + decision.amount : ''}`);

      await sendRequest(ws, 'poker_action', {
        tableId,
        handId: state.handId,
        action: decision.action,
        amount: decision.amount,
      });
    } catch { /* ignore */ }
  }, 3000);

  // Keep alive until process exits
  ws.on('close', () => {
    console.log(`${tag} Disconnected.`);
    clearInterval(pollInterval);
  });

  return new Promise((resolve) => {
    ws.on('close', resolve);
    // Also handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log(`${tag} Shutting down...`);
      clearInterval(pollInterval);
      ws.close();
      resolve();
    });
  });
}

// --------------- Entry point ---------------

async function main() {
  if (BOT_ADDRESSES.length === 0) {
    throw new Error('No valid bot addresses configured. Set POKER_BOT_ADDRESSES.');
  }
  const a = process.argv[2];
  const b = process.argv[3];
  const numBotsFromArg = (n: string | undefined) =>
    Math.min(MAX_BOTS, BOT_ADDRESSES.length, Math.max(1, Number(n) || 2));

  let tableId: string;
  let numBots: number;
  if (a && a.trim().length > 0) {
    const asNum = Number(a.trim());
    if (a.trim() === String(asNum) && asNum >= 1 && asNum <= 5) {
      numBots = numBotsFromArg(a);
      console.log('[Bot] No tableId provided — discovering or creating a table...');
      tableId = await discoverOrCreateTable();
    } else {
      tableId = a.trim();
      numBots = numBotsFromArg(b);
    }
  } else {
    console.log('[Bot] No tableId provided — discovering or creating a table...');
    tableId = await discoverOrCreateTable();
    numBots = numBotsFromArg(b);
  }

  const botAddrs = BOT_ADDRESSES.slice(0, numBots);
  console.log(`\n=== Poker Bot Launcher ===`);
  console.log(`Table: ${tableId}`);
  console.log(`Bots: ${numBots}`);
  console.log(`Address pool: ${BOT_ADDRESSES.length} configured`);
  console.log(`Buy-in: ${BUY_IN_HUMAN} chips (${BUY_IN_WEI.toString()} wei)`);
  console.log(`WS URL: ${WS_URL}\n`);

  // Give bots balance
  await ensureBotBalance(botAddrs, BUY_IN_WEI * 10n); // 10x buy-in so they can rebuy

  // Launch all bots concurrently
  const promises = botAddrs.map((addr) =>
    runBot(addr, tableId).catch((err) => {
      console.error(`[Bot ${addr.slice(0, 8)}] Fatal: ${formatError(err)}`);
    })
  );

  await Promise.all(promises);
  console.log('\n=== All bots finished ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
