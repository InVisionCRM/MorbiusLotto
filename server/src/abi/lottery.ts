/** Re-export from local copy (also available at contracts/abi/lottery6of55-v2.json) */
import lotteryArtifact from './lottery6of55-v2.json';

type Abi = readonly unknown[];
export const lotteryAbi = (lotteryArtifact as { abi: Abi }).abi;
