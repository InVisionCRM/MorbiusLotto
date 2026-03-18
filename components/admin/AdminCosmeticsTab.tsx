'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { Package, Search, Pencil, Check, X, Loader2, AlertTriangle, RefreshCw, Plus, ChevronDown, ChevronUp, Shuffle } from 'lucide-react';
import { MAX_SUPPLY, type ItemTier } from '@/lib/cosmetics-catalog';
import PixelBackgroundUploader from '@/components/poker/avatar/PixelBackgroundUploader';
import GradientBuilder from '@/components/poker/avatar/GradientBuilder';
import VoxelPainter from '@/components/poker/avatar/VoxelPainter';
import AvatarPreview from '@/components/poker/avatar/AvatarPreview';
import { DEFAULT_AVATAR_CONFIG } from '@/components/poker/avatar/CharacterCreator';
import type { AvatarConfig } from '@/lib/websocket-client';
import { parseGradient, serializeGradient, DEFAULT_GRADIENT } from '@/lib/gradient-utils';

const MORBIUS_PRICE: Record<ItemTier, number> = {
  common: 1_000, uncommon: 10_000, rare: 25_000, legendary: 100_000,
};

const TIERS: ItemTier[] = ['common', 'uncommon', 'rare', 'legendary'];

const TIER_BADGE: Record<ItemTier, string> = {
  common:    'bg-zinc-700 text-zinc-300',
  uncommon:  'bg-emerald-900/80 text-emerald-300',
  rare:      'bg-blue-900/80 text-blue-300',
  legendary: 'bg-amber-900/80 text-amber-300',
};

interface ItemRow {
  itemKey: string;
  displayName: string;
  tier: ItemTier;
  priceMorbius: number;
  maxSupply: number;
  mintedCount: number;
  unlocks: Array<{ field: string; value: string }>;
}

/** Returns the hex color value for an item if it's a plain color unlock, else null. */
function itemHexColor(item: ItemRow): string | null {
  const v = item.unlocks[0]?.value ?? '';
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : null;
}

function ItemSwatch({ item, size = 'sm' }: { item: ItemRow; size?: 'sm' | 'lg' }) {
  const hex = itemHexColor(item);
  const dim = size === 'lg' ? 'w-14 h-14 rounded-xl' : 'w-5 h-5 rounded';
  if (hex) {
    return <div className={`${dim} shrink-0 ring-1 ring-white/10`} style={{ backgroundColor: hex }} />;
  }
  return (
    <div className={`${dim} shrink-0 bg-zinc-700 ring-1 ring-white/10 flex items-center justify-center`}>
      <span className="text-[8px] text-zinc-400 font-bold leading-none">
        {item.displayName.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}

interface EditState {
  tier: ItemTier;
  priceMorbius: string;
  maxSupply: string;
}

// ─── Color field options ───────────────────────────────────────────────────────

const ITEM_FIELDS = [
  { value: 'skinColor',       label: 'Skin Color',      inputType: 'color',  options: [] },
  { value: 'hairColor',       label: 'Hair Color',      inputType: 'color',  options: [] },
  { value: 'hairStyle',       label: 'Hair Style',      inputType: 'select', options: ['Spiky', 'Messy', 'Pigtails', 'Mullet', 'Mohawk', 'Dreadlocks', 'Updo', 'Braids', 'Cornrows', 'Dreads Fade'] },
  { value: 'shirtColor',      label: 'Shirt Color',     inputType: 'color',  options: [] },
  { value: 'backgroundImage', label: 'Background',      inputType: 'url',    options: [] },
  { value: 'overlayImage',    label: 'Overlay',         inputType: 'url',    options: [] },
  { value: 'accessory',       label: 'Accessory',       inputType: 'select', options: ['Glasses', 'Aviators', 'Wayfarers', 'Round Glasses', 'Cyberpunk', 'Earrings', 'Headband'] },
  { value: 'hat',             label: 'Hat',             inputType: 'select', options: ['Top Hat', 'Cowboy', 'Crown', 'Bandana'] },
  { value: 'hatColor',        label: 'Hat Color',       inputType: 'color',  options: [] },
  { value: 'necklace',        label: 'Necklace',        inputType: 'select', options: ['Gold Chain', 'Silver Chain', 'Pearl', 'Pendant'] },
  { value: 'mouthAccessory',  label: 'Mouth',           inputType: 'select', options: ['Cigar', 'Cigarette', 'Pipe', 'Bubblegum', 'Medical Mask'] },
] as const;

type ItemField = typeof ITEM_FIELDS[number]['value'];

function shortHash(str: string): string {
  let h = 0;
  for (let i = 0; i < Math.min(str.length, 512); i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

const FIELD_PREFIX: Partial<Record<ItemField, string>> = {
  skinColor: 'skin', hairColor: 'hair_color', shirtColor: 'shirt_color',
  hairStyle: 'hair_style', accessory: 'acc', hat: 'hat', hatColor: 'hat_color',
  necklace: 'neck', mouthAccessory: 'mouth', backgroundImage: 'bg', overlayImage: 'overlay',
};

function toItemKey(field: ItemField, value: string) {
  const prefix = FIELD_PREFIX[field] ?? field;
  if (field === 'backgroundImage' || field === 'overlayImage') {
    if (value.startsWith('data:') || value.startsWith('{')) return `${prefix}_${shortHash(value)}`;
    const slug = value.split('/').pop()?.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 24) ?? prefix;
    return `${prefix}_${slug}`;
  }
  if (field === 'hairStyle' || field === 'accessory' || field === 'hat' || field === 'necklace' || field === 'mouthAccessory') {
    return `${prefix}_${value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
  }
  // Color fields — could be hex or gradient JSON
  if (value.startsWith('{')) return `${prefix}_grad_${shortHash(value)}`;
  return `${prefix}_custom_${value.replace('#', '').toLowerCase()}`;
}

// ─── Randomizer helpers ────────────────────────────────────────────────────────

function randomHex(): string {
  const h = Math.floor(Math.random() * 360);
  const s = 50 + Math.floor(Math.random() * 40);
  const l = 35 + Math.floor(Math.random() * 40);
  // hsl to hex
  const a = s * Math.min(l, 100 - l) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color / 100).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function randomGradient(): string {
  const angle = Math.floor(Math.random() * 360);
  const numStops = 2 + (Math.random() > 0.6 ? 1 : 0);
  const stops = Array.from({ length: numStops }, (_, i) => ({
    color: randomHex(),
    offset: numStops === 2 ? i : i / (numStops - 1),
    opacity: 1,
  }));
  return serializeGradient({ type: 'linearGradient', angle, stops });
}

// ─── Builder panel ─────────────────────────────────────────────────────────────

interface BuilderState {
  field: ItemField;
  inputMode: 'color' | 'gradient'; // only applies to color fields
  bgMode: 'upload' | 'gradient';   // only applies to backgroundImage field
  hex: string;          // used for flat color mode
  gradientJson: string; // used for gradient mode (serialized GradientDef)
  url: string;          // used for backgroundImage / overlayImage fields
  selectValue: string;  // used for select fields (preset option)
  customValue: string;  // used for select fields (custom typed value)
  useCustom: boolean;   // whether to use customValue instead of selectValue
  displayName: string;
  itemKey: string;
  tier: ItemTier;
}

function ItemBuilderPanel({ address, onCreated }: { address: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState<BuilderState>({
    field: 'skinColor',
    inputMode: 'color',
    bgMode: 'upload',
    hex: '#FF6B6B',
    gradientJson: serializeGradient(DEFAULT_GRADIENT),
    url: '',
    selectValue: '',
    customValue: '',
    useCustom: false,
    displayName: '',
    itemKey: '',
    tier: 'common',
  });

  const fieldDef = ITEM_FIELDS.find(f => f.value === form.field)!;
  const isUrlField = fieldDef.inputType === 'url';
  const isSelectField = fieldDef.inputType === 'select';
  const isColorField = fieldDef.inputType === 'color';
  const isGradientMode = isColorField && form.inputMode === 'gradient';

  const isBgGradientMode = form.field === 'backgroundImage' && form.bgMode === 'gradient';
  const activeSelectValue = form.useCustom ? form.customValue : form.selectValue;
  const activeValue = isUrlField
    ? (isBgGradientMode ? form.gradientJson : form.url)
    : isSelectField
    ? activeSelectValue
    : isGradientMode
    ? form.gradientJson
    : form.hex;

  const updateForm = (patch: Partial<BuilderState>) =>
    setForm(prev => {
      const next = { ...prev, ...patch };
      // Auto-regenerate itemKey when field or value changes (unless manually edited)
      if (patch.field !== undefined || patch.hex !== undefined || patch.url !== undefined ||
          patch.gradientJson !== undefined || patch.selectValue !== undefined ||
          patch.customValue !== undefined || patch.useCustom !== undefined || patch.inputMode !== undefined ||
          patch.bgMode !== undefined) {
        const prevDef = ITEM_FIELDS.find(f => f.value === prev.field)!;
        const prevValue = prevDef.inputType === 'url'
          ? (prev.field === 'backgroundImage' && prev.bgMode === 'gradient' ? prev.gradientJson : prev.url)
          : prevDef.inputType === 'select' ? (prev.useCustom ? prev.customValue : prev.selectValue)
          : prev.inputMode === 'gradient' ? prev.gradientJson : prev.hex;
        const nextDef = ITEM_FIELDS.find(f => f.value === next.field)!;
        const nextValue = nextDef.inputType === 'url'
          ? (next.field === 'backgroundImage' && next.bgMode === 'gradient' ? next.gradientJson : next.url)
          : nextDef.inputType === 'select' ? (next.useCustom ? next.customValue : next.selectValue)
          : next.inputMode === 'gradient' ? next.gradientJson : next.hex;
        const oldAutoKey = toItemKey(prev.field, prevValue);
        if (prev.itemKey === oldAutoKey || prev.itemKey === '') {
          next.itemKey = toItemKey(next.field, nextValue);
        }
        // Reset when switching to a new select field
        if (patch.field !== undefined && nextDef.inputType === 'select') {
          next.useCustom = false;
          next.customValue = '';
          if (next.selectValue === '') {
            next.selectValue = (nextDef as any).options[0] ?? '';
          }
          next.itemKey = toItemKey(next.field, next.selectValue);
        }
      }
      return next;
    });

  const price = MORBIUS_PRICE[form.tier];
  const supply = MAX_SUPPLY[form.tier];

  const handleCreate = async () => {
    setErr(null);
    setSuccess(null);
    if (!form.displayName.trim()) { setErr('Name is required'); return; }
    if (!form.itemKey.trim()) { setErr('Item key is required'); return; }
    if (!/^[a-z0-9_]+$/.test(form.itemKey)) { setErr('Item key: lowercase letters, numbers, underscores only'); return; }
    if (isUrlField) {
      if (isBgGradientMode) {
        if (!parseGradient(form.gradientJson)) { setErr('Invalid gradient'); return; }
      } else if (!form.url.startsWith('http') && !form.url.startsWith('data:image/')) {
        setErr('Upload an image first'); return;
      }
    } else if (isSelectField) {
      if (!activeSelectValue.trim()) { setErr('Select a value or enter a custom one'); return; }
    } else if (isGradientMode) {
      if (!parseGradient(form.gradientJson)) { setErr('Invalid gradient'); return; }
    } else {
      if (!form.hex.match(/^#[0-9a-fA-F]{6}$/)) { setErr('Invalid hex color'); return; }
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/cosmetics/admin/create-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminAddress: address,
          itemKey: form.itemKey,
          displayName: form.displayName.trim(),
          tier: form.tier,
          priceMorbius: price,
          maxSupply: supply,
          unlocksField: form.field,
          unlocksValue: activeValue,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Create failed'); return; }
      setSuccess(`"${form.displayName}" created!`);
      setForm({ field: 'skinColor', inputMode: 'color', bgMode: 'upload', hex: '#FF6B6B', gradientJson: serializeGradient(DEFAULT_GRADIENT), url: '', selectValue: '', customValue: '', useCustom: false, displayName: '', itemKey: '', tier: 'common' });
      onCreated();
    } catch {
      setErr('Network error');
    } finally {
      setBusy(false);
    }
  };

  // Build live preview config
  const previewConfig: AvatarConfig = { ...DEFAULT_AVATAR_CONFIG, [form.field]: activeValue } as AvatarConfig;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-300 hover:text-white transition-colors"
      >
        <Plus size={12} className="text-emerald-400" />
        Create New Item
        <div className="ml-auto text-zinc-600">
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </div>
      </button>

      {open && (
        <div className="border-t border-zinc-800 p-3">
          <div className="flex gap-3">
            {/* ── Left: form controls ── */}
            <div className="flex-1 min-w-0 space-y-2.5">
              {/* Field type selector */}
              <div>
                <label className="text-[9px] text-zinc-500 uppercase tracking-wide font-medium block mb-1">Applies to</label>
                <div className="flex gap-1 flex-wrap">
                  {ITEM_FIELDS.map(f => (
                    <button
                      key={f.value}
                      onClick={() => updateForm({ field: f.value, inputMode: 'color' })}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors border ${
                        form.field === f.value
                          ? 'bg-zinc-700 border-zinc-500 text-white'
                          : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color input area */}
              {isColorField && (
                <div className="space-y-2">
                  <div className="flex gap-1">
                    <button type="button" onClick={() => updateForm({ inputMode: 'color' })}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                        !isGradientMode ? 'bg-zinc-700 border-zinc-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
                      }`}>Flat</button>
                    <button type="button" onClick={() => updateForm({ inputMode: 'gradient' })}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors flex items-center gap-1 ${
                        isGradientMode ? 'bg-indigo-700 border-indigo-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
                      }`}>✦ Gradient</button>
                  </div>

                  {!isGradientMode ? (
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded ring-1 ring-white/10 shrink-0" style={{ backgroundColor: form.hex }} />
                      <input type="color" value={form.hex} onChange={e => updateForm({ hex: e.target.value })}
                        className="w-8 h-8 cursor-pointer bg-transparent border-0 p-0 rounded" title="Pick color" />
                      <input type="text" value={form.hex} onChange={e => updateForm({ hex: e.target.value })}
                        maxLength={7}
                        className="w-20 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-center text-white font-mono focus:outline-none focus:border-zinc-400 uppercase"
                        placeholder="#RRGGBB" />
                      <button type="button" onClick={() => updateForm({ hex: randomHex() })}
                        className="flex items-center gap-0.5 px-1.5 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-[10px] transition-colors">
                        <Shuffle size={9} /> Rnd
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <button type="button" onClick={() => updateForm({ gradientJson: randomGradient() })}
                        className="flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-[10px] font-medium transition-colors">
                        <Shuffle size={9} /> Randomize
                      </button>
                      <GradientBuilder value={form.gradientJson} label="gradient" onApply={json => updateForm({ gradientJson: json })} />
                    </div>
                  )}
                </div>
              )}

              {/* Background uploader / gradient */}
              {isUrlField && (
                <div className="space-y-2">
                  {form.field === 'backgroundImage' && (
                    <div className="flex gap-1">
                      <button type="button" onClick={() => updateForm({ bgMode: 'upload' })}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                          form.bgMode !== 'gradient' ? 'bg-zinc-700 border-zinc-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
                        }`}>Upload</button>
                      <button type="button" onClick={() => updateForm({ bgMode: 'gradient' })}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors flex items-center gap-1 ${
                          form.bgMode === 'gradient' ? 'bg-indigo-700 border-indigo-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
                        }`}>✦ Gradient</button>
                    </div>
                  )}
                  {isBgGradientMode ? (
                    <div className="space-y-1.5">
                      <button type="button" onClick={() => updateForm({ gradientJson: randomGradient() })}
                        className="flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-[10px] font-medium transition-colors">
                        <Shuffle size={9} /> Randomize
                      </button>
                      <GradientBuilder value={form.gradientJson} label="bg gradient" onApply={json => updateForm({ gradientJson: json })} />
                    </div>
                  ) : (
                    <PixelBackgroundUploader currentImage={form.url} onImageChange={url => updateForm({ url })} />
                  )}
                </div>
              )}

              {/* Select field options */}
              {isSelectField && (
                <div className="space-y-1.5">
                  <label className="text-[9px] text-zinc-500 uppercase tracking-wide font-medium block">Value</label>
                  <div className="flex gap-1 flex-wrap">
                    {(fieldDef as any).options.map((opt: string) => (
                      <button key={opt} type="button" onClick={() => updateForm({ selectValue: opt, useCustom: false })}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                          !form.useCustom && form.selectValue === opt
                            ? 'bg-indigo-700 border-indigo-500 text-white'
                            : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
                        }`}>{opt}</button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => updateForm({ useCustom: !form.useCustom })}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors shrink-0 ${
                        form.useCustom ? 'bg-amber-700/60 border-amber-500/60 text-amber-200' : 'border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500'
                      }`}>Custom…</button>
                    {form.useCustom && (
                      <input type="text" value={form.customValue} onChange={e => updateForm({ customValue: e.target.value })}
                        placeholder="e.g. Diamond Chain" autoFocus
                        className="flex-1 bg-zinc-800 border border-amber-600/40 rounded px-2 py-0.5 text-[10px] text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500" />
                    )}
                  </div>
                  {form.useCustom && (
                    <p className="text-[9px] text-amber-500/70 leading-snug">Custom values only work if the avatar renderer supports them.</p>
                  )}
                </div>
              )}

              {/* Core fields */}
              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] text-zinc-500 uppercase tracking-wide font-medium">Name</label>
                  <input type="text" value={form.displayName} onChange={e => updateForm({ displayName: e.target.value })}
                    placeholder="e.g. Coral Skin"
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] text-zinc-500 uppercase tracking-wide font-medium">Key</label>
                  <input type="text" value={form.itemKey} onChange={e => updateForm({ itemKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                    placeholder="skin_ff6b6b"
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-white placeholder-zinc-600 font-mono focus:outline-none focus:border-zinc-500" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] text-zinc-500 uppercase tracking-wide font-medium">Tier</label>
                  <select value={form.tier} onChange={e => updateForm({ tier: e.target.value as ItemTier })}
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-zinc-500">
                    {(['common', 'uncommon', 'rare', 'legendary'] as ItemTier[]).map(t => (
                      <option key={t} value={t} className="capitalize">{t}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] text-zinc-500 uppercase tracking-wide font-medium">Price / Supply</label>
                  <div className="flex items-center gap-1 px-2 py-1 bg-zinc-800/50 border border-zinc-800 rounded text-[10px]">
                    <span className="font-semibold text-amber-300">{price.toLocaleString()}</span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-400">{supply} max</span>
                  </div>
                </div>
              </div>

              {err && (
                <div className="flex items-center gap-1.5 text-red-400 text-[10px] bg-red-900/20 border border-red-800/40 rounded px-2 py-1.5">
                  <AlertTriangle size={10} /> {err}
                </div>
              )}
              {success && (
                <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] bg-emerald-900/20 border border-emerald-800/40 rounded px-2 py-1.5">
                  <Check size={10} /> {success}
                </div>
              )}

              <div className="flex justify-end">
                <button onClick={handleCreate} disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5">
                  {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                  {busy ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>

            {/* ── Right: live avatar preview ── */}
            <div className="shrink-0 flex flex-col items-center gap-1.5 w-28">
              <span className="text-[9px] text-zinc-500 uppercase tracking-wide font-medium">Preview</span>
              <AvatarPreview config={previewConfig} emotion="neutral" compact className="w-24 aspect-[6/7]" />
              <span className="text-[9px] text-zinc-600 text-center leading-tight">{fieldDef.label}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tier pricing panel ─────────────────────────────────────────────────────────

const TIER_LABEL: Record<ItemTier, string> = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary',
};

function TierPricingPanel({ address, onUpdated }: { address: string; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [prices, setPrices] = useState<Record<ItemTier, string>>({
    common:    MORBIUS_PRICE.common.toString(),
    uncommon:  MORBIUS_PRICE.uncommon.toString(),
    rare:      MORBIUS_PRICE.rare.toString(),
    legendary: MORBIUS_PRICE.legendary.toString(),
  });
  const [busy, setBusy] = useState<ItemTier | null>(null);
  const [status, setStatus] = useState<{ tier: ItemTier; ok: boolean; msg: string } | null>(null);

  const apply = async (tier: ItemTier) => {
    const price = parseInt(prices[tier], 10);
    if (isNaN(price) || price <= 0) { setStatus({ tier, ok: false, msg: 'Invalid price' }); return; }
    setBusy(tier);
    setStatus(null);
    try {
      const res = await fetch('/api/cosmetics/admin/tier-pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminAddress: address, tier, priceMorbius: price }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus({ tier, ok: false, msg: data.error ?? 'Failed' }); return; }
      setStatus({ tier, ok: true, msg: `Updated ${data.updatedCount} item${data.updatedCount !== 1 ? 's' : ''}` });
      onUpdated();
    } catch {
      setStatus({ tier, ok: false, msg: 'Network error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
      >
        <Package size={14} className="text-amber-400" />
        Tier Pricing Defaults
        <div className="ml-auto text-zinc-600">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-zinc-800 pt-3 space-y-2">
          <p className="text-[11px] text-zinc-500 mb-3">
            Set a new MORBIUS price for <span className="font-semibold text-zinc-400">all active items</span> of a given tier at once.
          </p>
          {TIERS.map(tier => (
            <div key={tier} className="flex items-center gap-2">
              <span className={`w-24 shrink-0 inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase text-center ${TIER_BADGE[tier]}`}>
                {TIER_LABEL[tier]}
              </span>
              <input
                type="number"
                min="1"
                value={prices[tier]}
                onChange={e => setPrices(p => ({ ...p, [tier]: e.target.value }))}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-500 font-mono"
                placeholder="Price in MORBIUS"
              />
              <span className="text-xs text-zinc-500 shrink-0">MORBIUS</span>
              <button
                onClick={() => apply(tier)}
                disabled={busy === tier}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {busy === tier ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                Apply
              </button>
              {status?.tier === tier && (
                <span className={`text-[10px] shrink-0 ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                  {status.msg}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main tab ──────────────────────────────────────────────────────────────────

export default function AdminCosmeticsTab() {
  const { address } = useAccount();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<ItemTier | 'all'>('all');
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cosmetics/items`);
      const data = await res.json();
      setItems(
        (data as any[]).map(i => ({
          itemKey: i.itemKey,
          displayName: i.displayName,
          tier: i.tier as ItemTier,
          priceMorbius: i.priceMorbius,
          maxSupply: i.maxSupply,
          mintedCount: i.mintedCount ?? 0,
          unlocks: Array.isArray(i.unlocks) ? i.unlocks : [],
        })),
      );
    } catch {
      setError('Failed to load items');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (item: ItemRow) => {
    setEditKey(item.itemKey);
    setEditState({
      tier: item.tier,
      priceMorbius: item.priceMorbius.toString(),
      maxSupply: item.maxSupply.toString(),
    });
    setSaveError(null);
  };

  const cancelEdit = () => { setEditKey(null); setEditState(null); setSaveError(null); };

  const saveEdit = async (item: ItemRow) => {
    if (!editState || !address) return;
    const newPrice = parseInt(editState.priceMorbius, 10);
    const newSupply = parseInt(editState.maxSupply, 10);
    if (isNaN(newPrice) || newPrice <= 0) { setSaveError('Invalid price'); return; }
    if (isNaN(newSupply) || newSupply <= 0) { setSaveError('Invalid supply'); return; }
    if (newSupply < item.mintedCount) { setSaveError(`Supply can't be below already-minted count (${item.mintedCount})`); return; }

    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/cosmetics/admin/item`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminAddress: address,
          itemKey: item.itemKey,
          tier: editState.tier,
          priceMorbius: newPrice,
          maxSupply: newSupply,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setSaveError(data.error ?? 'Save failed'); return; }
      // Update local state
      setItems(prev => prev.map(i =>
        i.itemKey === item.itemKey
          ? { ...i, tier: editState.tier, priceMorbius: newPrice, maxSupply: newSupply }
          : i,
      ));
      cancelEdit();
    } catch {
      setSaveError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const filtered = items.filter(i => {
    if (tierFilter !== 'all' && i.tier !== tierFilter) return false;
    if (search && !i.displayName.toLowerCase().includes(search.toLowerCase()) && !i.itemKey.includes(search.toLowerCase())) return false;
    return true;
  });

  // Group by tier for display
  const grouped = TIERS.reduce<Record<ItemTier, ItemRow[]>>(
    (acc, t) => ({ ...acc, [t]: filtered.filter(i => i.tier === t) }),
    {} as any,
  );

  return (
    <div className="space-y-4">
      {/* Builder */}
      {address && <ItemBuilderPanel address={address} onCreated={load} />}

      {/* Voxel painter */}
      {address && <VoxelPainter address={address} onCreated={load} />}

      {/* Tier pricing */}
      {address && <TierPricingPanel address={address} onUpdated={load} />}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search items…"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          />
        </div>
        <div className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-lg p-0.5">
          {(['all', ...TIERS] as const).map(t => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors capitalize ${
                tierFilter === t ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
        <span className="text-xs text-zinc-500">{filtered.length} items</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {loading && !items.length ? (
        <div className="flex items-center justify-center py-16 text-zinc-500 gap-2">
          <Loader2 size={16} className="animate-spin" /> Loading items…
        </div>
      ) : (
        <div className="space-y-5">
          {TIERS.filter(t => tierFilter === 'all' || tierFilter === t).map(tier => {
            const rows = grouped[tier];
            if (!rows.length) return null;
            return (
              <div key={tier}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Package size={12} className="text-zinc-500" />
                  <span className={`inline-block px-2 py-px rounded text-[10px] font-bold uppercase ${TIER_BADGE[tier]}`}>{tier}</span>
                  <span className="text-xs text-zinc-600">{rows.length} items</span>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500">
                        <th className="w-8 px-3 py-2" />
                        <th className="text-left px-3 py-2 font-medium">Item</th>
                        <th className="text-left px-3 py-2 font-medium w-24">Tier</th>
                        <th className="text-right px-3 py-2 font-medium w-32">Price (MORBIUS)</th>
                        <th className="text-right px-3 py-2 font-medium w-20">Supply</th>
                        <th className="text-right px-3 py-2 font-medium w-16">Minted</th>
                        <th className="text-right px-3 py-2 font-medium w-16">Left</th>
                        <th className="w-12" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(item => {
                        const isEditing = editKey === item.itemKey;
                        const remaining = item.maxSupply - item.mintedCount;
                        return (
                          <React.Fragment key={item.itemKey}>
                            {/* ── Summary row ── */}
                            <tr
                              className={`border-b border-zinc-800/60 transition-colors ${
                                isEditing ? 'bg-zinc-800/40 border-zinc-700' : 'hover:bg-zinc-800/20'
                              }`}
                            >
                              {/* Swatch */}
                              <td className="px-3 py-2.5">
                                <ItemSwatch item={item} size="sm" />
                              </td>

                              {/* Name + key */}
                              <td className="px-3 py-2.5">
                                <p className="font-medium text-white leading-tight">{item.displayName}</p>
                                <p className="text-zinc-600 text-[10px] font-mono mt-0.5">{item.itemKey}</p>
                              </td>

                              {/* Tier badge */}
                              <td className="px-3 py-2.5">
                                <span className={`inline-block px-1.5 py-px rounded text-[9px] font-bold uppercase ${TIER_BADGE[item.tier]}`}>
                                  {item.tier}
                                </span>
                              </td>

                              {/* Price */}
                              <td className="px-3 py-2.5 text-right">
                                <span className="text-amber-300 font-medium">{item.priceMorbius.toLocaleString()}</span>
                              </td>

                              {/* Max supply */}
                              <td className="px-3 py-2.5 text-right text-zinc-200">{item.maxSupply}</td>

                              {/* Minted */}
                              <td className="px-3 py-2.5 text-right">
                                <span className={item.mintedCount === item.maxSupply ? 'text-red-400 font-medium' : 'text-zinc-400'}>
                                  {item.mintedCount}
                                </span>
                              </td>

                              {/* Remaining */}
                              <td className="px-3 py-2.5 text-right">
                                <span className={remaining === 0 ? 'text-red-400 font-medium' : remaining <= 2 ? 'text-amber-400' : 'text-zinc-400'}>
                                  {remaining}
                                </span>
                              </td>

                              {/* Edit toggle */}
                              <td className="px-3 py-2.5 text-right">
                                <button
                                  onClick={() => isEditing ? cancelEdit() : startEdit(item)}
                                  className={`p-1.5 rounded transition-colors ${
                                    isEditing
                                      ? 'text-zinc-300 bg-zinc-700 hover:bg-zinc-600'
                                      : 'text-zinc-500 hover:text-white hover:bg-zinc-700'
                                  }`}
                                  title={isEditing ? 'Cancel' : 'Edit'}
                                >
                                  {isEditing ? <X size={12} /> : <Pencil size={12} />}
                                </button>
                              </td>
                            </tr>

                            {/* ── Expanded edit panel ── */}
                            {isEditing && editState && (
                              <tr className="border-b border-zinc-700 bg-zinc-800/30">
                                <td colSpan={8} className="px-4 py-4">
                                  <div className="flex items-start gap-5">
                                    {/* Large preview */}
                                    <div className="flex flex-col items-center gap-2 shrink-0">
                                      <ItemSwatch item={item} size="lg" />
                                      <p className="text-[10px] text-zinc-500 text-center max-w-[56px] leading-tight">{item.displayName}</p>
                                    </div>

                                    {/* Edit fields */}
                                    <div className="flex-1 grid grid-cols-3 gap-3">
                                      <div className="flex flex-col gap-1">
                                        <label className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">Tier</label>
                                        <select
                                          value={editState.tier}
                                          onChange={e => setEditState(s => s ? { ...s, tier: e.target.value as ItemTier } : s)}
                                          className="bg-zinc-700 border border-zinc-600 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-400"
                                        >
                                          {TIERS.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                                        </select>
                                      </div>

                                      <div className="flex flex-col gap-1">
                                        <label className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">Price (Morbius)</label>
                                        <input
                                          type="number"
                                          min="1"
                                          value={editState.priceMorbius}
                                          onChange={e => setEditState(s => s ? { ...s, priceMorbius: e.target.value } : s)}
                                          className="bg-zinc-700 border border-zinc-600 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-400"
                                        />
                                      </div>

                                      <div className="flex flex-col gap-1">
                                        <label className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">
                                          Max Supply
                                          {item.mintedCount > 0 && (
                                            <span className="ml-1 text-zinc-600 normal-case">(min {item.mintedCount} minted)</span>
                                          )}
                                        </label>
                                        <input
                                          type="number"
                                          min={item.mintedCount}
                                          value={editState.maxSupply}
                                          onChange={e => setEditState(s => s ? { ...s, maxSupply: e.target.value } : s)}
                                          className="bg-zinc-700 border border-zinc-600 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-400"
                                        />
                                      </div>
                                    </div>

                                    {/* Save button */}
                                    <div className="flex flex-col gap-2 shrink-0 pt-5">
                                      <button
                                        onClick={() => saveEdit(item)}
                                        disabled={saving}
                                        className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                      >
                                        {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                                        {saving ? 'Saving…' : 'Save'}
                                      </button>
                                    </div>
                                  </div>

                                  {saveError && (
                                    <div className="mt-3 flex items-center gap-2 text-red-400 text-xs bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
                                      <AlertTriangle size={11} /> {saveError}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
