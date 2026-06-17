'use client';

import { ArcadeRulesModal, DEEP_SEA } from '@/components/arcade2/ArcadeRulesModal';
import { LayoutGrid } from 'lucide-react';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

// 40-tile board; a handful are "hits" that pop in to show a winning draw.
const HITS = new Set([2, 9, 14, 19, 23, 30, 36]);

function KenoGraphic() {
  let pop = 0;
  return (
    <div>
      <div className="grid grid-cols-10 gap-1 max-w-[300px] mx-auto">
        {Array.from({ length: 40 }, (_, i) => {
          const hit = HITS.has(i);
          if (!hit) {
            return <div key={i} className="aspect-square rounded" style={{ background: '#0b1a26', border: '1px solid rgba(34,211,238,0.08)' }} />;
          }
          const delay = 0.4 + (pop++) * 0.1;
          return (
            <div
              key={i}
              className="arules-pop aspect-square rounded flex items-center justify-center arc-mono text-[9px] font-bold"
              style={{ animationDelay: `${delay}s`, background: 'rgba(34,211,238,0.18)', border: '1px solid rgba(34,211,238,0.55)', color: '#67e8f9' }}
            >
              {i + 1}
            </div>
          );
        })}
      </div>
      <div className="text-center mt-3 arc-mono text-[13px]">
        <span className="arules-pulse inline-block font-bold" style={{ color: '#67e8f9' }}>7 / 10 hits</span>
        <span style={{ color: '#FCD34D' }}> · big payout</span>
      </div>
    </div>
  );
}

export function KenoRulesModal({ open, onOpenChange }: Props) {
  return (
    <ArcadeRulesModal
      open={open}
      onOpenChange={onOpenChange}
      theme={DEEP_SEA}
      game="Keno"
      icon={<LayoutGrid className="w-5 h-5" style={{ color: '#22D3EE' }} />}
      intro={<>Pick your numbers, the server draws ten, and the more of yours it hits, the more you win.</>}
      steps={[
        <>Pick <span style={{ color: '#67e8f9' }}>1–10</span> tiles from the 40-tile board (or Auto Pick).</>,
        <>Choose a risk mode and your bet, then hit Bet.</>,
        <>The server draws <span style={{ color: '#67e8f9' }}>10</span> tiles — matches are <span style={{ color: '#67e8f9' }}>hits</span>, and pay your paytable.</>,
      ]}
      graphic={<KenoGraphic />}
      graphicLabel="A drawn round"
      payouts={[
        { label: 'Classic', sub: 'balanced', pays: 'even keel' },
        { label: 'Low', sub: 'frequent', pays: 'small wins' },
        { label: 'Medium', sub: 'middle', pays: 'mixed' },
        { label: 'High', sub: 'rare', pays: 'jackpots' },
      ]}
      payoutsLabel="Risk modes"
      footer={<>Payout = bet × your paytable&apos;s value for that risk, pick-count and hit-count — more picks and higher risk push the top multipliers up (a 10-pick on High is the jackpot row). Provably fair. Played in MORBIUS.</>}
    />
  );
}
