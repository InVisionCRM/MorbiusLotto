/** Re-export from canonical location: contracts/abi/ */
import lotteryArtifact from '../contracts/abi/lottery6of55-v2.json'
import type { Abi } from 'viem'

export const LOTTERY_6OF55_V2_ABI = (lotteryArtifact as { abi: Abi }).abi

