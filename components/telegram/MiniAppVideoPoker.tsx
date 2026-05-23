'use client';

/**
 * MiniAppVideoPoker — MORBIUS Arcade: Video Poker (Jacks or Better).
 *
 * The polished game screen for the Telegram Mini App. Wired to the
 * provably-fair backend:
 *   GET  /api/video-poker/paytable        — bet limits + paytable
 *   POST /api/video-poker/deal            — charge bet, deal a committed hand
 *   POST /api/video-poker/draw            — apply holds, evaluate, pay out
 *   GET  /api/video-poker/verify/:handId  — recover a result after a lost reply
 *
 * Card indices are 0-51: rank = (idx % 13) + 2, suit = floor(idx / 13).
 *
 * Animations (deal fly-in, 3D flips, draw, win burst) and the synthesized
 * sound are driven imperatively via refs — React owns the data, the refs own
 * the motion — so animation timing never fights the render cycle.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { IconArrowLeft } from '@tabler/icons-react';

// ---------------------------------------------------------------------------

interface PaytableInfo {
  minBet: number;
  maxBet: number;
  order: string[];
  names: Record<string, string>;
  paytable: Record<string, number>;
}

interface DrawResult {
  category: string;
  categoryName: string;
  multiplier: number;
  payout: number;
}

type Phase = 'loading' | 'load-error' | 'idle' | 'dealing' | 'dealt' | 'drawing' | 'resolved';

interface MiniAppVideoPokerProps {
  initData: string;
  initialChipBalance: string;
  onBack: () => void;
}

const SUIT_SYM = ['♥', '♦', '♣', '♠'];
const RANK_LABEL = ['', '', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function decodeRank(idx: number): number {
  return (idx % 13) + 2;
}
function decodeSuit(idx: number): number {
  return Math.floor(idx / 13);
}
function isRedSuit(suit: number): boolean {
  return suit === 0 || suit === 1;
}

const VP_CSS = `
.vp-table{position:relative;border-radius:20px;overflow:hidden;
 background:radial-gradient(ellipse 80% 72% at 50% 28%,rgba(6,182,212,0.17),transparent 62%),linear-gradient(180deg,#0c1c30,#081320);
 border:1px solid rgba(6,182,212,0.30);box-shadow:inset 0 0 30px rgba(6,182,212,0.10);}
.vp-glass{background:#0b1a2c;border:1px solid rgba(34,211,238,0.14);}
.vp-pt{display:flex;justify-content:space-between;padding:3px 9px;font-size:11px;border-radius:6px;transition:all .2s;}
.vp-pt .vp-nm{color:#94a3b8;}
.vp-pt .vp-mx{font-variant-numeric:tabular-nums;font-weight:700;color:#22d3ee;}
.vp-pt.vp-win{background:linear-gradient(90deg,#22d3ee,#0891b2);animation:vpPulse 1s ease-in-out infinite;}
.vp-pt.vp-win .vp-nm,.vp-pt.vp-win .vp-mx{color:#04222a;}
@keyframes vpPulse{0%,100%{box-shadow:0 0 0 0 rgba(34,211,238,0);}50%{box-shadow:0 0 15px 2px rgba(34,211,238,0.6);}}
.vp-lifter{width:62px;height:88px;position:relative;transition:transform .22s cubic-bezier(.34,1.5,.6,1);}
.vp-lifter.vp-held{transform:translateY(-14px);filter:drop-shadow(0 0 11px rgba(34,211,238,0.8));}
.vp-card{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .44s cubic-bezier(.45,.05,.25,1);}
.vp-card.vp-flipped{transform:rotateY(180deg);}
.vp-cface{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:8px;
 box-shadow:0 5px 11px rgba(0,0,0,0.55);}
.vp-cback{background:radial-gradient(circle,rgba(34,211,238,0.18) 1px,transparent 1.6px) 0 0/9px 9px,linear-gradient(155deg,#16324f,#0a1626);
 border:1px solid rgba(34,211,238,0.35);display:flex;align-items:center;justify-content:center;}
.vp-cback i{width:28px;height:28px;border:1.5px solid rgba(34,211,238,0.6);border-radius:5px;transform:rotate(45deg);
 display:flex;align-items:center;justify-content:center;}
.vp-cback i::after{content:"";width:10px;height:10px;background:#22d3ee;border-radius:2px;}
.vp-cfront{transform:rotateY(180deg);background:linear-gradient(162deg,#ffffff,#dde6f1);border:1px solid rgba(0,0,0,0.18);}
.vp-cfront.vp-red{color:#e5384f;}
.vp-cfront.vp-blk{color:#1b2436;}
.vp-idx{position:absolute;display:flex;flex-direction:column;align-items:center;line-height:0.92;font-weight:800;}
.vp-idx .vp-r{font-size:13px;}
.vp-idx .vp-s{font-size:10px;}
.vp-tl{top:5px;left:6px;}
.vp-br{bottom:5px;right:6px;transform:rotate(180deg);}
.vp-pip{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:32px;}
.vp-hbadge{position:absolute;top:-11px;left:50%;transform:translateX(-50%) scale(0);transform-origin:bottom;
 background:linear-gradient(135deg,#22d3ee,#06b6d4);color:#04222a;font-size:9px;font-weight:800;letter-spacing:0.08em;
 padding:2px 8px;border-radius:5px;transition:transform .2s cubic-bezier(.34,1.6,.6,1);}
.vp-lifter.vp-held .vp-hbadge{transform:translateX(-50%) scale(1);}
.vp-deal-btn{width:100%;border:none;border-radius:13px;padding:14px;font-size:16px;font-weight:800;letter-spacing:0.04em;
 cursor:pointer;color:#ffffff;background:linear-gradient(135deg,#0891b2,#2563eb);
 box-shadow:0 8px 26px -8px rgba(6,182,212,0.55),0 0 0 1px rgba(34,211,238,0.20);
 transition:filter .15s,transform .1s;}
.vp-deal-btn:not(:disabled):active{transform:scale(0.98);}
.vp-deal-btn:disabled{opacity:0.45;cursor:default;box-shadow:none;}
.vp-stp{width:32px;height:32px;border-radius:9px;border:1px solid rgba(6,182,212,0.30);background:rgba(34,211,238,0.06);
 color:#22d3ee;font-size:18px;cursor:pointer;}
.vp-stp:disabled{opacity:0.3;cursor:default;}
.vp-banner{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%) scale(0.6);opacity:0;pointer-events:none;
 text-align:center;transition:transform .4s cubic-bezier(.34,1.55,.5,1),opacity .3s;z-index:6;}
.vp-banner.vp-show{transform:translate(-50%,-50%) scale(1);opacity:1;}
.vp-banner .vp-bt{font-size:20px;font-weight:800;color:#22d3ee;text-shadow:0 2px 14px rgba(34,211,238,0.75);}
.vp-banner .vp-bp{font-size:15px;font-weight:700;color:#eafbff;margin-top:2px;}
.vp-fx{position:absolute;inset:0;pointer-events:none;z-index:7;}
`;

// ---------------------------------------------------------------------------

export default function MiniAppVideoPoker({
  initData,
  initialChipBalance,
  onBack,
}: MiniAppVideoPokerProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<PaytableInfo | null>(null);
  const [chips, setChips] = useState<number>(() => {
    const n = Number(initialChipBalance);
    return Number.isFinite(n) ? n : 0;
  });
  const [bet, setBet] = useState(100);
  const [hand, setHand] = useState<number[]>([]);
  const [holds, setHolds] = useState<boolean[]>([false, false, false, false, false]);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [muted, setMuted] = useState(false);

  const handIdRef = useRef('');
  const cardRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null, null]);
  const lifterRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null, null]);
  const fxRef = useRef<HTMLCanvasElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const bannerRef = useRef<HTMLDivElement | null>(null);
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
    if (kind === 'flip') {
      noise(t0, 0.07, 0.3, 2800);
      tone(760, t0, 0.045, 'triangle', 0.05);
    } else if (kind === 'hold') {
      tone(340, t0, 0.1, 'sine', 0.2);
      tone(510, t0, 0.07, 'sine', 0.08);
    } else if (kind === 'unhold') {
      tone(210, t0, 0.08, 'sine', 0.13);
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
    const cy = cv.height * 0.46;
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

  // --- load the paytable -----------------------------------------------------

  const loadPaytable = useCallback(async () => {
    setPhase('loading');
    try {
      const res = await fetch('/api/video-poker/paytable');
      const data = (await res.json()) as PaytableInfo & { ok?: boolean };
      if (!res.ok || !data?.ok) {
        setPhase('load-error');
        return;
      }
      setInfo(data);
      setBet((b) => Math.min(data.maxBet, Math.max(data.minBet, b)));
      setPhase('idle');
    } catch {
      setPhase('load-error');
    }
  }, []);

  useEffect(() => {
    void loadPaytable();
  }, [loadPaytable]);

  // Clear pending timers and tear down audio on unmount. The particle loop
  // self-terminates once its canvas leaves the DOM, so it needs no teardown.
  useEffect(() => {
    const timersList = timers.current;
    return () => {
      timersList.forEach((id) => window.clearTimeout(id));
      audioRef.current?.ctx.close().catch(() => {});
    };
  }, []);

  // --- animations ------------------------------------------------------------

  const runDealAnimation = useCallback(() => {
    for (let i = 0; i < 5; i++) {
      const lifter = lifterRefs.current[i];
      const card = cardRefs.current[i];
      if (card) card.classList.remove('vp-flipped');
      if (lifter) {
        lifter.animate(
          [
            { transform: 'translate(150px,-210px) rotate(20deg)', opacity: 0 },
            { transform: 'translate(0,0) rotate(0)', opacity: 1 },
          ],
          { duration: 380, delay: i * 92, easing: 'cubic-bezier(.2,.85,.25,1)', fill: 'backwards' },
        );
      }
      const idx = i;
      after(() => {
        cardRefs.current[idx]?.classList.add('vp-flipped');
        snd('flip');
      }, i * 92 + 300);
    }
    after(() => setPhase('dealt'), 5 * 92 + 360);
  }, [after, snd]);

  const celebrate = useCallback(
    (r: DrawResult) => {
      if (r.payout > 0) {
        const big = r.multiplier >= 25;
        snd(big ? 'bigwin' : 'win');
        burst(big ? 70 : 38);
        const banner = bannerRef.current;
        if (banner) {
          banner.classList.add('vp-show');
          after(() => banner.classList.remove('vp-show'), 2700);
        }
      } else {
        snd('lose');
      }
    },
    [after, burst, snd],
  );

  const runDrawAnimation = useCallback(
    (finalHand: number[], heldMask: boolean[], r: DrawResult, newChips: number) => {
      const replace: number[] = [];
      for (let i = 0; i < 5; i++) if (!heldMask[i]) replace.push(i);

      replace.forEach((i, k) => {
        after(() => {
          cardRefs.current[i]?.classList.remove('vp-flipped');
          snd('flip');
        }, k * 70);
      });

      const downMs = (replace.length ? (replace.length - 1) * 70 : 0) + 440;
      after(() => {
        flushSync(() => setHand(finalHand));
        replace.forEach((i, k) => {
          after(() => {
            cardRefs.current[i]?.classList.add('vp-flipped');
            snd('flip');
          }, k * 82);
        });
        const upMs = (replace.length ? (replace.length - 1) * 82 : 0) + 470;
        after(() => {
          setResult(r);
          setChips(newChips);
          setPhase('resolved');
          celebrate(r);
        }, upMs + 140);
      }, downMs);
    },
    [after, celebrate, snd],
  );

  // --- deal / draw -----------------------------------------------------------

  const onDeal = useCallback(async () => {
    if (!info || phase === 'dealing' || phase === 'drawing' || phase === 'dealt') return;
    if (chips < bet) return;
    ensureAudio();
    setErrorMsg('');
    setPhase('dealing');
    try {
      const res = await fetch('/api/video-poker/deal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, bet }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        handId?: string;
        dealtHand?: number[];
        chipBalance?: string;
        error?: string;
      };
      if (!res.ok || !data?.ok || !data.handId || !data.dealtHand) {
        setErrorMsg(data?.error || 'Could not start the hand.');
        setPhase('idle');
        return;
      }
      handIdRef.current = data.handId;
      flushSync(() => {
        setHand(data.dealtHand as number[]);
        setHolds([false, false, false, false, false]);
        setResult(null);
        if (data.chipBalance != null) setChips(Number(data.chipBalance));
      });
      runDealAnimation();
    } catch {
      setErrorMsg('Could not reach the table. Try again.');
      setPhase('idle');
    }
  }, [info, phase, chips, bet, initData, ensureAudio, runDealAnimation]);

  const onDraw = useCallback(async () => {
    if (phase !== 'dealt' || !info) return;
    const heldMask = holds.slice();
    setErrorMsg('');
    setPhase('drawing');
    try {
      const res = await fetch('/api/video-poker/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, handId: handIdRef.current, holds: heldMask }),
      });
      let data = (await res.json()) as {
        ok?: boolean;
        finalHand?: number[];
        category?: string;
        categoryName?: string;
        multiplier?: number;
        payout?: number;
        resultCategory?: string;
        chipBalance?: string;
        error?: string;
      };
      // If the hand was already resolved (a lost reply / double tap), recover
      // the real outcome from the public verify endpoint instead of guessing.
      if (res.status === 409) {
        const v = await fetch(`/api/video-poker/verify/${handIdRef.current}`);
        const vd = (await v.json()) as {
          ok?: boolean;
          finalHand?: number[];
          resultCategory?: string;
          payout?: number;
        };
        if (v.ok && vd?.ok && vd.finalHand) {
          data = {
            ok: true,
            finalHand: vd.finalHand,
            resultCategory: vd.resultCategory,
            payout: vd.payout,
          };
        }
      }
      const category = data.category || data.resultCategory || 'nothing';
      if (!data?.ok || !data.finalHand) {
        setErrorMsg(data?.error || 'Could not complete the draw. Tap Draw to retry.');
        setPhase('dealt');
        return;
      }
      const r: DrawResult = {
        category,
        categoryName: data.categoryName || info.names[category] || 'No win',
        multiplier: data.multiplier ?? info.paytable[category] ?? 0,
        payout: data.payout ?? 0,
      };
      const newChips = data.chipBalance != null ? Number(data.chipBalance) : chips + r.payout;
      runDrawAnimation(data.finalHand, heldMask, r, newChips);
    } catch {
      setErrorMsg('Could not reach the table. Tap Draw to retry.');
      setPhase('dealt');
    }
  }, [phase, info, holds, initData, chips, runDrawAnimation]);

  const toggleHold = useCallback(
    (i: number) => {
      if (phase !== 'dealt') return;
      setHolds((prev) => {
        const next = prev.slice();
        next[i] = !next[i];
        snd(next[i] ? 'hold' : 'unhold');
        return next;
      });
    },
    [phase, snd],
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      if (audioRef.current) audioRef.current.master.gain.value = next ? 0 : 0.5;
      return next;
    });
  }, []);

  // --- render ----------------------------------------------------------------

  const busy = phase === 'dealing' || phase === 'drawing';
  const canBet = phase === 'idle' || phase === 'resolved';
  const actionLabel =
    phase === 'dealt'
      ? 'Draw'
      : chips < bet && canBet
        ? 'Not enough chips'
        : phase === 'resolved'
          ? 'Deal again'
          : 'Deal';
  const actionDisabled = busy || phase === 'loading' || (canBet && chips < bet) || !info;

  return (
    <div>
      <style>{VP_CSS}</style>

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
            onClick={() => void loadPaytable()}
            className="mt-3 rounded-lg border border-cyan-500/30 px-4 py-2 text-sm text-cyan-400"
          >
            Try again
          </button>
        </div>
      )}

      {info && phase !== 'loading' && phase !== 'load-error' && (
        <div ref={tableRef} className="vp-table p-3.5">
          <canvas ref={fxRef} className="vp-fx" />

          <div className="relative z-[2]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="mitr-bold text-lg leading-none text-white">Video Poker</div>
                <div className="mt-1 text-[9px] tracking-[0.28em] text-cyan-400">JACKS OR BETTER</div>
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

            <div className="vp-glass mb-3 rounded-xl p-1.5">
              {info.order.map((cat) => {
                const win = phase === 'resolved' && result?.category === cat;
                return (
                  <div key={cat} className={`vp-pt${win ? ' vp-win' : ''}`}>
                    <span className="vp-nm">{info.names[cat]}</span>
                    <span className="vp-mx">{info.paytable[cat]}x</span>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center gap-2 px-1 py-4" style={{ perspective: '780px' }}>
              {[0, 1, 2, 3, 4].map((i) => {
                const idx = hand[i];
                const hasCard = typeof idx === 'number';
                const suit = hasCard ? decodeSuit(idx) : 0;
                const rank = hasCard ? decodeRank(idx) : 0;
                return (
                  <div
                    key={i}
                    ref={(el) => {
                      lifterRefs.current[i] = el;
                    }}
                    className={`vp-lifter${holds[i] ? ' vp-held' : ''}`}
                    onClick={() => toggleHold(i)}
                    role="button"
                    aria-label={`Card ${i + 1}`}
                  >
                    <div
                      ref={(el) => {
                        cardRefs.current[i] = el;
                      }}
                      className="vp-card"
                    >
                      <div className="vp-cface vp-cback">
                        <i />
                      </div>
                      <div
                        className={`vp-cface vp-cfront ${hasCard && isRedSuit(suit) ? 'vp-red' : 'vp-blk'}`}
                      >
                        {hasCard && (
                          <>
                            <span className="vp-idx vp-tl">
                              <span className="vp-r">{RANK_LABEL[rank]}</span>
                              <span className="vp-s">{SUIT_SYM[suit]}</span>
                            </span>
                            <span className="vp-pip">{SUIT_SYM[suit]}</span>
                            <span className="vp-idx vp-br">
                              <span className="vp-r">{RANK_LABEL[rank]}</span>
                              <span className="vp-s">{SUIT_SYM[suit]}</span>
                            </span>
                          </>
                        )}
                      </div>
                      <div className="vp-hbadge">HOLD</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mb-3 min-h-[17px] text-center text-xs text-slate-400">
              {errorMsg
                ? errorMsg
                : phase === 'idle'
                  ? 'Place your bet and deal.'
                  : phase === 'dealing'
                    ? 'Dealing…'
                    : phase === 'dealt'
                      ? 'Tap cards to hold, then draw.'
                      : phase === 'drawing'
                        ? 'Drawing…'
                        : result && result.payout > 0
                          ? `${result.categoryName}  ·  +${Math.round(result.payout).toLocaleString('en-US')}`
                          : 'No win this time — deal again.'}
            </div>

            <div className="mb-2.5 flex items-center gap-2.5">
              <span className="flex-1 text-[11px] text-slate-500">Bet</span>
              <button
                type="button"
                className="vp-stp"
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
                className="vp-stp"
                disabled={!canBet}
                onClick={() => setBet((b) => Math.min(info.maxBet, b + 50))}
                aria-label="Raise bet"
              >
                +
              </button>
            </div>

            <button
              type="button"
              className="vp-deal-btn"
              disabled={actionDisabled}
              onClick={() => {
                if (phase === 'dealt') void onDraw();
                else void onDeal();
              }}
            >
              {actionLabel}
            </button>
          </div>

          <div ref={bannerRef} className="vp-banner">
            <div className="vp-bt">{result?.categoryName ?? ''}</div>
            <div className="vp-bp">
              {result ? `+${Math.round(result.payout).toLocaleString('en-US')} chips` : ''}
            </div>
          </div>
        </div>
      )}

      <p className="mt-3 text-center text-[11px] text-slate-600">
        Provably fair · every hand verifiable at /api/video-poker/verify
      </p>
    </div>
  );
}
