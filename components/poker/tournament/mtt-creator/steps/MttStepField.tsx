'use client';

import React, { useMemo } from 'react';
import { MttFooter, MttStepCard } from '../MttFooter';
import { useMttCreator } from '../MttCreatorContext';

const FIELD_SIZE_OPTIONS: readonly number[] = [12, 18, 24, 27, 36, 45, 54, 63, 72, 81, 90, 100];
const SEATS_PER_TABLE_OPTIONS: readonly number[] = [6, 7, 8, 9, 10];

export function MttStepField() {
  const { values, setValues } = useMttCreator();

  const projectedTables = useMemo(
    () => Math.max(1, Math.ceil(values.maxPlayers / values.seatsPerTable)),
    [values.maxPlayers, values.seatsPerTable],
  );

  // Render fewer table dots when projected is high to keep the row visually clean.
  const dotsToRender = Math.min(projectedTables, 14);
  const overflow = projectedTables - dotsToRender;

  const canContinue = values.maxPlayers >= 2 && values.seatsPerTable >= 4;

  return (
    <>
      <MttStepCard
        title="Set your field"
        subtitle="How many players can register, and how many seats per table. We'll split everyone across tables and collapse them into a final table as players bust."
      >
        <div className="space-y-6">
          {/* Inputs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumPicker
              id="mtt-field-players"
              label="Field size"
              value={values.maxPlayers}
              options={FIELD_SIZE_OPTIONS}
              onChange={(n) => setValues({ maxPlayers: n })}
              valueSuffix="players"
            />
            <NumPicker
              id="mtt-field-seats"
              label="Seats per table"
              value={values.seatsPerTable}
              options={SEATS_PER_TABLE_OPTIONS}
              onChange={(n) => setValues({ seatsPerTable: n })}
              valueSuffix="-max"
              suffixInline
            />
          </div>

          {/* Live preview */}
          <div className="rounded-xl border border-cyan-500/20 bg-black/40 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div
                  className="text-[10px] font-bold uppercase text-cyan-400"
                  style={{ letterSpacing: '0.25em' }}
                >
                  Projected layout
                </div>
                <div
                  className="mt-1 text-white tabular-nums"
                  style={{
                    fontFamily: '"Mitr", sans-serif',
                    fontWeight: 700,
                    fontSize: 'clamp(28px, 4vw, 40px)',
                    lineHeight: 1,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {projectedTables} {projectedTables === 1 ? 'table' : 'tables'}
                </div>
                <div className="mt-1 text-[12px] text-slate-500">
                  Up to <span className="font-mono tabular-nums text-slate-300">{values.seatsPerTable}</span> seats each ·
                  {' '}
                  <span className="font-mono tabular-nums text-slate-300">{values.maxPlayers}</span> total players ·
                  {' '}
                  Top 10 ranks paid
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {Array.from({ length: dotsToRender }).map((_, i) => (
                <TableDot key={i} seats={values.seatsPerTable} label={`T${i + 1}`} />
              ))}
              {overflow > 0 && (
                <div className="ml-1 text-[12px] font-semibold text-slate-500">
                  +{overflow} more
                </div>
              )}
            </div>

            <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-slate-400">
              Tables consolidate to the <span className="font-semibold text-cyan-300">final table</span>{' '}
              when the field drops to{' '}
              <span className="font-mono tabular-nums text-white">
                {Math.min(values.seatsPerTable, 9)}
              </span>{' '}
              players.
            </div>
          </div>
        </div>
      </MttStepCard>

      <MttFooter canContinue={canContinue} />
    </>
  );
}

function NumPicker({
  id,
  label,
  value,
  options,
  onChange,
  valueSuffix,
  suffixInline,
}: {
  id: string;
  label: string;
  value: number;
  options: readonly number[];
  onChange: (n: number) => void;
  valueSuffix: string;
  /** When true, the suffix appears as part of the rendered text (e.g. "9-max"). Otherwise it's "45 players". */
  suffixInline?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[11px] font-bold uppercase text-slate-400 mb-2 block">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={String(value)}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="w-full appearance-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-mono tabular-nums text-white outline-none transition-colors focus:border-cyan-500/60 focus:bg-black/60"
        >
          {options.map((n) => (
            <option key={n} value={n} className="bg-slate-900">
              {suffixInline ? `${n}${valueSuffix}` : `${n} ${valueSuffix}`}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden>
          ▾
        </div>
      </div>
    </div>
  );
}

function TableDot({ seats, label }: { seats: number; label: string }) {
  // 9-max → larger dot; 6-max → smaller, to give visual intuition about table size.
  const size = 32 + Math.max(0, Math.min(4, seats - 6)) * 4;
  return (
    <div
      className="relative flex items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10 text-[10px] font-bold text-cyan-200"
      style={{ width: size, height: size, letterSpacing: '0.08em' }}
    >
      {label}
    </div>
  );
}
