import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { pulsechain } from 'viem/chains';
import { morbiusTournamentAbi } from '../abi/morbius-tournament';
import { logger } from './logger';
import { getPublicClient } from './chain-client';

const MORBIUS_TOURNAMENT_ADDRESS = '0x1F30Aa16B4Da0124308E33b8650C351BBCA70704' as const;
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
 * Call setCompleted(tournamentId) on MorbiusTournament contract.
 * Run after distributePrizes when tournament has on_chain_tournament_id.
 */
export async function setMorbiusTournamentCompleted(
  onChainTournamentId: number | bigint
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  // Address is hardcoded, always available

  const id = BigInt(onChainTournamentId);
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = getWalletClient();
      const hash = await client.writeContract({
        account: client.account!,
        chain: pulsechain,
        address: MORBIUS_TOURNAMENT_ADDRESS,
        abi: morbiusTournamentAbi,
        functionName: 'setCompleted',
        args: [id],
      });
      logger.info('MorbiusTournament setCompleted', { onChainTournamentId: id.toString(), txHash: hash });
      return { success: true, txHash: hash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('MorbiusTournament setCompleted failed', { attempt, onChainTournamentId: id.toString(), error: msg });
      if (attempt === maxRetries) {
        return { success: false, error: msg };
      }
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Call setActive(tournamentId) on MorbiusTournament contract.
 * Run when first player joins a tournament with on_chain_tournament_id.
 */
export async function setMorbiusTournamentActive(
  onChainTournamentId: number | bigint
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  // Address is hardcoded, always available

  const id = BigInt(onChainTournamentId);
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = getWalletClient();
      const hash = await client.writeContract({
        account: client.account!,
        chain: pulsechain,
        address: MORBIUS_TOURNAMENT_ADDRESS,
        abi: morbiusTournamentAbi,
        functionName: 'setActive',
        args: [id],
      });
      logger.info('MorbiusTournament setActive', { onChainTournamentId: id.toString(), txHash: hash });
      return { success: true, txHash: hash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('MorbiusTournament setActive failed', { attempt, onChainTournamentId: id.toString(), error: msg });
      if (attempt === maxRetries) {
        return { success: false, error: msg };
      }
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Check if hasJoined[tournamentId][player] on MorbiusTournament contract.
 */
export async function hasJoinedMorbiusTournament(
  onChainTournamentId: number | bigint,
  playerAddress: string
): Promise<boolean> {
  // Address is hardcoded, always available
  try {
    const publicClient = getPublicClient();
    const result = await publicClient.readContract({
      address: MORBIUS_TOURNAMENT_ADDRESS,
      abi: morbiusTournamentAbi,
      functionName: 'hasJoined',
      args: [BigInt(onChainTournamentId), playerAddress as `0x${string}`],
    });
    return Boolean(result);
  } catch {
    return false;
  }
}

/**
 * Join a tournament on-chain (for rebuy). Player must approve MORBIUS token first.
 * This is called server-side when processing a rebuy for an on-chain tournament.
 * NOTE: Frontend should handle approval + join, but this provides server-side verification.
 */
export async function joinMorbiusTournament(
  onChainTournamentId: number | bigint,
  playerAddress: string,
  buyInAmount: bigint
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  // Address is hardcoded, always available
  
  // Note: This function verifies the join happened, but doesn't actually call joinTournament
  // because that requires the player's wallet signature. The frontend must handle the actual join.
  // This is a verification-only function.
  const id = BigInt(onChainTournamentId);
  try {
    const publicClient = getPublicClient();
    const hasJoined = await publicClient.readContract({
      address: MORBIUS_TOURNAMENT_ADDRESS,
      abi: morbiusTournamentAbi,
      functionName: 'hasJoined',
      args: [id, playerAddress as `0x${string}`],
    });
    
    // For rebuy, player should already be joined, so this verifies they're still in
    // The actual rebuy join must happen via frontend wallet interaction
    return { success: Boolean(hasJoined) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to verify on-chain join status: ${msg}` };
  }
}

/**
 * Cancel a tournament on-chain. Only callable by authorized server or creator.
 */
export async function cancelMorbiusTournament(
  onChainTournamentId: number | bigint
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  // Address is hardcoded, always available
  const id = BigInt(onChainTournamentId);
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = getWalletClient();
      const hash = await client.writeContract({
        account: client.account!,
        chain: pulsechain,
        address: MORBIUS_TOURNAMENT_ADDRESS,
        abi: morbiusTournamentAbi,
        functionName: 'cancelTournament',
        args: [id],
      });
      logger.info('MorbiusTournament cancelled', { onChainTournamentId: id.toString(), txHash: hash });
      return { success: true, txHash: hash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('MorbiusTournament cancel failed', { attempt, onChainTournamentId: id.toString(), error: msg });
      if (attempt === maxRetries) {
        return { success: false, error: msg };
      }
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Refund a player from a cancelled on-chain tournament.
 * Note: Players can call refund() themselves, but this allows server to batch refunds.
 */
export async function refundMorbiusTournamentPlayer(
  onChainTournamentId: number | bigint,
  playerAddress: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  // Address is hardcoded, always available
  const id = BigInt(onChainTournamentId);
  const player = playerAddress as `0x${string}`;
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = getWalletClient();
      const hash = await client.writeContract({
        account: client.account!,
        chain: pulsechain,
        address: MORBIUS_TOURNAMENT_ADDRESS,
        abi: morbiusTournamentAbi,
        functionName: 'refund',
        args: [id, player],
      });
      logger.info('MorbiusTournament refund sent', { onChainTournamentId: id.toString(), player: playerAddress, txHash: hash });
      return { success: true, txHash: hash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('MorbiusTournament refund failed', { attempt, onChainTournamentId: id.toString(), player: playerAddress, error: msg });
      if (attempt === maxRetries) {
        return { success: false, error: msg };
      }
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Read prize pool from MorbiusTournament contract.
 */
export async function getMorbiusTournamentPrizePool(
  onChainTournamentId: number | bigint
): Promise<bigint> {
  try {
    const publicClient = getPublicClient();
    const result = await publicClient.readContract({
      address: MORBIUS_TOURNAMENT_ADDRESS,
      abi: morbiusTournamentAbi,
      functionName: 'getTournament',
      args: [BigInt(onChainTournamentId)],
    });
    // getTournament returns: (creator, buyInAmount, maxPlayers, prizeToken, prizeAmount, prizePool, entryCount, status, createdAt)
    const prizePool = (result as [unknown, unknown, unknown, unknown, unknown, bigint, unknown, unknown, unknown])[5];
    return prizePool ?? 0n;
  } catch (err) {
    logger.error('Failed to read MorbiusTournament prize pool', { onChainTournamentId, error: err });
    return 0n;
  }
}

/**
 * Pay out prize from MorbiusTournament contract (platform MORBIUS tournaments).
 */
export async function sendMorbiusTournamentPayout(
  onChainTournamentId: number | bigint,
  winnerAddress: string,
  amount: bigint
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  // Address is hardcoded, always available
  if (amount <= 0n) {
    return { success: true };
  }

  const id = BigInt(onChainTournamentId);
  const winner = winnerAddress as `0x${string}`;
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = getWalletClient();
      const hash = await client.writeContract({
        account: client.account!,
        chain: pulsechain,
        address: MORBIUS_TOURNAMENT_ADDRESS,
        abi: morbiusTournamentAbi,
        functionName: 'payout',
        args: [id, winner, amount],
      });
      logger.info('MorbiusTournament payout', { onChainTournamentId: id.toString(), winner: winnerAddress, amount: amount.toString(), txHash: hash });
      return { success: true, txHash: hash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('MorbiusTournament payout failed', { attempt, onChainTournamentId: id.toString(), error: msg });
      if (attempt === maxRetries) {
        return { success: false, error: msg };
      }
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}
