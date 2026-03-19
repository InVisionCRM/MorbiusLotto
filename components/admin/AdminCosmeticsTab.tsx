'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { Package, Search, Pencil, Check, X, Loader2, AlertTriangle, RefreshCw, Plus, ChevronDown, ChevronUp, Shuffle, Copy, Paintbrush } from 'lucide-react';
import { MAX_SUPPLY, type ItemTier } from '@/lib/cosmetics-catalog';
import PixelBackgroundUploader from '@/components/poker/avatar/PixelBackgroundUploader';
import GradientBuilder from '@/components/poker/avatar/GradientBuilder';
import VoxelPainter, { type VoxelPainterHandle } from '@/components/poker/avatar/VoxelPainter';
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
  { value: 'accessoryColor',  label: 'Glasses Color',   inputType: 'color',  options: [] },
  { value: 'hairStyle',       label: 'Hair Style',      inputType: 'select', options: ['Spiky', 'Messy', 'Pigtails', 'Mullet', 'Mohawk', 'Dreadlocks', 'Dreadlocks V1', 'Dreadlocks V2', 'Dreadlocks V3', 'Dreadlocks V4', 'Dreadlocks V5', 'Dreadlocks V6', 'Dreadlocks V7', 'Dreadlocks V8', 'Dreadlocks V9', 'Dreadlocks V10', 'Locks V1', 'Locks V2', 'Locks V3', 'Locks V4', 'Locks V5', 'Locks V6', 'Locks V7', 'Locks V8', 'Locks V9', 'Locks V10', 'Updo', 'Braids', 'Cornrows', 'Dreads Fade'] },
  { value: 'eyeShape',        label: 'Eye Shape',       inputType: 'select', options: ['Round', 'Almond', 'Narrow', 'Wide', 'Eye V1', 'Eye V2', 'Eye V3', 'Eye V4', 'Eye V5', 'Eye V6', 'Eye V7', 'Eye V8', 'Eye V9', 'Eye V10'] },
  { value: 'shirtColor',      label: 'Shirt Color',     inputType: 'color',  options: [] },
  { value: 'shirtStyle',      label: 'Shirt Style',     inputType: 'select', options: ['Default','Tuxedo','Cheetah Print','Hawaiian','Pinstripe','Flannel','Denim Jacket','Leather Jacket','Varsity','Hoodie','Camo','Suit','Blazer','Kimono','Polo','Zebra Print','Leopard Print','Snake Skin','Tie-Dye','Neon Crop','Biker','Sailor','Space Suit','Grim Reaper','Golden Armor','Streetwear V1','Streetwear V2','Streetwear V3','Streetwear V4','Streetwear V5','Streetwear V6','Streetwear V7','Streetwear V8','Streetwear V9','Streetwear V10'] },
  { value: 'backgroundImage', label: 'Background',      inputType: 'url',    options: [] },
  { value: 'overlayImage',    label: 'Overlay',         inputType: 'url',    options: [] },
  { value: 'accessory',       label: 'Accessory',       inputType: 'select', options: ['Glasses', 'Aviators', 'Wayfarers', 'Round Glasses', 'Cyberpunk', 'Shades V1', 'Shades V2', 'Shades V3', 'Shades V4', 'Shades V5', 'Shades V6', 'Shades V7', 'Shades V8', 'Shades V9', 'Shades V10', 'Earrings', 'Headband'] },
  { value: 'hat',             label: 'Hat',             inputType: 'select', options: ['Top Hat', 'Cowboy', 'Crown', 'Bandana', 'Hat V1', 'Hat V2', 'Hat V3', 'Hat V4', 'Hat V5', 'Hat V6', 'Hat V7', 'Hat V8', 'Hat V9', 'Hat V10'] },
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
  skinColor: 'skin', hairColor: 'hair_color', shirtColor: 'shirt_color', shirtStyle: 'shirt_style',
  accessoryColor: 'accessory_color',
  hairStyle: 'hair_style', eyeShape: 'eye_shape', accessory: 'acc', hat: 'hat', hatColor: 'hat_color',
  necklace: 'neck', mouthAccessory: 'mouth', backgroundImage: 'bg', overlayImage: 'overlay',
};

function toItemKey(field: ItemField, value: string) {
  const prefix = FIELD_PREFIX[field] ?? field;
  if (field === 'backgroundImage' || field === 'overlayImage') {
    if (value.startsWith('data:') || value.startsWith('{')) return `${prefix}_${shortHash(value)}`;
    const slug = value.split('/').pop()?.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 24) ?? prefix;
    return `${prefix}_${slug}`;
  }
  if (field === 'hairStyle' || field === 'eyeShape' || field === 'accessory' || field === 'hat' || field === 'necklace' || field === 'mouthAccessory') {
    return `${prefix}_${value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
  }
  // Color fields — could be hex or gradient JSON
  if (value.startsWith('url(#') && value.endsWith(')')) {
    const name = value.slice(5, -1).toLowerCase().replace(/[^a-z0-9_]/g, '');
    return `${prefix}_pattern_${name}`;
  }
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

function randomGradient(existing?: string): string {
  const angle = Math.floor(Math.random() * 360);
  const parsed = existing ? parseGradient(existing) : null;
  const numStops = Math.max(2, Math.min(5, parsed?.stops?.length ?? (2 + (Math.random() > 0.6 ? 1 : 0))));
  const offsets = numStops <= 2
    ? [0, 1]
    : [
        0,
        ...Array.from({ length: numStops - 2 }, () => Math.random()).sort((a, b) => a - b),
        1,
      ];
  const stops = Array.from({ length: numStops }, (_, i) => ({
    color: randomHex(),
    offset: offsets[i],
    opacity: 1,
  }));
  return serializeGradient({ type: 'linearGradient', angle, stops });
}

const PATTERN_OPTIONS = [
  'url(#tiger)',
  'url(#zebra)',
  'url(#leopard)',
  'url(#camo)',
  'url(#rainbow)',
  'url(#galaxy)',
  'url(#checkerboard)',
] as const;

function randomPattern(): string {
  return PATTERN_OPTIONS[Math.floor(Math.random() * PATTERN_OPTIONS.length)];
}

const PATTERN_BULK_FIELDS = ['skinColor', 'hairColor', 'shirtColor', 'hatColor', 'accessoryColor'] as const;
type PatternBulkField = (typeof PATTERN_BULK_FIELDS)[number];
const PATTERN_BULK_LABEL: Record<PatternBulkField, string> = {
  skinColor: 'Skin',
  hairColor: 'Hair',
  shirtColor: 'Shirt',
  hatColor: 'Hat',
  accessoryColor: 'Glasses',
};

// ─── Builder panel ─────────────────────────────────────────────────────────────

interface BuilderState {
  field: ItemField;
  inputMode: 'color' | 'gradient' | 'pattern'; // only applies to color fields
  bgMode: 'upload' | 'gradient';   // only applies to backgroundImage field
  hex: string;          // used for flat color mode
  gradientJson: string; // used for gradient mode (serialized GradientDef)
  patternValue: string; // used for pattern mode (url(#pattern))
  url: string;          // used for backgroundImage / overlayImage fields
  selectValue: string;  // used for select fields (preset option)
  customValue: string;  // used for select fields (custom typed value)
  useCustom: boolean;   // whether to use customValue instead of selectValue
  displayName: string;
  itemKey: string;
  tier: ItemTier;
}

const DREADLOCKS_VARIANTS = [
  'Dreadlocks V1',
  'Dreadlocks V2',
  'Dreadlocks V3',
  'Dreadlocks V4',
  'Dreadlocks V5',
  'Dreadlocks V6',
  'Dreadlocks V7',
  'Dreadlocks V8',
  'Dreadlocks V9',
  'Dreadlocks V10',
] as const;

const HAIR_VARIANTS = ['Locks V1', 'Locks V2', 'Locks V3', 'Locks V4', 'Locks V5', 'Locks V6', 'Locks V7', 'Locks V8', 'Locks V9', 'Locks V10'] as const;
const SHIRT_VARIANTS = ['Streetwear V1', 'Streetwear V2', 'Streetwear V3', 'Streetwear V4', 'Streetwear V5', 'Streetwear V6', 'Streetwear V7', 'Streetwear V8', 'Streetwear V9', 'Streetwear V10'] as const;
const HAT_VARIANTS = ['Hat V1', 'Hat V2', 'Hat V3', 'Hat V4', 'Hat V5', 'Hat V6', 'Hat V7', 'Hat V8', 'Hat V9', 'Hat V10'] as const;
const SHADES_VARIANTS = ['Shades V1', 'Shades V2', 'Shades V3', 'Shades V4', 'Shades V5', 'Shades V6', 'Shades V7', 'Shades V8', 'Shades V9', 'Shades V10'] as const;
const EYE_VARIANTS = ['Eye V1', 'Eye V2', 'Eye V3', 'Eye V4', 'Eye V5', 'Eye V6', 'Eye V7', 'Eye V8', 'Eye V9', 'Eye V10'] as const;

function DreadlocksVariantReviewPanel({
  voxelPainterRef,
}: {
  voxelPainterRef: React.RefObject<VoxelPainterHandle | null>;
}) {
  const STORAGE_KEY = 'admin_cosmetics_variant_decisions_v1';
  const [decisions, setDecisions] = useState<Record<string, 'approved' | 'rejected' | undefined>>({});
  const [showApprovedOnly, setShowApprovedOnly] = useState(false);
  const setDecision = (key: string, value: 'approved' | 'rejected' | undefined) =>
    setDecisions(prev => ({ ...prev, [key]: value }));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, 'approved' | 'rejected' | undefined>;
      if (parsed && typeof parsed === 'object') setDecisions(parsed);
    } catch {
      // ignore malformed local storage
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions));
    } catch {
      // ignore storage quota issues
    }
  }, [decisions]);

  const renderCards = (
    title: string,
    groupKey: string,
    variants: readonly string[],
    mutator: (variant: string) => Partial<AvatarConfig>,
  ) => (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-zinc-300">{title}</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {variants.map((variant) => {
          const key = `${groupKey}:${variant}`;
          const decision = decisions[key];
          if (showApprovedOnly && decision !== 'approved') return null;
          const previewConfig: AvatarConfig = {
            ...DEFAULT_AVATAR_CONFIG,
            hairColor: '#3B3024',
            skinColor: '#8D5524',
            shirtColor: '#3f3f46',
            accessory: 'None',
            hat: 'None',
            ...mutator(variant),
          };
          return (
            <div key={variant} className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-2">
              <div className="mx-auto w-20 h-24 rounded-md bg-zinc-900/60 border border-zinc-700 overflow-hidden">
                <AvatarPreview config={previewConfig} emotion="neutral" className="w-full h-full" compact />
              </div>
              <div className="mt-1.5 flex items-center justify-center gap-2">
                <div className="w-9 h-9 rounded-full overflow-hidden border border-zinc-600 bg-zinc-900/60">
                  <AvatarPreview config={previewConfig} emotion="neutral" className="w-full h-full" compact />
                </div>
                <div className="text-[10px] text-zinc-300 font-medium leading-tight">{variant}</div>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setDecision(key, decision === 'approved' ? undefined : 'approved')}
                  className={`px-1.5 py-1 rounded text-[10px] font-medium border transition-colors ${
                    decision === 'approved'
                      ? 'bg-emerald-700/70 border-emerald-500 text-emerald-100'
                      : 'border-zinc-700 text-zinc-400 hover:text-emerald-300 hover:border-emerald-600/60'
                  }`}
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => setDecision(key, decision === 'rejected' ? undefined : 'rejected')}
                  className={`px-1.5 py-1 rounded text-[10px] font-medium border transition-colors ${
                    decision === 'rejected'
                      ? 'bg-red-700/70 border-red-500 text-red-100'
                      : 'border-zinc-700 text-zinc-400 hover:text-red-300 hover:border-red-600/60'
                  }`}
                >
                  Reject
                </button>
              </div>
              <button
                type="button"
                onClick={() => void voxelPainterRef.current?.importFromAvatarConfig(previewConfig)}
                className="mt-1.5 w-full flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium border border-cyan-500/35 text-cyan-300/90 hover:text-white hover:border-cyan-400/50 hover:bg-cyan-950/30 transition-colors"
                title="Open Voxel Painter with this preview as a 24×28 grid (full avatar snapshot — erase/recolor, then save as overlay/background)"
              >
                <Paintbrush size={10} /> Voxel painter
              </button>
              <div className="mt-1 text-center text-[9px]">
                {decision === 'approved' && <span className="text-emerald-400">Approved</span>}
                {decision === 'rejected' && <span className="text-red-400">Rejected</span>}
                {!decision && <span className="text-zinc-500">Unreviewed</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-4">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-white">Variant Review (Not In Store Yet)</h3>
        <p className="text-[11px] text-zinc-500">
          Review-first batch: dreadlocks, hair, shirts, hats, shades, and eye types. Approve/reject is optional — use{' '}
          <span className="text-cyan-500/90">Voxel painter</span> on any card to edit a raster snapshot and save your own item.
        </p>
        <div className="mt-1 text-[10px] text-zinc-400">
          Approved: {Object.values(decisions).filter(v => v === 'approved').length} · Rejected: {Object.values(decisions).filter(v => v === 'rejected').length}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowApprovedOnly(v => !v)}
            className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
              showApprovedOnly
                ? 'bg-emerald-700/70 border-emerald-500 text-emerald-100'
                : 'border-zinc-700 text-zinc-400 hover:text-emerald-300 hover:border-emerald-600/60'
            }`}
          >
            {showApprovedOnly ? 'Showing Approved Only' : 'Show Approved Only'}
          </button>
          <button
            type="button"
            onClick={async () => {
              const approved = Object.entries(decisions)
                .filter(([, v]) => v === 'approved')
                .map(([k]) => k);
              try {
                await navigator.clipboard.writeText(approved.join('\n'));
              } catch {
                // Clipboard may be blocked; user can still read from the UI.
              }
            }}
            className="px-2 py-1 rounded text-[10px] font-medium border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
          >
            Copy Approved List
          </button>
          <button
            type="button"
            onClick={() => setDecisions({})}
            className="px-2 py-1 rounded text-[10px] font-medium border border-zinc-700 text-zinc-400 hover:text-red-300 hover:border-red-600/60 transition-colors"
          >
            Clear Decisions
          </button>
        </div>
      </div>
      {renderCards('Dreadlocks set (previous batch)', 'dreads', DREADLOCKS_VARIANTS, (variant) => ({ hairStyle: variant }))}
      {renderCards('Hair variants x10', 'hair', HAIR_VARIANTS, (variant) => ({ hairStyle: variant }))}
      {renderCards('Shirt variants x10', 'shirt', SHIRT_VARIANTS, (variant) => ({ shirtStyle: variant }))}
      {renderCards('Hat variants x10', 'hat', HAT_VARIANTS, (variant) => ({ hat: variant }))}
      {renderCards('Sunglasses variants x10', 'shades', SHADES_VARIANTS, (variant) => ({ accessory: variant }))}
      {renderCards('Eye-type variants x10', 'eye', EYE_VARIANTS, (variant) => ({ eyeShape: variant }))}
    </div>
  );
}

function ItemBuilderPanel({ address, onCreated }: { address: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [patternSetConfirmOpen, setPatternSetConfirmOpen] = useState(false);

  const [form, setForm] = useState<BuilderState>({
    field: 'skinColor',
    inputMode: 'color',
    bgMode: 'upload',
    hex: '#FF6B6B',
    gradientJson: serializeGradient(DEFAULT_GRADIENT),
    patternValue: 'url(#tiger)',
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
  const isPatternMode = isColorField && form.inputMode === 'pattern';

  const isBgGradientMode = form.field === 'backgroundImage' && form.bgMode === 'gradient';
  const activeSelectValue = form.useCustom ? form.customValue : form.selectValue;
  const activeValue = isUrlField
    ? (isBgGradientMode ? form.gradientJson : form.url)
    : isSelectField
    ? activeSelectValue
    : isPatternMode
    ? form.patternValue
    : isGradientMode
    ? form.gradientJson
    : form.hex;

  const updateForm = (patch: Partial<BuilderState>) =>
    setForm(prev => {
      const next = { ...prev, ...patch };
      // Auto-regenerate itemKey when field or value changes (unless manually edited)
      if (patch.field !== undefined || patch.hex !== undefined || patch.url !== undefined ||
          patch.gradientJson !== undefined || patch.patternValue !== undefined || patch.selectValue !== undefined ||
          patch.customValue !== undefined || patch.useCustom !== undefined || patch.inputMode !== undefined ||
          patch.bgMode !== undefined) {
        const prevDef = ITEM_FIELDS.find(f => f.value === prev.field)!;
        const prevValue = prevDef.inputType === 'url'
          ? (prev.field === 'backgroundImage' && prev.bgMode === 'gradient' ? prev.gradientJson : prev.url)
          : prevDef.inputType === 'select' ? (prev.useCustom ? prev.customValue : prev.selectValue)
          : prev.inputMode === 'pattern' ? prev.patternValue
          : prev.inputMode === 'gradient' ? prev.gradientJson : prev.hex;
        const nextDef = ITEM_FIELDS.find(f => f.value === next.field)!;
        const nextValue = nextDef.inputType === 'url'
          ? (next.field === 'backgroundImage' && next.bgMode === 'gradient' ? next.gradientJson : next.url)
          : nextDef.inputType === 'select' ? (next.useCustom ? next.customValue : next.selectValue)
          : next.inputMode === 'pattern' ? next.patternValue
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

  const createItemRequest = async (payload: {
    itemKey: string;
    displayName: string;
    unlocksField: ItemField;
    unlocksValue: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    const res = await fetch(`/api/cosmetics/admin/create-item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminAddress: address,
        itemKey: payload.itemKey,
        displayName: payload.displayName,
        tier: form.tier,
        priceMorbius: price,
        maxSupply: supply,
        unlocksField: payload.unlocksField,
        unlocksValue: payload.unlocksValue,
      }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? 'Create failed' };
    return { ok: true };
  };

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
      const result = await createItemRequest({
        itemKey: form.itemKey,
        displayName: form.displayName.trim(),
        unlocksField: form.field,
        unlocksValue: activeValue,
      });
      if (!result.ok) { setErr(result.error ?? 'Create failed'); return; }
      setSuccess(`"${form.displayName}" created!`);
      setForm({ field: 'skinColor', inputMode: 'color', bgMode: 'upload', hex: '#FF6B6B', gradientJson: serializeGradient(DEFAULT_GRADIENT), patternValue: 'url(#tiger)', url: '', selectValue: '', customValue: '', useCustom: false, displayName: '', itemKey: '', tier: 'common' });
      onCreated();
    } catch {
      setErr('Network error');
    } finally {
      setBusy(false);
    }
  };

  const openPatternSetConfirm = () => {
    setErr(null);
    setSuccess(null);
    if (!isPatternMode) {
      setErr('Switch to Pattern mode first');
      return;
    }
    if (!form.displayName.trim()) {
      setErr('Name is required');
      return;
    }
    setPatternSetConfirmOpen(true);
  };

  const copyPatternSetKeys = async () => {
    const lines = PATTERN_BULK_FIELDS.map((field) => {
      const key = toItemKey(field, form.patternValue);
      return `${PATTERN_BULK_LABEL[field]}\t${key}`;
    });
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setSuccess('Item keys copied to clipboard');
    } catch {
      setErr('Could not copy to clipboard');
    }
  };

  const executePatternSetCreate = async () => {
    setErr(null);
    setSuccess(null);
    if (!isPatternMode || !form.displayName.trim()) {
      setPatternSetConfirmOpen(false);
      return;
    }

    setBusy(true);
    try {
      let created = 0;
      let duplicates = 0;
      const failures: string[] = [];
      for (const field of PATTERN_BULK_FIELDS) {
        const key = toItemKey(field, form.patternValue);
        const display = `${form.displayName.trim()} (${PATTERN_BULK_LABEL[field]})`;
        const result = await createItemRequest({
          itemKey: key,
          displayName: display,
          unlocksField: field,
          unlocksValue: form.patternValue,
        });
        if (result.ok) {
          created++;
        } else if ((result.error ?? '').toLowerCase().includes('already exists')) {
          duplicates++;
        } else {
          failures.push(`${PATTERN_BULK_LABEL[field]}: ${result.error ?? 'Create failed'}`);
        }
      }
      setPatternSetConfirmOpen(false);
      if (failures.length > 0) {
        setErr(`Pattern set partially failed — ${failures.join(' | ')}`);
      }
      setSuccess(`Pattern set complete: ${created} created, ${duplicates} already existed.`);
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
        <div className="border-t border-zinc-800">
          <div className="flex min-h-0">

            {/* ── Left column: live avatar preview ── */}
            <div className="shrink-0 w-44 border-r border-zinc-800 bg-zinc-800/30 flex flex-col items-center justify-center gap-2 p-4 sticky top-0">
              <AvatarPreview config={previewConfig} emotion="neutral" className="w-full aspect-[6/7]" />
              <span className="text-[9px] text-zinc-500 uppercase tracking-wide font-medium">{fieldDef.label} · live</span>
            </div>

            {/* ── Right column: controls ── */}
            <div className="flex-1 min-w-0 p-3 space-y-3 overflow-y-auto max-h-[520px]">

              {/* Field type selector */}
              <div>
                <label className="text-[9px] text-zinc-500 uppercase tracking-wide font-medium block mb-1">Applies to</label>
                <div className="flex gap-1 flex-wrap">
                  {ITEM_FIELDS.map(f => (
                    <button key={f.value} onClick={() => updateForm({ field: f.value, inputMode: 'color' })}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors border ${
                        form.field === f.value ? 'bg-zinc-700 border-zinc-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
                      }`}>{f.label}</button>
                  ))}
                </div>
              </div>

              {/* Color input */}
              {isColorField && (
                <div className="space-y-2">
                  <div className="flex gap-1">
                    <button type="button" onClick={() => updateForm({ inputMode: 'color' })}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${!isGradientMode && !isPatternMode ? 'bg-zinc-700 border-zinc-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'}`}>Flat</button>
                    <button type="button" onClick={() => updateForm({ inputMode: 'gradient' })}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors flex items-center gap-1 ${isGradientMode ? 'bg-indigo-700 border-indigo-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'}`}>✦ Gradient</button>
                    <button type="button" onClick={() => updateForm({ inputMode: 'pattern' })}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${isPatternMode ? 'bg-fuchsia-700 border-fuchsia-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'}`}>Pattern</button>
                  </div>
                  {!isGradientMode && !isPatternMode ? (
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded ring-1 ring-white/10 shrink-0" style={{ backgroundColor: form.hex }} />
                      <input type="color" value={form.hex} onChange={e => updateForm({ hex: e.target.value })}
                        className="w-8 h-8 cursor-pointer bg-transparent border-0 p-0 rounded" />
                      <input type="text" value={form.hex} onChange={e => updateForm({ hex: e.target.value })} maxLength={7}
                        className="w-20 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-center text-white font-mono focus:outline-none focus:border-zinc-400 uppercase" placeholder="#RRGGBB" />
                      <button type="button" onClick={() => updateForm({ hex: randomHex() })}
                        className="flex items-center gap-0.5 px-1.5 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-[10px] transition-colors">
                        <Shuffle size={9} /> Rnd
                      </button>
                    </div>
                  ) : isGradientMode ? (
                    <div className="space-y-1.5">
                      <button type="button" onClick={() => updateForm({ gradientJson: randomGradient(form.gradientJson) })}
                        className="flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-[10px] font-medium transition-colors">
                        <Shuffle size={9} /> Randomize
                      </button>
                      <GradientBuilder value={form.gradientJson} onApply={json => updateForm({ gradientJson: json })} />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <button type="button" onClick={() => updateForm({ patternValue: randomPattern() })}
                          className="flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-[10px] font-medium transition-colors">
                          <Shuffle size={9} /> Randomize Pattern
                        </button>
                        <button type="button" onClick={openPatternSetConfirm}
                          className="px-2 py-0.5 rounded border border-fuchsia-500/40 text-fuchsia-300 hover:text-white hover:border-fuchsia-400 text-[10px] font-medium transition-colors">
                          1-Click Create Pattern Set
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {PATTERN_OPTIONS.map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => updateForm({ patternValue: p })}
                            className={`h-8 rounded border transition-colors text-[10px] ${form.patternValue === p ? 'border-fuchsia-400 ring-1 ring-fuchsia-500/50 text-fuchsia-300 bg-zinc-800' : 'border-zinc-700 hover:border-zinc-500 text-zinc-400 bg-zinc-900/60'}`}
                            title={p}
                          >
                            {p.slice(5, -1)}
                          </button>
                        ))}
                      </div>
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
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${form.bgMode !== 'gradient' ? 'bg-zinc-700 border-zinc-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'}`}>Upload</button>
                      <button type="button" onClick={() => updateForm({ bgMode: 'gradient' })}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors flex items-center gap-1 ${form.bgMode === 'gradient' ? 'bg-indigo-700 border-indigo-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'}`}>✦ Gradient</button>
                    </div>
                  )}
                  {isBgGradientMode ? (
                    <div className="space-y-1.5">
                      <button type="button" onClick={() => updateForm({ gradientJson: randomGradient(form.gradientJson) })}
                        className="flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-[10px] font-medium transition-colors">
                        <Shuffle size={9} /> Randomize
                      </button>
                      <GradientBuilder value={form.gradientJson} onApply={json => updateForm({ gradientJson: json })} />
                    </div>
                  ) : (
                    <PixelBackgroundUploader currentImage={form.url} onImageChange={url => updateForm({ url })} />
                  )}
                </div>
              )}

              {/* Select options */}
              {isSelectField && (
                <div className="space-y-1.5">
                  <label className="text-[9px] text-zinc-500 uppercase tracking-wide font-medium block">Value</label>
                  <div className="flex gap-1 flex-wrap">
                    {(fieldDef as any).options.map((opt: string) => (
                      <button key={opt} type="button" onClick={() => updateForm({ selectValue: opt, useCustom: false })}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${!form.useCustom && form.selectValue === opt ? 'bg-indigo-700 border-indigo-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'}`}>{opt}</button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => updateForm({ useCustom: !form.useCustom })}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors shrink-0 ${form.useCustom ? 'bg-amber-700/60 border-amber-500/60 text-amber-200' : 'border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500'}`}>Custom…</button>
                    {form.useCustom && (
                      <input type="text" value={form.customValue} onChange={e => updateForm({ customValue: e.target.value })}
                        placeholder="e.g. Diamond Chain" autoFocus
                        className="flex-1 bg-zinc-800 border border-amber-600/40 rounded px-2 py-0.5 text-[10px] text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500" />
                    )}
                  </div>
                  {form.useCustom && <p className="text-[9px] text-amber-500/70 leading-snug">Custom values only work if the avatar renderer supports them.</p>}
                </div>
              )}

              {/* Name / Key / Tier / Price */}
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

              {err && <div className="flex items-center gap-1.5 text-red-400 text-[10px] bg-red-900/20 border border-red-800/40 rounded px-2 py-1.5"><AlertTriangle size={10} /> {err}</div>}
              {success && <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] bg-emerald-900/20 border border-emerald-800/40 rounded px-2 py-1.5"><Check size={10} /> {success}</div>}

              <div className="flex justify-end">
                <button onClick={handleCreate} disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5">
                  {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                  {busy ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {patternSetConfirmOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pattern-set-confirm-title"
          onClick={() => { if (!busy) setPatternSetConfirmOpen(false); }}
        >
          <div
            className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            style={{
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-cyan-500/20 bg-zinc-900/50">
              <h3 id="pattern-set-confirm-title" className="text-sm font-semibold text-white">
                Create pattern set?
              </h3>
              <p className="text-[10px] text-zinc-400 mt-1">
                This will create <span className="text-cyan-300/90">{PATTERN_BULK_FIELDS.length}</span> shop items with the same pattern unlock value, one per field.
              </p>
            </div>
            <div className="p-4 space-y-3 max-h-[min(60vh,320px)] overflow-y-auto">
              <div className="text-[10px] text-zinc-500">
                <span className="text-zinc-400 font-medium">Pattern:</span>{' '}
                <code className="text-fuchsia-300/90 font-mono">{form.patternValue}</code>
              </div>
              <div className="text-[10px] text-zinc-500">
                <span className="text-zinc-400 font-medium">Base name:</span>{' '}
                <span className="text-zinc-300">{form.displayName.trim()}</span>
              </div>
              <ul className="space-y-2 text-[10px]">
                {PATTERN_BULK_FIELDS.map((field) => {
                  const itemKey = toItemKey(field, form.patternValue);
                  const shopName = `${form.displayName.trim()} (${PATTERN_BULK_LABEL[field]})`;
                  return (
                    <li
                      key={field}
                      className="rounded-lg border border-zinc-700/80 bg-zinc-900/60 px-2.5 py-2"
                    >
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-zinc-400 font-medium shrink-0">{PATTERN_BULK_LABEL[field]}</span>
                        <code className="text-cyan-400/90 font-mono truncate text-right" title={itemKey}>
                          {itemKey}
                        </code>
                      </div>
                      <div className="text-zinc-500 truncate" title={shopName}>
                        {shopName}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="text-[10px] text-zinc-500 flex flex-wrap gap-x-3 gap-y-1">
                <span>
                  Tier: <span className="text-zinc-300 capitalize">{form.tier}</span>
                </span>
                <span>
                  Price: <span className="text-amber-300/90">{price.toLocaleString()}</span> MORBIUS each
                </span>
                <span>Supply: {supply} each</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-zinc-700/80 bg-zinc-950/40">
              <button
                type="button"
                onClick={copyPatternSetKeys}
                className="mr-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-600 text-zinc-400 hover:text-white hover:border-zinc-500 text-[10px] font-medium transition-colors"
              >
                <Copy size={12} /> Copy keys
              </button>
              <button
                type="button"
                onClick={() => setPatternSetConfirmOpen(false)}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 text-xs font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void executePatternSetCreate()}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : null}
                {busy ? 'Creating…' : 'Create all'}
              </button>
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
  const voxelPainterRef = useRef<VoxelPainterHandle>(null);
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

      {/* Review-first hairstyle previews */}
      <DreadlocksVariantReviewPanel voxelPainterRef={voxelPainterRef} />

      {/* Voxel painter */}
      {address && <VoxelPainter ref={voxelPainterRef} address={address} onCreated={load} />}

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
