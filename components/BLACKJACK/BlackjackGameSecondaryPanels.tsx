'use client';

import { formatEther } from 'viem';
import { TournamentLeaderboard } from '@/components/BLACKJACK/Tournament';

type TipStats = {
  totalTipAmountWei: string;
  tipCount: number;
  tippers: { address: string; displayName: string | null; totalWei: string; count: number }[];
};

interface BlackjackGameSecondaryPanelsProps {
  address: string | undefined;
  tipStats: TipStats | null;
  tournament: {
    tournamentState: { inTournament: boolean };
    leaderboard: Array<{ player_address: string } & Record<string, unknown>>;
    fetchLeaderboard: () => Promise<unknown>;
  };
}

export function BlackjackGameSecondaryPanels({
  address,
  tipStats,
  tournament,
}: BlackjackGameSecondaryPanelsProps) {
  return (
    <>
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
