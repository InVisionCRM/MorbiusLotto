import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { pulsechain } from 'viem/chains';
import { merkleClaimMorbiusAbi } from '../abi/merkle-claim-morbius';
import { erc20Abi } from '../abi/erc20';
import { logger } from './logger';
import { getPublicClient } from './chain-client';

const MERKLE_CLAIM_ADDRESS = '0x3807f417617E53d4c5C7D7A825a5ce4D105A75d2' as const;
const MORBIUS_TOKEN_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1' as const;
const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

const KEEPER_KEY = (
  process.env.MERKLE_KEEPER_PRIVATE_KEY || process.env.SETTLEMENT_PRIVATE_KEY
) as `0x${string}` | undefined;

let walletClient: ReturnType<typeof createWalletClient> | null = null;

function getWalletClient() {
  if (!KEEPER_KEY) {
    throw new Error('MERKLE_KEEPER_PRIVATE_KEY or SETTLEMENT_PRIVATE_KEY not set');
  }
  if (!walletClient) {
    const account = privateKeyToAccount(KEEPER_KEY);
    walletClient = createWalletClient({
      account,
      chain: pulsechain,
      transport: http(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
    });
  }
  return walletClient;
}

/** Returns true if a keeper private key is configured. */
export function isMerkleKeeperConfigured(): boolean {
  return Boolean(KEEPER_KEY);
}

/** Returns the keeper wallet address, or null if not configured. */
export function getMerkleKeeperAddress(): string | null {
  if (!KEEPER_KEY) return null;
  try {
    const account = privateKeyToAccount(KEEPER_KEY);
    return account.address;
  } catch {
    return null;
  }
}

/**
 * Read the MORBIUS token balance held by the MerkleClaim contract on-chain.
 */
export async function getContractMorbiusBalance(): Promise<bigint> {
  const publicClient = getPublicClient();
  const balance = (await publicClient.readContract({
    address: MORBIUS_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [MERKLE_CLAIM_ADDRESS],
  })) as bigint;
  return balance;
}

/**
 * Check on-chain whether a wallet has claimed for a given epoch.
 */
export async function checkHasClaimed(epochNumber: number, walletAddress: string): Promise<boolean> {
  const publicClient = getPublicClient();
  const result = (await publicClient.readContract({
    address: MERKLE_CLAIM_ADDRESS,
    abi: merkleClaimMorbiusAbi,
    functionName: 'hasClaimed',
    args: [BigInt(epochNumber), walletAddress as `0x${string}`],
  })) as boolean;
  return result;
}

type TxResult = { success: boolean; txHash?: string; error?: string };

/**
 * Ensure the keeper wallet has approved the MerkleClaim contract to spend MORBIUS.
 * Does a max approval if current allowance is below the required amount.
 */
export async function ensureMorbiusAllowance(requiredAmount: bigint): Promise<TxResult> {
  const maxRetries = 2;
  try {
    const client = getWalletClient();
    const publicClient = getPublicClient();
    const account = client.account!;

    const currentAllowance = (await publicClient.readContract({
      address: MORBIUS_TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [account.address, MERKLE_CLAIM_ADDRESS],
    })) as bigint;

    if (currentAllowance >= requiredAmount) {
      logger.info('[MerkleClaim] Allowance sufficient', {
        current: currentAllowance.toString(),
        required: requiredAmount.toString(),
      });
      return { success: true };
    }

    logger.info('[MerkleClaim] Approving MORBIUS for MerkleClaim contract (max uint256)');

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const hash = await client.writeContract({
          account,
          chain: pulsechain,
          address: MORBIUS_TOKEN_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [MERKLE_CLAIM_ADDRESS, MAX_UINT256],
        });
        logger.info('[MerkleClaim] Approve tx sent', { txHash: hash });
        await publicClient.waitForTransactionReceipt({ hash });
        return { success: true, txHash: hash };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('[MerkleClaim] Approve failed', { attempt, error: msg });
        if (attempt === maxRetries) return { success: false, error: msg };
      }
    }
    return { success: false, error: 'Max retries exceeded' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Deposit MORBIUS rewards into the MerkleClaim contract.
 */
export async function depositMorbiusRewards(amount: bigint): Promise<TxResult> {
  if (amount === 0n) {
    logger.info('[MerkleClaim] Skipping deposit — amount is zero (all rolled up)');
    return { success: true };
  }

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = getWalletClient();
      const publicClient = getPublicClient();
      const hash = await client.writeContract({
        account: client.account!,
        chain: pulsechain,
        address: MERKLE_CLAIM_ADDRESS,
        abi: merkleClaimMorbiusAbi,
        functionName: 'depositRewards',
        args: [amount],
      });
      logger.info('[MerkleClaim] depositRewards tx sent', {
        amount: amount.toString(),
        txHash: hash,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return { success: true, txHash: hash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[MerkleClaim] depositRewards failed', { attempt, error: msg });
      if (attempt === maxRetries) return { success: false, error: msg };
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Set the Merkle root for an epoch on-chain.
 */
export async function setEpochRootOnChain(
  epochNumber: number,
  merkleRoot: `0x${string}`,
  totalAmount: bigint,
): Promise<TxResult> {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = getWalletClient();
      const publicClient = getPublicClient();
      const hash = await client.writeContract({
        account: client.account!,
        chain: pulsechain,
        address: MERKLE_CLAIM_ADDRESS,
        abi: merkleClaimMorbiusAbi,
        functionName: 'setEpochRoot',
        args: [BigInt(epochNumber), merkleRoot, totalAmount],
      });
      logger.info('[MerkleClaim] setEpochRoot tx sent', {
        epochNumber,
        merkleRoot,
        totalAmount: totalAmount.toString(),
        txHash: hash,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return { success: true, txHash: hash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[MerkleClaim] setEpochRoot failed', { attempt, error: msg });
      if (attempt === maxRetries) return { success: false, error: msg };
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}
