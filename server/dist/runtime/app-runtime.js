"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeAppRuntime = initializeAppRuntime;
const money_routes_1 = require("../routes/money.routes");
const money_database_adapter_1 = require("../services/money-database.adapter");
const money_service_1 = require("../services/money.service");
const runtime_workers_1 = require("../workers/runtime-workers");
const service_registry_1 = require("./service-registry");
async function initializeAppRuntime({ app, server, port, refreshBjTotals, }) {
    const runtime = await (0, service_registry_1.initializeRuntimeServices)(server, port);
    const moneyDb = new money_database_adapter_1.MoneyDatabaseAdapter(runtime.dbService);
    const moneyService = new money_service_1.MoneyService(moneyDb);
    await moneyService.verifySettlementSigner();
    await moneyService.reconcileExpiredPendingWithdrawals('startup');
    (0, money_routes_1.registerMoneyRoutes)({ app, moneyService });
    const runtimeWorkers = (0, runtime_workers_1.startRuntimeWorkers)({
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
//# sourceMappingURL=app-runtime.js.map