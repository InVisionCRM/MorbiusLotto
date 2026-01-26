'use client'

import React from 'react';
import Image from 'next/image';
import { useMorbiusBurned } from '@/hooks/use-morbius-burned';
import { NumberTicker } from '@/components/ui/number-ticker';
import { formatEther } from 'viem';

interface MorbiusBurnedDisplayProps {
  variant?: 'inline' | 'card';
  className?: string;
}

export function MorbiusBurnedDisplay({ variant = 'inline', className = '' }: MorbiusBurnedDisplayProps) {
  const { burnedAmount, isLoading } = useMorbiusBurned();

  // Convert from wei to whole tokens (no decimals for display)
  const burnedTokens = Math.floor(Number(formatEther(burnedAmount)));

  if (variant === 'card') {
    return (
      <div className={`text-center ${className}`}>
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-orange-500 text-2xl">🔥</span>
          <span className="text-white/60 text-sm font-bold uppercase tracking-wider">Total Burned</span>
        </div>
        <div className="flex items-center justify-center gap-2">
          {isLoading ? (
            <span className="text-3xl font-black text-orange-400 animate-pulse">Loading...</span>
          ) : (
            <>
              <NumberTicker
                value={burnedTokens}
                className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500"
              />
              <Image
                src="/morbius/MorbiusLogo (3).png"
                alt="Morbius"
                width={32}
                height={32}
                className="object-contain"
              />
            </>
          )}
        </div>
      </div>
    );
  }

  // Inline variant (for nav dropdowns)
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-orange-500">🔥</span>
      <span className="text-white/60 text-xs">Burned:</span>
      {isLoading ? (
        <span className="text-orange-400 text-sm animate-pulse">...</span>
      ) : (
        <>
          <NumberTicker
            value={burnedTokens}
            className="text-orange-400 font-bold text-sm"
          />
          <Image
            src="/morbius/MorbiusLogo (3).png"
            alt="Morbius"
            width={16}
            height={16}
            className="object-contain"
          />
        </>
      )}
    </div>
  );
}
