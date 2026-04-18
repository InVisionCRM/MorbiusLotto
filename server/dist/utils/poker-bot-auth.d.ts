import type { Pool } from 'pg';
/** Bootstrap/stop poker bots: caller must be admin or seated at the table (x-admin-wallet = connected wallet). */
export declare function assertPokerBotControlAllowed(pool: Pool, tableId: string, walletHeader: string | undefined): Promise<{
    ok: true;
} | {
    ok: false;
    status: number;
    error: string;
}>;
//# sourceMappingURL=poker-bot-auth.d.ts.map