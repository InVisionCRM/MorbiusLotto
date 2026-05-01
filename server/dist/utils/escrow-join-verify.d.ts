/**
 * Verify `addToPrizePool` landed from `playerAddress` for this tournament UUID.
 */
export declare function verifyEscrowAddToPrizePoolJoinTx(params: {
    tournamentIdUuid: string;
    txHash: `0x${string}`;
    playerAddress: string;
    prizeTokenAddress: string;
    buyInAmountWei: bigint;
}): Promise<{
    ok: true;
} | {
    ok: false;
    error: string;
}>;
//# sourceMappingURL=escrow-join-verify.d.ts.map