import type { ItemTier } from '@/lib/cosmetics-catalog';

export interface ItemRow {
  itemKey: string;
  displayName: string;
  tier: ItemTier;
  priceMorbius: number;
  maxSupply: number;
  mintedCount: number;
  /** false = hidden from public shop (DB row only). */
  shopListed: boolean;
  unlocks: Array<{ field: string; value: string }>;
}

export interface EditState {
  tier: ItemTier;
  priceMorbius: string;
  maxSupply: string;
  shopListed: boolean;
}

export type OwnerRow = {
  walletAddress: string;
  acquiredAt: string;
  acquiredFrom: string | null;
};
