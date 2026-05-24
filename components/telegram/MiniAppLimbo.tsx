'use client';

/**
 * MiniAppLimbo — MORBIUS Arcade: Limbo (provably-fair multiplier game).
 *
 * The polished game screen for the Telegram Mini App. Wired to the
 * provably-fair backend:
 *   GET  /api/arcade/limbo/info        — bet/target bounds + house edge
 *   POST /api/arcade/limbo/play        — atomic charge + roll + payout
 *   GET  /api/arcade/limbo/verify/:id  — recover the result after a lost reply
 *
 * Multipliers are stored as integers ×100 end-to-end (so 2.50x ↔ 250) — no
 * float comparisons anywhere in the win decision.
 *
 * Animations (multiplier roll-up, glow, particle burst on win) and the
 * synthesised sound are driven imperatively via refs — React owns the data,
 * the refs own the motion — so timing never fights the render cycle. Same
 * shape and conventions as MiniAppVideoPoker.tsx.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconBolt } from '@tabler/icons-react';

// ---------------------------------------------------------------------------

interface LimboInfo {
  minBet: number;
  maxBet: number;
  minTargetX100: number;
  maxTargetX100: number;
  houseEdgeBp: number;
}

type Phase = 'loading' | 'load-error' | 'idle' | 'rolling' | 'resolved';

interface MiniAppLimboProps {
  initData: string;
  initialChipBalance: string;
  onBack: () => void;
}

const LB_CSS = `
.lb-table{position:relative;border-radius:20px;overflow:hidden;
 background:radial-gradient(ellipse 80% 72% at 50% 28%,rgba(6,182,212,0.17),transparent 62%),linear-gradient(180deg,#0c1c30,#081320);
 border:1px solid rgba(6,182,212,0.30);box-shadow:inset 0 0 30px rgba(6,182,212,0.10);}
.lb-glass{background:#0b1a2c;border:1px solid rgba(34,211,238,0.14);}
.lb-fx{position:absolute;inset:0;pointer-events:none;z-index:7;}
.lb-screen{position:relative;border-radius:18px;padding:24px 14px 22px;text-align:center;overflow:hidden;
 background:radial-gradient(ellipse 75% 70% at 50% 45%,rgba(34,211,238,0.18),transparent 62%),#091627;
 border:1px solid rgba(34,211,238,0.22);box-shadow:inset 0 0 22px rgba(6,182,212,0.16);}
.lb-screen.lb-win{border-color:rgba(34,211,238,0.55);box-shadow:inset 0 0 32px rgba(34,211,238,0.32),0 0 22px rgba(34,211,238,0.35);}
.lb-screen.lb-lose{border-color:rgba(239,68,68,0.35);box-shadow:inset 0 0 22px rgba(239,68,68,0.18);}
.lb-screen.lb-rolling{border-color:rgba(34,211,238,0.45);}
.lb-screen .lb-grid{position:absolute;inset:0;opacity:0.18;pointer-events:none;
 background-image:linear-gradient(rgba(34,211,238,0.18) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,0.18) 1px,transparent 1px);
 background-size:24px 24px;}
.lb-label{position:relative;font-size:10px;font-weight:800;letter-spacing:0.26em;color:#22d3ee;}
.lb-multi{position:relative;margin-top:6px;font-size:56px;font-weight:900;line-height:1;letter-spacing:-0.02em;
 font-variant-numeric:tabular-nums;color:#eafbff;text-shadow:0 0 22px rgba(34,211,238,0.55);transition:color .2s,text-shadow .2s;}
.lb-multi.lb-win{color:#22d3ee;text-shadow:0 0 28px rgba(34,211,238,0.95),0 0 8px rgba(255,255,255,0.6);animation:lbPop .55s cubic-bezier(.34,1.5,.5,1);}
.lb-multi.lb-lose{color:#fca5a5;text-shadow:0 0 18px rgba(239,68,68,0.55);}
@keyframes lbPop{0%{transform:scale(0.86);}55%{transform:scale(1.12);}100%{transform:scale(1);}}
.lb-suffix{font-size:30px;font-weight:800;color:inherit;margin-left:2px;opacity:0.78;}
.lb-tag{position:relative;margin-top:10px;display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:999px;
 border:1px solid rgba(34,211,238,0.35);background:rgba(34,211,238,0.10);font-size:10px;font-weight:800;letter-spacing:0.16em;color:#22d3ee;text-transform:uppercase;}
.lb-tag.lb-tag-win{border-color:rgba(34,211,238,0.65);background:linear-gradient(135deg,rgba(34,211,238,0.28),rgba(6,182,212,0.32));color:#04222a;}
.lb-tag.lb-tag-lose{border-color:rgba(239,68,68,0.45);background:rgba(239,68,68,0.15);color:#fca5a5;}
.lb-stp{width:32px;height:32px;border-radius:9px;border:1px solid rgba(6,182,212,0.30);background:rgba(34,211,238,0.06);
 color:#22d3ee;font-size:18px;cursor:pointer;}
.lb-stp:disabled{opacity:0.3;cursor:default;}
.lb-quick{padding:5px 10px;border-radius:8px;border:1px solid rgba(6,182,212,0.25);background:rgba(34,211,238,0.05);
 color:#9be8f4;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;font-variant-numeric:tabular-nums;}
.lb-quick:hover:not(:disabled){background:rgba(34,211,238,0.12);border-color:rgba(34,211,238,0.45);}
.lb-quick.lb-active{background:linear-gradient(135deg,#0891b2,#2563eb);border-color:transparent;color:#fff;
 box-shadow:0 4px 14px -4px rgba(6,182,212,0.55);}
.lb-quick:disabled{opacity:0.4;cursor:default;}
.lb-play-btn{width:100%;border:none;border-radius:13px;padding:14px;font-size:16px;font-weight:800;letter-spacing:0.04em;
 cursor:pointer;color:#ffffff;background:linear-gradient(135deg,#0891b2,#2563eb);
 box-shadow:0 8px 26px -8px rgba(6,182,212,0.55),0 0 0 1px rgba(34,211,238,0.20);
 transition:filter .15s,transform .1s;}
.lb-play-btn:not(:disabled):active{transform:scale(0.98);}
.lb-play-btn:disabled{opacity:0.45;cursor:default;box-shadow:none;}
.lb-meta{display:flex;justify-content:space-between;padding:4px 0;font-size:11px;color:#94a3b8;}
.lb-meta .lb-mv{color:#eafbff;font-variant-numeric:tabular-nums;font-weight:700;}
`;

// ---------------------------------------------------------------------------

function formatMultiplier(x100: number): { whole: string; suffix: string } {
  const v = x100 / 100;
  // Compact format for very large multipliers (rare on a 1% house edge).
  if (v >= 100_000) {
    return { whole: `${Math.floor(v / 1000).toLocaleString('en-US')}k`, suffix: 'x' };
  }
  return { whole: v.toFixed(2), suffix: 'x' };
}

// Quick-pick target multipliers (×100). 2x is the obvious anchor; 1.5x is the
// classic low-variance pick, 5/10x give the "go for it" feel without being
// silly. All within the server-side bounds (101..10000).
const QUICK_TARGETS_X100 = [150, 200, 300, 500, 1000] as const;

// ---------------------------------------------------------------------------

export default function MiniAppLimbo({
  initData,
  initialChipBalance,
  onBack,
}: MiniAppLimboProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<LimboInfo | null>(null);
  const [chips, setChips] = useState<number>(() => {
    const n = Number(initialChipBalance);
    return Number.isFinite(n) ? n : 0;
  });
  const [bet, setBet] = useState(100);
  const [targetX100, setTargetX100] = useState(200);
  const [displayX100, setDisplayX100] = useState(100);
  const [outcomeX100, setOutcomeX100] = useState<number | null>(null);
  const [outcomeWon, setOutcomeWon] = useState<boolean | null>(null);
  // Tracks the most recent resolved round so the resolved-state footer can deep
  // link to the public verifier (/tg/verify/limbo/[roundId]).
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
    if (kind === 'tick') {
      tone(880, t0, 0.04, 'square', 0.04);
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
      const res = await fetch('/api/arcade/limbo/info');
      const data = (await res.json()) as LimboInfo & { ok?: boolean };
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
  // its canvas leaves the DOM; the multiplier roll-up cancels its own RAF.
  useEffect(() => {
    const timersList = timers.current;
    return () => {
      timersList.forEach((id) => window.clearTimeout(id));
      if (rollRafRef.current != null) cancelAnimationFrame(rollRafRef.current);
      audioRef.current?.ctx.close().catch(() => {});
    };
  }, []);

  // --- animation: roll the screen number up to a final value ---------------
  // A short ramp (~900ms) for losses + small wins; longer (~1500ms) for big
  // wins so the suspense holds. Uses an ease-out curve so the ticker decelerates
  // into the final value.
  const animateMultiplierTo = useCallback(
    (finalX100: number, durationMs: number, onDone: () => void) => {
      if (rollRafRef.current != null) cancelAnimationFrame(rollRafRef.current);
      const startT = performance.now();
      const fromX100 = 100;
      let lastTick = 0;
      const tick = (now: number) => {
        const t = Math.min(1, (now - startT) / durationMs);
        // Ease-out cubic: fast then slows into the final.
        const eased = 1 - Math.pow(1 - t, 3);
        const cur = Math.max(100, Math.round(fromX100 + (finalX100 - fromX100) * eased));
        setDisplayX100(cur);
        // Tick sound: subtle metronome that speeds up as we approach the value.
        if (now - lastTick > 90) {
          snd('tick');
          lastTick = now;
        }
        if (t < 1) {
          rollRafRef.current = requestAnimationFrame(tick);
        } else {
          setDisplayX100(finalX100);
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
    setErrorMsg('');
    setOutcomeX100(null);
    setOutcomeWon(null);
    setLastRoundId(null);
    setDisplayX100(100);
    setPhase('rolling');
    try {
      const res = await fetch('/api/arcade/limbo/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, bet, targetX100 }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        roundId?: string;
        bet?: number;
        targetX100?: number;
        resultX100?: number;
        won?: boolean;
        payout?: number;
        chipBalance?: string;
        error?: string;
      };
      if (!res.ok || !data?.ok || typeof data.resultX100 !== 'number') {
        setErrorMsg(data?.error || 'Could not play the round.');
        setPhase('idle');
        return;
      }
      const finalX100 = data.resultX100;
      const won = data.won === true;
      if (data.roundId) setLastRoundId(data.roundId);
      // Bigger wins get a longer roll-up so the suspense lands.
      const ramp = won
        ? finalX100 >= 2500
          ? 1700
          : finalX100 >= 1000
            ? 1300
            : 1000
        : 900;
      animateMultiplierTo(finalX100, ramp, () => {
        setOutcomeX100(finalX100);
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
  }, [info, phase, chips, bet, targetX100, initData, ensureAudio, animateMultiplierTo, burst, snd]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      if (audioRef.current) audioRef.current.master.gain.value = next ? 0 : 0.5;
      return next;
    });
  }, []);

  // --- derived render values -------------------------------------------------

  const showX100 = phase === 'idle' ? targetX100 : displayX100;
  const showM = formatMultiplier(showX100);
  const winChancePct = info ? (100 * (10_000 - info.houseEdgeBp)) / (100 * targetX100) : 0; // (1-h)/T as %
  // The payout if we land — bet * target/100 floored to whole chips.
  const payoutIfWin = Math.floor((bet * targetX100) / 100);
  const profitIfWin = payoutIfWin - bet;

  const busy = phase === 'rolling' || phase === 'loading';
  const canBet = phase === 'idle' || phase === 'resolved';
  const actionLabel =
    phase === 'rolling'
      ? 'Rolling…'
      : chips < bet && canBet
        ? 'Not enough chips'
        : phase === 'resolved'
          ? 'Play again'
          : 'Play';
  const actionDisabled = busy || (canBet && chips < bet) || !info;

  const screenState =
    phase === 'rolling'
      ? 'lb-rolling'
      : phase === 'resolved'
        ? outcomeWon
          ? 'lb-win'
          : 'lb-lose'
        : '';
  const multiState =
    phase === 'resolved' ? (outcomeWon ? 'lb-win' : 'lb-lose') : '';

  return (
    <div>
      <style>{LB_CSS}</style>

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
        <div ref={tableRef} className="lb-table p-3.5">
          <canvas ref={fxRef} className="lb-fx" />

          <div className="relative z-[2]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="mitr-bold text-lg leading-none text-white">Limbo</div>
                <div className="mt-1 text-[9px] tracking-[0.28em] text-cyan-400">
                  PICK A TARGET · ROLL HIGHER
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

            <div className={`lb-screen ${screenState}`}>
              <div className="lb-grid" aria-hidden />
              <div className="lb-label">
                {phase === 'rolling'
                  ? 'Rolling'
                  : phase === 'resolved'
                    ? outcomeWon
                      ? 'You hit it'
                      : 'Crashed at'
                    : 'Target'}
              </div>
              <div className={`lb-multi ${multiState}`}>
                {showM.whole}
                <span className="lb-suffix">{showM.suffix}</span>
              </div>
              {phase !== 'resolved' && (
                <div
                  className={`lb-tag${phase === 'rolling' ? '' : ''}`}
                  aria-live="polite"
                >
                  <IconBolt size={11} aria-hidden />
                  {winChancePct.toFixed(2)}% chance
                </div>
              )}
              {phase === 'resolved' && outcomeX100 != null && outcomeWon != null && (
                <div className={`lb-tag ${outcomeWon ? 'lb-tag-win' : 'lb-tag-lose'}`}>
                  {outcomeWon
                    ? `+${profitIfWin.toLocaleString('en-US')} chips`
                    : `−${bet.toLocaleString('en-US')} chips`}
                </div>
              )}
            </div>

            <div className="lb-glass mt-3 rounded-xl p-2.5">
              <div className="lb-meta">
                <span>Pays</span>
                <span className="lb-mv">
                  {payoutIfWin.toLocaleString('en-US')} chips
                  <span className="ml-1 text-[10px] font-semibold text-slate-500">
                    (profit {profitIfWin >= 0 ? '+' : ''}
                    {profitIfWin.toLocaleString('en-US')})
                  </span>
                </span>
              </div>
              <div className="lb-meta">
                <span>House edge</span>
                <span className="lb-mv">{(info.houseEdgeBp / 100).toFixed(2)}%</span>
              </div>
            </div>

            <div className="mt-3 mb-2.5 flex items-center gap-2.5">
              <span className="flex-1 text-[11px] text-slate-500">Target</span>
              <button
                type="button"
                className="lb-stp"
                disabled={!canBet}
                onClick={() => {
                  snd('pick');
                  setTargetX100((t) =>
                    Math.max(info.minTargetX100, Math.min(info.maxTargetX100, t - 10)),
                  );
                }}
                aria-label="Lower target"
              >
                &minus;
              </button>
              <span className="min-w-[64px] text-center text-[15px] font-extrabold tabular-nums text-cyan-400">
                {(targetX100 / 100).toFixed(2)}x
              </span>
              <button
                type="button"
                className="lb-stp"
                disabled={!canBet}
                onClick={() => {
                  snd('pick');
                  setTargetX100((t) =>
                    Math.max(info.minTargetX100, Math.min(info.maxTargetX100, t + 10)),
                  );
                }}
                aria-label="Raise target"
              >
                +
              </button>
            </div>

            <div className="mb-3 flex flex-wrap justify-center gap-1.5">
              {QUICK_TARGETS_X100.map((qt) => (
                <button
                  key={qt}
                  type="button"
                  className={`lb-quick${targetX100 === qt ? ' lb-active' : ''}`}
                  disabled={!canBet}
                  onClick={() => {
                    snd('pick');
                    setTargetX100(qt);
                  }}
                >
                  {(qt / 100).toFixed(2)}x
                </button>
              ))}
            </div>

            <div className="mb-3 min-h-[17px] text-center text-xs text-slate-400">
              {errorMsg
                ? errorMsg
                : phase === 'idle'
                  ? 'Place your bet and roll.'
                  : phase === 'rolling'
                    ? 'Rolling the multiplier…'
                    : outcomeWon
                      ? `Cleared ${(targetX100 / 100).toFixed(2)}x  ·  +${profitIfWin.toLocaleString('en-US')} chips`
                      : `Crashed below ${(targetX100 / 100).toFixed(2)}x — try again.`}
            </div>

            <div className="mb-2.5 flex items-center gap-2.5">
              <span className="flex-1 text-[11px] text-slate-500">Bet</span>
              <button
                type="button"
                className="lb-stp"
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
                className="lb-stp"
                disabled={!canBet}
                onClick={() => setBet((b) => Math.min(info.maxBet, b + 50))}
                aria-label="Raise bet"
              >
                +
              </button>
            </div>

            <button
              type="button"
              className="lb-play-btn"
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
              href={`/tg/verify/limbo/${lastRoundId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 underline-offset-2 hover:underline"
            >
              verify this round ↗
            </a>
          </>
        ) : (
          <>Provably fair · every round verifiable at /tg/verify/limbo/[roundId]</>
        )}
      </p>
    </div>
  );
}
