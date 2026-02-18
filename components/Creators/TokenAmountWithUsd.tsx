'use client';

import React from 'react';
import { TokenWithLogo } from './TokenWithLogo';
import { useTokenPriceUsd } from '@/hooks/use-token-price-usd';

/** Safely parse to wei BigInt */
function toWei(v: string | number | bigint | null | undefined): bigint {
  if (v == null) return 0n;
  if (typeof v === 'bigint') return v;
  const s = String(v).trim();
  if (!s || s === '0') return 0n;
  const intPart = s.includes('.') ? s.split('.')[0]! : s;
  return BigInt(intPart || '0');
}

function formatAmount(amount: string, decimals: number = 18): string {
  const divisor = BigInt(10 ** decimals);
  const whole = toWei(amount) / divisor;
  return Number(whole).toLocaleString();
}

function formatUsd(value: number): string {
  if (value >= 1) return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  if (value >= 0.0001) return `$${value.toFixed(4)}`;
  if (value > 0) return `$${value.toFixed(6)}`;
  return '$0.00';
}

interface TokenAmountWithUsdProps {
  address?: string | null;
  amount: string;
  decimals?: number;
  className?: string;
}

/** Renders token amount, token name/logo, and USD value (from DexScreener) */
export function TokenAmountWithUsd({
  address,
  amount,
  decimals = 18,
  className = '',
}: TokenAmountWithUsdProps) {
  const priceUsd = useTokenPriceUsd(address);
  const wei = toWei(amount);
  const divisor = BigInt(10 ** decimals);
  const humanAmount = Number(wei / divisor);
  const usdValue = priceUsd != null ? humanAmount * priceUsd : null;

  return (
    <span className={`inline-flex items-center gap-2 flex-wrap ${className}`}>
      <span>{formatAmount(amount, decimals)}</span>
      <TokenWithLogo address={address} />
      {usdValue != null && (
        <span className="text-gray-500 text-sm">({formatUsd(usdValue)})</span>
      )}
    </span>
  );
}
