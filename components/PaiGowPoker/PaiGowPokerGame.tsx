'use client';

/**
 * PaiGowPokerGame — the interactive client for chips Pai Gow Poker
 * (/pai-gow-poker). A faithful port of public/pai-gow-lab.html.
 *
 * Deep-Sea Neon: #050E16 abyss, cyan #22D3EE chrome, amber wins, rose losses.
 * Chakra Petch + JetBrains Mono via the arcade2 fonts.
 *
 * Server-authoritative session flow (like Three Card Poker): /deal debits the
 * bet, seals the 52-card deck behind a committed hash and returns only the
 * player's seven cards. The player taps exactly 2 cards into the LOW row (or
 * clicks House way) — a live foul check blocks Confirm until the 5-card high
 * hand outranks the 2-card low hand — then /decision reveals the dealer's
 * house-way split and settles (win both → 1:1 − 5%, win one → push, lose both →
 * bet lost; copies go to the dealer). On mount we resume any hand in play via
 * /active so a refresh mid-arrange never strands a bet.
 *
 * Layout mirrors the lab: a control rail (balance, bet + ½/2×/chips, payouts &
 * table rules) beside the felt board (HUD strip, dealer seat with low/high rows,
 * felt message, player seat with low/high rows + foul hint, settle banner) with
 * the phase-driven action buttons below.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAccount } from 'wagmi';
import confetti from 'canvas-confetti';
import { Volume2, VolumeX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePokerChipBalance } from '@/hooks/use-poker-chip-balance';
import { formatChips } from '@/lib/format-poker-chips';
import { GameWalletModal } from '@/components/shared/GameWalletModal';
import { probeSiweSession } from '@/lib/api-auth';
import { useBigWin } from '@/contexts/big-win-context';
import { SessionChart, type SessionPoint } from '@/components/arcade2/SessionChart';
import { FloatingPanel } from '@/components/arcade2/FloatingPanel';
import { PlayingCard } from './PlayingCard';
import { useStagedReveal } from '@/hooks/use-staged-reveal';
import { PaiGowInfoTabs } from './PaiGowInfoTabs';
import { PaiGowFairnessModal } from './PaiGowFairnessModal';
import { paiGowAudio } from './pai-gow-audio';
import {
  fetchPaiGowInfo,
  fetchPaiGowActive,
  dealPaiGow,
  decidePaiGow,
  fetchPaiGowHistory,
  checkSplit,
  houseWay,
  highHandName,
  lowName,
  cardRank,
  type PaiGowInfo,
  type PaiGowActiveHand,
  type PaiGowDecisionResult,
  type PaiGowHistoryRound,
} from '@/lib/pai-gow-poker-client';

const HISTORY_LIMIT = 25;
const CHIP_STEPS = [100, 500, 1000] as const;
/** How long the freshly dealt seven animate in before the arrange step opens. */
const DEAL_MS = 640;
/*
 * The dealer's seven come out one at a time. Faster than a two-card showdown
 * beat — seven cards at a hold'em pace would take two and a half seconds and
 * stop being a deal — but slow enough that you watch a hand being set rather
 * than a row appearing.
 */
const DEALER_REVEAL_GAP = 165;
/** Dealer reveal → settlement pacing (mirrors the lab's confirmHands → settle). */
const SETTLE_MS = 760;

type Phase = 'idle' | 'dealing' | 'arrange' | 'revealing' | 'settled';

function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/);
  return m ? m[1] : null;
}

/** Sort card indices by rank, high → low, for a tidy row display. */
function sortDesc(idxs: number[]): number[] {
  return idxs.slice().sort((a, b) => cardRank(b) - cardRank(a));
}

type RowRes = 'w' | 'l' | 'c' | '';

export function PaiGowPokerGame() {
  const { address } = useAccount();
  const { reportWin } = useBigWin();

  const [info, setInfo] = useState<PaiGowInfo | null>(null);
  const [bet, setBet] = useState<number>(500);

  const [roundId, setRoundId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [playerCards, setPlayerCards] = useState<number[]>([]);
  const [lowIdx, setLowIdx] = useState<number[]>([]);
  const [settlement, setSettlement] = useState<PaiGowDecisionResult | null>(null);
  // The committed bet of the hand in play (locked at deal time).
  const [handBet, setHandBet] = useState(0);

  const [session, setSession] = useState<SessionPoint[]>([]);
  const [history, setHistory] = useState<PaiGowHistoryRound[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // How many of the dealer's seven have actually come out. Before this the
  // whole hand — two low and five high — landed in a single frame under one
  // flip sound, so the dealer never appeared to set anything.
  const {
    shown: shownDealer,
    revealTo: revealDealer,
    snapTo: snapDealer,
  } = useStagedReveal(0);
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
  const maxBet = info?.maxBet ?? 10_000;

  useEffect(() => {
    fetchPaiGowInfo()
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
      .then((ok) => (ok ? fetchPaiGowHistory(HISTORY_LIMIT) : []))
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [address]);

  useEffect(() => {
    loadMyHistory();
  }, [loadMyHistory]);

  // Resume a dealt-but-unsettled hand after a refresh — back to the arrange step.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    probeSiweSession()
      .then((ok) => (ok ? fetchPaiGowActive() : null))
      .then((active: PaiGowActiveHand | null) => {
        if (cancelled || !active) return;
        setRoundId(active.roundId);
        setHandBet(active.bet);
        setBet(active.bet);
        setPlayerCards(active.playerCards);
        setLowIdx([]);
        setSettlement(null);
        setPhase('arrange');
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
    } else if (/already have a hand/i.test(msg)) {
      setError('You already have a hand in play — finish it first.');
    } else if (/401|No session|auth/i.test(msg)) {
      setError('Connect your wallet to play.');
    } else {
      setError(serverDetail(msg) ?? 'Something went wrong. Try again.');
    }
  }, []);

  const winFx = useCallback(() => {
    paiGowAudio.playWin();
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
    const stake = clampBet(bet);
    if (balance != null && BigInt(stake) > balance) {
      setError('Not enough MORBIUS for that wager.');
      setNoChips(true);
      return;
    }
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setError(null);
    setNoChips(false);
    setSettlement(null);
    setLowIdx([]);
    setPlayerCards([]);
    setPhase('dealing');
    paiGowAudio.init();
    paiGowAudio.playDeal();
    try {
      const r = await dealPaiGow({ bet: stake, clientSeed: clientSeed.trim() || undefined });
      setRoundId(r.roundId);
      setHandBet(r.bet);
      setBet(r.bet);
      setPlayerCards(r.playerCards);
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      paiGowAudio.playDeal();
      // Let the seven animate in, then open the arrange step.
      const t = setTimeout(() => setPhase('arrange'), DEAL_MS);
      timersRef.current.push(t);
    } catch (e) {
      setPhase('idle');
      handleErr(e);
    }
  }, [betting, info, bet, balance, clientSeed, clampBet, handleErr]);

  // ------------------------------------------------------------- arrange
  const toggleLow = useCallback(
    (cardIdx: number) => {
      if (phase !== 'arrange') return;
      setLowIdx((prev) => {
        const at = prev.indexOf(cardIdx);
        if (at >= 0) return prev.filter((c) => c !== cardIdx);
        if (prev.length >= 2) return prev;
        return [...prev, cardIdx];
      });
      paiGowAudio.playPick();
    },
    [phase],
  );

  const applyHouseWay = useCallback(() => {
    if (phase !== 'arrange' || playerCards.length !== 7) return;
    const hw = houseWay(playerCards);
    setLowIdx(hw.low);
    paiGowAudio.playFlip();
  }, [phase, playerCards]);

  // ------------------------------------------------------------- confirm
  const finalizeSettle = useCallback(
    (r: PaiGowDecisionResult) => {
      setPhase('settled');
      const net = r.net ?? r.totalPayout - r.bet;
      reportWin({ game: 'Pai Gow Poker', bet: r.bet, payout: r.totalPayout });
      if (net > 0) winFx();
      else if (net === 0) paiGowAudio.playPush();
      else paiGowAudio.playLose();

      setHistory((prev) =>
        [
          {
            roundId: r.roundId,
            bet: r.bet,
            playerCards: r.playerCards,
            dealerCards: r.dealerCards,
            playerLow: r.playerLow,
            playerHigh: r.playerHigh,
            dealerLow: r.dealerLow,
            dealerHigh: r.dealerHigh,
            result: r.result,
            totalPayout: r.totalPayout,
            net,
            won: r.won,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, HISTORY_LIMIT),
      );
      setSession((prev) => [...prev, { drop: prev.length + 1, bet: r.bet, profit: net }]);
    },
    [reportWin, winFx],
  );

  const confirm = useCallback(async () => {
    if (!roundId || phase !== 'arrange' || lowIdx.length !== 2) return;
    const chk = checkSplit(playerCards, lowIdx);
    if (!chk.ok) return;
    setPhase('revealing');
    setError(null);
    paiGowAudio.init();
    try {
      const r = await decidePaiGow(roundId, lowIdx);
      setSettlement(r);
      if (r.chipBalance) {
        try {
          setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
        } catch {
          /* keep last known */
        }
      }
      // Seven cards, one at a time, each with its own sound — the flip used to
      // be a single event covering all of them. The result waits for the last
      // one, so the banner no longer beats the hand it is describing.
      const dealerCount = r.dealerLow.length + r.dealerHigh.length;
      revealDealer(dealerCount, {
        gap: DEALER_REVEAL_GAP,
        onCard: () => paiGowAudio.playFlip(),
        settleDelay: SETTLE_MS,
        onSettled: () => finalizeSettle(r),
      });
    } catch (e) {
      setPhase('arrange');
      handleErr(e);
    }
  }, [roundId, phase, lowIdx, playerCards, finalizeSettle, handleErr, revealDealer]);

  const newHand = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    snapDealer(0);
    setRoundId(null);
    setPlayerCards([]);
    setLowIdx([]);
    setSettlement(null);
    setError(null);
    setPhase('idle');
  }, []);

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id);
    setFairnessOpen(true);
  }, []);

  const toggleMute = () => {
    paiGowAudio.init();
    paiGowAudio.setMute(!muted);
    setMuted(!muted);
  };

  // -------------------------------------------------------------- derived
  const revealed = phase === 'revealing' || phase === 'settled';
  // The rings wait for the whole hand to be out. Lit during the reveal they
  // would announce the winner while the dealer was still setting.
  const settled = phase === 'settled';
  // `revealed` turns on the moment Confirm is pressed, but the cards only
  // exist once the server answers. Mapping the empty arrays in between blanked
  // both dealer rows for the length of the request; the seats hold their
  // placeholders until there is something to put in them.
  const dealerOut = revealed && !!settlement;
  const dealerLow = revealed && settlement ? sortDesc(settlement.dealerLow) : [];
  const dealerHigh = revealed && settlement ? sortDesc(settlement.dealerHigh) : [];
  const shownPlayerLow = revealed && settlement ? sortDesc(settlement.playerLow) : sortDesc(lowIdx);
  const shownPlayerHigh =
    revealed && settlement
      ? sortDesc(settlement.playerHigh)
      : sortDesc(playerCards.filter((c) => !lowIdx.includes(c)));

  const split = phase === 'arrange' ? checkSplit(playerCards, lowIdx) : null;

  // HUD values
  const wagered = phase === 'idle' ? 0 : handBet;
  const highHandLabel = revealed && settlement ? highHandName(settlement.playerHigh) : null;
  const payoutHud = phase === 'settled' && settlement ? settlement.totalPayout : null;

  const net = settlement ? settlement.net ?? settlement.totalPayout - settlement.bet : 0;

  // Row results (only once settled)
  const rr = (win: boolean, copy: boolean): RowRes => (win ? 'w' : copy ? 'c' : 'l');
  const showRes = phase === 'settled' && settlement;
  const pHighRes: RowRes = showRes ? rr(settlement.winHigh, settlement.copyHigh) : '';
  const pLowRes: RowRes = showRes ? rr(settlement.winLow, settlement.copyLow) : '';
  const dHighRes: RowRes = showRes ? (settlement.winHigh ? 'l' : 'w') : '';
  const dLowRes: RowRes = showRes ? (settlement.winLow ? 'l' : 'w') : '';

  // Banner content
  let bannerKind: 'win' | 'loss' | 'push' | null = null;
  let bannerTitle = '';
  let bannerValue = '';
  if (phase === 'settled' && settlement) {
    if (settlement.result === 'win') {
      bannerKind = 'win';
      bannerTitle = 'Win both · 5% commission';
      bannerValue = `+${net.toLocaleString()} MORBIUS`;
    } else if (settlement.result === 'push') {
      bannerKind = 'push';
      bannerTitle = 'Split — one hand each';
      bannerValue = '±0 MORBIUS';
    } else {
      bannerKind = 'loss';
      bannerTitle =
        settlement.copyHigh || settlement.copyLow ? 'Dealer wins · copy → dealer' : 'Dealer wins both';
      bannerValue = `−${Math.abs(net).toLocaleString()} MORBIUS`;
    }
  }

  // Felt message
  let feltMsg: ReactNode;
  if (phase === 'idle') feltMsg = 'Post your bet and deal';
  else if (phase === 'dealing') feltMsg = 'Dealing…';
  else if (phase === 'arrange')
    feltMsg = (
      <>
        Split your seven cards — <span className="text-cyan-300">tap 2</span> for the low hand, or use{' '}
        <span className="text-cyan-300">House way</span>
      </>
    );
  else if (settlement)
    feltMsg = (
      <>
        Dealer sets by the house way — high:{' '}
        <span className="text-cyan-300">{highHandName(settlement.dealerHigh)}</span> · low:{' '}
        <span className="text-cyan-300">{lowName(settlement.dealerLow)}</span>
      </>
    );
  else feltMsg = '';

  return (
    <div className="mx-auto w-full max-w-6xl pb-28 lg:pb-0">
      <div className="grid gap-4 lg:grid-cols-[332px_1fr]">
        {/* ───────── Control rail ───────── */}
        <div className="order-2 space-y-3.5 lg:order-1 lg:sticky lg:top-20 lg:h-fit">
          {/* Balance + bet */}
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
                <span className="text-xs uppercase tracking-wide text-slate-500">Bet</span>
                <span className="text-[11px] text-slate-600">
                  {minBet.toLocaleString()}–{maxBet.toLocaleString()}
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={bet}
                  disabled={!betting}
                  min={minBet}
                  max={maxBet}
                  onChange={(e) => setBet(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  onBlur={() => setBet((b) => clampBet(b))}
                  className="arc-mono border-cyan-950 bg-[#081420] tabular-nums"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!betting}
                  onClick={() => setBet((b) => clampBet(Math.floor(b / 2)))}
                  className="border-cyan-950 bg-transparent px-3 hover:bg-cyan-500/10"
                >
                  ½
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!betting}
                  onClick={() => setBet((b) => clampBet(b * 2))}
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
                    onClick={() => setBet((b) => clampBet((b || 0) + step))}
                    className="arc-mono rounded-md border border-cyan-950 bg-[#0a1a26]/60 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"
                  >
                    +{step >= 1000 ? `${step / 1000}k` : step}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!betting}
                  onClick={() => setBet(clampBet(maxBet))}
                  className="arc-mono rounded-md border border-cyan-950 bg-[#0a1a26]/60 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"
                >
                  Max
                </button>
              </div>
            </div>
          </Card>

          {/* Payouts & table rules */}
          <Card className="space-y-2 border-0 bg-[#07131F] p-4 ring-1 ring-inset ring-cyan-950/70">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Payouts &amp; table rules</p>
            <div className="space-y-1">
              <div className="mt-1 text-[10.5px] uppercase tracking-[0.1em] text-slate-500">Result</div>
              {[
                ['Win both hands', '1:1 − 5%'],
                ['Win one / split', 'push'],
                ['Lose both hands', 'bet lost'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center text-xs text-slate-400">
                  <span>{k}</span>
                  <span className="arc-mono ml-auto text-slate-300">{v}</span>
                </div>
              ))}
              <div className="mt-2 text-[10.5px] uppercase tracking-[0.1em] text-slate-500">House rules</div>
              {[
                ['Copies (exact ties)', '→ dealer'],
                ['High hand must beat low', 'or foul'],
                ['Standard 52-card deck', 'no joker'],
                ['Dealer sets by', 'house way'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center text-xs text-slate-400">
                  <span>{k}</span>
                  <span className="arc-mono ml-auto text-slate-300">{v}</span>
                </div>
              ))}
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
          <Card className="overflow-hidden border-0 bg-[#07131F] p-0 ring-1 ring-inset ring-cyan-950/70">
            {/* HUD */}
            <div className="grid grid-cols-3 gap-px bg-cyan-500/10">
              <HudCell label="Wagered" value={wagered > 0 ? wagered.toLocaleString() : '—'} tone={wagered > 0 ? 'amber' : 'idle'} />
              <HudCell label="Your high hand" value={highHandLabel ?? '—'} tone={highHandLabel ? 'cyan' : 'idle'} />
              <HudCell
                label="Payout"
                value={payoutHud != null ? payoutHud.toLocaleString() : '—'}
                tone={payoutHud != null && payoutHud > 0 ? 'amber' : 'idle'}
              />
            </div>

            {/* Felt */}
            <div
              className="relative flex min-h-[clamp(360px,72vw,470px)] flex-col items-center justify-between gap-2 px-2.5 py-4"
              style={{
                background: 'radial-gradient(ellipse 78% 64% at 50% 45%,rgba(34,211,238,.06),transparent 70%)',
              }}
            >
              {/* Dealer seat */}
              <div className="w-full text-center">
                <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.16em] text-slate-500">Dealer</div>
                <SeatRow tag="Low" res={dLowRes}>
                  {dealerOut ? (
                    // The low pair comes out first, then the high five — a card
                    // the dealer has not reached yet stays an empty slot rather
                    // than appearing early.
                    dealerLow.map((c, i) =>
                      i < shownDealer ? (
                        <PlayingCard key={c} cardIdx={c} deal win={settled && dLowRes === 'w'} />
                      ) : (
                        <PlayingCard key={`low-slot-${i}`} slot />
                      ),
                    )
                  ) : (
                    <>
                      <PlayingCard slot />
                      <PlayingCard slot />
                    </>
                  )}
                </SeatRow>
                <SeatRow tag="High" res={dHighRes}>
                  {dealerOut
                    ? dealerHigh.map((c, i) =>
                        dealerLow.length + i < shownDealer ? (
                          <PlayingCard key={c} cardIdx={c} deal win={settled && dHighRes === 'w'} />
                        ) : (
                          <PlayingCard key={`high-down-${i}`} faceDown />
                        ),
                      )
                    : Array.from({ length: 7 }, (_, i) => <PlayingCard key={i} faceDown />)}
                </SeatRow>
              </div>

              {/* Felt message */}
              <div className="min-h-[16px] text-center text-[12.5px] text-slate-400">{feltMsg}</div>

              {/* Player seat */}
              <div className="w-full text-center">
                <SeatRow tag="Low" res={pLowRes}>
                  {phase === 'arrange' ? (
                    <>
                      {sortDesc(lowIdx).map((c) => (
                        <PlayingCard key={c} cardIdx={c} pick onClick={() => toggleLow(c)} />
                      ))}
                      {Array.from({ length: 2 - lowIdx.length }, (_, i) => (
                        <PlayingCard key={`slot-${i}`} slot />
                      ))}
                    </>
                  ) : revealed ? (
                    shownPlayerLow.map((c) => <PlayingCard key={c} cardIdx={c} win={settled && pLowRes === 'w'} />)
                  ) : (
                    <>
                      <PlayingCard slot />
                      <PlayingCard slot />
                    </>
                  )}
                </SeatRow>
                <SeatRow tag="High" res={pHighRes}>
                  {phase === 'arrange' ? (
                    shownPlayerHigh.map((c) => <PlayingCard key={c} cardIdx={c} pick onClick={() => toggleLow(c)} />)
                  ) : phase === 'dealing' ? (
                    playerCards.length === 7 ? (
                      playerCards.map((c) => <PlayingCard key={c} cardIdx={c} deal />)
                    ) : (
                      Array.from({ length: 7 }, (_, i) => <PlayingCard key={i} faceDown />)
                    )
                  ) : revealed ? (
                    shownPlayerHigh.map((c) => <PlayingCard key={c} cardIdx={c} win={settled && pHighRes === 'w'} />)
                  ) : (
                    Array.from({ length: 7 }, (_, i) => <PlayingCard key={i} faceDown />)
                  )}
                </SeatRow>
                <div className="mt-1.5 text-[10.5px] uppercase tracking-[0.16em] text-slate-500">Your hand</div>
                <div className={`min-h-[17px] pt-1 text-[12px] ${split?.fouled ? 'font-semibold text-rose-400' : 'text-slate-500'}`}>
                  {phase === 'arrange' ? split?.message : ''}
                </div>
              </div>

              {/* Settle banner overlay */}
              {bannerKind && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div
                    className={`pgw-banner-in rounded-2xl px-7 py-4 text-center ${
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

          {/* Actions: pinned bottom bar on mobile; in-flow under the board on desktop. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-950/70 bg-[#07131F]/95 p-3 backdrop-blur-sm lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            {betting ? (
              <Button
                type="button"
                disabled={!info}
                onClick={() => void deal()}
                className="arc-display h-14 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
              >
                {phase === 'settled' ? 'New hand' : 'Post bet & deal'}
              </Button>
            ) : phase === 'arrange' ? (
              <div className="grid grid-cols-2 gap-2.5">
                <Button
                  type="button"
                  onClick={applyHouseWay}
                  className="arc-display flex h-14 w-full flex-col items-center justify-center gap-0 bg-[#14222C]/90 text-base font-bold uppercase tracking-widest text-slate-300 ring-1 ring-inset ring-slate-400/30 hover:bg-[#1b2c38]"
                >
                  <span>House way</span>
                  <span className="arc-mono text-[11px] font-semibold normal-case tracking-normal opacity-85">
                    auto-arrange
                  </span>
                </Button>
                <Button
                  type="button"
                  disabled={!split?.ok}
                  onClick={() => void confirm()}
                  className="arc-display h-14 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
                >
                  Confirm hands
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

      {/* ───────── Info tabs ───────── */}
      <div className="mt-4 space-y-4">
        <PaiGowInfoTabs history={history} historyLoading={historyLoading} onVerify={(id) => openVerify(id)} />
      </div>

      {/* Draggable mini session chart. */}
      <FloatingPanel title="Session" storageKey="paiGowPoker.sessionChart.pos">
        <SessionChart
          gameName="Pai Gow Poker"
          points={session}
          unitLabel="Hands"
          bare
          allTimeLoader={async () => {
            const rounds = await fetchPaiGowHistory(365);
            return [...rounds].reverse().map((r, i) => ({
              drop: i + 1,
              bet: r.bet,
              profit: r.net ?? r.totalPayout - r.bet,
            }));
          }}
        />
      </FloatingPanel>

      <PaiGowFairnessModal
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
        onBalanceSync={async () => {
          await refetchBalance();
        }}
      />

      {/* Card sizing + deal/pick/banner animations (faithful to the lab's `.card`). */}
      <style jsx global>{`
        .pgw-card {
          width: clamp(34px, 8.8vw, 46px);
          aspect-ratio: 5 / 7;
        }
        .pgw-card-deal {
          animation: pgw-cardin 0.3s cubic-bezier(0.34, 1.4, 0.6, 1) both;
        }
        @keyframes pgw-cardin {
          0% {
            transform: translateY(-14px) scale(0.9);
            opacity: 0;
          }
          100% {
            transform: none;
            opacity: 1;
          }
        }
        .pgw-card-pick {
          transition: transform 0.12s, box-shadow 0.12s;
        }
        .pgw-card-pick:hover {
          transform: translateY(-4px);
          box-shadow: 0 0 0 1.5px rgba(34, 211, 238, 0.35), 0 6px 12px -5px rgba(0, 0, 0, 0.7);
        }
        .pgw-banner-in {
          animation: pgw-banner-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes pgw-banner-in {
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

function SeatRow({ tag, res, children }: { tag: string; res: RowRes; children: ReactNode }) {
  const resColor = res === 'w' ? 'text-amber-400' : res === 'l' ? 'text-rose-400' : 'text-slate-500';
  const resText = res === 'w' ? 'win' : res === 'l' ? 'loss' : res === 'c' ? 'copy' : '';
  return (
    <div className="my-1 flex items-center justify-center gap-2">
      <span className="w-14 flex-none text-right text-[9.5px] uppercase tracking-[0.14em] text-slate-500">
        {tag}
      </span>
      <div className="flex flex-wrap justify-center gap-[clamp(4px,1.4vw,8px)]">{children}</div>
      <span className={`w-14 flex-none text-left text-[10px] font-semibold uppercase tracking-[0.06em] ${resColor}`}>
        {resText}
      </span>
    </div>
  );
}

function HudCell({ label, value, tone }: { label: string; value: string; tone: 'amber' | 'cyan' | 'idle' }) {
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
