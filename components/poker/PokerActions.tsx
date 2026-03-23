'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { formatEther, parseEther } from 'viem';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { usePokerSounds } from '@/hooks/use-poker-sounds';

type Amount = bigint;

function parsePropWei(s: string | number): Amount {
  return toBigIntSafe(s);
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
  const { play } = usePokerSounds();
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
  const playSound = (key: 'raise' | 'call' | 'player_allin', src: string) => { play(key, src); };

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handlePrimary = () => {
    if (!hasValidAmount || clamped == null) return;
    const isAllIn = clamped === stackAmt;
    playSound(
      isAllIn ? 'player_allin' : (isFacingBet ? 'raise' : 'call'),
      isAllIn
        ? '/POKER/PokerSounds/PlayerAll-In.wav'
        : '/POKER/PokerSounds/PlayerClickConfirmation.mp3'
    );
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
    playSound('call', '/POKER/PokerSounds/PlayerClickConfirmation.mp3');
    onFold();
  };

  const handleSecondary = () => {
    playSound('call', '/POKER/PokerSounds/PlayerClickConfirmation.mp3');
    if (canCheck) onCheck();
    else onCall();
  };

  const barStyle = {
    background: '#000',
    border: '1px solid rgba(255,255,255,0.07)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
  };
  const actionBtnBaseStyle = {
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
  };
  const inputStyle = {
    background: canAct ? '#000' : 'rgba(15, 23, 42, 0.5)',
    color: '#22d3ee',
    border: '1px solid rgba(255,255,255,0.15)',
    ['--tw-ring-color' as string]: 'rgba(255,255,255,0.3)',
  };
  const foldBtnClass = 'font-jost text-white disabled:opacity-40 disabled:pointer-events-none';
  const foldBtnStyle = {
    ...actionBtnBaseStyle,
    background: 'linear-gradient(180deg, #b91c1c 0%, #7f1d1d 100%)',
  };
  const checkBtnClass = 'font-jost text-white disabled:opacity-40 disabled:pointer-events-none';
  const checkBtnStyle = {
    ...actionBtnBaseStyle,
    background: canCheck
      ? 'linear-gradient(180deg, #2563eb 0%, #1e40af 100%)'
      : 'linear-gradient(180deg, #16a34a 0%, #15803d 100%)',
  };
  const primaryBtnClass = 'font-jost text-white disabled:opacity-40 disabled:pointer-events-none';
  const primaryBtnStyle = {
    ...actionBtnBaseStyle,
    background: 'linear-gradient(180deg, #16a34a 0%, #15803d 100%)',
  };
  const quickSizeClass = [
    'font-jost',
    'bg-black',
    'text-cyan-400',
    'active:text-purple-500',
    'disabled:bg-slate-900/50',
    'disabled:text-slate-400',
  ].join(' ');

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
        <div className="grid grid-cols-4 gap-1 pt-1.5 pb-1 px-0.5">
          {quickSizes.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setCustomAmount(formatAmount(clampAmount(q.value, minRaiseAmt, stackAmt)))}
              disabled={!canAct || stackAmt === 0n}
              className={`h-9 text-[11px] rounded-sm transition-all disabled:pointer-events-none hover:brightness-125 active:scale-95 ${quickSizeClass}`}
              style={actionBtnBaseStyle}
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
              className={`flex-1 h-11 min-w-0 rounded-sm text-xs font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] ${foldBtnClass}`}
              style={foldBtnStyle}
            >
              Fold
            </button>
            <button
              type="button"
              onClick={handleSecondary}
              disabled={!canAct}
              className={`flex-1 h-11 min-w-0 rounded-sm text-xs font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] truncate px-1 ${checkBtnClass}`}
              style={checkBtnStyle}
            >
              {secondaryLabel}
            </button>
            <button
              type="button"
              onClick={handlePrimary}
              disabled={!canAct || !hasValidAmount}
              className={`flex-1 h-11 min-w-0 rounded-sm text-xs font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] truncate px-1 ${primaryBtnClass}`}
              style={primaryBtnStyle}
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
              className="h-11 w-14 rounded-sm text-xs font-jost font-bold tabular-nums text-center outline-none focus:ring-1 transition disabled:pointer-events-none flex-shrink-0"
              style={inputStyle}
              aria-label={isFacingBet ? 'Raise amount' : 'Bet amount'}
            />
            <button
              type="button"
              onClick={() => nudge(-1)}
              disabled={!canAct || !hasValidAmount}
              className={`h-11 w-8 rounded-sm text-sm transition-all hover:brightness-125 active:scale-95 active:text-purple-500 disabled:pointer-events-none flex items-center justify-center shrink-0 font-jost ${!canAct || !hasValidAmount ? 'bg-slate-900/50 text-slate-400' : 'bg-black text-cyan-400'}`}
              style={{ border: '1px solid rgba(255,255,255,0.12)' }}
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
              className={`h-11 w-8 rounded-sm text-sm transition-all hover:brightness-125 active:scale-95 active:text-purple-500 disabled:pointer-events-none flex items-center justify-center shrink-0 font-jost ${!canAct || !hasValidAmount ? 'bg-slate-900/50 text-slate-400' : 'bg-black text-cyan-400'}`}
              style={{ border: '1px solid rgba(255,255,255,0.12)' }}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* ── Desktop / tablet (sm+): larger touch targets on md+ for readability ── */}
      <div className="hidden sm:block" style={barStyle}>
        <div className="flex items-center justify-end gap-1.5 px-2 md:px-3 pt-1.5 md:pt-2">
          {quickSizes.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setCustomAmount(formatAmount(clampAmount(q.value, minRaiseAmt, stackAmt)))}
              disabled={!canAct || stackAmt === 0n}
              className={`h-8 md:h-10 px-2.5 md:px-3 text-[11px] md:text-sm rounded-sm transition-all disabled:pointer-events-none hover:brightness-125 active:scale-95 ${quickSizeClass}`}
              style={actionBtnBaseStyle}
            >
              {q.label}
            </button>
          ))}
        </div>
        <div
          className="flex items-stretch gap-1.5 md:gap-2 px-2 md:px-3 pb-2 md:pb-3 pt-1 md:pt-1.5"
          style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))' }}
        >
          <div className="flex gap-1.5 md:gap-2 flex-1 min-w-0">
            <button
              type="button"
              onClick={handleFoldWithSound}
              disabled={!canAct}
              className={`flex-1 h-12 md:h-14 min-w-0 rounded-sm text-sm md:text-base font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] ${foldBtnClass}`}
              style={foldBtnStyle}
            >
              Fold
            </button>
            <button
              type="button"
              onClick={handleSecondary}
              disabled={!canAct}
              className={`flex-1 h-12 md:h-14 min-w-0 rounded-sm text-sm md:text-base font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] truncate px-2 ${checkBtnClass}`}
              style={checkBtnStyle}
            >
              {secondaryLabel}
            </button>
            <button
              type="button"
              onClick={handlePrimary}
              disabled={!canAct || !hasValidAmount}
              className={`flex-1 h-12 md:h-14 min-w-0 rounded-sm text-sm md:text-base font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] truncate px-2 ${primaryBtnClass}`}
              style={primaryBtnStyle}
            >
              {primaryLabel}
            </button>
          </div>
          <div className="flex items-center gap-1 md:gap-1.5 shrink-0 w-[44%] md:w-[48%] min-w-0">
            <input
              inputMode="numeric"
              pattern="[0-9,]*"
              type="text"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              disabled={!canAct}
              className="h-12 md:h-14 w-16 md:w-[5.25rem] rounded-sm text-sm md:text-base font-jost font-bold tabular-nums text-center outline-none focus:ring-1 transition disabled:pointer-events-none"
              style={inputStyle}
              aria-label={isFacingBet ? 'Raise amount' : 'Bet amount'}
            />
            <button
              type="button"
              onClick={() => nudge(-1)}
              disabled={!canAct || !hasValidAmount}
              className={`h-12 md:h-14 w-8 md:w-10 rounded-sm text-lg md:text-xl transition-all hover:brightness-125 active:scale-95 active:text-purple-500 disabled:pointer-events-none flex items-center justify-center shrink-0 font-jost ${!canAct || !hasValidAmount ? 'bg-slate-900/50 text-slate-400' : 'bg-black text-cyan-400'}`}
              style={{ border: '1px solid rgba(255,255,255,0.12)' }}
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
                className="poker-slider poker-slider-desktop w-full disabled:pointer-events-none"
                aria-label="Bet size slider"
              />
            </div>
            <button
              type="button"
              onClick={() => nudge(1)}
              disabled={!canAct || !hasValidAmount}
              className={`h-12 md:h-14 w-8 md:w-10 rounded-sm text-lg md:text-xl transition-all hover:brightness-125 active:scale-95 active:text-purple-500 disabled:pointer-events-none flex items-center justify-center shrink-0 font-jost ${!canAct || !hasValidAmount ? 'bg-slate-900/50 text-slate-400' : 'bg-black text-cyan-400'}`}
              style={{ border: '1px solid rgba(255,255,255,0.12)' }}
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
        .poker-slider-desktop {
          height: 5px;
        }
        @media (min-width: 768px) {
          .poker-slider-desktop {
            height: 6px;
          }
          .poker-slider-desktop::-webkit-slider-thumb {
            width: 20px;
            height: 20px;
          }
          .poker-slider-desktop::-moz-range-thumb {
            width: 20px;
            height: 20px;
          }
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
