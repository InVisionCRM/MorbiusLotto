import type { Express } from 'express';
import { logger } from '../utils/logger';
import { sendJson } from '../http/json';
import { MoneyService } from '../services/money.service';

interface RegisterMoneyRoutesOptions {
  app: Express;
  moneyService: MoneyService;
}

function statusForMoneyError(message: string): number {
  if (message.includes('Invalid wallet address') || message.includes('Invalid tx hash') || message.includes('Invalid address') || message.includes('Address required') || message.includes('Amount required')) {
    return 400;
  }
  if (message.includes('No credited deposit found')) return 404;
  if (message.includes('temporarily unavailable') || message.includes('temporarily limited') || message.includes('Could not load transaction')) return 503;
  if (message.includes('Insufficient balance')) return 400;
  if (message.includes('not found or not yet mined') || message.includes('reverted on-chain') || message.includes('Could not verify deposit amount') || message.includes('not sent to the deposit contract')) return 400;
  return 500;
}

export function registerMoneyRoutes({ app, moneyService }: RegisterMoneyRoutesOptions): void {
  app.get('/api/players/:address/transactions', async (req, res) => {
    try {
      const { address } = req.params;
      if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      // Cap high enough to return a player's full deposit/withdrawal history in one
      // call (the dashboard Transactions tab paginates client-side + exports CSV).
      const limit = Math.min(Math.max(parseInt(String(req.query.limit || 50), 10) || 50, 1), 5000);
      const offset = Math.max(parseInt(String(req.query.offset || 0), 10) || 0, 0);
      const transactions = await moneyService.getPlayerTransactions(address, limit, offset);
      return res.status(200).json(transactions);
    } catch (error) {
      logger.error('Error fetching player transactions:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/deposit/notify', async (req, res) => {
    try {
      const { walletAddress, txHash } = req.body ?? {};
      await moneyService.recordPendingDeposit(walletAddress, txHash);
      return res.status(200).json({ ok: true, message: 'Deposit recorded; balance will update after confirmations' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error('Error in deposit/notify:', error);
      return res.status(statusForMoneyError(message)).json({ error: message === 'Internal server error' ? message : message });
    }
  });

  app.post('/api/admin/deposit/credit-shortfall', async (req, res) => {
    try {
      const { txHash, correctAmountWei } = req.body ?? {};
      if (!correctAmountWei || typeof correctAmountWei !== 'string') {
        return res.status(400).json({ error: 'correctAmountWei required (string)' });
      }

      const result = await moneyService.creditDepositShortfall(txHash, correctAmountWei);
      return res.status(200).json({
        ok: true,
        wallet: result.wallet,
        shortfallCredited: result.shortfallCredited,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error('Error in admin deposit/credit-shortfall:', error);
      const status = message.includes('No credited deposit found') ? 404 : 400;
      return res.status(status).json({ error: message });
    }
  });

  app.get('/api/player/:address/balance', async (req, res) => {
    try {
      const balance = await moneyService.getAuthoritativeBalance(req.params.address);
      return res.status(200).json({ balance });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error('Error fetching player balance:', error);
      return res.status(statusForMoneyError(message)).json({ error: message });
    }
  });

  app.post('/api/withdraw', async (req, res) => {
    try {
      const { address, amount } = req.body ?? {};
      const result = await moneyService.enqueueWithdrawal(address, amount);
      return res.status(202).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error('Withdrawal enqueue error:', error);
      return res.status(statusForMoneyError(message)).json({ error: message });
    }
  });

  app.get('/api/withdraw/status/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;
      if (!jobId) return res.status(400).json({ error: 'jobId required' });

      const job = await moneyService.getWithdrawalStatus(jobId);
      if (!job) return res.status(404).json({ error: 'Job not found' });
      return res.status(200).json(job);
    } catch (error) {
      logger.error('Withdraw status error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/withdraw/pending', async (req, res) => {
    try {
      const address = req.query.address as string;
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ error: 'address required' });
      }

      const job = await moneyService.getPendingWithdrawal(address);
      return res.status(200).json({ job });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error('Withdraw pending error:', error);
      return res.status(statusForMoneyError(message)).json({ error: message });
    }
  });

  app.get('/api/admin/pending-transfers', async (req, res) => {
    try {
      const type = String(req.query.type || 'deposits').toLowerCase();
      const limit = Math.min(Math.max(parseInt(String(req.query.limit || '25'), 10) || 25, 1), 100);
      const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);

      if (type !== 'deposits' && type !== 'withdrawals') {
        return res.status(400).json({ error: 'type must be "deposits" or "withdrawals"' });
      }

      const rows = await moneyService.listPendingTransfers(type, limit, offset);
      sendJson(res, { type, rows, limit, offset, hasMore: rows.length === limit });
    } catch (error) {
      logger.error('Error fetching admin pending transfers:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/withdrawals/refund-expired', async (req, res) => {
    try {
      const address = (req.body?.address ?? req.query?.address) as string | undefined;
      const force = (req.body?.force ?? req.query?.force) === true || (req.body?.force ?? req.query?.force) === 'true';
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ error: 'address required (body or query)' });
      }
      const result = await moneyService.refundExpiredPendingWithdrawal(address, force);
      if (result.status === 'marked_completed') {
        return res.status(400).json({ error: result.message ?? 'Withdrawal already completed on-chain' });
      }
      sendJson(res, result);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('No expired pending withdrawal found')) {
        return res.status(404).json({ error: error.message });
      }
      if (error instanceof Error && error.message.startsWith('Could not verify on-chain whether the withdrawal was used.')) {
        return res.status(503).json({ error: error.message });
      }
      logger.error('Error refunding expired withdrawal:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
}
