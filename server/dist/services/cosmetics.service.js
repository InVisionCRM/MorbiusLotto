"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CosmeticsService = void 0;
const viem_1 = require("viem");
const chain_client_1 = require("../utils/chain-client");
const cosmetics_catalog_1 = require("../lib/cosmetics-catalog");
// ─── Constants ────────────────────────────────────────────────────────────────
const SHOP_TREASURY = (process.env.SHOP_TREASURY_ADDRESS || '0x41682815B05fE6b54a6C0f8813bB99423EE0309D').toLowerCase();
const MORBIUS_TOKEN = (process.env.MORBIUS_TOKEN_ADDRESS || '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1').toLowerCase();
/** keccak256('Transfer(address,address,uint256)') */
const ERC20_TRANSFER_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
// ─── Service ──────────────────────────────────────────────────────────────────
class CosmeticsService {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    /**
     * Merged catalog + DB mint/supply/pricing.
     * Public: omit rows with shop_listed = false. Admin: pass includeDelisted for full list + shopListed on each item.
     */
    async getAllItems(options) {
        const includeDelisted = options?.includeDelisted ?? false;
        const { rows } = await this.pool.query(`SELECT item_key, display_name, minted_count, tier, price_morbius, max_supply,
              is_db_created, unlocks_field, unlocks_value,
              COALESCE(shop_listed, true) AS shop_listed
       FROM cosmetic_items WHERE is_active = true`);
        const dbMap = new Map(rows.map(r => [r.item_key, r]));
        const catalogKeys = new Set(cosmetics_catalog_1.ITEM_CATALOG.map(i => i.itemKey));
        const catalogItems = [];
        for (const i of cosmetics_catalog_1.ITEM_CATALOG) {
            const db = dbMap.get(i.itemKey);
            if (!includeDelisted && db && !db.shop_listed)
                continue;
            catalogItems.push({
                ...i,
                tier: (db?.tier ?? i.tier),
                priceMorbius: db ? parseInt(db.price_morbius, 10) : i.priceMorbius,
                maxSupply: db ? parseInt(db.max_supply, 10) : i.maxSupply,
                mintedCount: db ? parseInt(db.minted_count, 10) : 0,
                ...(includeDelisted ? { shopListed: db ? db.shop_listed : true } : {}),
            });
        }
        const dynamicItems = rows
            .filter(r => r.is_db_created &&
            !catalogKeys.has(r.item_key) &&
            Boolean(r.unlocks_field && r.unlocks_value) &&
            (includeDelisted || r.shop_listed))
            .map(r => ({
            itemKey: r.item_key,
            displayName: r.display_name,
            tier: r.tier,
            maxSupply: parseInt(r.max_supply, 10),
            pricePls: 0,
            priceMorbius: parseInt(r.price_morbius, 10),
            unlocks: [{ field: r.unlocks_field, value: r.unlocks_value }],
            mintedCount: parseInt(r.minted_count, 10),
            ...(includeDelisted ? { shopListed: r.shop_listed } : {}),
        }));
        return [...catalogItems, ...dynamicItems];
    }
    /**
     * Returns a map of "field:value" → itemKey for all DB-created items.
     * Used by the server-side avatar validation to catch dynamically added colors.
     */
    async getDbValueMap() {
        const { rows } = await this.pool.query(`SELECT item_key, unlocks_field, unlocks_value
       FROM cosmetic_items
       WHERE is_db_created = true AND is_active = true
         AND unlocks_field IS NOT NULL AND unlocks_value IS NOT NULL`);
        return new Map(rows.map(r => [`${r.unlocks_field}:${r.unlocks_value}`, r.item_key]));
    }
    /** Create a new item (admin builder). Returns the new item key or an error string. */
    async createItem(params) {
        // Check for duplicate item key
        const { rows: keyCheck } = await this.pool.query(`SELECT 1 FROM cosmetic_items WHERE item_key = $1`, [params.itemKey]);
        if (keyCheck.length > 0)
            return 'duplicate_key';
        // Check for duplicate field+value (another item already unlocks this exact color)
        const { rows: valCheck } = await this.pool.query(`SELECT 1 FROM cosmetic_items WHERE unlocks_field = $1 AND unlocks_value = $2 AND is_active = true`, [params.unlocksField, params.unlocksValue]);
        if (valCheck.length > 0)
            return 'duplicate_value';
        await this.pool.query(`INSERT INTO cosmetic_items
         (item_key, display_name, tier, price_pls, price_morbius, max_supply,
          is_active, is_db_created, unlocks_field, unlocks_value, shop_listed)
       VALUES ($1, $2, $3, 0, $4, $5, true, true, $6, $7, true)`, [params.itemKey, params.displayName, params.tier, params.priceMorbius,
            params.maxSupply, params.unlocksField, params.unlocksValue]);
        return 'ok';
    }
    /** Admin: update tier, price, maxSupply, and/or shop_listed. */
    async updateItem(itemKey, updates) {
        // Build SET clause dynamically
        const sets = [];
        const values = [itemKey];
        if (updates.tier !== undefined) {
            values.push(updates.tier);
            sets.push(`tier = $${values.length}`);
        }
        if (updates.priceMorbius !== undefined) {
            values.push(updates.priceMorbius);
            sets.push(`price_morbius = $${values.length}`);
        }
        if (updates.maxSupply !== undefined) {
            values.push(updates.maxSupply);
            sets.push(`max_supply = $${values.length}`);
        }
        if (updates.shopListed !== undefined) {
            values.push(updates.shopListed);
            sets.push(`shop_listed = $${values.length}`);
        }
        if (sets.length === 0)
            return 'ok';
        // If we're changing maxSupply, guard against setting it below minted_count
        const whereClause = updates.maxSupply !== undefined
            ? `WHERE item_key = $1 AND minted_count <= $${values.indexOf(updates.maxSupply) + 1}`
            : `WHERE item_key = $1`;
        const { rowCount } = await this.pool.query(`UPDATE cosmetic_items SET ${sets.join(', ')} ${whereClause}`, values);
        if (rowCount === 0) {
            // Check if item exists at all to give a more precise error
            const { rows } = await this.pool.query(`SELECT minted_count FROM cosmetic_items WHERE item_key = $1`, [itemKey]);
            if (rows.length === 0)
                return 'not_found';
            return 'supply_below_minted';
        }
        return 'ok';
    }
    /**
     * Admin: set shop_listed for many keys (e.g. variant-review approve/reject sync).
     * Only updates existing active rows. Returns item_key values with no matching row.
     */
    async bulkSetShopListed(pairs) {
        const notFound = [];
        let updated = 0;
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const { itemKey, shopListed } of pairs) {
                const { rowCount } = await client.query(`UPDATE cosmetic_items SET shop_listed = $1 WHERE item_key = $2 AND is_active = true`, [shopListed, itemKey]);
                if ((rowCount ?? 0) === 0) {
                    const { rows } = await client.query(`SELECT 1 FROM cosmetic_items WHERE item_key = $1`, [itemKey]);
                    if (rows.length === 0)
                        notFound.push(itemKey);
                }
                else {
                    updated += rowCount ?? 0;
                }
            }
            await client.query('COMMIT');
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
        return { updated, notFound };
    }
    /** Admin: bulk-update price for all items of a given tier. Returns count of rows updated. */
    async updateTierPricing(tier, priceMorbius) {
        const { rowCount } = await this.pool.query(`UPDATE cosmetic_items SET price_morbius = $1 WHERE tier = $2 AND is_active = true`, [priceMorbius, tier]);
        return rowCount ?? 0;
    }
    /** Item keys the player owns. */
    async getInventory(walletAddress) {
        const { rows } = await this.pool.query(`SELECT item_key FROM player_cosmetics WHERE wallet_address = $1`, [walletAddress.toLowerCase()]);
        return rows.map(r => r.item_key);
    }
    /** Admin: wallets that own a catalog item (shop purchase or grant; acquired_from set when gifted). */
    async getOwnersForItem(itemKey) {
        const { rows } = await this.pool.query(`SELECT wallet_address, acquired_at, acquired_from
       FROM player_cosmetics
       WHERE item_key = $1
       ORDER BY acquired_at ASC`, [itemKey]);
        return rows.map(r => ({
            walletAddress: r.wallet_address,
            acquiredAt: r.acquired_at.toISOString(),
            acquiredFrom: r.acquired_from,
        }));
    }
    /** Returns true if the player owns the item. */
    async hasItem(walletAddress, itemKey) {
        const { rows } = await this.pool.query(`SELECT COUNT(*)::text AS count FROM player_cosmetics WHERE wallet_address = $1 AND item_key = $2`, [walletAddress.toLowerCase(), itemKey]);
        return parseInt(rows[0]?.count ?? '0', 10) > 0;
    }
    /**
     * Grant an item without payment (admin grant or test).
     * Returns false if already owned.
     */
    async grantItem(walletAddress, itemKey, fromAddress = null) {
        const { rowCount } = await this.pool.query(`INSERT INTO player_cosmetics (wallet_address, item_key, acquired_from)
       VALUES ($1, $2, $3)
       ON CONFLICT (wallet_address, item_key) DO NOTHING`, [walletAddress.toLowerCase(), itemKey, fromAddress?.toLowerCase() ?? null]);
        return (rowCount ?? 0) > 0;
    }
    /**
     * Transfer an item from one player to another (gift).
     * Returns 'ok' | 'not_owned' | 'already_owned'
     */
    async giftItem(fromAddress, toAddress, itemKey) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const { rows: senderRows } = await client.query(`SELECT id FROM player_cosmetics WHERE wallet_address = $1 AND item_key = $2 FOR UPDATE`, [fromAddress.toLowerCase(), itemKey]);
            if (senderRows.length === 0) {
                await client.query('ROLLBACK');
                return 'not_owned';
            }
            const { rows: recipRows } = await client.query(`SELECT COUNT(*)::text AS count FROM player_cosmetics WHERE wallet_address = $1 AND item_key = $2`, [toAddress.toLowerCase(), itemKey]);
            if (parseInt(recipRows[0]?.count ?? '0', 10) > 0) {
                await client.query('ROLLBACK');
                return 'already_owned';
            }
            await client.query(`DELETE FROM player_cosmetics WHERE wallet_address = $1 AND item_key = $2`, [fromAddress.toLowerCase(), itemKey]);
            await client.query(`INSERT INTO player_cosmetics (wallet_address, item_key, acquired_from) VALUES ($1, $2, $3)`, [toAddress.toLowerCase(), itemKey, fromAddress.toLowerCase()]);
            await client.query('COMMIT');
            return 'ok';
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    // ── On-chain purchase verification ────────────────────────────────────────
    /**
     * Record a purchase after verifying the on-chain transaction.
     * Enforces supply caps via minted_count < max_supply check.
     */
    async recordPurchase(walletAddress, itemKey, txHash, currency) {
        const catalogItem = cosmetics_catalog_1.ITEM_CATALOG.find(i => i.itemKey === itemKey);
        if (!catalogItem)
            return 'not_found';
        const { rows: shopRows } = await this.pool.query(`SELECT COALESCE(shop_listed, true) AS shop_listed FROM cosmetic_items WHERE item_key = $1`, [itemKey]);
        if (shopRows.length > 0 && !shopRows[0].shop_listed)
            return 'not_listed';
        // Replay protection
        const { rows: used } = await this.pool.query(`SELECT COUNT(*)::text AS count FROM purchase_tx_hashes WHERE tx_hash = $1`, [txHash.toLowerCase()]);
        if (parseInt(used[0]?.count ?? '0', 10) > 0)
            return 'tx_already_used';
        // Verify on-chain
        const verifyResult = currency === 'PLS'
            ? await this._verifyPlsTx(txHash, walletAddress, catalogItem)
            : await this._verifyMorbiusTx(txHash, walletAddress, catalogItem, SHOP_TREASURY);
        if (verifyResult !== 'ok')
            return verifyResult;
        // Atomic: check supply cap, insert tx hash, grant item
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            // Check + increment minted_count atomically
            const { rows: supplyRows } = await client.query(`SELECT minted_count, max_supply FROM cosmetic_items WHERE item_key = $1 FOR UPDATE`, [itemKey]);
            const minted = parseInt(supplyRows[0]?.minted_count ?? '0', 10);
            const maxSupply = parseInt(supplyRows[0]?.max_supply ?? '999999', 10);
            if (minted >= maxSupply) {
                await client.query('ROLLBACK');
                return 'sold_out';
            }
            await client.query(`INSERT INTO purchase_tx_hashes (tx_hash, wallet_address, item_key, currency)
         VALUES ($1, $2, $3, $4)`, [txHash.toLowerCase(), walletAddress.toLowerCase(), itemKey, currency]);
            await client.query(`INSERT INTO player_cosmetics (wallet_address, item_key)
         VALUES ($1, $2)
         ON CONFLICT (wallet_address, item_key) DO NOTHING`, [walletAddress.toLowerCase(), itemKey]);
            await client.query(`UPDATE cosmetic_items SET minted_count = minted_count + 1 WHERE item_key = $1`, [itemKey]);
            await client.query('COMMIT');
            return 'ok';
        }
        catch (err) {
            await client.query('ROLLBACK');
            if (err.code === '23505' && err.constraint?.includes('purchase_tx_hashes'))
                return 'tx_already_used';
            if (err.code === '23505')
                return 'already_owned';
            throw err;
        }
        finally {
            client.release();
        }
    }
    // ── Marketplace ────────────────────────────────────────────────────────────
    /** Get active marketplace listings, optionally filtered. */
    async getListings(filters) {
        const conditions = [`ml.status = 'active'`];
        const params = [];
        if (filters?.itemKey) {
            params.push(filters.itemKey);
            conditions.push(`ml.item_key = $${params.length}`);
        }
        if (filters?.sellerAddress) {
            params.push(filters.sellerAddress.toLowerCase());
            conditions.push(`ml.seller_address = $${params.length}`);
        }
        const where = conditions.join(' AND ');
        const { rows } = await this.pool.query(`SELECT ml.id, ml.seller_address, ml.item_key, ml.price_morbius, ml.status,
              ml.listed_at, ml.sold_at, ml.buyer_address, ml.tx_hash
       FROM market_listings ml
       WHERE ${where}
       ORDER BY ml.listed_at DESC`, params);
        return rows.map(r => {
            const catalog = cosmetics_catalog_1.ITEM_CATALOG.find(i => i.itemKey === r.item_key);
            return {
                id: parseInt(r.id, 10),
                sellerAddress: r.seller_address,
                itemKey: r.item_key,
                priceMorbius: parseInt(r.price_morbius, 10),
                status: r.status,
                listedAt: r.listed_at,
                soldAt: r.sold_at,
                buyerAddress: r.buyer_address,
                txHash: r.tx_hash,
                displayName: catalog?.displayName ?? r.item_key,
                tier: catalog?.tier ?? 'common',
            };
        });
    }
    /** Create a marketplace listing. Seller must own the item. */
    async createListing(sellerAddress, itemKey, priceMorbius) {
        if (!cosmetics_catalog_1.ITEM_CATALOG.find(i => i.itemKey === itemKey))
            return 'item_not_found';
        const owns = await this.hasItem(sellerAddress, itemKey);
        if (!owns)
            return 'not_owned';
        try {
            await this.pool.query(`INSERT INTO market_listings (seller_address, item_key, price_morbius)
         VALUES ($1, $2, $3)`, [sellerAddress.toLowerCase(), itemKey, priceMorbius]);
            return 'ok';
        }
        catch (err) {
            if (err.code === '23505')
                return 'already_listed';
            throw err;
        }
    }
    /** Cancel an active listing. Only the seller can cancel. */
    async cancelListing(sellerAddress, listingId) {
        const { rows } = await this.pool.query(`SELECT seller_address, status FROM market_listings WHERE id = $1`, [listingId]);
        if (rows.length === 0)
            return 'not_found';
        if (rows[0].seller_address !== sellerAddress.toLowerCase())
            return 'not_yours';
        if (rows[0].status !== 'active')
            return 'not_found';
        await this.pool.query(`UPDATE market_listings SET status = 'cancelled' WHERE id = $1`, [listingId]);
        return 'ok';
    }
    /** Update the price of an active listing. Only the seller can update. */
    async updateListingPrice(sellerAddress, listingId, newPrice) {
        const { rows } = await this.pool.query(`SELECT seller_address, status FROM market_listings WHERE id = $1`, [listingId]);
        if (rows.length === 0 || rows[0].status !== 'active')
            return 'not_found';
        if (rows[0].seller_address !== sellerAddress.toLowerCase())
            return 'not_yours';
        await this.pool.query(`UPDATE market_listings SET price_morbius = $1 WHERE id = $2`, [newPrice, listingId]);
        return 'ok';
    }
    /**
     * Buy a marketplace listing.
     * Verifies on-chain: buyer sent priceMorbius Morbius tokens directly to seller.
     * Atomically: marks listing sold, transfers ownership, records tx hash.
     */
    async buyListing(buyerAddress, listingId, txHash) {
        // Load listing
        const { rows: listingRows } = await this.pool.query(`SELECT id, seller_address, item_key, price_morbius, status FROM market_listings WHERE id = $1`, [listingId]);
        if (listingRows.length === 0)
            return 'listing_not_found';
        const listing = listingRows[0];
        if (listing.status !== 'active')
            return 'already_sold';
        // Replay protection
        const { rows: used } = await this.pool.query(`SELECT COUNT(*)::text AS count FROM purchase_tx_hashes WHERE tx_hash = $1`, [txHash.toLowerCase()]);
        if (parseInt(used[0]?.count ?? '0', 10) > 0)
            return 'tx_already_used';
        // Verify on-chain: buyer → seller, priceMorbius Morbius tokens
        const fakeItem = { priceMorbius: parseInt(listing.price_morbius, 10) };
        const verifyResult = await this._verifyMorbiusTx(txHash, buyerAddress, fakeItem, listing.seller_address);
        if (verifyResult !== 'ok')
            return verifyResult;
        // Atomic transfer
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            // Re-check listing is still active (race condition)
            const { rows: recheckRows } = await client.query(`SELECT status, seller_address FROM market_listings WHERE id = $1 FOR UPDATE`, [listingId]);
            if (recheckRows[0]?.status !== 'active') {
                await client.query('ROLLBACK');
                return 'already_sold';
            }
            // Verify seller still owns the item
            const { rows: ownerRows } = await client.query(`SELECT COUNT(*)::text AS count FROM player_cosmetics
         WHERE wallet_address = $1 AND item_key = $2`, [listing.seller_address, listing.item_key]);
            if (parseInt(ownerRows[0]?.count ?? '0', 10) === 0) {
                await client.query('ROLLBACK');
                return 'seller_no_longer_owns';
            }
            // Record tx hash
            await client.query(`INSERT INTO purchase_tx_hashes (tx_hash, wallet_address, item_key, currency)
         VALUES ($1, $2, $3, 'MORBIUS')`, [txHash.toLowerCase(), buyerAddress.toLowerCase(), listing.item_key]);
            // Transfer ownership
            await client.query(`DELETE FROM player_cosmetics WHERE wallet_address = $1 AND item_key = $2`, [listing.seller_address, listing.item_key]);
            await client.query(`INSERT INTO player_cosmetics (wallet_address, item_key, acquired_from) VALUES ($1, $2, $3)`, [buyerAddress.toLowerCase(), listing.item_key, listing.seller_address]);
            // Mark listing sold
            await client.query(`UPDATE market_listings
         SET status = 'sold', sold_at = NOW(), buyer_address = $1, tx_hash = $2
         WHERE id = $3`, [buyerAddress.toLowerCase(), txHash.toLowerCase(), listingId]);
            await client.query('COMMIT');
            return 'ok';
        }
        catch (err) {
            await client.query('ROLLBACK');
            if (err.code === '23505')
                return 'tx_already_used';
            throw err;
        }
        finally {
            client.release();
        }
    }
    // ── Private helpers ────────────────────────────────────────────────────────
    async _verifyPlsTx(txHash, walletAddress, item) {
        try {
            const client = (0, chain_client_1.getPublicClient)();
            const [tx, receipt] = await Promise.all([
                client.getTransaction({ hash: txHash }),
                client.getTransactionReceipt({ hash: txHash }),
            ]);
            if (!tx)
                return 'tx_not_found';
            if (receipt.status === 'reverted')
                return 'tx_reverted';
            if (tx.from.toLowerCase() !== walletAddress.toLowerCase())
                return 'tx_wrong_sender';
            if (tx.to?.toLowerCase() !== SHOP_TREASURY)
                return 'tx_wrong_recipient';
            const expectedWei = (0, viem_1.parseEther)(item.pricePls.toString());
            if ((tx.value ?? 0n) < expectedWei)
                return 'tx_insufficient_amount';
            return 'ok';
        }
        catch {
            return 'tx_not_found';
        }
    }
    /**
     * Verify a Morbius ERC20 transfer.
     * @param recipientAddress — treasury for shop purchases, seller address for marketplace
     */
    async _verifyMorbiusTx(txHash, walletAddress, item, recipientAddress) {
        try {
            const client = (0, chain_client_1.getPublicClient)();
            const receipt = await client.getTransactionReceipt({ hash: txHash });
            if (!receipt)
                return 'tx_not_found';
            if (receipt.status === 'reverted')
                return 'tx_reverted';
            const expectedWei = (0, viem_1.parseEther)(item.priceMorbius.toString());
            const recipient = recipientAddress.toLowerCase();
            let found = false;
            for (const log of receipt.logs) {
                if (log.address.toLowerCase() !== MORBIUS_TOKEN)
                    continue;
                if (log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_SIG)
                    continue;
                if (!log.topics[1] || !log.topics[2])
                    continue;
                const from = ('0x' + log.topics[1].slice(26)).toLowerCase();
                const to = ('0x' + log.topics[2].slice(26)).toLowerCase();
                const value = log.data && log.data !== '0x' ? BigInt(log.data) : 0n;
                if (from !== walletAddress.toLowerCase())
                    continue;
                if (to !== recipient)
                    return 'tx_wrong_recipient';
                if (value < expectedWei)
                    return 'tx_insufficient_amount';
                found = true;
                break;
            }
            if (!found)
                return 'tx_wrong_sender';
            return 'ok';
        }
        catch {
            return 'tx_not_found';
        }
    }
}
exports.CosmeticsService = CosmeticsService;
//# sourceMappingURL=cosmetics.service.js.map