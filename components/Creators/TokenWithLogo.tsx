'use client';

import React from 'react';
import Image from 'next/image';
import { useTokenInfo } from '@/hooks/use-token-info';
import { MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';

interface TokenWithLogoProps {
  /** Token contract address; null = MORBIUS */
  address?: string | null;
  /** Optional size class for the logo */
  logoSize?: 'sm' | 'md' | 'lg';
  /** Show symbol only (compact) or name + symbol */
  variant?: 'symbol' | 'full';
  className?: string;
}

const MORBIUS_LOGO = '/morbius/MorbiusLogo (3).png';
const GEICKO_BASE = 'https://morbius.io/geicko?address=';

export function TokenWithLogo({ address, logoSize = 'sm', variant = 'symbol', className = '' }: TokenWithLogoProps) {
  const tokenInfo = useTokenInfo(address);
  const isMorbius = !address;
  const tokenAddress = isMorbius ? MORBIUS_TOKEN_ADDRESS : address!;
  const href = `${GEICKO_BASE}${encodeURIComponent(tokenAddress)}`;

  const size = logoSize === 'sm' ? 16 : logoSize === 'md' ? 20 : 56;
  const textSize = logoSize === 'lg' ? 'text-xl font-bold' : '';

  if (isMorbius) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1.5 hover:text-cyan-400 transition-colors ${textSize} ${className}`}
      >
        <Image src={MORBIUS_LOGO} alt="" width={size} height={size} className="rounded-full object-contain shrink-0" />
        <span>MORBIUS</span>
      </a>
    );
  }

  const symbol = tokenInfo?.symbol ?? '???';
  const name = tokenInfo?.name ?? 'Token';
  const logoUrl = tokenInfo?.logoUrl;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 hover:text-cyan-400 transition-colors ${textSize} ${className}`}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="rounded-full object-contain shrink-0" width={size} height={size} />
      ) : (
        <span className="rounded-full bg-gray-600 shrink-0" style={{ width: size, height: size }} />
      )}
      <span>{variant === 'full' ? name : symbol}</span>
    </a>
  );
}
