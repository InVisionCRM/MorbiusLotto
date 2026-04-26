import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { pulsechain } from 'viem/chains';
import { tournamentPrizeEscrowAbi } from '../abi/tournament-prize-escrow';
import { tournamentPrizeEscrowV2Abi } from '../abi/tournament-prize-escrow-v2';
import { tournamentPrizeEscrowV3Abi } from '../abi/tournament-prize-escrow-v3';
import { getEscrowPoolStatus, getEscrowV3PoolStatus } from './escrow-status';
import { tournamentIdToBytes32 } from './tournament-id-bytes32';
import { logger } from './logger';

/** Tournament Prize Escrow V2 (bytes32 tournament IDs) - hardcoded for reliability */
const ESCROW_V2_ADDRESS = '0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1' as const;
/** V3 (uint256 IDs) - kept for cancel/reclaim of legacy V3-funded tournaments */
const ESCROW_V3_ADDRESS = '0xa114a8974D4478b09FE9d2E2bf1BdCF28dE5bd25' as const;
const AUTHORIZED_KEY = (process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY || process.env.SETTLEMENT_PRIVATE_KEY) as `0x${string}` | undefined;

let walletClient: ReturnType<typeof createWalletClient> | null = null;

function getWalletClient() {
  if (!AUTHORIZED_KEY) {
    throw new Error('TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY or SETTLEMENT_PRIVATE_KEY not set');
  }
  if (!walletClient) {
    const account = privateKeyToAccount(AUTHORIZED_KEY);
    walletClient = createWalletClient({
      account,
      chain: pulsechain,
      transport: http(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
    });
  }
  return walletClient;
}

/**
 * Send a single prize payout from the Tournament Prize Escrow to a winner.
 * Caller must ensure total payouts do not exceed the pool.
 */
export async function sendEscrowPayout(
  tournamentId: string,
  winnerAddress: string,
  amount: bigint
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (amount <= 0n) {
    return { success: true };
  }

  const idBytes32 = tournamentIdToBytes32(tournamentId);
  const winner = winnerAddress as `0x${string}`;

  // Log entry so we can see in production whether sendEscrowPayout is even being reached.
  // If we never see this line, the bug is upstream (Phase 2 not running). If we see this
  // but no "Escrow payout sent", the wallet/RPC/auth is wrong and we'll see the error below.
  logger.info('sendEscrowPayout: invoking', {
    tournamentId,
    bytes32Id: idBytes32,
    escrow: ESCROW_V2_ADDRESS,
    winner,
    amount: amount.toString(),
    callerWallet: AUTHORIZED_KEY ? privateKeyToAccount(AUTHORIZED_KEY).address : '<MISSING_KEY>',
  });

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = getWalletClient();
      const hash = await client.writeContract({
        account: client.account!,
        chain: pulsechain,
        address: ESCROW_V2_ADDRESS,
        abi: tournamentPrizeEscrowV2Abi,
        functionName: 'payout',
        args: [idBytes32, winner, amount],
      });
      logger.info('Escrow payout sent', { tournamentId, winner: winnerAddress, amount: amount.toString(), txHash: hash });
      return { success: true, txHash: hash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      logger.error('Escrow payout attempt failed', { attempt, tournamentId, winner: winnerAddress, error: msg, stack });
      if (attempt === maxRetries) {
        return { success: false, error: msg };
      }
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

const RECLAIM_WALLET = (process.env.ESCROW_REMAINDER_WALLET || process.env.PLATFORM_FEE_WALLET) as `0x${string}` | undefined;

/**
 * Send any remaining (unclaimed) escrow balance for a tournament to the configured reclaim wallet.
 * Call after distributePrizes so escrow never holds leftover funds.
 * Uses same authorized server key as payouts. Set ESCROW_REMAINDER_WALLET or PLATFORM_FEE_WALLET.
 */
export async function sendEscrowRemainderToReclaimWallet(tournamentId: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!RECLAIM_WALLET || !RECLAIM_WALLET.startsWith('0x')) {
    logger.warn('ESCROW_REMAINDER_WALLET / PLATFORM_FEE_WALLET not set; skipping escrow remainder reclaim');
    return { success: false, error: 'Reclaim wallet not configured' };
  }

  const status = await getEscrowPoolStatus(tournamentId);
  if (!status) return { success: false, error: 'Could not read pool status' };
  const remaining = status.totalDeposited - status.amountPaidOut;
  if (remaining <= 0n) return { success: true };

  const idBytes32 = tournamentIdToBytes32(tournamentId);
  const maxRetries = 5;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = getWalletClient();
      const hash = await client.writeContract({
        account: client.account!,
        chain: pulsechain,
        address: ESCROW_V2_ADDRESS,
        abi: tournamentPrizeEscrowV2Abi,
        functionName: 'payoutRemainderTo',
        args: [idBytes32, RECLAIM_WALLET],
      });
      logger.info('Escrow remainder reclaimed', { tournamentId, to: RECLAIM_WALLET, amount: remaining.toString(), txHash: hash });
      return { success: true, txHash: hash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Escrow remainder reclaim failed', { attempt, tournamentId, error: msg });
      if (attempt === maxRetries) return { success: false, error: msg };
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Send a single prize payout from Escrow V3 (uint256 tournament IDs).
 */
export async function sendEscrowV3Payout(
  onChainTournamentId: number | bigint,
  winnerAddress: string,
  amount: bigint
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  // Address is hardcoded, always available
  if (amount <= 0n) return { success: true };

  const id = BigInt(onChainTournamentId);
  const winner = winnerAddress as `0x${string}`;
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = getWalletClient();
      const hash = await client.writeContract({
        account: client.account!,
        chain: pulsechain,
        address: ESCROW_V3_ADDRESS,
        abi: tournamentPrizeEscrowV3Abi,
        functionName: 'payout',
        args: [id, winner, amount],
      });
      logger.info('Escrow V3 payout sent', { onChainTournamentId: id.toString(), winner: winnerAddress, amount: amount.toString(), txHash: hash });
      return { success: true, txHash: hash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Escrow V3 payout failed', { attempt, onChainTournamentId: id.toString(), error: msg });
      if (attempt === maxRetries) return { success: false, error: msg };
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Send remaining Escrow V3 balance to reclaim wallet.
 */
export async function sendEscrowV3RemainderTo(
  onChainTournamentId: number | bigint,
  to: `0x${string}`
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  // Address is hardcoded, always available
  const status = await getEscrowV3PoolStatus(onChainTournamentId);
  if (!status) return { success: false, error: 'Could not read pool status' };
  const remaining = status.totalDeposited - status.amountPaidOut;
  if (remaining <= 0n) return { success: true };

  const id = BigInt(onChainTournamentId);
  const maxRetries = 5;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = getWalletClient();
      const hash = await client.writeContract({
        account: client.account!,
        chain: pulsechain,
        address: ESCROW_V3_ADDRESS,
        abi: tournamentPrizeEscrowV3Abi,
        functionName: 'payoutRemainderTo',
        args: [id, to],
      });
      logger.info('Escrow V3 remainder reclaimed', { onChainTournamentId: id.toString(), to, amount: remaining.toString(), txHash: hash });
      return { success: true, txHash: hash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Escrow V3 remainder reclaim failed', { attempt, onChainTournamentId: id.toString(), error: msg });
      if (attempt === maxRetries) return { success: false, error: msg };
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Cancel a tournament in the escrow contract (V1/V2). Only callable by authorized server.
 * Marks the tournament as cancelled so creator can reclaim funds.
 */
export async function cancelTournamentInEscrow(tournamentId: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const idBytes32 = tournamentIdToBytes32(tournamentId);
  const maxRetries = 5;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = getWalletClient();
      // Use V2 ABI (has cancelTournament function)
      const hash = await client.writeContract({
        account: client.account!,
        chain: pulsechain,
        address: ESCROW_V2_ADDRESS,
        abi: tournamentPrizeEscrowV2Abi,
        functionName: 'cancelTournament',
        args: [idBytes32],
      });
      logger.info('Tournament cancelled in escrow', { tournamentId, txHash: hash });
      return { success: true, txHash: hash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Escrow cancel tournament attempt failed', { attempt, tournamentId, error: msg });
      if (attempt === maxRetries) {
        return { success: false, error: msg };
      }
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Cancel a tournament in Escrow V3 (uint256 tournament IDs).
 */
export async function cancelEscrowV3Tournament(
  onChainTournamentId: number | bigint
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  // Address is hardcoded, always available
  const id = BigInt(onChainTournamentId);
  const maxRetries = 5;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = getWalletClient();
      const hash = await client.writeContract({
        account: client.account!,
        chain: pulsechain,
        address: ESCROW_V3_ADDRESS,
        abi: tournamentPrizeEscrowV3Abi,
        functionName: 'cancelTournament',
        args: [id],
      });
      logger.info('Escrow V3 tournament cancelled', { onChainTournamentId: id.toString(), txHash: hash });
      return { success: true, txHash: hash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Escrow V3 cancel tournament attempt failed', { attempt, onChainTournamentId: id.toString(), error: msg });
      if (attempt === maxRetries) {
        return { success: false, error: msg };
      }
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Creator reclaims funds from a cancelled tournament.
 * Note: This function provides instructions. The creator must call creatorReclaim() 
 * directly on the escrow contract using their wallet, as it requires their signature.
 */
export async function creatorReclaimFromEscrow(tournamentId: string, creatorAddress: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
  // The creator needs to call the contract function directly from their wallet.
  // This is a security feature - only the creator (depositor) can reclaim.
  // We return instructions here, but the actual call must be made client-side.
  
  return {
    success: false,
    error: 'Creator must call creatorReclaim() directly on the escrow contract using their wallet. Use the tournament ID bytes32 hash.',
  };
}
