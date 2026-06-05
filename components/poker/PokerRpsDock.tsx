'use client';

import React, { memo } from 'react';
import { RPS_CHOICES, RPS_EMOJI, RPS_LABEL, type RpsChoice } from '@/lib/poker-rps';
import type { RpsMatchView } from '@/app/poker/[tableId]/use-poker-rps';

/**
 * Rock-Paper-Scissors dock — a compact floating panel for the two duelists.
 * Just-for-fun: a running W–L scoreboard for bragging rights, three pick
 * buttons, and a simultaneous result. No stakes, ever. Styled in the table's
 * muted-slate / single-cyan-accent idiom (gold is reserved for chip amounts,
 * of which RPS has none). The 🪨/📄/✂️ toss over the seats is rendered by
 * PokerTable from `revealFlights`; this panel is the controls + scoreboard.
 */

export interface PokerRpsDockProps {
  match: RpsMatchView;
  onPick: (choice: RpsChoice) => void;
  onPlayAgain: () => void;
  onClose: () => void;
}

const OUTCOME_LABEL: Record<'win' | 'lose' | 'draw', string> = {
  win: 'You win!',
  lose: 'You lose',
  draw: 'Draw',
};

export function PokerRpsDock({ match, onPick, onPlayAgain, onClose }: PokerRpsDockProps) {
  const opp = match.oppName?.trim() || `Seat ${match.oppSeatIndex + 1}`;
  const locked = match.myPick != null;
  const showResult = match.phase === 'result' && match.result != null;

  return (
    <>
      <PrdStyles />
      <div className="prd-dock" role="dialog" aria-label="Rock Paper Scissors">
        <div className="prd-head">
          <span className="prd-title"><span className="prd-dot" /> Rock · Paper · Scissors</span>
          <button type="button" className="prd-close" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        {/* Scoreboard — W–L for bragging rights only. */}
        <div className="prd-score">
          <span className="prd-side me">
            <span className="prd-who">You</span>
            <span className="prd-num">{match.myScore}</span>
          </span>
          <span className="prd-dash">–</span>
          <span className="prd-side">
            <span className="prd-num">{match.oppScore}</span>
            <span className="prd-who" title={opp}>{opp}</span>
          </span>
        </div>

        {showResult && match.result ? (
          <>
            <div className="prd-reveal">
              <span className={`prd-pick ${match.result.outcome === 'win' ? 'won' : match.result.outcome === 'lose' ? 'lost' : ''}`}>
                <span className="prd-emoji">{RPS_EMOJI[match.result.myChoice]}</span>
                <span className="prd-plabel">You</span>
              </span>
              <span className="prd-vs">vs</span>
              <span className={`prd-pick ${match.result.outcome === 'lose' ? 'won' : match.result.outcome === 'win' ? 'lost' : ''}`}>
                <span className="prd-emoji">{RPS_EMOJI[match.result.oppChoice]}</span>
                <span className="prd-plabel" title={opp}>{opp}</span>
              </span>
            </div>
            <div className={`prd-outcome ${match.result.outcome}`}>{OUTCOME_LABEL[match.result.outcome]}</div>
            <div className="prd-actions">
              <button type="button" className="prd-btn primary" onClick={onPlayAgain}>Play again</button>
              <button type="button" className="prd-btn" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            <div className="prd-picks">
              {RPS_CHOICES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`prd-choice${match.myPick === c ? ' picked' : ''}`}
                  disabled={locked}
                  onClick={() => onPick(c)}
                  aria-label={RPS_LABEL[c]}
                >
                  <span className="prd-emoji">{RPS_EMOJI[c]}</span>
                  <span className="prd-clabel">{RPS_LABEL[c]}</span>
                </button>
              ))}
            </div>
            <div className="prd-status">
              {locked
                ? <>Waiting for {opp}…{match.oppPicked && <span className="prd-ready"> · they’re ready</span>}</>
                : match.oppPicked
                  ? <><span className="prd-ready">{opp} locked in</span> — your move</>
                  : 'Pick your throw'}
            </div>
          </>
        )}
      </div>
    </>
  );
}

const PrdStyles = memo(function PrdStyles() {
  return (
    <style>{`
    .prd-dock {
      position: fixed; left: 50%; transform: translateX(-50%);
      bottom: calc(12px + env(safe-area-inset-bottom,0px)); z-index: 46;
      width: min(360px, calc(100vw - 20px)); display: flex; flex-direction: column; gap: 9px;
      padding: 10px 12px 12px; border-radius: 16px;
      background: linear-gradient(to top, rgba(42,44,50,0.96), rgba(34,36,42,0.93));
      -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
      border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 12px 34px rgba(0,0,0,0.5);
      animation: prdUp .34s cubic-bezier(.2,.8,.2,1) both;
    }
    @keyframes prdUp { from { transform: translate(-50%, 115%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
    .prd-head { display:flex; align-items:center; }
    .prd-title { display:inline-flex; align-items:center; gap:6px; flex:1 1 auto; font-size:9.5px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; color:rgba(255,255,255,0.5); }
    .prd-dot { width:6px; height:6px; border-radius:50%; background:#22d3ee; box-shadow:0 0 7px #22d3ee; }
    .prd-close { width:24px; height:24px; border-radius:8px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.65); font-size:11px; cursor:pointer; }
    .prd-close:hover { background:rgba(255,255,255,0.1); }

    .prd-score { display:flex; align-items:center; justify-content:center; gap:12px; padding:4px 0 2px; }
    .prd-side { display:flex; align-items:center; gap:7px; min-width:0; }
    .prd-side.me .prd-who { color:rgba(34,211,238,0.9); }
    .prd-who { font-size:11px; font-weight:700; color:rgba(255,255,255,0.55); max-width:96px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .prd-num { font-size:22px; font-weight:800; font-variant-numeric:tabular-nums; color:#e6ebf2; line-height:1; }
    .prd-dash { font-size:16px; font-weight:800; color:rgba(255,255,255,0.3); }

    .prd-picks { display:flex; gap:8px; }
    .prd-choice {
      flex:1 1 0; display:flex; flex-direction:column; align-items:center; gap:3px; padding:10px 4px 8px;
      border-radius:12px; cursor:pointer; transition:all .14s ease;
      background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);
    }
    .prd-choice:hover:not(:disabled) { background:rgba(34,211,238,0.1); border-color:rgba(34,211,238,0.4); transform:translateY(-1px); }
    .prd-choice:disabled { cursor:default; opacity:.45; }
    .prd-choice.picked { background:rgba(34,211,238,0.16); border-color:rgba(34,211,238,0.6); opacity:1; box-shadow:0 0 0 1px rgba(34,211,238,0.35), 0 0 16px -6px rgba(34,211,238,0.7); }
    .prd-emoji { font-size:26px; line-height:1; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5)); }
    .prd-clabel { font-size:9px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:rgba(255,255,255,0.5); }
    .prd-choice.picked .prd-clabel { color:rgba(34,211,238,0.9); }

    .prd-status { text-align:center; font-size:10.5px; font-weight:600; color:rgba(255,255,255,0.55); min-height:14px; }
    .prd-ready { color:rgba(34,211,238,0.85); font-weight:700; }

    .prd-reveal { display:flex; align-items:center; justify-content:center; gap:14px; padding:4px 0 2px; }
    .prd-pick { display:flex; flex-direction:column; align-items:center; gap:3px; opacity:.7; }
    .prd-pick .prd-emoji { font-size:34px; animation: prdPop .34s cubic-bezier(.2,.8,.2,1) both; }
    .prd-pick.won { opacity:1; }
    .prd-pick.won .prd-emoji { filter:drop-shadow(0 0 9px rgba(34,211,238,0.65)); }
    .prd-pick.lost { opacity:.5; }
    .prd-pick.lost .prd-emoji { filter:grayscale(.55) brightness(.82); }
    @keyframes prdPop { from { transform:scale(.4); opacity:0; } to { transform:scale(1); opacity:1; } }
    .prd-plabel { font-size:9px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:rgba(255,255,255,0.45); max-width:96px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .prd-vs { font-size:10px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:rgba(255,255,255,0.3); }

    .prd-outcome { text-align:center; font-size:13px; font-weight:800; letter-spacing:.04em; }
    .prd-outcome.win { color:#5fd38a; }
    .prd-outcome.lose { color:#f08a8a; }
    .prd-outcome.draw { color:rgba(255,255,255,0.6); }

    .prd-actions { display:flex; gap:8px; }
    .prd-btn { flex:1 1 0; padding:9px 0; border-radius:11px; font-size:11px; font-weight:800; letter-spacing:.03em; cursor:pointer; transition:all .14s ease;
      background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.7); }
    .prd-btn:hover { background:rgba(255,255,255,0.1); }
    .prd-btn.primary { background:rgba(34,211,238,0.14); border-color:rgba(34,211,238,0.45); color:rgba(34,211,238,0.95); }
    .prd-btn.primary:hover { background:rgba(34,211,238,0.22); }
    `}</style>
  );
});
