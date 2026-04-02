import type { Express } from 'express';
import { DatabaseService } from '../services/database.service';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterBlackjackPublicRoutesOptions {
  app: Express;
  dbService: DatabaseService;
}

const DEFAULT_MIN_BET = '1000000000000000000';
const DEFAULT_MAX_BET = '100000000000000000000000';
const DEFAULT_TABLE_THEME = 'image';
const DEFAULT_TABLE_ID = 'High-Roller-2';

const ensureProtocol = (url: string) => {
  if (!url) return url;
  if (/^https?:\/\//.test(url) || url.startsWith('/')) return url;
  return `https://${url}`;
};

export function registerBlackjackPublicRoutes({
  app,
  dbService,
}: RegisterBlackjackPublicRoutesOptions): void {
  app.get('/api/blackjack/tables', async (req, res) => {
    try {
      const enabledOnly = (req.query.enabledOnly as string) !== 'false';
      const rows = await dbService.getBlackjackTables(enabledOnly);
      sendJson(
        res,
        rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          name: r.name,
          src: ensureProtocol(r.src),
          description: r.description,
          token_contract_address: r.token_contract_address,
          logo_url: r.logo_url,
          ticker: r.ticker,
          iframe_url: r.iframe_url,
          website_url: r.website_url,
          sort_order: r.sort_order,
          enabled: r.enabled,
        })),
      );
    } catch (error) {
      logger.error('Error fetching blackjack tables:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/blackjack/limits', async (_req, res) => {
    try {
      const config = await dbService.getAdminGameConfig();
      let minBet = DEFAULT_MIN_BET;
      let maxBet = DEFAULT_MAX_BET;
      const minStr = config.blackjack_min_bet?.trim();
      const maxStr = config.blackjack_max_bet?.trim();
      if (minStr) {
        try {
          const parsed = BigInt(minStr);
          if (parsed >= 0n) minBet = parsed.toString();
        } catch {
          // keep default
        }
      }
      if (maxStr) {
        try {
          const parsed = BigInt(maxStr);
          if (parsed > 0n) maxBet = parsed.toString();
        } catch {
          // keep default
        }
      }
      if (BigInt(minBet) > BigInt(maxBet)) {
        minBet = DEFAULT_MIN_BET;
        maxBet = DEFAULT_MAX_BET;
      }
      sendJson(res, { minBet, maxBet });
    } catch (error) {
      logger.error('Error fetching blackjack limits:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/blackjack/default-table', async (_req, res) => {
    try {
      const config = await dbService.getAdminGameConfig();
      let themeKind = (config.blackjack_default_theme_kind ?? '').trim().toLowerCase();
      if (themeKind !== 'image' && themeKind !== 'video') themeKind = DEFAULT_TABLE_THEME;
      const tableId = (config.blackjack_default_table_id ?? '').trim() || DEFAULT_TABLE_ID;
      sendJson(res, { themeKind: themeKind as 'image' | 'video', tableId });
    } catch (error) {
      logger.error('Error fetching blackjack default table:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
