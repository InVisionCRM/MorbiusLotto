'use client';

/**
 * BlackjackVariantGame — one felt for Spanish 21, Double Exposure, Pontoon,
 * Free Bet Blackjack and Blackjack Switch.
 *
 * Deep-Sea Neon: #050E16 abyss, cyan #22D3EE chrome, amber wins, rose losses.
 *
 * Everything that differs between the four games arrives from the server in
 * `rules` and is rendered from there — the dealer's cards are hidden or shown
 * because the server said so, the buttons say Twist and Stick at a Pontoon
 * table, the paytable lists Spanish 21's bonuses only when they exist. There is
 * no second copy of the rules on the client that could drift out of step with
 * the one that actually pays.
 *
 * Server flow: /deal debits the bet and commits the whole deck; each /action
 * applies one decision and, when every hand is finished, plays the dealer and
 * settles in the same transaction. On mount we resume any live round via
 * /active so a refresh mid-hand never strands an already-debited bet.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePokerChipBalance } from '@/hooks/use-poker-chip-balance';
import { formatChips } from '@/lib/format-poker-chips';
import { GameWalletModal } from '@/components/shared/GameWalletModal';
import { probeSiweSession } from '@/lib/api-auth';
import { useBigWin } from '@/contexts/big-win-context';
import { TableFeltControls, useTableFelt } from '@/components/shared/TableFeltControls';
import { tableAudio } from '@/lib/table-audio';
import { ArcadeFAQ } from '@/components/arcade2/ArcadeFAQ';
import { blackjackVariantFaqs } from './blackjackVariantFaqs';
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
  REVEAL_FLIP_GAP,
  REVEAL_SHOWDOWN_PAUSE,
  useStagedReveal,
} from '@/hooks/use-staged-reveal';
import { TableHandHistory, type TableHistoryRow } from '@/components/shared/TableHandHistory';
import { BlackjackVariantFairnessModal } from './BlackjackVariantFairnessModal';
import {
  actBj,
  bjActionLabel,
  bjNaturalLabel,
  bjOutcomeLabel,
  bjSuperMatchLabel,
  dealBj,
  fetchBjActive,
  fetchBjHistory,
  fetchBjInfo,
  isBjSettled,
  type BjAction,
  type BjHandResult,
  type BjHandView,
  type BjHistoryRound,
  type BjInfo,
  type BjStage,
  type BjSuperMatch,
  type BjVariant,
  type BjVariantRules,
} from '@/lib/blackjack-variants-client';

const HISTORY_LIMIT = 25;
const CHIP_STEPS = [100, 500, 1000] as const;
const CARD_W = 'clamp(38px, 10vw, 52px)';

type Phase = 'idle' | 'dealing' | 'acting' | 'working' | 'settled';

function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/);
  return m ? m[1] : null;
}

export function BlackjackVariantGame({ variant }: { variant: BjVariant }) {
  const { address } = useAccount();
  const { reportWin } = useBigWin();
  const felt = useTableFelt();

  const [info, setInfo] = useState<BjInfo | null>(null);
  const rules: BjVariantRules | null = info?.rules ?? null;

  const [bet, setBet] = useState<number>(500);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [hands, setHands] = useState<BjHandView[]>([]);
  const [activeHand, setActiveHand] = useState<number | null>(null);
  const [legalActions, setLegalActions] = useState<BjAction[]>([]);
  const [freeDouble, setFreeDouble] = useState(false);
  const [freeSplit, setFreeSplit] = useState(false);
  const [dealerCards, setDealerCards] = useState<number[]>([]);
  const [dealerTotal, setDealerTotal] = useState<number | null>(null);
  // How many of the dealer's cards this viewer has actually seen turned. While
  // the hand is live that is simply however many the variant exposes; at the
  // showdown it walks up to the full hand one card at a time.
  const {
    shown: shownDealer,
    revealTo: revealDealer,
    snapTo: snapDealer,
  } = useStagedReveal(0);
  const [stage, setStage] = useState<BjStage>('play');
  // Blackjack Switch's Super Match side bet.
  const [superMatch, setSuperMatch] = useState(false);
  const [sideResult, setSideResult] = useState<BjSuperMatch | null>(null);
  const [sidePayout, setSidePayout] = useState(0);
  const [results, setResults] = useState<BjHandResult[] | null>(null);
  const [committed, setCommitted] = useState(0);
  const [totalPayout, setTotalPayout] = useState(0);

  const [session, setSession] = useState<SessionPoint[]>([]);
  const [history, setHistory] = useState<BjHistoryRound[]>([]);
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
  const maxBet = info?.maxBet ?? 10_000;

  useEffect(() => {
    let cancelled = false;
    fetchBjInfo(variant)
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

  const loadMyHistory = useCallback(() => {
    if (!address) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    probeSiweSession()
      .then((ok) => (ok ? fetchBjHistory(variant, HISTORY_LIMIT) : []))
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [address, variant]);

  useEffect(() => {
    loadMyHistory();
  }, [loadMyHistory]);

  // Resume a live round — the bet is already debited, so abandoning it would
  // simply cost the player their stake.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    probeSiweSession()
      .then((ok) => (ok ? fetchBjActive(variant) : null))
      .then((active) => {
        if (cancelled || !active) return;
        setRoundId(active.roundId);
        setBet(active.bet);
        setCommitted(active.committed);
        setHands(active.hands);
        setActiveHand(active.activeHand);
        setLegalActions(active.legalActions);
        setFreeDouble(active.freeDouble);
        setFreeSplit(active.freeSplit);
        setDealerCards(active.dealerCards);
        // Walking back into a live hand: these were turned before we got
        // here, so they are already up rather than dealt again.
        snapDealer(active.dealerCards.length);
        setDealerTotal(null);
        setResults(null);
        setStage(active.stage ?? 'play');
        setSuperMatch((active.sideBet ?? 0) > 0);
        setPhase('acting');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address, variant]);

  const betting = phase === 'idle' || phase === 'settled';

  const clampBet = useCallback(
    (v: number) => {
      const cap = balance != null ? Math.min(maxBet, Number(balance)) : maxBet;
      return Math.max(minBet, Math.min(Math.max(cap, minBet), Math.floor(v) || minBet));
    },
    [balance, maxBet, minBet],
  );

  const handleErr = useCallback((e: unknown) => {
    const msg = (e as Error)?.message ?? '';
    if (/Not enough chips|insufficient/i.test(msg)) {
      setError('Not enough MORBIUS for that.');
      setNoChips(true);
    } else if (/401|No session|auth/i.test(msg)) {
      setError('Connect your wallet to play.');
    } else {
      setError(serverDetail(msg) ?? 'Something went wrong. Try again.');
    }
  }, []);

  /** Fold a settled response into state and bank the round. */
  const bankSettled = useCallback(
    (r: {
      hands: BjHandView[];
      dealerCards: number[];
      results: BjHandResult[];
      dealerTotal: number;
      totalPayout: number;
      committed: number;
      chipBalance?: string;
      sideResult?: BjSuperMatch | null;
      sidePayout?: number;
    }) => {
      setHands(r.hands);
      setDealerCards(r.dealerCards);
      setResults(r.results);
      setDealerTotal(r.dealerTotal);
      setTotalPayout(r.totalPayout);
      setCommitted(r.committed);
      setActiveHand(null);
      setLegalActions([]);
      setStage('play');
      setSideResult(r.sideResult ?? null);
      setSidePayout(r.sidePayout ?? 0);
      if (r.chipBalance) {
        try {
          setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
        } catch {
          /* keep last known */
        }
      }
      const net = r.totalPayout - r.committed;
      reportWin({
        game: rules?.name ?? 'Blackjack variant',
        bet: r.committed,
        payout: r.totalPayout,
      });
      // The dealer's down card turns over at settlement in every variant that
      // has one, and then he draws to his standing total. Both happen one card
      // at a time — before this they arrived in a single frame, so a dealer who
      // drew out to 21 looked identical to one who was always going to.
      // Double Exposure has already shown both cards, so it simply has fewer
      // left to turn rather than a wrong first beat.
      revealDealer(r.dealerCards.length, {
        gap: REVEAL_FLIP_GAP,
        startDelay: REVEAL_SHOWDOWN_PAUSE,
        onCard: (i) => (i < 2 ? tableAudio.playFlip() : tableAudio.playDeal()),
        onSettled: () => {
          setPhase('settled');
          celebrateWin(winTierFor(r.committed, r.totalPayout), {
            bonus: (r.sidePayout ?? 0) > 0,
          });
        },
      });

      setSession((prev) => [...prev, { drop: prev.length + 1, bet: r.committed, profit: net }]);
      loadMyHistory();
    },
    [reportWin, rules, loadMyHistory, revealDealer],
  );

  // ---------------------------------------------------------------- deal
  const deal = useCallback(async () => {
    if (!betting || !info) return;
    const stake = clampBet(bet);
    if (balance != null && BigInt(stake) > balance) {
      setError('Not enough MORBIUS for that bet.');
      setNoChips(true);
      return;
    }
    setError(null);
    setNoChips(false);
    // First real gesture of the hand — safe place to open the audio context.
    tableAudio.init();
    tableAudio.playChip();
    setResults(null);
    setDealerTotal(null);
    setDealerCards([]);
    snapDealer(0);
    setHands([]);
    setSideResult(null);
    setSidePayout(0);
    setPhase('dealing');
    try {
      const r = await dealBj({
        variant,
        bet: stake,
        // Only Switch offers it; the server ignores it elsewhere.
        superMatch: rules?.switchHands && superMatch ? true : undefined,
        clientSeed: clientSeed.trim() || undefined,
      });
      setRoundId(r.roundId);
      setBet(r.bet);
      if (isBjSettled(r)) {
        bankSettled(r);
        return;
      }
      setHands(r.hands);
      setActiveHand(r.activeHand);
      setLegalActions(r.legalActions);
      setFreeDouble(!!r.freeDouble);
      setFreeSplit(!!r.freeSplit);
      setDealerCards(r.dealerCards);
      snapDealer(r.dealerCards.length);
      setCommitted(r.committed);
      setStage(r.stage ?? 'play');
      if (r.chipBalance) {
        try {
          setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
        } catch {
          /* keep last known */
        }
      }
      setPhase('acting');
    } catch (e) {
      setPhase('idle');
      handleErr(e);
    }
  }, [betting, info, bet, balance, clientSeed, clampBet, handleErr, variant, bankSettled, rules, superMatch]);

  // -------------------------------------------------------------- actions
  const act = useCallback(
    async (action: BjAction) => {
      if (!roundId || phase !== 'acting') return;
      setPhase('working');
      setError(null);
      try {
        const r = await actBj(roundId, action);
        if (isBjSettled(r)) {
          bankSettled(r);
          return;
        }
        // Doubling and splitting put more money up; hitting and switching just
        // move cards. Standing does neither, so it stays silent.
        if (action === 'double' || action === 'split') tableAudio.playCommit();
        else if (action !== 'stand') tableAudio.playDeal();
        setHands(r.hands);
        setActiveHand(r.activeHand);
        setLegalActions(r.legalActions);
        setFreeDouble(!!r.freeDouble);
        setFreeSplit(!!r.freeSplit);
        setDealerCards(r.dealerCards);
        snapDealer(r.dealerCards.length);
        setCommitted(r.committed);
        setStage(r.stage ?? 'play');
        if (r.chipBalance) {
          try {
            setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
          } catch {
            /* keep last known */
          }
        }
        setPhase('acting');
      } catch (e) {
        setPhase('acting');
        handleErr(e);
      }
    },
    [roundId, phase, handleErr, bankSettled],
  );

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id);
    setFairnessOpen(true);
  }, []);

  // -------------------------------------------------------------- derived
  const settled = phase === 'settled';
  const net = settled ? totalPayout - committed : 0;
  // Only once the dealer has finished turning — the glow is part of the
  // result, not a preview of it.
  const winTier = settled ? winTierFor(committed, totalPayout) : null;

  const dealerSeats = useMemo(() => {
    // Before the showdown the server sends only what this variant lets you
    // see, so anything missing is genuinely absent rather than merely hidden.
    //
    // Two kinds of card, because a dealer does two different things: the two
    // he started with are on the table the whole time and the hole card TURNS,
    // while anything he drew afterwards LANDS. Reusing one animation for both
    // made the draws look like they had been sitting there face down all along.
    const out: Array<{ card: number | null; mode: 'flip' | 'draw' }> = [];
    for (let i = 0; i < 2; i++) out.push({ card: dealerCards[i] ?? null, mode: 'flip' });
    for (let i = 2; i < dealerCards.length; i++) {
      out.push({ card: dealerCards[i], mode: 'draw' });
    }
    return out;
  }, [dealerCards]);

  let bannerKind: 'win' | 'loss' | 'push' | null = null;
  let bannerTitle = '';
  let bannerValue = '';
  if (settled) {
    const headline = results?.find((r) =>
      ['blackjack', 'five_card_trick', 'bonus_21'].includes(r.outcome),
    );
    if (net > 0) {
      bannerKind = 'win';
      bannerTitle = headline ? bjOutcomeLabel(headline.outcome, rules) : 'You win';
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

  let feltMsg: string;
  if (phase === 'idle') feltMsg = 'Set your bet and deal';
  else if (phase === 'dealing') feltMsg = 'Dealing…';
  else if (phase === 'working') feltMsg = 'Working…';
  else if (stage === 'switch') {
    feltMsg = 'Trade the second card of each hand, or keep them as dealt';
  } else if (settled && dealerTotal != null) {
    feltMsg = `Dealer ${dealerTotal}${dealerTotal > 21 ? ' — bust' : ''}`;
  } else if (rules?.dealerFullyHidden) {
    feltMsg = 'The dealer’s hand stays down until you’re finished';
  } else if (hands.length > 1) {
    feltMsg = `Hand ${(activeHand ?? 0) + 1} of ${hands.length}`;
  } else feltMsg = '';

  const historyRows: TableHistoryRow[] = history.map((h) => {
    const best = h.results?.find((r) =>
      ['blackjack', 'five_card_trick', 'bonus_21'].includes(r.outcome),
    );
    return {
      roundId: h.roundId,
      when: h.createdAt,
      committed: h.committed,
      payout: h.totalPayout,
      label: best
        ? bjOutcomeLabel(best.outcome, rules)
        : h.totalPayout > h.committed
          ? 'Win'
          : h.totalPayout === h.committed
            ? 'Push'
            : 'Loss',
      detail: h.dealerTotal != null ? `dealer ${h.dealerTotal}` : null,
    };
  });

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

              {/* Switch posts the bet on BOTH hands, so a deal costs twice what
                  was typed. Say it here rather than letting the balance say it. */}
              {rules?.switchHands && (
                <>
                  <button
                    type="button"
                    disabled={!betting}
                    onClick={() => setSuperMatch((v) => !v)}
                    className="flex w-full items-center justify-between rounded-xl border border-cyan-950 bg-[#0a1a26]/50 px-3 py-2.5 text-left transition-colors hover:border-cyan-500/40 disabled:opacity-50"
                  >
                    <span className="text-[12.5px] text-slate-300">
                      Super Match <span className="text-slate-500">(= bet)</span>
                    </span>
                    <span
                      className={`relative h-[22px] w-[38px] flex-none rounded-full transition-colors ${
                        superMatch ? 'bg-cyan-400' : 'bg-slate-500/25'
                      }`}
                    >
                      <span
                        className={`absolute top-[2px] h-[18px] w-[18px] rounded-full transition-all ${
                          superMatch ? 'left-[18px] bg-[#04141b]' : 'left-[2px] bg-slate-300'
                        }`}
                      />
                    </span>
                  </button>
                  <div className="flex items-center justify-between px-1 pt-1 text-[11px]">
                    <span className="uppercase tracking-wide text-slate-500">To deal</span>
                    <span className="arc-mono tabular-nums text-amber-300">
                      {(clampBet(bet) * (superMatch ? 3 : 2)).toLocaleString()} MORBIUS
                    </span>
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* The table's rules, straight from the server. */}
          {rules && (
            <Card className="space-y-2 border-0 bg-[#07131F] p-4 ring-1 ring-inset ring-cyan-950/70">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">This table</p>
              <ul className="space-y-1">
                {rules.highlights.map((h) => (
                  <li key={h} className="flex gap-2 text-xs leading-snug text-slate-400">
                    <span className="mt-[3px] block h-1 w-1 shrink-0 rounded-full bg-cyan-500/70" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>

              {rules.bonuses && (
                <>
                  <div className="mt-2 text-[10.5px] uppercase tracking-[0.1em] text-slate-500">
                    Bonuses (not on a doubled or split hand)
                  </div>
                  {[
                    ['5-card 21', rules.bonuses.fiveCard21],
                    ['6-card 21', rules.bonuses.sixCard21],
                    ['7+-card 21', rules.bonuses.sevenCard21],
                    ['6-7-8 / 7-7-7 mixed', rules.bonuses.sequenceMixed],
                    ['6-7-8 / 7-7-7 suited', rules.bonuses.sequenceSuited],
                    ['6-7-8 / 7-7-7 in spades', rules.bonuses.sequenceSpades],
                  ].map(([label, mult]) => (
                    <div key={String(label)} className="flex items-center text-xs text-slate-400">
                      <span>{label}</span>
                      <span className="arc-mono ml-auto text-slate-300">
                        {mult === 1.5 ? '3:2' : `${mult}:1`}
                      </span>
                    </div>
                  ))}
                </>
              )}

              {info?.superMatchPay && (
                <>
                  <div className="mt-2 text-[10.5px] uppercase tracking-[0.1em] text-slate-500">
                    Super Match (your four opening cards)
                  </div>
                  {(
                    [
                      ['Four of a kind', info.superMatchPay.four_of_a_kind],
                      ['Two pair', info.superMatchPay.two_pair],
                      ['Three of a kind', info.superMatchPay.three_of_a_kind],
                      ['Pair', info.superMatchPay.pair],
                    ] as Array<[string, number]>
                  ).map(([label, mult]) => (
                    <div key={label} className="flex items-center text-xs text-slate-400">
                      <span>{label}</span>
                      <span className="arc-mono ml-auto text-slate-300">{mult}:1</span>
                    </div>
                  ))}
                </>
              )}

              <div className="mt-2 space-y-0.5 text-[10.5px] leading-snug text-slate-500">
                <div>
                  {rules.deckSize}-card deck · natural pays {bjNaturalLabel(rules)} · dealer{' '}
                  {rules.hitsSoft17 ? 'hits' : 'stands on'} soft 17
                </div>
                {/* Say what the game is rather than quoting a published return
                    that assumes six or eight decks. */}
                <div>
                  Dealt from a single provably-fair deck, so the published
                  multi-deck house edge for this game doesn’t apply here.
                </div>
              </div>
            </Card>
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
            Provably Fair{history.length > 0 ? ' · verify last round' : ''}
          </button>
        </div>

        {/* ───────── Felt ───────── */}
        <div className="order-1 space-y-3 lg:order-2">
          <Card className="overflow-hidden border-0 bg-[#07131F] p-0 ring-1 ring-inset ring-cyan-950/70">
            <div className="grid grid-cols-3 gap-px bg-cyan-500/10">
              <HudCell
                label="At risk"
                value={committed > 0 && !settled ? committed.toLocaleString() : settled ? committed.toLocaleString() : '—'}
                tone={committed > 0 ? 'amber' : 'idle'}
              />
              <HudCell
                label="Dealer"
                value={
                  settled && dealerTotal != null
                    ? String(dealerTotal)
                    : rules?.dealerFullyHidden
                      ? 'hidden'
                      : dealerCards.length > 0
                        ? '—'
                        : '—'
                }
                tone={settled ? 'cyan' : 'idle'}
              />
              <HudCell
                label="Payout"
                value={settled ? totalPayout.toLocaleString() : '—'}
                tone={settled && totalPayout > 0 ? 'amber' : 'idle'}
              />
            </div>

            <div
              className="relative flex min-h-[clamp(320px,60vw,420px)] flex-col items-center justify-between gap-2.5 overflow-hidden px-4 py-5"
              style={{
                background:
                  'radial-gradient(ellipse 75% 60% at 50% 42%,rgba(34,211,238,.06),transparent 70%)',
              }}
            >
              {/* The felt's reaction to the result, behind everything on it. */}
              <TableWinGlow tier={winTier} round={roundId ?? undefined} />

              {/* Dealer */}
              <div className="w-full text-center">
                <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.16em] text-slate-500">
                  Dealer
                  {rules?.dealerExposed && !settled && (
                    <span className="text-cyan-300"> · both cards up</span>
                  )}
                  {rules?.dealerFullyHidden && !settled && (
                    <span className="text-slate-600"> · face down</span>
                  )}
                </div>
                <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2.5">
                  {dealerSeats.map((s, i) =>
                    // A card he hasn't drawn yet isn't on the table at all —
                    // rendering it face down would promise a card that, as far
                    // as the player can know, does not exist.
                    s.mode === 'draw' && i >= shownDealer ? null : (
                      <TableCard
                        key={i}
                        cardIdx={s.card ?? undefined}
                        faceDown={i >= shownDealer}
                        deal={s.mode === 'draw'}
                        width={CARD_W}
                        encoding="blackjack"
                        back={felt.back}
                      />
                    ),
                  )}
                </div>
              </div>

              <div className="min-h-[18px] px-2 text-center text-[13px] text-slate-400">
                {feltMsg}
              </div>

              {/* Player hands — more than one after a split. */}
              <div className="flex w-full flex-wrap items-start justify-center gap-4">
                {hands.length === 0 ? (
                  <div className="text-center">
                    <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.16em] text-slate-500">
                      Your hand
                    </div>
                    <div className="flex justify-center gap-2.5">
                      {[0, 1].map((i) => (
                        <TableCard key={i} placeholder width={CARD_W} />
                      ))}
                    </div>
                  </div>
                ) : (
                  hands.map((h, i) => {
                    const res = results?.[i];
                    const isActive = !settled && activeHand === i;
                    return (
                      <div
                        key={i}
                        className={`rounded-xl px-2.5 py-2 text-center transition-colors ${
                          isActive ? 'bg-cyan-500/10 ring-1 ring-cyan-500/40' : ''
                        }`}
                      >
                        <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.16em] text-slate-500">
                          {hands.length > 1 ? `Hand ${i + 1}` : 'Your hand'}
                          <span className="text-cyan-300"> · {h.total}</span>
                          {h.soft && <span className="text-slate-600"> soft</span>}
                          {h.switched && <span className="text-amber-300"> · switched</span>}
                        </div>
                        <div className="flex justify-center gap-1.5 sm:gap-2.5">
                          {h.cards.map((c, ci) => (
                            <TableCard
                              key={ci}
                              cardIdx={c}
                              width={CARD_W}
                              encoding="blackjack"
                              back={felt.back}
                              deal
                              win={
                                !!res &&
                                ['win', 'blackjack', 'five_card_trick', 'bonus_21'].includes(
                                  res.outcome,
                                )
                              }
                              dim={h.busted || h.surrendered}
                            />
                          ))}
                        </div>
                        <div className="mt-1 text-[11px] tabular-nums">
                          <span className="text-slate-500">{h.bet.toLocaleString()}</span>
                          {h.freeBet > 0 && (
                            <span className="ml-1 rounded bg-amber-400/15 px-1 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-amber-300">
                              +{h.freeBet.toLocaleString()} free
                            </span>
                          )}
                        </div>
                        {res && (
                          <div
                            className={`mt-0.5 text-[11px] font-semibold ${
                              res.payout > res.staked
                                ? 'text-amber-300'
                                : res.payout === res.staked
                                  ? 'text-slate-400'
                                  : 'text-rose-400'
                            }`}
                          >
                            {bjOutcomeLabel(res.outcome, rules)}
                            {res.bonus > 0 && (
                              <span className="text-cyan-300"> +{res.bonus.toLocaleString()}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
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

          {/* Super Match settles on its own terms, so it gets its own line
              rather than disappearing into the round's net. */}
          {settled && sideResult && (
            <Card className="flex items-center justify-between border-0 bg-[#07131F] px-4 py-2.5 ring-1 ring-inset ring-cyan-950/70">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                Super Match · {bjSuperMatchLabel(sideResult)}
              </span>
              <span
                className={`arc-mono text-sm font-bold tabular-nums ${
                  sidePayout > 0 ? 'text-amber-300' : 'text-slate-600'
                }`}
              >
                {sidePayout > 0 ? `+${sidePayout.toLocaleString()}` : 'no pay'}
              </span>
            </Card>
          )}

          {/* Actions — pinned to a bottom bar on mobile. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-950/70 bg-[#07131F]/95 p-3 backdrop-blur-sm lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            {betting ? (
              <Button
                type="button"
                disabled={!info}
                onClick={() => void deal()}
                className="arc-display flex h-14 w-full flex-col items-center justify-center gap-0 bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
              >
                <span>{phase === 'settled' ? 'New round' : 'Deal'}</span>
                <span className="arc-mono text-[11px] font-semibold normal-case tracking-normal opacity-85">
                  {clampBet(bet).toLocaleString()} MORBIUS
                </span>
              </Button>
            ) : phase === 'acting' && legalActions.length > 0 ? (
              <div
                className={`grid gap-2.5 ${
                  legalActions.length >= 4
                    ? 'grid-cols-2 sm:grid-cols-4'
                    : legalActions.length === 3
                      ? 'grid-cols-3'
                      : 'grid-cols-2'
                }`}
              >
                {legalActions.map((a) => {
                  const primary = a === 'hit' || a === 'stand';
                  const isFree =
                    (a === 'double' && freeDouble) || (a === 'split' && freeSplit);
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
                      <span>{bjActionLabel(a, rules)}</span>
                      {isFree && (
                        <span className="arc-mono text-[10.5px] font-semibold normal-case tracking-normal text-amber-300">
                          house pays
                        </span>
                      )}
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
          emptyCopy="No rounds yet. Place a bet to get started."
        />
      </div>

      <FloatingPanel title="Session" storageKey={`bjVariant.${variant}.sessionChart.pos`}>
        <SessionChart
          gameName={rules?.name ?? 'Blackjack'}
          points={session}
          unitLabel="Rounds"
          bare
          allTimeLoader={async () => {
            const rounds = await fetchBjHistory(variant, 365);
            return [...rounds].reverse().map((r, i) => ({
              drop: i + 1,
              bet: r.committed,
              profit: r.totalPayout - r.committed,
            }));
          }}
        />
      </FloatingPanel>

      <BlackjackVariantFairnessModal
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

      {/* Everything a player would otherwise only learn by losing. */}
      <section className="mt-6">
        <ArcadeFAQ items={blackjackVariantFaqs(variant)} accent="#22D3EE" />
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
  return (
    <div className="bg-[#040c13]/85 px-3 py-2.5 text-center">
      <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div
        className={`arc-mono mt-0.5 font-bold tabular-nums ${color}`}
        style={{ fontSize: 'clamp(13px,3.4vw,18px)' }}
      >
        {value}
      </div>
    </div>
  );
}
