import type { Express } from 'express';
import { MoneyService } from '../services/money.service';
interface RegisterMoneyRoutesOptions {
    app: Express;
    moneyService: MoneyService;
}
export declare function registerMoneyRoutes({ app, moneyService }: RegisterMoneyRoutesOptions): void;
export {};
//# sourceMappingURL=money.routes.d.ts.map