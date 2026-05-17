import { getPublicClient } from './chain-client';
import { tournamentPrizeEscrowV6Abi } from '../abi/tournament-prize-escrow-v6';
import { tournamentPrizeEscrowV3Abi } from '../abi/tournament-prize-escrow-v3';
import { tournamentIdToBytes32 } from './tournament-id-bytes32';
import { getTournamentPrizeEscrowAddress } from './tournament-escrow-address';

/** Active bytes32 escrow (V5 / V4-compatible ABI). */
function escrowBytes32Address(): `0x${string}` {
  return getTournamentPrizeEscrowAddress();
}
const ESCROW_V3_ADDRESS = '0xa114a8974D4478b09FE9d2E2bf1BdCF28dE5bd25' as const;

export interface EscrowPoolStatus {
  token: `0x${string}`;
  totalDeposited: bigint;
  amountPaidOut: bigint;
  depositor?: `0x${string}`;
  depositedAt?: bigint;
  cancelled?: boolean;
  /**
   * Synthesized — the deployed contract does NOT expose an `active` field.
   * Treated as `true` while there is undistributed balance and the pool is not cancelled.
   */
  active?: boolean;
}

/**
 * Read tournament prize pool status from the deployed escrow contract.
 *
 * The deployed `TOURNAMENT_PRIZE_ESCROW_ADDRESS` returns 6 fields from `getPool`
 * (no `active` flag). The legacy V1 fallback that was here previously misread the
 * 6-field response as 3 V1 fields, silently shifting `depositor` into `totalDeposited`
 * and the real `totalDeposited` into `amountPaidOut`. That is what produced bogus
 * "Escrow has already paid out" rejections on freshly-funded pools. No fallback now —
 * if decode fails it really is broken (RPC, wrong address, etc.) and we return null.
 */
export async function getEscrowPoolStatus(tournamentId: string): Promise<EscrowPoolStatus | null> {
  try {
    const client = getPublicClient();
    const idBytes32 = tournamentIdToBytes32(tournamentId);
    const result = await client.readContract({
      address: escrowBytes32Address(),
      abi: tournamentPrizeEscrowV6Abi,
      functionName: 'getPool',
      args: [idBytes32],
    });
    // Cast via `unknown` because some toolchains may still resolve the V2 ABI to a
    // 7-element tuple type (cached `node_modules`, parallel ABI files). The runtime
    // contract returns 6 fields regardless — see the comment on the ABI's `getPool` block.
    const [token, depositor, totalDeposited, amountPaidOut, depositedAt, cancelled] =
      result as unknown as [
        `0x${string}`,
        `0x${string}`,
        bigint,
        bigint,
        bigint,
        boolean,
      ];
    return {
      token,
      depositor,
      totalDeposited,
      amountPaidOut,
      depositedAt,
      cancelled,
      active: !cancelled && totalDeposited > amountPaidOut,
    };
  } catch {
    return null;
  }
}

/**
 * Read tournament prize pool status from Escrow V3 (uint256 tournament IDs).
 */
export async function getEscrowV3PoolStatus(onChainTournamentId: number | bigint): Promise<EscrowPoolStatus | null> {
  // Address is hardcoded, always available
  try {
    const client = getPublicClient();
    const result = await client.readContract({
      address: ESCROW_V3_ADDRESS,
      abi: tournamentPrizeEscrowV3Abi,
      functionName: 'getPool',
      args: [BigInt(onChainTournamentId)],
    });
    const [token, depositor, totalDeposited, amountPaidOut, depositedAt, cancelled] = result as [
      `0x${string}`,
      `0x${string}`,
      bigint,
      bigint,
      bigint,
      boolean
    ];
    return {
      token,
      totalDeposited,
      amountPaidOut,
      depositor,
      depositedAt,
      cancelled,
    };
  } catch {
    return null;
  }
}
