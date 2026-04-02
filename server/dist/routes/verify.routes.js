"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerVerifyRoutes = registerVerifyRoutes;
const json_1 = require("../http/json");
const logger_1 = require("../utils/logger");
function registerVerifyRoutes({ app, gameService, dbService, }) {
    app.get('/api/game/:gameId/verify', async (req, res) => {
        try {
            const { gameId } = req.params;
            const verification = await gameService.verifyGame(gameId);
            if (verification == null) {
                res.status(404).json({
                    error: 'Game not found',
                    message: 'No completed game with this ID. Use a game ID from your History (same backend).',
                });
                return;
            }
            (0, json_1.sendJson)(res, verification);
        }
        catch (error) {
            logger_1.logger.error('Error verifying game:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/game/:gameId/hands', async (req, res) => {
        try {
            const { gameId } = req.params;
            const hands = await dbService.getGameHands(gameId);
            (0, json_1.sendJson)(res, hands);
        }
        catch (error) {
            logger_1.logger.error('Error fetching game hands:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/blackjack/recent-games', async (req, res) => {
        try {
            const limit = Math.min(parseInt(req.query.limit) || 20, 200);
            const games = await dbService.getRecentGamesGlobal(limit);
            (0, json_1.sendJson)(res, games);
        }
        catch (error) {
            logger_1.logger.error('Error fetching blackjack recent games:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
//# sourceMappingURL=verify.routes.js.map