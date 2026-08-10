'use client';

/**
 * CaribbeanStudGame — the interactive client for Caribbean Stud Poker
 * (/caribbean-stud).
 *
 * Deep-Sea Neon: #050E16 abyss, cyan #22D3EE chrome, amber wins, rose losses.
 *
 * One decision, and the whole game turns on a rule that surprises people: the
 * dealer needs Ace-King high to qualify, and when they miss, the Ante pays 1:1
 * while the Call — twice the size — merely pushes. A royal flush against an
 * unqualified dealer collects exactly one Ante. The felt says so before the
 * player commits, not afterwards.
 *
 * Server flow: /deal debits the Ante (+ optional 5+1 Bonus) and returns the
 * player's five cards plus the dealer's up card; /decision debits the Call on
 * a call, reveals the dealer's four down cards and settles. On mount we resume
 * any live hand via /active so a refresh between deal and decision never
 * strands the posted ante.
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
import { TableResultBanner } from '@/components/shared/TableResultBanner';
import { TableWinTextStyles } from '@/components/shared/TableWinText';
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
import { TableFairnessModal, type DeckSlice } from '@/components/shared/TableFairnessModal';
import { TableHandHistory, type TableHistoryRow } from '@/components/shared/TableHandHistory';
import { TableFeltControls, useTableFelt } from '@/components/shared/TableFeltControls';
import { tableAudio } from '@/lib/table-audio';
import { ArcadeFAQ } from '@/components/arcade2/ArcadeFAQ';
import { caribbeanStudFaqs } from './caribbeanStudFaqs';
import { categoryName, oddsLabel } from '@/lib/playing-cards';
import {
  csResultLabel,
  dealCs,
  decideCs,
  fetchCsActive,
  fetchCsHistory,
  fetchCsInfo,
  verifyCs,
  type CsDecisionResult,
  type CsHistoryRound,
  type CsInfo,
} from '@/lib/caribbean-stud-client';

const HISTORY_LIMIT = 25;
const CHIP_STEPS = [100, 500, 1000] as const;
const CARD_W = 'clamp(38px, 10.5vw, 54px)';

type Phase = 'idle' | 'dealing' | 'decision' | 'revealing' | 'settled';

function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/);
  return m ? m[1] : null;
}

export function CaribbeanStudGame() {
  const { address } = useAccount();
  const { reportWin } = useBigWin();

  const [info, setInfo] = useState<CsInfo | null>(null);
  const [ante, setAnte] = useState<number>(500);
  const [bonus, setBonus] = useState(false);

  const [roundId, setRoundId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [playerCards, setPlayerCards] = useState<number[]>([]);
  const [dealerUpCard, setDealerUpCard] = useState<number | null>(null);
  const [dealerCards, setDealerCards] = useState<number[]>([]);
  const [settlement, setSettlement] = useState<CsDecisionResult | null>(null);
  const felt = useTableFelt();

  // How many of the dealer's five have actually been turned. The up card is
  // face up from the deal, so this sits at 1 through the decision and walks to
  // 5 at the showdown — one card at a time, which is the whole point: the
  // dealer's four down cards used to turn in the same frame with a single flip
  // sound over them, and the hand was over before it looked like it had begun.
  const {
    shown: shownDealer,
    revealTo: revealDealer,
    snapTo: snapDealer,
  } = useStagedReveal(0);

  const [handAnte, setHandAnte] = useState(0);
  const [handBonus, setHandBonus] = useState(0);

  const [session, setSession] = useState<SessionPoint[]>([]);
  const [history, setHistory] = useState<CsHistoryRound[]>([]);
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
    fetchCsInfo()
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
      .then((ok) => (ok ? fetchCsHistory(HISTORY_LIMIT) : []))
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
      .then((ok) => (ok ? fetchCsActive() : null))
      .then((active) => {
        if (cancelled || !active) return;
        setRoundId(active.roundId);
        setHandAnte(active.ante);
        setHandBonus(active.bonus);
        setAnte(active.ante);
        setBonus(active.bonus > 0);
        setPlayerCards(active.playerCards);
        setDealerUpCard(active.dealerUpCard);
        setDealerCards([]);
        setSettlement(null);
        // Walking back into a hand mid-decision: the up card was turned before
        // we got here, so it is simply already up.
        snapDealer(1);
        setPhase('decision');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address, snapDealer]);

  const betting = phase === 'idle' || phase === 'settled';

  const clampBet = useCallback(
    (v: number) => {
      // Calling costs 2× the ante on top of it, so a hand a player can deal but
      // never call is worse than no hand at all — cap against the full 3×.
      const perHand = bonus ? 4 : 3;
      const affordable = balance != null ? Math.floor(Number(balance) / perHand) : maxBet;
      const cap = Math.min(maxBet, Math.max(minBet, affordable));
      return Math.max(minBet, Math.min(cap, Math.floor(v) || minBet));
    },
    [balance, maxBet, minBet, bonus],
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
    const cost = stake + (bonus ? stake : 0);
    if (balance != null && BigInt(cost) > balance) {
      setError('Not enough MORBIUS for that wager.');
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
    setDealerUpCard(null);
    snapDealer(0);
    setPhase('dealing');
    try {
      const r = await dealCs({
        ante: stake,
        bonus,
        clientSeed: clientSeed.trim() || undefined,
      });
      setRoundId(r.roundId);
      setHandAnte(r.ante);
      setHandBonus(r.bonus);
      setAnte(r.ante);
      setPlayerCards(r.playerCards);
      setDealerUpCard(r.dealerUpCard);
      // The dealer's up card is face up from the moment it lands; the other
      // four wait for the showdown.
      snapDealer(1);
      // One tick per card, paced like a real deal rather than a single burst.
      r.playerCards.forEach((_, i) => setTimeout(() => tableAudio.playDeal(), i * 90));
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      setPhase('decision');
    } catch (e) {
      setPhase('idle');
      handleErr(e);
    }
  }, [betting, info, ante, bonus, balance, clientSeed, clampBet, handleErr, snapDealer]);

  // ------------------------------------------------------------- decision
  const decide = useCallback(
    async (action: 'call' | 'fold') => {
      if (!roundId || phase !== 'decision') return;
      setPhase('revealing');
      setError(null);
      try {
        const r = await decideCs(roundId, action);
        setDealerCards(r.dealerCards);
        setSettlement(r);
        if (r.chipBalance) {
          try {
            setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
          } catch {
            /* keep last known */
          }
        }

        const net = r.totalPayout - r.committed;
        reportWin({ game: 'Caribbean Stud', bet: r.committed, payout: r.totalPayout });

        // The dealer turns his four down cards one at a time, after a beat —
        // his hand is the answer to the round, so it gets to be an event. The
        // banner and the celebration wait until the last card is over, which is
        // what `phase` moving to 'settled' is doing here.
        revealDealer(r.dealerCards.length, {
          gap: REVEAL_FLIP_GAP,
          startDelay: REVEAL_SHOWDOWN_PAUSE,
          onCard: () => tableAudio.playFlip(),
          onSettled: () => {
            setPhase('settled');
            celebrateWin(winTierFor(r.committed, r.totalPayout), {
              bonus: (r.bonusPayout ?? 0) > 0,
            });
          },
        });

        setHistory((prev) =>
          [
            {
              roundId: r.roundId,
              ante: r.ante,
              bonus: r.bonus,
              call: r.call,
              playerCards: r.playerCards,
              dealerCards: r.dealerCards,
              result: r.result,
              playerCategory: r.playerCategory,
              dealerCategory: r.dealerCategory,
              dealerQualified: r.dealerQualified,
              antePayout: r.antePayout,
              callPayout: r.callPayout,
              bonusPayout: r.bonusPayout,
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
        setPhase('decision');
        handleErr(e);
      }
    },
    [roundId, phase, revealDealer, handleErr, reportWin],
  );

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id);
    setFairnessOpen(true);
  }, []);

  // -------------------------------------------------------------- derived
  const revealed = phase === 'settled';
  const net = settlement ? settlement.totalPayout - settlement.committed : 0;
  // Only once the dealer has finished turning — the glow is part of the result,
  // not a preview of it.
  const winTier =
    revealed && settlement ? winTierFor(settlement.committed, settlement.totalPayout) : null;
  const committedSoFar =
    phase === 'idle' ? 0 : handAnte + handBonus + (settlement ? settlement.call : 0);

  let bannerKind: 'win' | 'loss' | 'push' | null = null;
  let bannerTitle = '';
  let bannerValue = '';
  if (revealed && settlement) {
    if (net > 0) {
      bannerKind = 'win';
      bannerTitle =
        settlement.result === 'dealer_no_qualify'
          ? "Dealer doesn't qualify"
          : settlement.folded
            ? 'Folded · Bonus hit'
            : 'You win';
      bannerValue = `+${net.toLocaleString()} MORBIUS`;
    } else if (net === 0) {
      bannerKind = 'push';
      bannerTitle = settlement.result === 'dealer_no_qualify' ? "Dealer doesn't qualify" : 'Push';
      bannerValue = '±0 MORBIUS';
    } else {
      bannerKind = 'loss';
      bannerTitle = settlement.folded ? 'Folded' : 'Dealer wins';
      bannerValue = `−${Math.abs(net).toLocaleString()} MORBIUS`;
    }
  }

  let feltMsg: string;
  if (phase === 'idle') feltMsg = 'Set your ante and deal';
  else if (phase === 'dealing') feltMsg = 'Dealing…';
  else if (phase === 'revealing') feltMsg = 'Turning the dealer over…';
  else if (phase === 'decision') {
    feltMsg = `One card showing. Call for ${(handAnte * 2).toLocaleString()}, or fold and lose the ante.`;
  } else if (revealed && settlement) {
    feltMsg = `Dealer: ${settlement.dealerCategoryName}${
      settlement.dealerQualified ? '' : ' — no qualify, your call only comes back'
    }`;
  } else feltMsg = '';

  const historyRows: TableHistoryRow[] = history.map((h) => ({
    roundId: h.roundId,
    when: h.createdAt,
    committed: h.committed,
    payout: h.totalPayout,
    label: csResultLabel(h.result),
    detail: h.playerCategory ? categoryName(h.playerCategory) : null,
  }));

  const callPay = info?.callPay ?? {};
  const bonusPay = info?.bonusPay ?? {};
  const payingOrder = info?.payingOrder ?? [];
  const bonusOrder = info?.bonusPayingOrder ?? [];

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

              {/* Calling is not optional information — it is twice the ante, and
                  the player should know that before they post it. */}
              <div className="flex items-center justify-between rounded-xl border border-cyan-950 bg-[#0a1a26]/50 px-3 py-2 text-[12.5px]">
                <span className="text-slate-400">
                  Call costs <span className="text-slate-600">(2× ante)</span>
                </span>
                <span className="arc-mono tabular-nums text-slate-300">
                  {(clampBet(ante) * 2).toLocaleString()}
                </span>
              </div>

              <button
                type="button"
                disabled={!betting}
                onClick={() => setBonus((b) => !b)}
                className="flex w-full items-center justify-between rounded-xl border border-cyan-950 bg-[#0a1a26]/50 px-3 py-2.5 text-left transition-colors hover:border-cyan-500/40 disabled:opacity-50"
              >
                <span className="text-[12.5px] text-slate-300">
                  5+1 Bonus <span className="text-slate-500">(= ante)</span>
                </span>
                <span
                  className={`relative h-[22px] w-[38px] flex-none rounded-full transition-colors ${
                    bonus ? 'bg-cyan-400' : 'bg-slate-500/25'
                  }`}
                >
                  <span
                    className={`absolute top-[2px] h-[18px] w-[18px] rounded-full transition-all ${
                      bonus ? 'left-[18px] bg-[#04141b]' : 'left-[2px] bg-slate-300'
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
                Call (when you beat a qualified dealer)
              </div>
              {payingOrder.map((c) => (
                <div key={c} className="flex items-center text-xs text-slate-400">
                  <span>{categoryName(c)}</span>
                  <span className="arc-mono ml-auto text-slate-300">
                    {oddsLabel(callPay[c] ?? 0)}
                  </span>
                </div>
              ))}

              <div className="mt-2 text-[10.5px] uppercase tracking-[0.1em] text-slate-500">
                5+1 Bonus (your 5 + the dealer&rsquo;s up card)
              </div>
              {bonusOrder.map((c) => (
                <div key={c} className="flex items-center text-xs text-slate-400">
                  <span>{categoryName(c)}</span>
                  <span className="arc-mono ml-auto text-slate-300">
                    {oddsLabel(bonusPay[c] ?? 0)}
                  </span>
                </div>
              ))}

              <div className="mt-2 text-[10.5px] leading-snug text-slate-500">
                Dealer needs Ace-King high to qualify. If they miss, your ante pays 1:1 and your
                call — twice the size — is simply returned, however big your hand is.
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
                label="Your hand"
                value={revealed && settlement ? settlement.playerCategoryName : '—'}
                tone={revealed ? 'cyan' : 'idle'}
              />
              <HudCell
                label="Payout"
                value={settlement ? settlement.totalPayout.toLocaleString() : '—'}
                tone={settlement && settlement.totalPayout > 0 ? 'amber' : 'idle'}
              />
            </div>

            <div
              className="relative flex min-h-[clamp(300px,58vw,390px)] flex-col items-center justify-between gap-2.5 overflow-hidden px-4 py-5"
              style={{
                background:
                  'radial-gradient(ellipse 75% 60% at 50% 42%,rgba(34,211,238,.06),transparent 70%)',
              }}
            >
              {/* The felt's reaction to the result, behind everything on it. */}
              <TableWinGlow tier={winTier} round={roundId ?? undefined} />

              {/* Dealer seat — one card up, four sealed until the showdown. */}
              <div className="w-full text-center">
                <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.16em] text-slate-500">
                  Dealer
                  {revealed && settlement && (
                    <span className={settlement.dealerQualified ? 'text-amber-400' : 'text-rose-400'}>
                      {' '}
                      · {settlement.dealerQualified ? 'qualifies' : 'no qualify'}
                    </span>
                  )}
                </div>
                <div className="flex justify-center gap-1.5 sm:gap-2.5">
                  {playerCards.length === 5
                    ? [0, 1, 2, 3, 4].map((i) => (
                        <TableCard
                          key={i}
                          width={CARD_W}
                          // Before the showdown only deck[5] — the up card — is
                          // known. The face is handed over as soon as the server
                          // sends it and only `faceDown` is staged, so each card
                          // has something to turn to when its moment comes.
                          cardIdx={dealerCards[i] ?? (i === 0 ? (dealerUpCard ?? undefined) : undefined)}
                          faceDown={i >= shownDealer}
                          back={felt.back}
                          win={revealed && settlement?.winSide === 'dealer'}
                        />
                      ))
                    : [0, 1, 2, 3, 4].map((i) => (
                        <TableCard key={i} placeholder width={CARD_W} />
                      ))}
                </div>
              </div>

              <div className="min-h-[18px] px-2 text-center text-[13px] text-slate-400">
                {feltMsg}
              </div>

              {/* Player seat */}
              <div className="w-full text-center">
                <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.16em] text-slate-500">
                  Your hand
                </div>
                <div className="flex justify-center gap-1.5 sm:gap-2.5">
                  {playerCards.length > 0
                    ? playerCards.map((c, i) => (
                        <TableCard
                          key={i}
                          cardIdx={c}
                          width={CARD_W}
                          back={felt.back}
                          // Gated on the showdown being over, like the dealer's
                          // ring — otherwise the winning side is given away the
                          // moment the server answers, before a card has turned.
                          win={revealed && settlement?.winSide === 'player'}
                        />
                      ))
                    : [0, 1, 2, 3, 4].map((i) => (
                        <TableCard key={i} placeholder width={CARD_W} />
                      ))}
                </div>
              </div>

              <TableResultBanner
  kind={bannerKind}
  title={bannerTitle}
  value={bannerValue}
  tier={winTier}
  round={roundId ?? undefined}
/>
            </div>
          </Card>

          {/* Which bucket actually paid — a bare net number hides the fact that
              an unqualified dealer only ever pays the ante. */}
          {revealed && settlement && (
            <Card className="grid grid-cols-3 gap-px overflow-hidden border-0 bg-cyan-500/10 p-0 ring-1 ring-inset ring-cyan-950/70">
              <PayoutCell label="Ante" staked={settlement.ante} back={settlement.antePayout} />
              <PayoutCell label="Call" staked={settlement.call} back={settlement.callPayout} />
              <PayoutCell label="5+1 Bonus" staked={settlement.bonus} back={settlement.bonusPayout} />
            </Card>
          )}

          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-950/70 bg-[#07131F]/95 p-3 backdrop-blur-sm lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            {betting ? (
              <Button
                type="button"
                disabled={!info}
                onClick={() => void deal()}
                className="arc-display flex h-14 w-full flex-col items-center justify-center gap-0 bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
              >
                <span>{phase === 'settled' ? 'New hand' : 'Place ante & deal'}</span>
                <span className="arc-mono text-[11px] font-semibold normal-case tracking-normal opacity-85">
                  {(clampBet(ante) * (bonus ? 2 : 1)).toLocaleString()} MORBIUS
                </span>
              </Button>
            ) : phase === 'decision' ? (
              <div className="grid grid-cols-2 gap-2.5">
                <Button
                  type="button"
                  onClick={() => void decide('fold')}
                  className="arc-display flex h-14 w-full flex-col items-center justify-center gap-0 bg-[#14222C]/90 text-base font-bold uppercase tracking-widest text-slate-300 ring-1 ring-inset ring-slate-400/30 hover:bg-[#1b2c38]"
                >
                  <span>Fold</span>
                  <span className="arc-mono text-[11px] font-semibold normal-case tracking-normal opacity-85">
                    −{handAnte.toLocaleString()} MORBIUS
                  </span>
                </Button>
                <Button
                  type="button"
                  onClick={() => void decide('call')}
                  className="arc-display flex h-14 w-full flex-col items-center justify-center gap-0 bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400"
                >
                  <span>Call</span>
                  <span className="arc-mono text-[11px] font-semibold normal-case tracking-normal opacity-85">
                    +{(handAnte * 2).toLocaleString()} MORBIUS
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

      <div className="mt-4 space-y-4">
        <TableHandHistory
          rows={historyRows}
          loading={historyLoading}
          onVerify={(id) => openVerify(id)}
          emptyCopy="No hands yet. Place an ante to get started."
        />
      </div>

      <FloatingPanel title="Session" storageKey="caribbeanStud.sessionChart.pos">
        <SessionChart
          gameName="Caribbean Stud"
          points={session}
          unitLabel="Hands"
          bare
          allTimeLoader={async () => {
            const rounds = await fetchCsHistory(365);
            return [...rounds].reverse().map((r, i) => ({
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
        verify={verifyCs}
        sealCopy="Both full hands are sealed from a server seed committed (hashed) before your ante — including the dealer's four down cards. The seed is revealed once the hand settles, so you can re-shuffle and confirm the dealer's hand was fixed before you called."
        slices={(rec) => {
          const r = rec as unknown as Awaited<ReturnType<typeof verifyCs>>;
          const out: DeckSlice[] = [
            {
              label: 'You',
              from: 0,
              to: 5,
              cards: r.playerCards,
              note: categoryName(r.playerCategory),
            },
            {
              label: 'Dealer',
              from: 5,
              to: 10,
              cards: r.dealerCards,
              note: `${categoryName(r.dealerCategory)}${r.dealerQualified ? '' : ' · no qual'}`,
              noteTone: r.dealerQualified ? 'cyan' : 'rose',
            },
          ];
          return out;
        }}
        resultLabel={(rec) => {
          const r = rec as unknown as Awaited<ReturnType<typeof verifyCs>>;
          return csResultLabel(r.result);
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
        <ArcadeFAQ items={caribbeanStudFaqs} accent="#38BDF8" />
      </section>

      <TableCardStyles />
      <TableWinFxStyles />
      <TableWinTextStyles />
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
