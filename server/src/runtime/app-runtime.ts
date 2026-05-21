import type { Express } from 'express';
import type { Server as HttpServer } from 'http';
import { registerMoneyRoutes } from '../routes/money.routes';
import { registerTelegramRoutes } from '../routes/telegram.routes';
import { MoneyDatabaseAdapter } from '../services/money-database.adapter';
import { MoneyService } from '../services/money.service';
import { RuntimeWorkers, startRuntimeWorkers } from '../workers/runtime-workers';
import { RuntimeServices, initializeRuntimeServices } from './service-registry';

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

export async function initializeAppRuntime({
  app,
  server,
  port,
  refreshBjTotals,
}: InitializeAppRuntimeOptions): Promise<AppRuntime> {
  const runtime = await initializeRuntimeServices(server, port);
  const moneyDb = new MoneyDatabaseAdapter(runtime.dbService);
  const moneyService = new MoneyService(moneyDb);
  await moneyService.verifySettlementSigner();
  await moneyService.reconcileExpiredPendingWithdrawals('startup');
  registerMoneyRoutes({ app, moneyService });
  // Telegram notification routes (inbound webhook + wallet-link flow).
  // Self-contained and degrades gracefully when TELEGRAM_BOT_TOKEN is unset.
  registerTelegramRoutes({ app, pool: runtime.dbService.getPool() });
  const runtimeWorkers = startRuntimeWorkers({
    moneyService,
    chainAnalytics: runtime.chainAnalytics,
    refreshBjTotals: () => refreshBjTotals(runtime),
  });

  return {
    ...runtime,
    moneyService,
    runtimeWorkers,
    stop() {
      runtime.freerollScheduler.stop();
      runtime.tournamentScheduler.stop();
      runtime.merkleDropsService.stopCron();
      runtime.merkleDropsLPService.stopCron();
      runtimeWorkers.stop();
    },
  };
}
