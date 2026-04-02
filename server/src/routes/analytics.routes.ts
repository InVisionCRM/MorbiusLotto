import type { Express } from 'express';
import { DatabaseService } from '../services/database.service';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterAnalyticsRoutesOptions {
  app: Express;
  dbService: DatabaseService;
}

const TOP_PLAYER_CATEGORIES = ['games', 'profit_loss', 'wagered', 'win_rate', 'total_won', 'win_streak'] as const;

export function registerAnalyticsRoutes({ app, dbService }: RegisterAnalyticsRoutesOptions): void {
  app.get('/api/analytics/global', async (_req, res) => {
    try {
      const analytics = await dbService.getGlobalAnalytics();
      sendJson(res, analytics);
    } catch (error) {
      logger.error('Error fetching global analytics:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/analytics/top-players', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 50);
      const topPlayers = await dbService.getTopPlayers(limit);
      sendJson(res, topPlayers);
    } catch (error) {
      logger.error('Error fetching top players:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/analytics/top-player-by-category', async (req, res) => {
    try {
      const category = req.query.category as string;
      if (!category || !TOP_PLAYER_CATEGORIES.includes(category as (typeof TOP_PLAYER_CATEGORIES)[number])) {
        res.status(400).json({ error: 'Invalid category' });
        return;
      }
      const topPlayer = await dbService.getTopPlayersByCategory(category as any);
      sendJson(res, topPlayer);
    } catch (error) {
      logger.error('Error fetching top player by category:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
