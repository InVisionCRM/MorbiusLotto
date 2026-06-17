'use client';

import { ArcadeRulesModal, DEEP_SEA } from '@/components/arcade2/ArcadeRulesModal';
import { Swords } from 'lucide-react';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

/** A tiny Dragon-vs-Tiger duel: two face-up cards (K beats 7) flanking a VS. */
function DragonTigerGraphic() {
  return (
    <div>
      <div className="flex items-center justify-center gap-4 py-1">
        <div className="text-center">
          <div className="arc-display text-[10px] uppercase tracking-[0.18em] mb-1" style={{ color: '#7be9fb' }}>
            Dragon
          </div>
          <div
            className="inline-flex flex-col items-center justify-center rounded-lg"
            style={{ width: 46, height: 64, background: '#f2efe6', color: '#1f2937', boxShadow: '0 0 0 3px #22D3EE, 0 0 18px -4px #22D3EE' }}
          >
            <span className="text-[18px] font-bold leading-none">K</span>
            <span className="text-[20px] leading-none">♠</span>
          </div>
        </div>
        <span className="arc-display text-base font-bold tracking-widest" style={{ color: '#64748b' }}>VS</span>
        <div className="text-center">
          <div className="arc-display text-[10px] uppercase tracking-[0.18em] mb-1" style={{ color: '#fbd36b' }}>
            Tiger
          </div>
          <div
            className="inline-flex flex-col items-center justify-center rounded-lg"
            style={{ width: 46, height: 64, background: '#f2efe6', color: '#b3261e' }}
          >
            <span className="text-[18px] font-bold leading-none">7</span>
            <span className="text-[20px] leading-none">♥</span>
          </div>
        </div>
      </div>
      <div className="text-center arc-mono text-[11px]" style={{ color: '#94a3b8' }}>
        King beats Seven — <span style={{ color: '#67e8f9' }}>Dragon wins</span>
      </div>
    </div>
  );
}

export function DragonTigerRulesModal({ open, onOpenChange }: Props) {
  return (
    <ArcadeRulesModal
      open={open}
      onOpenChange={onOpenChange}
      theme={DEEP_SEA}
      game="Dragon Tiger"
      icon={<Swords className="w-5 h-5" style={{ color: '#22D3EE' }} />}
      intro={<>The fastest card game on the floor: one card to Dragon, one to Tiger, the higher rank wins. Ace is the lowest card and suits don’t matter — just pick the side you think comes out on top, or take a flier on the Tie.</>}
      steps={[
        <>Set your bet, then tap a side — <span style={{ color: '#67e8f9' }}>Dragon</span>, <span style={{ color: '#fbd36b' }}>Tiger</span>, or <span style={{ color: '#67e8f9' }}>Tie</span>.</>,
        <>Deal — one card lands on Dragon, one on Tiger. The <span style={{ color: '#67e8f9' }}>higher rank</span> wins (Ace low, K high).</>,
        <>Match your pick to the winning side and you’re paid. If both cards tie, the Tie bet pays big and side bets give back half.</>,
      ]}
      graphic={<DragonTigerGraphic />}
      graphicLabel="The duel"
      payouts={[
        { label: 'Dragon', sub: 'higher card wins', pays: '1:1' },
        { label: 'Tiger', sub: 'higher card wins', pays: '1:1' },
        { label: 'Tie', sub: 'same rank', pays: '11:1' },
        { label: 'On a tie', sub: 'Dragon / Tiger bets', pays: 'half back' },
      ]}
      payoutsLabel="Payouts"
      footer={<>Ace is the lowest card; suits never matter. Each round’s deck is shuffled from a committed server seed + your client seed — open Verify to re-derive both cards yourself. Played in MORBIUS.</>}
    />
  );
}
