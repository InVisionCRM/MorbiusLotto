'use client';

/**
 * ThreeCardPokerGame — the interactive client for chips Three Card Poker
 * (/three-card-poker). A faithful port of public/three-card-poker-lab.html.
 *
 * Deep-Sea Neon: #050E16 abyss, cyan #22D3EE chrome, amber wins, rose losses.
 * Chakra Petch + JetBrains Mono via the arcade2 fonts.
 *
 * Two-step session flow (like Chicken): /deal debits the Ante (+ optional Pair
 * Plus), seals the deck behind a committed hash and returns only the player's
 * three cards → the player chooses Play (debits the Play bet, reveals the dealer
 * and settles) or Fold (forfeits the ante, settles). On mount we resume the
 * active hand via /active so a refresh between deal and decision never strands a
 * bet.
 *
 * Layout mirrors the lab: a control rail (balance, ante + ½/2×/chips, Pair Plus
 * toggle, paytable) beside the felt board (HUD strip, dealer seat, felt
 * message, player seat, settle banner) with the two-phase action buttons below.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import confetti from 'canvas-confetti';
import { Volume2, VolumeX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePokerChipBalance } from '@/hooks/use-poker-chip-balance';
import { formatChips } from '@/lib/format-poker-chips';
import { GameWalletModal } from '@/components/shared/GameWalletModal';
import { ArcadeFairnessStrip } from '@/components/shared/ArcadeFairnessStrip';
import { probeSiweSession } from '@/lib/api-auth';
import { useBigWin } from '@/contexts/big-win-context';
import { SessionChart, type SessionPoint } from '@/components/arcade2/SessionChart';
import { FloatingPanel } from '@/components/arcade2/FloatingPanel';
import { PlayingCard } from './PlayingCard';
import { ThreeCardInfoTabs } from './ThreeCardInfoTabs';
import { ThreeCardFairnessModal } from './ThreeCardFairnessModal';
import { ReplayConfirmOverlay } from '@/components/share/ReplayConfirmOverlay';
import { threeCardAudio } from './three-card-audio';
import {
  fetchThreeCardInfo,
  fetchThreeCardActive,
  dealThreeCard,
  decideThreeCard,
  fetchThreeCardHistory,
  evaluate3,
  handName3,
  dealerQualifies,
  resultLabel,
  type ThreeCardInfo,
  type ThreeCardActiveHand,
  type ThreeCardDecisionResult,
  type ThreeCardHistoryRound,
} from '@/lib/three-card-poker-client';

const HISTORY_LIMIT = 25;
const CHIP_STEPS = [100, 500, 1000] as const;
/** Replay reveal pacing — deal player hand, flip the dealer, then the banner. */
const REPLAY_REVEAL_MS = 520;
const REPLAY_SETTLE_MS = 620;

type Phase = 'idle' | 'dealing' | 'decision' | 'revealing' | 'settled';

function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/);
  return m ? m[1] : null;
}

export function ThreeCardPokerGame() {
  const { address } = useAccount();
  const { reportWin } = useBigWin();

  const [info, setInfo] = useState<ThreeCardInfo | null>(null);
  const [ante, setAnte] = useState<number>(500);
  const [pairPlus, setPairPlus] = useState(false);

  const [roundId, setRoundId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [playerCards, setPlayerCards] = useState<number[]>([]);
  const [dealerCards, setDealerCards] = useState<number[]>([]);
  const [dealerRevealed, setDealerRevealed] = useState(false);
  const [settlement, setSettlement] = useState<ThreeCardDecisionResult | null>(null);
  // The committed Ante / Pair Plus of the hand in play (locked at deal time).
  const [handAnte, setHandAnte] = useState(0);
  const [handPairPlus, setHandPairPlus] = useState(0);

  const [session, setSession] = useState<SessionPoint[]>([]);
  const [history, setHistory] = useState<ThreeCardHistoryRound[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Replay: a staged past round (confirm overlay) + a flag while its reveal
  // re-runs. Replays are a pure re-watch — no server call, balance, session,
  // history, reportWin, or confetti.
  const [pendingReplay, setPendingReplay] = useState<ThreeCardHistoryRound | null>(null);
  const [replaying, setReplaying] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const boardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

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

  const minBet = info?.minBet ?? 100;
  const maxBet = info?.maxBet ?? 50_000;

  useEffect(() => {
    fetchThreeCardInfo()
      .then((i) => {
        setInfo(i);
        setAnte((a) => Math.min(Math.max(a, i.minBet), i.maxBet));
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
      .then((ok) => (ok ? fetchThreeCardHistory(HISTORY_LIMIT) : []))
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [address]);

  useEffect(() => {
    loadMyHistory();
  }, [loadMyHistory]);

  // Resume a dealt-but-undecided hand after a refresh.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    probeSiweSession()
      .then((ok) => (ok ? fetchThreeCardActive() : null))
      .then((active: ThreeCardActiveHand | null) => {
        if (cancelled || !active) return;
        setRoundId(active.roundId);
        setHandAnte(active.ante);
        setHandPairPlus(active.pairPlus);
        setAnte(active.ante);
        setPairPlus(active.pairPlus > 0);
        setPlayerCards(active.playerCards);
        setDealerCards([]);
        setDealerRevealed(false);
        setSettlement(null);
        setPhase('decision');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address]);

  const betting = phase === 'idle' || phase === 'settled';

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
      setError('Not enough MORBIUS for that wager.');
      setNoChips(true);
    } else if (/401|No session|auth/i.test(msg)) {
      setError('Connect your wallet to play.');
    } else {
      setError(serverDetail(msg) ?? 'Something went wrong. Try again.');
    }
  }, []);

  const winFx = useCallback(() => {
    threeCardAudio.playWin();
    confetti({
      particleCount: 110,
      spread: 75,
      origin: { y: 0.5 },
      colors: ['#22D3EE', '#FCD34D', '#ffffff'],
    });
  }, []);

  // ---------------------------------------------------------------- deal
  const deal = useCallback(async () => {
    if (!betting || !info) return;
    const stake = clampBet(ante);
    const cost = stake + (pairPlus ? stake : 0);
    if (balance != null && BigInt(cost) > balance) {
      setError('Not enough MORBIUS for that wager.');
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
    setSettlement(null);
    setDealerCards([]);
    setDealerRevealed(false);
    setPhase('dealing');
    threeCardAudio.init();
    threeCardAudio.playDeal();
    try {
      const r = await dealThreeCard({
        ante: stake,
        pairPlus,
        clientSeed: clientSeed.trim() || undefined,
      });
      setRoundId(r.roundId);
      setHandAnte(r.ante);
      setHandPairPlus(r.pairPlus);
      setAnte(r.ante);
      setPlayerCards(r.playerCards);
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      setPhase('decision');
      threeCardAudio.playDeal();
    } catch (e) {
      setPhase('idle');
      handleErr(e);
    }
  }, [betting, info, ante, pairPlus, balance, clientSeed, clampBet, handleErr]);

  // ------------------------------------------------------------- decision
  const decide = useCallback(
    async (action: 'play' | 'fold') => {
      if (!roundId || phase !== 'decision') return;
      setPhase('revealing');
      setError(null);
      threeCardAudio.init();
      threeCardAudio.playFlip();
      try {
        const r = await decideThreeCard(roundId, action);
        setDealerCards(r.dealerCards);
        setDealerRevealed(true);
        setSettlement(r);
        if (r.chipBalance) {
          try {
            setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
          } catch {
            /* keep last known */
          }
        }
        setPhase('settled');

        const committed = r.ante + r.play + r.pairPlus;
        const net = r.totalPayout - committed;
        reportWin({ game: 'Three Card Poker', bet: committed, payout: r.totalPayout });
        if (net > 0) winFx();
        else if (net === 0) threeCardAudio.playPush();
        else threeCardAudio.playLose();

        setHistory((prev) =>
          [
            {
              roundId: r.roundId,
              ante: r.ante,
              pairPlus: r.pairPlus,
              play: r.play,
              playerCards: r.playerCards,
              dealerCards: r.dealerCards,
              result: r.result,
              antePayout: r.antePayout,
              pairPlusPayout: r.pairPlusPayout,
              totalPayout: r.totalPayout,
              won: r.won,
              createdAt: new Date().toISOString(),
            },
            ...prev,
          ].slice(0, HISTORY_LIMIT),
        );
        setSession((prev) => [...prev, { drop: prev.length + 1, bet: committed, profit: net }]);
      } catch (e) {
        setPhase('decision');
        handleErr(e);
      }
    },
    [roundId, phase, winFx, handleErr, reportWin],
  );

  const playAgain = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPendingReplay(null);
    setReplaying(false);
    setRoundId(null);
    setPlayerCards([]);
    setDealerCards([]);
    setDealerRevealed(false);
    setSettlement(null);
    setError(null);
    setPhase('idle');
  }, []);

  // Replay finish: drop the rebuilt settlement + banner and release the replay
  // flag. No reportWin / balance / history / session / confetti — pure re-watch.
  const finishReplay = useCallback((res: ThreeCardDecisionResult) => {
    setSettlement(res);
    setDealerRevealed(true);
    setPhase('settled');
    const committed = res.ante + res.play + res.pairPlus;
    const net = res.totalPayout - committed;
    if (net > 0) threeCardAudio.playWin();
    else if (net === 0) threeCardAudio.playPush();
    else threeCardAudio.playLose();
    setReplaying(false);
  }, []);

  // Pace the replay reveal: deal the player hand → flip the dealer → banner.
  const runReplayReveal = useCallback(
    (res: ThreeCardDecisionResult) => {
      setSettlement(null);
      setDealerCards([]);
      setDealerRevealed(false);
      setHandAnte(res.ante);
      setHandPairPlus(res.pairPlus);
      setPlayerCards(res.playerCards);
      setPhase('dealing');
      threeCardAudio.playDeal();
      const t1 = setTimeout(() => {
        setPhase('revealing');
        setDealerCards(res.dealerCards);
        setDealerRevealed(true);
        threeCardAudio.playFlip();
        const t2 = setTimeout(() => finishReplay(res), REPLAY_SETTLE_MS);
        timersRef.current.push(t2);
      }, REPLAY_REVEAL_MS);
      timersRef.current.push(t1);
    },
    [finishReplay],
  );

  // ── Replay a past round: stage the confirm overlay, then re-run the exact same
  // reveal (no server call, no balance/history/session change). ──
  const handleReplay = useCallback(
    (round: ThreeCardHistoryRound) => {
      if (replaying || (phase !== 'idle' && phase !== 'settled')) return;
      threeCardAudio.init();
      setPendingReplay(round);
      boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    [replaying, phase],
  );

  const startReplay = useCallback(() => {
    const round = pendingReplay;
    if (!round) return;
    setPendingReplay(null);
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setReplaying(true);
    threeCardAudio.init();
    // Rebuild the decision-result shape the reveal needs from the stored row.
    const played = round.result !== 'fold';
    const dq = dealerQualifies(evaluate3(round.dealerCards));
    let winSide: 'player' | 'dealer' | null = null;
    if (round.result === 'play_win' || round.result === 'dealer_no_qualify') winSide = 'player';
    else if (round.result === 'play_loss') winSide = 'dealer';
    const res: ThreeCardDecisionResult = {
      roundId: round.roundId,
      action: played ? 'play' : 'fold',
      played,
      ante: round.ante,
      pairPlus: round.pairPlus,
      play: round.play,
      playerCards: round.playerCards,
      dealerCards: round.dealerCards,
      dealerQualifies: dq,
      result: round.result,
      antePayout: round.antePayout,
      pairPlusPayout: round.pairPlusPayout,
      totalPayout: round.totalPayout,
      won: round.won,
      winSide,
      serverSeed: '',
    };
    runReplayReveal(res);
  }, [pendingReplay, runReplayReveal]);

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id);
    setFairnessOpen(true);
  }, []);

  const toggleMute = () => {
    threeCardAudio.init();
    threeCardAudio.setMute(!muted);
    setMuted(!muted);
  };

  // -------------------------------------------------------------- derived
  const playerEval = playerCards.length === 3 ? evaluate3(playerCards) : null;
  const dealerEval = dealerRevealed && dealerCards.length === 3 ? evaluate3(dealerCards) : null;
  const dealerQual = dealerEval ? dealerQualifies(dealerEval) : null;

  // HUD values
  const wagered =
    phase === 'idle'
      ? 0
      : handAnte +
        (handPairPlus > 0 ? handAnte : 0) +
        ((phase === 'settled' && settlement?.played) ? handAnte : 0);
  const payoutHud = phase === 'settled' && settlement ? settlement.totalPayout : null;

  const net = settlement ? settlement.totalPayout - (settlement.ante + settlement.play + settlement.pairPlus) : 0;

  // Banner content
  let bannerKind: 'win' | 'loss' | 'push' | null = null;
  let bannerTitle = '';
  let bannerValue = '';
  if (phase === 'settled' && settlement) {
    if (!settlement.played) {
      bannerKind = 'loss';
      bannerTitle = 'Folded';
      bannerValue = `−${(settlement.ante + settlement.pairPlus).toLocaleString()} MORBIUS`;
    } else if (net > 0) {
      const ppHit = settlement.pairPlusPayout > 0;
      bannerKind = 'win';
      bannerTitle = ppHit ? 'You win · Pair Plus hit' : winTitle(settlement.result);
      bannerValue = `+${net.toLocaleString()} MORBIUS`;
    } else if (net === 0) {
      bannerKind = 'push';
      bannerTitle = 'Push';
      bannerValue = '±0 MORBIUS';
    } else {
      bannerKind = 'loss';
      bannerTitle = 'Dealer wins';
      bannerValue = `−${Math.abs(net).toLocaleString()} MORBIUS`;
    }
  }

  // Felt message
  let feltMsg: string;
  if (phase === 'idle') feltMsg = 'Set your ante and deal';
  else if (phase === 'dealing') feltMsg = 'Dealing…';
  else if (phase === 'decision' && playerEval) feltMsg = `You have ${handName3(playerEval)} — play or fold?`;
  else if (phase === 'revealing') feltMsg = 'Revealing the dealer…';
  else if (phase === 'settled' && dealerEval)
    feltMsg = `Dealer: ${handName3(dealerEval)}${dealerQual ? '' : ' (no qualify)'}`;
  else feltMsg = '';

  return (
    <div className="mx-auto w-full max-w-6xl pb-28 lg:pb-0">
      <div className="grid gap-4 lg:grid-cols-[332px_1fr]">
        {/* ───────── Control rail ───────── */}
        <div className="order-2 space-y-3.5 lg:order-1 lg:sticky lg:top-20 lg:h-fit">
          {/* Balance + ante */}
          <Card className="space-y-3.5 border-0 bg-[#07131F] p-4 ring-1 ring-inset ring-cyan-950/70">
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
                  aria-label={muted ? 'Unmute sound' : 'Mute sound'}
                  className="rounded p-1 text-slate-500 transition-colors hover:text-cyan-300"
                  title={muted ? 'Unmute' : 'Mute'}
                >
                  {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-slate-500">Ante</span>
                <span className="text-[11px] text-slate-600">
                  {minBet.toLocaleString()}–{maxBet.toLocaleString()}
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={ante}
                  disabled={!betting}
                  min={minBet}
                  max={maxBet}
                  onChange={(e) => setAnte(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  onBlur={() => setAnte((a) => clampBet(a))}
                  className="arc-mono border-cyan-950 bg-[#081420] tabular-nums"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!betting}
                  onClick={() => setAnte((a) => clampBet(Math.floor(a / 2)))}
                  className="border-cyan-950 bg-transparent px-3 hover:bg-cyan-500/10"
                >
                  ½
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!betting}
                  onClick={() => setAnte((a) => clampBet(a * 2))}
                  className="border-cyan-950 bg-transparent px-3 hover:bg-cyan-500/10"
                >
                  2×
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {CHIP_STEPS.map((step) => (
                  <button
                    key={step}
                    type="button"
                    disabled={!betting}
                    onClick={() => setAnte((a) => clampBet((a || 0) + step))}
                    className="arc-mono rounded-md border border-cyan-950 bg-[#0a1a26]/60 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"
                  >
                    +{step >= 1000 ? `${step / 1000}k` : step}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!betting}
                  onClick={() => setAnte(clampBet(maxBet))}
                  className="arc-mono rounded-md border border-cyan-950 bg-[#0a1a26]/60 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"
                >
                  Max
                </button>
              </div>

              {/* Pair Plus toggle */}
              <button
                type="button"
                disabled={!betting}
                onClick={() => setPairPlus((p) => !p)}
                className="mt-2 flex w-full items-center justify-between rounded-xl border border-cyan-950 bg-[#0a1a26]/50 px-3 py-2.5 text-left transition-colors hover:border-cyan-500/40 disabled:opacity-50"
              >
                <span className="text-[12.5px] text-slate-300">
                  Pair Plus side bet <span className="text-slate-500">(= ante)</span>
                </span>
                <span
                  className={`relative h-[22px] w-[38px] flex-none rounded-full transition-colors ${
                    pairPlus ? 'bg-cyan-400' : 'bg-slate-500/25'
                  }`}
                >
                  <span
                    className={`absolute top-[2px] h-[18px] w-[18px] rounded-full transition-all ${
                      pairPlus ? 'left-[18px] bg-[#04141b]' : 'left-[2px] bg-slate-300'
                    }`}
                  />
                </span>
              </button>
            </div>
          </Card>

          {/* Paytables */}
          <Card className="space-y-2 border-0 bg-[#07131F] p-4 ring-1 ring-inset ring-cyan-950/70">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Paytables</p>
            <div className="space-y-1">
              <div className="mt-1 text-[10.5px] uppercase tracking-[0.1em] text-slate-500">
                Pair Plus (your hand)
              </div>
              {[
                ['Straight flush', '40:1'],
                ['Three of a kind', '30:1'],
                ['Straight', '6:1'],
                ['Flush', '3:1'],
                ['Pair', '1:1'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center text-xs text-slate-400">
                  <span>{k}</span>
                  <span className="arc-mono ml-auto text-slate-300">{v}</span>
                </div>
              ))}
              <div className="mt-2 text-[10.5px] uppercase tracking-[0.1em] text-slate-500">
                Ante bonus (any time)
              </div>
              {[
                ['Straight flush', '5:1'],
                ['Three of a kind', '4:1'],
                ['Straight', '1:1'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center text-xs text-slate-400">
                  <span>{k}</span>
                  <span className="arc-mono ml-auto text-slate-300">{v}</span>
                </div>
              ))}
              <div className="mt-2 text-[10.5px] uppercase tracking-[0.1em] text-slate-500">
                Dealer qualifies with Queen-high+
              </div>
            </div>
          </Card>

          {error && (
            <div className="space-y-1.5 text-center">
              <p className="text-sm text-rose-400">{error}</p>
              {noChips && (
                <button
                  type="button"
                  onClick={() => setExchangeOpen(true)}
                  className="text-sm font-semibold text-cyan-300 underline-offset-2 hover:underline"
                >
                  Deposit MORBIUS
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => openVerify(history[0]?.roundId ?? null)}
            className="w-full text-center text-xs text-slate-500 transition-colors hover:text-cyan-300"
          >
            Provably Fair{history.length > 0 ? ' · verify last hand' : ''}
          </button>
        </div>

        {/* ───────── Board ───────── */}
        <div className="order-1 space-y-3 lg:order-2">
          <div ref={boardRef} className="relative">
          <Card className="overflow-hidden border-0 bg-[#07131F] p-0 ring-1 ring-inset ring-cyan-950/70">
            {/* HUD */}
            <div className="grid grid-cols-3 gap-px bg-cyan-500/10">
              <HudCell label="Wagered" value={wagered > 0 ? wagered.toLocaleString() : '—'} tone={wagered > 0 ? 'amber' : 'idle'} />
              <HudCell
                label="Your hand"
                value={playerEval ? handName3(playerEval) : '—'}
                tone={playerEval ? 'cyan' : 'idle'}
              />
              <HudCell
                label="Payout"
                value={payoutHud != null ? payoutHud.toLocaleString() : '—'}
                tone={payoutHud != null && payoutHud > 0 ? 'amber' : 'idle'}
              />
            </div>

            {/* Felt */}
            <div
              className="relative flex min-h-[clamp(280px,56vw,360px)] flex-col items-center justify-between gap-2.5 px-4 py-5"
              style={{
                background:
                  'radial-gradient(ellipse 75% 60% at 50% 42%,rgba(34,211,238,.06),transparent 70%)',
              }}
            >
              {/* Dealer seat */}
              <div className="w-full text-center">
                <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.16em] text-slate-500">
                  Dealer
                  {phase === 'settled' && settlement?.played && dealerQual != null && (
                    <span className={dealerQual ? 'text-amber-400' : 'text-rose-400'}>
                      {' '}
                      · {dealerQual ? 'qualifies' : 'no qualify'}
                    </span>
                  )}
                </div>
                <div className="flex justify-center gap-2.5">
                  {playerCards.length === 3 &&
                    [0, 1, 2].map((i) => (
                      <PlayingCard
                        key={i}
                        cardIdx={dealerRevealed ? dealerCards[i] : undefined}
                        faceDown={!dealerRevealed}
                        win={dealerRevealed && settlement?.winSide === 'dealer'}
                      />
                    ))}
                </div>
              </div>

              {/* Felt message */}
              <div className="min-h-[18px] text-center text-[13px] text-slate-400">{feltMsg}</div>

              {/* Player seat */}
              <div className="w-full text-center">
                <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.16em] text-slate-500">
                  Your hand
                </div>
                <div className="flex justify-center gap-2.5">
                  {playerCards.map((c, i) => (
                    <PlayingCard key={i} cardIdx={c} win={settlement?.winSide === 'player'} />
                  ))}
                  {playerCards.length === 0 &&
                    [0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="tcp-card rounded-lg border border-dashed border-cyan-950/80"
                        aria-hidden
                      />
                    ))}
                </div>
              </div>

              {/* Settle banner overlay */}
              {bannerKind && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div
                    className={`tcp-banner-in rounded-2xl px-7 py-4 text-center ${
                      bannerKind === 'win'
                        ? 'border border-amber-500/50 shadow-[0_0_50px_-8px_rgba(245,158,11,0.55)]'
                        : bannerKind === 'loss'
                          ? 'border border-rose-400/40'
                          : 'border border-slate-400/35'
                    }`}
                    style={{
                      background:
                        bannerKind === 'win'
                          ? 'radial-gradient(ellipse at center,rgba(245,158,11,.22),rgba(4,12,19,.6))'
                          : bannerKind === 'loss'
                            ? 'radial-gradient(ellipse at center,rgba(251,113,133,.16),rgba(4,12,19,.65))'
                            : 'radial-gradient(ellipse at center,rgba(148,163,184,.16),rgba(4,12,19,.6))',
                    }}
                  >
                    <div
                      className={`text-[12px] uppercase tracking-[0.22em] ${
                        bannerKind === 'win'
                          ? 'text-amber-300'
                          : bannerKind === 'loss'
                            ? 'text-rose-400'
                            : 'text-slate-400'
                      }`}
                    >
                      {bannerTitle}
                    </div>
                    <div className="arc-mono mt-1 font-bold text-white" style={{ fontSize: 'clamp(24px,7vw,38px)' }}>
                      {bannerValue}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
          {pendingReplay && (
            <ReplayConfirmOverlay
              title="Replay hand"
              headline={resultLabel(pendingReplay.result)}
              sub={(() => {
                const net =
                  pendingReplay.totalPayout -
                  (pendingReplay.ante + pendingReplay.play + pendingReplay.pairPlus);
                return `${net > 0 ? `+${net.toLocaleString()}` : net.toLocaleString()} MORBIUS`;
              })()}
              onPlay={startReplay}
              onCancel={() => setPendingReplay(null)}
            />
          )}
          </div>

          {/* Actions: pinned to a fixed bottom bar on mobile (deal / play / fold always
              reachable without scrolling); back in-flow under the board on desktop. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-950/70 bg-[#07131F]/95 p-3 backdrop-blur-sm lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          {betting ? (
            <Button
              type="button"
              disabled={!info}
              onClick={() => void deal()}
              className="arc-display h-14 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
            >
              {phase === 'settled' ? 'New hand' : 'Place ante & deal'}
            </Button>
          ) : phase === 'decision' ? (
            <div className="grid grid-cols-2 gap-2.5">
              <Button
                type="button"
                onClick={() => void decide('fold')}
                className="arc-display h-14 w-full bg-[#14222C]/90 text-base font-bold uppercase tracking-widest text-slate-300 ring-1 ring-inset ring-slate-400/30 hover:bg-[#1b2c38]"
              >
                Fold
              </Button>
              <Button
                type="button"
                onClick={() => void decide('play')}
                className="arc-display flex h-14 w-full flex-col items-center justify-center gap-0 bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400"
              >
                <span>Play</span>
                <span className="arc-mono text-[11px] font-semibold normal-case tracking-normal opacity-85">
                  +{handAnte.toLocaleString()} MORBIUS
                </span>
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              disabled
              className="arc-display h-14 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] opacity-50"
            >
              {phase === 'revealing' ? 'Revealing…' : 'Dealing…'}
            </Button>
          )}
          </div>
        </div>
      </div>

      {/* Always-visible fairness bar — active seed pair + commitment. */}
      <ArcadeFairnessStrip onOpenPanel={() => setFairnessOpen(true)} />

      {/* ───────── Session chart + info tabs ───────── */}
      <div className="mt-4 space-y-4">
        <ThreeCardInfoTabs
          history={history}
          historyLoading={historyLoading}
          onVerify={(id) => openVerify(id)}
          onReplay={handleReplay}
        />
      </div>
      {/* Draggable mini session chart — open in a corner on mobile, full-size on desktop. */}
      <FloatingPanel title="Session" storageKey="threeCardPoker.sessionChart.pos">
        <SessionChart
          gameName="Three Card Poker"
          points={session}
          unitLabel="Hands"
          bare
          allTimeLoader={async () => {
            const rounds = await fetchThreeCardHistory(365);
            return [...rounds].reverse().map((r, i) => {
              const committed = r.ante + r.pairPlus + r.play;
              return { drop: i + 1, bet: committed, profit: r.totalPayout - committed };
            });
          }}
        />
      </FloatingPanel>

      <ThreeCardFairnessModal
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

      {/* Card sizing + deal/banner animations (faithful to the lab's `.card`). */}
      <style jsx global>{`
        .tcp-card {
          width: clamp(46px, 13vw, 60px);
          aspect-ratio: 5 / 7;
        }
        .tcp-card-deal {
          animation: tcp-cardin 0.32s cubic-bezier(0.34, 1.4, 0.6, 1) both;
        }
        @keyframes tcp-cardin {
          0% {
            transform: translateY(-16px) scale(0.9);
            opacity: 0;
          }
          100% {
            transform: none;
            opacity: 1;
          }
        }
        .tcp-banner-in {
          animation: tcp-banner-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes tcp-banner-in {
          0% {
            transform: scale(0.7);
            opacity: 0;
          }
          55% {
            transform: scale(1.06);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

function winTitle(result: ThreeCardDecisionResult['result']): string {
  if (result === 'dealer_no_qualify') return 'Dealer folds';
  if (result === 'play_win') return 'You win';
  return 'You win';
}

function HudCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'amber' | 'cyan' | 'idle';
}) {
  const color = tone === 'amber' ? 'text-amber-300' : tone === 'cyan' ? 'text-cyan-300' : 'text-slate-500';
  const face = tone === 'cyan' ? 'arc-display' : 'arc-mono';
  return (
    <div className="bg-[#040c13]/85 px-3 py-2.5 text-center">
      <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={`${face} mt-0.5 font-bold tabular-nums ${color}`} style={{ fontSize: 'clamp(13px,3.4vw,18px)' }}>
        {value}
      </div>
    </div>
  );
}
