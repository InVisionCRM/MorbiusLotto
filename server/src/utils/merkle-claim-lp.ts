/**
 * merkle-claim-lp.ts
 *
 * On-chain utilities for the MerkleClaimLP contract.
 * Unlike MerkleClaimMorbius, MerkleClaimLP is funded by direct MORBIUS transfers —
 * no approval or depositRewards call required.
 *
 * Also contains helpers for reading LP pair reserves (to calculate MORBIUS-equivalent
 * per LP token) and fetching LP token holders from the PulseChain API.
 */

import { createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { pulsechain } from 'viem/chains';
import { merkleClaimLpAbi } from '../abi/merkle-claim-lp';
import { getPublicClient } from './chain-client';
import { logger } from './logger';

// Must match lib/contracts.ts MERKLE_CLAIM_LP_ADDRESS; override via server .env
const MERKLE_CLAIM_LP_ADDRESS = (
  process.env.MERKLE_CLAIM_LP_ADDRESS || process.env.NEXT_PUBLIC_MERKLE_CLAIM_LP_ADDRESS || '0x64Dd1c933027d757212E43725c99bD4402211A1A'
) as `0x${string}`;

const MORBIUS_TOKEN_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1' as `0x${string}`;

const KEEPER_KEY = (
  process.env.MERKLE_KEEPER_PRIVATE_KEY || process.env.SETTLEMENT_PRIVATE_KEY
) as `0x${string}` | undefined;

// revokeEpoch is onlyOwner — keeper (operator) cannot call it.
function getOwnerKey(): `0x${string}` | undefined {
  return process.env.MERKLE_OWNER_PRIVATE_KEY as `0x${string}` | undefined;
}

let walletClient: ReturnType<typeof createWalletClient> | null = null;
let ownerWalletClient: ReturnType<typeof createWalletClient> | null = null;

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

function getOwnerWalletClient() {
  const key = getOwnerKey();
  if (!key) {
    throw new Error('MERKLE_OWNER_PRIVATE_KEY not set — required for revokeEpoch (onlyOwner)');
  }
  if (!ownerWalletClient) {
    const account = privateKeyToAccount(key);
    ownerWalletClient = createWalletClient({
      account,
      chain: pulsechain,
      transport: http(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
    });
  }
  return ownerWalletClient;
}

export function isMerkleKeeperConfigured(): boolean {
  return Boolean(KEEPER_KEY);
}

/** Returns true if the owner private key is configured (required for revokeEpoch). */
export function isMerkleOwnerConfigured(): boolean {
  return Boolean(getOwnerKey());
}

/** Returns the configured owner-key wallet address, or null if not configured. */
export function getMerkleOwnerKeyAddress(): string | null {
  const k = getOwnerKey();
  if (!k) return null;
  try { return privateKeyToAccount(k).address; } catch { return null; }
}

/**
 * Read the MORBIUS balance held by the MerkleClaimLP contract.
 */
export async function getContractMorbiusBalance(): Promise<bigint> {
  const publicClient = getPublicClient();
  const balance = await publicClient.readContract({
    address: MORBIUS_TOKEN_ADDRESS,
    abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
    functionName: 'balanceOf',
    args: [MERKLE_CLAIM_LP_ADDRESS],
  });
  return balance as bigint;
}

/**
 * Check on-chain whether a wallet has claimed for a given LP epoch.
 */
export async function checkHasClaimed(epochNumber: number, walletAddress: string): Promise<boolean> {
  const publicClient = getPublicClient();
  const result = await publicClient.readContract({
    address: MERKLE_CLAIM_LP_ADDRESS,
    abi: merkleClaimLpAbi,
    functionName: 'hasClaimed',
    args: [BigInt(epochNumber), walletAddress as `0x${string}`],
  });
  return result as boolean;
}

type TxResult = { success: boolean; txHash?: string; error?: string };

/**
 * Read the on-chain claimed amount for an LP epoch.
 * If > 0, revokeEpoch() will revert with "already has claims".
 */
export async function getEpochClaimedAmount(epochNumber: number): Promise<bigint> {
  const publicClient = getPublicClient();
  const result = (await publicClient.readContract({
    address: MERKLE_CLAIM_LP_ADDRESS,
    abi: merkleClaimLpAbi,
    functionName: 'epochClaimedAmount',
    args: [BigInt(epochNumber)],
  })) as bigint;
  return result;
}

/**
 * Revoke an LP epoch root on-chain. Only succeeds when no on-chain claims
 * have been made against this epoch yet.
 *
 * NOTE: revokeEpoch is onlyOwner. Signed by MERKLE_OWNER_PRIVATE_KEY.
 */
export async function revokeEpochOnChain(epochNumber: number): Promise<TxResult> {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = getOwnerWalletClient();
      const publicClient = getPublicClient();
      const hash = await client.writeContract({
        account: client.account!,
        chain: pulsechain,
        address: MERKLE_CLAIM_LP_ADDRESS,
        abi: merkleClaimLpAbi,
        functionName: 'revokeEpoch',
        args: [BigInt(epochNumber)],
      });
      logger.info('[MerkleClaimLP] revokeEpoch tx sent', { epochNumber, txHash: hash });
      await publicClient.waitForTransactionReceipt({ hash });
      return { success: true, txHash: hash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[MerkleClaimLP] revokeEpoch failed', { epochNumber, attempt, error: msg });
      if (attempt === maxRetries) return { success: false, error: msg };
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Publish the Merkle root for an epoch on-chain.
 * Tokens must already be in the contract (sent directly via MORBIUS transfer).
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
        address: MERKLE_CLAIM_LP_ADDRESS,
        abi: merkleClaimLpAbi,
        functionName: 'setEpochRoot',
        args: [BigInt(epochNumber), merkleRoot, totalAmount],
      });
      logger.info('[MerkleClaimLP] setEpochRoot tx sent', {
        epochNumber,
        merkleRoot,
        totalAmount: totalAmount.toString(),
        txHash: hash,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return { success: true, txHash: hash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[MerkleClaimLP] setEpochRoot failed', { attempt, error: msg });
      if (attempt === maxRetries) return { success: false, error: msg };
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

// ─────────────────────────────────────────────────────────────────────────────
// LP pair reserve helpers
// ─────────────────────────────────────────────────────────────────────────────

const PAIR_ABI = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function totalSupply() view returns (uint256)',
]);

export interface PairReserveInfo {
  morbiusReserve: bigint;    // how many MORBIUS tokens are in the pair
  totalLPSupply: bigint;     // total LP tokens in circulation
  morbiusPerLP: bigint;      // MORBIUS per 1e18 LP tokens (scaled by 1e18)
  hasLiquidity: boolean;
}

/**
 * Read a UniswapV2-style pair's reserves and determine the MORBIUS-per-LP-token ratio.
 * Returns hasLiquidity=false if the pair is empty or totalSupply is zero.
 */
export async function getPairReserveInfo(pairAddress: `0x${string}`): Promise<PairReserveInfo> {
  const publicClient = getPublicClient();

  const [token0, reservesResult, totalSupply] = await Promise.all([
    publicClient.readContract({ address: pairAddress, abi: PAIR_ABI, functionName: 'token0' }),
    publicClient.readContract({ address: pairAddress, abi: PAIR_ABI, functionName: 'getReserves' }),
    publicClient.readContract({ address: pairAddress, abi: PAIR_ABI, functionName: 'totalSupply' }),
  ]);

  const [reserve0, reserve1] = reservesResult as [bigint, bigint, number];
  const totalLP = totalSupply as bigint;
  const isMorbiusToken0 = (token0 as string).toLowerCase() === MORBIUS_TOKEN_ADDRESS.toLowerCase();
  const morbiusReserve = isMorbiusToken0 ? reserve0 : reserve1;

  if (totalLP === 0n || morbiusReserve === 0n) {
    return { morbiusReserve: 0n, totalLPSupply: totalLP, morbiusPerLP: 0n, hasLiquidity: false };
  }

  const SCALE = 10n ** 18n;
  const morbiusPerLP = (morbiusReserve * SCALE) / totalLP;

  return { morbiusReserve, totalLPSupply: totalLP, morbiusPerLP, hasLiquidity: true };
}

/**
 * Given a holder's LP balance and pair reserve info, calculate the MORBIUS-equivalent.
 */
export function calcMorbiusEquivalent(lpBalance: bigint, reserveInfo: PairReserveInfo): bigint {
  if (!reserveInfo.hasLiquidity || reserveInfo.morbiusPerLP === 0n) return 0n;
  const SCALE = 10n ** 18n;
  return (lpBalance * reserveInfo.morbiusPerLP) / SCALE;
}

// ─────────────────────────────────────────────────────────────────────────────
// LP token holder fetch (PulseChain blockscout API)
// ─────────────────────────────────────────────────────────────────────────────

const PULSECHAIN_API = 'https://api.scan.pulsechain.com/api/v2';
const HOLDERS_PAGE_SIZE = 50;

export interface LPHolder {
  address: string;
  balance: bigint;
}

/**
 * Fetch all holders of an LP token from the PulseChain blockscout API.
 * Returns raw LP balances — MORBIUS-equivalent must be calculated separately.
 */
export async function fetchLPHolders(pairAddress: string): Promise<LPHolder[]> {
  const holders: LPHolder[] = [];
  let nextPage: string | null =
    `${PULSECHAIN_API}/tokens/${pairAddress}/holders?page_size=${HOLDERS_PAGE_SIZE}`;

  while (nextPage) {
    let resp: Response;
    try {
      resp = await fetch(nextPage);
    } catch (err) {
      logger.error('[MerkleClaimLP] PulseChain API fetch error', err);
      break;
    }

    if (!resp.ok) {
      logger.error(`[MerkleClaimLP] PulseChain API ${resp.status} for ${nextPage}`);
      break;
    }

    const data = await resp.json() as {
      items?: Array<{ address: { hash: string }; value: string }>;
      next_page_params?: Record<string, string> | null;
    };

    for (const item of data.items ?? []) {
      const addr = item.address?.hash?.toLowerCase();
      const balance = BigInt(item.value ?? '0');
      if (addr && balance > 0n) {
        holders.push({ address: addr, balance });
      }
    }

    if (data.next_page_params && Object.keys(data.next_page_params).length > 0) {
      const params = new URLSearchParams(
        Object.entries(data.next_page_params).map(([k, v]) => [k, String(v)] as [string, string]),
      );
      nextPage = `${PULSECHAIN_API}/tokens/${pairAddress}/holders?page_size=${HOLDERS_PAGE_SIZE}&${params}`;
    } else {
      nextPage = null;
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  return holders;
}

/**
 * Get the latest block number from PulseChain API.
 */
export async function getLatestBlock(): Promise<number | null> {
  try {
    const resp = await fetch(`${PULSECHAIN_API}/blocks?type=block&page_size=1`);
    if (resp.ok) {
      const data = await resp.json() as { items?: Array<{ height: number }> };
      return data.items?.[0]?.height ?? null;
    }
  } catch {
    // non-critical
  }
  return null;
}
