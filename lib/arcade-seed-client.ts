/**
 * arcade-seed-client.ts — client wrappers for the shared provably-fair seed
 * pair used by the instant arcade games (Dice, Limbo, Roulette, …).
 *
 * These games settle in one request, so fairness rests on a PERSISTENT active
 * server seed whose hash is published BEFORE any bet (unlike the old flow that
 * minted and revealed a seed inside the same /play call). The plaintext is
 * revealed only when the player rotates. See server/src/routes/arcade-seed.routes.
 */

import { apiFetchJson } from '@/lib/api-auth';

export interface ArcadeSeedRevealed {
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}

export interface ArcadeSeedState {
  seedPairId: string;
  /** SHA-256 commitment published up front — this is what fixes future rolls. */
  serverSeedHash: string;
  clientSeed: string;
  /** Next bet's nonce under the current commitment. */
  nonce: number;
  /** Most recently rotated (revealed) pair, if any — verify past rounds with it. */
  previous: ArcadeSeedRevealed | null;
}

/** Read (and lazily commit) the wallet's active seed. Requires an authed session. */
export async function fetchActiveSeed(): Promise<ArcadeSeedState> {
  return apiFetchJson<ArcadeSeedState>('/api/arcade/seed/active');
}

/** Change the client seed without rotating the committed server seed. */
export async function setArcadeClientSeed(clientSeed: string): Promise<ArcadeSeedState> {
  return apiFetchJson<ArcadeSeedState>('/api/arcade/seed/client', {
    method: 'POST',
    body: JSON.stringify({ clientSeed }),
  });
}

/**
 * Reveal the active server seed and commit a fresh one. The returned `previous`
 * carries the now-revealed seed so the player can verify every past round that
 * used it. Optionally sets a new client seed for the fresh commitment.
 */
export async function rotateArcadeSeed(clientSeed?: string): Promise<ArcadeSeedState> {
  return apiFetchJson<ArcadeSeedState>('/api/arcade/seed/rotate', {
    method: 'POST',
    body: JSON.stringify(clientSeed ? { clientSeed } : {}),
  });
}
