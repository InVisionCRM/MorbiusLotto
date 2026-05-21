'use client';

import React, { useMemo } from 'react';
import { MttFooter, MttStepCard } from '../MttFooter';
import { useMttCreator } from '../MttCreatorContext';
import {
  buildPrizePercents,
  POKER_PRIZE_PRESET_LIST,
  type PokerPrizePresetId,
} from '@/lib/poker-tournament-prize-presets';

const FEE_OPTIONS = [0, 1, 2, 3, 5, 7, 10, 15] as const;

export function MttStepPayouts() {
  const { values, setValues } = useMttCreator();

  // MTT pays top-10. Even when the field is smaller, the preset builder caps at 10
  // (`buildPrizePercents` clamps internally). For preview purposes we use min(field, 10).
  const paidSlotCount = Math.min(10, Math.max(2, values.maxPlayers));
  const percents = useMemo(
    () => buildPrizePercents(values.prizePresetId, paidSlotCount),
    [values.prizePresetId, paidSlotCount],
  );
  const paidRanks = percents.filter((p) => p > 0).length;

  // Estimated pool for the preview (chips). For buy-in we use field-fully-paid; for freeroll we
  // use the guarantee. Won't match exactly when the field is short but gives the right shape.
  const estimatedPool = useMemo(() => {
    if (values.buyInMode === 'freeroll') {
      return Number(values.guaranteedPool) || 0;
    }
    return (Number(values.buyInChips) || 0) * values.maxPlayers;
  }, [values.buyInMode, values.buyInChips, values.guaranteedPool, values.maxPlayers]);

  const canContinue = !!values.prizePresetId && values.creatorFeePercent >= 0;

  return (
    <>
      <MttStepCard
        title="How are the prizes split?"
        subtitle="Top 10 finishers get paid. Pick a curve that matches your event — top-heavy rewards skill; flatter pays more players."
      >
        <div className="space-y-6">
          {/* Preset picker */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {POKER_PRIZE_PRESET_LIST.slice(0, 6).map((preset) => {
              const active = values.prizePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setValues({ prizePresetId: preset.id as PokerPrizePresetId })}
                  className={`flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors ${
                    active
                      ? 'border-cyan-500/60 bg-cyan-500/10'
                      : 'border-white/10 bg-black/30 hover:border-white/20 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className={`text-sm font-bold ${active ? 'text-cyan-300' : 'text-white'}`}>
                    {preset.label}
                  </div>
                  <div className="text-[12px] leading-relaxed text-slate-400">
                    {preset.shortDescription}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Live split preview */}
          <div className="rounded-xl border border-cyan-500/20 bg-black/40 p-5">
            <div className="flex items-baseline justify-between gap-2">
              <div
                className="text-[10px] font-bold uppercase text-cyan-400"
                style={{ letterSpacing: '0.25em' }}
              >
                Estimated split
              </div>
              <div className="text-[11px] text-slate-500">
                Pool ≈{' '}
                <span className="font-mono tabular-nums text-slate-300">
                  {estimatedPool.toLocaleString()} chips
                </span>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              {percents.slice(0, paidRanks).map((pct, i) => {
                const chips = Math.floor((estimatedPool * pct) / 100);
                return (
                  <div key={i} className="flex items-center gap-3 text-[12px]">
                    <div className="w-6 text-slate-500">#{i + 1}</div>
                    <div className="relative flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: 'linear-gradient(90deg, #06b6d4, #2563eb)',
                        }}
                      />
                    </div>
                    <div className="w-14 text-right font-mono tabular-nums text-slate-300">
                      {pct}%
                    </div>
                    <div className="w-28 text-right font-mono tabular-nums text-slate-500">
                      {chips.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Creator fee */}
          <div>
            <label className="text-[11px] font-bold uppercase text-slate-400 mb-2 block">
              Your cut of the prize pool
            </label>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {FEE_OPTIONS.map((pct) => {
                const active = values.creatorFeePercent === pct;
                return (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setValues({ creatorFeePercent: pct })}
                    className={`rounded-xl border py-2.5 text-center font-mono text-sm tabular-nums transition-colors ${
                      active
                        ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-200'
                        : 'border-white/10 bg-black/30 text-slate-300 hover:border-white/20 hover:bg-white/[0.04]'
                    }`}
                  >
                    {pct}%
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
              {values.buyInMode === 'freeroll'
                ? 'Freerolls override your cut to 0% — you funded the pool, so winners get the whole thing.'
                : `${values.creatorFeePercent}% of the prize pool is paid to you when the tournament ends. The platform also takes a small fee on top.`}
            </p>
          </div>
        </div>
      </MttStepCard>

      <MttFooter canContinue={canContinue} />
    </>
  );
}
