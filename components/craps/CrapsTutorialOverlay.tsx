'use client';

// First-time-player walkthrough — fixed-position card above the table.
// Branches on lastResult.sum to explain natural / craps / point outcomes.
// Deep-Sea Neon (arcade2) styling to match keno2.

import { TutorialStep } from '@/hooks/use-craps-tutorial';
import { RollResult } from '@/lib/craps-types';

interface Props {
  step: TutorialStep;
  advance: () => void;
  stop: () => void;
  lastResult: RollResult | null;
  point: number | null;
}

export function CrapsTutorialOverlay({ step, advance, stop, lastResult, point }: Props) {
  if (step === 'OFF') return null;

  let title = '';
  let content = '';
  let showNext = false;
  let nextLabel = 'Next';

  switch (step) {
    case 'WELCOME':
      title = 'Welcome to the craps table';
      content = 'This walkthrough teaches the basics — placing chips and rolling the dice. Three minutes, then you\'re in.';
      showNext = true;
      break;
    case 'PASS_BET_PROMPT':
      title = 'The pass line';
      content = 'The heart of craps is the Pass Line. Drop a chip on PASS LINE at the bottom of the felt.';
      break;
    case 'COME_OUT_ROLL_PROMPT':
      title = 'The come out roll';
      content = 'Your first roll is the Come Out.\n\n7 or 11 — instant win on Pass.\n2, 3, or 12 — Pass loses.\nAnything else — that number becomes the Point.\n\nHit ROLL DICE when ready.';
      break;
    case 'COME_OUT_RESULT_EXPLAIN':
      title = 'Roll result';
      if (!lastResult) break;
      if (lastResult.sum === 7 || lastResult.sum === 11)
        content = `You rolled ${lastResult.sum} — a Natural. Pass Line wins. Next roll is another Come Out.`;
      else if (lastResult.sum === 2 || lastResult.sum === 3 || lastResult.sum === 12)
        content = `You rolled ${lastResult.sum} — Craps. Pass Line loses. Next roll is another Come Out.`;
      else
        content = `You rolled ${lastResult.sum}. That's your Point — the puck moves to ${lastResult.sum}.`;
      showNext = true;
      break;
    case 'POINT_EXPLAIN':
      title = 'The point phase';
      content = `Goal: roll ${point} again BEFORE rolling a 7.\n\nHit ${point} — Pass Line wins.\nHit 7 — seven-out, Pass loses, table clears.\nAnything else — keep rolling.`;
      showNext = true;
      break;
    case 'PLACE_BET_PROMPT':
      title = 'Place bets';
      content = 'While you chase the Point, you can bet specific numbers will hit. Drop a chip on any Place box (4, 5, 6, 8, 9, 10).';
      break;
    case 'POINT_ROLL_PROMPT':
      title = 'Roll for the point';
      content = `Time to throw. You want your Place bets to hit, and eventually ${point} before a 7.\n\nHit ROLL DICE.`;
      break;
    case 'POINT_ROLL_RESULT':
      title = 'Roll result';
      if (!lastResult) break;
      if (lastResult.sum === point)
        content = `You hit your Point (${point}). Pass Line wins. Back to Come Out.`;
      else if (lastResult.sum === 7)
        content = `You rolled 7 — seven-out. Pass and Place bets are cleared.`;
      else
        content = `You rolled ${lastResult.sum}. If you placed it, you won; otherwise it's a safe roll. In a real game you'd keep going until 7 or ${point} hits.`;
      showNext = true;
      nextLabel = 'Finish';
      break;
    case 'FINISHED':
      title = 'You\'re set';
      content = 'That\'s the core flow. Explore Field bets, Any 7, Any Craps on your own. Good luck.';
      showNext = true;
      nextLabel = 'Play';
      break;
  }

  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 w-11/12 max-w-md pointer-events-auto z-[99999]">
      <div className="bg-[#050E16]/95 backdrop-blur-md border border-cyan-500/50 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)] relative">
        <h2 className="arc-display text-2xl font-bold tracking-tight text-cyan-300 mb-4 drop-shadow-[0_0_12px_rgba(34,211,238,0.4)]">
          {title}
        </h2>
        <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
          {content}
        </p>

        <div className="mt-6 flex justify-between items-center gap-4 border-t border-cyan-950 pt-4">
          <button
            onClick={stop}
            className="text-xs font-semibold text-slate-500 uppercase tracking-widest hover:text-slate-200 transition-colors bg-transparent border-0 cursor-pointer"
          >
            Skip
          </button>
          {showNext ? (
            <button
              onClick={advance}
              className="arc-display px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-[#03121B] font-bold uppercase text-xs tracking-widest rounded-xl shadow-[0_0_22px_-6px_rgba(34,211,238,0.8)] transition-all hover:scale-105 active:scale-95 cursor-pointer border-0"
            >
              {nextLabel}
            </button>
          ) : (
            <div className="text-xs font-semibold text-cyan-300 animate-pulse uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
              Waiting for action…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
