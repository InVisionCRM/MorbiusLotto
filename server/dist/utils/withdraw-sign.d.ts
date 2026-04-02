export declare const MIN_WITHDRAWAL_WEI: bigint;
export declare const HOT_WITHDRAW_CONFIRMATION_TIMEOUT_MS: number;
export declare const HOT_WITHDRAW_CONFIRM_WORKER_INTERVAL_MS = 30000;
export declare const PENDING_DEPOSIT_CONFIRM_WORKER_INTERVAL_MS = 10000;
export declare const HOT_WITHDRAW_QUEUE_INTERVAL_MS_DEFAULT = 3000;
export interface WithdrawSignaturePayload {
    amount: string;
    nonce: string;
    expiryTimestamp: string;
    v: number;
    r: `0x${string}`;
    s: `0x${string}`;
}
export declare function resolveDepositConfirmationsRequired(rawValue?: string): number;
export declare function resolveHotWithdrawQueueIntervalMs(rawValue?: string): number;
/**
 * Build EIP-712 digest exactly as BlackjackV2 contract does, then sign it.
 * When domainSeparatorHex is provided (read from contract), the signature is guaranteed
 * to verify on-chain. Use this when signTypedData produces a different encoding.
 */
export declare function signWithdrawApproval(player: string, amount: bigint, nonce: bigint, expiryTimestamp: number, contractAddress: `0x${string}`, chainId: number, privateKey: `0x${string}`, domainSeparatorHex?: `0x${string}`): Promise<WithdrawSignaturePayload>;
//# sourceMappingURL=withdraw-sign.d.ts.map