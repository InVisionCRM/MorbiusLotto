'use client';

import React, { useState, useMemo } from 'react';
import type { CreatorTournamentItem } from '@/lib/tournament-types';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';

interface CreatorTournamentListProps {
  tournaments: CreatorTournamentItem[];
}

type SortField = 'createdAt' | 'entryCount' | 'prizePool' | 'creatorFeeEarned';

export function CreatorTournamentList({ tournaments }: CreatorTournamentListProps) {
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortAsc, setSortAsc] = useState(false);

  const formatMorbius = (wei: string): string => {
    try {
      const whole = BigInt(wei || '0') / BigInt(1e18);
      return Number(whole).toLocaleString();
    } catch {
      return '0';
    }
  };

  const formatDate = (iso: string | null): string => {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sorted = useMemo(() => {
    return [...tournaments].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'createdAt':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'entryCount':
          cmp = a.entryCount - b.entryCount;
          break;
        case 'prizePool':
          cmp = Number(BigInt(a.prizePool || '0') - BigInt(b.prizePool || '0'));
          break;
        case 'creatorFeeEarned':
          cmp = Number(BigInt(a.creatorFeeEarned || '0') - BigInt(b.creatorFeeEarned || '0'));
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [tournaments, sortField, sortAsc]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <i className="fas fa-sort text-gray-600 ml-1 text-xs" />;
    return sortAsc
      ? <i className="fas fa-sort-up text-cyan-400 ml-1 text-xs" />
      : <i className="fas fa-sort-down text-cyan-400 ml-1 text-xs" />;
  };

  if (tournaments.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <i className="fas fa-trophy text-4xl mb-3 block" />
        <p>No tournaments created yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-700 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-gray-700 hover:bg-transparent">
            <TableHead className="text-gray-400">Name</TableHead>
            <TableHead className="text-gray-400">Status</TableHead>
            <TableHead
              className="text-gray-400 cursor-pointer select-none"
              onClick={() => handleSort('entryCount')}
            >
              Players <SortIcon field="entryCount" />
            </TableHead>
            <TableHead
              className="text-gray-400 cursor-pointer select-none"
              onClick={() => handleSort('prizePool')}
            >
              Prize Pool <SortIcon field="prizePool" />
            </TableHead>
            <TableHead className="text-gray-400">Fee %</TableHead>
            <TableHead
              className="text-gray-400 cursor-pointer select-none"
              onClick={() => handleSort('creatorFeeEarned')}
            >
              Fee Earned <SortIcon field="creatorFeeEarned" />
            </TableHead>
            <TableHead
              className="text-gray-400 cursor-pointer select-none"
              onClick={() => handleSort('createdAt')}
            >
              Created <SortIcon field="createdAt" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((t) => (
            <TableRow key={t.id} className="border-gray-700/50">
              <TableCell className="text-white font-medium max-w-[200px] truncate">
                {t.name}
              </TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    t.status === 'active'
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : t.status === 'completed'
                      ? 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}
                >
                  {t.status}
                </span>
              </TableCell>
              <TableCell className="text-gray-300">{t.entryCount}</TableCell>
              <TableCell className="text-gray-300">{formatMorbius(t.prizePool)}</TableCell>
              <TableCell className="text-purple-400">{t.creatorFeePercent}%</TableCell>
              <TableCell className="text-yellow-400 font-medium">
                {t.status === 'completed' && t.creatorFeePercent > 0
                  ? formatMorbius(t.creatorFeeEarned)
                  : '-'}
              </TableCell>
              <TableCell className="text-gray-500 text-xs">{formatDate(t.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
