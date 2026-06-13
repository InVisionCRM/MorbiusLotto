'use client';

// Craps rules — a stylish, self-contained reference graphic in the Deep-Sea Neon
// (arcade2) theme. An SVG flow of a round (come-out → point → win / seven-out)
// plus a payouts grid. Pure presentation; no game state.

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BookOpen } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PAYOUTS: { name: string; sub?: string; pays: string }[] = [
  { name: 'Pass line', sub: 'come-out / point', pays: '1 : 1' },
  { name: "Don't pass", sub: 'the dark side', pays: '1 : 1' },
  { name: 'Field', sub: '3·4·9·10·11', pays: '1 : 1' },
  { name: 'Field', sub: '2 & 12', pays: '2 : 1' },
  { name: 'Place 6 / 8', sub: '', pays: '7 : 6' },
  { name: 'Place 5 / 9', sub: '', pays: '7 : 5' },
  { name: 'Place 4 / 10', sub: '', pays: '9 : 5' },
  { name: 'Any 7', sub: 'one roll', pays: '4 : 1' },
  { name: 'Any craps', sub: '2 · 3 · 12', pays: '7 : 1' },
];

export function CrapsRulesModal({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="arcade2-scope max-w-3xl max-h-[88vh] overflow-y-auto border-cyan-950 bg-[#050E16] text-slate-200">
        <DialogHeader>
          <DialogTitle className="arc-display text-xl uppercase tracking-wider text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-cyan-400" />
            How to play craps
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-slate-400 leading-relaxed -mt-1">
          Bet the <span className="text-cyan-300">Pass Line</span>, throw the dice, then chase
          your <span className="text-cyan-300">point</span> — roll it again before a 7.
        </p>

        {/* ─── Round flow graphic ─── */}
        <div className="arc-panel rounded-xl p-3 sm:p-4 mt-1">
          <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500 mb-2 arc-display">The round</div>
          <svg viewBox="0 0 680 400" className="w-full h-auto" role="img" aria-label="Flow of a craps round: come-out roll resolves to a win on 7 or 11, a loss on 2, 3 or 12, or sets a point on 4, 5, 6, 8, 9 or 10. In the point phase you win by hitting the point again and lose by rolling a 7.">
            <defs>
              <marker id="cr-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
              </marker>
            </defs>

            {/* connectors — come-out → three outcomes */}
            <line x1="322" y1="72" x2="150" y2="113" stroke="#F59E0B" strokeWidth="1.5" strokeOpacity="0.65" markerEnd="url(#cr-arrow)" />
            <line x1="340" y1="72" x2="340" y2="113" stroke="#22D3EE" strokeWidth="1.5" strokeOpacity="0.65" markerEnd="url(#cr-arrow)" />
            <line x1="358" y1="72" x2="530" y2="113" stroke="#FB3B5C" strokeWidth="1.5" strokeOpacity="0.6" markerEnd="url(#cr-arrow)" />
            {/* point → point phase */}
            <line x1="340" y1="182" x2="340" y2="221" stroke="#22D3EE" strokeWidth="1.5" strokeOpacity="0.65" markerEnd="url(#cr-arrow)" />
            {/* point phase → two outcomes */}
            <line x1="322" y1="282" x2="195" y2="323" stroke="#F59E0B" strokeWidth="1.5" strokeOpacity="0.65" markerEnd="url(#cr-arrow)" />
            <line x1="358" y1="282" x2="485" y2="323" stroke="#FB3B5C" strokeWidth="1.5" strokeOpacity="0.6" markerEnd="url(#cr-arrow)" />

            {/* COME-OUT node */}
            <rect x="240" y="14" width="200" height="58" rx="14" fill="#0b1a26" stroke="#22D3EE" strokeWidth="1.5" />
            <text x="340" y="40" textAnchor="middle" className="arc-display" fill="#67E8F9" fontSize="15" letterSpacing="1">COME-OUT ROLL</text>
            <text x="340" y="58" textAnchor="middle" fill="#64748b" fontSize="10">your first throw</text>

            {/* WIN pill (7/11) */}
            <rect x="14" y="116" width="206" height="66" rx="12" fill="#F59E0B" fillOpacity="0.10" stroke="#F59E0B" strokeOpacity="0.7" strokeWidth="1.5" />
            <text x="117" y="149" textAnchor="middle" className="arc-mono" fill="#FCD34D" fontSize="18" fontWeight="700">7 · 11</text>
            <text x="117" y="169" textAnchor="middle" fill="#F59E0B" fontSize="11">Pass line wins</text>

            {/* POINT pill */}
            <rect x="237" y="116" width="206" height="66" rx="12" fill="#22D3EE" fillOpacity="0.08" stroke="#22D3EE" strokeOpacity="0.6" strokeWidth="1.5" />
            <text x="340" y="147" textAnchor="middle" className="arc-mono" fill="#67E8F9" fontSize="15" fontWeight="700">4 5 6 8 9 10</text>
            <text x="340" y="167" textAnchor="middle" fill="#5fd3e6" fontSize="11">a point is set</text>

            {/* CRAPS pill */}
            <rect x="460" y="116" width="206" height="66" rx="12" fill="#FB3B5C" fillOpacity="0.10" stroke="#FB3B5C" strokeOpacity="0.6" strokeWidth="1.5" />
            <text x="563" y="149" textAnchor="middle" className="arc-mono" fill="#FDA4AF" fontSize="18" fontWeight="700">2 · 3 · 12</text>
            <text x="563" y="169" textAnchor="middle" fill="#FB7185" fontSize="11">craps — lose</text>

            {/* POINT PHASE node */}
            <rect x="230" y="224" width="220" height="58" rx="14" fill="#0b1a26" stroke="#22D3EE" strokeWidth="1.5" />
            <text x="340" y="250" textAnchor="middle" className="arc-display" fill="#67E8F9" fontSize="15" letterSpacing="1">POINT PHASE</text>
            <text x="340" y="268" textAnchor="middle" fill="#64748b" fontSize="10">roll again until 7 or the point ↺</text>

            {/* WIN pill (point) */}
            <rect x="40" y="326" width="272" height="66" rx="12" fill="#F59E0B" fillOpacity="0.10" stroke="#F59E0B" strokeOpacity="0.7" strokeWidth="1.5" />
            <text x="176" y="357" textAnchor="middle" className="arc-display" fill="#FCD34D" fontSize="15">Hit the point</text>
            <text x="176" y="377" textAnchor="middle" fill="#F59E0B" fontSize="11">Pass line wins</text>

            {/* LOSE pill (seven-out) */}
            <rect x="368" y="326" width="272" height="66" rx="12" fill="#FB3B5C" fillOpacity="0.10" stroke="#FB3B5C" strokeOpacity="0.6" strokeWidth="1.5" />
            <text x="504" y="356" textAnchor="middle" className="arc-mono" fill="#FDA4AF" fontSize="18" fontWeight="700">Roll a 7</text>
            <text x="504" y="377" textAnchor="middle" fill="#FB7185" fontSize="11">seven-out — lose</text>
          </svg>
        </div>

        {/* ─── Payouts ─── */}
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500 mb-2 arc-display">Payouts</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PAYOUTS.map((p, i) => (
              <div key={i} className="arc-panel rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm text-slate-200 truncate">{p.name}</div>
                  {p.sub && <div className="text-[10px] text-slate-500 truncate">{p.sub}</div>}
                </div>
                <div className="arc-mono text-sm font-bold text-amber-300 shrink-0">{p.pays}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed mt-3 border-t border-cyan-950 pt-3">
          Every roll is derived from a server seed committed before you play, mixed with your own
          client seed — open <span className="text-cyan-300">Verify</span> to re-derive any roll and
          confirm nothing moved. Played entirely in chips.
        </p>
      </DialogContent>
    </Dialog>
  );
}
