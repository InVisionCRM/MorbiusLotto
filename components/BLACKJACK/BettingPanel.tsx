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

  return (
    <div className="w-full">
      {/* Single Row: Quick Bets */}
      <div className="flex items-center justify-center">
        {/* Quick Bet Buttons */}
        <div className="flex gap-0.5">
          {quickBetAmounts.map(amount => {
            // Map chip values to PNG images
            const getChipImage = (value: number) => {
              switch (value) {
                case 500: return '/PokerChips/greenpokerchip005.png'; // Green for 500
                case 1000: return '/PokerChips/bluepokerchip010.png'; // Blue for 1000
                case 2500: return '/PokerChips/redpokerchip015.png'; // Red for 2500
                case 10000: return '/PokerChips/blackpokerchip000.png'; // Black for 10000
                case 100000: return '/PokerChips/cyanpokerchip020.png'; // Cyan for 100000
                default: return '/PokerChips/greenpokerchip005.png';
              }
            };

            const chipImage = getChipImage(amount);

            const affordable = isChipAffordable(amount);

            return (
              <button
                key={amount}
                onClick={() => {
                  const newAmount = (parseFloat(betAmount || '0') + amount).toString();
                  setBetAmount(newAmount);
                  onBetAmountChange?.(newAmount, amount);
                }}
                disabled={isPlaying || !affordable}
                className={`relative w-10 h-10 md:w-12 md:h-12 lg:w-12 lg:h-12 rounded-full flex items-center justify-center font-bold text-xs transition-all hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-md overflow-hidden ${
                  !affordable ? 'opacity-50' : ''
                }`}
                style={{
                  background: `url('${chipImage}') center/contain no-repeat`,
                  border: '1px solid rgba(60, 60, 60, 0.5)',
                }}
              >
                {/* Optional overlay for better text visibility */}
                <div className="absolute inset-0 rounded-full" />
                <span
                  className="relative z-10 font-bold text-white text-shadow md:text-sm lg:text-base"
                  style={{
                    textShadow: '1px 1px 2px rgba(0, 0, 0, 0.8), -1px -1px 2px rgba(0, 0, 0, 0.5)',
                    fontSize: '12px',
                  }}
                >
                  {amount}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Error Messages */}
      <div className="text-center mt-3 space-y-1">
        {/* Removed bet limit warnings for cleaner UI */}
      </div>
    </div>
  );
};

export default BettingPanel;
