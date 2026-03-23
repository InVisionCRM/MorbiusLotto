'use client';

import React, { useId, useState } from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import AvatarView from './AvatarView';
import { randomizeConfig } from './CharacterCreator';
import { Lock, Shuffle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { AvatarRandomizeFieldKey } from '@/lib/avatar-randomize-pins';
import { getItemKeyForValue, type AvatarField } from '@/lib/cosmetics-catalog';
import {
  PICKER_ACCESSORIES,
  PICKER_ACCESSORY_COLORS,
  PICKER_EYE_COLORS,
  PICKER_EYE_SHAPES,
  PICKER_FACE_SHAPES,
  PICKER_HAIR_COLORS,
  PICKER_HAIR_STYLES,
  PICKER_HATS,
  PICKER_HAT_COLORS,
  PICKER_LIP_SHAPES,
  PICKER_MOUTH_ACCESSORIES,
  PICKER_MAKEUPS,
  PICKER_FACIAL_HAIRS,
  PICKER_NECKLACES,
  PICKER_SHIRT_COLORS,
  PICKER_SHIRT_STYLES,
  PICKER_SKIN_COLORS,
} from '@/lib/avatar-editor-options';
import { useCatalog } from '@/hooks/use-cosmetics';
import { ColorSwatch } from './ColorSwatch';

// ── category config ────────────────────────────────────────────────────────

type CatType = 'color' | 'shape' | 'bg';

interface Category {
  id: string;
  label: string;
  short: string;
  field?: keyof AvatarConfig;
  type: CatType;
}

const CATS: Category[] = [
  { id: 'skin',  label: 'Skin Tone',       short: 'SKIN',  field: 'skinColor',      type: 'color' },
  { id: 'face',  label: 'Face Shape',       short: 'FACE',  field: 'faceShape',      type: 'shape' },
  { id: 'hair',  label: 'Hair Style',       short: 'HAIR',  field: 'hairStyle',      type: 'shape' },
  { id: 'hairc', label: 'Hair Color',       short: 'H.CLR', field: 'hairColor',      type: 'color' },
  { id: 'eyes',  label: 'Eye Shape',        short: 'EYES',  field: 'eyeShape',       type: 'shape' },
  { id: 'eyec',  label: 'Eye Color',        short: 'E.CLR', field: 'eyeColor',       type: 'color' },
  { id: 'lips',  label: 'Lips',             short: 'LIPS',  field: 'lipShape',       type: 'shape' },
  { id: 'makeup', label: 'Makeup',          short: 'MU',    field: 'makeup',         type: 'shape' },
  { id: 'fhair', label: 'Facial Hair',     short: 'F.H',   field: 'facialHair',     type: 'shape' },
  { id: 'mouth', label: 'Mouth',            short: 'MOUTH', field: 'mouthAccessory', type: 'shape' },
  { id: 'shirt', label: 'Shirt Color',      short: 'SHIRT', field: 'shirtColor',     type: 'color' },
  { id: 'sstyle',label: 'Shirt Style',      short: 'STYLE', field: 'shirtStyle',     type: 'shape' },
  { id: 'glass', label: 'Glasses & Extras', short: 'GLASS', field: 'accessory',      type: 'shape' },
  { id: 'glassc',label: 'Glasses Color',    short: 'G.CLR', field: 'accessoryColor', type: 'color' },
  { id: 'hat',   label: 'Hat',              short: 'HAT',   field: 'hat',            type: 'shape' },
  { id: 'hatc',  label: 'Hat Color',        short: 'H.CLR', field: 'hatColor',       type: 'color' },
  { id: 'neck',  label: 'Necklace',         short: 'NECK',  field: 'necklace',       type: 'shape' },
  { id: 'bg',    label: 'Background',       short: 'BG',    field: 'backgroundImage', type: 'bg'   },
];

// ── component ──────────────────────────────────────────────────────────────

type Props = {
  config: AvatarConfig;
  onChange: (c: AvatarConfig) => void;
  displayName?: string;
  onDisplayNameChange?: (v: string) => void;
  ownedItems?: Set<string>;
  isAdmin?: boolean;
  onLockedItemClick?: (itemKey: string) => void;
  pinnedItemKeys?: Set<string>;
  pinnedRandomFields?: Set<string>;
  onToggleRandomPin?: (field: AvatarRandomizeFieldKey) => void;
};

export default function CharacterCreatorMobile({ config, onChange, displayName, onDisplayNameChange, ownedItems, isAdmin = false, onLockedItemClick, pinnedItemKeys, pinnedRandomFields, onToggleRandomPin }: Props) {
  const [activeId, setActiveId] = useState('skin');
  const lockSwitchId = useId();
  const { items: catalogItems } = useCatalog();

  const activeCat = CATS.find(c => c.id === activeId)!;

  const update = (key: keyof AvatarConfig, value: string) => onChange({ ...config, [key]: value });

  const getOptions = (cat: Category): string[] => {
    switch (cat.id) {
      case 'skin':  return PICKER_SKIN_COLORS;
      case 'hairc': return PICKER_HAIR_COLORS;
      case 'shirt': return PICKER_SHIRT_COLORS;
      case 'sstyle':return PICKER_SHIRT_STYLES;
      case 'glass': return PICKER_ACCESSORIES;
      case 'glassc': return PICKER_ACCESSORY_COLORS;
      case 'neck':  return PICKER_NECKLACES;
      case 'face':  return PICKER_FACE_SHAPES;
      case 'hair':  return PICKER_HAIR_STYLES;
      case 'eyes':  return PICKER_EYE_SHAPES;
      case 'eyec':  return PICKER_EYE_COLORS;
      case 'lips':  return PICKER_LIP_SHAPES;
      case 'makeup': return PICKER_MAKEUPS;
      case 'fhair': return PICKER_FACIAL_HAIRS;
      case 'mouth': return PICKER_MOUTH_ACCESSORIES;
      case 'hat':   return PICKER_HATS;
      case 'hatc':  return PICKER_HAT_COLORS;
      default:      return [];
    }
  };

  const handleRandom = () => {
    if (!activeCat.field || activeCat.type === 'bg') return;
    const opts = getOptions(activeCat);
    if (!opts.length) return;
    update(activeCat.field, opts[Math.floor(Math.random() * opts.length)]);
  };

  const handleRandomizeAll = () => {
    const opts: { pinnedItemKeys?: Set<string>; preserveFrom?: AvatarConfig; pinnedFields?: Set<string> } = {};
    if (pinnedItemKeys?.size) opts.pinnedItemKeys = pinnedItemKeys;
    if (pinnedRandomFields?.size) {
      opts.preserveFrom = config;
      opts.pinnedFields = pinnedRandomFields;
    }
    onChange(randomizeConfig(ownedItems, Object.keys(opts).length ? opts : undefined));
  };

  const currentVal = activeCat.field ? (config[activeCat.field] as string ?? '') : '';
  const activeCatRandomPinned =
    activeCat.field != null ? (pinnedRandomFields?.has(activeCat.field) ?? false) : false;

  const isLocked = (field: AvatarField, value: string): boolean => {
    if (isAdmin || !ownedItems) return false;
    const itemKey = getItemKeyForValue(field, value);
    if (!itemKey) return false;
    return !ownedItems.has(itemKey);
  };

  return (
    <div className="flex h-full bg-zinc-900 overflow-hidden">
      {/* ── Left vertical tab sidebar ──────────────────────────────── */}
      <div className="w-[72px] min-w-[72px] flex-shrink-0 flex flex-col overflow-y-auto scrollbar-hide border-r border-zinc-800 bg-zinc-950">
        {CATS.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveId(cat.id)}
            className={`flex-shrink-0 min-h-10 py-2 w-full flex items-center justify-center text-[9px] font-bold tracking-wider transition-colors touch-manipulation ${
              activeId === cat.id
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            }`}
          >
            {cat.short}
          </button>
        ))}
      </div>

      {/* ── Right panel: name + avatar at top, all variations inline below ── */}
      <div className="flex-1 flex flex-col items-center min-w-0 overflow-y-auto pt-3 pb-4 px-3 gap-3">
        {/* Name input — top */}
        {displayName !== undefined && onDisplayNameChange && (
          <input
            type="text"
            value={displayName}
            onChange={e => onDisplayNameChange(e.target.value)}
            placeholder="Display name"
            maxLength={32}
            className="w-full max-w-[220px] text-sm font-semibold text-zinc-100 bg-transparent border-b border-zinc-700 focus:border-cyan-500 focus:outline-none placeholder:text-zinc-600 py-1 text-center touch-manipulation flex-shrink-0"
          />
        )}

        {/* Avatar — right under name */}
        <AvatarView config={config} roamEyes className="w-36 aspect-[6/7] flex-shrink-0" />

        {/* Randomize All */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0 w-full max-w-[280px]">
          <button
            type="button"
            onClick={handleRandomizeAll}
            className="flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-emerald-400 text-xs font-medium touch-manipulation transition-colors border border-zinc-700"
          >
            <Shuffle size={13} />
            Randomize All
          </button>
          {onToggleRandomPin && (
            <p className="text-[9px] text-zinc-500 text-center leading-snug px-1">
              Turn on Lock Item for a category to keep it when you Randomize All.
            </p>
          )}
        </div>

        {/* Category label + all variations inline */}
        <div className="w-full max-w-[280px] flex flex-col gap-2 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest min-w-0">
              {activeCat.label}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              {activeCat.field && onToggleRandomPin && (
                <>
                  <Label
                    htmlFor={lockSwitchId}
                    className="cursor-pointer text-zinc-400 font-medium whitespace-nowrap text-[9px]"
                  >
                    Lock Item
                  </Label>
                  <Switch
                    id={lockSwitchId}
                    checked={activeCatRandomPinned}
                    onCheckedChange={(next) => {
                      if (next !== activeCatRandomPinned) {
                        onToggleRandomPin(activeCat.field as AvatarRandomizeFieldKey);
                      }
                    }}
                    title={
                      activeCatRandomPinned
                        ? 'Unlock — will change on Randomize All'
                        : 'Lock — keep on Randomize All'
                    }
                    className="touch-manipulation scale-90 origin-right"
                  />
                </>
              )}
              {activeCat.type !== 'bg' && activeCat.field && (
                <button
                  type="button"
                  onClick={handleRandom}
                  className="text-[10px] font-medium text-zinc-500 hover:text-zinc-300 touch-manipulation"
                >
                  🎲 Random
                </button>
              )}
            </div>
          </div>

          {/* Backgrounds */}
          {activeCat.type === 'bg' && (() => {
            const bgItems = catalogItems.filter(i => i.unlocks.some(u => u.field === 'backgroundImage'));
            if (bgItems.length === 0) {
              return <p className="text-[11px] text-zinc-500 text-center py-4">No backgrounds yet.</p>;
            }
            return (
              <div className="grid grid-cols-3 gap-1.5 w-full">
                <button
                  type="button"
                  onClick={() => update('backgroundImage', '')}
                  className={`aspect-square rounded-lg border-2 flex items-center justify-center text-[10px] font-medium transition-colors ${
                    !config.backgroundImage ? 'border-white/60 text-white' : 'border-zinc-700 text-zinc-500'
                  }`}
                >
                  None
                </button>
                {bgItems.map(bgItem => {
                  const val = bgItem.unlocks.find(u => u.field === 'backgroundImage')?.value ?? '';
                  const owned = isAdmin || (ownedItems?.has(bgItem.itemKey) ?? false);
                  const selected = config.backgroundImage === val;
                  return (
                    <button
                      key={bgItem.itemKey}
                      type="button"
                      onClick={() => owned ? update('backgroundImage', val) : onLockedItemClick?.(bgItem.itemKey)}
                      className={`aspect-square rounded-lg border-2 overflow-hidden relative ${selected ? 'border-white/80' : owned ? 'border-zinc-700' : 'border-zinc-800'}`}
                      title={bgItem.displayName}
                    >
                      <img src={val} alt={bgItem.displayName} className="w-full h-full object-cover" />
                      {!owned && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Lock size={12} className="text-yellow-400" /></div>}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* Color grid — inline */}
          {activeCat.type === 'color' && activeCat.field && (
            <div className="flex flex-col gap-2 w-full">
              {activeCat.field === 'hatColor' && (
                <button
                  type="button"
                  onClick={() => update('hatColor', '')}
                  className={`self-start rounded-lg border text-xs font-medium px-3 py-1.5 touch-manipulation transition-colors ${
                    !currentVal
                      ? 'border-indigo-500 bg-indigo-600/20 text-indigo-200'
                      : 'border-zinc-600 bg-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  Default (hat style)
                </button>
              )}
              <div className="grid grid-cols-6 gap-2 w-full">
                {getOptions(activeCat).map(c => {
                  const locked = isLocked(activeCat.field as AvatarField, c);
                  const lockedKey = locked ? (getItemKeyForValue(activeCat.field as AvatarField, c) ?? undefined) : undefined;
                  const selected =
                    activeCat.field === 'hatColor' && !currentVal ? false : currentVal === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        if (locked && lockedKey) onLockedItemClick?.(lockedKey);
                        else update(activeCat.field!, c);
                      }}
                      aria-label={`Select ${c}${locked ? ' (locked)' : ''}`}
                      className={`relative w-10 h-10 rounded-full overflow-hidden touch-manipulation transition-transform ${
                        selected
                          ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-zinc-900 scale-105'
                          : locked ? 'ring-1 ring-yellow-500/40 active:scale-95' : 'ring-1 ring-white/10 active:scale-95'
                      }`}
                    >
                      <ColorSwatch value={c} />
                      {locked && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/55 pointer-events-none">
                          <Lock size={10} className="text-yellow-400" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Shape grid — inline */}
          {activeCat.type === 'shape' && activeCat.field && (
            <div className="grid grid-cols-3 gap-1.5 w-full">
              {getOptions(activeCat).map(s => {
                const locked = isLocked(activeCat.field as AvatarField, s);
                const lockedKey = locked ? (getItemKeyForValue(activeCat.field as AvatarField, s) ?? undefined) : undefined;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      if (locked && lockedKey) onLockedItemClick?.(lockedKey);
                      else update(activeCat.field!, s);
                    }}
                    className={`min-h-10 py-2 rounded-xl text-xs font-medium touch-manipulation transition-colors whitespace-nowrap ${
                      currentVal === s
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
                        : locked ? 'bg-zinc-800 text-yellow-400/80 border border-yellow-500/20 active:bg-zinc-700' : 'bg-zinc-800 text-zinc-300 active:bg-zinc-700'
                    }`}
                  >
                    <span className="flex items-center justify-center gap-1">
                      {locked && <Lock size={8} className="shrink-0" />}
                      {s}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
