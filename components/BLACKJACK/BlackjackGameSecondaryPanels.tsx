'use client';

import { formatEther } from 'viem';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GameFAQ } from '@/components/shared/GameFAQ';
import { PlayerStatsDashboard } from '@/components/BLACKJACK/PlayerStatsDashboard';
import { BlackjackRecentPlays } from '@/components/BLACKJACK/BlackjackRecentPlays';
import { BlackjackRecentGames } from '@/components/BLACKJACK/BlackjackRecentGames';
import BlackjackTopPlayers from '@/components/BLACKJACK/BlackjackTopPlayers';
import { TournamentLeaderboard } from '@/components/BLACKJACK/Tournament';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';

type TipStats = {
  totalTipAmountWei: string;
  tipCount: number;
  tippers: { address: string; displayName: string | null; totalWei: string; count: number }[];
};

interface BlackjackGameSecondaryPanelsProps {
  address: string | undefined;
  playerStats: any;
  playerStatsLoading: boolean;
  wsConnected: boolean;
  wsClient: BlackjackWebSocketClient | null;
  offChainBalance: bigint;
  tipStats: TipStats | null;
  blackjackAddress: string;
  morbiusTokenAddress: string;
  tournament: {
    tournamentState: { inTournament: boolean };
    leaderboard: Array<{ player_address: string } & Record<string, unknown>>;
    fetchLeaderboard: () => Promise<unknown>;
  };
}

export function BlackjackGameSecondaryPanels({
  address,
  playerStats,
  playerStatsLoading,
  wsConnected,
  wsClient,
  offChainBalance,
  tipStats,
  blackjackAddress,
  morbiusTokenAddress,
  tournament,
}: BlackjackGameSecondaryPanelsProps) {
  return (
    <>
      <section className="mt-0 w-full min-w-0">
        <div className="flex min-h-0 flex-col w-full">
          {address && playerStats ? (
            <PlayerStatsDashboard
              stats={playerStats}
              isLoading={playerStatsLoading}
              playerAddress={address}
              wsClient={wsConnected ? wsClient : null}
              reserveBalance={offChainBalance}
            />
          ) : (
            <div
              className="flex min-h-[320px] w-full items-center justify-center overflow-hidden rounded-xl px-6 text-center text-white/60 md:min-h-[400px]"
              style={{
                background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
                boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                border: '1px inset rgba(60, 60, 60, 0.5)',
              }}
            >
              Connect wallet to view your player dashboard.
            </div>
          )}
        </div>
      </section>

      {tipStats && tipStats.tipCount > 0 && (
        <div className="mt-4 rounded-xl overflow-hidden" style={{ background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))', border: '1px solid rgba(217, 119, 6, 0.2)' }}>
          <div className="px-4 py-3 border-b border-amber-600/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 text-lg">🎩</span>
              <span className="text-amber-300 font-semibold text-sm">Dealer Tips</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span>{tipStats.tipCount} tip{tipStats.tipCount !== 1 ? 's' : ''}</span>
              <span className="text-amber-400 font-medium">
                {Number(formatEther(BigInt(tipStats.totalTipAmountWei))).toLocaleString()} MORBIUS
              </span>
            </div>
          </div>
          {tipStats.tippers.length > 0 && (
            <div className="px-4 py-2 space-y-1.5 max-h-[180px] overflow-y-auto">
              {tipStats.tippers.map((t, i) => (
                <div key={t.address} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`font-bold w-4 text-right ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-700' : 'text-gray-500'}`}>{i + 1}</span>
                    <span className="text-gray-300 truncate">{t.displayName || `${t.address.slice(0, 6)}...${t.address.slice(-4)}`}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-gray-500">{t.count}x</span>
                    <span className="text-amber-400 font-medium">{Number(formatEther(BigInt(t.totalWei))).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <section className="mt-3 grid grid-cols-1 gap-3 items-start">
        <div className="w-full">
          <GameFAQ
            game="blackjack"
            addresses={[
              { label: 'Blackjack Contract', address: blackjackAddress },
              { label: 'MORBIUS Token', address: morbiusTokenAddress },
            ]}
          />
        </div>
        <div className="px-0">
          <div className="surface-panel relative overflow-hidden rounded-2xl">
            <div className="surface-cyan-glow" />

            <Tabs defaultValue="recent-games" className="relative p-3 sm:p-4">
              <TabsList className="grid h-11 w-full max-w-full grid-cols-3 gap-1 rounded-xl border border-cyan-500/30 bg-black/40 p-1">
                <TabsTrigger
                  value="recent-games"
                  className="font-jost min-w-0 w-full justify-center rounded-lg px-1 py-2 text-center text-[11px] font-bold leading-tight text-white/80 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-blue-600 data-[state=active]:text-white sm:px-2 sm:text-[13px]"
                >
                  Recent Games
                </TabsTrigger>
                <TabsTrigger
                  value="recent-play"
                  className="font-jost min-w-0 w-full justify-center rounded-lg px-1 py-2 text-center text-[11px] font-bold leading-tight text-white/80 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-blue-600 data-[state=active]:text-white sm:px-2 sm:text-[13px]"
                >
                  Recent Play
                </TabsTrigger>
                <TabsTrigger
                  value="leaderboard"
                  className="font-jost min-w-0 w-full justify-center rounded-lg px-1 py-2 text-center text-[11px] font-bold leading-tight text-white/80 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-blue-600 data-[state=active]:text-white sm:px-2 sm:text-[13px]"
                >
                  Leaderboard
                </TabsTrigger>
              </TabsList>

              <TabsContent value="recent-games" className="mt-4 min-h-[260px] focus-visible:outline-none lg:min-h-[300px]">
                <BlackjackRecentGames compact title="Recent Games" />
              </TabsContent>

              <TabsContent value="recent-play" className="mt-4 min-h-[260px] focus-visible:outline-none lg:min-h-[300px]">
                <BlackjackRecentPlays compact title="Recent Play" />
              </TabsContent>

              <TabsContent value="leaderboard" className="mt-4 min-h-[260px] focus-visible:outline-none lg:min-h-[300px]">
                <BlackjackTopPlayers />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </section>

      {tournament.tournamentState.inTournament && (
        <div className="mt-3">
          <TournamentLeaderboard
            leaderboard={tournament.leaderboard as any}
            playerAddress={address}
            playerEntry={tournament.leaderboard.find(e =>
              e.player_address.toLowerCase() === address?.toLowerCase()
            ) as any}
            onRefresh={() => tournament.fetchLeaderboard()}
          />
        </div>
      )}
    </>
  );
}
