'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { formatEther, parseEther } from 'viem';

type Amount = bigint;

/** Parse human amount (e.g. "1000" or "1,000") to wei. */
function safeParseAmount(input: string): Amount | null {
  try {
    const cleaned = input.trim().replace(/,/g, '');
    if (!cleaned) return null;
    return parseEther(cleaned);
  } catch {
    return null;
  }
}

function clampAmount(value: Amount, min: Amount, max: Amount): Amount {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Human-readable display (e.g. 1000000000000000000000 -> "1,000") */
function formatAmount(v: Amount): string {
  return Number(formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export interface PokerActionsProps {
  /** Can the current player act (is it their turn and not folded)? */
  canAct: boolean;
  /** Can check (current bet to call is 0)? */
  canCheck: boolean;
  /** Minimum raise amount (string) */
  minRaise: string;
  /** Current player stack (string) for max bet */
  stack: string;
  /** Call amount (string) - 0 if can check */
  callAmount: string;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onBet: (amount: string) => void;
  onRaise: (amount: string) => void;
}

export function PokerActions({
  canAct,
  canCheck,
  minRaise,
  stack,
  callAmount,
  onFold,
  onCheck,
  onCall,
  onBet,
  onRaise,
}: PokerActionsProps) {
  const minRaiseAmt = useMemo(() => safeParseAmount(minRaise) ?? 0n, [minRaise]);
  const stackAmt = useMemo(() => safeParseAmount(stack) ?? 0n, [stack]);
  const callAmt = useMemo(() => safeParseAmount(callAmount) ?? 0n, [callAmount]);

  const isFacingBet = callAmt > 0n;
  const primaryLabel = isFacingBet ? 'Raise' : 'Bet';

  const [customAmount, setCustomAmount] = useState(() => formatAmount(minRaiseAmt));

  useEffect(() => {
    // Keep the input aligned with server constraints when a new street/hand updates minRaise.
    // Only auto-bump if the user entered something smaller.
    const current = safeParseAmount(customAmount);
    if (current == null || current < minRaiseAmt) setCustomAmount(formatAmount(minRaiseAmt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minRaiseAmt]);

  if (!canAct) return null;

  const quickSizes: Array<{ label: string; value: Amount }> = [
    { label: 'Min', value: minRaiseAmt },
    { label: '½', value: stackAmt / 2n },
    { label: 'Pot', value: clampAmount(callAmt * 2n, minRaiseAmt, stackAmt) },
    { label: 'All-in', value: stackAmt },
  ];

  const parsed = safeParseAmount(customAmount);
  const clamped = parsed == null ? null : clampAmount(parsed, minRaiseAmt, stackAmt);
  const hasValidAmount = clamped != null && stackAmt > 0n;

  const handlePrimary = () => {
    if (!hasValidAmount || clamped == null) return;
    const amtWei = clamped.toString();
    if (isFacingBet) onRaise(amtWei);
    else onBet(amtWei);
  };

  const secondaryLabel = canCheck ? 'Check' : `Call ${formatAmount(callAmt)}`;
  const handleSecondary = () => {
    if (canCheck) onCheck();
    else onCall();
  };

  return (
    <div
      className="w-full max-w-[720px] rounded-xl sm:rounded-2xl border border-cyan-500/25 bg-slate-950/55 backdrop-blur-md px-2 py-2 sm:px-3 sm:py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_40px_rgba(0,0,0,0.6)]"
      role="group"
      aria-label="Poker actions"
    >
      <div className="flex flex-wrap items-center justify-center sm:justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onFold}
            className="h-8 sm:h-10 px-2.5 sm:px-4 rounded-lg sm:rounded-xl bg-red-500/15 text-red-200 border border-red-500/30 hover:bg-red-500/25 hover:border-red-400/50 transition text-xs sm:text-sm font-medium"
          >
            Fold
          </button>
          <button
            type="button"
            onClick={handleSecondary}
            className="h-8 sm:h-10 px-2.5 sm:px-4 rounded-lg sm:rounded-xl bg-slate-400/10 text-slate-100 border border-slate-400/20 hover:bg-slate-400/15 hover:border-slate-300/30 transition text-xs sm:text-sm font-medium min-w-0 max-w-[100px] sm:max-w-none truncate"
          >
            {secondaryLabel}
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-1.5">
          {quickSizes.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setCustomAmount(formatAmount(clampAmount(q.value, minRaiseAmt, stackAmt)))}
              disabled={stackAmt === 0n}
              className="h-9 px-3 rounded-xl bg-cyan-400/10 text-cyan-100 border border-cyan-400/20 hover:bg-cyan-400/15 hover:border-cyan-300/30 transition text-xs font-semibold disabled:opacity-50"
              title={q.label}
            >
              {q.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 justify-end">
          <div className="hidden sm:flex flex-col items-end leading-none shrink-0">
            <span className="text-[9px] sm:text-[11px] text-slate-300/80">Min {formatAmount(minRaiseAmt)}</span>
            <span className="text-[9px] sm:text-[11px] text-slate-300/80">Stack {formatAmount(stackAmt)}</span>
          </div>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            type="text"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            className="h-8 sm:h-10 w-16 sm:w-[110px] rounded-lg sm:rounded-xl bg-slate-900/60 border border-cyan-500/25 px-2 sm:px-3 text-white text-xs sm:text-sm outline-none focus:ring-2 focus:ring-cyan-400/40"
            aria-label={isFacingBet ? 'Raise amount' : 'Bet amount'}
          />
          <button
            type="button"
            onClick={handlePrimary}
            disabled={!hasValidAmount}
            className="h-8 sm:h-10 px-3 sm:px-5 rounded-lg sm:rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs sm:text-sm font-semibold shadow-[0_10px_22px_rgba(0,0,0,0.45)] hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:hover:from-cyan-600 disabled:hover:to-blue-600 transition shrink-0"
          >
            {primaryLabel}
          </button>
        </div>
      </div>

      <div className="sm:hidden mt-1.5 flex flex-wrap gap-1 justify-center">
        {quickSizes.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => setCustomAmount(formatAmount(clampAmount(q.value, minRaiseAmt, stackAmt)))}
            disabled={stackAmt === 0n}
            className="h-7 px-2 rounded-lg bg-cyan-400/10 text-cyan-100 border border-cyan-400/20 hover:bg-cyan-400/15 hover:border-cyan-300/30 transition text-[10px] font-semibold disabled:opacity-50"
          >
            {q.label}
          </button>
        ))}
      </div>

      {clamped != null && parsed != null && parsed !== clamped && (
        <div className="mt-1.5 sm:mt-2 text-[10px] sm:text-[11px] text-amber-200/80">
          Amount adjusted to {formatAmount(clamped)} to fit min/stack.
        </div>
      )}
    </div>
  );
}
