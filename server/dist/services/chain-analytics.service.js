"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChainAnalyticsService = void 0;
const chain_client_1 = require("../utils/chain-client");
const contracts_1 = require("../config/contracts");
class ChainAnalyticsService {
    async getPlinkoStats() {
        try {
            const client = (0, chain_client_1.getPublicClient)();
            const result = await client.readContract({
                address: contracts_1.PLINKO_ADDRESS,
                abi: contracts_1.PLINKO_GET_GLOBAL_STATS_ABI,
                functionName: 'getGlobalStats',
            });
            return {
                totalDrops: result[0],
                totalBallsSold: result[1],
                totalRevenue: result[2],
                totalPayouts: result[3],
                contractReserve: result[4],
            };
        }
        catch (err) {
            console.error('ChainAnalyticsService getPlinkoStats:', err);
            return null;
        }
    }
    async getKenoStats() {
        try {
            const client = (0, chain_client_1.getPublicClient)();
            const result = await client.readContract({
                address: contracts_1.KENO_ADDRESS,
                abi: contracts_1.KENO_GET_GLOBAL_STATS_ABI,
                functionName: 'getGlobalStats',
            });
            return {
                totalWagered: result[0],
                totalWon: result[1],
                ticketCount: result[2],
                activeRoundId: result[3],
            };
        }
        catch (err) {
            console.error('ChainAnalyticsService getKenoStats:', err);
            return null;
        }
    }
    async getLotteryStats() {
        const client = (0, chain_client_1.getPublicClient)();
        const read = async (fn) => {
            try {
                const result = await client.readContract({ address: contracts_1.LOTTERY_ADDRESS, abi: contracts_1.LOTTERY_STATS_ABI, functionName: fn });
                return result;
            }
            catch {
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
    async getBigWheelStats() {
        try {
            const client = (0, chain_client_1.getPublicClient)();
            const result = await client.readContract({
                address: contracts_1.BIGWHEEL_ADDRESS,
                abi: contracts_1.BIGWHEEL_GET_GLOBAL_STATS_ABI,
                functionName: 'getGlobalStats',
            });
            return {
                spins: result[0],
                volume: result[1],
                payouts: result[2],
                contractBalance: result[3],
                contractReserveBalance: result[4],
            };
        }
        catch (err) {
            console.error('ChainAnalyticsService getBigWheelStats:', err);
            return null;
        }
    }
    /** Fetch all on-chain game stats in parallel. */
    async getAllChainStats() {
        const [plinko, keno, lottery, bigWheel] = await Promise.all([
            this.getPlinkoStats(),
            this.getKenoStats(),
            this.getLotteryStats(),
            this.getBigWheelStats(),
        ]);
        return { plinko, keno, lottery, bigWheel };
    }
}
exports.ChainAnalyticsService = ChainAnalyticsService;
//# sourceMappingURL=chain-analytics.service.js.map