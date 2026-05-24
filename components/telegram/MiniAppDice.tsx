'use client';

/**
 * MiniAppDice — MORBIUS Arcade: Dice (provably-fair roll-under).
 *
 * The polished game screen for the Telegram Mini App. Wired to the
 * provably-fair backend:
 *   GET  /api/arcade/dice/info        — bet/target bounds + house edge
 *   POST /api/arcade/dice/play        — atomic charge + roll + payout
 *   GET  /api/arcade/dice/verify/:id  — recover the result after a lost reply
 *
 * Targets, rolls, and multipliers are stored as integers ×100 end-to-end so
 * the win/lose decision is exact (no float compares anywhere on the decision
 * path).
 *
 * UX shape mirrors MiniAppLimbo.tsx: idle → rolling → resolved phases, refs
 * own the imperative roll animation and synthesised audio, React owns the
 * game state. Visual signature is the horizontal "roll bar" — a cyan win
 * zone, a slate lose zone, a moving dice marker that lands at the rolled
 * value and pulses on a win.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconDice5 } from '@tabler/icons-react';

// ---------------------------------------------------------------------------

interface DiceInfo {
  minBet: number;
  maxBet: number;
  minTargetX100: number;
  maxTargetX100: number;
  houseEdgeBp: number;
}

type Phase = 'loading' | 'load-error' | 'idle' | 'rolling' | 'resolved';

interface MiniAppDiceProps {
  initData: string;
  initialChipBalance: string;
  onBack: () => void;
}

const DC_CSS = `
.dc-table{position:relative;border-radius:20px;overflow:hidden;
 background:radial-gradient(ellipse 80% 72% at 50% 28%,rgba(6,182,212,0.17),transparent 62%),linear-gradient(180deg,#0c1c30,#081320);
 border:1px solid rgba(6,182,212,0.30);box-shadow:inset 0 0 30px rgba(6,182,212,0.10);}
.dc-glass{background:#0b1a2c;border:1px solid rgba(34,211,238,0.14);}
.dc-fx{position:absolute;inset:0;pointer-events:none;z-index:7;}
.dc-screen{position:relative;border-radius:18px;padding:22px 14px 18px;text-align:center;overflow:hidden;
 background:radial-gradient(ellipse 75% 70% at 50% 45%,rgba(34,211,238,0.16),transparent 62%),#091627;
 border:1px solid rgba(34,211,238,0.22);box-shadow:inset 0 0 22px rgba(6,182,212,0.16);}
.dc-screen.dc-win{border-color:rgba(34,211,238,0.55);box-shadow:inset 0 0 32px rgba(34,211,238,0.32),0 0 22px rgba(34,211,238,0.35);}
.dc-screen.dc-lose{border-color:rgba(239,68,68,0.35);box-shadow:inset 0 0 22px rgba(239,68,68,0.18);}
.dc-screen.dc-rolling{border-color:rgba(34,211,238,0.45);}
.dc-screen .dc-grid{position:absolute;inset:0;opacity:0.16;pointer-events:none;
 background-image:linear-gradient(rgba(34,211,238,0.18) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,0.18) 1px,transparent 1px);
 background-size:24px 24px;}
.dc-label{position:relative;font-size:10px;font-weight:800;letter-spacing:0.26em;color:#22d3ee;}
.dc-roll{position:relative;margin-top:4px;font-size:54px;font-weight:900;line-height:1;letter-spacing:-0.02em;
 font-variant-numeric:tabular-nums;color:#eafbff;text-shadow:0 0 22px rgba(34,211,238,0.55);transition:color .2s,text-shadow .2s;}
.dc-roll.dc-win{color:#22d3ee;text-shadow:0 0 28px rgba(34,211,238,0.95),0 0 8px rgba(255,255,255,0.6);animation:dcPop .55s cubic-bezier(.34,1.5,.5,1);}
.dc-roll.dc-lose{color:#fca5a5;text-shadow:0 0 18px rgba(239,68,68,0.55);}
@keyframes dcPop{0%{transform:scale(0.86);}55%{transform:scale(1.12);}100%{transform:scale(1);}}
.dc-tag{position:relative;margin-top:10px;display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:999px;
 border:1px solid rgba(34,211,238,0.35);background:rgba(34,211,238,0.10);font-size:10px;font-weight:800;letter-spacing:0.16em;color:#22d3ee;text-transform:uppercase;}
.dc-tag.dc-tag-win{border-color:rgba(34,211,238,0.65);background:linear-gradient(135deg,rgba(34,211,238,0.28),rgba(6,182,212,0.32));color:#04222a;}
.dc-tag.dc-tag-lose{border-color:rgba(239,68,68,0.45);background:rgba(239,68,68,0.15);color:#fca5a5;}

.dc-bar{position:relative;margin-top:14px;height:36px;border-radius:12px;overflow:visible;
 background:#0a1726;border:1px solid rgba(34,211,238,0.20);box-shadow:inset 0 1px 6px rgba(0,0,0,0.4);}
.dc-bar-zone{position:absolute;top:0;bottom:0;border-radius:12px 0 0 12px;background:linear-gradient(90deg,rgba(6,182,212,0.18),rgba(34,211,238,0.42));
 box-shadow:inset 0 0 12px rgba(34,211,238,0.30);transition:width .15s;}
.dc-bar-target{position:absolute;top:-3px;bottom:-3px;width:3px;border-radius:2px;background:#fff;
 box-shadow:0 0 8px rgba(255,255,255,0.7),0 0 14px rgba(34,211,238,0.85);transition:left .15s;}
.dc-bar-ticks{position:absolute;inset:0;display:flex;justify-content:space-between;padding:0 4px;pointer-events:none;}
.dc-bar-tick{display:flex;flex-direction:column;justify-content:flex-end;font-size:9px;font-weight:700;color:rgba(148,163,184,0.55);}
.dc-marker{position:absolute;top:50%;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;
 background:radial-gradient(circle at 35% 30%,#fafffd,#22d3ee 70%,#0e7490);
 box-shadow:0 0 14px rgba(34,211,238,0.85),inset 0 -2px 4px rgba(0,0,0,0.3);transition:left .12s;opacity:0;pointer-events:none;}
.dc-marker.dc-marker-show{opacity:1;}
.dc-marker.dc-marker-win{box-shadow:0 0 22px rgba(34,211,238,1),0 0 36px rgba(34,211,238,0.5),inset 0 -2px 4px rgba(0,0,0,0.3);
 animation:dcMark .55s cubic-bezier(.34,1.5,.5,1);}
.dc-marker.dc-marker-lose{background:radial-gradient(circle at 35% 30%,#fff0f0,#f87171 70%,#7f1d1d);
 box-shadow:0 0 14px rgba(239,68,68,0.7),inset 0 -2px 4px rgba(0,0,0,0.3);}
@keyframes dcMark{0%{transform:translate(-50%,-50%) scale(0.7);}55%{transform:translate(-50%,-50%) scale(1.35);}100%{transform:translate(-50%,-50%) scale(1);}}

.dc-stp{width:32px;height:32px;border-radius:9px;border:1px solid rgba(6,182,212,0.30);background:rgba(34,211,238,0.06);
 color:#22d3ee;font-size:18px;cursor:pointer;}
.dc-stp:disabled{opacity:0.3;cursor:default;}
.dc-quick{padding:5px 10px;border-radius:8px;border:1px solid rgba(6,182,212,0.25);background:rgba(34,211,238,0.05);
 color:#9be8f4;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;font-variant-numeric:tabular-nums;}
.dc-quick:hover:not(:disabled){background:rgba(34,211,238,0.12);border-color:rgba(34,211,238,0.45);}
.dc-quick.dc-active{background:linear-gradient(135deg,#0891b2,#2563eb);border-color:transparent;color:#fff;
 box-shadow:0 4px 14px -4px rgba(6,182,212,0.55);}
.dc-quick:disabled{opacity:0.4;cursor:default;}
.dc-slider{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:6px;
 background:linear-gradient(90deg,rgba(34,211,238,0.45) 0%,rgba(34,211,238,0.45) var(--v,30%),rgba(148,163,184,0.20) var(--v,30%),rgba(148,163,184,0.20) 100%);
 outline:none;}
.dc-slider:disabled{opacity:0.45;}
.dc-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;border-radius:50%;
 background:radial-gradient(circle at 35% 30%,#fafffd,#22d3ee 70%,#0e7490);border:2px solid #082030;
 box-shadow:0 0 8px rgba(34,211,238,0.7);cursor:pointer;}
.dc-slider::-moz-range-thumb{width:18px;height:18px;border-radius:50%;
 background:radial-gradient(circle at 35% 30%,#fafffd,#22d3ee 70%,#0e7490);border:2px solid #082030;
 box-shadow:0 0 8px rgba(34,211,238,0.7);cursor:pointer;}

.dc-play-btn{width:100%;border:none;border-radius:13px;padding:14px;font-size:16px;font-weight:800;letter-spacing:0.04em;
 cursor:pointer;color:#ffffff;background:linear-gradient(135deg,#0891b2,#2563eb);
 box-shadow:0 8px 26px -8px rgba(6,182,212,0.55),0 0 0 1px rgba(34,211,238,0.20);
 transition:filter .15s,transform .1s;}
.dc-play-btn:not(:disabled):active{transform:scale(0.98);}
.dc-play-btn:disabled{opacity:0.45;cursor:default;box-shadow:none;}
.dc-meta{display:flex;justify-content:space-between;padding:4px 0;font-size:11px;color:#94a3b8;}
.dc-meta .dc-mv{color:#eafbff;font-variant-numeric:tabular-nums;font-weight:700;}
`;

// ---------------------------------------------------------------------------

function formatRoll(x100: number): string {
  return (x100 / 100).toFixed(2);
}

function formatMult(x100: number): string {
  return `${(x100 / 100).toFixed(2)}x`;
}

/** Multiplier ×100 we'd be paid at the given target. Mirrors the server. */
function multX100ForTarget(targetX100: number, houseEdgeBp: number): number {
  if (targetX100 <= 0) return 0;
  return Math.floor(((10_000 - houseEdgeBp) * 100) / targetX100);
}

// Quick-pick targets (×100). 50 is the obvious anchor (≈2x, even odds);
// 25/75 give the classic high-multiplier / high-chance picks; 10/90 are
// the extremes that still stay inside the supported [2, 98] bounds.
const QUICK_TARGETS_X100 = [1000, 2500, 5000, 7500, 9000] as const;

// ---------------------------------------------------------------------------

export default function MiniAppDice({
  initData,
  initialChipBalance,
  onBack,
}: MiniAppDiceProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<DiceInfo | null>(null);
  const [chips, setChips] = useState<number>(() => {
    const n = Number(initialChipBalance);
    return Number.isFinite(n) ? n : 0;
  });
  const [bet, setBet] = useState(100);
  const [targetX100, setTargetX100] = useState(5000); // 50.00 — even odds at 1.98x
  // Animated roll value shown on the screen. Starts at null until a round
  // happens; once a roll lands we keep it visible so the player can see
  // their last result behind the slider.
  const [displayRollX100, setDisplayRollX100] = useState<number | null>(null);
  const [outcomeRollX100, setOutcomeRollX100] = useState<number | null>(null);
  const [outcomeWon, setOutcomeWon] = useState<boolean | null>(null);
  const [lastRoundId, setLastRoundId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [muted, setMuted] = useState(false);

  const fxRef = useRef<HTMLCanvasElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const rollRafRef = useRef<number | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; master: GainNode } | null>(null);
  const mutedRef = useRef(false);

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
    if (kind === 'tick') {
      tone(740, t0, 0.035, 'square', 0.04);
    } else if (kind === 'roll') {
      // Dice-clatter — short noise burst.
      noise(t0, 0.18, 0.08, 3200);
    } else if (kind === 'win') {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t0 + i * 0.1, 0.34, 'triangle', 0.16));
    } else if (kind === 'bigwin') {
      [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) =>
        tone(f, t0 + i * 0.095, 0.42, 'triangle', 0.19),
      );
      noise(t0, 0.5, 0.1, 5000);
    } else if (kind === 'lose') {
      tone(233, t0, 0.16, 'sine', 0.1);
      tone(175, t0 + 0.09, 0.2, 'sine', 0.08);
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
    const cy = cv.height * 0.36;
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
      const res = await fetch('/api/arcade/dice/info');
      const data = (await res.json()) as DiceInfo & { ok?: boolean };
      if (!res.ok || !data?.ok) {
        setPhase('load-error');
        return;
      }
      setInfo(data);
      setBet((b) => Math.min(data.maxBet, Math.max(data.minBet, b)));
      setTargetX100((t) => Math.min(data.maxTargetX100, Math.max(data.minTargetX100, t)));
      setPhase('idle');
    } catch {
      setPhase('load-error');
    }
  }, []);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  // Clean up timers + audio on unmount. The particle loop self-terminates once
  // its canvas leaves the DOM; the roll animation cancels its own RAF.
  useEffect(() => {
    const timersList = timers.current;
    return () => {
      timersList.forEach((id) => window.clearTimeout(id));
      if (rollRafRef.current != null) cancelAnimationFrame(rollRafRef.current);
      audioRef.current?.ctx.close().catch(() => {});
    };
  }, []);

  // --- animation: cycle the roll value through random reads, then land on
  // the actual server value. ~1100ms — enough to feel like a roll, short
  // enough to keep play snappy.
  const animateRollTo = useCallback(
    (finalX100: number, durationMs: number, onDone: () => void) => {
      if (rollRafRef.current != null) cancelAnimationFrame(rollRafRef.current);
      const startT = performance.now();
      let lastTick = 0;
      const tick = (now: number) => {
        const t = Math.min(1, (now - startT) / durationMs);
        // Random scrubbing — looks like dice tumbling. Then settle.
        if (t < 0.92) {
          const jitter = Math.floor(Math.random() * 10_000);
          setDisplayRollX100(jitter);
          if (now - lastTick > 70) {
            snd('tick');
            lastTick = now;
          }
          rollRafRef.current = requestAnimationFrame(tick);
        } else {
          setDisplayRollX100(finalX100);
          rollRafRef.current = null;
          onDone();
        }
      };
      rollRafRef.current = requestAnimationFrame(tick);
    },
    [snd],
  );

  // --- play ------------------------------------------------------------------

  const onPlay = useCallback(async () => {
    if (!info || phase === 'rolling' || phase === 'loading') return;
    if (chips < bet) return;
    ensureAudio();
    snd('roll');
    setErrorMsg('');
    setOutcomeRollX100(null);
    setOutcomeWon(null);
    setLastRoundId(null);
    setPhase('rolling');
    try {
      const res = await fetch('/api/arcade/dice/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, bet, targetX100 }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        roundId?: string;
        bet?: number;
        targetX100?: number;
        rollX100?: number;
        multiplierX100?: number;
        won?: boolean;
        payout?: number;
        chipBalance?: string;
        error?: string;
      };
      if (!res.ok || !data?.ok || typeof data.rollX100 !== 'number') {
        setErrorMsg(data?.error || 'Could not play the round.');
        setPhase('idle');
        return;
      }
      const finalX100 = data.rollX100;
      const won = data.won === true;
      if (data.roundId) setLastRoundId(data.roundId);
      animateRollTo(finalX100, 1100, () => {
        setOutcomeRollX100(finalX100);
        setOutcomeWon(won);
        setPhase('resolved');
        if (data.chipBalance != null) setChips(Number(data.chipBalance));
        if (won) {
          const big = data.payout != null && data.payout >= bet * 10;
          snd(big ? 'bigwin' : 'win');
          burst(big ? 70 : 38);
        } else {
          snd('lose');
        }
      });
    } catch {
      setErrorMsg('Could not reach the table. Try again.');
      setPhase('idle');
    }
  }, [info, phase, chips, bet, targetX100, initData, ensureAudio, animateRollTo, burst, snd]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      if (audioRef.current) audioRef.current.master.gain.value = next ? 0 : 0.5;
      return next;
    });
  }, []);

  // --- derived render values -------------------------------------------------

  const houseEdgeBp = info?.houseEdgeBp ?? 100;
  const multiplierX100 = multX100ForTarget(targetX100, houseEdgeBp);
  const winChancePct = targetX100 / 100; // P(win) = target / 100
  const payoutIfWin = Math.floor((bet * multiplierX100) / 100);
  const profitIfWin = payoutIfWin - bet;

  // Roll bar position math — convert ×100 target/roll into a 0..100 slider %.
  const targetPct = targetX100 / 100; // 200 → 2%, 9800 → 98%
  const markerPct =
    displayRollX100 != null ? Math.min(99.5, displayRollX100 / 100) : null;

  const busy = phase === 'rolling' || phase === 'loading';
  const canBet = phase === 'idle' || phase === 'resolved';
  const actionLabel =
    phase === 'rolling'
      ? 'Rolling…'
      : chips < bet && canBet
        ? 'Not enough chips'
        : phase === 'resolved'
          ? 'Roll again'
          : 'Roll';
  const actionDisabled = busy || (canBet && chips < bet) || !info;

  const screenState =
    phase === 'rolling'
      ? 'dc-rolling'
      : phase === 'resolved'
        ? outcomeWon
          ? 'dc-win'
          : 'dc-lose'
        : '';
  const rollState =
    phase === 'resolved' ? (outcomeWon ? 'dc-win' : 'dc-lose') : '';

  // Slider style: paint a cyan track up to the target threshold, slate after.
  const sliderStyle: React.CSSProperties = {
    ['--v' as keyof React.CSSProperties as string]: `${targetPct}%`,
  };

  // What to show in the giant roll number — last roll, target while idle.
  const screenValueX100 = displayRollX100 ?? targetX100;

  // Track outcome ID so the lint doesn't flag the unused setter chain.
  void outcomeRollX100;

  return (
    <div>
      <style>{DC_CSS}</style>

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
        <div ref={tableRef} className="dc-table p-3.5">
          <canvas ref={fxRef} className="dc-fx" />

          <div className="relative z-[2]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="mitr-bold text-lg leading-none text-white">Dice</div>
                <div className="mt-1 text-[9px] tracking-[0.28em] text-cyan-400">
                  ROLL UNDER · WIN INSTANTLY
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

            <div className={`dc-screen ${screenState}`}>
              <div className="dc-grid" aria-hidden />
              <div className="dc-label">
                {phase === 'rolling'
                  ? 'Rolling'
                  : phase === 'resolved'
                    ? outcomeWon
                      ? `Rolled under ${formatRoll(targetX100)}`
                      : `Rolled ≥ ${formatRoll(targetX100)}`
                    : `Roll under ${formatRoll(targetX100)}`}
              </div>
              <div className={`dc-roll ${rollState}`}>{formatRoll(screenValueX100)}</div>

              {/* The roll bar — cyan win zone, slate lose zone, white target line,
                  and the moving dice marker that lands at the rolled value. */}
              <div className="dc-bar" aria-hidden>
                <div
                  className="dc-bar-zone"
                  style={{
                    width: `${targetPct}%`,
                    borderRadius:
                      targetPct >= 99 ? '12px' : '12px 0 0 12px',
                  }}
                />
                <div className="dc-bar-ticks">
                  {[0, 25, 50, 75, 100].map((t) => (
                    <span key={t} className="dc-bar-tick">
                      {t}
                    </span>
                  ))}
                </div>
                <div
                  className="dc-bar-target"
                  style={{ left: `calc(${targetPct}% - 1.5px)` }}
                />
                {markerPct != null && (
                  <div
                    className={`dc-marker dc-marker-show ${
                      phase === 'resolved'
                        ? outcomeWon
                          ? 'dc-marker-win'
                          : 'dc-marker-lose'
                        : ''
                    }`}
                    style={{ left: `${markerPct}%` }}
                  />
                )}
              </div>

              {phase !== 'resolved' && (
                <div className="dc-tag" aria-live="polite">
                  <IconDice5 size={11} aria-hidden />
                  {winChancePct.toFixed(2)}% · {formatMult(multiplierX100)}
                </div>
              )}
              {phase === 'resolved' && outcomeWon != null && (
                <div className={`dc-tag ${outcomeWon ? 'dc-tag-win' : 'dc-tag-lose'}`}>
                  {outcomeWon
                    ? `+${profitIfWin.toLocaleString('en-US')} chips`
                    : `−${bet.toLocaleString('en-US')} chips`}
                </div>
              )}
            </div>

            <div className="dc-glass mt-3 rounded-xl p-2.5">
              <div className="dc-meta">
                <span>Multiplier</span>
                <span className="dc-mv">{formatMult(multiplierX100)}</span>
              </div>
              <div className="dc-meta">
                <span>Pays</span>
                <span className="dc-mv">
                  {payoutIfWin.toLocaleString('en-US')} chips
                  <span className="ml-1 text-[10px] font-semibold text-slate-500">
                    (profit {profitIfWin >= 0 ? '+' : ''}
                    {profitIfWin.toLocaleString('en-US')})
                  </span>
                </span>
              </div>
              <div className="dc-meta">
                <span>House edge</span>
                <span className="dc-mv">{(houseEdgeBp / 100).toFixed(2)}%</span>
              </div>
            </div>

            {/* Target slider — primary control. Range slider gives the smooth
                Stake-style feel; quick-picks below cover the common anchors. */}
            <div className="mt-3 flex items-center gap-2.5">
              <span className="flex-1 text-[11px] text-slate-500">Roll under</span>
              <button
                type="button"
                className="dc-stp"
                disabled={!canBet}
                onClick={() => {
                  snd('pick');
                  setTargetX100((t) =>
                    Math.max(info.minTargetX100, Math.min(info.maxTargetX100, t - 100)),
                  );
                }}
                aria-label="Lower target"
              >
                &minus;
              </button>
              <span className="min-w-[64px] text-center text-[15px] font-extrabold tabular-nums text-cyan-400">
                {formatRoll(targetX100)}
              </span>
              <button
                type="button"
                className="dc-stp"
                disabled={!canBet}
                onClick={() => {
                  snd('pick');
                  setTargetX100((t) =>
                    Math.max(info.minTargetX100, Math.min(info.maxTargetX100, t + 100)),
                  );
                }}
                aria-label="Raise target"
              >
                +
              </button>
            </div>

            <input
              type="range"
              className="dc-slider mt-2.5"
              min={info.minTargetX100}
              max={info.maxTargetX100}
              step={10}
              value={targetX100}
              disabled={!canBet}
              style={sliderStyle}
              onChange={(e) => {
                snd('pick');
                setTargetX100(Number(e.target.value));
              }}
              aria-label="Target roll-under threshold"
            />

            <div className="mt-3 mb-3 flex flex-wrap justify-center gap-1.5">
              {QUICK_TARGETS_X100.map((qt) => (
                <button
                  key={qt}
                  type="button"
                  className={`dc-quick${targetX100 === qt ? ' dc-active' : ''}`}
                  disabled={!canBet}
                  onClick={() => {
                    snd('pick');
                    setTargetX100(qt);
                  }}
                >
                  {formatRoll(qt)}
                </button>
              ))}
            </div>

            <div className="mb-3 min-h-[17px] text-center text-xs text-slate-400">
              {errorMsg
                ? errorMsg
                : phase === 'idle'
                  ? 'Pick a target and roll.'
                  : phase === 'rolling'
                    ? 'Rolling the dice…'
                    : outcomeWon
                      ? `Cleared ${formatRoll(targetX100)}  ·  +${profitIfWin.toLocaleString('en-US')} chips`
                      : `Rolled too high — try again.`}
            </div>

            <div className="mb-2.5 flex items-center gap-2.5">
              <span className="flex-1 text-[11px] text-slate-500">Bet</span>
              <button
                type="button"
                className="dc-stp"
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
                className="dc-stp"
                disabled={!canBet}
                onClick={() => setBet((b) => Math.min(info.maxBet, b + 50))}
                aria-label="Raise bet"
              >
                +
              </button>
            </div>

            <button
              type="button"
              className="dc-play-btn"
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
              href={`/tg/verify/dice/${lastRoundId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 underline-offset-2 hover:underline"
            >
              verify this round ↗
            </a>
          </>
        ) : (
          <>Provably fair · every round verifiable at /tg/verify/dice/[roundId]</>
        )}
      </p>
    </div>
  );
}
