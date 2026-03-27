'use client';

import React, { useState, useEffect } from 'react';
import { formatEther, parseEther } from 'viem';
import { useTokenBalance } from '@/hooks/use-token';
import { useNativeBalance } from '@/hooks/use-native-balance';
import { usePlsQuote } from '@/hooks/use-pls-quote';
import { MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import { BET_LIMITS } from '@/app/BLACKJACK/constants';

interface BettingPanelProps {
  onStartGame: (betAmount: bigint, clientSeed: string, perfectPairsBetAmount?: bigint) => void;
  isPlaying: boolean;
  reserveBalance: bigint;
  onBetAmountChange?: (betAmount: string, chipValue?: number, clearAll?: boolean) => void;
  currentBetAmount?: string;
  lastBetAmount?: string;
  onRebet?: () => void;
  onHalfBet?: () => void;
  onDoubleBet?: () => void;
}

const BettingPanel: React.FC<BettingPanelProps> = ({
  onStartGame,
  isPlaying,
  reserveBalance,
  onBetAmountChange,
  currentBetAmount = '0',
  lastBetAmount = '0',
  onRebet,
  onHalfBet,
  onDoubleBet
}) => {
  const [betAmount, setBetAmount] = useState<string>('0');

  const currentBetAmountBigInt = parseEther(currentBetAmount || '0');
  const isValidBet = currentBetAmountBigInt >= BET_LIMITS.MIN_BET && currentBetAmountBigInt <= BET_LIMITS.MAX_BET;
  const hasEnoughBalance = reserveBalance >= currentBetAmountBigInt;

  const remainingBalance = reserveBalance - currentBetAmountBigInt;

  console.log('BettingPanel validation:', {
    currentBetAmount,
    currentBetAmountBigInt: currentBetAmountBigInt.toString(),
    BET_LIMITS_MIN: BET_LIMITS.MIN_BET.toString(),
    BET_LIMITS_MAX: BET_LIMITS.MAX_BET.toString(),
    isValidBet,
    hasEnoughBalance
  });

  const handleStartGame = () => {
    console.log('BettingPanel handleStartGame called', {
      isValidBet,
      hasEnoughBalance,
      currentBetAmount,
      currentBetAmountBigInt
    });

    if (!isValidBet || !hasEnoughBalance) {
      console.log('Bet validation failed:', { isValidBet, hasEnoughBalance });
      return;
    }

    // Client seed is managed in the parent component (page.tsx)
    // Pass empty string - parent will use its own clientSeed state
    console.log('Calling onStartGame with:', { currentBetAmountBigInt });
    onStartGame(currentBetAmountBigInt, '');
  };

  const quickBetAmounts = [500, 5000, 25000, 50000];

  const isChipAffordable = (chipValue: number) => {
    const chipValueWei = parseEther(chipValue.toString());
    return remainingBalance >= chipValueWei;
  };
  const getChipImage = (_value: number) => '/morbius/MorbiusChip.png';

  return (
    <div className="w-full">
      {/* 5-col grid: chips (500, 5k, 25k, 50k) + Clear */}
      <div className="grid grid-cols-5 gap-1 sm:gap-2 place-items-center">
        {quickBetAmounts.map(amount => {
          const chipImage = getChipImage(amount);
          const affordable = isChipAffordable(amount);
          const isCyanChip = amount === 50000;
          const label = amount >= 1000 ? `${amount / 1000}k` : amount;

          return (
            <button
              key={amount}
              onClick={() => {
                const newAmount = (parseFloat(betAmount || '0') + amount).toString();
                setBetAmount(newAmount);
                onBetAmountChange?.(newAmount, amount);
              }}
              disabled={isPlaying || !affordable}
              className={`relative w-8 h-8 sm:w-12 sm:h-12 md:w-12 md:h-12 rounded-full flex items-center justify-center font-bold text-[10px] sm:text-xs transition-all hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-md overflow-hidden ${
                !affordable ? 'opacity-50' : ''
              }`}
              style={{
                background: `url('${chipImage}') center/contain no-repeat`,
                border: '1px solid rgba(36, 30, 30, 0.5)',
              }}
            >
              <div className="absolute inset-0 rounded-full" />
              <span
                className={`relative z-11 font-bold md:text-sm ${
                  isCyanChip ? 'text-slate-800' : 'text-white'
                }`}
                style={{
                  textShadow: isCyanChip
                    ? '0 0 2px rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.3)'
                    : '1px 1px 2px rgba(0, 0, 0, 0.8), -1px -1px 2px rgba(0, 0, 0, 0.5)',
                  fontSize: amount >= 25000 ? '8px' : undefined,
                }}
              >
                {label}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setBetAmount('0');
            onBetAmountChange?.('', undefined, true);
          }}
          disabled={isPlaying}
          className="w-full min-h-[1.75rem] sm:min-h-[2.5rem] px-1 sm:px-2 py-0.5 sm:py-1.5 rounded-md sm:rounded-lg font-bold text-[10px] sm:text-xs md:text-sm uppercase tracking-wider transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-cyan-300/80"
          style={{
            background: 'linear-gradient(145deg, rgba(35, 45, 55, 0), rgba(25, 35, 45, 0.01))',
            boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0), inset -2px -2px 4px rgba(255, 255, 255, 0)',
          }}
        >
          Clear
        </button>
      </div>

      {/* Error Messages */}
      <div className="text-center mt-1 sm:mt-3 space-y-1">
        {/* Removed bet limit warnings for cleaner UI */}
      </div>
    </div>
  );
};

export default BettingPanel;
