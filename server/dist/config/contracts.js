"use strict";
/**
 * Contract addresses and minimal ABIs for platform analytics (Plinko, Keno, Lottery, BigWheel).
 * Addresses match lib/contracts.ts on PulseChain mainnet.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BIGWHEEL_GET_GLOBAL_STATS_ABI = exports.LOTTERY_STATS_ABI = exports.KENO_GET_GLOBAL_STATS_ABI = exports.PLINKO_GET_GLOBAL_STATS_ABI = exports.BIGWHEEL_ADDRESS = exports.LOTTERY_ADDRESS = exports.KENO_ADDRESS = exports.PLINKO_ADDRESS = void 0;
exports.PLINKO_ADDRESS = (process.env.PLINKO_ADDRESS || '0x37B1db8F06870BFFeFed862C06535BEFc4383ff8');
exports.KENO_ADDRESS = (process.env.KENO_ADDRESS || '0x734A1460b4131F8cFE4950894Be89d1a852c957A');
exports.LOTTERY_ADDRESS = (process.env.LOTTERY_ADDRESS || '0xD66b4489fbfF99A8d62f969203899840F2ec69c5');
exports.BIGWHEEL_ADDRESS = (process.env.BIGWHEEL_ADDRESS || '0x53331B63ef24904Ea470Cf07b924c7C13A699d8F');
/** Minimal ABI: getGlobalStats() -> (totalDrops, totalBallsSold, totalRevenue, totalPayouts, contractReserve) */
exports.PLINKO_GET_GLOBAL_STATS_ABI = [
    {
        inputs: [],
        name: 'getGlobalStats',
        outputs: [
            { internalType: 'uint256', name: '_totalDrops', type: 'uint256' },
            { internalType: 'uint256', name: '_totalBallsSold', type: 'uint256' },
            { internalType: 'uint256', name: '_totalRevenue', type: 'uint256' },
            { internalType: 'uint256', name: '_totalPayouts', type: 'uint256' },
            { internalType: 'uint256', name: '_contractReserve', type: 'uint256' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
];
/** Minimal ABI: getGlobalStats() -> (totalWagered, totalWon, ticketCount, activeRoundId) */
exports.KENO_GET_GLOBAL_STATS_ABI = [
    {
        inputs: [],
        name: 'getGlobalStats',
        outputs: [
            { internalType: 'uint256', name: 'totalWagered', type: 'uint256' },
            { internalType: 'uint256', name: 'totalWon', type: 'uint256' },
            { internalType: 'uint256', name: 'ticketCount', type: 'uint256' },
            { internalType: 'uint256', name: 'activeRoundId', type: 'uint256' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
];
/** Minimal ABI: totalTicketsEver(), totalMORBIUSEverCollected(), totalMORBIUSEverClaimed() */
exports.LOTTERY_STATS_ABI = [
    { inputs: [], name: 'totalTicketsEver', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'totalMORBIUSEverCollected', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'totalMORBIUSEverClaimed', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
];
/** Minimal ABI: getGlobalStats() -> (spins, volume, payouts, contractBalance, contractReserveBalance) */
exports.BIGWHEEL_GET_GLOBAL_STATS_ABI = [
    {
        inputs: [],
        name: 'getGlobalStats',
        outputs: [
            { internalType: 'uint256', name: 'spins', type: 'uint256' },
            { internalType: 'uint256', name: 'volume', type: 'uint256' },
            { internalType: 'uint256', name: 'payouts', type: 'uint256' },
            { internalType: 'uint256', name: 'contractBalance', type: 'uint256' },
            { internalType: 'uint256', name: 'contractReserveBalance', type: 'uint256' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
];
//# sourceMappingURL=contracts.js.map