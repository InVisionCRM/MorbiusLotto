import type { MoneyDatabaseQueries } from './database.service';
import type { MoneyDatabasePort } from './money-database.port';
export declare class MoneyDatabaseAdapter implements MoneyDatabasePort {
    private readonly dbService;
    constructor(dbService: MoneyDatabaseQueries);
    getExpiredPendingWithdrawals(): Promise<{
        wallet_address: string;
        nonce: string;
        amount: string;
    }[]>;
    markPendingWithdrawalCompleted(walletAddress: string, nonce: bigint, txHash?: string): Promise<boolean>;
    expireSinglePendingWithdrawal(walletAddress: string, nonce: bigint, amount: bigint): Promise<void>;
    getExpiredPendingForWallet(walletAddress: string): Promise<{
        nonce: string;
        amount: string;
    } | null>;
    insertPendingDeposit(walletAddress: string, amountWei: bigint, txHash: string, blockNumber: bigint | null, confirmationsRequired?: number): Promise<void>;
    getCreditedPendingDepositByTxHash(txHash: string): Promise<{
        wallet_address: string;
        amount_wei: string;
    } | null>;
    addPlayerBalance(walletAddress: string, amount: bigint): Promise<bigint>;
    getActivePendingWithdrawal(walletAddress: string): Promise<{
        nonce: string;
        amount: string;
    } | null>;
    getPlayerBalance(walletAddress: string): Promise<bigint>;
    enqueueHotWithdrawal(walletAddress: string, amountWei: bigint, netToUserWei: bigint, feeWei: bigint): Promise<string>;
    getHotWithdrawalJobById(jobId: string): Promise<import("./money-database.port").HotWithdrawalJobRow | null>;
    getActiveHotWithdrawalJob(walletAddress: string): Promise<import("./money-database.port").HotWithdrawalJobRow | null>;
    claimNextHotWithdrawalJob(): Promise<{
        id: string;
        wallet_address: string;
        amount_wei: string;
        net_to_user_wei: string;
        fee_wei: string;
        created_at: Date;
    } | null>;
    updateHotWithdrawalJob(jobId: string, updates: {
        status: string;
        tx_hash?: string | null;
        error_message?: string | null;
    }): Promise<void>;
    getHotWithdrawalJobsPendingConfirmation(): Promise<{
        id: string;
        wallet_address: string;
        amount_wei: string;
        tx_hash: string;
        created_at: Date;
        updated_at: Date;
    }[]>;
    addToBlackjackWithdrawnTotal(amount: bigint): Promise<void>;
    recordHotWalletWithdrawal(walletAddress: string, amount: bigint, txHash: string): Promise<void>;
    getPendingDepositsForConfirmation(): Promise<import("./money-database.port").PendingDepositRow[]>;
    updatePendingDepositBlockNumber(jobId: string, blockNumber: bigint): Promise<void>;
    creditPendingDeposit(jobId: string): Promise<boolean>;
    listPendingDeposits(limit?: number, offset?: number): Promise<import("./money-database.port").PendingDepositAdminRow[]>;
    listPendingWithdrawals(limit?: number, offset?: number): Promise<import("./money-database.port").PendingWithdrawalAdminRow[]>;
    getPlayerTransactionHistory(walletAddress: string, limit?: number, offset?: number): Promise<import("./money-database.port").PlayerTransactionRow[]>;
}
//# sourceMappingURL=money-database.adapter.d.ts.map