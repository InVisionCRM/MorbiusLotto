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
  icon: LucideIcon;
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
  /** Show compact text under each icon (e.g. emotion names). */
  showLabels?: boolean;
  onSelect?: (item: RadialMenuItem) => void;
  onOpenChange?: (open: boolean) => void;
  /** Non-modal avoids trapping focus over the rest of the game UI. */
  modal?: boolean;
};

type Point = { x: number; y: number };

const menuTransition: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 32,
  mass: 1,
};

const wedgeTransition: Transition = {
  duration: 0.05,
  ease: 'easeOut',
};

const FULL_CIRCLE = 360;
const START_ANGLE = -90;

/** Shared SVG defs: cyan outer ring + optional filters (glass menu). */
function RadialMenuSvgDefs({ idPrefix }: { idPrefix: string }) {
  return (
    <defs>
      <linearGradient id={`${idPrefix}-outer`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#a5f3fc" stopOpacity={0.95} />
        <stop offset="45%" stopColor="#22d3ee" stopOpacity={1} />
        <stop offset="100%" stopColor="#0891b2" stopOpacity={0.9} />
      </linearGradient>
      <linearGradient id={`${idPrefix}-outer-active`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ecfeff" stopOpacity={1} />
        <stop offset="50%" stopColor="#22d3ee" stopOpacity={1} />
        <stop offset="100%" stopColor="#06b6d4" stopOpacity={1} />
      </linearGradient>
    </defs>
  );
}

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function polarToCartesian(radius: number, angleDeg: number): Point {
  const rad = degToRad(angleDeg);
  return {
    x: Math.cos(rad) * radius,
    y: Math.sin(rad) * radius,
  };
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

export function RadialMenu({
  children,
  menuItems,
  size = 240,
  iconSize = 18,
  bandWidth = 50,
  innerGap = 8,
  outerGap = 8,
  outerRingWidth = 12,
  showLabels = false,
  onSelect,
  onOpenChange,
  modal = false,
}: RadialMenuProps) {
  const radius = size / 2;

  const outerRingOuterRadius = radius;
  const outerRingInnerRadius = outerRingOuterRadius - outerRingWidth;

  const wedgeOuterRadius = outerRingInnerRadius - outerGap;
  const wedgeInnerRadius = wedgeOuterRadius - bandWidth;

  const iconRingRadius = (wedgeOuterRadius + wedgeInnerRadius) / 2;

  const centerRadius = Math.max(wedgeInnerRadius - innerGap, 0);

  const slice = 360 / menuItems.length;

  const itemRefs = React.useRef<(HTMLElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const gradId = React.useId().replace(/:/g, '');

  const resetActive = () => setActiveIndex(null);

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange?.(isOpen);
    if (!isOpen) resetActive();
  };

  const labelBox = showLabels ? iconSize * 2.8 : iconSize * 2;

  return (
    <ContextMenu.Root onOpenChange={handleOpenChange} modal={modal}>
      <ContextMenu.Trigger asChild={children != null}>
        {children ?? (
          <div className="flex size-20 select-none items-center justify-center rounded-lg border border-cyan-500/30 bg-black/15 font-poppins text-[10px] text-cyan-300/80 outline-none backdrop-blur-sm">
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
          <div
            className="relative"
            style={{
              width: size,
              height: size,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <motion.div
              className="absolute inset-0 rounded-full bg-black/15 shadow-[0_8px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md"
              initial={{ opacity: 0, scale: 0.82 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={menuTransition}
            />
            <svg
              className="absolute inset-0 size-full"
              viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`}
            >
              <RadialMenuSvgDefs idPrefix={gradId} />
              {menuItems.map((item, index) => {
                const Icon = item.icon;
                const midDeg = START_ANGLE + slice * index;
                const { x: iconX, y: iconY } = polarToCartesian(iconRingRadius, midDeg);
                const isActive = activeIndex === index;

                return (
                  <g
                    key={String(item.id)}
                    className="cursor-pointer"
                    onClick={() => itemRefs.current[index]?.click()}
                    onMouseEnter={() => {
                      setActiveIndex(index);
                      itemRefs.current[index]?.focus();
                    }}
                  >
                    <motion.path
                      d={slicePath(
                        index,
                        menuItems.length,
                        outerRingOuterRadius,
                        outerRingInnerRadius,
                      )}
                      fill={isActive ? `url(#${gradId}-outer-active)` : `url(#${gradId}-outer)`}
                      className="stroke-cyan-400/50 stroke-[0.5]"
                      initial={false}
                      transition={wedgeTransition}
                    />
                    <motion.path
                      d={slicePath(
                        index,
                        menuItems.length,
                        wedgeOuterRadius,
                        wedgeInnerRadius,
                      )}
                      className={cn(
                        'stroke-cyan-500/35 stroke-1',
                        isActive ? 'fill-cyan-400/15' : 'fill-white/[0.06]',
                      )}
                      initial={false}
                      transition={wedgeTransition}
                    />

                    <foreignObject
                      x={iconX - labelBox / 2}
                      y={iconY - labelBox / 2}
                      width={labelBox}
                      height={labelBox}
                    >
                      <div className="flex size-full flex-col items-center justify-center gap-0.5 font-poppins">
                        <ContextMenu.Item
                          ref={(el) => {
                            itemRefs.current[index] = el as HTMLElement | null;
                          }}
                          onFocus={() => setActiveIndex(index)}
                          onSelect={() => {
                            onSelect?.(item);
                          }}
                          aria-label={item.label}
                          className="flex size-full flex-col items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                        >
                          <Icon
                            className={cn(
                              'shrink-0 drop-shadow-[0_0_10px_rgba(34,211,238,0.85)]',
                              isActive ? 'text-cyan-100' : 'text-cyan-300',
                            )}
                            style={{ height: iconSize, width: iconSize }}
                          />
                          {showLabels && (
                            <span
                              className={cn(
                                'max-w-[52px] truncate bg-gradient-to-b from-cyan-200 via-cyan-400 to-cyan-500 bg-clip-text text-center text-[7px] font-semibold leading-tight text-transparent',
                                isActive && 'from-white via-cyan-200 to-cyan-300',
                              )}
                            >
                              {item.label}
                            </span>
                          )}
                        </ContextMenu.Item>
                      </div>
                    </foreignObject>
                  </g>
                );
              })}

              <circle
                cx={0}
                cy={0}
                r={centerRadius}
                className="fill-black/15 stroke-cyan-500/40 stroke-1"
              />
              <circle cx={0} cy={0} r={3} className="fill-none stroke-cyan-400/70" />
            </svg>
          </div>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

// ── Click / tap radial (fixed position from anchor) — for poker seat player menu, etc. ──

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
};

/**
 * Same wedge UI as {@link RadialMenu} but opens on demand (left click / tap).
 * Renders in a portal, positioned above the anchor element’s center.
 */
export function RadialMenuFloating({
  open,
  onOpenChange,
  anchorRef,
  menuItems,
  onSelect,
  size = 260,
  iconSize = 18,
  bandWidth = 50,
  innerGap = 8,
  outerGap = 8,
  outerRingWidth = 12,
  showLabels = true,
}: RadialMenuFloatingProps) {
  const [coords, setCoords] = React.useState<{ left: number; top: number } | null>(null);
  const gradId = React.useId().replace(/:/g, '');
  const radius = size / 2;
  const outerRingOuterRadius = radius;
  const outerRingInnerRadius = outerRingOuterRadius - outerRingWidth;
  const wedgeOuterRadius = outerRingInnerRadius - outerGap;
  const wedgeInnerRadius = wedgeOuterRadius - bandWidth;
  const iconRingRadius = (wedgeOuterRadius + wedgeInnerRadius) / 2;
  const centerRadius = Math.max(wedgeInnerRadius - innerGap, 0);
  const slice = menuItems.length > 0 ? 360 / menuItems.length : 0;
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const labelBox = showLabels ? iconSize * 2.8 : iconSize * 2;

  const updatePosition = React.useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // Float menu center slightly above avatar center
    setCoords({ left: cx, top: cy - Math.min(48, rect.height * 0.35) });
  }, [anchorRef]);

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

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close menu"
        className="fixed inset-0 z-[108] cursor-default bg-black/15 backdrop-blur-md"
        onClick={() => onOpenChange(false)}
      />
      <div
        className="pointer-events-none fixed z-[110]"
        style={{
          left: coords.left,
          top: coords.top,
          transform: 'translate(-50%, -50%)',
          width: size,
          height: size,
        }}
      >
        <div
          className="pointer-events-auto relative size-full"
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <motion.div
            className="absolute inset-0 rounded-full bg-black/15 shadow-[0_8px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md"
            initial={{ opacity: 0, scale: 0.82 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={menuTransition}
          />
          <svg
            className="absolute inset-0 size-full"
            viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`}
            aria-hidden={false}
          >
            <RadialMenuSvgDefs idPrefix={gradId} />
            {menuItems.map((item, index) => {
              const Icon = item.icon;
              const midDeg = START_ANGLE + slice * index;
              const { x: iconX, y: iconY } = polarToCartesian(iconRingRadius, midDeg);
              const isActive = activeIndex === index;

              return (
                <g
                  key={String(item.id)}
                  className="cursor-pointer"
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  <motion.path
                    d={slicePath(index, menuItems.length, outerRingOuterRadius, outerRingInnerRadius)}
                    fill={isActive ? `url(#${gradId}-outer-active)` : `url(#${gradId}-outer)`}
                    className="stroke-cyan-400/50 stroke-[0.5]"
                    initial={false}
                    transition={wedgeTransition}
                  />
                  <motion.path
                    d={slicePath(index, menuItems.length, wedgeOuterRadius, wedgeInnerRadius)}
                    className={cn(
                      'stroke-cyan-500/35 stroke-1',
                      isActive ? 'fill-cyan-400/15' : 'fill-white/[0.06]',
                    )}
                    initial={false}
                    transition={wedgeTransition}
                  />
                  <foreignObject
                    x={iconX - labelBox / 2}
                    y={iconY - labelBox / 2}
                    width={labelBox}
                    height={labelBox}
                  >
                    <div className="flex size-full flex-col items-center justify-center gap-0.5 font-poppins">
                      <button
                        type="button"
                        role="menuitem"
                        aria-label={item.label}
                        className="flex size-full flex-col items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                        onClick={() => onSelect(item)}
                      >
                        <Icon
                          className={cn(
                            'shrink-0 drop-shadow-[0_0_10px_rgba(34,211,238,0.85)]',
                            isActive ? 'text-cyan-100' : 'text-cyan-300',
                          )}
                          style={{ height: iconSize, width: iconSize }}
                        />
                        {showLabels && (
                          <span
                            className={cn(
                              'max-w-[52px] truncate bg-gradient-to-b from-cyan-200 via-cyan-400 to-cyan-500 bg-clip-text text-center text-[7px] font-semibold leading-tight text-transparent',
                              isActive && 'from-white via-cyan-200 to-cyan-300',
                            )}
                          >
                            {item.label}
                          </span>
                        )}
                      </button>
                    </div>
                  </foreignObject>
                </g>
              );
            })}
            <circle
              cx={0}
              cy={0}
              r={centerRadius}
              className="fill-black/15 stroke-cyan-500/40 stroke-1"
            />
            <circle cx={0} cy={0} r={3} className="fill-none stroke-cyan-400/70" />
          </svg>
        </div>
      </div>
    </>,
    document.body,
  );
}
