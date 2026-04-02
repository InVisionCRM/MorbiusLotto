"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPublicRoutes = registerPublicRoutes;
const json_1 = require("../http/json");
const logger_1 = require("../utils/logger");
const PUBLIC_CONFIG_KEYS = ['ad_creative_url', 'ad_creative_hero_url', 'ad_creative_loading_url'];
function registerPublicRoutes({ app, dbService }) {
    app.get('/api/config/public', async (_req, res) => {
        try {
            const full = await dbService.getAdminGameConfig();
            const publicConfig = {};
            for (const key of PUBLIC_CONFIG_KEYS) {
                const v = full[key];
                publicConfig[key] = typeof v === 'string' ? v : '';
            }
            (0, json_1.sendJson)(res, publicConfig);
        }
        catch (error) {
            logger_1.logger.error('Error fetching public config:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
//# sourceMappingURL=public.routes.js.map