import { createPublicClient, http } from 'viem';
import { pulsechain } from 'viem/chains';

let publicClient: ReturnType<typeof createPublicClient> | null = null;

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
