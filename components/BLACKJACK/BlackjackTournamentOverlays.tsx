'use client';

import { toast } from 'sonner';
import { TournamentEntry } from '@/components/BLACKJACK/Tournament/TournamentEntry';
import { TournamentComplete } from '@/components/BLACKJACK/Tournament/TournamentComplete';
import { TournamentBrowser } from '@/components/BLACKJACK/Tournament/TournamentBrowser';
import { TournamentCreator } from '@/components/BLACKJACK/Tournament/TournamentCreator';
import { TournamentPinEntry } from '@/components/BLACKJACK/Tournament/TournamentPinEntry';
import type { CreateTournamentRequest, TournamentListItem } from '@/lib/tournament-types';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { useTournament } from '@/hooks/use-tournament';
import type { TableThemeInfo } from '@/hooks/use-blackjack-tables';

type TournamentController = ReturnType<typeof useTournament>;

interface BlackjackTournamentOverlaysProps {
  tournament: TournamentController;
  showTournamentEntry: boolean;
  setShowTournamentEntry: (open: boolean) => void;
  showTournamentComplete: boolean;
  setShowTournamentComplete: (open: boolean) => void;
  showTournamentBrowser: boolean;
  setShowTournamentBrowser: (open: boolean) => void;
  tournamentBrowserInitialTab: 'join' | 'history';
  showTournamentCreator: boolean;
  setShowTournamentCreator: (open: boolean) => void;
  showTournamentPinEntry: boolean;
  setShowTournamentPinEntry: (open: boolean) => void;
  pendingJoinTournament: TournamentListItem | null;
  setPendingJoinTournament: (item: TournamentListItem | null) => void;
  setIsTournamentMode: (enabled: boolean) => void;
  offChainBalance: bigint;
  address: string | undefined;
  wsClient: BlackjackWebSocketClient | null;
  getThemeInfo: (theme: { kind: 'image' | 'video'; id: string }) => TableThemeInfo;
  fetchBalance: () => Promise<void> | void;
}

export function BlackjackTournamentOverlays({
  tournament,
  showTournamentEntry,
  setShowTournamentEntry,
  showTournamentComplete,
  setShowTournamentComplete,
  showTournamentBrowser,
  setShowTournamentBrowser,
  tournamentBrowserInitialTab,
  showTournamentCreator,
  setShowTournamentCreator,
  showTournamentPinEntry,
  setShowTournamentPinEntry,
  pendingJoinTournament,
  setPendingJoinTournament,
  setIsTournamentMode,
  offChainBalance,
  address,
  wsClient,
  getThemeInfo,
  fetchBalance,
}: BlackjackTournamentOverlaysProps) {
  return (
    <>
      <TournamentEntry
        isOpen={showTournamentEntry}
        onClose={() => setShowTournamentEntry(false)}
        onEnter={async () => {
          const success = await tournament.enterTournament();
          if (success) {
            setShowTournamentEntry(false);
            setIsTournamentMode(true);
            toast.success('Welcome to the tournament!');
            fetchBalance();
          }
        }}
        isLoading={tournament.isLoading}
        playerBalance={offChainBalance}
        prizePool={tournament.tournamentInfo?.prizePool}
        entryCount={tournament.tournamentInfo?.entryCount}
      />

      <TournamentComplete
        isOpen={showTournamentComplete}
        onClose={async () => {
          if (tournament.tournamentState.inTournament) {
            const success = await tournament.leaveTournament();
            if (success) {
              toast.success('Left tournament successfully');
            } else {
              toast.error('Failed to leave tournament');
            }
          }
          setShowTournamentComplete(false);
          setIsTournamentMode(false);
          fetchBalance();
        }}
        onPlayAgain={() => {
          setShowTournamentComplete(false);
          setShowTournamentEntry(true);
        }}
        onBrowseTournaments={() => {
          setShowTournamentComplete(false);
          setShowTournamentBrowser(true);
          setIsTournamentMode(false);
        }}
        state={tournament.tournamentState}
        tournamentName={tournament.tournamentInfo?.name}
        prizeWon={tournament.tournamentState.status === 'completed' && tournament.tournamentState.currentRank <= 10
          ? tournament.getPrizeForRank(tournament.tournamentState.currentRank, BigInt(tournament.tournamentInfo?.prizePool || '0'))
          : 0n}
        prizePool={tournament.tournamentInfo?.prizePool}
      />

      <TournamentBrowser
        isOpen={showTournamentBrowser}
        initialTab={tournamentBrowserInitialTab}
        onClose={() => setShowTournamentBrowser(false)}
        getThemeInfo={getThemeInfo}
        currentTournamentId={tournament.tournamentState.inTournament ? tournament.tournamentState.tournamentId : null}
        onJoin={(t) => {
          if (tournament.tournamentState.inTournament && tournament.tournamentState.tournamentId === t.id) {
            setShowTournamentBrowser(false);
            toast.success('Resuming tournament');
            return;
          }
          if (t.isPrivate) {
            setPendingJoinTournament(t);
            setShowTournamentPinEntry(true);
          } else {
            tournament.joinTournament(t.id, undefined, { onChainTournamentId: t.onChainTournamentId ?? undefined, buyInAmount: t.buyInAmount }).then(success => {
              if (success) {
                setShowTournamentBrowser(false);
                setIsTournamentMode(true);
                toast.success('Joined tournament!');
                fetchBalance().catch(() => {});
              }
            });
          }
        }}
        onCreateNew={() => {
          setShowTournamentBrowser(false);
          setShowTournamentCreator(true);
        }}
        onRefresh={() => tournament.fetchTournamentList()}
        onFetchLeaderboard={(tournamentId) => tournament.fetchTournamentLeaderboard(tournamentId)}
        tournaments={tournament.tournamentList}
        isLoading={tournament.isLoading}
        isJoinLoading={tournament.isJoinLoading}
        playerBalance={offChainBalance}
        playerAddress={address ?? null}
        wsClient={wsClient}
        onFreerollJoined={async () => {
          setShowTournamentBrowser(false);
          await tournament.fetchTournamentState();
          await tournament.fetchTournamentInfo();
          setIsTournamentMode(true);
          toast.success('Joined freeroll!');
        }}
        tournamentHistory={tournament.tournamentHistory}
        isHistoryLoading={tournament.isHistoryLoading}
        onFetchHistory={tournament.fetchTournamentHistory}
        onUnregister={async (tournamentId) => {
          const success = await tournament.unregisterTournament(tournamentId);
          if (success) {
            await tournament.fetchTournamentList();
            fetchBalance().catch(() => {});
          }
          return success;
        }}
      />

      <TournamentCreator
        isOpen={showTournamentCreator}
        onClose={() => setShowTournamentCreator(false)}
        onCreate={async (params: CreateTournamentRequest) => {
          const result = await tournament.createTournament(params);
          if (result) {
            toast.success('Tournament created!');
            await tournament.fetchTournamentList();
            return result;
          }
          return null;
        }}
        onCreateFreeroll={async (params) => {
          const result = await tournament.createFreeroll(params);
          if (result) {
            toast.success('Freeroll created!');
            await tournament.fetchTournamentList();
            return result;
          }
          return null;
        }}
        isLoading={tournament.isLoading}
        playerBalance={offChainBalance}
      />

      {tournament.joinApprovalReady && (
        <div className="fixed bottom-6 right-6 z-[200] rounded-2xl border border-cyan-400/60 shadow-2xl shadow-cyan-500/30 p-5 w-72" style={{ background: 'rgba(10,20,40,0.97)' }}>
          <p className="text-cyan-300 font-semibold mb-1">Approval confirmed!</p>
          <p className="text-gray-400 text-sm mb-4">Click below to complete your tournament join.</p>
          <button
            onClick={() => {
              tournament.confirmJoin().then(success => {
                if (success) {
                  setShowTournamentBrowser(false);
                  setIsTournamentMode(true);
                  toast.success('Joined tournament!');
                  fetchBalance().catch(() => {});
                }
              });
            }}
            disabled={tournament.isJoinLoading}
            className="w-full py-2.5 rounded-xl font-semibold bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {tournament.isJoinLoading ? 'Confirming...' : 'Confirm Join'}
          </button>
        </div>
      )}

      <TournamentPinEntry
        isOpen={showTournamentPinEntry}
        onClose={() => {
          setShowTournamentPinEntry(false);
          setPendingJoinTournament(null);
        }}
        onSubmit={async (pin) => {
          if (!pendingJoinTournament) return false;
          const success = await tournament.joinTournament(pendingJoinTournament.id, pin, {
            onChainTournamentId: pendingJoinTournament.onChainTournamentId ?? undefined,
            buyInAmount: pendingJoinTournament.buyInAmount,
          });
          if (success) {
            setShowTournamentPinEntry(false);
            setShowTournamentBrowser(false);
            setPendingJoinTournament(null);
            setIsTournamentMode(true);
            toast.success('Joined private tournament!');
            fetchBalance().catch(() => {});
          }
          return success;
        }}
        isLoading={tournament.isJoinLoading}
      />
    </>
  );
}
