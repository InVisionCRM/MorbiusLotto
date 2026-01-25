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

  const quickBetAmounts = [5, 10, 25, 100, 1000];

  // Check if a chip value is affordable with remaining balance
  const isChipAffordable = (chipValue: number) => {
    const chipValueWei = parseEther(chipValue.toString());
    return remainingBalance >= chipValueWei;
  };

  return (
    <div className="w-full">
      {/* Single Row: Quick Bets + Deal Button + Clear */}
      <div className="flex items-center justify-center gap-4">
        {/* Quick Bet Buttons */}
        <div className="flex gap-1">
          {quickBetAmounts.map(amount => {
            // Map chip values to PNG images
            const getChipImage = (value: number) => {
              switch (value) {
                case 5: return '/PokerChips/greenpokerchip005.png'; // Green for 5
                case 10: return '/PokerChips/bluepokerchip010.png'; // Blue for 10
                case 25: return '/PokerChips/redpokerchip015.png'; // Red for 25
                case 100: return '/PokerChips/blackpokerchip000.png'; // Black for 100
                case 1000: return '/PokerChips/cyanpokerchip020.png'; // Black for 1000
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
                className={`relative w-15 h-15 rounded-full flex items-center justify-center font-bold text-xs transition-all hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-md overflow-hidden ${
                  !affordable ? 'opacity-50' : ''
                }`}
                style={{
                  background: `url('${chipImage}') center/contain no-repeat`,
                  border: '1px solid rgba(60, 60, 60, 0.5)',
                }}
              >
                {/* Optional overlay for better text visibility */}
                <div className="absolute inset-0 bg-black/20 rounded-full" />
                <span
                  className="relative z-10 font-bold text-white text-shadow"
                  style={{
                    textShadow: '1px 1px 2px rgba(0, 0, 0, 0.8), -1px -1px 2px rgba(0, 0, 0, 0.5)',
                    fontSize: '16px',
                  }}
                >
                  {amount}
                </span>
              </button>
            );
          })}
        </div>

        {/* Desktop Buttons - Show on md+ screens */}
        <div className="hidden md:flex gap-2">
          <button
            onClick={() => onBetAmountChange?.('', undefined, true)}
            disabled={isPlaying}
            className="px-3 py-2 rounded font-bold text-lg uppercase tracking-wider transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-cyan-300/70"
            style={{
              background: 'linear-gradient(145deg, rgb(35, 45, 55), rgb(25, 35, 45))',
              boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(60, 60, 60, 0.3)',
            }}
          >
            Clear
          </button>
          <button
            onClick={() => {
              const betAmountBigInt = parseEther(currentBetAmount || '0');
              onStartGame(betAmountBigInt, ''); // Use current bet amount
            }}
            disabled={isPlaying || currentBetAmountBigInt > reserveBalance || parseFloat(currentBetAmount || '0') === 0}
            className={`px-4 py-2 rounded font-bold text-lg uppercase tracking-wider transition-all transform
              ${isPlaying || currentBetAmountBigInt > reserveBalance || parseFloat(currentBetAmount || '0') === 0
                ? 'opacity-50 cursor-not-allowed text-cyan-300/30 scale-95'
                : 'text-cyan-300 hover:scale-105 active:scale-95'}
            `}
            style={{
              background: isPlaying || currentBetAmountBigInt > reserveBalance || parseFloat(currentBetAmount || '0') === 0
                ? 'linear-gradient(145deg, rgb(35, 45, 55), rgb(25, 35, 45))'
                : 'linear-gradient(145deg, rgba(6, 182, 212, 0.4), rgba(8, 145, 178, 0.4))',
              boxShadow: isPlaying || currentBetAmountBigInt > reserveBalance || parseFloat(currentBetAmount || '0') === 0
                ? 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)'
                : 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.05), 0 4px 12px rgba(0, 0, 0, 0.3)',
            }}
          >
            {isPlaying ? 'PLAYING...' : 'DEAL'}
          </button>
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
