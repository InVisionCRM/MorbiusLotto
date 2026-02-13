/** Re-export from canonical location: contracts/abi/blackjack-v2.json (Hardhat artifact). */
import blackjackArtifact from '../contracts/abi/blackjack-v2.json'
import type { Abi } from 'viem'

export const blackjackAbi = (blackjackArtifact as { abi: Abi }).abi
