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
    const timer = setTimeout(onComplete, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  if (amount <= 0n) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-40">
      <div
        className="win-banner px-8 py-6 rounded-md text-center animate-pulse"
        style={{
          background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
          boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 4px 30px rgba(6, 182, 212, 0.4)',
          border: '1px solid rgba(112, 6, 212, 0.83)',
          animation: 'winBanner 0.6s ease-out',
        }}
      >
        {isBlackjack ? (
          <>
            <div className="text-4xl mb-2">♠♥♦♣</div>
            <div className="text-3xl font-bold text-yellow-400 mb-2 animate-bounce">
              BLACKJACK!
            </div>
            <div className="text-xl font-bold text-cyan-300">
              +{formatEther(amount)} MORBIUS
            </div>
          </>
        ) : (
          <>
            <div className="text-4xl mb-2">🎉</div>
            <div className="text-2xl font-bold text-green-400 mb-2">
              YOU WIN!
            </div>
            <div className="text-xl font-bold text-cyan-300">
              +{formatEther(amount)} MORBIUS
            </div>
          </>
        )}

        <style jsx>{`
          @keyframes winBanner {
            0% {
              transform: scale(0.8);
              opacity: 0;
            }
            50% {
              transform: scale(1.1);
            }
            100% {
              transform: scale(1);
              opacity: 1;
            }
          }

          .win-banner {
            animation: winBanner 0.6s ease-out;
          }
        `}</style>
      </div>
    </div>
  );
};

export default WinNotification;