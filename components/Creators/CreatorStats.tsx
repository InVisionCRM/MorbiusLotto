'use client';

import React from 'react';
import type { CreatorTournamentItem, CreatorEarning } from '@/lib/tournament-types';
import { useTokenPrices } from '@/hooks/use-token-price-usd';
import { MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import { Theme } from '@/lib/theme';
import { IconTrophy, IconPlayerPlay, IconFlagFilled, IconCoins } from '@tabler/icons-react';

interface CreatorStatsProps {
  tournaments: CreatorTournamentItem[];
  earnings: CreatorEarning[];
}

export function CreatorStats({ tournaments, earnings }: CreatorStatsProps) {
  const totalTournaments = tournaments.length;
  const activeTournaments = tournaments.filter(t => t.status === 'active').length;
  const completedTournaments = tournaments.filter(t => t.status === 'completed').length;

  const toWei = (v: string | number | bigint | null | undefined): bigint => {
    if (v == null) return 0n;
    if (typeof v === 'bigint') return v;
    const s = String(v).trim();
    if (!s || s === '0') return 0n;
    const intPart = s.includes('.') ? s.split('.')[0]! : s;
    return BigInt(intPart || '0');
  };

  const tokenAddresses = [...new Set(earnings.map((e) => e.prizeTokenAddress ?? MORBIUS_TOKEN_ADDRESS))];
  const prices = useTokenPrices(tokenAddresses);

  const totalUsd = earnings.reduce((sum, e) => {
    const addr = e.prizeTokenAddress ?? MORBIUS_TOKEN_ADDRESS;
    const key = addr.toLowerCase();
    const price = prices[key];
    if (price == null) return sum;
    const decimals = e.prizeTokenDecimals ?? 18;
    const divisor = BigInt(10 ** decimals);
    const humanAmount = Number(toWei(e.feeEarned) / divisor);
    return sum + humanAmount * price;
  }, 0);

  const formatUsd = (value: number): string => {
    if (value >= 1) return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (value >= 0.01) return `$${value.toFixed(2)}`;
    if (value >= 0.0001) return `$${value.toFixed(4)}`;
    if (value > 0) return `$${value.toFixed(6)}`;
    return '$0.00';
  };

  const totalEarningsDisplay = formatUsd(totalUsd);

  const stats: { label: string; value: React.ReactNode; icon: React.ReactNode }[] = [
    { label: 'Total Tournaments', value: totalTournaments.toString(), icon: <IconTrophy size={14} className={Theme.cyan.text.primary} /> },
    { label: 'Active', value: activeTournaments.toString(), icon: <IconPlayerPlay size={14} className={Theme.cyan.text.primary} /> },
    { label: 'Completed', value: completedTournaments.toString(), icon: <IconFlagFilled size={14} className={Theme.cyan.text.primary} /> },
    { label: 'Total Earnings', value: totalEarningsDisplay, icon: <IconCoins size={14} className={Theme.cyan.text.primary} /> },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-xl p-4 border border-gray-600"
          style={Theme.panel.base}
        >
          <div className="flex items-center gap-2 mb-2">
            {stat.icon}
            <span className="text-gray-400 text-xs uppercase tracking-wider">{stat.label}</span>
          </div>
          <div className="text-white text-xl font-bold">{stat.value}</div>
        </div>
      ))}
    </div>
  );
}
