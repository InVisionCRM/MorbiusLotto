'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { formatEther, parseEther } from 'viem';

type Amount = bigint;

/** Parse human chip amount (e.g. "1000" or "1,000") to wei. */
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

/** Human-readable chip display (wei -> "1,000") */
function formatAmount(v: Amount): string {
  const n = Number(formatEther(v));
  return Number.isInteger(n)
    ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  /** Current pot (string wei) for pot-sized bet calculation */
  pot: string;
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
  pot,
  onFold,
  onCheck,
  onCall,
  onBet,
  onRaise,
}: PokerActionsProps) {
  const minRaiseAmt = useMemo(() => safeParseAmount(minRaise) ?? 0n, [minRaise]);
  const stackAmt = useMemo(() => safeParseAmount(stack) ?? 0n, [stack]);
  const callAmt = useMemo(() => safeParseAmount(callAmount) ?? 0n, [callAmount]);
  const potAmt = useMemo(() => safeParseAmount(pot) ?? 0n, [pot]);

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
    { label: 'Pot', value: clampAmount(potAmt + callAmt, minRaiseAmt, stackAmt) },
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
      className="w-full max-w-[720px] rounded-xl sm:rounded-2xl border backdrop-blur-md px-2 py-2 sm:px-3 sm:py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_40px_rgba(0,0,0,0.6)]"
      style={{
        borderColor: 'var(--poker-panel-border)',
        background: 'var(--poker-panel-bg)',
      }}
      role="group"
      aria-label="Poker actions"
    >
      <div className="flex flex-wrap items-center justify-center sm:justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onFold}
            className="h-8 sm:h-10 px-2.5 sm:px-4 rounded-lg sm:rounded-xl border transition text-xs sm:text-sm font-medium hover:opacity-80"
            style={{
              color: 'var(--poker-danger)',
              borderColor: 'var(--poker-danger-muted)',
              background: 'color-mix(in srgb, var(--poker-danger) 15%, transparent)',
            }}
          >
            Fold
          </button>
          <button
            type="button"
            onClick={handleSecondary}
            className="h-8 sm:h-10 px-2.5 sm:px-4 rounded-lg sm:rounded-xl border transition text-xs sm:text-sm font-medium min-w-0 max-w-[100px] sm:max-w-none truncate hover:opacity-90"
            style={{
              color: 'var(--poker-text)',
              borderColor: 'var(--poker-panel-border)',
              background: 'color-mix(in srgb, var(--poker-accent) 10%, transparent)',
            }}
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
              className="h-9 px-3 rounded-xl border transition text-xs font-semibold disabled:opacity-50 hover:opacity-90"
              style={{
                color: 'var(--poker-accent)',
                borderColor: 'var(--poker-accent-muted)',
                background: 'color-mix(in srgb, var(--poker-accent) 10%, transparent)',
              }}
              title={q.label}
            >
              {q.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 justify-end">
          <div className="hidden sm:flex flex-col items-end leading-none shrink-0">
            <span className="text-[9px] sm:text-[11px]" style={{ color: 'var(--poker-text-muted)' }}>Min {formatAmount(minRaiseAmt)}</span>
            <span className="text-[9px] sm:text-[11px]" style={{ color: 'var(--poker-text-muted)' }}>Stack {formatAmount(stackAmt)}</span>
          </div>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            type="text"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            className="h-8 sm:h-10 w-16 sm:w-[110px] rounded-lg sm:rounded-xl px-2 sm:px-3 text-xs sm:text-sm outline-none focus:ring-2 transition shrink-0"
            style={{
              color: 'var(--poker-text)',
              background: 'var(--poker-bg-elevated)',
              borderColor: 'var(--poker-panel-border)',
              ['--tw-ring-color' as string]: 'var(--poker-accent)',
            }}
            aria-label={isFacingBet ? 'Raise amount' : 'Bet amount'}
          />
          <button
            type="button"
            onClick={handlePrimary}
            disabled={!hasValidAmount}
            className="h-8 sm:h-10 px-3 sm:px-5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold transition shrink-0 disabled:opacity-50 hover:opacity-90"
            style={{
              color: 'var(--poker-bg)',
              background: 'var(--poker-accent)',
              boxShadow: '0 10px 22px rgba(0,0,0,0.45)',
            }}
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
            className="h-7 px-2 rounded-lg border transition text-[10px] font-semibold disabled:opacity-50 hover:opacity-90"
            style={{
              color: 'var(--poker-accent)',
              borderColor: 'var(--poker-accent-muted)',
              background: 'color-mix(in srgb, var(--poker-accent) 10%, transparent)',
            }}
          >
            {q.label}
          </button>
        ))}
      </div>

      {clamped != null && parsed != null && parsed !== clamped && (
        <div className="mt-1.5 sm:mt-2 text-[10px] sm:text-[11px]" style={{ color: 'var(--poker-chip)' }}>
          Amount adjusted to {formatAmount(clamped)} to fit min/stack.
        </div>
      )}
    </div>
  );
}
