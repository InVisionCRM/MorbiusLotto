'use client';

import React, { useState, useEffect } from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import { AVATAR_V1_DEFAULTS } from '@/lib/avatar-payload';
import AvatarView from './AvatarView';
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
      <div className={`flex flex-col xl:flex-row flex-1 min-h-0 gap-3 ${compact ? 'p-2' : 'p-4 sm:p-5'}`}>
        <section
          className="xl:flex-[1.35] min-h-0 rounded-2xl border border-cyan-500/20 overflow-hidden"
          style={{
            background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
            boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
            border: '1px inset rgba(60, 60, 60, 0.5)',
          }}
        >
          <div className={`relative h-full flex flex-col items-center justify-center overflow-hidden ${compact ? 'px-4 py-5' : 'px-6 py-7 sm:px-8 sm:py-8'}`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(34,211,238,0.18),transparent_65%)]" />
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/35 to-transparent" />

            <div className="relative z-10 w-full flex flex-col items-center text-center">
              {displayName !== undefined && onDisplayNameChange ? (
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => onDisplayNameChange(e.target.value)}
                  placeholder="Your name"
                  maxLength={32}
                  className={`w-full max-w-[260px] bg-transparent border-b border-cyan-500/30 text-zinc-100 placeholder:text-zinc-500 text-center focus:outline-none focus:border-cyan-400 transition-colors ${compact ? 'pb-1 text-sm font-semibold' : 'pb-2 text-xl sm:text-2xl font-semibold'}`}
                />
              ) : (
                <h1 className={`${compact ? 'text-sm' : 'text-xl sm:text-2xl'} font-semibold tracking-tight text-zinc-100`}>
                  Player Profile
                </h1>
              )}

              <p className="mt-2 text-xs sm:text-sm text-zinc-400 max-w-sm">
                Cycle through looks in one place and keep the avatar front and center.
              </p>

              <div className={`mt-5 sm:mt-6 w-full flex items-center justify-center ${compact ? 'min-h-[280px]' : 'min-h-[360px] lg:min-h-[420px]'}`}>
                <div className="relative">
                  <div className="absolute inset-8 rounded-full bg-cyan-500/10 blur-3xl" />
                  <AvatarView
                    config={config}
                    roamEyes
                    className={compact ? 'relative z-10 w-52 sm:w-64 aspect-[6/7]' : 'relative z-10 w-60 sm:w-72 lg:w-80 aspect-[6/7]'}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={handleRandomizeAll}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-gradient-to-r from-slate-900/90 to-slate-800/90 text-cyan-200 hover:text-white hover:border-cyan-400/40 transition-colors touch-manipulation ${
                    compact ? 'px-3 py-2 text-xs font-medium' : 'px-4 py-2.5 text-sm font-medium'
                  }`}
                  style={{ boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.05)' }}
                >
                  <Shuffle size={compact ? 14 : 16} />
                  Randomize Look
                </button>
                {onToggleRandomPin && (
                  <p className="text-[11px] sm:text-xs text-zinc-500 max-w-xs">
                    Pin any row to keep that selection while randomizing.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="xl:flex-[0.95] min-h-0 flex flex-col overflow-hidden">
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
        </section>
      </div>
    </div>
  );
}
