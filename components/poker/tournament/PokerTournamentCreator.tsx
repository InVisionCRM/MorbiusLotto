'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import {
  POKER_TOURNAMENT_DEFAULT_CONFIG,
  type CreatePokerTournamentParams,
} from '@/hooks/use-poker-tournament';
import { isAdminWallet } from '@/lib/admin';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const MORBIUS_DECIMALS = 18n;

/** 96 slots per day: 15-minute steps, labels in 12h AM/PM (local). */
function useFifteenMinuteTimeOptions(): { value: string; label: string }[] {
  return useMemo(() => {
    const out: { value: string; label: string }[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        const d = new Date(2000, 0, 1, h, m, 0, 0);
        out.push({
          value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
          label: format(d, 'h:mm a'),
        });
      }
    }
    return out;
  }, []);
}

/** Next local 15-minute boundary at least ~1 minute from now (for valid default create). */
function defaultScheduledFields(): { date: string; time: string } {
  const from = new Date(Date.now() + 60_000);
  from.setSeconds(0, 0);
  const curM = from.getMinutes();
  const step = 15;
  const rem = curM % step;
  const add = rem === 0 ? step : step - rem;
  from.setMinutes(curM + add);
  if (from.getTime() <= Date.now()) {
    from.setMinutes(from.getMinutes() + step);
  }
  return {
    date: localYyyyMmDd(from),
    time: `${String(from.getHours()).padStart(2, '0')}:${String(from.getMinutes()).padStart(2, '0')}`,
  };
}

function localYyyyMmDd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function parseMorbiusInput(val: string): bigint {
  try {
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) return 0n;
    return BigInt(Math.round(num)) * 10n ** MORBIUS_DECIMALS;
  } catch { return 0n; }
}

const STARTING_STACK_PRESETS = [
  { value: '1000', label: '1,000' },
  { value: '2500', label: '2,500' },
  { value: '5555', label: '5,555' },
  { value: '10000', label: '10,000' },
] as const;

function defaultWinnerTakesAllPrizeRowCount(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i === 0 ? 100 : 0));
}

function finishOrdinal(rank: number): string {
  const j = rank % 10;
  const k = rank % 100;
  if (j === 1 && k !== 11) return `${rank}st`;
  if (j === 2 && k !== 12) return `${rank}nd`;
  if (j === 3 && k !== 13) return `${rank}rd`;
  return `${rank}th`;
}

export interface PokerTournamentCreatorProps {
  creatorAddress?: string;
  onClose: () => void;
  onCreate: (params: CreatePokerTournamentParams, opts: { addBots: number }) => Promise<void>;
}

export function PokerTournamentCreator({ creatorAddress, onClose, onCreate }: PokerTournamentCreatorProps) {
  const [name, setName] = useState('My SNG');
  const [isFreeroll, setIsFreeroll] = useState(false);
  const [fundFromPromo, setFundFromPromo] = useState(false);
  const [buyIn, setBuyIn] = useState('1000');
  const [guaranteedPool, setGuaranteedPool] = useState('5000');
  const [startingStack, setStartingStack] = useState<string>('10000');
  const [minPlayers, setMinPlayers] = useState('2');
  const [maxPlayers, setMaxPlayers] = useState('6');
  const [isPrivate, setIsPrivate] = useState(false);
  const [privatePin, setPrivatePin] = useState('');
  /** After create, start this many poker bots joining the tournament (0 = none). */
  const [botsToAdd, setBotsToAdd] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initialSchedule = useMemo(() => defaultScheduledFields(), []);
  /** yyyy-MM-dd in local time — required */
  const [scheduledDate, setScheduledDate] = useState(initialSchedule.date);
  /** HH:mm 24h, 15-minute steps */
  const [scheduledTime, setScheduledTime] = useState(initialSchedule.time);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const timeOptions = useFifteenMinuteTimeOptions();
  const minScheduleDate = useMemo(() => localYyyyMmDd(new Date()), []);

  const showPromoOption = isFreeroll && isAdminWallet(creatorAddress);

  useEffect(() => {
    if (!isFreeroll) setFundFromPromo(false);
  }, [isFreeroll]);

  const prizeSlotCount = useMemo(() => {
    const minP = Math.max(2, Math.min(10, parseInt(minPlayers, 10) || 2));
    const rawMax = parseInt(maxPlayers, 10);
    const maxP = Math.max(
      minP,
      Math.max(2, Math.min(10, Number.isFinite(rawMax) ? rawMax : 6)),
    );
    return maxP;
  }, [minPlayers, maxPlayers]);

  const [prizePercents, setPrizePercents] = useState<number[]>(() => defaultWinnerTakesAllPrizeRowCount(6));

  useEffect(() => {
    setPrizePercents((prev) => {
      const next = prev.slice(0, prizeSlotCount);
      while (next.length < prizeSlotCount) next.push(0);
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) return prev;
      return next;
    });
  }, [prizeSlotCount]);

  const prizeSum = prizePercents.reduce((a, b) => a + b, 0);

  const level1Blinds = POKER_TOURNAMENT_DEFAULT_CONFIG.blindSchedule[0];
  const startingStackPreview = Math.max(
    100,
    parseInt(startingStack, 10) || Number(STARTING_STACK_PRESETS[STARTING_STACK_PRESETS.length - 1].value),
  );
  const bigBlindStart = level1Blinds.bigBlind > 0 ? level1Blinds.bigBlind : 1;
  const startingBigBlindDepth =
    Math.round((startingStackPreview / bigBlindStart) * 10) / 10;

  const handleCreate = async () => {
    if (!name.trim()) return;
    const buyWei = isFreeroll ? 0n : parseMorbiusInput(buyIn);
    const guaranteeWei = isFreeroll ? parseMorbiusInput(guaranteedPool) : 0n;
    if (!isFreeroll && buyWei <= 0n) return;
    if (isFreeroll && guaranteeWei <= 0n) return;
    const pinDigits = privatePin.replace(/\D/g, '').slice(0, 12);
    const pinForCreate = isPrivate && pinDigits.length >= 4 ? pinDigits : undefined;

    setScheduleError(null);
    if (!scheduledDate.trim()) {
      setScheduleError('Pick a start date.');
      return;
    }
    const parts = scheduledDate.split('-').map(Number);
    const timeParts = scheduledTime.split(':').map(Number);
    if (parts.length !== 3 || timeParts.length !== 2) {
      setScheduleError('Pick a valid date and time.');
      return;
    }
    const [y, mo, d] = parts;
    const [hh, mm] = timeParts;
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d) || !Number.isFinite(hh) || !Number.isFinite(mm)) {
      setScheduleError('Pick a valid date and time.');
      return;
    }
    if (mm % 15 !== 0) {
      setScheduleError('Time must be on a 15-minute mark.');
      return;
    }
    const local = new Date(y, mo - 1, d, hh, mm, 0, 0);
    if (local.getTime() < Date.now() + 60_000) {
      setScheduleError('Start must be at least 1 minute from now.');
      return;
    }
    const scheduledStartAt = local.toISOString();

    setIsSubmitting(true);
    try {
      await onCreate(
        {
          name:                  name.trim(),
          buyInAmount:           buyWei.toString(),
          ...(isFreeroll
            ? {
                guaranteedPrizePool: guaranteeWei.toString(),
                ...(fundFromPromo ? { guaranteedPrizePoolSource: 'platform_promo' as const } : {}),
              }
            : {}),
          prizeDistributionType: 'custom',
          prizePercentages:      [...prizePercents],
          config:                {
            ...POKER_TOURNAMENT_DEFAULT_CONFIG,
            startingStack: Math.max(
              100,
              parseInt(startingStack, 10) || Number(STARTING_STACK_PRESETS[STARTING_STACK_PRESETS.length - 1].value),
            ),
            minPlayers:    Math.max(2, Math.min(10, parseInt(minPlayers, 10) || 2)),
            maxPlayers:    prizeSlotCount,
          },
          isPrivate,
          ...(pinForCreate ? { pinCode: pinForCreate } : {}),
          scheduledStartAt,
        },
        { addBots: Math.max(0, Math.min(10, Math.floor(botsToAdd))) },
      );
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldClass =
    'w-full rounded-xl bg-gray-950/60 border border-cyan-500/20 px-3 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20';
  const labelClass = 'text-xs font-medium text-white/60 mb-1.5 block';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 shadow-2xl overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.12),transparent_55%)]" />
        <div className="relative shrink-0 flex items-center justify-between px-5 pt-5 pb-3 border-b border-cyan-500/20">
          <h2 className="text-lg font-bold text-white tracking-tight">Create Poker SNG</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="relative flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          <div>
            <label className={labelClass}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} maxLength={40} />
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isFreeroll}
              onChange={(e) => {
                setIsFreeroll(e.target.checked);
                if (!e.target.checked) setFundFromPromo(false);
              }}
              className="rounded border-white/20 bg-gray-900"
            />
            <span className="text-sm text-white/90">Freeroll</span>
          </label>

          {showPromoOption && (
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={fundFromPromo}
                onChange={(e) => setFundFromPromo(e.target.checked)}
                className="rounded border-white/20 bg-gray-900"
              />
              <span className="text-sm text-amber-200/90">Admin promo funding</span>
            </label>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{isFreeroll ? 'Guaranteed pool' : 'Buy-in'}</label>
              <input
                type="number"
                min="1"
                value={isFreeroll ? guaranteedPool : buyIn}
                onChange={(e) => (isFreeroll ? setGuaranteedPool(e.target.value) : setBuyIn(e.target.value))}
                className={fieldClass}
              />
              <p className="text-[11px] text-white/40 mt-1">MORBIUS</p>
            </div>
            <div>
              <label className={labelClass}>Starting stack</label>
              <Select value={startingStack} onValueChange={setStartingStack}>
                <SelectTrigger className={`${fieldClass} h-auto min-h-[44px]`}>
                  <SelectValue placeholder="Chips" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border border-cyan-500/30 text-white shadow-xl z-[200]">
                  {STARTING_STACK_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value} className="focus:bg-cyan-500/15 focus:text-white cursor-pointer">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-white/40 mt-1">Table chips</p>
            </div>
          </div>

          <div className="rounded-xl border border-cyan-500/25 bg-black/25 px-4 py-3">
            <p className="text-sm text-white/90">
              <span className="text-white/50">Level 1 blinds · </span>
              <span className="tabular-nums font-medium text-cyan-200">
                {level1Blinds.smallBlind} / {level1Blinds.bigBlind}
              </span>
            </p>
            <p className="text-xs text-white/45 mt-1">
              ~{startingBigBlindDepth} BB deep with {startingStackPreview.toLocaleString()} chips
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Min players</label>
              <input
                type="number"
                min="2"
                max="10"
                value={minPlayers}
                onChange={(e) => setMinPlayers(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Max players</label>
              <input
                type="number"
                min="2"
                max="10"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="rounded-xl border border-cyan-500/25 bg-black/25 px-4 py-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-white/90">Prize split</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPrizePercents(defaultWinnerTakesAllPrizeRowCount(prizeSlotCount))}
                  className="text-xs rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-white/80 hover:bg-white/10 transition-colors"
                >
                  Winner takes all
                </button>
                <button
                  type="button"
                  disabled={prizeSlotCount < 3}
                  onClick={() => {
                    const row = defaultWinnerTakesAllPrizeRowCount(prizeSlotCount);
                    row[0] = 50;
                    row[1] = 30;
                    row[2] = 20;
                    setPrizePercents(row);
                  }}
                  className="text-xs rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-white/80 hover:bg-white/10 disabled:opacity-30 transition-colors"
                >
                  50 / 30 / 20
                </button>
              </div>
            </div>
            <p className="text-[11px] text-white/45">{prizeSlotCount} places · percents must sum to 100</p>
            <div className="rounded-lg border border-white/10 overflow-hidden max-h-40 overflow-y-auto">
              <div className="grid grid-cols-[1fr_3.5rem] gap-0 bg-white/5 text-[10px] font-medium uppercase tracking-wide text-white/45 px-2 py-2">
                <span>Place</span>
                <span className="text-right">%</span>
              </div>
              {prizePercents.map((pct, i) => (
                <div key={i} className="grid grid-cols-[1fr_3.5rem] gap-2 items-center border-t border-white/10 px-2 py-2">
                  <span className="text-sm text-white/80">{finishOrdinal(i + 1)}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={pct}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      const v = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
                      setPrizePercents((prev) => {
                        const next = [...prev];
                        next[i] = v;
                        return next;
                      });
                    }}
                    className="w-full rounded-md bg-white/10 border border-white/10 px-2 py-1 text-sm text-white tabular-nums text-right focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
              ))}
            </div>
            <p className={`text-sm font-medium tabular-nums ${prizeSum === 100 ? 'text-emerald-400' : 'text-amber-300'}`}>
              Total {prizeSum}%
            </p>
          </div>

          <div className="space-y-3">
            <label className={labelClass}>Scheduled start</label>
            <p className="text-[11px] text-white/40 -mt-2 mb-1">Required · 15-minute times (local)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-[11px] text-white/45 block mb-1">Date</span>
                <input
                  type="date"
                  value={scheduledDate}
                  min={minScheduleDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className={`${fieldClass} [color-scheme:dark]`}
                />
              </div>
              <div>
                <span className="text-[11px] text-white/45 block mb-1">Time</span>
                <Select value={scheduledTime} onValueChange={setScheduledTime}>
                  <SelectTrigger className={`${fieldClass} h-auto min-h-[44px]`}>
                    <SelectValue placeholder="Time" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 bg-slate-900 border border-cyan-500/30 text-white shadow-xl z-[200]">
                    {timeOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="focus:bg-cyan-500/15 focus:text-white cursor-pointer">
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {scheduleError && <p className="text-xs text-red-400">{scheduleError}</p>}
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => {
                setIsPrivate(e.target.checked);
                if (!e.target.checked) setPrivatePin('');
              }}
              className="rounded border-white/20 bg-gray-900"
            />
            <span className="text-sm text-white/90">Private room</span>
          </label>

          {isPrivate && (
            <div>
              <label className={labelClass}>PIN</label>
              <input
                type="text"
                value={privatePin}
                onChange={(e) => setPrivatePin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                placeholder="4–12 digits"
                className={fieldClass}
              />
            </div>
          )}

          <div>
            <label className={labelClass}>Bot players after create</label>
            <input
              type="number"
              min={0}
              max={10}
              value={botsToAdd}
              onChange={(e) => setBotsToAdd(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
              className={fieldClass}
            />
            <p className="text-[11px] text-white/40 mt-1">
              0–10 · optional · automated poker bots join open seats once the tournament is created
            </p>
          </div>
        </div>

        <div className="relative shrink-0 flex gap-3 px-5 py-4 border-t border-cyan-500/20 bg-black/20">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/15 text-white/80 text-sm font-medium py-2.5 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={
              isSubmitting
              || !name.trim()
              || prizeSum !== 100
              || prizePercents.length !== prizeSlotCount
              || (!isFreeroll && parseMorbiusInput(buyIn) <= 0n)
              || (isFreeroll && parseMorbiusInput(guaranteedPool) <= 0n)
            }
            className="flex-1 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:opacity-95 disabled:opacity-40 disabled:pointer-events-none text-white text-sm font-semibold py-2.5 transition-opacity"
          >
            {isSubmitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
