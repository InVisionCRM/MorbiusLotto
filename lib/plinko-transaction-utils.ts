import { decodeEventLog, formatEther, parseAbiItem } from 'viem';
import { RiskLevel } from '@/app/PLINKO/types';
import { type PlinkoAnimationItem } from '@/hooks/use-plinko-animation-queue';
import { PLINKO_ABI } from '@/abi/plinko';

interface BallDroppedDecodedArgs {
  bucket: bigint;
  multiplier: bigint;
  payout: bigint;
  riskLevel: bigint;
  seed: bigint;
}

interface LegacyBallDroppedDecodedArgs {
  bucket: bigint;
  multiplier: bigint;
  payout: bigint;
  riskLevel: bigint;
}

interface DecodableLog {
  data: `0x${string}`;
  topics: readonly `0x${string}`[];
}

const UI_RISK_MAP: RiskLevel[] = ['GREEN', 'YELLOW', 'RED'];
const BALL_DROPPED_V11 = parseAbiItem(
  'event BallDropped(address indexed player, uint256 seed, uint8 bucket, uint256 multiplier, uint256 payout, uint8 riskLevel)'
);
const BALL_DROPPED_LEGACY = parseAbiItem(
  'event BallDropped(address indexed player, uint8 bucket, uint256 multiplier, uint256 payout, uint8 riskLevel)'
);

function toBigInt(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)) return BigInt(value);
  if (typeof value === 'string') {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function getPlinkoTransactionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Failed to buy and drop balls';
}

export function decodePlinkoBallDroppedLog(log: DecodableLog): PlinkoAnimationItem | null {
  if (log.topics.length === 0) return null;
  const topics = [...log.topics] as [`0x${string}`, ...`0x${string}`[]];

  // First attempt: decode against the full contract ABI with non-strict decoding.
  // This is resilient to minor ABI/event-shape drift while still requiring BallDropped.
  try {
    const decoded = decodeEventLog({
      abi: PLINKO_ABI,
      data: log.data,
      topics,
      strict: false,
    }) as { eventName?: string; args?: Record<string, unknown> };

    if (decoded.eventName === 'BallDropped' && decoded.args) {
      const bucket = toBigInt(decoded.args.bucket);
      const multiplier = toBigInt(decoded.args.multiplier);
      const payout = toBigInt(decoded.args.payout);
      const riskLevel = toBigInt(decoded.args.riskLevel);
      const seed = toBigInt(decoded.args.seed ?? 0n);
      if (
        bucket !== null &&
        multiplier !== null &&
        payout !== null &&
        riskLevel !== null &&
        seed !== null
      ) {
        const risk = UI_RISK_MAP[Number(riskLevel)] || 'YELLOW';
        return {
          bucket: Number(bucket),
          risk,
          multiplier: Number(multiplier) / 100,
          payout: Number(formatEther(payout)),
          seed: seed.toString(),
        };
      }
    }
  } catch {
    // Fall through to fixed-signature decode paths.
  }

  // Current Plinko event format (includes seed).
  try {
    const decoded = decodeEventLog({
      abi: [BALL_DROPPED_V11],
      data: log.data,
      topics,
    }) as { eventName?: string; args?: unknown };

    if (decoded.eventName === 'BallDropped' && decoded.args) {
      const args = decoded.args as Partial<BallDroppedDecodedArgs>;
      if (
        typeof args.bucket === 'bigint' &&
        typeof args.multiplier === 'bigint' &&
        typeof args.payout === 'bigint' &&
        typeof args.riskLevel === 'bigint' &&
        typeof args.seed === 'bigint'
      ) {
        const risk = UI_RISK_MAP[Number(args.riskLevel)] || 'YELLOW';
        return {
          bucket: Number(args.bucket),
          risk,
          multiplier: Number(args.multiplier) / 100,
          payout: Number(formatEther(args.payout)),
          seed: args.seed.toString(),
        };
      }
    }
  } catch {
    // Fall through to legacy decode path.
  }

  // Legacy Plinko event format (no seed).
  try {
    const decoded = decodeEventLog({
      abi: [BALL_DROPPED_LEGACY],
      data: log.data,
      topics,
    }) as { eventName?: string; args?: unknown };

    if (decoded.eventName !== 'BallDropped' || !decoded.args) return null;
    const args = decoded.args as Partial<LegacyBallDroppedDecodedArgs>;
    if (
      typeof args.bucket !== 'bigint' ||
      typeof args.multiplier !== 'bigint' ||
      typeof args.payout !== 'bigint' ||
      typeof args.riskLevel !== 'bigint'
    ) {
      return null;
    }

    const risk = UI_RISK_MAP[Number(args.riskLevel)] || 'YELLOW';
    return {
      bucket: Number(args.bucket),
      risk,
      multiplier: Number(args.multiplier) / 100,
      payout: Number(formatEther(args.payout)),
      seed: '0',
    };
  } catch {
    return null;
  }
}
