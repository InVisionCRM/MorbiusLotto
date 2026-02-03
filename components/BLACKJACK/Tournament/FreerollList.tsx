'use client';

import React, { useEffect } from 'react';
import { useFreeroll, UseFreerollOptions } from '@/hooks/use-freeroll';
import type { FreerollListItemPayload } from '@/lib/websocket-client';

function formatPhase(phase: string | null): string {
  if (!phase) return '—';
  switch (phase) {
    case 'registration':
      return 'Registration';
    case 'active':
      return 'Live';
    case 'elimination_round':
      return 'Elimination';
    case 'completed':
      return 'Completed';
    default:
      return phase;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

interface FreerollListProps extends Pick<UseFreerollOptions, 'wsClient'> {
  includePast?: boolean;
  onRegistered?: (tournamentId: string) => void;
  onJoined?: (tournamentId: string) => void;
  onReentered?: (tournamentId: string) => void;
}

export function FreerollList({
  wsClient,
  includePast = false,
  onRegistered,
  onJoined,
  onReentered,
}: FreerollListProps) {
  const {
    freerollList,
    isLoading,
    error,
    fetchFreerollList,
    registerFreeroll,
    joinFreeroll,
    reentryFreeroll,
    clearError,
  } = useFreeroll({ wsClient });

  useEffect(() => {
    fetchFreerollList(includePast);
  }, [fetchFreerollList, includePast]);

  const handleRegister = async (t: FreerollListItemPayload) => {
    const result = await registerFreeroll(t.id);
    if (result) onRegistered?.(t.id);
  };

  const handleJoin = async (t: FreerollListItemPayload) => {
    const result = await joinFreeroll(t.id);
    if (result) onJoined?.(t.id);
  };

  const handleReentry = async (t: FreerollListItemPayload) => {
    const result = await reentryFreeroll(t.id);
    if (result) onReentered?.(t.id);
  };

  return (
    <div className="rounded-xl overflow-hidden font-poppins text-white bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 shadow-[inset_0_3px_6px_rgba(0,0,0,0.8),inset_0_-3px_6px_rgba(255,255,255,0.1),0_1px_3px_rgba(0,0,0,0.5)]">
      <div className="p-3 border-b border-white/10">
        <h3 className="text-lg font-semibold text-white">Freeroll Tournaments</h3>
      </div>

      {error && (
        <div className="p-3 flex items-center justify-between bg-red-900/20 border-b border-red-500/30">
          <span className="text-red-300 text-sm">{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="text-red-400 hover:text-red-300 text-sm underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="max-h-[400px] overflow-y-auto">
        {isLoading && freerollList.length === 0 ? (
          <div className="p-6 text-center text-white/70">Loading freerolls…</div>
        ) : freerollList.length === 0 ? (
          <div className="p-6 text-center text-white/70">No freeroll tournaments right now.</div>
        ) : (
          <ul className="divide-y divide-white/10">
            {freerollList.map((t) => (
              <li
                key={t.id}
                className="p-3 hover:bg-white/5 transition-colors"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-white truncate">{t.name}</span>
                    <span
                      className="shrink-0 px-2 py-0.5 rounded text-xs font-medium border border-cyan-500/30 text-cyan-300 bg-cyan-500/10"
                    >
                      {formatPhase(t.current_phase)}
                    </span>
                  </div>
                  <div className="text-xs text-white/70">
                    Start: {formatDate(t.scheduled_start_at)} · {t.registered_count} registered · {t.starting_chips} chips
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {t.current_phase === 'registration' && (
                      <button
                        type="button"
                        onClick={() => handleRegister(t)}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:opacity-90 border border-cyan-500/30"
                      >
                        Register
                      </button>
                    )}
                    {(t.current_phase === 'active' || t.current_phase === 'elimination_round') && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleJoin(t)}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:opacity-90 border border-cyan-500/30"
                        >
                          Join
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReentry(t)}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-600 text-white hover:bg-slate-500 border border-white/10"
                        >
                          Re-enter
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
