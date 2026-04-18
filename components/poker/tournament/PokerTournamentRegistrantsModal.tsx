'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAddress, isAddress } from 'viem';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import { WS_MESSAGE_TYPES } from '@/lib/websocket-message-types';
import { CopyButton } from '@/components/ui/copy-button';

export interface PokerTournamentRegistrantRow {
  playerAddress: string;
  displayName?: string | null;
  registeredAt: string | null;
  status: 'playing' | 'busted' | 'completed';
}

function statusLabel(status: PokerTournamentRegistrantRow['status']): string {
  if (status === 'playing') return 'Playing';
  if (status === 'completed') return 'Finished';
  return 'Eliminated';
}

function profileHref(addr: string): string | null {
  const t = addr?.trim() ?? '';
  if (!t || !isAddress(t)) return null;
  return `/player/${getAddress(t)}`;
}

interface PokerTournamentRegistrantsModalProps {
  open: boolean;
  onClose: () => void;
  wsClient: BlackjackWebSocketClient | null;
  tournamentId: string | null;
  tournamentName: string | null;
  myAddress?: string;
}

export function PokerTournamentRegistrantsModal({
  open,
  onClose,
  wsClient,
  tournamentId,
  tournamentName,
  myAddress,
}: PokerTournamentRegistrantsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PokerTournamentRegistrantRow[]>([]);

  const me = myAddress?.toLowerCase() ?? null;

  useEffect(() => {
    if (!open || !tournamentId || !wsClient?.isConnected()) {
      setRows([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    wsClient
      .sendRequest(WS_MESSAGE_TYPES.pokerTournamentRegistrants, { tournamentId })
      .then((payload: { registrants?: PokerTournamentRegistrantRow[] }) => {
        if (cancelled) return;
        setRows(Array.isArray(payload?.registrants) ? payload.registrants : []);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err?.message ?? 'Failed to load players');
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, tournamentId, wsClient]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div className="relative max-w-lg w-full overflow-hidden rounded-2xl border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 shadow-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(34,211,238,0.12),transparent_65%)]" />
        <div className="relative p-5 border-b border-cyan-500/20 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-white truncate">Registered players</h3>
            {tournamentName && (
              <p className="text-sm text-white/60 mt-0.5 truncate">{tournamentName}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1 text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            Close
          </button>
        </div>

        <div className="relative max-h-[min(60vh,420px)] overflow-y-auto p-4">
          {loading && (
            <div className="text-center text-white/50 text-sm py-8">Loading…</div>
          )}
          {!loading && error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-3 py-2">
              {error}
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div className="text-center text-white/45 text-sm py-8">No registrants yet.</div>
          )}
          {!loading && !error && rows.length > 0 && (
            <ul className="space-y-2">
              {rows.map((r) => {
                const isMe = me && r.playerAddress.toLowerCase() === me;
                const profilePath = profileHref(r.playerAddress);
                return (
                  <li
                    key={`${r.playerAddress}-${r.registeredAt ?? ''}`}
                    className={`rounded-xl px-3 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border ${
                      isMe
                        ? 'border-cyan-500/40 bg-cyan-500/10'
                        : 'border-white/10 bg-white/[0.04]'
                    }`}
                    style={{
                      boxShadow: isMe
                        ? '0 2px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)'
                        : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                    }}
                  >
                    <div className="min-w-0 flex flex-col gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="text-sm font-semibold text-white truncate">
                          {r.displayName?.trim() ? r.displayName.trim() : (
                            <span className="text-white/45 font-normal">No username set</span>
                          )}
                        </span>
                        {isMe && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-400/40 text-cyan-200/90 shrink-0">
                            You
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span
                          className="font-mono text-xs text-cyan-200/85 break-all min-w-0"
                          title={r.playerAddress}
                        >
                          {r.playerAddress}
                        </span>
                        <CopyButton
                          content={r.playerAddress}
                          copyToast="Address copied"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-white/55 hover:text-cyan-300"
                          title="Copy address"
                          aria-label="Copy address"
                        />
                        {profilePath ? (
                          <Link
                            href={profilePath}
                            className="shrink-0 rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200/95 hover:bg-cyan-500/20 hover:border-cyan-400/45 transition-colors"
                          >
                            View Profile
                          </Link>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded-full border ${
                          r.status === 'playing'
                            ? 'border-green-500/35 text-green-300/95 bg-green-500/10'
                            : r.status === 'completed'
                              ? 'border-blue-500/35 text-blue-200/90 bg-blue-500/10'
                              : 'border-white/20 text-white/55 bg-white/5'
                        }`}
                      >
                        {statusLabel(r.status)}
                      </span>
                      {r.registeredAt && (
                        <span className="text-white/40 tabular-nums hidden sm:inline">
                          {new Date(r.registeredAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
