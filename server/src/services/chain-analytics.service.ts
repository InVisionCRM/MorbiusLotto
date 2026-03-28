import { parseAbiItem } from 'viem';
import { getPublicClient } from '../utils/chain-client';
import type { DatabaseService } from './database.service';
import {
  PLINKO_ADDRESS,
  KENO_ADDRESS,
  LOTTERY_INSTANT_ADDRESS,
  BIGWHEEL_ADDRESS,
  BLACKJACK_ADDRESS,
  PLINKO_GET_GLOBAL_STATS_ABI,
  KENO_GET_GLOBAL_STATS_ABI,
  KENO_GET_CONTRACT_RESERVE_ABI,
  LOTTERY_STATS_ABI,
  INSTANT_LOTTERY_STATS_ABI,
  BIGWHEEL_GET_GLOBAL_STATS_ABI,
  BLACKJACK_STATS_ABI,
} from '../config/contracts';

const DEPOSIT_EVENT = parseAbiItem('event Deposit(address indexed player, uint256 morbiusAmount, uint256 plsAmount)');
const DEPOSIT_MORBIUS_EVENT = parseAbiItem('event DepositMORBIUS(address indexed player, uint256 amount)');
const WITHDRAWAL_EVENT = parseAbiItem('event Withdrawal(address indexed player, uint256 amount)');
const INSTANT_LOTTERY_RESULT_EVENT = parseAbiItem(
  'event InstantLotteryResult(address indexed player, uint8[6] playerNumbers, uint8[6] winningNumbers, uint8 matchCount, uint256 wager, uint256 grossPayout, uint256 netPayout)'
);
const PLINKO_BALL_DROPPED_EVENT = parseAbiItem(
  'event BallDropped(address indexed player, uint256 seed, uint8 bucket, uint256 multiplier, uint256 payout, uint8 riskLevel)'
);
const CHUNK_SIZE = 50000;
const PLINKO_SCAN_START_BLOCK = BigInt(process.env.PLINKO_SCAN_START_BLOCK || '0');
const PLINKO_MAX_SCAN_CHUNKS = Number(process.env.PLINKO_MAX_SCAN_CHUNKS || 400);

const PLINKO_RISK_NAMES: Record<number, 'GREEN' | 'YELLOW' | 'RED'> = {
  0: 'GREEN',
  1: 'YELLOW',
  2: 'RED',
};

/** viem log args are untyped; narrow before BigInt() (strict TS rejects unknown). */
function abiUintToBigInt(v: unknown): bigint {
  if (v == null) return 0n;
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v));
  if (typeof v === 'string') {
    try {
      return BigInt(v);
    } catch {
      return 0n;
    }
  }
  if (typeof v === 'boolean') return v ? 1n : 0n;
  return 0n;
}

export interface PlinkoChainStats {
  totalDrops: bigint;
  totalBallsSold: bigint;
  totalRevenue: bigint;
  totalPayouts: bigint;
  contractReserve: bigint;
  minWagerPerBall?: bigint;
  maxWagerPerBall?: bigint;
}

export interface PlinkoPlayerDropChain {
  id: string;
  player: string;
  seed: string;
  bucketIndex: number;
  multiplierBps: string;
  payout: string;
  wager: string;
  profit: string;
  riskLevel: 'GREEN' | 'YELLOW' | 'RED';
  blockNumber: string;
  transactionHash: string;
  timestamp: number;
}

export interface PlinkoPlayerStatsChain {
  totalDrops: number;
  totalWagered: string;
  totalWon: string;
  netProfit: string;
  biggestWin: string;
  biggestMultiplierBps: string;
  winRate: number;
}

export interface KenoChainStats {
  totalWagered: bigint;
  totalWon: bigint;
  ticketCount: bigint;
  activeRoundId: bigint;
  feeBps?: bigint;
  burnThreshold?: bigint;
  currentRoundPoolBalance?: bigint;
}

export interface LotteryChainStats {
  totalTicketsEver: bigint;
  totalCollected: bigint;
  totalClaimed: bigint;
}

export interface BigWheelChainStats {
  spins: bigint;
  volume: bigint;
  payouts: bigint;
  contractBalance: bigint;
  contractReserveBalance: bigint;
}

export class ChainAnalyticsService {
  constructor(private readonly dbService: DatabaseService) {}

  async getPlinkoPlayerDrops(playerAddress: string, limit: number = 100, offset: number = 0): Promise<PlinkoPlayerDropChain[]> {
    const normalized = playerAddress.toLowerCase() as `0x${string}`;
    const client = getPublicClient();
    const toBlock = await client.getBlockNumber();

    const targetCount = Math.max(0, limit) + Math.max(0, offset);
    const logs: Array<{
      args: any;
      blockNumber: bigint;
      transactionHash: `0x${string}`;
      logIndex: number;
    }> = [];

    let chunksScanned = 0;
    let cursor = toBlock;
    while (cursor >= PLINKO_SCAN_START_BLOCK && logs.length < targetCount && chunksScanned < PLINKO_MAX_SCAN_CHUNKS) {
      const fromBlock = cursor > BigInt(CHUNK_SIZE) ? cursor - BigInt(CHUNK_SIZE) + 1n : 0n;
      const boundedFrom = fromBlock < PLINKO_SCAN_START_BLOCK ? PLINKO_SCAN_START_BLOCK : fromBlock;

      const chunkLogs = await client.getLogs({
        address: PLINKO_ADDRESS,
        event: PLINKO_BALL_DROPPED_EVENT,
        args: { player: normalized },
        fromBlock: boundedFrom,
        toBlock: cursor,
      });

      logs.push(
        ...chunkLogs.map((l: any) => ({
          args: l.args,
          blockNumber: l.blockNumber as bigint,
          transactionHash: l.transactionHash as `0x${string}`,
          logIndex: Number(l.logIndex ?? 0),
        }))
      );

      if (boundedFrom === 0n || boundedFrom === PLINKO_SCAN_START_BLOCK) break;
      cursor = boundedFrom - 1n;
      chunksScanned += 1;
    }

    logs.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber > b.blockNumber ? -1 : 1;
      return b.logIndex - a.logIndex;
    });

    const sliced = logs.slice(offset, offset + limit);
    const uniqueBlocks = [...new Set(sliced.map((l) => String(l.blockNumber)))];
    const blockEntries = await Promise.all(
      uniqueBlocks.map(async (bn) => {
        const block = await client.getBlock({ blockNumber: BigInt(bn) });
        return [bn, Number(block.timestamp)] as const;
      })
    );
    const blockToTs = Object.fromEntries(blockEntries);

    return sliced.map((log) => {
      const args = log.args as Record<string, unknown>;
      const multiplier = abiUintToBigInt(args.multiplier);
      const payout = abiUintToBigInt(args.payout);
      const wager = multiplier > 0n ? (payout * 100n) / multiplier : 0n;
      const riskLevelNum = Number(args.riskLevel ?? 0);
      return {
        id: `${log.transactionHash}-${log.logIndex}`,
        player: String(args.player ?? normalized),
        seed: String(args.seed ?? '0'),
        bucketIndex: Number(args.bucket ?? 0),
        multiplierBps: String(multiplier),
        payout: String(payout),
        wager: String(wager),
        profit: String(payout - wager),
        riskLevel: PLINKO_RISK_NAMES[riskLevelNum] ?? 'GREEN',
        blockNumber: String(log.blockNumber),
        transactionHash: log.transactionHash,
        timestamp: blockToTs[String(log.blockNumber)] ?? 0,
      };
    });
  }

  async getPlinkoPlayerStats(playerAddress: string): Promise<PlinkoPlayerStatsChain> {
    const drops = await this.getPlinkoPlayerDrops(playerAddress, 5000, 0);
    let totalWagered = 0n;
    let totalWon = 0n;
    let biggestWin = 0n;
    let biggestMultiplier = 0n;
    let winningDrops = 0;

    for (const d of drops) {
      const wager = BigInt(d.wager);
      const payout = BigInt(d.payout);
      const profit = BigInt(d.profit);
      const multiplier = BigInt(d.multiplierBps);
      totalWagered += wager;
      totalWon += payout;
      if (profit > 0n) winningDrops += 1;
      if (payout > biggestWin) biggestWin = payout;
      if (multiplier > biggestMultiplier) biggestMultiplier = multiplier;
    }

    return {
      totalDrops: drops.length,
      totalWagered: String(totalWagered),
      totalWon: String(totalWon),
      netProfit: String(totalWon - totalWagered),
      biggestWin: String(biggestWin),
      biggestMultiplierBps: String(biggestMultiplier),
      winRate: drops.length > 0 ? (winningDrops / drops.length) * 100 : 0,
    };
  }

  async getPlinkoStats(): Promise<PlinkoChainStats | null> {
    try {
      const client = getPublicClient();
      const [globalStats, wagerLimits] = await Promise.all([
        client.readContract({
          address: PLINKO_ADDRESS,
          abi: PLINKO_GET_GLOBAL_STATS_ABI,
          functionName: 'getGlobalStats',
        }) as Promise<[bigint, bigint, bigint, bigint, bigint]>,
        client.readContract({
          address: PLINKO_ADDRESS,
          abi: PLINKO_GET_GLOBAL_STATS_ABI,
          functionName: 'getWagerLimits',
        }).catch(() => null) as Promise<{ min: bigint; max: bigint } | null>,
      ]);
      
      return {
        totalDrops: globalStats[0],
        totalBallsSold: globalStats[1],
        totalRevenue: globalStats[2],
        totalPayouts: globalStats[3],
        contractReserve: globalStats[4],
        minWagerPerBall: wagerLimits?.min,
        maxWagerPerBall: wagerLimits?.max,
      };
    } catch (err) {
      console.error('ChainAnalyticsService getPlinkoStats:', err);
      return null;
    }
  }

  async getKenoStats(): Promise<KenoChainStats | null> {
    try {
      const client = getPublicClient();
      const [globalStats, currentRoundId, feeBps, burnThreshold] = await Promise.all([
        client.readContract({
          address: KENO_ADDRESS,
          abi: KENO_GET_GLOBAL_STATS_ABI,
          functionName: 'getGlobalStats',
        }) as Promise<[bigint, bigint, bigint, bigint]>,
        client.readContract({
          address: KENO_ADDRESS,
          abi: KENO_GET_GLOBAL_STATS_ABI,
          functionName: 'currentRoundId',
        }).catch(() => null) as Promise<bigint | null>,
        client.readContract({
          address: KENO_ADDRESS,
          abi: KENO_GET_GLOBAL_STATS_ABI,
          functionName: 'feeBps',
        }).catch(() => null) as Promise<bigint | null>,
        client.readContract({
          address: KENO_ADDRESS,
          abi: KENO_GET_GLOBAL_STATS_ABI,
          functionName: 'burnThreshold',
        }).catch(() => null) as Promise<bigint | null>,
      ]);

      // Get current round pool balance if round exists
      let currentRoundPoolBalance: bigint | undefined;
      if (currentRoundId !== null && currentRoundId > 0n) {
        try {
          const round = await client.readContract({
            address: KENO_ADDRESS,
            abi: KENO_GET_GLOBAL_STATS_ABI,
            functionName: 'getRound',
            args: [currentRoundId],
          }) as any;
          currentRoundPoolBalance = round?.poolBalance;
        } catch {
          // Round might not exist or be finalized yet
        }
      }

      return {
        totalWagered: globalStats[0],
        totalWon: globalStats[1],
        ticketCount: globalStats[2],
        activeRoundId: globalStats[3],
        feeBps: feeBps ?? undefined,
        burnThreshold: burnThreshold ?? undefined,
        currentRoundPoolBalance,
      };
    } catch (err) {
      console.error('ChainAnalyticsService getKenoStats:', err);
      return null;
    }
  }

  async getLotteryStats(): Promise<LotteryChainStats | null> {
    const client = getPublicClient();
    const useInstant = LOTTERY_INSTANT_ADDRESS && LOTTERY_INSTANT_ADDRESS !== '0x0000000000000000000000000000000000000000';
    if (useInstant) {
      try {
        const [totalPlays, totalWagered, totalPayouts] = await Promise.all([
          client.readContract({ address: LOTTERY_INSTANT_ADDRESS, abi: INSTANT_LOTTERY_STATS_ABI, functionName: 'totalPlays' }) as Promise<bigint>,
          client.readContract({ address: LOTTERY_INSTANT_ADDRESS, abi: INSTANT_LOTTERY_STATS_ABI, functionName: 'totalWagered' }) as Promise<bigint>,
          client.readContract({ address: LOTTERY_INSTANT_ADDRESS, abi: INSTANT_LOTTERY_STATS_ABI, functionName: 'totalPayouts' }) as Promise<bigint>,
        ]);
        return { totalTicketsEver: totalPlays, totalCollected: totalWagered, totalClaimed: totalPayouts };
      } catch (err) {
        console.error('ChainAnalyticsService getLotteryStats (instant):', err);
        return null;
      }
    }
    const read = async (fn: 'totalTicketsEver' | 'totalMORBIUSEverCollected' | 'totalMORBIUSEverClaimed'): Promise<bigint> => {
      try {
        const result = await client.readContract({ address: LOTTERY_INSTANT_ADDRESS, abi: LOTTERY_STATS_ABI, functionName: fn });
        return result as bigint;
      } catch {
        return 0n;
      }
    };
    const [totalTicketsEver, totalCollected, totalClaimed] = await Promise.all([
      read('totalTicketsEver'),
      read('totalMORBIUSEverCollected'),
      read('totalMORBIUSEverClaimed'),
    ]);
    return { totalTicketsEver, totalCollected, totalClaimed };
  }

  async getBigWheelStats(): Promise<BigWheelChainStats | null> {
    try {
      const client = getPublicClient();
      const result = await client.readContract({
        address: BIGWHEEL_ADDRESS,
        abi: BIGWHEEL_GET_GLOBAL_STATS_ABI,
        functionName: 'getGlobalStats',
      });
      return {
        spins: result[0],
        volume: result[1],
        payouts: result[2],
        contractBalance: result[3],
        contractReserveBalance: result[4],
      };
    } catch (err) {
      console.error('ChainAnalyticsService getBigWheelStats:', err);
      return null;
    }
  }

  /**
   * All-time total MORBIUS deposited and withdrawn for Blackjack V2.
   * Derived from our own data: total_withdrawn is updated when we create a pending withdrawal;
   * total_deposited is updated by incremental chain scan (from last_scanned_block to current).
   * On first run or if no last_scanned_block, runs a full chain scan and persists to DB.
   */
  async getBlackjackDepositWithdrawTotals(): Promise<{ totalDeposited: bigint; totalWithdrawn: bigint }> {
    const client = getPublicClient();
    const stored = await this.dbService.getBlackjackPlatformTotals();

    /** Fire-and-forget: log individual deposit events to player_deposits table. Never throws. */
    const logDepositEvents = async (logs: Array<{ args: any; transactionHash: string | null; blockNumber: bigint | null; }>, amountField: 'morbiusAmount' | 'amount') => {
      for (const log of logs) {
        try {
          const player: string | undefined = log.args?.player;
          const amount: bigint | undefined = log.args?.[amountField];
          const txHash: string | null = log.transactionHash;
          const blockNumber: bigint | null = log.blockNumber;
          if (!player || !amount || !txHash || blockNumber == null) continue;
          await this.dbService.logDeposit(player, amount, txHash, blockNumber);
        } catch {
          // Non-fatal — ON CONFLICT handles duplicates; swallow other errors
        }
      }
    };

    const runFullScan = async (): Promise<{ totalDeposited: bigint; totalWithdrawn: bigint; toBlock: bigint }> => {
      let totalDeposited = 0n;
      let totalWithdrawn = 0n;
      const toBlock = await client.getBlockNumber();
      let fromBlock = 0n;
      while (fromBlock <= toBlock) {
        const end = fromBlock + BigInt(CHUNK_SIZE) > toBlock ? toBlock : fromBlock + BigInt(CHUNK_SIZE);
        const [depositLogs, depositMorbiusLogs, withdrawalLogs] = await Promise.all([
          client.getLogs({ address: BLACKJACK_ADDRESS, event: DEPOSIT_EVENT, fromBlock, toBlock: end }),
          client.getLogs({ address: BLACKJACK_ADDRESS, event: DEPOSIT_MORBIUS_EVENT, fromBlock, toBlock: end }),
          client.getLogs({ address: BLACKJACK_ADDRESS, event: WITHDRAWAL_EVENT, fromBlock, toBlock: end }),
        ]);
        for (const log of depositLogs) {
          if (log.args && 'morbiusAmount' in log.args) totalDeposited += (log.args as { morbiusAmount: bigint }).morbiusAmount;
        }
        for (const log of depositMorbiusLogs) {
          if (log.args && 'amount' in log.args) totalDeposited += (log.args as { amount: bigint }).amount;
        }
        for (const log of withdrawalLogs) {
          if (log.args && 'amount' in log.args) totalWithdrawn += (log.args as { amount: bigint }).amount;
        }
        // Log per-wallet deposits (best-effort; errors are swallowed)
        await logDepositEvents(depositLogs as any, 'morbiusAmount');
        await logDepositEvents(depositMorbiusLogs as any, 'amount');
        fromBlock = end + 1n;
        if (fromBlock > toBlock) break;
      }
      return { totalDeposited, totalWithdrawn, toBlock };
    };

    try {
      if (!stored) {
        const { totalDeposited, totalWithdrawn } = await runFullScan();
        return { totalDeposited, totalWithdrawn };
      }

      if (stored.lastScannedBlock == null) {
        const { totalDeposited, totalWithdrawn, toBlock } = await runFullScan();
        await this.dbService.updateBlackjackPlatformTotals(totalDeposited, totalWithdrawn, toBlock);
        return { totalDeposited, totalWithdrawn };
      }

      const toBlock = await client.getBlockNumber();
      if (toBlock <= stored.lastScannedBlock) {
        return { totalDeposited: stored.totalDeposited, totalWithdrawn: stored.totalWithdrawn };
      }

      let fromBlock = stored.lastScannedBlock + 1n;
      let newDeposited = 0n;
      while (fromBlock <= toBlock) {
        const end = fromBlock + BigInt(CHUNK_SIZE) > toBlock ? toBlock : fromBlock + BigInt(CHUNK_SIZE);
        const [depositLogs, depositMorbiusLogs] = await Promise.all([
          client.getLogs({ address: BLACKJACK_ADDRESS, event: DEPOSIT_EVENT, fromBlock, toBlock: end }),
          client.getLogs({ address: BLACKJACK_ADDRESS, event: DEPOSIT_MORBIUS_EVENT, fromBlock, toBlock: end }),
        ]);
        for (const log of depositLogs) {
          if (log.args && 'morbiusAmount' in log.args) newDeposited += (log.args as { morbiusAmount: bigint }).morbiusAmount;
        }
        for (const log of depositMorbiusLogs) {
          if (log.args && 'amount' in log.args) newDeposited += (log.args as { amount: bigint }).amount;
        }
        // Log per-wallet deposits (best-effort; ON CONFLICT handles duplicates)
        await logDepositEvents(depositLogs as any, 'morbiusAmount');
        await logDepositEvents(depositMorbiusLogs as any, 'amount');
        fromBlock = end + 1n;
        if (fromBlock > toBlock) break;
      }

      const totalDeposited = stored.totalDeposited + newDeposited;
      const totalWithdrawn = stored.totalWithdrawn;
      await this.dbService.updateBlackjackPlatformTotals(totalDeposited, totalWithdrawn, toBlock);
      return { totalDeposited, totalWithdrawn };
    } catch (err) {
      console.error('ChainAnalyticsService getBlackjackDepositWithdrawTotals:', err);
      if (stored) {
        return { totalDeposited: stored.totalDeposited, totalWithdrawn: stored.totalWithdrawn };
      }
      return { totalDeposited: 0n, totalWithdrawn: 0n };
    }
  }

  /**
   * Index InstantLotteryResult events into instant_lottery_plays for leaderboard and player stats.
   * Incremental from last_scanned_block; full scan if none. Skips when LOTTERY_INSTANT_ADDRESS is not set.
   */
  async indexInstantLotteryResults(): Promise<{ indexed: number; lastBlock: bigint | null }> {
    const address = LOTTERY_INSTANT_ADDRESS?.trim();
    if (!address || address === '0x0000000000000000000000000000000000000000') {
      return { indexed: 0, lastBlock: null };
    }
    const client = getPublicClient();
    const stored = await this.dbService.getInstantLotteryScanState();
    const toBlock = await client.getBlockNumber();
    let fromBlock: bigint;
    if (!stored || stored.lastScannedBlock == null) {
      fromBlock = toBlock > BigInt(CHUNK_SIZE) ? toBlock - BigInt(CHUNK_SIZE) : 0n;
    } else {
      if (toBlock <= stored.lastScannedBlock) return { indexed: 0, lastBlock: stored.lastScannedBlock };
      fromBlock = stored.lastScannedBlock + 1n;
    }
    let indexed = 0;
    while (fromBlock <= toBlock) {
      const end = fromBlock + BigInt(CHUNK_SIZE) > toBlock ? toBlock : fromBlock + BigInt(CHUNK_SIZE);
      const logs = await client.getLogs({
        address: address as `0x${string}`,
        event: INSTANT_LOTTERY_RESULT_EVENT,
        fromBlock,
        toBlock: end,
      });
      for (const log of logs) {
        try {
          const args = log.args as { player?: string; wager?: bigint; grossPayout?: bigint; netPayout?: bigint };
          const player = args?.player;
          const wager = args?.wager ?? 0n;
          const grossPayout = args?.grossPayout ?? 0n;
          const netPayout = args?.netPayout ?? 0n;
          const txHash = log.transactionHash ?? '';
          const blockNumber = log.blockNumber ?? null;
          if (!player || !txHash) continue;
          await this.dbService.logInstantLotteryPlay(player, wager, grossPayout, netPayout, blockNumber, txHash);
          indexed += 1;
        } catch {
          // non-fatal
        }
      }
      fromBlock = end + 1n;
      if (fromBlock > toBlock) break;
    }
    const lastBlock = fromBlock > 0n ? fromBlock - 1n : toBlock;
    await this.dbService.updateInstantLotteryScanState(lastBlock);
    return { indexed, lastBlock };
  }

  /** Fetch all on-chain game stats in parallel. */
  async getAllChainStats(): Promise<{
    plinko: PlinkoChainStats | null;
    keno: KenoChainStats | null;
    lottery: LotteryChainStats | null;
    bigWheel: BigWheelChainStats | null;
  }> {
    const [plinko, keno, lottery, bigWheel] = await Promise.all([
      this.getPlinkoStats(),
      this.getKenoStats(),
      this.getLotteryStats(),
      this.getBigWheelStats(),
    ]);
    return { plinko, keno, lottery, bigWheel };
  }

  /**
   * Read cumulative on-chain stats for all tracked games and upsert today's snapshot row.
   * Called hourly. Returns the number of games successfully snapshotted.
   */
  async takeAndSaveDailySnapshots(): Promise<number> {
    const client = getPublicClient();
    let saved = 0;

    // ── Plinko ──────────────────────────────────────────────────────────────
    try {
      const plinko = await this.getPlinkoStats();
      if (plinko) {
        const wagered = plinko.totalRevenue + plinko.totalPayouts;
        await this.dbService.saveContractDailySnapshot('plinko', wagered, plinko.totalPayouts, plinko.contractReserve);
        await this.dbService.saveContractHourlySnapshot('plinko', wagered, plinko.totalPayouts, plinko.contractReserve);
        saved++;
      }
    } catch (err) {
      console.error('takeAndSaveDailySnapshots plinko:', err);
    }

    // ── Keno ────────────────────────────────────────────────────────────────
    try {
      const [kenoStats, kenoReserve] = await Promise.all([
        this.getKenoStats(),
        client.readContract({
          address: KENO_ADDRESS,
          abi: KENO_GET_CONTRACT_RESERVE_ABI,
          functionName: 'getContractReserve',
        }).catch(() => null) as Promise<bigint | null>,
      ]);
      if (kenoStats) {
        const reserve = kenoReserve ?? 0n;
        await this.dbService.saveContractDailySnapshot('keno', kenoStats.totalWagered, kenoStats.totalWon, reserve);
        await this.dbService.saveContractHourlySnapshot('keno', kenoStats.totalWagered, kenoStats.totalWon, reserve);
        saved++;
      }
    } catch (err) {
      console.error('takeAndSaveDailySnapshots keno:', err);
    }

    // ── Lottery ─────────────────────────────────────────────────────────────
    try {
      const lottery = await this.getLotteryStats();
      if (lottery) {
        await this.dbService.saveContractDailySnapshot(
          'lottery',
          lottery.totalCollected,
          lottery.totalClaimed,
          0n, // lottery has no pooled reserve exposed via a simple view function
        );
        await this.dbService.saveContractHourlySnapshot('lottery', lottery.totalCollected, lottery.totalClaimed, 0n);
        saved++;
      }
    } catch (err) {
      console.error('takeAndSaveDailySnapshots lottery:', err);
    }

    // ── Blackjack ───────────────────────────────────────────────────────────
    try {
      const [burnFees, distFees, lpFees, platformFees, offChainPayouts, reserves] = await Promise.all([
        client.readContract({ address: BLACKJACK_ADDRESS, abi: BLACKJACK_STATS_ABI, functionName: 'totalBurnFeesCollected' }) as Promise<bigint>,
        client.readContract({ address: BLACKJACK_ADDRESS, abi: BLACKJACK_STATS_ABI, functionName: 'totalDistributionFeesCollected' }) as Promise<bigint>,
        client.readContract({ address: BLACKJACK_ADDRESS, abi: BLACKJACK_STATS_ABI, functionName: 'totalLpDistributionFeesCollected' }) as Promise<bigint>,
        client.readContract({ address: BLACKJACK_ADDRESS, abi: BLACKJACK_STATS_ABI, functionName: 'totalPlatformFeesCollected' }) as Promise<bigint>,
        client.readContract({ address: BLACKJACK_ADDRESS, abi: BLACKJACK_STATS_ABI, functionName: 'totalOffChainPayouts' }) as Promise<bigint>,
        client.readContract({ address: BLACKJACK_ADDRESS, abi: BLACKJACK_STATS_ABI, functionName: 'totalReserves' }) as Promise<bigint>,
      ]);
      const totalFees = burnFees + distFees + lpFees + platformFees;
      const totalWagered = totalFees + offChainPayouts;
      await this.dbService.saveContractDailySnapshot('blackjack', totalWagered, offChainPayouts, reserves);
      await this.dbService.saveContractHourlySnapshot('blackjack', totalWagered, offChainPayouts, reserves);
      saved++;
    } catch (err) {
      console.error('takeAndSaveDailySnapshots blackjack:', err);
    }

    // ── Big Wheel ────────────────────────────────────────────────────────────
    try {
      const bigWheel = await this.getBigWheelStats();
      if (bigWheel) {
        await this.dbService.saveContractDailySnapshot(
          'bigwheel',
          bigWheel.volume,
          bigWheel.payouts,
          bigWheel.contractReserveBalance,
        );
        await this.dbService.saveContractHourlySnapshot(
          'bigwheel',
          bigWheel.volume,
          bigWheel.payouts,
          bigWheel.contractReserveBalance,
        );
        saved++;
      }
    } catch (err) {
      console.error('takeAndSaveDailySnapshots bigwheel:', err);
    }

    // Prune hourly snapshots older than 48h
    try {
      await this.dbService.pruneContractHourlySnapshots(48);
    } catch (err) {
      console.error('pruneContractHourlySnapshots:', err);
    }

    return saved;
  }
}
