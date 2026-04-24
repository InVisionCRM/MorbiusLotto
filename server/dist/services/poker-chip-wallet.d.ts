import type { Pool, PoolClient } from 'pg';
export type PokerChipLedgerReason = 'purchase' | 'cashout' | 'cash_join' | 'cash_leave' | 'cash_reup' | 'cash_admin_return' | 'tournament_create_guarantee' | 'tournament_buyin' | 'tournament_refund' | 'tournament_prize' | 'rake' | 'creator_fee' | 'platform_fee';
export declare function getPlatformFeeWalletLower(): string;
export declare function getPokerChipBalance(db: Pool | PoolClient, walletAddress: string): Promise<bigint>;
export interface PokerChipRef {
    type: string;
    id: string | null;
}
/**
 * Apply a signed chip delta inside an open transaction (`client` must already be in BEGIN).
 * Positive = credit, negative = debit.
 */
export declare function applyPokerChipDelta(client: PoolClient, walletAddress: string, delta: bigint, reason: PokerChipLedgerReason, ref?: PokerChipRef): Promise<bigint>;
//# sourceMappingURL=poker-chip-wallet.d.ts.map