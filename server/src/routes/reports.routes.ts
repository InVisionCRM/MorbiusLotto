import type { Express } from 'express';
import { DatabaseService } from '../services/database.service';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterReportRoutesOptions {
  app: Express;
  dbService: DatabaseService;
}

const anonReportCounts = new Map<string, { count: number; resetAt: number }>();

export function registerReportRoutes({
  app,
  dbService,
}: RegisterReportRoutesOptions): void {
  app.post('/api/reports', async (req, res) => {
    try {
      const { walletAddress, category, description, pageUrl, userAgent, balanceSnapshot, recentErrors } = req.body;
      const VALID_CATEGORIES = ['Balance Issue', 'Game Bug', 'Transaction Failed', 'Other'];
      if (!category || !VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
      }
      if (!description || typeof description !== 'string' || description.trim().length < 5) {
        return res.status(400).json({ error: 'description must be at least 5 characters' });
      }
      if (description.length > 2000) {
        return res.status(400).json({ error: 'description must be 2000 characters or fewer' });
      }

      if (walletAddress && typeof walletAddress === 'string') {
        const recent = await dbService.getRecentReportCountByWallet(walletAddress, 60);
        if (recent >= 5) {
          return res.status(429).json({ error: 'Too many reports. Please wait before submitting another.' });
        }
      } else {
        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        const entry = anonReportCounts.get(ip);
        if (entry && now < entry.resetAt) {
          if (entry.count >= 3) {
            return res.status(429).json({ error: 'Too many reports. Please wait before submitting another.' });
          }
          entry.count++;
        } else {
          anonReportCounts.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
        }
      }

      const id = await dbService.createReport({
        walletAddress: walletAddress || undefined,
        category,
        description: description.trim(),
        pageUrl: typeof pageUrl === 'string' ? pageUrl.slice(0, 500) : undefined,
        userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 300) : undefined,
        balanceSnapshot: balanceSnapshot != null ? BigInt(String(balanceSnapshot)) : undefined,
        recentErrors: Array.isArray(recentErrors) ? recentErrors.slice(0, 20) : undefined,
      });

      logger.info('User report submitted', { id, category, walletAddress: walletAddress || null });
      return res.status(201).json({ ok: true, id });
    } catch (error) {
      logger.error('Error creating user report:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/reports', async (req, res) => {
    try {
      const status = (req.query.status as string) || undefined;
      const limit = Math.min(Math.max(parseInt(String(req.query.limit || 200), 10) || 200, 1), 500);
      const reports = await dbService.getReports(status, limit);
      sendJson(res, reports);
    } catch (error) {
      logger.error('Error fetching user reports:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.patch('/api/admin/reports/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (!status || !['read', 'resolved'].includes(status)) {
        return res.status(400).json({ error: 'status must be "read" or "resolved"' });
      }
      const updated = await dbService.updateReportStatus(id, status as 'read' | 'resolved');
      if (!updated) return res.status(404).json({ error: 'Report not found' });
      return res.status(200).json({ ok: true });
    } catch (error) {
      logger.error('Error updating report status:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
}
