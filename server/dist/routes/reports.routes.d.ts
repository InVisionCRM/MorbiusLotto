import type { Express } from 'express';
import { DatabaseService } from '../services/database.service';
interface RegisterReportRoutesOptions {
    app: Express;
    dbService: DatabaseService;
}
export declare function registerReportRoutes({ app, dbService, }: RegisterReportRoutesOptions): void;
export {};
//# sourceMappingURL=reports.routes.d.ts.map