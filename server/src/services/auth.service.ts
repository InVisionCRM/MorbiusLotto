import crypto from 'crypto';
import type { Pool } from 'pg';
import { SiweMessage, generateNonce as siweGenerateNonce } from 'siwe';
import { getAddress } from 'viem';
import { logger } from '../utils/logger';

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes to sign after fetching a nonce
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days; sliding refresh handled separately

export interface AuthSession {
  id: string;
  token: string;
  walletAddress: string; // checksummed
  createdAt: Date;
  expiresAt: Date;
}

export class AuthService {
  constructor(private readonly pool: Pool) {}

  /**
   * Issue a one-time nonce that the client signs as part of the SIWE message.
   * Stored in auth_nonces with a 10-minute TTL.
   */
  async issueNonce(): Promise<{ nonce: string; expiresAt: Date }> {
    const nonce = siweGenerateNonce();
    const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
    await this.pool.query(
      'INSERT INTO auth_nonces (nonce, expires_at) VALUES ($1, $2)',
      [nonce, expiresAt],
    );
    return { nonce, expiresAt };
  }

  /**
   * Verify a signed SIWE message, consume the nonce, and create a session.
   * Throws on any invariant failure — caller maps to a 401 response.
   */
  async verifyAndCreateSession(
    rawMessage: string,
    signature: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<AuthSession> {
    const message = new SiweMessage(rawMessage);

    // Library check: signature is valid for the address in the message.
    const verification = await message.verify({ signature });
    if (!verification.success) {
      throw new Error(`SIWE verification failed: ${verification.error?.type ?? 'unknown'}`);
    }

    // Nonce check: was issued by us, hasn't been used, hasn't expired.
    const nonceRows = await this.pool.query<{ used_at: Date | null; expires_at: Date }>(
      'SELECT used_at, expires_at FROM auth_nonces WHERE nonce = $1 FOR UPDATE',
      [message.nonce],
    );
    if (nonceRows.rowCount === 0) throw new Error('Unknown nonce');
    const nonceRow = nonceRows.rows[0]!;
    if (nonceRow.used_at) throw new Error('Nonce already used');
    if (nonceRow.expires_at.getTime() < Date.now()) throw new Error('Nonce expired');

    // Domain check: prevent phishing replay. message.domain must equal the host
    // we expect (set via SIWE_EXPECTED_DOMAIN env var; defaults to morbius.io).
    const expectedDomain = process.env.SIWE_EXPECTED_DOMAIN || 'morbius.io';
    if (message.domain !== expectedDomain) {
      throw new Error(`Unexpected SIWE domain: ${message.domain}`);
    }

    // Address must be a valid EVM address — re-checksum so DB always sees one canonical form.
    let checksummed: `0x${string}`;
    try {
      checksummed = getAddress(message.address);
    } catch {
      throw new Error('Invalid address in SIWE message');
    }

    // Atomic: mark nonce used + insert session row.
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE auth_nonces SET used_at = NOW() WHERE nonce = $1', [message.nonce]);
      const sess = await client.query<{ id: string; created_at: Date }>(
        `INSERT INTO sessions (token, wallet_address, expires_at, ip, user_agent)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
        [token, checksummed.toLowerCase(), expiresAt, meta.ip ?? null, meta.userAgent ?? null],
      );
      await client.query('COMMIT');

      const row = sess.rows[0]!;
      logger.info('siwe.session.created', { wallet: checksummed, sessionId: row.id });
      return {
        id: row.id,
        token,
        walletAddress: checksummed,
        createdAt: row.created_at,
        expiresAt,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Look up an active session by token. Returns null if missing, revoked, or expired.
   * Used by the require-auth middleware on every request.
   */
  async lookupSession(token: string): Promise<AuthSession | null> {
    if (!token) return null;
    const rows = await this.pool.query<{
      id: string;
      wallet_address: string;
      created_at: Date;
      expires_at: Date;
    }>(
      `SELECT id, wallet_address, created_at, expires_at
         FROM sessions
        WHERE token = $1
          AND revoked_at IS NULL
          AND expires_at > NOW()`,
      [token],
    );
    if (rows.rowCount === 0) return null;
    const row = rows.rows[0]!;
    return {
      id: row.id,
      token,
      walletAddress: getAddress(row.wallet_address),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }

  /** Revoke a single session (logout). Idempotent. */
  async revokeSession(token: string): Promise<void> {
    await this.pool.query(
      'UPDATE sessions SET revoked_at = NOW() WHERE token = $1 AND revoked_at IS NULL',
      [token],
    );
  }

  /**
   * Revoke every active session for a wallet (e.g. "log out everywhere" or
   * incident response). Returns the count of sessions revoked.
   */
  async revokeAllForWallet(walletAddress: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE sessions SET revoked_at = NOW()
        WHERE LOWER(wallet_address) = LOWER($1)
          AND revoked_at IS NULL`,
      [walletAddress],
    );
    return result.rowCount ?? 0;
  }

  /**
   * Background pruning. Call from a daily cron — keeps the tables small.
   * Returns counts deleted/pruned for logging.
   */
  async pruneExpired(): Promise<{ noncesDeleted: number; sessionsDeleted: number }> {
    const n = await this.pool.query(
      'DELETE FROM auth_nonces WHERE expires_at < NOW() - INTERVAL \'1 day\'',
    );
    const s = await this.pool.query(
      `DELETE FROM sessions
        WHERE (expires_at < NOW() - INTERVAL '30 days')
           OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '30 days')`,
    );
    return { noncesDeleted: n.rowCount ?? 0, sessionsDeleted: s.rowCount ?? 0 };
  }
}
