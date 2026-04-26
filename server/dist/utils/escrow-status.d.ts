export interface EscrowPoolStatus {
    token: `0x${string}`;
    totalDeposited: bigint;
    amountPaidOut: bigint;
    depositor?: `0x${string}`;
    depositedAt?: bigint;
    cancelled?: boolean;
    /**
     * Synthesized — the deployed contract does NOT expose an `active` field.
     * Treated as `true` while there is undistributed balance and the pool is not cancelled.
     */
    active?: boolean;
}
/**
 * Read tournament prize pool status from the deployed escrow contract.
 *
 * The deployed `TOURNAMENT_PRIZE_ESCROW_ADDRESS` returns 6 fields from `getPool`
 * (no `active` flag). The legacy V1 fallback that was here previously misread the
 * 6-field response as 3 V1 fields, silently shifting `depositor` into `totalDeposited`
 * and the real `totalDeposited` into `amountPaidOut`. That is what produced bogus
 * "Escrow has already paid out" rejections on freshly-funded pools. No fallback now —
 * if decode fails it really is broken (RPC, wrong address, etc.) and we return null.
 */
export declare function getEscrowPoolStatus(tournamentId: string): Promise<EscrowPoolStatus | null>;
/**
 * Read tournament prize pool status from Escrow V3 (uint256 tournament IDs).
 */
export declare function getEscrowV3PoolStatus(onChainTournamentId: number | bigint): Promise<EscrowPoolStatus | null>;
//# sourceMappingURL=escrow-status.d.ts.map