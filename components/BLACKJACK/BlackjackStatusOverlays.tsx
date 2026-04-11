'use client';

import type { PendingWithdrawalJob } from '@/hooks/use-pending-withdrawal';
import { IconX } from '@tabler/icons-react';

interface BlackjackStatusOverlaysProps {
  showSplash: boolean;
  onDismissSplash: () => void;
  onDepositFromSplash: () => void;
  pendingJob: PendingWithdrawalJob | null;
}

export function BlackjackStatusOverlays({
  showSplash,
  onDismissSplash,
  onDepositFromSplash,
  pendingJob,
}: BlackjackStatusOverlaysProps) {
  return (
    <>
      {showSplash && (
        <div className="fixed inset-0 z-[150] p-4 bg-black/80 backdrop-blur-sm">
          <div className="absolute top-[50px] left-1/2 -translate-x-1/2 bg-black border border-white/20 rounded-xl p-6 max-w-md w-full shadow-2xl relative">
            <button
              onClick={onDismissSplash}
              className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
              aria-label="Close"
            >
              <IconX size={20} />
            </button>

            <div className="text-center space-y-4">
              <div className="inline-block px-3 py-1 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
                <span className="text-yellow-400 font-bold text-xs uppercase tracking-wider">BETA</span>
              </div>

              <h2 className="text-2xl font-bold text-white">
                Welcome to Blackjack
              </h2>

              <div className="text-white/90 text-sm leading-relaxed space-y-2 text-left">
                <p className="text-center">
                  Blackjack is currently in <span className="font-semibold text-yellow-400">BETA</span>.
                </p>
                <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-white/60 mt-0.5 text-xs">•</span>
                    <p className="flex-1 text-xs">Bet only the <span className="font-semibold text-white">minimum amount</span> while testing</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-white/60 mt-0.5 text-xs">•</span>
                    <p className="flex-1 text-xs">Always <span className="font-semibold text-white">withdraw your entire balance</span> when done playing</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-white/60 mt-0.5 text-xs">•</span>
                    <p className="flex-1 text-xs">Withdrawals via <span className="font-semibold text-white">game menu</span> or <span className="font-semibold text-white">clicking reserve balance</span> at top</p>
                  </div>
                </div>
              </div>

              <button
                onClick={onDepositFromSplash}
                className="w-full px-6 py-3 bg-white text-black font-bold text-sm rounded-lg hover:bg-white/90 transition-colors shadow-lg"
              >
                Deposit MORBIUS to Play
              </button>

              <p className="text-white/60 text-xs">
                Deposit MORBIUS to your reserve to start playing
              </p>
            </div>
          </div>
        </div>
      )}

      {pendingJob && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-black text-white text-sm px-4 py-3 rounded-xl shadow-lg border border-white/10 max-w-sm w-full">
          <svg className="animate-spin h-4 w-4 shrink-0 text-white/70" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="flex-1">
            {pendingJob.status === 'pending_confirmation'
              ? <>Withdrawal confirming on chain&hellip; {pendingJob.txHash && <span className="text-white/50">{pendingJob.txHash.slice(0, 10)}…</span>}</>
              : 'Withdrawal processing...'}
          </span>
        </div>
      )}
    </>
  );
}
