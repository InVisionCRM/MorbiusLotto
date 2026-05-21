'use client';

import React from 'react';
import { Coins, Gift } from 'lucide-react';
import { MttFooter, MttStepCard } from '../MttFooter';
import { useMttCreator } from '../MttCreatorContext';

const FIELD_CLASS =
  'w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-mono tabular-nums text-white placeholder-slate-500 outline-none transition-colors focus:border-cyan-500/60 focus:bg-black/60';

export function MttStepBuyIn() {
  const { values, setValues } = useMttCreator();

  const buyInOk =
    values.buyInMode === 'chips'
      ? /^\d+$/.test(values.buyInChips) && Number(values.buyInChips) > 0
      : true;
  const guaranteeOk =
    values.buyInMode === 'freeroll'
      ? /^\d+$/.test(values.guaranteedPool) && Number(values.guaranteedPool) > 0
      : true;

  const canContinue = buyInOk && guaranteeOk;

  return (
    <>
      <MttStepCard
        title="How do players buy in?"
        subtitle="Charge a buy-in to build the prize pool, or run a freeroll where you fund the pool from your chips."
      >
        <div className="space-y-5">
          {/* Mode picker */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ModeCard
              icon={<Coins size={18} />}
              label="Buy-in"
              tagline="Players pay MORBIUS chips to enter"
              active={values.buyInMode === 'chips'}
              onClick={() => setValues({ buyInMode: 'chips' })}
            />
            <ModeCard
              icon={<Gift size={18} />}
              label="Freeroll"
              tagline="No buy-in. You fund the prize pool."
              active={values.buyInMode === 'freeroll'}
              onClick={() => setValues({ buyInMode: 'freeroll' })}
            />
          </div>

          {/* Amount field */}
          {values.buyInMode === 'chips' ? (
            <div>
              <label htmlFor="mtt-buyin-amount" className="text-[11px] font-bold uppercase text-slate-400 mb-2 block">
                Buy-in per player (MORBIUS chips)
              </label>
              <input
                id="mtt-buyin-amount"
                type="text"
                inputMode="numeric"
                value={values.buyInChips}
                onChange={(e) => setValues({ buyInChips: e.target.value.replace(/\D/g, '').slice(0, 12) })}
                placeholder="500"
                className={FIELD_CLASS}
              />
              <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
                Up to{' '}
                <span className="font-mono tabular-nums text-cyan-400">
                  {(Number(values.buyInChips) || 0).toLocaleString()} × {values.maxPlayers}
                </span>{' '}
                ={' '}
                <span className="font-mono tabular-nums text-white">
                  {((Number(values.buyInChips) || 0) * values.maxPlayers).toLocaleString()} MORBIUS
                </span>{' '}
                prize pool if the field is full.
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor="mtt-guarantee-amount" className="text-[11px] font-bold uppercase text-slate-400 mb-2 block">
                Guaranteed prize pool (MORBIUS chips)
              </label>
              <input
                id="mtt-guarantee-amount"
                type="text"
                inputMode="numeric"
                value={values.guaranteedPool}
                onChange={(e) => setValues({ guaranteedPool: e.target.value.replace(/\D/g, '').slice(0, 14) })}
                placeholder="10000"
                className={FIELD_CLASS}
              />
              <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
                Debited from your poker chip wallet when the tournament publishes. Refunded if you cancel before start.
              </p>
            </div>
          )}
        </div>
      </MttStepCard>

      <MttFooter canContinue={canContinue} />
    </>
  );
}

function ModeCard({
  icon,
  label,
  tagline,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tagline: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors ${
        active
          ? 'border-cyan-500/60 bg-cyan-500/10'
          : 'border-white/10 bg-black/30 hover:border-white/20 hover:bg-white/[0.04]'
      }`}
    >
      <div className={`inline-flex items-center gap-2 text-sm font-bold ${active ? 'text-cyan-300' : 'text-white'}`}>
        {icon} {label}
      </div>
      <div className="text-[12px] leading-relaxed text-slate-400">{tagline}</div>
    </button>
  );
}
