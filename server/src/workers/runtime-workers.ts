import { ChainAnalyticsService } from '../services/chain-analytics.service';
import { MoneyService } from '../services/money.service';
import { logger } from '../utils/logger';
import {
  HOT_WITHDRAW_CONFIRM_WORKER_INTERVAL_MS,
  resolveHotWithdrawQueueIntervalMs,
  PENDING_DEPOSIT_CONFIRM_WORKER_INTERVAL_MS,
} from '../utils/withdraw-sign';

interface StartRuntimeWorkersOptions {
  moneyService: MoneyService;
  chainAnalytics: ChainAnalyticsService;
  refreshBjTotals: () => void;
}

export interface RuntimeWorkers {
  stop(): void;
}

export function startRuntimeWorkers({
  moneyService,
  chainAnalytics,
  refreshBjTotals,
}: StartRuntimeWorkersOptions): RuntimeWorkers {
  const timers: NodeJS.Timeout[] = [];

  timers.push(setInterval(async () => {
    try {
      await moneyService.reconcileExpiredPendingWithdrawals('interval');
    } catch (error) {
      logger.error('Error expiring pending withdrawals:', error);
    }
  }, 60_000));

  const hotWithdrawQueueIntervalMs = resolveHotWithdrawQueueIntervalMs(process.env.HOT_WITHDRAW_QUEUE_INTERVAL_MS);
  timers.push(setInterval(async () => {
    try {
      await moneyService.processHotWithdrawalQueue();
    } catch (error) {
      logger.error('Hot withdrawal queue worker error', error);
    }
  }, hotWithdrawQueueIntervalMs));

  timers.push(setInterval(async () => {
    try {
      await moneyService.confirmHotWithdrawals();
    } catch (error) {
      logger.error('Hot withdrawal confirmation worker error', error);
    }
  }, HOT_WITHDRAW_CONFIRM_WORKER_INTERVAL_MS));

  timers.push(setInterval(async () => {
    try {
      await moneyService.confirmPendingDeposits();
    } catch (error) {
      logger.error('Pending deposits confirmation worker error', error);
    }
  }, PENDING_DEPOSIT_CONFIRM_WORKER_INTERVAL_MS));

  const runContractSnapshot = async () => {
    try {
      const saved = await chainAnalytics.takeAndSaveDailySnapshots();
      logger.info(`Contract daily snapshot saved (${saved} games)`);
    } catch (error) {
      logger.error('Contract daily snapshot error', error);
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
