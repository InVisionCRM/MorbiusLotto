import type { Abi } from 'viem'
/** Re-export from canonical location: contracts/abi/ */
import lottery from '../contracts/abi/lottery6of55-v2.json';

export const LOTTERY_6OF55_ABI = (lottery as { abi: Abi }).abi;




