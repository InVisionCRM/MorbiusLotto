import type { Express } from 'express';
import express from 'express';
import { getAddress } from 'viem';
import { CosmeticsService } from '../services/cosmetics.service';
import { DatabaseService } from '../services/database.service';
import { getLockedFields, isAdminWallet } from '../lib/cosmetics-catalog';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterPlayerMutationRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  cosmeticsService: CosmeticsService;
}

export function registerPlayerMutationRoutes({
  app,
  dbService,
  cosmeticsService,
}: RegisterPlayerMutationRoutesOptions): void {
  app.post('/api/player/profile', express.json(), async (req, res) => {
    try {
      const {
        address: bodyAddress,
        walletAddress: bodyWalletAddress,
        displayName: rawDisplayName,
        profileImageUrl: rawProfileImageUrl,
        avatarConfig: rawAvatarConfig,
        bio: rawBio,
        xHandle: rawXHandle,
        tgHandle: rawTgHandle,
      } = req.body ?? {};
      const addressRaw =
        typeof bodyAddress === 'string' && bodyAddress.trim() !== ''
          ? bodyAddress
          : typeof bodyWalletAddress === 'string' && bodyWalletAddress.trim() !== ''
            ? bodyWalletAddress
            : '';
      if (!addressRaw) {
        return res.status(400).json({ error: 'address required' });
      }
      const normalizedAddress = getAddress(addressRaw);
      const displayName = typeof rawDisplayName === 'string' ? rawDisplayName.trim() : '';
      if (displayName.length < 3 || displayName.length > 32) {
        return res.status(400).json({ error: 'Display name must be 3–32 characters' });
      }
      const profileImageUrl =
        rawProfileImageUrl !== undefined ? (typeof rawProfileImageUrl === 'string' ? rawProfileImageUrl : null) : undefined;
      const avatarConfig =
        rawAvatarConfig !== undefined
          ? rawAvatarConfig !== null && typeof rawAvatarConfig === 'object'
            ? (rawAvatarConfig as Record<string, unknown>)
            : null
          : undefined;
      const bio =
        rawBio !== undefined ? (typeof rawBio === 'string' ? rawBio.trim().slice(0, 200) || null : null) : undefined;
      const xHandle =
        rawXHandle !== undefined
          ? typeof rawXHandle === 'string'
            ? rawXHandle.trim().replace(/^@/, '').slice(0, 50) || null
            : null
          : undefined;
      const tgHandle =
        rawTgHandle !== undefined
          ? typeof rawTgHandle === 'string'
            ? rawTgHandle.trim().replace(/^@/, '').slice(0, 50) || null
            : null
          : undefined;

      if (avatarConfig && !isAdminWallet(normalizedAddress)) {
        const inventory = await cosmeticsService.getInventory(normalizedAddress);
        const ownedSet = new Set(inventory);
        const locked = getLockedFields(avatarConfig as Record<string, string>, ownedSet);
        if (locked.length > 0) {
          const names = locked.map((l) => l.displayName ?? l.itemKey ?? l.value).join(', ');
          return res.status(403).json({
            error: `Avatar contains items you don't own: ${names}`,
            lockedItems: locked,
          });
        }

        const dbValueMap = await cosmeticsService.getDbValueMap();
        if (dbValueMap.size > 0) {
          const config = avatarConfig as Record<string, string>;
          const dbLocked: string[] = [];
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
      sendJson(res, profile ?? { displayName: null, profileImageUrl: null, avatarConfig: null });
    } catch (error) {
      logger.error('Error updating player profile:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/player/:address/follow', express.json(), async (req, res) => {
    try {
      const following = req.params.address;
      const { follower } = req.body ?? {};
      if (!follower || typeof follower !== 'string') return res.status(400).json({ error: 'follower address required' });
      if (follower.toLowerCase() === following.toLowerCase()) return res.status(400).json({ error: 'Cannot follow yourself' });
      await dbService.followPlayer(follower, following);
      const counts = await dbService.getFollowCounts(following);
      sendJson(res, { success: true, ...counts });
    } catch (error) {
      logger.error('Error following player:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/player/:address/follow', express.json(), async (req, res) => {
    try {
      const following = req.params.address;
      const { follower } = req.body ?? {};
      if (!follower || typeof follower !== 'string') return res.status(400).json({ error: 'follower address required' });
      await dbService.unfollowPlayer(follower, following);
      const counts = await dbService.getFollowCounts(following);
      sendJson(res, { success: true, ...counts });
    } catch (error) {
      logger.error('Error unfollowing player:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
