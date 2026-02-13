/** Re-export from local copy (also available at contracts/abi/blackjack-v2.json) */
import blackjackArtifact from './blackjack-v2.json';

type Abi = readonly unknown[];
export const blackjackAbi = (blackjackArtifact as { abi: Abi }).abi;
