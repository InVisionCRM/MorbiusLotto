'use client';

/**
 * UltimateHoldemGame — the interactive client for Ultimate Texas Hold'em
 * (/ultimate-holdem).
 *
 * Deep-Sea Neon: #050E16 abyss, cyan #22D3EE chrome, amber wins, rose losses.
 *
 * The shape of the game is one escalating decision. The player posts an Ante
 * and an equal Blind, then picks the moment to bet Play — 4× or 3× before any
 * board, 2× after the flop, 1× at the river — and every check they take to see
 * more cards shrinks what they're allowed to bet. The felt makes that cost
 * visible: the action bar always shows what the bet would cost right now and
 * what checking would drop it to.
 *
 * Server flow: /deal debits Ante + Blind (+ optional Trips) and seals the whole
 * deck behind a committed hash; each /action either advances a street (and the
 * server sends the newly earned board cards) or commits Play / folds and
 * settles. On mount we resume any live hand via /active so a refresh mid-street
 * never strands the posted bets.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
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
import { TableCard, TableCardStyles } from '@/components/shared/TableCard';
import {
  TableWinFxStyles,
  TableWinGlow,
  celebrateWin,
  winTierFor,
} from '@/components/shared/TableWinFx';
import {
  REVEAL_DEAL_GAP,
  REVEAL_FLIP_GAP,
  REVEAL_SHOWDOWN_PAUSE,
  useStagedReveal,
} from '@/hooks/use-staged-reveal';
import { TableFairnessModal, type DeckSlice } from '@/components/shared/TableFairnessModal';
import { TableHandHistory, type TableHistoryRow } from '@/components/shared/TableHandHistory';
import { TableFeltControls, useTableFelt } from '@/components/shared/TableFeltControls';
import { tableAudio } from '@/lib/table-audio';
import { ArcadeFAQ } from '@/components/arcade2/ArcadeFAQ';
import { ultimateHoldemFaqs } from './ultimateHoldemFaqs';
import { categoryName, oddsLabel } from '@/lib/playing-cards';
import {
  actUth,
  dealUth,
  fetchUthActive,
  fetchUthHistory,
  fetchUthInfo,
  isUthSettled,
  uthActionCost,
  uthActionLabel,
  uthResultLabel,
  verifyUth,
  type UthAction,
  type UthHistoryRound,
  type UthInfo,
  type UthSettleResult,
  type UthStage,
} from '@/lib/ultimate-holdem-client';

const HISTORY_LIMIT = 25;
const CHIP_STEPS = [100, 500, 1000] as const;

type Phase = 'idle' | 'dealing' | 'acting' | 'working' | 'settled';

function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/);
  return m ? m[1] : null;
}

/** How the player is invited to think about each street. */
const STAGE_COPY: Record<UthStage, string> = {
  preflop: 'Two cards, no board. Bet big now or check to see the flop for free.',
  flop: 'Three board cards. The most you can bet is now 2× your ante.',
  river: 'All five are out. Last chance: bet 1× your ante, or fold.',
  settled: '',
};

export function UltimateHoldemGame() {
  const { address } = useAccount();
  const { reportWin } = useBigWin();
  const felt = useTableFelt();

  const [info, setInfo] = useState<UthInfo | null>(null);
  const [ante, setAnte] = useState<number>(500);
  const [trips, setTrips] = useState(false);

  const [roundId, setRoundId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [stage, setStage] = useState<UthStage>('preflop');
  const [legalActions, setLegalActions] = useState<UthAction[]>([]);
  const [holeCards, setHoleCards] = useState<number[]>([]);
  const [board, setBoard] = useState<number[]>([]);
  const [dealerCards, setDealerCards] = useState<number[]>([]);
  // Two reveal tracks, same as the multiplayer felt: the board fills a card
  // at a time as each street comes out, and the dealer's two turn at the
  // showdown after a beat. Before this the cards all appeared in one frame
  // with the deal sounds staggered over the top, which is what made a street
  // land as a jump cut with a rattle behind it.
  const {
    shown: shownBoard,
    revealTo: revealBoard,
    snapTo: snapBoard,
  } = useStagedReveal(0);
  const {
    shown: shownDealer,
    revealTo: revealDealer,
    snapTo: snapDealer,
  } = useStagedReveal(0);
  const [settlement, setSettlement] = useState<UthSettleResult | null>(null);

  // The committed stakes of the hand in play (locked at deal time).
  const [handAnte, setHandAnte] = useState(0);
  const [handBlind, setHandBlind] = useState(0);
  const [handTrips, setHandTrips] = useState(0);
  const [handPlay, setHandPlay] = useState(0);

  const [session, setSession] = useState<SessionPoint[]>([]);
  const [history, setHistory] = useState<UthHistoryRound[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [clientSeed, setClientSeed] = useState('');
  const [fairnessOpen, setFairnessOpen] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noChips, setNoChips] = useState(false);

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
  const maxBet = info?.maxBet ?? 5000;

  useEffect(() => {
    fetchUthInfo()
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
      .then((ok) => (ok ? fetchUthHistory(HISTORY_LIMIT) : []))
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [address]);

  useEffect(() => {
    loadMyHistory();
  }, [loadMyHistory]);

  // Resume a live hand after a refresh — the Ante and Blind are already debited,
  // so abandoning it would simply cost the player their posted bets.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    probeSiweSession()
      .then((ok) => (ok ? fetchUthActive() : null))
      .then((active) => {
        if (cancelled || !active) return;
        setRoundId(active.roundId);
        setHandAnte(active.ante);
        setHandBlind(active.blind);
        setHandTrips(active.trips);
        setHandPlay(active.play);
        setAnte(active.ante);
        setTrips(active.trips > 0);
        setHoleCards(active.holeCards);
        setBoard(active.board);
        // Walking back into a live hand: this board was dealt before we got
        // here, so it is simply on the table rather than dealt again.
        snapBoard(active.board.length);
        setDealerCards([]);
        snapDealer(0);
        setSettlement(null);
        setStage(active.stage);
        setLegalActions(active.legalActions);
        setPhase('acting');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address, snapBoard, snapDealer]);

  const betting = phase === 'idle' || phase === 'settled';

  const clampBet = useCallback(
    (v: number) => {
      // The Blind matches the Ante, so a deal costs 2× the ante (plus Trips)
      // before the player has seen anything — cap against that, not the ante.
      const perHand = trips ? 3 : 2;
      const affordable = balance != null ? Math.floor(Number(balance) / perHand) : maxBet;
      const cap = Math.min(maxBet, Math.max(minBet, affordable));
      return Math.max(minBet, Math.min(cap, Math.floor(v) || minBet));
    },
    [balance, maxBet, minBet, trips],
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

  // ---------------------------------------------------------------- deal
  const deal = useCallback(async () => {
    if (!betting || !info) return;
    const stake = clampBet(ante);
    const cost = stake * 2 + (trips ? stake : 0); // ante + blind (+ trips)
    if (balance != null && BigInt(cost) > balance) {
      setError('Not enough MORBIUS to post the ante and blind.');
      setNoChips(true);
      return;
    }
    setError(null);
    setNoChips(false);
    setSettlement(null);
    // First real gesture of the hand — safe place to open the audio context.
    tableAudio.init();
    tableAudio.playChip();
    setDealerCards([]);
    snapDealer(0);
    setBoard([]);
    snapBoard(0);
    setHandPlay(0);
    setPhase('dealing');
    try {
      const r = await dealUth({
        ante: stake,
        trips,
        clientSeed: clientSeed.trim() || undefined,
      });
      setRoundId(r.roundId);
      setHandAnte(r.ante);
      setHandBlind(r.blind);
      setHandTrips(r.trips);
      setAnte(r.ante);
      setHoleCards(r.holeCards);
      setBoard(r.board);
      snapBoard(r.board.length);
      setStage(r.stage);
      setLegalActions(r.legalActions);
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      setPhase('acting');
    } catch (e) {
      setPhase('idle');
      handleErr(e);
    }
  }, [betting, info, ante, trips, balance, clientSeed, clampBet, handleErr, snapBoard, snapDealer]);

  // -------------------------------------------------------------- actions
  const act = useCallback(
    async (action: UthAction) => {
      if (!roundId || phase !== 'acting') return;
      setPhase('working');
      setError(null);
      try {
        const r = await actUth(roundId, action);

        // A check: the street advances and the server hands over the newly
        // earned board cards. Nothing has been staked.
        if (!isUthSettled(r)) {
          setStage(r.stage);
          setBoard(r.board);
          setLegalActions(r.legalActions);
          setPhase('acting');
          // Betting Play commits chips; checking doesn't. Either way the new
          // board cards land one after another — really one at a time now, not
          // all at once with the sounds spread out behind them.
          if (action !== 'check') tableAudio.playCommit();
          revealBoard(r.board.length, {
            gap: REVEAL_DEAL_GAP,
            onCard: () => tableAudio.playDeal(),
          });
          return;
        }

        setStage('settled');
        setBoard(r.board);
        setDealerCards(r.dealerCards);
        setHandPlay(r.play);
        setSettlement(r);
        setLegalActions([]);
        if (r.chipBalance) {
          try {
            setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
          } catch {
            /* keep last known */
          }
        }
        const net = r.totalPayout - r.committed;
        reportWin({ game: "Ultimate Texas Hold'em", bet: r.committed, payout: r.totalPayout });

        // Any board still owed comes out first, then the dealer's two turn
        // after a beat — his hand is the answer to the round, so it gets to be
        // its own moment rather than arriving with everything else. The banner
        // and the celebration wait for the last card.
        revealBoard(r.board.length, {
          gap: REVEAL_DEAL_GAP,
          onCard: () => tableAudio.playDeal(),
        });
        // How much board this response is adding — the dealer waits for it to
        // finish landing before he turns, so the two never overlap.
        const boardOwed = Math.max(0, r.board.length - board.length);
        revealDealer(r.dealerCards.length, {
          gap: REVEAL_FLIP_GAP,
          startDelay: boardOwed * REVEAL_DEAL_GAP + REVEAL_SHOWDOWN_PAUSE,
          onCard: () => tableAudio.playFlip(),
          onSettled: () => {
            setPhase('settled');
            celebrateWin(winTierFor(r.committed, r.totalPayout), {
              bonus: (r.tripsPayout ?? 0) > 0,
            });
          },
        });

        setHistory((prev) =>
          [
            {
              roundId: r.roundId,
              ante: r.ante,
              blind: r.blind,
              trips: r.trips,
              play: r.play,
              playMultiple: r.playMultiple,
              folded: r.folded,
              holeCards: r.holeCards,
              dealerCards: r.dealerCards,
              board: r.board,
              result: r.result,
              playerCategory: r.playerCategory,
              dealerCategory: r.dealerCategory,
              dealerQualified: r.dealerQualified,
              antePayout: r.antePayout,
              blindPayout: r.blindPayout,
              playPayout: r.playPayout,
              tripsPayout: r.tripsPayout,
              totalPayout: r.totalPayout,
              committed: r.committed,
              won: r.won,
              createdAt: new Date().toISOString(),
            },
            ...prev,
          ].slice(0, HISTORY_LIMIT),
        );
        setSession((prev) => [
          ...prev,
          { drop: prev.length + 1, bet: r.committed, profit: net },
        ]);
      } catch (e) {
        setPhase('acting');
        handleErr(e);
      }
    },
    // `board` is read to work out how many cards this street newly turned over,
    // so it has to be a dependency — without it the count would be measured
    // against a stale board and the deal ticks would drift.
    [roundId, phase, board, revealBoard, revealDealer, handleErr, reportWin],
  );

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id);
    setFairnessOpen(true);
  }, []);

  // -------------------------------------------------------------- derived
  const committedSoFar =
    phase === 'idle' ? 0 : handAnte + handBlind + handTrips + handPlay;
  const net = settlement ? settlement.totalPayout - settlement.committed : 0;
  const revealed = phase === 'settled';
  // Only once the dealer has finished turning — the glow is part of the
  // result, not a preview of it.
  const winTier =
    revealed && settlement ? winTierFor(settlement.committed, settlement.totalPayout) : null;

  let bannerKind: 'win' | 'loss' | 'push' | null = null;
  let bannerTitle = '';
  let bannerValue = '';
  if (revealed && settlement) {
    if (net > 0) {
      bannerKind = 'win';
      bannerTitle = settlement.tripsPayout > 0 && settlement.folded ? 'Folded · Trips hit' : 'You win';
      bannerValue = `+${net.toLocaleString()} MORBIUS`;
    } else if (net === 0) {
      bannerKind = 'push';
      bannerTitle = 'Push';
      bannerValue = '±0 MORBIUS';
    } else {
      bannerKind = 'loss';
      bannerTitle = settlement.folded ? 'Folded' : 'Dealer wins';
      bannerValue = `−${Math.abs(net).toLocaleString()} MORBIUS`;
    }
  }

  let feltMsg: string;
  if (phase === 'idle') feltMsg = 'Post your ante and blind to deal';
  else if (phase === 'dealing') feltMsg = 'Dealing…';
  else if (phase === 'working') feltMsg = 'Working…';
  else if (revealed && settlement) {
    feltMsg = `Dealer: ${settlement.dealerCategoryName}${
      settlement.dealerQualified ? '' : ' (no qualify)'
    }`;
  } else feltMsg = STAGE_COPY[stage];

  const historyRows: TableHistoryRow[] = history.map((h) => ({
    roundId: h.roundId,
    when: h.createdAt,
    committed: h.committed,
    payout: h.totalPayout,
    label: h.folded ? 'Folded' : uthResultLabel(h.result),
    detail: h.playerCategory ? categoryName(h.playerCategory) : null,
  }));

  const blindPay = info?.blindPay ?? {};
  const tripsPay = info?.tripsPay ?? {};
  const payingOrder = info?.payingOrder ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl pb-28 lg:pb-0">
      <div className="grid gap-4 lg:grid-cols-[332px_1fr]">
        {/* ───────── Control rail ───────── */}
        <div className="order-2 space-y-3.5 lg:order-1 lg:sticky lg:top-20 lg:h-fit">
          <Card className="space-y-3.5 border-0 bg-[#07131F] p-4 ring-1 ring-inset ring-cyan-950/70">
            <div className="flex items-center justify-between gap-2">
              <TableFeltControls felt={felt} />
            </div>

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

              {/* The Blind is not optional and is not a "side bet" — say so
                  plainly so the real cost of a deal is never a surprise. */}
              <div className="flex items-center justify-between rounded-xl border border-cyan-950 bg-[#0a1a26]/50 px-3 py-2 text-[12.5px]">
                <span className="text-slate-400">
                  Blind <span className="text-slate-600">(always = ante)</span>
                </span>
                <span className="arc-mono tabular-nums text-slate-300">
                  {clampBet(ante).toLocaleString()}
                </span>
              </div>

              <button
                type="button"
                disabled={!betting}
                onClick={() => setTrips((t) => !t)}
                className="flex w-full items-center justify-between rounded-xl border border-cyan-950 bg-[#0a1a26]/50 px-3 py-2.5 text-left transition-colors hover:border-cyan-500/40 disabled:opacity-50"
              >
                <span className="text-[12.5px] text-slate-300">
                  Trips side bet <span className="text-slate-500">(= ante)</span>
                </span>
                <span
                  className={`relative h-[22px] w-[38px] flex-none rounded-full transition-colors ${
                    trips ? 'bg-cyan-400' : 'bg-slate-500/25'
                  }`}
                >
                  <span
                    className={`absolute top-[2px] h-[18px] w-[18px] rounded-full transition-all ${
                      trips ? 'left-[18px] bg-[#04141b]' : 'left-[2px] bg-slate-300'
                    }`}
                  />
                </span>
              </button>

              <div className="flex items-center justify-between px-1 pt-1 text-[11px]">
                <span className="uppercase tracking-wide text-slate-500">To deal</span>
                <span className="arc-mono tabular-nums text-amber-300">
                  {(clampBet(ante) * (trips ? 3 : 2)).toLocaleString()} MORBIUS
                </span>
              </div>
            </div>
          </Card>

          {/* Paytables */}
          <Card className="space-y-2 border-0 bg-[#07131F] p-4 ring-1 ring-inset ring-cyan-950/70">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Paytables</p>
            <div className="space-y-1">
              <div className="mt-1 text-[10.5px] uppercase tracking-[0.1em] text-slate-500">
                Blind (only when you beat the dealer)
              </div>
              {payingOrder
                .filter((c) => (blindPay[c] ?? 0) > 0)
                .map((c) => (
                  <div key={c} className="flex items-center text-xs text-slate-400">
                    <span>{categoryName(c)}</span>
                    <span className="arc-mono ml-auto text-slate-300">
                      {oddsLabel(blindPay[c])}
                    </span>
                  </div>
                ))}
              <div className="pt-0.5 text-[10.5px] text-slate-600">
                Under a straight, the blind is simply returned.
              </div>

              <div className="mt-2 text-[10.5px] uppercase tracking-[0.1em] text-slate-500">
                Trips (your hand, win or lose)
              </div>
              {payingOrder
                .filter((c) => (tripsPay[c] ?? 0) > 0)
                .map((c) => (
                  <div key={c} className="flex items-center text-xs text-slate-400">
                    <span>{categoryName(c)}</span>
                    <span className="arc-mono ml-auto text-slate-300">
                      {oddsLabel(tripsPay[c])}
                    </span>
                  </div>
                ))}

              <div className="mt-2 text-[10.5px] uppercase tracking-[0.1em] text-slate-500">
                Dealer needs a pair to open — miss and your ante is returned, not paid
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
          <Card className="overflow-hidden border-0 bg-[#07131F] p-0 ring-1 ring-inset ring-cyan-950/70">
            <div className="grid grid-cols-3 gap-px bg-cyan-500/10">
              <HudCell
                label="At risk"
                value={committedSoFar > 0 ? committedSoFar.toLocaleString() : '—'}
                tone={committedSoFar > 0 ? 'amber' : 'idle'}
              />
              <HudCell
                label="Street"
                value={
                  revealed
                    ? 'Showdown'
                    : phase === 'idle'
                      ? '—'
                      : stage === 'preflop'
                        ? 'Pre-flop'
                        : stage === 'flop'
                          ? 'Flop'
                          : 'River'
                }
                tone={phase === 'idle' ? 'idle' : 'cyan'}
              />
              <HudCell
                label="Payout"
                value={settlement ? settlement.totalPayout.toLocaleString() : '—'}
                tone={settlement && settlement.totalPayout > 0 ? 'amber' : 'idle'}
              />
            </div>

            <div
              className="relative flex min-h-[clamp(320px,62vw,420px)] flex-col items-center justify-between gap-2.5 overflow-hidden px-4 py-5"
              style={{
                background:
                  'radial-gradient(ellipse 75% 60% at 50% 42%,rgba(34,211,238,.06),transparent 70%)',
              }}
            >
              {/* The felt's reaction to the result, behind everything on it. */}
              <TableWinGlow tier={winTier} round={roundId ?? undefined} />

              {/* Dealer seat */}
              <div className="w-full text-center">
                <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.16em] text-slate-500">
                  Dealer
                  {revealed && settlement && (
                    <span className={settlement.dealerQualified ? 'text-amber-400' : 'text-rose-400'}>
                      {' '}
                      · {settlement.dealerQualified ? 'opens' : 'no qualify'}
                    </span>
                  )}
                </div>
                <div className="flex justify-center gap-2.5">
                  {holeCards.length === 2 &&
                    [0, 1].map((i) => (
                      <TableCard
                        key={i}
                        // The face is handed over as soon as the server sends
                        // it and only `faceDown` is staged, so the card has
                        // something to turn to when its moment comes.
                        cardIdx={dealerCards[i]}
                        faceDown={i >= shownDealer}
                        back={felt.back}
                        win={revealed && settlement?.winSide === 'dealer'}
                      />
                    ))}
                  {holeCards.length === 0 && [0, 1].map((i) => <TableCard key={i} placeholder />)}
                </div>
              </div>

              {/* Community board — five seats, filled as the streets come out. */}
              <div className="w-full text-center">
                <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.16em] text-slate-500">
                  Board
                </div>
                <div className="flex justify-center gap-1.5 sm:gap-2.5">
                  {[0, 1, 2, 3, 4].map((i) =>
                    // Sent by the server but not yet reached by the dealer is
                    // still an empty seat, so a street lands a card at a time.
                    board[i] != null && i < shownBoard ? (
                      <TableCard
                        key={i}
                        cardIdx={board[i]}
                        deal
                        width="clamp(38px, 10.5vw, 54px)"
                      />
                    ) : (
                      <TableCard key={i} placeholder width="clamp(38px, 10.5vw, 54px)" />
                    ),
                  )}
                </div>
              </div>

              <div className="min-h-[18px] px-2 text-center text-[13px] text-slate-400">
                {feltMsg}
              </div>

              {/* Player seat */}
              <div className="w-full text-center">
                <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.16em] text-slate-500">
                  Your hand
                  {revealed && settlement && (
                    <span className="text-cyan-300"> · {settlement.playerCategoryName}</span>
                  )}
                </div>
                <div className="flex justify-center gap-2.5">
                  {holeCards.length > 0
                    ? holeCards.map((c, i) => (
                        <TableCard key={i} cardIdx={c} back={felt.back} win={settlement?.winSide === 'player'} />
                      ))
                    : [0, 1].map((i) => <TableCard key={i} placeholder />)}
                </div>
              </div>

              {bannerKind && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div
                    className={`tbl-banner-in rounded-2xl px-7 py-4 text-center ${
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
                    <div
                      className="arc-mono mt-1 font-bold text-white"
                      style={{ fontSize: 'clamp(24px,7vw,38px)' }}
                    >
                      {bannerValue}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Settled breakdown — which bucket actually paid. UTH settles four
              separate bets at once, so a bare net number hides the story. */}
          {revealed && settlement && (
            <Card className="grid grid-cols-2 gap-px overflow-hidden border-0 bg-cyan-500/10 p-0 ring-1 ring-inset ring-cyan-950/70 sm:grid-cols-4">
              <PayoutCell label="Ante" staked={settlement.ante} back={settlement.antePayout} />
              <PayoutCell label="Blind" staked={settlement.blind} back={settlement.blindPayout} />
              <PayoutCell label="Play" staked={settlement.play} back={settlement.playPayout} />
              <PayoutCell label="Trips" staked={settlement.trips} back={settlement.tripsPayout} />
            </Card>
          )}

          {/* Actions — pinned to a bottom bar on mobile so the decision is always
              reachable; in-flow under the board on desktop. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-950/70 bg-[#07131F]/95 p-3 backdrop-blur-sm lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            {betting ? (
              <Button
                type="button"
                disabled={!info}
                onClick={() => void deal()}
                className="arc-display flex h-14 w-full flex-col items-center justify-center gap-0 bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
              >
                <span>{phase === 'settled' ? 'New hand' : 'Post ante & blind'}</span>
                <span className="arc-mono text-[11px] font-semibold normal-case tracking-normal opacity-85">
                  {(clampBet(ante) * (trips ? 3 : 2)).toLocaleString()} MORBIUS
                </span>
              </Button>
            ) : phase === 'acting' ? (
              <div
                className={`grid gap-2.5 ${legalActions.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}
              >
                {legalActions.map((a) => {
                  const cost = uthActionCost(a, handAnte);
                  const primary = cost > 0;
                  return (
                    <Button
                      key={a}
                      type="button"
                      onClick={() => void act(a)}
                      className={
                        primary
                          ? 'arc-display flex h-14 w-full flex-col items-center justify-center gap-0 bg-cyan-500 text-sm font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400'
                          : 'arc-display flex h-14 w-full flex-col items-center justify-center gap-0 bg-[#14222C]/90 text-sm font-bold uppercase tracking-widest text-slate-300 ring-1 ring-inset ring-slate-400/30 hover:bg-[#1b2c38]'
                      }
                    >
                      <span>{uthActionLabel(a)}</span>
                      <span className="arc-mono text-[11px] font-semibold normal-case tracking-normal opacity-85">
                        {primary
                          ? `+${cost.toLocaleString()}`
                          : a === 'fold'
                            ? 'give up the ante & blind'
                            : 'free · smaller bet next'}
                      </span>
                    </Button>
                  );
                })}
              </div>
            ) : (
              <Button
                type="button"
                disabled
                className="arc-display h-14 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] opacity-50"
              >
                {phase === 'dealing' ? 'Dealing…' : 'Working…'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <TableHandHistory
          rows={historyRows}
          loading={historyLoading}
          onVerify={(id) => openVerify(id)}
          emptyCopy="No hands yet. Post an ante and blind to get started."
        />
      </div>

      <FloatingPanel title="Session" storageKey="ultimateHoldem.sessionChart.pos">
        <SessionChart
          gameName="Ultimate Texas Hold'em"
          points={session}
          unitLabel="Hands"
          bare
          allTimeLoader={async () => {
            const rounds = await fetchUthHistory(365);
            return [...rounds]
              .reverse()
              .map((r, i) => ({
                drop: i + 1,
                bet: r.committed,
                profit: r.totalPayout - r.committed,
              }));
          }}
        />
      </FloatingPanel>

      <TableFairnessModal
        open={fairnessOpen}
        onClose={() => {
          setFairnessOpen(false);
          setVerifyTarget(null);
        }}
        clientSeed={clientSeed}
        onClientSeedChange={setClientSeed}
        requestVerifyId={verifyTarget}
        verify={verifyUth}
        sealCopy="The whole deck — both hands and all five board cards — is sealed from a server seed committed (hashed) before your ante. It's revealed once the hand settles, so you can re-shuffle and confirm the board you never saw was fixed before you decided."
        slices={(rec) => {
          const r = rec as unknown as Awaited<ReturnType<typeof verifyUth>>;
          const out: DeckSlice[] = [
            { label: 'You', from: 0, to: 2, cards: r.holeCards, note: categoryName(r.playerCategory) },
            {
              label: 'Dealer',
              from: 2,
              to: 4,
              cards: r.dealerCards,
              note: `${categoryName(r.dealerCategory)}${r.dealerQualified ? '' : ' · no qual'}`,
              noteTone: r.dealerQualified ? 'cyan' : 'rose',
            },
            { label: 'Board', from: 4, to: 9, cards: r.board, noteTone: 'slate' },
          ];
          return out;
        }}
        resultLabel={(rec) => {
          const r = rec as unknown as Awaited<ReturnType<typeof verifyUth>>;
          return r.folded ? 'Folded' : uthResultLabel(r.result);
        }}
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

      {/* Everything a player would otherwise only learn by losing. */}
      <section className="mt-6">
        <ArcadeFAQ items={ultimateHoldemFaqs} accent="#A78BFA" />
      </section>

      <TableCardStyles />
      <TableWinFxStyles />
    </div>
  );
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
  const color =
    tone === 'amber' ? 'text-amber-300' : tone === 'cyan' ? 'text-cyan-300' : 'text-slate-500';
  const face = tone === 'cyan' ? 'arc-display' : 'arc-mono';
  return (
    <div className="bg-[#040c13]/85 px-3 py-2.5 text-center">
      <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div
        className={`${face} mt-0.5 font-bold tabular-nums ${color}`}
        style={{ fontSize: 'clamp(13px,3.4vw,18px)' }}
      >
        {value}
      </div>
    </div>
  );
}

/** One settled bet: what went in, what came back, and the difference. */
function PayoutCell({ label, staked, back }: { label: string; staked: number; back: number }) {
  const delta = back - staked;
  const tone =
    staked === 0
      ? 'text-slate-600'
      : delta > 0
        ? 'text-amber-300'
        : delta < 0
          ? 'text-rose-400'
          : 'text-slate-400';
  return (
    <div className="bg-[#040c13]/85 px-3 py-2 text-center">
      <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={`arc-mono mt-0.5 text-sm font-bold tabular-nums ${tone}`}>
        {staked === 0
          ? 'off'
          : delta > 0
            ? `+${delta.toLocaleString()}`
            : delta < 0
              ? `−${Math.abs(delta).toLocaleString()}`
              : 'push'}
      </div>
    </div>
  );
}
