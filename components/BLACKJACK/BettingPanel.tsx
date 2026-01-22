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
  onBetAmountChange?: (betAmount: bigint) => void;
}

const BettingPanel: React.FC<BettingPanelProps> = ({
  onStartGame,
  isPlaying,
  reserveBalance,
  onBetAmountChange
}) => {
  const [betAmount, setBetAmount] = useState<string>('0');

  const betAmountBigInt = parseEther(betAmount || '0');

  // Notify parent component of bet amount changes
  useEffect(() => {
    if (onBetAmountChange) {
      onBetAmountChange(betAmountBigInt);
    }
  }, [betAmountBigInt, onBetAmountChange]);

  const isValidBet = betAmountBigInt >= BET_LIMITS.MIN_BET && betAmountBigInt <= BET_LIMITS.MAX_BET;
  const hasEnoughBalance = reserveBalance >= betAmountBigInt;

  console.log('BettingPanel validation:', {
    betAmount,
    betAmountBigInt: betAmountBigInt.toString(),
    BET_LIMITS_MIN: BET_LIMITS.MIN_BET.toString(),
    BET_LIMITS_MAX: BET_LIMITS.MAX_BET.toString(),
    isValidBet,
    hasEnoughBalance
  });

  const handleStartGame = () => {
    console.log('BettingPanel handleStartGame called', {
      isValidBet,
      hasEnoughBalance,
      betAmount,
      betAmountBigInt
    });

    if (!isValidBet || !hasEnoughBalance) {
      console.log('Bet validation failed:', { isValidBet, hasEnoughBalance });
      return;
    }

    // Client seed is managed in the parent component (page.tsx)
    // Pass empty string - parent will use its own clientSeed state
    console.log('Calling onStartGame with:', { betAmountBigInt });
    onStartGame(betAmountBigInt, '');
  };

  const quickBetAmounts = [1, 5, 10, 25, 50, 100];

  return (
    <div className="w-full">
      {/* Row 1: Deal button + Bet input + Quick bet buttons */}
      <div className="flex items-center gap-2">
        {/* Deal button */}
        <button
          onClick={handleStartGame}
          disabled={isPlaying || !isValidBet || !hasEnoughBalance}
          className={`py-1.5 px-3 rounded font-bold text-xs transition-all flex-shrink-0
            ${isPlaying || !isValidBet || !hasEnoughBalance
              ? 'opacity-50 cursor-not-allowed text-cyan-300/30'
              : 'text-cyan-300 active:scale-95'}
          `}
          style={{
            background: isPlaying || !isValidBet || !hasEnoughBalance
              ? 'linear-gradient(145deg, rgb(35, 45, 55), rgb(25, 35, 45))'
              : 'linear-gradient(145deg, rgba(6, 182, 212, 0.3), rgba(8, 145, 178, 0.3))',
            boxShadow: isPlaying || !isValidBet || !hasEnoughBalance
              ? 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)'
              : 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.05), 0 4px 12px rgba(0, 0, 0, 0.2)',
          }}
        >
          {isPlaying ? 'GAME...' : '🃏 DEAL'}
        </button>

        {/* Bet amount input */}
        <input
          type="number"
          value={betAmount}
          onChange={(e) => {
            const value = e.target.value;
            // Only allow whole numbers
            if (value === '' || /^\d+$/.test(value)) {
              setBetAmount(value);
            }
          }}
          className="px-2 py-1.5 text-center font-bold text-cyan-300 rounded border focus:outline-none flex-1 min-w-0"
          style={{
            background: 'linear-gradient(145deg, rgb(35, 45, 55), rgb(25, 35, 45))',
            boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(60, 60, 60, 0.3)',
          }}
          placeholder="0"
          min={Math.floor(Number(formatEther(BET_LIMITS.MIN_BET)))}
          max={Math.floor(Number(formatEther(BET_LIMITS.MAX_BET)))}
          step="1"
          onBlur={(e) => {
            // Ensure whole numbers only
            const value = parseInt(e.target.value);
            if (!isNaN(value) && value >= 0) {
              setBetAmount(value.toString());
            } else {
              setBetAmount('0');
            }
          }}
          disabled={isPlaying}
        />

        {/* Quick bet buttons */}
        <div className="flex gap-1 flex-shrink-0">
          {quickBetAmounts.map(amount => (
            <button
              key={amount}
              onClick={() => setBetAmount(amount.toString())}
              disabled={isPlaying}
              className="w-8 h-8 rounded flex items-center justify-center font-bold text-xs transition-all hover:scale-105 active:scale-95"
              style={{
                background: 'linear-gradient(145deg, rgb(35, 45, 55), rgb(25, 35, 45))',
                boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
                color: 'rgba(6, 182, 212, 0.5)',
                border: '1px solid rgba(60, 60, 60, 0.3)',
              }}
            >
              {amount}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: Insufficient balance message only */}
      {!hasEnoughBalance && betAmount && (
        <div className="mt-1 text-red-400 text-xs text-center">
          Insufficient balance
        </div>
      )}
    </div>
  );
};

export default BettingPanel;
