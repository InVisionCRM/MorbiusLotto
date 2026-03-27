'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { useBlackjackTables } from '@/hooks/use-blackjack-tables';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Trash2, RefreshCw } from 'lucide-react';

interface BJMultiTableSummary {
  id: string;
  status: string;
  minBet: string;
  maxBet: string;
  seatedCount: number;
  emptySeats: number;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default function AdminBJMultiTab() {
  const { address } = useAccount();
  const { imageOptions, videoOptions } = useBlackjackTables({ enabledOnly: false });
  const [tables, setTables] = useState<BJMultiTableSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [minBetEther, setMinBetEther] = useState('1');
  const [maxBetEther, setMaxBetEther] = useState('100000');
  const [themeKind, setThemeKind] = useState<'video' | 'image'>('video');
  const [themeId, setThemeId] = useState('glowingTable');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTables = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bj-multi/admin/tables`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load tables');
      setTables(data.tables);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTables(); }, [fetchTables]);

  const themeList = themeKind === 'video' ? videoOptions : imageOptions;

  useEffect(() => {
    const list = themeKind === 'video' ? videoOptions : imageOptions;
    if (list.length === 0) return;
    if (!list.some((t) => t.id === themeId)) {
      setThemeId(list[0].id);
    }
  }, [themeKind, videoOptions, imageOptions, themeId]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const minBet = parseEther(minBetEther || '1').toString();
      const maxBet = parseEther(maxBetEther || '100000').toString();
      const res = await fetch(`/api/bj-multi/admin/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minBet, maxBet, themeKind, themeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create table');
      setShowCreate(false);
      await fetchTables();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (tableId: string) => {
    if (!confirm('Delete this table? Seated players will lose their seats.')) return;
    setDeletingId(tableId);
    setError(null);
    try {
      const res = await fetch(`/api/bj-multi/admin/tables/${tableId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete table');
      await fetchTables();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm text-slate-200">Multiplayer Blackjack Tables</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchTables}
                disabled={loading}
                className="text-xs text-slate-400 hover:text-slate-200 px-2 h-7"
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => setShowCreate(true)}
                className="text-xs bg-cyan-600 hover:bg-cyan-700 text-white h-7 px-3"
              >
                <Plus className="w-3 h-3 mr-1" /> New Table
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="text-xs text-red-400 mb-3">{error}</p>
          )}
          {tables.length === 0 && !loading ? (
            <p className="text-xs text-slate-500 text-center py-6">
              No multiplayer blackjack tables. Create one above.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-xs text-slate-400">ID</TableHead>
                  <TableHead className="text-xs text-slate-400">Status</TableHead>
                  <TableHead className="text-xs text-slate-400">Min Bet</TableHead>
                  <TableHead className="text-xs text-slate-400">Max Bet</TableHead>
                  <TableHead className="text-xs text-slate-400">Seats</TableHead>
                  <TableHead className="text-xs text-slate-400 w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map(t => (
                  <TableRow key={t.id} className="border-slate-700/50">
                    <TableCell className="text-[11px] text-slate-400 font-mono">{t.id.slice(0, 8)}…</TableCell>
                    <TableCell>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded ${
                        t.status === 'waiting' ? 'bg-slate-700 text-slate-300' :
                        t.status === 'betting' ? 'bg-yellow-900/60 text-yellow-300' :
                        t.status === 'playing' || t.status === 'dealer_turn' ? 'bg-green-900/60 text-green-300' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {t.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-[11px] text-slate-300">
                      {Number(formatEther(BigInt(t.minBet))).toLocaleString()} MORBIUS
                    </TableCell>
                    <TableCell className="text-[11px] text-slate-300">
                      {Number(formatEther(BigInt(t.maxBet))).toLocaleString()} MORBIUS
                    </TableCell>
                    <TableCell className="text-[11px] text-slate-300">
                      {t.seatedCount}/3
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(t.id)}
                        disabled={deletingId === t.id}
                        className="text-red-400 hover:text-red-300 hover:bg-red-900/20 h-6 w-6 p-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-slate-900 border-slate-700 max-h-[min(92vh,900px)] w-[calc(100vw-1.25rem)] max-w-md sm:max-w-lg overflow-y-auto overscroll-contain p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-slate-200 text-sm">Create Multiplayer Blackjack Table</DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              3 fixed seats. Dealer is server-side.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Min Bet (MORBIUS)</Label>
              <Input
                value={minBetEther}
                onChange={e => setMinBetEther(e.target.value)}
                className="bg-slate-800 border-slate-600 text-slate-200 text-xs h-8"
                placeholder="1"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Max Bet (MORBIUS)</Label>
              <Input
                value={maxBetEther}
                onChange={e => setMaxBetEther(e.target.value)}
                className="bg-slate-800 border-slate-600 text-slate-200 text-xs h-8"
                placeholder="100000"
              />
            </div>
          </div>
          {/* Theme picker */}
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">Table Theme</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setThemeKind('video')}
                className={`flex-1 text-sm font-medium py-2.5 rounded-md border transition-colors ${themeKind === 'video' ? 'border-cyan-500 bg-cyan-900/40 text-white' : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500'}`}
              >Video</button>
              <button
                type="button"
                onClick={() => setThemeKind('image')}
                className={`flex-1 text-sm font-medium py-2.5 rounded-md border transition-colors ${themeKind === 'image' ? 'border-cyan-500 bg-cyan-900/40 text-white' : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500'}`}
              >Image</button>
            </div>
            <p className="text-xs text-slate-400">
              {themeList.length} {themeKind === 'video' ? 'video' : 'image'} tables (same list as single-player). Tap one to select.
            </p>
            <div
              role="listbox"
              aria-label={themeKind === 'video' ? 'Video table theme' : 'Image table theme'}
              className="max-h-[min(52vh,340px)] overflow-y-auto overscroll-contain rounded-lg border border-slate-600 bg-slate-950/90 p-1.5 space-y-1.5"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {themeList.map((t) => {
                const selected = themeId === t.id;
                const showId = !isUuidLike(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => setThemeId(t.id)}
                    className={`w-full min-h-[48px] flex flex-col justify-center rounded-md px-3 py-2.5 text-left transition-colors border sm:min-h-[44px] ${
                      selected
                        ? 'bg-cyan-900/50 text-white border-cyan-500/70 shadow-[0_0_0_1px_rgba(34,211,238,0.25)]'
                        : 'bg-slate-800 text-slate-100 border-slate-600 hover:bg-slate-700 active:bg-slate-600'
                    }`}
                  >
                    <span className="text-sm font-semibold leading-snug text-white break-words">{t.label}</span>
                    {showId && (
                      <span className="text-[11px] text-slate-300/90 font-mono truncate mt-0.5" title={t.id}>
                        {t.id}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCreate(false)}
              className="text-xs text-slate-400"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={creating}
              className="text-xs bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {creating ? 'Creating…' : 'Create Table'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
