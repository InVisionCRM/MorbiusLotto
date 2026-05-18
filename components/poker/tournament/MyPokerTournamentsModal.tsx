'use client';

import React, { useMemo, useState } from 'react';
import type { PokerTournamentSummary } from '@/hooks/use-poker-tournament';
import { formatChips } from '@/lib/format-poker-chips';
import { formatPrizePoolDisplay } from '@/lib/format-poker-tournament-prize-display';
import { PokerTournamentShareModal } from './PokerTournamentShareModal';
import { derivePokerShareSnapshotFromSummary } from '@/lib/poker-share-snapshot';

interface MyPokerTournamentsModalProps {
  open: boolean;
  onClose: () => void;
  tournaments: PokerTournamentSummary[];
  myTableId: string | null;
  myTournamentId: string | null;
  onGoToTable: (tableId: string, tournamentId: string) => void;
  onForfeit: (tournamentId: string) => void;
}

function statusLabel(status: PokerTournamentSummary['status']): { text: string; className: string } {
  if (status === 'active') {
    return { text: 'Active', className: 'border-green-500/35 text-green-300/95 bg-green-500/10' };
  }
  if (status === 'registration') {
    return { text: 'Registration', className: 'border-cyan-500/35 text-cyan-200/95 bg-cyan-500/10' };
  }
  if (status === 'completed') {
    return { text: 'Completed', className: 'border-blue-500/35 text-blue-200/90 bg-blue-500/10' };
  }
  return { text: status, className: 'border-white/20 text-white/55 bg-white/5' };
}

function formatBuyIn(t: PokerTournamentSummary): string {
  const amt = (() => {
    try { return BigInt(t.buyInAmount); } catch { return 0n; }
  })();
  if (amt === 0n) return 'Free';
  return `${formatChips(amt)} chips`;
}

function formatPrize(t: PokerTournamentSummary): string {
  return formatPrizePoolDisplay(t.prizePool, {
    prizeTokenAddress: t.prizeTokenAddress ?? null,
    prizeTokenDecimals: t.prizeTokenDecimals,
    prizeTokenSymbol: t.prizeTokenSymbol,
    prizeTokenName: t.prizeTokenName,
  });
}

export function MyPokerTournamentsModal({
  open,
  onClose,
  tournaments,
  myTableId,
  myTournamentId,
  onGoToTable,
  onForfeit,
}: MyPokerTournamentsModalProps) {
  const [shareTournament, setShareTournament] = useState<PokerTournamentSummary | null>(null);
  const shareSnapshot = useMemo(
    () => (shareTournament ? derivePokerShareSnapshotFromSummary(shareTournament) : null),
    [shareTournament],
  );

  if (!open) return null;

  const mine = tournaments.filter((t) => t.isRegistered);

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
            <h3 className="text-lg font-bold text-white truncate">My Tournaments</h3>
            <p className="text-sm text-white/60 mt-0.5 truncate">
              {mine.length === 0
                ? "You aren't registered in any poker tournaments."
                : `You're in ${mine.length} tournament${mine.length === 1 ? '' : 's'}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1 text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            Close
          </button>
        </div>

        <div className="relative max-h-[min(65vh,520px)] overflow-y-auto p-4">
          {mine.length === 0 ? (
            <div className="text-center text-white/45 text-sm py-8">
              Join a tournament from the lobby to see it here.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {mine.map((t) => {
                const status = statusLabel(t.status);
                // MTT: prefer caller's actual seat table over the lowest-seq table — without
                // this, players seated at table 2/3/... would see no "Go to table" button or
                // be sent to table 1.
                const myAssignedTable = t.myTableId ?? t.tableId;
                const isActiveTable =
                  t.status === 'active' && !!myAssignedTable &&
                  myTournamentId === t.tournamentId && myTableId === myAssignedTable;
                return (
                  <li
                    key={t.tournamentId}
                    className="rounded-xl px-3.5 py-3 border border-white/10 bg-white/[0.04]"
                    style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{t.name}</div>
                        <div className="mt-0.5 flex items-center gap-2 flex-wrap text-[11px] text-white/55">
                          <span>Buy-in: <span className="text-yellow-300/95">{formatBuyIn(t)}</span></span>
                          <span className="text-white/25">·</span>
                          <span>Prize: <span className="text-yellow-300/95">{formatPrize(t)}</span></span>
                          <span className="text-white/25">·</span>
                          <span>Players: <span className="text-white/85">{t.registeredCount}/{t.maxPlayers}</span></span>
                        </div>
                      </div>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[11px] ${status.className}`}>
                        {status.text}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 justify-end">
                      {t.status === 'registration' && (
                        <button
                          type="button"
                          onClick={() => setShareTournament(t)}
                          className="h-8 px-3 rounded-lg border border-cyan-500/40 bg-black/30 text-xs font-semibold text-cyan-100 hover:border-cyan-400/60 hover:bg-cyan-500/10 transition-colors"
                          title="Generate a share image for this tournament"
                        >
                          Share
                        </button>
                      )}
                      {isActiveTable && myAssignedTable && (
                        <button
                          type="button"
                          onClick={() => {
                            onGoToTable(myAssignedTable, t.tournamentId);
                            onClose();
                          }}
                          className="h-8 px-3 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-xs font-semibold text-black transition-colors"
                        >
                          Go to table
                        </button>
                      )}
                      {t.status === 'active' && (
                        <button
                          type="button"
                          onClick={() => onForfeit(t.tournamentId)}
                          className="h-8 px-3 rounded-lg bg-red-600/85 hover:bg-red-500 text-xs font-semibold text-white transition-colors"
                        >
                          Forfeit
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {shareTournament && shareSnapshot && (
        <PokerTournamentShareModal
          open
          onClose={() => setShareTournament(null)}
          tournamentName={shareSnapshot.tournamentName}
          isFreeroll={shareSnapshot.isFreeroll}
          scheduleLine={shareSnapshot.scheduleLine}
          prizeLine={shareSnapshot.prizeLine}
          payoutLine={shareSnapshot.payoutLine}
          shareTokenSymbol={shareSnapshot.shareTokenSymbol}
          shareTokenLogoUrl={shareSnapshot.shareTokenLogoUrl}
        />
      )}
    </div>
  );
}
