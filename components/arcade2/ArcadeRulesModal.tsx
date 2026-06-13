'use client';

// ArcadeRulesModal — one shared, palette-flexible "Rules / How to play" modal for
// every chips arcade game. Matches the craps Rules modal: a Dialog with an
// animated How-to-play stepper, a per-game animated graphic, and a payouts grid.
// Colours come from a theme object so cyan (Deep-Sea), emerald (roulette) and
// crash-green games all share the same layout + motion.

import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import './arcade-rules.css';

export interface ArcadeRulesTheme {
  accent: string;      // primary line / number colour
  accentSoft: string;  // translucent accent fill
  accentLine: string;  // accent border
  screen: string;      // modal background
  panel: string;       // inner panel / card background
  border: string;      // panel + modal border
  win: string;         // payout / win colour
  loss: string;        // loss colour
  text: string;        // body text
  muted: string;       // labels / hints
  intro: string;       // intro line
}

export const DEEP_SEA: ArcadeRulesTheme = {
  accent: '#22D3EE', accentSoft: 'rgba(34,211,238,0.12)', accentLine: 'rgba(34,211,238,0.35)',
  screen: '#050E16', panel: 'rgba(8,20,31,0.82)', border: 'rgba(34,211,238,0.16)',
  win: '#FCD34D', loss: '#FB7185', text: '#cbd5e1', muted: '#64748b', intro: '#94a3b8',
};

export const EMERALD: ArcadeRulesTheme = {
  accent: '#34D399', accentSoft: 'rgba(52,211,153,0.12)', accentLine: 'rgba(52,211,153,0.35)',
  screen: '#04130D', panel: 'rgba(7,39,26,0.82)', border: 'rgba(52,211,153,0.16)',
  win: '#FBBF24', loss: '#FB7185', text: '#cbd5e1', muted: '#6b8b7d', intro: '#9fc7b5',
};

export const CRASH_GREEN: ArcadeRulesTheme = {
  accent: '#00ffa3', accentSoft: 'rgba(0,255,163,0.12)', accentLine: 'rgba(0,255,163,0.35)',
  screen: '#06070a', panel: '#10121a', border: 'rgba(255,255,255,0.08)',
  win: '#ff9d00', loss: '#ff3e3e', text: '#cbd5e1', muted: '#848ca1', intro: '#9aa3b8',
};

export interface PayoutRow {
  label: string;
  sub?: string;
  pays: string;
}

interface ArcadeRulesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: string;
  icon?: ReactNode;
  intro: ReactNode;
  steps: ReactNode[];
  graphic: ReactNode;
  graphicLabel?: string;
  payouts: PayoutRow[];
  payoutsLabel?: string;
  footer?: ReactNode;
  theme?: ArcadeRulesTheme;
}

const Label = ({ children, color }: { children: ReactNode; color: string }) => (
  <div className="arc-display text-[10px] uppercase tracking-[0.28em] mb-2" style={{ color }}>{children}</div>
);

export function ArcadeRulesModal({
  open,
  onOpenChange,
  game,
  icon,
  intro,
  steps,
  graphic,
  graphicLabel = 'How it works',
  payouts,
  payoutsLabel = 'Payouts',
  footer,
  theme = DEEP_SEA,
}: ArcadeRulesModalProps) {
  const t = theme;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="arcade2-scope max-w-3xl max-h-[88vh] overflow-y-auto border"
        style={{ background: t.screen, borderColor: t.border, color: t.text }}
      >
        <DialogHeader>
          <DialogTitle className="arc-display text-xl uppercase tracking-wider flex items-center gap-2" style={{ color: '#fff' }}>
            {icon}
            {game}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm leading-relaxed -mt-1" style={{ color: t.intro }}>{intro}</p>

        {/* How to play — staggered reveal */}
        <div className="mt-1">
          <Label color={t.muted}>How to play</Label>
          <div className="space-y-2.5">
            {steps.map((s, i) => (
              <div
                key={i}
                className="arules-step flex gap-2.5 items-start"
                style={{ animationDelay: `${0.05 + i * 0.12}s` }}
              >
                <span
                  className="arc-mono shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[11px]"
                  style={{ background: t.accentSoft, border: `1px solid ${t.accentLine}`, color: t.accent }}
                >
                  {i + 1}
                </span>
                <span className="text-[13px] leading-snug">{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Animated game graphic */}
        <div className="rounded-xl p-3 sm:p-4 mt-3 border" style={{ background: t.panel, borderColor: t.border }}>
          <Label color={t.muted}>{graphicLabel}</Label>
          {graphic}
        </div>

        {/* Payouts grid */}
        <div className="mt-3">
          <Label color={t.muted}>{payoutsLabel}</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {payouts.map((p, i) => (
              <div
                key={i}
                className="rounded-lg px-3 py-2 flex items-center justify-between gap-2 border"
                style={{ background: t.panel, borderColor: t.border }}
              >
                <div className="min-w-0">
                  <div className="text-[13px] truncate" style={{ color: t.text }}>{p.label}</div>
                  {p.sub && <div className="text-[10px] truncate" style={{ color: t.muted }}>{p.sub}</div>}
                </div>
                <div className="arc-mono text-[13px] font-bold shrink-0" style={{ color: t.win }}>{p.pays}</div>
              </div>
            ))}
          </div>
        </div>

        {footer && (
          <p className="text-xs leading-relaxed mt-3 border-t pt-3" style={{ color: t.muted, borderColor: t.border }}>
            {footer}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
