'use client';

import React from 'react';
import { Clock, Hand, Trophy } from 'lucide-react';
import { MttFooter, MttStepCard } from '../MttFooter';
import { useMttCreator } from '../MttCreatorContext';
import type { PokerBlindIncreaseMode } from '@/hooks/use-poker-tournament';

const INTERVAL_OPTIONS = [5, 10, 15, 20, 30, 45] as const;

type ModeMeta = {
  id: PokerBlindIncreaseMode;
  label: string;
  tagline: string;
  icon: React.ReactNode;
};

const MODES: readonly ModeMeta[] = [
  {
    id: 'by_time',
    label: 'By time',
    tagline: 'Blinds go up every N minutes',
    icon: <Clock size={18} />,
  },
  {
    id: 'by_hand',
    label: 'By hand',
    tagline: 'Blinds advance after a fixed number of hands',
    icon: <Hand size={18} />,
  },
  {
    id: 'knockout',
    label: 'Knockout',
    tagline: 'Blinds double whenever a player busts',
    icon: <Trophy size={18} />,
  },
];

export function MttStepBlinds() {
  const { values, setValues } = useMttCreator();

  const canContinue =
    values.blindMode !== 'by_time' ||
    (values.blindIntervalMinutes >= 1 && values.blindIntervalMinutes <= 60);

  return (
    <>
      <MttStepCard
        title="How do the blinds go up?"
        subtitle="Faster blinds = shorter tournament. Slower blinds = more skill-favored. Pick what fits your players."
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {MODES.map((mode) => {
              const active = values.blindMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setValues({ blindMode: mode.id })}
                  className={`flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors ${
                    active
                      ? 'border-cyan-500/60 bg-cyan-500/10'
                      : 'border-white/10 bg-black/30 hover:border-white/20 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className={`inline-flex items-center gap-2 text-sm font-bold ${active ? 'text-cyan-300' : 'text-white'}`}>
                    {mode.icon} {mode.label}
                  </div>
                  <div className="text-[12px] leading-relaxed text-slate-400">{mode.tagline}</div>
                </button>
              );
            })}
          </div>

          {values.blindMode === 'by_time' && (
            <div>
              <label className="text-[11px] font-bold uppercase text-slate-400 mb-2 block">
                Minutes per level
              </label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {INTERVAL_OPTIONS.map((m) => {
                  const active = values.blindIntervalMinutes === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setValues({ blindIntervalMinutes: m })}
                      className={`rounded-xl border py-2.5 text-center font-mono text-sm tabular-nums transition-colors ${
                        active
                          ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-200'
                          : 'border-white/10 bg-black/30 text-slate-300 hover:border-white/20 hover:bg-white/[0.04]'
                      }`}
                    >
                      {m}m
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {values.blindMode === 'knockout' && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-[12px] leading-relaxed text-amber-200">
              Knockout mode pairs poorly with large fields — the early game stays slow until the first
              elimination. We recommend <span className="font-semibold">By time</span> or{' '}
              <span className="font-semibold">By hand</span> for MTTs of 24+ players.
            </div>
          )}
        </div>
      </MttStepCard>

      <MttFooter canContinue={canContinue} />
    </>
  );
}
