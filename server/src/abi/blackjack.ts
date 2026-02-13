/** Re-export from canonical location: contracts/abi/blackjack-v2.json */
import blackjackArtifact from '../../../contracts/abi/blackjack-v2.json';

type Abi = readonly unknown[];
export const blackjackAbi = (blackjackArtifact as { abi: Abi }).abi;
