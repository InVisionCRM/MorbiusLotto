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
export declare class ChainAnalyticsService {
    getPlinkoStats(): Promise<PlinkoChainStats | null>;
    getKenoStats(): Promise<KenoChainStats | null>;
    getLotteryStats(): Promise<LotteryChainStats | null>;
    getBigWheelStats(): Promise<BigWheelChainStats | null>;
    /** Fetch all on-chain game stats in parallel. */
    getAllChainStats(): Promise<{
        plinko: PlinkoChainStats | null;
        keno: KenoChainStats | null;
        lottery: LotteryChainStats | null;
        bigWheel: BigWheelChainStats | null;
    }>;
}
//# sourceMappingURL=chain-analytics.service.d.ts.map