'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { formatEther, parseEther } from 'viem';

type Amount = bigint;

/** Parse a raw wei string from the server into a bigint. */
function parsePropWei(s: string): Amount {
  try { return BigInt(s); } catch { return 0n; }
}

/** Parse a human-readable chip amount typed by the user (e.g. "1000") into wei. */
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
  // Props arrive as raw wei strings from the server — parse with BigInt, not parseEther
  const minRaiseAmt = useMemo(() => parsePropWei(minRaise), [minRaise]);
  const stackAmt = useMemo(() => parsePropWei(stack), [stack]);
  const callAmt = useMemo(() => parsePropWei(callAmount), [callAmount]);
  const potAmt = useMemo(() => parsePropWei(pot), [pot]);

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
      className="w-full border-t backdrop-blur-md px-2 py-2 sm:px-4 sm:py-3 rounded-t-2xl sm:rounded-none"
      style={{
        borderColor: 'var(--poker-panel-border)',
        background: 'var(--poker-panel-bg)',
        opacity: canAct ? 1 : 0.5,
      }}
      role="group"
      aria-label="Poker actions"
    >
      {/* Quick-size presets — mobile: full row above buttons */}
      <div className="sm:hidden mb-2 flex gap-1.5 justify-center">
        {quickSizes.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => setCustomAmount(formatAmount(clampAmount(q.value, minRaiseAmt, stackAmt)))}
            disabled={!canAct || stackAmt === 0n}
            className="flex-1 h-8 px-1 border rounded transition-all text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 active:brightness-90"
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

      <div className="flex flex-wrap items-center justify-center sm:justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onFold}
            disabled={!canAct}
            className="h-11 sm:h-10 px-4 sm:px-4 rounded border transition-all text-sm font-semibold hover:opacity-80 active:scale-95 active:brightness-90 disabled:cursor-not-allowed"
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
            disabled={!canAct}
            className="h-11 sm:h-10 px-4 sm:px-4 rounded border transition-all text-sm font-semibold min-w-0 max-w-[130px] sm:max-w-none truncate hover:opacity-90 active:scale-95 active:brightness-90 disabled:cursor-not-allowed"
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
              disabled={!canAct || stackAmt === 0n}
              className="h-9 px-3 border transition-all text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 active:brightness-90"
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

        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            type="text"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            disabled={!canAct}
            className="h-11 sm:h-10 w-24 sm:w-[110px] px-2 sm:px-3 text-sm outline-none focus:ring-2 transition shrink-0 rounded disabled:cursor-not-allowed"
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
            disabled={!canAct || !hasValidAmount}
            className="h-11 sm:h-10 px-5 sm:px-5 text-sm font-semibold rounded transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 active:brightness-90"
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

      <div className="mt-1 flex items-center justify-end gap-3 text-[10px]" style={{ color: 'var(--poker-text-muted)' }}>
        {minRaiseAmt > 0n && <span>Min {formatAmount(minRaiseAmt)}</span>}
        {stackAmt > 0n && <span>Stack {formatAmount(stackAmt)}</span>}
        {clamped != null && parsed != null && parsed !== clamped && (
          <span style={{ color: 'var(--poker-chip)' }}>→ adjusted to {formatAmount(clamped)}</span>
        )}
      </div>
    </div>
  );
}
