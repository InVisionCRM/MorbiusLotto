import type { Express } from 'express';
import { TournamentService } from '../services/tournament.service';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterTournamentReadRoutesOptions {
  app: Express;
  tournamentService: TournamentService;
}

export function registerTournamentReadRoutes({
  app,
  tournamentService,
}: RegisterTournamentReadRoutesOptions): void {
  app.get('/api/tournament/active', async (_req, res) => {
    try {
      const tournament = await tournamentService.getActiveTournament();
      const entryCount = await tournamentService.getTournamentEntryCount(tournament.id);
      sendJson(res, {
        ...tournament,
        buy_in_amount: tournament.buy_in_amount.toString(),
        prize_pool: tournament.prize_pool.toString(),
        entryCount,
      });
    } catch (error) {
      logger.error('Error fetching active tournament:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/tournament/:tournamentId/leaderboard', async (req, res) => {
    try {
      const { tournamentId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const leaderboard = await tournamentService.getLeaderboard(tournamentId, limit);
      sendJson(res, leaderboard);
    } catch (error) {
      logger.error('Error fetching tournament leaderboard:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/tournament/player/:address/state', async (req, res) => {
    try {
      const { address } = req.params;
      const state = await tournamentService.getTournamentState(address);
      if (!state) {
        return res.json({ inTournament: false });
      }
      sendJson(res, { inTournament: true, ...state });
    } catch (error) {
      logger.error('Error fetching player tournament state:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/tournament/player/:address/history', async (req, res) => {
    try {
      const { address } = req.params;
      if (!address || address.length < 20) {
        return res.status(400).json({ error: 'Valid player address required' });
      }
      const history = await tournamentService.getPlayerTournamentHistory(address);
      sendJson(
        res,
        history.map((item) => ({
          ...item,
          prizeWon: item.prizeWon.toString(),
        })),
      );
    } catch (error) {
      logger.error('Error fetching player tournament history:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

interface RegisterTournamentMutationRoutesOptions {
  app: Express;
  tournamentService: TournamentService;
}

export function registerTournamentMutationRoutes({
  app,
  tournamentService,
}: RegisterTournamentMutationRoutesOptions): void {
  app.post('/api/tournament/:tournamentId/cancel', async (req, res) => {
    try {
      const { tournamentId } = req.params;
      const { cancellerAddress } = req.body;

      if (!cancellerAddress || typeof cancellerAddress !== 'string') {
        return res.status(400).json({ error: 'cancellerAddress is required' });
      }

      await tournamentService.cancelTournament(tournamentId, cancellerAddress);
      sendJson(res, { success: true, message: 'Tournament cancelled successfully' });
    } catch (error: any) {
      logger.error('Error cancelling tournament:', error);
      const status = error.message?.includes('not found')
        ? 404
        : error.message?.includes('Only the tournament creator')
          ? 403
          : error.message?.includes('Cannot cancel')
            ? 400
            : 500;
      res.status(status).json({ error: error.message || 'Internal server error' });
    }
  });

  app.post('/api/tournament/:tournamentId/reclaim', async (req, res) => {
    try {
      const { tournamentId } = req.params;
      const { creatorAddress } = req.body;

      if (!creatorAddress || typeof creatorAddress !== 'string') {
        return res.status(400).json({ error: 'creatorAddress is required' });
      }

      const result = await tournamentService.creatorReclaimFunds(tournamentId, creatorAddress);
      if (result.success) {
        sendJson(res, { success: true, txHash: result.txHash, message: 'Funds reclaimed successfully' });
      } else {
        res.status(400).json({ error: result.error || 'Failed to reclaim funds' });
      }
    } catch (error: any) {
      logger.error('Error reclaiming tournament funds:', error);
      const status = error.message?.includes('not found')
        ? 404
        : error.message?.includes('Only the tournament creator')
          ? 403
          : error.message?.includes('must be cancelled')
            ? 400
            : 500;
      res.status(status).json({ error: error.message || 'Internal server error' });
    }
  });
}
