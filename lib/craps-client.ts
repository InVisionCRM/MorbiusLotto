// craps-client.ts — client wrappers for the public craps API endpoints used
// by the in-game fairness modal. Mirrors lib/plinko-client.ts in shape so the
// modal code reads like the Plinko one.

export interface CrapsVerifyRoll {
  nonce: number;
  die1: number;
  die2: number;
  sum: number;
  createdAt: string;
}

export interface CrapsVerifyResult {
  sessionId: string;
  status: 'active' | 'closed';
  serverSeedHash: string;
  /** null while the session is still live (seed hidden until rotation/close). */
  serverSeedRevealed: string | null;
  clientSeed: string;
  nonceCounter: number;
  rolls: CrapsVerifyRoll[];
  verification: {
    /** True when SHA-256(serverSeedRevealed) === serverSeedHash. */
    hashMatches: boolean;
    /** True when every persisted roll re-derives exactly. */
    rollsMatch: boolean;
    /** False while serverSeedRevealed is null. */
    seedRevealed: boolean;
    /** Per-roll dice the server re-derived from the revealed seed. */
    recomputedRolls: Array<{ nonce: number; die1: number; die2: number; sum: number }>;
  };
  recipe: string;
}

interface VerifyResponse extends CrapsVerifyResult {
  ok: boolean;
  error?: string;
}

export async function verifyCraps(sessionId: string): Promise<CrapsVerifyResult> {
  const trimmed = sessionId.trim();
  if (!trimmed) throw new Error('Empty session id.');
  const r = await fetch(`/api/arcade/craps/verify/${encodeURIComponent(trimmed)}`, {
    cache: 'no-store',
  });
  if (!r.ok) {
    if (r.status === 404) throw new Error('No session found with that ID.');
    throw new Error(`Verify failed (${r.status})`);
  }
  const data = (await r.json()) as VerifyResponse;
  if (!data.ok) throw new Error(data.error ?? 'Verify failed.');
  return data;
}

/** 16 random bytes → 32-char hex. Mirrors Plinko's randomClientSeed exactly. */
export function randomClientSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
