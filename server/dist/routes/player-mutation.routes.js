"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPlayerMutationRoutes = registerPlayerMutationRoutes;
const express_1 = __importDefault(require("express"));
const viem_1 = require("viem");
const cosmetics_catalog_1 = require("../lib/cosmetics-catalog");
const json_1 = require("../http/json");
const logger_1 = require("../utils/logger");
function registerPlayerMutationRoutes({ app, dbService, cosmeticsService, }) {
    app.post('/api/player/profile', express_1.default.json(), async (req, res) => {
        try {
            const { address, displayName: rawDisplayName, profileImageUrl: rawProfileImageUrl, avatarConfig: rawAvatarConfig, bio: rawBio, xHandle: rawXHandle, tgHandle: rawTgHandle, } = req.body ?? {};
            if (!address || typeof address !== 'string') {
                return res.status(400).json({ error: 'address required' });
            }
            const normalizedAddress = (0, viem_1.getAddress)(address);
            const displayName = typeof rawDisplayName === 'string' ? rawDisplayName.trim() : '';
            if (displayName.length < 3 || displayName.length > 32) {
                return res.status(400).json({ error: 'Display name must be 3–32 characters' });
            }
            const profileImageUrl = rawProfileImageUrl !== undefined ? (typeof rawProfileImageUrl === 'string' ? rawProfileImageUrl : null) : undefined;
            const avatarConfig = rawAvatarConfig !== undefined
                ? rawAvatarConfig !== null && typeof rawAvatarConfig === 'object'
                    ? rawAvatarConfig
                    : null
                : undefined;
            const bio = rawBio !== undefined ? (typeof rawBio === 'string' ? rawBio.trim().slice(0, 200) || null : null) : undefined;
            const xHandle = rawXHandle !== undefined
                ? typeof rawXHandle === 'string'
                    ? rawXHandle.trim().replace(/^@/, '').slice(0, 50) || null
                    : null
                : undefined;
            const tgHandle = rawTgHandle !== undefined
                ? typeof rawTgHandle === 'string'
                    ? rawTgHandle.trim().replace(/^@/, '').slice(0, 50) || null
                    : null
                : undefined;
            if (avatarConfig && !(0, cosmetics_catalog_1.isAdminWallet)(normalizedAddress)) {
                const inventory = await cosmeticsService.getInventory(normalizedAddress);
                const ownedSet = new Set(inventory);
                const locked = (0, cosmetics_catalog_1.getLockedFields)(avatarConfig, ownedSet);
                if (locked.length > 0) {
                    const names = locked.map((l) => l.displayName ?? l.itemKey ?? l.value).join(', ');
                    return res.status(403).json({
                        error: `Avatar contains items you don't own: ${names}`,
                        lockedItems: locked,
                    });
                }
                const dbValueMap = await cosmeticsService.getDbValueMap();
                if (dbValueMap.size > 0) {
                    const config = avatarConfig;
                    const dbLocked = [];
                    for (const [key, itemKey] of dbValueMap) {
                        const [field, value] = key.split(':');
                        if (config[field] === value && !ownedSet.has(itemKey)) {
                            dbLocked.push(itemKey);
                        }
                    }
                    if (dbLocked.length > 0) {
                        return res.status(403).json({
                            error: `Avatar contains items you don't own: ${dbLocked.join(', ')}`,
                            lockedItems: dbLocked.map((k) => ({ itemKey: k, value: null, field: null })),
                        });
                    }
                }
            }
            await dbService.setDisplayName(normalizedAddress, displayName, profileImageUrl, avatarConfig, bio, xHandle, tgHandle);
            const profile = await dbService.getProfile(normalizedAddress);
            (0, json_1.sendJson)(res, profile ?? { displayName: null, profileImageUrl: null, avatarConfig: null });
        }
        catch (error) {
            logger_1.logger.error('Error updating player profile:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.post('/api/player/:address/follow', express_1.default.json(), async (req, res) => {
        try {
            const following = req.params.address;
            const { follower } = req.body ?? {};
            if (!follower || typeof follower !== 'string')
                return res.status(400).json({ error: 'follower address required' });
            if (follower.toLowerCase() === following.toLowerCase())
                return res.status(400).json({ error: 'Cannot follow yourself' });
            await dbService.followPlayer(follower, following);
            const counts = await dbService.getFollowCounts(following);
            (0, json_1.sendJson)(res, { success: true, ...counts });
        }
        catch (error) {
            logger_1.logger.error('Error following player:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.delete('/api/player/:address/follow', express_1.default.json(), async (req, res) => {
        try {
            const following = req.params.address;
            const { follower } = req.body ?? {};
            if (!follower || typeof follower !== 'string')
                return res.status(400).json({ error: 'follower address required' });
            await dbService.unfollowPlayer(follower, following);
            const counts = await dbService.getFollowCounts(following);
            (0, json_1.sendJson)(res, { success: true, ...counts });
        }
        catch (error) {
            logger_1.logger.error('Error unfollowing player:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
//# sourceMappingURL=player-mutation.routes.js.map