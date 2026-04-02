"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BIGWHEEL_GET_GLOBAL_STATS_ABI = exports.BLACKJACK_STATS_ABI = exports.INSTANT_LOTTERY_STATS_ABI = exports.KENO_GET_CONTRACT_RESERVE_ABI = exports.KENO_GET_GLOBAL_STATS_ABI = exports.PLINKO_GET_GLOBAL_STATS_ABI = exports.BLACKJACK_LEGACY_ADDRESS_7 = exports.BLACKJACK_LEGACY_ADDRESS_6 = exports.BLACKJACK_LEGACY_ADDRESS_5 = exports.BLACKJACK_LEGACY_ADDRESS_4 = exports.BLACKJACK_LEGACY_ADDRESS_3 = exports.BLACKJACK_LEGACY_ADDRESS_2 = exports.BLACKJACK_LEGACY_ADDRESS = exports.BLACKJACK_ADDRESS = exports.BIGWHEEL_ADDRESS = exports.LOTTERY_INSTANT_ADDRESS = exports.KENO_ADDRESS = exports.PLINKO_ADDRESS = exports.MORBIUS_TOKEN_ADDRESS = void 0;
exports.getAllBlackjackContracts = getAllBlackjackContracts;
/**
 * Contract addresses and ABIs for platform analytics (Plinko, Keno, Lottery, BigWheel, Blackjack).
 * Addresses match lib/contracts.ts on PulseChain mainnet. Env overrides allowed for deployment differences.
 * ABIs are pulled from contracts/abi/ (canonical; Hardhat artifacts or synced JSON).
 * Local copies in server/src/abi/ for Railway builds (which only include server/ directory).
 * All ABIs use TypeScript wrappers for consistency and reusability.
 */
const instant_lottery_1 = require("../abi/instant-lottery");
const plinko_1 = require("../abi/plinko");
const keno_1 = require("../abi/keno");
const PLINKO_ABI = plinko_1.plinkoAbi;
const KENO_ABI = keno_1.kenoAbi;
exports.MORBIUS_TOKEN_ADDRESS = (process.env.MORBIUS_TOKEN_ADDRESS || '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1');
exports.PLINKO_ADDRESS = (process.env.PLINKO_ADDRESS || '0xeC29f41bA9380E34b71d0AeB53bd637ba5258A93');
exports.KENO_ADDRESS = (process.env.KENO_ADDRESS || '0x496fCE9733E2102102f448c533b84C7A88856e8a');
/** Instant Lottery 6-of-55 (house bankroll). When set, analytics use this for lottery stats. */
exports.LOTTERY_INSTANT_ADDRESS = (process.env.LOTTERY_INSTANT_ADDRESS || process.env.NEXT_PUBLIC_LOTTERY_INSTANT_ADDRESS || '0x6CCecFd3165f4d911BA8D196eb5202cc80fEF8a8');
exports.BIGWHEEL_ADDRESS = (process.env.BIGWHEEL_ADDRESS || '0x53331B63ef24904Ea470Cf07b924c7C13A699d8F');
/** Blackjack V2. Set BLACKJACK_ADDRESS in .env (BLACKJACK_CONTRACT_ADDRESS also accepted). */
exports.BLACKJACK_ADDRESS = (process.env.BLACKJACK_ADDRESS || process.env.BLACKJACK_CONTRACT_ADDRESS || '0xc2Ae080dE01108b5C9C0f2C5C86051CFd3D18C00');
/** Legacy Blackjack contracts (for admin health). Accept BLACKJACK_LEGACY_CONTRACT_ADDRESS* or NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS*. */
exports.BLACKJACK_LEGACY_ADDRESS = (process.env.BLACKJACK_LEGACY_CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS || '');
exports.BLACKJACK_LEGACY_ADDRESS_2 = (process.env.BLACKJACK_LEGACY_CONTRACT_ADDRESS_2 || process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_2 || '');
exports.BLACKJACK_LEGACY_ADDRESS_3 = (process.env.BLACKJACK_LEGACY_CONTRACT_ADDRESS_3 || process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_3 || '');
exports.BLACKJACK_LEGACY_ADDRESS_4 = (process.env.BLACKJACK_LEGACY_CONTRACT_ADDRESS_4 || process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_4 || '');
exports.BLACKJACK_LEGACY_ADDRESS_5 = (process.env.BLACKJACK_LEGACY_CONTRACT_ADDRESS_5 || process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_5 || '');
exports.BLACKJACK_LEGACY_ADDRESS_6 = (process.env.BLACKJACK_LEGACY_CONTRACT_ADDRESS_6 || process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_6 || '');
exports.BLACKJACK_LEGACY_ADDRESS_7 = (process.env.BLACKJACK_LEGACY_CONTRACT_ADDRESS_7 || process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_7 || '0x62cb20cd01F5af1f951B0Ec6bBD499143afF906c');
function isLegacyAddress(v) {
    return typeof v === 'string' && v.trim().length >= 42 && v.trim().toLowerCase().startsWith('0x');
}
/** All Blackjack contracts to show in admin health: current first, then legacy 1–6 (only those set). */
function getAllBlackjackContracts() {
    const list = [
        { address: exports.BLACKJACK_ADDRESS, label: 'Current' },
    ];
    const legacies = [
        [exports.BLACKJACK_LEGACY_ADDRESS, 'Legacy 1'],
        [exports.BLACKJACK_LEGACY_ADDRESS_2, 'Legacy 2'],
        [exports.BLACKJACK_LEGACY_ADDRESS_3, 'Legacy 3'],
        [exports.BLACKJACK_LEGACY_ADDRESS_4, 'Legacy 4'],
        [exports.BLACKJACK_LEGACY_ADDRESS_5, 'Legacy 5'],
        [exports.BLACKJACK_LEGACY_ADDRESS_6, 'Legacy 6'],
        [exports.BLACKJACK_LEGACY_ADDRESS_7, 'Legacy 7'],
    ];
    for (const [addr, label] of legacies) {
        const v = (addr || '').trim();
        if (isLegacyAddress(v))
            list.push({ address: v, label });
    }
    return list;
}
/** Full Plinko ABI from contracts/abi/plinko.json. */
exports.PLINKO_GET_GLOBAL_STATS_ABI = PLINKO_ABI;
/** Full CryptoKeno ABI from contracts/abi/CryptoKeno.json. */
exports.KENO_GET_GLOBAL_STATS_ABI = KENO_ABI;
/** Minimal ABI: getContractReserve() -> uint256 */
exports.KENO_GET_CONTRACT_RESERVE_ABI = [
    { inputs: [], name: 'getContractReserve', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
];
/** Instant Lottery 6-of-55 ABI (totalPlays, totalWagered, totalPayouts). */
exports.INSTANT_LOTTERY_STATS_ABI = instant_lottery_1.instantLotteryAbi;
/** Minimal Blackjack stats ABI for snapshot reads (fee totals, off-chain payouts, reserves). */
exports.BLACKJACK_STATS_ABI = [
    { inputs: [], name: 'totalBurnFeesCollected', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'totalDistributionFeesCollected', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'totalLpDistributionFeesCollected', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'totalPlatformFeesCollected', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'totalOffChainPayouts', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'totalReserves', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
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