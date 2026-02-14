/** Re-export from local copy (also available at contracts/abi/blackjack-v2.json) */
import blackjackArtifact from './blackjack-v2.json';

type Abi = readonly unknown[];
const raw = blackjackArtifact as unknown;
export const blackjackAbi: Abi = Array.isArray(raw) ? raw : (raw as { abi: Abi }).abi;
