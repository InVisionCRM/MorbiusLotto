'use client';

import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  POKER_TOURNAMENT_DEFAULT_CONFIG,
  type CreatePokerTournamentParams,
  type PokerBlindIncreaseMode,
} from '@/hooks/use-poker-tournament';
import { buildPrizePercents, findPokerPrizePresetMeta } from '@/lib/poker-tournament-prize-presets';
import { MTT_STEP_TAGS, MTT_WIZARD_STEPS, useMttCreator, type MttWizardScreen } from '../MttCreatorContext';
import type { MttFormValues } from '../MttCreatorContext';

export interface MttStepReviewProps {
  onClose: () => void;
  /** Server submit. Returns the new tournament id on success, null on failure. */
  onPublish: (params: CreatePokerTournamentParams) => Promise<{ tournamentId: string; pinCode?: string | null } | null>;
  /** Where to send the user once publish succeeds (typically the lobby with the new tournament selected). */
  onPublished: (result: { tournamentId: string; pinCode?: string | null }) => void;
}

export function MttStepReview({ onClose, onPublish, onPublished }: MttStepReviewProps) {
  const { values, go } = useMttCreator();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(() => buildCreateParams(values), [values]);
  const validation = validateValues(values);

  const handlePublish = async () => {
    if (!params) {
      setError(validation.firstError ?? 'Form is incomplete.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await onPublish(params);
      if (!result?.tournamentId) {
        setError('Server did not return a tournament id. Try again.');
        return;
      }
      toast.success('Tournament published!');
      onPublished(result);
    } catch (err) {
      const msg = (err as Error).message ?? 'Publish failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const tableCount = Math.max(1, Math.ceil(values.maxPlayers / values.seatsPerTable));
  const presetMeta = findPokerPrizePresetMeta(values.prizePresetId);

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at top, rgba(6,182,212,0.10), transparent 60%), linear-gradient(180deg, #050a14 0%, #020409 100%)',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 rounded-full p-2 text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Close MTT creator"
      >
        <X size={18} />
      </button>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12 sm:px-10 sm:py-16">
        {/* Hero */}
        <div className="text-center">
          <div
            className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold uppercase text-cyan-300"
            style={{ letterSpacing: '0.2em' }}
          >
            <CheckCircle2 size={12} /> Ready to publish
          </div>
          <h1
            className="mt-5 text-white"
            style={{
              fontFamily: '"Mitr", sans-serif',
              fontWeight: 700,
              fontSize: 'clamp(36px, 6vw, 64px)',
              lineHeight: 0.95,
              letterSpacing: '-0.02em',
            }}
          >
            {values.name.trim() || 'Untitled tournament'}
          </h1>
          {values.scheduledDate && values.scheduledTime && (
            <p className="mt-2 text-sm text-slate-400">
              Starts{' '}
              <span className="font-mono tabular-nums text-slate-200">
                {formatScheduledLocal(values.scheduledDate, values.scheduledTime)}
              </span>
            </p>
          )}
        </div>

        {/* Summary cards */}
        <div className="space-y-3">
          <SummaryRow
            screen="name"
            label="Name & schedule"
            value={values.name.trim() || '—'}
            valueSub={
              values.scheduledDate && values.scheduledTime
                ? formatScheduledLocal(values.scheduledDate, values.scheduledTime)
                : 'No start time'
            }
            warn={!values.name.trim() || !values.scheduledDate}
          />
          <SummaryRow
            screen="buy-in"
            label="Buy-in"
            value={
              values.buyInMode === 'freeroll'
                ? `Freeroll · ${(Number(values.guaranteedPool) || 0).toLocaleString()} chips guaranteed`
                : `${(Number(values.buyInChips) || 0).toLocaleString()} MORBIUS / player`
            }
          />
          <SummaryRow
            screen="field"
            label="Field"
            value={`${values.maxPlayers} players · ${values.seatsPerTable}-max`}
            valueSub={`${tableCount} ${tableCount === 1 ? 'table' : 'tables'} at start · Top 10 paid`}
          />
          <SummaryRow
            screen="stack"
            label="Starting stack"
            value={`${values.startingStack.toLocaleString()} chips`}
          />
          <SummaryRow
            screen="blinds"
            label="Blinds"
            value={blindLabel(values.blindMode, values.blindIntervalMinutes)}
          />
          <SummaryRow
            screen="payouts"
            label="Payouts"
            value={presetMeta?.label ?? values.prizePresetId}
            valueSub={
              values.buyInMode === 'freeroll'
                ? 'Creator cut: 0% (freeroll)'
                : `Creator cut: ${values.creatorFeePercent}%`
            }
          />
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {!validation.ok && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200">
            Finish required fields before publishing: {validation.firstError}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 pt-2">
          <button
            type="button"
            onClick={() => go('payouts')}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-white/20 hover:bg-white/10"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <button
            type="button"
            disabled={submitting || !validation.ok}
            onClick={handlePublish}
            className="inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm font-bold text-white transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 sm:text-[15px]"
            style={{
              background: 'linear-gradient(135deg, #10b981, #06b6d4)',
              boxShadow: '0 8px 28px -8px rgba(16,185,129,0.55), 0 0 0 1px rgba(16,185,129,0.3)',
            }}
          >
            {submitting ? 'Publishing…' : 'Publish tournament'}
            <ArrowRight size={15} />
          </button>
        </div>

        <p className="text-center text-[11px] text-slate-600">
          Pencil edit any row above to jump back. Your inputs are kept until you close this page.
        </p>
      </div>
    </div>
  );
}

function SummaryRow({
  screen,
  label,
  value,
  valueSub,
  warn,
}: {
  screen: MttWizardScreen;
  label: string;
  value: string;
  valueSub?: string;
  warn?: boolean;
}) {
  const { go } = useMttCreator();
  return (
    <div
      className={`group flex items-center justify-between gap-4 rounded-xl border px-4 py-3 ${
        warn ? 'border-amber-500/40 bg-amber-500/[0.04]' : 'border-white/10 bg-black/30'
      }`}
    >
      <div className="min-w-0">
        <div
          className="text-[10px] font-bold uppercase text-cyan-400"
          style={{ letterSpacing: '0.2em' }}
        >
          {label}
        </div>
        <div className="mt-0.5 truncate text-sm font-semibold text-white">{value}</div>
        {valueSub && <div className="mt-0.5 truncate text-[12px] text-slate-500">{valueSub}</div>}
      </div>
      <button
        type="button"
        onClick={() => go(screen)}
        className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] p-2 text-slate-400 transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-300"
        aria-label={`Edit ${label}`}
      >
        <Pencil size={14} />
      </button>
    </div>
  );
}

function blindLabel(mode: PokerBlindIncreaseMode, minutes: number): string {
  switch (mode) {
    case 'by_time': return `By time · ${minutes} min levels`;
    case 'by_hand': return 'By hand · schedule advances each hand';
    case 'knockout': return 'Knockout · doubles per bust';
    default: return mode;
  }
}

function formatScheduledLocal(date: string, time: string): string {
  const iso = `${date}T${time}`;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return `${date} ${time}`;
  return d.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

interface Validation {
  ok: boolean;
  firstError: string | null;
}

function validateValues(v: MttFormValues): Validation {
  if (!v.name.trim() || v.name.trim().length < 3) return { ok: false, firstError: 'name is required' };
  if (!v.scheduledDate || !v.scheduledTime) return { ok: false, firstError: 'start time is required' };
  const start = new Date(`${v.scheduledDate}T${v.scheduledTime}`).getTime();
  if (!Number.isFinite(start) || start <= Date.now()) return { ok: false, firstError: 'start time must be in the future' };
  if (v.buyInMode === 'chips') {
    if (!/^\d+$/.test(v.buyInChips) || Number(v.buyInChips) <= 0) return { ok: false, firstError: 'buy-in must be positive' };
  } else {
    if (!/^\d+$/.test(v.guaranteedPool) || Number(v.guaranteedPool) <= 0) return { ok: false, firstError: 'guaranteed pool must be positive' };
  }
  if (v.maxPlayers < 2) return { ok: false, firstError: 'field size must be at least 2' };
  if (v.seatsPerTable < 4) return { ok: false, firstError: 'seats per table must be at least 4' };
  if (v.startingStack < 1000) return { ok: false, firstError: 'starting stack must be at least 1000' };
  if (v.isPrivate && v.privatePin && !/^\d{4,12}$/.test(v.privatePin)) return { ok: false, firstError: 'PIN must be 4–12 digits' };
  return { ok: true, firstError: null };
}

/**
 * Map the wizard form state to the `CreatePokerTournamentParams` shape the server expects.
 * Returns null if validation fails (Review screen blocks the Publish button in that case).
 */
function buildCreateParams(v: MttFormValues): CreatePokerTournamentParams | null {
  const validation = validateValues(v);
  if (!validation.ok) return null;

  const minPlayers = Math.min(v.maxPlayers, Math.max(2, Math.min(10, 2)));
  // Top-10 paid (or less when field < 10). The validator on the server expects
  // `min(maxPlayers, 10)` percentages summing to 100; `buildPrizePercents` caps at 10.
  const prizeSlotCount = Math.min(10, v.maxPlayers);
  const prizePercentages = buildPrizePercents(v.prizePresetId, prizeSlotCount);

  const scheduledStartAtIso = new Date(`${v.scheduledDate}T${v.scheduledTime}`).toISOString();

  // Freerolls have buy-in 0 + guaranteed pool from creator chip wallet.
  // Buy-in tournaments have positive buy-in and no guaranteed pool.
  const isFreeroll = v.buyInMode === 'freeroll';
  const buyInAmountStr = isFreeroll ? '0' : v.buyInChips;
  const guaranteedPrizePool = isFreeroll ? v.guaranteedPool : undefined;
  const guaranteedPrizePoolSource = isFreeroll ? ('creator' as const) : undefined;

  return {
    name: v.name.trim(),
    buyInAmount: buyInAmountStr,
    ...(guaranteedPrizePool ? { guaranteedPrizePool } : {}),
    ...(guaranteedPrizePoolSource ? { guaranteedPrizePoolSource } : {}),
    prizeDistributionType: 'custom',
    prizePercentages: [...prizePercentages],
    config: {
      ...POKER_TOURNAMENT_DEFAULT_CONFIG,
      startingStack: v.startingStack,
      minPlayers,
      maxPlayers: v.maxPlayers,
      blindIncreaseMode: v.blindMode,
      ...(v.blindMode === 'by_time' ? { blindIntervalMinutes: v.blindIntervalMinutes } : {}),
      seatsPerTable: v.seatsPerTable,
    },
    isPrivate: v.isPrivate,
    ...(v.isPrivate && v.privatePin ? { pinCode: v.privatePin } : {}),
    scheduledStartAt: scheduledStartAtIso,
    creatorFeePercent: isFreeroll ? 0 : v.creatorFeePercent,
  };
}
