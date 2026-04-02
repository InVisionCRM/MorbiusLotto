import type { Express } from 'express';
import { MerkleDropsLPService } from '../services/merkle-lp-drops.service';
import { MerkleDropsService } from '../services/merkle-drops.service';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterMerkleAdminReadRoutesOptions {
  app: Express;
  merkleDropsService: MerkleDropsService;
  merkleDropsLPService: MerkleDropsLPService;
}

export function registerMerkleAdminReadRoutes({
  app,
  merkleDropsService,
  merkleDropsLPService,
}: RegisterMerkleAdminReadRoutesOptions): void {
  app.get('/api/admin/merkle/epochs', async (_req, res) => {
    try {
      const epochs = await merkleDropsService.listEpochs();
      sendJson(res, epochs);
    } catch (error) {
      logger.error('Error listing admin merkle epochs:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/merkle/epoch/:epochId', async (req, res) => {
    try {
      const epochId = parseInt(req.params.epochId, 10);
      const epoch = await merkleDropsService.getEpoch(epochId);
      if (!epoch) {
        res.status(404).json({ error: 'Epoch not found' });
        return;
      }
      sendJson(res, epoch);
    } catch (error) {
      logger.error('Error fetching merkle epoch:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/merkle/epoch/:epochId/snapshot', async (req, res) => {
    try {
      const epochId = parseInt(req.params.epochId, 10);
      const page = Math.max(1, parseInt(String(req.query.page || 1), 10));
      const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize || 50), 10)));
      const data = await merkleDropsService.getSnapshotPage(epochId, page, pageSize);
      sendJson(res, data);
    } catch (error) {
      logger.error('Error fetching snapshot page:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/merkle/blocklist', async (_req, res) => {
    try {
      const list = await merkleDropsService.listBlocklist();
      sendJson(res, list);
    } catch (error) {
      logger.error('Error listing blocklist:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/merkle/settings', async (_req, res) => {
    try {
      const settings = await merkleDropsService.getSettings();
      sendJson(res, settings);
    } catch (error) {
      logger.error('Error fetching merkle settings:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/admin/merkle-lp/epochs', async (_req, res) => {
    try {
      const epochs = await merkleDropsLPService.listEpochs();
      sendJson(res, epochs);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/admin/merkle-lp/epoch/:epochId', async (req, res) => {
    try {
      const epochId = parseInt(req.params.epochId, 10);
      const epoch = await merkleDropsLPService.getEpoch(epochId);
      if (!epoch) {
        res.status(404).json({ error: 'Epoch not found' });
        return;
      }
      sendJson(res, epoch);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/admin/merkle-lp/epoch/:epochId/snapshot', async (req, res) => {
    try {
      const epochId = parseInt(req.params.epochId, 10);
      const page = Math.max(1, parseInt(String(req.query.page || 1), 10));
      const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize || 50), 10)));
      const data = await merkleDropsLPService.getSnapshotPage(epochId, page, pageSize);
      sendJson(res, data);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/admin/merkle-lp/pairs', async (_req, res) => {
    try {
      const pairs = await merkleDropsLPService.listPairs();
      sendJson(res, pairs);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/admin/merkle-lp/blocklist', async (_req, res) => {
    try {
      sendJson(res, await merkleDropsLPService.listBlocklist());
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/admin/merkle-lp/settings', async (_req, res) => {
    try {
      sendJson(res, await merkleDropsLPService.getSettings());
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });
}
