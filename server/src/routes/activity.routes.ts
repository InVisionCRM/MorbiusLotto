/**
 * activity.routes.ts — public "Game Activity" feed.
 *
 *   GET /api/activity/games                      → every game + all-time totals
 *   GET /api/activity/games/:gameKey/plays?limit → recent plays for one game
 *
 * Public reads (no wallet data beyond what a play already exposes).
 */

import type { Express, Request, Response } from 'express';
import type { GameActivityService } from '../services/game-activity.service';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterActivityRoutesOptions {
  app: Express;
  gameActivityService: GameActivityService;
}

export function registerActivityRoutes({ app, gameActivityService }: RegisterActivityRoutesOptions): void {
  app.get('/api/activity/games', async (_req: Request, res: Response) => {
    try {
      const result = await gameActivityService.getGameSummaries();
      sendJson(res, result);
    } catch (error) {
      logger.error('[activity] games summary failed', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/activity/games/:gameKey/plays', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(500, parseInt(String(req.query.limit ?? '500'), 10) || 500);
      const plays = await gameActivityService.getGamePlays(req.params.gameKey, limit);
      sendJson(res, { plays });
    } catch (error) {
      logger.error('[activity] game plays failed', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  logger.info('[activity] routes registered');
}
