import { getPublicClient } from '../utils/chain-client';
import {
  PLINKO_ADDRESS,
  KENO_ADDRESS,
  LOTTERY_ADDRESS,
  BIGWHEEL_ADDRESS,
  PLINKO_GET_GLOBAL_STATS_ABI,
  KENO_GET_GLOBAL_STATS_ABI,
  LOTTERY_STATS_ABI,
  BIGWHEEL_GET_GLOBAL_STATS_ABI,
} from '../config/contracts';

export interface PlinkoChainStats {
  totalDrops: bigint;
  totalBallsSold: bigint;
  totalRevenue: bigint;
  totalPayouts: bigint;
  contractReserve: bigint;
}

export interface KenoChainStats {
  totalWagered: bigint;
  totalWon: bigint;
  ticketCount: bigint;
  activeRoundId: bigint;
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
  async getPlinkoStats(): Promise<PlinkoChainStats | null> {
    try {
      const client = getPublicClient();
      const result = await client.readContract({
        address: PLINKO_ADDRESS,
        abi: PLINKO_GET_GLOBAL_STATS_ABI,
        functionName: 'getGlobalStats',
      });
      return {
        totalDrops: result[0],
        totalBallsSold: result[1],
        totalRevenue: result[2],
        totalPayouts: result[3],
        contractReserve: result[4],
      };
    } catch (err) {
      console.error('ChainAnalyticsService getPlinkoStats:', err);
      return null;
    }
  }

  async getKenoStats(): Promise<KenoChainStats | null> {
    try {
      const client = getPublicClient();
      const result = await client.readContract({
        address: KENO_ADDRESS,
        abi: KENO_GET_GLOBAL_STATS_ABI,
        functionName: 'getGlobalStats',
      });
      return {
        totalWagered: result[0],
        totalWon: result[1],
        ticketCount: result[2],
        activeRoundId: result[3],
      };
    } catch (err) {
      console.error('ChainAnalyticsService getKenoStats:', err);
      return null;
    }
  }

  async getLotteryStats(): Promise<LotteryChainStats | null> {
    try {
      const client = getPublicClient();
      const [totalTicketsEver, totalCollected, totalClaimed] = await Promise.all([
        client.readContract({ address: LOTTERY_ADDRESS, abi: LOTTERY_STATS_ABI, functionName: 'totalTicketsEver' }),
        client.readContract({ address: LOTTERY_ADDRESS, abi: LOTTERY_STATS_ABI, functionName: 'totalMORBIUSEverCollected' }),
        client.readContract({ address: LOTTERY_ADDRESS, abi: LOTTERY_STATS_ABI, functionName: 'totalMORBIUSEverClaimed' }),
      ]);
      return { totalTicketsEver, totalCollected, totalClaimed };
    } catch (err) {
      console.error('ChainAnalyticsService getLotteryStats:', err);
      return null;
    }
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
