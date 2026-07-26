/**
 * arcade-seed.routes.ts — MORBIUS Arcade: provably-fair seed management.
 *
 * Shared across the instant, one-shot games (Dice, Limbo, Roulette, …). These
 * games settle in a single request, so — unlike Blackjack/Mines/Craps — there
 * is no per-round decision window to hang a commitment on. Instead each wallet
 * holds one PERSISTENT active server seed whose hash is published here BEFORE
 * any bet; every bet consumes it at a sequential nonce (see arcade-seed.service
 * + consumeSeedForBet); the plaintext is revealed only on rotate.
 *
 * Endpoints (Telegram initData OR SIWE morb_session cookie, same as the games):
 *   GET  /api/arcade/seed/active  — current commitment (hash, clientSeed, nonce)
 *                                    + last revealed pair; commits one lazily.
 *   POST /api/arcade/seed/rotate  — reveal the active seed, commit a fresh one.
 *   POST /api/arcade/seed/client  — set the client seed without rotating.
 */

import type { Express, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { verifyTelegramInitData } from '../services/telegram.service';
import { SESSION_COOKIE_NAME } from '../middleware/require-auth';
import {
  getPublicSeedState,
  rotateActiveSeed,
  setActiveClientSeed,
} from '../services/arcade-seed.service';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeSeedRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
}

const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

async function walletFromInitData(
  dbService: DatabaseService,
  initData: unknown,
): Promise<string | null> {
  if (typeof initData !== 'string') return null;
  const tgUser = verifyTelegramInitData(initData);
  if (!tgUser) return null;
  const r = await dbService
    .getPool()
    .query('SELECT wallet_address FROM telegram_links WHERE telegram_chat_id = $1', [tgUser.id]);
  return r.rows.length > 0 ? String(r.rows[0].wallet_address) : null;
}

export function registerArcadeSeedRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeSeedRoutesOptions): void {
  async function resolveWallet(req: Request): Promise<string | null> {
    const tgWallet = await walletFromInitData(dbService, req.body?.initData);
    if (tgWallet) return tgWallet;
    const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE_NAME];
    if (!token) return null;
    const session = await authService.lookupSession(token);
    return session ? session.walletAddress : null;
  }

  // GET /api/arcade/seed/active — read (and lazily commit) the active seed.
  app.get('/api/arcade/seed/active', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });
      const state = await getPublicSeedState(dbService, wallet);
      return res.json({ ok: true, ...state });
    } catch (err) {
      logger.error('[arcade-seed] active failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the active seed.' });
    }
  });

  // POST /api/arcade/seed/rotate — reveal current, commit new. Optional clientSeed.
  app.post('/api/arcade/seed/rotate', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });
      const state = await rotateActiveSeed(dbService, wallet, req.body?.clientSeed);
      return res.json({ ok: true, ...state });
    } catch (err) {
      logger.error('[arcade-seed] rotate failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not rotate the seed.' });
    }
  });

  // POST /api/arcade/seed/client — set the client seed without rotating.
  app.post('/api/arcade/seed/client', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });
      const state = await setActiveClientSeed(dbService, wallet, req.body?.clientSeed);
      return res.json({ ok: true, ...state });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (msg === 'EMPTY_CLIENT_SEED') {
        return res.status(400).json({ ok: false, error: 'Client seed cannot be empty.' });
      }
      logger.error('[arcade-seed] client failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not update the client seed.' });
    }
  });

  logger.info('[arcade-seed] routes registered');
}
