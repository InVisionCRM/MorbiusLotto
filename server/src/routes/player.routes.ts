import type { Express } from 'express';
import { DatabaseService } from '../services/database.service';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterPlayerReadRoutesOptions {
  app: Express;
  dbService: DatabaseService;
}

export function registerPlayerReadRoutes({ app, dbService }: RegisterPlayerReadRoutesOptions): void {
  app.get('/api/player/:address/profile', async (req, res) => {
    try {
      const { address } = req.params;
      const profile = await dbService.getProfile(address);
      sendJson(res, profile ?? { displayName: null, profileImageUrl: null, avatarConfig: null });
    } catch (error) {
      logger.error('Error fetching player profile:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/player/:address/is-following', async (req, res) => {
    try {
      const following = req.params.address;
      const follower = req.query.follower as string;
      if (!follower) return res.status(400).json({ error: 'follower query param required' });
      const isFollowing = await dbService.isFollowing(follower, following);
      sendJson(res, { isFollowing });
    } catch (error) {
      logger.error('Error checking follow status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/player/:address/follow-counts', async (req, res) => {
    try {
      const counts = await dbService.getFollowCounts(req.params.address);
      sendJson(res, counts);
    } catch (error) {
      logger.error('Error fetching follow counts:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/player/:address/followers', async (req, res) => {
    try {
      const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
      const offset = parseInt(req.query.offset as string) || 0;
      const followers = await dbService.getFollowers(req.params.address, limit, offset);
      sendJson(res, followers);
    } catch (error) {
      logger.error('Error fetching followers:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/player/:address/following', async (req, res) => {
    try {
      const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
      const offset = parseInt(req.query.offset as string) || 0;
      const following = await dbService.getFollowing(req.params.address, limit, offset);
      sendJson(res, following);
    } catch (error) {
      logger.error('Error fetching following:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/player/:address/stats', async (req, res) => {
    try {
      const { address } = req.params;
      const stats = await dbService.getPlayerStats(address);
      sendJson(res, stats);
    } catch (error) {
      logger.error('Error fetching player stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/player/:address/stats/enhanced', async (req, res) => {
    try {
      const { address } = req.params;
      const stats = await dbService.getPlayerStatsEnhanced(address);
      sendJson(res, stats);
    } catch (error) {
      logger.error('Error fetching enhanced player stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/player/:address/games', async (req, res) => {
    try {
      const { address } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const games = await dbService.getPlayerGames(address, limit, offset);
      sendJson(res, games);
    } catch (error) {
      logger.error('Error fetching player games:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
