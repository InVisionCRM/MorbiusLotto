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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { Volume2, VolumeX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePokerChipBalance } from '@/hooks/use-poker-chip-balance';
import { formatChips } from '@/lib/format-poker-chips';
import { GameWalletModal } from '@/components/shared/GameWalletModal';
import { probeSiweSession } from '@/lib/api-auth';
import { useBigWin } from '@/contexts/big-win-context';
import { SessionChart, type SessionPoint } from '@/components/arcade2/SessionChart';
import { FloatingPanel } from '@/components/arcade2/FloatingPanel';
import { VideoPokerCard } from './VideoPokerCard';
import { videoPokerAudio } from './video-poker-audio';
import { VideoPokerInfoTabs, type VideoPokerSessionHand } from './VideoPokerInfoTabs';
import { VideoPokerFairnessModal } from './VideoPokerFairnessModal';
import { ReplayConfirmOverlay } from '@/components/share/ReplayConfirmOverlay';
import {
  fetchVideoPokerPaytable,
  dealVideoPoker,
  drawVideoPoker,
  vpIsWild,
  type VideoPokerCategory,
  type VideoPokerPaytable,
  type VideoPokerVariant,
} from '@/lib/video-poker-client';

const HISTORY_LIMIT = 25;

type Phase = 'idle' | 'dealing' | 'held' | 'drawing' | 'result';

/*
 * Draw-flip timing, mirrored from the card so the round can wait for it.
 * VideoPokerCard staggers each position by CARD_FLIP_STAGGER_MS and the flip
 * itself runs CARD_FLIP_MS (`.vp-draw-flip-wrap` in globals.css). Keep these in
 * step with both, or the result will start announcing itself early again.
 */
const CARD_FLIP_STAGGER_MS = 75;
const CARD_FLIP_MS = 540;

/** When the last replaced card has finished turning, given which were held. */
function drawRevealMs(holds: boolean[]): number {
  const lastDrawn = holds.reduce((last, held, i) => (held ? last : i), -1);
  return lastDrawn < 0 ? 0 : lastDrawn * CARD_FLIP_STAGGER_MS + CARD_FLIP_MS;
}

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
  const { reportWin } = useBigWin();

  const [info, setInfo] = useState<VideoPokerPaytable | null>(null);
  const [variant, setVariant] = useState<VideoPokerVariant>('jacks_or_better');
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

  // Replay: a staged past hand (confirm overlay) + a flag while its reveal
  // re-runs. Replays are a pure re-watch — no server call, balance, session,
  // history, reportWin, or confetti.
  const [pendingReplay, setPendingReplay] = useState<VideoPokerSessionHand | null>(null);
  const [replaying, setReplaying] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const [clientSeed, setClientSeed] = useState('');
  const [fairnessOpen, setFairnessOpen] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noChips, setNoChips] = useState(false);
  const [muted, setMuted] = useState(false);
  // Incrementing keys force card remounts so deal/draw animations replay each hand.
  const [dealKey, setDealKey] = useState(0);
  const [drawKey, setDrawKey] = useState(0);

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

  // The paytable IS the game here, so it is re-fetched whenever the player
  // switches variant — every number on screen comes from the server, and the
  // server is what pays.
  useEffect(() => {
    let cancelled = false;
    fetchVideoPokerPaytable(variant)
      .then((i) => {
        if (cancelled) return;
        setInfo(i);
        setBet((b) => Math.min(Math.max(b, i.minBet), i.maxBet));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [variant]);

  useEffect(() => {
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
      setError('Not enough MORBIUS for that bet.');
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
      setError('Not enough MORBIUS for that bet.');
      setNoChips(true);
      return;
    }
    // A real deal exits any replay view (pending prompt, in-flight reveal).
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPendingReplay(null);
    setReplaying(false);
    setError(null);
    setNoChips(false);
    setResult(null);
    setFinalHand(null);
    setHolds([false, false, false, false, false]);
    setPhase('dealing');
    videoPokerAudio.init();
    try {
      const r = await dealVideoPoker({
        bet: stake,
        variant,
        clientSeed: clientSeed.trim() || undefined,
      });
      setHandId(r.handId);
      setDealtHand(r.dealtHand);
      setActiveBet(r.bet);
      setDealKey((k) => k + 1);
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
  }, [phase, info, bet, variant, balance, clientSeed, clampBet, handleErr]);

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
    // Staggered per-card flip sounds (one per non-held card).
    holds.forEach((held, i) => {
      if (!held) videoPokerAudio.playCardFlip(i * 80);
    });
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
      setDrawKey((k) => k + 1);
      setPhase('result');
      // Held back until the last replaced card has actually turned. reportWin
      // now drives the app-wide win word, and fired here it announced the hand
      // up to eight tenths of a second before the player could see it.
      const t = setTimeout(
        () => reportWin({ game: 'Video Poker', bet: activeBet, payout: r.payout }),
        drawRevealMs(holds),
      );
      // timersRef is already cleared on deal, on new hand and on unmount, so a
      // pending announcement can never land on the following hand.
      timersRef.current.push(t);
      setSession((prev) => [...prev, { drop: prev.length + 1, bet: activeBet, profit: r.payout - activeBet }]);
      setHands((prev) =>
        [
          { handId: r.handId, bet: activeBet, category: r.category, categoryName: r.categoryName, payout: r.payout, finalHand: r.finalHand },
          ...prev,
        ].slice(0, HISTORY_LIMIT),
      );
      if (r.payout > 0) {
        videoPokerAudio.playWin();
      } else {
        videoPokerAudio.playLose();
      }
    } catch (e) {
      setPhase('held');
      handleErr(e);
    }
  }, [phase, handId, holds, activeBet, handleErr, reportWin]);

  const newHand = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPendingReplay(null);
    setReplaying(false);
    setPhase('idle');
    setHandId(null);
    setDealtHand([]);
    setFinalHand(null);
    setHolds([false, false, false, false, false]);
    setResult(null);
    setError(null);
  }, []);

  // ── Replay a past hand: stage the confirm overlay, then re-show the exact same
  // final five-card hand + result (no server call, no balance/session/history
  // change). Only re-shows the payout hand — never an interactive hold step. ──
  const handleReplay = useCallback(
    (hand: VideoPokerSessionHand) => {
      if (phase === 'dealing' || phase === 'drawing' || replaying) return;
      videoPokerAudio.init();
      setPendingReplay(hand);
      boardWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    [phase, replaying],
  );

  const startReplay = useCallback(() => {
    const hand = pendingReplay;
    if (!hand) return;
    setPendingReplay(null);
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setReplaying(true);
    videoPokerAudio.init();
    // Reset the felt to a clean pre-reveal state, then flip the final hand in.
    setResult(null);
    setFinalHand(null);
    setDealtHand([]);
    setHolds([false, false, false, false, false]);
    setActiveBet(hand.bet);
    setPhase('dealing');
    const id = setTimeout(() => {
      setDealtHand(hand.finalHand);
      setFinalHand(hand.finalHand);
      setDrawKey((k) => k + 1);
      videoPokerAudio.playDraw();
      hand.finalHand.forEach((_, i) => videoPokerAudio.playCardFlip(i * 80));
      setResult({
        category: hand.category,
        categoryName: hand.categoryName,
        multiplier: hand.bet > 0 ? hand.payout / hand.bet : 0,
        payout: hand.payout,
        serverSeed: '',
      });
      setPhase('result');
      // Banner sound only — no confetti / balance / session on a replay.
      if (hand.payout > 0) videoPokerAudio.playWin();
      else videoPokerAudio.playLose();
      setReplaying(false);
    }, 220);
    timersRef.current.push(id);
  }, [pendingReplay]);

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

  const primaryLabel = replaying
    ? 'Replaying…'
    : phase === 'idle'
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
    <div className="mx-auto w-full max-w-7xl pb-28 lg:pb-0">
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* ───────── Control rail ───────── */}
        <Card className="order-2 h-fit space-y-4 border-0 bg-[#07131F] p-4 ring-1 ring-inset ring-cyan-950/70 lg:order-1 lg:sticky lg:top-20">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-500">Balance</span>
            <div className="flex items-center gap-2">
              <span className="arc-mono text-sm tabular-nums text-amber-300">
                {balance != null ? `${formatChips(balance)} MORBIUS` : '—'}
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

          {/* Which paytable you're playing. Locked mid-hand: the hand is
              settled on the variant it was dealt on, so switching would only
              lie about what's about to be paid. */}
          {info && info.variants?.length > 1 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-slate-500">Game</span>
                <span className="arc-mono text-[11px] text-slate-600">
                  {(info.rtpBp / 100).toFixed(2)}% return
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {info.variants.map((v) => {
                  const on = v.key === variant;
                  return (
                    <button
                      key={v.key}
                      type="button"
                      disabled={!betting}
                      onClick={() => setVariant(v.key)}
                      className={[
                        'rounded-lg px-2.5 py-1.5 text-left transition-colors disabled:opacity-40',
                        on
                          ? 'bg-cyan-500/15 ring-1 ring-cyan-500/50'
                          : 'ring-1 ring-cyan-950 hover:ring-cyan-500/30',
                      ].join(' ')}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[12.5px] font-semibold ${on ? 'text-cyan-300' : 'text-slate-300'}`}
                        >
                          {v.name}
                        </span>
                        {v.wild !== 'none' && (
                          <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-amber-300">
                            Wild
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                        {v.blurb}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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

          {/* Primary action (Deal / Draw / New hand): pinned to a fixed bottom bar on
              mobile (always reachable without scrolling); back in the rail, in-flow, on desktop. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-950/70 bg-[#07131F]/95 p-3 backdrop-blur-sm lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <Button
            type="button"
            disabled={(phase === 'idle' && !info) || phase === 'dealing' || phase === 'drawing'}
            onClick={onPrimary}
            className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
          >
            {primaryLabel}
          </Button>
          </div>

          {error && (
            <div className="space-y-1.5 text-center">
              <p className="text-sm text-rose-400">{error}</p>
              {noChips && (
                <button type="button" onClick={() => setExchangeOpen(true)} className="text-sm font-semibold text-cyan-300 underline-offset-2 hover:underline">
                  Deposit MORBIUS
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
        <div ref={boardWrapRef} className="order-1 space-y-4 lg:order-2">
          <Card className="relative flex flex-col items-center gap-5 border-0 bg-[#07131F] p-5 ring-1 ring-inset ring-cyan-950/70 sm:p-7">
            <div className="flex items-end justify-center gap-2 sm:gap-3">
              {Array.from({ length: 5 }).map((_, i) => {
                const isDrawCard = phase === 'result' && !holds[i];
                const cardKey = isDrawCard
                  ? `draw-${drawKey}-${i}`
                  : `deal-${dealKey}-${i}`;
                return (
                  <div key={i} className="flex flex-col items-center gap-1.5">
                    <VideoPokerCard
                      key={cardKey}
                      card={showPlaceholders ? null : showHand[i] ?? null}
                      held={(phase === 'held' || phase === 'result') && holds[i]}
                      win={win}
                      flipMode={
                        isDrawCard
                          ? 'draw'
                          : phase === 'held' && !showPlaceholders
                            ? 'deal'
                            : null
                      }
                      flipDelay={i * 75}
                      wild={
                        !showPlaceholders &&
                        showHand[i] != null &&
                        vpIsWild(showHand[i], info?.wild ?? 'none')
                      }
                      onToggle={() => toggleHold(i)}
                      disabled={phase !== 'held'}
                    />
                  </div>
                );
              })}
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
                      <span className="text-amber-300">+{(result.payout - activeBet).toLocaleString()} MORBIUS</span>
                    ) : result.payout === activeBet && result.payout > 0 ? (
                      <span className="text-slate-400">even money — stake returned</span>
                    ) : (
                      <span className="text-rose-400">−{activeBet.toLocaleString()} MORBIUS</span>
                    )}
                  </div>
                </div>
              ) : phase === 'idle' ? (
                <p className="arc-display text-sm uppercase tracking-[0.3em] text-slate-600">
                  Place a bet · deal to play
                </p>
              ) : null}
            </div>

            {pendingReplay && (
              <ReplayConfirmOverlay
                title="Replay hand"
                headline={pendingReplay.categoryName}
                sub={`${
                  pendingReplay.payout - pendingReplay.bet > 0
                    ? `+${(pendingReplay.payout - pendingReplay.bet).toLocaleString()}`
                    : (pendingReplay.payout - pendingReplay.bet).toLocaleString()
                } MORBIUS`}
                onPlay={startReplay}
                onCancel={() => setPendingReplay(null)}
              />
            )}
          </Card>
        </div>
      </div>

      {/* ───────── Session chart + paytable / info ───────── */}
      <div className="mt-4 space-y-4">
        <VideoPokerInfoTabs
          info={info}
          hands={hands}
          onVerify={(id) => openVerify(id)}
          onReplay={handleReplay}
          currentCategory={phase === 'result' ? result?.category ?? null : null}
        />
      </div>
      {/* Draggable mini session chart — open in a corner on mobile, full-size on desktop.
          Session-only: the Video Poker backend keeps no per-hand history, so there is no
          all-time data source to wire an allTimeLoader to. */}
      <FloatingPanel title="Session" storageKey="videopoker.sessionChart.pos">
        <SessionChart gameName="Video Poker" points={session} unitLabel="Hands" bare />
      </FloatingPanel>

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

      <GameWalletModal
        isOpen={exchangeOpen}
        onClose={() => setExchangeOpen(false)}
        defaultTab="deposit"
        balanceLabel="MORBIUS"
        onBalanceSync={async () => { await refetchBalance(); }}
      />
    </div>
  );
}
