'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { formatEther, parseEther } from 'viem';
import { useBlackjackTables } from '@/hooks/use-blackjack-tables';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { Plus, Trash2, RefreshCw, Pencil } from 'lucide-react';

interface SpWagerTierAdminRow {
  id: string;
  label: string;
  minBet: string;
  maxBet: string;
  themeKind: 'image' | 'video' | null;
  themeId: string | null;
  sortOrder: number;
  enabled: boolean;
  slug: string | null;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function ThemePickerBlock(props: {
  themeKind: 'video' | 'image';
  setThemeKind: (k: 'video' | 'image') => void;
  themeId: string;
  setThemeId: (id: string) => void;
}) {
  const { imageOptions, videoOptions } = useBlackjackTables({ enabledOnly: false });
  const { themeKind, setThemeKind, themeId, setThemeId } = props;
  const themeList = themeKind === 'video' ? videoOptions : imageOptions;

  useEffect(() => {
    const list = themeKind === 'video' ? videoOptions : imageOptions;
    if (list.length === 0) return;
    if (!list.some((t) => t.id === themeId)) {
      setThemeId(list[0].id);
    }
  }, [themeKind, videoOptions, imageOptions, themeId, setThemeId]);

  return (
    <div className="space-y-2">
      <Label className="text-xs text-slate-400">Table theme (optional)</Label>
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
        {themeList.length} {themeKind === 'video' ? 'video' : 'image'} tables. Selecting a tier with a
        theme sets the player&apos;s felt when they enter that stake band.
      </p>
      <div
        role="listbox"
        className="max-h-[min(40vh,280px)] overflow-y-auto overscroll-contain rounded-lg border border-slate-600 bg-slate-950/90 p-1.5 space-y-1.5"
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
              className={`w-full min-h-[44px] flex flex-col justify-center rounded-md px-3 py-2.5 text-left transition-colors border ${
                selected
                  ? 'bg-cyan-900/50 text-white border-cyan-500/70 shadow-[0_0_0_1px_rgba(34,211,238,0.25)]'
                  : 'bg-slate-800 text-slate-100 border-slate-600 hover:bg-slate-700'
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
  );
}

export default function AdminBJSingleTab() {
  const { getThemeInfo } = useBlackjackTables({ enabledOnly: false });
  const [tiers, setTiers] = useState<SpWagerTierAdminRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<SpWagerTierAdminRow | null>(null);
  const [label, setLabel] = useState('');
  const [slug, setSlug] = useState('');
  const [minBetEther, setMinBetEther] = useState('1');
  const [maxBetEther, setMaxBetEther] = useState('100000');
  const [sortOrder, setSortOrder] = useState('');
  const [useTheme, setUseTheme] = useState(false);
  const [themeKind, setThemeKind] = useState<'video' | 'image'>('video');
  const [themeId, setThemeId] = useState('glowingTable');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTiers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/bj-single/admin/wager-tiers');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load tiers');
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

  const resetForm = () => {
    setLabel('');
    setSlug('');
    setMinBetEther('1');
    setMaxBetEther('100000');
    setSortOrder('');
    setUseTheme(false);
    setThemeKind('video');
    setThemeId('glowingTable');
  };

  const openCreate = () => {
    resetForm();
    setEditRow(null);
    setShowCreate(true);
  };

  const openEdit = (row: SpWagerTierAdminRow) => {
    setEditRow(row);
    setLabel(row.label);
    setSlug(row.slug ?? '');
    setMinBetEther(formatEther(BigInt(row.minBet)));
    setMaxBetEther(formatEther(BigInt(row.maxBet)));
    setSortOrder(String(row.sortOrder));
    const hasTheme = Boolean(row.themeKind && row.themeId);
    setUseTheme(hasTheme);
    if (row.themeKind === 'image' || row.themeKind === 'video') {
      setThemeKind(row.themeKind);
      setThemeId(row.themeId ?? 'glowingTable');
    } else {
      setThemeKind('video');
      setThemeId('glowingTable');
    }
    setShowCreate(true);
  };

  const submitCreateOrEdit = async () => {
    setSaving(true);
    setError(null);
    try {
      const minBet = parseEther(minBetEther || '0').toString();
      const maxBet = parseEther(maxBetEther || '0').toString();
      const sortParsed =
        sortOrder.trim() === '' ? undefined : Number(sortOrder);
      const body: Record<string, unknown> = {
        label: label.trim(),
        minBet,
        maxBet,
        slug: slug.trim() || null,
        sortOrder:
          sortParsed !== undefined && Number.isFinite(sortParsed) ? sortParsed : undefined,
      };
      if (useTheme) {
        body.themeKind = themeKind;
        body.themeId = themeId;
      } else {
        body.themeKind = null;
        body.themeId = null;
      }

      if (editRow) {
        const res = await fetch(`/api/bj-single/admin/wager-tiers/${editRow.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update tier');
      } else {
        const res = await fetch('/api/bj-single/admin/wager-tiers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, enabled: true }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create tier');
      }
      setShowCreate(false);
      setEditRow(null);
      resetForm();
      await fetchTiers();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tierId: string) => {
    if (!confirm('Delete this wager tier? Players can no longer select it.')) return;
    setDeletingId(tierId);
    setError(null);
    try {
      const res = await fetch(`/api/bj-single/admin/wager-tiers/${tierId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete tier');
      await fetchTiers();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  const toggleEnabled = async (row: SpWagerTierAdminRow, enabled: boolean) => {
    setError(null);
    try {
      const res = await fetch(`/api/bj-single/admin/wager-tiers/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      await fetchTiers();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const themeSummary = (row: SpWagerTierAdminRow) => {
    if (!row.themeKind || !row.themeId) return '—';
    const info = getThemeInfo({ kind: row.themeKind, id: row.themeId });
    return `${row.themeKind}: ${info.label}`;
  };

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm text-slate-200">Single-player Blackjack Wager Tables</CardTitle>
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
                onClick={openCreate}
                className="text-xs bg-cyan-600 hover:bg-cyan-700 text-white h-7 px-3"
              >
                <Plus className="w-3 h-3 mr-1" /> New tier
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Each tier is a min/max stake band on the single-player picker. When any tier is enabled, the
            game requires a tier id for WebSocket deals (enforced server-side).
          </p>
        </CardHeader>
        <CardContent>
          {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
          {tiers.length === 0 && !loading ? (
            <p className="text-xs text-slate-500 text-center py-6">No wager tiers. Create one or run migration 109.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-xs text-slate-400">Label</TableHead>
                  <TableHead className="text-xs text-slate-400">Slug</TableHead>
                  <TableHead className="text-xs text-slate-400">Min</TableHead>
                  <TableHead className="text-xs text-slate-400">Max</TableHead>
                  <TableHead className="text-xs text-slate-400 hidden md:table-cell">Theme</TableHead>
                  <TableHead className="text-xs text-slate-400">Sort</TableHead>
                  <TableHead className="text-xs text-slate-400">On</TableHead>
                  <TableHead className="text-xs text-slate-400 w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tiers.map((t) => (
                  <TableRow key={t.id} className="border-slate-700/50">
                    <TableCell className="text-[11px] text-slate-200 font-medium">{t.label}</TableCell>
                    <TableCell className="text-[11px] text-slate-400 font-mono">{t.slug ?? '—'}</TableCell>
                    <TableCell className="text-[11px] text-slate-300 whitespace-nowrap">
                      {Number(formatEther(BigInt(t.minBet))).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-[11px] text-slate-300 whitespace-nowrap">
                      {Number(formatEther(BigInt(t.maxBet))).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-[11px] text-slate-400 hidden md:table-cell max-w-[140px] truncate" title={themeSummary(t)}>
                      {themeSummary(t)}
                    </TableCell>
                    <TableCell className="text-[11px] text-slate-400">{t.sortOrder}</TableCell>
                    <TableCell>
                      <Switch
                        checked={t.enabled}
                        onCheckedChange={(v) => toggleEnabled(t, v)}
                        className="data-[state=checked]:bg-cyan-600"
                      />
                    </TableCell>
                    <TableCell className="space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(t)}
                        className="text-cyan-400 hover:text-cyan-300 h-7 w-7 p-0"
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(t.id)}
                        disabled={deletingId === t.id}
                        className="text-red-400 hover:text-red-300 hover:bg-red-900/20 h-7 w-7 p-0"
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
            <DialogTitle className="text-slate-200 text-sm">
              {editRow ? 'Edit wager tier' : 'Create wager tier'}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Min/max in MORBIUS (18 decimals). Optional slug for links (?tier=slug).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="bg-slate-800 border-slate-600 text-slate-200 text-xs h-8"
                placeholder="e.g. Whale"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Slug (optional, unique)</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="bg-slate-800 border-slate-600 text-slate-200 text-xs h-8"
                placeholder="whale"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">Min (MORBIUS)</Label>
                <Input
                  value={minBetEther}
                  onChange={(e) => setMinBetEther(e.target.value)}
                  className="bg-slate-800 border-slate-600 text-slate-200 text-xs h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">Max (MORBIUS)</Label>
                <Input
                  value={maxBetEther}
                  onChange={(e) => setMaxBetEther(e.target.value)}
                  className="bg-slate-800 border-slate-600 text-slate-200 text-xs h-8"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Sort order (optional)</Label>
              <Input
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="bg-slate-800 border-slate-600 text-slate-200 text-xs h-8"
                placeholder="auto"
              />
            </div>
            <div className="flex items-center gap-2 py-1">
              <Switch id="use-theme" checked={useTheme} onCheckedChange={setUseTheme} />
              <Label htmlFor="use-theme" className="text-xs text-slate-400 cursor-pointer">
                Apply a default table theme when this tier is chosen
              </Label>
            </div>
            {useTheme ? (
              <ThemePickerBlock
                themeKind={themeKind}
                setThemeKind={setThemeKind}
                themeId={themeId}
                setThemeId={setThemeId}
              />
            ) : null}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowCreate(false);
                setEditRow(null);
                resetForm();
              }}
              className="text-xs text-slate-400"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={submitCreateOrEdit}
              disabled={saving || !label.trim()}
              className="text-xs bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {saving ? 'Saving…' : editRow ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
