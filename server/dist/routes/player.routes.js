"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPlayerReadRoutes = registerPlayerReadRoutes;
const json_1 = require("../http/json");
const logger_1 = require("../utils/logger");
function registerPlayerReadRoutes({ app, dbService }) {
    app.get('/api/player/:address/profile', async (req, res) => {
        try {
            const { address } = req.params;
            const profile = await dbService.getProfile(address);
            (0, json_1.sendJson)(res, profile ?? { displayName: null, profileImageUrl: null, avatarConfig: null });
        }
        catch (error) {
            logger_1.logger.error('Error fetching player profile:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/player/:address/is-following', async (req, res) => {
        try {
            const following = req.params.address;
            const follower = req.query.follower;
            if (!follower)
                return res.status(400).json({ error: 'follower query param required' });
            const isFollowing = await dbService.isFollowing(follower, following);
            (0, json_1.sendJson)(res, { isFollowing });
        }
        catch (error) {
            logger_1.logger.error('Error checking follow status:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/player/:address/follow-counts', async (req, res) => {
        try {
            const counts = await dbService.getFollowCounts(req.params.address);
            (0, json_1.sendJson)(res, counts);
        }
        catch (error) {
            logger_1.logger.error('Error fetching follow counts:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/player/:address/followers', async (req, res) => {
        try {
            const limit = Math.min(100, parseInt(req.query.limit) || 50);
            const offset = parseInt(req.query.offset) || 0;
            const followers = await dbService.getFollowers(req.params.address, limit, offset);
            (0, json_1.sendJson)(res, followers);
        }
        catch (error) {
            logger_1.logger.error('Error fetching followers:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/player/:address/following', async (req, res) => {
        try {
            const limit = Math.min(100, parseInt(req.query.limit) || 50);
            const offset = parseInt(req.query.offset) || 0;
            const following = await dbService.getFollowing(req.params.address, limit, offset);
            (0, json_1.sendJson)(res, following);
        }
        catch (error) {
            logger_1.logger.error('Error fetching following:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/player/:address/stats', async (req, res) => {
        try {
            const { address } = req.params;
            const stats = await dbService.getPlayerStats(address);
            (0, json_1.sendJson)(res, stats);
        }
        catch (error) {
            logger_1.logger.error('Error fetching player stats:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/player/:address/stats/enhanced', async (req, res) => {
        try {
            const { address } = req.params;
            const stats = await dbService.getPlayerStatsEnhanced(address);
            (0, json_1.sendJson)(res, stats);
        }
        catch (error) {
            logger_1.logger.error('Error fetching enhanced player stats:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/player/:address/games', async (req, res) => {
        try {
            const { address } = req.params;
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;
            const games = await dbService.getPlayerGames(address, limit, offset);
            (0, json_1.sendJson)(res, games);
        }
        catch (error) {
            logger_1.logger.error('Error fetching player games:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
//# sourceMappingURL=player.routes.js.map