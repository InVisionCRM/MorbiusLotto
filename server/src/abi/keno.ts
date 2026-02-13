/** Re-export from local copy (also available at contracts/abi/CryptoKeno.json) */
import kenoArtifact from './CryptoKeno.json';

type Abi = readonly unknown[];
export const kenoAbi = (kenoArtifact as { abi: Abi }).abi;
