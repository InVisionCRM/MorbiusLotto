import type { Express } from 'express';
import { DatabaseService } from '../services/database.service';
interface RegisterPublicRoutesOptions {
    app: Express;
    dbService: DatabaseService;
}
export declare function registerPublicRoutes({ app, dbService }: RegisterPublicRoutesOptions): void;
export {};
//# sourceMappingURL=public.routes.d.ts.map