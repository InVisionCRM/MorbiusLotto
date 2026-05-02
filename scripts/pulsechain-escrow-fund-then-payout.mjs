#!/usr/bin/env node
/**
 * PulseChain — **one** proof: create on-chain pool (new UUID + `addToPrizePool`) → `payoutMultiple` to BOT_WALLETS.
 * Use this to show fund + payout works in one command (no separate “payout-only” args).
 *
 * Env (same family as other escrow scripts):
 *   PRIVATE_KEY — token holder; funds the pool.
 *   TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY or SETTLEMENT_PRIVATE_KEY — `authorizedServer` (payout).
 *   BOT_WALLETS / TOURNAMENT_BOT_ADDRESSES / POKER_BOT_ADDRESSES
 *   ESCROW_PROVE_FLOWT_UNITS — whole token units to lock in the pool (default **10**; override e.g. 100).
 *   TOKEN_ADDRESS, TOURNAMENT_PRIZE_ESCROW_ADDRESS, PULSECHAIN_RPC_URL, TX_*, RPC_*, ESCROW_SMOKE_GAS_*
 *
 * After a successful run the pool is **fully paid out**; to test `pulsechain-tournament-escrow-payout-only.mjs` alone,
 * use a real server tournament id that still has `remaining` on-chain, or run this script and use the printed UUID
 * only for log correlation (not a second payout on the same pool).
 *
 *   node scripts/pulsechain-escrow-fund-then-payout.mjs
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  getAddress,
  parseGwei,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { pulsechain } from 'viem/chains';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

const DEFAULT_TOKEN = '0xfc3307067E629Dd194180bA7fC66e4e3e87eDe38';
const DEFAULT_ESCROW = '0xA54da628C54d2C9885a537f18dc9c22856510eDf';

const erc20Abi = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
];

const escrowAbi = [
  {
    name: 'addToPrizePool',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tournamentId', type: 'bytes32' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'payoutMultiple',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tournamentId', type: 'bytes32' },
      { name: 'winners', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
    ],
    outputs: [],
  },
  {
    name: 'getPool',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tournamentId', type: 'bytes32' }],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'depositor', type: 'address' },
      { name: 'totalDeposited', type: 'uint256' },
      { name: 'amountPaidOut', type: 'uint256' },
      { name: 'depositedAt', type: 'uint256' },
      { name: 'cancelled', type: 'bool' },
    ],
  },
  {
    name: 'authorizedServer',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
];

function tournamentIdToBytes32(tournamentId) {
  const utf8 = new TextEncoder().encode(tournamentId);
  const hex = /** @type {`0x${string}`} */ (`0x${Buffer.from(utf8).toString('hex')}`);
  return keccak256(hex);
}

function reqPk(raw, label) {
  const k = typeof raw === 'string' ? raw.trim() : '';
  if (!k.startsWith('0x') || k.length < 66) {
    console.error(`${label} must be a 0x-prefixed 32-byte private key`);
    process.exit(1);
  }
  return /** @type {`0x${string}`} */ (k);
}

function splitWeiEvenly(totalWei, parts) {
  const n = BigInt(parts);
  const base = totalWei / n;
  const rem = totalWei % n;
  const out = [];
  for (let i = 0; i < parts; i++) {
    out.push(base + (BigInt(i) < rem ? 1n : 0n));
  }
  let sum = 0n;
  for (const x of out) sum += x;
  if (sum !== totalWei) throw new Error('splitWeiEvenly invariant');
  return out;
}

function parseGasUnitsEnv(envName, defaultUnits) {
  const raw = process.env[envName]?.trim();
  if (!raw) return BigInt(defaultUnits);
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return BigInt(defaultUnits);
  return BigInt(Math.floor(n));
}

function parseAddressCsv(raw) {
  if (!raw || !String(raw).trim()) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((a) => getAddress(a));
}

function resolvePayoutRecipients() {
  const tries = [
    ['BOT_WALLETS', process.env.BOT_WALLETS],
    ['TOURNAMENT_BOT_ADDRESSES', process.env.TOURNAMENT_BOT_ADDRESSES],
    ['POKER_BOT_ADDRESSES', process.env.POKER_BOT_ADDRESSES],
  ];
  for (const [label, raw] of tries) {
    const list = parseAddressCsv(raw);
    if (list.length > 0) return { list, label };
  }
  return { list: [], label: '' };
}

function zipNonZeroWinners(addresses, amounts) {
  const w = [];
  const a = [];
  for (let i = 0; i < addresses.length; i++) {
    if (amounts[i] > 0n) {
      w.push(addresses[i]);
      a.push(amounts[i]);
    }
  }
  return { winners: w, amounts: a };
}

/** @param {import('viem').PublicClient} publicClient */
async function buildTxFeeOverrides(publicClient) {
  const explicitPrio = process.env.TX_MAX_PRIORITY_FEE_GWEI?.trim();
  const explicitMax = process.env.TX_MAX_FEE_PER_GAS_GWEI?.trim();
  const bumpRaw = process.env.TX_FEE_BUMP_MULTIPLIER?.trim();
  const highGas = ['1', 'true', 'yes'].includes(String(process.env.TX_HIGH_GAS ?? '').toLowerCase());

  let mult = 1;
  if (bumpRaw !== undefined && bumpRaw !== '') {
    const n = Number(bumpRaw);
    if (Number.isFinite(n) && n > 0) mult = n;
  } else if (highGas) {
    mult = 2;
  }

  /** @type {{ maxFeePerGas?: bigint, maxPriorityFeePerGas?: bigint }} */
  const out = {};

  let est = {};
  try {
    est = await publicClient.estimateFeesPerGas();
  } catch {
    // continue
  }

  let maxFeePerGas = est.maxFeePerGas;
  let maxPriorityFeePerGas = est.maxPriorityFeePerGas;

  if (mult !== 1 && maxFeePerGas != null && maxPriorityFeePerGas != null) {
    const pct = BigInt(Math.round(mult * 100));
    maxFeePerGas = (maxFeePerGas * pct) / 100n;
    maxPriorityFeePerGas = (maxPriorityFeePerGas * pct) / 100n;
  }

  if (explicitPrio) {
    out.maxPriorityFeePerGas = parseGwei(explicitPrio);
  } else if (maxPriorityFeePerGas != null) {
    out.maxPriorityFeePerGas = maxPriorityFeePerGas;
  }

  if (explicitMax) {
    out.maxFeePerGas = parseGwei(explicitMax);
  } else if (maxFeePerGas != null) {
    out.maxFeePerGas = maxFeePerGas;
  }

  if (out.maxFeePerGas != null && out.maxPriorityFeePerGas != null && out.maxFeePerGas < out.maxPriorityFeePerGas) {
    out.maxFeePerGas = out.maxPriorityFeePerGas * 2n;
  }

  return out;
}

function replacer(_, value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value) && value.length && typeof value[0] === 'bigint') {
    return value.map((x) => x.toString());
  }
  return value;
}

async function main() {
  const pkDepositor = reqPk(process.env.PRIVATE_KEY, 'PRIVATE_KEY');
  const pkPayoutRaw =
    process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY?.trim() ||
    process.env.SETTLEMENT_PRIVATE_KEY?.trim() ||
    '';
  if (!pkPayoutRaw) {
    console.error('Set TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY or SETTLEMENT_PRIVATE_KEY.');
    process.exit(1);
  }

  const flowtUnits = BigInt(
    process.env.ESCROW_PROVE_FLOWT_UNITS?.trim() || process.env.ESCROW_TOTAL_FLOWT_UNITS?.trim() || '10',
  );
  if (flowtUnits < 1n) {
    console.error('ESCROW_PROVE_FLOWT_UNITS (or ESCROW_TOTAL_FLOWT_UNITS) must be at least 1.');
    process.exit(1);
  }

  const { list: payoutRecipients, label: payoutEnvLabel } = resolvePayoutRecipients();
  if (payoutRecipients.length === 0) {
    console.error('Set BOT_WALLETS or TOURNAMENT_BOT_ADDRESSES or POKER_BOT_ADDRESSES.');
    process.exit(1);
  }

  const rpc = process.env.PULSECHAIN_RPC_URL?.trim() || 'https://rpc.pulsechain.com';
  const escrowAddr = getAddress(
    process.env.TOURNAMENT_PRIZE_ESCROW_ADDRESS?.trim() ||
      process.env.NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS?.trim() ||
      DEFAULT_ESCROW,
  );
  const tokenAddr = getAddress(process.env.TOKEN_ADDRESS?.trim() || DEFAULT_TOKEN);

  const accountDepositor = privateKeyToAccount(pkDepositor);
  const pkPayout = reqPk(pkPayoutRaw, 'TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY / SETTLEMENT_PRIVATE_KEY');
  const accountPayout = privateKeyToAccount(pkPayout);

  const rpcTimeoutMs = Number(process.env.RPC_HTTP_TIMEOUT_MS?.trim() || '90000');
  const rpcRetries = Number(process.env.RPC_RETRY_COUNT?.trim() || '4');
  const httpOpts = { timeout: rpcTimeoutMs, retryCount: rpcRetries, retryDelay: 250 };
  const transport = http(rpc, httpOpts);

  const publicClient = createPublicClient({ chain: pulsechain, transport });
  const walletDepositor = createWalletClient({
    account: accountDepositor,
    chain: pulsechain,
    transport,
  });
  const walletPayout = createWalletClient({
    account: accountPayout,
    chain: pulsechain,
    transport,
  });

  const gasApprove = parseGasUnitsEnv('ESCROW_SMOKE_GAS_APPROVE', 120_000);
  const gasAddToPrizePool = parseGasUnitsEnv('ESCROW_SMOKE_GAS_ADD_TO_PRIZE_POOL', 350_000);
  const gasPayoutMultiple = parseGasUnitsEnv('ESCROW_SMOKE_GAS_PAYOUT_MULTIPLE', 900_000);
  const txFees = await buildTxFeeOverrides(publicClient);

  const txTimeout = Number(process.env.TX_CONFIRM_TIMEOUT_MS?.trim() || '600000');
  const txPoll = Number(process.env.TX_POLL_INTERVAL_MS?.trim() || '1200');

  async function waitConfirmed(hash) {
    const explorer = `https://scan.pulsechain.com/tx/${hash}`;
    const start = Date.now();
    for (;;) {
      if (Date.now() - start > txTimeout) {
        console.error(`Receipt wait timed out (${txTimeout}ms). Check:\n  ${explorer}`);
        throw new Error(`Timed out waiting for receipt ${hash}`);
      }
      try {
        return await publicClient.getTransactionReceipt({ hash });
      } catch (e) {
        const name = e?.constructor?.name ?? '';
        const msg = `${e?.shortMessage ?? ''} ${e?.message ?? ''}`;
        if (
          name === 'TransactionReceiptNotFoundError' ||
          /Transaction receipt could not be found|Receipt not found/i.test(msg)
        ) {
          await new Promise((r) => setTimeout(r, txPoll));
          continue;
        }
        throw e;
      }
    }
  }

  const [symbol, decimals] = await Promise.all([
    publicClient.readContract({ address: tokenAddr, abi: erc20Abi, functionName: 'symbol' }),
    publicClient.readContract({ address: tokenAddr, abi: erc20Abi, functionName: 'decimals' }),
  ]);

  const totalWei = flowtUnits * 10n ** BigInt(decimals);
  const balance = await publicClient.readContract({
    address: tokenAddr,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [accountDepositor.address],
  });

  console.log('\n=== Escrow fund → payout (single tournament) ===\n');
  console.log('RPC:', rpc);
  console.log('Budget:', flowtUnits.toString(), symbol, '(wei:', totalWei.toString() + ')');
  console.log('Depositor:', accountDepositor.address, '| Balance:', balance.toString());
  console.log('Payout signer:', accountPayout.address);
  console.log('Recipients:', payoutRecipients.length, 'from', payoutEnvLabel);
  if (Object.keys(txFees).length > 0) {
    console.log(
      'Tx fees (wei):',
      Object.fromEntries(Object.entries(txFees).map(([k, v]) => [k, v.toString()])),
    );
  }

  if (balance < totalWei) {
    console.error(`Insufficient ${symbol} for depositor. Need ${totalWei.toString()} wei, have ${balance.toString()}.`);
    process.exit(1);
  }

  const authorizedOnChain = await publicClient.readContract({
    address: escrowAddr,
    abi: escrowAbi,
    functionName: 'authorizedServer',
  });
  if (accountPayout.address.toLowerCase() !== authorizedOnChain.toLowerCase()) {
    console.error(`Payout key ${accountPayout.address} !== authorizedServer ${authorizedOnChain}`);
    process.exit(1);
  }

  const tournamentUuid = crypto.randomUUID();
  const idBytes32 = tournamentIdToBytes32(tournamentUuid);
  console.log('\n--- Fund pool ---');
  console.log('tournament UUID:', tournamentUuid);
  console.log('bytes32 id:', idBytes32);

  const curAllowance = await publicClient.readContract({
    address: tokenAddr,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [accountDepositor.address, escrowAddr],
  });
  if (curAllowance < totalWei) {
    const n = await publicClient.getTransactionCount({ address: accountDepositor.address, blockTag: 'pending' });
    console.log('approve…', `(nonce ${n})`);
    const approveHash = await walletDepositor.writeContract({
      address: tokenAddr,
      abi: erc20Abi,
      functionName: 'approve',
      args: [escrowAddr, totalWei],
      gas: gasApprove,
      nonce: n,
      ...txFees,
    });
    console.log('  submitted', approveHash);
    const ar = await waitConfirmed(approveHash);
    if (ar.status !== 'success') process.exit(1);
    console.log('  confirmed approve');
  }

  let probeOk = false;
  try {
    await publicClient.simulateContract({
      address: escrowAddr,
      abi: escrowAbi,
      functionName: 'addToPrizePool',
      args: [idBytes32, tokenAddr, 1n],
      account: accountDepositor.address,
    });
    probeOk = true;
  } catch {
    // ignore
  }
  if (!probeOk) {
    console.error('Preflight: addToPrizePool reverts on this escrow (wrong bytecode / not V5).');
    process.exit(1);
  }

  const fundNonce = await publicClient.getTransactionCount({
    address: accountDepositor.address,
    blockTag: 'pending',
  });
  console.log('addToPrizePool (full budget, single tx)…', `(nonce ${fundNonce})`);
  const fundHash = await walletDepositor.writeContract({
    address: escrowAddr,
    abi: escrowAbi,
    functionName: 'addToPrizePool',
    args: [idBytes32, tokenAddr, totalWei],
    gas: gasAddToPrizePool,
    nonce: fundNonce,
    ...txFees,
  });
  console.log('  submitted', fundHash);
  const fundReceipt = await waitConfirmed(fundHash);
  if (fundReceipt.status !== 'success') {
    console.error('Funding tx failed on-chain.');
    process.exit(1);
  }
  console.log('  confirmed fund');

  const poolAfter = await publicClient.readContract({
    address: escrowAddr,
    abi: escrowAbi,
    functionName: 'getPool',
    args: [idBytes32],
  });
  const td = poolAfter[2];
  const paid0 = poolAfter[3];
  if (td !== totalWei) {
    console.error(`getPool totalDeposited ${td.toString()} !== expected ${totalWei.toString()} — abort before payout.`);
    process.exit(1);
  }
  console.log('  getPool totalDeposited (wei):', td.toString(), '| OK');

  const remaining = td - paid0;
  console.log('\n--- Payout ---');
  console.log('remaining wei:', remaining.toString());

  const shareWei = splitWeiEvenly(remaining, payoutRecipients.length);
  const { winners, amounts } = zipNonZeroWinners(payoutRecipients, shareWei);
  if (winners.length === 0) {
    console.error('No payout slices.');
    process.exit(1);
  }

  const payNonce = await publicClient.getTransactionCount({
    address: accountPayout.address,
    blockTag: 'pending',
  });
  console.log(`payoutMultiple (${winners.length} winners)…`, `(nonce ${payNonce})`);
  const payHash = await walletPayout.writeContract({
    address: escrowAddr,
    abi: escrowAbi,
    functionName: 'payoutMultiple',
    args: [idBytes32, winners, amounts],
    gas: gasPayoutMultiple,
    nonce: payNonce,
    ...txFees,
  });
  console.log('  submitted', payHash);
  const payReceipt = await waitConfirmed(payHash);
  if (payReceipt.status !== 'success') {
    console.error('payoutMultiple failed on-chain.');
    process.exit(1);
  }
  console.log('  confirmed payout');

  let idx = 0;
  for (const w of winners) {
    console.log(`    → ${w} : ${amounts[idx++].toString()} wei`);
  }

  const poolFinal = await publicClient.readContract({
    address: escrowAddr,
    abi: escrowAbi,
    functionName: 'getPool',
    args: [idBytes32],
  });
  const remAfter = poolFinal[2] - poolFinal[3];
  if (remAfter !== 0n) {
    console.error('Post-check: expected remaining 0, got', remAfter.toString());
    process.exit(1);
  }

  const summary = {
    ok: true,
    tournamentUuid,
    idBytes32,
    fundTxHash: fundHash,
    payoutTxHash: payHash,
    totalWei: totalWei.toString(),
    recipientsEnv: payoutEnvLabel,
  };
  console.log('\n=== Done ===');
  console.log('Tournament UUID (for logs / server):', tournamentUuid);
  console.log('Copy for payout-only dry reference (pool is empty now):');
  console.log(`  ESCROW_PAYOUT_TOURNAMENT_UUIDS='${tournamentUuid}' node scripts/pulsechain-tournament-escrow-payout-only.mjs`);
  console.log('(Expect skip/nothing to pay — funds already distributed.)\n');
  console.log(JSON.stringify(summary, replacer, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
