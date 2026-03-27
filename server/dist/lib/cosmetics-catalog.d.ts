/**
 * Cosmetics Catalog — single source of truth for free vs. paid avatar items.
 * Used on both frontend and backend (Node-safe, no browser APIs).
 */
export type ItemTier = 'common' | 'uncommon' | 'rare' | 'legendary';
export type AvatarField = 'skinColor' | 'hairStyle' | 'hairColor' | 'accessoryColor' | 'eyeShape' | 'eyeColor' | 'faceShape' | 'noseShape' | 'lipShape' | 'accessory' | 'hat' | 'hatColor' | 'necklace' | 'mouthAccessory' | 'makeup' | 'facialHair' | 'shirtColor' | 'shirtStyle' | 'backgroundImage' | 'overlayImage' | 'customPattern';
export interface CosmeticItem {
    itemKey: string;
    displayName: string;
    tier: ItemTier;
    /** Max number that can ever be minted from the shop. */
    maxSupply: number;
    /** Each { field, value } pair this item unlocks. Patterns unlock multiple fields. */
    unlocks: Array<{
        field: AvatarField;
        value: string;
    }>;
    /** Price in PLS (human-readable, not wei). 0 = not purchasable with PLS. */
    pricePls: number;
    /** Price in Morbius tokens (human-readable). 0 = not purchasable with Morbius. */
    priceMorbius: number;
}
export declare const FREE_VALUES: Record<AvatarField, Set<string>>;
/** Max mintable copies per shop item at each tier (catalog default; DB row may differ if already minted). */
export declare const MAX_SUPPLY: Record<ItemTier, number>;
export declare const ITEM_CATALOG: CosmeticItem[];
/** Returns the itemKey required to use this field+value, or null if it's free. */
export declare function getItemKeyForValue(field: AvatarField, value: string): string | null;
export interface LockedField {
    field: AvatarField;
    value: string;
    itemKey: string | null;
    displayName: string | null;
}
/**
 * Given an avatar config and a set of owned item keys, returns the list of
 * fields that are locked (require items the player doesn't own).
 */
export declare function getLockedFields(config: Partial<Record<string, string>>, ownedItemKeys: Set<string>): LockedField[];
/** Returns true if the address is in the ADMIN_WALLETS env var (case-insensitive). */
export declare function isAdminWallet(address: string): boolean;
/**
 * Returns for each avatar field the list of values the player is allowed to use
 * (free values + values unlocked by owned items).
 */
export declare function getUnlockedValuesPerField(ownedItemKeys: Set<string>): Record<AvatarField, string[]>;
/**
 * Generates a random avatar config using only unlocked options (free + owned items).
 * Used as a stable placeholder for players who have not set an avatar.
 */
export declare function randomPlaceholderConfig(ownedItemKeys: Set<string>): Record<string, unknown>;
//# sourceMappingURL=cosmetics-catalog.d.ts.map