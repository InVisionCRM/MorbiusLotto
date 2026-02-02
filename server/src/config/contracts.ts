/**
 * Contract addresses and minimal ABIs for platform analytics (Plinko, Keno, Lottery, BigWheel).
 * Addresses match lib/contracts.ts on PulseChain mainnet.
 */

export const PLINKO_ADDRESS = (process.env.PLINKO_ADDRESS || '0x37B1db8F06870BFFeFed862C06535BEFc4383ff8') as `0x${string}`;
export const KENO_ADDRESS = (process.env.KENO_ADDRESS || '0x734A1460b4131F8cFE4950894Be89d1a852c957A') as `0x${string}`;
export const LOTTERY_ADDRESS = (process.env.LOTTERY_ADDRESS || '0xD66b4489fbfF99A8d62f969203899840F2ec69c5') as `0x${string}`;
export const BIGWHEEL_ADDRESS = (process.env.BIGWHEEL_ADDRESS || '0x53331B63ef24904Ea470Cf07b924c7C13A699d8F') as `0x${string}`;

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

/** Minimal ABI: totalTicketsEver(), totalMORBIUSEverCollected(), totalMORBIUSEverClaimed() */
export const LOTTERY_STATS_ABI = [
  { inputs: [], name: 'totalTicketsEver', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalMORBIUSEverCollected', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalMORBIUSEverClaimed', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

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
