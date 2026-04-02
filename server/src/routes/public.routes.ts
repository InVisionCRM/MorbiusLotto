import type { Express } from 'express';
import { DatabaseService } from '../services/database.service';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterPublicRoutesOptions {
  app: Express;
  dbService: DatabaseService;
}

const PUBLIC_CONFIG_KEYS = ['ad_creative_url', 'ad_creative_hero_url', 'ad_creative_loading_url'] as const;

export function registerPublicRoutes({ app, dbService }: RegisterPublicRoutesOptions): void {
  app.get('/api/config/public', async (_req, res) => {
    try {
      const full = await dbService.getAdminGameConfig();
      const publicConfig: Record<string, string> = {};
      for (const key of PUBLIC_CONFIG_KEYS) {
        const v = full[key];
        publicConfig[key] = typeof v === 'string' ? v : '';
      }
      sendJson(res, publicConfig);
    } catch (error) {
      logger.error('Error fetching public config:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
