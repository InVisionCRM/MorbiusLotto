"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMerkleReadRoutes = registerMerkleReadRoutes;
const json_1 = require("../http/json");
const logger_1 = require("../utils/logger");
function registerMerkleReadRoutes({ app, merkleDropsService, merkleDropsLPService, }) {
    app.get('/api/merkle/epochs', async (_req, res) => {
        try {
            const epochs = await merkleDropsService.listPublishedEpochs();
            (0, json_1.sendJson)(res, epochs);
        }
        catch (error) {
            logger_1.logger.error('Error listing merkle epochs:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/merkle/claim/:epochNumber/:walletAddress', async (req, res) => {
        try {
            const epochNumber = parseInt(req.params.epochNumber, 10);
            const { walletAddress } = req.params;
            if (isNaN(epochNumber) || epochNumber < 1) {
                res.status(400).json({ error: 'Invalid epoch number' });
                return;
            }
            if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
                res.status(400).json({ error: 'Invalid wallet address' });
                return;
            }
            const proof = await merkleDropsService.getClaimProof(epochNumber, walletAddress);
            if (!proof) {
                res.status(404).json({ error: 'No claim found for this wallet in this epoch' });
                return;
            }
            (0, json_1.sendJson)(res, proof);
        }
        catch (error) {
            logger_1.logger.error('Error fetching merkle claim proof:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/merkle/schedule', async (_req, res) => {
        try {
            const s = await merkleDropsService.getSettings();
            const type = s.schedule_type;
            let next_drop_at = null;
            if (type !== 'manual') {
                const now = new Date();
                if (type === 'interval_minutes' || type === 'interval_hours') {
                    const interval = parseInt(s.schedule_interval ?? '60', 10) || 1;
                    const intervalMs = type === 'interval_minutes' ? interval * 60_000 : interval * 3_600_000;
                    const nextMs = Math.ceil(now.getTime() / intervalMs) * intervalMs;
                    const next = new Date(nextMs <= now.getTime() ? nextMs + intervalMs : nextMs);
                    next_drop_at = next.toISOString();
                }
                else {
                    const day = parseInt(s.schedule_day, 10);
                    const hour = parseInt(s.schedule_hour_utc, 10);
                    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0));
                    if (type === 'weekly' || type === 'biweekly') {
                        let daysAhead = day - now.getUTCDay();
                        if (daysAhead < 0 || (daysAhead === 0 && now.getUTCHours() >= hour))
                            daysAhead += 7;
                        if (type === 'biweekly' && daysAhead < 7)
                            daysAhead += 7;
                        next.setUTCDate(now.getUTCDate() + daysAhead);
                    }
                    else if (type === 'monthly') {
                        next.setUTCDate(day);
                        if (next <= now) {
                            next.setUTCMonth(next.getUTCMonth() + 1);
                            next.setUTCDate(day);
                        }
                    }
                    next_drop_at = next.toISOString();
                }
            }
            const countdown_duration = parseInt(s.countdown_duration ?? '0', 10) || 0;
            (0, json_1.sendJson)(res, { schedule_type: type, next_drop_at, countdown_duration });
        }
        catch (error) {
            logger_1.logger.error('Error fetching merkle schedule:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/merkle-lp/epochs', async (_req, res) => {
        try {
            const epochs = await merkleDropsLPService.listPublishedEpochs();
            (0, json_1.sendJson)(res, epochs);
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.get('/api/merkle-lp/claim/:epochNumber/:walletAddress', async (req, res) => {
        try {
            const epochNumber = parseInt(req.params.epochNumber, 10);
            const walletAddress = req.params.walletAddress;
            if (!walletAddress || !walletAddress.startsWith('0x')) {
                res.status(400).json({ error: 'Invalid wallet address' });
                return;
            }
            const proof = await merkleDropsLPService.getClaimProof(epochNumber, walletAddress);
            if (!proof) {
                res.status(404).json({ error: 'No claim found' });
                return;
            }
            (0, json_1.sendJson)(res, proof);
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.get('/api/merkle-lp/schedule', async (_req, res) => {
        try {
            const info = await merkleDropsLPService.getScheduleInfo();
            (0, json_1.sendJson)(res, info);
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
}
//# sourceMappingURL=merkle.routes.js.map