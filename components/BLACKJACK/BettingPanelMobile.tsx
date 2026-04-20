'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { formatEther } from 'viem';
import { BET_LIMITS } from '@/app/BLACKJACK/constants';

export interface BettingPanelMobileProps {
  onStartGame: (betAmount: bigint, clientSeed: string) => void;
  isPlaying: boolean;
  onBetAmountChange?: (betAmount: string, chipValue?: number, clearAll?: boolean) => void;
  currentBetAmount?: string;
  onHalfBet?: () => void;
  onDoubleBet?: () => void;
  /** Player reserve balance (wei) — shown to the right of "AMOUNT" when provided */
  playerReserves?: bigint;
  /** Active tier limits — defaults to BET_LIMITS if not provided */
  betLimits?: { MIN_BET: bigint; MAX_BET: bigint };
}

/** Betting panel for all screens: amount input, Morbius logo, 1/2 and 2x buttons. Chip stack on table updates as user types. */
export function BettingPanelMobile({
  onStartGame,
  isPlaying,
  onBetAmountChange,
  currentBetAmount = '0',
  onHalfBet,
  onDoubleBet,
  playerReserves,
  betLimits = BET_LIMITS,
}: BettingPanelMobileProps) {
  const numValue = Math.floor(parseFloat(currentBetAmount || '0') || 0);
  const displayValue = numValue === 0 ? '0' : String(numValue);
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Sync from parent when currentBetAmount changes (e.g. after 1/2 or 2x)
  useEffect(() => {
    if (!isFocused) {
      const n = Math.floor(parseFloat(currentBetAmount || '0') || 0);
      setInputValue(n === 0 ? '0' : String(n));
    }
  }, [currentBetAmount, isFocused]);

  const minBetNum = Number(formatEther(betLimits.MIN_BET));
  const maxBetNum = Number(formatEther(betLimits.MAX_BET));
  const formatThousands = (n: number) => n.toLocaleString('en-US');
  const commitValue = (raw: string) => {
    const parsed = Math.floor(parseFloat(raw.replace(/,/g, '')) || 0);
    const clamped = Math.max(0, Math.min(maxBetNum, parsed));
    const str = String(clamped);
    setInputValue(str === '0' ? '0' : str);
    onBetAmountChange?.(str);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (/^[0-9]*$/.test(v)) {
      setInputValue(v);
      const parsed = v === '' ? 0 : parseInt(v, 10);
      if (!Number.isNaN(parsed)) onBetAmountChange?.(String(parsed));
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    commitValue(inputValue === '' ? '0' : inputValue);
  };

  const handleFocus = () => {
    setIsFocused(true);
    setInputValue(''); // blank when user starts editing
  };

  // Presets scale to the active tier: [min, ~25%, ~50%, max]
  const PRESETS = React.useMemo(() => {
    const roundNice = (n: number) => {
      if (n <= 0) return 0;
      const step = n >= 10000 ? 5000 : n >= 1000 ? 500 : 100;
      return Math.max(step, Math.round(n / step) * step);
    };
    const span = maxBetNum - minBetNum;
    const p2 = roundNice(minBetNum + span * 0.25);
    const p3 = roundNice(minBetNum + span * 0.5);
    const unique = Array.from(new Set([minBetNum, p2, p3, maxBetNum])).filter(
      (n) => n >= minBetNum && n <= maxBetNum
    );
    return unique.length === 4 ? unique : [minBetNum, p2, p3, maxBetNum];
  }, [minBetNum, maxBetNum]);

  const addPreset = (amount: number) => {
    if (isPlaying) return;
    const current = numValue;
    const newTotal = Math.min(maxBetNum, current + amount);
    const str = newTotal === 0 ? '0' : String(newTotal);
    setInputValue(str);
    setIsFocused(false);
    onBetAmountChange?.(str);
  };

  const handleClearBet = () => {
    if (isPlaying) return;
    setInputValue('0');
    setIsFocused(false);
    onBetAmountChange?.('0', undefined, true);
  };

  return (
    <section className="w-full px-2 py-1">
      <div className="flex flex-col gap-1 w-full">
        <div className="flex items-center justify-between gap-2 w-full">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Amount</span>
            <span className="text-[10px] sm:text-xs text-gray-500 font-poppins tabular-nums truncate">
              Min {formatThousands(minBetNum)} · Max {formatThousands(maxBetNum)}
            </span>
          </div>
          {playerReserves !== undefined && (
            <span className="text-xs text-gray-400 font-poppins tabular-nums">
              Reserve: {(() => {
                const whole = formatEther(playerReserves).split('.')[0];
                return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
              })()}
            </span>
          )}
        </div>
        <div className="flex items-stretch w-full rounded-lg border border-white/20 overflow-hidden" style={{ minHeight: '36px' }}>
          {/* Manual entry + logo — ~2/3 width */}
          <div className="flex-1 flex items-center gap-2 pl-2 pr-2 min-w-0">
            <input
              type="text"
              inputMode="numeric"
              value={isFocused ? inputValue : displayValue}
              onChange={handleInputChange}
              onBlur={handleBlur}
              onFocus={handleFocus}
              disabled={isPlaying}
              className="flex-1 min-w-0 bg-transparent text-white font-bold text-sm outline-none placeholder:text-gray-500 disabled:opacity-60"
              placeholder={`Min ${formatThousands(minBetNum)} · Max ${formatThousands(maxBetNum)}`}
              aria-label="Bet amount in MORBIUS"
            />
            <Image
              src="/morbius/MorbiusLogo (3).png"
              alt="MORBIUS"
              width={20}
              height={20}
              className="object-contain flex-shrink-0"
            />
          </div>
          {/* 1/2 and 2x */}
          <div className="flex items-stretch flex-shrink-0">
            <div className="w-px bg-white/20 self-stretch" aria-hidden />
            <button
              type="button"
              onClick={() => {
                if (!isPlaying) onHalfBet?.();
              }}
              disabled={isPlaying}
              className="flex-1 min-w-[48px] flex items-center justify-center text-white font-bold text-sm hover:bg-white/10 active:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              1/2
            </button>
            <div className="w-px bg-white/20 self-stretch" aria-hidden />
            <button
              type="button"
              onClick={() => {
                if (!isPlaying) onDoubleBet?.();
              }}
              disabled={isPlaying}
              className="flex-1 min-w-[48px] flex items-center justify-center text-white font-bold text-sm hover:bg-white/10 active:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              2x
            </button>
          </div>
        </div>
        {/* Preset add amounts + Clear — larger touch targets */}
        <div className="grid grid-cols-5 gap-0 overflow-hidden rounded-md border border-white/20">
          {PRESETS.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => addPreset(amount)}
              disabled={isPlaying}
              className="h-9 sm:h-10 min-h-0 py-0 px-0 text-white/95 text-sm sm:text-[15px] font-semibold hover:bg-white/10 active:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-r border-white/20"
              aria-label={`Add ${amount} to bet`}
            >
              {amount >= 1000 ? `${+(amount / 1000).toFixed(1)}k` : amount}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClearBet}
            disabled={isPlaying}
            className="h-9 sm:h-10 min-h-0 py-0 px-0 text-white/95 text-sm sm:text-[15px] font-semibold hover:bg-white/10 active:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Clear bet"
          >
            Clear
          </button>
        </div>
      </div>
    </section>
  );
}

export default BettingPanelMobile;
