'use client';

import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import type { AvatarRandomizeFieldKey } from '@/lib/avatar-randomize-pins';
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Lock,
  Paintbrush,
  Pin,
  Shirt,
  Sparkles,
  UserRound,
} from 'lucide-react';
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
import { SidebarButton } from '@/components/ui/sidebar';
import AvatarView from './AvatarView';
import { ColorSwatch } from './ColorSwatch';

type AvatarControlsProps = {
  config: AvatarConfig;
  onChange: (c: AvatarConfig) => void;
  compact?: boolean;
  ownedItems?: Set<string>;
  isAdmin?: boolean;
  onLockedItemClick?: (itemKey: string) => void;
  pinnedRandomFields?: Set<string>;
  onToggleRandomPin?: (field: AvatarRandomizeFieldKey) => void;
};

type PickerOption = {
  value: string;
  label: string;
  previewKind?: 'color' | 'background' | 'avatar';
  itemKey?: string;
  previewPatch?: Partial<AvatarConfig>;
};

type PickerRow = {
  label: string;
  field: AvatarField;
  options: PickerOption[];
};

type PickerGroup = {
  id: string;
  title: string;
  icon: React.ReactNode;
  rows: PickerRow[];
};

const PANEL_STYLE = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
} as const;

const COLOR_LABEL_PREFIX: Partial<Record<AvatarField, string>> = {
  skinColor: 'Tone',
  hairColor: 'Shade',
  eyeColor: 'Iris',
  shirtColor: 'Shade',
  accessoryColor: 'Tint',
  hatColor: 'Tint',
};

const PATTERN_RE = /^url\(#([\w-]+)\)$/;

function titleCase(value: string) {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function labelForColor(field: AvatarField, value: string, index: number) {
  const pattern = PATTERN_RE.exec(value.trim());
  if (pattern) return titleCase(pattern[1]);
  if (value.startsWith('rgba(')) return `${COLOR_LABEL_PREFIX[field] ?? 'Color'} ${index + 1}`;
  return `${COLOR_LABEL_PREFIX[field] ?? 'Color'} ${index + 1}`;
}

function buildOptionSet(
  field: AvatarField,
  values: readonly string[],
  previewKind?: PickerOption['previewKind'],
) {
  return values.map((value, index) => ({
    value,
    label: previewKind === 'color' ? labelForColor(field, value, index) : value,
    previewKind,
    itemKey: getItemKeyForValue(field, value) ?? undefined,
    previewPatch: previewKind === 'avatar' ? { [field]: value } as Partial<AvatarConfig> : undefined,
  }));
}

function buildBackgroundOptions(
  bgItems: Array<{ itemKey: string; displayName: string; unlocks: Array<{ field: string; value: string }> }>,
) {
  const options: PickerOption[] = [{ value: '', label: 'None' }];
  bgItems.forEach((bgItem) => {
    const value = bgItem.unlocks.find((unlock) => unlock.field === 'backgroundImage')?.value ?? '';
    if (!value) return;
    options.push({
      value,
      label: bgItem.displayName,
      previewKind: 'background',
      itemKey: bgItem.itemKey,
    });
  });
  return options;
}

function PreviewChip({ option, baseConfig }: { option: PickerOption; baseConfig: AvatarConfig }) {
  if (option.previewKind === 'color' && option.value) {
    return (
      <span className="w-8 h-8 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10 bg-zinc-900">
        <ColorSwatch value={option.value} />
      </span>
    );
  }

  if (option.previewKind === 'background' && option.value) {
    return (
      <span className="w-10 h-8 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10 bg-zinc-900">
        <img src={option.value} alt="" className="w-full h-full object-cover" />
      </span>
    );
  }

  if (option.previewKind === 'avatar') {
    return (
      <span className="relative w-10 h-10 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10 bg-[radial-gradient(circle_at_50%_35%,rgba(34,211,238,0.18),transparent_70%)]">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/25" />
        <AvatarView
          config={{ ...baseConfig, ...(option.previewPatch ?? {}) }}
          compact
          className="relative z-10 w-full h-full"
        />
      </span>
    );
  }

  return (
    <span className="inline-flex h-8 shrink-0 items-center rounded-full border border-white/10 bg-black/25 px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
      {option.label === 'None' ? 'Off' : 'Set'}
    </span>
  );
}

function CarouselRow({
  row,
  baseConfig,
  currentValue,
  compact,
  isPinned,
  isLocked,
  onCycle,
  onTogglePin,
  onUnlock,
}: {
  row: PickerRow;
  baseConfig: AvatarConfig;
  currentValue: string;
  compact: boolean;
  isPinned: boolean;
  isLocked: boolean;
  onCycle: (direction: -1 | 1) => void;
  onTogglePin?: () => void;
  onUnlock?: () => void;
}) {
  const currentOption = row.options.find((option) => option.value === currentValue) ?? row.options[0];

  return (
    <div
      className={`rounded-2xl border border-white/8 ${compact ? 'p-2.5' : 'p-3'} transition-colors`}
      style={PANEL_STYLE}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onCycle(-1)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/25 text-zinc-300 hover:text-white hover:border-cyan-400/30 hover:bg-cyan-500/10 transition-colors touch-manipulation"
          aria-label={`Previous ${row.label}`}
        >
          <ChevronLeft size={18} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
            {row.label}
          </p>
          <div className="mt-1 flex items-center gap-2 min-w-0">
            <PreviewChip option={currentOption} baseConfig={baseConfig} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-100">
                {currentOption.label}
              </p>
              {isLocked ? (
                <p className="text-[11px] text-amber-300/90">Previewing locked cosmetic</p>
              ) : (
                <p className="text-[11px] text-zinc-500">Tap arrows to cycle options</p>
              )}
            </div>
          </div>
        </div>

        {onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors touch-manipulation ${
              isPinned
                ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200'
                : 'border-white/10 bg-black/25 text-zinc-500 hover:text-zinc-200 hover:border-white/20'
            }`}
            title={isPinned ? `Unpin ${row.label}` : `Pin ${row.label} for Randomize`}
            aria-label={isPinned ? `Unpin ${row.label}` : `Pin ${row.label}`}
          >
            <Pin size={15} />
          </button>
        )}

        <button
          type="button"
          onClick={() => onCycle(1)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/25 text-zinc-300 hover:text-white hover:border-cyan-400/30 hover:bg-cyan-500/10 transition-colors touch-manipulation"
          aria-label={`Next ${row.label}`}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {isLocked && onUnlock && (
        <button
          type="button"
          onClick={onUnlock}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-500/15 transition-colors touch-manipulation"
        >
          <Lock size={12} />
          Unlock This Cosmetic
        </button>
      )}
    </div>
  );
}

export default function AvatarControls({
  config,
  onChange,
  compact = false,
  ownedItems,
  isAdmin = false,
  onLockedItemClick,
  pinnedRandomFields,
  onToggleRandomPin,
}: AvatarControlsProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activeGroupId, setActiveGroupId] = React.useState('base');
  const update = (key: keyof AvatarConfig, value: string) => onChange({ ...config, [key]: value });
  const { items: catalogItems } = useCatalog();
  const bgItems = React.useMemo(
    () => catalogItems.filter((item) => item.unlocks.some((unlock) => unlock.field === 'backgroundImage')),
    [catalogItems],
  );
  const backgroundOptions = React.useMemo(() => buildBackgroundOptions(bgItems), [bgItems]);

  const isLocked = (field: AvatarField, value: string): boolean => {
    if (isAdmin) return false;
    if (!ownedItems) return false;
    const itemKey = getItemKeyForValue(field, value);
    if (!itemKey) return false;
    return !ownedItems.has(itemKey);
  };

  const baseGroup: PickerGroup = {
    id: 'base',
    title: 'Base',
    icon: <UserRound className="w-5 h-5 shrink-0 text-white" />,
    rows: [
      { label: 'Skin Tone', field: 'skinColor', options: buildOptionSet('skinColor', PICKER_SKIN_COLORS, 'color') },
      { label: 'Face Shape', field: 'faceShape', options: buildOptionSet('faceShape', PICKER_FACE_SHAPES, 'avatar') },
      { label: 'Hair Style', field: 'hairStyle', options: buildOptionSet('hairStyle', PICKER_HAIR_STYLES, 'avatar') },
      { label: 'Hair Color', field: 'hairColor', options: buildOptionSet('hairColor', PICKER_HAIR_COLORS, 'color') },
      { label: 'Eye Shape', field: 'eyeShape', options: buildOptionSet('eyeShape', PICKER_EYE_SHAPES, 'avatar') },
      { label: 'Eye Color', field: 'eyeColor', options: buildOptionSet('eyeColor', PICKER_EYE_COLORS, 'color') },
    ],
  };

  const outfitGroup: PickerGroup = {
    id: 'outfit',
    title: 'Outfit',
    icon: <Shirt className="w-5 h-5 shrink-0 text-white" />,
    rows: [
      { label: 'Shirt Style', field: 'shirtStyle', options: buildOptionSet('shirtStyle', PICKER_SHIRT_STYLES, 'avatar') },
      { label: 'Shirt Color', field: 'shirtColor', options: buildOptionSet('shirtColor', PICKER_SHIRT_COLORS, 'color') },
    ],
  };

  const accessoryRows: PickerRow[] = [
    { label: 'Accessories', field: 'accessory', options: buildOptionSet('accessory', PICKER_ACCESSORIES, 'avatar') },
    ...(config.accessory !== 'None'
      ? [{ label: 'Accessory Tint', field: 'accessoryColor' as AvatarField, options: buildOptionSet('accessoryColor', PICKER_ACCESSORY_COLORS, 'color') }]
      : []),
    { label: 'Hat', field: 'hat', options: buildOptionSet('hat', PICKER_HATS, 'avatar') },
    ...(config.hat !== 'None'
      ? [{
          label: 'Hat Tint',
          field: 'hatColor' as AvatarField,
          options: [{ value: '', label: 'Default' }, ...buildOptionSet('hatColor', PICKER_HAT_COLORS, 'color')],
        }]
      : []),
    { label: 'Necklace', field: 'necklace', options: buildOptionSet('necklace', PICKER_NECKLACES, 'avatar') },
  ];

  const accessoriesGroup: PickerGroup = {
    id: 'accessories',
    title: 'Accessories',
    icon: <Sparkles className="w-5 h-5 shrink-0 text-white" />,
    rows: accessoryRows,
  };

  const sceneGroup: PickerGroup = {
    id: 'scene',
    title: 'Scene',
    icon: <ImageIcon className="w-5 h-5 shrink-0 text-white" />,
    rows: [
      { label: 'Background', field: 'backgroundImage', options: backgroundOptions },
    ],
  };

  const advancedGroup: PickerGroup = {
    id: 'advanced',
    title: 'Advanced',
    icon: <Paintbrush className="w-5 h-5 shrink-0 text-white" />,
    rows: [
      { label: 'Lips', field: 'lipShape', options: buildOptionSet('lipShape', PICKER_LIP_SHAPES, 'avatar') },
      { label: 'Makeup', field: 'makeup', options: buildOptionSet('makeup', PICKER_MAKEUPS, 'avatar') },
      { label: 'Facial Hair', field: 'facialHair', options: buildOptionSet('facialHair', PICKER_FACIAL_HAIRS, 'avatar') },
      { label: 'Mouth Accessory', field: 'mouthAccessory', options: buildOptionSet('mouthAccessory', PICKER_MOUTH_ACCESSORIES, 'avatar') },
    ],
  };

  const groups = [baseGroup, outfitGroup, accessoriesGroup, sceneGroup, advancedGroup];
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0];

  const cycleRow = (row: PickerRow, direction: -1 | 1) => {
    if (!row.options.length) return;
    const currentValue = (config[row.field] as string | undefined) ?? '';
    const currentIndex = row.options.findIndex((option) => option.value === currentValue);
    const startIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (startIndex + direction + row.options.length) % row.options.length;
    update(row.field, row.options[nextIndex]!.value);
  };

  return (
    <div
      className="flex h-full min-h-0 rounded-2xl border border-cyan-500/20 overflow-hidden"
      style={PANEL_STYLE}
    >
      <div
        className="hidden md:flex flex-col shrink-0 overflow-hidden border-r border-white/10 bg-black/20 transition-[width] duration-200 ease-in-out"
        style={{ width: menuOpen ? 190 : 60 }}
        data-sidebar-open={menuOpen}
        onMouseEnter={() => setMenuOpen(true)}
        onMouseLeave={() => setMenuOpen(false)}
      >
        <div className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-1">
          {groups.map((group) => (
            <SidebarButton
              key={group.id}
              label={group.title}
              icon={group.icon}
              onClick={() => setActiveGroupId(group.id)}
              active={activeGroup.id === group.id}
              className={`rounded-xl px-2 py-2 transition-colors ${
                activeGroup.id === group.id
                  ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/20'
                  : 'text-white/75 hover:bg-white/5'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="md:hidden border-b border-white/10 p-2">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => setActiveGroupId(group.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                  activeGroup.id === group.id
                    ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/20'
                    : 'bg-black/20 text-zinc-400 border border-white/10'
                }`}
              >
                {group.icon}
                <span>{group.title}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={`flex-1 overflow-y-auto custom-scrollbar ${compact ? 'p-3' : 'p-4'} space-y-2.5`}>
          {activeGroup.rows.map((row) => {
            const currentValue = (config[row.field] as string | undefined) ?? '';
            const currentOption = row.options.find((option) => option.value === currentValue) ?? row.options[0];
            const locked = currentOption ? isLocked(row.field, currentOption.value) : false;
            const itemKey = currentOption?.itemKey;
            const pinned = pinnedRandomFields?.has(row.field) ?? false;

            return (
              <CarouselRow
                key={`${activeGroup.id}-${row.field}`}
                row={row}
                baseConfig={config}
                currentValue={currentValue}
                compact={compact}
                isPinned={pinned}
                isLocked={locked}
                onCycle={(direction) => cycleRow(row, direction)}
                onTogglePin={
                  onToggleRandomPin
                    ? () => onToggleRandomPin(row.field as AvatarRandomizeFieldKey)
                    : undefined
                }
                onUnlock={
                  locked && itemKey && onLockedItemClick
                    ? () => onLockedItemClick(itemKey)
                    : undefined
                }
              />
            );
          })}
        </div>
      </div>

    </div>
  );
}
