/**
 * provably-fair-deck.ts — client-side re-derivation of a dealt deck.
 *
 * A faithful port of the server's `pf.fisherYatesShuffle` + its HMAC byte
 * stream, so a player's own browser can reproduce the exact card order from
 * the published (serverSeed, clientSeed, nonce) — the verify endpoint's word
 * is never the only evidence.
 *
 * message = `${clientSeed}:${nonce}:${roundIndex}`, HMAC-SHA256 under the
 * server seed, 4 bytes consumed per Fisher-Yates swap, walking i = 51 → 1.
 */

/** sha256 hex via WebCrypto — re-checks the server-seed commitment locally. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 16 random bytes → 32-char hex, generated locally with WebCrypto. */
export function randomClientSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Re-derive the full 52-card deck (indices 0..51) for a published hand. */
export async function deriveDeck(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): Promise<number[]> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(serverSeed),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const roundCache = new Map<number, Uint8Array>();
  async function roundBytes(roundIndex: number): Promise<Uint8Array> {
    const cached = roundCache.get(roundIndex);
    if (cached) return cached;
    const sig = await crypto.subtle.sign(
      'HMAC',
      key,
      enc.encode(`${clientSeed}:${nonce}:${roundIndex}`),
    );
    const bytes = new Uint8Array(sig);
    roundCache.set(roundIndex, bytes);
    return bytes;
  }

  // Each HMAC round yields 32 bytes; a swap needs 4 and may straddle a round.
  async function streamBytes(cursor: number): Promise<number[]> {
    const roundIndex = Math.floor(cursor / 32);
    const byteOffset = cursor % 32;
    const cur = await roundBytes(roundIndex);
    if (byteOffset + 4 <= 32) {
      return [cur[byteOffset], cur[byteOffset + 1], cur[byteOffset + 2], cur[byteOffset + 3]];
    }
    const next = await roundBytes(roundIndex + 1);
    const fromCur = 32 - byteOffset;
    const out: number[] = [];
    for (let i = byteOffset; i < 32; i++) out.push(cur[i]);
    for (let i = 0; i < 4 - fromCur; i++) out.push(next[i]);
    return out;
  }

  function bytesToFloat(b: number[]): number {
    return (
      b[0] / 256 + b[1] / (256 * 256) + b[2] / (256 * 256 * 256) + b[3] / (256 * 256 * 256 * 256)
    );
  }

  const deck = Array.from({ length: 52 }, (_, i) => i);
  let cursor = 0;
  for (let i = 51; i >= 1; i--) {
    const b = await streamBytes(cursor);
    cursor += 4;
    const j = Math.floor(bytesToFloat(b) * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** True when two card arrays are identical in order. */
export function sameCards(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
