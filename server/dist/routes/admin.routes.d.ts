import type { Express } from 'express';
import type { Multer } from 'multer';
import type { BlackjackMultiGameService } from '../services/blackjack-multi-game.service';
import type { ChainAnalyticsService } from '../services/chain-analytics.service';
import type { DatabaseService } from '../services/database.service';
import type { PokerGameService } from '../services/poker-game.service';
import type { WebSocketService } from '../services/websocket.service';
interface RegisterAdminRoutesOptions {
    app: Express;
    uploadMulter: Multer;
    dbService: DatabaseService;
    pokerGameService: PokerGameService;
    bjMultiService: BlackjackMultiGameService;
    wsService: WebSocketService;
    chainAnalytics: ChainAnalyticsService;
    getHotWalletClient: () => {
        account?: {
            address?: `0x${string}`;
        };
    } | null;
    refreshBjTotalsBackground: (chainAnalytics: ChainAnalyticsService) => void;
    getBjTotalsCache: () => {
        deposited: string;
        withdrawn: string;
    };
}
export declare function registerAdminRoutes({ app, uploadMulter, dbService, pokerGameService, bjMultiService, wsService, chainAnalytics, getHotWalletClient, refreshBjTotalsBackground, getBjTotalsCache, }: RegisterAdminRoutesOptions): void;
export {};
//# sourceMappingURL=admin.routes.d.ts.map