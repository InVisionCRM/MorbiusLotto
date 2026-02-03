'use client';

import React, { useState, useEffect } from 'react';
import { formatEther, parseEther } from 'viem';
import { useTokenBalance } from '@/hooks/use-token';
import { useNativeBalance } from '@/hooks/use-native-balance';
import { usePlsQuote } from '@/hooks/use-pls-quote';
import { MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import { BET_LIMITS } from '@/app/BLACKJACK/constants';

interface BettingPanelProps {
  onStartGame: (betAmount: bigint, clientSeed: string) => void; // Removed usePLS since only MORBIUS from reserve
  isPlaying: boolean;
  reserveBalance: bigint;
  onBetAmountChange?: (betAmount: string, chipValue?: number, clearAll?: boolean) => void;
  currentBetAmount?: string; // Add current bet amount prop for sync
  lastBetAmount?: string; // For rebet functionality
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

  // Calculate remaining balance for chip affordability checking
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

  const quickBetAmounts = [500, 1000, 2500, 10000, 100000];

  // Check if a chip value is affordable with remaining balance
  const isChipAffordable = (chipValue: number) => {
    const chipValueWei = parseEther(chipValue.toString());
    return remainingBalance >= chipValueWei;
  };

  const getChipImage = (value: number) => {
    switch (value) {
      case 500: return '/PokerChips/greenpokerchip005.png';
      case 1000: return '/PokerChips/bluepokerchip010.png';
      case 2500: return '/PokerChips/redpokerchip015.png';
      case 10000: return '/PokerChips/blackpokerchip000.png';
      case 100000: return '/PokerChips/cyanpokerchip020.png';
      default: return '/PokerChips/greenpokerchip005.png';
    }
  };

  return (
    <div className="w-full">
      {/* 3-col grid: chips + Clear */}
      <div className="grid grid-cols-3 gap-2 place-items-center">
        {quickBetAmounts.map(amount => {
          const chipImage = getChipImage(amount);
          const affordable = isChipAffordable(amount);
          const isCyanChip = amount === 100000;
          const label = amount >= 1000 ? (amount >= 10000 ? `${amount / 1000}K` : amount) : amount;

          return (
            <button
              key={amount}
              onClick={() => {
                const newAmount = (parseFloat(betAmount || '0') + amount).toString();
                setBetAmount(newAmount);
                onBetAmountChange?.(newAmount, amount);
              }}
              disabled={isPlaying || !affordable}
              className={`relative w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center font-bold text-xs transition-all hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-md overflow-hidden ${
                !affordable ? 'opacity-50' : ''
              }`}
              style={{
                background: `url('${chipImage}') center/contain no-repeat`,
                border: '1px solid rgba(60, 60, 60, 0.5)',
              }}
            >
              <div className="absolute inset-0 rounded-full" />
              <span
                className={`relative z-10 font-bold md:text-sm ${
                  isCyanChip ? 'text-slate-800' : 'text-white'
                }`}
                style={{
                  textShadow: isCyanChip
                    ? '0 0 2px rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.3)'
                    : '1px 1px 2px rgba(0, 0, 0, 0.8), -1px -1px 2px rgba(0, 0, 0, 0.5)',
                  fontSize: amount >= 10000 ? '10px' : '12px',
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
          className="col-span-1 w-full min-h-[2.5rem] px-2 py-1.5 rounded-lg font-bold text-xs md:text-sm uppercase tracking-wider transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-cyan-300/80 border border-cyan-500/30"
          style={{
            background: 'linear-gradient(145deg, rgb(35, 45, 55), rgb(25, 35, 45))',
            boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
          }}
        >
          Clear
        </button>
      </div>

      {/* Error Messages */}
      <div className="text-center mt-3 space-y-1">
        {/* Removed bet limit warnings for cleaner UI */}
      </div>
    </div>
  );
};

export default BettingPanel;
