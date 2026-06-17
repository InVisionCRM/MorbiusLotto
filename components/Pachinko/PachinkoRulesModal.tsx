'use client';

import { ArcadeRulesModal, DEEP_SEA } from '@/components/arcade2/ArcadeRulesModal';
import { CircleDot } from 'lucide-react';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

function PachinkoGraphic() {
  // A tiny triangular pin field with nine pockets; the center gate glows amber.
  const rows = [3, 4, 5, 6];
  return (
    <div>
      <div
        className="arules-glow relative h-20 rounded-lg overflow-hidden mb-2"
        style={{ background: '#0b1a26', border: '1px solid rgba(34,211,238,0.14)' }}
      >
        {/* falling ball */}
        <div
          className="arules-sweep absolute top-1 w-[10px] h-[10px] rounded-full"
          style={{ left: '50%', marginLeft: '-5px', background: '#7be9fb', boxShadow: '0 0 10px -1px #22D3EE' }}
        />
        {/* pins */}
        {rows.map((count, ri) =>
          Array.from({ length: count }).map((_, ci) => {
            const spacing = 16;
            const x = 50 - ((count - 1) * spacing) / 2 / 1.2 + (ci * spacing) / 1.2;
            return (
              <span
                key={`${ri}-${ci}`}
                className="absolute rounded-full"
                style={{
                  left: `calc(${x}% )`,
                  top: `${20 + ri * 11}px`,
                  width: '3px',
                  height: '3px',
                  background: 'rgba(125,233,251,0.5)',
                }}
              />
            );
          }),
        )}
        {/* pockets */}
        <div className="absolute bottom-1 left-1 right-1 flex gap-[2px]">
          {Array.from({ length: 9 }).map((_, i) => (
            <span
              key={i}
              className="flex-1 rounded-[3px]"
              style={{
                height: '12px',
                background: i === 4 ? 'rgba(245,158,11,0.22)' : i <= 1 || i >= 7 ? 'rgba(34,211,238,0.18)' : 'rgba(148,163,184,0.08)',
                boxShadow: i === 4 ? 'inset 0 0 0 1px rgba(245,158,11,0.6)' : 'inset 0 0 0 1px rgba(34,211,238,0.18)',
              }}
            />
          ))}
        </div>
      </div>
      <div className="flex justify-between items-center">
        <span className="arc-mono text-[11px]" style={{ color: '#94a3b8' }}>
          nine pockets · <span style={{ color: '#FCD34D' }}>center gate</span> = jackpot
        </span>
        <span className="arc-mono text-[15px] font-bold" style={{ color: '#FCD34D' }}>up to 30×</span>
      </div>
    </div>
  );
}

export function PachinkoRulesModal({ open, onOpenChange }: Props) {
  return (
    <ArcadeRulesModal
      open={open}
      onOpenChange={onOpenChange}
      theme={DEEP_SEA}
      game="Pachinko"
      icon={<CircleDot className="w-5 h-5" style={{ color: '#22D3EE' }} />}
      intro={<>Drop a ball through the pins into one of nine pockets. Outer pockets pay the most, the near-center ones least, and the rare center gate is the jackpot. Pick a risk level, then drop — there are no decisions after that.</>}
      steps={[
        <>Set your bet and pick a <span style={{ color: '#67e8f9' }}>risk level</span> — Low, Med or High reshape the pocket payouts.</>,
        <>Drop the ball — the server has already fixed the landing pocket; the bounce just reveals it.</>,
        <>Land in a paying pocket to win; thread the <span style={{ color: '#67e8f9' }}>center gate</span> for the jackpot.</>,
      ]}
      graphic={<PachinkoGraphic />}
      graphicLabel="Pin field"
      payouts={[
        { label: 'Low risk', sub: 'flat & steady', pays: 'jackpot ~5×' },
        { label: 'Med risk', sub: 'punchier outers', pays: 'jackpot 13×' },
        { label: 'High risk', sub: 'big swings', pays: 'jackpot 30×' },
      ]}
      payoutsLabel="Risk → jackpot"
      footer={<>Every risk level keeps the same ~96% long-run return — only the swings differ. Each drop re-derives from a committed server seed + your client seed — open Verify to check. Played in chips.</>}
    />
  );
}
