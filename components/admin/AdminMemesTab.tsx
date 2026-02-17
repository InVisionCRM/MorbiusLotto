'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ImageIcon, Check, X, Trash2, RefreshCw } from 'lucide-react';

interface MemeRow {
  id: number;
  image_data: string;
  template_name: string | null;
  wallet_address: string | null;
  approval_status: string;
  created_at: string;
}

function truncateAddr(addr: string | null): string {
  if (!addr) return '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function AdminMemesTab() {
  const { address } = useAccount();
  const [memes, setMemes] = useState<MemeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [actionId, setActionId] = useState<number | null>(null);

  const headers = (): Record<string, string> =>
    address ? { 'x-admin-wallet': address } : {};

  const fetchMemes = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/memes?status=${encodeURIComponent(statusFilter)}&limit=100`,
        { headers: headers() }
      );
      if (res.ok) {
        const data = await res.json();
        setMemes(data.memes ?? []);
      } else {
        setMemes([]);
      }
    } finally {
      setLoading(false);
    }
  }, [address, statusFilter]);

  const approve = useCallback(
    async (id: number) => {
      if (!address) return;
      setActionId(id);
      try {
        const res = await fetch('/api/admin/memes', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...headers() },
          body: JSON.stringify({ id, approval_status: 'approved' }),
        });
        if (res.ok) {
          setMemes((prev) => prev.filter((m) => m.id !== id));
        }
      } finally {
        setActionId(null);
      }
    },
    [address]
  );

  const deny = useCallback(
    async (id: number) => {
      if (!address) return;
      setActionId(id);
      try {
        const res = await fetch('/api/admin/memes', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...headers() },
          body: JSON.stringify({ id, approval_status: 'denied' }),
        });
        if (res.ok) {
          setMemes((prev) => prev.filter((m) => m.id !== id));
        }
      } finally {
        setActionId(null);
      }
    },
    [address]
  );

  const deleteMeme = useCallback(
    async (id: number) => {
      if (!address || !confirm('Permanently delete this meme?')) return;
      setActionId(id);
      try {
        const res = await fetch(`/api/admin/memes?id=${id}`, {
          method: 'DELETE',
          headers: headers() as HeadersInit,
        });
        if (res.ok) {
          setMemes((prev) => prev.filter((m) => m.id !== id));
        }
      } finally {
        setActionId(null);
      }
    },
    [address]
  );

  useEffect(() => {
    fetchMemes();
  }, [fetchMemes]);

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
          Connect wallet to manage memes.
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
            <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
            Morb-It Memes
          </CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-[11px] bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200"
              aria-label="Status filter"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
              <option value="all">All</option>
            </select>
            <button
              type="button"
              onClick={fetchMemes}
              disabled={loading}
              className="p-1.5 rounded border border-slate-600 text-slate-400 hover:text-white disabled:opacity-50"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </CardHeader>
        <CardContent className="py-3 px-3">
          {loading && memes.length === 0 ? (
            <p className="text-xs text-slate-500">Loading…</p>
          ) : memes.length === 0 ? (
            <p className="text-xs text-slate-500">
              No memes {statusFilter !== 'all' ? `with status "${statusFilter}"` : ''}.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {memes.map((meme) => (
                <div
                  key={meme.id}
                  className="rounded-lg overflow-hidden border border-slate-600/50"
                  style={{
                    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), 0 1px 3px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  <img
                    src={meme.image_data}
                    alt={meme.template_name || 'Meme'}
                    className="w-full h-auto object-contain max-h-32"
                  />
                  <div className="p-2 space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span
                        className={`px-1.5 py-0.5 rounded ${
                          meme.approval_status === 'approved'
                            ? 'bg-emerald-600/60 text-emerald-200'
                            : meme.approval_status === 'denied'
                            ? 'bg-red-600/60 text-red-200'
                            : 'bg-amber-600/60 text-amber-200'
                        }`}
                      >
                        {meme.approval_status}
                      </span>
                      <span className="text-slate-500 truncate max-w-[80px]" title={meme.wallet_address || ''}>
                        {truncateAddr(meme.wallet_address)}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {meme.approval_status === 'pending' && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-[10px] h-6 px-1.5 border-emerald-600 text-emerald-400 hover:bg-emerald-600/20"
                            onClick={() => approve(meme.id)}
                            disabled={actionId === meme.id}
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-[10px] h-6 px-1.5 border-red-600 text-red-400 hover:bg-red-600/20"
                            onClick={() => deny(meme.id)}
                            disabled={actionId === meme.id}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-[10px] h-6 px-1.5 border-slate-600 text-slate-400 hover:bg-red-600/20 hover:text-red-400"
                        onClick={() => deleteMeme(meme.id)}
                        disabled={actionId === meme.id}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
