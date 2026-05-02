#!/usr/bin/env node
/**
 * PulseChain — tournament prize escrow: **payout only** (`payoutMultiple`). No funding / approve / join txs.
 *
 * End-to-end proof (fund random UUID → payout): use **`scripts/pulsechain-escrow-fund-then-payout.mjs`** instead.
 *
 * Requires (env, same as server / smoke test):
 *   TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY or SETTLEMENT_PRIVATE_KEY — must be escrow `authorizedServer`.
 *   BOT_WALLETS or TOURNAMENT_BOT_ADDRESSES or POKER_BOT_ADDRESSES — comma-separated winners; remaining pool
 *   balance is split evenly (same as smoke test).
 *
 * Tournaments to pay (one of):
 *   ESCROW_PAYOUT_TOURNAMENT_UUIDS — comma-separated server UUIDs (keccak256(utf8(uuid)) = bytes32 id), or
 *   ESCROW_PAYOUT_BYTES32_IDS — comma-separated 0x-prefixed 32-byte tournament ids.
 *   Or pass UUIDs as CLI args:  node scripts/pulsechain-tournament-escrow-payout-only.mjs <uuid> [uuid...]
 *
 * Optional: PULSECHAIN_RPC_URL, TOURNAMENT_PRIZE_ESCROW_ADDRESS, TX_*, RPC_*, ESCROW_SMOKE_GAS_PAYOUT_MULTIPLE
 * (default gas 900000 for payoutMultiple). See pulsechain-leflowt-two-tournaments-escrow-smoke.mjs for fee envs.
 *
 * Usage (repo root):
 *   ESCROW_PAYOUT_TOURNAMENT_UUIDS='3daff07f-...,e422779b-...' node scripts/pulsechain-tournament-escrow-payout-only.mjs
 */

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

const DEFAULT_ESCROW = '0xA54da628C54d2C9885a537f18dc9c22856510eDf';

const escrowAbi = [
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

function tournamentUuidToBytes32(tournamentUuid) {
  const utf8 = new TextEncoder().encode(tournamentUuid);
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

/** @param {string} envName @param {number} defaultUnits */
function parseGasUnitsEnv(envName, defaultUnits) {
  const raw = process.env[envName]?.trim();
  if (!raw) return BigInt(defaultUnits);
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return BigInt(defaultUnits);
  return BigInt(Math.floor(n));
}

/**
 * @param {import('viem').PublicClient} publicClient
 * @returns {Promise<{ maxFeePerGas?: bigint, maxPriorityFeePerGas?: bigint }>}
 */
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
    // optional explicit gwei may still apply
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

function parseBytes32List(raw) {
  const parts = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const p of parts) {
    if (!/^0x[a-fA-F0-9]{64}$/.test(p)) {
      console.error('Invalid bytes32 (need 0x + 64 hex):', p);
      process.exit(1);
    }
    out.push(/** @type {`0x${string}`} */ (p.toLowerCase()));
  }
  return out;
}

function resolveTournamentIds(argv) {
  const hexEnv = process.env.ESCROW_PAYOUT_BYTES32_IDS?.trim();
  if (hexEnv) {
    const ids = parseBytes32List(hexEnv);
    return { ids, source: 'ESCROW_PAYOUT_BYTES32_IDS' };
  }

  const uuidEnv = process.env.ESCROW_PAYOUT_TOURNAMENT_UUIDS?.trim();
  const fromArgv = argv.slice(2).filter(Boolean);
  const uuidList = [];
  if (uuidEnv) {
    uuidList.push(
      ...uuidEnv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }
  uuidList.push(...fromArgv);

  if (uuidList.length === 0) {
    console.error(
      [
        'Set tournament ids via one of:',
        '  ESCROW_PAYOUT_TOURNAMENT_UUIDS — comma-separated UUIDs (same as server tournament id), or',
        '  ESCROW_PAYOUT_BYTES32_IDS — comma-separated 0x…32-byte ids, or',
        '  CLI: node scripts/pulsechain-tournament-escrow-payout-only.mjs <uuid> [uuid...]',
      ].join('\n'),
    );
    process.exit(1);
  }

  const ids = uuidList.map((u) => tournamentUuidToBytes32(u));
  return { ids, uuids: uuidList, source: uuidEnv ? 'ESCROW_PAYOUT_TOURNAMENT_UUIDS+argv' : 'argv' };
}

function replacer(_, value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value) && value.length && typeof value[0] === 'bigint') {
    return value.map((x) => x.toString());
  }
  return value;
}

async function main() {
  const pkPayoutRaw =
    process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY?.trim() ||
    process.env.SETTLEMENT_PRIVATE_KEY?.trim() ||
    '';
  if (!pkPayoutRaw) {
    console.error('Set TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY or SETTLEMENT_PRIVATE_KEY (authorized payout signer).');
    process.exit(1);
  }

  const { list: payoutRecipients, label: payoutEnvLabel } = resolvePayoutRecipients();
  if (payoutRecipients.length === 0) {
    console.error('Set BOT_WALLETS (preferred) or TOURNAMENT_BOT_ADDRESSES or POKER_BOT_ADDRESSES.');
    process.exit(1);
  }

  const rpc = process.env.PULSECHAIN_RPC_URL?.trim() || 'https://rpc.pulsechain.com';
  const escrowAddr = getAddress(
    process.env.TOURNAMENT_PRIZE_ESCROW_ADDRESS?.trim() ||
      process.env.NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS?.trim() ||
      DEFAULT_ESCROW,
  );

  const resolved = resolveTournamentIds(process.argv);
  const tournamentIds = resolved.ids;

  const rpcTimeoutMs = Number(process.env.RPC_HTTP_TIMEOUT_MS?.trim() || '90000');
  const rpcRetries = Number(process.env.RPC_RETRY_COUNT?.trim() || '4');
  const httpOpts = {
    timeout: rpcTimeoutMs,
    retryCount: rpcRetries,
    retryDelay: 250,
  };
  const transport = http(rpc, httpOpts);

  const pkPayout = reqPk(pkPayoutRaw, 'TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY / SETTLEMENT_PRIVATE_KEY');
  const accountPayout = privateKeyToAccount(pkPayout);
  const publicClient = createPublicClient({ chain: pulsechain, transport });
  const walletPayout = createWalletClient({
    account: accountPayout,
    chain: pulsechain,
    transport,
  });

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

  console.log('RPC:', rpc);
  console.log('Escrow:', escrowAddr);
  console.log('Payout signer:', accountPayout.address);
  console.log('Recipients:', payoutRecipients.length, 'from', payoutEnvLabel);
  console.log('Tournaments:', tournamentIds.length, `(${resolved.source})`);
  if (Object.keys(txFees).length > 0) {
    console.log(
      'Tx fee overrides (wei):',
      Object.fromEntries(Object.entries(txFees).map(([k, v]) => [k, v.toString()])),
    );
  }
  console.log(`Gas payoutMultiple: ${gasPayoutMultiple} (ESCROW_SMOKE_GAS_PAYOUT_MULTIPLE)`);
  console.log(`Receipt: timeout=${txTimeout}ms poll=${txPoll}ms`);

  const authorizedOnChain = await publicClient.readContract({
    address: escrowAddr,
    abi: escrowAbi,
    functionName: 'authorizedServer',
  });
  if (accountPayout.address.toLowerCase() !== authorizedOnChain.toLowerCase()) {
    console.error(
      `Signer ${accountPayout.address} does not match authorizedServer ${authorizedOnChain}`,
    );
    process.exit(1);
  }

  const results = [];

  for (let i = 0; i < tournamentIds.length; i++) {
    const idBytes32 = tournamentIds[i];
    const label = resolved.uuids?.[i] ?? idBytes32;

    console.log(`\n--- [${i + 1}/${tournamentIds.length}] ${label} ---`);
    console.log('  bytes32:', idBytes32);

    const fresh = await publicClient.readContract({
      address: escrowAddr,
      abi: escrowAbi,
      functionName: 'getPool',
      args: [idBytes32],
    });
    const poolToken = fresh[0];
    const total = fresh[2];
    const paid = fresh[3];
    const cancelled = fresh[5];
    const remaining = total - paid;

    console.log('  pool token:', poolToken);
    console.log('  totalDeposited:', total.toString());
    console.log('  amountPaidOut:', paid.toString());
    console.log('  remaining wei:', remaining.toString());
    console.log('  cancelled:', cancelled);

    if (cancelled) {
      console.warn('  skip: pool cancelled');
      results.push({ idBytes32, label, skipped: true, reason: 'cancelled' });
      continue;
    }
    if (remaining <= 0n) {
      console.log('  skip: nothing to pay');
      results.push({ idBytes32, label, skipped: true, reason: 'empty' });
      continue;
    }

    const shareWei = splitWeiEvenly(remaining, payoutRecipients.length);
    const { winners, amounts } = zipNonZeroWinners(payoutRecipients, shareWei);
    if (winners.length === 0) {
      console.error('No non-zero payout slices.');
      process.exit(1);
    }

    const payNonce = await publicClient.getTransactionCount({
      address: accountPayout.address,
      blockTag: 'pending',
    });
    console.log(`  payoutMultiple (${winners.length} winners, nonce ${payNonce})…`);

    const hash = await walletPayout.writeContract({
      address: escrowAddr,
      abi: escrowAbi,
      functionName: 'payoutMultiple',
      args: [idBytes32, winners, amounts],
      gas: gasPayoutMultiple,
      nonce: payNonce,
      ...txFees,
    });
    console.log('  submitted', hash);
    const receipt = await waitConfirmed(hash);
    if (receipt.status !== 'success') {
      console.error('  payout reverted on-chain (status not success). Check:', `https://scan.pulsechain.com/tx/${hash}`);
      process.exit(1);
    }
    console.log('  confirmed', hash);

    let idx = 0;
    for (const w of winners) {
      console.log(`    → ${w} : ${amounts[idx++].toString()} wei`);
    }

    results.push({
      idBytes32,
      label,
      payoutTxHash: hash,
      payoutWinners: winners,
      payoutAmountsWei: amounts.map((x) => x.toString()),
    });
  }

  console.log('\nSummary:', JSON.stringify(results, replacer, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
