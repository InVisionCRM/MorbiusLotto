import type { Express } from 'express';
import { DatabaseService } from '../services/database.service';
interface RegisterBlackjackPublicRoutesOptions {
    app: Express;
    dbService: DatabaseService;
}
export declare function registerBlackjackPublicRoutes({ app, dbService, }: RegisterBlackjackPublicRoutesOptions): void;
export {};
//# sourceMappingURL=blackjack-public.routes.d.ts.map