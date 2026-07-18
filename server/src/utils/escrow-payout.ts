import { createWalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { pulsechain } from 'viem/chains';
import { tournamentPrizeEscrowAbi } from '../abi/tournament-prize-escrow';
import { tournamentPrizeEscrowV6Abi } from '../abi/tournament-prize-escrow-v6';
import { tournamentPrizeEscrowV3Abi } from '../abi/tournament-prize-escrow-v3';
import { getEscrowPoolStatus, getEscrowV3PoolStatus } from './escrow-status';
import { tournamentIdToBytes32 } from './tournament-id-bytes32';
import { getTournamentPrizeEscrowAddress } from './tournament-escrow-address';
import { logger } from './logger';
import { pulsechainTransport } from './chain-client';

function escrowBytes32Address(): `0x${string}` {
  return getTournamentPrizeEscrowAddress();
}
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
      transport: pulsechainTransport(),
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
    escrow: escrowBytes32Address(),
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
        address: escrowBytes32Address(),
        abi: tournamentPrizeEscrowV6Abi,
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

/**
 * Batched escrow payout via V4's `payoutMultiple(bytes32, address[], uint256[] amounts)`.
 *
 * Single on-chain tx pays N recipients atomically. Replaces the legacy loop-of-`payout()`
 * pattern that silently failed on Railway's RPC (N sequential writes, drops mid-loop,
 * no rollback). Now: one nonce, one round-trip, all-or-nothing.
 *
 * The V4 contract takes raw wei amounts (V2's `payoutMultiple` took percentages, but
 * (a) V2's bytecode didn't actually have the function deployed, and (b) percentages
 * caused rounding loss). Server already has exact amounts from `calculate_tournament_prizes`
 * so wei is the natural unit.
 */
export async function sendEscrowPayoutMultiple(
  tournamentId: string,
  recipients: { address: string; amount: bigint }[],
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (recipients.length === 0) return { success: true };

  const idBytes32 = tournamentIdToBytes32(tournamentId);

  // Drop zero-amount entries; contract's `_push` already no-ops on them but it's
  // wasted calldata + log noise.
  const winners: `0x${string}`[] = [];
  const amounts: bigint[] = [];
  for (const r of recipients) {
    if (r.amount <= 0n) continue;
    winners.push(r.address as `0x${string}`);
    amounts.push(r.amount);
  }
  if (winners.length === 0) {
    return { success: true };
  }

  const totalAmount = amounts.reduce((sum, a) => sum + a, 0n);
  logger.info('sendEscrowPayoutMultiple: invoking', {
    tournamentId,
    bytes32Id: idBytes32,
    recipientCount: winners.length,
    totalAmount: totalAmount.toString(),
    callerWallet: AUTHORIZED_KEY ? privateKeyToAccount(AUTHORIZED_KEY).address : '<MISSING_KEY>',
  });

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = getWalletClient();
      const hash = await client.writeContract({
        account: client.account!,
        chain: pulsechain,
        address: escrowBytes32Address(),
        abi: tournamentPrizeEscrowV6Abi,
        functionName: 'payoutMultiple',
        args: [idBytes32, winners, amounts],
      });
      logger.info('Escrow payoutMultiple sent', { tournamentId, recipientCount: winners.length, txHash: hash });
      return { success: true, txHash: hash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      logger.error('Escrow payoutMultiple attempt failed', { attempt, tournamentId, error: msg, stack });
      if (attempt === maxRetries) return { success: false, error: msg };
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Backup path: when `payoutMultiple` fails, record per-winner claimable amounts on-chain
 * so winners can pull from their own wallets via `claim()`. Idempotent overwrite.
 *
 * Called after a push failure as a safety net — even if every push attempt drops, the
 * pool still has the funds and the claimable mapping tells winners exactly what they're owed.
 */
export async function setEscrowUnclaimedShares(
  tournamentId: string,
  recipients: { address: string; amount: bigint }[],
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (recipients.length === 0) return { success: true };
  const idBytes32 = tournamentIdToBytes32(tournamentId);
  const winners: `0x${string}`[] = [];
  const amounts: bigint[] = [];
  for (const r of recipients) {
    if (r.amount <= 0n) continue;
    winners.push(r.address as `0x${string}`);
    amounts.push(r.amount);
  }
  if (winners.length === 0) return { success: true };

  logger.info('setEscrowUnclaimedShares: invoking', {
    tournamentId,
    bytes32Id: idBytes32,
    recipientCount: winners.length,
  });

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = getWalletClient();
      const hash = await client.writeContract({
        account: client.account!,
        chain: pulsechain,
        address: escrowBytes32Address(),
        abi: tournamentPrizeEscrowV6Abi,
        functionName: 'setUnclaimedShares',
        args: [idBytes32, winners, amounts],
      });
      logger.info('setUnclaimedShares sent', { tournamentId, recipientCount: winners.length, txHash: hash });
      return { success: true, txHash: hash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('setUnclaimedShares attempt failed', { attempt, tournamentId, error: msg });
      if (attempt === maxRetries) return { success: false, error: msg };
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
        address: escrowBytes32Address(),
        abi: tournamentPrizeEscrowV6Abi,
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
        address: escrowBytes32Address(),
        abi: tournamentPrizeEscrowV6Abi,
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
