export declare const MIN_WITHDRAWAL_WEI: bigint;
export interface WithdrawSignaturePayload {
    amount: string;
    nonce: string;
    expiryTimestamp: string;
    v: number;
    r: `0x${string}`;
    s: `0x${string}`;
}
/**
 * Build EIP-712 digest exactly as BlackjackV2 contract does, then sign it.
 * When domainSeparatorHex is provided (read from contract), the signature is guaranteed
 * to verify on-chain. Use this when signTypedData produces a different encoding.
 */
export declare function signWithdrawApproval(player: string, amount: bigint, nonce: bigint, expiryTimestamp: number, contractAddress: `0x${string}`, chainId: number, privateKey: `0x${string}`, domainSeparatorHex?: `0x${string}`): Promise<WithdrawSignaturePayload>;
//# sourceMappingURL=withdraw-sign.d.ts.map