import { createPublicClient, createWalletClient } from 'viem';
/**
 * Shared viem public client for PulseChain (used by chain-analytics and optionally websocket).
 */
export declare function getPublicClient(): ReturnType<typeof createPublicClient>;
/**
 * Shared helper for creating a PulseChain wallet client from a private key.
 * Returns null for missing/invalid key format.
 */
export declare function createPulsechainWalletClient(privateKey?: `0x${string}`): ReturnType<typeof createWalletClient> | null;
/**
 * Shared helper for checking whether a withdrawal nonce has already been consumed on-chain.
 */
export declare function readUsedWithdrawalNonce(contractAddress: `0x${string}`, nonce: bigint, client?: ReturnType<typeof createPublicClient>): Promise<boolean>;
//# sourceMappingURL=chain-client.d.ts.map