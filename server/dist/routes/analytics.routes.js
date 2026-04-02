"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAnalyticsRoutes = registerAnalyticsRoutes;
const json_1 = require("../http/json");
const logger_1 = require("../utils/logger");
const TOP_PLAYER_CATEGORIES = ['games', 'profit_loss', 'wagered', 'win_rate', 'total_won', 'win_streak'];
function registerAnalyticsRoutes({ app, dbService }) {
    app.get('/api/analytics/global', async (_req, res) => {
        try {
            const analytics = await dbService.getGlobalAnalytics();
            (0, json_1.sendJson)(res, analytics);
        }
        catch (error) {
            logger_1.logger.error('Error fetching global analytics:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/analytics/top-players', async (req, res) => {
        try {
            const limit = Math.min(parseInt(req.query.limit) || 25, 50);
            const topPlayers = await dbService.getTopPlayers(limit);
            (0, json_1.sendJson)(res, topPlayers);
        }
        catch (error) {
            logger_1.logger.error('Error fetching top players:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/analytics/top-player-by-category', async (req, res) => {
        try {
            const category = req.query.category;
            if (!category || !TOP_PLAYER_CATEGORIES.includes(category)) {
                res.status(400).json({ error: 'Invalid category' });
                return;
            }
            const topPlayer = await dbService.getTopPlayersByCategory(category);
            (0, json_1.sendJson)(res, topPlayer);
        }
        catch (error) {
            logger_1.logger.error('Error fetching top player by category:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
//# sourceMappingURL=analytics.routes.js.map