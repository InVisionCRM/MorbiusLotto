import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { pulsechain } from 'viem/chains';

let publicClient: ReturnType<typeof createPublicClient> | null = null;

const USED_NONCES_ABI = [
  {
    inputs: [{ name: '', type: 'uint256' }],
    name: 'usedNonces',
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Shared viem public client for PulseChain (used by chain-analytics and optionally websocket).
 */
export function getPublicClient(): ReturnType<typeof createPublicClient> {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: pulsechain,
      transport: http(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
    });
  }
  return publicClient;
}

/**
 * Shared helper for creating a PulseChain wallet client from a private key.
 * Returns null for missing/invalid key format.
 */
export function createPulsechainWalletClient(
  privateKey?: `0x${string}`,
): ReturnType<typeof createWalletClient> | null {
  if (!privateKey || !privateKey.startsWith('0x')) return null;
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: pulsechain,
    transport: http(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
  });
}

/**
 * Shared helper for checking whether a withdrawal nonce has already been consumed on-chain.
 */
export async function readUsedWithdrawalNonce(
  contractAddress: `0x${string}`,
  nonce: bigint,
  client: ReturnType<typeof createPublicClient> = getPublicClient(),
): Promise<boolean> {
  return client.readContract({
    address: contractAddress,
    abi: USED_NONCES_ABI,
    functionName: 'usedNonces',
    args: [nonce],
  }) as Promise<boolean>;
}
