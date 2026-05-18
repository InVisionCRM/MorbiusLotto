'use client';

import React from 'react';
import { MttFooter, MttStepCard } from '../MttFooter';
import { useMttCreator } from '../MttCreatorContext';

const STACK_PRESETS = [
  { value: 1500,  label: 'Short',     tagline: 'Fast, push-fold heavy' },
  { value: 5000,  label: 'Standard',  tagline: 'Balanced' },
  { value: 10000, label: 'Deep',      tagline: 'Lots of postflop play' },
  { value: 20000, label: 'Deeper',    tagline: 'Marathon — multi-hour fields' },
] as const;

export function MttStepStack() {
  const { values, setValues } = useMttCreator();
  const canContinue = values.startingStack >= 1000;

  return (
    <>
      <MttStepCard
        title="Choose the starting stack"
        subtitle="Every player starts with this many chips. Bigger stacks = more decisions per hand and a longer tournament."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STACK_PRESETS.map((p) => {
            const active = values.startingStack === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setValues({ startingStack: p.value })}
                className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors ${
                  active
                    ? 'border-cyan-500/60 bg-cyan-500/10'
                    : 'border-white/10 bg-black/30 hover:border-white/20 hover:bg-white/[0.04]'
                }`}
              >
                <div
                  className={`tabular-nums ${active ? 'text-cyan-300' : 'text-white'}`}
                  style={{
                    fontFamily: '"Mitr", sans-serif',
                    fontWeight: 700,
                    fontSize: 'clamp(20px, 2.5vw, 26px)',
                    lineHeight: 1,
                  }}
                >
                  {p.value.toLocaleString()}
                </div>
                <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">
                  {p.label}
                </div>
                <div className="text-[11px] text-slate-500">{p.tagline}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-6 rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3 text-[12px] leading-relaxed text-slate-400">
          The big blind at level 1 is{' '}
          <span className="font-mono tabular-nums text-cyan-300">50</span> chips, so a{' '}
          <span className="font-mono tabular-nums text-white">{values.startingStack.toLocaleString()}</span>{' '}
          stack starts you at{' '}
          <span className="font-mono tabular-nums text-white">
            {Math.floor(values.startingStack / 50)}
          </span>{' '}
          big blinds.
        </div>
      </MttStepCard>

      <MttFooter canContinue={canContinue} />
    </>
  );
}
