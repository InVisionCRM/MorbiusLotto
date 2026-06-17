'use client';

import { ArcadeRulesModal, DEEP_SEA } from '@/components/arcade2/ArcadeRulesModal';
import { Layers } from 'lucide-react';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

/** A small face-up card pip for the deal graphic. */
function Pip({ glow }: { glow?: boolean }) {
  return (
    <span
      className="inline-block rounded"
      style={{
        width: 18,
        height: 26,
        background: '#f2efe6',
        boxShadow: glow ? '0 0 0 2px #22D3EE, 0 0 12px -2px #22D3EE' : 'inset 0 0 0 1px rgba(0,0,0,0.25)',
      }}
    />
  );
}

/** The joker cut face-up, then the two alternating piles — Andar matches first. */
function AndarBaharGraphic() {
  return (
    <div>
      <div className="flex items-center justify-center gap-3 py-1">
        <div className="text-center">
          <div className="arc-display text-[10px] uppercase tracking-[0.18em] mb-1" style={{ color: '#94a3b8' }}>
            Joker
          </div>
          <div
            className="inline-flex flex-col items-center justify-center rounded-lg"
            style={{ width: 40, height: 56, background: '#f2efe6', color: '#1f2937', boxShadow: '0 0 0 2px #f59e0b' }}
          >
            <span className="text-[16px] font-bold leading-none">7</span>
            <span className="text-[18px] leading-none">♠</span>
          </div>
        </div>
        <span className="arc-mono text-[13px]" style={{ color: '#64748b' }}>→</span>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <span className="arc-display text-[9px] uppercase tracking-wide w-12" style={{ color: '#67e8f9' }}>Andar</span>
            <Pip /><Pip /><Pip glow />
          </div>
          <div className="flex items-center gap-1">
            <span className="arc-display text-[9px] uppercase tracking-wide w-12" style={{ color: '#fbd36b' }}>Bahar</span>
            <Pip /><Pip />
          </div>
        </div>
      </div>
      <div className="text-center arc-mono text-[11px]" style={{ color: '#94a3b8' }}>
        First side to match the joker’s rank — <span style={{ color: '#67e8f9' }}>Andar wins</span>
      </div>
    </div>
  );
}

export function AndarBaharRulesModal({ open, onOpenChange }: Props) {
  return (
    <ArcadeRulesModal
      open={open}
      onOpenChange={onOpenChange}
      theme={DEEP_SEA}
      game="Andar Bahar"
      icon={<Layers className="w-5 h-5" style={{ color: '#22D3EE' }} />}
      intro={<>A pure-chance Indian classic. A single joker is cut face-up, then cards are dealt one at a time onto two piles — Andar and Bahar — until one matches the joker’s rank. Pick the side you think matches first.</>}
      steps={[
        <>Set your bet, then pick a side — <span style={{ color: '#67e8f9' }}>Andar</span> or <span style={{ color: '#fbd36b' }}>Bahar</span>.</>,
        <>Deal — the joker is cut, then cards alternate onto Andar (first) and Bahar.</>,
        <>The first pile to land a card matching the joker’s <span style={{ color: '#67e8f9' }}>rank</span> wins. If it’s your side, you’re paid.</>,
      ]}
      graphic={<AndarBaharGraphic />}
      graphicLabel="The deal"
      payouts={[
        { label: 'Andar', sub: 'deals first', pays: '0.9:1' },
        { label: 'Bahar', sub: 'even money', pays: '1:1' },
      ]}
      payoutsLabel="Payouts"
      footer={<>Only the card rank matters; suits are ignored. Each round’s deck is shuffled from a committed server seed + your client seed — open Verify to re-derive the whole deal yourself. Played in MORBIUS.</>}
    />
  );
}
