import type { Pool } from 'pg';
/**
 * Start/stop poker tournament registration bots.
 * Any connected wallet may call this while the event is in `registration` (testing-friendly).
 * Still requires `x-admin-wallet` with a valid address so the request isn’t fully anonymous.
 */
export declare function assertPokerTournamentBotControlAllowed(pool: Pool, tournamentId: string, walletHeader: string | undefined): Promise<{
    ok: true;
} | {
    ok: false;
    status: number;
    error: string;
}>;
/** Bootstrap/stop poker bots: caller must be admin or seated at the table (x-admin-wallet = connected wallet). */
export declare function assertPokerBotControlAllowed(pool: Pool, tableId: string, walletHeader: string | undefined): Promise<{
    ok: true;
} | {
    ok: false;
    status: number;
    error: string;
}>;
//# sourceMappingURL=poker-bot-auth.d.ts.map