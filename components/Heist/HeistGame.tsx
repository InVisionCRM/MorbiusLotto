'use client';

/**
 * HeistGame — the interactive client for chips Heist (/heist).
 *
 * Faithful port of the approved lab (public/heist-lab.html): an immersive vault
 * scene (spotlight, lasers, dial-faced doors) in the Deep-Sea Neon system
 * (#050E16 abyss, cyan safe accents, rose alarms, amber loot). Chakra Petch +
 * JetBrains Mono via the arcade2 fonts.
 *
 * Stateful heist (like Towers/Mines): /start debits the bet and seals every
 * room's alarm door(s) behind a committed hash → each /step opens one door in
 * the current room (safe advances, alarm busts) → /cashout banks
 * floor(bet × multiplier) after any cleared room; clearing the last room
 * auto-settles. On mount we resume the active round via /active so a refresh
 * never strands a bet.
 *
 * Layout: 300px control rail (balance, difficulty, bet + ½/2×/Max, break-in /
 * escape, provably fair) · the vault board.
 *
 * IMPORTANT (lab bug): `busy` is cleared BEFORE the escape/cash action renders,
 * so the escape button is never permanently disabled by a stale busy flag.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import confetti from 'canvas-confetti';
import { Volume2, VolumeX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePokerChipBalance } from '@/hooks/use-poker-chip-balance';
import { useBigWin } from '@/contexts/big-win-context';
import { formatChips } from '@/lib/format-poker-chips';
import { GameWalletModal } from '@/components/shared/GameWalletModal';
import { probeSiweSession } from '@/lib/api-auth';
import { SessionChart, type SessionPoint } from '@/components/arcade2/SessionChart';
import { FloatingPanel } from '@/components/arcade2/FloatingPanel';
import { ReplayConfirmOverlay } from '@/components/share/ReplayConfirmOverlay';
import { HeistVault, type DoorState } from './HeistVault';
import { HeistInfoTabs } from './HeistInfoTabs';
import { HeistFairnessModal } from './HeistFairnessModal';
import { heistAudio } from './heist-audio';
import {
  fetchHeistInfo,
  fetchHeistActive,
  startHeist,
  stepHeist,
  cashoutHeist,
  fetchHeistHistory,
  formatMultiplier,
  HEIST_DIFFICULTY_ORDER,
  HEIST_DIFFICULTY_LABELS,
  type HeistActiveRound,
  type HeistDifficulty,
  type HeistInfo,
  type HeistHistoryRound,
} from '@/lib/heist-client';

const HISTORY_LIMIT = 25;

type Phase = 'idle' | 'starting' | 'active' | 'busy' | 'busted' | 'cashed';

interface RoundResult {
  won: boolean;
  full: boolean;
  payout: number;
  multiplierX100: number;
  serverSeed: string;
}

const SAFE_REVEAL_MS = 620;
const ALARM_REVEAL_MS = 700;

const DEFAULT_DOORS: Record<HeistDifficulty, number> = { sneaky: 4, standard: 3, daring: 3 };
const DEFAULT_ROOMS: Record<HeistDifficulty, number> = { sneaky: 8, standard: 8, daring: 6 };

function serverDetail(msg: string): string | null {
  const m = msg.match(/^\d{3} [^:]*: (.+)$/);
  return m ? m[1] : null;
}

export function HeistGame() {
  const { address } = useAccount();
  const { reportWin } = useBigWin();

  const [info, setInfo] = useState<HeistInfo | null>(null);
  const [bet, setBet] = useState<number>(100);
  const [difficulty, setDifficulty] = useState<HeistDifficulty>('sneaky');
  const [round, setRound] = useState<HeistActiveRound | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<RoundResult | null>(null);

  // Per-door visuals for the current/just-resolved room.
  const [doorStates, setDoorStates] = useState<DoorState[]>([]);
  const [vaultMid, setVaultMid] = useState('Pick a job and break in');

  const [session, setSession] = useState<SessionPoint[]>([]);
  const [history, setHistory] = useState<HeistHistoryRound[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Replay: a staged past round (confirm overlay) + a flag while re-showing it.
  // A replay is a pure re-watch — it re-renders the round's final revealed vault
  // + escape banner and NEVER settles (no server call, balance, reportWin,
  // history, or session write). `replaying` also suppresses the idle-door reset
  // effect so a bust's alarm strobe survives on the board.
  const [pendingReplay, setPendingReplay] = useState<HeistHistoryRound | null>(null);
  const [replaying, setReplaying] = useState(false);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const [clientSeed, setClientSeed] = useState('');
  const [fairnessOpen, setFairnessOpen] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noChips, setNoChips] = useState(false);
  const [muted, setMuted] = useState(false);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => () => clearTimers(), [clearTimers]);

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
    fetchHeistInfo()
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
      .then((ok) => (ok ? fetchHeistHistory(HISTORY_LIMIT) : []))
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [address]);

  useEffect(() => {
    loadMyHistory();
  }, [loadMyHistory]);

  // Resume an in-progress heist after a refresh.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    probeSiweSession()
      .then((ok) => (ok ? fetchHeistActive() : null))
      .then((active) => {
        if (cancelled || !active) return;
        setRound(active);
        setDifficulty(active.difficulty);
        setBet(active.bet);
        setResult(null);
        setDoorStates(Array.from({ length: active.doors }, () => ({ kind: 'idle' as const })));
        setVaultMid(
          active.room > 0
            ? `Room ${active.room + 1} — ${formatMultiplier(active.multiplierX100)} banked, push on?`
            : `Room 1 — pick a vault (${active.doors} doors, ${active.alarms} alarm${active.alarms > 1 ? 's' : ''})`,
        );
        setPhase('active');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address]);

  const betting = phase === 'idle' || phase === 'busted' || phase === 'cashed';
  const boardDifficulty = round?.difficulty ?? difficulty;
  const diffInfo = info?.difficulties[boardDifficulty] ?? null;
  const doors = round?.doors ?? diffInfo?.doors ?? DEFAULT_DOORS[boardDifficulty];
  const alarms = round?.alarms ?? diffInfo?.alarms ?? 1;
  const totalRooms = round?.rooms ?? diffInfo?.rooms ?? DEFAULT_ROOMS[boardDifficulty];
  const currentRoom = round?.room ?? 0;
  const multiplierX100 = round?.multiplierX100 ?? 100;
  const cashoutValue = round ? Math.floor((round.bet * multiplierX100) / 100) : 0;
  const loot = round && currentRoom > 0 ? cashoutValue : round ? round.bet : 0;
  const canCash = phase === 'active' && currentRoom > 0;

  // Keep the door grid sized to the active difficulty while idle. Skipped during
  // a replay so a re-watched bust keeps its revealed alarm strobe on the board.
  useEffect(() => {
    if (betting && !replaying) {
      setDoorStates(Array.from({ length: doors }, () => ({ kind: 'idle' as const })));
    }
  }, [betting, doors, replaying]);

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

  const settleHistory = useCallback(
    (
      roundId: string,
      betAmount: number,
      diff: HeistDifficulty,
      room: number,
      multX100: number,
      won: boolean,
      payout: number,
      alarmDoors: number[][],
      picks: number[],
    ) => {
      setHistory((prev) =>
        [
          {
            roundId,
            bet: betAmount,
            difficulty: diff,
            room,
            alarmDoors,
            picks,
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
    heistAudio.playWin();
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
      setError('Not enough MORBIUS for that wager.');
      setNoChips(true);
      return;
    }
    clearTimers();
    setError(null);
    setNoChips(false);
    setResult(null);
    setPendingReplay(null);
    setReplaying(false);
    setPhase('starting');
    heistAudio.init();
    try {
      const r = await startHeist({ bet: stake, difficulty, clientSeed: clientSeed.trim() || undefined });
      setRound({
        roundId: r.roundId,
        bet: r.bet,
        difficulty: r.difficulty,
        room: 0,
        picks: [],
        multiplierX100: 100,
        serverSeedHash: r.serverSeedHash,
        rooms: r.rooms,
        doors: r.doors,
        alarms: r.alarms,
        ladder: r.ladder,
      });
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      setDoorStates(Array.from({ length: r.doors }, () => ({ kind: 'idle' as const })));
      setVaultMid(`Room 1 — pick a vault (${r.doors} doors, ${r.alarms} alarm${r.alarms > 1 ? 's' : ''})`);
      setPhase('active');
      heistAudio.playTick();
    } catch (e) {
      setPhase('idle');
      handleErr(e);
    }
  }, [betting, info, bet, difficulty, balance, clientSeed, clampBet, clearTimers, handleErr]);

  const doPick = useCallback(
    async (door: number) => {
      if (!round || phase !== 'active') return;
      setPhase('busy');
      setError(null);
      heistAudio.init();
      heistAudio.playTick();
      const betAmount = round.bet;
      const roundId = round.roundId;
      const diff = round.difficulty;
      const ladder = round.ladder;
      const roomNow = round.room;
      try {
        const r = await stepHeist(roundId, door);
        if (r.safe === false) {
          // Alarm — strobe every alarm door in the room, then settle the bust.
          const roomAlarms = r.alarmDoors[r.room] ?? [door];
          setDoorStates((states) =>
            states.map((_, i) =>
              roomAlarms.includes(i) ? { kind: 'alarm' } : { kind: 'dim' },
            ),
          );
          heistAudio.playBust();
          setVaultMid(`Caught in room ${r.room + 1}.`);
          const t = setTimeout(() => {
            setRound((prev) => (prev ? { ...prev, picks: r.picks } : prev));
            setResult({ won: false, full: false, payout: 0, multiplierX100: round.multiplierX100, serverSeed: r.serverSeed });
            setPhase('busted');
            settleHistory(roundId, betAmount, diff, r.room, round.multiplierX100, false, 0, r.alarmDoors, r.picks);
            setSession((prev) => [...prev, { drop: prev.length + 1, bet: betAmount, profit: -betAmount }]);
          }, ALARM_REVEAL_MS);
          timers.current.push(t);
        } else if (r.settled === true) {
          // Full clear — auto-settled win. Glow the final door, then banner.
          const prevPay = Math.floor((betAmount * (ladder[roomNow] ?? 100)) / 100);
          setDoorStates((states) =>
            states.map((_, i) =>
              i === door ? { kind: 'safe', gain: Math.max(0, r.payout - prevPay) } : { kind: 'dim' },
            ),
          );
          setRound((prev) =>
            prev ? { ...prev, room: r.room, picks: r.picks, multiplierX100: r.multiplierX100 } : prev,
          );
          try {
            setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
          } catch {
            /* keep last known */
          }
          setVaultMid('You emptied the whole vault.');
          setResult({ won: true, full: true, payout: r.payout, multiplierX100: r.multiplierX100, serverSeed: r.serverSeed });
          setPhase('cashed');
          winFx();
          reportWin({ game: 'Heist', bet: betAmount, payout: r.payout });
          settleHistory(roundId, betAmount, diff, r.room, r.multiplierX100, true, r.payout, r.alarmDoors, r.picks);
          setSession((prev) => [...prev, { drop: prev.length + 1, bet: betAmount, profit: r.payout - betAmount }]);
        } else {
          // Safe crack — glow the chosen door amber with the gained loot, dim the
          // rest, then advance into the next room with a fresh door grid.
          const prevPay = Math.floor((betAmount * (ladder[roomNow] ?? 100)) / 100);
          const newPay = Math.floor((betAmount * r.multiplierX100) / 100);
          setDoorStates((states) =>
            states.map((_, i) =>
              i === door ? { kind: 'safe', gain: Math.max(0, newPay - prevPay) } : { kind: 'dim' },
            ),
          );
          heistAudio.playSafe(r.room);
          const t = setTimeout(() => {
            setRound((prev) =>
              prev ? { ...prev, room: r.room, picks: r.picks, multiplierX100: r.multiplierX100 } : prev,
            );
            setDoorStates(Array.from({ length: round.doors }, () => ({ kind: 'idle' as const })));
            setVaultMid(
              `Room ${r.room + 1} — ${formatMultiplier(r.multiplierX100)} banked, push on?`,
            );
            setPhase('active');
          }, SAFE_REVEAL_MS);
          timers.current.push(t);
        }
      } catch (e) {
        setPhase('active');
        handleErr(e);
      }
    },
    [round, phase, settleHistory, winFx, handleErr, reportWin],
  );

  const doCashout = useCallback(async () => {
    if (!round || phase !== 'active' || round.room === 0) return;
    setPhase('busy');
    setError(null);
    const betAmount = round.bet;
    const roundId = round.roundId;
    const diff = round.difficulty;
    try {
      const r = await cashoutHeist(roundId);
      setRound((prev) =>
        prev ? { ...prev, room: r.room, picks: r.picks, multiplierX100: r.multiplierX100 } : prev,
      );
      try {
        setBalance(BigInt(r.chipBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
      setVaultMid(`Escaped with ${formatMultiplier(r.multiplierX100)}.`);
      setResult({ won: true, full: false, payout: r.payout, multiplierX100: r.multiplierX100, serverSeed: r.serverSeed });
      setPhase('cashed');
      winFx();
      reportWin({ game: 'Heist', bet: betAmount, payout: r.payout });
      settleHistory(roundId, betAmount, diff, r.room, r.multiplierX100, true, r.payout, r.alarmDoors, r.picks);
      setSession((prev) => [...prev, { drop: prev.length + 1, bet: betAmount, profit: r.payout - betAmount }]);
    } catch (e) {
      setPhase('active');
      handleErr(e);
    }
  }, [round, phase, settleHistory, winFx, handleErr, reportWin]);

  const playAgain = useCallback(() => {
    clearTimers();
    setReplaying(false);
    setPendingReplay(null);
    setRound(null);
    setResult(null);
    setDoorStates(Array.from({ length: doors }, () => ({ kind: 'idle' as const })));
    setVaultMid('Pick a job and break in');
    setError(null);
    setPhase('idle');
  }, [clearTimers, doors]);

  // ── Replay a past heist: stage the confirm overlay, then re-render the round's
  // final revealed vault (a bust strobes the caught room's alarm doors; an escape
  // rests on the vault with its banner) + the escape multiplier. Pure re-watch —
  // no server call, no balance / history / session / reportWin. A real new round
  // clears the replay view. ──
  const handleReplay = useCallback(
    (r: HeistHistoryRound) => {
      // Bail if a heist is live (only allow from a settled/idle board).
      if (!betting || replaying) return;
      heistAudio.init();
      setPendingReplay(r);
      boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    [betting, replaying],
  );

  const startReplay = useCallback(() => {
    const r = pendingReplay;
    if (!r) return;
    clearTimers();
    setPendingReplay(null);
    setError(null);
    setNoChips(false);
    setReplaying(true);
    heistAudio.init();
    const di = info?.difficulties[r.difficulty] ?? null;
    const doorsR = di?.doors ?? DEFAULT_DOORS[r.difficulty];
    const alarmsR = di?.alarms ?? 1;
    const roomsR = di?.rooms ?? DEFAULT_ROOMS[r.difficulty];
    const ladderR = di?.ladder ?? [];
    const full = r.won && r.room >= roomsR;
    // Display-only round so the HUD (multiplier / room / escape value) renders.
    setRound({
      roundId: r.roundId,
      bet: r.bet,
      difficulty: r.difficulty,
      room: r.room,
      picks: r.picks ?? [],
      multiplierX100: r.multiplierX100,
      serverSeedHash: '',
      rooms: roomsR,
      doors: doorsR,
      alarms: alarmsR,
      ladder: ladderR,
    });
    if (r.won) {
      setDoorStates(Array.from({ length: doorsR }, () => ({ kind: 'idle' as const })));
      setVaultMid(
        full ? 'You emptied the whole vault.' : `Escaped with ${formatMultiplier(r.multiplierX100)}.`,
      );
      heistAudio.playWin();
    } else {
      const roomAlarms = r.alarmDoors?.[r.room] ?? [];
      setDoorStates(
        Array.from({ length: doorsR }, (_, i) =>
          roomAlarms.includes(i) ? { kind: 'alarm' as const } : { kind: 'dim' as const },
        ),
      );
      setVaultMid(`Caught in room ${r.room + 1}.`);
      heistAudio.playBust();
    }
    setResult({ won: r.won, full, payout: r.payout, multiplierX100: r.multiplierX100, serverSeed: '' });
    setPhase(r.won ? 'cashed' : 'busted');
  }, [pendingReplay, info, clearTimers]);

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id);
    setFairnessOpen(true);
  }, []);

  const toggleMute = () => {
    heistAudio.init();
    heistAudio.setMute(!muted);
    setMuted(!muted);
  };

  const banner: { kind: 'win' | 'loss'; title: string; value: string } | null = result
    ? result.won
      ? {
          kind: 'win',
          title: result.full ? 'Vault cleared!' : 'Clean getaway',
          value: `+${(result.payout - (round?.bet ?? 0)).toLocaleString()} MORBIUS`,
        }
      : { kind: 'loss', title: 'Alarm tripped', value: `−${(round?.bet ?? 0).toLocaleString()} MORBIUS` }
    : null;

  // Doors are clickable only while the live room awaits a pick.
  const doorsClickable = phase === 'active';

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

          <div className="space-y-1.5">
            <span className="text-xs uppercase tracking-wide text-slate-500">Job</span>
            <div className="grid grid-cols-3 gap-2">
              {HEIST_DIFFICULTY_ORDER.map((d) => {
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
                      {HEIST_DIFFICULTY_LABELS[d]}
                    </span>
                    {di && (
                      <span className="arc-mono text-[10px] text-slate-500">
                        {di.doors}d · {di.alarms}a
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
                <span className="text-xs uppercase tracking-wide text-slate-500">Multiplier</span>
                <span className="arc-mono tabular-nums text-cyan-300">{formatMultiplier(multiplierX100)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-500">Room</span>
                <span className="arc-mono tabular-nums text-slate-300">{currentRoom} / {totalRooms}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-500">Escape with</span>
                <span className="arc-mono tabular-nums text-amber-300">
                  {currentRoom > 0 ? cashoutValue.toLocaleString() : '—'}
                </span>
              </div>
            </div>
          )}

          {/* Action buttons: pinned to a fixed bottom bar on mobile (break-in / escape
              always reachable without scrolling); back in the rail, in-flow, on desktop. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-950/70 bg-[#07131F]/95 p-3 backdrop-blur-sm lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          {betting ? (
            <Button
              type="button"
              disabled={!info}
              onClick={() => void startRound()}
              className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.85)] hover:bg-cyan-400 disabled:opacity-50"
            >
              Place bet &amp; break in
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!canCash}
              onClick={() => void doCashout()}
              className="arc-display h-12 w-full bg-amber-400 text-base font-bold uppercase tracking-widest text-[#1A1206] shadow-[0_0_24px_-6px_rgba(245,158,11,0.85)] hover:bg-amber-300 disabled:opacity-50"
            >
              {canCash ? `Escape with ${cashoutValue.toLocaleString()}` : 'Crack a vault first'}
            </Button>
          )}
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
            onClick={() => openVerify(round?.roundId ?? history[0]?.roundId ?? null)}
            className="w-full text-center text-xs text-slate-500 transition-colors hover:text-cyan-300"
          >
            Provably Fair{history.length > 0 || round ? ' · verify this round' : ''}
          </button>
        </Card>

        {/* ───────── Vault ───────── */}
        <div className="order-1 space-y-4 lg:order-2">
          <Card ref={boardRef} className="relative border-0 bg-[#07131F] p-3 ring-1 ring-inset ring-cyan-950/70 sm:p-4">
            {/* HUD */}
            <div className="mb-3 grid grid-cols-3 overflow-hidden rounded-lg ring-1 ring-cyan-950/70">
              <div className="bg-[#040C13]/85 px-3 py-2.5 text-center">
                <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">Multiplier</div>
                <div className={`arc-mono mt-0.5 text-lg font-bold tabular-nums ${currentRoom > 0 ? 'text-amber-300' : 'text-slate-400'}`}>
                  {formatMultiplier(multiplierX100)}
                </div>
              </div>
              <div className="bg-[#040C13]/85 px-3 py-2.5 text-center ring-1 ring-inset ring-cyan-950/40">
                <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">Room</div>
                <div className="arc-mono mt-0.5 text-lg font-bold tabular-nums text-cyan-300">
                  {currentRoom} / {totalRooms}
                </div>
              </div>
              <div className="bg-[#040C13]/85 px-3 py-2.5 text-center">
                <div className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">Escape with</div>
                <div className="arc-mono mt-0.5 text-lg font-bold tabular-nums text-white">
                  {round && currentRoom > 0 ? cashoutValue.toLocaleString() : '—'}
                </div>
              </div>
            </div>

            <HeistVault
              doors={doors}
              doorStates={doorStates}
              clickable={doorsClickable}
              loot={loot}
              vaultMid={vaultMid}
              banner={banner}
              onPick={(d) => void doPick(d)}
            />

            {result && (
              <div className="mt-3 text-center" aria-live="polite">
                <Button
                  type="button"
                  onClick={playAgain}
                  className="arc-display bg-cyan-500/15 text-sm font-bold uppercase tracking-widest text-cyan-300 ring-1 ring-cyan-500/40 hover:bg-cyan-500/25"
                >
                  Next job
                </Button>
              </div>
            )}

            {pendingReplay && (
              <ReplayConfirmOverlay
                title="Replay heist"
                headline={formatMultiplier(pendingReplay.multiplierX100)}
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

      {/* ───────── Session chart + info tabs ───────── */}
      <div className="mt-4 space-y-4">
        <HeistInfoTabs
          history={history}
          historyLoading={historyLoading}
          onVerify={(id) => openVerify(id)}
          onReplay={handleReplay}
          info={info}
        />
      </div>
      {/* Draggable mini session chart — open in a corner on mobile, full-size on desktop. */}
      <FloatingPanel title="Session" storageKey="heist.sessionChart.pos">
        <SessionChart
          gameName="Heist"
          points={session}
          unitLabel="Jobs"
          bare
          allTimeLoader={async () => {
            const rounds = await fetchHeistHistory(365);
            return [...rounds].reverse().map((r, i) => ({ drop: i + 1, bet: r.bet, profit: r.payout - r.bet }));
          }}
        />
      </FloatingPanel>

      <HeistFairnessModal
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
