import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { AuthService } from '../services/auth.service';

export const SESSION_COOKIE_NAME = 'morb_session';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by attachUser / requireAuth. Present only when a valid session cookie was sent. */
    user?: { address: string }; // checksummed
  }
}

/**
 * Non-blocking: if a valid session cookie is present, set req.user.
 * Otherwise do nothing. Use this on routes that have both public and
 * personalised behavior (e.g. a profile page that shows extra data when
 * logged in).
 *
 * Mount this BEFORE any route that reads req.user but doesn't strictly
 * require it.
 */
export function attachUser(authService: AuthService): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE_NAME];
      if (!token) return next();
      const session = await authService.lookupSession(token);
      if (session) req.user = { address: session.walletAddress };
      return next();
    } catch {
      // Never crash a request because of an auth lookup failure — just leave req.user unset.
      return next();
    }
  };
}

/**
 * Blocking: 401 if no valid session is attached.
 * Use this on routes that must know the caller's address (withdraw, profile
 * edits, tournament cancel, etc.).
 *
 * Recommended pattern in a route handler:
 *
 *   app.post('/api/withdraw', requireAuth(authService), async (req, res) => {
 *     const address = req.user!.address;            // <-- the trusted caller
 *     const { amount } = req.body;
 *     await moneyService.enqueueWithdrawal(address, amount);
 *     ...
 *   });
 *
 * Notice we no longer take `address` from req.body — that's the whole point.
 */
export function requireAuth(authService: AuthService): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ error: 'auth required', code: 'NO_SESSION' });
    }
    const session = await authService.lookupSession(token);
    if (!session) {
      return res.status(401).json({ error: 'session invalid or expired', code: 'BAD_SESSION' });
    }
    req.user = { address: session.walletAddress };
    return next();
  };
}

/**
 * Like requireAuth, but also enforces that req.user.address matches a
 * specific value (route param, query, or wallet field in body).
 *
 *   app.post('/api/player/:address/profile',
 *     requireAuth(authService),
 *     requireSameAddress(req => req.params.address),
 *     handler);
 *
 * Closes the "send signed request as someone else" gap on routes that take an
 * address in the URL.
 */
export function requireSameAddress(
  extract: (req: Request) => string | undefined,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const claimed = extract(req)?.toLowerCase();
    const actual = req.user?.address?.toLowerCase();
    if (!actual || !claimed || actual !== claimed) {
      return res.status(403).json({ error: 'address mismatch', code: 'WRONG_WALLET' });
    }
    return next();
  };
}
