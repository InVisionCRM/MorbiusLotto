'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { toChipInt, formatChips } from '@/lib/format-poker-chips';
import { usePokerSounds } from '@/hooks/use-poker-sounds';
import { SponsoredTokenMarquee } from './SponsoredTokenMarquee';

type Amount = bigint;

function parseProp(s: string | number): Amount {
  return toChipInt(s);
}

function safeParseAmount(input: string): Amount | null {
  const cleaned = input.replace(/[,\s]/g, '');
  if (!cleaned || !/^\d+$/.test(cleaned)) return null;
  try {
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
  return formatChips(v);
}

/** Chips to Number for slider math (bounded by MAX_SAFE_INTEGER). */
function toChipsNum(v: Amount): number {
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
  return Number(v);
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
  /** When "floating", renders the fullscreen horizontal strip layout */
  variant?: 'default' | 'floating';
  /** Legacy: last-action recap line. Replaced by the always-on sponsored-token marquee. */
  lastActionLine?: string | null;
  /**
   * Active sponsor token (or null to fall back to MORBIUS default).
   * Drives the marquee that lives where `lastActionLine` used to render.
   */
  sponsoredToken?: {
    address: string;
    name: string | null;
    symbol: string | null;
    logoUrl: string | null;
  } | null;
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
  variant = 'default',
  lastActionLine: _lastActionLine = null,
  sponsoredToken = null,
}: PokerActionsProps) {
  const { play } = usePokerSounds();
  const minRaiseAmt = useMemo(() => parseProp(minRaise), [minRaise]);
  const stackAmt    = useMemo(() => parseProp(stack),    [stack]);
  const callAmt     = useMemo(() => parseProp(callAmount),[callAmount]);
  const potAmt      = useMemo(() => parseProp(pot),       [pot]);

  const isFacingBet = callAmt > 0n;

  const [customAmount, setCustomAmount] = useState(() => formatAmount(minRaiseAmt));

  // Snap the slider back to the minimum at the start of every action turn and
  // whenever the min itself changes. Without this the slider carries over the
  // previous turn's value (e.g. all-in) and players accidentally jam.
  useEffect(() => {
    if (!canAct) return;
    setCustomAmount(formatAmount(minRaiseAmt));
  }, [canAct, minRaiseAmt]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const parsed  = safeParseAmount(customAmount);
  const clamped = parsed == null ? null : clampAmount(parsed, minRaiseAmt, stackAmt);
  const hasValidAmount = clamped != null && stackAmt > 0n;

  const minChips = toChipsNum(minRaiseAmt);
  const maxChips = toChipsNum(stackAmt);
  const maxOffsetChips = Math.max(0, maxChips - minChips);
  const stepChips = Math.max(1, Math.round(Math.max(minChips, 1) / 10)); // ~10% of min as step
  /** Slider position is derived from the raise/bet amount (single source of truth: customAmount). */
  const sliderChips =
    clamped == null || maxOffsetChips <= 0
      ? 0
      : Math.max(0, Math.min(maxOffsetChips, toChipsNum(clamped) - minChips));

  // ── Quick size presets ─────────────────────────────────────────────────────
  const quickSizes: Array<{ label: string; value: Amount }> = [
    { label: 'Min',   value: minRaiseAmt },
    { label: '½ Pot', value: clampAmount(potAmt / 2n, minRaiseAmt, stackAmt) },
    { label: 'Pot',   value: clampAmount(potAmt + callAmt, minRaiseAmt, stackAmt) },
    { label: 'All-in', value: stackAmt },
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
    const rawChips = BigInt(Math.max(0, Math.round(minChips + val)));
    const clampedChips = clampAmount(rawChips, minRaiseAmt, stackAmt);
    setCustomAmount(formatAmount(clampedChips));
  };

  const nudge = (dir: 1 | -1) => {
    const base = clamped ?? minRaiseAmt;
    const step = minRaiseAmt > 0n ? minRaiseAmt : 1n;
    const next = clampAmount(base + BigInt(dir) * step, minRaiseAmt, stackAmt);
    setCustomAmount(formatAmount(next));
  };

  const sliderFillPct = maxOffsetChips > 0 ? (sliderChips / maxOffsetChips) * 100 : 0;

  const primaryReady = canAct && hasValidAmount;

  /** Outer “deck” shell — Plinko greys + subtle cyan rim (75% strip is centered by parent). */
  const panelDeckStyle: React.CSSProperties = {
    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.88), rgba(40, 40, 40, 0.72))',
    boxShadow:
      'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 2px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(34, 211, 238, 0.12)',
    border: '1px inset rgba(60, 60, 60, 0.5)',
    borderRadius: '14px',
  };

  /** Fold / Check / Call — cool slate, faint cyan edge to match table chrome. */
  const commitZoneStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.55), rgba(15, 23, 42, 0.72))',
    border: '1px solid rgba(34, 211, 238, 0.14)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
    borderRadius: '10px',
  };

  /** Presets / slider row — teal-tinted shell (Plinko cyan accent, not loud fills). */
  const tuneZoneStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, rgba(28, 32, 38, 0.78), rgba(22, 40, 48, 0.58))',
    border: '1px solid rgba(34, 211, 238, 0.2)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
    borderRadius: '10px',
  };

  const commitBtnInset = 'inset 0 1px 0 rgba(255, 255, 255, 0.08)';

  /** Presets / nudges — black ~20% opacity gradient (reads as glass on the tune strip). */
  const tuneGlassBtnStyle: React.CSSProperties = {
    background: 'linear-gradient(325deg, rgba(0, 0, 0, 0.22), rgba(0, 0, 0, 0.12))',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    boxShadow: `${commitBtnInset}, 0 0 4px rgba(0, 0, 0, 0.25)`,
  };

  const tuneGlassBtnMutedStyle: React.CSSProperties = {
    background: 'linear-gradient(325deg, rgba(0, 0, 0, 0.14), rgba(0, 0, 0, 0.08))',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    boxShadow: commitBtnInset,
  };

  /** Fold / Check / Call — each action keeps a clear hue (fold / check / call). */
  const foldBtnStyleCommit: React.CSSProperties = {
    border: '1px solid rgba(252, 165, 165, 0.45)',
    boxShadow: `${commitBtnInset}, 0 0 5px rgba(185, 28, 28, 0.1)`,
    background: 'linear-gradient(180deg, #b91c1c 0%, #991b1b 45%, #7f1d1d 100%)',
  };

  const checkBtnStyleCommit: React.CSSProperties = {
    border: canCheck ? '1px solid rgba(147, 197, 253, 0.5)' : '1px solid rgba(148, 163, 184, 0.35)',
    boxShadow: canCheck ? `${commitBtnInset}, 0 0 5px rgba(37, 99, 235, 0.1)` : commitBtnInset,
    background: canCheck
      ? 'linear-gradient(180deg, #3b82f6 0%, #2563eb 45%, #1d4ed8 100%)'
      : 'linear-gradient(180deg, #4b5563 0%, #374151 55%, #1f2937 100%)',
  };

  const callBtnStyleCommit: React.CSSProperties = {
    border: '1px solid rgba(134, 239, 172, 0.45)',
    boxShadow: `${commitBtnInset}, 0 0 5px rgba(22, 163, 74, 0.1)`,
    background: 'linear-gradient(180deg, #22c55e 0%, #16a34a 45%, #15803d 100%)',
  };

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

  const foldBtnClass = 'font-jost text-white disabled:opacity-40 disabled:pointer-events-none';
  const checkBtnClass = 'font-jost text-white disabled:opacity-40 disabled:pointer-events-none';
  const primaryBtnClass =
    'font-jost text-white hover:brightness-105 disabled:opacity-40 disabled:pointer-events-none';
  /** Teal primary: darker than prior neon so it sits closer to Fold/Check/Call weight. */
  const primaryBtnStyle: React.CSSProperties = {
    border: 'none',
    background: primaryReady
      ? 'linear-gradient(180deg, #0d9488 0%, #0f766e 44%, #115e59 100%)'
      : 'linear-gradient(180deg, #0e7490 0%, #155e75 46%, #164e63 100%)',
    boxShadow: primaryReady
      ? `${commitBtnInset}, 0 0 4px rgba(15, 118, 110, 0.14)`
      : `${commitBtnInset}, 0 0 3px rgba(14, 116, 144, 0.1)`,
  };
  const quickSizeClass = [
    'font-jost',
    'text-white',
    'active:brightness-110',
    'disabled:opacity-45',
    'disabled:pointer-events-none',
  ].join(' ');
  const preActionLabelClass = 'inline-flex items-center gap-1 text-[10px] md:text-[11px] font-jost text-white/90';

  const togglePreAction = (option: Exclude<PreActionOption, null>) => {
    onPreActionChange(preAction === option ? null : option);
  };

  // ── Floating strip (fullscreen mode) ──────────────────────────────────────
  if (variant === 'floating') {
    return (
      <div
        data-testid="poker-actions"
        className="w-full select-none flex justify-center min-w-0"
        style={{ opacity: canAct ? 1 : 0.45 }}
        role="group"
        aria-label="Poker actions"
      >
        <div
          className="flex w-full min-w-0 max-w-full flex-col gap-2 px-2 py-2 sm:px-3 sm:py-2.5 md:max-w-[75%] md:px-4 md:py-3"
          style={panelDeckStyle}
        >
        <div className="flex min-w-0 flex-col items-stretch gap-2 min-[700px]:flex-row min-[700px]:gap-2">
        {/* Commit: respond to table */}
        <div className="flex min-w-0 flex-1 items-stretch gap-1 p-1.5 min-[700px]:max-w-none min-[700px]:shrink-0 min-[700px]:flex-none md:gap-2.5 md:p-2.5" style={commitZoneStyle}>
          <button
            data-testid="poker-action-fold"
            type="button"
            onClick={handleFoldWithSound}
            disabled={!canAct}
            className={`min-h-11 min-w-0 flex-1 basis-0 rounded-lg px-1 text-[11px] font-bold leading-tight tracking-wide transition-all hover:brightness-110 active:scale-[0.97] min-[700px]:rounded-xl min-[700px]:px-3 min-[700px]:text-sm md:min-h-14 md:px-4 md:text-base lg:text-lg ${foldBtnClass}`}
            style={foldBtnStyleCommit}
          >
            Fold
          </button>
          <button
            data-testid="poker-action-check"
            type="button"
            onClick={handleCheckWithSound}
            disabled={!canAct || !canCheck}
            className={`min-h-11 min-w-0 flex-1 basis-0 rounded-lg px-1 text-[11px] font-bold leading-tight tracking-wide transition-all hover:brightness-110 active:scale-[0.97] min-[700px]:rounded-xl min-[700px]:px-3 min-[700px]:text-sm md:min-h-14 md:px-4 md:text-base lg:text-lg ${checkBtnClass}`}
            style={checkBtnStyleCommit}
          >
            Check
          </button>
          <button
            data-testid="poker-action-call"
            type="button"
            onClick={handleCallWithSound}
            disabled={!canAct || !isFacingBet}
            className={`min-h-11 min-w-0 flex-1 basis-0 rounded-lg px-0.5 text-[10px] font-bold leading-tight tracking-wide transition-all hover:brightness-110 active:scale-[0.97] min-[700px]:rounded-xl min-[700px]:px-3 min-[700px]:text-sm md:min-h-14 md:px-4 md:text-base lg:text-lg ${checkBtnClass}`}
            style={callBtnStyleCommit}
          >
            <span className="flex flex-col items-center justify-center gap-0.5 leading-tight">
              <span>Call</span>
              {isFacingBet && (
                <span className="max-w-full truncate text-[9px] font-semibold normal-case tabular-nums min-[700px]:text-xs md:text-sm lg:text-base">{formatAmount(callAmt)}</span>
              )}
            </span>
          </button>
        </div>

        <div className="hidden min-[700px]:block w-px shrink-0 self-stretch bg-white/10" aria-hidden />

        {/* Tune: size + commit amount */}
        <div className="flex min-w-0 flex-1 flex-col flex-wrap gap-2 p-1.5 min-[520px]:flex-row min-[520px]:flex-nowrap min-[520px]:items-center" style={tuneZoneStyle}>
        <div className="m-0 flex min-w-0 shrink min-[520px]:max-w-[38%] min-[520px]:flex-1 min-[520px]:basis-0 min-[700px]:max-w-none">
          <SponsoredTokenMarquee sponsor={sponsoredToken} />
        </div>
        {/* Presets */}
        <div className="flex min-w-0 shrink flex-wrap content-center gap-1 min-[520px]:shrink-0 min-[520px]:justify-end min-[520px]:gap-1.5">
          {quickSizes.map((q) => (
            <button
              key={q.label}
              data-testid={`poker-quick-size-${q.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              type="button"
              onClick={() => { setCustomAmount(formatAmount(clampAmount(q.value, minRaiseAmt, stackAmt))); }}
              disabled={!canAct || stackAmt === 0n}
              className={`h-7 min-w-0 shrink px-2 text-[10px] rounded-md transition-all hover:brightness-110 active:scale-95 min-[520px]:h-8 min-[520px]:px-2.5 min-[520px]:text-[11px] md:px-3 md:text-xs ${quickSizeClass}`}
              style={tuneGlassBtnStyle}
            >
              {q.label}
            </button>
          ))}
        </div>

        <div className="hidden h-8 w-px shrink-0 self-center bg-white/10 min-[520px]:block" aria-hidden />

        {/* Slider + nudges */}
        <div className="flex w-full min-w-0 flex-1 items-center justify-center gap-1 min-[520px]:w-auto min-[520px]:max-w-[min(100%,13rem)] min-[520px]:shrink min-[520px]:grow min-[520px]:justify-end min-[700px]:max-w-[min(100%,15rem)] md:gap-2 lg:max-w-[min(100%,17rem)]">
          <button
            data-testid="poker-action-nudge-down"
            type="button"
            onClick={() => nudge(-1)}
            disabled={!canAct || !hasValidAmount}
            className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md font-jost text-base text-white transition-all hover:brightness-110 active:scale-95 disabled:pointer-events-none min-[520px]:h-9 min-[520px]:w-9 min-[520px]:text-lg"
            style={!canAct || !hasValidAmount ? tuneGlassBtnMutedStyle : tuneGlassBtnStyle}
          >
            −
          </button>
          <div className="relative flex min-w-0 flex-1 items-center">
            <input
              data-testid="poker-action-slider"
              type="range"
              min={0}
              max={maxOffsetChips || 1}
              step={stepChips}
              value={sliderChips}
              onChange={handleSlider}
              disabled={!canAct || stackAmt === 0n}
              className="poker-slider poker-slider-desktop w-full min-w-0 disabled:pointer-events-none"
              aria-label="Bet size slider"
            />
          </div>
          <button
            data-testid="poker-action-nudge-up"
            type="button"
            onClick={() => nudge(1)}
            disabled={!canAct || !hasValidAmount}
            className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md font-jost text-base text-white transition-all hover:brightness-110 active:scale-95 disabled:pointer-events-none min-[520px]:h-9 min-[520px]:w-9 min-[520px]:text-lg"
            style={!canAct || !hasValidAmount ? tuneGlassBtnMutedStyle : tuneGlassBtnStyle}
          >
            +
          </button>
        </div>

        <div className="hidden h-8 w-px shrink-0 self-center bg-white/10 min-[520px]:block" aria-hidden />

        {/* Raise/Bet button */}
        <button
          data-testid="poker-action-primary"
          type="button"
          onClick={handlePrimary}
          disabled={!canAct || !hasValidAmount}
          className={`flex min-h-[2.65rem] w-full min-w-0 flex-1 flex-col items-center justify-center rounded-lg px-1 text-[11px] font-bold leading-tight tracking-wide transition-all active:scale-[0.97] min-[520px]:min-h-[2.75rem] min-[520px]:max-w-[11rem] min-[520px]:shrink min-[520px]:grow-[2] min-[520px]:rounded-xl min-[520px]:text-sm md:min-h-[3.25rem] md:max-w-[13rem] md:text-base ${primaryBtnClass}`}
          style={primaryBtnStyle}
        >
          <span className="flex max-w-full flex-col items-center justify-center gap-0.5 leading-tight">
            <span>{isFacingBet ? 'Raise' : 'Bet'}</span>
            {hasValidAmount && clamped && (
              <span className="max-w-full truncate text-[10px] font-semibold normal-case tabular-nums min-[520px]:text-sm md:text-base">{formatAmount(clamped)}</span>
            )}
          </span>
        </button>

        <style jsx>{`
          .poker-slider {
            -webkit-appearance: none;
            appearance: none;
            height: 5px;
            border-radius: 2px;
            outline: none;
            cursor: pointer;
            background: linear-gradient(
              to right,
              #c0392b 0%,
              #c0392b ${sliderFillPct}%,
              rgba(0, 0, 0, 0.22) ${sliderFillPct}%,
              rgba(0, 0, 0, 0.1) 100%
            );
          }
          .poker-slider-desktop { height: 5px; }
          .poker-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 18px; height: 18px;
            border-radius: 50%;
            background: #fff;
            border: 2px solid #c0392b;
            cursor: pointer;
            box-shadow: 0 1px 2px rgba(0,0,0,0.35);
            transition: transform 0.1s;
          }
          .poker-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }
          .poker-slider::-moz-range-thumb {
            width: 18px; height: 18px;
            border-radius: 50%;
            background: #fff;
            border: 2px solid #c0392b;
            cursor: pointer;
          }
        `}</style>
        </div>
        </div>
        </div>
      </div>
    );
  }

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
      {/* ── Mobile: bar centered at 75% width with horizontal padding ── */}
      <div className="sm:hidden flex w-full min-w-0 justify-center px-1">
        <div
          className="w-full min-w-0 max-w-[min(100%,28rem)] px-2 pt-2"
          style={{
            ...panelDeckStyle,
            paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))',
            paddingLeft: 'max(0.65rem, env(safe-area-inset-left, 0px))',
            paddingRight: 'max(0.65rem, env(safe-area-inset-right, 0px))',
          }}
        >
        <div className="mb-1.5 rounded-lg p-1" style={tuneZoneStyle}>
        <div className="px-0.5 pb-1 pt-0.5">
          <SponsoredTokenMarquee sponsor={sponsoredToken} compact />
        </div>
        <div className="grid grid-cols-4 gap-1 px-0.5 pb-0.5 pt-0">
          {quickSizes.map((q) => (
            <button
              data-testid={`poker-quick-size-${q.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              key={q.label}
              type="button"
              onClick={() => { setCustomAmount(formatAmount(clampAmount(q.value, minRaiseAmt, stackAmt))); }}
              disabled={!canAct || stackAmt === 0n}
              className={`h-9 text-[11px] rounded-sm transition-all hover:brightness-110 active:scale-95 ${quickSizeClass}`}
              style={tuneGlassBtnStyle}
            >
              {q.label}
            </button>
          ))}
        </div>
        </div>
        <div className="flex min-w-0 items-stretch gap-1 px-0.5 pb-2 pt-0.5">
          <div
            className="flex w-[4.65rem] shrink-0 flex-col justify-center gap-0.5 border-r border-white/10 pr-1"
            aria-label="Pre-selected actions when not your turn"
          >
            <label className={`${preActionLabelClass} text-[9px] leading-tight`}>
              <input
                data-testid="poker-pre-action-check-fold"
                type="checkbox"
                checked={preAction === 'check_fold'}
                onChange={() => togglePreAction('check_fold')}
                disabled={canAct}
                className="h-3 w-3 accent-white rounded-sm shrink-0"
              />
              <span className="whitespace-nowrap">Check/Fold</span>
            </label>
            <label className={`${preActionLabelClass} text-[9px] leading-tight`}>
              <input
                data-testid="poker-pre-action-check"
                type="checkbox"
                checked={preAction === 'check'}
                onChange={() => togglePreAction('check')}
                disabled={canAct || !canCheck}
                className="h-3 w-3 accent-white rounded-sm shrink-0"
              />
              <span>Check</span>
            </label>
            <label className={`${preActionLabelClass} text-[9px] leading-tight`}>
              <input
                data-testid="poker-pre-action-call-any"
                type="checkbox"
                checked={preAction === 'call_any'}
                onChange={() => togglePreAction('call_any')}
                disabled={canAct}
                className="h-3 w-3 accent-white rounded-sm shrink-0"
              />
              <span className="whitespace-nowrap">Call Any</span>
            </label>
          </div>
          <div className="flex shrink-0 items-stretch p-1" style={commitZoneStyle}>
            <div className="grid min-h-[3rem] min-w-0 flex-1 grid-cols-3 gap-1.5">
              <button
                data-testid="poker-action-fold"
                type="button"
                onClick={handleFoldWithSound}
                disabled={!canAct}
                className={`min-h-[3rem] min-w-[5.5rem] rounded-xl py-1 text-sm font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] ${foldBtnClass}`}
                style={foldBtnStyleCommit}
              >
                Fold
              </button>
              <button
                data-testid="poker-action-check"
                type="button"
                onClick={handleCheckWithSound}
                disabled={!canAct || !canCheck}
                className={`min-h-[3rem] min-w-[5.5rem] rounded-xl px-1 py-1 text-sm font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97] ${checkBtnClass}`}
                style={checkBtnStyleCommit}
              >
                Check
              </button>
              <button
                data-testid="poker-action-call"
                type="button"
                onClick={handleCallWithSound}
                disabled={!canAct || !isFacingBet}
                className={`min-h-[3rem] min-w-[5.5rem] rounded-xl px-0.5 py-1 text-[11px] font-bold leading-tight tracking-wide transition-all hover:brightness-110 active:scale-[0.97] ${checkBtnClass}`}
                style={callBtnStyleCommit}
              >
                <span className="flex flex-col items-center justify-center gap-0.5 whitespace-normal">
                  <span>Call</span>
                  <span className="text-xs font-semibold normal-case leading-tight tabular-nums">{isFacingBet ? formatAmount(callAmt) : '—'}</span>
                </span>
              </button>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1 p-0.5" style={tuneZoneStyle}>
            <button
              data-testid="poker-action-primary"
              type="button"
              onClick={handlePrimary}
              disabled={!canAct || !hasValidAmount}
              className={`h-11 w-full rounded-xl px-1 text-sm font-bold tracking-wide transition-all active:scale-[0.97] ${primaryBtnClass}`}
              style={primaryBtnStyle}
            >
              <span className="flex flex-col items-center justify-center gap-0.5 whitespace-normal leading-tight">
                <span>{isFacingBet ? 'Raise' : 'Bet'}</span>
                <span className="text-sm font-semibold normal-case tabular-nums">
                  {hasValidAmount && clamped ? formatAmount(clamped) : '—'}
                </span>
              </span>
            </button>
          <div className="flex shrink-0 items-center gap-1" style={{ width: '100%' }}>
            <button
              data-testid="poker-action-nudge-down"
              type="button"
              onClick={() => nudge(-1)}
              disabled={!canAct || !hasValidAmount}
              className="flex h-11 w-8 shrink-0 items-center justify-center rounded-sm font-jost text-sm text-white transition-all hover:brightness-110 active:scale-95 active:text-white/80 disabled:pointer-events-none"
              style={!canAct || !hasValidAmount ? tuneGlassBtnMutedStyle : tuneGlassBtnStyle}
            >
              −
            </button>
            <div className="relative flex w-[9.25rem] shrink-0 items-center sm:w-[10.25rem]">
              <input
                data-testid="poker-action-slider"
                type="range"
                min={0}
                max={maxOffsetChips || 1}
                step={stepChips}
                value={sliderChips}
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
              className="flex h-11 w-8 shrink-0 items-center justify-center rounded-sm font-jost text-sm text-white transition-all hover:brightness-110 active:scale-95 active:text-white/80 disabled:pointer-events-none"
              style={!canAct || !hasValidAmount ? tuneGlassBtnMutedStyle : tuneGlassBtnStyle}
            >
              +
            </button>
          </div>
        </div>
        </div>
        </div>
      </div>

      {/* ── Desktop / tablet (sm+): full width of parent (shell pads rails in `PokerBottomBar`). No outer deck shell — matches `/poker-layout` strip. ── */}
      <div className="hidden min-w-0 sm:flex w-full flex-col px-1 py-2 sm:px-2 sm:py-2 md:px-2 md:py-2.5">
        <div className="mb-1.5 rounded-lg p-1 md:p-1.5" style={tuneZoneStyle}>
        <div className="flex min-w-0 items-center gap-1.5 pt-0.5 sm:gap-2 md:pt-1">
          <div className="m-0 flex min-w-0 flex-1">
            <SponsoredTokenMarquee sponsor={sponsoredToken} />
          </div>
          <div className="flex min-w-0 shrink flex-wrap items-center justify-end gap-1 sm:gap-1.5">
            {quickSizes.map((q) => (
              <button
                key={q.label}
                data-testid={`poker-quick-size-${q.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                type="button"
                onClick={() => { setCustomAmount(formatAmount(clampAmount(q.value, minRaiseAmt, stackAmt))); }}
                disabled={!canAct || stackAmt === 0n}
                className={`h-7 min-w-0 shrink rounded-sm px-1.5 text-[10px] transition-all hover:brightness-110 active:scale-95 min-[520px]:h-8 min-[520px]:px-2.5 min-[520px]:text-[11px] md:h-10 md:px-3 md:text-sm ${quickSizeClass}`}
                style={tuneGlassBtnStyle}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
        </div>
        <div
          className="flex min-w-0 flex-col gap-2 min-[700px]:flex-row min-[700px]:items-stretch md:gap-1.5 pb-1 pt-1 md:pb-2 md:pt-1.5"
          style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))' }}
        >
          <div
            className="flex min-w-0 flex-col gap-0.5 justify-center border-white/10 min-[700px]:shrink-0 min-[700px]:border-r min-[700px]:pr-2 md:gap-1 md:pr-3"
            aria-label="Pre-selected actions when not your turn"
          >
            <label className={`${preActionLabelClass} text-[9px] min-[520px]:text-[10px] md:text-[11px]`}>
              <input
                data-testid="poker-pre-action-check-fold"
                type="checkbox"
                checked={preAction === 'check_fold'}
                onChange={() => togglePreAction('check_fold')}
                disabled={canAct}
                className="h-3.5 w-3.5 accent-white rounded-sm shrink-0"
              />
              <span className="min-w-0 truncate">Check/Fold</span>
            </label>
            <label className={`${preActionLabelClass} text-[9px] min-[520px]:text-[10px] md:text-[11px]`}>
              <input
                data-testid="poker-pre-action-check"
                type="checkbox"
                checked={preAction === 'check'}
                onChange={() => togglePreAction('check')}
                disabled={canAct || !canCheck}
                className="h-3.5 w-3.5 accent-white rounded-sm shrink-0"
              />
              <span>Check</span>
            </label>
            <label className={`${preActionLabelClass} text-[9px] min-[520px]:text-[10px] md:text-[11px]`}>
              <input
                data-testid="poker-pre-action-call-any"
                type="checkbox"
                checked={preAction === 'call_any'}
                onChange={() => togglePreAction('call_any')}
                disabled={canAct}
                className="h-3.5 w-3.5 accent-white rounded-sm shrink-0"
              />
              <span className="min-w-0 truncate">Call Any</span>
            </label>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 min-[700px]:min-h-0 min-[700px]:flex-row min-[700px]:gap-1.5 md:gap-2">
          <div className="flex min-w-0 flex-1 items-stretch p-1 min-[700px]:max-w-[55%] min-[700px]:shrink md:p-2" style={commitZoneStyle}>
            <div className="flex min-h-11 min-w-0 flex-1 gap-0.5 min-[700px]:min-h-[3.5rem] md:min-h-16 md:gap-1.5 lg:gap-2">
              <button
                data-testid="poker-action-fold"
                type="button"
                onClick={handleFoldWithSound}
                disabled={!canAct}
                className={`min-w-0 flex-1 basis-0 rounded-lg px-0.5 text-[10px] font-bold leading-tight tracking-wide transition-all hover:brightness-110 active:scale-[0.97] min-[700px]:rounded-xl min-[700px]:px-1.5 min-[700px]:text-xs md:min-h-[3.5rem] md:px-2 md:text-sm lg:px-3 lg:text-base xl:text-lg ${foldBtnClass}`}
                style={foldBtnStyleCommit}
              >
                Fold
              </button>
              <button
                data-testid="poker-action-check"
                type="button"
                onClick={handleCheckWithSound}
                disabled={!canAct || !canCheck}
                className={`min-w-0 flex-1 basis-0 rounded-lg px-0.5 text-[10px] font-bold leading-tight tracking-wide transition-all hover:brightness-110 active:scale-[0.97] min-[700px]:rounded-xl min-[700px]:px-1.5 min-[700px]:text-xs md:min-h-[3.5rem] md:px-2 md:text-sm lg:px-2.5 lg:text-base ${checkBtnClass}`}
                style={checkBtnStyleCommit}
              >
                Check
              </button>
              <button
                data-testid="poker-action-call"
                type="button"
                onClick={handleCallWithSound}
                disabled={!canAct || !isFacingBet}
                className={`min-w-0 flex-1 basis-0 rounded-lg px-0.5 text-[9px] font-bold leading-tight tracking-wide transition-all hover:brightness-110 active:scale-[0.97] min-[700px]:rounded-xl min-[700px]:px-1 min-[700px]:text-xs md:min-h-[3.5rem] md:px-1.5 md:text-sm lg:px-2 lg:text-[15px] ${checkBtnClass}`}
                style={callBtnStyleCommit}
              >
                <span className="flex max-w-full flex-col items-center justify-center gap-0.5 whitespace-normal">
                  <span>Call</span>
                  <span className="max-w-full truncate text-[8px] font-semibold normal-case tabular-nums min-[700px]:text-[10px] md:text-sm lg:text-base">{isFacingBet ? formatAmount(callAmt) : '—'}</span>
                </span>
              </button>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-1 min-[520px]:flex-row min-[520px]:items-stretch min-[520px]:gap-2 md:p-1.5 md:gap-2" style={tuneZoneStyle}>
            <button
              data-testid="poker-action-primary"
              type="button"
              onClick={handlePrimary}
              disabled={!canAct || !hasValidAmount}
              className={`flex min-h-11 w-full min-w-0 flex-1 flex-col items-center justify-center rounded-lg px-0.5 text-[10px] font-bold leading-tight tracking-wide transition-all active:scale-[0.97] min-[520px]:min-h-[3.25rem] min-[520px]:max-w-none min-[520px]:rounded-xl min-[520px]:px-1 min-[520px]:text-xs min-[700px]:min-h-[3.5rem] min-[700px]:grow-[2] md:min-h-[4rem] md:px-2 md:text-sm lg:text-base ${primaryBtnClass}`}
              style={primaryBtnStyle}
            >
              <span className="flex max-w-full flex-col items-center justify-center gap-0.5 leading-tight">
                <span>{isFacingBet ? 'Raise' : 'Bet'}</span>
                <span className="max-w-full truncate text-[9px] font-semibold normal-case tabular-nums min-[520px]:text-xs md:text-base">
                  {hasValidAmount && clamped ? formatAmount(clamped) : '—'}
                </span>
              </span>
            </button>
          <div className="flex min-h-10 min-w-0 w-full flex-1 items-center justify-center gap-1 min-[520px]:min-h-0 min-[520px]:flex-1 md:gap-2">
            <button
              data-testid="poker-action-nudge-down"
              type="button"
              onClick={() => nudge(-1)}
              disabled={!canAct || !hasValidAmount}
              className="flex h-9 w-7 shrink-0 items-center justify-center rounded-sm font-jost text-sm text-white transition-all hover:brightness-110 active:scale-95 active:text-white/80 disabled:pointer-events-none min-[520px]:h-12 min-[520px]:w-8 min-[520px]:text-lg md:h-14 md:w-10 md:text-xl"
              style={!canAct || !hasValidAmount ? tuneGlassBtnMutedStyle : tuneGlassBtnStyle}
            >
              −
            </button>
            <div className="relative flex min-w-0 flex-1 items-center">
              <input
                data-testid="poker-action-slider"
                type="range"
                min={0}
                max={maxOffsetChips || 1}
                step={stepChips}
                value={sliderChips}
                onChange={handleSlider}
                disabled={!canAct || stackAmt === 0n}
                className="poker-slider poker-slider-desktop w-full min-w-0 disabled:pointer-events-none"
                aria-label="Bet size slider"
              />
            </div>
            <button
              data-testid="poker-action-nudge-up"
              type="button"
              onClick={() => nudge(1)}
              disabled={!canAct || !hasValidAmount}
              className="flex h-9 w-7 shrink-0 items-center justify-center rounded-sm font-jost text-sm text-white transition-all hover:brightness-110 active:scale-95 active:text-white/80 disabled:pointer-events-none min-[520px]:h-12 min-[520px]:w-8 min-[520px]:text-lg md:h-14 md:w-10 md:text-xl"
              style={!canAct || !hasValidAmount ? tuneGlassBtnMutedStyle : tuneGlassBtnStyle}
            >
              +
            </button>
          </div>
        </div>
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
            #c0392b 0%,
            #c0392b ${sliderFillPct}%,
            rgba(0, 0, 0, 0.22) ${sliderFillPct}%,
            rgba(0, 0, 0, 0.1) 100%
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
          box-shadow: 0 1px 2px rgba(0,0,0,0.35);
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
