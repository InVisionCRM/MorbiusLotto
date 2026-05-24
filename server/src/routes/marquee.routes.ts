/**
 * marquee.routes.ts — poker sponsored-token marquee, "market view" data source.
 *
 * GET /api/marquee/tokens
 *   Returns a deduped union of enabled blackjack_tables rows and
 *   marquee_extra_tokens rows that have both a valid token contract address
 *   and a non-empty ticker. Used by SponsoredTokenMarquee.tsx when the user
 *   toggles to the "market view" stock-ticker tape.
 *
 *   Response: Array<{ address: string; ticker: string; name: string; sortOrder: number }>
 *
 *   Address is normalised to lower-case; dedupe is by lower-cased address so
 *   $MORBIUS (which appears 7 times in blackjack_tables under different theme
 *   names) only shows once in the marquee.
 */

import type { Express } from 'express';
import type { DatabaseService } from '../services/database.service';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterMarqueeRoutesOptions {
  app: Express;
  dbService: DatabaseService;
}

interface MarqueeTokenRow {
  address: string;
  ticker: string;
  name: string;
  sort_order: number;
}

export function registerMarqueeRoutes({
  app,
  dbService,
}: RegisterMarqueeRoutesOptions): void {
  app.get('/api/marquee/tokens', async (_req, res) => {
    try {
      const pool = dbService.getPool();
      const result = await pool.query<MarqueeTokenRow>(`
        WITH combined AS (
          SELECT
            LOWER(token_contract_address) AS address,
            ticker,
            name,
            sort_order
            FROM blackjack_tables
           WHERE enabled = TRUE
             AND ticker IS NOT NULL AND ticker <> ''
             AND token_contract_address IS NOT NULL
             AND token_contract_address ~ '^0x[a-fA-F0-9]{40}$'
          UNION ALL
          SELECT
            token_contract_address AS address,
            ticker,
            name,
            sort_order
            FROM marquee_extra_tokens
           WHERE enabled = TRUE
        )
        SELECT DISTINCT ON (address)
          address, ticker, name, sort_order
          FROM combined
         ORDER BY address, sort_order ASC
      `);

      // Re-sort by sort_order for the final response (DISTINCT ON forced us to
      // ORDER BY address first).
      const tokens = result.rows
        .map((r) => ({
          address: r.address,
          ticker: r.ticker,
          name: r.name,
          sortOrder: r.sort_order,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.ticker.localeCompare(b.ticker));

      sendJson(res, tokens);
    } catch (error) {
      logger.error('Error fetching marquee tokens:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
