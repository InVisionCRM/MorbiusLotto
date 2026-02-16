import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { pulsechain } from 'viem/chains';
import { morbiusTournamentAbi } from '../abi/morbius-tournament';
import { logger } from './logger';

const MORBIUS_TOURNAMENT_ADDRESS = process.env.MORBIUS_TOURNAMENT_ADDRESS as `0x${string}` | undefined;
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
  if (!MORBIUS_TOURNAMENT_ADDRESS || !MORBIUS_TOURNAMENT_ADDRESS.startsWith('0x')) {
    return { success: false, error: 'MORBIUS_TOURNAMENT_ADDRESS not configured' };
  }

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
  if (!MORBIUS_TOURNAMENT_ADDRESS || !MORBIUS_TOURNAMENT_ADDRESS.startsWith('0x')) {
    return { success: false, error: 'MORBIUS_TOURNAMENT_ADDRESS not configured' };
  }

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
  if (!MORBIUS_TOURNAMENT_ADDRESS || !MORBIUS_TOURNAMENT_ADDRESS.startsWith('0x')) {
    return false;
  }
  try {
    const publicClient = createPublicClient({
      chain: pulsechain,
      transport: http(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
    });
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
 * Pay out prize from MorbiusTournament contract (platform MORBIUS tournaments).
 */
export async function sendMorbiusTournamentPayout(
  onChainTournamentId: number | bigint,
  winnerAddress: string,
  amount: bigint
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!MORBIUS_TOURNAMENT_ADDRESS || !MORBIUS_TOURNAMENT_ADDRESS.startsWith('0x')) {
    return { success: false, error: 'MORBIUS_TOURNAMENT_ADDRESS not configured' };
  }
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
