import type { Express } from 'express';
import { BlackjackGameService } from '../services/blackjack-game.service';
import { DatabaseService } from '../services/database.service';
interface RegisterVerifyRoutesOptions {
    app: Express;
    gameService: BlackjackGameService;
    dbService: DatabaseService;
}
export declare function registerVerifyRoutes({ app, gameService, dbService, }: RegisterVerifyRoutesOptions): void;
export {};
//# sourceMappingURL=verify.routes.d.ts.map