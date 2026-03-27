import { Pool } from 'pg';
import { type CosmeticItem } from '../lib/cosmetics-catalog';
export type PurchaseCurrency = 'PLS' | 'MORBIUS';
export type PurchaseResult = 'ok' | 'already_owned' | 'not_found' | 'not_listed' | 'sold_out' | 'tx_already_used' | 'tx_not_found' | 'tx_wrong_sender' | 'tx_wrong_recipient' | 'tx_insufficient_amount' | 'tx_reverted';
export type ListingResult = 'ok' | 'not_owned' | 'already_listed' | 'item_not_found';
export type BuyListingResult = 'ok' | 'listing_not_found' | 'already_sold' | 'seller_no_longer_owns' | 'tx_already_used' | 'tx_not_found' | 'tx_wrong_sender' | 'tx_wrong_recipient' | 'tx_insufficient_amount' | 'tx_reverted';
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
    displayName: string;
    tier: string;
}
export declare class CosmeticsService {
    private readonly pool;
    constructor(pool: Pool);
    /**
     * Merged catalog + DB mint/supply/pricing.
     * Public: omit rows with shop_listed = false. Admin: pass includeDelisted for full list + shopListed on each item.
     */
    getAllItems(options?: {
        includeDelisted?: boolean;
    }): Promise<Array<CosmeticItem & {
        mintedCount: number;
        shopListed?: boolean;
    }>>;
    /**
     * Returns a map of "field:value" → itemKey for all DB-created items.
     * Used by the server-side avatar validation to catch dynamically added colors.
     */
    getDbValueMap(): Promise<Map<string, string>>;
    /** Create a new item (admin builder). Returns the new item key or an error string. */
    createItem(params: {
        itemKey: string;
        displayName: string;
        tier: string;
        priceMorbius: number;
        maxSupply: number;
        unlocksField: string;
        unlocksValue: string;
    }): Promise<'ok' | 'duplicate_key' | 'duplicate_value'>;
    /** Admin: update tier, price, maxSupply, and/or shop_listed. */
    updateItem(itemKey: string, updates: {
        tier?: string;
        priceMorbius?: number;
        maxSupply?: number;
        shopListed?: boolean;
    }): Promise<'ok' | 'not_found' | 'supply_below_minted'>;
    /**
     * Admin: set shop_listed for many keys (e.g. variant-review approve/reject sync).
     * Only updates existing active rows. Returns item_key values with no matching row.
     */
    bulkSetShopListed(pairs: Array<{
        itemKey: string;
        shopListed: boolean;
    }>): Promise<{
        updated: number;
        notFound: string[];
    }>;
    /** Admin: bulk-update price for all items of a given tier. Returns count of rows updated. */
    updateTierPricing(tier: string, priceMorbius: number): Promise<number>;
    /** Item keys the player owns. */
    getInventory(walletAddress: string): Promise<string[]>;
    /** Admin: wallets that own a catalog item (shop purchase or grant; acquired_from set when gifted). */
    getOwnersForItem(itemKey: string): Promise<Array<{
        walletAddress: string;
        acquiredAt: string;
        acquiredFrom: string | null;
    }>>;
    /** Returns true if the player owns the item. */
    hasItem(walletAddress: string, itemKey: string): Promise<boolean>;
    /**
     * Grant an item without payment (admin grant or test).
     * Returns false if already owned.
     */
    grantItem(walletAddress: string, itemKey: string, fromAddress?: string | null): Promise<boolean>;
    /**
     * Transfer an item from one player to another (gift).
     * Returns 'ok' | 'not_owned' | 'already_owned'
     */
    giftItem(fromAddress: string, toAddress: string, itemKey: string): Promise<'ok' | 'not_owned' | 'already_owned'>;
    /**
     * Record a purchase after verifying the on-chain transaction.
     * Enforces supply caps via minted_count < max_supply check.
     */
    recordPurchase(walletAddress: string, itemKey: string, txHash: string, currency: PurchaseCurrency): Promise<PurchaseResult>;
    /** Get active marketplace listings, optionally filtered. */
    getListings(filters?: {
        itemKey?: string;
        sellerAddress?: string;
    }): Promise<MarketListing[]>;
    /** Create a marketplace listing. Seller must own the item. */
    createListing(sellerAddress: string, itemKey: string, priceMorbius: number): Promise<ListingResult>;
    /** Cancel an active listing. Only the seller can cancel. */
    cancelListing(sellerAddress: string, listingId: number): Promise<'ok' | 'not_found' | 'not_yours'>;
    /** Update the price of an active listing. Only the seller can update. */
    updateListingPrice(sellerAddress: string, listingId: number, newPrice: number): Promise<'ok' | 'not_found' | 'not_yours'>;
    /**
     * Buy a marketplace listing.
     * Verifies on-chain: buyer sent priceMorbius Morbius tokens directly to seller.
     * Atomically: marks listing sold, transfers ownership, records tx hash.
     */
    buyListing(buyerAddress: string, listingId: number, txHash: string): Promise<BuyListingResult>;
    private _verifyPlsTx;
    /**
     * Verify a Morbius ERC20 transfer.
     * @param recipientAddress — treasury for shop purchases, seller address for marketplace
     */
    private _verifyMorbiusTx;
}
//# sourceMappingURL=cosmetics.service.d.ts.map