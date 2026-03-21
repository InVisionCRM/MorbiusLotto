'use client';

import * as React from 'react';
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
          <div className="flex size-20 select-none items-center justify-center rounded-lg border-2 border-dashed border-white/20 outline-none">
            Right-click here.
          </div>
        )}
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content
          className="z-[100] min-w-0 border-0 bg-transparent p-0 shadow-none outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
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
              className="absolute inset-0 rounded-full shadow-xl"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={menuTransition}
            />
            <svg
              className="absolute inset-0 size-full"
              viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`}
            >
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
                      className={cn({
                        'fill-neutral-200 dark:fill-neutral-700': isActive,
                        'fill-neutral-100 dark:fill-neutral-800': !isActive,
                      })}
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
                        'stroke-neutral-300 stroke-1 dark:stroke-neutral-600',
                        {
                          'fill-neutral-200 dark:fill-neutral-700': isActive,
                          'fill-neutral-100 dark:fill-neutral-800': !isActive,
                        },
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
                      <div className="flex size-full flex-col items-center justify-center gap-0.5">
                        <ContextMenu.Item
                          ref={(el) => {
                            itemRefs.current[index] = el as HTMLElement | null;
                          }}
                          onFocus={() => setActiveIndex(index)}
                          onSelect={() => {
                            onSelect?.(item);
                          }}
                          aria-label={item.label}
                          className={cn(
                            'flex size-full flex-col items-center justify-center rounded-full text-neutral-600 outline-none dark:text-neutral-400',
                            {
                              'text-neutral-900 dark:text-neutral-50': isActive,
                            },
                          )}
                        >
                          <Icon style={{ height: iconSize, width: iconSize }} />
                          {showLabels && (
                            <span className="max-w-[52px] truncate text-center text-[7px] font-medium leading-tight text-neutral-600 dark:text-neutral-300">
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
                className="fill-neutral-100 stroke-1 opacity-50 stroke-neutral-400 dark:fill-neutral-950 dark:stroke-neutral-600"
              />
              <circle cx={0} cy={0} r={3} className="fill-none stroke-neutral-400 dark:stroke-neutral-600" />
            </svg>
          </div>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
