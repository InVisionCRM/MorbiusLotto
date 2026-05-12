"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMerkleAdminMutationRoutes = registerMerkleAdminMutationRoutes;
const json_1 = require("../http/json");
const logger_1 = require("../utils/logger");
function registerMerkleAdminMutationRoutes({ app, merkleDropsService, merkleDropsLPService, }) {
    app.post('/api/admin/merkle/epoch/create', async (req, res) => {
        try {
            const { minHoldingThreshold, snapshotBlock } = req.body;
            const epoch = await merkleDropsService.createEpoch({
                minHoldingThreshold: minHoldingThreshold ?? 1000,
                snapshotBlock,
            });
            (0, json_1.sendJson)(res, epoch);
        }
        catch (error) {
            logger_1.logger.error('Error creating merkle epoch:', error);
            res.status(500).json({ error: String(error) });
        }
    });
    app.post('/api/admin/merkle/epoch/:epochId/snapshot', async (req, res) => {
        try {
            const epochId = parseInt(req.params.epochId, 10);
            const { snapshotBlock } = req.body;
            await merkleDropsService.takeSnapshot(epochId, snapshotBlock);
            const epoch = await merkleDropsService.getEpoch(epochId);
            (0, json_1.sendJson)(res, epoch);
        }
        catch (error) {
            logger_1.logger.error('Error running merkle snapshot:', error);
            res.status(500).json({ error: String(error) });
        }
    });
    app.post('/api/admin/merkle/epoch/:epochId/calculate', async (req, res) => {
        try {
            const epochId = parseInt(req.params.epochId, 10);
            const body = req.body;
            const newRewardAmount = body.newRewardAmount || body.totalRewardAmount;
            if (!newRewardAmount) {
                res.status(400).json({ error: 'newRewardAmount (wei string) required' });
                return;
            }
            await merkleDropsService.calculateRewards(epochId, newRewardAmount);
            const epoch = await merkleDropsService.getEpoch(epochId);
            (0, json_1.sendJson)(res, epoch);
        }
        catch (error) {
            logger_1.logger.error('Error calculating merkle rewards:', error);
            res.status(500).json({ error: String(error) });
        }
    });
    app.post('/api/admin/merkle/epoch/:epochId/finalize', async (req, res) => {
        try {
            const epochId = parseInt(req.params.epochId, 10);
            const root = await merkleDropsService.generateMerkleTree(epochId);
            const epoch = await merkleDropsService.getEpoch(epochId);
            (0, json_1.sendJson)(res, { root, epoch });
        }
        catch (error) {
            logger_1.logger.error('Error finalizing merkle epoch:', error);
            res.status(500).json({ error: String(error) });
        }
    });
    app.post('/api/admin/merkle/epoch/:epochId/publish', async (req, res) => {
        try {
            const epochId = parseInt(req.params.epochId, 10);
            await merkleDropsService.markPublished(epochId);
            const epoch = await merkleDropsService.getEpoch(epochId);
            (0, json_1.sendJson)(res, epoch);
        }
        catch (error) {
            logger_1.logger.error('Error publishing merkle epoch:', error);
            res.status(500).json({ error: String(error) });
        }
    });
    app.post('/api/admin/merkle/epoch/:epochId/revoke', async (req, res) => {
        try {
            const epochId = parseInt(req.params.epochId, 10);
            await merkleDropsService.revokeEpoch(epochId);
            const epoch = await merkleDropsService.getEpoch(epochId);
            (0, json_1.sendJson)(res, epoch);
        }
        catch (error) {
            logger_1.logger.error('Error revoking merkle epoch:', error);
            res.status(500).json({ error: String(error) });
        }
    });
    app.post('/api/admin/merkle/blocklist', async (req, res) => {
        try {
            const { address, reason } = req.body;
            if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
                res.status(400).json({ error: 'Valid 0x address required' });
                return;
            }
            await merkleDropsService.addToBlocklist(address, reason ?? '');
            res.status(200).json({ ok: true });
        }
        catch (error) {
            logger_1.logger.error('Error adding to blocklist:', error);
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
        }
        catch (error) {
            logger_1.logger.error('Error removing from blocklist:', error);
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
                'reclaim_stale_enabled',
                'reclaim_stale_age_days',
                'reclaim_min_epochs_back',
            ]);
            const patch = {};
            for (const [k, v] of Object.entries(req.body)) {
                if (allowed.has(k) && typeof v === 'string')
                    patch[k] = v;
            }
            if (Object.keys(patch).length === 0) {
                res.status(400).json({ error: 'No valid settings keys provided' });
                return;
            }
            await merkleDropsService.updateSettings(patch);
            const updated = await merkleDropsService.getSettings();
            (0, json_1.sendJson)(res, updated);
        }
        catch (error) {
            logger_1.logger.error('Error updating merkle settings:', error);
            res.status(500).json({ error: String(error) });
        }
    });
    app.post('/api/admin/merkle-lp/epoch/create', async (_req, res) => {
        try {
            const epoch = await merkleDropsLPService.createEpoch({});
            (0, json_1.sendJson)(res, epoch);
        }
        catch (error) {
            logger_1.logger.error('Error creating LP epoch:', error);
            res.status(500).json({ error: String(error) });
        }
    });
    app.post('/api/admin/merkle-lp/epoch/:epochId/snapshot', async (req, res) => {
        try {
            const epochId = parseInt(req.params.epochId, 10);
            const { snapshotBlock } = req.body;
            await merkleDropsLPService.takeSnapshot(epochId, snapshotBlock);
            const epoch = await merkleDropsLPService.getEpoch(epochId);
            (0, json_1.sendJson)(res, epoch);
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.post('/api/admin/merkle-lp/epoch/:epochId/calculate', async (req, res) => {
        try {
            const epochId = parseInt(req.params.epochId, 10);
            const { newRewardAmount } = req.body;
            if (!newRewardAmount) {
                res.status(400).json({ error: 'newRewardAmount required' });
                return;
            }
            await merkleDropsLPService.calculateRewards(epochId, newRewardAmount);
            const epoch = await merkleDropsLPService.getEpoch(epochId);
            (0, json_1.sendJson)(res, epoch);
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.post('/api/admin/merkle-lp/epoch/:epochId/finalize', async (req, res) => {
        try {
            const epochId = parseInt(req.params.epochId, 10);
            const root = await merkleDropsLPService.generateMerkleTree(epochId);
            const epoch = await merkleDropsLPService.getEpoch(epochId);
            (0, json_1.sendJson)(res, { root, epoch });
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.post('/api/admin/merkle-lp/epoch/:epochId/publish', async (req, res) => {
        try {
            const epochId = parseInt(req.params.epochId, 10);
            await merkleDropsLPService.markPublished(epochId);
            const epoch = await merkleDropsLPService.getEpoch(epochId);
            (0, json_1.sendJson)(res, epoch);
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.post('/api/admin/merkle-lp/epoch/:epochId/revoke', async (req, res) => {
        try {
            const epochId = parseInt(req.params.epochId, 10);
            await merkleDropsLPService.revokeEpoch(epochId);
            const epoch = await merkleDropsLPService.getEpoch(epochId);
            (0, json_1.sendJson)(res, epoch);
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.post('/api/admin/merkle-lp/pairs', async (req, res) => {
        try {
            const { pairAddress, label, dexName } = req.body;
            if (!pairAddress || !label) {
                res.status(400).json({ error: 'pairAddress and label required' });
                return;
            }
            const pair = await merkleDropsLPService.addPair(pairAddress, label, dexName);
            (0, json_1.sendJson)(res, pair);
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.patch('/api/admin/merkle-lp/pairs/:address', async (req, res) => {
        try {
            const { active } = req.body;
            await merkleDropsLPService.setPairActive(req.params.address, active);
            res.status(200).json({ ok: true });
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.delete('/api/admin/merkle-lp/pairs/:address', async (req, res) => {
        try {
            await merkleDropsLPService.removePair(req.params.address);
            res.status(200).json({ ok: true });
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.post('/api/admin/merkle-lp/blocklist', async (req, res) => {
        try {
            const { address, reason } = req.body;
            if (!address) {
                res.status(400).json({ error: 'address required' });
                return;
            }
            await merkleDropsLPService.addToBlocklist(address, reason ?? '');
            res.status(200).json({ ok: true });
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.delete('/api/admin/merkle-lp/blocklist/:address', async (req, res) => {
        try {
            await merkleDropsLPService.removeFromBlocklist(req.params.address);
            res.status(200).json({ ok: true });
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.post('/api/admin/merkle-lp/settings', async (req, res) => {
        try {
            const patch = req.body;
            if (!patch || typeof patch !== 'object') {
                res.status(400).json({ error: 'Invalid body' });
                return;
            }
            await merkleDropsLPService.updateSettings(patch);
            (0, json_1.sendJson)(res, await merkleDropsLPService.getSettings());
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    // ── Stale-snapshot reclamation (holder + LP) ─────────────────────────────
    // Preview is a dry-run: returns the candidate epochs and whether each is
    // revocable on-chain (epochClaimedAmount == 0). Execute does the on-chain
    // revoke + DB update; never marks a snapshot reclaimed unless the on-chain
    // revoke for that epoch succeeded.
    app.get('/api/admin/merkle/reclaim/preview', async (_req, res) => {
        try {
            (0, json_1.sendJson)(res, await merkleDropsService.previewReclaimStaleSnapshots());
        }
        catch (error) {
            logger_1.logger.error('Error previewing merkle reclaim:', error);
            res.status(500).json({ error: String(error) });
        }
    });
    app.post('/api/admin/merkle/reclaim/execute', async (_req, res) => {
        try {
            const out = await merkleDropsService.reclaimStaleSnapshots();
            (0, json_1.sendJson)(res, out);
        }
        catch (error) {
            logger_1.logger.error('Error executing merkle reclaim:', error);
            res.status(500).json({ error: String(error) });
        }
    });
    app.get('/api/admin/merkle-lp/reclaim/preview', async (_req, res) => {
        try {
            (0, json_1.sendJson)(res, await merkleDropsLPService.previewReclaimStaleSnapshots());
        }
        catch (error) {
            logger_1.logger.error('Error previewing LP reclaim:', error);
            res.status(500).json({ error: String(error) });
        }
    });
    app.post('/api/admin/merkle-lp/reclaim/execute', async (_req, res) => {
        try {
            const out = await merkleDropsLPService.reclaimStaleSnapshots();
            (0, json_1.sendJson)(res, out);
        }
        catch (error) {
            logger_1.logger.error('Error executing LP reclaim:', error);
            res.status(500).json({ error: String(error) });
        }
    });
}
//# sourceMappingURL=merkle-admin-mutation.routes.js.map