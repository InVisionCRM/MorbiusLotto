import type { Express } from 'express';
import { CosmeticsService } from '../services/cosmetics.service';
import { DatabaseService } from '../services/database.service';
interface RegisterPlayerMutationRoutesOptions {
    app: Express;
    dbService: DatabaseService;
    cosmeticsService: CosmeticsService;
}
export declare function registerPlayerMutationRoutes({ app, dbService, cosmeticsService, }: RegisterPlayerMutationRoutesOptions): void;
export {};
//# sourceMappingURL=player-mutation.routes.d.ts.map