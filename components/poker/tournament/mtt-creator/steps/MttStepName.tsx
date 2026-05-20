'use client';

import React, { useMemo, useRef } from 'react';
import { Lock } from 'lucide-react';
import { MttFooter, MttStepCard } from '../MttFooter';
import { useMttCreator } from '../MttCreatorContext';
import {
  localYyyyMmDd,
  openDateOrTimePicker,
  parseLocalDateTime,
} from '@/lib/poker-tournament-schedule';

const FIELD_CLASS =
  'w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-cyan-500/60 focus:bg-black/60 [color-scheme:dark]';

const LABEL_CLASS = 'text-[11px] font-bold uppercase text-slate-400 mb-2 block';

export function MttStepName() {
  const { values, setValues } = useMttCreator();
  const minDate = useMemo(() => localYyyyMmDd(new Date()), []);

  // Refs so clicking the label (or the column wrapper) opens the native picker,
  // not just the tiny calendar/clock icon. Matches the classic creator UX.
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);

  const trimmedName = values.name.trim();
  const hasName = trimmedName.length >= 3;
  const hasDate = !!values.scheduledDate;
  const hasTime = !!values.scheduledTime;

  // Reject past start times — same parser the classic creator uses so the validation
  // window matches across both surfaces.
  const startInFuture = useMemo(() => {
    if (!hasDate || !hasTime) return false;
    const local = parseLocalDateTime(values.scheduledDate, values.scheduledTime);
    return !!local && local.getTime() > Date.now();
  }, [hasDate, hasTime, values.scheduledDate, values.scheduledTime]);

  const pinOk = !values.isPrivate || values.privatePin === '' || /^\d{4,12}$/.test(values.privatePin);
  const canContinue = hasName && hasDate && hasTime && startInFuture && pinOk;

  return (
    <>
      <MttStepCard
        title="Name your tournament"
        subtitle="Give it something memorable. Players see this in the lobby — make it stand out."
      >
        <div className="space-y-5">
          <div>
            <label htmlFor="mtt-name" className={LABEL_CLASS}>
              Tournament name
            </label>
            <input
              id="mtt-name"
              type="text"
              value={values.name}
              onChange={(e) => setValues({ name: e.target.value })}
              placeholder="Friday Night Madness"
              maxLength={64}
              className={FIELD_CLASS}
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div
              className="cursor-pointer"
              onClick={() => openDateOrTimePicker(dateInputRef.current)}
            >
              <label htmlFor="mtt-date" className={LABEL_CLASS}>
                Start date
              </label>
              <input
                ref={dateInputRef}
                id="mtt-date"
                type="date"
                value={values.scheduledDate}
                min={minDate}
                onChange={(e) => setValues({ scheduledDate: e.target.value })}
                className={FIELD_CLASS}
              />
            </div>
            <div
              className="cursor-pointer"
              onClick={() => openDateOrTimePicker(timeInputRef.current)}
            >
              <label htmlFor="mtt-time" className={LABEL_CLASS}>
                Start time
              </label>
              <input
                ref={timeInputRef}
                id="mtt-time"
                type="time"
                step={60}
                value={values.scheduledTime.length >= 5 ? values.scheduledTime.slice(0, 5) : values.scheduledTime}
                onChange={(e) => setValues({ scheduledTime: e.target.value.slice(0, 5) })}
                className={FIELD_CLASS}
              />
            </div>
          </div>

          {hasDate && hasTime && !startInFuture && (
            <p className="text-xs text-rose-400">Start time must be in the future.</p>
          )}

          {/* Privacy toggle + PIN */}
          <div className="rounded-xl border border-white/[0.06] bg-black/30 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={values.isPrivate}
                onChange={(e) =>
                  setValues({ isPrivate: e.target.checked, privatePin: e.target.checked ? values.privatePin : '' })
                }
                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-cyan-500/40"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Lock size={14} className="text-cyan-400" />
                  Private — invite-only
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
                  Players join with a 4–12 digit PIN. Leave the PIN blank and we'll auto-generate one.
                </p>
              </div>
            </label>

            {values.isPrivate && (
              <div className="mt-3">
                <label htmlFor="mtt-pin" className={LABEL_CLASS}>
                  PIN (optional)
                </label>
                <input
                  id="mtt-pin"
                  type="text"
                  inputMode="numeric"
                  value={values.privatePin}
                  onChange={(e) => setValues({ privatePin: e.target.value.replace(/\D/g, '').slice(0, 12) })}
                  placeholder="Auto-generated if blank"
                  className={`${FIELD_CLASS} font-mono tabular-nums`}
                  maxLength={12}
                />
                {!pinOk && (
                  <p className="mt-1 text-xs text-rose-400">PIN must be 4 to 12 digits.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </MttStepCard>

      <MttFooter canContinue={canContinue} />
    </>
  );
}
