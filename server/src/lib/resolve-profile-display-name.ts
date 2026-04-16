import type { DatabaseService } from '../services/database.service';

const MIN_LEN = 3;
const MAX_LEN = 32;

/** Match websocket profile rules: letters, numbers, spaces, hyphens, underscores. */
export function sanitizeDisplayNameCandidate(raw: string): string {
  return raw.trim().replace(/[^\w\s-]/gi, '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
}

/**
 * When the client sends a short/empty display name (e.g. avatar-only save from the builder),
 * keep the existing stored name if it is valid; otherwise assign a short guest-style default.
 */
export async function resolveDisplayNameForProfileUpsert(
  db: DatabaseService,
  walletAddress: string,
  rawIncoming: string | undefined | null,
): Promise<string> {
  const incoming = typeof rawIncoming === 'string' ? sanitizeDisplayNameCandidate(rawIncoming) : '';
  if (incoming.length >= MIN_LEN && incoming.length <= MAX_LEN) {
    return incoming;
  }

  const profile = await db.getProfile(walletAddress);
  const existing =
    typeof profile?.displayName === 'string' ? sanitizeDisplayNameCandidate(profile.displayName) : '';
  if (existing.length >= MIN_LEN) {
    return existing.slice(0, MAX_LEN);
  }

  const hex = String(walletAddress).replace(/^0x/i, '').slice(0, 10) || 'player';
  const guest = sanitizeDisplayNameCandidate(`Guest_${hex}`);
  if (guest.length >= MIN_LEN) return guest;
  return `Guest_${hex}`.slice(0, MAX_LEN);
}
