'use client';

/**
 * StakeVideoPokerGame — the interactive client for chips Video Poker
 * (/video-poker), 9/6 Jacks or Better.
 *
 * Deep-Sea Neon: #050E16 abyss base, cyan #22D3EE accent, amber win amounts.
 * Chakra Petch + JetBrains Mono via the arcade2 font variables.
 *
 * Flow: /deal charges the bet and deals 5 cards from a committed deck → tap to
 * HOLD any subset → /draw replaces the rest and pays per the Jacks-or-Better
 * paytable. The deck is sealed at deal time, so the draw is locked before holds
 * are chosen. The backend keeps no history, so "my hands" is this session only.
 *
 * Layout: 300px control rail (balance, bet + ½/2×/Max, Deal / Draw / New hand,
 * provably fair) · the five-card hand + result banner · the live paytable.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import confetti from 'canvas-confetti';
import { Volume2, VolumeX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePokerChipBalance } from '@/hooks/use-poker-chip-balance';
import { formatChips } from '@/lib/format-poker-chips';
import { PokerChipExchangeModal } from '@/components/poker/PokerChipExchangeModal';
import { probeSiweSession } from '@/lib/api-auth';
import { SessionChart, type SessionPoint } from '@/components/arcade2/SessionChart';
import { FloatingPanel } from '@/components/arcade2/FloatingPanel';
import { VideoPokerCard } from './VideoPokerCard';
import { videoPokerAudio } from './video-poker-audio';
import { VideoPokerInfoTabs, type VideoPokerSessionHand } from './VideoPokerInfoTabs';
import { VideoPokerFairnessModal } from './VideoPokerFairnessModal';
import {
  fetchVideoPokerPaytable,
  dealVideoPoker,
  drawVideoPoker,
  type VideoPokerCategory,
  type VideoPokerPaytable,
} from '@/lib/video-poker-client';

const HISTORY_LIMIT = 25;

type Phase = 'idle' | 'dealing' | 'held' | 'drawing' | 'result';

interface DrawResultState {
  category: VideoPokerCategory;
  categoryName: string;
  multiplier: number;
  payout: number;
  serverSeed: string;
}

function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/);
  return m ? m[1] : null;
}

export function StakeVideoPokerGame() {
  const { address } = useAccount();

  const [info, setInfo] = useState<VideoPokerPaytable | null>(null);
  const [bet, setBet] = useState<number>(100);
  const [activeBet, setActiveBet] = useState<number>(0);
  const [phase, setPhase] = useState<Phase>('idle');

  const [handId, setHandId] = useState<string | null>(null);
  const [dealtHand, setDealtHand] = useState<number[]>([]);
  const [finalHand, setFinalHand] = useState<number[] | null>(null);
  const [holds, setHolds] = useState<boolean[]>([false, false, false, false, false]);
  const [result, setResult] = useState<DrawResultState | null>(null);

  const [session, setSession] = useState<SessionPoint[]>([]);
  const [hands, setHands] = useState<VideoPokerSessionHand[]>([]);

  const [clientSeed, setClientSeed] = useState('');
  const [fairnessOpen, setFairnessOpen] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noChips, setNoChips] = useState(false);
  const [muted, setMuted] = useState(false);

  const { data: chainBalance, refetch: refetchBalance } = usePokerChipBalance(address ?? null);
  const [balance, setBalance] = useState<bigint | null>(null);
  useEffect(() => {
    if (chainBalance != null) {
      try {
        setBalance(BigInt(chainBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
    } else if (!address) {
      setBalance(null);
    }
  }, [chainBalance, address]);

  const minBet = info?.minBet ?? 10;
  const maxBet = info?.maxBet ?? 2000;

  useEffect(() => {
    fetchVideoPokerPaytable()
      .then((i) => {
        setInfo(i);
        setBet((b) => Math.min(Math.max(b, i.minBet), i.maxBet));
      })
      .catch(() => {});
    // Prime the SIWE session so the first deal authenticates cleanly.
    void probeSiweSession().catch(() => {});
  }, []);

  const betting = phase === 'idle';

  const clampBet = useCallback(
    (v: number) => {
      const cap = balance != null ? Math.min(maxBet, Number(balance)) : maxBet;
      return Math.max(minBet, Math.min(cap, Math.floor(v) || minBet));
    },
    [balance, maxBet, minBet],
  );

  const handleErr = useCallback((e: unknown) => {
    const msg = (e as Error)?.message ?? '';
    if (/Not enough chips|insufficient/i.test(msg)) {
      setError('Not enough chips for that bet.');
      setNoChips(true);
    } else if (/401|No session|auth/i.test(msg)) {
      setError('Connect your wallet to play.');
    } else {
      setError(serverDetail(msg) ?? 'Something went wrong. Try again.');
    }
  }, []);

  const deal = useCallback(async () => {
    if (phase !== 'idle' || !info) return;
    const stake = clampBet(bet);
    if (balance != null && BigInt(stake) > balance) {
      setError('Not enough chips for that bet.');
      setNoChips(true);
      return;
    }
    setError(null);
    setNoChips(false);
    setResult(null);
    setFinalHand(null);
    setHolds([false, false, false, false, false]);
    setPhase('dealing');
    videoPokerAudio.init();
    try {
      const r = await dealVideoPoker({ bet: stake, clientSeed: clientSeed.trim() || undefined });
      setHandId(r.handId);
      setDealtHand(r.dealtHand);
      setActiveBet(r.bet);
      videoPokerAudio.playDeal();
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      setPhase('held');
    } catch (e) {
      setPhase('idle');
      handleErr(e);
    }
  }, [phase, info, bet, balance, clientSeed, clampBet, handleErr]);

  const toggleHold = useCallback(
    (i: number) => {
      if (phase !== 'held') return;
      videoPokerAudio.playHold();
      setHolds((prev) => prev.map((h, idx) => (idx === i ? !h : h)));
    },
    [phase],
  );

  const draw = useCallback(async () => {
    if (phase !== 'held' || !handId) return;
    setPhase('drawing');
    setError(null);
    videoPokerAudio.playDraw();
    try {
      const r = await drawVideoPoker({ handId, holds });
      setFinalHand(r.finalHand);
      setResult({
        category: r.category,
        categoryName: r.categoryName,
        multiplier: r.multiplier,
        payout: r.payout,
        serverSeed: r.serverSeed,
      });
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      setPhase('result');
      setSession((prev) => [...prev, { drop: prev.length + 1, bet: activeBet, profit: r.payout - activeBet }]);
      setHands((prev) =>
        [
          { handId: r.handId, bet: activeBet, categoryName: r.categoryName, payout: r.payout, finalHand: r.finalHand },
          ...prev,
        ].slice(0, HISTORY_LIMIT),
      );
      if (r.payout > 0) {
        videoPokerAudio.playWin();
        confetti({
          particleCount: 110,
          spread: 75,
          origin: { y: 0.5 },
          colors: ['#22D3EE', '#FCD34D', '#ffffff'],
        });
      } else {
        videoPokerAudio.playLose();
      }
    } catch (e) {
      setPhase('held');
      handleErr(e);
    }
  }, [phase, handId, holds, activeBet, handleErr]);

  const newHand = useCallback(() => {
    setPhase('idle');
    setHandId(null);
    setDealtHand([]);
    setFinalHand(null);
    setHolds([false, false, false, false, false]);
    setResult(null);
    setError(null);
  }, []);

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id);
    setFairnessOpen(true);
  }, []);

  const toggleMute = () => {
    videoPokerAudio.init();
    videoPokerAudio.setMute(!muted);
    setMuted(!muted);
  };

  const showHand = phase === 'result' && finalHand ? finalHand : dealtHand;
  const showPlaceholders = dealtHand.length === 0;
  const win = phase === 'result' && (result?.payout ?? 0) > 0;

  const primaryLabel =
    phase === 'idle'
      ? 'Deal'
      : phase === 'dealing'
        ? 'Dealing…'
        : phase === 'held'
          ? 'Draw'
          : phase === 'drawing'
            ? 'Drawing…'
            : 'New hand';

  const onPrimary = () => {
    if (phase === 'idle') void deal();
    else if (phase === 'held') void draw();
    else if (phase === 'result') newHand();
  };

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* ───────── Control rail ───────── */}
        <Card className="order-2 h-fit space-y-4 border-0 bg-[#07131F] p-4 ring-1 ring-inset ring-cyan-950/70 lg:order-1 lg:sticky lg:top-20">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-500">Balance</span>
            <div className="flex items-center gap-2">
              <span className="arc-mono text-sm tabular-nums text-amber-300">
                {balance != null ? `${formatChips(balance)} chips` : '—'}
              </span>
              <button
                type="button"
                onClick={() => setExchangeOpen(true)}
                className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20"
              >
                Buy
              </button>
              <button
                type="button"
                onClick={toggleMute}
                className="rounded p-1 text-slate-500 transition-colors hover:text-slate-200"
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-slate-500">Bet</span>
              <span className="text-[11px] text-slate-600">
                {minBet.toLocaleString()}–{maxBet.toLocaleString()}
              </span>
            </div>
            <input
              type="number"
              inputMode="numeric"
              value={bet}
              disabled={!betting}
              min={minBet}
              max={maxBet}
              onChange={(e) => setBet(Number(e.target.value))}
              onBlur={() => setBet((b) => clampBet(b))}
              className="arc-mono w-full rounded-md border border-cyan-950 bg-[#081420] px-3 py-2 text-sm tabular-nums text-slate-100 outline-none focus:border-cyan-500/60 disabled:opacity-50"
            />
            <div className="grid grid-cols-3 gap-2">
              <Button type="button" variant="outline" disabled={!betting} onClick={() => setBet((b) => clampBet(Math.floor(b / 2)))} className="border-cyan-950 bg-transparent text-xs text-slate-500 hover:bg-cyan-500/10 hover:text-slate-200">½</Button>
              <Button type="button" variant="outline" disabled={!betting} onClick={() => setBet((b) => clampBet(b * 2))} className="border-cyan-950 bg-transparent text-xs text-slate-500 hover:bg-cyan-500/10 hover:text-slate-200">2×</Button>
              <Button type="button" variant="outline" disabled={!betting} onClick={() => setBet(clampBet(maxBet))} className="border-cyan-950 bg-transparent text-xs text-slate-500 hover:bg-cyan-500/10 hover:text-slate-200">Max</Button>
            </div>
          </div>

          {phase === 'result' && result && (
            <div className="space-y-1 border-t border-cyan-950/70 pt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-500">Result</span>
                <span className={`arc-mono tabular-nums ${result.payout > 0 ? 'text-cyan-300' : 'text-slate-400'}`}>
                  {result.categoryName}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-500">Returned</span>
                <span className="arc-mono tabular-nums text-amber-300">{result.payout.toLocaleString()}</span>
              </div>
            </div>
          )}

          <Button
            type="button"
            disabled={(phase === 'idle' && !info) || phase === 'dealing' || phase === 'drawing'}
            onClick={onPrimary}
            className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
          >
            {primaryLabel}
          </Button>

          {error && (
            <div className="space-y-1.5 text-center">
              <p className="text-sm text-rose-400">{error}</p>
              {noChips && (
                <button type="button" onClick={() => setExchangeOpen(true)} className="text-sm font-semibold text-cyan-300 underline-offset-2 hover:underline">
                  Buy chips →
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => openVerify(hands[0]?.handId ?? handId ?? null)}
            className="w-full text-center text-xs text-slate-500 transition-colors hover:text-cyan-300"
          >
            Provably Fair{hands.length > 0 || handId ? ' · verify a hand' : ''}
          </button>
        </Card>

        {/* ───────── Hand ───────── */}
        <div className="order-1 space-y-4 lg:order-2">
          <Card className="relative flex flex-col items-center gap-5 border-0 bg-[#07131F] p-5 ring-1 ring-inset ring-cyan-950/70 sm:p-7">
            <div className="flex items-end justify-center gap-2 sm:gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <VideoPokerCard
                    card={showPlaceholders ? null : showHand[i] ?? null}
                    held={(phase === 'held' || phase === 'result') && holds[i]}
                    win={win}
                    flip={phase === 'result' && !holds[i]}
                    onToggle={() => toggleHold(i)}
                    disabled={phase !== 'held'}
                  />
                </div>
              ))}
            </div>

            <div className="min-h-[3.5rem] text-center" aria-live="polite">
              {phase === 'held' ? (
                <p className="arc-display text-sm uppercase tracking-[0.2em] text-cyan-300/80">
                  Tap cards to hold · then draw
                </p>
              ) : result ? (
                <div className="arc-banner-in">
                  <div
                    className={`arc-display text-2xl font-bold uppercase tracking-[0.08em] sm:text-3xl ${
                      result.payout > 0
                        ? 'text-amber-300 drop-shadow-[0_0_20px_rgba(245,158,11,0.55)]'
                        : 'text-slate-500'
                    }`}
                  >
                    {result.categoryName}
                  </div>
                  <div className="arc-mono mt-1 text-sm tabular-nums">
                    {result.payout > activeBet ? (
                      <span className="text-amber-300">+{(result.payout - activeBet).toLocaleString()} chips</span>
                    ) : result.payout === activeBet && result.payout > 0 ? (
                      <span className="text-slate-400">even money — stake returned</span>
                    ) : (
                      <span className="text-rose-400">−{activeBet.toLocaleString()} chips</span>
                    )}
                  </div>
                </div>
              ) : phase === 'idle' ? (
                <p className="arc-display text-sm uppercase tracking-[0.3em] text-slate-600">
                  Place a bet · deal to play
                </p>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      {/* ───────── Session chart + paytable / info ───────── */}
      <div className="mt-4 space-y-4">
        <div className="lg:hidden">
          <SessionChart points={session} unitLabel="Hands" />
        </div>
        <VideoPokerInfoTabs
          info={info}
          hands={hands}
          onVerify={(id) => openVerify(id)}
          currentCategory={phase === 'result' ? result?.category ?? null : null}
        />
      </div>
      <div className="hidden lg:block">
        <FloatingPanel title="Session" storageKey="videopoker.sessionChart.pos">
          <SessionChart points={session} unitLabel="Hands" bare />
        </FloatingPanel>
      </div>

      <VideoPokerFairnessModal
        open={fairnessOpen}
        onClose={() => {
          setFairnessOpen(false);
          setVerifyTarget(null);
        }}
        clientSeed={clientSeed}
        onClientSeedChange={setClientSeed}
        requestVerifyId={verifyTarget}
      />

      <PokerChipExchangeModal
        isOpen={exchangeOpen}
        onClose={() => setExchangeOpen(false)}
        walletAddress={address ?? null}
        onExchangeComplete={() => void refetchBalance()}
      />
    </div>
  );
}
