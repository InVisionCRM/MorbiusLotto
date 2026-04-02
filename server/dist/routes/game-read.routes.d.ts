import type { Express } from 'express';
import { ChainAnalyticsService } from '../services/chain-analytics.service';
import { DatabaseService } from '../services/database.service';
interface RegisterGameReadRoutesOptions {
    app: Express;
    dbService: DatabaseService;
    chainAnalytics: ChainAnalyticsService;
}
export declare function registerGameReadRoutes({ app, dbService, chainAnalytics, }: RegisterGameReadRoutesOptions): void;
export {};
//# sourceMappingURL=game-read.routes.d.ts.map