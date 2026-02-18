'use client';

import React from 'react';
import type { CreatorEarning } from '@/lib/tournament-types';
import { Theme } from '@/lib/theme';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { TokenAmountWithUsd } from './TokenAmountWithUsd';
import { useTokenPrices } from '@/hooks/use-token-price-usd';
import { MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';

interface CreatorEarningsProps {
  earnings: CreatorEarning[];
}

/** Safely parse to wei BigInt (handles decimal strings from DB) */
function toWei(v: string | number | bigint | null | undefined): bigint {
  if (v == null) return 0n;
  if (typeof v === 'bigint') return v;
  const s = String(v).trim();
  if (!s || s === '0') return 0n;
  const intPart = s.includes('.') ? s.split('.')[0]! : s;
  return BigInt(intPart || '0');
}

function formatUsd(value: number): string {
  if (value >= 1) return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  if (value >= 0.0001) return `$${value.toFixed(4)}`;
  if (value > 0) return `$${value.toFixed(6)}`;
  return '$0.00';
}

export function CreatorEarnings({ earnings }: CreatorEarningsProps) {
  const formatDate = (iso: string): string => {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Unique token addresses for price fetch
  const tokenAddresses = [...new Set(earnings.map((e) => e.prizeTokenAddress ?? MORBIUS_TOKEN_ADDRESS))];
  const prices = useTokenPrices(tokenAddresses);

  // Total USD value of all earnings
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

  if (earnings.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <i className="fas fa-coins text-4xl mb-3 block" />
        <p>No earnings yet</p>
        <p className="text-xs mt-1">Creator fees are earned when tournaments with a fee complete</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-600 overflow-hidden" style={Theme.panel.base}>
      <Table>
        <TableHeader>
          <TableRow className="border-gray-700 hover:bg-transparent">
            <TableHead className="text-gray-400">Tournament</TableHead>
            <TableHead className="text-gray-400">Date Completed</TableHead>
            <TableHead className="text-gray-400">Prize Pool</TableHead>
            <TableHead className="text-gray-400">Fee %</TableHead>
            <TableHead className="text-gray-400">Fee Earned</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {earnings.map((e) => (
            <TableRow key={e.tournamentId} className="border-gray-700/50">
              <TableCell className="text-white font-medium max-w-[200px] truncate">
                {e.tournamentName}
              </TableCell>
              <TableCell className="text-gray-400 text-sm">
                {formatDate(e.completedAt)}
              </TableCell>
              <TableCell className="text-gray-300">
                <TokenAmountWithUsd
                  address={e.prizeTokenAddress}
                  amount={e.prizePool}
                  decimals={e.prizeTokenDecimals ?? 18}
                />
              </TableCell>
              <TableCell className="text-cyan-400">
                {e.feePercent}%
              </TableCell>
              <TableCell className="text-cyan-400 font-medium">
                <TokenAmountWithUsd
                  address={e.prizeTokenAddress}
                  amount={e.feeEarned}
                  decimals={e.prizeTokenDecimals ?? 18}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter className="border-t border-gray-600">
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={4} className="text-gray-400 font-medium text-right">
              Total Earned
            </TableCell>
            <TableCell className="text-cyan-400 font-bold">
              {formatUsd(totalUsd)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
