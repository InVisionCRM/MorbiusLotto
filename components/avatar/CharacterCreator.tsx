'use client';

import React, { useState, useEffect } from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import { AVATAR_V1_DEFAULTS } from '@/lib/avatar-payload';
import AvatarControls from './AvatarControls';
import { Shuffle } from 'lucide-react';
import { ITEM_CATALOG, getUnlockedValuesPerField, type AvatarField } from '@/lib/cosmetics-catalog';
import type { AvatarRandomizeFieldKey } from '@/lib/avatar-randomize-pins';

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = AVATAR_V1_DEFAULTS;

export type RandomizeConfigOptions = {
  /** Catalog item keys pinned in the shop — unlock fields applied after the random roll. */
  pinnedItemKeys?: Set<string>;
  /** Current avatar — values are copied for each key in `pinnedFields` after shop pins (editor pins win). */
  preserveFrom?: AvatarConfig;
  /** Avatar field keys to keep from `preserveFrom` (any source: free color, owned, gift, background URL, etc.). */
  pinnedFields?: Set<string>;
};

/** Randomizes only values the player may use: free tier plus cosmetics they own. */
export function randomizeConfig(ownedItems?: Set<string>, options?: RandomizeConfigOptions): AvatarConfig {
  const unlocked = getUnlockedValuesPerField(ownedItems ?? new Set());
  const roll = (field: AvatarField, fallback: string): string => {
    const pool = unlocked[field];
    if (!pool?.length) return fallback;
    return pool[Math.floor(Math.random() * pool.length)]!;
  };

  const base: AvatarConfig = {
    skinColor: roll('skinColor', DEFAULT_AVATAR_CONFIG.skinColor),
    hairStyle: roll('hairStyle', DEFAULT_AVATAR_CONFIG.hairStyle),
    hairColor: roll('hairColor', DEFAULT_AVATAR_CONFIG.hairColor),
    accessoryColor: roll('accessoryColor', DEFAULT_AVATAR_CONFIG.accessoryColor),
    eyeShape: roll('eyeShape', DEFAULT_AVATAR_CONFIG.eyeShape),
    eyeColor: roll('eyeColor', DEFAULT_AVATAR_CONFIG.eyeColor),
    noseShape: 'Small',
    lipShape: roll('lipShape', DEFAULT_AVATAR_CONFIG.lipShape),
    accessory: roll('accessory', 'None'),
    faceShape: roll('faceShape', DEFAULT_AVATAR_CONFIG.faceShape),
    shirtColor: roll('shirtColor', DEFAULT_AVATAR_CONFIG.shirtColor),
    shirtStyle: roll('shirtStyle', 'Default'),
    hat: roll('hat', 'None'),
    hatColor: roll('hatColor', ''),
    necklace: roll('necklace', 'None'),
    mouthAccessory: roll('mouthAccessory', 'None'),
    makeup: roll('makeup', 'None'),
    facialHair: roll('facialHair', 'None'),
    backgroundImage: roll('backgroundImage', ''),
    overlayImage: roll('overlayImage', ''),
    customPattern: roll('customPattern', ''),
  };

  const shopPins = options?.pinnedItemKeys;
  if (shopPins?.size) {
    for (const key of shopPins) {
      const item = ITEM_CATALOG.find((i) => i.itemKey === key);
      if (!item) continue;
      for (const u of item.unlocks) {
        Object.assign(base, { [u.field]: u.value } as Partial<AvatarConfig>);
      }
    }
  }

  const preserve = options?.preserveFrom;
  const fieldPins = options?.pinnedFields;
  if (preserve && fieldPins?.size) {
    for (const key of fieldPins) {
      const k = key as AvatarRandomizeFieldKey;
      if (!(k in preserve)) continue;
      const v = preserve[k];
      Object.assign(base, { [k]: typeof v === 'string' ? v : '' } as Partial<AvatarConfig>);
    }
  }

  return base;
}

type CharacterCreatorProps = {
  /** Controlled: pass config and onChange to own the state in parent (e.g. modal). */
  config?: AvatarConfig;
  onChange?: (c: AvatarConfig) => void;
  /** Uncontrolled: initial config when not using controlled mode. */
  initialConfig?: AvatarConfig;
  /** When provided, show editable display name instead of static "Player Profile". */
  displayName?: string;
  onDisplayNameChange?: (value: string) => void;
  /** Tighter layout for modals (smaller avatar, tabs, and controls). */
  compact?: boolean;
  /** Item keys the player owns — passed through to AvatarControls for lock indicators. */
  ownedItems?: Set<string>;
  /** Admin wallets bypass all cosmetics locks. */
  isAdmin?: boolean;
  /** Called when user clicks a locked item — opens the purchase sheet in the parent. */
  onLockedItemClick?: (itemKey: string) => void;
  /** Keys locked in the cosmetics shop — Randomize keeps those catalog unlocks. */
  pinnedItemKeys?: Set<string>;
  /** Field keys pinned in the editor — Randomize keeps current values (owned, free, gift, etc.). */
  pinnedRandomFields?: Set<string>;
  onToggleRandomPin?: (field: AvatarRandomizeFieldKey) => void;
};

export default function CharacterCreator({ config: controlledConfig, onChange, initialConfig, displayName, onDisplayNameChange, compact = false, ownedItems, isAdmin = false, onLockedItemClick, pinnedItemKeys, pinnedRandomFields, onToggleRandomPin }: CharacterCreatorProps) {
  const [internalConfig, setInternalConfig] = useState<AvatarConfig>(initialConfig ?? DEFAULT_AVATAR_CONFIG);
  const config = controlledConfig ?? internalConfig;
  const setConfig = onChange ?? setInternalConfig;

  useEffect(() => {
    if (initialConfig != null && !onChange) {
      setInternalConfig(initialConfig);
    }
  }, [initialConfig, onChange]);

  const handleRandomizeAll = () => {
    const opts: RandomizeConfigOptions = {};
    if (pinnedItemKeys?.size) opts.pinnedItemKeys = pinnedItemKeys;
    if (pinnedRandomFields?.size) {
      opts.preserveFrom = config;
      opts.pinnedFields = pinnedRandomFields;
    }
    setConfig(randomizeConfig(ownedItems, Object.keys(opts).length ? opts : undefined));
  };

  return (
    <div className="flex flex-col w-full min-h-0 flex-1">
      <div className={`flex flex-col flex-1 min-h-0 gap-3 ${compact ? 'p-2' : 'p-4 sm:p-5'}`}>
        <section
          className="min-h-0 mx-auto flex w-full max-w-[38rem] flex-1 flex-col rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-slate-50 overflow-hidden p-3.5 sm:p-4 shadow-xl"
        >
          <div className="mb-3 flex flex-col items-center text-center gap-2">
            <div className="min-w-0">
              {displayName !== undefined && onDisplayNameChange ? (
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => onDisplayNameChange(e.target.value)}
                  placeholder="Your name"
                  maxLength={32}
                  className={`w-full max-w-[300px] bg-transparent border-b border-gray-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500 transition-colors text-center ${compact ? 'pb-1 text-sm font-semibold' : 'pb-2 text-xl sm:text-2xl font-semibold'}`}
                />
              ) : (
                <h1 className={`${compact ? 'text-sm' : 'text-xl sm:text-2xl'} font-semibold tracking-tight text-slate-900`}>
                  Player Profile
                </h1>
              )}
            </div>

            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={handleRandomizeAll}
                className={`inline-flex items-center justify-center gap-2 rounded-xl border border-violet-400/40 bg-[length:200%_100%] bg-[linear-gradient(90deg,#6d28d9,#7c3aed,#6366f1,#7c3aed)] text-white animate-shimmer shadow-[0_8px_20px_rgba(99,102,241,0.28)] hover:brightness-110 transition-all touch-manipulation ${
                  compact ? 'px-3 py-2 text-xs font-medium' : 'px-4 py-2.5 text-sm font-medium'
                }`}
              >
                <Shuffle size={compact ? 14 : 16} />
                Randomize
              </button>
              {onToggleRandomPin && (
                <p className="text-[11px] sm:text-xs text-slate-500">
                  
                </p>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <AvatarControls
              config={config}
              onChange={setConfig}
              compact={compact}
              ownedItems={ownedItems}
              isAdmin={isAdmin}
              onLockedItemClick={onLockedItemClick}
              pinnedRandomFields={pinnedRandomFields}
              onToggleRandomPin={onToggleRandomPin}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
