import type { DatabaseService } from './database.service';
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
export declare class ChainAnalyticsService {
    private readonly dbService;
    constructor(dbService: DatabaseService);
    getPlinkoStats(): Promise<PlinkoChainStats | null>;
    getKenoStats(): Promise<KenoChainStats | null>;
    getLotteryStats(): Promise<LotteryChainStats | null>;
    getBigWheelStats(): Promise<BigWheelChainStats | null>;
    /**
     * All-time total MORBIUS deposited and withdrawn for Blackjack V2.
     * Derived from our own data: total_withdrawn is updated when we create a pending withdrawal;
     * total_deposited is updated by incremental chain scan (from last_scanned_block to current).
     * On first run or if no last_scanned_block, runs a full chain scan and persists to DB.
     */
    getBlackjackDepositWithdrawTotals(): Promise<{
        totalDeposited: bigint;
        totalWithdrawn: bigint;
    }>;
    /**
     * Index InstantLotteryResult events into instant_lottery_plays for leaderboard and player stats.
     * Incremental from last_scanned_block; full scan if none. Skips when LOTTERY_INSTANT_ADDRESS is not set.
     */
    indexInstantLotteryResults(): Promise<{
        indexed: number;
        lastBlock: bigint | null;
    }>;
    /** Fetch all on-chain game stats in parallel. */
    getAllChainStats(): Promise<{
        plinko: PlinkoChainStats | null;
        keno: KenoChainStats | null;
        lottery: LotteryChainStats | null;
        bigWheel: BigWheelChainStats | null;
    }>;
}
//# sourceMappingURL=chain-analytics.service.d.ts.map