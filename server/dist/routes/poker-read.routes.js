"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPokerReadRoutes = registerPokerReadRoutes;
const json_1 = require("../http/json");
const logger_1 = require("../utils/logger");
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function registerPokerReadRoutes({ app, dbService, }) {
    app.get('/api/poker/player/:address/hands', async (req, res) => {
        try {
            const { address } = req.params;
            if (!address || !ADDRESS_REGEX.test(address)) {
                return res.status(400).json({ error: 'Invalid address' });
            }
            const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 25_000);
            const offset = parseInt(req.query.offset) || 0;
            const hands = await dbService.getPokerPlayerHands(address, limit, offset);
            (0, json_1.sendJson)(res, hands);
        }
        catch (error) {
            logger_1.logger.error('Error fetching poker player hands:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/poker/player/:address/stats', async (req, res) => {
        try {
            const { address } = req.params;
            if (!address || !ADDRESS_REGEX.test(address)) {
                return res.status(400).json({ error: 'Invalid address' });
            }
            const rawScope = String(req.query.scope ?? 'cash');
            const scope = rawScope === 'tournament' || rawScope === 'all' ? rawScope : 'cash';
            const stats = await dbService.getPokerPlayerStats(address, scope);
            (0, json_1.sendJson)(res, stats);
        }
        catch (error) {
            logger_1.logger.error('Error fetching poker player stats:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/poker/table/:tableId/dashboard', async (req, res) => {
        try {
            const { tableId } = req.params;
            if (!tableId || !UUID_REGEX.test(tableId)) {
                return res.status(400).json({ error: 'Invalid table ID' });
            }
            const data = await dbService.getPokerTableDashboardStats(tableId);
            if (!data.table) {
                return res.status(404).json({ error: 'Table not found' });
            }
            (0, json_1.sendJson)(res, data);
        }
        catch (error) {
            logger_1.logger.error('Error fetching poker table dashboard:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/poker/table/:tableId/player/:address/stats', async (req, res) => {
        try {
            const { tableId, address } = req.params;
            if (!tableId || !UUID_REGEX.test(tableId)) {
                return res.status(400).json({ error: 'Invalid table ID' });
            }
            if (!address || !ADDRESS_REGEX.test(address)) {
                return res.status(400).json({ error: 'Invalid address' });
            }
            const data = await dbService.getPokerPlayerTableStats(tableId, address);
            (0, json_1.sendJson)(res, data);
        }
        catch (error) {
            logger_1.logger.error('Error fetching poker player table stats:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/poker/hands/:handId', async (req, res) => {
        try {
            const { handId } = req.params;
            const playerAddress = req.query.playerAddress;
            if (!handId || !UUID_REGEX.test(handId)) {
                return res.status(400).json({ error: 'Invalid hand ID' });
            }
            if (!playerAddress || !ADDRESS_REGEX.test(playerAddress)) {
                return res.status(400).json({ error: 'Invalid playerAddress query' });
            }
            const detail = await dbService.getPokerHandDetail(handId, playerAddress);
            if (!detail) {
                return res.status(404).json({ error: 'Hand not found' });
            }
            (0, json_1.sendJson)(res, detail);
        }
        catch (error) {
            logger_1.logger.error('Error fetching poker hand detail:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
//# sourceMappingURL=poker-read.routes.js.map