'use client';

// Per-player craps history modal — sortable rolls table + headline stats
// (rolls, net P&L, biggest win, points hit, seven-outs). Deep-Sea Neon (arcade2)
// styling to match keno2: abyss DialogContent, arc-panel stat cards, cyan accents.

import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  IconArrowsSort,
  IconSortAscending,
  IconSortDescending,
  IconExternalLink,
  IconRefresh,
} from '@tabler/icons-react';
import { useCrapsHistory, type CrapsHistoryRoll } from '@/hooks/use-craps-history';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SortField = 'createdAt' | 'sum' | 'wins' | 'losses';
type SortDir = 'asc' | 'desc';

const fmt = (b: bigint) => b.toLocaleString();
const formatDate = (iso: string) => new Date(iso).toLocaleString();

export function CrapsHistoryModal({ open, onOpenChange }: Props) {
  const { rolls, stats, isLoading, refetch, enabled } = useCrapsHistory(200);
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const arr = [...rolls];
    arr.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'sum':
          return (a.sum - b.sum) * dir;
        case 'wins':
          return (BigInt(a.wins) > BigInt(b.wins) ? 1 : -1) * dir;
        case 'losses':
          return (BigInt(a.losses) > BigInt(b.losses) ? 1 : -1) * dir;
        case 'createdAt':
        default:
          return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
      }
    });
    return arr;
  }, [rolls, sortField, sortDir]);

  const onSort = (f: SortField) => {
    if (sortField === f) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(f); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <IconArrowsSort size={11} className="text-slate-600 ml-1 inline" />;
    return sortDir === 'asc'
      ? <IconSortAscending size={11} className="text-cyan-400 ml-1 inline" />
      : <IconSortDescending size={11} className="text-cyan-400 ml-1 inline" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="arcade2-scope max-w-4xl border-cyan-950 bg-[#050E16] text-slate-200">
        <DialogHeader>
          <DialogTitle className="arc-display text-xl uppercase tracking-wider text-white flex items-center justify-between">
            <span>Craps history</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refetch()}
              className="text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10"
            >
              <IconRefresh size={14} className="mr-1" />
              Refresh
            </Button>
          </DialogTitle>
        </DialogHeader>

        {!enabled && (
          <div className="py-12 text-center text-slate-400">
            Connect your wallet to see your roll history.
          </div>
        )}

        {enabled && (
          <>
            {/* Stats row */}
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                <StatCard label="Rolls" value={stats.rolls.toLocaleString()} />
                <StatCard
                  label="Net P&amp;L"
                  value={`${stats.net >= 0n ? '+' : ''}${fmt(stats.net)}`}
                  accent={stats.net > 0n ? 'win' : stats.net < 0n ? 'loss' : undefined}
                />
                <StatCard label="Biggest win" value={fmt(stats.biggestWin)} accent="win" />
                <StatCard label="Points hit" value={stats.pointsMade.toLocaleString()} />
                <StatCard label="Seven outs" value={stats.sevenOuts.toLocaleString()} accent="loss" />
              </div>
            )}

            {/* Table */}
            <div className="arc-panel rounded-lg overflow-hidden max-h-[420px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#081420] border-b border-cyan-950 hover:bg-[#081420]">
                    <TableHead onClick={() => onSort('createdAt')} className="cursor-pointer text-slate-500 text-[10px] uppercase tracking-[0.18em]">
                      When <SortIcon field="createdAt" />
                    </TableHead>
                    <TableHead className="text-slate-500 text-[10px] uppercase tracking-[0.18em]">Dice</TableHead>
                    <TableHead onClick={() => onSort('sum')} className="cursor-pointer text-slate-500 text-[10px] uppercase tracking-[0.18em]">
                      Sum <SortIcon field="sum" />
                    </TableHead>
                    <TableHead className="text-slate-500 text-[10px] uppercase tracking-[0.18em]">Phase</TableHead>
                    <TableHead onClick={() => onSort('wins')} className="cursor-pointer text-slate-500 text-[10px] uppercase tracking-[0.18em] text-right">
                      Won <SortIcon field="wins" />
                    </TableHead>
                    <TableHead onClick={() => onSort('losses')} className="cursor-pointer text-slate-500 text-[10px] uppercase tracking-[0.18em] text-right">
                      Lost <SortIcon field="losses" />
                    </TableHead>
                    <TableHead className="text-slate-500 text-[10px] uppercase tracking-[0.18em] text-right">Net</TableHead>
                    <TableHead className="text-slate-500 text-[10px] uppercase tracking-[0.18em] text-right">Verify</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={8} className="text-center text-slate-500 py-8">Loading…</TableCell></TableRow>
                  )}
                  {!isLoading && sorted.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-slate-500 py-8">No rolls yet — place a bet and throw the dice.</TableCell></TableRow>
                  )}
                  {!isLoading && sorted.map((r) => <Row key={r.rollId} roll={r} />)}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: 'win' | 'loss' }) {
  const color = accent === 'win' ? '#fcd34d' : accent === 'loss' ? '#fb7185' : '#67e8f9';
  return (
    <div className="arc-panel rounded-lg p-3">
      <div className="text-[9px] uppercase tracking-[0.22em] text-slate-500 mb-1">{label}</div>
      <div className="arc-mono text-lg font-bold tracking-tight" style={{ color }}>{value}</div>
    </div>
  );
}

function Row({ roll }: { roll: CrapsHistoryRoll }) {
  const wins = BigInt(roll.wins);
  const losses = BigInt(roll.losses);
  const net = wins - losses;
  const flag = roll.isSevenOut ? '7-OUT' : roll.isPoint ? 'POINT HIT' : null;

  return (
    <TableRow className="border-b border-cyan-950/60 hover:bg-cyan-500/5">
      <TableCell className="text-xs text-slate-400 whitespace-nowrap">{formatDate(roll.createdAt)}</TableCell>
      <TableCell className="arc-mono text-sm text-slate-200">{roll.die1} + {roll.die2}</TableCell>
      <TableCell className="arc-mono text-sm font-bold text-cyan-300">{roll.sum}</TableCell>
      <TableCell className="text-xs">
        <span className="text-slate-400">{roll.phaseBefore === 'COME_OUT' ? 'Come out' : `Point ${roll.pointBefore ?? '—'}`}</span>
        {flag && (
          <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest ${
            roll.isSevenOut ? 'bg-rose-700/30 text-rose-200' : 'bg-cyan-600/30 text-cyan-200'
          }`}>
            {flag}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right arc-mono text-sm text-amber-300">{wins > 0n ? `+${fmt(wins)}` : '—'}</TableCell>
      <TableCell className="text-right arc-mono text-sm text-rose-300">{losses > 0n ? `−${fmt(losses)}` : '—'}</TableCell>
      <TableCell className={`text-right arc-mono text-sm font-bold ${net > 0n ? 'text-amber-300' : net < 0n ? 'text-rose-300' : 'text-slate-500'}`}>
        {net === 0n ? '0' : `${net > 0n ? '+' : ''}${fmt(net)}`}
      </TableCell>
      <TableCell className="text-right">
        <a
          href={`/api/arcade/craps/verify/${roll.sessionId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-slate-500 hover:text-cyan-300 text-xs"
          title="Open verification record"
        >
          <IconExternalLink size={12} />
        </a>
      </TableCell>
    </TableRow>
  );
}
