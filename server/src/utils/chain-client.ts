import { createPublicClient, createWalletClient, fallback, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { pulsechain } from 'viem/chains';

let publicClient: ReturnType<typeof createPublicClient> | null = null;

// Default RPC endpoints, in priority order: g4mm4 primary, publicnode fallback.
// The official rpc.pulsechain.com is intentionally NOT in the default list — it
// rate-limits/degrades under load, which was stalling deposits & withdrawals.
const DEFAULT_PULSECHAIN_RPCS = [
  'https://rpc-pulsechain.g4mm4.io', // primary
  'https://pulsechain-rpc.publicnode.com', // fallback
] as const;

/**
 * Build a resilient PulseChain transport: a `fallback` over multiple RPC URLs so
 * one endpoint degrading (e.g. the official RPC's rate limits) no longer takes
 * deposits/withdrawals down with it. viem retries the current endpoint a couple
 * of times, then `fallback` moves to the next URL in order.
 *
 * `PULSECHAIN_RPC_URL`, when set, is prepended as the highest-priority endpoint
 * (point it at a dedicated/paid RPC for production). NOTE: if it is currently set
 * to https://rpc.pulsechain.com in the environment, that flaky endpoint becomes
 * primary again — unset it (or point it at a dedicated provider) to rely on the
 * g4mm4 → publicnode defaults below.
 */
export function pulsechainTransport() {
  const override = (process.env.PULSECHAIN_RPC_URL || '').trim();
  const urls = [...(override ? [override] : []), ...DEFAULT_PULSECHAIN_RPCS]
    // de-dupe while preserving order (an override equal to a default shouldn't retry twice)
    .filter((url, i, all) => all.indexOf(url) === i);
  return fallback(
    urls.map((url) => http(url, { timeout: 12_000, retryCount: 2, retryDelay: 300 })),
    { retryCount: 0 },
  );
}

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
      transport: pulsechainTransport(),
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
    transport: pulsechainTransport(),
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
