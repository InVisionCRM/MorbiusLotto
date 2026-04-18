"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertPokerTournamentBotControlAllowed = assertPokerTournamentBotControlAllowed;
exports.assertPokerBotControlAllowed = assertPokerBotControlAllowed;
const cosmetics_catalog_1 = require("../lib/cosmetics-catalog");
/**
 * Start/stop poker tournament registration bots.
 * Any connected wallet may call this while the event is in `registration` (testing-friendly).
 * Still requires `x-admin-wallet` with a valid address so the request isn’t fully anonymous.
 */
async function assertPokerTournamentBotControlAllowed(pool, tournamentId, walletHeader) {
    const wallet = walletHeader?.trim();
    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        return { ok: false, status: 403, error: 'Wallet required (x-admin-wallet)' };
    }
    const r = await pool.query(`SELECT status, game_type FROM tournaments WHERE id = $1`, [tournamentId]);
    if (r.rows.length === 0) {
        return { ok: false, status: 404, error: 'Tournament not found' };
    }
    const row = r.rows[0];
    if (row.game_type !== 'poker') {
        return { ok: false, status: 400, error: 'Not a poker tournament' };
    }
    if (row.status !== 'registration') {
        return { ok: false, status: 400, error: 'Bots can only be added while the tournament is open for registration' };
    }
    return { ok: true };
}
/** Bootstrap/stop poker bots: caller must be admin or seated at the table (x-admin-wallet = connected wallet). */
async function assertPokerBotControlAllowed(pool, tableId, walletHeader) {
    const wallet = walletHeader?.trim();
    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        return { ok: false, status: 403, error: 'Wallet required (x-admin-wallet)' };
    }
    if ((0, cosmetics_catalog_1.isAdminWallet)(wallet)) {
        return { ok: true };
    }
    const r = await pool.query(`SELECT 1 FROM poker_seats WHERE table_id = $1 AND player_address IS NOT NULL AND LOWER(player_address) = LOWER($2) LIMIT 1`, [tableId, wallet]);
    if (r.rows.length === 0) {
        return { ok: false, status: 403, error: 'Must be seated at this table or admin to manage bots' };
    }
    return { ok: true };
}
//# sourceMappingURL=poker-bot-auth.js.map