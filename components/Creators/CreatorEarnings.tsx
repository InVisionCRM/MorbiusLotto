'use client';

import React from 'react';
import type { CreatorEarning } from '@/lib/tournament-types';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';

interface CreatorEarningsProps {
  earnings: CreatorEarning[];
}

export function CreatorEarnings({ earnings }: CreatorEarningsProps) {
  const formatMorbius = (wei: string): string => {
    try {
      const whole = BigInt(wei || '0') / BigInt(1e18);
      return Number(whole).toLocaleString();
    } catch {
      return '0';
    }
  };

  const formatDate = (iso: string): string => {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const totalEarned = earnings.reduce((sum, e) => {
    return sum + BigInt(e.feeEarned || '0');
  }, 0n);

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
    <div className="rounded-xl border border-gray-700 overflow-hidden">
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
                {formatMorbius(e.prizePool)}
              </TableCell>
              <TableCell className="text-purple-400">
                {e.feePercent}%
              </TableCell>
              <TableCell className="text-yellow-400 font-medium">
                {formatMorbius(e.feeEarned)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter className="bg-gray-800/50 border-gray-700">
          <TableRow className="border-gray-700 hover:bg-transparent">
            <TableCell colSpan={4} className="text-gray-400 font-medium text-right">
              Total Earned
            </TableCell>
            <TableCell className="text-yellow-400 font-bold">
              {formatMorbius(totalEarned.toString())} MORBIUS
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
