import type { MoneyDatabasePort, PendingDepositAdminRow, PendingWithdrawalAdminRow, PlayerTransactionRow } from './money-database.port';
export declare class MoneyService {
    private readonly dbService;
    private readonly publicClient;
    private readonly blackjackContractAddress;
    private feeRecipientsCache;
    constructor(dbService: MoneyDatabasePort);
    private getHotWalletClient;
    private normalizeAddress;
    private isWithdrawalNonceUsed;
    private getFeeRecipients;
    verifySettlementSigner(): Promise<void>;
    reconcileExpiredPendingWithdrawals(reason: 'startup' | 'interval'): Promise<void>;
    refundExpiredPendingWithdrawal(rawAddress: string, force: boolean): Promise<{
        ok: true;
        refunded?: string;
        address: string;
        status: 'refunded' | 'marked_completed';
        message?: string;
    }>;
    recordPendingDeposit(walletAddress: string, txHash: string): Promise<void>;
    creditDepositShortfall(txHash: string, correctAmountWei: string): Promise<{
        wallet: string;
        shortfallCredited: string;
    }>;
    getAuthoritativeBalance(rawAddress: string): Promise<string>;
    enqueueWithdrawal(rawAddress: string, amount: string | number | bigint | null | undefined): Promise<{
        jobId: string;
        status: 'queued';
        message: string;
    }>;
    getWithdrawalStatus(jobId: string): Promise<{
        jobId: string;
        status: string;
        txHash?: string;
        error?: string;
        netToUser?: string;
    } | null>;
    getPendingWithdrawal(rawAddress: string): Promise<{
        jobId: string;
        status: string;
        txHash?: string;
        error?: string;
        netToUser?: string;
    } | null>;
    listPendingTransfers(type: 'deposits' | 'withdrawals', limit: number, offset: number): Promise<PendingDepositAdminRow[] | PendingWithdrawalAdminRow[]>;
    getPlayerTransactions(rawAddress: string, limit: number, offset: number): Promise<PlayerTransactionRow[]>;
    processHotWithdrawalQueue(): Promise<void>;
    private distributeWithdrawalFee;
    confirmHotWithdrawals(): Promise<void>;
    confirmPendingDeposits(): Promise<void>;
}
//# sourceMappingURL=money.service.d.ts.map