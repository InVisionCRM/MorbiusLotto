import type { Express } from 'express';
import { DatabaseService } from '../services/database.service';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterPokerReadRoutesOptions {
  app: Express;
  dbService: DatabaseService;
}

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerPokerReadRoutes({
  app,
  dbService,
}: RegisterPokerReadRoutesOptions): void {
  app.get('/api/poker/player/:address/hands', async (req, res) => {
    try {
      const { address } = req.params;
      if (!address || !ADDRESS_REGEX.test(address)) {
        return res.status(400).json({ error: 'Invalid address' });
      }
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 25_000);
      const offset = parseInt(req.query.offset as string) || 0;
      const hands = await dbService.getPokerPlayerHands(address, limit, offset);
      sendJson(res, hands);
    } catch (error) {
      logger.error('Error fetching poker player hands:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/poker/player/:address/stats', async (req, res) => {
    try {
      const { address } = req.params;
      if (!address || !ADDRESS_REGEX.test(address)) {
        return res.status(400).json({ error: 'Invalid address' });
      }
      const rawScope = String(req.query.scope ?? 'cash');
      const scope: 'cash' | 'tournament' | 'all' =
        rawScope === 'tournament' || rawScope === 'all' ? rawScope : 'cash';
      const stats = await dbService.getPokerPlayerStats(address, scope);
      sendJson(res, stats);
    } catch (error) {
      logger.error('Error fetching poker player stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/poker/table/:tableId/dashboard', async (req, res) => {
    try {
      const { tableId } = req.params;
      if (!tableId || !UUID_REGEX.test(tableId)) {
        return res.status(400).json({ error: 'Invalid table ID' });
      }
      const data = await dbService.getPokerTableDashboardStats(tableId);
      if (!data.table) {
        return res.status(404).json({ error: 'Table not found' });
      }
      sendJson(res, data);
    } catch (error) {
      logger.error('Error fetching poker table dashboard:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/poker/table/:tableId/player/:address/stats', async (req, res) => {
    try {
      const { tableId, address } = req.params;
      if (!tableId || !UUID_REGEX.test(tableId)) {
        return res.status(400).json({ error: 'Invalid table ID' });
      }
      if (!address || !ADDRESS_REGEX.test(address)) {
        return res.status(400).json({ error: 'Invalid address' });
      }
      const data = await dbService.getPokerPlayerTableStats(tableId, address);
      sendJson(res, data);
    } catch (error) {
      logger.error('Error fetching poker player table stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/poker/hands/:handId', async (req, res) => {
    try {
      const { handId } = req.params;
      const playerAddress = req.query.playerAddress as string | undefined;
      if (!handId || !UUID_REGEX.test(handId)) {
        return res.status(400).json({ error: 'Invalid hand ID' });
      }
      if (!playerAddress || !ADDRESS_REGEX.test(playerAddress)) {
        return res.status(400).json({ error: 'Invalid playerAddress query' });
      }
      const detail = await dbService.getPokerHandDetail(handId, playerAddress);
      if (!detail) {
        return res.status(404).json({ error: 'Hand not found' });
      }
      sendJson(res, detail);
    } catch (error) {
      logger.error('Error fetching poker hand detail:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
