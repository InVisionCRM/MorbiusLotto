'use client';

import React from 'react';
import type { CreatorTournamentItem, CreatorEarning } from '@/lib/tournament-types';

interface CreatorStatsProps {
  tournaments: CreatorTournamentItem[];
  earnings: CreatorEarning[];
}

export function CreatorStats({ tournaments, earnings }: CreatorStatsProps) {
  const totalTournaments = tournaments.length;
  const activeTournaments = tournaments.filter(t => t.status === 'active').length;
  const completedTournaments = tournaments.filter(t => t.status === 'completed').length;

  // Sum up all earnings
  const totalEarnings = earnings.reduce((sum, e) => {
    return sum + BigInt(e.feeEarned || '0');
  }, 0n);

  const formatMorbius = (wei: bigint): string => {
    const whole = wei / BigInt(1e18);
    return Number(whole).toLocaleString();
  };

  const stats = [
    {
      label: 'Total Tournaments',
      value: totalTournaments.toString(),
      icon: 'fa-trophy',
      gradient: 'from-purple-500/20 to-purple-600/10',
      border: 'border-purple-500/30',
      iconColor: 'text-purple-400',
    },
    {
      label: 'Active',
      value: activeTournaments.toString(),
      icon: 'fa-play-circle',
      gradient: 'from-green-500/20 to-green-600/10',
      border: 'border-green-500/30',
      iconColor: 'text-green-400',
    },
    {
      label: 'Completed',
      value: completedTournaments.toString(),
      icon: 'fa-flag-checkered',
      gradient: 'from-gray-500/20 to-gray-600/10',
      border: 'border-gray-500/30',
      iconColor: 'text-gray-400',
    },
    {
      label: 'Total Earnings',
      value: `${formatMorbius(totalEarnings)} MORBIUS`,
      icon: 'fa-coins',
      gradient: 'from-yellow-500/20 to-yellow-600/10',
      border: 'border-yellow-500/30',
      iconColor: 'text-yellow-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`bg-gradient-to-br ${stat.gradient} rounded-xl p-4 border ${stat.border}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <i className={`fas ${stat.icon} ${stat.iconColor}`} />
            <span className="text-gray-400 text-xs uppercase tracking-wider">{stat.label}</span>
          </div>
          <p className="text-white text-xl font-bold">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
