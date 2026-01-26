'use client'

import React, { useEffect } from 'react';
import { formatEther } from 'viem';

interface WinNotificationProps {
  amount: bigint;
  isBlackjack: boolean;
  onComplete: () => void;
}

const WinNotification: React.FC<WinNotificationProps> = ({
  amount,
  isBlackjack,
  onComplete
}) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  if (amount <= 0n) return null;

  // Format amount to whole number for cleaner display
  const formattedAmount = Math.floor(Number(formatEther(amount))).toLocaleString();

  return (
    <div className="absolute top-2 right-2 z-30 pointer-events-none">
      <div className="win-notification flex items-center gap-2 px-3 py-2">
        {isBlackjack ? (
          <>
            <span className="text-yellow-400 text-lg">♠</span>
            <div className="flex flex-col">
              <span className="text-yellow-400 font-black text-sm tracking-wide">BLACKJACK!</span>
              <span className="text-green-400 font-bold text-xs">+{formattedAmount}</span>
            </div>
          </>
        ) : (
          <>
            <span className="text-green-400 text-lg">✓</span>
            <div className="flex flex-col">
              <span className="text-green-400 font-bold text-sm">WIN</span>
              <span className="text-green-300 font-bold text-xs">+{formattedAmount}</span>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes slideIn {
          0% {
            transform: translateX(100%);
            opacity: 0;
          }
          100% {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes fadeOut {
          0% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }

        .win-notification {
          animation: slideIn 0.3s ease-out, fadeOut 0.5s ease-in 2s forwards;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8), 0 0 20px rgba(34, 197, 94, 0.5);
        }
      `}</style>
    </div>
  );
};

export default WinNotification;