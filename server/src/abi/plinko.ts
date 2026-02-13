/** Re-export from local copy (also available at contracts/abi/plinko.json) */
import plinkoAbiJson from './plinko.json';

type Abi = readonly unknown[];
export const plinkoAbi = plinkoAbiJson as Abi; // plinko.json is the ABI array directly
