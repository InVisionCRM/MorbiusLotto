"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tournamentIdToBytes32 = tournamentIdToBytes32;
const viem_1 = require("viem");
/**
 * Canonical bytes32 for a tournament id (UUID string).
 * Must match frontend and Solidity: keccak256(abi.encodePacked(tournamentId)).
 */
function tournamentIdToBytes32(tournamentId) {
    const utf8 = new TextEncoder().encode(tournamentId);
    const hex = ('0x' + Buffer.from(utf8).toString('hex'));
    return (0, viem_1.keccak256)(hex);
}
//# sourceMappingURL=tournament-id-bytes32.js.map