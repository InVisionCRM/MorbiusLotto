'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { formatEther, parseEther } from 'viem';
import { useBlackjackTables } from '@/hooks/use-blackjack-tables';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Trash2, RefreshCw } from 'lucide-react';

interface SpWagerTierAdminRow {
  id: string;
  label: string;
  minBet: string;
  maxBet: string;
  themeKind: 'image' | 'video' | null;
  themeId: string | null;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default function AdminBJSingleTab() {
  const { imageOptions, videoOptions, getThemeInfo } = useBlackjackTables({ enabledOnly: false });
  const [tiers, setTiers] = useState<SpWagerTierAdminRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [minBetEther, setMinBetEther] = useState('1');
  const [maxBetEther, setMaxBetEther] = useState('100000');
  const [themeKind, setThemeKind] = useState<'video' | 'image'>('video');
  const [themeId, setThemeId] = useState('glowingTable');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTiers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/bj-single/admin/wager-tiers');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load tables');
      setTiers(data.tiers ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTiers();
  }, [fetchTiers]);

  const themeList = themeKind === 'video' ? videoOptions : imageOptions;

  useEffect(() => {
    const list = themeKind === 'video' ? videoOptions : imageOptions;
    if (list.length === 0) return;
    if (!list.some((t) => t.id === themeId)) {
      setThemeId(list[0].id);
    }
  }, [themeKind, videoOptions, imageOptions, themeId]);

  const buildAutoLabel = useCallback(() => {
    const t = themeList.find((x) => x.id === themeId);
    const name = t?.label ?? themeId;
    return `${name} · ${minBetEther}–${maxBetEther} MORBIUS`;
  }, [themeList, themeId, minBetEther, maxBetEther]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const minBet = parseEther(minBetEther || '1').toString();
      const maxBet = parseEther(maxBetEther || '100000').toString();
      const res = await fetch('/api/bj-single/admin/wager-tiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: buildAutoLabel(),
          minBet,
          maxBet,
          themeKind,
          themeId,
          enabled: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create table');
      setShowCreate(false);
      await fetchTiers();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (tierId: string) => {
    if (!confirm('Delete this wager table? Players can no longer select it.')) return;
    setDeletingId(tierId);
    setError(null);
    try {
      const res = await fetch(`/api/bj-single/admin/wager-tiers/${tierId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete table');
      await fetchTiers();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  const themeLabel = (row: SpWagerTierAdminRow) => {
    if (!row.themeKind || !row.themeId) return '—';
    return getThemeInfo({ kind: row.themeKind, id: row.themeId }).label;
  };

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm text-slate-200">Single-player Blackjack Tables</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchTiers}
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
          {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
          {tiers.length === 0 && !loading ? (
            <p className="text-xs text-slate-500 text-center py-6">
              No single-player tables. Create one above.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-xs text-slate-400 w-[5.5rem]">Table</TableHead>
                  <TableHead className="text-xs text-slate-400">ID</TableHead>
                  <TableHead className="text-xs text-slate-400">Min Bet</TableHead>
                  <TableHead className="text-xs text-slate-400">Max Bet</TableHead>
                  <TableHead className="text-xs text-slate-400 hidden sm:table-cell">Theme</TableHead>
                  <TableHead className="text-xs text-slate-400 w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tiers.map((t) => {
                  const box = 'h-10 w-[4.5rem] rounded border border-slate-600 overflow-hidden bg-black';
                  let preview: React.ReactNode;
                  if (!t.themeKind || !t.themeId) {
                    preview = (
                      <div className={`${box} flex items-center justify-center text-[9px] text-slate-500`}>—</div>
                    );
                  } else {
                    const info = getThemeInfo({ kind: t.themeKind, id: t.themeId });
                    preview =
                      t.themeKind === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={info.src} alt="" className={`${box} object-cover`} />
                      ) : (
                        <video src={info.src} className={`${box} object-cover`} muted playsInline preload="metadata" />
                      );
                  }
                  return (
                    <TableRow key={t.id} className="border-slate-700/50">
                      <TableCell className="py-2">{preview}</TableCell>
                      <TableCell className="text-[11px] text-slate-400 font-mono">{t.id.slice(0, 8)}…</TableCell>
                      <TableCell className="text-[11px] text-slate-300">
                        {Number(formatEther(BigInt(t.minBet))).toLocaleString()} MORBIUS
                      </TableCell>
                      <TableCell className="text-[11px] text-slate-300">
                        {Number(formatEther(BigInt(t.maxBet))).toLocaleString()} MORBIUS
                      </TableCell>
                      <TableCell className="text-[11px] text-slate-300 hidden sm:table-cell max-w-[160px] truncate" title={themeLabel(t)}>
                        {themeLabel(t)}
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
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-slate-900 border-slate-700 max-h-[min(92vh,900px)] w-[calc(100vw-1.25rem)] max-w-md sm:max-w-lg overflow-y-auto overscroll-contain p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-slate-200 text-sm">Create Single-player Blackjack Table</DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Stake limits and default felt (same themes as multiplayer).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Min Bet (MORBIUS)</Label>
              <Input
                value={minBetEther}
                onChange={(e) => setMinBetEther(e.target.value)}
                className="bg-slate-800 border-slate-600 text-slate-200 text-xs h-8"
                placeholder="1"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Max Bet (MORBIUS)</Label>
              <Input
                value={maxBetEther}
                onChange={(e) => setMaxBetEther(e.target.value)}
                className="bg-slate-800 border-slate-600 text-slate-200 text-xs h-8"
                placeholder="100000"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">Table Theme</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setThemeKind('video')}
                className={`flex-1 text-sm font-medium py-2.5 rounded-md border transition-colors ${
                  themeKind === 'video'
                    ? 'border-cyan-500 bg-cyan-900/40 text-white'
                    : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500'
                }`}
              >
                Video
              </button>
              <button
                type="button"
                onClick={() => setThemeKind('image')}
                className={`flex-1 text-sm font-medium py-2.5 rounded-md border transition-colors ${
                  themeKind === 'image'
                    ? 'border-cyan-500 bg-cyan-900/40 text-white'
                    : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500'
                }`}
              >
                Image
              </button>
            </div>
            <p className="text-xs text-slate-400">
              {themeList.length} {themeKind === 'video' ? 'video' : 'image'} tables (same list as multiplayer). Tap one to select.
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
                    className={`w-full flex items-center gap-3 rounded-md px-2 py-2 text-left transition-colors border min-h-[52px] ${
                      selected
                        ? 'bg-cyan-900/50 text-white border-cyan-500/70 shadow-[0_0_0_1px_rgba(34,211,238,0.25)]'
                        : 'bg-slate-800 text-slate-100 border-slate-600 hover:bg-slate-700 active:bg-slate-600'
                    }`}
                  >
                    <span className="relative h-11 w-[4.75rem] shrink-0 rounded overflow-hidden border border-slate-600/80 bg-black">
                      {themeKind === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <video
                          src={t.src}
                          className="absolute inset-0 h-full w-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 flex flex-col justify-center">
                      <span className="text-sm font-semibold leading-snug text-white break-words">{t.label}</span>
                      {showId && (
                        <span className="text-[11px] text-slate-300/90 font-mono truncate mt-0.5" title={t.id}>
                          {t.id}
                        </span>
                      )}
                    </span>
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
