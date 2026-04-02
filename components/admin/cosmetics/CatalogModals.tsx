'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, Gift, Loader2, X } from 'lucide-react';
import { shortAddr } from '@/components/admin/cosmetics/shared';
import type { OwnerRow } from '@/components/admin/cosmetics/types';

const GRANT_RECIPIENT_STORAGE_KEY = 'admin_cosmetics_grant_recipient_v1';

function isLikelyEvmAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s.trim());
}

/** Admin-only: POST /api/cosmetics/grant — one modal from catalog cards. */
export function GrantItemModal({
  itemKey,
  displayName,
  adminAddress,
  onClose,
  onGranted,
}: {
  itemKey: string;
  displayName: string;
  adminAddress: string;
  onClose: () => void;
  /** Refresh catalog (e.g. minted counts) after a successful insert */
  onGranted?: () => void;
}) {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem(GRANT_RECIPIENT_STORAGE_KEY);
      if (s && typeof s === 'string') setTarget(s);
    } catch {
      // ignore
    }
  }, []);

  const doGrant = async () => {
    setErr(null);
    setMsg(null);
    const t = target.trim();
    if (!isLikelyEvmAddress(t)) {
      setErr('Enter a valid 0x wallet address (42 characters).');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/cosmetics/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetAddress: t,
          itemKey,
          adminAddress,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(typeof data.error === 'string' ? data.error : 'Grant failed');
        return;
      }
      try {
        localStorage.setItem(GRANT_RECIPIENT_STORAGE_KEY, t);
      } catch {
        // storage quota
      }
      if (data.alreadyOwned === true) {
        setMsg('This address already owns this item.');
      } else {
        setMsg(`Granted to ${shortAddr(t)}.`);
      }
      onGranted?.();
    } catch {
      setErr('Network error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="grant-modal-title"
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col"
        style={{ boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-cyan-500/20 flex items-start justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h3 id="grant-modal-title" className="text-sm font-semibold text-white flex items-center gap-2">
              <Gift size={16} className="text-amber-400/90 shrink-0" />
              Grant item
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5 truncate" title={displayName}>
              {displayName}
            </p>
            <code className="text-[10px] text-zinc-500 font-mono break-all">{itemKey}</code>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="grant-recipient" className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">
              Recipient wallet
            </label>
            <input
              id="grant-recipient"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder="0x…"
              className="w-full bg-zinc-900/90 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-cyan-500/40"
            />
            <p className="text-[10px] text-zinc-500 leading-snug">
              Admin grant adds the item to their inventory for free. Last recipient is remembered on this device for quick repeat grants.
            </p>
          </div>
          {err && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
              <AlertTriangle size={12} className="shrink-0" /> {err}
            </div>
          )}
          {msg && (
            <div className="text-xs text-emerald-400/95 bg-emerald-950/30 border border-emerald-800/40 rounded-lg px-3 py-2">
              {msg}
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg border border-zinc-600 text-zinc-300 text-xs font-semibold hover:bg-zinc-800 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={doGrant}
              className="flex-1 min-w-[120px] px-3 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Gift size={12} />}
              {busy ? 'Granting…' : 'Grant'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ItemOwnersModal({
  itemKey,
  displayName,
  adminAddress,
  onClose,
}: {
  itemKey: string;
  displayName: string;
  adminAddress: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<OwnerRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ itemKey, adminAddress });
        const res = await fetch(`/api/cosmetics/admin/item-owners?${qs}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to load owners');
        if (!cancelled) setRows(Array.isArray(data.owners) ? data.owners : []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemKey, adminAddress]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="owners-modal-title"
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-2xl shadow-2xl max-w-lg w-full max-h-[min(85vh,560px)] overflow-hidden flex flex-col"
        style={{ boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-cyan-500/20 flex items-start justify-between gap-2 shrink-0">
          <div>
            <h3 id="owners-modal-title" className="text-sm font-semibold text-white">Owners</h3>
            <p className="text-xs text-zinc-400 mt-0.5 truncate" title={displayName}>{displayName}</p>
            <code className="text-[10px] text-zinc-500 font-mono">{itemKey}</code>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-zinc-500 text-sm">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          )}
          {!loading && error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <p className="text-sm text-zinc-500 text-center py-8">No owners yet (not minted / purchased).</p>
          )}
          {!loading && !error && rows.length > 0 && (
            <ul className="space-y-1.5">
              {rows.map((r, i) => (
                <li
                  key={`${r.walletAddress}-${i}`}
                  className="rounded-lg border border-zinc-700/80 bg-zinc-900/50 px-2.5 py-2 text-[11px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={`https://scan.pulsechain.com/address/${r.walletAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-cyan-400/90 hover:text-cyan-300 flex items-center gap-1 truncate"
                    >
                      {shortAddr(r.walletAddress)}
                      <ExternalLink size={10} className="shrink-0 opacity-60" />
                    </a>
                    <span className="text-zinc-500 shrink-0 tabular-nums">
                      {new Date(r.acquiredAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-zinc-500 mt-1">
                    {r.acquiredFrom ? (
                      <span>
                        Gifted from{' '}
                        <a
                          href={`https://scan.pulsechain.com/address/${r.acquiredFrom}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-400/90 hover:text-amber-300 font-mono"
                        >
                          {shortAddr(r.acquiredFrom)}
                        </a>
                      </span>
                    ) : (
                      <span>Shop purchase or admin grant</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
