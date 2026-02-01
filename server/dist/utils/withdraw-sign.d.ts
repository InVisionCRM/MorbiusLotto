export declare const MIN_WITHDRAWAL_WEI: bigint;
export interface WithdrawSignaturePayload {
    amount: string;
    nonce: string;
    v: number;
    r: `0x${string}`;
    s: `0x${string}`;
}
/**
 * Sign a withdrawal approval (EIP-712) for the Blackjack contract.
 * Returns amount, nonce, and signature components (v, r, s).
 */
export declare function signWithdrawApproval(player: string, amount: bigint, nonce: bigint, contractAddress: `0x${string}`, chainId: number, privateKey: `0x${string}`): Promise<WithdrawSignaturePayload>;
//# sourceMappingURL=withdraw-sign.d.ts.map