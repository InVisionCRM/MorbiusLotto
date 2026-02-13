"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BIGWHEEL_GET_GLOBAL_STATS_ABI = exports.LOTTERY_STATS_ABI = exports.KENO_GET_GLOBAL_STATS_ABI = exports.PLINKO_GET_GLOBAL_STATS_ABI = exports.BLACKJACK_ADDRESS = exports.BIGWHEEL_ADDRESS = exports.LOTTERY_ADDRESS = exports.KENO_ADDRESS = exports.PLINKO_ADDRESS = exports.MORBIUS_TOKEN_ADDRESS = void 0;
/**
 * Contract addresses and ABIs for platform analytics (Plinko, Keno, Lottery, BigWheel, Blackjack).
 * Addresses match lib/contracts.ts on PulseChain mainnet. Env overrides allowed for deployment differences.
 * ABIs are pulled from contracts/abi/ (canonical; Hardhat artifacts or synced JSON).
 * Local copies in server/src/abi/ for Railway builds (which only include server/ directory).
 * All ABIs use TypeScript wrappers for consistency and reusability.
 */
const lottery_1 = require("../abi/lottery");
const plinko_1 = require("../abi/plinko");
const keno_1 = require("../abi/keno");
const LOTTERY_ABI = lottery_1.lotteryAbi;
const PLINKO_ABI = plinko_1.plinkoAbi;
const KENO_ABI = keno_1.kenoAbi;
exports.MORBIUS_TOKEN_ADDRESS = (process.env.MORBIUS_TOKEN_ADDRESS || '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1');
exports.PLINKO_ADDRESS = (process.env.PLINKO_ADDRESS || '0x37B1db8F06870BFFeFed862C06535BEFc4383ff8');
exports.KENO_ADDRESS = (process.env.KENO_ADDRESS || '0x734A1460b4131F8cFE4950894Be89d1a852c957A');
exports.LOTTERY_ADDRESS = (process.env.LOTTERY_ADDRESS || '0xD66b4489fbfF99A8d62f969203899840F2ec69c5');
exports.BIGWHEEL_ADDRESS = (process.env.BIGWHEEL_ADDRESS || '0x53331B63ef24904Ea470Cf07b924c7C13A699d8F');
/** Blackjack V2; use BLACKJACK_CONTRACT_ADDRESS in .env if different. */
exports.BLACKJACK_ADDRESS = (process.env.BLACKJACK_CONTRACT_ADDRESS || process.env.BLACKJACK_ADDRESS || '0x69771cE8C2eC5a78Cf87b0a21ad801E74a3EED09');
/** Full Plinko ABI from contracts/abi/plinko.json. */
exports.PLINKO_GET_GLOBAL_STATS_ABI = PLINKO_ABI;
/** Full CryptoKeno ABI from contracts/abi/CryptoKeno.json. */
exports.KENO_GET_GLOBAL_STATS_ABI = KENO_ABI;
/** Full Lottery 6-of-55 V2 ABI from contracts/abi/lottery6of55-v2.json. */
exports.LOTTERY_STATS_ABI = LOTTERY_ABI;
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