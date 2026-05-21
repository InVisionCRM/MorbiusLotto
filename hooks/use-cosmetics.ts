'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getItemKeyForValue,
  getLockedFields,
  ITEM_CATALOG,
  type AvatarField,
  type CosmeticItem,
  type LockedField,
} from '@/lib/cosmetics-catalog';
import type { AvatarConfig, AvatarPayload } from '@/lib/websocket-client';

export type { CosmeticItem, LockedField, AvatarField };
export { getItemKeyForValue, getLockedFields, ITEM_CATALOG };

export interface CosmeticItemWithSupply extends CosmeticItem {
  mintedCount: number;
  remaining: number;
  soldOut: boolean;
}

/**
 * Fetches the player's cosmetic inventory (owned item keys from the legacy
 * paid catalog). Kept for admin tools and historical display; all avatar
 * cosmetics are now free regardless of ownership.
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
  const owns = (itemKey: string) => ownedSet.has(itemKey);
  /** All cosmetics are free; kept as a stable shim for legacy callers. */
  const canUse = (_field: AvatarField, _value: string, _adminBypass = false): boolean => true;
  const lockedIn = (_config: Partial<AvatarConfig>, _adminBypass = false): LockedField[] => [];
  const lockedInPayload = (_payload: AvatarPayload | null | undefined, _adminBypass = false): LockedField[] => [];

  return { items, ownedSet, loading, refresh, owns, canUse, lockedIn, lockedInPayload };
}

/**
 * Fetches the full catalog. Used by the avatar editor to discover dynamic
 * background items added by admins. Pricing/supply fields are vestigial.
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
