'use client';

/**
 * MiniAppMines — MORBIUS Arcade: Mines (provably-fair 5×5 grid game).
 *
 * Wired to the stateful backend:
 *   GET  /api/arcade/mines/info             — bounds + per-bombs multiplier ladders
 *   POST /api/arcade/mines/start            — charge bet, seed bombs, get roundId
 *   POST /api/arcade/mines/pick             — reveal one cell (safe or bomb)
 *   POST /api/arcade/mines/cashout          — bank the current multiplier
 *   GET  /api/arcade/mines/verify/:roundId  — recover seeds + grid after the round
 *
 * The server owns *all* state — picks, multiplier, balance. The client just
 * pushes one cell index per tap and renders the response. After a bust, the
 * server returns the full bomb grid + revealed serverSeed so the UI can
 * animate the explosion and prove the grid wasn't moved mid-round.
 *
 * Animations (cell flip, gem pop, bomb shake, multiplier ramp, particle burst
 * on cashout) and synthesised sound are driven imperatively via refs — same
 * shape as MiniAppVideoPoker / MiniAppLimbo so the arcade feels coherent.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconBomb, IconDiamond } from '@tabler/icons-react';

// ---------------------------------------------------------------------------

interface MinesInfo {
  totalCells: number;
  minBet: number;
  maxBet: number;
  minBombs: number;
  maxBombs: number;
  houseEdgeBp: number;
  ladders: Record<number, number[]>;
}

type Phase =
  | 'loading'
  | 'load-error'
  | 'idle'
  | 'starting'
  | 'active'
  | 'picking'
  | 'cashing-out'
  | 'busted'
  | 'cashed-out';

type CellState = 'hidden' | 'safe' | 'bomb' | 'bomb-other';

interface MiniAppMinesProps {
  initData: string;
  initialChipBalance: string;
  onBack: () => void;
}

const MN_CSS = `
.mn-table{position:relative;border-radius:20px;overflow:hidden;
 background:radial-gradient(ellipse 80% 72% at 50% 28%,rgba(6,182,212,0.17),transparent 62%),linear-gradient(180deg,#0c1c30,#081320);
 border:1px solid rgba(6,182,212,0.30);box-shadow:inset 0 0 30px rgba(6,182,212,0.10);}
.mn-glass{background:#0b1a2c;border:1px solid rgba(34,211,238,0.14);}
.mn-fx{position:absolute;inset:0;pointer-events:none;z-index:7;}
.mn-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:6px;}
.mn-cell{position:relative;aspect-ratio:1/1;border-radius:11px;cursor:pointer;
 background:linear-gradient(160deg,#16324f,#0a1626);border:1px solid rgba(34,211,238,0.22);
 box-shadow:0 4px 10px -4px rgba(0,0,0,0.5),inset 0 0 0 1px rgba(255,255,255,0.04);
 transition:transform .12s ease,filter .12s ease;display:flex;align-items:center;justify-content:center;
 transform-style:preserve-3d;}
.mn-cell:not(:disabled):hover{filter:brightness(1.18);}
.mn-cell:not(:disabled):active{transform:scale(0.94);}
.mn-cell:disabled{cursor:default;}
.mn-cell::before{content:"";position:absolute;inset:0;border-radius:11px;
 background:radial-gradient(circle,rgba(34,211,238,0.18) 1px,transparent 1.6px) 0 0/9px 9px;opacity:0.5;}
.mn-cell.mn-revealed{cursor:default;border-color:rgba(34,211,238,0.45);
 background:linear-gradient(160deg,#062535,#04161f);animation:mnReveal .42s cubic-bezier(.34,1.5,.6,1);}
.mn-cell.mn-revealed::before{opacity:0;}
.mn-cell.mn-revealed.mn-bomb{border-color:rgba(239,68,68,0.6);
 background:linear-gradient(160deg,#3a0b14,#1a050a);animation:mnBomb .55s cubic-bezier(.36,.07,.19,.97);}
.mn-cell.mn-revealed.mn-bomb-other{border-color:rgba(239,68,68,0.35);
 background:linear-gradient(160deg,#1f0b14,#0d0709);opacity:0.78;}
.mn-cell.mn-pending{filter:brightness(0.7);cursor:wait;}
.mn-icon{position:relative;z-index:2;animation:mnPop .42s cubic-bezier(.34,1.55,.5,1);}
.mn-icon.mn-shake{animation:mnShake .5s cubic-bezier(.36,.07,.19,.97);}
@keyframes mnReveal{0%{transform:rotateY(180deg);}100%{transform:rotateY(0);}}
@keyframes mnBomb{0%,100%{transform:translate(0,0);}10%{transform:translate(-2px,1px) rotate(-2deg);}
 20%{transform:translate(3px,-1px) rotate(2deg);}30%{transform:translate(-3px,2px) rotate(-3deg);}
 40%{transform:translate(2px,-2px) rotate(2deg);}50%{transform:translate(-2px,1px) rotate(-1deg);}
 60%{transform:translate(2px,1px) rotate(2deg);}70%{transform:translate(-1px,-1px) rotate(-1deg);}
 80%{transform:translate(1px,1px) rotate(1deg);}90%{transform:translate(-1px,0) rotate(0);}}
@keyframes mnPop{0%{transform:scale(0.4);opacity:0;}55%{transform:scale(1.18);}100%{transform:scale(1);opacity:1;}}
@keyframes mnShake{0%,100%{transform:translate(0,0);}25%{transform:translate(-2px,1px) rotate(-4deg);}
 50%{transform:translate(2px,-1px) rotate(4deg);}75%{transform:translate(-1px,1px) rotate(-2deg);}}
.mn-screen{position:relative;border-radius:18px;padding:14px;text-align:center;overflow:hidden;
 background:radial-gradient(ellipse 75% 70% at 50% 45%,rgba(34,211,238,0.18),transparent 62%),#091627;
 border:1px solid rgba(34,211,238,0.22);box-shadow:inset 0 0 22px rgba(6,182,212,0.16);}
.mn-screen.mn-busted{border-color:rgba(239,68,68,0.45);box-shadow:inset 0 0 22px rgba(239,68,68,0.22);}
.mn-screen.mn-won{border-color:rgba(34,211,238,0.55);box-shadow:inset 0 0 32px rgba(34,211,238,0.32),0 0 22px rgba(34,211,238,0.35);}
.mn-multi{font-size:38px;font-weight:900;line-height:1;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;
 color:#eafbff;text-shadow:0 0 22px rgba(34,211,238,0.55);transition:color .2s,text-shadow .2s;}
.mn-multi.mn-won{color:#22d3ee;text-shadow:0 0 28px rgba(34,211,238,0.95);animation:lbPop .5s cubic-bezier(.34,1.5,.5,1);}
.mn-multi.mn-busted{color:#fca5a5;text-shadow:0 0 18px rgba(239,68,68,0.55);}
@keyframes lbPop{0%{transform:scale(0.86);}55%{transform:scale(1.12);}100%{transform:scale(1);}}
.mn-suffix{font-size:22px;font-weight:800;opacity:0.78;}
.mn-stp{width:32px;height:32px;border-radius:9px;border:1px solid rgba(6,182,212,0.30);background:rgba(34,211,238,0.06);
 color:#22d3ee;font-size:18px;cursor:pointer;}
.mn-stp:disabled{opacity:0.3;cursor:default;}
.mn-quick{padding:5px 10px;border-radius:8px;border:1px solid rgba(6,182,212,0.25);background:rgba(34,211,238,0.05);
 color:#9be8f4;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;font-variant-numeric:tabular-nums;}
.mn-quick:hover:not(:disabled){background:rgba(34,211,238,0.12);border-color:rgba(34,211,238,0.45);}
.mn-quick.mn-active{background:linear-gradient(135deg,#0891b2,#2563eb);border-color:transparent;color:#fff;
 box-shadow:0 4px 14px -4px rgba(6,182,212,0.55);}
.mn-quick:disabled{opacity:0.4;cursor:default;}
.mn-primary{width:100%;border:none;border-radius:13px;padding:13px;font-size:15px;font-weight:800;letter-spacing:0.04em;
 cursor:pointer;color:#ffffff;background:linear-gradient(135deg,#0891b2,#2563eb);
 box-shadow:0 8px 26px -8px rgba(6,182,212,0.55),0 0 0 1px rgba(34,211,238,0.20);
 transition:filter .15s,transform .1s;}
.mn-primary:not(:disabled):active{transform:scale(0.98);}
.mn-primary:disabled{opacity:0.45;cursor:default;box-shadow:none;}
.mn-cashout{background:linear-gradient(135deg,#15a35a,#0891b2);box-shadow:0 8px 26px -8px rgba(34,197,94,0.55),0 0 0 1px rgba(52,211,153,0.25);}
.mn-meta{display:flex;justify-content:space-between;padding:3px 0;font-size:11px;color:#94a3b8;}
.mn-meta .mn-mv{color:#eafbff;font-variant-numeric:tabular-nums;font-weight:700;}
`;

// ---------------------------------------------------------------------------

function formatMultX100(x100: number): { whole: string; suffix: string } {
  const v = x100 / 100;
  if (v >= 100_000) {
    return { whole: `${Math.floor(v / 1000).toLocaleString('en-US')}k`, suffix: 'x' };
  }
  return { whole: v.toFixed(2), suffix: 'x' };
}

// Quick-pick bomb counts — covers the canonical Stake-style picks (1, 3, 5,
// 10, 24). All within the server-side bounds (1..24).
const QUICK_BOMBS = [1, 3, 5, 10, 24] as const;

const TOTAL_CELLS = 25;

// ---------------------------------------------------------------------------

export default function MiniAppMines({
  initData,
  initialChipBalance,
  onBack,
}: MiniAppMinesProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<MinesInfo | null>(null);
  const [chips, setChips] = useState<number>(() => {
    const n = Number(initialChipBalance);
    return Number.isFinite(n) ? n : 0;
  });
  const [bet, setBet] = useState(100);
  const [bombsCount, setBombsCount] = useState(3);

  // Active-round state — set by /start, updated by /pick, cleared on finalize.
  const [roundId, setRoundId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<CellState[]>(() =>
    new Array<CellState>(TOTAL_CELLS).fill('hidden'),
  );
  const [multiplierX100, setMultiplierX100] = useState(100);
  const [pendingCell, setPendingCell] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [muted, setMuted] = useState(false);

  const fxRef = useRef<HTMLCanvasElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; master: GainNode } | null>(null);
  const mutedRef = useRef(false);

  const after = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);

  // --- sound -----------------------------------------------------------------

  const ensureAudio = useCallback(() => {
    if (audioRef.current) {
      if (audioRef.current.ctx.state === 'suspended') void audioRef.current.ctx.resume();
      return;
    }
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = mutedRef.current ? 0 : 0.5;
      master.connect(ctx.destination);
      audioRef.current = { ctx, master };
    } catch {
      /* sound is best-effort */
    }
  }, []);

  const snd = useCallback((kind: string) => {
    const a = audioRef.current;
    if (!a) return;
    const { ctx, master } = a;
    const t0 = ctx.currentTime;
    const tone = (f: number, at: number, dur: number, type: OscillatorType, vol: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(vol, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g);
      g.connect(master);
      o.start(at);
      o.stop(at + dur + 0.03);
    };
    const noise = (at: number, dur: number, vol: number, cut: number) => {
      const n = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cut;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(at);
      src.stop(at + dur + 0.03);
    };
    if (kind === 'safe') {
      // Cyan ping — rises a half step per pick later via the picksHits scale.
      tone(660, t0, 0.07, 'triangle', 0.13);
      tone(990, t0 + 0.02, 0.06, 'triangle', 0.08);
    } else if (kind === 'bomb') {
      noise(t0, 0.5, 0.32, 600);
      tone(110, t0, 0.4, 'sawtooth', 0.18);
      tone(70, t0, 0.5, 'sine', 0.16);
    } else if (kind === 'cashout') {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t0 + i * 0.08, 0.32, 'triangle', 0.16));
    } else if (kind === 'bigwin') {
      [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) =>
        tone(f, t0 + i * 0.085, 0.4, 'triangle', 0.18),
      );
      noise(t0, 0.45, 0.1, 5000);
    } else if (kind === 'pick') {
      tone(620, t0, 0.06, 'triangle', 0.08);
    }
  }, []);

  // --- particles -------------------------------------------------------------

  const burst = useCallback((count: number) => {
    const cv = fxRef.current;
    const table = tableRef.current;
    if (!cv || !table) return;
    cv.width = table.clientWidth;
    cv.height = table.clientHeight;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    type P = { x: number; y: number; vx: number; vy: number; r: number; life: number; rot: number; vr: number; c: string };
    const parts: P[] = [];
    const cx = cv.width / 2;
    const cy = cv.height * 0.18;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 7;
      parts.push({
        x: cx + (Math.random() - 0.5) * 130,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 3,
        r: 3 + Math.random() * 4,
        life: 1,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 0.4,
        c: Math.random() < 0.5 ? '#22d3ee' : '#a5f3fc',
      });
    }
    const step = () => {
      if (!cv.isConnected) {
        rafRef.current = null;
        return;
      }
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]!;
        p.vy += 0.22;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.99;
        p.rot += p.vr;
        p.life -= 0.012;
        if (p.life <= 0 || p.y > cv.height + 30) {
          parts.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r, p.r * 0.62, 0, 0, 7);
        ctx.fill();
        ctx.restore();
      }
      if (parts.length) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        ctx.clearRect(0, 0, cv.width, cv.height);
        rafRef.current = null;
      }
    };
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(step);
  }, []);

  // --- load info -------------------------------------------------------------

  const loadInfo = useCallback(async () => {
    setPhase('loading');
    try {
      const res = await fetch('/api/arcade/mines/info');
      const data = (await res.json()) as MinesInfo & { ok?: boolean };
      if (!res.ok || !data?.ok) {
        setPhase('load-error');
        return;
      }
      setInfo(data);
      setBet((b) => Math.min(data.maxBet, Math.max(data.minBet, b)));
      setBombsCount((c) => Math.min(data.maxBombs, Math.max(data.minBombs, c)));
      setPhase('idle');
    } catch {
      setPhase('load-error');
    }
  }, []);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  // Clean up timers + audio on unmount. The particle loop self-terminates once
  // its canvas leaves the DOM.
  useEffect(() => {
    const timersList = timers.current;
    return () => {
      timersList.forEach((id) => window.clearTimeout(id));
      audioRef.current?.ctx.close().catch(() => {});
    };
  }, []);

  // --- start round ----------------------------------------------------------

  const onStart = useCallback(async () => {
    if (!info || phase === 'starting' || phase === 'active' || phase === 'picking') return;
    if (chips < bet) return;
    ensureAudio();
    setErrorMsg('');
    setPhase('starting');
    try {
      const res = await fetch('/api/arcade/mines/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, bet, bombs: bombsCount }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        roundId?: string;
        chipBalance?: string;
        error?: string;
      };
      if (!res.ok || !data?.ok || !data.roundId) {
        setErrorMsg(data?.error || 'Could not start the round.');
        setPhase('idle');
        return;
      }
      setRoundId(data.roundId);
      setRevealed(new Array<CellState>(TOTAL_CELLS).fill('hidden'));
      setMultiplierX100(100);
      if (data.chipBalance != null) setChips(Number(data.chipBalance));
      setPhase('active');
    } catch {
      setErrorMsg('Could not reach the table. Try again.');
      setPhase('idle');
    }
  }, [info, phase, chips, bet, bombsCount, initData, ensureAudio]);

  // --- pick a cell ----------------------------------------------------------

  const onPick = useCallback(
    async (cell: number) => {
      if (phase !== 'active' || !roundId) return;
      if (revealed[cell] !== 'hidden') return;
      ensureAudio();
      setErrorMsg('');
      setPendingCell(cell);
      setPhase('picking');
      try {
        const res = await fetch('/api/arcade/mines/pick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData, roundId, cell }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          safe?: boolean;
          cell?: number;
          multiplierX100?: number;
          bombs?: number[];
          status?: string;
          error?: string;
        };
        setPendingCell(null);
        if (!res.ok || !data?.ok) {
          setErrorMsg(data?.error || 'Could not reveal the cell.');
          setPhase('active');
          return;
        }
        if (data.safe === true) {
          setRevealed((prev) => {
            const next = prev.slice();
            next[cell] = 'safe';
            return next;
          });
          if (typeof data.multiplierX100 === 'number') setMultiplierX100(data.multiplierX100);
          snd('safe');
          setPhase('active');
          return;
        }
        // Bust — reveal the bomb the player hit AND the other bombs (dimmer).
        const bombs = Array.isArray(data.bombs) ? data.bombs : [];
        setRevealed((prev) => {
          const next = prev.slice();
          next[cell] = 'bomb';
          for (const b of bombs) if (b !== cell && next[b] === 'hidden') next[b] = 'bomb-other';
          return next;
        });
        snd('bomb');
        setPhase('busted');
      } catch {
        setPendingCell(null);
        setErrorMsg('Could not reach the table. Try again.');
        setPhase('active');
      }
    },
    [phase, roundId, revealed, initData, ensureAudio, snd],
  );

  // --- cashout --------------------------------------------------------------

  const onCashout = useCallback(async () => {
    if (phase !== 'active' || !roundId) return;
    const safePicks = revealed.filter((c) => c === 'safe').length;
    if (safePicks === 0) return;
    ensureAudio();
    setErrorMsg('');
    setPhase('cashing-out');
    try {
      const res = await fetch('/api/arcade/mines/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, roundId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        multiplierX100?: number;
        payout?: number;
        bombs?: number[];
        chipBalance?: string;
        error?: string;
      };
      if (!res.ok || !data?.ok) {
        setErrorMsg(data?.error || 'Could not cash out.');
        setPhase('active');
        return;
      }
      // Reveal the bombs we *didn't* hit (dim red) so the player can see the
      // grid we were navigating. Doesn't change the payout — round is settled.
      const bombs = Array.isArray(data.bombs) ? data.bombs : [];
      setRevealed((prev) => {
        const next = prev.slice();
        for (const b of bombs) if (next[b] === 'hidden') next[b] = 'bomb-other';
        return next;
      });
      if (typeof data.multiplierX100 === 'number') setMultiplierX100(data.multiplierX100);
      if (data.chipBalance != null) setChips(Number(data.chipBalance));
      const big = typeof data.payout === 'number' && data.payout >= bet * 5;
      snd(big ? 'bigwin' : 'cashout');
      burst(big ? 70 : 38);
      setPhase('cashed-out');
    } catch {
      setErrorMsg('Could not reach the table. Try again.');
      setPhase('active');
    }
  }, [phase, roundId, revealed, initData, ensureAudio, snd, burst, bet]);

  // --- reset round (after finalize) -----------------------------------------

  const onReset = useCallback(() => {
    setRoundId(null);
    setRevealed(new Array<CellState>(TOTAL_CELLS).fill('hidden'));
    setMultiplierX100(100);
    setPendingCell(null);
    setErrorMsg('');
    setPhase('idle');
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      if (audioRef.current) audioRef.current.master.gain.value = next ? 0 : 0.5;
      return next;
    });
  }, []);

  // --- derived render values -------------------------------------------------

  const safePicks = revealed.filter((c) => c === 'safe').length;
  const ladder = info?.ladders[bombsCount] ?? [];
  const nextMultX100 =
    ladder.length > safePicks + 1 ? ladder[safePicks + 1] : ladder[ladder.length - 1] ?? 100;
  const cashoutPayout = Math.floor((bet * multiplierX100) / 100);
  const profitIfCashout = cashoutPayout - bet;

  const inRound = phase === 'active' || phase === 'picking' || phase === 'cashing-out';
  const finalized = phase === 'busted' || phase === 'cashed-out';
  const canBet = phase === 'idle' || finalized;

  const screenState =
    phase === 'busted' ? 'mn-busted' : phase === 'cashed-out' ? 'mn-won' : '';
  const multState = phase === 'busted' ? 'mn-busted' : phase === 'cashed-out' ? 'mn-won' : '';
  const m = formatMultX100(multiplierX100);

  return (
    <div>
      <style>{MN_CSS}</style>

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to hub"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/5 text-cyan-400"
        >
          <IconArrowLeft size={18} aria-hidden />
        </button>
        <h1 className="mitr-bold text-xl text-white">MORBIUS Arcade</h1>
      </div>

      {phase === 'loading' && (
        <p className="mt-10 text-center text-sm text-slate-500">Loading the table…</p>
      )}

      {phase === 'load-error' && (
        <div className="mt-8 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-center">
          <p className="text-sm text-red-200/90">Could not load the game.</p>
          <button
            type="button"
            onClick={() => void loadInfo()}
            className="mt-3 rounded-lg border border-cyan-500/30 px-4 py-2 text-sm text-cyan-400"
          >
            Try again
          </button>
        </div>
      )}

      {info && phase !== 'loading' && phase !== 'load-error' && (
        <div ref={tableRef} className="mn-table p-3.5">
          <canvas ref={fxRef} className="mn-fx" />

          <div className="relative z-[2]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="mitr-bold text-lg leading-none text-white">Mines</div>
                <div className="mt-1 text-[9px] tracking-[0.28em] text-cyan-400">
                  REVEAL GEMS · DODGE BOMBS
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="rounded-lg border border-cyan-500/25 bg-[#081320]/70 px-2 py-1 text-[10px] font-bold text-cyan-400"
                >
                  {muted ? '♪ off' : '♪ on'}
                </button>
                <div className="flex items-center gap-1.5 rounded-full border border-cyan-500/25 bg-[#081320]/70 px-2.5 py-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-400" />
                  <span className="text-[13px] font-extrabold tabular-nums text-white">
                    {Math.round(chips).toLocaleString('en-US')}
                  </span>
                </div>
              </div>
            </div>

            {/* The multiplier readout — also doubles as the win/bust banner. */}
            <div className={`mn-screen ${screenState}`}>
              <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-cyan-400">
                {phase === 'busted'
                  ? 'Busted'
                  : phase === 'cashed-out'
                    ? 'Banked'
                    : inRound
                      ? safePicks > 0
                        ? 'Current'
                        : 'Round live'
                      : 'Multiplier'}
              </div>
              <div className={`mn-multi mt-1 ${multState}`}>
                {m.whole}
                <span className="mn-suffix">{m.suffix}</span>
              </div>
              {phase === 'cashed-out' && (
                <div className="mt-1.5 text-xs font-semibold text-cyan-200">
                  +{profitIfCashout.toLocaleString('en-US')} chips
                </div>
              )}
              {phase === 'busted' && (
                <div className="mt-1.5 text-xs font-semibold text-red-300">
                  −{bet.toLocaleString('en-US')} chips
                </div>
              )}
              {inRound && safePicks > 0 && (
                <div className="mt-1.5 text-[11px] text-slate-300">
                  Bank{' '}
                  <span className="font-bold text-cyan-300 tabular-nums">
                    {cashoutPayout.toLocaleString('en-US')}
                  </span>{' '}
                  · next pick →{' '}
                  <span className="font-bold text-white tabular-nums">
                    {formatMultX100(nextMultX100).whole}x
                  </span>
                </div>
              )}
              {inRound && safePicks === 0 && (
                <div className="mt-1.5 text-[11px] text-slate-300">
                  First safe tile pays{' '}
                  <span className="font-bold text-white tabular-nums">
                    {formatMultX100(nextMultX100).whole}x
                  </span>
                </div>
              )}
            </div>

            {/* 5×5 grid. Cells are disabled when not in an active picking phase. */}
            <div className="mn-grid mt-3">
              {Array.from({ length: TOTAL_CELLS }, (_, i) => {
                const state = revealed[i];
                const isHidden = state === 'hidden';
                const isPending = pendingCell === i;
                const cellClass =
                  `mn-cell` +
                  (state !== 'hidden' ? ' mn-revealed' : '') +
                  (state === 'bomb' ? ' mn-bomb' : '') +
                  (state === 'bomb-other' ? ' mn-bomb-other' : '') +
                  (isPending ? ' mn-pending' : '');
                const disabled = !(phase === 'active' && isHidden);
                return (
                  <button
                    key={i}
                    type="button"
                    className={cellClass}
                    disabled={disabled}
                    onClick={() => {
                      if (!disabled) void onPick(i);
                    }}
                    aria-label={`Cell ${i + 1}`}
                  >
                    {state === 'safe' && (
                      <IconDiamond
                        size={22}
                        className="mn-icon text-cyan-300"
                        aria-hidden
                      />
                    )}
                    {state === 'bomb' && (
                      <IconBomb
                        size={22}
                        className="mn-icon mn-shake text-red-400"
                        aria-hidden
                      />
                    )}
                    {state === 'bomb-other' && (
                      <IconBomb size={18} className="text-red-400/60" aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Round controls — bet + bombs picker OR cashout + new-round. */}
            <div className="mt-3">
              {phase === 'idle' || phase === 'starting' ? (
                <>
                  <div className="mn-glass mt-1 rounded-xl p-2.5">
                    <div className="mn-meta">
                      <span>House edge</span>
                      <span className="mn-mv">{(info.houseEdgeBp / 100).toFixed(2)}%</span>
                    </div>
                    <div className="mn-meta">
                      <span>Max multiplier</span>
                      <span className="mn-mv">
                        {formatMultX100(ladder[ladder.length - 1] ?? 100).whole}x
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 mb-2.5 flex items-center gap-2.5">
                    <span className="flex-1 text-[11px] text-slate-500">Bombs</span>
                    <button
                      type="button"
                      className="mn-stp"
                      onClick={() => {
                        snd('pick');
                        setBombsCount((c) =>
                          Math.max(info.minBombs, Math.min(info.maxBombs, c - 1)),
                        );
                      }}
                      aria-label="Fewer bombs"
                    >
                      &minus;
                    </button>
                    <span className="min-w-[44px] text-center text-[15px] font-extrabold tabular-nums text-cyan-400">
                      {bombsCount}
                    </span>
                    <button
                      type="button"
                      className="mn-stp"
                      onClick={() => {
                        snd('pick');
                        setBombsCount((c) =>
                          Math.max(info.minBombs, Math.min(info.maxBombs, c + 1)),
                        );
                      }}
                      aria-label="More bombs"
                    >
                      +
                    </button>
                  </div>

                  <div className="mb-3 flex flex-wrap justify-center gap-1.5">
                    {QUICK_BOMBS.map((qb) => (
                      <button
                        key={qb}
                        type="button"
                        className={`mn-quick${bombsCount === qb ? ' mn-active' : ''}`}
                        onClick={() => {
                          snd('pick');
                          setBombsCount(qb);
                        }}
                      >
                        {qb}
                      </button>
                    ))}
                  </div>

                  <div className="mb-2.5 flex items-center gap-2.5">
                    <span className="flex-1 text-[11px] text-slate-500">Bet</span>
                    <button
                      type="button"
                      className="mn-stp"
                      disabled={!canBet}
                      onClick={() => setBet((b) => Math.max(info.minBet, b - 50))}
                      aria-label="Lower bet"
                    >
                      &minus;
                    </button>
                    <span className="min-w-[58px] text-center text-[15px] font-extrabold tabular-nums text-cyan-400">
                      {bet.toLocaleString('en-US')}
                    </span>
                    <button
                      type="button"
                      className="mn-stp"
                      disabled={!canBet}
                      onClick={() => setBet((b) => Math.min(info.maxBet, b + 50))}
                      aria-label="Raise bet"
                    >
                      +
                    </button>
                  </div>

                  <div className="mb-3 min-h-[17px] text-center text-xs text-slate-400">
                    {errorMsg
                      ? errorMsg
                      : chips < bet
                        ? 'Not enough chips for that bet.'
                        : `${bombsCount} bomb${bombsCount === 1 ? '' : 's'} in ${TOTAL_CELLS} cells — tap to start.`}
                  </div>

                  <button
                    type="button"
                    className="mn-primary"
                    disabled={chips < bet || phase === 'starting' || !info}
                    onClick={() => void onStart()}
                  >
                    {phase === 'starting' ? 'Starting…' : 'Place bet'}
                  </button>
                </>
              ) : inRound ? (
                <>
                  <div className="mb-2.5 min-h-[17px] text-center text-xs text-slate-400">
                    {errorMsg
                      ? errorMsg
                      : safePicks === 0
                        ? 'Tap any cell to reveal it.'
                        : `Cash out for ${cashoutPayout.toLocaleString('en-US')} or keep going.`}
                  </div>
                  <button
                    type="button"
                    className="mn-primary mn-cashout"
                    disabled={safePicks === 0 || phase !== 'active'}
                    onClick={() => void onCashout()}
                  >
                    {phase === 'cashing-out'
                      ? 'Cashing out…'
                      : safePicks === 0
                        ? 'Reveal a cell first'
                        : `Cash out ${cashoutPayout.toLocaleString('en-US')}`}
                  </button>
                </>
              ) : (
                /* Finalized — show the recap and a "play again" button. */
                <>
                  <div className="mb-2.5 min-h-[17px] text-center text-xs text-slate-400">
                    {phase === 'cashed-out'
                      ? `Banked ${cashoutPayout.toLocaleString('en-US')} chips at ${formatMultX100(multiplierX100).whole}x.`
                      : `Bomb on cell ${(revealed.findIndex((c) => c === 'bomb') + 1)}. Better luck next round.`}
                  </div>
                  <button type="button" className="mn-primary" onClick={onReset}>
                    Play again
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="mt-3 text-center text-[11px] text-slate-600">
        {finalized && roundId ? (
          <>
            Provably fair ·{' '}
            <a
              href={`/tg/verify/mines/${roundId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 underline-offset-2 hover:underline"
            >
              verify this round ↗
            </a>
          </>
        ) : (
          <>Provably fair · every round verifiable at /tg/verify/mines/[roundId]</>
        )}
      </p>
    </div>
  );
}
