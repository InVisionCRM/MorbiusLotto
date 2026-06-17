'use client';

import { ArcadeRulesModal, DEEP_SEA } from '@/components/arcade2/ArcadeRulesModal';
import { Disc3 } from 'lucide-react';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

function RouletteGraphic() {
  return (
    <div>
      <div className="flex items-center justify-center" style={{ height: '104px' }}>
        <div className="relative" style={{ width: '96px', height: '96px' }}>
          <div
            className="arules-spin absolute inset-0 rounded-full"
            style={{
              background: 'repeating-conic-gradient(#B91C1C 0 30deg, #27272A 30deg 60deg)',
              boxShadow: 'inset 0 0 0 3px rgba(34,211,238,0.4), 0 0 22px -6px rgba(34,211,238,0.6)',
            }}
          />
          <div
            className="arules-spin absolute inset-0 rounded-full"
            style={{ background: 'conic-gradient(#15803D 0 13deg, transparent 13deg 360deg)' }}
          />
          <div className="absolute rounded-full" style={{ inset: '34%', background: '#050E16', border: '1px solid rgba(34,211,238,0.4)' }} />
          <div className="absolute w-2 h-2 rounded-full" style={{ top: '5px', left: 'calc(50% - 4px)', background: '#fff', boxShadow: '0 0 6px #fff' }} />
          <div
            className="absolute"
            style={{ top: '-4px', left: 'calc(50% - 5px)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '7px solid #FBBF24' }}
          />
        </div>
      </div>
      <div className="text-center arc-mono text-[11px] mt-1" style={{ color: '#94a3b8' }}>European · single zero · 37 pockets</div>
    </div>
  );
}

export function RouletteRulesModal({ open, onOpenChange }: Props) {
  return (
    <ArcadeRulesModal
      open={open}
      onOpenChange={onOpenChange}
      theme={DEEP_SEA}
      game="Roulette"
      icon={<Disc3 className="w-5 h-5" style={{ color: '#22D3EE' }} />}
      intro={<>Stack MORBIUS anywhere on the felt, spin the single-zero wheel, and get paid by how tightly you bet — one number pays the most, red/black the least.</>}
      steps={[
        <>Pick a <span style={{ color: '#22D3EE' }}>chip</span> value (5 / 25 / 100 / 500).</>,
        <>Click felt zones to place bets (Undo, Clear and Rebet help).</>,
        <>Hit <span style={{ color: '#22D3EE' }}>Spin</span> — wins pay to your balance the instant the ball settles.</>,
      ]}
      graphic={<RouletteGraphic />}
      graphicLabel="The wheel"
      payouts={[
        { label: 'Straight', sub: 'one number', pays: '35 : 1' },
        { label: 'Split', sub: 'two numbers', pays: '17 : 1' },
        { label: 'Street', sub: 'row of 3', pays: '11 : 1' },
        { label: 'Corner', sub: 'four numbers', pays: '8 : 1' },
        { label: 'Dozen / column', sub: 'twelve numbers', pays: '2 : 1' },
        { label: 'Red · even · 1–18', sub: 'even money', pays: '1 : 1' },
      ]}
      payoutsLabel="Bets & payouts"
      footer={<>European single-zero wheel — house edge 2.70%. A spun <span className="arc-mono">0</span> loses the even-money, dozen and column bets. The pocket is provably fair: re-derive any spin from Verify. Played in MORBIUS.</>}
    />
  );
}
