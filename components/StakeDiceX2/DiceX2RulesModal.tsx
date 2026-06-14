'use client';

import { ArcadeRulesModal, DEEP_SEA } from '@/components/arcade2/ArcadeRulesModal';
import { Dices } from 'lucide-react';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

function DiceX2Graphic() {
  return (
    <div>
      <div
        className="arules-glow relative h-9 rounded-lg overflow-hidden mb-2"
        style={{ background: '#0b1a26', border: '1px solid rgba(34,211,238,0.14)' }}
      >
        {/* Win band sits in the middle (25–75); outside is a loss. */}
        <div
          className="absolute inset-y-0"
          style={{ left: '25%', width: '50%', background: 'rgba(34,211,238,0.16)', borderLeft: '2px solid #22D3EE', borderRight: '2px solid #22D3EE' }}
        />
        <div
          className="arules-sweep absolute top-1/2 w-[18px] h-[18px] rounded-full"
          style={{ marginTop: '-9px', background: '#F59E0B', boxShadow: '0 0 12px -2px #F59E0B' }}
        />
        <span className="arc-mono absolute left-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: '#64748b' }}>LOSE</span>
        <span className="arc-mono absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px]" style={{ color: '#67e8f9' }}>WIN</span>
        <span className="arc-mono absolute right-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: '#64748b' }}>LOSE</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="arc-mono text-[11px]" style={{ color: '#94a3b8' }}>band <span style={{ color: '#67e8f9' }}>25.00 – 75.00</span> · win 50%</span>
        <span className="arc-mono text-[15px] font-bold" style={{ color: '#FCD34D' }}>1.98×</span>
      </div>
    </div>
  );
}

export function DiceX2RulesModal({ open, onOpenChange }: Props) {
  return (
    <ArcadeRulesModal
      open={open}
      onOpenChange={onOpenChange}
      theme={DEEP_SEA}
      game="Dice x2"
      icon={<Dices className="w-5 h-5" style={{ color: '#22D3EE' }} />}
      intro={<>Drag two handles to set a band, then roll inside it to win. The narrower your band, the rarer the win — and the bigger the payout. Where you slide the band doesn’t change the odds, only how wide it is.</>}
      steps={[
        <>Set your bet, then drag the two <span style={{ color: '#67e8f9' }}>band handles</span> (or tap a 25 / 50 / 75 width preset).</>,
        <>Roll — the server draws <span className="arc-mono">0.00–99.99</span>; you win if it lands <span style={{ color: '#67e8f9' }}>inside</span> your band.</>,
        <>Your win chance equals the band width, so a narrower band pays more.</>,
      ]}
      graphic={<DiceX2Graphic />}
      graphicLabel="Win band"
      payouts={[
        { label: '2-wide band', sub: 'win 2%', pays: '≈49×' },
        { label: '10-wide band', sub: 'win 10%', pays: '≈9.9×' },
        { label: '25-wide band', sub: 'win 25%', pays: '≈3.96×' },
        { label: '50-wide band', sub: 'win 50%', pays: '≈1.98×' },
        { label: '75-wide band', sub: 'win 75%', pays: '≈1.32×' },
      ]}
      payoutsLabel="Band width → payout"
      footer={<>Payout ≈ 99 ÷ win-chance%, so the house keeps a small edge each roll. Every roll re-derives from a committed server seed + your client seed — open Verify to check. Played in chips.</>}
    />
  );
}
