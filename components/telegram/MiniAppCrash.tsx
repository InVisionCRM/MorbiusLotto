'use client';

/**
 * MiniAppCrash — MORBIUS Arcade: Crash (live stateful version).
 *
 * The multiplier climbs in real-time from 1.00× the moment the round starts.
 * The player watches the counter and hits "Cash Out" at any point. The server
 * settles using the server-side elapsed time — the client's displayed value
 * and the server's authoritative value are derived from the same formula:
 *
 *   multiplierX100(ms) = max(100, floor(100 × exp(k × ms / 1000)))
 *   k = ln(2)/3  →  1x→2x in 3s, 2x→4x in 6s, etc.
 *
 * The crash point is provably fair (HMAC-SHA256) but hidden from the client
 * until the round is finalized. Page reloads resume the active round via
 * POST /api/arcade/crash/state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconRocket } from '@tabler/icons-react';

// ---------------------------------------------------------------------------
// Multiplier formula — must exactly match arcade-crash.ts on the server.
// ---------------------------------------------------------------------------
const CRASH_GROWTH_K = Math.LN2 / 3; // ≈ 0.2310

function multiplierX100AtMs(ms: number): number {
  if (ms <= 0) return 100;
  return Math.max(100, Math.floor(100 * Math.exp(CRASH_GROWTH_K * ms / 1000)));
}

function fmtMultiplier(x100: number): string {
  if (x100 >= 100_000_00) return `${Math.floor(x100 / 100_000).toLocaleString('en-US')}k×`;
  return `${(x100 / 100).toFixed(2)}×`;
}

// ---------------------------------------------------------------------------

interface CrashInfo {
  minBet: number;
  maxBet: number;
  minCashoutX100: number;
  maxCashoutX100: number;
  houseEdgeBp: number;
  growthK: number;
}

type Phase =
  | 'loading'
  | 'load-error'
  | 'idle'
  | 'starting'
  | 'active'
  | 'cashing-out'
  | 'cashed-out'
  | 'crashed';

interface MiniAppCrashProps {
  initData: string;
  initialChipBalance: string;
  onBack: () => void;
}

const QUICK_CASHOUTS = [150, 200, 300, 500, 1000] as const;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const CR_CSS = `
.cr-wrap{position:relative;border-radius:20px;overflow:hidden;
 background:radial-gradient(ellipse 80% 72% at 50% 28%,rgba(6,182,212,0.14),transparent 62%),linear-gradient(180deg,#0c1c30,#081320);
 border:1px solid rgba(6,182,212,0.30);box-shadow:inset 0 0 30px rgba(6,182,212,0.10);}
.cr-wrap.cr-flying{border-color:rgba(34,211,238,0.50);box-shadow:inset 0 0 40px rgba(34,211,238,0.14),0 0 0 1px rgba(34,211,238,0.14);}
.cr-wrap.cr-won{border-color:rgba(34,211,238,0.60);box-shadow:inset 0 0 44px rgba(34,211,238,0.26),0 0 24px rgba(34,211,238,0.30);}
.cr-wrap.cr-bust{border-color:rgba(239,68,68,0.45);box-shadow:inset 0 0 40px rgba(239,68,68,0.16);}
.cr-fx{position:absolute;inset:0;pointer-events:none;z-index:8;}

/* Counter */
.cr-counter{position:relative;text-align:center;padding:18px 0 6px;z-index:2;}
.cr-label{font-size:10px;font-weight:800;letter-spacing:0.26em;color:#22d3ee;text-transform:uppercase;}
.cr-num{font-size:72px;font-weight:900;line-height:1;letter-spacing:-0.03em;
 font-variant-numeric:tabular-nums;color:#eafbff;
 text-shadow:0 0 24px rgba(34,211,238,0.55);transition:color .15s,text-shadow .15s;}
.cr-num.cr-won{color:#22d3ee;text-shadow:0 0 32px rgba(34,211,238,1),0 0 8px rgba(255,255,255,0.5);
 animation:crPop .5s cubic-bezier(.34,1.56,.5,1);}
.cr-num.cr-bust{color:#fca5a5;text-shadow:0 0 22px rgba(239,68,68,0.65);
 animation:crShake .4s ease;}
.cr-num.cr-flying{animation:crPulse 1.4s ease-in-out infinite;}
@keyframes crPop{0%{transform:scale(0.80);}55%{transform:scale(1.14);}100%{transform:scale(1);}}
@keyframes crShake{0%,100%{transform:translateX(0);}15%{transform:translateX(-7px);}
 35%{transform:translateX(7px);}55%{transform:translateX(-5px);}75%{transform:translateX(5px);}90%{transform:translateX(-2px);}}
@keyframes crPulse{0%,100%{text-shadow:0 0 24px rgba(34,211,238,0.55);}
 50%{text-shadow:0 0 40px rgba(34,211,238,0.90),0 0 60px rgba(34,211,238,0.30);}}

/* Tag below counter */
.cr-tag{display:inline-flex;align-items:center;gap:6px;margin-top:6px;padding:4px 12px;border-radius:999px;
 border:1px solid rgba(34,211,238,0.35);background:rgba(34,211,238,0.10);
 font-size:10px;font-weight:800;letter-spacing:0.14em;color:#22d3ee;text-transform:uppercase;}
.cr-tag.cr-won{border-color:rgba(34,211,238,0.65);background:linear-gradient(135deg,rgba(34,211,238,0.28),rgba(6,182,212,0.32));color:#04222a;}
.cr-tag.cr-bust{border-color:rgba(239,68,68,0.50);background:rgba(239,68,68,0.16);color:#fca5a5;}

/* Graph */
.cr-graph{display:block;width:100%;height:88px;background:rgba(0,0,0,0.18);border-radius:12px;margin-top:8px;}

/* Cash out button — the star of the show */
.cr-cashout{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
 width:100%;border:none;border-radius:15px;padding:16px 12px;cursor:pointer;
 background:linear-gradient(135deg,#059669,#047857);
 box-shadow:0 0 0 1px rgba(52,211,153,0.35),0 8px 28px -8px rgba(5,150,105,0.65);
 transition:filter .12s,transform .1s,box-shadow .2s;}
.cr-cashout:not(:disabled):active{transform:scale(0.97);}
.cr-cashout:disabled{opacity:0.38;cursor:default;box-shadow:none;background:#0b2a20;}
.cr-cashout.cr-cashout-pulse{animation:coCashoutPulse 0.9s ease-in-out infinite;}
@keyframes coCashoutPulse{0%,100%{box-shadow:0 0 0 1px rgba(52,211,153,0.35),0 8px 28px -8px rgba(5,150,105,0.65);}
 50%{box-shadow:0 0 0 3px rgba(52,211,153,0.50),0 8px 36px -6px rgba(5,150,105,0.80),0 0 30px rgba(52,211,153,0.20);}}
.cr-cashout-label{font-size:18px;font-weight:900;letter-spacing:0.04em;color:#fff;}
.cr-cashout-sub{font-size:12px;font-weight:700;color:rgba(255,255,255,0.75);}

/* Controls */
.cr-glass{background:#0b1a2c;border:1px solid rgba(34,211,238,0.14);border-radius:14px;}
.cr-stp{width:32px;height:32px;border-radius:9px;border:1px solid rgba(6,182,212,0.30);
 background:rgba(34,211,238,0.06);color:#22d3ee;font-size:18px;cursor:pointer;}
.cr-stp:disabled{opacity:0.3;cursor:default;}
.cr-quick{padding:5px 10px;border-radius:8px;border:1px solid rgba(6,182,212,0.25);
 background:rgba(34,211,238,0.05);color:#9be8f4;font-size:11px;font-weight:700;
 cursor:pointer;transition:all .15s;font-variant-numeric:tabular-nums;}
.cr-quick:hover:not(:disabled){background:rgba(34,211,238,0.12);border-color:rgba(34,211,238,0.45);}
.cr-quick.cr-active{background:linear-gradient(135deg,#0891b2,#2563eb);border-color:transparent;
 color:#fff;box-shadow:0 4px 14px -4px rgba(6,182,212,0.55);}
.cr-quick:disabled{opacity:0.4;cursor:default;}
.cr-launch{width:100%;border:none;border-radius:13px;padding:14px;font-size:16px;font-weight:800;
 letter-spacing:0.04em;cursor:pointer;color:#fff;
 background:linear-gradient(135deg,#0891b2,#2563eb);
 box-shadow:0 8px 26px -8px rgba(6,182,212,0.55),0 0 0 1px rgba(34,211,238,0.20);
 transition:filter .15s,transform .1s;}
.cr-launch:not(:disabled):active{transform:scale(0.98);}
.cr-launch:disabled{opacity:0.45;cursor:default;box-shadow:none;}
.cr-meta{display:flex;justify-content:space-between;padding:3px 0;font-size:11px;color:#94a3b8;}
.cr-mv{color:#eafbff;font-variant-numeric:tabular-nums;font-weight:700;}
`;

// ---------------------------------------------------------------------------

export default function MiniAppCrash({ initData, initialChipBalance, onBack }: MiniAppCrashProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<CrashInfo | null>(null);
  const [chips, setChips] = useState(() => {
    const n = Number(initialChipBalance);
    return Number.isFinite(n) ? n : 0;
  });
  const [bet, setBet] = useState(100);
  const [autoCashoutX100, setAutoCashoutX100] = useState(200);
  const [displayX100, setDisplayX100] = useState(100);
  const [outcomeCrashX100, setOutcomeCrashX100] = useState<number | null>(null);
  const [outcomeCashoutX100, setOutcomeCashoutX100] = useState<number | null>(null);
  const [lastRoundId, setLastRoundId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [muted, setMuted] = useState(false);

  // Round state for active rounds (start/resume)
  const roundIdRef = useRef<string | null>(null);
  const startedAtMsRef = useRef<number>(0);
  const autoCashoutX100Ref = useRef<number | null>(null);
  const autoCashoutTriggeredRef = useRef(false);
  const flyingRef = useRef(false);
  const betRef = useRef(100);
  const cashingOutRef = useRef(false);

  const fxRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const fxRafRef = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
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
    } catch { /* best-effort */ }
  }, []);

  const snd = useCallback((kind: string, x100?: number) => {
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
      o.connect(g); g.connect(master); o.start(at); o.stop(at + dur + 0.03);
    };
    const noise = (at: number, dur: number, vol: number, cut: number) => {
      const n = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = cut;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.connect(f); f.connect(g); g.connect(master); src.start(at); src.stop(at + dur + 0.03);
    };

    if (kind === 'tick') {
      // Pitch rises as multiplier climbs — adds tension
      const baseFreq = 220;
      const pitch = baseFreq + Math.log((x100 ?? 100) / 100) * 80;
      tone(Math.min(pitch, 1200), t0, 0.04, 'sine', 0.025);
    } else if (kind === 'win') {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t0 + i * 0.1, 0.34, 'triangle', 0.16));
    } else if (kind === 'bigwin') {
      [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) =>
        tone(f, t0 + i * 0.085, 0.42, 'triangle', 0.19),
      );
      noise(t0, 0.5, 0.10, 5000);
    } else if (kind === 'bust') {
      noise(t0, 0.07, 0.30, 2200);
      tone(180, t0 + 0.06, 0.24, 'sine', 0.14);
      tone(120, t0 + 0.16, 0.30, 'sine', 0.09);
    } else if (kind === 'pick') {
      tone(620, t0, 0.05, 'triangle', 0.07);
    }
  }, []);

  // --- particles (win) -------------------------------------------------------

  const burst = useCallback((count: number) => {
    const cv = fxRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return;
    cv.width = wrap.clientWidth;
    cv.height = wrap.clientHeight;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    type P = { x: number; y: number; vx: number; vy: number; r: number; life: number; rot: number; vr: number; c: string };
    const parts: P[] = [];
    const cx = cv.width / 2;
    const cy = cv.height * 0.30;
    const cols = ['#22d3ee', '#a5f3fc', '#6ee7b7', '#fde68a', '#c4b5fd'];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2.5 + Math.random() * 9;
      parts.push({
        x: cx + (Math.random() - 0.5) * 100, y: cy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4,
        r: 3 + Math.random() * 4.5, life: 1,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
        c: cols[Math.floor(Math.random() * cols.length)] ?? '#22d3ee',
      });
    }
    const step = () => {
      if (!cv.isConnected) { fxRafRef.current = null; return; }
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]!;
        p.vy += 0.24; p.x += p.vx; p.y += p.vy; p.vx *= 0.99;
        p.rot += p.vr; p.life -= 0.011;
        if (p.life <= 0 || p.y > cv.height + 30) { parts.splice(i, 1); continue; }
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.58, 0, 0, 7); ctx.fill();
        ctx.restore();
      }
      if (parts.length) fxRafRef.current = requestAnimationFrame(step);
      else { ctx.clearRect(0, 0, cv.width, cv.height); fxRafRef.current = null; }
    };
    if (fxRafRef.current == null) fxRafRef.current = requestAnimationFrame(step);
  }, []);

  // --- graph -----------------------------------------------------------------
  // Draws the live crash curve. Called every RAF tick during 'active' phase
  // and once after resolution.
  //
  // elapsedMs: current server-sync elapsed time
  // mode: 'live' | 'won' | 'crashed'
  // finalX100: crash/cashout point for resolved modes

  const drawGraph = useCallback((
    elapsedMs: number,
    mode: 'live' | 'won' | 'crashed',
    finalX100?: number,
  ) => {
    const cv = graphRef.current;
    if (!cv) return;
    const W = cv.clientWidth > 0 ? cv.clientWidth : 280;
    const H = cv.clientHeight > 0 ? cv.clientHeight : 88;
    if (cv.width !== W) cv.width = W;
    if (cv.height !== H) cv.height = H;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    const PAD = { l: 6, r: 10, t: 10, b: 8 };
    const w = W - PAD.l - PAD.r;
    const h = H - PAD.t - PAD.b;

    // Y range: show from 1.00× to current × 1.4, using log scale.
    const currentX100 = multiplierX100AtMs(elapsedMs);
    const topX100 = Math.max(200, Math.ceil((finalX100 ?? currentX100) * 1.4));
    const logTop = Math.log(topX100 / 100);

    // Convert (time, multiplier) → (px, py)
    const toY = (x100: number) => {
      const logV = Math.log(Math.max(x100, 100) / 100);
      return PAD.t + h * (1 - logV / logTop);
    };

    // Build curve points from t=0 to t=elapsedMs
    const steps = 80;
    const pts: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const t = (elapsedMs * i) / steps;
      const px = PAD.l + (w * i) / steps;
      const py = toY(multiplierX100AtMs(t));
      pts.push([px, py]);
    }

    const lineColor = mode === 'crashed' ? '#ef4444' : '#22d3ee';
    const glowColor = mode === 'crashed' ? 'rgba(239,68,68,0.35)' : 'rgba(34,211,238,0.32)';

    // Fill under curve
    const grad = ctx.createLinearGradient(0, PAD.t, 0, H);
    grad.addColorStop(0, mode === 'crashed' ? 'rgba(239,68,68,0.25)' : 'rgba(34,211,238,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    if (pts[0]) ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) if (pts[i]) ctx.lineTo(pts[i]![0], pts[i]![1]);
    ctx.lineTo(PAD.l + w, H); ctx.lineTo(PAD.l, H); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // Curve line
    ctx.beginPath();
    ctx.strokeStyle = lineColor; ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (pts[0]) ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) if (pts[i]) ctx.lineTo(pts[i]![0], pts[i]![1]);
    ctx.stroke();

    const tip = pts[pts.length - 1];
    if (!tip) return;

    if (mode === 'live') {
      // Rocket emoji at the tip
      ctx.save();
      ctx.font = '14px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#22d3ee';
      ctx.fillText('🚀', tip[0] + 2, tip[1] - 3);
      ctx.restore();
    } else if (mode === 'crashed') {
      // Explosion dot + vertical drop
      ctx.beginPath();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(239,68,68,0.45)';
      ctx.lineWidth = 1.8;
      ctx.moveTo(tip[0], tip[1]);
      ctx.lineTo(tip[0], H - PAD.b);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(tip[0], tip[1], 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.shadowBlur = 10; ctx.shadowColor = '#ef4444'; ctx.fill(); ctx.shadowBlur = 0;

      ctx.save();
      ctx.font = '16px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('💥', tip[0], tip[1] - 8);
      ctx.restore();
    } else {
      // Won — level horizontal line at cashout
      const wonY = toY(finalX100 ?? currentX100);
      ctx.beginPath();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 1.6;
      ctx.moveTo(tip[0], wonY);
      ctx.lineTo(PAD.l + w, wonY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(tip[0], tip[1], 5, 0, Math.PI * 2);
      ctx.fillStyle = '#22d3ee';
      ctx.shadowBlur = 12; ctx.shadowColor = '#22d3ee'; ctx.fill(); ctx.shadowBlur = 0;
    }
  }, []);

  // --- RAF flight loop -------------------------------------------------------

  const stopFlying = useCallback(() => {
    flyingRef.current = false;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const performCashout = useCallback(async () => {
    if (cashingOutRef.current) return;
    cashingOutRef.current = true;
    stopFlying();
    setPhase('cashing-out');

    const rId = roundIdRef.current;
    if (!rId) { setPhase('idle'); cashingOutRef.current = false; return; }

    try {
      const res = await fetch('/api/arcade/crash/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, roundId: rId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        won?: boolean;
        cashoutX100?: number;
        crashX100?: number;
        payout?: number;
        chipBalance?: string | null;
        error?: string;
      };

      if (!res.ok || !data?.ok) {
        setErrorMsg(data?.error ?? 'Cashout failed.');
        setPhase('idle');
        cashingOutRef.current = false;
        return;
      }

      const won = data.won === true;
      const crashX100 = data.crashX100 ?? 100;
      const cashoutX100 = won ? (data.cashoutX100 ?? 100) : null;

      setOutcomeCrashX100(crashX100);
      setOutcomeCashoutX100(cashoutX100);

      if (data.chipBalance != null) setChips(Number(data.chipBalance));

      if (won) {
        setDisplayX100(cashoutX100!);
        setPhase('cashed-out');
        drawGraph(Date.now() - startedAtMsRef.current, 'won', cashoutX100!);
        const profit = (data.payout ?? 0) - betRef.current;
        snd(profit >= betRef.current * 4 ? 'bigwin' : 'win');
        burst(profit >= betRef.current * 4 ? 72 : 40);
      } else {
        setDisplayX100(crashX100);
        setPhase('crashed');
        drawGraph(Date.now() - startedAtMsRef.current, 'crashed', crashX100);
        snd('bust');
      }
    } catch {
      setErrorMsg('Could not reach the server. Try again.');
      setPhase('idle');
    } finally {
      cashingOutRef.current = false;
    }
  }, [initData, stopFlying, drawGraph, snd, burst]);

  const startFlyLoop = useCallback((startedAtMs: number, autoCO: number | null) => {
    flyingRef.current = true;
    autoCashoutTriggeredRef.current = false;
    cashingOutRef.current = false;

    let lastTickMs = 0;
    const tick = () => {
      if (!flyingRef.current) return;
      const elapsed = Date.now() - startedAtMs;
      const x100 = multiplierX100AtMs(elapsed);
      setDisplayX100(x100);
      drawGraph(elapsed, 'live');

      // Tick sound — throttled to ~every 120ms, pitch rises with multiplier
      if (elapsed - lastTickMs > 120) {
        snd('tick', x100);
        lastTickMs = elapsed;
      }

      // Auto-cashout
      if (!autoCashoutTriggeredRef.current && autoCO != null && x100 >= autoCO) {
        autoCashoutTriggeredRef.current = true;
        void performCashout();
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [drawGraph, snd, performCashout]);

  // --- load info + check for active round on mount --------------------------

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
    } catch { setPhase('load-error'); }
  }, []);

  // Check for an active round on mount (page reload recovery).
  const checkForActiveRound = useCallback(async () => {
    try {
      const res = await fetch('/api/arcade/crash/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        hasActiveRound?: boolean;
        roundId?: string;
        bet?: number;
        autoCashoutX100?: number | null;
        startedAt?: string;
        settled?: { won: boolean; crashX100: number };
      };
      if (!res.ok || !data?.ok) return;
      if (data.hasActiveRound && data.roundId && data.startedAt) {
        // Resume the flying round
        roundIdRef.current = data.roundId;
        if (data.bet) {
          betRef.current = data.bet;
          setBet(data.bet);
        }
        const autoCO = data.autoCashoutX100 ?? null;
        autoCashoutX100Ref.current = autoCO;
        const startMs = new Date(data.startedAt).getTime();
        startedAtMsRef.current = startMs;
        setLastRoundId(data.roundId);
        setPhase('active');
        startFlyLoop(startMs, autoCO);
      }
    } catch { /* non-fatal */ }
  }, [initData, startFlyLoop]);

  useEffect(() => {
    void loadInfo().then(() => void checkForActiveRound());
  }, [loadInfo, checkForActiveRound]);

  useEffect(() => {
    const t = timers.current;
    return () => {
      t.forEach((id) => window.clearTimeout(id));
      stopFlying();
      if (fxRafRef.current != null) cancelAnimationFrame(fxRafRef.current);
      audioRef.current?.ctx.close().catch(() => {});
    };
  }, [stopFlying]);

  // Draw flat idle graph on phase change to idle
  useEffect(() => {
    if (phase === 'idle') {
      setDisplayX100(100);
      drawGraph(0, 'live');
    }
  }, [phase, drawGraph]);

  // --- start ----------------------------------------------------------------

  const onStart = useCallback(async () => {
    if (!info || phase !== 'idle') return;
    if (chips < bet) return;
    ensureAudio();
    setErrorMsg('');
    setOutcomeCrashX100(null);
    setOutcomeCashoutX100(null);
    setDisplayX100(100);
    setPhase('starting');

    try {
      const res = await fetch('/api/arcade/crash/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, bet, autoCashoutX100 }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        roundId?: string;
        startedAt?: string;
        autoCashoutX100?: number | null;
        chipBalance?: string;
        error?: string;
      };

      if (!res.ok || !data?.ok || !data.roundId || !data.startedAt) {
        setErrorMsg(data?.error ?? 'Could not start the round.');
        setPhase('idle');
        return;
      }

      roundIdRef.current = data.roundId;
      betRef.current = bet;
      const autoCO = data.autoCashoutX100 ?? null;
      autoCashoutX100Ref.current = autoCO;
      const startMs = new Date(data.startedAt).getTime();
      startedAtMsRef.current = startMs;
      if (data.chipBalance != null) setChips(Number(data.chipBalance));
      setLastRoundId(data.roundId);
      setPhase('active');
      startFlyLoop(startMs, autoCO);
    } catch {
      setErrorMsg('Could not reach the table. Try again.');
      setPhase('idle');
    }
  }, [info, phase, chips, bet, autoCashoutX100, initData, ensureAudio, startFlyLoop]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      if (audioRef.current) audioRef.current.master.gain.value = next ? 0 : 0.5;
      return next;
    });
  }, []);

  const onPlayAgain = useCallback(() => {
    roundIdRef.current = null;
    setPhase('idle');
  }, []);

  // --- derived ---------------------------------------------------------------

  const isFlying = phase === 'active';
  const isCashingOut = phase === 'cashing-out';
  const isResolved = phase === 'cashed-out' || phase === 'crashed';
  const canEdit = phase === 'idle' || phase === 'load-error';

  const payoutIfWin = Math.floor((bet * autoCashoutX100) / 100);
  const profitIfWin = payoutIfWin - bet;
  const winChancePct = info ? (100 * (10_000 - info.houseEdgeBp)) / (100 * autoCashoutX100) : 0;
  const currentPayout = Math.floor((betRef.current * displayX100) / 100);
  const currentProfit = currentPayout - betRef.current;

  const wrapClass = isFlying || isCashingOut
    ? 'cr-wrap cr-flying'
    : phase === 'cashed-out'
      ? 'cr-wrap cr-won'
      : phase === 'crashed'
        ? 'cr-wrap cr-bust'
        : 'cr-wrap';

  const numClass = isFlying || isCashingOut
    ? 'cr-num cr-flying'
    : phase === 'cashed-out'
      ? 'cr-num cr-won'
      : phase === 'crashed'
        ? 'cr-num cr-bust'
        : 'cr-num';

  const counterLabel =
    isFlying || isCashingOut
      ? 'Multiplier'
      : phase === 'cashed-out'
        ? 'Cashed out at'
        : phase === 'crashed'
          ? 'Crashed at'
          : 'Target';

  const showX100 = (isFlying || isCashingOut) ? displayX100 : isResolved ? displayX100 : autoCashoutX100;

  return (
    <div>
      <style>{CR_CSS}</style>

      {/* Back + title */}
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
          <button type="button" onClick={() => void loadInfo()}
            className="mt-3 rounded-lg border border-cyan-500/30 px-4 py-2 text-sm text-cyan-400">
            Try again
          </button>
        </div>
      )}

      {info && phase !== 'loading' && phase !== 'load-error' && (
        <div ref={wrapRef} className={wrapClass} style={{ padding: '14px' }}>
          <canvas ref={fxRef} className="cr-fx" />

          <div className="relative z-[2]">
            {/* Header */}
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="mitr-bold flex items-center gap-1.5 text-lg leading-none text-white">
                  <IconRocket size={17} className="text-cyan-400" aria-hidden />
                  Crash
                </div>
                <div className="mt-1 text-[9px] tracking-[0.28em] text-cyan-400">
                  {isFlying ? 'HOLD TIGHT · CASH OUT BEFORE CRASH' : 'SET TARGET · LAUNCH · CASH OUT'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={toggleMute}
                  className="rounded-lg border border-cyan-500/25 bg-[#081320]/70 px-2 py-1 text-[10px] font-bold text-cyan-400">
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

            {/* Counter */}
            <div className="cr-counter">
              <div className="cr-label">{counterLabel}</div>
              <div className={numClass} aria-live="polite">
                {fmtMultiplier(showX100)}
              </div>

              {/* Outcome tag */}
              {(isFlying || isCashingOut) && (
                <div className="cr-tag">
                  <IconRocket size={10} aria-hidden />
                  {currentProfit >= 0 ? '+' : ''}{currentProfit.toLocaleString('en-US')} chips if cashed out now
                </div>
              )}
              {phase === 'cashed-out' && outcomeCashoutX100 != null && (
                <div className="cr-tag cr-won">
                  +{(Math.floor((betRef.current * outcomeCashoutX100) / 100) - betRef.current).toLocaleString('en-US')} chips profit
                </div>
              )}
              {phase === 'crashed' && outcomeCrashX100 != null && (
                <div className="cr-tag cr-bust">
                  −{betRef.current.toLocaleString('en-US')} chips
                </div>
              )}
            </div>

            {/* Live graph */}
            <canvas ref={graphRef} className="cr-graph" aria-hidden />

            {/* ---- ACTIVE STATE: big cash-out button ---- */}
            {(isFlying || isCashingOut) && (
              <button
                type="button"
                className={`cr-cashout mt-4${isFlying ? ' cr-cashout-pulse' : ''}`}
                disabled={isCashingOut}
                onClick={() => void performCashout()}
              >
                <span className="cr-cashout-label">
                  {isCashingOut ? 'Cashing out…' : `💰 CASH OUT`}
                </span>
                {isFlying && (
                  <span className="cr-cashout-sub">
                    {currentPayout.toLocaleString('en-US')} chips
                    {' '}(+{currentProfit.toLocaleString('en-US')})
                  </span>
                )}
              </button>
            )}

            {/* ---- RESOLVED: outcome + play again ---- */}
            {isResolved && (
              <div className="mt-4">
                <div className="mb-3 text-center text-sm font-semibold text-slate-300">
                  {phase === 'cashed-out' && outcomeCrashX100 != null && (
                    <>Crashed at {fmtMultiplier(outcomeCrashX100)} — you got out in time!</>
                  )}
                  {phase === 'crashed' && (
                    <>
                      {outcomeCashoutX100 == null
                        ? 'Crashed before cashout — better luck next time.'
                        : `Crashed at ${fmtMultiplier(outcomeCrashX100 ?? 100)} — you got out at ${fmtMultiplier(outcomeCashoutX100)}.`
                      }
                    </>
                  )}
                </div>
                <button type="button" className="cr-launch" onClick={onPlayAgain}>
                  Launch again
                </button>
              </div>
            )}

            {/* ---- IDLE / STARTING: setup controls ---- */}
            {(canEdit || phase === 'starting') && (
              <div className="mt-4">
                {/* Stats */}
                <div className="cr-glass mb-3 p-2.5">
                  <div className="cr-meta">
                    <span>Pays if clear</span>
                    <span className="cr-mv">
                      {payoutIfWin.toLocaleString('en-US')} chips
                      <span className="ml-1 text-[10px] font-semibold text-slate-500">
                        (profit +{profitIfWin.toLocaleString('en-US')})
                      </span>
                    </span>
                  </div>
                  <div className="cr-meta">
                    <span>Win chance</span>
                    <span className="cr-mv">{winChancePct.toFixed(2)}%</span>
                  </div>
                  <div className="cr-meta">
                    <span>House edge</span>
                    <span className="cr-mv">{(info.houseEdgeBp / 100).toFixed(2)}%</span>
                  </div>
                </div>

                {/* Auto-cashout target */}
                <div className="mb-2.5 flex items-center gap-2.5">
                  <span className="flex-1 text-[11px] text-slate-500">Auto-cashout</span>
                  <button type="button" className="cr-stp" disabled={!canEdit}
                    onClick={() => { snd('pick'); setAutoCashoutX100((t) => Math.max(info.minCashoutX100, Math.min(info.maxCashoutX100, t - 10))); }}
                    aria-label="Lower target">&minus;</button>
                  <span className="min-w-[64px] text-center text-[15px] font-extrabold tabular-nums text-cyan-400">
                    {(autoCashoutX100 / 100).toFixed(2)}×
                  </span>
                  <button type="button" className="cr-stp" disabled={!canEdit}
                    onClick={() => { snd('pick'); setAutoCashoutX100((t) => Math.max(info.minCashoutX100, Math.min(info.maxCashoutX100, t + 10))); }}
                    aria-label="Raise target">+</button>
                </div>

                {/* Quick-pick */}
                <div className="mb-3 flex flex-wrap justify-center gap-1.5">
                  {QUICK_CASHOUTS.map((qt) => (
                    <button key={qt} type="button" disabled={!canEdit}
                      className={`cr-quick${autoCashoutX100 === qt ? ' cr-active' : ''}`}
                      onClick={() => { snd('pick'); setAutoCashoutX100(qt); }}>
                      {(qt / 100).toFixed(2)}×
                    </button>
                  ))}
                </div>

                {/* Error */}
                {errorMsg && (
                  <div className="mb-3 text-center text-xs text-red-400">{errorMsg}</div>
                )}

                {/* Bet */}
                <div className="mb-2.5 flex items-center gap-2.5">
                  <span className="flex-1 text-[11px] text-slate-500">Bet</span>
                  <button type="button" className="cr-stp" disabled={!canEdit}
                    onClick={() => setBet((b) => Math.max(info.minBet, b - 50))}
                    aria-label="Lower bet">&minus;</button>
                  <span className="min-w-[58px] text-center text-[15px] font-extrabold tabular-nums text-cyan-400">
                    {bet.toLocaleString('en-US')}
                  </span>
                  <button type="button" className="cr-stp" disabled={!canEdit}
                    onClick={() => setBet((b) => Math.min(info.maxBet, b + 50))}
                    aria-label="Raise bet">+</button>
                </div>

                <button type="button" className="cr-launch"
                  disabled={phase === 'starting' || chips < bet || !canEdit}
                  onClick={() => void onStart()}>
                  {phase === 'starting' ? 'Launching…' : chips < bet ? 'Not enough chips' : '🚀 Launch'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="mt-3 text-center text-[11px] text-slate-600">
        {lastRoundId && isResolved ? (
          <>
            Provably fair ·{' '}
            <a href={`/tg/verify/crash/${lastRoundId}`} target="_blank" rel="noopener noreferrer"
              className="text-cyan-400 underline-offset-2 hover:underline">
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
