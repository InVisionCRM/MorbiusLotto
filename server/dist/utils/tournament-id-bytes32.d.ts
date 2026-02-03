/**
 * Canonical bytes32 for a tournament id (UUID string).
 * Must match frontend and Solidity: keccak256(abi.encodePacked(tournamentId)).
 */
export declare function tournamentIdToBytes32(tournamentId: string): `0x${string}`;
//# sourceMappingURL=tournament-id-bytes32.d.ts.map