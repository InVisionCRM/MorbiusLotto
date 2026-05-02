#!/usr/bin/env node
/**
 * PulseChain — two escrow pools (two UUIDs). Default: splits ESCROW_TOTAL_FLOWT_UNITS (default 100) across four
 * `addToPrizePool` calls (two joins × two pools). Alternative: ESCROW_SMOKE_USE_DEPOSIT_PRIZE_POOL=1 uses one
 * `depositPrizePool` per pool (still pays out to BOT_WALLETS).
 *
 * Requires:
 *   PRIVATE_KEY — wallet holding ESCROW_TOTAL_FLOWT_UNITS of TOKEN_ADDRESS (approve + funding txs).
 *   TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY or SETTLEMENT_PRIVATE_KEY — must equal escrow `authorizedServer`.
 *   BOT_WALLETS or TOURNAMENT_BOT_ADDRESSES or POKER_BOT_ADDRESSES — comma-separated payout recipients.
 *
 * Receipt confirmation: plain eth_getTransactionReceipt polling only (TX_CONFIRM_TIMEOUT_MS, TX_POLL_INTERVAL_MS).
 * viem’s waitForTransactionReceipt uses watchBlockNumber + replacement probing; on some setups that path stalls even when the RPC answers quickly per call—use simple polling here instead.
 *
 * Gas (EIP-1559): optional fee overrides so txs confirm under congestion:
 *   TX_MAX_PRIORITY_FEE_GWEI, TX_MAX_FEE_PER_GAS_GWEI — explicit caps (string gwei, e.g. 5 and 50).
 *   TX_FEE_BUMP_MULTIPLIER — multiply estimated maxFeePerGas / maxPriorityFeePerGas (e.g. 2 or 1.5).
 *   TX_HIGH_GAS=1 — same as TX_FEE_BUMP_MULTIPLIER=2 when multiplier unset.
 *
 * HTTP: RPC_HTTP_TIMEOUT_MS (default 90000), RPC_RETRY_COUNT (default 4).
 *
 * Explicit gas limits skip eth_estimateGas (also flaky on some nodes). Override if needed:
 *   ESCROW_SMOKE_GAS_APPROVE, ESCROW_SMOKE_GAS_ADD_TO_PRIZE_POOL, ESCROW_SMOKE_GAS_DEPOSIT_PRIZE_POOL,
 *   ESCROW_SMOKE_GAS_PAYOUT_MULTIPLE — whole-number gas units (default 120000 / 350000 / 350000 / 900000).
 *
 * If `addToPrizePool` reverts on-chain, the deployed escrow may not match repo V5 — redeploy TournamentPrizeEscrowV5.sol.
 * Use ESCROW_SMOKE_USE_DEPOSIT_PRIZE_POOL=1 to smoke payouts without addToPrizePool.
 *
 * Defaults: TOKEN 0xfc3307067E629Dd194180bA7fC66e4e3e87eDe38, escrow V5 0xA54da628…
 *
 * Usage (repo root):
 *   node scripts/pulsechain-leflowt-two-tournaments-escrow-smoke.mjs
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
const LEGACY_ESCROW_V2 = '0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1';

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

function tournamentIdToBytes32(tournamentId) {
  const utf8 = new TextEncoder().encode(tournamentId);
  const hex = /** @type {`0x${string}`} */ (`0x${Buffer.from(utf8).toString('hex')}`);
  return keccak256(hex);
}

const escrowAbi = [
  {
    name: 'depositPrizePool',
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

function reqPk(raw, label) {
  const k = typeof raw === 'string' ? raw.trim() : '';
  if (!k.startsWith('0x') || k.length < 66) {
    console.error(`${label} must be a 0x-prefixed 32-byte private key`);
    process.exit(1);
  }
  return /** @type {`0x${string}`} */ (k);
}

/** Split `totalWei` into `parts` positive integers that sum exactly to `totalWei`. */
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

/** @param {string} envName @param {number} defaultUnits */
function parseGasUnitsEnv(envName, defaultUnits) {
  const raw = process.env[envName]?.trim();
  if (!raw) return BigInt(defaultUnits);
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return BigInt(defaultUnits);
  return BigInt(Math.floor(n));
}

function parseAddressCsv(raw) {
  if (!raw || !String(raw).trim()) return [];
  const parts = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.map((a) => getAddress(a));
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

/**
 * PulseChain can be slow to include txs; raising maxFee / priority speeds inclusion.
 * Explicit gwei env vars override the bumped estimate for that field.
 *
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
    // fall through — optional explicit gwei may still apply
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

async function main() {
  const pkDepositor = reqPk(process.env.PRIVATE_KEY, 'PRIVATE_KEY');
  const pkPayoutRaw =
    process.env.TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY?.trim() ||
    process.env.SETTLEMENT_PRIVATE_KEY?.trim() ||
    '';

  const flowtUnits = BigInt(process.env.ESCROW_TOTAL_FLOWT_UNITS?.trim() || '100');

  const useDepositSmoke = ['1', 'true', 'yes'].includes(
    String(process.env.ESCROW_SMOKE_USE_DEPOSIT_PRIZE_POOL ?? '').toLowerCase(),
  );

  const rpc = process.env.PULSECHAIN_RPC_URL?.trim() || 'https://rpc.pulsechain.com';
  const escrowAddr = getAddress(
    process.env.TOURNAMENT_PRIZE_ESCROW_ADDRESS?.trim() ||
      process.env.NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS?.trim() ||
      DEFAULT_ESCROW,
  );
  const tokenAddr = getAddress(process.env.TOKEN_ADDRESS?.trim() || DEFAULT_TOKEN);

  const { list: payoutRecipients, label: payoutEnvLabel } = resolvePayoutRecipients();
  if (payoutRecipients.length === 0) {
    console.error(
      'Set BOT_WALLETS (preferred) or TOURNAMENT_BOT_ADDRESSES or POKER_BOT_ADDRESSES with comma-separated addresses.',
    );
    process.exit(1);
  }

  const accountDepositor = privateKeyToAccount(pkDepositor);

  const rpcTimeoutMs = Number(process.env.RPC_HTTP_TIMEOUT_MS?.trim() || '90000');
  const rpcRetries = Number(process.env.RPC_RETRY_COUNT?.trim() || '4');
  const httpOpts = {
    timeout: rpcTimeoutMs,
    retryCount: rpcRetries,
    retryDelay: 250,
  };
  const transport = http(rpc, httpOpts);

  const publicClient = createPublicClient({ chain: pulsechain, transport });
  const walletDepositor = createWalletClient({
    account: accountDepositor,
    chain: pulsechain,
    transport,
  });

  const gasApprove = parseGasUnitsEnv('ESCROW_SMOKE_GAS_APPROVE', 120_000);
  const gasAddToPrizePool = parseGasUnitsEnv('ESCROW_SMOKE_GAS_ADD_TO_PRIZE_POOL', 350_000);
  const gasDepositPrizePool = parseGasUnitsEnv('ESCROW_SMOKE_GAS_DEPOSIT_PRIZE_POOL', 350_000);
  const gasPayoutMultiple = parseGasUnitsEnv('ESCROW_SMOKE_GAS_PAYOUT_MULTIPLE', 900_000);

  const txFees = await buildTxFeeOverrides(publicClient);
  if (Object.keys(txFees).length > 0) {
    console.log(
      'Tx fee overrides (wei):',
      Object.fromEntries(Object.entries(txFees).map(([k, v]) => [k, v.toString()])),
      '(env: TX_MAX_PRIORITY_FEE_GWEI, TX_MAX_FEE_PER_GAS_GWEI, TX_FEE_BUMP_MULTIPLIER, TX_HIGH_GAS)',
    );
  }

  const txTimeout = Number(process.env.TX_CONFIRM_TIMEOUT_MS?.trim() || '600000');
  const txPoll = Number(process.env.TX_POLL_INTERVAL_MS?.trim() || '1200');

  /** Pure eth_getTransactionReceipt polling — avoids viem waitForTransactionReceipt block watcher path. */
  async function waitConfirmed(hash) {
    const explorer = `https://scan.pulsechain.com/tx/${hash}`;
    const start = Date.now();
    for (;;) {
      if (Date.now() - start > txTimeout) {
        console.error(`Receipt wait timed out (${txTimeout}ms). Tx may still confirm — check:\n  ${explorer}`);
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
    publicClient.readContract({
      address: tokenAddr,
      abi: erc20Abi,
      functionName: 'symbol',
    }),
    publicClient.readContract({
      address: tokenAddr,
      abi: erc20Abi,
      functionName: 'decimals',
    }),
  ]);

  const totalWei = flowtUnits * 10n ** BigInt(decimals);
  const joinAmounts = splitWeiEvenly(totalWei, 4);
  const poolHalfWeis = splitWeiEvenly(totalWei, 2);

  const balance = await publicClient.readContract({
    address: tokenAddr,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [accountDepositor.address],
  });

  console.log('RPC:', rpc);
  console.log(
    `HTTP: timeout=${rpcTimeoutMs}ms, retries=${rpcRetries} (RPC_HTTP_TIMEOUT_MS / RPC_RETRY_COUNT).`,
  );
  console.log(
    'Gas limits:',
    `approve=${gasApprove} addToPrizePool=${gasAddToPrizePool} depositPrizePool=${gasDepositPrizePool} payoutMultiple=${gasPayoutMultiple} (ESCROW_SMOKE_GAS_*)`,
  );
  console.log(
    'Receipt wait:',
    `timeout=${txTimeout}ms, poll=${txPoll}ms (env: TX_CONFIRM_TIMEOUT_MS / TX_POLL_INTERVAL_MS).`,
  );
  console.log('Escrow:', escrowAddr);
  if (escrowAddr.toLowerCase() === LEGACY_ESCROW_V2.toLowerCase()) {
    console.warn(
      '\nWARNING: Legacy V2 escrow has no addToPrizePool. Use V5:\n' +
        `TOURNAMENT_PRIZE_ESCROW_ADDRESS=${DEFAULT_ESCROW}\n`,
    );
  }
  console.log('Token:', tokenAddr, `(${symbol}, decimals=${decimals})`);
  console.log('Budget:', flowtUnits.toString(), 'whole units =', totalWei.toString(), 'wei');
  if (useDepositSmoke) {
    console.log('Funding mode: depositPrizePool ×2 (half budget per pool):', poolHalfWeis.map((x) => x.toString()).join(', '));
  } else {
    console.log('Funding mode: addToPrizePool ×4:', joinAmounts.map((x) => x.toString()).join(', '));
  }
  console.log('Depositor wallet:', accountDepositor.address);
  console.log('Token balance:', balance.toString());
  console.log('Payout recipients:', payoutRecipients.length, 'from', payoutEnvLabel);

  if (balance < totalWei) {
    console.error(
      [
        `Insufficient ${symbol} at TOKEN_ADDRESS for the depositor wallet.`,
        `  Need: ${totalWei.toString()} wei (${flowtUnits} whole units, ESCROW_TOTAL_FLOWT_UNITS).`,
        `  Have: ${balance.toString()} wei`,
        `  Depositor (from PRIVATE_KEY): ${accountDepositor.address}`,
        `  Token contract: ${tokenAddr}`,
        '',
        'Fix: send that token to the depositor wallet, or set PRIVATE_KEY to the wallet that already holds it,',
        'or lower ESCROW_TOTAL_FLOWT_UNITS (e.g. 1) to match your balance.',
      ].join('\n'),
    );
    process.exit(1);
  }

  if (!pkPayoutRaw) {
    console.error('Set TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY or SETTLEMENT_PRIVATE_KEY for payoutMultiple.');
    process.exit(1);
  }
  const pkPayout = reqPk(pkPayoutRaw, 'TOURNAMENT_PRIZE_ESCROW_AUTHORIZED_KEY / SETTLEMENT_PRIVATE_KEY');
  const accountPayout = privateKeyToAccount(pkPayout);
  const walletPayout = createWalletClient({
    account: accountPayout,
    chain: pulsechain,
    transport,
  });

  const authorizedOnChain = await publicClient.readContract({
    address: escrowAddr,
    abi: escrowAbi,
    functionName: 'authorizedServer',
  });
  console.log('Escrow authorizedServer:', authorizedOnChain);

  if (accountPayout.address.toLowerCase() !== authorizedOnChain.toLowerCase()) {
    console.error(
      'Payout key address does not match authorizedServer.\n' +
        `  Signer: ${accountPayout.address}\n` +
        `  authorizedServer: ${authorizedOnChain}`,
    );
    process.exit(1);
  }
  console.log('Payout signer OK (matches authorizedServer).');

  const curAllowance = await publicClient.readContract({
    address: tokenAddr,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [accountDepositor.address, escrowAddr],
  });
  if (curAllowance < totalWei) {
    const approveNonce = await publicClient.getTransactionCount({
      address: accountDepositor.address,
      blockTag: 'pending',
    });
    console.log('Sending approve…', `(nonce ${approveNonce})`);
    const approveHash = await walletDepositor.writeContract({
      address: tokenAddr,
      abi: erc20Abi,
      functionName: 'approve',
      args: [escrowAddr, totalWei],
      gas: gasApprove,
      nonce: approveNonce,
      ...txFees,
    });
    console.log('  submitted', approveHash);
    await waitConfirmed(approveHash);
    console.log('  approve tx:', approveHash);
  } else {
    console.log('Allowance already sufficient.');
  }

  if (!useDepositSmoke) {
    const probeTid = /** @type {`0x${string}`} */ (`0x${crypto.randomBytes(32).toString('hex')}`);
    try {
      await publicClient.simulateContract({
        address: escrowAddr,
        abi: escrowAbi,
        functionName: 'addToPrizePool',
        args: [probeTid, tokenAddr, 1n],
        account: accountDepositor.address,
      });
    } catch {
      console.error(
        [
          'Preflight failed: addToPrizePool(bytes32, token, 1 wei) reverts on this escrow.',
          'depositPrizePool usually still works — bytecode may not match repo TournamentPrizeEscrowV5 (mis-deploy).',
          'Redeploy from contracts/contracts/TournamentPrizeEscrowV5.sol and update TOURNAMENT_PRIZE_ESCROW_ADDRESS.',
          '',
          'Workaround (tests payouts only; not PRC-20 multi-join buy-ins):',
          '  ESCROW_SMOKE_USE_DEPOSIT_PRIZE_POOL=1 node scripts/pulsechain-leflowt-two-tournaments-escrow-smoke.mjs',
        ].join('\n'),
      );
      process.exit(1);
    }
  } else {
    console.log(
      'ESCROW_SMOKE_USE_DEPOSIT_PRIZE_POOL=1 — using depositPrizePool only (addToPrizePool not invoked).',
    );
  }

  const pools = [];
  let joinIdx = 0;

  for (let n = 1; n <= 2; n++) {
    const tournamentUuid = crypto.randomUUID();
    const idBytes32 = tournamentIdToBytes32(tournamentUuid);
    console.log(`\n--- Pool ${n} ---`);
    console.log('  tournament UUID:', tournamentUuid);
    console.log('  bytes32 id:', idBytes32);

    const joins = [];

    if (useDepositSmoke) {
      const amt = poolHalfWeis[n - 1];
      const depNonce = await publicClient.getTransactionCount({
        address: accountDepositor.address,
        blockTag: 'pending',
      });
      console.log(`  depositPrizePool (${amt.toString()} wei)…`, `(nonce ${depNonce})`);
      const hash = await walletDepositor.writeContract({
        address: escrowAddr,
        abi: escrowAbi,
        functionName: 'depositPrizePool',
        args: [idBytes32, tokenAddr, amt],
        gas: gasDepositPrizePool,
        nonce: depNonce,
        ...txFees,
      });
      console.log('    submitted', hash);
      const receipt = await waitConfirmed(hash);
      console.log(`    confirmed tx ${hash} (status ${receipt.status})`);
      joins.push(hash);
    } else {
      for (let j = 1; j <= 2; j++) {
        const amt = joinAmounts[joinIdx++];
        const joinNonce = await publicClient.getTransactionCount({
          address: accountDepositor.address,
          blockTag: 'pending',
        });
        console.log(`  addToPrizePool (join ${j}, ${amt.toString()} wei)…`, `(nonce ${joinNonce})`);
        const hash = await walletDepositor.writeContract({
          address: escrowAddr,
          abi: escrowAbi,
          functionName: 'addToPrizePool',
          args: [idBytes32, tokenAddr, amt],
          gas: gasAddToPrizePool,
          nonce: joinNonce,
          ...txFees,
        });
        console.log('    submitted', hash);
        const receipt = await waitConfirmed(hash);
        console.log(`    confirmed tx ${hash} (status ${receipt.status})`);
        joins.push(hash);
      }
    }

    const pool = await publicClient.readContract({
      address: escrowAddr,
      abi: escrowAbi,
      functionName: 'getPool',
      args: [idBytes32],
    });
    const totalDeposited = pool[2];
    console.log('  totalDeposited (wei):', totalDeposited.toString());

    pools.push({
      label: n,
      tournamentUuid,
      idBytes32,
      joinTxHashes: joins,
      totalDeposited,
      fundingMode: useDepositSmoke ? 'depositPrizePool' : 'addToPrizePool',
    });
  }

  console.log('\n--- Payouts (payoutMultiple → BOT_WALLETS split per pool) ---');
  for (const p of pools) {
    const fresh = await publicClient.readContract({
      address: escrowAddr,
      abi: escrowAbi,
      functionName: 'getPool',
      args: [p.idBytes32],
    });
    const total = fresh[2];
    const paid = fresh[3];
    const remaining = total - paid;
    console.log(`\nPool ${p.label} remaining wei:`, remaining.toString());
    if (remaining <= 0n) {
      console.log('  skip (nothing to pay)');
      continue;
    }

    const shareWei = splitWeiEvenly(remaining, payoutRecipients.length);
    const { winners, amounts } = zipNonZeroWinners(payoutRecipients, shareWei);
    if (winners.length === 0) {
      console.error('No non-zero payout slices (check BOT_WALLETS).');
      process.exit(1);
    }

    const payNonce = await publicClient.getTransactionCount({
      address: accountPayout.address,
      blockTag: 'pending',
    });
    console.log(`  payoutMultiple (${winners.length} winners)…`, `(nonce ${payNonce})`);
    const hash = await walletPayout.writeContract({
      address: escrowAddr,
      abi: escrowAbi,
      functionName: 'payoutMultiple',
      args: [p.idBytes32, winners, amounts],
      gas: gasPayoutMultiple,
      nonce: payNonce,
      ...txFees,
    });
    console.log('  submitted', hash);
    const receipt = await waitConfirmed(hash);
    console.log(`  payoutMultiple confirmed ${hash} (status ${receipt.status})`);
    let idx = 0;
    for (const w of winners) {
      console.log(`    → ${w} : ${amounts[idx++].toString()} wei`);
    }
    p.payoutTxHash = hash;
    p.payoutWinners = winners;
    p.payoutAmountsWei = amounts.map((x) => x.toString());
  }

  console.log('\nSummary:', JSON.stringify(pools, replacer, 2));
}

function replacer(_, value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value) && value.length && typeof value[0] === 'bigint') {
    return value.map((x) => x.toString());
  }
  return value;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
