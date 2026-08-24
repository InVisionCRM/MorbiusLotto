/**
 * stickers.routes.ts — the Create-A-Table sticker library.
 *
 *   POST   /api/table-stickers                  — auth: upload a decal (pending review)
 *   GET    /api/table-stickers/mine             — auth: the caller's decals, any status
 *   DELETE /api/table-stickers/:slug            — auth + owner: withdraw one
 *   GET    /api/table-stickers/library          — public: approved decals only
 *   GET    /api/table-stickers/queue            — admin: the pending queue
 *   POST   /api/table-stickers/:slug/review     — admin: approve or reject
 *
 * Only UPLOADED decals live here. A decal a creator types is text in their own
 * design blob, shown to whoever opens that table, and needs no review — see
 * the note on StickerLayer in lib/table-layers.ts.
 *
 * The review state is the point of the whole file. An uploaded image can be
 * put in front of other players, so it stays out of the shared library until
 * an admin clears it. A pending decal is NOT unusable in the meantime: its
 * owner can put it on their own table immediately. That keeps moderation from
 * standing between someone and their own work, while still holding the line on
 * what gets shown to everyone else.
 *
 * Ownership is checked in-handler against the stored row — there's no address
 * in these URLs, so requireSameAddress doesn't apply — and the address always
 * comes from the session, never from a request body.
 */

import rateLimit from 'express-rate-limit';
import type { Express, Request, Response } from 'express';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/require-auth';
import { isAdminWallet } from '../lib/cosmetics-catalog';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterStickerRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
}

/**
 * App-level cap, independent of the global body-parser limit. Smaller than a
 * whole table design's 4MB: a decal is one small mark on the cloth, and
 * anything approaching a megabyte is a backdrop being uploaded in the wrong
 * place.
 */
const MAX_IMAGE_BYTES = 1024 * 1024;
const NAME_MAX_LEN = 48;
const NOTE_MAX_LEN = 240;
/** Per-wallet ceiling, so one account can't flood the moderation queue. */
const MAX_STICKERS_PER_OWNER = 30;

/**
 * Decals are rendered by dropping the string into an <img src>, so the scheme
 * is the security boundary rather than a nicety: `javascript:` and `data:text/html`
 * both "work" in some contexts. Only raster data: URIs are accepted — no
 * remote URLs (which would let a decal be swapped for something else after
 * approval) and no SVG (which can carry script).
 */
const ALLOWED_IMAGE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

function looksLikeStickerImage(image: unknown): image is string {
  return typeof image === 'string' && ALLOWED_IMAGE.test(image);
}

export function registerStickerRoutes({ app, dbService, authService }: RegisterStickerRoutesOptions): void {
  const writeLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20,
    message: 'Too many sticker uploads from this IP, try again later.',
    validate: { xForwardedForHeader: false },
  });
  const readLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 120,
    message: 'Too many requests from this IP, try again later.',
    validate: { xForwardedForHeader: false },
  });

  // POST /api/table-stickers { name, image }
  app.post('/api/table-stickers', writeLimiter, requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const owner = req.user!.address;
      const { name, image } = req.body ?? {};

      const cleanName = typeof name === 'string' ? name.trim().slice(0, NAME_MAX_LEN) : '';
      if (!cleanName) return res.status(400).json({ error: 'name required' });

      if (!looksLikeStickerImage(image)) {
        return res.status(400).json({ error: 'image must be a base64 data URI (png, jpeg, webp or gif)' });
      }

      const bytes = Buffer.byteLength(image, 'utf8');
      if (bytes > MAX_IMAGE_BYTES) {
        return res.status(413).json({ error: 'sticker too large', code: 'TOO_LARGE', maxBytes: MAX_IMAGE_BYTES });
      }

      const existing = await dbService.countStickersByOwner(owner);
      if (existing >= MAX_STICKERS_PER_OWNER) {
        return res.status(409).json({
          error: `you already have ${MAX_STICKERS_PER_OWNER} stickers — delete one first`,
          code: 'TOO_MANY_STICKERS',
        });
      }

      const row = await dbService.createSticker(owner, cleanName, image, bytes);
      sendJson(res, row);
    } catch (error) {
      logger.error('Error creating sticker:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/table-stickers/mine — the caller's own, at any status, so they can
  // see what's still waiting and what came back rejected (and why).
  app.get('/api/table-stickers/mine', readLimiter, requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const rows = await dbService.listStickersByOwner(req.user!.address);
      sendJson(res, { stickers: rows });
    } catch (error) {
      logger.error('Error listing own stickers:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/table-stickers/library — public. Approved only; this is the one
  // list a table builder picks from when decorating with someone else's work.
  //
  // Registered BEFORE /:slug-style routes would be, but there are none here
  // that could shadow it — 'library' and 'queue' are literal segments and the
  // only parameterised path is /:slug/review.
  app.get('/api/table-stickers/library', readLimiter, async (_req: Request, res: Response) => {
    try {
      const rows = await dbService.listApprovedStickers();
      sendJson(res, { stickers: rows });
    } catch (error) {
      logger.error('Error listing sticker library:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/table-stickers/queue — admin only.
  app.get('/api/table-stickers/queue', readLimiter, requireAuth(authService), async (req: Request, res: Response) => {
    try {
      if (!isAdminWallet(req.user!.address)) return res.status(403).json({ error: 'Unauthorized' });
      const rows = await dbService.listPendingStickers();
      sendJson(res, { stickers: rows });
    } catch (error) {
      logger.error('Error listing sticker queue:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/table-stickers/:slug/review { status, note } — admin only.
  app.post('/api/table-stickers/:slug/review', writeLimiter, requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const reviewer = req.user!.address;
      if (!isAdminWallet(reviewer)) return res.status(403).json({ error: 'Unauthorized' });

      const { status, note } = req.body ?? {};
      if (status !== 'approved' && status !== 'rejected') {
        return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
      }

      const row = await dbService.getStickerBySlug(req.params.slug);
      if (!row) return res.status(404).json({ error: 'not found' });

      const cleanNote = typeof note === 'string' && note.trim()
        ? note.trim().slice(0, NOTE_MAX_LEN)
        : null;

      const updated = await dbService.reviewSticker(row.id, status, reviewer, cleanNote);
      if (!updated) {
        // The UPDATE is guarded on status='pending', so this is another admin
        // having decided between the queue load and this click — not an error.
        return res.status(409).json({ error: 'already reviewed', code: 'ALREADY_REVIEWED' });
      }
      sendJson(res, updated);
    } catch (error) {
      logger.error('Error reviewing sticker:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/table-stickers/:slug — auth + owner. Soft, so a table still
  // referencing the decal can be reasoned about rather than silently breaking.
  app.delete('/api/table-stickers/:slug', writeLimiter, requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const row = await dbService.getStickerBySlug(req.params.slug);
      if (!row || row.status === 'deleted') return res.status(404).json({ error: 'not found' });
      if (row.owner_address.toLowerCase() !== req.user!.address.toLowerCase()) {
        return res.status(403).json({ error: 'not yours' });
      }
      await dbService.deleteSticker(row.id);
      sendJson(res, { ok: true });
    } catch (error) {
      logger.error('Error deleting sticker:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
