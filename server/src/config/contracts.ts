/**
 * Contract addresses and ABIs for platform analytics (Plinko, Keno, Lottery, BigWheel, Blackjack).
 * Addresses match lib/contracts.ts on PulseChain mainnet. Env overrides allowed for deployment differences.
 * ABIs are pulled from contracts/abi/ (canonical; Hardhat artifacts or synced JSON).
 */
import lottery6of55V2Artifact from '../../../contracts/abi/lottery6of55-v2.json';

type LotteryAbi = readonly unknown[];
const LOTTERY_ABI = (lottery6of55V2Artifact as { abi: LotteryAbi }).abi;
export const MORBIUS_TOKEN_ADDRESS = (process.env.MORBIUS_TOKEN_ADDRESS || '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1') as `0x${string}`;

export const PLINKO_ADDRESS = (process.env.PLINKO_ADDRESS || '0x37B1db8F06870BFFeFed862C06535BEFc4383ff8') as `0x${string}`;
export const KENO_ADDRESS = (process.env.KENO_ADDRESS || '0x734A1460b4131F8cFE4950894Be89d1a852c957A') as `0x${string}`;
export const LOTTERY_ADDRESS = (process.env.LOTTERY_ADDRESS || '0xD66b4489fbfF99A8d62f969203899840F2ec69c5') as `0x${string}`;
export const BIGWHEEL_ADDRESS = (process.env.BIGWHEEL_ADDRESS || '0x53331B63ef24904Ea470Cf07b924c7C13A699d8F') as `0x${string}`;
/** Blackjack V2; use BLACKJACK_CONTRACT_ADDRESS in .env if different. */
export const BLACKJACK_ADDRESS = (process.env.BLACKJACK_CONTRACT_ADDRESS || process.env.BLACKJACK_ADDRESS || '0x69771cE8C2eC5a78Cf87b0a21ad801E74a3EED09') as `0x${string}`;

/** Minimal ABI: getGlobalStats() -> (totalDrops, totalBallsSold, totalRevenue, totalPayouts, contractReserve) */
export const PLINKO_GET_GLOBAL_STATS_ABI = [
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
] as const;

/** Minimal ABI: getGlobalStats() -> (totalWagered, totalWon, ticketCount, activeRoundId) */
export const KENO_GET_GLOBAL_STATS_ABI = [
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
] as const;

/** Full Lottery 6-of-55 V2 ABI from contracts/abi/lottery6of55-v2.json. */
export const LOTTERY_STATS_ABI = LOTTERY_ABI;

/** Minimal ABI: getGlobalStats() -> (spins, volume, payouts, contractBalance, contractReserveBalance) */
export const BIGWHEEL_GET_GLOBAL_STATS_ABI = [
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
] as const;
