'use client';

import { ArcadeRulesModal, CRASH_GREEN } from '@/components/arcade2/ArcadeRulesModal';
import { Rocket } from 'lucide-react';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

function CrashGraphic() {
  return (
    <div className="relative" style={{ height: '100px' }}>
      <svg viewBox="0 0 240 92" className="w-full h-full" preserveAspectRatio="none">
        <line x1="8" y1="38" x2="232" y2="38" stroke="#00ffa3" strokeOpacity="0.22" strokeDasharray="3 4" />
        <path className="arules-dash" d="M8 84 C 96 82 152 56 226 12" fill="none" stroke="#00ffa3" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <Rocket className="absolute w-5 h-5" style={{ right: '2px', top: '2px', color: '#00ffa3' }} />
      <span className="arules-pulse arc-mono absolute text-[15px] font-bold" style={{ left: '8px', bottom: '4px', color: '#ff9d00' }}>× 4.20</span>
      <span className="arc-mono absolute text-[10px]" style={{ right: '10px', top: '26px', color: '#00ffa3' }}>auto-cashout</span>
    </div>
  );
}

export function CrashRulesModal({ open, onOpenChange }: Props) {
  return (
    <ArcadeRulesModal
      open={open}
      onOpenChange={onOpenChange}
      theme={CRASH_GREEN}
      game="Crash"
      icon={<Rocket className="w-5 h-5" style={{ color: '#00ffa3' }} />}
      intro={<>The rocket launches and the multiplier climbs. Cash out before it crashes to keep your winnings — leave it too long and the bet is gone.</>}
      steps={[
        <>Set your bet and (optionally) an <span style={{ color: '#00ffa3' }}>auto-cashout</span> target.</>,
        <>Launch — the multiplier rises from <span className="arc-mono">1.00×</span> along the same curve for everyone.</>,
        <>Tap <span style={{ color: '#00ffa3' }}>Cash out</span> mid-flight to bank <span className="arc-mono">bet × multiplier</span>; a crash before that loses the bet.</>,
      ]}
      graphic={<CrashGraphic />}
      graphicLabel="The curve"
      payouts={[
        { label: 'House edge', sub: '99% RTP', pays: '1%' },
        { label: 'Max cashout', sub: 'auto-banks', pays: '100×' },
        { label: 'Floor', sub: 'instant bust', pays: '1.00×' },
        { label: 'Auto-cashout', sub: 'fires for you', pays: 'on' },
      ]}
      payoutsLabel="The numbers"
      footer={<>The crash point is <span className="arc-mono">0.99 / r</span> from a committed server seed, your client seed and a nonce — 99% returns to players over time. Auto-cashout also protects you if you disconnect mid-flight. Every round can be re-derived from Verify. Played in MORBIUS.</>}
    />
  );
}
