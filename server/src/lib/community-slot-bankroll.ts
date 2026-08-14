/**
 * community-slot-bankroll.ts — the on-chain side of a community machine's
 * PRC-20 bankroll, built on the poker tournament escrow machinery:
 *
 *   pool id    = keccak256(machine UUID)          (tournament-id-bytes32.ts)
 *   funding    = addToPrizePool(poolId, token, amount) by the creator,
 *                verified via the PrizePoolAdded event — never client claims
 *   withdrawal = authorized-key escrow payout      (utils/escrow-payout.ts)
 *
 * Everything here is exported behind the SlotBankrollChain interface so the
 * routes can be tested against a mock chain — the real implementations talk
 * to PulseChain through the shared viem client.
 *
 * Fee-on-transfer detection (product decision: warn, never block): after a
 * deposit verifies, we compare the escrow's token balance across the tx's
 * block with the event amount. A shortfall means the token skims transfers —
 * the machine gets a persistent warning badge, but keeps working. Detection
 * is best-effort: if the RPC can't serve historical state, we skip it.
 */

import { decodeEventLog, type Hex } from 'viem';
import { getPublicClient } from '../utils/chain-client';
import { tournamentPrizeEscrowV6Abi } from '../abi/tournament-prize-escrow-v6';
import { tournamentIdToBytes32 } from '../utils/tournament-id-bytes32';
import { getTournamentPrizeEscrowAddress } from '../utils/tournament-escrow-address';
import { sendEscrowPayout } from '../utils/escrow-payout';
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
  /** The PrizePoolAdded amount — what the escrow's own books credited. */
  amount?: bigint;
  /** Best-effort fee-on-transfer detection; false when detection was impossible. */
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
  const escrowAddr = getTournamentPrizeEscrowAddress();
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
          abi: tournamentPrizeEscrowV6Abi,
          data: (rawLog.data ?? '0x') as Hex,
          topics: rawLog.topics as [Hex, ...Hex[]],
          strict: false,
        });
        if (decoded.eventName !== 'PrizePoolAdded') continue;
        const a = decoded.args as Record<string, unknown>;
        if (
          String(rawLog.address).toLowerCase() === escrowAddr.toLowerCase() &&
          String(a.tournamentId ?? '').toLowerCase() === wantPool &&
          String(a.token ?? '').toLowerCase() === wantToken &&
          String(a.contributor ?? '').toLowerCase() === wantContributor &&
          typeof a.amount === 'bigint' && a.amount > 0n
        ) {
          amount = a.amount;
          break;
        }
      } catch { /* not this contract's event */ }
    }
    if (amount === undefined) {
      return { ok: false, error: 'No matching PrizePoolAdded event for this machine, token, and sender on the escrow contract' };
    }

    // Best-effort fee-on-transfer detection: did the escrow's balance actually
    // grow by the event amount across this block? Same-block unrelated
    // transfers can inflate the delta (never deflate it below this tx's real
    // contribution), so only a SHORTFALL is meaningful — exactly the signal
    // we want. Skipped silently when the RPC has no historical state.
    let feeDetected = false;
    try {
      const [before, after] = await Promise.all([
        client.readContract({
          address: tokenAddress as `0x${string}`, abi: ERC20_META_ABI, functionName: 'balanceOf',
          args: [escrowAddr], blockNumber: receipt.blockNumber - 1n,
        }) as Promise<bigint>,
        client.readContract({
          address: tokenAddress as `0x${string}`, abi: ERC20_META_ABI, functionName: 'balanceOf',
          args: [escrowAddr], blockNumber: receipt.blockNumber,
        }) as Promise<bigint>,
      ]);
      if (after - before < amount) feeDetected = true;
    } catch {
      logger.info('[SlotBankroll] fee-on-transfer check skipped (no historical state on RPC)');
    }

    return { ok: true, amount, feeDetected };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Bankroll deposit verification failed: ${msg}` };
  }
}

/** The escrow payout helper keys pools by UUID exactly like we do. */
function sendBankrollWithdrawal(machineId: string, to: string, amount: bigint) {
  return sendEscrowPayout(machineId, to, amount);
}

export const realSlotBankrollChain: SlotBankrollChain = {
  readTokenMetadata,
  verifyBankrollDeposit,
  sendBankrollWithdrawal,
};
