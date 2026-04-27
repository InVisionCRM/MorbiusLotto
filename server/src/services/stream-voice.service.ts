import crypto from 'crypto';
import { logger } from '../utils/logger';

const TOKEN_TTL_SECONDS = 60 * 60; // 1h — refresh well before expiry on the client

export interface StreamVoiceToken {
  apiKey: string;
  token: string;
  userId: string;
  expiresAt: number;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Stream Video uses HS256 JWTs signed with the app's API secret. The `user_id`
 * claim must match the userId passed to `client.connectUser()`.
 * Reference: https://getstream.io/video/docs/api/#generating-tokens
 */
export function generateStreamVoiceToken(walletAddress: string): StreamVoiceToken | null {
  const apiKey = process.env.STREAM_API_KEY;
  const apiSecret = process.env.STREAM_API_SECRET;
  if (!apiKey || !apiSecret) {
    logger.warn('Stream voice token requested but STREAM_API_KEY/SECRET not configured');
    return null;
  }

  const userId = walletAddress.toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + TOKEN_TTL_SECONDS;

  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ user_id: userId, iat: now, exp }));
  const signingInput = `${header}.${payload}`;
  const signature = base64url(crypto.createHmac('sha256', apiSecret).update(signingInput).digest());

  return {
    apiKey,
    token: `${signingInput}.${signature}`,
    userId,
    expiresAt: exp * 1000,
  };
}
