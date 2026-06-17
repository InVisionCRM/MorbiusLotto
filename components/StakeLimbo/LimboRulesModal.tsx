'use client';

import { ArcadeRulesModal, DEEP_SEA } from '@/components/arcade2/ArcadeRulesModal';
import { TrendingUp } from 'lucide-react';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

function LimboGraphic() {
  return (
    <div>
      <div
        className="relative h-10 rounded-lg overflow-hidden mb-2"
        style={{ background: '#0b1a26', border: '1px solid rgba(34,211,238,0.14)' }}
      >
        {/* below-target zone (lose) and at/above-target zone (win) */}
        <div className="absolute inset-y-0 left-0" style={{ width: '40%', background: 'rgba(251,113,133,0.10)' }} />
        <div className="absolute inset-y-0" style={{ left: '40%', right: 0, background: 'rgba(245,158,11,0.10)' }} />
        <div className="absolute inset-y-[-3px] w-0.5" style={{ left: '40%', background: '#22D3EE' }} />
        {/* result lands above the target → win */}
        <div className="arules-rise absolute bottom-0 w-2 rounded-t" style={{ left: '62%', height: '100%', background: '#FCD34D', boxShadow: '0 0 12px -2px #FCD34D' }} />
        <span className="arc-mono absolute left-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: '#fb7185' }}>LOSE</span>
        <span className="arc-mono absolute right-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: '#fcd34d' }}>WIN ≥ target</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="arc-mono text-[11px]" style={{ color: '#94a3b8' }}>target <span style={{ color: '#67e8f9' }}>2.00×</span></span>
        <span className="arules-pulse arc-mono text-[13px] font-bold" style={{ color: '#FCD34D' }}>result 3.41× ✓</span>
      </div>
    </div>
  );
}

export function LimboRulesModal({ open, onOpenChange }: Props) {
  return (
    <ArcadeRulesModal
      open={open}
      onOpenChange={onOpenChange}
      theme={DEEP_SEA}
      game="Limbo"
      icon={<TrendingUp className="w-5 h-5" style={{ color: '#22D3EE' }} />}
      intro={<>Call a target multiplier. If the round&apos;s random multiplier reaches it, you&apos;re paid that much — the higher you aim, the rarer the hit.</>}
      steps={[
        <>Set your bet and a <span style={{ color: '#67e8f9' }}>target</span> multiplier (1.01× up to 1000×).</>,
        <>Hit Bet — the server instantly draws a random result multiplier.</>,
        <>Result <span style={{ color: '#fcd34d' }}>≥ target</span> wins <span className="arc-mono">bet × target</span>; below it loses.</>,
      ]}
      graphic={<LimboGraphic />}
      graphicLabel="Result vs. target"
      payouts={[
        { label: '2.00×', sub: 'win ~49%', pays: '2×' },
        { label: '5.00×', sub: 'win ~20%', pays: '5×' },
        { label: '10.0×', sub: 'win ~10%', pays: '10×' },
        { label: '100×', sub: 'win ~1%', pays: '100×' },
      ]}
      payoutsLabel="Target → win chance"
      footer={<>Win chance falls as your target rises (≈ 99 ÷ target, minus a small house edge). Each result re-derives from a committed server seed + your client seed — open Verify to check. Played in MORBIUS.</>}
    />
  );
}
