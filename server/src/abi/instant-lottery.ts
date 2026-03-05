/** Instant Lottery 6-of-55 ABI (for totalPlays, totalWagered, totalPayouts) */
import artifact from './instant-lottery-6of55.json';

type Abi = readonly unknown[];
export const instantLotteryAbi = (artifact as { abi: Abi }).abi;
