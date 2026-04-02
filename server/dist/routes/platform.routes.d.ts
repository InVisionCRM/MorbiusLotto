import type { Express } from 'express';
import { ChainAnalyticsService } from '../services/chain-analytics.service';
import { DatabaseService } from '../services/database.service';
import { InstantLotteryService } from '../services/instant-lottery.service';
import { WebSocketService } from '../services/websocket.service';
interface RegisterPlatformRoutesOptions {
    app: Express;
    dbService: DatabaseService;
    chainAnalytics: ChainAnalyticsService;
    wsService: WebSocketService;
    instantLotteryService: InstantLotteryService;
    getAnalyticsCacheKey: (path: string, query: Record<string, string | undefined>) => string;
    getCachedAnalytics: (key: string) => any | null;
    setCachedAnalytics: (key: string, data: any) => void;
}
export declare function registerPlatformRoutes({ app, dbService, chainAnalytics, wsService, instantLotteryService, getAnalyticsCacheKey, getCachedAnalytics, setCachedAnalytics, }: RegisterPlatformRoutesOptions): void;
export {};
//# sourceMappingURL=platform.routes.d.ts.map