"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChainAnalyticsService = void 0;
const viem_1 = require("viem");
const chain_client_1 = require("../utils/chain-client");
const contracts_1 = require("../config/contracts");
class ChainAnalyticsService {
    async getPlinkoStats() {
        try {
            const client = (0, chain_client_1.getPublicClient)();
            const [globalStats, wagerLimits] = await Promise.all([
                client.readContract({
                    address: contracts_1.PLINKO_ADDRESS,
                    abi: contracts_1.PLINKO_GET_GLOBAL_STATS_ABI,
                    functionName: 'getGlobalStats',
                }),
                client.readContract({
                    address: contracts_1.PLINKO_ADDRESS,
                    abi: contracts_1.PLINKO_GET_GLOBAL_STATS_ABI,
                    functionName: 'getWagerLimits',
                }).catch(() => null),
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
        }
        catch (err) {
            console.error('ChainAnalyticsService getPlinkoStats:', err);
            return null;
        }
    }
    async getKenoStats() {
        try {
            const client = (0, chain_client_1.getPublicClient)();
            const [globalStats, currentRoundId, feeBps, burnThreshold] = await Promise.all([
                client.readContract({
                    address: contracts_1.KENO_ADDRESS,
                    abi: contracts_1.KENO_GET_GLOBAL_STATS_ABI,
                    functionName: 'getGlobalStats',
                }),
                client.readContract({
                    address: contracts_1.KENO_ADDRESS,
                    abi: contracts_1.KENO_GET_GLOBAL_STATS_ABI,
                    functionName: 'currentRoundId',
                }).catch(() => null),
                client.readContract({
                    address: contracts_1.KENO_ADDRESS,
                    abi: contracts_1.KENO_GET_GLOBAL_STATS_ABI,
                    functionName: 'feeBps',
                }).catch(() => null),
                client.readContract({
                    address: contracts_1.KENO_ADDRESS,
                    abi: contracts_1.KENO_GET_GLOBAL_STATS_ABI,
                    functionName: 'burnThreshold',
                }).catch(() => null),
            ]);
            // Get current round pool balance if round exists
            let currentRoundPoolBalance;
            if (currentRoundId !== null && currentRoundId > 0n) {
                try {
                    const round = await client.readContract({
                        address: contracts_1.KENO_ADDRESS,
                        abi: contracts_1.KENO_GET_GLOBAL_STATS_ABI,
                        functionName: 'getRound',
                        args: [currentRoundId],
                    });
                    currentRoundPoolBalance = round?.poolBalance;
                }
                catch {
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
    /**
     * All-time total MORBIUS deposited and withdrawn for Blackjack V2 (from contract events).
     * Deposit = PLS swaps (morbiusAmount) + direct DepositMORBIUS(amount). Withdrawal = Withdrawal(amount).
     */
    async getBlackjackDepositWithdrawTotals() {
        const client = (0, chain_client_1.getPublicClient)();
        let totalDeposited = 0n;
        let totalWithdrawn = 0n;
        try {
            const toBlock = await client.getBlockNumber();
            const chunkSize = 50000;
            let fromBlock = 0n;
            const depositEvent = (0, viem_1.parseAbiItem)('event Deposit(address indexed player, uint256 morbiusAmount, uint256 plsAmount)');
            const depositMorbiusEvent = (0, viem_1.parseAbiItem)('event DepositMORBIUS(address indexed player, uint256 amount)');
            const withdrawalEvent = (0, viem_1.parseAbiItem)('event Withdrawal(address indexed player, uint256 amount)');
            while (fromBlock <= toBlock) {
                const end = fromBlock + BigInt(chunkSize) > toBlock ? toBlock : fromBlock + BigInt(chunkSize);
                const [depositLogs, depositMorbiusLogs, withdrawalLogs] = await Promise.all([
                    client.getLogs({ address: contracts_1.BLACKJACK_ADDRESS, event: depositEvent, fromBlock, toBlock: end }),
                    client.getLogs({ address: contracts_1.BLACKJACK_ADDRESS, event: depositMorbiusEvent, fromBlock, toBlock: end }),
                    client.getLogs({ address: contracts_1.BLACKJACK_ADDRESS, event: withdrawalEvent, fromBlock, toBlock: end }),
                ]);
                for (const log of depositLogs) {
                    if (log.args && 'morbiusAmount' in log.args)
                        totalDeposited += log.args.morbiusAmount;
                }
                for (const log of depositMorbiusLogs) {
                    if (log.args && 'amount' in log.args)
                        totalDeposited += log.args.amount;
                }
                for (const log of withdrawalLogs) {
                    if (log.args && 'amount' in log.args)
                        totalWithdrawn += log.args.amount;
                }
                fromBlock = end + 1n;
                if (fromBlock > toBlock)
                    break;
            }
        }
        catch (err) {
            console.error('ChainAnalyticsService getBlackjackDepositWithdrawTotals:', err);
        }
        return { totalDeposited, totalWithdrawn };
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