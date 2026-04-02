"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startRuntimeWorkers = startRuntimeWorkers;
const logger_1 = require("../utils/logger");
const withdraw_sign_1 = require("../utils/withdraw-sign");
function startRuntimeWorkers({ moneyService, chainAnalytics, refreshBjTotals, }) {
    const timers = [];
    timers.push(setInterval(async () => {
        try {
            await moneyService.reconcileExpiredPendingWithdrawals('interval');
        }
        catch (error) {
            logger_1.logger.error('Error expiring pending withdrawals:', error);
        }
    }, 60_000));
    const hotWithdrawQueueIntervalMs = (0, withdraw_sign_1.resolveHotWithdrawQueueIntervalMs)(process.env.HOT_WITHDRAW_QUEUE_INTERVAL_MS);
    timers.push(setInterval(async () => {
        try {
            await moneyService.processHotWithdrawalQueue();
        }
        catch (error) {
            logger_1.logger.error('Hot withdrawal queue worker error', error);
        }
    }, hotWithdrawQueueIntervalMs));
    timers.push(setInterval(async () => {
        try {
            await moneyService.confirmHotWithdrawals();
        }
        catch (error) {
            logger_1.logger.error('Hot withdrawal confirmation worker error', error);
        }
    }, withdraw_sign_1.HOT_WITHDRAW_CONFIRM_WORKER_INTERVAL_MS));
    timers.push(setInterval(async () => {
        try {
            await moneyService.confirmPendingDeposits();
        }
        catch (error) {
            logger_1.logger.error('Pending deposits confirmation worker error', error);
        }
    }, withdraw_sign_1.PENDING_DEPOSIT_CONFIRM_WORKER_INTERVAL_MS));
    const runContractSnapshot = async () => {
        try {
            const saved = await chainAnalytics.takeAndSaveDailySnapshots();
            logger_1.logger.info(`Contract daily snapshot saved (${saved} games)`);
        }
        catch (error) {
            logger_1.logger.error('Contract daily snapshot error', error);
        }
    };
    void runContractSnapshot();
    timers.push(setInterval(runContractSnapshot, 60 * 60 * 1000));
    refreshBjTotals();
    return {
        stop() {
            timers.forEach((timer) => clearInterval(timer));
        },
    };
}
//# sourceMappingURL=runtime-workers.js.map