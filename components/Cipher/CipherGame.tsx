'use client';

/**
 * CipherGame — the interactive client for chips Cipher (/cipher).
 *
 * Faithful port of public/cipher-lab.html: a secret code of coloured pegs sealed
 * behind a commitment hash; each guess returns exact (●) / partial (○) peg
 * feedback; crack the whole code to win the crack ladder for the try you cracked
 * on (faster pays more), or bank the secured value your best exact-peg count has
 * earned. Run dry without cracking and the round busts.
 *
 * Deep-Sea Neon: #050E16 abyss base, cyan #22D3EE chrome, amber win amounts,
 * rose losses. Chakra Petch + JetBrains Mono via the arcade2 fonts.
 *
 * Stateful (like Chicken/Towers): /start debits the bet and seals the code →
 * each /guess returns feedback and advances the round (a full crack auto-settles
 * as a win, the last guess without a crack busts) → /cashout banks the secured
 * value after at least one exact peg. On mount we resume the active round via
 * /active so a refresh never strands a bet. The secret code and server seed only
 * arrive on settle — never during an active round.
 *
 * Layout mirrors the arcade2 family: a 300px control rail (balance, difficulty,
 * bet + ½/2×/Max, Deal / Submit + Cash out, provably fair) beside the code board.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import confetti from 'canvas-confetti';
import { Volume2, VolumeX, Delete } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePokerChipBalance } from '@/hooks/use-poker-chip-balance';
import { formatChips } from '@/lib/format-poker-chips';
import { PokerChipExchangeModal } from '@/components/poker/PokerChipExchangeModal';
import { probeSiweSession } from '@/lib/api-auth';
import { SessionChart, type SessionPoint } from '@/components/arcade2/SessionChart';
import { FloatingPanel } from '@/components/arcade2/FloatingPanel';
import { CipherInfoTabs } from './CipherInfoTabs';
import { CipherFairnessModal } from './CipherFairnessModal';
import { cipherAudio } from './cipher-audio';
import {
  fetchCipherInfo,
  fetchCipherActive,
  startCipher,
  guessCipher,
  cashoutCipher,
  fetchCipherHistory,
  formatMultiplier,
  CIPHER_COLORS,
  CIPHER_DIFFICULTY_ORDER,
  CIPHER_DIFFICULTY_LABELS,
  type CipherActiveRound,
  type CipherDifficulty,
  type CipherInfo,
  type CipherGuessRecord,
  type CipherHistoryRound,
} from '@/lib/cipher-client';

const HISTORY_LIMIT = 25;

type Phase = 'idle' | 'starting' | 'active' | 'guessing' | 'cashing' | 'busted' | 'cracked' | 'banked';

interface RoundResult {
  kind: 'crack' | 'bank' | 'bust';
  multiplierX100: number;
  payout: number;
  code: number[];
}

function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/);
  return m ? m[1] : null;
}

/** A single code peg disc (colour + letter), in build / guess rows. */
function Peg({ symbol, size = 28, pop = false }: { symbol: number; size?: number; pop?: boolean }) {
  const c = CIPHER_COLORS[symbol] ?? CIPHER_COLORS[0];
  return (
    <span
      className={`arc-mono inline-grid place-items-center rounded-full font-bold ${pop ? 'cipher-pop' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.46, background: c.c, color: '#04141b' }}
    >
      {c.l}
    </span>
  );
}

/** A peg-feedback cluster: exact (filled cyan), partial (ring), then empty. */
function Feedback({ exact, partial, slots }: { exact: number; partial: number; slots: number }) {
  const pegs: ('exact' | 'partial' | 'none')[] = [];
  for (let i = 0; i < exact; i++) pegs.push('exact');
  for (let i = 0; i < partial; i++) pegs.push('partial');
  for (let i = exact + partial; i < slots; i++) pegs.push('none');
  return (
    <div className="ml-auto flex items-center gap-1.5">
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${Math.min(3, slots)}, minmax(0, 1fr))` }}
      >
        {pegs.map((p, i) => (
          <span
            key={i}
            className={`h-2.5 w-2.5 rounded-full ${
              p === 'exact'
                ? 'bg-cyan-400 shadow-[0_0_7px_-1px_#22D3EE]'
                : p === 'partial'
                  ? 'bg-transparent shadow-[inset_0_0_0_2px_#94A3B8]'
                  : 'bg-[#13202c]'
            }`}
          />
        ))}
      </div>
      <span className="arc-mono w-12 shrink-0 text-[11px] text-slate-500">
        {exact}● {partial}○
      </span>
    </div>
  );
}

export function CipherGame() {
  const { address } = useAccount();

  const [info, setInfo] = useState<CipherInfo | null>(null);
  const [bet, setBet] = useState<number>(500);
  const [difficulty, setDifficulty] = useState<CipherDifficulty>('easy');
  const [round, setRound] = useState<CipherActiveRound | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [guesses, setGuesses] = useState<CipherGuessRecord[]>([]);
  const [bestExact, setBestExact] = useState(0);
  const [current, setCurrent] = useState<(number | null)[]>([]);
  const [result, setResult] = useState<RoundResult | null>(null);

  const [session, setSession] = useState<SessionPoint[]>([]);
  const [history, setHistory] = useState<CipherHistoryRound[]>([]);
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

  const minBet = info?.minBet ?? 100;
  const maxBet = info?.maxBet ?? 100000;

  useEffect(() => {
    fetchCipherInfo()
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
      .then((ok) => (ok ? fetchCipherHistory(HISTORY_LIMIT) : []))
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
      .then((ok) => (ok ? fetchCipherActive() : null))
      .then((active) => {
        if (cancelled || !active) return;
        setRound(active);
        setDifficulty(active.difficulty);
        setBet(active.bet);
        setGuesses(active.guesses);
        setBestExact(active.bestExact);
        setCurrent(new Array(active.codeLen).fill(null));
        setResult(null);
        setPhase('active');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address]);

  // Read phase through a widened alias so the `betting` flag below doesn't make
  // TS narrow `phase` inside the action JSX (where we still test 'starting',
  // 'guessing' and 'cashing').
  const phaseValue: Phase = phase;
  const betting = phase === 'idle' || phase === 'busted' || phase === 'cracked' || phase === 'banked';

  // Board config: from the active round while playing, else the selected difficulty.
  const boardDifficulty = round?.difficulty ?? difficulty;
  const diffInfo = info?.difficulties[boardDifficulty] ?? null;
  const codeLen = round?.codeLen ?? diffInfo?.codeLen ?? 4;
  const symbols = round?.symbols ?? diffInfo?.symbols ?? 5;
  const maxGuesses = round?.maxGuesses ?? diffInfo?.maxGuesses ?? 8;
  const crackLadder = round?.crack ?? diffInfo?.crack ?? [];
  const secureLadder = round?.secure ?? diffInfo?.secure ?? [];

  const guessCount = guesses.length;
  const isPlaying = phase === 'active' || phase === 'guessing';
  const crackNextX100 = isPlaying && guessCount < maxGuesses ? crackLadder[guessCount + 1] ?? 0 : 0;
  const securedX100 = isPlaying && bestExact >= 1 ? secureLadder[bestExact] ?? 0 : 0;
  const cashoutValue = round && securedX100 ? Math.floor((round.bet * securedX100) / 100) : 0;
  const canCash = phase === 'active' && securedX100 > 0;
  const currentFull = current.length === codeLen && current.every((v) => v != null);

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

  const settleHistory = useCallback(
    (
      roundId: string,
      betAmount: number,
      diff: CipherDifficulty,
      gCount: number,
      best: number,
      cracked: boolean,
      won: boolean,
      multX100: number,
      payout: number,
    ) => {
      setHistory((prev) =>
        [
          {
            roundId,
            bet: betAmount,
            difficulty: diff,
            guessCount: gCount,
            bestExact: best,
            cracked,
            multiplierX100: multX100,
            won,
            payout,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, HISTORY_LIMIT),
      );
    },
    [],
  );

  const winFx = useCallback(() => {
    cipherAudio.playCrack();
    confetti({
      particleCount: 110,
      spread: 75,
      origin: { y: 0.5 },
      colors: ['#22D3EE', '#FCD34D', '#ffffff'],
    });
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
    setGuesses([]);
    setBestExact(0);
    setPhase('starting');
    cipherAudio.init();
    try {
      const r = await startCipher({
        bet: stake,
        difficulty,
        clientSeed: clientSeed.trim() || undefined,
      });
      setRound({
        roundId: r.roundId,
        bet: r.bet,
        difficulty: r.difficulty,
        codeLen: r.codeLen,
        symbols: r.symbols,
        maxGuesses: r.maxGuesses,
        crack: r.crack,
        secure: r.secure,
        guesses: [],
        guessCount: 0,
        bestExact: 0,
        crackNextX100: r.crackNextX100,
        securedX100: 0,
        serverSeedHash: r.serverSeedHash,
      });
      setCurrent(new Array(r.codeLen).fill(null));
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      setPhase('active');
      cipherAudio.playDeal();
    } catch (e) {
      setPhase('idle');
      handleErr(e);
    }
  }, [betting, info, bet, difficulty, balance, clientSeed, clampBet, handleErr]);

  const placeColor = useCallback(
    (c: number) => {
      if (phase !== 'active') return;
      setCurrent((prev) => {
        const idx = prev.indexOf(null);
        if (idx < 0) return prev;
        const next = prev.slice();
        next[idx] = c;
        return next;
      });
      cipherAudio.playPlace();
    },
    [phase],
  );

  const clearSlot = useCallback(
    (i: number) => {
      if (phase !== 'active') return;
      setCurrent((prev) => {
        const next = prev.slice();
        next[i] = null;
        return next;
      });
    },
    [phase],
  );

  const backspace = useCallback(() => {
    if (phase !== 'active') return;
    setCurrent((prev) => {
      const next = prev.slice();
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i] != null) {
          next[i] = null;
          break;
        }
      }
      return next;
    });
  }, [phase]);

  const submitGuess = useCallback(async () => {
    if (!round || phase !== 'active') return;
    if (current.length !== codeLen || current.some((v) => v == null)) return;
    const guess = current.map((v) => v as number);
    const betAmount = round.bet;
    const roundId = round.roundId;
    const diff = round.difficulty;
    setPhase('guessing');
    setError(null);
    cipherAudio.init();
    try {
      const r = await guessCipher(roundId, guess);
      const record: CipherGuessRecord = { guess, exact: r.exact, partial: r.partial };
      setGuesses((prev) => [...prev, record]);
      setBestExact(r.bestExact);
      setCurrent(new Array(codeLen).fill(null));

      if (r.settled && r.cracked) {
        setResult({ kind: 'crack', multiplierX100: r.multiplierX100, payout: r.payout, code: r.code });
        try {
          setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
        } catch {
          /* keep last known */
        }
        setPhase('cracked');
        winFx();
        settleHistory(roundId, betAmount, diff, r.guessCount, r.bestExact, true, true, r.multiplierX100, r.payout);
        setSession((prev) => [...prev, { drop: prev.length + 1, bet: betAmount, profit: r.payout - betAmount }]);
      } else if (r.settled && !r.cracked) {
        // Bust on the last guess.
        setResult({ kind: 'bust', multiplierX100: 0, payout: 0, code: r.code });
        setPhase('busted');
        cipherAudio.playBust();
        settleHistory(roundId, betAmount, diff, r.guessCount, r.bestExact, false, false, 0, 0);
        setSession((prev) => [...prev, { drop: prev.length + 1, bet: betAmount, profit: -betAmount }]);
      } else {
        cipherAudio.playExact(r.exact);
        setPhase('active');
      }
    } catch (e) {
      setPhase('active');
      handleErr(e);
    }
  }, [round, phase, current, codeLen, settleHistory, winFx, handleErr]);

  const doCashout = useCallback(async () => {
    if (!round || phase !== 'active' || securedX100 <= 0) return;
    const betAmount = round.bet;
    const roundId = round.roundId;
    const diff = round.difficulty;
    setPhase('cashing');
    setError(null);
    try {
      const r = await cashoutCipher(roundId);
      setResult({ kind: 'bank', multiplierX100: r.multiplierX100, payout: r.payout, code: r.code });
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      setPhase('banked');
      cipherAudio.playCash();
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.5 }, colors: ['#F59E0B', '#FCD34D', '#ffffff'] });
      settleHistory(roundId, betAmount, diff, guessCount, r.bestExact, false, true, r.multiplierX100, r.payout);
      setSession((prev) => [...prev, { drop: prev.length + 1, bet: betAmount, profit: r.payout - betAmount }]);
    } catch (e) {
      setPhase('active');
      handleErr(e);
    }
  }, [round, phase, securedX100, guessCount, settleHistory, handleErr]);

  const playAgain = useCallback(() => {
    setRound(null);
    setResult(null);
    setGuesses([]);
    setBestExact(0);
    setCurrent([]);
    setError(null);
    setPhase('idle');
  }, []);

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id);
    setFairnessOpen(true);
  }, []);

  const toggleMute = () => {
    cipherAudio.init();
    cipherAudio.setMute(!muted);
    setMuted(!muted);
  };

  // Keyboard: number keys place colours, backspace removes, enter submits.
  useEffect(() => {
    if (phase !== 'active') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= String(symbols)) {
        placeColor(parseInt(e.key, 10) - 1);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        backspace();
      } else if (e.key === 'Enter') {
        if (current.length === codeLen && current.every((v) => v != null)) void submitGuess();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, symbols, codeLen, current, placeColor, backspace, submitGuess]);

  const settledCode = result?.code ?? null;

  // Future (unplayed) rows below the build row.
  const futureRows = useMemo(() => {
    const shown = guessCount + (isPlaying ? 1 : 0);
    return Math.max(0, maxGuesses - shown);
  }, [guessCount, isPlaying, maxGuesses]);

  const nextEmpty = current.indexOf(null);

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
            <span className="text-xs uppercase tracking-wide text-slate-500">Difficulty</span>
            <div className="grid grid-cols-3 gap-2">
              {CIPHER_DIFFICULTY_ORDER.map((d) => {
                const di = info?.difficulties[d];
                const active = boardDifficulty === d;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={!betting}
                    onClick={() => setDifficulty(d)}
                    className={[
                      'flex flex-col items-center rounded-md border py-1.5 text-xs transition-colors disabled:opacity-50',
                      active
                        ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-300'
                        : 'border-cyan-950 text-slate-500 hover:border-cyan-500/40 hover:text-slate-300',
                    ].join(' ')}
                  >
                    <span className="arc-display font-semibold uppercase tracking-wider">
                      {CIPHER_DIFFICULTY_LABELS[d]}
                    </span>
                    {di && (
                      <span className="arc-mono text-[10px] text-slate-500">
                        {di.codeLen}×{di.symbols} · {di.maxGuesses}
                      </span>
                    )}
                  </button>
                );
              })}
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

          {round && !betting && (
            <div className="space-y-1 border-t border-cyan-950/70 pt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-500">Crack next</span>
                <span className="arc-mono tabular-nums text-cyan-300">
                  {crackNextX100 ? formatMultiplier(crackNextX100) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-500">Cash out</span>
                <span className="arc-mono tabular-nums text-amber-300">
                  {securedX100 ? cashoutValue.toLocaleString() : '—'}
                </span>
              </div>
            </div>
          )}

          {betting ? (
            <Button
              type="button"
              disabled={phaseValue === 'starting' || !info}
              onClick={() => void startRound()}
              className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
            >
              {phaseValue === 'starting' ? 'Sealing…' : round ? 'Play again' : 'Place bet & deal code'}
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <Button
                type="button"
                disabled={phase !== 'active' || !currentFull}
                onClick={() => void submitGuess()}
                className="arc-display h-14 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
              >
                {phaseValue === 'guessing' ? 'Scoring…' : 'Submit guess'}
              </Button>
              <Button
                type="button"
                disabled={!canCash || phaseValue === 'cashing'}
                onClick={() => void doCashout()}
                className="arc-display flex h-14 w-full flex-col items-center justify-center gap-0 bg-amber-400 text-base font-bold uppercase tracking-widest text-[#1A1206] shadow-[0_0_24px_-6px_rgba(245,158,11,0.85)] hover:bg-amber-300 disabled:opacity-50"
              >
                <span>{phaseValue === 'cashing' ? 'Banking…' : 'Cash out'}</span>
                <span className="arc-mono text-[11px] font-semibold normal-case tracking-normal opacity-85">
                  {canCash ? `${cashoutValue.toLocaleString()} chips` : 'land a peg first'}
                </span>
              </Button>
            </div>
          )}

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
            onClick={() => openVerify(history[0]?.roundId ?? null)}
            className="w-full text-center text-xs text-slate-500 transition-colors hover:text-cyan-300"
          >
            Provably Fair{history.length > 0 ? ' · verify last round' : ''}
          </button>
        </Card>

        {/* ───────── Code board ───────── */}
        <div className="order-1 space-y-4 lg:order-2">
          <Card className="relative overflow-hidden border-0 bg-[#07131F] p-0 ring-1 ring-inset ring-cyan-950/70">
            {/* HUD strip */}
            <div className="grid grid-cols-3 gap-px bg-cyan-500/10">
              <div className="bg-[#040c13]/90 px-3 py-3 text-center">
                <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">Crack next</div>
                <div className={`arc-mono mt-0.5 text-lg font-bold sm:text-xl ${crackNextX100 ? 'text-cyan-300' : 'text-slate-600'}`}>
                  {crackNextX100 ? formatMultiplier(crackNextX100) : '—'}
                </div>
              </div>
              <div className="bg-[#040c13]/90 px-3 py-3 text-center">
                <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">Tries</div>
                <div className="arc-mono mt-0.5 text-lg font-bold text-white sm:text-xl">
                  {guessCount} / {maxGuesses}
                </div>
              </div>
              <div className="bg-[#040c13]/90 px-3 py-3 text-center">
                <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">Cash out</div>
                <div className={`arc-mono mt-0.5 text-lg font-bold sm:text-xl ${securedX100 ? 'text-amber-300' : 'text-slate-600'}`}>
                  {securedX100 ? formatMultiplier(securedX100) : '—'}
                </div>
              </div>
            </div>

            <div className="relative p-4">
              {/* Sealed / revealed secret row */}
              <div className="mb-2 flex items-center gap-3 border-b border-dashed border-cyan-500/15 px-1 pb-3">
                <span className="w-12 shrink-0 text-[9.5px] uppercase tracking-[0.14em] text-slate-500">
                  {settledCode ? 'Code' : 'Sealed'}
                </span>
                <div className="flex gap-2">
                  {Array.from({ length: codeLen }).map((_, i) =>
                    settledCode ? (
                      <span key={i} className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-cyan-500/12 bg-[#02080d]/55">
                        <Peg symbol={settledCode[i]} />
                      </span>
                    ) : (
                      <span key={i} className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-cyan-500/12 bg-[#02080d]/55">
                        <span className="arc-mono grid h-7 w-7 place-items-center rounded-full bg-[#0a1a24] text-sm font-bold text-slate-500 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.12)]">
                          ?
                        </span>
                      </span>
                    ),
                  )}
                </div>
              </div>

              {/* Guess rows */}
              <div className="flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto px-1">
                {guesses.map((g, i) => (
                  <div key={i} className="flex items-center gap-3 py-0.5">
                    <span className="arc-mono w-6 shrink-0 text-right text-[11px] text-slate-500">{i + 1}</span>
                    <div className="flex gap-2">
                      {g.guess.map((s, j) => (
                        <span key={j} className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-cyan-500/12 bg-[#02080d]/55">
                          <Peg symbol={s} />
                        </span>
                      ))}
                    </div>
                    <Feedback exact={g.exact} partial={g.partial} slots={codeLen} />
                  </div>
                ))}

                {/* Active build row */}
                {isPlaying && (
                  <div className="flex items-center gap-3 py-0.5">
                    <span className="arc-mono w-6 shrink-0 text-right text-[11px] text-slate-500">{guessCount + 1}</span>
                    <div className="flex gap-2">
                      {Array.from({ length: codeLen }).map((_, j) => {
                        const v = current[j];
                        const isNext = j === nextEmpty;
                        return v != null ? (
                          <button
                            key={j}
                            type="button"
                            onClick={() => clearSlot(j)}
                            className="grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-[9px] border border-cyan-500/12 bg-[#02080d]/55"
                            aria-label={`Clear slot ${j + 1}`}
                          >
                            <Peg symbol={v} pop />
                          </button>
                        ) : (
                          <span
                            key={j}
                            className={`grid h-[34px] w-[34px] place-items-center rounded-[9px] border bg-[#02080d]/55 ${
                              isNext ? 'border-cyan-400 shadow-[0_0_14px_-3px_#22D3EE]' : 'border-cyan-500/12'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Future empty rows */}
                {Array.from({ length: futureRows }).map((_, i) => (
                  <div key={`f${i}`} className="flex items-center gap-3 py-0.5 opacity-30">
                    <span className="arc-mono w-6 shrink-0 text-right text-[11px] text-slate-500">
                      {guessCount + (isPlaying ? 1 : 0) + i + 1}
                    </span>
                    <div className="flex gap-2">
                      {Array.from({ length: codeLen }).map((_, j) => (
                        <span key={j} className="h-[34px] w-[34px] rounded-[9px] border border-cyan-500/12 bg-[#02080d]/55" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Palette keypad */}
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-dashed border-cyan-500/15 px-1 pt-3">
                {Array.from({ length: symbols }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={phase !== 'active'}
                    onClick={() => placeColor(i)}
                    aria-label={`Colour ${CIPHER_COLORS[i].l}`}
                    className="grid h-[42px] w-[42px] place-items-center rounded-xl border border-cyan-500/12 bg-[#061019]/60 transition-transform hover:-translate-y-px hover:border-cyan-400/35 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                  >
                    <Peg symbol={i} />
                  </button>
                ))}
                <button
                  type="button"
                  disabled={phase !== 'active'}
                  onClick={backspace}
                  aria-label="Remove last"
                  className="grid h-[42px] w-[42px] place-items-center rounded-xl border border-cyan-500/12 bg-[#061019]/60 text-slate-400 transition-colors hover:border-cyan-400/35 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Delete size={17} />
                </button>
              </div>

              {/* Result banner */}
              {result && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div
                    className={`cipher-banner-in rounded-2xl px-7 py-4 text-center ${
                      result.kind === 'bust'
                        ? 'border border-rose-400/45 bg-[radial-gradient(ellipse_at_center,rgba(251,113,133,0.18),rgba(4,12,19,0.6))]'
                        : 'border border-amber-500/50 bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.22),rgba(4,12,19,0.55))] shadow-[0_0_50px_-8px_rgba(245,158,11,0.55)]'
                    }`}
                  >
                    <div className={`text-[12px] uppercase tracking-[0.22em] ${result.kind === 'bust' ? 'text-rose-400' : 'text-amber-300'}`}>
                      {result.kind === 'crack'
                        ? `Cracked in ${guessCount}!`
                        : result.kind === 'bank'
                          ? `Banked ${bestExact}/${codeLen} locked`
                          : 'Code not cracked'}
                    </div>
                    <div className="arc-mono mt-1 text-3xl font-bold text-white sm:text-4xl">
                      {result.kind === 'bust'
                        ? `−${(round?.bet ?? 0).toLocaleString()}`
                        : `+${(result.payout - (round?.bet ?? 0)).toLocaleString()}`}{' '}
                      <span className="text-base text-slate-400">MORBIUS</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {result && (
            <div className="text-center">
              <Button
                type="button"
                onClick={playAgain}
                className="arc-display bg-cyan-500/15 text-sm font-bold uppercase tracking-widest text-cyan-300 ring-1 ring-cyan-500/40 hover:bg-cyan-500/25"
              >
                Play again
              </Button>
            </div>
          )}

          {!result && (
            <p className="text-center arc-mono text-xs text-slate-500">
              {isPlaying
                ? `Build a ${codeLen}-peg guess · ●=right slot, ○=right colour · submit, or bank anytime`
                : 'Pick a difficulty · place a bet · deal to seal the code'}
            </p>
          )}
        </div>
      </div>

      {/* ───────── Session chart + info tabs ───────── */}
      <div className="mt-4 space-y-4">
        <div className="lg:hidden">
          <SessionChart points={session} unitLabel="Rounds" />
        </div>
        <CipherInfoTabs
          history={history}
          historyLoading={historyLoading}
          onVerify={(id) => openVerify(id)}
          info={info}
        />
      </div>
      <div className="hidden lg:block">
        <FloatingPanel title="Session" storageKey="cipher.sessionChart.pos">
          <SessionChart points={session} unitLabel="Rounds" bare />
        </FloatingPanel>
      </div>

      <CipherFairnessModal
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

      <style jsx global>{`
        @keyframes cipher-pop {
          0% {
            transform: scale(0.4);
            opacity: 0.2;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        .cipher-pop {
          animation: cipher-pop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes cipher-banner-in {
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
        .cipher-banner-in {
          animation: cipher-banner-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
      `}</style>
    </div>
  );
}
