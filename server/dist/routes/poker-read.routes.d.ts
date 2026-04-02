import type { Express } from 'express';
import { DatabaseService } from '../services/database.service';
interface RegisterPokerReadRoutesOptions {
    app: Express;
    dbService: DatabaseService;
}
export declare function registerPokerReadRoutes({ app, dbService, }: RegisterPokerReadRoutesOptions): void;
export {};
//# sourceMappingURL=poker-read.routes.d.ts.map