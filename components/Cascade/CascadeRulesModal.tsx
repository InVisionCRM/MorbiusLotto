'use client';

import { ArcadeRulesModal, DEEP_SEA } from '@/components/arcade2/ArcadeRulesModal';
import { Grid3x3 } from 'lucide-react';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

// The gem tokens from the prototype (rarity ascending). Colours are game
// tokens, not chrome.
const GEMS = [
  { g: '●', c: '#5E8CA8' },
  { g: '▲', c: '#48C39A' },
  { g: '◆', c: '#9B8CF0' },
  { g: '✦', c: '#E0913C' },
  { g: '⬢', c: '#E2658C' },
];

function CascadeGraphic() {
  // A tiny 5-tile strip showing a cluster of matching gems lit up, then the
  // combo climbing — a static taste of the chain reaction.
  const lit = [2, 2, 2]; // three matching ◆ form a cluster
  return (
    <div>
      <div
        className="arules-glow relative flex items-center justify-center gap-1.5 rounded-lg p-2 mb-2"
        style={{ background: '#0b1a26', border: '1px solid rgba(34,211,238,0.14)' }}
      >
        {[0, ...lit, 4].map((sym, i) => {
          const inCluster = i >= 1 && i <= 3;
          const gm = GEMS[sym];
          return (
            <div
              key={i}
              className="grid h-8 w-8 place-items-center rounded-md text-base font-bold"
              style={{
                color: gm.c,
                background: 'rgba(2,8,13,0.5)',
                boxShadow: inCluster
                  ? `inset 0 0 0 2px ${gm.c}, 0 0 14px -3px ${gm.c}`
                  : 'inset 0 0 0 1px rgba(34,211,238,0.08)',
              }}
            >
              {gm.g}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <span className="arc-mono text-[11px]" style={{ color: '#94a3b8' }}>
          cluster pops · grid tumbles · <span style={{ color: '#67e8f9' }}>combo climbs</span>
        </span>
        <span className="arc-mono text-[15px] font-bold" style={{ color: '#FCD34D' }}>×1 → ×30</span>
      </div>
    </div>
  );
}

export function CascadeRulesModal({ open, onOpenChange }: Props) {
  return (
    <ArcadeRulesModal
      open={open}
      onOpenChange={onOpenChange}
      theme={DEEP_SEA}
      game="Cascade"
      icon={<Grid3x3 className="w-5 h-5" style={{ color: '#22D3EE' }} />}
      intro={<>One drop ignites a 6×6 grid of gems. Clusters of matching gems pop and pay, the grid tumbles down and refills from the top, and the chain repeats — a combo multiplier climbing with every link until no more clusters form. No decisions after the drop; just watch it cascade.</>}
      steps={[
        <>Set your bet and pick a <span style={{ color: '#67e8f9' }}>volatility</span> — Calm, Standard or Frenzy.</>,
        <>Drop. Any <span style={{ color: '#67e8f9' }}>cluster</span> of enough connected matching gems pays and pops; gems above tumble down and new ones fall in.</>,
        <>Each fresh cluster keeps the <span style={{ color: '#67e8f9' }}>chain</span> alive and raises the combo multiplier. Your win is the sum of every link, times your bet.</>,
      ]}
      graphic={<CascadeGraphic />}
      graphicLabel="The chain reaction"
      payouts={[
        { label: 'Calm', sub: 'gentle combo · ignites ~90%', pays: '×1 → ×5' },
        { label: 'Standard', sub: 'balanced · ignites ~91%', pays: '×1 → ×12' },
        { label: 'Frenzy', sub: 'needs 5+ · ignites ~72%', pays: '×1 → ×30' },
        { label: 'Bigger clusters', sub: 'more gems = more pay', pays: 'size bonus' },
        { label: 'Longer chains', sub: 'each link climbs the combo', pays: 'top wins' },
      ]}
      payoutsLabel="Volatility → combo curve"
      footer={<>Every gem — the opening board and all the refills — is drawn from a committed server seed + your client seed, so the whole cascade re-runs gem-for-gem in Verify. RTP ≈ 97% on every mode. Played in chips.</>}
    />
  );
}
