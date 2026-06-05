'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { motion, type Transition } from 'motion/react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { cn } from '@/lib/utils';

export type RadialMenuItem = {
  id: string | number;
  label: string;
  /** Lucide icon (desktop menus). Optional when a `glyph` emoji is provided instead. */
  icon?: LucideIcon;
  /** Real emoji rendered in the wedge instead of a Lucide icon (mobile emote/throwable ring). */
  glyph?: string;
};

type RadialMenuProps = {
  children?: React.ReactNode;
  menuItems: RadialMenuItem[];
  size?: number;
  iconSize?: number;
  bandWidth?: number;
  innerGap?: number;
  outerGap?: number;
  outerRingWidth?: number;
  showLabels?: boolean;
  onSelect?: (item: RadialMenuItem) => void;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  sliceHex?: string;
};

type Point = { x: number; y: number };

const menuTransition: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 32,
  mass: 1,
};

const wedgeTransition: Transition = {
  duration: 0.08,
  ease: 'easeOut',
};

const FULL_CIRCLE = 360;
const START_ANGLE = -90;

function withAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Per-wedge by `id`: Leave red, Chat blue, Bank green, Avatar purple, Moves yellow */
const SLICE_HEX: Record<string, string> = {
  leave: '#ef4444',
  quickchat: '#3b82f6',
  bank: '#22c55e',
  avatar: '#a855f7',
  expressions: '#eab308',
  activity: '#14b8a6',
  profile: '#a855f7',
  follow: '#3b82f6',
  gift: '#f43f5e',
  settings: '#64748b',
  theme: '#a855f7',
  edit_quickchat: '#3b82f6',
  sounds: '#14b8a6',
  'cat:emotes': '#eab308',
  'cat:throw': '#f97316',
  'cat:games': '#a855f7',
  'cat:player': '#3b82f6',
  rps: '#a855f7',
  _back: '#64748b',
};

/** Unknown ids (e.g. emotion names) — same yellow family as Moves */
const DEFAULT_SLICE_HEX = '#eab308';

function sliceColorsForItem(id: string | number, override?: string) {
  const key = String(id);
  const hex = override ?? SLICE_HEX[key] ?? DEFAULT_SLICE_HEX;
  // `override` (e.g. a uniform dark grey for the mobile emote ring) reads as a solid wheel,
  // so use heavier fills than the translucent per-id desktop slices.
  if (override) {
    return {
      hex,
      outer: withAlpha(hex, 0.7),
      outerActive: withAlpha(hex, 0.92),
      inner: withAlpha(hex, 0.55),
      innerActive: withAlpha(hex, 0.78),
      stroke: withAlpha(hex, 0.95),
      innerStroke: withAlpha(hex, 0.55),
    };
  }
  return {
    hex,
    outer: withAlpha(hex, 0.55),
    outerActive: withAlpha(hex, 0.78),
    inner: withAlpha(hex, 0.22),
    innerActive: withAlpha(hex, 0.34),
    stroke: withAlpha(hex, 0.92),
    innerStroke: withAlpha(hex, 0.45),
  };
}

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function polarToCartesian(radius: number, angleDeg: number): Point {
  const rad = degToRad(angleDeg);
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}

function slicePath(
  index: number,
  total: number,
  wedgeRadius: number,
  innerRadius: number,
) {
  if (total <= 0) return '';

  if (total === 1) {
    return `
      M ${wedgeRadius} 0
      A ${wedgeRadius} ${wedgeRadius} 0 1 1 ${-wedgeRadius} 0
      A ${wedgeRadius} ${wedgeRadius} 0 1 1 ${wedgeRadius} 0
      M ${innerRadius} 0
      A ${innerRadius} ${innerRadius} 0 1 0 ${-innerRadius} 0
      A ${innerRadius} ${innerRadius} 0 1 0 ${innerRadius} 0
    `;
  }

  const anglePerSlice = FULL_CIRCLE / total;
  const midDeg = START_ANGLE + anglePerSlice * index;
  const halfSlice = anglePerSlice / 2;
  const startDeg = midDeg - halfSlice;
  const endDeg = midDeg + halfSlice;
  const outerStart = polarToCartesian(wedgeRadius, startDeg);
  const outerEnd = polarToCartesian(wedgeRadius, endDeg);
  const innerStart = polarToCartesian(innerRadius, startDeg);
  const innerEnd = polarToCartesian(innerRadius, endDeg);
  const largeArcFlag = anglePerSlice > 180 ? 1 : 0;

  return `
    M ${outerStart.x} ${outerStart.y}
    A ${wedgeRadius} ${wedgeRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}
    L ${innerEnd.x} ${innerEnd.y}
    A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}
    Z
  `;
}

function RadialSliceIconLabel({
  item,
  iconSize,
  isActive,
  showLabels,
}: {
  item: RadialMenuItem;
  iconSize: number;
  isActive: boolean;
  showLabels: boolean;
}) {
  const Icon = item.icon;
  return (
    <>
      {item.glyph ? (
        <span
          className={cn('shrink-0 select-none leading-none', isActive && 'scale-110')}
          style={{ fontSize: iconSize + 6 }}
          aria-hidden
        >
          {item.glyph}
        </span>
      ) : Icon ? (
        <Icon
          className={cn('shrink-0 text-white', isActive && 'scale-105')}
          style={{ height: iconSize, width: iconSize }}
          strokeWidth={2.35}
        />
      ) : null}
      {showLabels && item.label && (
        <span className="max-w-[68px] truncate text-center text-[11px] font-extrabold leading-snug text-white">
          {item.label}
        </span>
      )}
    </>
  );
}

type WedgeBaseProps = {
  item: RadialMenuItem;
  index: number;
  menuItems: RadialMenuItem[];
  outerRingOuterRadius: number;
  outerRingInnerRadius: number;
  wedgeOuterRadius: number;
  wedgeInnerRadius: number;
  iconRingRadius: number;
  labelBox: number;
  iconSize: number;
  activeIndex: number | null;
  setActiveIndex: (i: number | null) => void;
  children: React.ReactNode;
  /** Fires when user clicks the colored ring (paths), not the HTML label island. */
  onWedgeBackgroundSelect?: () => void;
  /** Uniform wedge color override (e.g. dark grey for the mobile emote ring). */
  sliceHex?: string;
};

function RadialWedgeGraphics({
  item,
  index,
  menuItems,
  outerRingOuterRadius,
  outerRingInnerRadius,
  wedgeOuterRadius,
  wedgeInnerRadius,
  iconRingRadius,
  labelBox,
  iconSize,
  activeIndex,
  setActiveIndex,
  children,
  onWedgeBackgroundSelect,
  sliceHex,
}: WedgeBaseProps) {
  const slice = 360 / menuItems.length;
  const midDeg = START_ANGLE + slice * index;
  const { x: iconX, y: iconY } = polarToCartesian(iconRingRadius, midDeg);
  const isActive = activeIndex === index;
  const c = sliceColorsForItem(item.id, sliceHex);

  return (
    <motion.g
      className="cursor-pointer"
      style={{ transformOrigin: '0px 0px' }}
      initial={false}
      whileHover={{ scale: 1.08 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      onMouseEnter={() => setActiveIndex(index)}
      onMouseLeave={() => setActiveIndex(null)}
    >
      <motion.path
        d={slicePath(index, menuItems.length, wedgeOuterRadius, wedgeInnerRadius)}
        fill={isActive ? c.innerActive : c.inner}
        stroke={c.innerStroke}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        initial={false}
        transition={wedgeTransition}
        onClick={(e) => {
          e.stopPropagation();
          onWedgeBackgroundSelect?.();
        }}
      />
      <foreignObject x={iconX - labelBox / 2} y={iconY - labelBox / 2} width={labelBox} height={labelBox}>
        <div className="pointer-events-auto flex size-full flex-col items-center justify-center gap-0.5 font-poppins">
          {children}
        </div>
      </foreignObject>
    </motion.g>
  );
}

export function RadialMenu({
  children,
  menuItems,
  size = 240,
  iconSize = 22,
  bandWidth = 50,
  innerGap = 8,
  outerGap = 8,
  outerRingWidth = 12,
  showLabels = false,
  onSelect,
  onOpenChange,
  modal = false,
  sliceHex,
}: RadialMenuProps) {
  const radius = size / 2;
  const outerRingOuterRadius = radius;
  const outerRingInnerRadius = outerRingOuterRadius - outerRingWidth;
  const wedgeOuterRadius = outerRingInnerRadius - outerGap;
  const wedgeInnerRadius = wedgeOuterRadius - bandWidth;
  const iconRingRadius = (wedgeOuterRadius + wedgeInnerRadius) / 2;
  const centerRadius = Math.max(wedgeInnerRadius - innerGap, 0);

  const itemRefs = React.useRef<(HTMLElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const resetActive = () => setActiveIndex(null);
  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange?.(isOpen);
    if (!isOpen) resetActive();
  };

  const labelBox = showLabels ? Math.max(iconSize * 3.5, 78) : Math.max(iconSize * 2.5, 48);

  return (
    <ContextMenu.Root onOpenChange={handleOpenChange} modal={modal}>
      <ContextMenu.Trigger asChild={children != null}>
        {children ?? (
          <div className="flex size-20 select-none items-center justify-center rounded-lg border border-white/20 bg-black/15 font-poppins text-[10px] text-neutral-300 outline-none backdrop-blur-sm">
            Right-click here.
          </div>
        )}
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content
          className="z-[100] min-w-0 border-0 bg-transparent p-0 shadow-none outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-90 data-[state=open]:duration-200"
          style={{ width: size, height: size }}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="relative" style={{ width: size, height: size, transform: 'translate(-50%, -50%)' }}>
            <motion.div
              className="absolute inset-0 rounded-full bg-black/20 shadow-[0_8px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md"
              initial={{ opacity: 0, scale: 0.82 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={menuTransition}
            />
            <svg className="absolute inset-0 size-full" viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`}>
              {menuItems.map((item, index) => (
                <RadialWedgeGraphics
                  key={String(item.id)}
                  item={item}
                  index={index}
                  menuItems={menuItems}
                  outerRingOuterRadius={outerRingOuterRadius}
                  outerRingInnerRadius={outerRingInnerRadius}
                  wedgeOuterRadius={wedgeOuterRadius}
                  wedgeInnerRadius={wedgeInnerRadius}
                  iconRingRadius={iconRingRadius}
                  labelBox={labelBox}
                  iconSize={iconSize}
                  activeIndex={activeIndex}
                  setActiveIndex={setActiveIndex}
                  sliceHex={sliceHex}
                  onWedgeBackgroundSelect={() => itemRefs.current[index]?.click()}
                >
                  <ContextMenu.Item
                    ref={(el) => {
                      itemRefs.current[index] = el as HTMLElement | null;
                    }}
                    onFocus={() => setActiveIndex(index)}
                    onSelect={() => onSelect?.(item)}
                    aria-label={item.label}
                    className="flex size-full flex-col items-center justify-center rounded-full text-white outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  >
                    <RadialSliceIconLabel item={item} iconSize={iconSize} isActive={activeIndex === index} showLabels={showLabels} />
                  </ContextMenu.Item>
                </RadialWedgeGraphics>
              ))}
              <circle cx={0} cy={0} r={centerRadius} className="fill-black/25 stroke-white/15 stroke-1" />
              <circle cx={0} cy={0} r={3} className="fill-none stroke-white/35" />
            </svg>
          </div>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export type RadialMenuFloatingProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  menuItems: RadialMenuItem[];
  onSelect: (item: RadialMenuItem) => void;
  size?: number;
  iconSize?: number;
  bandWidth?: number;
  innerGap?: number;
  outerGap?: number;
  outerRingWidth?: number;
  showLabels?: boolean;
  sliceHex?: string;
  /** Minimal mode: ring hugs the anchor (inner hole = anchor radius), no backdrop blur, no base
   *  disc, no centre fill — the anchored element (avatar) stays visible in the middle. */
  bare?: boolean;
};

export function RadialMenuFloating({
  open,
  onOpenChange,
  anchorRef,
  menuItems,
  onSelect,
  size = 280,
  iconSize = 24,
  bandWidth = 52,
  innerGap = 8,
  outerGap = 8,
  outerRingWidth = 12,
  showLabels = true,
  sliceHex,
  bare = false,
}: RadialMenuFloatingProps) {
  const [coords, setCoords] = React.useState<{ left: number; top: number; r: number } | null>(null);
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const labelBox = showLabels ? Math.max(iconSize * 3.5, 82) : Math.max(iconSize * 2.5, 52);

  const updatePosition = React.useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const r = Math.min(rect.width, rect.height) / 2;
    // Keep the whole ring on-screen: at edge/top seats, shift it inward instead of letting half
    // of it open off the side of the table. `bare` hugs the anchor (inner hole = anchor radius),
    // so its outer radius is anchor + band, not size/2.
    const half = bare ? r + 2 + bandWidth + outerGap : size / 2;
    const m = 8;
    const left = Math.max(half + m, Math.min(window.innerWidth - half - m, cx));
    const top = bare
      ? Math.max(half + m, Math.min(window.innerHeight - half - m, cy))
      : Math.max(half + m, Math.min(window.innerHeight - half - m, cy - Math.min(48, rect.height * 0.35)));
    setCoords({ left, top, r });
  }, [anchorRef, size, bare, bandWidth, outerGap]);

  React.useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      setActiveIndex(null);
      return;
    }
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updatePosition, menuItems.length, size]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open || typeof document === 'undefined' || menuItems.length === 0 || !coords) {
    return null;
  }

  // Geometry: `bare` fits the inner hole to the measured anchor (ring hugs the avatar); the default
  // path is unchanged (size-based) so the desktop radial is untouched.
  const wedgeInnerRadius = bare ? coords.r + 2 : size / 2 - outerRingWidth - outerGap - bandWidth;
  const wedgeOuterRadius = wedgeInnerRadius + bandWidth;
  const radius = bare ? wedgeOuterRadius + outerGap : size / 2;
  const dim = radius * 2;
  const outerRingOuterRadius = radius;
  const outerRingInnerRadius = radius - outerRingWidth;
  const iconRingRadius = (wedgeOuterRadius + wedgeInnerRadius) / 2;
  const centerRadius = bare ? Math.max(wedgeInnerRadius, 0) : Math.max(wedgeInnerRadius - innerGap, 0);

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close menu"
        className={bare ? 'fixed inset-0 z-[108] cursor-default' : 'fixed inset-0 z-[108] cursor-default bg-black/15 backdrop-blur-md'}
        style={bare ? { background: 'rgba(2,6,12,0.22)' } : undefined}
        onClick={() => onOpenChange(false)}
      />
      <div
        className="pointer-events-none fixed z-[110]"
        style={{
          left: coords.left,
          top: coords.top,
          transform: 'translate(-50%, -50%)',
          width: dim,
          height: dim,
        }}
      >
        <div className="pointer-events-auto relative size-full" role="menu" onClick={(e) => e.stopPropagation()}>
          {!bare && (
            <motion.div
              className="absolute inset-0 rounded-full bg-black/20 shadow-[0_8px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md"
              initial={{ opacity: 0, scale: 0.82 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={menuTransition}
            />
          )}
          <svg className="absolute inset-0 size-full" viewBox={`${-radius} ${-radius} ${dim} ${dim}`}>
            {menuItems.map((item, index) => (
              <RadialWedgeGraphics
                key={String(item.id)}
                item={item}
                index={index}
                menuItems={menuItems}
                outerRingOuterRadius={outerRingOuterRadius}
                outerRingInnerRadius={outerRingInnerRadius}
                wedgeOuterRadius={wedgeOuterRadius}
                wedgeInnerRadius={wedgeInnerRadius}
                iconRingRadius={iconRingRadius}
                labelBox={labelBox}
                  iconSize={iconSize}
                  activeIndex={activeIndex}
                  setActiveIndex={setActiveIndex}
                  sliceHex={sliceHex}
                  onWedgeBackgroundSelect={() => onSelect(item)}
                >
                <button
                  type="button"
                  role="menuitem"
                  aria-label={item.label}
                  className="flex size-full flex-col items-center justify-center rounded-full text-white outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  onClick={() => onSelect(item)}
                >
                  <RadialSliceIconLabel item={item} iconSize={iconSize} isActive={activeIndex === index} showLabels={showLabels} />
                </button>
              </RadialWedgeGraphics>
            ))}
            {!bare && <circle cx={0} cy={0} r={centerRadius} className="fill-black/25 stroke-white/15 stroke-1" />}
            {!bare && <circle cx={0} cy={0} r={3} className="fill-none stroke-white/35" />}
          </svg>
        </div>
      </div>
    </>,
    document.body,
  );
}
