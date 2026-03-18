'use client';

import { useState, useEffect, useCallback } from 'react';
import { getItemKeyForValue, getLockedFields, isAdminWallet, ITEM_CATALOG, type AvatarField, type CosmeticItem, type LockedField } from '@/lib/cosmetics-catalog';
import type { AvatarConfig } from '@/lib/websocket-client';

export type { CosmeticItem, LockedField, AvatarField };
export { getItemKeyForValue, getLockedFields, ITEM_CATALOG };

export interface CosmeticItemWithSupply extends CosmeticItem {
  mintedCount: number;
  remaining: number;
  soldOut: boolean;
}

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

/**
 * Fetches the player's cosmetic inventory (owned item keys).
 * Returns an empty array if address is not provided.
 */
export function useInventory(address: string | undefined) {
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!address) { setItems([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/cosmetics/inventory/${address}`);
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data.items) ? data.items : []);
      }
    } catch {
      // silently keep last value
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { refresh(); }, [refresh]);

  const ownedSet = new Set(items);

  /** True if the player owns the given item key (or is an admin). */
  const owns = (itemKey: string) => ownedSet.has(itemKey);

  /** True if the player can freely use this field+value (free item OR owned). */
  const canUse = (field: AvatarField, value: string, adminBypass = false): boolean => {
    if (adminBypass) return true;
    const itemKey = getItemKeyForValue(field, value);
    if (!itemKey) return true; // free
    return ownedSet.has(itemKey);
  };

  /** Returns all locked fields in the given avatar config. */
  const lockedIn = (config: Partial<AvatarConfig>, adminBypass = false): LockedField[] => {
    if (adminBypass) return [];
    return getLockedFields(config as Record<string, string>, ownedSet);
  };

  return { items, ownedSet, loading, refresh, owns, canUse, lockedIn };
}

/**
 * Fetches the full catalog with live minted counts from the server.
 */
export function useCatalog() {
  const [items, setItems] = useState<CosmeticItemWithSupply[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cosmetics/items');
      if (res.ok) {
        const data: Array<CosmeticItem & { mintedCount: number }> = await res.json();
        setItems(data.map(i => ({
          ...i,
          mintedCount: i.mintedCount ?? 0,
          remaining: i.maxSupply - (i.mintedCount ?? 0),
          soldOut: (i.mintedCount ?? 0) >= i.maxSupply,
        })));
      }
    } catch {
      // fallback to static catalog
      setItems(ITEM_CATALOG.map(i => ({
        ...i,
        mintedCount: 0,
        remaining: i.maxSupply,
        soldOut: false,
      })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { items, loading, refresh };
}

/**
 * Fetches active marketplace listings.
 */
export function useMarketListings(filters?: { itemKey?: string; sellerAddress?: string }) {
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters?.itemKey) params.set('itemKey', filters.itemKey);
      if (filters?.sellerAddress) params.set('sellerAddress', filters.sellerAddress);
      const res = await fetch(`/api/cosmetics/market?${params}`);
      if (res.ok) {
        const data = await res.json();
        setListings(Array.isArray(data.listings) ? data.listings : []);
      }
    } catch {
      // silently keep last value
    } finally {
      setLoading(false);
    }
  }, [filters?.itemKey, filters?.sellerAddress]);

  useEffect(() => { refresh(); }, [refresh]);

  return { listings, loading, refresh };
}

/** Record a purchase after on-chain payment. Backend verifies the txHash. */
export async function purchaseItem(
  walletAddress: string,
  itemKey: string,
  txHash: string,
  currency: 'PLS' | 'MORBIUS',
): Promise<string[]> {
  const res = await fetch('/api/cosmetics/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, itemKey, txHash, currency }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Purchase failed');
  return data.items ?? [];
}

/** Gift an item to another player. Ownership transfers to recipient. */
export async function giftItem(fromAddress: string, toAddress: string, itemKey: string): Promise<string[]> {
  const res = await fetch('/api/cosmetics/gift', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromAddress, toAddress, itemKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Gift failed');
  return data.items ?? [];
}

/** List an owned item on the marketplace. */
export async function createListing(sellerAddress: string, itemKey: string, priceMorbius: number): Promise<void> {
  const res = await fetch('/api/cosmetics/market/list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sellerAddress, itemKey, priceMorbius }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Listing failed');
}

/** Update the price of an active marketplace listing. */
export async function updateListingPrice(sellerAddress: string, listingId: number, newPrice: number): Promise<void> {
  const res = await fetch('/api/cosmetics/market/update-price', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sellerAddress, listingId, newPrice }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Update failed');
}

/** Cancel an active marketplace listing. */
export async function cancelListing(sellerAddress: string, listingId: number): Promise<void> {
  const res = await fetch('/api/cosmetics/market/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sellerAddress, listingId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Cancel failed');
}

/** Buy a marketplace listing after on-chain payment to seller. */
export async function buyListing(buyerAddress: string, listingId: number, txHash: string): Promise<string[]> {
  const res = await fetch('/api/cosmetics/market/buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buyerAddress, listingId, txHash }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Purchase failed');
  return data.items ?? [];
}
