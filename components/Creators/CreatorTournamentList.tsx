'use client';

import React, { useState, useMemo } from 'react';
import { useAccount } from 'wagmi';
import type { CreatorTournamentItem } from '@/lib/tournament-types';
import { TournamentCancelReclaim } from '@/components/BLACKJACK/Tournament/TournamentCancelReclaim';
import { Theme } from '@/lib/theme';
import { IconArrowsSort, IconSortAscending, IconSortDescending, IconTrophy } from '@tabler/icons-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';

interface CreatorTournamentListProps {
  tournaments: CreatorTournamentItem[];
  wsClient?: BlackjackWebSocketClient | null;
  onRefresh?: () => void;
  creatorAddress?: string | null;
}

type SortField = 'createdAt' | 'entryCount' | 'prizePool' | 'creatorFeeEarned';

export function CreatorTournamentList({ tournaments, wsClient, onRefresh, creatorAddress }: CreatorTournamentListProps) {
  const { address } = useAccount();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const effectiveCreatorAddress = creatorAddress || address;
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
    if (sortField !== field) return <IconArrowsSort size={12} className="text-gray-600 ml-1" />;
    return sortAsc
      ? <IconSortAscending size={12} className="text-cyan-400 ml-1" />
      : <IconSortDescending size={12} className="text-cyan-400 ml-1" />;
  };

  if (tournaments.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <IconTrophy size={40} className="mb-3 mx-auto" />
        <p>No tournaments created yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-gray-700 overflow-hidden" style={Theme.panel.base}>
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
              <TableHead className="text-gray-400 w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((t) => (
              <React.Fragment key={t.id}>
                <TableRow className="border-gray-700/50">
                  <TableCell className="text-white font-medium max-w-[200px] truncate">
                    {t.name}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        t.status === 'active'
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                          : t.status === 'completed'
                          ? 'bg-gray-600/50 text-gray-400 border border-gray-500/30'
                          : 'bg-gray-600/50 text-gray-500 border border-gray-500/30'
                      }`}
                    >
                      {t.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-300">{t.entryCount}</TableCell>
                  <TableCell className="text-gray-300">{formatMorbius(t.prizePool)}</TableCell>
                  <TableCell className="text-cyan-400">{t.creatorFeePercent}%</TableCell>
                  <TableCell className="text-cyan-400 font-medium">
                    {t.status === 'completed' && t.creatorFeePercent > 0
                      ? formatMorbius(t.creatorFeeEarned)
                      : '-'}
                  </TableCell>
                  <TableCell className="text-gray-500 text-xs">{formatDate(t.createdAt)}</TableCell>
                  <TableCell>
                    <button
                      onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                      className="px-3 py-1 rounded-lg text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors"
                    >
                      {expandedId === t.id ? 'Hide' : 'Actions'}
                    </button>
                  </TableCell>
                </TableRow>
                {expandedId === t.id && (
                  <TableRow>
                    <TableCell colSpan={8} className="p-4">
                      <TournamentCancelReclaim
                        tournamentId={t.id}
                        tournamentName={t.name}
                        status={t.status}
                        creatorAddress={effectiveCreatorAddress}
                        playerAddress={address}
                        prizeTokenAddress={null} // Not available in CreatorTournamentItem
                        prizePool={t.prizePool}
                        entryCount={t.entryCount}
                        wsClient={wsClient ?? null}
                        onCancel={onRefresh}
                        onReclaim={onRefresh}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
