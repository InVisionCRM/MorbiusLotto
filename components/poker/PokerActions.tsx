'use client';

import React, { useEffect, useMemo, useState } from 'react';

type Amount = bigint;

function safeParseAmount(input: string): Amount | null {
  try {
    const cleaned = input.trim();
    if (!cleaned) return null;
    if (!/^[0-9]+$/.test(cleaned)) return null;
    return BigInt(cleaned);
  } catch {
    return null;
  }
}

function clampAmount(value: Amount, min: Amount, max: Amount): Amount {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function formatAmount(v: Amount): string {
  return v.toString();
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
    const amt = formatAmount(clamped);
    if (isFacingBet) onRaise(amt);
    else onBet(amt);
  };

  const secondaryLabel = canCheck ? 'Check' : `Call ${formatAmount(callAmt)}`;
  const handleSecondary = () => {
    if (canCheck) onCheck();
    else onCall();
  };

  return (
    <div
      className="w-full max-w-[720px] rounded-2xl border border-cyan-500/25 bg-slate-950/55 backdrop-blur-md px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_40px_rgba(0,0,0,0.6)]"
      role="group"
      aria-label="Poker actions"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onFold}
            className="h-10 px-4 rounded-xl bg-red-500/15 text-red-200 border border-red-500/30 hover:bg-red-500/25 hover:border-red-400/50 transition text-sm font-medium"
          >
            Fold
          </button>
          <button
            type="button"
            onClick={handleSecondary}
            className="h-10 px-4 rounded-xl bg-slate-400/10 text-slate-100 border border-slate-400/20 hover:bg-slate-400/15 hover:border-slate-300/30 transition text-sm font-medium"
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

        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end leading-none">
            <span className="text-[11px] text-slate-300/80">Min {formatAmount(minRaiseAmt)}</span>
            <span className="text-[11px] text-slate-300/80">Stack {formatAmount(stackAmt)}</span>
          </div>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            type="text"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            className="h-10 w-[110px] rounded-xl bg-slate-900/60 border border-cyan-500/25 px-3 text-white text-sm outline-none focus:ring-2 focus:ring-cyan-400/40"
            aria-label={isFacingBet ? 'Raise amount' : 'Bet amount'}
          />
          <button
            type="button"
            onClick={handlePrimary}
            disabled={!hasValidAmount}
            className="h-10 px-5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-semibold shadow-[0_10px_22px_rgba(0,0,0,0.45)] hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:hover:from-cyan-600 disabled:hover:to-blue-600 transition"
          >
            {primaryLabel}
          </button>
        </div>
      </div>

      <div className="sm:hidden mt-2 flex flex-wrap gap-1.5">
        {quickSizes.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => setCustomAmount(formatAmount(clampAmount(q.value, minRaiseAmt, stackAmt)))}
            disabled={stackAmt === 0n}
            className="h-9 px-3 rounded-xl bg-cyan-400/10 text-cyan-100 border border-cyan-400/20 hover:bg-cyan-400/15 hover:border-cyan-300/30 transition text-xs font-semibold disabled:opacity-50"
          >
            {q.label}
          </button>
        ))}
      </div>

      {clamped != null && parsed != null && parsed !== clamped && (
        <div className="mt-2 text-[11px] text-amber-200/80">
          Amount adjusted to {formatAmount(clamped)} to fit min/stack.
        </div>
      )}
    </div>
  );
}
