/**
 * Instant Lottery 6-of-55: provably-fair server-side play (MORBIUS only).
 * Generates winning numbers via ProvablyFairService, stores for verification, calls contract resolvePlay as operator.
 */
import type { DatabaseService } from './database.service';
import { ProvablyFairService } from './provably-fair.service';
export interface InstantLotteryPlayInput {
    address: string;
    numbers: unknown;
    wager: string;
    clientSeed?: string;
}
export interface InstantLotteryPlayResult {
    winningNumbers: number[];
    matchCount: number;
    grossPayout: string;
    netPayout: string;
    txHash: string;
    serverSeedHash: string;
    nonce: string;
}
export declare class InstantLotteryService {
    private readonly dbService;
    private readonly provablyFairService;
    constructor(dbService: DatabaseService, provablyFairService: ProvablyFairService);
    isConfigured(): boolean;
    play(input: InstantLotteryPlayInput): Promise<InstantLotteryPlayResult>;
}
//# sourceMappingURL=instant-lottery.service.d.ts.map