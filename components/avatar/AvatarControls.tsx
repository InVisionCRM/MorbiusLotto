'use client';

import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Paintbrush,
  Pin,
  Shirt,
  Sparkles,
  UserRound,
} from 'lucide-react';
import type { AvatarField } from '@/lib/cosmetics-catalog';
import { AVATAR_FEATURE_REGISTRY } from '@/lib/avatar-feature-registry';
import { AVATAR_RANDOMIZE_FIELD_KEYS, type AvatarRandomizeFieldKey } from '@/lib/avatar-randomize-pins';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AvatarView from './AvatarView';

type AvatarControlsProps = {
  config: AvatarConfig;
  onChange: (c: AvatarConfig) => void;
  compact?: boolean;
  pinnedRandomFields?: Set<string>;
  onToggleRandomPin?: (field: AvatarRandomizeFieldKey) => void;
};

type PickerOption = {
  value: string;
  label: string;
  previewKind?: 'color' | 'background' | 'avatar';
  previewPatch?: Partial<AvatarConfig>;
};

type EditorField = AvatarField | 'customMouthFeatureId' | 'customNoseFeatureId' | 'customHairFeatureId';

type PickerRow = {
  label: string;
  field: EditorField;
  options: PickerOption[];
  canPin?: boolean;
};

type PickerGroup = {
  id: string;
  title: string;
  icon: React.ReactNode;
  rows: PickerRow[];
};

const PANEL_STYLE = {
  background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
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

function parseCssColor(value: string): { r: number; g: number; b: number } | null {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const r = Number.parseInt(`${hex[0]}${hex[0]}`, 16);
      const g = Number.parseInt(`${hex[1]}${hex[1]}`, 16);
      const b = Number.parseInt(`${hex[2]}${hex[2]}`, 16);
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
      return { r, g, b };
    }
    if (hex.length === 6) {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
      return { r, g, b };
    }
    return null;
  }

  const rgbaMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!rgbaMatch) return null;
  const r = Number.parseInt(rgbaMatch[1] ?? '', 10);
  const g = Number.parseInt(rgbaMatch[2] ?? '', 10);
  const b = Number.parseInt(rgbaMatch[3] ?? '', 10);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
}

function isDarkCssColor(value: string): boolean {
  const rgb = parseCssColor(value);
  if (!rgb) return false;
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance < 0.58;
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
    previewPatch: previewKind === 'avatar' ? { [field]: value } as Partial<AvatarConfig> : undefined,
  }));
}

function buildCustomFeatureOptions(category: 'mouth' | 'nose' | 'hair'): PickerOption[] {
  const ids = Object.keys(AVATAR_FEATURE_REGISTRY[category]).sort((a, b) => a.localeCompare(b));
  return [{ value: '', label: 'None' }, ...ids.map((id) => ({ value: id, label: id }))];
}

function buildBackgroundOptions(
  bgItems: Array<{ displayName: string; unlocks: Array<{ field: string; value: string }> }>,
) {
  const options: PickerOption[] = [{ value: '', label: 'None' }];
  bgItems.forEach((bgItem) => {
    const value = bgItem.unlocks.find((unlock) => unlock.field === 'backgroundImage')?.value ?? '';
    if (!value) return;
    options.push({
      value,
      label: bgItem.displayName,
      previewKind: 'background',
    });
  });
  return options;
}

export default function AvatarControls({
  config,
  onChange,
  compact = false,
  pinnedRandomFields,
  onToggleRandomPin,
}: AvatarControlsProps) {
  const [activeGroupId, setActiveGroupId] = React.useState('base');
  const [activeField, setActiveField] = React.useState<EditorField>('skinColor');
  const tabsScrollRef = React.useRef<HTMLDivElement | null>(null);
  const optionsScrollRef = React.useRef<HTMLDivElement | null>(null);
  const update = (key: keyof AvatarConfig, value: string) => onChange({ ...config, [key]: value });
  const { items: catalogItems } = useCatalog();
  const bgItems = React.useMemo(
    () => catalogItems.filter((item) => item.unlocks.some((unlock) => unlock.field === 'backgroundImage')),
    [catalogItems],
  );
  const backgroundOptions = React.useMemo(() => buildBackgroundOptions(bgItems), [bgItems]);

  const randomizableFieldSet = React.useMemo(
    () => new Set<string>(AVATAR_RANDOMIZE_FIELD_KEYS as readonly string[]),
    [],
  );

  const baseGroup: PickerGroup = {
    id: 'base',
    title: 'Base',
    icon: <UserRound className="w-4 h-4 shrink-0" />,
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
    icon: <Shirt className="w-4 h-4 shrink-0" />,
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
    icon: <Sparkles className="w-4 h-4 shrink-0" />,
    rows: accessoryRows,
  };

  const sceneGroup: PickerGroup = {
    id: 'scene',
    title: 'Scene',
    icon: <ImageIcon className="w-4 h-4 shrink-0" />,
    rows: [
      { label: 'Background', field: 'backgroundImage', options: backgroundOptions },
    ],
  };

  const advancedGroup: PickerGroup = {
    id: 'advanced',
    title: 'Advanced',
    icon: <Paintbrush className="w-4 h-4 shrink-0" />,
    rows: [
      { label: 'Lips', field: 'lipShape', options: buildOptionSet('lipShape', PICKER_LIP_SHAPES, 'avatar') },
      { label: 'Custom Mouth SVG', field: 'customMouthFeatureId', options: buildCustomFeatureOptions('mouth'), canPin: false },
      { label: 'Custom Nose SVG', field: 'customNoseFeatureId', options: buildCustomFeatureOptions('nose'), canPin: false },
      { label: 'Custom Hair SVG', field: 'customHairFeatureId', options: buildCustomFeatureOptions('hair'), canPin: false },
      { label: 'Makeup', field: 'makeup', options: buildOptionSet('makeup', PICKER_MAKEUPS, 'avatar') },
      { label: 'Facial Hair', field: 'facialHair', options: buildOptionSet('facialHair', PICKER_FACIAL_HAIRS, 'avatar') },
      { label: 'Mouth Accessory', field: 'mouthAccessory', options: buildOptionSet('mouthAccessory', PICKER_MOUTH_ACCESSORIES, 'avatar') },
    ],
  };

  const groups = [baseGroup, outfitGroup, accessoriesGroup, sceneGroup, advancedGroup];
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0];

  React.useEffect(() => {
    if (!activeGroup.rows.some((row) => row.field === activeField)) {
      setActiveField(activeGroup.rows[0]?.field ?? 'skinColor');
    }
  }, [activeGroup, activeField]);

  const activeRow = activeGroup.rows.find((row) => row.field === activeField) ?? activeGroup.rows[0];
  const currentValue = activeRow ? ((config[activeRow.field] as string | undefined) ?? '') : '';

  React.useEffect(() => {
    const node = optionsScrollRef.current;
    if (!node) return;
    const selected = node.querySelector<HTMLButtonElement>('button[data-selected="true"]');
    if (!selected) return;
    selected.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeRow?.field, currentValue]);

  const tryApplyOption = React.useCallback((row: PickerRow, option: PickerOption) => {
    if (row.field === 'hairStyle') {
      onChange({
        ...config,
        hairStyle: option.value,
        hat: 'None',
        hatColor: '',
      });
      return true;
    }
    update(row.field, option.value);
    return true;
  }, [config, onChange, update]);

  const cycleActive = (direction: -1 | 1) => {
    if (!activeRow || !activeRow.options.length) return;
    const opts = activeRow.options;
    const idx = opts.findIndex((option) => option.value === currentValue);
    const start = idx >= 0 ? idx : 0;
    const nextIdx = (start + direction + opts.length) % opts.length;
    tryApplyOption(activeRow, opts[nextIdx]!);
  };

  const scrollTabs = (direction: -1 | 1) => {
    const node = tabsScrollRef.current;
    if (!node) return;
    node.scrollBy({ left: direction * 160, behavior: 'smooth' });
  };

  const arrowClass = [
    'absolute top-1/2 -translate-y-1/2 z-20 rounded-full border',
    compact ? 'h-9 w-9' : 'h-14 w-14 sm:h-16 sm:w-16',
    'border-cyan-300/70 text-cyan-600',
    'bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.95),rgba(209,250,254,0.9))]',
    'hover:text-cyan-700 hover:border-cyan-400/80 hover:bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,1),rgba(186,230,253,0.95))]',
    'transition-all duration-200',
    'shadow-[0_6px_18px_rgba(56,189,248,0.22)]',
    'backdrop-blur-sm',
  ].join(' ');

  // The avatar preview. In compact mode it is rendered ABOVE the scroll area
  // (pinned) so it stays visible while the player scrolls the option cards.
  const avatarPreview = (
    <div className={`relative rounded-2xl ${compact ? 'px-2 py-0.5' : 'p-3 sm:p-4'}`}>
      <button
        type="button"
        onClick={() => cycleActive(-1)}
        className={`${arrowClass} ${compact ? 'left-1' : 'left-3 sm:left-4'}`}
        aria-label="Previous avatar option"
      >
        <ChevronLeft className="mx-auto" size={compact ? 18 : 28} />
      </button>
      <button
        type="button"
        onClick={() => cycleActive(1)}
        className={`${arrowClass} ${compact ? 'right-1' : 'right-3 sm:right-4'}`}
        aria-label="Next avatar option"
      >
        <ChevronRight className="mx-auto" size={compact ? 18 : 28} />
      </button>

      <div className="flex w-full items-center justify-center py-1">
        <div className="relative">
          <div className="absolute inset-8 rounded-full bg-cyan-200/50 blur-3xl" />
          <AvatarView
            config={config}
            disableAmbientMotion
            className={
              compact
                ? 'relative z-10 w-28 sm:w-32 aspect-[6/7]'
                : 'relative z-10 w-44 sm:w-48 lg:w-[15rem] aspect-[6/7]'
            }
          />
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="flex h-full min-h-0 rounded-2xl overflow-hidden"
      style={PANEL_STYLE}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="p-2.5">
          <Tabs value={activeGroupId} onValueChange={setActiveGroupId}>
            <div className="relative">
              <button
                type="button"
                onClick={() => scrollTabs(-1)}
                className="absolute left-1 top-1/2 z-10 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300/80 bg-white/90 text-slate-500 hover:text-cyan-700 hover:border-cyan-300 transition-colors"
                aria-label="Scroll tabs left"
              >
                <ChevronLeft size={12} />
              </button>
              <button
                type="button"
                onClick={() => scrollTabs(1)}
                className="absolute right-1 top-1/2 z-10 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300/80 bg-white/90 text-slate-500 hover:text-cyan-700 hover:border-cyan-300 transition-colors"
                aria-label="Scroll tabs right"
              >
                <ChevronRight size={12} />
              </button>
              <TabsList
                ref={tabsScrollRef}
                className="h-auto w-full justify-start gap-1.5 overflow-x-auto scrollbar-hide rounded-2xl bg-slate-100/80 px-8 py-1.5"
              >
                {groups.map((group) => (
                  <TabsTrigger
                    key={group.id}
                    value={group.id}
                    className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors data-[state=active]:border data-[state=active]:border-cyan-200 data-[state=active]:bg-white data-[state=active]:text-cyan-800 data-[state=active]:shadow-[0_2px_12px_rgba(14,116,144,0.12)]"
                  >
                    {group.icon}
                    <span>{group.title}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
        </div>

        {compact ? avatarPreview : null}

        <div
          className={`flex-1 touch-pan-y overflow-y-auto overscroll-y-contain custom-scrollbar ${compact ? 'p-2' : 'p-2.5'} space-y-2`}
        >
          {compact ? null : avatarPreview}

          <div className={`rounded-2xl ${compact ? 'p-1.5 space-y-2' : 'p-2.5 sm:p-3 space-y-3'}`}>

            <div className="w-full space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-600">Category Item</span>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {activeGroup.rows.map((row) => {
                  const isActive = activeRow?.field === row.field;
                  return (
                    <button
                      key={row.field}
                      type="button"
                      onClick={() => setActiveField(row.field)}
                      className={`shrink-0 rounded-xl border ${compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'} font-medium transition-colors ${
                        isActive
                          ? 'border-cyan-300 bg-cyan-50 text-cyan-800 shadow-[0_2px_10px_rgba(6,182,212,0.2)]'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-cyan-200 hover:text-cyan-700'
                      }`}
                    >
                      {row.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="w-full space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-600">Selection</span>
                {onToggleRandomPin && activeRow && activeRow.canPin !== false && randomizableFieldSet.has(activeRow.field) ? (
                  <button
                    type="button"
                    onClick={() => onToggleRandomPin(activeRow.field as AvatarRandomizeFieldKey)}
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] leading-none transition-colors ${
                      pinnedRandomFields?.has(activeRow.field)
                        ? 'bg-cyan-100 text-cyan-700'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Pin size={10} />
                    {pinnedRandomFields?.has(activeRow.field) ? 'Pinned' : 'Pin Item'}
                  </button>
                ) : null}
              </div>

              <div className="relative">
                {/* Thumbnail grid: every option visible at once (no horizontal cycling). */}
                <div
                  ref={optionsScrollRef}
                  className={`grid ${compact ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-4'} gap-2 py-1.5 pr-1 max-h-[48vh] overflow-y-auto overscroll-y-contain custom-scrollbar`}
                >
                  {activeRow?.options.map((option) => {
                    const selected = option.value === currentValue;
                    const isColorCard = option.previewKind === 'color' && option.value.trim().length > 0;
                    const darkColorCard = isColorCard ? isDarkCssColor(option.value) : false;
                    const isPatternColor = isColorCard && PATTERN_RE.test(option.value.trim());
                    const colorCardStyle = isColorCard
                      ? (
                          isPatternColor
                            ? { background: 'linear-gradient(145deg, rgba(8,47,73,0.92), rgba(8,145,178,0.85))' }
                            : { background: option.value }
                        )
                      : undefined;
                    return (
                      <button
                        key={option.value || '__empty__'}
                        type="button"
                        data-selected={selected ? 'true' : 'false'}
                        onClick={() => {
                          if (!activeRow) return;
                          tryApplyOption(activeRow, option);
                        }}
                        style={colorCardStyle}
                        className={`w-full ${compact ? 'px-2 py-2' : 'px-2.5 py-3'} rounded-2xl border text-left transition-all ${
                          isColorCard
                            ? selected
                              ? 'border-cyan-200 shadow-[0_0_0_2px_rgba(34,211,238,0.55),0_0_24px_rgba(34,211,238,0.42),0_4px_16px_rgba(6,182,212,0.28)] ring-2 ring-cyan-300/60'
                              : 'border-white/35 shadow-[0_3px_10px_rgba(2,6,23,0.28)] hover:border-cyan-200/70'
                            : selected
                              ? 'border-cyan-300 bg-cyan-50 text-cyan-900 shadow-[0_4px_14px_rgba(6,182,212,0.22)]'
                              : 'border-slate-200 bg-white text-slate-800 hover:border-cyan-200 hover:shadow-[0_2px_10px_rgba(2,132,199,0.12)]'
                        }`}
                      >
                        {option.previewKind === 'avatar' ? (
                          <div className="mb-1.5 flex justify-center">
                            <AvatarView
                              config={{ ...config, ...(option.previewPatch ?? {}) }}
                              compact
                              disableAmbientMotion
                              className={`${compact ? 'w-12' : 'w-14'} aspect-[6/7] pointer-events-none select-none`}
                            />
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`line-clamp-2 text-sm font-semibold leading-tight ${
                              isColorCard
                                ? darkColorCard
                                  ? 'text-white'
                                  : 'text-slate-900'
                                : ''
                            }`}
                          >
                            {option.label}
                          </span>
                        </div>
                        <p
                          className={`mt-1 text-[11px] leading-none ${
                            isColorCard
                              ? darkColorCard
                                ? 'text-white/85'
                                : 'text-slate-800/80'
                              : 'text-slate-500'
                          }`}
                        >
                          {selected ? 'Selected' : 'Tap to apply'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
