import { parseAbiItem } from 'viem';
import { getPublicClient } from '../utils/chain-client';
import type { DatabaseService } from './database.service';
import {
  PLINKO_ADDRESS,
  KENO_ADDRESS,
  LOTTERY_ADDRESS,
  BIGWHEEL_ADDRESS,
  BLACKJACK_ADDRESS,
  PLINKO_GET_GLOBAL_STATS_ABI,
  KENO_GET_GLOBAL_STATS_ABI,
  LOTTERY_STATS_ABI,
  BIGWHEEL_GET_GLOBAL_STATS_ABI,
} from '../config/contracts';

const DEPOSIT_EVENT = parseAbiItem('event Deposit(address indexed player, uint256 morbiusAmount, uint256 plsAmount)');
const DEPOSIT_MORBIUS_EVENT = parseAbiItem('event DepositMORBIUS(address indexed player, uint256 amount)');
const WITHDRAWAL_EVENT = parseAbiItem('event Withdrawal(address indexed player, uint256 amount)');
const CHUNK_SIZE = 50000;

export interface PlinkoChainStats {
  totalDrops: bigint;
  totalBallsSold: bigint;
  totalRevenue: bigint;
  totalPayouts: bigint;
  contractReserve: bigint;
  minWagerPerBall?: bigint;
  maxWagerPerBall?: bigint;
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
    const read = async (fn: 'totalTicketsEver' | 'totalMORBIUSEverCollected' | 'totalMORBIUSEverClaimed'): Promise<bigint> => {
      try {
        const result = await client.readContract({ address: LOTTERY_ADDRESS, abi: LOTTERY_STATS_ABI, functionName: fn });
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
}
