/**
 * Payouts from SlotBankrollEscrow — the slots-only counterpart to
 * utils/escrow-payout.ts.
 *
 * Deliberately its own module with its own key. The point of splitting slots
 * off the tournament escrow was that a slots bug or a leaked slots key must not
 * be able to reach tournament prize money; sharing a signer here would give
 * most of that back. SLOT_ESCROW_AUTHORIZED_KEY is what should be set in
 * production. The SETTLEMENT_PRIVATE_KEY fallback exists so a fresh deployment
 * works before the dedicated key is minted — it is a convenience, not the
 * intended end state, and it logs a warning once.
 *
 * The contract caps every payout at the machine's own unpaid balance, so a
 * wrong machineId here fails loudly on-chain rather than quietly spending
 * another creator's bankroll.
 */

import { createWalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { pulsechain } from 'viem/chains';
import { slotBankrollEscrowAbi } from '../abi/slot-bankroll-escrow';
import { tournamentIdToBytes32 } from './tournament-id-bytes32';
import { getSlotBankrollEscrowAddress } from './slot-escrow-address';
import { getPublicClient, pulsechainTransport } from './chain-client';
import { logger } from './logger';

const DEDICATED_KEY = process.env.SLOT_ESCROW_AUTHORIZED_KEY as `0x${string}` | undefined;
const FALLBACK_KEY = process.env.SETTLEMENT_PRIVATE_KEY as `0x${string}` | undefined;

let warnedAboutFallback = false;

function authorizedKey(): `0x${string}` | undefined {
  if (DEDICATED_KEY) return DEDICATED_KEY;
  if (FALLBACK_KEY && !warnedAboutFallback) {
    warnedAboutFallback = true;
    logger.warn(
      '[SlotEscrow] SLOT_ESCROW_AUTHORIZED_KEY is not set — falling back to SETTLEMENT_PRIVATE_KEY. ' +
        'Set a dedicated slots key so a slots-side compromise cannot touch tournament escrow funds.',
    );
  }
  return FALLBACK_KEY;
}

let walletClient: ReturnType<typeof createWalletClient> | null = null;

function getWalletClient() {
  const key = authorizedKey();
  if (!key) throw new Error('SLOT_ESCROW_AUTHORIZED_KEY (or SETTLEMENT_PRIVATE_KEY) not set');
  if (!walletClient) {
    walletClient = createWalletClient({
      account: privateKeyToAccount(key),
      chain: pulsechain,
      transport: pulsechainTransport(),
    });
  }
  return walletClient;
}

/** The signing address, so operators can check it matches the contract's authorizedServer. */
export function getSlotEscrowSignerAddress(): string | null {
  const key = authorizedKey();
  if (!key) return null;
  try {
    return privateKeyToAccount(key).address;
  } catch {
    return null;
  }
}

/**
 * Pay out of a machine's bankroll — a player cashout or a creator withdrawal.
 * The caller decides which; the contract only enforces that the machine's own
 * pool covers it.
 */
export async function sendSlotBankrollPayout(
  machineId: string,
  to: string,
  amount: bigint,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (amount <= 0n) return { success: true };

  const escrow = getSlotBankrollEscrowAddress();
  if (!escrow) {
    return {
      success: false,
      error: 'Slot bankroll escrow is not deployed yet (set SLOT_BANKROLL_ESCROW_ADDRESS)',
    };
  }

  const poolId = tournamentIdToBytes32(machineId);
  logger.info('[SlotEscrow] payout: invoking', { machineId, poolId, escrow, to, amount: amount.toString() });

  try {
    const client = getWalletClient();
    const txHash = await client.writeContract({
      address: escrow,
      abi: slotBankrollEscrowAbi,
      functionName: 'payout',
      args: [poolId as `0x${string}`, to as `0x${string}`, amount],
      chain: pulsechain,
      account: client.account!,
    });

    // Wait for the receipt: a payout that reverted must never be recorded as paid.
    const receipt = await getPublicClient().waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== 'success') {
      logger.error('[SlotEscrow] payout reverted', { machineId, txHash });
      return { success: false, txHash, error: 'Payout transaction reverted on-chain' };
    }

    logger.info('[SlotEscrow] payout sent', { machineId, txHash });
    return { success: true, txHash };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.error('[SlotEscrow] payout failed', { machineId, to, error });
    return { success: false, error };
  }
}

/** On-chain view of a machine's bankroll — the source of truth for solvency checks. */
export async function readSlotBankrollOnChain(machineId: string): Promise<{
  token: string;
  totalFunded: bigint;
  totalPaidOut: bigint;
  remaining: bigint;
  frozen: boolean;
} | null> {
  const escrow = getSlotBankrollEscrowAddress();
  if (!escrow) return null;
  try {
    const r = (await getPublicClient().readContract({
      address: escrow,
      abi: slotBankrollEscrowAbi,
      functionName: 'getBankroll',
      args: [tournamentIdToBytes32(machineId) as `0x${string}`],
    })) as readonly [string, bigint, bigint, bigint, bigint, boolean];
    return {
      token: String(r[0]),
      totalFunded: r[1],
      totalPaidOut: r[2],
      remaining: r[3],
      frozen: Boolean(r[5]),
    };
  } catch (e) {
    logger.error('[SlotEscrow] on-chain bankroll read failed', {
      machineId,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
