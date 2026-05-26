import type { Express } from 'express';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';
import { AuthService } from '../services/auth.service';
import { SESSION_COOKIE_NAME } from '../middleware/require-auth';

interface Options {
  app: Express;
  authService: AuthService;
}

/**
 * Three endpoints: /nonce, /verify, /logout — plus /me as a convenience.
 *
 *   GET  /api/auth/nonce    -> { nonce, expiresAt }
 *   POST /api/auth/verify   { message, signature } -> { address, expiresAt }   (Set-Cookie)
 *   POST /api/auth/logout                          -> { ok: true }             (clears cookie)
 *   GET  /api/auth/me                              -> { address } | 401
 *   GET  /api/auth/ws-token                        -> { token } | 401  (for cross-host WS)
 *
 * The frontend builds a SIWE message client-side with the nonce returned here,
 * has the wallet sign it, and POSTs the pair back to /verify.
 */
export function registerAuthRoutes({ app, authService }: Options): void {
  const isProd = process.env.NODE_ENV === 'production';

  /**
   * Decide cookie SameSite + Secure attributes from the actual request,
   * not from `NODE_ENV` (which may not be set on some deploys). The cookie
   * MUST be `SameSite=None; Secure` for the browser to send it on
   * cross-origin requests from morbius.io → api.morbius.io. If we set
   * `SameSite=Lax`, the cookie is stored but never travels — auth silently
   * fails on every subsequent call.
   *
   * `req.secure` is set by Express when behind a trusted reverse proxy
   * (Railway sets `X-Forwarded-Proto: https`, and `app.set('trust proxy', 1)`
   * is set in server.ts).
   */
  const cookieAttrs = (req: import('express').Request) => {
    const isSecure = req.secure || isProd;
    const domain =
      process.env.SESSION_COOKIE_DOMAIN?.trim() ||
      (isProd ? '.morbius.io' : undefined);
    return {
      httpOnly: true as const,
      secure: isSecure,
      sameSite: (isSecure ? 'none' : 'lax') as 'none' | 'lax',
      path: '/' as const,
      ...(domain ? { domain } : {}),
    };
  };

  app.get('/api/auth/nonce', async (_req, res) => {
    try {
      const { nonce, expiresAt } = await authService.issueNonce();
      sendJson(res, { nonce, expiresAt });
    } catch (err) {
      logger.error('auth.nonce.error', { err: String(err) });
      res.status(500).json({ error: 'failed to issue nonce' });
    }
  });

  app.post('/api/auth/verify', async (req, res) => {
    try {
      const { message, signature } = req.body ?? {};
      if (typeof message !== 'string' || typeof signature !== 'string') {
        return res.status(400).json({ error: 'message and signature required' });
      }
      const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
        || req.ip
        || undefined;
      const userAgent = req.headers['user-agent'] || undefined;

      const session = await authService.verifyAndCreateSession(message, signature, { ip, userAgent });

      res.cookie(SESSION_COOKIE_NAME, session.token, {
        ...cookieAttrs(req),
        expires: session.expiresAt,
      });

      return sendJson(res, {
        address: session.walletAddress,
        expiresAt: session.expiresAt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'verify failed';
      logger.warn('auth.verify.rejected', { msg });
      return res.status(401).json({ error: msg });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      const token = (req as typeof req & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE_NAME];
      if (token) await authService.revokeSession(token);
      // clearCookie must match the SameSite/Secure attrs that were set, or
      // the browser keeps the old cookie.
      res.clearCookie(SESSION_COOKIE_NAME, cookieAttrs(req));
      sendJson(res, { ok: true });
    } catch (err) {
      logger.error('auth.logout.error', { err: String(err) });
      res.status(500).json({ error: 'logout failed' });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    const token = (req as typeof req & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'no session' });
    const session = await authService.lookupSession(token);
    if (!session) return res.status(401).json({ error: 'session invalid or expired' });
    return sendJson(res, { address: session.walletAddress, expiresAt: session.expiresAt });
  });

  /**
   * Return the active session token for cross-origin WebSocket upgrades when
   * morb_session cannot be sent (frontend on morbius.io, WS on Railway, etc.).
   * Caller must already hold a valid httpOnly cookie; use only over HTTPS/WSS.
   */
  app.get('/api/auth/ws-token', async (req, res) => {
    const token = (req as typeof req & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'no session' });
    const session = await authService.lookupSession(token);
    if (!session) return res.status(401).json({ error: 'session invalid or expired' });
    return sendJson(res, { token });
  });
}
