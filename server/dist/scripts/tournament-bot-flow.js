"use strict";
/**
 * Tournament Bot Flow Script
 *
 * Creates a tournament, adds all bots, and plays through to completion.
 * Uses off-chain tournaments only (no contract calls).
 *
 * Modes:
 *   standard (default) - Buy-in tournament, 5000 chips, 25 hands
 *   freeroll - Chip-count freeroll, 5000 chips, 25 hands
 *
 * Prerequisites:
 * - Server running (or use production WebSocket URL)
 * - standard: Bot addresses in players table with sufficient balance (1000 MORBIUS each)
 * - freeroll: No balance needed
 *
 * Run from server directory:
 *   npm run tournament:bot
 *   TOURNAMENT_BOT_MODE=freeroll npm run tournament:bot
 *
 * Env:
 *   NEXT_PUBLIC_WEBSOCKET_URL (or WS_URL) - WebSocket URL
 *   TOURNAMENT_BOT_ADDRESSES - comma-separated addresses
 *   TOURNAMENT_BOT_MODE - standard | freeroll (default: standard)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load env from both root and server (cwd can vary when run via npm)
const rootEnv = path_1.default.join(__dirname, '../../../.env');
const serverEnv = path_1.default.join(__dirname, '../../.env');
dotenv_1.default.config({ path: rootEnv });
dotenv_1.default.config({ path: serverEnv });
dotenv_1.default.config(); // cwd .env as fallback
const ws_1 = __importDefault(require("ws"));
const DEFAULT_BOTS = [
    '0x41682815B05fE6b54a6C0f8813bB99423EE0309D', // Bot_1
    '0xAfd3Cc199167B396be71911637fcb30bAF22cC67', // Bot_2
];
function getBotAddresses() {
    const env = process.env.TOURNAMENT_BOT_ADDRESSES?.trim();
    if (env) {
        const addrs = env.split(/[,\s]+/).map((a) => a.trim()).filter((a) => a.startsWith('0x'));
        if (addrs.length > 0)
            return addrs;
    }
    return DEFAULT_BOTS;
}
function getMode() {
    const m = process.env.TOURNAMENT_BOT_MODE?.trim().toLowerCase();
    return m === 'freeroll' ? 'freeroll' : 'standard';
}
const WS_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL ||
    process.env.WS_URL ||
    'wss://morbiuslotto-production.up.railway.app';
const MIN_BET = 50;
const BUY_IN_WEI = '1000000000000000000000'; // 1000 MORBIUS
function createWsClient(address) {
    const url = WS_URL.replace(/^https/, 'wss').replace(/^http/, 'ws');
    const withAuth = `${url}${url.includes('?') ? '&' : '?'}address=${address}`;
    return new Promise((resolve, reject) => {
        const ws = new ws_1.default(withAuth);
        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('WebSocket connect timeout'));
        }, 15000);
        ws.on('open', () => {
            clearTimeout(timeout);
            resolve(ws);
        });
        ws.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}
function sendRequest(ws, type, payload) {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ws.removeListener('message', handler);
            reject(new Error(`Request timeout: ${type}`));
        }, 30000);
        const handler = (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.requestId !== requestId)
                    return;
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                if (msg.type === 'error') {
                    const errMsg = msg.payload?.message || msg.payload?.error || JSON.stringify(msg.payload);
                    reject(new Error(errMsg));
                }
                else {
                    resolve(msg.payload);
                }
            }
            catch {
                // ignore parse errors
            }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ type, payload, requestId }));
    });
}
function waitForConnection(ws) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Auth timeout')), 10000);
        const handler = (data) => {
            try {
                const msg = JSON.parse(data.toString());
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
                // ignore
            }
        };
        ws.on('message', handler);
    });
}
/** Simple blackjack strategy: hit on <17, stand on >=17. Double on 11 when allowed. */
function chooseAction(state) {
    const hands = state.playerHands || [];
    const idx = state.currentHandIndex ?? 0;
    const hand = hands[idx];
    if (!hand)
        return 'stand';
    const total = hand.total;
    if (total >= 17)
        return 'stand';
    if (total <= 11 && hand.canDoubleDown)
        return 'double_down';
    if (hand.canHit)
        return 'hit';
    return 'stand';
}
async function playHand(ws, betAmount) {
    const res = (await sendRequest(ws, 'tournament_game_start', { betAmount }));
    let state = res;
    while (state.status === 'player_turn') {
        const action = chooseAction(state);
        state = (await sendRequest(ws, 'tournament_player_action', {
            gameId: state.gameId,
            action,
            handIndex: state.currentHandIndex,
        }));
    }
    return state;
}
async function joinBot(ws, label, tournamentId) {
    console.log(`[${label}] Joining tournament...`);
    const joinRes = (await sendRequest(ws, 'tournament_join', { tournamentId }));
    console.log(`[${label}] Joined. Chips: ${joinRes.chips}, Hands: ${joinRes.handsRemaining}`);
    return joinRes;
}
async function playBot(ws, label, tournamentId, joinRes) {
    let handNum = 0;
    const maxHands = joinRes.maxHands ?? 50;
    while (joinRes.handsRemaining > 0 && handNum < maxHands) {
        handNum++;
        const chips = joinRes.chips;
        if (chips <= 0) {
            console.log(`[${label}] Bust!`);
            break;
        }
        const bet = Math.min(MIN_BET, chips);
        console.log(`[${label}] Hand ${handNum}: betting ${bet} chips...`);
        const final = await playHand(ws, bet);
        if (!final)
            break;
        joinRes.chips = final.tournamentChips ?? 0;
        joinRes.handsRemaining = final.handsRemaining ?? 0;
        console.log(`[${label}] Hand ${handNum} done. Chips: ${final.tournamentChips}, Remaining: ${final.handsRemaining}`);
        if ((final.tournamentChips ?? 0) <= 0) {
            console.log(`[${label}] Bust!`);
            break;
        }
        if ((final.handsRemaining ?? 0) <= 0) {
            console.log(`[${label}] All hands played. Final chips: ${final.tournamentChips ?? 0}`);
            break;
        }
    }
}
/** Join + play (convenience for single flow). */
async function runBot(ws, label, tournamentId) {
    const joinRes = await joinBot(ws, label, tournamentId);
    await playBot(ws, label, tournamentId, joinRes);
}
/** Run bot in freeroll (stops when busted or tournament ends). */
async function runBotFreeroll(ws, label, tournamentId) {
    try {
        const joinRes = (await sendRequest(ws, 'freeroll_join', { tournamentId }));
        console.log(`[${label}] Joined. Chips: ${joinRes.chips}`);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Not registered') || msg.includes('Cannot join')) {
            console.log(`[${label}] Skip join: ${msg}`);
            return;
        }
        throw err;
    }
    let handNum = 0;
    const maxHands = 25;
    let chips = 5000;
    while (handNum < maxHands && chips > 0) {
        handNum++;
        const bet = Math.min(MIN_BET, chips);
        try {
            const final = await playHand(ws, bet);
            if (!final)
                break;
            chips = final.tournamentChips ?? 0;
            console.log(`[${label}] Hand ${handNum} done. Chips: ${chips}, Remaining: ${final.handsRemaining ?? 0}`);
            if (chips <= 0) {
                console.log(`[${label}] Bust!`);
                break;
            }
            if ((final.handsRemaining ?? 0) <= 0) {
                console.log(`[${label}] All hands played. Final chips: ${chips}`);
                break;
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('No active tournament entry') || msg.includes('not active')) {
                console.log(`[${label}] Eliminated (hand ${handNum})`);
                break;
            }
            throw err;
        }
    }
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
async function runStandardMode(bots) {
    const creator = bots[0];
    const ws1 = await createWsClient(creator);
    await waitForConnection(ws1);
    console.log('\nCreator (Bot_1) connected');
    const createRes = (await sendRequest(ws1, 'tournament_create', {
        name: `Bot Test ${Date.now()}`,
        buyInAmount: BUY_IN_WEI,
        startingChips: 5000,
        maxHands: 25,
        timeLimitMinutes: null,
        tableTheme: { kind: 'image', id: 'default' },
        isPrivate: false,
        prizeDistributionType: 'top_10',
        onChainTournamentId: undefined,
    }));
    const tournamentId = createRes.tournamentId;
    console.log(`\nTournament created: ${createRes.name} (${tournamentId})`);
    // All bots must JOIN before any play, or tournament ends when first player completes
    const connections = [];
    const joinStates = [];
    for (let i = 0; i < bots.length; i++) {
        const ws = i === 0 ? ws1 : await createWsClient(bots[i]);
        if (i > 0)
            await waitForConnection(ws);
        connections.push(ws);
        const joinRes = await joinBot(ws, `Bot_${i + 1}`, tournamentId);
        joinStates.push(joinRes);
    }
    console.log('\n--- All joined. Starting play ---');
    for (let i = 0; i < bots.length; i++) {
        console.log(`\n--- Bot_${i + 1} playing ---`);
        await playBot(connections[i], `Bot_${i + 1}`, tournamentId, joinStates[i]);
    }
    connections.forEach((ws) => ws.close());
    console.log('\n--- Done ---');
    console.log('Payout: Server distributes prizes automatically when all players finish (top_10: 1st 40%, 2nd 20%, etc.).');
}
async function runFreerollMode(bots) {
    const now = new Date();
    const registrationOpens = new Date(now.getTime() - 2 * 60 * 1000);
    const scheduledStart = new Date(now.getTime() + 90 * 1000);
    const durationMinutes = 10;
    const creator = bots[0];
    const ws1 = await createWsClient(creator);
    await waitForConnection(ws1);
    console.log('\nCreator (Bot_1) connected');
    const createRes = (await sendRequest(ws1, 'create_freeroll', {
        name: `Freeroll Test ${Date.now()}`,
        scheduledStartAt: scheduledStart.toISOString(),
        registrationOpensAt: registrationOpens.toISOString(),
        durationMinutes,
        startingChips: 5000,
        maxHands: 25,
        prizeDistributionType: 'winner_takes_all', // min 1 player; use top_3/top_10 if testing with more bots
        reentryConfig: { enabled: false },
        actionTimerSeconds: null,
        tableTheme: { kind: 'image', id: 'default' },
        isPrivate: false,
        maxPlayers: bots.length,
    }));
    const tournamentId = createRes.tournamentId;
    console.log(`\nFreeroll created: ${tournamentId}`);
    console.log(`  Start in ~90s, chip-count winner (5000 chips, 25 hands)`);
    const connections = [ws1];
    for (let i = 0; i < bots.length; i++) {
        const ws = i === 0 ? ws1 : await createWsClient(bots[i]);
        if (i > 0) {
            await waitForConnection(ws);
            connections.push(ws);
        }
        try {
            await sendRequest(ws, 'freeroll_register', { tournamentId });
            console.log(`[Bot_${i + 1}] Registered`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`[Bot_${i + 1}] Register: ${msg}`);
        }
    }
    for (let i = 0; i < bots.length; i++) {
        const ws = connections[i];
        try {
            await sendRequest(ws, 'freeroll_join', { tournamentId });
            console.log(`[Bot_${i + 1}] Joined`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`[Bot_${i + 1}] Join: ${msg}`);
        }
    }
    console.log('\nWaiting 95s for tournament start...');
    await sleep(95000);
    for (let i = 0; i < bots.length; i++) {
        const ws = connections[i];
        console.log(`\n--- Bot_${i + 1} playing ---`);
        await runBotFreeroll(ws, `Bot_${i + 1}`, tournamentId);
    }
    connections.forEach((ws) => ws.close());
    console.log('\n--- Done ---');
    console.log('Payout: Server distributes prizes when tournament ends (chip-count ranking).');
}
async function main() {
    const bots = getBotAddresses();
    const mode = getMode();
    if (bots.length < 2) {
        throw new Error('Need at least 2 bots. Set TOURNAMENT_BOT_ADDRESSES or use defaults.');
    }
    console.log('Tournament Bot Flow');
    console.log('Mode:', mode);
    console.log('WebSocket URL:', WS_URL);
    console.log('Bots:', bots.length, process.env.TOURNAMENT_BOT_ADDRESSES ? '(from env)' : '(defaults)');
    bots.forEach((a, i) => console.log(`  Bot_${i + 1}: ${a}`));
    if (mode === 'freeroll') {
        await runFreerollMode(bots);
    }
    else {
        await runStandardMode(bots);
    }
}
main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
//# sourceMappingURL=tournament-bot-flow.js.map