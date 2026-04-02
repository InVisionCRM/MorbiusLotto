import type { Express } from 'express';
import { DatabaseService } from '../services/database.service';
interface RegisterPlayerReadRoutesOptions {
    app: Express;
    dbService: DatabaseService;
}
export declare function registerPlayerReadRoutes({ app, dbService }: RegisterPlayerReadRoutesOptions): void;
export {};
//# sourceMappingURL=player.routes.d.ts.map