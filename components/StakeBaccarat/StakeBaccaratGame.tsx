'use client';

/**
 * StakeBaccaratGame — the interactive client for chips Baccarat (/baccarat).
 *
 * Deep-Sea Neon (the direction the BaccaratTable/Roads/InfoTabs already commit
 * to): #050E16 abyss base, cyan #22D3EE Player, amber #F59E0B Banker, violet
 * #A78BFA Tie, gold win amounts. Chakra Petch + JetBrains Mono via the arcade2
 * font variables.
 *
 * Layout: 300px control rail (balance, chip value, total, DEAL, clear/rebet,
 * provably fair) · felt (BaccaratTable card stage) + the five-zone betting
 * cloth + the bead road. Deal flow: place chips → POST /play (instant, atomic,
 * provably fair) → the parent paces a card-by-card reveal into the felt → settle
 * (balance, banner, roads, history, session chart).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { BaccaratTable, type BaccaratBannerInfo } from './BaccaratTable';
import { BaccaratRoads, type RoadEntry } from './BaccaratRoads';
import { BaccaratInfoTabs } from './BaccaratInfoTabs';
import { BaccaratFairnessModal } from './BaccaratFairnessModal';
import { baccaratAudio } from './baccarat-audio';
import {
  fetchBaccaratInfo,
  fetchBaccaratRecent,
  fetchBaccaratHistory,
  playBaccarat,
  baccaratIsNatural,
  sumBaccaratZones,
  BACC_PAYOUTS_FALLBACK,
  type BaccaratBets,
  type BaccaratBetKey,
  type BaccaratInfo,
  type BaccaratHistoryHand,
  type BaccaratPlayResult,
} from '@/lib/baccarat-client';

const HISTORY_LIMIT = 25;
const CHIP_VALUES = [10, 25, 100, 500] as const;
const REVEAL_GAP_MS = 520;

const ZERO_BETS: BaccaratBets = { player: 0, banker: 0, tie: 0, playerPair: 0, bankerPair: 0 };

const CHIP_STYLE: Record<number, string> = {
  10: 'bg-cyan-700',
  25: 'bg-violet-700',
  100: 'bg-amber-600',
  500: 'bg-rose-700',
};

type Tone = 'player' | 'banker' | 'tie';

const ZONE_META: Record<BaccaratBetKey, { label: string; tone: Tone; payoutKey: keyof BaccaratBets }> = {
  player: { label: 'Player', tone: 'player', payoutKey: 'player' },
  banker: { label: 'Banker', tone: 'banker', payoutKey: 'banker' },
  tie: { label: 'Tie', tone: 'tie', payoutKey: 'tie' },
  playerPair: { label: 'Player pair', tone: 'player', payoutKey: 'playerPair' },
  bankerPair: { label: 'Banker pair', tone: 'banker', payoutKey: 'bankerPair' },
};

const TONE_IDLE: Record<Tone, string> = {
  player: 'border-cyan-500/30 text-cyan-300/90 hover:border-cyan-400/70 hover:bg-cyan-500/10',
  banker: 'border-amber-500/30 text-amber-300/90 hover:border-amber-400/70 hover:bg-amber-500/10',
  tie: 'border-[#A78BFA]/30 text-[#A78BFA] hover:border-[#A78BFA]/70 hover:bg-[#A78BFA]/10',
};

const TONE_WON: Record<Tone, string> = {
  player: 'border-cyan-400 bg-cyan-500/15 ring-2 ring-cyan-400/70 shadow-[0_0_22px_-4px_rgba(34,211,238,0.7)]',
  banker: 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/70 shadow-[0_0_22px_-4px_rgba(245,158,11,0.7)]',
  tie: 'border-[#A78BFA] bg-[#A78BFA]/15 ring-2 ring-[#A78BFA]/70 shadow-[0_0_22px_-4px_rgba(167,139,250,0.7)]',
};

/** ×100 gross multiplier → "1:1" / "0.95:1" / "8:1" odds string. */
function oddsLabel(x100: number): string {
  const odds = (x100 - 100) / 100;
  return `${Number.isInteger(odds) ? odds : odds.toFixed(2).replace(/0+$/, '')}:1`;
}

function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/);
  return m ? m[1] : null;
}

/** Strip the zero zones — the API takes a partial bet map. */
function nonZeroBets(bets: BaccaratBets): Partial<BaccaratBets> {
  const out: Partial<BaccaratBets> = {};
  (Object.keys(bets) as BaccaratBetKey[]).forEach((k) => {
    if (bets[k] > 0) out[k] = bets[k];
  });
  return out;
}

export function StakeBaccaratGame() {
  const { address } = useAccount();

  const [info, setInfo] = useState<BaccaratInfo | null>(null);
  const [bets, setBets] = useState<BaccaratBets>(ZERO_BETS);
  const [undoStack, setUndoStack] = useState<Array<{ zone: BaccaratBetKey; amount: number }>>([]);
  const [lastBets, setLastBets] = useState<BaccaratBets | null>(null);
  const [chipValue, setChipValue] = useState<number>(25);

  const [phase, setPhase] = useState<'idle' | 'dealing' | 'settled'>('idle');
  const [dealing, setDealing] = useState(false);
  const [handKey, setHandKey] = useState(0);
  const [shownPlayer, setShownPlayer] = useState<number[]>([]);
  const [shownBanker, setShownBanker] = useState<number[]>([]);
  const [banner, setBanner] = useState<BaccaratBannerInfo | null>(null);

  const [roadEntries, setRoadEntries] = useState<RoadEntry[]>([]);
  const [session, setSession] = useState<SessionPoint[]>([]);
  const [history, setHistory] = useState<BaccaratHistoryHand[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [clientSeed, setClientSeed] = useState('');
  const [fairnessOpen, setFairnessOpen] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noChips, setNoChips] = useState(false);
  const [muted, setMuted] = useState(false);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  // Balance: public read keyed by wallet, then authoritative from play responses.
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

  useEffect(() => {
    fetchBaccaratInfo()
      .then(setInfo)
      .catch(() => {});
    fetchBaccaratRecent(24)
      .then((rows) =>
        setRoadEntries(
          [...rows]
            .reverse()
            .map((h) => ({
              key: h.handId,
              result: h.result,
              playerPair: h.playerPair,
              bankerPair: h.bankerPair,
            })),
        ),
      )
      .catch(() => {});
  }, []);

  const loadMyHistory = useCallback(() => {
    if (!address) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    probeSiweSession()
      .then((ok) => (ok ? fetchBaccaratHistory(HISTORY_LIMIT) : []))
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [address]);

  useEffect(() => {
    loadMyHistory();
  }, [loadMyHistory]);

  const totalBet = useMemo(() => sumBaccaratZones(bets), [bets]);
  const zoneCount = useMemo(
    () => (Object.keys(bets) as BaccaratBetKey[]).filter((k) => bets[k] > 0).length,
    [bets],
  );

  const payouts = info?.payouts ?? BACC_PAYOUTS_FALLBACK;
  const minBet = info?.minBet ?? 10;
  const maxBet = info?.maxBet ?? 2000;

  const placeBet = useCallback(
    (zone: BaccaratBetKey) => {
      if (dealing) return;
      setError(null);
      setNoChips(false);
      setBets((prev) => {
        const stake = Math.max(chipValue, minBet);
        const next = Math.min(maxBet, prev[zone] + stake);
        const added = next - prev[zone];
        if (added <= 0) {
          setError(`Max ${maxBet.toLocaleString()} chips per zone.`);
          return prev;
        }
        const newTotal = sumBaccaratZones(prev) + added;
        if (balance != null && BigInt(newTotal) > balance) {
          setError('Not enough chips for that bet.');
          setNoChips(true);
          return prev;
        }
        baccaratAudio.init();
        baccaratAudio.playChip();
        setUndoStack((s) => [...s, { zone, amount: added }]);
        return { ...prev, [zone]: next };
      });
    },
    [dealing, chipValue, minBet, maxBet, balance],
  );

  const undo = useCallback(() => {
    if (dealing) return;
    setUndoStack((s) => {
      const last = s[s.length - 1];
      if (!last) return s;
      setBets((prev) => ({ ...prev, [last.zone]: Math.max(0, prev[last.zone] - last.amount) }));
      return s.slice(0, -1);
    });
  }, [dealing]);

  const clearBets = useCallback(() => {
    if (dealing) return;
    setBets(ZERO_BETS);
    setUndoStack([]);
  }, [dealing]);

  const rebet = useCallback(() => {
    if (dealing || !lastBets) return;
    const total = sumBaccaratZones(lastBets);
    if (balance != null && BigInt(total) > balance) {
      setError('Not enough chips to repeat the last bets.');
      setNoChips(true);
      return;
    }
    setBets(lastBets);
    setUndoStack([]);
  }, [dealing, lastBets, balance]);

  const settle = useCallback((res: BaccaratPlayResult) => {
    setPhase('settled');
    const net = res.totalPayout - res.totalBet;
    setBanner({
      result: res.result,
      net,
      natural: baccaratIsNatural(res.playerCards, res.bankerCards, res.playerTotal, res.bankerTotal),
      playerPair: res.playerPair,
      bankerPair: res.bankerPair,
    });
    try {
      setBalance(BigInt(res.chipBalance.split('.')[0] || '0'));
    } catch {
      /* keep last known */
    }
    setRoadEntries((prev) => [
      ...prev,
      { key: res.handId, result: res.result, playerPair: res.playerPair, bankerPair: res.bankerPair },
    ]);
    setSession((prev) => [...prev, { drop: prev.length + 1, bet: res.totalBet, profit: net }]);
    setHistory((prev) =>
      [
        {
          handId: res.handId,
          bets: res.bets,
          totalBet: res.totalBet,
          playerTotal: res.playerTotal,
          bankerTotal: res.bankerTotal,
          result: res.result,
          playerPair: res.playerPair,
          bankerPair: res.bankerPair,
          payouts: res.payouts,
          totalPayout: res.totalPayout,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, HISTORY_LIMIT),
    );
    setDealing(false);

    if (res.result === 'tie' && net <= 0) {
      baccaratAudio.playTie();
    } else if (net > 0) {
      baccaratAudio.playWin();
      confetti({
        particleCount: 110,
        spread: 75,
        origin: { y: 0.5 },
        colors: ['#22D3EE', '#FCD34D', '#A78BFA', '#ffffff'],
      });
    } else {
      baccaratAudio.playLose();
    }
  }, []);

  const startReveal = useCallback(
    (res: BaccaratPlayResult) => {
      setLastBets(bets);
      setHandKey((k) => k + 1);
      setShownPlayer([]);
      setShownBanker([]);
      setBanner(null);
      setPhase('dealing');

      const steps: Array<['p' | 'b', number]> = [
        ['p', 0],
        ['b', 0],
        ['p', 1],
        ['b', 1],
      ];
      if (res.playerCards.length > 2) steps.push(['p', 2]);
      if (res.bankerCards.length > 2) steps.push(['b', 2]);

      let t = 200;
      steps.forEach(([side, idx]) => {
        const id = setTimeout(() => {
          if (side === 'p') setShownPlayer(res.playerCards.slice(0, idx + 1));
          else setShownBanker(res.bankerCards.slice(0, idx + 1));
          baccaratAudio.playDealCard();
        }, t);
        timersRef.current.push(id);
        t += REVEAL_GAP_MS;
      });

      const settleId = setTimeout(() => settle(res), t + 160);
      timersRef.current.push(settleId);
    },
    [bets, settle],
  );

  const deal = useCallback(async () => {
    if (dealing || !info) return;
    if (totalBet <= 0) {
      setError('Place a bet on at least one zone.');
      return;
    }
    setError(null);
    setNoChips(false);
    setDealing(true);
    baccaratAudio.init();
    try {
      const res = await playBaccarat({
        bets: nonZeroBets(bets),
        clientSeed: clientSeed.trim() || undefined,
      });
      startReveal(res);
    } catch (e) {
      setDealing(false);
      const msg = (e as Error)?.message ?? '';
      if (/Not enough chips|insufficient/i.test(msg)) {
        setError('Not enough chips for that wager.');
        setNoChips(true);
      } else if (/401|No session|auth/i.test(msg)) {
        setError('Connect your wallet to play.');
      } else {
        setError(serverDetail(msg) ?? 'Could not complete the hand. Try again.');
      }
    }
  }, [dealing, info, totalBet, bets, clientSeed, startReveal]);

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id);
    setFairnessOpen(true);
  }, []);

  const toggleMute = () => {
    baccaratAudio.init();
    baccaratAudio.setMute(!muted);
    setMuted(!muted);
  };

  const settled = phase === 'settled' && banner != null;
  const wonZone = (key: BaccaratBetKey): boolean => {
    if (!settled || !banner) return false;
    if (key === 'player') return banner.result === 'player';
    if (key === 'banker') return banner.result === 'banker';
    if (key === 'tie') return banner.result === 'tie';
    if (key === 'playerPair') return banner.playerPair;
    return banner.bankerPair;
  };

  const renderZone = (key: BaccaratBetKey, opts?: { big?: boolean }) => {
    const meta = ZONE_META[key];
    const amount = bets[key];
    const won = wonZone(key);
    return (
      <button
        key={key}
        type="button"
        disabled={dealing}
        onClick={() => placeBet(key)}
        aria-label={`Bet ${meta.label}`}
        className={[
          'relative flex flex-col items-center justify-center rounded-xl border bg-[#081420]/60 transition-all disabled:cursor-not-allowed disabled:opacity-60',
          opts?.big ? 'gap-1 py-5 sm:py-7' : 'gap-0.5 py-3',
          won ? TONE_WON[meta.tone] : TONE_IDLE[meta.tone],
        ].join(' ')}
      >
        <span
          className={`arc-display font-bold uppercase tracking-[0.18em] ${
            opts?.big ? 'text-sm sm:text-lg' : 'text-[11px] sm:text-xs'
          }`}
        >
          {meta.label}
        </span>
        <span className="arc-mono text-[10px] uppercase tracking-wider text-slate-500 sm:text-[11px]">
          {oddsLabel(payouts[meta.payoutKey])}
        </span>
        {amount > 0 && (
          <span className="arc-mono mt-1 inline-flex items-center rounded-full bg-[#050E16]/90 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-100 ring-1 ring-white/15">
            {amount.toLocaleString()}
          </span>
        )}
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
            <span className="text-xs uppercase tracking-wide text-slate-500">Chip value</span>
            <div className="flex items-center gap-2.5">
              {CHIP_VALUES.map((v) => (
                <button
                  key={v}
                  type="button"
                  disabled={dealing}
                  onClick={() => setChipValue(v)}
                  className={`flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-dashed border-white/85 font-mono text-xs font-bold text-white transition-transform hover:scale-105 disabled:opacity-50 ${CHIP_STYLE[v]} ${
                    chipValue === v ? 'outline outline-2 outline-offset-2 outline-cyan-400' : ''
                  }`}
                  style={{ boxShadow: '0 3px 8px rgba(0,0,0,.5), inset 0 0 0 4px rgba(0,0,0,.25)' }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1 border-t border-cyan-950/70 pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs uppercase tracking-wide text-slate-500">Total bet</span>
              <span className="arc-mono tabular-nums text-slate-200">
                {totalBet.toLocaleString()} chips
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs uppercase tracking-wide text-slate-500">Zones</span>
              <span className="arc-mono tabular-nums text-slate-200">{zoneCount} / 5</span>
            </div>
          </div>

          <Button
            type="button"
            disabled={dealing || totalBet === 0 || !info}
            onClick={() => void deal()}
            className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
          >
            {dealing ? 'Dealing…' : 'Deal'}
          </Button>

          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={dealing || undoStack.length === 0}
              onClick={undo}
              className="border-cyan-950 bg-transparent text-xs uppercase text-slate-500 hover:bg-cyan-500/10 hover:text-slate-200"
            >
              Undo
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={dealing || totalBet === 0}
              onClick={clearBets}
              className="border-cyan-950 bg-transparent text-xs uppercase text-slate-500 hover:bg-cyan-500/10 hover:text-slate-200"
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={dealing || !lastBets}
              onClick={rebet}
              className="border-cyan-950 bg-transparent text-xs uppercase text-slate-500 hover:bg-cyan-500/10 hover:text-slate-200"
            >
              Rebet
            </Button>
          </div>

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
            onClick={() => openVerify(history[0]?.handId ?? null)}
            className="w-full text-center text-xs text-slate-500 transition-colors hover:text-cyan-300"
          >
            Provably Fair{history.length > 0 ? ' · verify last hand' : ''}
          </button>
        </Card>

        {/* ───────── Felt + betting cloth ───────── */}
        <div className="order-1 space-y-3 lg:order-2">
          <BaccaratTable
            phase={phase}
            handKey={handKey}
            playerCards={shownPlayer}
            bankerCards={shownBanker}
            banner={settled ? banner : null}
            muted={muted}
            onToggleMute={toggleMute}
          />

          {/* Five-zone betting cloth */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {renderZone('playerPair')}
              {renderZone('bankerPair')}
            </div>
            <div className="grid grid-cols-[1fr_0.72fr_1fr] gap-2">
              {renderZone('player', { big: true })}
              {renderZone('tie', { big: true })}
              {renderZone('banker', { big: true })}
            </div>
          </div>

          <BaccaratRoads entries={roadEntries} />

          {/* Mobile-only deal button — visible below the table so players on
              small screens don't need to scroll to the control rail. */}
          <div className="lg:hidden">
            <Button
              type="button"
              disabled={dealing || totalBet === 0 || !info}
              onClick={() => void deal()}
              className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
            >
              {dealing ? 'Dealing…' : 'Deal'}
            </Button>
          </div>
        </div>
      </div>

      {/* ───────── Session chart + info tabs ───────── */}
      <div className="mt-4 space-y-4">
        <div className="lg:hidden">
          <SessionChart points={session} unitLabel="Hands" />
        </div>
        <BaccaratInfoTabs
          history={history}
          historyLoading={historyLoading}
          onVerify={(id) => openVerify(id)}
          info={info}
        />
      </div>
      <div className="hidden lg:block">
        <FloatingPanel title="Session" storageKey="baccarat.sessionChart.pos">
          <SessionChart points={session} unitLabel="Hands" bare />
        </FloatingPanel>
      </div>

      <BaccaratFairnessModal
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
