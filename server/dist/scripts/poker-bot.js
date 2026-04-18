"use strict";
/**
 * Poker Bot Script
 *
 * Spawns 1-10 AI bot opponents that join a poker table and play automatically.
 * Bots use a simple strategy: tight-aggressive preflop, semi-random postflop.
 *
 * Usage (from server/ directory):
 *   npx ts-node src/scripts/poker-bot.ts [tableId] [numBots]
 *
 * Tournament mode (register via poker_tournament_join, then play when table exists):
 *   npx ts-node src/scripts/poker-bot.ts --tournament <tournamentId> [numBots]
 *   POKER_BOT_TOURNAMENT_ID=<uuid> npm run poker:bot -- [numBots]
 *
 * If tableId is omitted (cash mode), the script lists tables and uses the first with empty seats,
 * or creates a new table. numBots is 1-10 (default 2).
 *
 * Or via npm script:
 *   npm run poker:bot -- [tableId] [numBots]
 *   npm run poker:bot -- --tournament <tournamentId> [numBots]
 *
 * Env:
 *   NEXT_PUBLIC_WEBSOCKET_URL or WS_URL - WebSocket URL
 *   DATABASE_URL - Required (unless POKER_BOT_SKIP_DB=1). Same DB as the server: upserts each bot into
 *     `players` with balance at least the needed buy-in floor, and ensures a placeholder `chat_display_names` row.
 *     Cash and tournament modes use the same POKER_BOT_ADDRESSES list — no separate tournament wallets.
 *   POKER_BOT_SKIP_DB - If 1/true, skip all DB writes (you must already have players + balance).
 *   POKER_BOT_BUY_IN - Buy-in amount in human chips (default: 1000)
 *   POKER_BOT_ADDRESSES - Comma-separated bot wallet addresses (preferred in production)
 *   POKER_BOT_TOURNAMENT_ID - UUID of poker tournament (alternative to --tournament)
 *   POKER_BOT_TOURNAMENT_PIN - PIN for private tournaments
 *   CYPRESS_POKER_TEST_PLAYERS / POKER_TEST_PLAYERS - fallback wallet list
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
const cosmetics_catalog_1 = require("../lib/cosmetics-catalog");
const poker_bot_ai_1 = require("../lib/poker-bot-ai");
const poker_bot_wallet_pool_1 = require("../lib/poker-bot-wallet-pool");
// --------------- Config ---------------
const WS_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL ||
    process.env.WS_URL ||
    'ws://localhost:3001';
const DATABASE_URL = process.env.DATABASE_URL;
const MAX_BOTS = 10;
const BOT_ADDRESSES = (0, poker_bot_wallet_pool_1.getPokerBotWalletAddressList)({ server: false });
const POKER_CASH_MIN_BUY_IN_BB = 40;
const POKER_CASH_MAX_BUY_IN_BB = 100;
const DEFAULT_BUY_IN_BB = 80;
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
function formatError(err) {
    if (err instanceof Error && err.message)
        return err.message;
    if (typeof err === 'string' && err.trim())
        return err;
    try {
        const raw = JSON.stringify(err);
        if (raw && raw !== '{}')
            return raw;
    }
    catch {
        // ignore
    }
    return String(err || 'Unknown error');
}
function createWsClient(address) {
    const url = WS_URL.replace(/^https/, 'wss').replace(/^http/, 'ws');
    const withAuth = `${url}${url.includes('?') ? '&' : '?'}address=${address.toLowerCase()}`;
    return new Promise((resolve, reject) => {
        const ws = new ws_1.default(withAuth);
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
function waitForAuth(ws) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Auth timeout')), 10000);
        const handler = (data) => {
            try {
                const msg = parseMessage(data);
                if (msg.type === 'auth_success' ||
                    msg.type === 'connection_established') {
                    clearTimeout(timeout);
                    ws.removeListener('message', handler);
                    resolve();
                }
                if (msg.type === 'auth_challenge' && msg.payload?.claimedAddress) {
                    clearTimeout(timeout);
                    ws.removeListener('message', handler);
                    reject(new Error('Server requires signed WebSocket auth challenge. Bots cannot sign. Set DISABLE_WS_AUTH=true on server for local bot testing.'));
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
    const myPosition = Number(mySeat.position);
    const actingRaw = hand?.actingPosition;
    const actingPosition = actingRaw === undefined || actingRaw === null || actingRaw === '' ? null : Number(actingRaw);
    return {
        tableId: payload.tableId,
        handId: hand?.handId ?? null,
        street: hand?.street ?? 'waiting',
        pot: hand?.pot ?? '0',
        toCall: hand?.toCall ?? '0',
        minRaise: hand?.minRaise ?? '0',
        myPosition: Number.isFinite(myPosition) ? myPosition : 0,
        actingPosition: actingPosition != null && Number.isFinite(actingPosition) ? actingPosition : null,
        turnStartedAt: hand?.turnStartedAt ?? null,
        myStack: mySeat.stack,
        myHoleCards: payload.myHoleCards ?? null,
        communityCards: hand?.communityCards ?? [],
    };
}
/** Unique per decision point: same seat can act again on the same street after a raise. */
function actionDecisionKey(state) {
    const t = state.turnStartedAt ?? '';
    return `${state.handId}:${state.street}:${state.actingPosition}:${t}:${state.toCall}`;
}
// --------------- Database: players row + minimum balance ---------------
const POKER_BOT_SKIP_DB = ['1', 'true', 'yes'].includes(String(process.env.POKER_BOT_SKIP_DB ?? '').toLowerCase());
function computeBuyIn(bigBlindWei) {
    const envBuyIn = process.env.POKER_BOT_BUY_IN;
    if (envBuyIn) {
        const raw = BigInt(envBuyIn);
        const minWei = bigBlindWei * BigInt(POKER_CASH_MIN_BUY_IN_BB);
        const maxWei = bigBlindWei * BigInt(POKER_CASH_MAX_BUY_IN_BB);
        if (raw >= minWei && raw <= maxWei)
            return raw;
        console.log(`[Bot] POKER_BOT_BUY_IN (${raw}) out of bounds [${minWei}..${maxWei}], using ${DEFAULT_BUY_IN_BB}x BB`);
    }
    return bigBlindWei * BigInt(DEFAULT_BUY_IN_BB);
}
/**
 * Ensures each bot wallet has a `players` row and balance >= minBalanceWei (same logic for cash and tournaments).
 * Does nothing if POKER_BOT_SKIP_DB is set (you must already have rows + funds).
 */
async function ensureBotBalance(addresses, minBalanceWei) {
    if (POKER_BOT_SKIP_DB) {
        console.log('[Bot] POKER_BOT_SKIP_DB is set — skipping DB provisioning. Confirm players rows and balances yourself.');
        return;
    }
    if (!DATABASE_URL) {
        throw new Error('DATABASE_URL is required so bots get a players row and enough balance to join (cash or tournament). ' +
            'Point it at the same Postgres as the server (e.g. server/.env). ' +
            'If you already seeded manually, set POKER_BOT_SKIP_DB=1.');
    }
    const pool = new pg_1.Pool({
        connectionString: DATABASE_URL,
        ssl: DATABASE_URL.includes('neon') ? { rejectUnauthorized: false } : undefined,
    });
    try {
        for (const addr of addresses) {
            const normalized = addr.toLowerCase();
            await pool.query(`INSERT INTO players (wallet_address, balance)
         VALUES ($1, $2::NUMERIC)
         ON CONFLICT (wallet_address)
         DO UPDATE SET balance = GREATEST(players.balance, $2::NUMERIC), last_seen = NOW()`, [normalized, minBalanceWei.toString()]);
            const fallbackDisplayName = `Bot ${normalized.slice(2, 6)}${normalized.slice(-2)}`.toUpperCase();
            const avatarConfig = (0, cosmetics_catalog_1.randomPlaceholderConfig)(new Set());
            await pool.query(`INSERT INTO chat_display_names (wallet_address, display_name, profile_image_url, avatar_config, bio, x_handle, tg_handle)
         VALUES ($1, $2, NULL, $3::jsonb, NULL, NULL, NULL)
         ON CONFLICT (wallet_address)
         DO UPDATE SET
           display_name = COALESCE(chat_display_names.display_name, EXCLUDED.display_name),
           avatar_config = COALESCE(chat_display_names.avatar_config, EXCLUDED.avatar_config),
           updated_at = NOW()`, [normalized, fallbackDisplayName, JSON.stringify(avatarConfig)]);
            console.log(`[Bot] Ensured players row + balance >= ${minBalanceWei.toString()} wei for ${normalized}`);
        }
    }
    finally {
        await pool.end();
    }
}
/** Connect with one bot, list tables (or create one), return tableId, then disconnect. */
async function discoverOrCreateTable() {
    if (BOT_ADDRESSES.length === 0) {
        throw new Error('No valid bot addresses configured. Set POKER_BOT_ADDRESSES.');
    }
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
// --------------- Tournament helpers ---------------
const TOURNAMENT_TABLE_WAIT_MS = 60 * 60 * 1000;
const TOURNAMENT_POLL_MS = 2000;
async function getTournamentBuyInWei(tournamentId) {
    if (BOT_ADDRESSES.length === 0)
        throw new Error('No bot addresses configured');
    const scoutAddr = BOT_ADDRESSES[0];
    const ws = await createWsClient(scoutAddr);
    await waitForAuth(ws);
    try {
        const state = await sendRequest(ws, 'poker_tournament_get_state', { tournamentId });
        return BigInt(String(state?.buyInAmount ?? '0'));
    }
    finally {
        ws.close();
    }
}
async function waitForTournamentTable(ws, tournamentId, tag) {
    const deadline = Date.now() + TOURNAMENT_TABLE_WAIT_MS;
    while (Date.now() < deadline) {
        const state = await sendRequest(ws, 'poker_tournament_get_state', { tournamentId });
        const tableId = state?.tableId;
        if (tableId && typeof tableId === 'string') {
            console.log(`${tag} Tournament table assigned: ${tableId}`);
            return tableId;
        }
        console.log(`${tag} Waiting for tournament table (status=${state?.status ?? '?'})…`);
        await sleep(TOURNAMENT_POLL_MS);
    }
    throw new Error('Timeout waiting for tournament table');
}
// --------------- Bot main loop ---------------
/**
 * In-hand loop: must already be seated (cash join or tournament registration + seated).
 */
async function runBotPlayLoop(ws, address, tableId, tag) {
    try {
        await sendRequest(ws, 'join_room', { roomId: `poker:table:${tableId}` });
    }
    catch {
        /* non-fatal */
    }
    let lastSuccessfulActionKey = '';
    let pokerActBusy = false;
    const maybeActPokerTurn = async (hint, logPrefix) => {
        if (pokerActBusy)
            return;
        const hintKey = actionDecisionKey(hint);
        if (hintKey === lastSuccessfulActionKey)
            return;
        pokerActBusy = true;
        try {
            await thinkDelay();
            let fresh = null;
            try {
                const freshPayload = await sendRequest(ws, 'poker_get_state', { tableId });
                fresh = parseState(freshPayload, address);
            }
            catch {
                fresh = hint;
            }
            if (!fresh || !fresh.handId || fresh.actingPosition !== fresh.myPosition)
                return;
            const key = actionDecisionKey(fresh);
            if (key === lastSuccessfulActionKey)
                return;
            const decision = (0, poker_bot_ai_1.decidePokerBotAction)({
                street: fresh.street,
                pot: fresh.pot,
                toCall: fresh.toCall,
                minRaise: fresh.minRaise,
                myStack: fresh.myStack,
                myHoleCards: fresh.myHoleCards,
            });
            console.log(`${tag} ${logPrefix} Hand ${fresh.handId?.slice(0, 8)} | ${fresh.street} | pot=${fresh.pot} toCall=${fresh.toCall} -> ${decision.action}${decision.amount ? ' ' + decision.amount : ''}`);
            await sendRequest(ws, 'poker_action', {
                tableId,
                handId: fresh.handId,
                action: decision.action,
                amount: decision.amount,
            });
            lastSuccessfulActionKey = key;
        }
        catch (err) {
            console.error(`${tag} Action failed: ${err?.message ?? err}`);
        }
        finally {
            pokerActBusy = false;
        }
    };
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
            await maybeActPokerTurn(state, '');
        }
        catch {
            /* ignore parse errors */
        }
    });
    const pollInterval = setInterval(async () => {
        try {
            const payload = await sendRequest(ws, 'poker_get_state', { tableId });
            const state = parseState(payload, address);
            if (!state || !state.handId)
                return;
            if (state.actingPosition !== state.myPosition)
                return;
            await maybeActPokerTurn(state, '[poll]');
        }
        catch {
            /* ignore */
        }
    }, 3000);
    ws.on('close', () => {
        console.log(`${tag} Disconnected.`);
        clearInterval(pollInterval);
    });
    return new Promise((resolve) => {
        ws.on('close', resolve);
        process.on('SIGINT', () => {
            console.log(`${tag} Shutting down...`);
            clearInterval(pollInterval);
            ws.close();
            resolve();
        });
    });
}
async function runBotTournament(address, tournamentId, pinCode) {
    const tag = `[Bot ${address.slice(0, 8)}]`;
    console.log(`${tag} Connecting (tournament ${tournamentId.slice(0, 8)}…)…`);
    const ws = await createWsClient(address);
    await waitForAuth(ws);
    console.log(`${tag} Authenticated.`);
    const joinPayload = await sendRequest(ws, 'poker_tournament_join', {
        tournamentId,
        ...(pinCode ? { pinCode } : {}),
    });
    console.log(`${tag} Tournament join OK.`);
    let tableId = joinPayload?.tableId && typeof joinPayload.tableId === 'string' ? joinPayload.tableId : null;
    if (!tableId) {
        tableId = await waitForTournamentTable(ws, tournamentId, tag);
    }
    try {
        await sendRequest(ws, 'join_room', { roomId: `poker_tournament:${tournamentId}` });
    }
    catch {
        /* non-fatal */
    }
    await runBotPlayLoop(ws, address, tableId, tag);
}
async function runBot(address, tableId, buyInWei) {
    const tag = `[Bot ${address.slice(0, 8)}]`;
    console.log(`${tag} Connecting...`);
    const ws = await createWsClient(address);
    await waitForAuth(ws);
    console.log(`${tag} Authenticated.`);
    try {
        await sendRequest(ws, 'poker_join_table', { tableId, buyInChips: buyInWei.toString() });
        console.log(`${tag} Joined table ${tableId} with buy-in ${buyInWei.toString()} wei.`);
    }
    catch (err) {
        if (err.message?.includes('Already seated')) {
            console.log(`${tag} Already seated, continuing.`);
        }
        else {
            throw err;
        }
    }
    await runBotPlayLoop(ws, address, tableId, tag);
}
// --------------- Entry point ---------------
async function main() {
    if (BOT_ADDRESSES.length === 0) {
        throw new Error('No valid bot addresses configured. Set POKER_BOT_ADDRESSES.');
    }
    const argv = [...process.argv.slice(2)];
    const tIdx = argv.indexOf('--tournament');
    let tournamentId = null;
    if (tIdx >= 0) {
        tournamentId = argv[tIdx + 1]?.trim() || null;
        if (!tournamentId) {
            throw new Error('--tournament must be followed by a tournament UUID');
        }
        argv.splice(tIdx, 2);
    }
    else if (process.env.POKER_BOT_TOURNAMENT_ID?.trim()) {
        tournamentId = process.env.POKER_BOT_TOURNAMENT_ID.trim();
    }
    const pinCode = process.env.POKER_BOT_TOURNAMENT_PIN?.trim() || undefined;
    const a = argv[0];
    const b = argv[1];
    const numBotsFromArg = (n) => Math.min(MAX_BOTS, BOT_ADDRESSES.length, Math.max(1, Number(n) || 2));
    if (tournamentId) {
        const numBots = numBotsFromArg(a);
        const botAddrs = BOT_ADDRESSES.slice(0, numBots);
        const buyInWei = await getTournamentBuyInWei(tournamentId);
        console.log(`\n=== Poker Bot Launcher (tournament) ===`);
        console.log(`Tournament: ${tournamentId}`);
        console.log(`Bots: ${numBots}`);
        console.log(`Buy-in (MORBIUS / table currency): ${buyInWei.toString()} wei`);
        console.log(`WS URL: ${WS_URL}\n`);
        await ensureBotBalance(botAddrs, buyInWei > 0n ? buyInWei * 10n : 0n);
        const promises = botAddrs.map((addr) => runBotTournament(addr, tournamentId, pinCode).catch((err) => {
            console.error(`[Bot ${addr.slice(0, 8)}] Fatal: ${formatError(err)}`);
        }));
        await Promise.all(promises);
        console.log('\n=== All bots finished ===');
        process.exit(0);
        return;
    }
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
    const scoutAddr = botAddrs[0];
    const scoutWs = await createWsClient(scoutAddr);
    await waitForAuth(scoutWs);
    const listPayload = await sendRequest(scoutWs, 'poker_list_tables', {});
    scoutWs.close();
    const tables = (listPayload?.tables ?? []);
    const targetTable = tables.find((t) => t.id === tableId);
    const bigBlindWei = BigInt(targetTable?.bigBlind ?? '0');
    if (bigBlindWei <= 0n) {
        throw new Error(`Could not determine big blind for table ${tableId}`);
    }
    const buyInWei = computeBuyIn(bigBlindWei);
    console.log(`\n=== Poker Bot Launcher ===`);
    console.log(`Table: ${tableId}`);
    console.log(`Bots: ${numBots}`);
    console.log(`Address pool: ${BOT_ADDRESSES.length} configured`);
    console.log(`Big blind: ${bigBlindWei.toString()} wei`);
    console.log(`Buy-in: ${buyInWei.toString()} wei (${Number(buyInWei / bigBlindWei)} BB)`);
    console.log(`WS URL: ${WS_URL}\n`);
    await ensureBotBalance(botAddrs, buyInWei * 10n);
    const promises = botAddrs.map((addr) => runBot(addr, tableId, buyInWei).catch((err) => {
        console.error(`[Bot ${addr.slice(0, 8)}] Fatal: ${formatError(err)}`);
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