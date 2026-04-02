"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGameReadRoutes = registerGameReadRoutes;
const json_1 = require("../http/json");
const logger_1 = require("../utils/logger");
function registerGameReadRoutes({ app, dbService, chainAnalytics, }) {
    app.get('/api/lottery/top-players', async (req, res) => {
        try {
            chainAnalytics.indexInstantLotteryResults().catch((err) => logger_1.logger.warn('Lottery index (background):', err));
            const limit = Math.min(parseInt(req.query.limit) || 25, 50);
            const topPlayers = await dbService.getLotteryTopPlayers(limit);
            (0, json_1.sendJson)(res, topPlayers);
        }
        catch (error) {
            logger_1.logger.error('Error fetching lottery top players:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/lottery/player/:address/stats', async (req, res) => {
        try {
            const address = (req.params.address || '').trim();
            if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
                return res.status(400).json({ error: 'Valid wallet address required' });
            }
            chainAnalytics.indexInstantLotteryResults().catch((err) => logger_1.logger.warn('Lottery index (background):', err));
            const stats = await dbService.getLotteryPlayerStats(address);
            if (stats == null) {
                return (0, json_1.sendJson)(res, { total_games: 0, total_bet: '0', total_win: '0', profit_loss: '0', win_rate: 0 });
            }
            (0, json_1.sendJson)(res, {
                total_games: stats.total_games,
                total_bet: stats.total_bet.toString(),
                total_win: stats.total_win.toString(),
                profit_loss: stats.profit_loss.toString(),
                win_rate: stats.win_rate,
            });
        }
        catch (error) {
            logger_1.logger.error('Error fetching lottery player stats:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/lottery/instant/play/verify/:txHash', async (req, res) => {
        try {
            const txHash = (req.params.txHash || '').trim();
            if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
                return res.status(400).json({ error: 'Valid tx hash (0x + 64 hex) required' });
            }
            const play = await dbService.getInstantLotteryPlayPFByTxHash(txHash);
            if (play == null) {
                return res.status(404).json({ error: 'Play not found', message: 'No provably-fair play with this tx hash' });
            }
            (0, json_1.sendJson)(res, {
                wallet_address: play.wallet_address,
                wager: play.wager.toString(),
                player_numbers: play.player_numbers,
                winning_numbers: play.winning_numbers,
                match_count: play.match_count,
                gross_payout: play.gross_payout.toString(),
                net_payout: play.net_payout.toString(),
                server_seed_hash: play.server_seed_hash,
                server_seed: play.server_seed,
                client_seed: play.client_seed,
                nonce: play.nonce,
            });
        }
        catch (error) {
            logger_1.logger.error('Error fetching instant lottery verify:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/plinko/player/:address/drops', async (req, res) => {
        try {
            const { address } = req.params;
            if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
                return res.status(400).json({ error: 'Invalid address' });
            }
            const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 300);
            const offset = Math.max(parseInt(req.query.offset) || 0, 0);
            const drops = await chainAnalytics.getPlinkoPlayerDrops(address, limit, offset);
            (0, json_1.sendJson)(res, drops);
        }
        catch (error) {
            logger_1.logger.error('Error fetching plinko player drops:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/plinko/player/:address/stats', async (req, res) => {
        try {
            const { address } = req.params;
            if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
                return res.status(400).json({ error: 'Invalid address' });
            }
            const stats = await chainAnalytics.getPlinkoPlayerStats(address);
            (0, json_1.sendJson)(res, stats);
        }
        catch (error) {
            logger_1.logger.error('Error fetching plinko player stats:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
//# sourceMappingURL=game-read.routes.js.map