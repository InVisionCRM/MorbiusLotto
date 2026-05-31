'use client';

/**
 * MiniAppCrash — MORBIUS Arcade: Crash (provably-fair multiplier crash game).
 *
 * The player sets a bet and an auto-cashout target. The server rolls a crash
 * point from the HMAC stream:
 *   crashX100 = max(100, floor((1 - houseEdge) / r × 100))
 *
 * If crashX100 >= autoCashoutX100 → player wins at the target.
 * Otherwise the rocket crashes before the target → bust.
 *
 * Animation: the multiplier counter climbs with exponential acceleration then
 * either stops at the cashout (win) or the counter turns red and slams to the
 * crash point (bust). A small graph line traces the same curve. Style matches
 * the rest of the MORBIUS Arcade (MiniAppLimbo / MiniAppDice conventions).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconRocket } from '@tabler/icons-react';

// ---------------------------------------------------------------------------

interface CrashInfo {
  minBet: number;
  maxBet: number;
  minCashoutX100: number;
  maxCashoutX100: number;
  houseEdgeBp: number;
}

type Phase = 'loading' | 'load-error' | 'idle' | 'flying' | 'resolved';

interface MiniAppCrashProps {
  initData: string;
  initialChipBalance: string;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// CSS — same design language as Limbo / Dice
// ---------------------------------------------------------------------------
const CR_CSS = `
.cr-table{position:relative;border-radius:20px;overflow:hidden;
 background:radial-gradient(ellipse 80% 72% at 50% 28%,rgba(6,182,212,0.14),transparent 62%),linear-gradient(180deg,#0c1c30,#081320);
 border:1px solid rgba(6,182,212,0.30);box-shadow:inset 0 0 30px rgba(6,182,212,0.10);}
.cr-glass{background:#0b1a2c;border:1px solid rgba(34,211,238,0.14);}
.cr-fx{position:absolute;inset:0;pointer-events:none;z-index:7;}
.cr-screen{position:relative;border-radius:18px;padding:20px 14px 18px;text-align:center;overflow:hidden;
 background:radial-gradient(ellipse 75% 70% at 50% 45%,rgba(34,211,238,0.14),transparent 62%),#091627;
 border:1px solid rgba(34,211,238,0.22);box-shadow:inset 0 0 22px rgba(6,182,212,0.12);}
.cr-screen.cr-win{border-color:rgba(34,211,238,0.55);box-shadow:inset 0 0 32px rgba(34,211,238,0.28),0 0 22px rgba(34,211,238,0.32);}
.cr-screen.cr-bust{border-color:rgba(239,68,68,0.40);box-shadow:inset 0 0 28px rgba(239,68,68,0.18);}
.cr-screen.cr-flying{border-color:rgba(34,211,238,0.45);}
.cr-grid{position:absolute;inset:0;opacity:0.16;pointer-events:none;
 background-image:linear-gradient(rgba(34,211,238,0.18) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,0.18) 1px,transparent 1px);
 background-size:24px 24px;}
.cr-label{position:relative;font-size:10px;font-weight:800;letter-spacing:0.26em;color:#22d3ee;text-transform:uppercase;}
.cr-multi{position:relative;margin-top:4px;font-size:58px;font-weight:900;line-height:1;letter-spacing:-0.02em;
 font-variant-numeric:tabular-nums;color:#eafbff;text-shadow:0 0 22px rgba(34,211,238,0.50);transition:color .2s,text-shadow .2s;}
.cr-multi.cr-win{color:#22d3ee;text-shadow:0 0 28px rgba(34,211,238,0.95),0 0 8px rgba(255,255,255,0.6);animation:crPop .5s cubic-bezier(.34,1.56,.5,1);}
.cr-multi.cr-bust{color:#fca5a5;text-shadow:0 0 20px rgba(239,68,68,0.55);animation:crShake .35s ease;}
@keyframes crPop{0%{transform:scale(0.82);}55%{transform:scale(1.13);}100%{transform:scale(1);}}
@keyframes crShake{0%{transform:translateX(0);}20%{transform:translateX(-6px);}40%{transform:translateX(6px);}60%{transform:translateX(-4px);}80%{transform:translateX(4px);}100%{transform:translateX(0);}}
.cr-suffix{font-size:30px;font-weight:800;color:inherit;margin-left:2px;opacity:0.80;}
.cr-tag{position:relative;margin-top:8px;display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;
 border:1px solid rgba(34,211,238,0.35);background:rgba(34,211,238,0.10);font-size:10px;font-weight:800;letter-spacing:0.16em;color:#22d3ee;text-transform:uppercase;}
.cr-tag.cr-tag-win{border-color:rgba(34,211,238,0.65);background:linear-gradient(135deg,rgba(34,211,238,0.28),rgba(6,182,212,0.32));color:#04222a;}
.cr-tag.cr-tag-bust{border-color:rgba(239,68,68,0.45);background:rgba(239,68,68,0.15);color:#fca5a5;}
/* Graph canvas */
.cr-graph{display:block;width:100%;height:72px;border-radius:10px;margin-top:10px;background:rgba(0,0,0,0.20);}
/* Stepper buttons */
.cr-stp{width:32px;height:32px;border-radius:9px;border:1px solid rgba(6,182,212,0.30);background:rgba(34,211,238,0.06);
 color:#22d3ee;font-size:18px;cursor:pointer;}
.cr-stp:disabled{opacity:0.3;cursor:default;}
/* Quick-pick cashout chips */
.cr-quick{padding:5px 10px;border-radius:8px;border:1px solid rgba(6,182,212,0.25);background:rgba(34,211,238,0.05);
 color:#9be8f4;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;font-variant-numeric:tabular-nums;}
.cr-quick:hover:not(:disabled){background:rgba(34,211,238,0.12);border-color:rgba(34,211,238,0.45);}
.cr-quick.cr-active{background:linear-gradient(135deg,#0891b2,#2563eb);border-color:transparent;color:#fff;
 box-shadow:0 4px 14px -4px rgba(6,182,212,0.55);}
.cr-quick:disabled{opacity:0.4;cursor:default;}
/* Launch button */
.cr-launch{width:100%;border:none;border-radius:13px;padding:14px;font-size:16px;font-weight:800;letter-spacing:0.04em;
 cursor:pointer;color:#ffffff;background:linear-gradient(135deg,#0891b2,#2563eb);
 box-shadow:0 8px 26px -8px rgba(6,182,212,0.55),0 0 0 1px rgba(34,211,238,0.20);
 transition:filter .15s,transform .1s;}
.cr-launch:not(:disabled):active{transform:scale(0.98);}
.cr-launch:disabled{opacity:0.45;cursor:default;box-shadow:none;}
.cr-meta{display:flex;justify-content:space-between;padding:3px 0;font-size:11px;color:#94a3b8;}
.cr-meta .cr-mv{color:#eafbff;font-variant-numeric:tabular-nums;font-weight:700;}
`;

// ---------------------------------------------------------------------------

function formatMultiplier(x100: number): { whole: string; suffix: string } {
  const v = x100 / 100;
  if (v >= 100_000) {
    return { whole: `${Math.floor(v / 1000).toLocaleString('en-US')}k`, suffix: 'x' };
  }
  return { whole: v.toFixed(2), suffix: 'x' };
}

const QUICK_CASHOUTS_X100 = [150, 200, 300, 500, 1000] as const;

// ---------------------------------------------------------------------------

export default function MiniAppCrash({
  initData,
  initialChipBalance,
  onBack,
}: MiniAppCrashProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<CrashInfo | null>(null);
  const [chips, setChips] = useState<number>(() => {
    const n = Number(initialChipBalance);
    return Number.isFinite(n) ? n : 0;
  });
  const [bet, setBet] = useState(100);
  const [autoCashoutX100, setAutoCashoutX100] = useState(200);
  // The multiplier shown on screen during flight and after resolving.
  const [displayX100, setDisplayX100] = useState(100);
  const [outcomeWon, setOutcomeWon] = useState<boolean | null>(null);
  const [outcomeCrashX100, setOutcomeCrashX100] = useState<number | null>(null);
  const [outcomeCashoutX100, setOutcomeCashoutX100] = useState<number | null>(null);
  const [lastRoundId, setLastRoundId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [muted, setMuted] = useState(false);

  const fxRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef<HTMLCanvasElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const flyRafRef = useRef<number | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; master: GainNode } | null>(null);
  const mutedRef = useRef(false);

  const after = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);

  // --- audio -----------------------------------------------------------------

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
      /* best-effort */
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
    if (kind === 'tick') {
      tone(660 + displayX100 * 0.04, t0, 0.035, 'square', 0.025);
    } else if (kind === 'win') {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t0 + i * 0.1, 0.34, 'triangle', 0.16));
    } else if (kind === 'bigwin') {
      [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) =>
        tone(f, t0 + i * 0.09, 0.42, 'triangle', 0.19),
      );
      noise(t0, 0.5, 0.10, 5000);
    } else if (kind === 'bust') {
      noise(t0, 0.06, 0.25, 2200);
      tone(200, t0 + 0.06, 0.22, 'sine', 0.12);
      tone(140, t0 + 0.15, 0.28, 'sine', 0.08);
    } else if (kind === 'pick') {
      tone(620, t0, 0.06, 'triangle', 0.07);
    }
  }, [displayX100]);

  // --- particles (win burst) -------------------------------------------------

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
    const cy = cv.height * 0.38;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 8;
      parts.push({
        x: cx + (Math.random() - 0.5) * 120,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 3.5,
        r: 3 + Math.random() * 4,
        life: 1,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 0.4,
        c: ['#22d3ee', '#a5f3fc', '#fde68a', '#6ee7b7'][Math.floor(Math.random() * 4)] ?? '#22d3ee',
      });
    }
    const step = () => {
      if (!cv.isConnected) { rafRef.current = null; return; }
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]!;
        p.vy += 0.22; p.x += p.vx; p.y += p.vy; p.vx *= 0.99;
        p.rot += p.vr; p.life -= 0.012;
        if (p.life <= 0 || p.y > cv.height + 30) { parts.splice(i, 1); continue; }
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, 7); ctx.fill();
        ctx.restore();
      }
      if (parts.length) rafRef.current = requestAnimationFrame(step);
      else { ctx.clearRect(0, 0, cv.width, cv.height); rafRef.current = null; }
    };
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(step);
  }, []);

  // --- graph -----------------------------------------------------------------
  // Draws the canonical crash curve: y ∝ 1/r up to stopX100, then flat (win)
  // or drops to zero (bust). Points are generated in normalized time [0,1].

  const drawGraph = useCallback(
    (currentX100: number, finalX100: number | null, won: boolean | null) => {
      const cv = graphRef.current;
      if (!cv) return;
      const W = cv.clientWidth || 280;
      const H = cv.clientHeight || 72;
      cv.width = W;
      cv.height = H;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);

      const PAD_L = 4;
      const PAD_R = 8;
      const PAD_T = 8;
      const PAD_B = 4;
      const w = W - PAD_L - PAD_R;
      const h = H - PAD_T - PAD_B;

      // Build curve points (x in display space, multiplier in x100)
      const stopX100 = finalX100 ?? currentX100;
      const steps = 60;
      // The curve represents multiplier growth: value(t) = 1.00 + (stopX100/100 - 1) * t^1.7
      // This gives a rising curve that mimics exponential growth visually.
      const pts: [number, number][] = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const mult = 100 + Math.round((stopX100 - 100) * Math.pow(t, 1.7));
        const px = PAD_L + (w * i) / steps;
        // Normalize mult to canvas height: 1× at bottom, stopX100 at top.
        const normalised = stopX100 > 100 ? (mult - 100) / (stopX100 - 100) : 0;
        const py = PAD_T + h * (1 - normalised);
        pts.push([px, py]);
      }

      // Gradient fill under the curve
      const grad = ctx.createLinearGradient(0, PAD_T, 0, H);
      const lineColor = won === false ? '#ef4444' : '#22d3ee';
      grad.addColorStop(0, won === false ? 'rgba(239,68,68,0.30)' : 'rgba(34,211,238,0.28)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      if (pts[0]) ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        if (pts[i]) ctx.lineTo(pts[i]![0], pts[i]![1]);
      }
      // Close to bottom for fill
      ctx.lineTo(PAD_L + w, H);
      ctx.lineTo(PAD_L, H);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Main curve line
      ctx.beginPath();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (pts[0]) ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        if (pts[i]) ctx.lineTo(pts[i]![0], pts[i]![1]);
      }
      ctx.stroke();

      // Dot at the current tip
      const tip = pts[pts.length - 1];
      if (tip) {
        ctx.beginPath();
        ctx.arc(tip[0], tip[1], 4.5, 0, Math.PI * 2);
        ctx.fillStyle = lineColor;
        ctx.shadowBlur = 8;
        ctx.shadowColor = lineColor;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Bust crash line (vertical drop)
      if (won === false && tip) {
        ctx.beginPath();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = 'rgba(239,68,68,0.55)';
        ctx.lineWidth = 1.6;
        ctx.moveTo(tip[0], tip[1]);
        ctx.lineTo(tip[0], H - PAD_B);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    },
    [],
  );

  // --- flight animation ------------------------------------------------------
  // Animates the counter climbing from 1.00× to finalX100.
  // Uses an exponential ease so it feels like real acceleration.

  const animateFlight = useCallback(
    (finalX100: number, durationMs: number, onDone: () => void) => {
      if (flyRafRef.current != null) cancelAnimationFrame(flyRafRef.current);
      const startT = performance.now();
      let lastTick = 0;
      const tick = (now: number) => {
        const t = Math.min(1, (now - startT) / durationMs);
        // Ease-in-out: slow start then fast, decelerates at end for suspense.
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const cur = Math.max(100, Math.round(100 + (finalX100 - 100) * eased));
        setDisplayX100(cur);
        drawGraph(cur, finalX100, null);

        if (now - lastTick > 80) {
          snd('tick');
          lastTick = now;
        }

        if (t < 1) {
          flyRafRef.current = requestAnimationFrame(tick);
        } else {
          setDisplayX100(finalX100);
          flyRafRef.current = null;
          onDone();
        }
      };
      flyRafRef.current = requestAnimationFrame(tick);
    },
    [drawGraph, snd],
  );

  // --- load info -------------------------------------------------------------

  const loadInfo = useCallback(async () => {
    setPhase('loading');
    try {
      const res = await fetch('/api/arcade/crash/info');
      const data = (await res.json()) as CrashInfo & { ok?: boolean };
      if (!res.ok || !data?.ok) { setPhase('load-error'); return; }
      setInfo(data);
      setBet((b) => Math.min(data.maxBet, Math.max(data.minBet, b)));
      setAutoCashoutX100((t) => Math.min(data.maxCashoutX100, Math.max(data.minCashoutX100, t)));
      setPhase('idle');
    } catch {
      setPhase('load-error');
    }
  }, []);

  useEffect(() => { void loadInfo(); }, [loadInfo]);

  useEffect(() => {
    const timersList = timers.current;
    return () => {
      timersList.forEach((id) => window.clearTimeout(id));
      if (flyRafRef.current != null) cancelAnimationFrame(flyRafRef.current);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      audioRef.current?.ctx.close().catch(() => {});
    };
  }, []);

  // Redraw graph on idle (show a flat preview line)
  useEffect(() => {
    if (phase === 'idle') {
      setDisplayX100(100);
      drawGraph(100, null, null);
    }
  }, [phase, drawGraph]);

  // --- play ------------------------------------------------------------------

  const onPlay = useCallback(async () => {
    if (!info || phase === 'flying' || phase === 'loading') return;
    if (chips < bet) return;
    ensureAudio();
    setErrorMsg('');
    setOutcomeWon(null);
    setOutcomeCrashX100(null);
    setOutcomeCashoutX100(null);
    setLastRoundId(null);
    setDisplayX100(100);
    drawGraph(100, null, null);
    setPhase('flying');

    try {
      const res = await fetch('/api/arcade/crash/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, bet, autoCashoutX100 }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        roundId?: string;
        crashX100?: number;
        cashoutX100?: number | null;
        won?: boolean;
        payout?: number;
        chipBalance?: string;
        error?: string;
      };
      if (!res.ok || !data?.ok || typeof data.crashX100 !== 'number') {
        setErrorMsg(data?.error || 'Could not play the round.');
        setPhase('idle');
        return;
      }

      const crashX100 = data.crashX100;
      const won = data.won === true;
      const resolvedCashoutX100 = won ? (data.cashoutX100 ?? autoCashoutX100) : null;
      if (data.roundId) setLastRoundId(data.roundId);

      // Animation target: fly to the cashout point on win, to crash on bust.
      const animTarget = won ? (resolvedCashoutX100 ?? autoCashoutX100) : crashX100;
      // Scale duration: higher targets get more time for suspense.
      const dist = animTarget - 100;
      const ms = won
        ? Math.min(3000, Math.max(900, 600 + Math.log(dist + 1) * 300))
        : Math.min(2200, Math.max(700, 500 + Math.log(dist + 1) * 260));

      animateFlight(animTarget, ms, () => {
        setOutcomeWon(won);
        setOutcomeCrashX100(crashX100);
        setOutcomeCashoutX100(resolvedCashoutX100);
        setPhase('resolved');
        drawGraph(animTarget, animTarget, won);
        if (data.chipBalance != null) setChips(Number(data.chipBalance));
        if (won) {
          const big = data.payout != null && data.payout >= bet * 5;
          snd(big ? 'bigwin' : 'win');
          burst(big ? 70 : 38);
        } else {
          snd('bust');
        }
      });
    } catch {
      setErrorMsg('Could not reach the table. Try again.');
      setPhase('idle');
    }
  }, [
    info, phase, chips, bet, autoCashoutX100, initData,
    ensureAudio, animateFlight, drawGraph, burst, snd,
  ]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      if (audioRef.current) audioRef.current.master.gain.value = next ? 0 : 0.5;
      return next;
    });
  }, []);

  // --- derived values --------------------------------------------------------

  const showM = formatMultiplier(displayX100);
  const payoutIfWin = Math.floor((bet * autoCashoutX100) / 100);
  const profitIfWin = payoutIfWin - bet;
  const winChancePct = info
    ? (100 * (10_000 - info.houseEdgeBp)) / (100 * autoCashoutX100)
    : 0;

  const busy = phase === 'flying' || phase === 'loading';
  const canBet = phase === 'idle' || phase === 'resolved';

  const actionLabel =
    phase === 'flying'
      ? 'Flying…'
      : chips < bet && canBet
        ? 'Not enough chips'
        : phase === 'resolved'
          ? 'Launch again'
          : 'Launch';
  const actionDisabled = busy || (canBet && chips < bet) || !info;

  const screenState =
    phase === 'flying'
      ? 'cr-flying'
      : phase === 'resolved'
        ? outcomeWon
          ? 'cr-win'
          : 'cr-bust'
        : '';
  const multiState =
    phase === 'resolved' ? (outcomeWon ? 'cr-win' : 'cr-bust') : '';

  // Status text below the counter
  let statusText = '';
  if (errorMsg) {
    statusText = errorMsg;
  } else if (phase === 'idle') {
    statusText = 'Set a target and launch the rocket.';
  } else if (phase === 'flying') {
    statusText = 'Climbing…';
  } else if (phase === 'resolved') {
    if (outcomeWon) {
      statusText = `Cashed out at ${(autoCashoutX100 / 100).toFixed(2)}x · +${profitIfWin.toLocaleString('en-US')} chips`;
    } else {
      statusText = outcomeCrashX100 != null
        ? `Crashed at ${(outcomeCrashX100 / 100).toFixed(2)}x — try again.`
        : 'Crashed — try again.';
    }
  }

  return (
    <div>
      <style>{CR_CSS}</style>

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to arcade"
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
        <div ref={tableRef} className="cr-table p-3.5">
          <canvas ref={fxRef} className="cr-fx" />

          <div className="relative z-[2]">
            {/* Header row */}
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="mitr-bold text-lg leading-none text-white flex items-center gap-1.5">
                  <IconRocket size={18} className="text-cyan-400" aria-hidden />
                  Crash
                </div>
                <div className="mt-1 text-[9px] tracking-[0.28em] text-cyan-400">
                  SET TARGET · CASH OUT BEFORE CRASH
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

            {/* Main screen */}
            <div className={`cr-screen ${screenState}`}>
              <div className="cr-grid" aria-hidden />

              <div className="cr-label">
                {phase === 'flying'
                  ? 'Climbing'
                  : phase === 'resolved'
                    ? outcomeWon
                      ? 'Cashed out at'
                      : 'Crashed at'
                    : 'Auto-cashout'}
              </div>

              <div className={`cr-multi ${multiState}`} aria-live="polite">
                {showM.whole}
                <span className="cr-suffix">{showM.suffix}</span>
              </div>

              {phase !== 'resolved' && (
                <div className="cr-tag">
                  <IconRocket size={11} aria-hidden />
                  {winChancePct.toFixed(2)}% chance
                </div>
              )}
              {phase === 'resolved' && outcomeWon != null && (
                <div className={`cr-tag ${outcomeWon ? 'cr-tag-win' : 'cr-tag-bust'}`}>
                  {outcomeWon
                    ? `+${profitIfWin.toLocaleString('en-US')} chips`
                    : `-${bet.toLocaleString('en-US')} chips`}
                </div>
              )}

              {/* Crash curve graph */}
              <canvas ref={graphRef} className="cr-graph" aria-hidden />
            </div>

            {/* Stats row */}
            <div className="cr-glass mt-3 rounded-xl p-2.5">
              <div className="cr-meta">
                <span>Pays if clear</span>
                <span className="cr-mv">
                  {payoutIfWin.toLocaleString('en-US')} chips
                  <span className="ml-1 text-[10px] font-semibold text-slate-500">
                    (profit {profitIfWin >= 0 ? '+' : ''}
                    {profitIfWin.toLocaleString('en-US')})
                  </span>
                </span>
              </div>
              <div className="cr-meta">
                <span>House edge</span>
                <span className="cr-mv">{(info.houseEdgeBp / 100).toFixed(2)}%</span>
              </div>
            </div>

            {/* Auto-cashout target */}
            <div className="mt-3 mb-2.5 flex items-center gap-2.5">
              <span className="flex-1 text-[11px] text-slate-500">Target</span>
              <button
                type="button"
                className="cr-stp"
                disabled={!canBet}
                onClick={() => {
                  snd('pick');
                  setAutoCashoutX100((t) =>
                    Math.max(info.minCashoutX100, Math.min(info.maxCashoutX100, t - 10)),
                  );
                }}
                aria-label="Lower target"
              >
                &minus;
              </button>
              <span className="min-w-[64px] text-center text-[15px] font-extrabold tabular-nums text-cyan-400">
                {(autoCashoutX100 / 100).toFixed(2)}x
              </span>
              <button
                type="button"
                className="cr-stp"
                disabled={!canBet}
                onClick={() => {
                  snd('pick');
                  setAutoCashoutX100((t) =>
                    Math.max(info.minCashoutX100, Math.min(info.maxCashoutX100, t + 10)),
                  );
                }}
                aria-label="Raise target"
              >
                +
              </button>
            </div>

            {/* Quick-pick targets */}
            <div className="mb-3 flex flex-wrap justify-center gap-1.5">
              {QUICK_CASHOUTS_X100.map((qt) => (
                <button
                  key={qt}
                  type="button"
                  className={`cr-quick${autoCashoutX100 === qt ? ' cr-active' : ''}`}
                  disabled={!canBet}
                  onClick={() => {
                    snd('pick');
                    setAutoCashoutX100(qt);
                  }}
                >
                  {(qt / 100).toFixed(2)}x
                </button>
              ))}
            </div>

            {/* Status / error */}
            <div className="mb-3 min-h-[17px] text-center text-xs text-slate-400">
              {statusText}
            </div>

            {/* Bet control */}
            <div className="mb-2.5 flex items-center gap-2.5">
              <span className="flex-1 text-[11px] text-slate-500">Bet</span>
              <button
                type="button"
                className="cr-stp"
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
                className="cr-stp"
                disabled={!canBet}
                onClick={() => setBet((b) => Math.min(info.maxBet, b + 50))}
                aria-label="Raise bet"
              >
                +
              </button>
            </div>

            {/* Launch button */}
            <button
              type="button"
              className="cr-launch"
              disabled={actionDisabled}
              onClick={() => void onPlay()}
            >
              {actionLabel}
            </button>
          </div>
        </div>
      )}

      <p className="mt-3 text-center text-[11px] text-slate-600">
        {phase === 'resolved' && lastRoundId ? (
          <>
            Provably fair ·{' '}
            <a
              href={`/tg/verify/crash/${lastRoundId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 underline-offset-2 hover:underline"
            >
              verify this round ↗
            </a>
          </>
        ) : (
          <>Provably fair · every round verifiable at /tg/verify/crash/[roundId]</>
        )}
      </p>
    </div>
  );
}
