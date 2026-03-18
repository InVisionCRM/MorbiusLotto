import { Pool } from 'pg';
import { parseEther } from 'viem';
import { getPublicClient } from '../utils/chain-client';
import { ITEM_CATALOG, type CosmeticItem } from '../lib/cosmetics-catalog';

// ─── Constants ────────────────────────────────────────────────────────────────

const SHOP_TREASURY = (
  process.env.SHOP_TREASURY_ADDRESS || '0x41682815B05fE6b54a6C0f8813bB99423EE0309D'
).toLowerCase();

const MORBIUS_TOKEN = (
  process.env.MORBIUS_TOKEN_ADDRESS || '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1'
).toLowerCase();

/** keccak256('Transfer(address,address,uint256)') */
const ERC20_TRANSFER_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PurchaseCurrency = 'PLS' | 'MORBIUS';

export type PurchaseResult =
  | 'ok'
  | 'already_owned'
  | 'not_found'
  | 'sold_out'
  | 'tx_already_used'
  | 'tx_not_found'
  | 'tx_wrong_sender'
  | 'tx_wrong_recipient'
  | 'tx_insufficient_amount'
  | 'tx_reverted';

export type ListingResult =
  | 'ok'
  | 'not_owned'
  | 'already_listed'
  | 'item_not_found';

export type BuyListingResult =
  | 'ok'
  | 'listing_not_found'
  | 'already_sold'
  | 'seller_no_longer_owns'
  | 'tx_already_used'
  | 'tx_not_found'
  | 'tx_wrong_sender'
  | 'tx_wrong_recipient'
  | 'tx_insufficient_amount'
  | 'tx_reverted';

export interface MarketListing {
  id: number;
  sellerAddress: string;
  itemKey: string;
  priceMorbius: number;
  status: 'active' | 'sold' | 'cancelled';
  listedAt: string;
  soldAt: string | null;
  buyerAddress: string | null;
  txHash: string | null;
  // joined from catalog
  displayName: string;
  tier: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class CosmeticsService {
  constructor(private readonly pool: Pool) {}

  /** All items from the DB (tier/price/maxSupply may have been overridden by admin). Includes DB-created items. */
  async getAllItems(): Promise<Array<CosmeticItem & { mintedCount: number }>> {
    const { rows } = await this.pool.query<{
      item_key: string;
      display_name: string;
      minted_count: string;
      tier: string;
      price_morbius: string;
      max_supply: string;
      is_db_created: boolean;
      unlocks_field: string | null;
      unlocks_value: string | null;
    }>(
      `SELECT item_key, display_name, minted_count, tier, price_morbius, max_supply,
              is_db_created, unlocks_field, unlocks_value
       FROM cosmetic_items WHERE is_active = true`,
    );
    const dbMap = new Map(rows.map(r => [r.item_key, r]));

    // Catalog items — override tier/price/supply from DB if present
    const catalogItems = ITEM_CATALOG.map(i => {
      const db = dbMap.get(i.itemKey);
      return {
        ...i,
        tier: (db?.tier ?? i.tier) as CosmeticItem['tier'],
        priceMorbius: db ? parseInt(db.price_morbius, 10) : i.priceMorbius,
        maxSupply: db ? parseInt(db.max_supply, 10) : i.maxSupply,
        mintedCount: db ? parseInt(db.minted_count, 10) : 0,
      };
    });

    // DB-created items not in the static catalog
    const catalogKeys = new Set(ITEM_CATALOG.map(i => i.itemKey));
    const dynamicItems: Array<CosmeticItem & { mintedCount: number }> = rows
      .filter(r => r.is_db_created && !catalogKeys.has(r.item_key) && r.unlocks_field && r.unlocks_value)
      .map(r => ({
        itemKey: r.item_key,
        displayName: r.display_name,
        tier: r.tier as CosmeticItem['tier'],
        maxSupply: parseInt(r.max_supply, 10),
        pricePls: 0,
        priceMorbius: parseInt(r.price_morbius, 10),
        unlocks: [{ field: r.unlocks_field as any, value: r.unlocks_value! }],
        mintedCount: parseInt(r.minted_count, 10),
      }));

    return [...catalogItems, ...dynamicItems];
  }

  /**
   * Returns a map of "field:value" → itemKey for all DB-created items.
   * Used by the server-side avatar validation to catch dynamically added colors.
   */
  async getDbValueMap(): Promise<Map<string, string>> {
    const { rows } = await this.pool.query<{
      item_key: string;
      unlocks_field: string;
      unlocks_value: string;
    }>(
      `SELECT item_key, unlocks_field, unlocks_value
       FROM cosmetic_items
       WHERE is_db_created = true AND is_active = true
         AND unlocks_field IS NOT NULL AND unlocks_value IS NOT NULL`,
    );
    return new Map(rows.map(r => [`${r.unlocks_field}:${r.unlocks_value}`, r.item_key]));
  }

  /** Create a new item (admin builder). Returns the new item key or an error string. */
  async createItem(params: {
    itemKey: string;
    displayName: string;
    tier: string;
    priceMorbius: number;
    maxSupply: number;
    unlocksField: string;
    unlocksValue: string;
  }): Promise<'ok' | 'duplicate_key' | 'duplicate_value'> {
    // Check for duplicate item key
    const { rows: keyCheck } = await this.pool.query(
      `SELECT 1 FROM cosmetic_items WHERE item_key = $1`,
      [params.itemKey],
    );
    if (keyCheck.length > 0) return 'duplicate_key';

    // Check for duplicate field+value (another item already unlocks this exact color)
    const { rows: valCheck } = await this.pool.query(
      `SELECT 1 FROM cosmetic_items WHERE unlocks_field = $1 AND unlocks_value = $2 AND is_active = true`,
      [params.unlocksField, params.unlocksValue],
    );
    if (valCheck.length > 0) return 'duplicate_value';

    await this.pool.query(
      `INSERT INTO cosmetic_items
         (item_key, display_name, tier, price_pls, price_morbius, max_supply,
          is_active, is_db_created, unlocks_field, unlocks_value)
       VALUES ($1, $2, $3, 0, $4, $5, true, true, $6, $7)`,
      [params.itemKey, params.displayName, params.tier, params.priceMorbius,
       params.maxSupply, params.unlocksField, params.unlocksValue],
    );
    return 'ok';
  }

  /** Admin: update tier, price, and/or maxSupply for an item. */
  async updateItem(
    itemKey: string,
    updates: { tier?: string; priceMorbius?: number; maxSupply?: number },
  ): Promise<'ok' | 'not_found' | 'supply_below_minted'> {
    // Build SET clause dynamically
    const sets: string[] = [];
    const values: unknown[] = [itemKey];
    if (updates.tier !== undefined)         { values.push(updates.tier);         sets.push(`tier = $${values.length}`); }
    if (updates.priceMorbius !== undefined) { values.push(updates.priceMorbius); sets.push(`price_morbius = $${values.length}`); }
    if (updates.maxSupply !== undefined)    { values.push(updates.maxSupply);    sets.push(`max_supply = $${values.length}`); }
    if (sets.length === 0) return 'ok';

    // If we're changing maxSupply, guard against setting it below minted_count
    const whereClause = updates.maxSupply !== undefined
      ? `WHERE item_key = $1 AND minted_count <= $${values.indexOf(updates.maxSupply) + 1}`
      : `WHERE item_key = $1`;

    const { rowCount } = await this.pool.query(
      `UPDATE cosmetic_items SET ${sets.join(', ')} ${whereClause}`,
      values,
    );
    if (rowCount === 0) {
      // Check if item exists at all to give a more precise error
      const { rows } = await this.pool.query(
        `SELECT minted_count FROM cosmetic_items WHERE item_key = $1`,
        [itemKey],
      );
      if (rows.length === 0) return 'not_found';
      return 'supply_below_minted';
    }
    return 'ok';
  }

  /** Admin: bulk-update price for all items of a given tier. Returns count of rows updated. */
  async updateTierPricing(tier: string, priceMorbius: number): Promise<number> {
    const { rowCount } = await this.pool.query(
      `UPDATE cosmetic_items SET price_morbius = $1 WHERE tier = $2 AND is_active = true`,
      [priceMorbius, tier],
    );
    return rowCount ?? 0;
  }

  /** Item keys the player owns. */
  async getInventory(walletAddress: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ item_key: string }>(
      `SELECT item_key FROM player_cosmetics WHERE wallet_address = $1`,
      [walletAddress.toLowerCase()],
    );
    return rows.map(r => r.item_key);
  }

  /** Returns true if the player owns the item. */
  async hasItem(walletAddress: string, itemKey: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM player_cosmetics WHERE wallet_address = $1 AND item_key = $2`,
      [walletAddress.toLowerCase(), itemKey],
    );
    return parseInt(rows[0]?.count ?? '0', 10) > 0;
  }

  /**
   * Grant an item without payment (admin grant or test).
   * Returns false if already owned.
   */
  async grantItem(
    walletAddress: string,
    itemKey: string,
    fromAddress: string | null = null,
  ): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `INSERT INTO player_cosmetics (wallet_address, item_key, acquired_from)
       VALUES ($1, $2, $3)
       ON CONFLICT (wallet_address, item_key) DO NOTHING`,
      [walletAddress.toLowerCase(), itemKey, fromAddress?.toLowerCase() ?? null],
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Transfer an item from one player to another (gift).
   * Returns 'ok' | 'not_owned' | 'already_owned'
   */
  async giftItem(
    fromAddress: string,
    toAddress: string,
    itemKey: string,
  ): Promise<'ok' | 'not_owned' | 'already_owned'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: senderRows } = await client.query<{ id: number }>(
        `SELECT id FROM player_cosmetics WHERE wallet_address = $1 AND item_key = $2 FOR UPDATE`,
        [fromAddress.toLowerCase(), itemKey],
      );
      if (senderRows.length === 0) {
        await client.query('ROLLBACK');
        return 'not_owned';
      }

      const { rows: recipRows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM player_cosmetics WHERE wallet_address = $1 AND item_key = $2`,
        [toAddress.toLowerCase(), itemKey],
      );
      if (parseInt(recipRows[0]?.count ?? '0', 10) > 0) {
        await client.query('ROLLBACK');
        return 'already_owned';
      }

      await client.query(
        `DELETE FROM player_cosmetics WHERE wallet_address = $1 AND item_key = $2`,
        [fromAddress.toLowerCase(), itemKey],
      );
      await client.query(
        `INSERT INTO player_cosmetics (wallet_address, item_key, acquired_from) VALUES ($1, $2, $3)`,
        [toAddress.toLowerCase(), itemKey, fromAddress.toLowerCase()],
      );

      await client.query('COMMIT');
      return 'ok';
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ── On-chain purchase verification ────────────────────────────────────────

  /**
   * Record a purchase after verifying the on-chain transaction.
   * Enforces supply caps via minted_count < max_supply check.
   */
  async recordPurchase(
    walletAddress: string,
    itemKey: string,
    txHash: string,
    currency: PurchaseCurrency,
  ): Promise<PurchaseResult> {
    const catalogItem = ITEM_CATALOG.find(i => i.itemKey === itemKey);
    if (!catalogItem) return 'not_found';

    // Replay protection
    const { rows: used } = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM purchase_tx_hashes WHERE tx_hash = $1`,
      [txHash.toLowerCase()],
    );
    if (parseInt(used[0]?.count ?? '0', 10) > 0) return 'tx_already_used';

    // Verify on-chain
    const verifyResult = currency === 'PLS'
      ? await this._verifyPlsTx(txHash, walletAddress, catalogItem)
      : await this._verifyMorbiusTx(txHash, walletAddress, catalogItem, SHOP_TREASURY);

    if (verifyResult !== 'ok') return verifyResult;

    // Atomic: check supply cap, insert tx hash, grant item
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Check + increment minted_count atomically
      const { rows: supplyRows } = await client.query<{ minted_count: string; max_supply: string }>(
        `SELECT minted_count, max_supply FROM cosmetic_items WHERE item_key = $1 FOR UPDATE`,
        [itemKey],
      );
      const minted = parseInt(supplyRows[0]?.minted_count ?? '0', 10);
      const maxSupply = parseInt(supplyRows[0]?.max_supply ?? '999999', 10);
      if (minted >= maxSupply) {
        await client.query('ROLLBACK');
        return 'sold_out';
      }

      await client.query(
        `INSERT INTO purchase_tx_hashes (tx_hash, wallet_address, item_key, currency)
         VALUES ($1, $2, $3, $4)`,
        [txHash.toLowerCase(), walletAddress.toLowerCase(), itemKey, currency],
      );

      await client.query(
        `INSERT INTO player_cosmetics (wallet_address, item_key)
         VALUES ($1, $2)
         ON CONFLICT (wallet_address, item_key) DO NOTHING`,
        [walletAddress.toLowerCase(), itemKey],
      );

      await client.query(
        `UPDATE cosmetic_items SET minted_count = minted_count + 1 WHERE item_key = $1`,
        [itemKey],
      );

      await client.query('COMMIT');
      return 'ok';
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.code === '23505' && err.constraint?.includes('purchase_tx_hashes')) return 'tx_already_used';
      if (err.code === '23505') return 'already_owned';
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Marketplace ────────────────────────────────────────────────────────────

  /** Get active marketplace listings, optionally filtered. */
  async getListings(filters?: { itemKey?: string; sellerAddress?: string }): Promise<MarketListing[]> {
    const conditions: string[] = [`ml.status = 'active'`];
    const params: string[] = [];

    if (filters?.itemKey) {
      params.push(filters.itemKey);
      conditions.push(`ml.item_key = $${params.length}`);
    }
    if (filters?.sellerAddress) {
      params.push(filters.sellerAddress.toLowerCase());
      conditions.push(`ml.seller_address = $${params.length}`);
    }

    const where = conditions.join(' AND ');
    const { rows } = await this.pool.query<{
      id: string; seller_address: string; item_key: string; price_morbius: string;
      status: string; listed_at: string; sold_at: string | null;
      buyer_address: string | null; tx_hash: string | null;
    }>(
      `SELECT ml.id, ml.seller_address, ml.item_key, ml.price_morbius, ml.status,
              ml.listed_at, ml.sold_at, ml.buyer_address, ml.tx_hash
       FROM market_listings ml
       WHERE ${where}
       ORDER BY ml.listed_at DESC`,
      params,
    );

    return rows.map(r => {
      const catalog = ITEM_CATALOG.find(i => i.itemKey === r.item_key);
      return {
        id: parseInt(r.id, 10),
        sellerAddress: r.seller_address,
        itemKey: r.item_key,
        priceMorbius: parseInt(r.price_morbius, 10),
        status: r.status as MarketListing['status'],
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
  async createListing(
    sellerAddress: string,
    itemKey: string,
    priceMorbius: number,
  ): Promise<ListingResult> {
    if (!ITEM_CATALOG.find(i => i.itemKey === itemKey)) return 'item_not_found';

    const owns = await this.hasItem(sellerAddress, itemKey);
    if (!owns) return 'not_owned';

    try {
      await this.pool.query(
        `INSERT INTO market_listings (seller_address, item_key, price_morbius)
         VALUES ($1, $2, $3)`,
        [sellerAddress.toLowerCase(), itemKey, priceMorbius],
      );
      return 'ok';
    } catch (err: any) {
      if (err.code === '23505') return 'already_listed';
      throw err;
    }
  }

  /** Cancel an active listing. Only the seller can cancel. */
  async cancelListing(
    sellerAddress: string,
    listingId: number,
  ): Promise<'ok' | 'not_found' | 'not_yours'> {
    const { rows } = await this.pool.query<{ seller_address: string; status: string }>(
      `SELECT seller_address, status FROM market_listings WHERE id = $1`,
      [listingId],
    );
    if (rows.length === 0) return 'not_found';
    if (rows[0].seller_address !== sellerAddress.toLowerCase()) return 'not_yours';
    if (rows[0].status !== 'active') return 'not_found';

    await this.pool.query(
      `UPDATE market_listings SET status = 'cancelled' WHERE id = $1`,
      [listingId],
    );
    return 'ok';
  }

  /**
   * Buy a marketplace listing.
   * Verifies on-chain: buyer sent priceMorbius Morbius tokens directly to seller.
   * Atomically: marks listing sold, transfers ownership, records tx hash.
   */
  async buyListing(
    buyerAddress: string,
    listingId: number,
    txHash: string,
  ): Promise<BuyListingResult> {
    // Load listing
    const { rows: listingRows } = await this.pool.query<{
      id: string; seller_address: string; item_key: string; price_morbius: string; status: string;
    }>(
      `SELECT id, seller_address, item_key, price_morbius, status FROM market_listings WHERE id = $1`,
      [listingId],
    );
    if (listingRows.length === 0) return 'listing_not_found';
    const listing = listingRows[0];
    if (listing.status !== 'active') return 'already_sold';

    // Replay protection
    const { rows: used } = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM purchase_tx_hashes WHERE tx_hash = $1`,
      [txHash.toLowerCase()],
    );
    if (parseInt(used[0]?.count ?? '0', 10) > 0) return 'tx_already_used';

    // Verify on-chain: buyer → seller, priceMorbius Morbius tokens
    const fakeItem = { priceMorbius: parseInt(listing.price_morbius, 10) } as CosmeticItem;
    const verifyResult = await this._verifyMorbiusTx(
      txHash,
      buyerAddress,
      fakeItem,
      listing.seller_address,
    );
    if (verifyResult !== 'ok') return verifyResult as BuyListingResult;

    // Atomic transfer
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Re-check listing is still active (race condition)
      const { rows: recheckRows } = await client.query<{ status: string; seller_address: string }>(
        `SELECT status, seller_address FROM market_listings WHERE id = $1 FOR UPDATE`,
        [listingId],
      );
      if (recheckRows[0]?.status !== 'active') {
        await client.query('ROLLBACK');
        return 'already_sold';
      }

      // Verify seller still owns the item
      const { rows: ownerRows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM player_cosmetics
         WHERE wallet_address = $1 AND item_key = $2`,
        [listing.seller_address, listing.item_key],
      );
      if (parseInt(ownerRows[0]?.count ?? '0', 10) === 0) {
        await client.query('ROLLBACK');
        return 'seller_no_longer_owns';
      }

      // Record tx hash
      await client.query(
        `INSERT INTO purchase_tx_hashes (tx_hash, wallet_address, item_key, currency)
         VALUES ($1, $2, $3, 'MORBIUS')`,
        [txHash.toLowerCase(), buyerAddress.toLowerCase(), listing.item_key],
      );

      // Transfer ownership
      await client.query(
        `DELETE FROM player_cosmetics WHERE wallet_address = $1 AND item_key = $2`,
        [listing.seller_address, listing.item_key],
      );
      await client.query(
        `INSERT INTO player_cosmetics (wallet_address, item_key, acquired_from) VALUES ($1, $2, $3)`,
        [buyerAddress.toLowerCase(), listing.item_key, listing.seller_address],
      );

      // Mark listing sold
      await client.query(
        `UPDATE market_listings
         SET status = 'sold', sold_at = NOW(), buyer_address = $1, tx_hash = $2
         WHERE id = $3`,
        [buyerAddress.toLowerCase(), txHash.toLowerCase(), listingId],
      );

      await client.query('COMMIT');
      return 'ok';
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.code === '23505') return 'tx_already_used';
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async _verifyPlsTx(
    txHash: string,
    walletAddress: string,
    item: CosmeticItem,
  ): Promise<PurchaseResult> {
    try {
      const client = getPublicClient();
      const [tx, receipt] = await Promise.all([
        client.getTransaction({ hash: txHash as `0x${string}` }),
        client.getTransactionReceipt({ hash: txHash as `0x${string}` }),
      ]);

      if (!tx) return 'tx_not_found';
      if (receipt.status === 'reverted') return 'tx_reverted';

      if (tx.from.toLowerCase() !== walletAddress.toLowerCase()) return 'tx_wrong_sender';
      if (tx.to?.toLowerCase() !== SHOP_TREASURY) return 'tx_wrong_recipient';

      const expectedWei = parseEther(item.pricePls.toString());
      if ((tx.value ?? 0n) < expectedWei) return 'tx_insufficient_amount';

      return 'ok';
    } catch {
      return 'tx_not_found';
    }
  }

  /**
   * Verify a Morbius ERC20 transfer.
   * @param recipientAddress — treasury for shop purchases, seller address for marketplace
   */
  private async _verifyMorbiusTx(
    txHash: string,
    walletAddress: string,
    item: Pick<CosmeticItem, 'priceMorbius'>,
    recipientAddress: string,
  ): Promise<PurchaseResult> {
    try {
      const client = getPublicClient();
      const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });

      if (!receipt) return 'tx_not_found';
      if (receipt.status === 'reverted') return 'tx_reverted';

      const expectedWei = parseEther(item.priceMorbius.toString());
      const recipient = recipientAddress.toLowerCase();

      let found = false;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== MORBIUS_TOKEN) continue;
        if (log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_SIG) continue;
        if (!log.topics[1] || !log.topics[2]) continue;

        const from  = ('0x' + log.topics[1].slice(26)).toLowerCase();
        const to    = ('0x' + log.topics[2].slice(26)).toLowerCase();
        const value = log.data && log.data !== '0x' ? BigInt(log.data) : 0n;

        if (from !== walletAddress.toLowerCase()) continue;
        if (to !== recipient) return 'tx_wrong_recipient';
        if (value < expectedWei) return 'tx_insufficient_amount';

        found = true;
        break;
      }

      if (!found) return 'tx_wrong_sender';
      return 'ok';
    } catch {
      return 'tx_not_found';
    }
  }
}
