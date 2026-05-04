"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTournamentPrizeEscrowAddress = getTournamentPrizeEscrowAddress;
/**
 * PulseChain deployment for TournamentPrizeEscrow V5 (and backward-compatible V4 reads).
 * Override with TOURNAMENT_PRIZE_ESCROW_ADDRESS (server) or NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS (build).
 */
function getTournamentPrizeEscrowAddress() {
    const raw = (typeof process !== 'undefined' && process.env.TOURNAMENT_PRIZE_ESCROW_ADDRESS) ||
        (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS) ||
        '';
    const t = String(raw).trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(t)) {
        return t.toLowerCase();
    }
    return '0xa54da628c54d2c9885a537f18dc9c22856510edf';
}
//# sourceMappingURL=tournament-escrow-address.js.map