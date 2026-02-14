/**
 * Contract addresses and ABIs for platform analytics (Plinko, Keno, Lottery, BigWheel, Blackjack).
 * Addresses match lib/contracts.ts on PulseChain mainnet. Env overrides allowed for deployment differences.
 * ABIs are pulled from contracts/abi/ (canonical; Hardhat artifacts or synced JSON).
 * Local copies in server/src/abi/ for Railway builds (which only include server/ directory).
 * All ABIs use TypeScript wrappers for consistency and reusability.
 */
import { lotteryAbi } from '../abi/lottery';
import { plinkoAbi } from '../abi/plinko';
import { kenoAbi } from '../abi/keno';

const LOTTERY_ABI = lotteryAbi;
const PLINKO_ABI = plinkoAbi;
const KENO_ABI = kenoAbi;
export const MORBIUS_TOKEN_ADDRESS = (process.env.MORBIUS_TOKEN_ADDRESS || '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1') as `0x${string}`;

export const PLINKO_ADDRESS = (process.env.PLINKO_ADDRESS || '0x37B1db8F06870BFFeFed862C06535BEFc4383ff8') as `0x${string}`;
export const KENO_ADDRESS = (process.env.KENO_ADDRESS || '0x734A1460b4131F8cFE4950894Be89d1a852c957A') as `0x${string}`;
export const LOTTERY_ADDRESS = (process.env.LOTTERY_ADDRESS || '0xD66b4489fbfF99A8d62f969203899840F2ec69c5') as `0x${string}`;
export const BIGWHEEL_ADDRESS = (process.env.BIGWHEEL_ADDRESS || '0x53331B63ef24904Ea470Cf07b924c7C13A699d8F') as `0x${string}`;
/** Blackjack V2; use BLACKJACK_CONTRACT_ADDRESS in .env if different. */
export const BLACKJACK_ADDRESS = (process.env.BLACKJACK_CONTRACT_ADDRESS || process.env.BLACKJACK_ADDRESS || '0xFCE49ab8b53366C397A0205c4c0CF42aE2B658A8') as `0x${string}`;

/** Legacy Blackjack contracts (for admin health: reserves per contract). Set via env BLACKJACK_LEGACY_CONTRACT_ADDRESS, _2, _3. */
export const BLACKJACK_LEGACY_ADDRESS = (process.env.BLACKJACK_LEGACY_CONTRACT_ADDRESS || '') as `0x${string}`;
export const BLACKJACK_LEGACY_ADDRESS_2 = (process.env.BLACKJACK_LEGACY_CONTRACT_ADDRESS_2 || '') as `0x${string}`;
export const BLACKJACK_LEGACY_ADDRESS_3 = (process.env.BLACKJACK_LEGACY_CONTRACT_ADDRESS_3 || '') as `0x${string}`;

/** All Blackjack contracts to show in admin health: current first, then legacy 1–3 (only those set). */
export function getAllBlackjackContracts(): Array<{ address: `0x${string}`; label: string }> {
  const list: Array<{ address: `0x${string}`; label: string }> = [
    { address: BLACKJACK_ADDRESS, label: 'Current' },
  ];
  if (BLACKJACK_LEGACY_ADDRESS && BLACKJACK_LEGACY_ADDRESS.startsWith('0x')) {
    list.push({ address: BLACKJACK_LEGACY_ADDRESS, label: 'Legacy 1' });
  }
  if (BLACKJACK_LEGACY_ADDRESS_2 && BLACKJACK_LEGACY_ADDRESS_2.startsWith('0x')) {
    list.push({ address: BLACKJACK_LEGACY_ADDRESS_2, label: 'Legacy 2' });
  }
  if (BLACKJACK_LEGACY_ADDRESS_3 && BLACKJACK_LEGACY_ADDRESS_3.startsWith('0x')) {
    list.push({ address: BLACKJACK_LEGACY_ADDRESS_3, label: 'Legacy 3' });
  }
  return list;
}

/** Full Plinko ABI from contracts/abi/plinko.json. */
export const PLINKO_GET_GLOBAL_STATS_ABI = PLINKO_ABI;

/** Full CryptoKeno ABI from contracts/abi/CryptoKeno.json. */
export const KENO_GET_GLOBAL_STATS_ABI = KENO_ABI;

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
