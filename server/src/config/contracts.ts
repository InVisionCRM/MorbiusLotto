/**
 * Contract addresses and ABIs for platform analytics (Plinko, Keno, Lottery, BigWheel, Blackjack).
 * Addresses match lib/contracts.ts on PulseChain mainnet. Env overrides allowed for deployment differences.
 * ABIs are pulled from contracts/abi/ (canonical; Hardhat artifacts or synced JSON).
 * Local copies in server/src/abi/ for Railway builds (which only include server/ directory).
 * All ABIs use TypeScript wrappers for consistency and reusability.
 */
import { instantLotteryAbi } from '../abi/instant-lottery';
import { plinkoAbi } from '../abi/plinko';
import { kenoAbi } from '../abi/keno';

const PLINKO_ABI = plinkoAbi;
const KENO_ABI = kenoAbi;
export const MORBIUS_TOKEN_ADDRESS = (process.env.MORBIUS_TOKEN_ADDRESS || '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1') as `0x${string}`;
/** PulseX router — PLS deposits are real swaps sent here (swapExactETHForTokens → MORBIUS to the vault). */
export const PULSEX_ROUTER_ADDRESS = (process.env.PULSEX_ROUTER_ADDRESS || '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02') as `0x${string}`;

export const PLINKO_ADDRESS = (process.env.PLINKO_ADDRESS || '0xeC29f41bA9380E34b71d0AeB53bd637ba5258A93') as `0x${string}`;
export const KENO_ADDRESS = (process.env.KENO_ADDRESS || '0x496fCE9733E2102102f448c533b84C7A88856e8a') as `0x${string}`;
/** Instant Lottery 6-of-55 (house bankroll). When set, analytics use this for lottery stats. */
export const LOTTERY_INSTANT_ADDRESS = (process.env.LOTTERY_INSTANT_ADDRESS || process.env.NEXT_PUBLIC_LOTTERY_INSTANT_ADDRESS || '0x6CCecFd3165f4d911BA8D196eb5202cc80fEF8a8') as `0x${string}`;
export const BIGWHEEL_ADDRESS = (process.env.BIGWHEEL_ADDRESS || '0x53331B63ef24904Ea470Cf07b924c7C13A699d8F') as `0x${string}`;
/** Blackjack V2. Set BLACKJACK_ADDRESS in .env (BLACKJACK_CONTRACT_ADDRESS also accepted). */
export const BLACKJACK_ADDRESS = (process.env.BLACKJACK_ADDRESS || process.env.BLACKJACK_CONTRACT_ADDRESS || '0xc2Ae080dE01108b5C9C0f2C5C86051CFd3D18C00') as `0x${string}`;

/**
 * MorbiusVault — stateless deposit router (successor to the V7 reserve contract for DEPOSITS only).
 * Deposits are verified/credited against this address; withdrawals are unchanged. Deployed on
 * PulseChain 2026-07 (owner 0x7044…95e5, forwards MORBIUS to the hot wallet). Any of the env vars
 * below override the deployed default if ever redeployed.
 */
export const MORBIUS_VAULT_ADDRESS = (
  process.env.MORBIUS_VAULT_ADDRESS ||
  process.env.MORBIUS_VAULT_CONTRACT_ADDRESS ||
  process.env.NEXT_PUBLIC_MORBIUS_VAULT_CONTRACT_ADDRESS ||
  '0x4A5a82f644A7CB20A2c8Bf0Cf4369DC641E8CeD2'
) as `0x${string}`;

/** Legacy Blackjack contracts (for admin health). Accept BLACKJACK_LEGACY_CONTRACT_ADDRESS* or NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS*. */
export const BLACKJACK_LEGACY_ADDRESS = (process.env.BLACKJACK_LEGACY_CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS || '') as `0x${string}`;
export const BLACKJACK_LEGACY_ADDRESS_2 = (process.env.BLACKJACK_LEGACY_CONTRACT_ADDRESS_2 || process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_2 || '') as `0x${string}`;
export const BLACKJACK_LEGACY_ADDRESS_3 = (process.env.BLACKJACK_LEGACY_CONTRACT_ADDRESS_3 || process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_3 || '') as `0x${string}`;
export const BLACKJACK_LEGACY_ADDRESS_4 = (process.env.BLACKJACK_LEGACY_CONTRACT_ADDRESS_4 || process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_4 || '') as `0x${string}`;
export const BLACKJACK_LEGACY_ADDRESS_5 = (process.env.BLACKJACK_LEGACY_CONTRACT_ADDRESS_5 || process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_5 || '') as `0x${string}`;
export const BLACKJACK_LEGACY_ADDRESS_6 = (process.env.BLACKJACK_LEGACY_CONTRACT_ADDRESS_6 || process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_6 || '') as `0x${string}`;
export const BLACKJACK_LEGACY_ADDRESS_7 = (process.env.BLACKJACK_LEGACY_CONTRACT_ADDRESS_7 || process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_7 || '0x62cb20cd01F5af1f951B0Ec6bBD499143afF906c') as `0x${string}`;

function isLegacyAddress(v: string): v is `0x${string}` {
  return typeof v === 'string' && v.trim().length >= 42 && v.trim().toLowerCase().startsWith('0x');
}

/** All Blackjack contracts to show in admin health: current first, then legacy 1–6 (only those set). */
export function getAllBlackjackContracts(): Array<{ address: `0x${string}`; label: string }> {
  const list: Array<{ address: `0x${string}`; label: string }> = [
    { address: BLACKJACK_ADDRESS, label: 'Current' },
  ];
  const legacies: [string, string][] = [
    [BLACKJACK_LEGACY_ADDRESS, 'Legacy 1'],
    [BLACKJACK_LEGACY_ADDRESS_2, 'Legacy 2'],
    [BLACKJACK_LEGACY_ADDRESS_3, 'Legacy 3'],
    [BLACKJACK_LEGACY_ADDRESS_4, 'Legacy 4'],
    [BLACKJACK_LEGACY_ADDRESS_5, 'Legacy 5'],
    [BLACKJACK_LEGACY_ADDRESS_6, 'Legacy 6'],
    [BLACKJACK_LEGACY_ADDRESS_7, 'Legacy 7'],
  ];
  for (const [addr, label] of legacies) {
    const v = (addr || '').trim();
    if (isLegacyAddress(v)) list.push({ address: v as `0x${string}`, label });
  }
  return list;
}

/** Full Plinko ABI from contracts/abi/plinko.json. */
export const PLINKO_GET_GLOBAL_STATS_ABI = PLINKO_ABI;

/** Full CryptoKeno ABI from contracts/abi/CryptoKeno.json. */
export const KENO_GET_GLOBAL_STATS_ABI = KENO_ABI;

/** Minimal ABI: getContractReserve() -> uint256 */
export const KENO_GET_CONTRACT_RESERVE_ABI = [
  { inputs: [], name: 'getContractReserve', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

/** Instant Lottery 6-of-55 ABI (totalPlays, totalWagered, totalPayouts). */
export const INSTANT_LOTTERY_STATS_ABI = instantLotteryAbi;

/** Minimal Blackjack stats ABI for snapshot reads (fee totals, off-chain payouts, reserves). */
export const BLACKJACK_STATS_ABI = [
  { inputs: [], name: 'totalBurnFeesCollected',          outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalDistributionFeesCollected',  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalLpDistributionFeesCollected',outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalPlatformFeesCollected',      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalOffChainPayouts',            outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalReserves',                   outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
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
