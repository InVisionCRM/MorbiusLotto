import type { Express } from 'express';
import type { Server as HttpServer } from 'http';
import { MoneyService } from '../services/money.service';
import { RuntimeWorkers } from '../workers/runtime-workers';
import { RuntimeServices } from './service-registry';
interface InitializeAppRuntimeOptions {
    app: Express;
    server: HttpServer;
    port: string | number;
    refreshBjTotals: (runtime: RuntimeServices) => void;
}
export interface AppRuntime extends RuntimeServices {
    moneyService: MoneyService;
    runtimeWorkers: RuntimeWorkers;
    stop(): void;
}
export declare function initializeAppRuntime({ app, server, port, refreshBjTotals, }: InitializeAppRuntimeOptions): Promise<AppRuntime>;
export {};
//# sourceMappingURL=app-runtime.d.ts.map