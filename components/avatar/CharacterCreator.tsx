'use client';

import React, { useState, useEffect } from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import { AVATAR_V1_DEFAULTS } from '@/lib/avatar-payload';
import AvatarControls from './AvatarControls';
import { Shuffle, Pencil } from 'lucide-react';
import { getUnlockedValuesPerField, type AvatarField } from '@/lib/cosmetics-catalog';
import type { AvatarRandomizeFieldKey } from '@/lib/avatar-randomize-pins';

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = AVATAR_V1_DEFAULTS;

export type RandomizeConfigOptions = {
  /** Current avatar — values are copied for each key in `pinnedFields`. */
  preserveFrom?: AvatarConfig;
  /** Avatar field keys to keep from `preserveFrom`. */
  pinnedFields?: Set<string>;
};

/** Randomizes the full set of available avatar values. */
export function randomizeConfig(_ownedItems?: Set<string>, options?: RandomizeConfigOptions): AvatarConfig {
  const unlocked = getUnlockedValuesPerField();
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
  /** Field keys pinned in the editor — Randomize keeps those current values. */
  pinnedRandomFields?: Set<string>;
  onToggleRandomPin?: (field: AvatarRandomizeFieldKey) => void;
};

export default function CharacterCreator({ config: controlledConfig, onChange, initialConfig, displayName, onDisplayNameChange, compact = false, pinnedRandomFields, onToggleRandomPin }: CharacterCreatorProps) {
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
    if (pinnedRandomFields?.size) {
      opts.preserveFrom = config;
      opts.pinnedFields = pinnedRandomFields;
    }
    setConfig(randomizeConfig(undefined, Object.keys(opts).length ? opts : undefined));
  };

  return (
    <div className="flex flex-col w-full min-h-0 flex-1">
      <div className={`flex flex-col flex-1 min-h-0 gap-3 ${compact ? 'p-2' : 'p-4 sm:p-5'}`}>
        <section
          className={`flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-slate-50 shadow-xl ${compact ? 'p-2.5' : 'p-3.5 sm:p-4'}`}
        >
          <div className={`flex flex-col items-center text-center gap-2 ${compact ? 'mb-2' : 'mb-3'}`}>
            <div className="min-w-0 w-full max-w-md px-1">
              {displayName !== undefined && onDisplayNameChange ? (
                <div className="relative">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => onDisplayNameChange(e.target.value)}
                    placeholder="Tap to set your name"
                    maxLength={32}
                    className={`w-full bg-transparent border-b border-gray-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500 transition-colors text-center ${compact ? 'pb-1 pr-6 text-sm font-semibold' : 'pb-2 pr-7 text-xl sm:text-2xl font-semibold'}`}
                  />
                  <Pencil
                    size={compact ? 12 : 15}
                    aria-hidden
                    className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-cyan-500/70"
                  />
                </div>
              ) : (
                <h1 className={`${compact ? 'text-sm' : 'text-xl sm:text-2xl'} font-semibold tracking-tight text-slate-900`}>
                  Player Profile
                </h1>
              )}
            </div>

            {!compact && (
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={handleRandomizeAll}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-400/40 bg-[length:200%_100%] bg-[linear-gradient(90deg,#6d28d9,#7c3aed,#6366f1,#7c3aed)] px-4 py-2.5 text-sm font-medium text-white animate-shimmer shadow-[0_8px_20px_rgba(99,102,241,0.28)] transition-all hover:brightness-110 touch-manipulation"
                >
                  <Shuffle size={16} />
                  Randomize
                </button>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1">
            <AvatarControls
              config={config}
              onChange={setConfig}
              compact={compact}
              pinnedRandomFields={pinnedRandomFields}
              onToggleRandomPin={onToggleRandomPin}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
