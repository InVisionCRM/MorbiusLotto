'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, LayoutGrid, Loader2, Paintbrush, Plus, Shuffle } from 'lucide-react';
import { CopyButton } from '@/components/ui/copy-button';
import { FREE_VALUES, MAX_SUPPLY, type ItemTier } from '@/lib/cosmetics-catalog';
import { PixelBackgroundUploader } from '@/components/avatar';
import { GradientBuilder } from '@/components/avatar';
import { AvatarView } from '@/components/avatar';
import { DEFAULT_AVATAR_CONFIG } from '@/components/avatar';
import type { AvatarConfig } from '@/lib/websocket-client';
import { parseGradient, serializeGradient, DEFAULT_GRADIENT } from '@/lib/gradient-utils';
import {
  PICKER_ACCESSORIES,
  PICKER_EYE_SHAPES,
  PICKER_HAIR_STYLES,
  PICKER_HATS,
  PICKER_MOUTH_ACCESSORIES,
  PICKER_NECKLACES,
  PICKER_SHIRT_STYLES,
} from '@/lib/avatar-editor-options';
import type { VoxelPainterHandle } from '@/components/avatar';
import { DASH_CARD, DASH_CARD_DIVIDER, DASH_CARD_TOGGLE, MORBIUS_PRICE } from '@/components/admin/cosmetics/shared';

type ItemField =
  | 'skinColor'
  | 'hairColor'
  | 'accessoryColor'
  | 'hairStyle'
  | 'eyeShape'
  | 'shirtColor'
  | 'shirtStyle'
  | 'backgroundImage'
  | 'overlayImage'
  | 'accessory'
  | 'hat'
  | 'hatColor'
  | 'necklace'
  | 'mouthAccessory';

const ADMIN_ACCESSORY_SELECT = PICKER_ACCESSORIES.filter((a) => a !== 'None' && a !== 'Sunglasses');
const ADMIN_HAT_SELECT = PICKER_HATS.filter((h) => h !== 'None' && h !== 'Cap' && h !== 'Beanie');
const ADMIN_HAIR_STYLE_SELECT = PICKER_HAIR_STYLES.filter((h) => !FREE_VALUES.hairStyle.has(h));
const ADMIN_NECKLACE_SELECT = PICKER_NECKLACES.filter((n) => n !== 'None');
const ADMIN_MOUTH_SELECT = PICKER_MOUTH_ACCESSORIES.filter((m) => m !== 'None');

const ITEM_FIELDS: ReadonlyArray<{
  value: ItemField;
  label: string;
  inputType: 'color' | 'select' | 'url';
  options: readonly string[];
}> = [
  { value: 'skinColor', label: 'Skin Color', inputType: 'color', options: [] },
  { value: 'hairColor', label: 'Hair Color', inputType: 'color', options: [] },
  { value: 'accessoryColor', label: 'Glasses Color', inputType: 'color', options: [] },
  { value: 'hairStyle', label: 'Hair Style', inputType: 'select', options: ADMIN_HAIR_STYLE_SELECT },
  { value: 'eyeShape', label: 'Eye Shape', inputType: 'select', options: PICKER_EYE_SHAPES },
  { value: 'shirtColor', label: 'Shirt Color', inputType: 'color', options: [] },
  { value: 'shirtStyle', label: 'Shirt Style', inputType: 'select', options: PICKER_SHIRT_STYLES },
  { value: 'backgroundImage', label: 'Background', inputType: 'url', options: [] },
  { value: 'overlayImage', label: 'Overlay', inputType: 'url', options: [] },
  { value: 'accessory', label: 'Accessory', inputType: 'select', options: ADMIN_ACCESSORY_SELECT },
  { value: 'hat', label: 'Hat', inputType: 'select', options: ADMIN_HAT_SELECT },
  { value: 'hatColor', label: 'Hat Color', inputType: 'color', options: [] },
  { value: 'necklace', label: 'Necklace', inputType: 'select', options: ADMIN_NECKLACE_SELECT },
  { value: 'mouthAccessory', label: 'Mouth', inputType: 'select', options: ADMIN_MOUTH_SELECT },
];

function shortHash(str: string): string {
  let h = 0;
  for (let i = 0; i < Math.min(str.length, 512); i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

const FIELD_PREFIX: Partial<Record<ItemField, string>> = {
  skinColor: 'skin',
  hairColor: 'hair_color',
  shirtColor: 'shirt_color',
  shirtStyle: 'shirt_style',
  accessoryColor: 'accessory_color',
  hairStyle: 'hair_style',
  eyeShape: 'eye_shape',
  accessory: 'acc',
  hat: 'hat',
  hatColor: 'hat_color',
  necklace: 'neck',
  mouthAccessory: 'mouth',
  backgroundImage: 'bg',
  overlayImage: 'overlay',
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
  if (value.startsWith('url(#') && value.endsWith(')')) {
    const name = value.slice(5, -1).toLowerCase().replace(/[^a-z0-9_]/g, '');
    return `${prefix}_pattern_${name}`;
  }
  if (value.startsWith('{')) return `${prefix}_grad_${shortHash(value)}`;
  return `${prefix}_custom_${value.replace('#', '').toLowerCase()}`;
}

function randomHex(): string {
  const h = Math.floor(Math.random() * 360);
  const s = 50 + Math.floor(Math.random() * 40);
  const l = 35 + Math.floor(Math.random() * 40);
  const a = (s * Math.min(l, 100 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round((255 * color) / 100).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function randomGradient(existing?: string): string {
  const angle = Math.floor(Math.random() * 360);
  const parsed = existing ? parseGradient(existing) : null;
  const numStops = Math.max(2, Math.min(5, parsed?.stops?.length ?? (2 + (Math.random() > 0.6 ? 1 : 0))));
  const offsets = numStops <= 2 ? [0, 1] : [0, ...Array.from({ length: numStops - 2 }, () => Math.random()).sort((a, b) => a - b), 1];
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

interface BuilderState {
  field: ItemField;
  inputMode: 'color' | 'gradient' | 'pattern';
  bgMode: 'upload' | 'gradient';
  hex: string;
  gradientJson: string;
  patternValue: string;
  url: string;
  selectValue: string;
  customValue: string;
  useCustom: boolean;
  displayName: string;
  itemKey: string;
  tier: ItemTier;
}

const SHIRT_VARIANTS = PICKER_SHIRT_STYLES.filter((s) => s.startsWith('Streetwear '));
const HAT_VARIANTS = PICKER_HATS.filter((h) => /^Hat V\d+$/.test(h));
const SHADES_VARIANTS = ['Shades V1', 'Shades V2', 'Shades V3'] as const;
const EYE_VARIANTS = PICKER_EYE_SHAPES.filter((s) => /^Eye V\d+$/.test(s));

const VARIANT_REVIEW_SYNC_SPEC: ReadonlyArray<{
  groupKey: string;
  field: ItemField;
  variants: readonly string[];
}> = [
  { groupKey: 'shirt', field: 'shirtStyle', variants: SHIRT_VARIANTS },
  { groupKey: 'hat', field: 'hat', variants: HAT_VARIANTS },
  { groupKey: 'shades', field: 'accessory', variants: SHADES_VARIANTS },
  { groupKey: 'eye', field: 'eyeShape', variants: EYE_VARIANTS },
];

export function DreadlocksVariantReviewPanel({
  voxelPainterRef,
  startCollapsed = true,
  adminAddress,
  onStoreSync,
}: {
  voxelPainterRef: React.RefObject<VoxelPainterHandle | null>;
  startCollapsed?: boolean;
  adminAddress: string | null;
  onStoreSync?: () => void;
}) {
  const STORAGE_KEY = 'admin_cosmetics_variant_decisions_v1';
  const [panelOpen, setPanelOpen] = useState(!startCollapsed);
  const [decisions, setDecisions] = useState<Record<string, 'approved' | 'rejected' | undefined>>({});
  const [showApprovedOnly, setShowApprovedOnly] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncErr, setSyncErr] = useState<string | null>(null);
  const setDecision = (key: string, value: 'approved' | 'rejected' | undefined) => setDecisions(prev => ({ ...prev, [key]: value }));

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
                <AvatarView config={previewConfig} emotion="neutral" className="w-full h-full" compact />
              </div>
              <div className="mt-1.5 flex items-center justify-center gap-2">
                <div className="w-9 h-9 rounded-full overflow-hidden border border-zinc-600 bg-zinc-900/60">
                  <AvatarView config={previewConfig} emotion="neutral" className="w-full h-full" compact />
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
                title="Open Voxel Painter with this preview as a 48×56 grid (full avatar snapshot — erase/recolor, then save as overlay/background)"
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
    <div className={DASH_CARD}>
      <button type="button" className={DASH_CARD_TOGGLE} onClick={() => setPanelOpen(o => !o)}>
        <LayoutGrid className="text-cyan-400 shrink-0 mt-0.5" size={18} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-zinc-100">Variant review</div>
          <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
            Pre-store hairstyle &amp; accessory previews. Optional approve/reject; send any card to voxel painter.
          </p>
          <div className="mt-1 text-[10px] text-zinc-500">
            Approved {Object.values(decisions).filter(v => v === 'approved').length} · Rejected {Object.values(decisions).filter(v => v === 'rejected').length}
          </div>
        </div>
        {panelOpen ? <ChevronUp size={16} className="text-zinc-500 shrink-0" /> : <ChevronDown size={16} className="text-zinc-500 shrink-0" />}
      </button>
      {panelOpen && (
        <div className={`${DASH_CARD_DIVIDER} p-3 space-y-4 max-h-[min(78vh,920px)] overflow-y-auto`}>
          <div className="mb-2">
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
              <button
                type="button"
                disabled={!adminAddress || syncBusy}
                onClick={async () => {
                  if (!adminAddress) return;
                  setSyncErr(null);
                  setSyncMsg(null);
                  const updates: Array<{ itemKey: string; shopListed: boolean }> = [];
                  for (const spec of VARIANT_REVIEW_SYNC_SPEC) {
                    for (const variant of spec.variants) {
                      const dec = decisions[`${spec.groupKey}:${variant}`];
                      if (dec === 'approved') {
                        updates.push({ itemKey: toItemKey(spec.field, variant), shopListed: true });
                      } else if (dec === 'rejected') {
                        updates.push({ itemKey: toItemKey(spec.field, variant), shopListed: false });
                      }
                    }
                  }
                  if (updates.length === 0) {
                    setSyncErr('No approved or rejected cards to apply — toggle Approve or Reject on variants first.');
                    return;
                  }
                  setSyncBusy(true);
                  try {
                    const res = await fetch('/api/cosmetics/admin/bulk-shop-listed', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ adminAddress, updates }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      setSyncErr(data.error ?? 'Sync failed');
                      return;
                    }
                    const nf = Array.isArray(data.notFound) ? (data.notFound as string[]) : [];
                    setSyncMsg(
                      `Updated ${data.updatedCount ?? 0} row(s).` +
                        (nf.length > 0
                          ? ` ${nf.length} key(s) have no DB row yet — create the shop item first (keys: ${nf.slice(0, 5).join(', ')}${nf.length > 5 ? '…' : ''}).`
                          : ''),
                    );
                    onStoreSync?.();
                  } catch {
                    setSyncErr('Network error');
                  } finally {
                    setSyncBusy(false);
                  }
                }}
                className="px-2 py-1 rounded text-[10px] font-medium border border-cyan-500/40 text-cyan-300 hover:text-white hover:border-cyan-400/60 transition-colors disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1"
                title="Writes shop_listed: approved → listed, rejected → off store (existing cosmetic_items rows only)"
              >
                {syncBusy ? <Loader2 size={10} className="animate-spin" /> : null}
                Apply to store (shop_listed)
              </button>
            </div>
            {syncErr && (
              <div className="mt-2 text-[10px] text-red-400 flex items-center gap-1">
                <AlertTriangle size={10} /> {syncErr}
              </div>
            )}
            {syncMsg && (
              <div className="mt-2 text-[10px] text-emerald-400/90">{syncMsg}</div>
            )}
          </div>
          {renderCards('Shirt variants x10', 'shirt', SHIRT_VARIANTS, (variant) => ({ shirtStyle: variant }))}
          {renderCards('Hat variants (V1–V5, V7–V8, V10)', 'hat', HAT_VARIANTS, (variant) => ({ hat: variant }))}
          {renderCards('Sunglasses variants x3', 'shades', SHADES_VARIANTS, (variant) => ({ accessory: variant }))}
          {renderCards('Eye-type variants (V1–V4, V10)', 'eye', EYE_VARIANTS, (variant) => ({ eyeShape: variant }))}
        </div>
      )}
    </div>
  );
}

export function ItemBuilderPanel({
  address,
  onCreated,
  startCollapsed = true,
}: {
  address: string;
  onCreated: () => void;
  startCollapsed?: boolean;
}) {
  const [open, setOpen] = useState(!startCollapsed);
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
      if (
        patch.field !== undefined ||
        patch.hex !== undefined ||
        patch.url !== undefined ||
        patch.gradientJson !== undefined ||
        patch.patternValue !== undefined ||
        patch.selectValue !== undefined ||
        patch.customValue !== undefined ||
        patch.useCustom !== undefined ||
        patch.inputMode !== undefined ||
        patch.bgMode !== undefined
      ) {
        const prevDef = ITEM_FIELDS.find(f => f.value === prev.field)!;
        const prevValue = prevDef.inputType === 'url'
          ? (prev.field === 'backgroundImage' && prev.bgMode === 'gradient' ? prev.gradientJson : prev.url)
          : prevDef.inputType === 'select'
            ? (prev.useCustom ? prev.customValue : prev.selectValue)
            : prev.inputMode === 'pattern'
              ? prev.patternValue
              : prev.inputMode === 'gradient'
                ? prev.gradientJson
                : prev.hex;
        const nextDef = ITEM_FIELDS.find(f => f.value === next.field)!;
        const nextValue = nextDef.inputType === 'url'
          ? (next.field === 'backgroundImage' && next.bgMode === 'gradient' ? next.gradientJson : next.url)
          : nextDef.inputType === 'select'
            ? (next.useCustom ? next.customValue : next.selectValue)
            : next.inputMode === 'pattern'
              ? next.patternValue
              : next.inputMode === 'gradient'
                ? next.gradientJson
                : next.hex;
        const oldAutoKey = toItemKey(prev.field, prevValue);
        if (prev.itemKey === oldAutoKey || prev.itemKey === '') {
          next.itemKey = toItemKey(next.field, nextValue);
        }
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
      setForm({
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

  const previewConfig: AvatarConfig = { ...DEFAULT_AVATAR_CONFIG, [form.field]: activeValue } as AvatarConfig;

  return (
    <div className={DASH_CARD}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={DASH_CARD_TOGGLE}
      >
        <Plus size={18} className="text-emerald-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-semibold text-zinc-100">Create new item</div>
          <p className="text-[11px] text-zinc-500 mt-0.5">Add catalog unlocks — colors, gradients, styles, uploads.</p>
        </div>
        {open ? <ChevronUp size={16} className="text-zinc-500 shrink-0" /> : <ChevronDown size={16} className="text-zinc-500 shrink-0" />}
      </button>

      {open && (
        <div className={`${DASH_CARD_DIVIDER} overflow-hidden`}>
          <div className="flex min-h-0">
            <div className="shrink-0 w-44 border-r border-zinc-800 bg-zinc-800/30 flex flex-col items-center justify-center gap-2 p-4 sticky top-0">
              <AvatarView config={previewConfig} emotion="neutral" className="w-full aspect-[6/7]" />
              <span className="text-[9px] text-zinc-500 uppercase tracking-wide font-medium">{fieldDef.label} · live</span>
            </div>

            <div className="flex-1 min-w-0 p-3 space-y-3 overflow-y-auto max-h-[520px]">
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
              <div className="mr-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-600 text-zinc-400 hover:border-zinc-500 text-[10px] font-medium transition-colors">
                <CopyButton
                  content={PATTERN_BULK_FIELDS.map((field) => {
                    const key = toItemKey(field, form.patternValue);
                    return `${PATTERN_BULK_LABEL[field]}\t${key}`;
                  }).join('\n')}
                  onCopiedChange={(c) => {
                    if (c) setSuccess('Item keys copied to clipboard');
                  }}
                  onCopyError={() => setErr('Could not copy to clipboard')}
                  toastOnError={false}
                  variant="ghost"
                  size="xs"
                  className="h-6 w-6 p-0 text-zinc-400 hover:text-white hover:bg-transparent"
                  title="Copy keys"
                  aria-label="Copy keys"
                />
                <span className="text-zinc-400">Copy keys</span>
              </div>
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
