'use client';

import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Trophy, ArrowLeftRight, type LucideIcon } from 'lucide-react';
import type { LedgerDirection } from '@/lib/poker-chip-ledger-display';

export interface LedgerDirectionIconProps {
  direction: LedgerDirection;
  size?: 'sm' | 'md' | 'lg';
}

interface DirectionStyle {
  Icon: LucideIcon;
  iconColor: string;
  bg: string;
  border: string;
  label: string;
}

const STYLE: Record<LedgerDirection, DirectionStyle> = {
  in: {
    Icon: ArrowDownLeft,
    iconColor: 'text-emerald-300',
    bg: 'bg-emerald-500/[0.08]',
    border: 'border-emerald-500/30',
    label: 'Chips in',
  },
  out: {
    Icon: ArrowUpRight,
    iconColor: 'text-rose-300',
    bg: 'bg-rose-500/[0.07]',
    border: 'border-rose-500/25',
    label: 'Chips out',
  },
  prize: {
    Icon: Trophy,
    iconColor: 'text-amber-300',
    bg: 'bg-amber-500/[0.10]',
    border: 'border-amber-400/35',
    label: 'Prize',
  },
  exchange: {
    Icon: ArrowLeftRight,
    iconColor: 'text-violet-300',
    bg: 'bg-violet-500/[0.10]',
    border: 'border-violet-500/30',
    label: 'Exchange',
  },
};

const SIZES = {
  sm: { disc: 'w-9 h-9', icon: 17, rounded: 'rounded-lg' },
  md: { disc: 'w-11 h-11', icon: 21, rounded: 'rounded-xl' },
  lg: { disc: 'w-12 h-12', icon: 24, rounded: 'rounded-xl' },
} as const;

export function LedgerDirectionIcon({ direction, size = 'md' }: LedgerDirectionIconProps) {
  const cfg = STYLE[direction];
  const sz = SIZES[size];
  const Icon = cfg.Icon;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center border ${cfg.bg} ${cfg.border} ${sz.disc} ${sz.rounded}`}
      aria-label={cfg.label}
    >
      <Icon size={sz.icon} strokeWidth={2.5} className={cfg.iconColor} aria-hidden />
    </span>
  );
}
