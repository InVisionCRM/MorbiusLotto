/**
 * community-slot-bankroll.ts — the on-chain side of a community machine's
 * PRC-20 bankroll, held in SlotBankrollEscrow:
 *
 *   pool id    = keccak256(machine UUID)          (tournament-id-bytes32.ts)
 *   funding    = fundBankroll(poolId, token, amount) by the creator,
 *                verified via the BankrollFunded event — never client claims
 *   withdrawal = authorized-key payout             (utils/slot-escrow-payout.ts)
 *
 * This used to run on the tournament prize escrow. It no longer does: creator
 * bankrolls and tournament prize money are separate concerns and now live in
 * separate contracts with separate server keys, so neither can reach the other.
 *
 * Everything here is exported behind the SlotBankrollChain interface so the
 * routes can be tested against a mock chain — the real implementations talk
 * to PulseChain through the shared viem client.
 *
 * Fee-on-transfer is handled ON-CHAIN now: the contract credits the balance it
 * actually received, so the event amount is already net of any skim and the
 * pool can never claim more than it holds. We still compare against the naive
 * expectation to raise the warning badge, but it is now cosmetic rather than
 * load-bearing — a skimming token cannot leave the books overstated.
 */

import { decodeEventLog, decodeFunctionData, type Hex } from 'viem';
import { getPublicClient } from '../utils/chain-client';
import { slotBankrollEscrowAbi } from '../abi/slot-bankroll-escrow';
import { tournamentIdToBytes32 } from '../utils/tournament-id-bytes32';
import { getSlotBankrollEscrowAddress } from '../utils/slot-escrow-address';
import { sendSlotBankrollPayout } from '../utils/slot-escrow-payout';
import { logger } from '../utils/logger';

const ERC20_META_ABI = [
  { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'symbol', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

export interface TokenMetadata {
  decimals: number;
  symbol: string | null;
  name: string | null;
}

export interface BankrollDepositVerification {
  ok: boolean;
  error?: string;
  /** The BankrollFunded amount — what the contract actually received and credited. */
  amount?: bigint;
  /** The token skims transfers. Cosmetic warning only — the credit is already net. */
  feeDetected?: boolean;
}

export interface SlotBankrollChain {
  readTokenMetadata(tokenAddress: string): Promise<TokenMetadata>;
  verifyBankrollDeposit(params: {
    machineId: string;
    txHash: string;
    contributor: string;
    tokenAddress: string;
  }): Promise<BankrollDepositVerification>;
  sendBankrollWithdrawal(machineId: string, to: string, amount: bigint):
    Promise<{ success: boolean; txHash?: string; error?: string }>;
}

/** decimals() is load-bearing (all unit conversions); symbol/name are cosmetic. */
async function readTokenMetadata(tokenAddress: string): Promise<TokenMetadata> {
  const client = getPublicClient();
  const addr = tokenAddress as `0x${string}`;
  const decimals = Number(
    await client.readContract({ address: addr, abi: ERC20_META_ABI, functionName: 'decimals' }),
  );
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error(`token reports unusable decimals (${decimals})`);
  }
  let symbol: string | null = null;
  let name: string | null = null;
  try {
    const s = String(await client.readContract({ address: addr, abi: ERC20_META_ABI, functionName: 'symbol' })).trim().slice(0, 32);
    if (s && /^[\x20-\x7E]+$/.test(s)) symbol = s;
  } catch { /* optional in the ERC-20 spec */ }
  try {
    const n = String(await client.readContract({ address: addr, abi: ERC20_META_ABI, functionName: 'name' })).trim().slice(0, 64);
    if (n && !/[<>\x00-\x08\x0B\x0C\x0E-\x1F]/.test(n)) name = n;
  } catch { /* optional in the ERC-20 spec */ }
  return { decimals, symbol, name };
}

async function verifyBankrollDeposit(params: {
  machineId: string;
  txHash: string;
  contributor: string;
  tokenAddress: string;
}): Promise<BankrollDepositVerification> {
  const { machineId, txHash, contributor, tokenAddress } = params;
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { ok: false, error: 'Invalid tx hash' };
  }
  const escrowAddr = getSlotBankrollEscrowAddress();
  if (!escrowAddr) {
    return { ok: false, error: 'Slot bankroll escrow is not deployed yet — real-money machines are unavailable' };
  }
  const wantPool = tournamentIdToBytes32(machineId).toLowerCase();
  const wantToken = tokenAddress.toLowerCase();
  const wantContributor = contributor.toLowerCase();

  try {
    const client = getPublicClient();

    // The server's RPC can lag the wallet's — retry for ~18s like the poker join flow.
    let receipt: Awaited<ReturnType<typeof client.getTransactionReceipt>> | null = null;
    for (let i = 0; i < 6; i++) {
      try {
        receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
        if (receipt) break;
      } catch { /* not mined yet on this RPC */ }
      if (i < 5) await new Promise((r) => setTimeout(r, 3000));
    }
    if (!receipt) return { ok: false, error: 'Deposit tx not found on-chain after waiting (RPC may be lagging)' };
    if (receipt.status !== 'success') {
      return { ok: false, error: 'Deposit transaction reverted on-chain — check token allowance, balance, and that the pool has not been funded with a different token' };
    }

    const tx = await client.getTransaction({ hash: txHash as `0x${string}` });
    if (!tx?.from) return { ok: false, error: 'Could not load transaction sender' };
    if (String(tx.from).toLowerCase() !== wantContributor) {
      return { ok: false, error: 'Deposit transaction sender does not match your wallet' };
    }

    let amount: bigint | undefined;
    for (const rawLog of receipt.logs) {
      if (!rawLog.topics?.length) continue;
      try {
        const decoded = decodeEventLog({
          abi: slotBankrollEscrowAbi,
          data: (rawLog.data ?? '0x') as Hex,
          topics: rawLog.topics as [Hex, ...Hex[]],
          strict: false,
        });
        if (decoded.eventName !== 'BankrollFunded') continue;
        const a = decoded.args as Record<string, unknown>;
        if (
          String(rawLog.address).toLowerCase() === escrowAddr.toLowerCase() &&
          String(a.machineId ?? '').toLowerCase() === wantPool &&
          String(a.token ?? '').toLowerCase() === wantToken &&
          String(a.funder ?? '').toLowerCase() === wantContributor &&
          typeof a.amount === 'bigint' && a.amount > 0n
        ) {
          amount = a.amount;
          break;
        }
      } catch { /* not this contract's event */ }
    }
    if (amount === undefined) {
      return { ok: false, error: 'No matching BankrollFunded event for this machine, token, and sender on the slot bankroll escrow' };
    }

    // Cosmetic fee-on-transfer flag. The contract already credited the true
    // received amount, so this cannot affect solvency — it only decides whether
    // the creator sees a "this token skims transfers" badge.
    //
    // Note this can NOT be a balance-delta check any more: the contract credits
    // exactly what arrived, so the delta always equals the event amount and the
    // check would never fire. The honest comparison is the amount the funder's
    // own call asked to move versus the amount that survived the transfer, both
    // of which are in the transaction itself — no historical state needed.
    let feeDetected = false;
    try {
      const decodedCall = decodeFunctionData({ abi: slotBankrollEscrowAbi, data: tx.input });
      if (decodedCall.functionName === 'fundBankroll') {
        const requested = decodedCall.args?.[2];
        if (typeof requested === 'bigint' && requested > amount) feeDetected = true;
      }
    } catch {
      logger.info('[SlotBankroll] fee-on-transfer check skipped (could not decode funding call)');
    }

    return { ok: true, amount, feeDetected };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Bankroll deposit verification failed: ${msg}` };
  }
}

/** The slots payout helper keys pools by UUID exactly like we do. */
function sendBankrollWithdrawal(machineId: string, to: string, amount: bigint) {
  return sendSlotBankrollPayout(machineId, to, amount);
}

export const realSlotBankrollChain: SlotBankrollChain = {
  readTokenMetadata,
  verifyBankrollDeposit,
  sendBankrollWithdrawal,
};
