'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, RefreshCw } from 'lucide-react';

const CONFIG_KEYS = [
  { key: 'blackjack_min_bet', label: 'Blackjack min bet (wei)', placeholder: '1000000000000000000' },
  { key: 'blackjack_max_bet', label: 'Blackjack max bet (wei)', placeholder: '100000000000000000000000' },
  { key: 'blackjack_fee_percent', label: 'Blackjack fee %', placeholder: '0' },
] as const;

export default function AdminConfigTab() {
  const { address } = useAccount();
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/config', {
        headers: { 'x-admin-wallet': address },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConfig(data ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load config');
      setConfig({});
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-wallet': address },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConfig(data ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!address) {
    return (
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardContent className="py-4 px-3 text-xs text-slate-500">
          Connect wallet to load config.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/60 border-slate-700/50">
      <CardHeader className="py-2 px-3 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
          <Settings className="w-3.5 h-3.5 text-amber-400" />
          Config
        </CardTitle>
        <button
          type="button"
          onClick={() => fetchConfig()}
          disabled={loading}
          className="p-1.5 rounded border border-slate-600 text-slate-400 hover:text-white disabled:opacity-50"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </CardHeader>
      <CardContent className="py-2 px-3">
        <p className="text-[10px] text-slate-500 mb-2">Game parameters (stored in DB). Server/games may use these; ensure keys match what the backend expects.</p>
        {error && <p className="text-[11px] text-red-400 mb-2">{error}</p>}
        {loading && Object.keys(config).length === 0 && <p className="text-[11px] text-slate-500">Loading…</p>}
        <form onSubmit={handleSave} className="space-y-2">
          {CONFIG_KEYS.map(({ key, label, placeholder }) => (
            <div key={key}>
              <Label className="text-[11px] text-slate-400">{label}</Label>
              <Input
                value={config[key] ?? ''}
                onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.value }))}
                className="mt-0.5 h-8 text-xs bg-slate-800 border-slate-600 font-mono"
                placeholder={placeholder}
              />
            </div>
          ))}
          <div className="pt-2">
            <Button type="submit" size="sm" className="text-xs h-7" disabled={saving}>
              {saving ? 'Saving…' : 'Save config'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
