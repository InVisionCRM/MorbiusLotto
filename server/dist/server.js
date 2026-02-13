"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const database_service_1 = require("./services/database.service");
const provably_fair_service_1 = require("./services/provably-fair.service");
const blackjack_game_service_1 = require("./services/blackjack-game.service");
const tournament_service_1 = require("./services/tournament.service");
const freeroll_scheduler_service_1 = require("./services/freeroll-scheduler.service");
const websocket_service_1 = require("./services/websocket.service");
const chain_analytics_service_1 = require("./services/chain-analytics.service");
const logger_1 = require("./utils/logger");
const withdraw_sign_1 = require("./utils/withdraw-sign");
const chain_client_1 = require("./utils/chain-client");
const blackjack_1 = require("./abi/blackjack");
const contracts_1 = require("./config/contracts");
const ERC20_BALANCE_OF_ABI = [
    { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
];
// Load environment variables
dotenv_1.default.config();
// Admin: comma-separated wallet addresses (server-side, for /api/admin/*)
const ADMIN_WALLETS = (process.env.ADMIN_WALLETS || '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
function isAdminWallet(addr) {
    if (!addr)
        return false;
    return ADMIN_WALLETS.includes(addr.toLowerCase());
}
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const PORT = process.env.PORT || 3001;
// Trust proxy when behind a reverse proxy (Railway, nginx, etc.) so rate-limit sees real client IP.
// Avoids ERR_ERL_UNEXPECTED_X_FORWARDED_FOR when X-Forwarded-For is set.
// Default to trusting proxy (1) unless explicitly disabled with TRUST_PROXY=0
const trustProxyEnv = (process.env.TRUST_PROXY || '').trim().toLowerCase();
const trustProxyValue = trustProxyEnv === '0' || trustProxyEnv === 'false' ? 0 : 1;
app.set('trust proxy', trustProxyValue);
// Use console.log for trust proxy status so it always appears in logs (logger might not output in production)
console.log(`[Server] Trust proxy setting: ${trustProxyValue} (TRUST_PROXY="${process.env.TRUST_PROXY || 'unset'}")`);
if (trustProxyValue === 0) {
    console.warn(`[Server] WARNING: Trust proxy is DISABLED - rate limiter will fail behind reverse proxy if X-Forwarded-For header is present.`);
}
// CORS: allow frontend origin(s). Set FRONTEND_URL on Railway to your app URL (comma-separated for multiple).
const allowedOrigins = (process.env.FRONTEND_URL || 'https://win.morbius.io')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: (origin, cb) => {
        if (!origin)
            return cb(null, true); // same-origin or non-browser
        if (allowedOrigins.includes(origin))
            return cb(null, true); // reflect allowed origin
        return cb(null, false);
    },
    credentials: true,
}));
// Rate limiting (relaxed for development - 1000 requests per minute)
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 1000, // limit each IP to 1000 requests per minute
    message: 'Too many requests from this IP, please try again later.',
    // Disable X-Forwarded-For validation to prevent ERR_ERL_UNEXPECTED_X_FORWARDED_FOR errors
    // Trust proxy is already set above, but this prevents validation errors if there's any timing/configuration issue
    validate: {
        xForwardedForHeader: false,
    },
});
app.use('/api/', limiter);
// Body parsing
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Admin API: require x-admin-wallet header and that it's in ADMIN_WALLETS
app.use('/api/admin', (req, res, next) => {
    const wallet = req.headers['x-admin-wallet']?.trim();
    if (!wallet || !isAdminWallet(wallet)) {
        res.status(403).json({ error: 'Forbidden', message: 'Admin wallet required' });
        return;
    }
    next();
});
// JSON helper that serializes BigInt values (Express res.json cannot)
const jsonReplacer = (_key, value) => (typeof value === 'bigint' ? value.toString() : value);
const sendJson = (res, data) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(data, jsonReplacer));
};
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Initialize services
async function initializeServices() {
    try {
        // Initialize database
        const dbService = new database_service_1.DatabaseService();
        await dbService.connect();
        // Initialize provably fair service
        const pfService = new provably_fair_service_1.ProvablyFairService();
        // Initialize blackjack game service
        const gameService = new blackjack_game_service_1.BlackjackGameService(dbService, pfService);
        // Initialize tournament service
        const tournamentService = new tournament_service_1.TournamentService(dbService.getPool());
        gameService.setTournamentService(tournamentService);
        // Initialize WebSocket service
        const wsService = new websocket_service_1.WebSocketService(server, gameService, dbService, tournamentService);
        // Freeroll scheduler (polls pending scheduled events: start, elimination_round, end)
        freerollScheduler = new freeroll_scheduler_service_1.FreerollSchedulerService(dbService.getPool(), tournamentService);
        freerollScheduler.start();
        // Expire any orphaned pending withdrawals from a previous crash (refunds balances)
        try {
            const expired = await dbService.expirePendingWithdrawals();
            if (expired > 0) {
                logger_1.logger.info(`Startup: expired ${expired} orphaned pending withdrawal(s) and refunded balances`);
            }
        }
        catch (err) {
            logger_1.logger.error('Startup: failed to expire pending withdrawals', err);
        }
        // Chain analytics (on-chain games: Plinko, Keno, Lottery, BigWheel)
        const chainAnalytics = new chain_analytics_service_1.ChainAnalyticsService();
        // API routes
        app.get('/api/player/:address/profile', async (req, res) => {
            try {
                const { address } = req.params;
                const profile = await dbService.getProfile(address);
                sendJson(res, profile ?? { displayName: null, profileImageUrl: null });
            }
            catch (error) {
                logger_1.logger.error('Error fetching player profile:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        app.get('/api/player/:address/stats', async (req, res) => {
            try {
                const { address } = req.params;
                const stats = await dbService.getPlayerStats(address);
                sendJson(res, stats);
            }
            catch (error) {
                logger_1.logger.error('Error fetching player stats:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        app.get('/api/game/:gameId/verify', async (req, res) => {
            try {
                const { gameId } = req.params;
                const verification = await gameService.verifyGame(gameId);
                if (verification == null) {
                    res.status(404).json({ error: 'Game not found', message: 'No completed game with this ID. Use a game ID from your History (same backend).' });
                    return;
                }
                sendJson(res, verification);
            }
            catch (error) {
                logger_1.logger.error('Error verifying game:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Enhanced player stats endpoint
        app.get('/api/player/:address/stats/enhanced', async (req, res) => {
            try {
                const { address } = req.params;
                const stats = await dbService.getPlayerStatsEnhanced(address);
                sendJson(res, stats);
            }
            catch (error) {
                logger_1.logger.error('Error fetching enhanced player stats:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Global analytics endpoint
        app.get('/api/analytics/global', async (req, res) => {
            try {
                const analytics = await dbService.getGlobalAnalytics();
                sendJson(res, analytics);
            }
            catch (error) {
                logger_1.logger.error('Error fetching global analytics:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Top players leaderboard (by total volume)
        app.get('/api/analytics/top-players', async (req, res) => {
            try {
                const limit = Math.min(parseInt(req.query.limit) || 10, 50);
                const topPlayers = await dbService.getTopPlayers(limit);
                sendJson(res, topPlayers);
            }
            catch (error) {
                logger_1.logger.error('Error fetching top players:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Top player by category (for infinite moving cards)
        app.get('/api/analytics/top-player-by-category', async (req, res) => {
            try {
                const category = req.query.category;
                if (!category || !['games', 'profit_loss', 'wagered', 'win_rate', 'total_won', 'win_streak'].includes(category)) {
                    res.status(400).json({ error: 'Invalid category' });
                    return;
                }
                const topPlayer = await dbService.getTopPlayersByCategory(category);
                sendJson(res, topPlayer);
            }
            catch (error) {
                logger_1.logger.error('Error fetching top player by category:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Platform analytics: Blackjack (DB) + Plinko, Keno, Lottery, BigWheel (chain)
        app.get('/api/analytics/platform', async (req, res) => {
            try {
                const [blackjack, chain] = await Promise.all([
                    dbService.getGlobalAnalytics(),
                    chainAnalytics.getAllChainStats(),
                ]);
                const bjGames = BigInt(blackjack.total_games_played);
                const bjVolume = blackjack.total_volume;
                const bjPayouts = blackjack.total_payouts;
                const plinkoGames = chain.plinko?.totalDrops ?? 0n;
                const plinkoVolume = chain.plinko?.totalRevenue ?? 0n;
                const plinkoPayouts = chain.plinko?.totalPayouts ?? 0n;
                const kenoGames = chain.keno?.ticketCount ?? 0n;
                const kenoVolume = chain.keno?.totalWagered ?? 0n;
                const kenoPayouts = chain.keno?.totalWon ?? 0n;
                const lotteryGames = chain.lottery?.totalTicketsEver ?? 0n;
                const lotteryVolume = chain.lottery?.totalCollected ?? 0n;
                const lotteryPayouts = chain.lottery?.totalClaimed ?? 0n;
                const bigWheelGames = chain.bigWheel?.spins ?? 0n;
                const bigWheelVolume = chain.bigWheel?.volume ?? 0n;
                const bigWheelPayouts = chain.bigWheel?.payouts ?? 0n;
                const combined = {
                    totalGamesPlayed: bjGames + plinkoGames + kenoGames + lotteryGames + bigWheelGames,
                    totalVolume: bjVolume + plinkoVolume + kenoVolume + lotteryVolume + bigWheelVolume,
                    totalPayouts: bjPayouts + plinkoPayouts + kenoPayouts + lotteryPayouts + bigWheelPayouts,
                };
                sendJson(res, {
                    blackjack,
                    plinko: chain.plinko,
                    keno: chain.keno,
                    lottery: chain.lottery,
                    bigWheel: chain.bigWheel,
                    combined,
                });
            }
            catch (error) {
                logger_1.logger.error('Error fetching platform analytics:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Public: recent Blackjack wins (for Latest Wins feed)
        app.get('/api/analytics/recent-wins', async (req, res) => {
            try {
                const limit = Math.min(parseInt(req.query.limit) || 20, 50);
                const wins = await dbService.getRecentGlobalWins(limit);
                sendJson(res, { wins });
            }
            catch (error) {
                logger_1.logger.error('Error fetching recent wins:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Public: metrics time-series for charts (24h hourly, 7d/30d/all daily)
        app.get('/api/analytics/series', async (req, res) => {
            try {
                const range = (req.query.range || '24h');
                if (!['24h', '7d', '30d', 'all'].includes(range)) {
                    res.status(400).json({ error: 'Invalid range. Use 24h, 7d, 30d, or all' });
                    return;
                }
                const series = await dbService.getMetricsSeries(range);
                sendJson(res, { range, series });
            }
            catch (error) {
                logger_1.logger.error('Error fetching metrics series:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Player game history endpoint
        app.get('/api/player/:address/games', async (req, res) => {
            try {
                const { address } = req.params;
                const limit = parseInt(req.query.limit) || 50;
                const offset = parseInt(req.query.offset) || 0;
                const games = await dbService.getPlayerGames(address, limit, offset);
                sendJson(res, games);
            }
            catch (error) {
                logger_1.logger.error('Error fetching player games:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Game hands endpoint (for fetching player hands for a specific game)
        app.get('/api/game/:gameId/hands', async (req, res) => {
            try {
                const { gameId } = req.params;
                const hands = await dbService.getGameHands(gameId);
                sendJson(res, hands);
            }
            catch (error) {
                logger_1.logger.error('Error fetching game hands:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Tournament API endpoints
        app.get('/api/tournament/active', async (req, res) => {
            try {
                const tournament = await tournamentService.getActiveTournament();
                const entryCount = await tournamentService.getTournamentEntryCount(tournament.id);
                sendJson(res, {
                    ...tournament,
                    buy_in_amount: tournament.buy_in_amount.toString(),
                    prize_pool: tournament.prize_pool.toString(),
                    entryCount,
                });
            }
            catch (error) {
                logger_1.logger.error('Error fetching active tournament:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        app.get('/api/tournament/:tournamentId/leaderboard', async (req, res) => {
            try {
                const { tournamentId } = req.params;
                const limit = parseInt(req.query.limit) || 50;
                const leaderboard = await tournamentService.getLeaderboard(tournamentId, limit);
                sendJson(res, leaderboard);
            }
            catch (error) {
                logger_1.logger.error('Error fetching tournament leaderboard:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        app.get('/api/tournament/player/:address/state', async (req, res) => {
            try {
                const { address } = req.params;
                const state = await tournamentService.getTournamentState(address);
                if (!state) {
                    return res.json({ inTournament: false });
                }
                sendJson(res, { inTournament: true, ...state });
            }
            catch (error) {
                logger_1.logger.error('Error fetching player tournament state:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        app.get('/api/tournament/player/:address/history', async (req, res) => {
            try {
                const { address } = req.params;
                if (!address || address.length < 20) {
                    return res.status(400).json({ error: 'Valid player address required' });
                }
                const history = await tournamentService.getPlayerTournamentHistory(address);
                sendJson(res, history.map((item) => ({
                    ...item,
                    prizeWon: item.prizeWon.toString(),
                })));
            }
            catch (error) {
                logger_1.logger.error('Error fetching player tournament history:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Public: Blackjack table list (for picker; enabled only)
        app.get('/api/blackjack/tables', async (req, res) => {
            try {
                const enabledOnly = req.query.enabledOnly !== 'false';
                const rows = await dbService.getBlackjackTables(enabledOnly);
                sendJson(res, rows.map((r) => ({
                    id: r.id,
                    kind: r.kind,
                    name: r.name,
                    src: r.src,
                    description: r.description,
                    token_contract_address: r.token_contract_address,
                    logo_url: r.logo_url,
                    ticker: r.ticker,
                    iframe_url: r.iframe_url,
                    sort_order: r.sort_order,
                    enabled: r.enabled,
                })));
            }
            catch (error) {
                logger_1.logger.error('Error fetching blackjack tables:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Public: effective Blackjack bet limits from admin config (for UI; same logic as WS validation)
        const DEFAULT_MIN_BET = '1000000000000000000';
        const DEFAULT_MAX_BET = '100000000000000000000000';
        app.get('/api/blackjack/limits', async (req, res) => {
            try {
                const config = await dbService.getAdminGameConfig();
                let minBet = DEFAULT_MIN_BET;
                let maxBet = DEFAULT_MAX_BET;
                const minStr = config.blackjack_min_bet?.trim();
                const maxStr = config.blackjack_max_bet?.trim();
                if (minStr) {
                    try {
                        const parsed = BigInt(minStr);
                        if (parsed >= 0n)
                            minBet = parsed.toString();
                    }
                    catch {
                        /* keep default */
                    }
                }
                if (maxStr) {
                    try {
                        const parsed = BigInt(maxStr);
                        if (parsed > 0n)
                            maxBet = parsed.toString();
                    }
                    catch {
                        /* keep default */
                    }
                }
                if (BigInt(minBet) > BigInt(maxBet)) {
                    minBet = DEFAULT_MIN_BET;
                    maxBet = DEFAULT_MAX_BET;
                }
                sendJson(res, { minBet, maxBet });
            }
            catch (error) {
                logger_1.logger.error('Error fetching blackjack limits:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Admin: Blackjack tables CRUD (requires x-admin-wallet in allowed list)
        const dbSchemaError = (err) => {
            const msg = err && typeof err.message === 'string' ? err.message : '';
            const code = err?.code;
            if (code === '42703' || code === '42P01' || /column .* does not exist|relation .* does not exist/i.test(msg)) {
                return 'Database schema outdated. Run server migrations 026 and 028 (blackjack_tables).';
            }
            return null;
        };
        app.get('/api/admin/tables', async (req, res) => {
            try {
                const enabledOnly = req.query.enabledOnly === 'true';
                const rows = await dbService.getBlackjackTables(enabledOnly);
                sendJson(res, rows);
            }
            catch (error) {
                logger_1.logger.error('Error fetching admin blackjack tables:', error);
                const msg = dbSchemaError(error);
                res.status(msg ? 503 : 500).json({ error: msg || 'Internal server error' });
            }
        });
        app.post('/api/admin/tables', async (req, res) => {
            try {
                const { kind, name, src, description, token_contract_address, logo_url, ticker, iframe_url, sort_order, enabled } = req.body;
                if (!kind || !name || !src) {
                    res.status(400).json({ error: 'Missing required fields: kind, name, src' });
                    return;
                }
                if (kind !== 'image' && kind !== 'video') {
                    res.status(400).json({ error: 'kind must be image or video' });
                    return;
                }
                const row = await dbService.createBlackjackTable({
                    kind,
                    name,
                    src,
                    description: description ?? null,
                    token_contract_address: token_contract_address ?? null,
                    logo_url: logo_url ?? null,
                    ticker: ticker ?? null,
                    iframe_url: iframe_url ?? null,
                    sort_order: typeof sort_order === 'number' ? sort_order : 0,
                    enabled: enabled !== false,
                });
                sendJson(res, row);
            }
            catch (error) {
                logger_1.logger.error('Error creating blackjack table:', error);
                const msg = dbSchemaError(error);
                res.status(msg ? 503 : 500).json({ error: msg || 'Internal server error' });
            }
        });
        app.put('/api/admin/tables/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const updates = req.body;
                const row = await dbService.updateBlackjackTable(id, {
                    name: updates.name,
                    src: updates.src,
                    description: updates.description,
                    token_contract_address: updates.token_contract_address,
                    logo_url: updates.logo_url,
                    ticker: updates.ticker,
                    iframe_url: updates.iframe_url,
                    sort_order: updates.sort_order,
                    enabled: updates.enabled,
                });
                if (!row) {
                    res.status(404).json({ error: 'Table not found' });
                    return;
                }
                sendJson(res, row);
            }
            catch (error) {
                logger_1.logger.error('Error updating blackjack table:', error);
                const msg = dbSchemaError(error);
                res.status(msg ? 503 : 500).json({ error: msg || 'Internal server error' });
            }
        });
        app.delete('/api/admin/tables/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const ok = await dbService.deleteBlackjackTable(id);
                if (!ok) {
                    res.status(404).json({ error: 'Table not found' });
                    return;
                }
                res.status(204).send();
            }
            catch (error) {
                logger_1.logger.error('Error deleting blackjack table:', error);
                const msg = dbSchemaError(error);
                res.status(msg ? 503 : 500).json({ error: msg || 'Internal server error' });
            }
        });
        // Admin: game health (API, WS, RPC, MORBIUS per contract, Blackjack reserves)
        // MORBIUS in contract = MORBIUS_TOKEN.balanceOf(gameContract) for each game (canonical addresses in config/contracts.ts).
        app.get('/api/admin/health', async (req, res) => {
            try {
                const client = (0, chain_client_1.getPublicClient)();
                const blackjackAddress = contracts_1.BLACKJACK_ADDRESS;
                const api = 'ok';
                const ws = 'up'; // same process
                const games = {};
                const morbius = {};
                let blackjackReserves = { totalMorbiusInContract: '0', addressesWithReserve: [] };
                const readMorbiusBalance = async (contractAddress) => {
                    return client.readContract({ address: contracts_1.MORBIUS_TOKEN_ADDRESS, abi: ERC20_BALANCE_OF_ABI, functionName: 'balanceOf', args: [contractAddress] });
                };
                // Blackjack: MORBIUS balance of contract + sample of addresses with reserve > 0
                try {
                    const balance = await readMorbiusBalance(blackjackAddress);
                    morbius.blackjack = balance.toString();
                    games.blackjack = { rpc: 'ok' };
                    const addresses = await dbService.getPlayerAddressesForReserveCheck(50);
                    const reserves = await Promise.all(addresses.map(async (addr) => {
                        const a = addr.startsWith('0x') ? addr : `0x${addr}`;
                        try {
                            const r = await client.readContract({ address: blackjackAddress, abi: blackjack_1.blackjackAbi, functionName: 'getPlayerReserve', args: [a] });
                            return { address: addr, reserve: r };
                        }
                        catch {
                            return { address: addr, reserve: 0n };
                        }
                    }));
                    blackjackReserves = {
                        totalMorbiusInContract: balance.toString(),
                        addressesWithReserve: reserves.filter((r) => r.reserve > 0n).map((r) => ({ address: r.address, reserve: r.reserve.toString() })),
                    };
                }
                catch (err) {
                    games.blackjack = { rpc: 'fail', error: err?.message || 'RPC/contract read failed' };
                    morbius.blackjack = '0';
                }
                // Plinko: MORBIUS balance held by Plinko contract
                try {
                    const balance = await readMorbiusBalance(contracts_1.PLINKO_ADDRESS);
                    morbius.plinko = balance.toString();
                    const plinkoStats = await chainAnalytics.getPlinkoStats();
                    games.plinko = plinkoStats ? { rpc: 'ok' } : { rpc: 'ok' };
                }
                catch (err) {
                    games.plinko = { rpc: 'fail', error: err?.message || 'RPC failed' };
                    morbius.plinko = '0';
                }
                // Keno: MORBIUS balance held by Keno contract
                try {
                    const balance = await readMorbiusBalance(contracts_1.KENO_ADDRESS);
                    morbius.keno = balance.toString();
                    const kenoStats = await chainAnalytics.getKenoStats();
                    games.keno = kenoStats ? { rpc: 'ok' } : { rpc: 'ok' };
                }
                catch (err) {
                    games.keno = { rpc: 'fail', error: err?.message || 'RPC failed' };
                    morbius.keno = '0';
                }
                // Lottery: MORBIUS balance held by Lottery contract
                try {
                    const balance = await readMorbiusBalance(contracts_1.LOTTERY_ADDRESS);
                    morbius.lottery = balance.toString();
                    const lotteryStats = await chainAnalytics.getLotteryStats();
                    games.lottery = lotteryStats ? { rpc: 'ok' } : { rpc: 'ok' };
                }
                catch (err) {
                    games.lottery = { rpc: 'fail', error: err?.message || 'RPC failed' };
                    morbius.lottery = '0';
                }
                const contractAddresses = {
                    blackjack: blackjackAddress,
                    plinko: contracts_1.PLINKO_ADDRESS,
                    keno: contracts_1.KENO_ADDRESS,
                    lottery: contracts_1.LOTTERY_ADDRESS,
                };
                sendJson(res, { api, ws, games, morbius, blackjackReserves, contractAddresses });
            }
            catch (error) {
                logger_1.logger.error('Error in admin health:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Admin: game config (key-value; min/max bet, fee %, feature flags)
        app.get('/api/admin/config', async (req, res) => {
            try {
                const config = await dbService.getAdminGameConfig();
                sendJson(res, config);
            }
            catch (error) {
                logger_1.logger.error('Error fetching admin config:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        app.put('/api/admin/config', async (req, res) => {
            try {
                const body = req.body;
                const config = body?.config && typeof body.config === 'object' ? body.config : body;
                if (!config || typeof config !== 'object') {
                    res.status(400).json({ error: 'Body must be { config: { key: value, ... } } or { key: value, ... }' });
                    return;
                }
                for (const [key, value] of Object.entries(config)) {
                    if (typeof key !== 'string' || key.length > 128)
                        continue;
                    await dbService.setAdminGameConfigKey(key, value == null ? '' : String(value));
                }
                const updated = await dbService.getAdminGameConfig();
                sendJson(res, updated);
            }
            catch (error) {
                logger_1.logger.error('Error updating admin config:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Admin: metrics aggregates + series for charts (range: 24h | 7d | 30d | all). Source: Blackjack games DB.
        // On any DB or serialization error we return 200 with zeros so the tab always loads; errors are logged.
        app.get('/api/admin/metrics', async (req, res) => {
            const range = req.query.range || '24h';
            const validRange = ['24h', '7d', '30d', 'all'].includes(range) ? range : '24h';
            const zeroPayload = {
                range: validRange,
                volume: '0',
                games: 0,
                activePlayers: 0,
                pnl: '0',
                tournamentEntries: 0,
                series: [],
            };
            try {
                if (!['24h', '7d', '30d', 'all'].includes(range)) {
                    res.status(400).json({ error: 'Invalid range. Use 24h, 7d, 30d, or all' });
                    return;
                }
                let aggregates;
                let series;
                try {
                    [aggregates, series] = await Promise.all([
                        dbService.getMetricsAggregates(range),
                        dbService.getMetricsSeries(range),
                    ]);
                }
                catch (dbError) {
                    logger_1.logger.error('Admin metrics DB query failed', { error: dbError });
                    sendJson(res, zeroPayload);
                    return;
                }
                sendJson(res, {
                    range,
                    volume: aggregates.volume.toString(),
                    games: aggregates.games,
                    activePlayers: aggregates.activePlayers,
                    pnl: aggregates.pnl.toString(),
                    tournamentEntries: aggregates.tournamentEntries,
                    series,
                });
            }
            catch (error) {
                logger_1.logger.error('Error in admin metrics:', error);
                sendJson(res, zeroPayload);
            }
        });
        // Withdraw prepare: server signs withdrawal approval (amount = min(DB balance, contract reserve))
        const withdrawPublicClient = (0, viem_1.createPublicClient)({
            chain: chains_1.pulsechain,
            transport: (0, viem_1.http)(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
        });
        const blackjackContractAddress = process.env.BLACKJACK_CONTRACT_ADDRESS;
        if (!blackjackContractAddress) {
            throw new Error('BLACKJACK_CONTRACT_ADDRESS env var is required');
        }
        console.log('[Server] Using BLACKJACK_CONTRACT_ADDRESS:', blackjackContractAddress);
        const chainId = Number(process.env.BLACKJACK_CHAIN_ID || 369);
        console.log('[Server] Chain ID:', chainId);
        // Periodic cleanup of expired pending withdrawals (refund balances)
        setInterval(async () => {
            try {
                const expired = await dbService.expirePendingWithdrawals();
                if (expired > 0) {
                    logger_1.logger.info(`Expired ${expired} pending withdrawal(s) and refunded balances`);
                }
            }
            catch (err) {
                logger_1.logger.error('Error expiring pending withdrawals:', err);
            }
        }, 60_000); // every minute
        app.post('/api/withdraw/prepare', async (req, res) => {
            try {
                const { address, requestedAmount } = req.body;
                if (!address || typeof address !== 'string') {
                    return res.status(400).json({ error: 'Address required' });
                }
                const normalizedAddress = address.toLowerCase().startsWith('0x')
                    ? address.toLowerCase()
                    : `0x${address.toLowerCase()}`;
                if (normalizedAddress.length !== 42) {
                    return res.status(400).json({ error: 'Invalid address' });
                }
                // Reject if player already has a pending (un-expired) withdrawal
                const existingPending = await dbService.getActivePendingWithdrawal(normalizedAddress);
                if (existingPending) {
                    return res.status(409).json({
                        error: 'A withdrawal is already pending. Submit or wait for it to expire (10 min).',
                    });
                }
                // Expire any old pending withdrawals first (refunds balances)
                await dbService.expirePendingWithdrawals();
                // Get database balance for this specific wallet
                const dbBalance = await dbService.getPlayerBalance(normalizedAddress);
                // Get contract reserve for this specific wallet
                const contractReserve = await withdrawPublicClient.readContract({
                    address: blackjackContractAddress,
                    abi: blackjack_1.blackjackAbi,
                    functionName: 'getPlayerReserve',
                    args: [normalizedAddress],
                });
                // Cap withdrawal to minimum of: requested amount, DB balance, contract reserve
                const requested = requestedAmount != null ? BigInt(String(requestedAmount)) : dbBalance;
                const cap = dbBalance < contractReserve ? dbBalance : contractReserve;
                const amount = requested < cap ? requested : cap;
                if (amount < withdraw_sign_1.MIN_WITHDRAWAL_WEI) {
                    return res.status(400).json({
                        error: 'Insufficient withdrawable balance',
                        dbBalance: dbBalance.toString(),
                        contractReserve: contractReserve.toString(),
                    });
                }
                const privateKey = process.env.SETTLEMENT_PRIVATE_KEY;
                if (!privateKey) {
                    logger_1.logger.error('SETTLEMENT_PRIVATE_KEY not set');
                    return res.status(500).json({ error: 'Server configuration error' });
                }
                // Atomically deduct balance BEFORE signing (prevents stockpiling)
                try {
                    await dbService.deductPlayerBalance(normalizedAddress, amount);
                }
                catch (deductErr) {
                    return res.status(400).json({
                        error: 'Insufficient balance for withdrawal',
                        dbBalance: dbBalance.toString(),
                    });
                }
                // Generate unique nonce using timestamp + random
                const nonce = BigInt(Date.now()) * BigInt(1e6) + BigInt(Math.floor(Math.random() * 1e6));
                // Track pending withdrawal (so we can refund on expiry)
                await dbService.createPendingWithdrawal(normalizedAddress, nonce, amount);
                const payload = await (0, withdraw_sign_1.signWithdrawApproval)(normalizedAddress, amount, nonce, blackjackContractAddress, chainId, privateKey);
                logger_1.logger.info('Withdrawal prepared (balance deducted)', {
                    address: normalizedAddress,
                    amount: amount.toString(),
                    dbBalance: dbBalance.toString(),
                    contractReserve: contractReserve.toString(),
                });
                sendJson(res, payload);
            }
            catch (error) {
                logger_1.logger.error('Error preparing withdrawal:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Start server
        server.listen(PORT, () => {
            logger_1.logger.info(`Blackjack server running on port ${PORT}`);
            logger_1.logger.info('WebSocket server initialized');
            logger_1.logger.info('Database connected');
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to initialize services:', error);
        process.exit(1);
    }
}
// Graceful shutdown (freerollScheduler ref set in initializeServices)
let freerollScheduler = null;
process.on('SIGTERM', () => {
    logger_1.logger.info('SIGTERM received, shutting down gracefully');
    freerollScheduler?.stop();
    server.close(() => {
        logger_1.logger.info('Server closed');
        process.exit(0);
    });
});
process.on('SIGINT', () => {
    logger_1.logger.info('SIGINT received, shutting down gracefully');
    freerollScheduler?.stop();
    server.close(() => {
        logger_1.logger.info('Server closed');
        process.exit(0);
    });
});
// Start the server
initializeServices().catch((error) => {
    logger_1.logger.error('Failed to start server:', error);
    process.exit(1);
});
//# sourceMappingURL=server.js.map