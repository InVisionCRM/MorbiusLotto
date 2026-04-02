import type { Express } from 'express';
import { MerkleDropsLPService } from '../services/merkle-lp-drops.service';
import { MerkleDropsService } from '../services/merkle-drops.service';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterMerkleAdminMutationRoutesOptions {
  app: Express;
  merkleDropsService: MerkleDropsService;
  merkleDropsLPService: MerkleDropsLPService;
}

export function registerMerkleAdminMutationRoutes({
  app,
  merkleDropsService,
  merkleDropsLPService,
}: RegisterMerkleAdminMutationRoutesOptions): void {
  app.post('/api/admin/merkle/epoch/create', async (req, res) => {
    try {
      const { minHoldingThreshold, snapshotBlock } = req.body as {
        minHoldingThreshold?: number;
        snapshotBlock?: number;
      };
      const epoch = await merkleDropsService.createEpoch({
        minHoldingThreshold: minHoldingThreshold ?? 1000,
        snapshotBlock,
      });
      sendJson(res, epoch);
    } catch (error) {
      logger.error('Error creating merkle epoch:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/admin/merkle/epoch/:epochId/snapshot', async (req, res) => {
    try {
      const epochId = parseInt(req.params.epochId, 10);
      const { snapshotBlock } = req.body as { snapshotBlock?: number };
      await merkleDropsService.takeSnapshot(epochId, snapshotBlock);
      const epoch = await merkleDropsService.getEpoch(epochId);
      sendJson(res, epoch);
    } catch (error) {
      logger.error('Error running merkle snapshot:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/admin/merkle/epoch/:epochId/calculate', async (req, res) => {
    try {
      const epochId = parseInt(req.params.epochId, 10);
      const body = req.body as { newRewardAmount?: string; totalRewardAmount?: string };
      const newRewardAmount = body.newRewardAmount || body.totalRewardAmount;
      if (!newRewardAmount) {
        res.status(400).json({ error: 'newRewardAmount (wei string) required' });
        return;
      }
      await merkleDropsService.calculateRewards(epochId, newRewardAmount);
      const epoch = await merkleDropsService.getEpoch(epochId);
      sendJson(res, epoch);
    } catch (error) {
      logger.error('Error calculating merkle rewards:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/admin/merkle/epoch/:epochId/finalize', async (req, res) => {
    try {
      const epochId = parseInt(req.params.epochId, 10);
      const root = await merkleDropsService.generateMerkleTree(epochId);
      const epoch = await merkleDropsService.getEpoch(epochId);
      sendJson(res, { root, epoch });
    } catch (error) {
      logger.error('Error finalizing merkle epoch:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/admin/merkle/epoch/:epochId/publish', async (req, res) => {
    try {
      const epochId = parseInt(req.params.epochId, 10);
      await merkleDropsService.markPublished(epochId);
      const epoch = await merkleDropsService.getEpoch(epochId);
      sendJson(res, epoch);
    } catch (error) {
      logger.error('Error publishing merkle epoch:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/admin/merkle/epoch/:epochId/revoke', async (req, res) => {
    try {
      const epochId = parseInt(req.params.epochId, 10);
      await merkleDropsService.revokeEpoch(epochId);
      const epoch = await merkleDropsService.getEpoch(epochId);
      sendJson(res, epoch);
    } catch (error) {
      logger.error('Error revoking merkle epoch:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/admin/merkle/blocklist', async (req, res) => {
    try {
      const { address, reason } = req.body as { address?: string; reason?: string };
      if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
        res.status(400).json({ error: 'Valid 0x address required' });
        return;
      }
      await merkleDropsService.addToBlocklist(address, reason ?? '');
      res.status(200).json({ ok: true });
    } catch (error) {
      logger.error('Error adding to blocklist:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/admin/merkle/blocklist/:address', async (req, res) => {
    try {
      const { address } = req.params;
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        res.status(400).json({ error: 'Invalid address' });
        return;
      }
      await merkleDropsService.removeFromBlocklist(address);
      res.status(200).json({ ok: true });
    } catch (error) {
      logger.error('Error removing from blocklist:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/merkle/settings', async (req, res) => {
    try {
      const allowed = new Set([
        'schedule_type',
        'schedule_day',
        'schedule_hour_utc',
        'schedule_interval',
        'default_reward_wei',
        'auto_publish_onchain',
        'countdown_duration',
      ]);
      const patch: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.body as Record<string, unknown>)) {
        if (allowed.has(k) && typeof v === 'string') patch[k] = v;
      }
      if (Object.keys(patch).length === 0) {
        res.status(400).json({ error: 'No valid settings keys provided' });
        return;
      }
      await merkleDropsService.updateSettings(patch);
      const updated = await merkleDropsService.getSettings();
      sendJson(res, updated);
    } catch (error) {
      logger.error('Error updating merkle settings:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/admin/merkle-lp/epoch/create', async (_req, res) => {
    try {
      const epoch = await merkleDropsLPService.createEpoch({});
      sendJson(res, epoch);
    } catch (error) {
      logger.error('Error creating LP epoch:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/admin/merkle-lp/epoch/:epochId/snapshot', async (req, res) => {
    try {
      const epochId = parseInt(req.params.epochId, 10);
      const { snapshotBlock } = req.body as { snapshotBlock?: number };
      await merkleDropsLPService.takeSnapshot(epochId, snapshotBlock);
      const epoch = await merkleDropsLPService.getEpoch(epochId);
      sendJson(res, epoch);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/admin/merkle-lp/epoch/:epochId/calculate', async (req, res) => {
    try {
      const epochId = parseInt(req.params.epochId, 10);
      const { newRewardAmount } = req.body as { newRewardAmount?: string };
      if (!newRewardAmount) {
        res.status(400).json({ error: 'newRewardAmount required' });
        return;
      }
      await merkleDropsLPService.calculateRewards(epochId, newRewardAmount);
      const epoch = await merkleDropsLPService.getEpoch(epochId);
      sendJson(res, epoch);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/admin/merkle-lp/epoch/:epochId/finalize', async (req, res) => {
    try {
      const epochId = parseInt(req.params.epochId, 10);
      const root = await merkleDropsLPService.generateMerkleTree(epochId);
      const epoch = await merkleDropsLPService.getEpoch(epochId);
      sendJson(res, { root, epoch });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/admin/merkle-lp/epoch/:epochId/publish', async (req, res) => {
    try {
      const epochId = parseInt(req.params.epochId, 10);
      await merkleDropsLPService.markPublished(epochId);
      const epoch = await merkleDropsLPService.getEpoch(epochId);
      sendJson(res, epoch);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/admin/merkle-lp/epoch/:epochId/revoke', async (req, res) => {
    try {
      const epochId = parseInt(req.params.epochId, 10);
      await merkleDropsLPService.revokeEpoch(epochId);
      const epoch = await merkleDropsLPService.getEpoch(epochId);
      sendJson(res, epoch);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/admin/merkle-lp/pairs', async (req, res) => {
    try {
      const { pairAddress, label, dexName } = req.body as {
        pairAddress: string;
        label: string;
        dexName?: string;
      };
      if (!pairAddress || !label) {
        res.status(400).json({ error: 'pairAddress and label required' });
        return;
      }
      const pair = await merkleDropsLPService.addPair(pairAddress, label, dexName);
      sendJson(res, pair);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.patch('/api/admin/merkle-lp/pairs/:address', async (req, res) => {
    try {
      const { active } = req.body as { active: boolean };
      await merkleDropsLPService.setPairActive(req.params.address, active);
      res.status(200).json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.delete('/api/admin/merkle-lp/pairs/:address', async (req, res) => {
    try {
      await merkleDropsLPService.removePair(req.params.address);
      res.status(200).json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/admin/merkle-lp/blocklist', async (req, res) => {
    try {
      const { address, reason } = req.body as { address: string; reason?: string };
      if (!address) {
        res.status(400).json({ error: 'address required' });
        return;
      }
      await merkleDropsLPService.addToBlocklist(address, reason ?? '');
      res.status(200).json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.delete('/api/admin/merkle-lp/blocklist/:address', async (req, res) => {
    try {
      await merkleDropsLPService.removeFromBlocklist(req.params.address);
      res.status(200).json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/admin/merkle-lp/settings', async (req, res) => {
    try {
      const patch = req.body as Record<string, string>;
      if (!patch || typeof patch !== 'object') {
        res.status(400).json({ error: 'Invalid body' });
        return;
      }
      await merkleDropsLPService.updateSettings(patch);
      sendJson(res, await merkleDropsLPService.getSettings());
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });
}
