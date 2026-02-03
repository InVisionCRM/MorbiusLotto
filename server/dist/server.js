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
const blackjack_1 = require("./abi/blackjack");
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const PORT = process.env.PORT || 3001;
// CORS: allow frontend origin(s). Set FRONTEND_URL on Railway to your app URL (comma-separated for multiple).
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
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
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);
// Body parsing
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
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
        // Chain analytics (on-chain games: Plinko, Keno, Lottery, BigWheel)
        const chainAnalytics = new chain_analytics_service_1.ChainAnalyticsService();
        // API routes
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
        // Withdraw prepare: server signs withdrawal approval (amount = min(DB balance, contract reserve))
        const withdrawPublicClient = (0, viem_1.createPublicClient)({
            chain: chains_1.pulsechain,
            transport: (0, viem_1.http)(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
        });
        const blackjackContractAddress = (process.env.BLACKJACK_CONTRACT_ADDRESS || '0xDe2c7a18de8a9d889E18874EA90A42f84FbaA080');
        const chainId = Number(process.env.BLACKJACK_CHAIN_ID || 369);
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
                // Generate unique nonce using timestamp + random
                const nonce = BigInt(Date.now()) * BigInt(1e6) + BigInt(Math.floor(Math.random() * 1e6));
                const payload = await (0, withdraw_sign_1.signWithdrawApproval)(normalizedAddress, amount, nonce, blackjackContractAddress, chainId, privateKey);
                logger_1.logger.info('Withdrawal prepared', {
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