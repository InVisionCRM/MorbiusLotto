import { decodeEventLog, formatEther, parseAbiItem } from 'viem';
import { RiskLevel } from '@/app/PLINKO/types';
import { type PlinkoAnimationItem } from '@/hooks/use-plinko-animation-queue';

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

export function getPlinkoTransactionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Failed to buy and drop balls';
}

export function decodePlinkoBallDroppedLog(log: DecodableLog): PlinkoAnimationItem | null {
  if (log.topics.length === 0) return null;
  const topics = [...log.topics] as [`0x${string}`, ...`0x${string}`[]];

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
