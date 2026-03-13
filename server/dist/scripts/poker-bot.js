"use strict";
/**
 * Poker Bot Script
 *
 * Spawns 1-5 AI bot opponents that join a poker table and play automatically.
 * Bots use a simple strategy: tight-aggressive preflop, semi-random postflop.
 *
 * Usage (from server/ directory):
 *   npx ts-node src/scripts/poker-bot.ts [tableId] [numBots]
 *
 * If tableId is omitted, the script lists tables and uses the first with empty seats,
 * or creates a new table. numBots is 1-5 (default 2).
 *
 * Or via npm script:
 *   npm run poker:bot -- [tableId] [numBots]
 *
 * Env:
 *   NEXT_PUBLIC_WEBSOCKET_URL or WS_URL - WebSocket URL
 *   DATABASE_URL - PostgreSQL connection string (to give bots balance)
 *   POKER_BOT_BUY_IN - Buy-in amount in human chips (default: 1000)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../../.env') });
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../.env') });
dotenv_1.default.config();
const ws_1 = __importDefault(require("ws"));
const pg_1 = require("pg");
// --------------- Config ---------------
const WS_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL ||
    process.env.WS_URL ||
    'ws://localhost:3001';
const DATABASE_URL = process.env.DATABASE_URL;
// Must be 42 chars (0x + 40 hex) to fit players.wallet_address VARCHAR(42)
const BOT_ADDRESSES = [
    '0xB07000000000000000000000000000000000de01',
    '0xB07000000000000000000000000000000000de02',
    '0xB07000000000000000000000000000000000de03',
    '0xB07000000000000000000000000000000000de04',
    '0xB07000000000000000000000000000000000de05',
];
const BUY_IN_HUMAN = process.env.POKER_BOT_BUY_IN || '1000';
// Convert human-readable chips to wei (1 chip = 1e18 wei)
const BUY_IN_WEI = BigInt(BUY_IN_HUMAN) * 10n ** 18n;
// Bot thinking delay range (ms) — makes it feel more human
const THINK_MIN_MS = 800;
const THINK_MAX_MS = 2500;
// --------------- WebSocket helpers ---------------
/** Normalize WS message to string (handles Buffer, Buffer[], ArrayBuffer). */
function dataToString(data) {
    if (typeof data === 'string')
        return data;
    if (Buffer.isBuffer(data))
        return data.toString('utf8');
    if (Array.isArray(data))
        return Buffer.concat(data).toString('utf8');
    if (data instanceof ArrayBuffer)
        return Buffer.from(data).toString('utf8');
    return String(data);
}
/** Parse JSON from WebSocket message; log and rethrow on invalid JSON. */
function parseMessage(data) {
    const raw = dataToString(data);
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object')
            return parsed;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Bot] Invalid JSON:', msg, '| raw (first 200 chars):', raw.slice(0, 200));
        throw err;
    }
    console.error('[Bot] Message was not a JSON object | raw:', raw.slice(0, 200));
    throw new Error('Invalid JSON: expected object');
}
function createWsClient(address) {
    const url = WS_URL.replace(/^https/, 'wss').replace(/^http/, 'ws');
    const withAuth = `${url}${url.includes('?') ? '&' : '?'}address=${address.toLowerCase()}`;
    return new Promise((resolve, reject) => {
        const ws = new ws_1.default(withAuth);
        const timeout = setTimeout(() => { ws.close(); reject(new Error('WS connect timeout')); }, 15000);
        ws.on('open', () => { clearTimeout(timeout); resolve(ws); });
        ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
    });
}
function waitForAuth(ws) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Auth timeout')), 10000);
        const handler = (data) => {
            try {
                const msg = parseMessage(data);
                if (msg.type === 'auth_success' ||
                    msg.type === 'connection_established' ||
                    (msg.type === 'auth_challenge' && msg.payload?.claimedAddress)) {
                    clearTimeout(timeout);
                    ws.removeListener('message', handler);
                    resolve();
                }
                if (msg.type === 'error') {
                    clearTimeout(timeout);
                    ws.removeListener('message', handler);
                    reject(new Error(msg.payload?.message || 'Auth failed'));
                }
            }
            catch {
                /* ignore non-JSON or non-matching messages */
            }
        };
        ws.on('message', handler);
    });
}
function sendRequest(ws, type, payload) {
    const requestId = `bot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ws.removeListener('message', handler);
            reject(new Error(`Request timeout: ${type}`));
        }, 30000);
        const handler = (data) => {
            try {
                const msg = parseMessage(data);
                if (msg.requestId !== requestId)
                    return;
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                if (msg.type === 'error') {
                    const payload = msg.payload;
                    reject(new Error(payload?.message || payload?.error || 'Request failed'));
                }
                else {
                    resolve(msg.payload);
                }
            }
            catch {
                /* ignore parse errors for non-matching messages */
            }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ type, payload, requestId }));
    });
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function thinkDelay() {
    return sleep(THINK_MIN_MS + Math.random() * (THINK_MAX_MS - THINK_MIN_MS));
}
function parseState(payload, botAddress) {
    if (!payload)
        return null;
    const seats = payload.seats || [];
    const mySeat = seats.find((s) => s.playerAddress?.toLowerCase() === botAddress.toLowerCase());
    if (!mySeat)
        return null;
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
function preflopStrength(cards) {
    if (!cards || cards.length < 2)
        return 0.3;
    const r1 = cards[0] % 13; // 0=A, 1=2, ..., 12=K
    const r2 = cards[1] % 13;
    const s1 = Math.floor(cards[0] / 13);
    const s2 = Math.floor(cards[1] / 13);
    const suited = s1 === s2;
    const hi = Math.max(r1, r2);
    const lo = Math.min(r1, r2);
    // Pocket pair
    if (r1 === r2) {
        if (r1 === 0)
            return 0.95; // AA
        if (r1 >= 10)
            return 0.88; // KK, QQ, JJ
        if (r1 >= 7)
            return 0.72;
        return 0.55;
    }
    // Ace-high
    if (hi === 0 || lo === 0) {
        const kicker = hi === 0 ? lo : hi;
        if (kicker >= 10)
            return suited ? 0.82 : 0.75; // AK, AQ, AJ
        if (kicker >= 7)
            return suited ? 0.62 : 0.55;
        return suited ? 0.45 : 0.35;
    }
    // Connected / broadway
    const gap = Math.abs(r1 - r2);
    let score = 0.25;
    if (hi >= 9 && lo >= 9)
        score += 0.35; // Both broadway
    else if (hi >= 9)
        score += 0.15;
    if (gap <= 1)
        score += 0.15; // Connected
    else if (gap <= 2)
        score += 0.08;
    if (suited)
        score += 0.1;
    return Math.min(score, 0.9);
}
/**
 * Decide what action to take. Returns { action, amount? }.
 * Strategy: tight-aggressive preflop, semi-random postflop.
 */
function decideAction(state) {
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
            if (canCheck)
                return { action: 'check' };
            // Call if bet isn't too big relative to pot
            if (toCall <= pot / 2n || toCall <= stack / 10n) {
                return { action: 'call' };
            }
            // Fold big bets with medium hands sometimes
            return rand < 0.4 ? { action: 'call' } : { action: 'fold' };
        }
        // Weak hands: mostly fold, occasionally limp
        if (canCheck)
            return { action: 'check' };
        if (toCall <= BigInt(state.minRaise) && rand < 0.2)
            return { action: 'call' };
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
async function ensureBotBalance(addresses, amount) {
    if (!DATABASE_URL) {
        console.log('[Bot] No DATABASE_URL set — skipping balance top-up. Bots must already have balance.');
        return;
    }
    const pool = new pg_1.Pool({ connectionString: DATABASE_URL, ssl: DATABASE_URL.includes('neon') ? { rejectUnauthorized: false } : undefined });
    try {
        for (const addr of addresses) {
            const normalized = addr.toLowerCase();
            // Upsert player and set balance to at least `amount`
            await pool.query(`INSERT INTO players (wallet_address, balance)
         VALUES ($1, $2::NUMERIC)
         ON CONFLICT (wallet_address)
         DO UPDATE SET balance = GREATEST(players.balance, $2::NUMERIC), last_seen = NOW()`, [normalized, amount.toString()]);
            console.log(`[Bot] Ensured balance for ${normalized}: ${amount.toString()} wei`);
        }
    }
    finally {
        await pool.end();
    }
}
/** Connect with one bot, list tables (or create one), return tableId, then disconnect. */
async function discoverOrCreateTable() {
    const scoutAddr = BOT_ADDRESSES[0];
    const ws = await createWsClient(scoutAddr);
    await waitForAuth(ws);
    try {
        const listPayload = await sendRequest(ws, 'poker_list_tables', {});
        const tables = (listPayload?.tables ?? []);
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
        const tableId = createPayload?.tableId;
        if (tableId) {
            console.log(`[Bot] Created new table ${tableId}`);
            return tableId;
        }
    }
    finally {
        ws.close();
    }
    throw new Error('Could not list or create a table');
}
// --------------- Bot main loop ---------------
async function runBot(address, tableId) {
    const tag = `[Bot ${address.slice(0, 8)}]`;
    console.log(`${tag} Connecting...`);
    const ws = await createWsClient(address);
    await waitForAuth(ws);
    console.log(`${tag} Authenticated.`);
    // Join the table
    try {
        await sendRequest(ws, 'poker_join_table', { tableId, buyInChips: BUY_IN_WEI.toString() });
        console.log(`${tag} Joined table ${tableId} with ${BUY_IN_HUMAN} chips.`);
    }
    catch (err) {
        if (err.message?.includes('Already seated')) {
            console.log(`${tag} Already seated, continuing.`);
        }
        else {
            throw err;
        }
    }
    // Join the room for broadcasts
    try {
        await sendRequest(ws, 'join_room', { roomId: `poker:table:${tableId}` });
    }
    catch { /* non-fatal */ }
    // Listen for state broadcasts and act when it's our turn
    let lastActedHandAction = '';
    ws.on('message', async (data) => {
        try {
            const msg = parseMessage(data);
            if (msg.type !== 'poker_table_state')
                return;
            const state = parseState(msg.payload, address);
            if (!state || !state.handId)
                return;
            if (state.actingPosition !== state.myPosition)
                return;
            // Avoid double-acting on the same state
            const actionKey = `${state.handId}:${state.street}:${state.actingPosition}`;
            if (actionKey === lastActedHandAction)
                return;
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
            }
            catch { /* use broadcast state */ }
            const decision = decideAction(freshState);
            console.log(`${tag} Hand ${freshState.handId?.slice(0, 8)} | ${freshState.street} | pot=${freshState.pot} toCall=${freshState.toCall} -> ${decision.action}${decision.amount ? ' ' + decision.amount : ''}`);
            try {
                await sendRequest(ws, 'poker_action', {
                    tableId,
                    handId: freshState.handId,
                    action: decision.action,
                    amount: decision.amount,
                });
            }
            catch (err) {
                console.error(`${tag} Action failed: ${err.message}`);
            }
        }
        catch { /* ignore parse errors */ }
    });
    // Also poll periodically in case broadcasts are missed
    const pollInterval = setInterval(async () => {
        try {
            const payload = await sendRequest(ws, 'poker_get_state', { tableId });
            const state = parseState(payload, address);
            if (!state || !state.handId)
                return;
            if (state.actingPosition !== state.myPosition)
                return;
            const actionKey = `${state.handId}:${state.street}:${state.actingPosition}`;
            if (actionKey === lastActedHandAction)
                return;
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
        }
        catch { /* ignore */ }
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
    const a = process.argv[2];
    const b = process.argv[3];
    const numBotsFromArg = (n) => Math.min(5, Math.max(1, Number(n) || 2));
    let tableId;
    let numBots;
    if (a && a.trim().length > 0) {
        const asNum = Number(a.trim());
        if (a.trim() === String(asNum) && asNum >= 1 && asNum <= 5) {
            numBots = numBotsFromArg(a);
            console.log('[Bot] No tableId provided — discovering or creating a table...');
            tableId = await discoverOrCreateTable();
        }
        else {
            tableId = a.trim();
            numBots = numBotsFromArg(b);
        }
    }
    else {
        console.log('[Bot] No tableId provided — discovering or creating a table...');
        tableId = await discoverOrCreateTable();
        numBots = numBotsFromArg(b);
    }
    const botAddrs = BOT_ADDRESSES.slice(0, numBots);
    console.log(`\n=== Poker Bot Launcher ===`);
    console.log(`Table: ${tableId}`);
    console.log(`Bots: ${numBots}`);
    console.log(`Buy-in: ${BUY_IN_HUMAN} chips (${BUY_IN_WEI.toString()} wei)`);
    console.log(`WS URL: ${WS_URL}\n`);
    // Give bots balance
    await ensureBotBalance(botAddrs, BUY_IN_WEI * 10n); // 10x buy-in so they can rebuy
    // Launch all bots concurrently
    const promises = botAddrs.map((addr) => runBot(addr, tableId).catch((err) => {
        console.error(`[Bot ${addr.slice(0, 8)}] Fatal: ${err.message}`);
    }));
    await Promise.all(promises);
    console.log('\n=== All bots finished ===');
    process.exit(0);
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=poker-bot.js.map