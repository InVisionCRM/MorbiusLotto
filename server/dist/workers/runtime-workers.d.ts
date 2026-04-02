import { ChainAnalyticsService } from '../services/chain-analytics.service';
import { MoneyService } from '../services/money.service';
interface StartRuntimeWorkersOptions {
    moneyService: MoneyService;
    chainAnalytics: ChainAnalyticsService;
    refreshBjTotals: () => void;
}
export interface RuntimeWorkers {
    stop(): void;
}
export declare function startRuntimeWorkers({ moneyService, chainAnalytics, refreshBjTotals, }: StartRuntimeWorkersOptions): RuntimeWorkers;
export {};
//# sourceMappingURL=runtime-workers.d.ts.map