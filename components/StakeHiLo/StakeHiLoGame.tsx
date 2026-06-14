'use client';

/**
 * StakeHiLoGame — the interactive client for chips Hi-Lo (/hilo).
 *
 * Deep-Sea Neon (the cyan direction HiLoCard/HiLoLadder already commit to):
 * #050E16 abyss base, cyan #22D3EE accent, amber win amounts, rose busts.
 * Chakra Petch + JetBrains Mono via the arcade2 font variables.
 *
 * Stateful flow (like Mines): /start debits the bet and deals a base card →
 * each /pick guesses higher-or-same vs lower; a correct pick compounds the
 * multiplier, a wrong one busts → /cashout banks floor(bet × multiplier) any
 * time after the first correct pick. On mount we resume the active round via
 * /state so a refresh never strands a bet.
 *
 * Layout: 300px control rail (balance, bet + ½/2×/Max, Deal / Cash out,
 * provably fair) · the dealt card, the Higher / Lower pick buttons with live
 * odds + next-multiplier previews, and the pick-trail ladder.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import confetti from 'canvas-confetti';
import { Volume2, VolumeX, ArrowUp, ArrowDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePokerChipBalance } from '@/hooks/use-poker-chip-balance';
import { formatChips } from '@/lib/format-poker-chips';
import { PokerChipExchangeModal } from '@/components/poker/PokerChipExchangeModal';
import { probeSiweSession } from '@/lib/api-auth';
import { SessionChart, type SessionPoint } from '@/components/arcade2/SessionChart';
import { FloatingPanel } from '@/components/arcade2/FloatingPanel';
import { HiLoCard } from './HiLoCard';
import { HiLoLadder } from './HiLoLadder';
import { HiLoInfoTabs } from './HiLoInfoTabs';
import { HiLoFairnessModal } from './HiLoFairnessModal';
import { hiloAudio } from './hilo-audio';
import {
  fetchHiLoInfo,
  fetchHiLoState,
  startHiLo,
  pickHiLo,
  cashoutHiLo,
  fetchHiLoHistory,
  hiLoMultiplierWalkX100,
  hiLoWinChancePct,
  hiLoNextMultiplierX100,
  hiLoPayoutPreview,
  formatMultiplier,
  type HiLoActiveRound,
  type HiLoDirection,
  type HiLoInfo,
  type HiLoHistoryRound,
} from '@/lib/hilo-client';

const HISTORY_LIMIT = 25;

type Phase = 'idle' | 'starting' | 'active' | 'picking' | 'cashing' | 'busted' | 'cashed';

interface RoundResult {
  kind: 'busted' | 'cashed';
  multiplierX100: number;
  payout: number;
  serverSeed: string;
}

function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/);
  return m ? m[1] : null;
}

export function StakeHiLoGame() {
  const { address } = useAccount();

  const [info, setInfo] = useState<HiLoInfo | null>(null);
  const [bet, setBet] = useState<number>(100);
  const [round, setRound] = useState<HiLoActiveRound | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<RoundResult | null>(null);

  const [session, setSession] = useState<SessionPoint[]>([]);
  const [history, setHistory] = useState<HiLoHistoryRound[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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
    fetchHiLoInfo()
      .then((i) => {
        setInfo(i);
        setBet((b) => Math.min(Math.max(b, i.minBet), i.maxBet));
      })
      .catch(() => {});
  }, []);

  const loadMyHistory = useCallback(() => {
    if (!address) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    probeSiweSession()
      .then((ok) => (ok ? fetchHiLoHistory(HISTORY_LIMIT) : []))
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [address]);

  useEffect(() => {
    loadMyHistory();
  }, [loadMyHistory]);

  // Resume an in-progress round after a refresh.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    probeSiweSession()
      .then((ok) => (ok ? fetchHiLoState() : null))
      .then((active) => {
        if (cancelled || !active) return;
        setRound(active);
        setBet(active.bet);
        setPhase('active');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address]);

  const cards = round?.cards ?? [];
  const picks = round?.picks ?? [];
  const topCard = cards.length > 0 ? cards[cards.length - 1] : null;
  const multiplierX100 = round?.multiplierX100 ?? 100;
  const edge = round?.houseEdgeBp ?? info?.houseEdgeBp ?? 100;
  const maxPicks = round?.maxPicks ?? info?.maxPicks ?? 0;
  const picksRemaining = round ? maxPicks - picks.length : 0;

  const multWalk = useMemo(
    () => hiLoMultiplierWalkX100(cards.map((c) => c.rank), picks, edge),
    [cards, picks, edge],
  );

  const betting = phase === 'idle' || phase === 'busted' || phase === 'cashed';
  const canPick = phase === 'active' && picksRemaining > 0;
  const canCash = phase === 'active' && picks.length > 0;
  const cashoutValue = round ? hiLoPayoutPreview(round.bet, multiplierX100) : 0;

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
      setError('Not enough chips for that wager.');
      setNoChips(true);
    } else if (/401|No session|auth/i.test(msg)) {
      setError('Connect your wallet to play.');
    } else {
      setError(serverDetail(msg) ?? 'Something went wrong. Try again.');
    }
  }, []);

  const startRound = useCallback(async () => {
    if (!betting || !info) return;
    const stake = clampBet(bet);
    if (balance != null && BigInt(stake) > balance) {
      setError('Not enough chips for that wager.');
      setNoChips(true);
      return;
    }
    setError(null);
    setNoChips(false);
    setResult(null);
    setPhase('starting');
    hiloAudio.init();
    try {
      const r = await startHiLo({ bet: stake, clientSeed: clientSeed.trim() || undefined });
      setRound({
        roundId: r.roundId,
        bet: r.bet,
        cards: r.cards,
        picks: r.picks,
        multiplierX100: r.multiplierX100,
        serverSeedHash: r.serverSeedHash,
        clientSeed: r.clientSeed,
        nonce: r.nonce,
        houseEdgeBp: r.houseEdgeBp,
        maxPicks: r.maxPicks,
      });
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      setPhase('active');
      hiloAudio.playFlip();
    } catch (e) {
      setPhase('idle');
      handleErr(e);
    }
  }, [betting, info, bet, balance, clientSeed, clampBet, handleErr]);

  const settleHistory = useCallback(
    (
      status: 'busted' | 'cashed_out',
      roundId: string,
      betAmount: number,
      pickCount: number,
      multX100: number,
      payout: number,
    ) => {
      setHistory((prev) =>
        [
          {
            roundId,
            bet: betAmount,
            picks: pickCount,
            wins: status === 'cashed_out' ? pickCount : Math.max(0, pickCount - 1),
            multiplierX100: multX100,
            payout,
            status,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, HISTORY_LIMIT),
      );
    },
    [],
  );

  const doPick = useCallback(
    async (direction: HiLoDirection) => {
      if (!round || phase !== 'active') return;
      setPhase('picking');
      setError(null);
      hiloAudio.init();
      const betAmount = round.bet;
      const roundId = round.roundId;
      const multAtPick = round.multiplierX100;
      try {
        const r = await pickHiLo(roundId, direction);
        if (r.safe) {
          setRound((prev) =>
            prev ? { ...prev, cards: r.cards, picks: r.picks, multiplierX100: r.multiplierX100 } : prev,
          );
          hiloAudio.playSafe();
          setPhase('active');
          if (r.picksRemaining === 0) {
            // Ladder maxed — nothing left to pick; banking is the only move.
            setError('Top of the ladder — cash out to bank it.');
          }
        } else {
          setRound((prev) => (prev ? { ...prev, cards: r.cards, picks: r.picks } : prev));
          hiloAudio.playBust();
          setResult({ kind: 'busted', multiplierX100: multAtPick, payout: 0, serverSeed: r.serverSeed });
          setPhase('busted');
          settleHistory('busted', roundId, betAmount, r.picks.length, multAtPick, 0);
          setSession((prev) => [...prev, { drop: prev.length + 1, bet: betAmount, profit: -betAmount }]);
        }
      } catch (e) {
        setPhase('active');
        handleErr(e);
      }
    },
    [round, phase, settleHistory, handleErr],
  );

  const doCashout = useCallback(async () => {
    if (!round || phase !== 'active' || round.picks.length === 0) return;
    setPhase('cashing');
    setError(null);
    const betAmount = round.bet;
    const roundId = round.roundId;
    try {
      const r = await cashoutHiLo(roundId);
      setRound((prev) =>
        prev ? { ...prev, cards: r.cards, picks: r.picks, multiplierX100: r.multiplierX100 } : prev,
      );
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      setResult({ kind: 'cashed', multiplierX100: r.multiplierX100, payout: r.payout, serverSeed: r.serverSeed });
      setPhase('cashed');
      hiloAudio.playCashout();
      confetti({
        particleCount: 110,
        spread: 75,
        origin: { y: 0.5 },
        colors: ['#22D3EE', '#FCD34D', '#ffffff'],
      });
      settleHistory('cashed_out', roundId, betAmount, r.picks.length, r.multiplierX100, r.payout);
      setSession((prev) => [...prev, { drop: prev.length + 1, bet: betAmount, profit: r.payout - betAmount }]);
    } catch (e) {
      setPhase('active');
      handleErr(e);
    }
  }, [round, phase, settleHistory, handleErr]);

  const playAgain = useCallback(() => {
    setRound(null);
    setResult(null);
    setError(null);
    setPhase('idle');
  }, []);

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id);
    setFairnessOpen(true);
  }, []);

  const toggleMute = () => {
    hiloAudio.init();
    hiloAudio.setMute(!muted);
    setMuted(!muted);
  };

  const hiChance = topCard ? hiLoWinChancePct('hi', topCard.rank) : null;
  const loChance = topCard ? hiLoWinChancePct('lo', topCard.rank) : null;
  const hiNext = topCard ? hiLoNextMultiplierX100(multiplierX100, 'hi', topCard.rank, edge) : null;
  const loNext = topCard ? hiLoNextMultiplierX100(multiplierX100, 'lo', topCard.rank, edge) : null;

  const PickButton = ({ direction }: { direction: HiLoDirection }) => {
    const hi = direction === 'hi';
    const chance = hi ? hiChance : loChance;
    const next = hi ? hiNext : loNext;
    const impossible = next == null;
    return (
      <button
        type="button"
        disabled={!canPick || impossible || phase === 'picking'}
        onClick={() => void doPick(direction)}
        className={[
          'group flex flex-1 flex-col items-center gap-1 rounded-xl border py-4',
          'transition-all duration-100 disabled:cursor-not-allowed disabled:opacity-40',
          'active:scale-[0.96] active:brightness-90',
          hi
            ? 'border-cyan-500/40 hover:border-cyan-400 hover:bg-cyan-500/10 hover:shadow-[0_0_18px_-6px_rgba(34,211,238,0.5)]'
            : 'border-amber-500/40 hover:border-amber-400 hover:bg-amber-500/10 hover:shadow-[0_0_18px_-6px_rgba(245,158,11,0.45)]',
        ].join(' ')}
      >
        <span
          className={`arc-display flex items-center gap-1.5 text-base font-bold uppercase tracking-wider ${
            hi ? 'text-cyan-300' : 'text-amber-300'
          }`}
        >
          {hi ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          {hi ? 'Higher or same' : 'Lower'}
        </span>
        <span className="arc-mono text-xs tabular-nums text-slate-400">
          {impossible ? 'impossible' : `${chance!.toFixed(1)}% · ${formatMultiplier(next!)}`}
        </span>
      </button>
    );
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
              <Button
                type="button"
                variant="outline"
                disabled={!betting}
                onClick={() => setBet((b) => clampBet(Math.floor(b / 2)))}
                className="border-cyan-950 bg-transparent text-xs text-slate-500 hover:bg-cyan-500/10 hover:text-slate-200"
              >
                ½
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!betting}
                onClick={() => setBet((b) => clampBet(b * 2))}
                className="border-cyan-950 bg-transparent text-xs text-slate-500 hover:bg-cyan-500/10 hover:text-slate-200"
              >
                2×
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!betting}
                onClick={() => setBet(clampBet(maxBet))}
                className="border-cyan-950 bg-transparent text-xs text-slate-500 hover:bg-cyan-500/10 hover:text-slate-200"
              >
                Max
              </Button>
            </div>
          </div>

          {round && !betting && (
            <div className="space-y-1 border-t border-cyan-950/70 pt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-500">Multiplier</span>
                <span className="arc-mono tabular-nums text-cyan-300">{formatMultiplier(multiplierX100)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-500">Cash out</span>
                <span className="arc-mono tabular-nums text-amber-300">{cashoutValue.toLocaleString()}</span>
              </div>
            </div>
          )}

          {betting ? (
            <Button
              type="button"
              disabled={phase === 'starting' || !info}
              onClick={() => void startRound()}
              className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
            >
              {phase === 'starting' ? 'Dealing…' : 'Deal'}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!canCash || phase === 'cashing'}
              onClick={() => void doCashout()}
              className="arc-display h-12 w-full bg-amber-400 text-base font-bold uppercase tracking-widest text-[#1A1206] shadow-[0_0_24px_-6px_rgba(245,158,11,0.85)] hover:bg-amber-300 disabled:opacity-50"
            >
              {phase === 'cashing' ? 'Cashing…' : `Cash out ${cashoutValue.toLocaleString()}`}
            </Button>
          )}

          {error && (
            <div className="space-y-1.5 text-center">
              <p className="text-sm text-rose-400">{error}</p>
              {noChips && (
                <button
                  type="button"
                  onClick={() => setExchangeOpen(true)}
                  className="text-sm font-semibold text-cyan-300 underline-offset-2 hover:underline"
                >
                  Buy chips →
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => openVerify(round?.roundId ?? history[0]?.roundId ?? null)}
            className="w-full text-center text-xs text-slate-500 transition-colors hover:text-cyan-300"
          >
            Provably Fair{history.length > 0 || round ? ' · verify this round' : ''}
          </button>
        </Card>

        {/* ───────── Stage ───────── */}
        <div className="order-1 space-y-4 lg:order-2">
          <Card className="relative flex flex-col items-center gap-5 border-0 bg-[#07131F] p-5 ring-1 ring-inset ring-cyan-950/70 sm:p-7">
            <div className="flex flex-col items-center gap-2">
              <HiLoCard
                key={`${round?.roundId ?? 'idle'}-${cards.length}`}
                card={topCard}
                size="lg"
                flip={topCard != null}
                busted={phase === 'busted'}
              />
              {topCard == null && (
                <span className="arc-display text-sm uppercase tracking-[0.3em] text-slate-600">
                  Place a bet · deal to play
                </span>
              )}
            </div>

            {/* Pick buttons */}
            <div className="flex w-full max-w-md gap-3">
              <PickButton direction="hi" />
              <PickButton direction="lo" />
            </div>

            {phase === 'active' && (
              <p className="arc-mono text-xs text-slate-500">
                {picksRemaining} pick{picksRemaining === 1 ? '' : 's'} left · ties pay as higher
              </p>
            )}

            {/* Result banner */}
            {result && (
              <div className="arc-banner-in text-center" aria-live="polite">
                {result.kind === 'cashed' ? (
                  <>
                    <div className="arc-display text-2xl font-bold uppercase tracking-[0.1em] text-amber-300 drop-shadow-[0_0_20px_rgba(245,158,11,0.55)] sm:text-3xl">
                      Cashed out {formatMultiplier(result.multiplierX100)}
                    </div>
                    <div className="arc-mono mt-1 text-sm tabular-nums text-amber-300">
                      +{(result.payout - (round?.bet ?? 0)).toLocaleString()} chips
                    </div>
                  </>
                ) : (
                  <div className="arc-display text-2xl font-bold uppercase tracking-[0.1em] text-rose-400 drop-shadow-[0_0_20px_rgba(244,63,94,0.5)] sm:text-3xl">
                    Bust · −{(round?.bet ?? 0).toLocaleString()} chips
                  </div>
                )}
                <Button
                  type="button"
                  onClick={playAgain}
                  className="arc-display mt-3 bg-cyan-500/15 text-sm font-bold uppercase tracking-widest text-cyan-300 ring-1 ring-cyan-500/40 hover:bg-cyan-500/25"
                >
                  Play again
                </Button>
              </div>
            )}

            {/* Pick trail */}
            {cards.length > 0 && (
              <div className="w-full">
                <HiLoLadder cards={cards} picks={picks} multWalkX100={multWalk} busted={phase === 'busted'} />
              </div>
            )}
          </Card>

          {/* Mobile-only deal / cash-out button — visible below the stage card so
              players on small screens don't need to scroll to the control rail. */}
          <div className="lg:hidden">
            {betting ? (
              <Button
                type="button"
                disabled={phase === 'starting' || !info}
                onClick={() => void startRound()}
                className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
              >
                {phase === 'starting' ? 'Dealing…' : 'Deal'}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={!canCash || phase === 'cashing'}
                onClick={() => void doCashout()}
                className="arc-display h-12 w-full bg-amber-400 text-base font-bold uppercase tracking-widest text-[#1A1206] shadow-[0_0_24px_-6px_rgba(245,158,11,0.85)] hover:bg-amber-300 disabled:opacity-50"
              >
                {phase === 'cashing' ? 'Cashing…' : `Cash out ${cashoutValue.toLocaleString()}`}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ───────── Session chart + info tabs ───────── */}
      <div className="mt-4 space-y-4">
        <div className="lg:hidden">
          <SessionChart points={session} unitLabel="Rounds" />
        </div>
        <HiLoInfoTabs
          history={history}
          historyLoading={historyLoading}
          onVerify={(id) => openVerify(id)}
          info={info}
        />
      </div>
      <div className="hidden lg:block">
        <FloatingPanel title="Session" storageKey="hilo.sessionChart.pos">
          <SessionChart points={session} unitLabel="Rounds" bare />
        </FloatingPanel>
      </div>

      <HiLoFairnessModal
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
