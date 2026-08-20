/**
 * table-designs.routes.ts — Create-A-Table saves, for every wallet.
 *
 *   POST   /api/table-designs          — auth: save a new design
 *   PUT    /api/table-designs/:slug    — auth + owner: overwrite name/design
 *   DELETE /api/table-designs/:slug    — auth + owner: soft delete
 *   GET    /api/table-designs/mine     — auth: list the caller's designs
 *   GET    /api/table-designs/:slug    — public: one design, 404 unless published
 *                                        or the caller owns it
 *
 * The studio previously wrote themes onto existing multiplayer tables through
 * /api/admin/bj-multi/tables/:id/theme, which is admin-only — so a player who
 * designed a table had nowhere to save it. These routes are the player-facing
 * half: they never touch the live multiplayer tables, they only persist a
 * design under its owner.
 *
 * Ownership is checked in-handler against the stored row (there's no address
 * in the URL, so requireSameAddress doesn't apply) and the address always
 * comes from the session — never from the request body.
 */

import rateLimit from 'express-rate-limit';
import type { Express, Request, Response } from 'express';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';
import { attachUser, requireAuth } from '../middleware/require-auth';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterTableDesignRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
}

/** App-level cap, independent of the global body-parser limit. */
const MAX_DESIGN_BYTES = 4 * 1024 * 1024;
const NAME_MAX_LEN = 48;
/** Per-wallet ceiling, so one account can't fill the table with drafts. */
const MAX_DESIGNS_PER_OWNER = 40;

function designByteSize(design: unknown): number {
  return Buffer.byteLength(JSON.stringify(design) ?? '', 'utf8');
}

/**
 * A cheap shape check, not a schema validation. A design is rendered only by
 * the client that saved it and is never trusted for anything on the server, so
 * the point here is to reject obvious junk before it reaches the column — not
 * to police every field the studio might add later.
 */
function looksLikeTableDesign(design: any): design is Record<string, unknown> {
  return !!design && typeof design === 'object' && !Array.isArray(design) &&
    !!design.layout && typeof design.layout === 'object' &&
    !!design.layout.cards && typeof design.layout.cards === 'object';
}

export function registerTableDesignRoutes({ app, dbService, authService }: RegisterTableDesignRoutesOptions): void {
  const writeLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20,
    message: 'Too many table saves from this IP, try again later.',
    validate: { xForwardedForHeader: false },
  });
  const readLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 120,
    message: 'Too many requests from this IP, try again later.',
    validate: { xForwardedForHeader: false },
  });

  // POST /api/table-designs { name, design }
  app.post('/api/table-designs', writeLimiter, requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const name = String(req.body?.name ?? '').trim().slice(0, NAME_MAX_LEN);
      const design = req.body?.design;
      if (!name) return res.status(400).json({ error: 'name is required' });
      if (!looksLikeTableDesign(design)) return res.status(400).json({ error: 'design is not a valid table design' });

      const sizeBytes = designByteSize(design);
      if (sizeBytes > MAX_DESIGN_BYTES) {
        return res.status(413).json({ error: `table design too large (${sizeBytes} bytes, max ${MAX_DESIGN_BYTES})` });
      }

      const address = req.user!.address;
      const owned = await dbService.countTableDesignsByOwner(address);
      if (owned >= MAX_DESIGNS_PER_OWNER) {
        return res.status(409).json({
          error: `you have ${owned} saved tables (max ${MAX_DESIGNS_PER_OWNER}) — delete one first`,
          code: 'TOO_MANY_DESIGNS',
        });
      }

      const row = await dbService.createTableDesign(address, name, design, sizeBytes);
      return sendJson(res, row);
    } catch (error) {
      logger.error('[TableDesigns] create failed', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/table-designs/:slug { name?, design? }
  app.put('/api/table-designs/:slug', writeLimiter, requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const existing = await dbService.getTableDesignBySlug(req.params.slug);
      if (!existing || existing.status === 'disabled') return res.status(404).json({ error: 'not found' });
      if (existing.owner_address.toLowerCase() !== req.user!.address.toLowerCase()) {
        return res.status(403).json({ error: 'not your table', code: 'WRONG_WALLET' });
      }

      const name = String(req.body?.name ?? existing.name).trim().slice(0, NAME_MAX_LEN);
      if (!name) return res.status(400).json({ error: 'name is required' });
      const design = req.body?.design ?? existing.design;
      if (!looksLikeTableDesign(design)) return res.status(400).json({ error: 'design is not a valid table design' });

      const sizeBytes = designByteSize(design);
      if (sizeBytes > MAX_DESIGN_BYTES) {
        return res.status(413).json({ error: `table design too large (${sizeBytes} bytes, max ${MAX_DESIGN_BYTES})` });
      }

      const row = await dbService.updateTableDesign(existing.id, name, design, sizeBytes);
      if (!row) return res.status(404).json({ error: 'not found' });
      return sendJson(res, row);
    } catch (error) {
      logger.error('[TableDesigns] update failed', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/table-designs/:slug — soft delete.
  app.delete('/api/table-designs/:slug', writeLimiter, requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const existing = await dbService.getTableDesignBySlug(req.params.slug);
      if (!existing || existing.status === 'disabled') return res.status(404).json({ error: 'not found' });
      if (existing.owner_address.toLowerCase() !== req.user!.address.toLowerCase()) {
        return res.status(403).json({ error: 'not your table', code: 'WRONG_WALLET' });
      }
      await dbService.disableTableDesign(existing.id);
      return sendJson(res, { ok: true });
    } catch (error) {
      logger.error('[TableDesigns] delete failed', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/table-designs/mine — must be registered before /:slug, or "mine"
  // is captured as a slug.
  app.get('/api/table-designs/mine', readLimiter, requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const rows = await dbService.listTableDesignsByOwner(req.user!.address);
      return sendJson(res, { designs: rows });
    } catch (error) {
      logger.error('[TableDesigns] list failed', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/table-designs/:slug — public for published designs; an owner can
  // always read their own, so the studio can reload a save that was never
  // published.
  app.get('/api/table-designs/:slug', readLimiter, attachUser(authService), async (req: Request, res: Response) => {
    try {
      const row = await dbService.getTableDesignBySlug(req.params.slug);
      if (!row || row.status === 'disabled') return res.status(404).json({ error: 'not found' });
      const isOwner = row.owner_address.toLowerCase() === (req.user?.address ?? '').toLowerCase();
      if (row.status !== 'published' && !isOwner) return res.status(404).json({ error: 'not found' });
      return sendJson(res, row);
    } catch (error) {
      logger.error('[TableDesigns] read failed', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
}
