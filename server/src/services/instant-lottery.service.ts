/**
 * Instant Lottery 6-of-55: provably-fair server-side play (MORBIUS only).
 * Generates winning numbers via ProvablyFairService, stores for verification, calls contract resolvePlay as operator.
 */

import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { pulsechain } from 'viem/chains';
import { getPublicClient } from '../utils/chain-client';
import { logger } from '../utils/logger';
import type { DatabaseService } from './database.service';
import { ProvablyFairService } from './provably-fair.service';
import { instantLotteryAbi } from '../abi/instant-lottery';
import { LOTTERY_INSTANT_ADDRESS } from '../config/contracts';

const BPS_DENOMINATOR = 10000;
// Match contract: 0->0, 1->0.5x (5000 bps), 2->1.5x, 3->5x, 4->15x, 5->50x, 6->100x
const MULTIPLIERS_BPS = [0, 5000, 15000, 50000, 150000, 500000, 1000000] as const;
const DISTRIBUTION_FEE_BPS = 125;
const BURN_FEE_BPS = 50;
const PLATFORM_FEE_BPS = 175;
const LP_FEE_BPS = 150;

const MIN_NUMBER = 1;
const MAX_NUMBER = 55;
const NUMBERS_PER_TICKET = 6;

const OPERATOR_KEY = (
  process.env.LOTTERY_OPERATOR_PRIVATE_KEY || process.env.SETTLEMENT_PRIVATE_KEY
) as `0x${string}` | undefined;

let walletClient: ReturnType<typeof createWalletClient> | null = null;

function getOperatorWallet() {
  if (!OPERATOR_KEY) {
    throw new Error('LOTTERY_OPERATOR_PRIVATE_KEY or SETTLEMENT_PRIVATE_KEY not set');
  }
  if (!walletClient) {
    const account = privateKeyToAccount(OPERATOR_KEY);
    walletClient = createWalletClient({
      account,
      chain: pulsechain,
      transport: http(process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com'),
    });
  }
  return walletClient;
}

function isValidAddress(addr: unknown): addr is `0x${string}` {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function validateNumbers(numbers: unknown): numbers is [number, number, number, number, number, number] {
  if (!Array.isArray(numbers) || numbers.length !== NUMBERS_PER_TICKET) return false;
  const set = new Set<number>();
  for (const n of numbers) {
    const v = Number(n);
    if (!Number.isInteger(v) || v < MIN_NUMBER || v > MAX_NUMBER || set.has(v)) return false;
    set.add(v);
  }
  return true;
}

function countMatches(
  playerNumbers: [number, number, number, number, number, number],
  winningNumbers: [number, number, number, number, number, number]
): number {
  const p = [...playerNumbers].sort((a, b) => a - b);
  const w = [...winningNumbers].sort((a, b) => a - b);
  let matches = 0;
  let wi = 0;
  for (let ti = 0; ti < NUMBERS_PER_TICKET && wi < NUMBERS_PER_TICKET; ti++) {
    while (wi < NUMBERS_PER_TICKET && w[wi] < p[ti]) wi++;
    if (wi < NUMBERS_PER_TICKET && w[wi] === p[ti]) {
      matches++;
      wi++;
    }
  }
  return matches;
}

/** Fee on wager only (5%, 4-way). Returns net wager (95%) for payout calculation. */
function computeNetWager(wager: bigint): bigint {
  const feeDist = (wager * BigInt(DISTRIBUTION_FEE_BPS)) / BigInt(BPS_DENOMINATOR);
  const feeBurn = (wager * BigInt(BURN_FEE_BPS)) / BigInt(BPS_DENOMINATOR);
  const feePlatform = (wager * BigInt(PLATFORM_FEE_BPS)) / BigInt(BPS_DENOMINATOR);
  const feeLp = (wager * BigInt(LP_FEE_BPS)) / BigInt(BPS_DENOMINATOR);
  return wager - feeDist - feeBurn - feePlatform - feeLp;
}

export interface InstantLotteryPlayInput {
  address: string;
  numbers: unknown;
  wager: string;
  clientSeed?: string;
}

export interface InstantLotteryPlayResult {
  winningNumbers: number[];
  matchCount: number;
  grossPayout: string;
  netPayout: string;
  txHash: string;
  serverSeedHash: string;
  nonce: string;
}

export class InstantLotteryService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly provablyFairService: ProvablyFairService
  ) {}

  isConfigured(): boolean {
    const address = (LOTTERY_INSTANT_ADDRESS || '').trim();
    if (!address || address === '0x0000000000000000000000000000000000000000') return false;
    return Boolean(OPERATOR_KEY);
  }

  async play(input: InstantLotteryPlayInput): Promise<InstantLotteryPlayResult> {
    const address = (input.address || '').trim();
    if (!isValidAddress(address)) {
      throw new Error('Valid wallet address required (0x + 40 hex)');
    }

    if (!validateNumbers(input.numbers)) {
      throw new Error('numbers must be 6 distinct integers between 1 and 55');
    }

    let wagerBigInt: bigint;
    try {
      wagerBigInt = BigInt(input.wager);
    } catch {
      throw new Error('Invalid wager: must be a valid integer string');
    }
    if (wagerBigInt <= 0n) throw new Error('Wager must be positive');

    const client = getPublicClient();
    const contractAddress = LOTTERY_INSTANT_ADDRESS as `0x${string}`;
    const [minWager, maxWager] = (await client.readContract({
      address: contractAddress,
      abi: instantLotteryAbi,
      functionName: 'getWagerLimits',
    })) as [bigint, bigint];

    if (wagerBigInt < minWager || wagerBigInt > maxWager) {
      throw new Error(`Wager must be between ${minWager.toString()} and ${maxWager.toString()}`);
    }

    const playerNumbers: [number, number, number, number, number, number] = [
      Number((input.numbers as number[])[0]),
      Number((input.numbers as number[])[1]),
      Number((input.numbers as number[])[2]),
      Number((input.numbers as number[])[3]),
      Number((input.numbers as number[])[4]),
      Number((input.numbers as number[])[5]),
    ];

    const clientSeed = (input.clientSeed ?? 'default').slice(0, 255);
    const serverSeed = this.provablyFairService.generateServerSeed();
    const serverSeedHash = this.provablyFairService.createServerSeedHash(serverSeed);
    const nonce = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
    const nonceForDraw = Number(nonce); // Same value for verification; must fit JS safe integer

    const winningNumbers = this.provablyFairService.generate6of55WinningNumbers(
      serverSeed,
      clientSeed,
      nonceForDraw
    );

    const matchCount = countMatches(playerNumbers, winningNumbers);
    const multiplierBps = MULTIPLIERS_BPS[Math.min(matchCount, 6)];
    const netWager = computeNetWager(wagerBigInt);
    const grossPayout = (netWager * BigInt(multiplierBps)) / BigInt(BPS_DENOMINATOR);
    const netPayout = grossPayout; // no fee on payout

    const pfId = await this.dbService.insertInstantLotteryPlayPF({
      walletAddress: address,
      wager: wagerBigInt,
      playerNumbers: [...playerNumbers],
      winningNumbers: [...winningNumbers],
      matchCount,
      grossPayout,
      netPayout,
      serverSeedHash,
      clientSeed,
      nonce,
    });

    const wallet = getOperatorWallet();
    const winningNumbersTuple: [number, number, number, number, number, number] = [
      winningNumbers[0],
      winningNumbers[1],
      winningNumbers[2],
      winningNumbers[3],
      winningNumbers[4],
      winningNumbers[5],
    ];

    const hash = await wallet.writeContract({
      account: wallet.account!,
      chain: pulsechain,
      address: contractAddress,
      abi: instantLotteryAbi,
      functionName: 'resolvePlay',
      args: [address, playerNumbers, wagerBigInt, winningNumbersTuple, nonce],
    });

    const publicClient = getPublicClient();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      logger.error('Instant lottery resolvePlay tx reverted', { hash, address });
      throw new Error('Transaction failed');
    }

    await this.dbService.updateInstantLotteryPlayPFTxHash(pfId, hash.toLowerCase());
    await this.dbService.updateInstantLotteryPlayPFReveal(pfId, serverSeed);

    return {
      winningNumbers: [...winningNumbers],
      matchCount,
      grossPayout: grossPayout.toString(),
      netPayout: netPayout.toString(),
      txHash: hash,
      serverSeedHash,
      nonce: nonce.toString(),
    };
  }
}
