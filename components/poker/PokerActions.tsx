'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { formatEther, parseEther } from 'viem';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { sanitizeDecimalStringForParseEther } from '@/lib/sanitize-decimal-input';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';
import { usePokerSounds } from '@/hooks/use-poker-sounds';

type Amount = bigint;

function parsePropWei(s: string | number): Amount {
  return toBigIntSafe(s);
}

function safeParseAmount(input: string): Amount | null {
  try {
    const cleaned = sanitizeDecimalStringForParseEther(input);
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
  return formatMorbiusFloor(v, { compact: false });
}

/** Convert a wei bigint to a plain chip number for slider math */
function toChips(v: Amount): number {
  return Number(formatEther(v));
}

export interface PokerActionsProps {
  canAct: boolean;
  canCheck: boolean;
  preAction?: PreActionOption;
  minRaise: string;
  stack: string;
  callAmount: string;
  pot: string;
  onPreActionChange?: (next: PreActionOption) => void;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onBet: (amount: string) => void;
  onRaise: (amount: string) => void;
}

export type PreActionOption = 'check_fold' | 'check' | 'call_any' | null;

export function PokerActions({
  canAct,
  canCheck,
  preAction = null,
  minRaise,
  stack,
  callAmount,
  pot,
  onPreActionChange = () => {},
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
  }, [minRaiseAmt]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const parsed  = safeParseAmount(customAmount);
  const clamped = parsed == null ? null : clampAmount(parsed, minRaiseAmt, stackAmt);
  const hasValidAmount = clamped != null && stackAmt > 0n;

  const minChips = toChips(minRaiseAmt);
  const maxChips = toChips(stackAmt);
  const maxOffsetChips = Math.max(0, maxChips - minChips);
  const stepChips = Math.max(1, Math.round(Math.max(minChips, 1) / 10)); // ~10% of min as step
  const sliderOffset = clamped != null ? Math.max(0, toChips(clamped) - minChips) : 0;

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
    // Manual click should always override any queued pre-action.
    onPreActionChange(null);
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
    setCustomAmount(
      Math.floor(minChips + val).toLocaleString(undefined, { maximumFractionDigits: 0 })
    );
  };

  const nudge = (dir: 1 | -1) => {
    const base = clamped ?? minRaiseAmt;
    const step = minRaiseAmt > 0n ? minRaiseAmt : parseEther('1');
    const next = clampAmount(base + BigInt(dir) * step, minRaiseAmt, stackAmt);
    setCustomAmount(formatAmount(next));
  };

  const sliderFillPct = maxOffsetChips > 0 ? (sliderOffset / maxOffsetChips) * 100 : 0;

  const handleFoldWithSound = () => {
    // Manual click should always override any queued pre-action.
    onPreActionChange(null);
    playSound('call', '/POKER/PokerSounds/PlayerClickConfirmation.mp3');
    onFold();
  };

  const handleCheckWithSound = () => {
    // Manual click should always override any queued pre-action.
    onPreActionChange(null);
    playSound('call', '/POKER/PokerSounds/PlayerClickConfirmation.mp3');
    onCheck();
  };

  const handleCallWithSound = () => {
    // Manual click should always override any queued pre-action.
    onPreActionChange(null);
    playSound('call', '/POKER/PokerSounds/PlayerClickConfirmation.mp3');
    onCall();
  };

  const barStyle = {
    background: 'transparent',
    border: 'none',
    boxShadow: 'none',
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
  const preActionLabelClass = 'inline-flex items-center gap-1 text-[10px] md:text-[11px] font-jost text-white/90';

  const togglePreAction = (option: Exclude<PreActionOption, null>) => {
    onPreActionChange(preAction === option ? null : option);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      data-testid="poker-actions"
      className="w-full select-none"
      style={{
        borderTop: 'none',
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
        <div className="flex items-center justify-end gap-2 px-0.5 pt-1">
          <label className={preActionLabelClass}>
            <input
              data-testid="poker-pre-action-check-fold"
              type="checkbox"
              checked={preAction === 'check_fold'}
              onChange={() => togglePreAction('check_fold')}
              disabled={canAct}
              className="h-3 w-3 accent-cyan-400 rounded-sm"
            />
            <span>Check/Fold</span>
          </label>
          <label className={preActionLabelClass}>
            <input
              data-testid="poker-pre-action-check"
              type="checkbox"
              checked={preAction === 'check'}
              onChange={() => togglePreAction('check')}
              disabled={canAct || !canCheck}
              className="h-3 w-3 accent-cyan-400 rounded-sm"
            />
            <span>Check</span>
          </label>
          <label className={preActionLabelClass}>
            <input
              data-testid="poker-pre-action-call-any"
              type="checkbox"
              checked={preAction === 'call_any'}
              onChange={() => togglePreAction('call_any')}
              disabled={canAct}
              className="h-3 w-3 accent-cyan-400 rounded-sm"
            />
            <span>Call Any</span>
          </label>
        </div>
        <div className="grid grid-cols-4 gap-1 pt-1.5 pb-1 px-0.5">
          {quickSizes.map((q) => (
            <button
              data-testid={`poker-quick-size-${q.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
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
        <div className="flex items-stretch gap-1 pb-2 pt-1">
          <div className="flex gap-1.5 flex-1 min-w-0">
            <div className="grid grid-cols-4 gap-1 flex-1 h-11 min-w-0">
              <button
                data-testid="poker-action-fold"
                type="button"
                onClick={handleFoldWithSound}
                disabled={!canAct}
                className={`min-w-0 h-full rounded-xl text-xs font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] ${foldBtnClass}`}
                style={foldBtnStyle}
              >
                Fold
              </button>
              <button
                data-testid="poker-action-check"
                type="button"
                onClick={handleCheckWithSound}
                disabled={!canAct || !canCheck}
                className={`min-w-0 h-full rounded-xl text-xs font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] px-1 ${checkBtnClass}`}
                style={checkBtnStyle}
              >
                Check
              </button>
              <button
                data-testid="poker-action-call"
                type="button"
                onClick={handleCallWithSound}
                disabled={!canAct || !isFacingBet}
                className={`min-w-0 h-full rounded-xl text-[10px] font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] px-1 ${checkBtnClass}`}
                style={{ ...actionBtnBaseStyle, background: 'linear-gradient(180deg, #16a34a 0%, #15803d 100%)' }}
              >
                <span className="flex flex-col items-center justify-center leading-tight whitespace-normal">
                  <span>Call</span>
                  <span className="text-[10px] font-semibold normal-case">{isFacingBet ? formatAmount(callAmt) : '—'}</span>
                </span>
              </button>
              <button
                data-testid="poker-action-primary"
                type="button"
                onClick={handlePrimary}
                disabled={!canAct || !hasValidAmount}
                className={`min-w-0 h-full rounded-xl text-[11px] font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] px-1 ${primaryBtnClass}`}
                style={primaryBtnStyle}
              >
                <span className="flex flex-col items-center justify-center leading-tight whitespace-normal">
                  <span>{isFacingBet ? 'Raise' : 'Bet'}</span>
                  <span className="text-[10px] font-semibold normal-case">
                    {hasValidAmount && clamped ? formatAmount(clamped) : '—'}
                  </span>
                </span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0" style={{ width: '42%' }}>
            <input
              data-testid="poker-action-amount-input"
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
              data-testid="poker-action-nudge-down"
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
                data-testid="poker-action-slider"
                type="range"
                min={0}
                max={maxOffsetChips || 1}
                step={stepChips}
                value={sliderOffset}
                onChange={handleSlider}
                disabled={!canAct || stackAmt === 0n}
                className="poker-slider poker-slider-mobile w-full disabled:pointer-events-none"
                aria-label="Bet size slider"
              />
            </div>
            <button
              data-testid="poker-action-nudge-up"
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
        <div className="flex items-center justify-end gap-2.5 md:gap-3 px-2 md:px-3 pt-1 md:pt-1.5">
          <label className={preActionLabelClass}>
            <input
              data-testid="poker-pre-action-check-fold"
              type="checkbox"
              checked={preAction === 'check_fold'}
              onChange={() => togglePreAction('check_fold')}
              disabled={canAct}
              className="h-3.5 w-3.5 accent-cyan-400 rounded-sm"
            />
            <span>Check/Fold</span>
          </label>
          <label className={preActionLabelClass}>
            <input
              data-testid="poker-pre-action-check"
              type="checkbox"
              checked={preAction === 'check'}
              onChange={() => togglePreAction('check')}
              disabled={canAct || !canCheck}
              className="h-3.5 w-3.5 accent-cyan-400 rounded-sm"
            />
            <span>Check</span>
          </label>
          <label className={preActionLabelClass}>
            <input
              data-testid="poker-pre-action-call-any"
              type="checkbox"
              checked={preAction === 'call_any'}
              onChange={() => togglePreAction('call_any')}
              disabled={canAct}
              className="h-3.5 w-3.5 accent-cyan-400 rounded-sm"
            />
            <span>Call Any</span>
          </label>
        </div>
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
          className="flex items-stretch gap-1 md:gap-1.5 px-2 md:px-3 pb-2 md:pb-3 pt-1 md:pt-1.5"
          style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))' }}
        >
          <div className="flex gap-1.5 md:gap-2 flex-1 min-w-0">
            <div className="grid grid-cols-4 gap-1 md:gap-1.5 flex-1 h-12 md:h-14 min-w-0">
              <button
                data-testid="poker-action-fold"
                type="button"
                onClick={handleFoldWithSound}
                disabled={!canAct}
                className={`min-w-0 h-full rounded-xl text-sm md:text-base font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] ${foldBtnClass}`}
                style={foldBtnStyle}
              >
                Fold
              </button>
              <button
                data-testid="poker-action-check"
                type="button"
                onClick={handleCheckWithSound}
                disabled={!canAct || !canCheck}
                className={`min-w-0 h-full rounded-xl text-xs md:text-sm font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] px-1.5 ${checkBtnClass}`}
                style={checkBtnStyle}
              >
                Check
              </button>
              <button
                data-testid="poker-action-call"
                type="button"
                onClick={handleCallWithSound}
                disabled={!canAct || !isFacingBet}
                className={`min-w-0 h-full rounded-xl text-xs md:text-[13px] font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] px-1.5 ${checkBtnClass}`}
                style={{ ...actionBtnBaseStyle, background: 'linear-gradient(180deg, #16a34a 0%, #15803d 100%)' }}
              >
                <span className="flex flex-col items-center justify-center leading-tight whitespace-normal">
                  <span>Call</span>
                  <span className="text-[10px] md:text-[11px] font-semibold normal-case">{isFacingBet ? formatAmount(callAmt) : '—'}</span>
                </span>
              </button>
              <button
                data-testid="poker-action-primary"
                type="button"
                onClick={handlePrimary}
                disabled={!canAct || !hasValidAmount}
                className={`min-w-0 h-full rounded-xl text-sm md:text-base font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] px-2 ${primaryBtnClass}`}
                style={primaryBtnStyle}
              >
                <span className="flex flex-col items-center justify-center leading-tight whitespace-normal">
                  <span>{isFacingBet ? 'Raise' : 'Bet'}</span>
                  <span className="text-[11px] md:text-xs font-semibold normal-case">
                    {hasValidAmount && clamped ? formatAmount(clamped) : '—'}
                  </span>
                </span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1 md:gap-1.5 shrink-0 w-[48%] md:w-[52%] min-w-0">
            <input
              data-testid="poker-action-amount-input"
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
              data-testid="poker-action-nudge-down"
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
                data-testid="poker-action-slider"
                type="range"
                min={0}
                max={maxOffsetChips || 1}
                step={stepChips}
                value={sliderOffset}
                onChange={handleSlider}
                disabled={!canAct || stackAmt === 0n}
                className="poker-slider poker-slider-desktop w-full disabled:pointer-events-none"
                aria-label="Bet size slider"
              />
            </div>
            <button
              data-testid="poker-action-nudge-up"
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
            #c0392b ${sliderFillPct}%,
            rgba(255,255,255,0.18) ${sliderFillPct}%
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
