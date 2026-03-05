/** Instant Lottery 6-of-55 ABI (house bankroll, instant payout) */
import artifact from '../contracts/abi/instant-lottery-6of55.json'
import type { Abi } from 'viem'

export const INSTANT_LOTTERY_6OF55_ABI = (artifact as { abi: Abi }).abi
