import type { Express } from 'express';
import { BlackjackGameService } from '../services/blackjack-game.service';
import { DatabaseService } from '../services/database.service';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterVerifyRoutesOptions {
  app: Express;
  gameService: BlackjackGameService;
  dbService: DatabaseService;
}

export function registerVerifyRoutes({
  app,
  gameService,
  dbService,
}: RegisterVerifyRoutesOptions): void {
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
      sendJson(res, verification);
    } catch (error) {
      logger.error('Error verifying game:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/game/:gameId/hands', async (req, res) => {
    try {
      const { gameId } = req.params;
      const hands = await dbService.getGameHands(gameId);
      sendJson(res, hands);
    } catch (error) {
      logger.error('Error fetching game hands:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/blackjack/recent-games', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 200);
      const games = await dbService.getRecentGamesGlobal(limit);
      sendJson(res, games);
    } catch (error) {
      logger.error('Error fetching blackjack recent games:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
