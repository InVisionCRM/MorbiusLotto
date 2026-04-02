import type { Express } from 'express';
import { DatabaseService } from '../services/database.service';
interface RegisterAnalyticsRoutesOptions {
    app: Express;
    dbService: DatabaseService;
}
export declare function registerAnalyticsRoutes({ app, dbService }: RegisterAnalyticsRoutesOptions): void;
export {};
//# sourceMappingURL=analytics.routes.d.ts.map