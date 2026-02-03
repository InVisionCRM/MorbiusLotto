import { keccak256 } from 'viem';

/**
 * Canonical bytes32 for a tournament id (UUID string).
 * Must match frontend and Solidity: keccak256(abi.encodePacked(tournamentId)).
 */
export function tournamentIdToBytes32(tournamentId: string): `0x${string}` {
  const utf8 = new TextEncoder().encode(tournamentId);
  const hex = ('0x' + Buffer.from(utf8).toString('hex')) as `0x${string}`;
  return keccak256(hex);
}
