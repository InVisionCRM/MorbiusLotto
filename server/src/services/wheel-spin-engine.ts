import type { Pool, PoolClient } from 'pg';
import { ProvablyFairService } from './provably-fair.service';
import { getWheelRule } from './wheel-spin-wallet';

const pfService = new ProvablyFairService();

export interface WheelSegment {
  index: number;
  value: string;
  label: string;
  weight: number;
  prize_wei: string;
  free_spins: number;
}

export interface WheelOutcome {
  segmentIndex: number;
  segment: WheelSegment;
  prizeWei: bigint;
  freeSpins: number;
  hmac: string;
}

let cachedSegments: { segments: WheelSegment[]; loadedAt: number } | null = null;
const SEGMENTS_CACHE_TTL_MS = 30_000;

export async function loadSegments(executor: Pool | PoolClient): Promise<WheelSegment[]> {
  const now = Date.now();
  if (cachedSegments && now - cachedSegments.loadedAt < SEGMENTS_CACHE_TTL_MS) {
    return cachedSegments.segments;
  }
  const raw = await getWheelRule(executor, 'wheel_segments');
  if (!raw) throw new Error('wheel_segments rule missing — apply migration 142');
  const parsed: WheelSegment[] = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('wheel_segments rule must be a non-empty array');
  }
  parsed.sort((a, b) => a.index - b.index);
  for (let i = 0; i < parsed.length; i++) {
    if (parsed[i].index !== i) {
      throw new Error(`wheel_segments must be 0..N-1 contiguous (got index ${parsed[i].index} at slot ${i})`);
    }
  }
  cachedSegments = { segments: parsed, loadedAt: now };
  return parsed;
}

export function invalidateSegmentCache(): void {
  cachedSegments = null;
}

export function generateClientSeed(): string {
  return pfService.generateServerSeed().slice(0, 16);
}

export function newCommitment(): { serverSeed: string; serverSeedHash: string } {
  const serverSeed = pfService.generateServerSeed();
  return { serverSeed, serverSeedHash: pfService.createServerSeedHash(serverSeed) };
}

/**
 * Given a committed seed triple (server, client, nonce) and the segment table,
 * pick the segment deterministically by weighted choice. Uses the same
 * hmacByteStream / bytesToFloat helpers as the rest of the casino so the
 * algorithm matches what /verify can reproduce client-side.
 */
export function deriveSegment(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  segments: WheelSegment[],
): WheelOutcome {
  const totalWeight = segments.reduce((s, x) => s + x.weight, 0);
  if (totalWeight <= 0) throw new Error('Segment weights sum to zero');

  const bytes = pfService.hmacByteStream(serverSeed, clientSeed, nonce, 0);
  const float = pfService.bytesToFloat(bytes);
  let acc = 0;
  let chosen = segments[segments.length - 1];
  const target = float * totalWeight;
  for (const seg of segments) {
    acc += seg.weight;
    if (target < acc) {
      chosen = seg;
      break;
    }
  }
  const hmac = bytes.toString('hex');
  return {
    segmentIndex: chosen.index,
    segment: chosen,
    prizeWei: BigInt(chosen.prize_wei),
    freeSpins: chosen.free_spins,
    hmac,
  };
}

export function verifyCommitment(serverSeed: string, claimedHash: string): boolean {
  return pfService.createServerSeedHash(serverSeed) === claimedHash;
}
