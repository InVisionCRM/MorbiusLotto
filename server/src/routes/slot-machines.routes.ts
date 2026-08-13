/**
 * slot-machines.routes.ts — community-built slot machines
 * (public/slot-builder-lab.html "Save to Community" / "Publish" / embed flow).
 *
 *   POST   /api/slot-machines               — auth: save a new machine (status: draft)
 *   PUT    /api/slot-machines/:slug         — auth + owner: update name/def (resets to draft)
 *   POST   /api/slot-machines/:slug/publish — auth + owner: make it publicly embeddable
 *   DELETE /api/slot-machines/:slug         — auth + owner: soft delete (status: disabled)
 *   GET    /api/slot-machines/mine          — auth: list the caller's machines
 *   GET    /api/slot-machines/:slug         — public (attachUser optional): metadata only
 *   GET    /api/slot-machines/:slug/def     — public: the raw def, what CabinetEngine.boot()'s
 *                                              defUrl fetches — 404 unless published
 *
 * There's no address in these URLs (unlike /api/referrals/:address/...), so
 * ownership is checked in-handler against the DB row rather than via
 * requireSameAddress — never trust a client-supplied address.
 *
 * These cabinets are play-money only (cabinet-engine.js's balance lives in
 * localStorage, never touches a wallet), so the RTP check run on save/update
 * (server/src/lib/cabinet-math-runner.ts) is an informational fairness
 * signal, not a financial gate — a flagged machine can still be published.
 */

import rateLimit from 'express-rate-limit';
import type { Express, Request, Response } from 'express';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';
import { attachUser, requireAuth } from '../middleware/require-auth';
import { simulateDef } from '../lib/cabinet-math-runner';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterSlotMachineRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
}

const MAX_DEF_BYTES = 4 * 1024 * 1024; // app-level cap, independent of the global body-parser limit
const NAME_MAX_LEN = 48;

function defByteSize(def: unknown): number {
  return Buffer.byteLength(JSON.stringify(def) ?? '', 'utf8');
}

function looksLikeMachineDef(def: any): def is { cols: number; rows: number; symbols: unknown[] } {
  return !!def && typeof def === 'object' &&
    Number.isFinite(def.cols) && Number.isFinite(def.rows) &&
    Array.isArray(def.symbols) && def.symbols.length > 0;
}

export function registerSlotMachineRoutes({ app, dbService, authService }: RegisterSlotMachineRoutesOptions): void {
  const writeLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20,
    message: 'Too many machine saves from this IP, try again later.',
    validate: { xForwardedForHeader: false },
  });
  const defLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 120,
    message: 'Too many requests from this IP, try again later.',
    validate: { xForwardedForHeader: false },
  });

  // POST /api/slot-machines { name, def } — save a new machine.
  // Body size relies on the global express.json() limit in server.ts, which
  // must be raised above its 100kb default for machine defs (inline base64
  // symbol art routinely exceeds that) — a route-local express.json() here
  // can't override it, since the global parser already consumed/rejected
  // the body before this route sees it.
  app.post(
    '/api/slot-machines',
    writeLimiter,
    requireAuth(authService),
    async (req: Request, res: Response) => {
      try {
        const name = String(req.body?.name ?? '').trim().slice(0, NAME_MAX_LEN);
        const def = req.body?.def;
        if (!name) return res.status(400).json({ error: 'name is required' });
        if (!looksLikeMachineDef(def)) return res.status(400).json({ error: 'def is not a valid machine definition' });
        const sizeBytes = defByteSize(def);
        if (sizeBytes > MAX_DEF_BYTES) {
          return res.status(413).json({ error: `machine definition too large (${sizeBytes} bytes, max ${MAX_DEF_BYTES})` });
        }
        const address = req.user!.address;
        let rtp;
        try {
          rtp = simulateDef(def, `create:${address}:${Date.now()}`);
        } catch (simErr) {
          logger.warn('[SlotMachines] simulate failed on create', { message: String(simErr) });
          return res.status(422).json({ error: 'could not simulate this machine definition — check win.mode and symbol pays' });
        }
        const row = await dbService.createSlotMachine(address, name, def, sizeBytes, rtp);
        return sendJson(res, row);
      } catch (error) {
        logger.error('[SlotMachines] create failed', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  // PUT /api/slot-machines/:slug { name, def } — update, resets to draft.
  app.put(
    '/api/slot-machines/:slug',
    writeLimiter,
    requireAuth(authService),
    async (req: Request, res: Response) => {
      try {
        const existing = await dbService.getSlotMachineBySlug(req.params.slug);
        if (!existing) return res.status(404).json({ error: 'not found' });
        if (existing.owner_address.toLowerCase() !== req.user!.address.toLowerCase()) {
          return res.status(403).json({ error: 'not your machine', code: 'WRONG_WALLET' });
        }
        const name = String(req.body?.name ?? existing.name).trim().slice(0, NAME_MAX_LEN);
        const def = req.body?.def ?? existing.machine_def;
        if (!looksLikeMachineDef(def)) return res.status(400).json({ error: 'def is not a valid machine definition' });
        const sizeBytes = defByteSize(def);
        if (sizeBytes > MAX_DEF_BYTES) {
          return res.status(413).json({ error: `machine definition too large (${sizeBytes} bytes, max ${MAX_DEF_BYTES})` });
        }
        let rtp;
        try {
          rtp = simulateDef(def, `update:${existing.id}:${Date.now()}`);
        } catch (simErr) {
          logger.warn('[SlotMachines] simulate failed on update', { message: String(simErr) });
          return res.status(422).json({ error: 'could not simulate this machine definition — check win.mode and symbol pays' });
        }
        const row = await dbService.updateSlotMachine(existing.id, name, def, sizeBytes, rtp);
        return sendJson(res, row);
      } catch (error) {
        logger.error('[SlotMachines] update failed', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  // POST /api/slot-machines/:slug/publish — make it publicly embeddable.
  app.post(
    '/api/slot-machines/:slug/publish',
    writeLimiter,
    requireAuth(authService),
    async (req: Request, res: Response) => {
      try {
        const existing = await dbService.getSlotMachineBySlug(req.params.slug);
        if (!existing) return res.status(404).json({ error: 'not found' });
        if (existing.owner_address.toLowerCase() !== req.user!.address.toLowerCase()) {
          return res.status(403).json({ error: 'not your machine', code: 'WRONG_WALLET' });
        }
        const row = await dbService.publishSlotMachine(existing.id);
        return sendJson(res, row);
      } catch (error) {
        logger.error('[SlotMachines] publish failed', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  // DELETE /api/slot-machines/:slug — soft delete.
  app.delete(
    '/api/slot-machines/:slug',
    writeLimiter,
    requireAuth(authService),
    async (req: Request, res: Response) => {
      try {
        const existing = await dbService.getSlotMachineBySlug(req.params.slug);
        if (!existing) return res.status(404).json({ error: 'not found' });
        if (existing.owner_address.toLowerCase() !== req.user!.address.toLowerCase()) {
          return res.status(403).json({ error: 'not your machine', code: 'WRONG_WALLET' });
        }
        await dbService.disableSlotMachine(existing.id);
        return sendJson(res, { ok: true });
      } catch (error) {
        logger.error('[SlotMachines] delete failed', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  // GET /api/slot-machines/mine — the caller's own machines, any status.
  // Registered before the /:slug routes so the literal `mine` segment can
  // never be captured as a :slug param.
  app.get('/api/slot-machines/mine', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const rows = await dbService.listSlotMachinesByOwner(req.user!.address);
      return sendJson(res, rows);
    } catch (error) {
      logger.error('[SlotMachines] list mine failed', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/slot-machines/:slug — metadata only, no def. Public unless draft/disabled and not the owner.
  app.get('/api/slot-machines/:slug', attachUser(authService), async (req: Request, res: Response) => {
    try {
      const row = await dbService.getSlotMachineBySlug(req.params.slug);
      if (!row) return res.status(404).json({ error: 'not found' });
      const isOwner = req.user?.address?.toLowerCase() === row.owner_address.toLowerCase();
      if (row.status !== 'published' && !isOwner) return res.status(404).json({ error: 'not found' });
      const { machine_def: _omit, ...metadata } = row;
      return sendJson(res, metadata);
    } catch (error) {
      logger.error('[SlotMachines] get metadata failed', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/slot-machines/:slug/def — the raw def CabinetEngine.boot()'s defUrl fetches.
  // Public, published-only, cached briefly since defs rarely change post-publish.
  app.get('/api/slot-machines/:slug/def', defLimiter, async (req: Request, res: Response) => {
    try {
      const row = await dbService.getSlotMachineBySlug(req.params.slug);
      if (!row || row.status !== 'published') return res.status(404).json({ error: 'not found' });
      res.setHeader('Cache-Control', 'public, max-age=30');
      return sendJson(res, row.machine_def);
    } catch (error) {
      logger.error('[SlotMachines] get def failed', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  logger.info('[SlotMachines] routes registered');
}
