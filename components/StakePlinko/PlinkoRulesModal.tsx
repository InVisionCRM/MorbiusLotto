'use client';

import { ArcadeRulesModal, DEEP_SEA } from '@/components/arcade2/ArcadeRulesModal';
import { Triangle } from 'lucide-react';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

const BUCKETS = ['5.6×', '2×', '1.1×', '0.5×', '1.1×', '2×', '5.6×'];

function PlinkoGraphic() {
  return (
    <div>
      <div className="relative mx-auto" style={{ maxWidth: '240px', height: '96px' }}>
        {/* peg pyramid */}
        {[3, 4, 5, 6].map((count, row) => (
          <div key={row} className="absolute left-1/2 -translate-x-1/2 flex gap-3" style={{ top: `${row * 20}px` }}>
            {Array.from({ length: count }, (_, i) => (
              <span key={i} className="block w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(34,211,238,0.5)' }} />
            ))}
          </div>
        ))}
        {/* dropping ball */}
        <div
          className="arules-fall absolute w-2.5 h-2.5 rounded-full"
          style={{ left: 'calc(50% - 5px)', background: '#F59E0B', boxShadow: '0 0 10px -1px #F59E0B' }}
        />
      </div>
      <div className="grid grid-cols-7 gap-1 mt-1 max-w-[240px] mx-auto">
        {BUCKETS.map((b, i) => {
          const edge = i === 0 || i === BUCKETS.length - 1;
          const mid = i === 3;
          return (
            <div
              key={i}
              className="arc-mono text-center rounded text-[10px] font-bold py-1"
              style={{
                background: edge ? 'rgba(245,158,11,0.14)' : mid ? 'rgba(100,116,139,0.12)' : 'rgba(34,211,238,0.10)',
                color: edge ? '#FCD34D' : mid ? '#64748b' : '#67e8f9',
                border: `1px solid ${edge ? 'rgba(245,158,11,0.4)' : 'rgba(34,211,238,0.18)'}`,
              }}
            >
              {b}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PlinkoRulesModal({ open, onOpenChange }: Props) {
  return (
    <ArcadeRulesModal
      open={open}
      onOpenChange={onOpenChange}
      theme={DEEP_SEA}
      game="Plinko"
      icon={<Triangle className="w-5 h-5" style={{ color: '#22D3EE' }} />}
      intro={<>Drop a ball through 16 rows of pegs. Where it lands sets your multiplier — the far edges pay the most, the centre the least.</>}
      steps={[
        <>Set your bet per ball and choose a <span style={{ color: '#67e8f9' }}>risk</span> level.</>,
        <>Drop the ball — the server picks the bucket provably-fairly and the ball replays into it.</>,
        <>You&apos;re paid <span className="arc-mono">bet × the landing bucket</span> instantly.</>,
      ]}
      graphic={<PlinkoGraphic />}
      graphicLabel="16 rows → 17 buckets"
      payouts={[
        { label: 'Low risk', sub: 'gentle spread', pays: 'frequent' },
        { label: 'Medium', sub: 'balanced', pays: 'mixed' },
        { label: 'High risk', sub: 'edges only', pays: 'rare big' },
      ]}
      payoutsLabel="Risk levels"
      footer={<>Higher risk thins the middle and fattens the edge multipliers. The exact table comes from the server and every drop can be re-derived — open Verify to check. Played in chips.</>}
    />
  );
}
