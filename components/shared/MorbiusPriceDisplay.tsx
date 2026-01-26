'use client'

import React from 'react';
import Image from 'next/image';
import { useWplsPrice } from '@/hooks/use-wpls-price';
import { formatEther } from 'viem';

interface MorbiusPriceDisplayProps {
  className?: string;
}

export function MorbiusPriceDisplay({ className = '' }: MorbiusPriceDisplayProps) {
  const { wplsPerMORBIUS, isLoading } = useWplsPrice();

  // Format price: WPLS per MORBIUS
  const formattedPrice = wplsPerMORBIUS
    ? Number(formatEther(wplsPerMORBIUS)).toFixed(6)
    : '---';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Image
        src="/morbius/MorbiusLogo (3).png"
        alt="Morbius"
        width={16}
        height={16}
        className="object-contain"
      />
      <span className="text-white/60 text-xs">=</span>
      {isLoading ? (
        <span className="text-cyan-400 text-sm animate-pulse">...</span>
      ) : (
        <span className="text-cyan-400 font-bold text-sm">{formattedPrice}</span>
      )}
      <Image
        src="/Pulse Branding/Logo/ball.png"
        alt="PLS"
        width={16}
        height={16}
        className="object-contain"
      />
    </div>
  );
}
