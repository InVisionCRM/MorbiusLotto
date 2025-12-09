import type { Abi } from 'viem'
import KenoArtifact from '../contracts/artifacts/contracts/CryptoKeno.sol/CryptoKeno.json'

// Use the compiled ABI directly so structs (Round/Ticket) stay in sync with the contract.
export const KENO_ABI = KenoArtifact.abi as Abi