import type { Express } from 'express';
import express from 'express';
import { CosmeticsService } from '../services/cosmetics.service';
import { isAdminWallet } from '../lib/cosmetics-catalog';
import { sendJson } from '../http/json';
import { logger } from '../utils/logger';

interface RegisterCosmeticsRoutesOptions {
  app: Express;
  cosmeticsService: CosmeticsService;
}

export function registerCosmeticsRoutes({
  app,
  cosmeticsService,
}: RegisterCosmeticsRoutesOptions): void {
  app.get('/api/cosmetics/items', async (req, res) => {
    try {
      const adminAddress = typeof req.query.adminAddress === 'string' ? req.query.adminAddress : '';
      const includeDelisted = Boolean(adminAddress && isAdminWallet(adminAddress));
      const items = await cosmeticsService.getAllItems({ includeDelisted });
      res.json(items);
    } catch (error) {
      logger.error('Error fetching cosmetic items:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/cosmetics/inventory/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const inventory = await cosmeticsService.getInventory(address);
      sendJson(res, { address, items: inventory });
    } catch (error) {
      logger.error('Error fetching cosmetic inventory:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/cosmetics/purchase', express.json(), async (req, res) => {
    try {
      const { walletAddress, itemKey, txHash, currency } = req.body ?? {};
      if (!walletAddress || !itemKey || !txHash || !currency) {
        return res.status(400).json({ error: 'walletAddress, itemKey, txHash, and currency required' });
      }
      if (currency !== 'PLS' && currency !== 'MORBIUS') {
        return res.status(400).json({ error: 'currency must be PLS or MORBIUS' });
      }
      const result = await cosmeticsService.recordPurchase(walletAddress, itemKey, txHash, currency);
      const statusMap: Record<string, number> = {
        not_found: 404,
        not_listed: 403,
        already_owned: 409,
        tx_already_used: 409,
        tx_not_found: 422,
        tx_wrong_sender: 422,
        tx_wrong_recipient: 422,
        tx_insufficient_amount: 422,
        tx_reverted: 422,
      };
      if (result !== 'ok') {
        const status = statusMap[result] ?? 422;
        return res.status(status).json({ error: result.replace(/_/g, ' ') });
      }
      const inventory = await cosmeticsService.getInventory(walletAddress);
      sendJson(res, { success: true, items: inventory });
    } catch (error) {
      logger.error('Error recording cosmetic purchase:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/cosmetics/gift', express.json(), async (req, res) => {
    try {
      const { fromAddress, toAddress, itemKey } = req.body ?? {};
      if (!fromAddress || !toAddress || !itemKey) {
        return res.status(400).json({ error: 'fromAddress, toAddress, and itemKey required' });
      }
      if (fromAddress.toLowerCase() === toAddress.toLowerCase()) {
        return res.status(400).json({ error: 'Cannot gift to yourself' });
      }
      const result = await cosmeticsService.giftItem(fromAddress, toAddress, itemKey);
      if (result === 'not_owned') return res.status(403).json({ error: 'You do not own this item' });
      if (result === 'already_owned') return res.status(409).json({ error: 'Recipient already owns this item' });
      const inventory = await cosmeticsService.getInventory(fromAddress);
      sendJson(res, { success: true, items: inventory });
    } catch (error) {
      logger.error('Error gifting cosmetic item:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/cosmetics/grant', express.json(), async (req, res) => {
    try {
      const { targetAddress, itemKey, adminAddress } = req.body ?? {};
      if (!targetAddress || !itemKey || !adminAddress) {
        return res.status(400).json({ error: 'targetAddress, itemKey, and adminAddress required' });
      }
      if (!isAdminWallet(adminAddress)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const result = await cosmeticsService.grantItem(targetAddress, itemKey, null);
      const inventory = await cosmeticsService.getInventory(targetAddress);
      sendJson(res, { success: true, alreadyOwned: !result, items: inventory });
    } catch (error) {
      logger.error('Error granting cosmetic item:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/cosmetics/admin/create-item', express.json(), async (req, res) => {
    try {
      const { adminAddress, itemKey, displayName, tier, priceMorbius, maxSupply, unlocksField, unlocksValue } = req.body ?? {};
      if (!adminAddress || !itemKey || !displayName || !tier || !unlocksField || !unlocksValue) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (!isAdminWallet(adminAddress)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const result = await cosmeticsService.createItem({
        itemKey,
        displayName,
        tier,
        priceMorbius: Number(priceMorbius),
        maxSupply: Number(maxSupply),
        unlocksField,
        unlocksValue,
      });
      if (result === 'duplicate_key') return res.status(409).json({ error: `Item key "${itemKey}" already exists` });
      if (result === 'duplicate_value') {
        return res.status(409).json({ error: `A "${unlocksField}" item with value "${unlocksValue}" already exists` });
      }
      sendJson(res, { success: true, itemKey });
    } catch (error) {
      logger.error('Error creating cosmetic item:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.patch('/api/cosmetics/admin/item', express.json(), async (req, res) => {
    try {
      const { adminAddress, itemKey, tier, priceMorbius, maxSupply, shopListed } = req.body ?? {};
      if (!adminAddress || !itemKey) {
        return res.status(400).json({ error: 'adminAddress and itemKey required' });
      }
      if (!isAdminWallet(adminAddress)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const result = await cosmeticsService.updateItem(itemKey, {
        tier,
        priceMorbius,
        maxSupply,
        shopListed: typeof shopListed === 'boolean' ? shopListed : undefined,
      });
      if (result === 'not_found') return res.status(404).json({ error: 'Item not found' });
      if (result === 'supply_below_minted') {
        return res.status(409).json({ error: 'New max supply cannot be below current minted count' });
      }
      sendJson(res, { success: true });
    } catch (error) {
      logger.error('Error updating cosmetic item:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/cosmetics/admin/bulk-shop-listed', express.json(), async (req, res) => {
    try {
      const { adminAddress, updates } = req.body ?? {};
      if (!adminAddress || !Array.isArray(updates)) {
        return res.status(400).json({ error: 'adminAddress and updates array required' });
      }
      if (!isAdminWallet(adminAddress)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const max = 500;
      if (updates.length > max) {
        return res.status(400).json({ error: `At most ${max} updates per request` });
      }
      const pairs: Array<{ itemKey: string; shopListed: boolean }> = [];
      for (const u of updates) {
        if (!u || typeof u.itemKey !== 'string' || u.itemKey.length > 120 || typeof u.shopListed !== 'boolean') {
          return res.status(400).json({ error: 'Each update must have itemKey (string) and shopListed (boolean)' });
        }
        if (!/^[a-z0-9_]+$/.test(u.itemKey)) {
          return res.status(400).json({ error: 'Invalid itemKey format' });
        }
        pairs.push({ itemKey: u.itemKey, shopListed: u.shopListed });
      }
      const { updated, notFound } = await cosmeticsService.bulkSetShopListed(pairs);
      sendJson(res, { success: true, updatedCount: updated, notFound });
    } catch (error) {
      logger.error('Error bulk-updating shop_listed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.patch('/api/cosmetics/admin/tier-pricing', express.json(), async (req, res) => {
    try {
      const { adminAddress, tier, priceMorbius } = req.body ?? {};
      if (!adminAddress || !tier || priceMorbius === undefined) {
        return res.status(400).json({ error: 'adminAddress, tier, and priceMorbius required' });
      }
      if (!isAdminWallet(adminAddress)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const validTiers = ['common', 'uncommon', 'rare', 'legendary'];
      if (!validTiers.includes(tier)) {
        return res.status(400).json({ error: 'Invalid tier' });
      }
      const price = Number(priceMorbius);
      if (!Number.isFinite(price) || price <= 0) {
        return res.status(400).json({ error: 'priceMorbius must be a positive number' });
      }
      const count = await cosmeticsService.updateTierPricing(tier, price);
      sendJson(res, { success: true, updatedCount: count });
    } catch (error) {
      logger.error('Error updating tier pricing:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/cosmetics/admin/item-owners', async (req, res) => {
    try {
      const adminAddress = typeof req.query.adminAddress === 'string' ? req.query.adminAddress : '';
      const itemKey = typeof req.query.itemKey === 'string' ? req.query.itemKey : '';
      if (!adminAddress || !itemKey) {
        return res.status(400).json({ error: 'adminAddress and itemKey query params required' });
      }
      if (!isAdminWallet(adminAddress)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const owners = await cosmeticsService.getOwnersForItem(itemKey);
      sendJson(res, { owners });
    } catch (error) {
      logger.error('Error listing cosmetic item owners:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/cosmetics/market', async (req, res) => {
    try {
      const { itemKey, sellerAddress } = req.query as Record<string, string | undefined>;
      const listings = await cosmeticsService.getListings({
        itemKey: itemKey || undefined,
        sellerAddress: sellerAddress || undefined,
      });
      res.json({ listings });
    } catch (error) {
      logger.error('Error fetching market listings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/cosmetics/market/list', express.json(), async (req, res) => {
    try {
      const { sellerAddress, itemKey, priceMorbius } = req.body ?? {};
      if (!sellerAddress || !itemKey || !priceMorbius) {
        return res.status(400).json({ error: 'sellerAddress, itemKey, and priceMorbius required' });
      }
      const price = parseInt(priceMorbius, 10);
      if (isNaN(price) || price <= 0) {
        return res.status(400).json({ error: 'priceMorbius must be a positive number' });
      }
      const result = await cosmeticsService.createListing(sellerAddress, itemKey, price);
      if (result === 'not_owned') return res.status(403).json({ error: 'You do not own this item' });
      if (result === 'already_listed') return res.status(409).json({ error: 'Item already listed for sale' });
      if (result === 'item_not_found') return res.status(404).json({ error: 'Item not found' });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error creating market listing:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/cosmetics/market/cancel', express.json(), async (req, res) => {
    try {
      const { sellerAddress, listingId } = req.body ?? {};
      if (!sellerAddress || !listingId) {
        return res.status(400).json({ error: 'sellerAddress and listingId required' });
      }
      const result = await cosmeticsService.cancelListing(sellerAddress, parseInt(listingId, 10));
      if (result === 'not_found') return res.status(404).json({ error: 'Listing not found' });
      if (result === 'not_yours') return res.status(403).json({ error: 'Not your listing' });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error cancelling market listing:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/cosmetics/market/update-price', express.json(), async (req, res) => {
    try {
      const { sellerAddress, listingId, newPrice } = req.body ?? {};
      if (!sellerAddress || !listingId || !newPrice) {
        return res.status(400).json({ error: 'sellerAddress, listingId, and newPrice required' });
      }
      const p = Number(newPrice);
      if (!Number.isFinite(p) || p <= 0) {
        return res.status(400).json({ error: 'newPrice must be a positive number' });
      }
      const result = await cosmeticsService.updateListingPrice(sellerAddress, parseInt(listingId, 10), p);
      if (result === 'not_found') return res.status(404).json({ error: 'Listing not found or already sold/cancelled' });
      if (result === 'not_yours') return res.status(403).json({ error: 'Not your listing' });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error updating listing price:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/cosmetics/market/buy', express.json(), async (req, res) => {
    try {
      const { buyerAddress, listingId, txHash } = req.body ?? {};
      if (!buyerAddress || !listingId || !txHash) {
        return res.status(400).json({ error: 'buyerAddress, listingId, and txHash required' });
      }
      const result = await cosmeticsService.buyListing(buyerAddress, parseInt(listingId, 10), txHash);
      const errorMap: Record<string, [number, string]> = {
        listing_not_found: [404, 'Listing not found'],
        already_sold: [409, 'Listing already sold or cancelled'],
        seller_no_longer_owns: [409, 'Seller no longer owns this item'],
        tx_already_used: [409, 'Transaction already used'],
        tx_not_found: [400, 'Transaction not found on chain'],
        tx_wrong_sender: [400, 'Transaction not sent from your wallet'],
        tx_wrong_recipient: [400, 'Transaction sent to wrong address'],
        tx_insufficient_amount: [400, 'Transaction amount is too low'],
        tx_reverted: [400, 'Transaction was reverted'],
      };
      if (result !== 'ok') {
        const [status, message] = errorMap[result] ?? [500, 'Unknown error'];
        return res.status(status).json({ error: message });
      }
      const inventory = await cosmeticsService.getInventory(buyerAddress);
      res.json({ success: true, items: inventory });
    } catch (error) {
      logger.error('Error buying market listing:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
