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
const database_service_1 = require("./services/database.service");
const provably_fair_service_1 = require("./services/provably-fair.service");
const blackjack_game_service_1 = require("./services/blackjack-game.service");
const websocket_service_1 = require("./services/websocket.service");
const logger_1 = require("./utils/logger");
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const PORT = process.env.PORT || 3001;
// Security middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
// Rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);
// Body parsing
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
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
        // Initialize WebSocket service
        const wsService = new websocket_service_1.WebSocketService(server, gameService, dbService);
        // API routes
        app.get('/api/player/:address/stats', async (req, res) => {
            try {
                const { address } = req.params;
                const stats = await dbService.getPlayerStats(address);
                res.json(stats);
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
                res.json(verification);
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
                res.json(stats);
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
                res.json(analytics);
            }
            catch (error) {
                logger_1.logger.error('Error fetching global analytics:', error);
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
                res.json(games);
            }
            catch (error) {
                logger_1.logger.error('Error fetching player games:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Settlements monitoring endpoint
        app.get('/api/settlements', async (req, res) => {
            try {
                const status = req.query.status;
                const limit = parseInt(req.query.limit) || 100;
                const settlements = await dbService.getSettlements(status, limit);
                res.json(settlements);
            }
            catch (error) {
                logger_1.logger.error('Error fetching settlements:', error);
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
// Graceful shutdown
process.on('SIGTERM', () => {
    logger_1.logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
        logger_1.logger.info('Server closed');
        process.exit(0);
    });
});
process.on('SIGINT', () => {
    logger_1.logger.info('SIGINT received, shutting down gracefully');
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