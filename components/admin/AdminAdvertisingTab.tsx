'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Megaphone, RefreshCw, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_AD_CREATIVE_URL, getEffectiveAdUrl, isVideoUrl } from '@/lib/ad-config';
import type { AdCreativeConfig } from '@/lib/ad-config';

const AD_KEYS = [
  { key: 'ad_creative_url', label: 'Default (games, sidebars)', help: 'Used on Keno, Plinko, Blackjack, etc.' },
  { key: 'ad_creative_hero_url', label: 'Hero / home', help: 'Optional. Home page hero banner.' },
  { key: 'ad_creative_loading_url', label: 'Loading screens', help: 'Optional. Shown on game loading screens.' },
] as const;

function AdPreview({ url, label }: { url: string; label: string }) {
  const effective = url?.trim() || DEFAULT_AD_CREATIVE_URL;
  const isVideo = isVideoUrl(effective);
  return (
    <div className="rounded-lg overflow-hidden border border-slate-600/50 bg-slate-900/80">
      <div className="px-2 py-1 border-b border-slate-700/50 text-[10px] text-slate-400">{label}</div>
      <div className="relative aspect-video w-full max-w-[280px] mx-auto bg-slate-800">
        {isVideo ? (
          <video
            src={effective}
            className="w-full h-full object-cover"
            muted
            loop
            playsInline
            onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none'; }}
          />
        ) : (
          <div
            className="w-full h-full bg-cover bg-center"
            style={{ backgroundImage: `url(${effective})` }}
          />
        )}
      </div>
    </div>
  );
}

export default function AdminAdvertisingTab() {
  const { address } = useAccount();
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = (): Record<string, string> =>
    address ? { 'x-admin-wallet': address } : {};

  const fetchConfig = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/config', { headers: headers() });
      if (!res.ok) {
        setError('Failed to load config');
        setConfig({});
        return;
      }
      const data = await res.json();
      setConfig(data ?? {});
    } catch {
      setError('Failed to load config');
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
    if (!address) {
      toast.error('Connect wallet');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ad_creative_url: (config.ad_creative_url ?? '').trim(),
        ad_creative_hero_url: (config.ad_creative_hero_url ?? '').trim(),
        ad_creative_loading_url: (config.ad_creative_loading_url ?? '').trim(),
      };
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err?.error || 'Save failed');
        toast.error('Failed to save');
        return;
      }
      const updated = await res.json();
      setConfig(updated ?? config);
      toast.success('Advertising config saved');
    } catch {
      setError('Save failed');
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const adConfig: AdCreativeConfig = {
    ad_creative_url: config.ad_creative_url ?? '',
    ad_creative_hero_url: config.ad_creative_hero_url ?? '',
    ad_creative_loading_url: config.ad_creative_loading_url ?? '',
  };
  const defaultUrl = getEffectiveAdUrl(adConfig, 'default');

  if (!address) {
    return (
      <Card
        className="bg-slate-900/60 border-slate-700/50"
        style={{
          background: 'linear-gradient(145deg,rgb(16, 26, 35),rgb(35, 36, 41))',
          boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
          border: '1px inset rgba(60, 60, 60, 0.5)',
        }}
      >
        <CardContent className="py-4 px-3 text-xs text-slate-500">
          Connect wallet to manage advertising.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card
        className="bg-slate-900/60 border-slate-700/50"
        style={{
          background: 'linear-gradient(145deg,rgb(16, 26, 35),rgb(35, 36, 41))',
          boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
          border: '1px inset rgba(60, 60, 60, 0.5)',
        }}
      >
        <CardHeader className="py-2 px-3 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
            <Megaphone className="w-3.5 h-3.5 text-amber-400" />
            Advertising
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
        <CardContent className="py-3 px-3 space-y-4">
          <p className="text-[10px] text-slate-500">
            Set image or video URLs for all advertising spaces: game sidebars (Keno, Plinko, etc.), hero, home page, and loading screens. Use a path under your site (e.g. /Marketing%20/Advertise%20Placeholders/your.jpg) or a full URL. Leave hero/loading blank to use the default ad everywhere.
          </p>
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          {loading && Object.keys(config).length === 0 && (
            <p className="text-[11px] text-slate-500">Loading…</p>
          )}
          <form onSubmit={handleSave} className="space-y-4">
            {AD_KEYS.map(({ key, label, help }) => (
              <div key={key}>
                <Label className="text-[11px] text-slate-400">{label}</Label>
                <p className="text-[10px] text-slate-500 mt-0.5 mb-1">{help}</p>
                <Input
                  value={config[key] ?? ''}
                  onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.value }))}
                  placeholder={key === 'ad_creative_url' ? DEFAULT_AD_CREATIVE_URL : 'Optional — leave blank to use default'}
                  className="h-8 text-xs bg-slate-800 border-slate-600 font-mono"
                />
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button type="submit" size="sm" className="text-xs h-8" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <span className="text-[10px] text-slate-500">Changes apply site-wide after save.</span>
            </div>
          </form>
          <div className="pt-3 border-t border-slate-700/50 flex flex-wrap gap-3 items-start">
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <ImageIcon className="w-3.5 h-3.5" />
              Preview (default slot)
            </span>
            <AdPreview url={defaultUrl} label="Default ad creative" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
