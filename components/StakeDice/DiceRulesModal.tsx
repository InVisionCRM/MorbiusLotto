'use client';

import { ArcadeRulesModal, DEEP_SEA } from '@/components/arcade2/ArcadeRulesModal';
import { Dices } from 'lucide-react';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

function DiceGraphic() {
  return (
    <div>
      <div
        className="arules-glow relative h-9 rounded-lg overflow-hidden mb-2"
        style={{ background: '#0b1a26', border: '1px solid rgba(34,211,238,0.14)' }}
      >
        <div className="absolute inset-y-0 left-0" style={{ width: '50%', background: 'rgba(34,211,238,0.16)', borderRight: '2px solid #22D3EE' }} />
        <div className="absolute inset-y-[-3px] w-0.5" style={{ left: '50%', background: '#67e8f9' }} />
        <div
          className="arules-sweep absolute top-1/2 w-[18px] h-[18px] rounded-full"
          style={{ marginTop: '-9px', background: '#F59E0B', boxShadow: '0 0 12px -2px #F59E0B' }}
        />
        <span className="arc-mono absolute left-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: '#67e8f9' }}>WIN</span>
        <span className="arc-mono absolute right-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: '#64748b' }}>LOSE</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="arc-mono text-[11px]" style={{ color: '#94a3b8' }}>roll under <span style={{ color: '#67e8f9' }}>50.00</span> · win 50%</span>
        <span className="arc-mono text-[15px] font-bold" style={{ color: '#FCD34D' }}>1.98×</span>
      </div>
    </div>
  );
}

export function DiceRulesModal({ open, onOpenChange }: Props) {
  return (
    <ArcadeRulesModal
      open={open}
      onOpenChange={onOpenChange}
      theme={DEEP_SEA}
      game="Dice"
      icon={<Dices className="w-5 h-5" style={{ color: '#22D3EE' }} />}
      intro={<>Pick a target, then roll under it to win. The smaller your target, the rarer the win — and the bigger the payout.</>}
      steps={[
        <>Set your bet, then drag the <span style={{ color: '#67e8f9' }}>target</span> (or tap a 25 / 50 / 75 preset).</>,
        <>Roll — the server draws <span className="arc-mono">0.00–99.99</span>; you win if it lands <span style={{ color: '#67e8f9' }}>under</span> your target.</>,
        <>Your win chance equals your target, so a lower target pays more.</>,
      ]}
      graphic={<DiceGraphic />}
      graphicLabel="Roll-under target"
      payouts={[
        { label: 'Under 25', sub: 'win 25%', pays: '≈3.96×' },
        { label: 'Under 50', sub: 'win 50%', pays: '≈1.98×' },
        { label: 'Under 75', sub: 'win 75%', pays: '≈1.32×' },
        { label: 'Under 90', sub: 'win 90%', pays: '≈1.10×' },
        { label: 'Under 2', sub: 'win 2%', pays: '≈49×' },
      ]}
      payoutsLabel="Target → payout"
      footer={<>Payout ≈ 99 ÷ win-chance%, so the house keeps a small edge each roll. Every roll re-derives from a committed server seed + your client seed — open Verify to check. Played in chips.</>}
    />
  );
}
