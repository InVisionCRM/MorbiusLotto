'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { formatEther, parseEther } from 'viem';

type Amount = bigint;

function parsePropWei(s: string): Amount {
  try { return BigInt(s); } catch { return 0n; }
}

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

function formatAmount(v: Amount): string {
  const n = Number(formatEther(v));
  return Number.isInteger(n)
    ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Convert a wei bigint to a plain chip number for slider math */
function toChips(v: Amount): number {
  return Number(formatEther(v));
}

export interface PokerActionsProps {
  canAct: boolean;
  canCheck: boolean;
  minRaise: string;
  stack: string;
  callAmount: string;
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
  const minRaiseAmt = useMemo(() => parsePropWei(minRaise), [minRaise]);
  const stackAmt    = useMemo(() => parsePropWei(stack),    [stack]);
  const callAmt     = useMemo(() => parsePropWei(callAmount),[callAmount]);
  const potAmt      = useMemo(() => parsePropWei(pot),       [pot]);

  const isFacingBet = callAmt > 0n;

  const [customAmount, setCustomAmount] = useState(() => formatAmount(minRaiseAmt));

  useEffect(() => {
    const current = safeParseAmount(customAmount);
    if (current == null || current < minRaiseAmt) setCustomAmount(formatAmount(minRaiseAmt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minRaiseAmt]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const parsed  = safeParseAmount(customAmount);
  const clamped = parsed == null ? null : clampAmount(parsed, minRaiseAmt, stackAmt);
  const hasValidAmount = clamped != null && stackAmt > 0n;

  const minChips   = toChips(minRaiseAmt);
  const maxChips   = toChips(stackAmt);
  const stepChips  = Math.max(1, Math.round(minChips / 10)); // ~10% of min as step
  const sliderVal  = clamped != null ? Math.max(minChips, Math.min(maxChips, toChips(clamped))) : minChips;

  // ── Quick size presets ─────────────────────────────────────────────────────
  const quickSizes: Array<{ label: string; value: Amount }> = [
    { label: 'Min',   value: minRaiseAmt },
    { label: '½ Pot', value: clampAmount(potAmt / 2n, minRaiseAmt, stackAmt) },
    { label: 'Pot',   value: clampAmount(potAmt + callAmt, minRaiseAmt, stackAmt) },
    { label: 'Max',   value: stackAmt },
  ];

  // ── Sound helpers ──────────────────────────────────────────────────────────
  const playSound = (src: string) => { new Audio(src).play().catch(() => {}); };

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handlePrimary = () => {
    if (!hasValidAmount || clamped == null) return;
    if (isFacingBet) onRaise(clamped.toString());
    else             onBet(clamped.toString());
  };

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCustomAmount(val.toLocaleString(undefined, { maximumFractionDigits: 2 }));
  };

  const nudge = (dir: 1 | -1) => {
    const base = clamped ?? minRaiseAmt;
    const step = minRaiseAmt > 0n ? minRaiseAmt : parseEther('1');
    const next = clampAmount(base + BigInt(dir) * step, minRaiseAmt, stackAmt);
    setCustomAmount(formatAmount(next));
  };

  const primaryLabel = isFacingBet
    ? `Raise To ${hasValidAmount && clamped ? formatAmount(clamped) : '—'}`
    : `Bet ${hasValidAmount && clamped ? formatAmount(clamped) : '—'}`;

  const secondaryLabel = canCheck ? 'Check' : `Call ${formatAmount(callAmt)}`;

  const handleFoldWithSound = () => {
    playSound('/sounds/negative.mp3');
    onFold();
  };

  const handleSecondary = () => {
    if (canCheck) {
      playSound('/BlackJack/sounds/knock.wav');
      onCheck();
    } else {
      playSound('/sounds/peghit2.mp3');
      onCall();
    }
  };

  const barStyle = {
    background: 'rgba(10,10,10,0.96)',
    border: '1px solid rgba(255,255,255,0.07)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
  };
  const foldBtnStyle = {
    background: 'linear-gradient(180deg, #8b1a1a 0%, #6b1111 100%)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
  };
  const callBtnStyle = {
    background: 'linear-gradient(180deg, #c0392b 0%, #96291f 100%)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
  };
  const inputStyle = {
    background: 'rgba(255,255,255,0.07)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.15)',
    ['--tw-ring-color' as string]: 'rgba(255,255,255,0.3)',
  };
  const nudgeBtnStyle = {
    background: 'rgba(255,255,255,0.07)',
    color: 'rgba(255,255,255,0.7)',
    border: '1px solid rgba(255,255,255,0.12)',
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="w-full select-none"
      style={{
        borderTop: '1px solid rgba(255,255,255,0.07)',
        opacity: canAct ? 1 : 0.45,
        position: 'relative',
        zIndex: 30,
      }}
      role="group"
      aria-label="Poker actions"
    >
      {/* ── Mobile: full-width bar (same layout as desktop, compact) ── */}
      <div
        className="sm:hidden"
        style={{ ...barStyle, paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))', paddingLeft: 'max(8px, env(safe-area-inset-left, 8px))', paddingRight: 'max(8px, env(safe-area-inset-right, 8px))' }}
      >
        <div className="flex items-center justify-center gap-1 pt-1.5 pb-1">
          {quickSizes.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setCustomAmount(formatAmount(clampAmount(q.value, minRaiseAmt, stackAmt)))}
              disabled={!canAct || stackAmt === 0n}
              className="h-7 px-2.5 text-[11px] font-semibold rounded-sm transition-all disabled:pointer-events-none hover:brightness-125 active:scale-95"
              style={{
                color: 'rgba(255,255,255,0.75)',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {q.label}
            </button>
          ))}
        </div>
        <div className="flex items-stretch gap-1.5 pb-2 pt-1">
          <div className="flex gap-1.5 flex-1 min-w-0">
            <button
              type="button"
              onClick={handleFoldWithSound}
              disabled={!canAct}
              className="flex-1 h-11 min-w-0 rounded-sm text-xs font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none"
              style={foldBtnStyle}
            >
              Fold
            </button>
            <button
              type="button"
              onClick={handleSecondary}
              disabled={!canAct}
              className="flex-1 h-11 min-w-0 rounded-sm text-xs font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none truncate px-1"
              style={callBtnStyle}
            >
              {secondaryLabel}
            </button>
            <button
              type="button"
              onClick={handlePrimary}
              disabled={!canAct || !hasValidAmount}
              className="flex-1 h-11 min-w-0 rounded-sm text-xs font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 truncate px-1"
              style={callBtnStyle}
            >
              {primaryLabel}
            </button>
          </div>
          <div className="flex items-center gap-1 shrink-0" style={{ width: '42%' }}>
            <input
              inputMode="numeric"
              pattern="[0-9,]*"
              type="text"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              disabled={!canAct}
              className="h-11 w-14 rounded-sm text-xs font-bold tabular-nums text-center outline-none focus:ring-1 transition disabled:pointer-events-none flex-shrink-0"
              style={inputStyle}
              aria-label={isFacingBet ? 'Raise amount' : 'Bet amount'}
            />
            <button
              type="button"
              onClick={() => nudge(-1)}
              disabled={!canAct || !hasValidAmount}
              className="h-11 w-8 rounded-sm text-sm font-bold transition-all hover:brightness-125 active:scale-95 disabled:pointer-events-none flex items-center justify-center shrink-0"
              style={nudgeBtnStyle}
            >
              −
            </button>
            <div className="flex-1 min-w-0 relative flex items-center">
              <input
                type="range"
                min={minChips}
                max={maxChips || minChips + 1}
                step={stepChips}
                value={sliderVal}
                onChange={handleSlider}
                disabled={!canAct || stackAmt === 0n}
                className="poker-slider poker-slider-mobile w-full disabled:pointer-events-none"
                aria-label="Bet size slider"
              />
            </div>
            <button
              type="button"
              onClick={() => nudge(1)}
              disabled={!canAct || !hasValidAmount}
              className="h-11 w-8 rounded-sm text-sm font-bold transition-all hover:brightness-125 active:scale-95 disabled:pointer-events-none flex items-center justify-center shrink-0"
              style={nudgeBtnStyle}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* ── Desktop: full-width bar ── */}
      <div className="hidden sm:block" style={barStyle}>
        <div className="flex items-center justify-end gap-1 px-2 pt-1.5">
          {quickSizes.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setCustomAmount(formatAmount(clampAmount(q.value, minRaiseAmt, stackAmt)))}
              disabled={!canAct || stackAmt === 0n}
              className="h-7 px-2.5 text-[11px] font-semibold rounded-sm transition-all disabled:pointer-events-none hover:brightness-125 active:scale-95"
              style={{
                color: 'rgba(255,255,255,0.75)',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {q.label}
            </button>
          ))}
        </div>
        <div
          className="flex items-stretch gap-1.5 px-2 pb-2 pt-1"
          style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))' }}
        >
          <div className="flex gap-1.5 flex-1 min-w-0">
            <button
              type="button"
              onClick={handleFoldWithSound}
              disabled={!canAct}
              className="flex-1 h-12 min-w-0 rounded-sm text-sm font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none"
              style={foldBtnStyle}
            >
              Fold
            </button>
            <button
              type="button"
              onClick={handleSecondary}
              disabled={!canAct}
              className="flex-1 h-12 min-w-0 rounded-sm text-sm font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none truncate px-2"
              style={callBtnStyle}
            >
              {secondaryLabel}
            </button>
            <button
              type="button"
              onClick={handlePrimary}
              disabled={!canAct || !hasValidAmount}
              className="flex-1 h-12 min-w-0 rounded-sm text-sm font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 truncate px-2"
              style={callBtnStyle}
            >
              {primaryLabel}
            </button>
          </div>
          <div className="flex items-center gap-1 shrink-0" style={{ width: '44%' }}>
            <input
              inputMode="numeric"
              pattern="[0-9,]*"
              type="text"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              disabled={!canAct}
              className="h-12 w-16 rounded-sm text-sm font-bold tabular-nums text-center outline-none focus:ring-1 transition disabled:pointer-events-none"
              style={inputStyle}
              aria-label={isFacingBet ? 'Raise amount' : 'Bet amount'}
            />
            <button
              type="button"
              onClick={() => nudge(-1)}
              disabled={!canAct || !hasValidAmount}
              className="h-12 w-8 rounded-sm text-lg font-bold transition-all hover:brightness-125 active:scale-95 disabled:pointer-events-none flex items-center justify-center shrink-0"
              style={nudgeBtnStyle}
            >
              −
            </button>
            <div className="flex-1 min-w-0 relative flex items-center">
              <input
                type="range"
                min={minChips}
                max={maxChips || minChips + 1}
                step={stepChips}
                value={sliderVal}
                onChange={handleSlider}
                disabled={!canAct || stackAmt === 0n}
                className="poker-slider w-full disabled:pointer-events-none"
                aria-label="Bet size slider"
              />
            </div>
            <button
              type="button"
              onClick={() => nudge(1)}
              disabled={!canAct || !hasValidAmount}
              className="h-12 w-8 rounded-sm text-lg font-bold transition-all hover:brightness-125 active:scale-95 disabled:pointer-events-none flex items-center justify-center shrink-0"
              style={nudgeBtnStyle}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .poker-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          border-radius: 2px;
          outline: none;
          cursor: pointer;
          background: linear-gradient(
            to right,
            #c0392b ${((sliderVal - minChips) / Math.max(1, maxChips - minChips)) * 100}%,
            rgba(255,255,255,0.18) ${((sliderVal - minChips) / Math.max(1, maxChips - minChips)) * 100}%
          );
        }
        .poker-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid #c0392b;
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0,0,0,0.5);
          transition: transform 0.1s;
        }
        .poker-slider::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }
        .poker-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid #c0392b;
          cursor: pointer;
        }
        .poker-slider-mobile {
          height: 6px;
        }
        .poker-slider-mobile::-webkit-slider-thumb {
          width: 16px;
          height: 16px;
        }
        .poker-slider-mobile::-moz-range-thumb {
          width: 16px;
          height: 16px;
        }
      `}</style>
    </div>
  );
}
