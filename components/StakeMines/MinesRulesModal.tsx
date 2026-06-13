'use client';

import { ArcadeRulesModal, DEEP_SEA } from '@/components/arcade2/ArcadeRulesModal';
import { Gem, Bomb } from 'lucide-react';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

const CELLS: ('gem' | 'mine' | 'hidden')[] = [
  'gem', 'hidden', 'gem', 'hidden', 'gem',
  'hidden', 'mine', 'gem', 'hidden', 'hidden',
  'hidden', 'gem', 'hidden', 'mine', 'hidden',
  'hidden', 'gem', 'hidden', 'hidden', 'gem',
  'hidden', 'hidden', 'gem', 'hidden', 'hidden',
];

function MinesGraphic() {
  let pop = 0;
  return (
    <div>
      <div className="grid grid-cols-5 gap-1.5 max-w-[220px] mx-auto">
        {CELLS.map((c, i) => {
          if (c === 'hidden') {
            return <div key={i} className="aspect-square rounded-md" style={{ background: '#0b1a26', border: '1px solid rgba(34,211,238,0.10)' }} />;
          }
          const mine = c === 'mine';
          const delay = 0.4 + (pop++) * 0.09;
          return (
            <div
              key={i}
              className="arules-pop aspect-square rounded-md flex items-center justify-center"
              style={{
                animationDelay: `${delay}s`,
                background: mine ? 'rgba(251,59,92,0.14)' : 'rgba(34,211,238,0.14)',
                border: `1px solid ${mine ? 'rgba(251,59,92,0.5)' : 'rgba(34,211,238,0.5)'}`,
                color: mine ? '#fda4af' : '#67e8f9',
              }}
            >
              {mine ? <Bomb className="w-4 h-4" /> : <Gem className="w-4 h-4" />}
            </div>
          );
        })}
      </div>
      <div className="text-center mt-3">
        <span className="arules-pulse arc-mono inline-block text-lg font-bold" style={{ color: '#67e8f9' }}>× 2.18</span>
      </div>
    </div>
  );
}

export function MinesRulesModal({ open, onOpenChange }: Props) {
  return (
    <ArcadeRulesModal
      open={open}
      onOpenChange={onOpenChange}
      theme={DEEP_SEA}
      game="Mines"
      icon={<Gem className="w-5 h-5" style={{ color: '#22D3EE' }} />}
      intro={<>Reveal gems on a 5×5 grid. Every safe pick lifts your multiplier — but a single bomb ends the round.</>}
      steps={[
        <>Set your bet and how many <span style={{ color: '#fda4af' }}>bombs</span> to hide (1–24).</>,
        <>Tap cells to uncover <span style={{ color: '#67e8f9' }}>gems</span> — each one raises your multiplier.</>,
        <>Cash out any time after the first gem to bank <span className="arc-mono">bet × multiplier</span>.</>,
      ]}
      graphic={<MinesGraphic />}
      graphicLabel="A board mid-round"
      payouts={[
        { label: '1 bomb', sub: 'safest', pays: 'gentle' },
        { label: '3 bombs', sub: 'balanced', pays: 'steeper' },
        { label: '5 bombs', sub: 'spicy', pays: 'fast' },
        { label: '10 bombs', sub: 'risky', pays: 'big jumps' },
        { label: '24 bombs', sub: 'one safe cell', pays: '≈24×' },
      ]}
      payoutsLabel="Risk — bomb count"
      footer={<>The multiplier ladder steepens with more bombs. The board is sealed behind a committed hash before you play, so it can&apos;t shift mid-round — open Verify to re-derive it. Played in chips.</>}
    />
  );
}
