"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMerkleAdminReadRoutes = registerMerkleAdminReadRoutes;
const json_1 = require("../http/json");
const logger_1 = require("../utils/logger");
const merkle_claim_1 = require("../utils/merkle-claim");
const merkle_claim_lp_1 = require("../utils/merkle-claim-lp");
function registerMerkleAdminReadRoutes({ app, merkleDropsService, merkleDropsLPService, }) {
    app.get('/api/admin/merkle/epochs', async (_req, res) => {
        try {
            const epochs = await merkleDropsService.listEpochs();
            (0, json_1.sendJson)(res, epochs);
        }
        catch (error) {
            logger_1.logger.error('Error listing admin merkle epochs:', error);
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
            (0, json_1.sendJson)(res, epoch);
        }
        catch (error) {
            logger_1.logger.error('Error fetching merkle epoch:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/admin/merkle/epoch/:epochId/snapshot', async (req, res) => {
        try {
            const epochId = parseInt(req.params.epochId, 10);
            const page = Math.max(1, parseInt(String(req.query.page || 1), 10));
            const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize || 50), 10)));
            const data = await merkleDropsService.getSnapshotPage(epochId, page, pageSize);
            (0, json_1.sendJson)(res, data);
        }
        catch (error) {
            logger_1.logger.error('Error fetching snapshot page:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/admin/merkle/blocklist', async (_req, res) => {
        try {
            const list = await merkleDropsService.listBlocklist();
            (0, json_1.sendJson)(res, list);
        }
        catch (error) {
            logger_1.logger.error('Error listing blocklist:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.get('/api/admin/merkle/settings', async (_req, res) => {
        try {
            const settings = await merkleDropsService.getSettings();
            (0, json_1.sendJson)(res, settings);
        }
        catch (error) {
            logger_1.logger.error('Error fetching merkle settings:', error);
            res.status(500).json({ error: String(error) });
        }
    });
    app.get('/api/admin/merkle-lp/epochs', async (_req, res) => {
        try {
            const epochs = await merkleDropsLPService.listEpochs();
            (0, json_1.sendJson)(res, epochs);
        }
        catch (error) {
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
            (0, json_1.sendJson)(res, epoch);
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.get('/api/admin/merkle-lp/epoch/:epochId/snapshot', async (req, res) => {
        try {
            const epochId = parseInt(req.params.epochId, 10);
            const page = Math.max(1, parseInt(String(req.query.page || 1), 10));
            const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize || 50), 10)));
            const data = await merkleDropsLPService.getSnapshotPage(epochId, page, pageSize);
            (0, json_1.sendJson)(res, data);
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.get('/api/admin/merkle-lp/pairs', async (_req, res) => {
        try {
            const pairs = await merkleDropsLPService.listPairs();
            (0, json_1.sendJson)(res, pairs);
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.get('/api/admin/merkle-lp/blocklist', async (_req, res) => {
        try {
            (0, json_1.sendJson)(res, await merkleDropsLPService.listBlocklist());
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.get('/api/admin/merkle-lp/settings', async (_req, res) => {
        try {
            (0, json_1.sendJson)(res, await merkleDropsLPService.getSettings());
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    // ── Health endpoints: contract balance vs DB owed, broken down by epoch ──────
    app.get('/api/admin/merkle/health', async (_req, res) => {
        try {
            const contractBalance = await (0, merkle_claim_1.getContractMorbiusBalance)();
            const pool = merkleDropsService.pool;
            const { rows: owedRows } = await pool.query(`SELECT COALESCE(SUM(CAST(ms.reward_amount AS NUMERIC)), 0) AS total
         FROM merkle_snapshots ms
         JOIN merkle_epochs me ON me.id = ms.epoch_id
         WHERE me.status = 'published'
           AND ms.claimed_at IS NULL
           AND ms.superseded_by_epoch_id IS NULL
           AND CAST(ms.reward_amount AS NUMERIC) > 0`);
            const { rows: byEpoch } = await pool.query(`SELECT
           me.epoch_number,
           COUNT(ms.id) FILTER (WHERE ms.claimed_at IS NULL AND ms.superseded_by_epoch_id IS NULL AND CAST(ms.reward_amount AS NUMERIC) > 0) AS unclaimed_holders,
           COALESCE(SUM(CAST(ms.reward_amount AS NUMERIC)) FILTER (WHERE ms.claimed_at IS NULL AND ms.superseded_by_epoch_id IS NULL AND CAST(ms.reward_amount AS NUMERIC) > 0), 0) AS unclaimed_morbius,
           COUNT(ms.id) FILTER (WHERE ms.claimed_at IS NOT NULL) AS claimed,
           COUNT(ms.id) FILTER (WHERE ms.superseded_by_epoch_id IS NOT NULL) AS superseded
         FROM merkle_epochs me
         LEFT JOIN merkle_snapshots ms ON ms.epoch_id = me.id
         WHERE me.status = 'published'
         GROUP BY me.epoch_number
         ORDER BY me.epoch_number`);
            const owedWei = BigInt(owedRows[0]?.total ?? '0');
            const available = contractBalance > owedWei ? contractBalance - owedWei : 0n;
            (0, json_1.sendJson)(res, {
                contractBalanceWei: contractBalance.toString(),
                owedWei: owedWei.toString(),
                availableWei: available.toString(),
                byEpoch,
            });
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.get('/api/admin/merkle-lp/health', async (_req, res) => {
        try {
            const contractBalance = await (0, merkle_claim_lp_1.getContractMorbiusBalance)();
            const pool = merkleDropsLPService.pool;
            const { rows: owedRows } = await pool.query(`SELECT COALESCE(SUM(CAST(ms.reward_amount AS NUMERIC)), 0) AS total
         FROM merkle_lp_snapshots ms
         JOIN merkle_lp_epochs me ON me.id = ms.epoch_id
         WHERE me.status = 'published'
           AND ms.claimed_at IS NULL
           AND ms.superseded_by_epoch_id IS NULL
           AND CAST(ms.reward_amount AS NUMERIC) > 0`);
            const { rows: byEpoch } = await pool.query(`SELECT
           me.epoch_number,
           COUNT(ms.id) FILTER (WHERE ms.claimed_at IS NULL AND ms.superseded_by_epoch_id IS NULL AND CAST(ms.reward_amount AS NUMERIC) > 0) AS unclaimed_holders,
           COALESCE(SUM(CAST(ms.reward_amount AS NUMERIC)) FILTER (WHERE ms.claimed_at IS NULL AND ms.superseded_by_epoch_id IS NULL AND CAST(ms.reward_amount AS NUMERIC) > 0), 0) AS unclaimed_morbius,
           COUNT(ms.id) FILTER (WHERE ms.claimed_at IS NOT NULL) AS claimed,
           COUNT(ms.id) FILTER (WHERE ms.superseded_by_epoch_id IS NOT NULL) AS superseded
         FROM merkle_lp_epochs me
         LEFT JOIN merkle_lp_snapshots ms ON ms.epoch_id = me.id
         WHERE me.status = 'published'
         GROUP BY me.epoch_number
         ORDER BY me.epoch_number`);
            const owedWei = BigInt(owedRows[0]?.total ?? '0');
            const available = contractBalance > owedWei ? contractBalance - owedWei : 0n;
            (0, json_1.sendJson)(res, {
                contractBalanceWei: contractBalance.toString(),
                owedWei: owedWei.toString(),
                availableWei: available.toString(),
                byEpoch,
            });
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
}
//# sourceMappingURL=merkle-admin-read.routes.js.map