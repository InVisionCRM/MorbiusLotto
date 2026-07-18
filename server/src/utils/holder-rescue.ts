/**
 * On-chain rescue + hot-wallet topup for holder/LP chip rewards.
 *
 * Both MerkleClaimMorbius and MerkleClaimLP expose:
 *   function rescueTokens(address token, uint256 amount) external onlyOwner
 * After the call the rescued MORBIUS lands at `msg.sender` (the owner wallet).
 * We then ERC20.transfer it to the hot wallet (0x8f6D…35F2e) which backs
 * chip cashouts in MoneyService.
 *
 * Requires MERKLE_OWNER_PRIVATE_KEY (the same key MerkleClaim's revokeEpoch needs).
 */

import { createWalletClient, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { pulsechain } from 'viem/chains';
import { getPublicClient, pulsechainTransport } from './chain-client';
import { logger } from './logger';

// Vault contracts (override via server .env)
const MERKLE_CLAIM_MORBIUS_ADDRESS = (
  process.env.MERKLE_CLAIM_MORBIUS_ADDRESS
  || '0x3807f417617E53d4c5C7D7A825a5ce4D105A75d2'
) as `0x${string}`;

const MERKLE_CLAIM_LP_ADDRESS = (
  process.env.MERKLE_CLAIM_LP_ADDRESS
  || process.env.NEXT_PUBLIC_MERKLE_CLAIM_LP_ADDRESS
  || '0x64Dd1c933027d757212E43725c99bD4402211A1A'
) as `0x${string}`;

const MORBIUS_TOKEN_ADDRESS = (
  process.env.MORBIUS_TOKEN_ADDRESS
  || '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1'
) as `0x${string}`;

const DEFAULT_HOT_WALLET = '0x8f6Dc8FD8A5115fdec3CCbE36BE6cf9B28635F2e';

const RESCUE_ABI = parseAbi([
  'function rescueTokens(address token, uint256 amount) external',
]);
const ERC20_BALANCE_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
]);
const ERC20_TRANSFER_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

export type RescueCohort = 'morbius' | 'lp';

export interface RescueResult {
  amountWei: bigint;
  rescueTxHash: `0x${string}`;
  topupTxHash: `0x${string}`;
  vaultAddress: `0x${string}`;
  hotWalletAddress: `0x${string}`;
}

function getOwnerKey(): `0x${string}` {
  const key = process.env.MERKLE_OWNER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) throw new Error('MERKLE_OWNER_PRIVATE_KEY not set');
  return key;
}

function getHotWalletAddress(): `0x${string}` {
  const raw = (process.env.HOT_WALLET_ADDRESS || DEFAULT_HOT_WALLET).trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    throw new Error('HOT_WALLET_ADDRESS env invalid');
  }
  return raw as `0x${string}`;
}

function getVaultAddress(cohort: RescueCohort): `0x${string}` {
  return cohort === 'morbius' ? MERKLE_CLAIM_MORBIUS_ADDRESS : MERKLE_CLAIM_LP_ADDRESS;
}

/** Read the MORBIUS balance held by the relevant MerkleClaim vault. */
export async function readVaultBalance(cohort: RescueCohort): Promise<bigint> {
  const publicClient = getPublicClient();
  const vault = getVaultAddress(cohort);
  const balance = await publicClient.readContract({
    address: MORBIUS_TOKEN_ADDRESS,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [vault],
  });
  return balance as bigint;
}

/**
 * 1) Read vault balance.
 * 2) rescueTokens(MORBIUS, amount) — vault → owner wallet.
 * 3) ERC20.transfer(hotWallet, amount) — owner → hot wallet.
 * Throws if vault balance is zero, or any tx reverts. Returns both tx hashes
 * for audit so the caller can persist them on holder_chip_epochs.
 */
export async function rescueAndTopUpHotWallet(cohort: RescueCohort): Promise<RescueResult> {
  const ownerKey = getOwnerKey();
  const account = privateKeyToAccount(ownerKey);
  const vault = getVaultAddress(cohort);
  const hotWalletAddress = getHotWalletAddress();
  const publicClient = getPublicClient();
  const walletClient = createWalletClient({
    account,
    chain: pulsechain,
    transport: pulsechainTransport(),
  });

  const amountWei = await readVaultBalance(cohort);
  if (amountWei === 0n) {
    throw new Error(`Vault ${vault} balance is 0 — nothing to rescue`);
  }
  logger.info(
    `[HolderRescue] ${cohort}: rescuing ${amountWei} wei from ${vault} via owner ${account.address}`,
  );

  // 1. Rescue from vault → owner wallet
  const rescueTxHash = await walletClient.writeContract({
    address: vault,
    abi: RESCUE_ABI,
    functionName: 'rescueTokens',
    args: [MORBIUS_TOKEN_ADDRESS, amountWei],
    chain: pulsechain,
    account,
  });
  logger.info(`[HolderRescue] ${cohort}: rescueTokens tx submitted: ${rescueTxHash}`);

  const rescueRcpt = await publicClient.waitForTransactionReceipt({ hash: rescueTxHash });
  if (rescueRcpt.status !== 'success') {
    throw new Error(`Rescue tx ${rescueTxHash} reverted`);
  }
  logger.info(`[HolderRescue] ${cohort}: rescue confirmed in block ${rescueRcpt.blockNumber}`);

  // 2. Owner wallet → hot wallet
  const topupTxHash = await walletClient.writeContract({
    address: MORBIUS_TOKEN_ADDRESS,
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [hotWalletAddress, amountWei],
    chain: pulsechain,
    account,
  });
  logger.info(`[HolderRescue] ${cohort}: hot-wallet topup tx submitted: ${topupTxHash}`);

  const topupRcpt = await publicClient.waitForTransactionReceipt({ hash: topupTxHash });
  if (topupRcpt.status !== 'success') {
    // The rescued MORBIUS is in the owner wallet. Surface this so the caller
    // can re-attempt the topup leg manually — do not lose the funds.
    throw new Error(
      `Topup tx ${topupTxHash} reverted. MORBIUS is in owner wallet ${account.address}; `
        + `manual recovery: ERC20.transfer(${hotWalletAddress}, ${amountWei}).`,
    );
  }
  logger.info(`[HolderRescue] ${cohort}: topup confirmed in block ${topupRcpt.blockNumber}`);

  return {
    amountWei,
    rescueTxHash,
    topupTxHash,
    vaultAddress: vault,
    hotWalletAddress,
  };
}

/** Returns true if the owner key is configured. */
export function isHolderRescueConfigured(): boolean {
  return Boolean(process.env.MERKLE_OWNER_PRIVATE_KEY);
}

/** Address derived from MERKLE_OWNER_PRIVATE_KEY, or null. */
export function getHolderRescueOwnerAddress(): string | null {
  try {
    return privateKeyToAccount(getOwnerKey()).address;
  } catch {
    return null;
  }
}
