'use client';

/**
 * Daily Wish wheel — pixel-faithful port of the Gemini "FREE MORBIUS" applet at
 * /Users/kyle/Downloads/daily-wish-casino-wheel/components/CasinoWheel.tsx,
 * adapted so the outcome comes from /api/wheel/spin (provably-fair, server seed
 * committed up-front) instead of Matter.js-random angular velocity. The Matter.js
 * physics is replaced by a requestAnimationFrame spin (accelerate → cruise while
 * the server settles → friction coast onto the winning segment); every other
 * layer (under-lighting, glow halo, rim lights, dashed inner ring, gold pegs,
 * hub, pointer flapper, win modal with confetti, sound engine) is preserved.
 *
 * Segments are HARDCODED here to match server migration 142, so the wheel
 * always renders even when the network is flaky. The server fetch in
 * useEffect is a *sync* — if it succeeds we replace with whatever the rules
 * table says, otherwise we keep using the hardcoded list.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatEther } from 'viem';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { Sparkles, RefreshCw, Volume2, VolumeX, X, Info } from 'lucide-react';
import GlobalMainNav from '@/components/shared/GlobalMainNav';

const apiBase = (): string => {
  const v = process.env.NEXT_PUBLIC_API_URL;
  return v && v.trim() !== '' ? v.trim() : '';
};

// ──────────────────────────────────────────────────────────────────────────
// Sound engine — ported verbatim from the original
// ──────────────────────────────────────────────────────────────────────────
class SoundEngine {
  private ctx: AudioContext | null = null;
  public enabled = true;
  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const W = window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      this.ctx = new (W.AudioContext || W.webkitAudioContext!)();
    }
  }
  /**
   * Create + unlock the AudioContext from inside a user gesture (the SPIN
   * click). Browsers start the context `suspended` unless it's first touched in
   * a gesture, which is why the tick/win/lose sounds were silent or erratic —
   * they were all first triggered from setTimeout/rAF callbacks, never a click.
   */
  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }
  playClick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(900, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.04);
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
    osc.start(); osc.stop(this.ctx.currentTime + 0.04);
  }
  playWin() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.connect(gain); gain.connect(this.ctx!.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.06);
      osc.frequency.exponentialRampToValueAtTime(f * 1.5, now + idx * 0.06 + 0.3);
      gain.gain.setValueAtTime(0, now);
      gain.gain.setValueAtTime(0.12, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.6);
      osc.start(now + idx * 0.06); osc.stop(now + idx * 0.06 + 0.6);
    });
  }
  playLose() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.linearRampToValueAtTime(90, now + 0.5);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.start(); osc.stop(now + 0.5);
  }
}
const sounds = new SoundEngine();

// ──────────────────────────────────────────────────────────────────────────
// Segments — colors + textColor mirror the Gemini original; values + labels
// + prize_wei + weights MUST match server migration 142 (wheel_segments rule).
// The server is still authoritative; we just need a beautiful fallback.
// ──────────────────────────────────────────────────────────────────────────
interface Segment {
  index: number;
  value: string;
  label: string;
  weight: number;
  prize_wei: string;
  free_spins: number;
  color: string;
  textColor: string;
}

const FALLBACK_SEGMENTS: Segment[] = [
  { index: 0,  value: 'NO_WIN',    label: 'TRY AGAIN',      weight: 250, prize_wei: '0',                       free_spins: 0, color: 'rgba(30, 41, 59, 1)',   textColor: '#94a3b8' },
  { index: 1,  value: 'JACKPOT',   label: 'JACKPOT 👑',     weight: 1,   prize_wei: '10000000000000000000000', free_spins: 0, color: 'rgba(124, 58, 237, 1)', textColor: '#f8fafc' },
  { index: 2,  value: '2X',        label: 'MULTIPLIER',     weight: 100, prize_wei: '100000000000000000000',   free_spins: 0, color: 'rgba(13, 148, 136, 1)', textColor: '#f8fafc' },
  { index: 3,  value: 'NO_WIN',    label: 'TRY AGAIN',      weight: 250, prize_wei: '0',                       free_spins: 0, color: 'rgba(30, 41, 59, 1)',   textColor: '#94a3b8' },
  { index: 4,  value: '10X',       label: 'EPIC WIN 💎',    weight: 20,  prize_wei: '1000000000000000000000',  free_spins: 0, color: 'rgba(219, 39, 119, 1)', textColor: '#f8fafc' },
  { index: 5,  value: '5X',        label: 'MEGA WIN ⚡',    weight: 50,  prize_wei: '500000000000000000000',   free_spins: 0, color: 'rgba(217, 119, 6, 1)',  textColor: '#f8fafc' },
  { index: 6,  value: 'NO_WIN',    label: 'TRY AGAIN',      weight: 250, prize_wei: '0',                       free_spins: 0, color: 'rgba(30, 41, 59, 1)',   textColor: '#94a3b8' },
  { index: 7,  value: '3X',        label: 'MULTIPLIER',     weight: 75,  prize_wei: '250000000000000000000',   free_spins: 0, color: 'rgba(220, 38, 38, 1)',  textColor: '#f8fafc' },
  { index: 8,  value: 'FREE_SPIN', label: 'SPIN AGAIN 🎟️',  weight: 30,  prize_wei: '0',                       free_spins: 1, color: 'rgba(79, 70, 229, 1)',  textColor: '#f8fafc' },
  { index: 9,  value: 'NO_WIN',    label: 'TRY AGAIN',      weight: 250, prize_wei: '0',                       free_spins: 0, color: 'rgba(30, 41, 59, 1)',   textColor: '#94a3b8' },
  { index: 10, value: '2X',        label: 'MULTIPLIER',     weight: 100, prize_wei: '100000000000000000000',   free_spins: 0, color: 'rgba(13, 148, 136, 1)', textColor: '#f8fafc' },
  { index: 11, value: '20X',       label: 'SENSATIONAL ✨', weight: 10,  prize_wei: '2500000000000000000000',  free_spins: 0, color: 'rgba(8, 145, 178, 1)',  textColor: '#f8fafc' },
];

// Map server-returned segment (just index/value/label/weight/prize_wei/free_spins)
// to a full Segment by overlaying the fallback's color + textColor for that index.
function mergeServerSegments(server: Omit<Segment, 'color' | 'textColor'>[]): Segment[] {
  const byIdx = new Map(FALLBACK_SEGMENTS.map((s) => [s.index, s] as const));
  return server.map((s) => {
    const local = byIdx.get(s.index) ?? FALLBACK_SEGMENTS[s.index % FALLBACK_SEGMENTS.length];
    return { ...s, color: local.color, textColor: local.textColor };
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Theme — single cyber-neon theme from the original
// ──────────────────────────────────────────────────────────────────────────
const THEME = {
  titleText: 'from-fuchsia-500 via-pink-400 to-cyan-400',
  titleShadow: 'rgba(219, 39, 119, 0.4)',
  buttonGrad: 'from-pink-500 via-fuchsia-500 to-cyan-500',
  buttonBorder: '#be185d',
  buttonShadow: 'rgba(219, 39, 119, 0.4)',
  orb: 'from-indigo-600 to-pink-500',
  sparkles: ['text-pink-400', 'text-fuchsia-500', 'text-cyan-400'],
};

// Spin animation timing. The wheel is driven imperatively (requestAnimationFrame
// writing the transform) so it starts turning the instant SPIN is pressed —
// no waiting on the network. It accelerates to a steady cruise, holds while the
// server settles the outcome, then coasts to a stop under constant deceleration
// (a friction model) that lands exactly on the winning segment.
const SPIN_ACCEL_MS = 600;        // ramp from rest up to cruise speed on press
const SPIN_CRUISE_DPS = 720;      // cruise angular velocity (deg/sec) = 2 rev/s
const SPIN_MIN_PRESPIN_MS = 650;  // beat of cruise even if the server is instant (> ACCEL so v == cruise at release)
const SPIN_MIN_SETTLE_DEG = 1080; // at least 3 full turns of deceleration before landing
const TICK_MIN_GAP_MS = 28;       // throttle peg clicks so the fast part ratchets instead of buzzing

interface SpinResult {
  spinId: string;
  segmentIndex: number;
  segment: { value: string; label: string };
  prizeWei: string;
  freeSpins: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  spinsAvailable: number;
}

interface LedgerEntry {
  id: string;
  delta: number;
  reason: string;
  balance_after: number;
  ref_type: string | null;
  ref_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function formatMorbius(wei: string | bigint): string {
  try {
    const eth = formatEther(typeof wei === 'string' ? BigInt(wei) : wei);
    const n = Number(eth);
    return n >= 1000
      ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } catch {
    return '0';
  }
}

function reasonLabel(r: string): string {
  return ({
    wager_volume_blackjack: 'Blackjack wager',
    wager_volume_blackjack_multi: 'Multi-BJ wager',
    wager_volume_poker: 'Poker wager',
    tournament_entry: 'Tournament entry',
    tournament_cancel_refund: 'Tournament cancelled',
    daily_first_game: 'Daily first play',
    loss_streak_pity: 'Bad luck bonus',
    wheel_spin: 'Wheel spin',
    free_spin_reward: 'Free spin from wheel',
    manual_grant: 'Granted',
  } as Record<string, string>)[r] ?? r;
}

export interface WheelClientProps {
  /** 'page' (default) renders inside GlobalMainNav for the /wheel route. 'modal' overlays the current page from the floating launcher. */
  variant?: 'page' | 'modal';
  /** Called when the user dismisses a modal-mode wheel. Ignored in page mode. */
  onClose?: () => void;
}

export default function WheelClient({ variant = 'page', onClose }: WheelClientProps = {}) {
  const { address, isConnected } = useAccount();

  const [segments, setSegments] = useState<Segment[]>(FALLBACK_SEGMENTS);
  const [spinsAvailable, setSpinsAvailable] = useState(0);
  const [pendingSpinId, setPendingSpinId] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [lastResult, setLastResult] = useState<SpinResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [spinError, setSpinError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [showLedger, setShowLedger] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [mounted, setMounted] = useState(false);

  // The wheel is animated imperatively rather than through a CSS transition tied
  // to React state, so it can start moving the instant SPIN is pressed and land
  // precisely on the winning segment once the server responds — and so the peg
  // clicks can be derived from the *actual* angle each frame instead of a
  // pre-baked (and previously backwards) timer schedule.
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const angleRef = useRef(0);            // live wheel angle in degrees, persists across spins
  const rafRef = useRef<number | null>(null);
  const lastTickAngleRef = useRef(0);    // angle at which the last peg click fired
  const lastTickTimeRef = useRef(0);     // timestamp of last peg click (throttle window)

  // Stable ref callback that re-applies the current angle whenever the wheel
  // node (re)mounts. The Wrap component is recreated on every render, so React
  // remounts this subtree — and a spin pushes a `wheel_balance` WS event that
  // re-renders the launcher mid-spin. Restoring angleRef here keeps the wheel
  // from snapping back to 0° on those remounts; the rAF loop overrides it next
  // frame anyway. useCallback([]) keeps the identity stable so it only fires on
  // real mount/unmount, not every render.
  const attachWheel = useCallback((el: HTMLDivElement | null) => {
    wheelRef.current = el;
    if (el) el.style.transform = `rotate(${angleRef.current}deg)`;
  }, []);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  // Background sync of segments from server. Failure leaves FALLBACK_SEGMENTS
  // in place — the wheel still looks right and still spins correctly.
  useEffect(() => {
    const base = apiBase();
    if (!base) return;
    fetch(`${base}/api/wheel/segments`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (Array.isArray(d?.segments) && d.segments.length === FALLBACK_SEGMENTS.length) {
          setSegments(mergeServerSegments(d.segments));
        }
      })
      .catch(() => { /* keep fallback */ });
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!isConnected) return;
    try {
      const r = await fetch(`${apiBase()}/api/wheel/balance`, { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      setSpinsAvailable(d.spinsAvailable ?? 0);
    } catch { /* noop */ }
  }, [isConnected]);

  useEffect(() => { refreshBalance(); }, [refreshBalance, address]);

  const refreshLedger = useCallback(async () => {
    if (!isConnected) return;
    try {
      const r = await fetch(`${apiBase()}/api/wheel/ledger?limit=30`, { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      setLedger(Array.isArray(d.entries) ? d.entries : []);
    } catch { /* noop */ }
  }, [isConnected]);

  const toggleSound = useCallback(() => {
    sounds.enabled = !soundEnabled;
    setSoundEnabled(!soundEnabled);
  }, [soundEnabled]);

  const ensureCommit = useCallback(async (): Promise<string> => {
    if (pendingSpinId) return pendingSpinId;
    const r = await fetch(`${apiBase()}/api/wheel/commit`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Commit failed');
    const d = await r.json();
    setPendingSpinId(d.spinId);
    return d.spinId as string;
  }, [pendingSpinId]);

  const handleSpin = useCallback(async () => {
    if (isSpinning || !isConnected || spinsAvailable < 1) return;
    sounds.resume();              // unlock audio inside the user gesture — required for any sound to play
    setSpinError(null);
    setShowResult(false);
    setIsSpinning(true);

    const segCount = Math.max(1, segments.length);
    const segDeg = 360 / segCount;
    const startAngle = angleRef.current;
    lastTickAngleRef.current = startAngle;
    lastTickTimeRef.current = 0;

    // Per-spin animation state. `result` is filled in by the network branch
    // below; the rAF loop watches for it and switches from cruise to the
    // friction coast that lands on the winning segment.
    const ctrl = {
      startedAt: performance.now(),
      phase: 'prespin' as 'prespin' | 'settle',
      result: null as SpinResult | null,
      settleFrom: 0,
      settleDist: 0,
      settleV0: 0,        // deg/sec at release (== cruise, so velocity is continuous)
      settleDur: 0,       // ms, derived from distance + v0 (T = 2D/v0)
      settleStartedAt: 0,
    };

    const writeAngle = (deg: number) => {
      angleRef.current = deg;
      const el = wheelRef.current;
      if (el) el.style.transform = `rotate(${deg}deg)`;
    };

    // One click per peg that crosses the pointer, throttled so the fast part of
    // the spin ratchets instead of buzzing. Because it's driven off the live
    // angle, it speeds up and slows down exactly with the wheel — the sound now
    // follows the motion instead of piling up at the end.
    const maybeTick = (now: number) => {
      const gap = angleRef.current - lastTickAngleRef.current;
      if (gap < segDeg) return;
      lastTickAngleRef.current += Math.floor(gap / segDeg) * segDeg;
      if (now - lastTickTimeRef.current >= TICK_MIN_GAP_MS) {
        lastTickTimeRef.current = now;
        sounds.playClick();
      }
    };

    const finishSpin = (result: SpinResult) => {
      rafRef.current = null;
      setLastResult(result);
      setShowResult(true);
      setSpinsAvailable(result.spinsAvailable ?? 0);
      setPendingSpinId(null);
      setIsSpinning(false);
      if (BigInt(result.prizeWei) > 0n || result.freeSpins > 0) {
        sounds.playWin();
        confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 } });
      } else {
        sounds.playLose();
      }
      if (showLedger) refreshLedger();
    };

    const cancelSpin = (message: string) => {
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      setIsSpinning(false);
      setPendingSpinId(null);
      setSpinError(message);
    };

    // Release the wheel from cruise into a constant-deceleration coast that
    // stops exactly on the winning segment. Distance is chosen as the smallest
    // value ≥ SPIN_MIN_SETTLE_DEG that lands on target; duration follows from
    // the friction model T = 2·D / v₀, giving a velocity-continuous handoff.
    const beginSettle = (result: SpinResult) => {
      const centerAngle = result.segmentIndex * segDeg + segDeg / 2;
      const targetMod = (((360 - centerAngle) % 360) + 360) % 360;        // wheel angle that puts seg center under the top pointer
      const from = angleRef.current;
      const minEnd = from + SPIN_MIN_SETTLE_DEG;
      const delta = (((targetMod - (minEnd % 360)) % 360) + 360) % 360;
      ctrl.settleFrom = from;
      ctrl.settleDist = SPIN_MIN_SETTLE_DEG + delta;
      ctrl.settleV0 = SPIN_CRUISE_DPS;
      ctrl.settleDur = (2 * ctrl.settleDist) / SPIN_CRUISE_DPS * 1000;
      ctrl.settleStartedAt = performance.now();
      ctrl.phase = 'settle';
    };

    const A = SPIN_ACCEL_MS / 1000;
    const V = SPIN_CRUISE_DPS;

    const frame = (now: number) => {
      if (ctrl.phase === 'prespin') {
        const elapsed = now - ctrl.startedAt;
        const tSec = elapsed / 1000;
        // accelerate from rest (0.5·a·t²) until cruise, then hold cruise
        const advanced = tSec < A ? 0.5 * (V / A) * tSec * tSec : 0.5 * V * A + V * (tSec - A);
        writeAngle(startAngle + advanced);
        maybeTick(now);
        if (ctrl.result && elapsed >= SPIN_MIN_PRESPIN_MS) beginSettle(ctrl.result);
        rafRef.current = requestAnimationFrame(frame);
        return;
      }
      // settle: x(t) = from + v₀·t − ½·decel·t², decel = v₀/T → stops smoothly at from+dist
      const T = ctrl.settleDur / 1000;
      const tSec = (now - ctrl.settleStartedAt) / 1000;
      if (tSec >= T) {
        writeAngle(ctrl.settleFrom + ctrl.settleDist);  // exact landing
        maybeTick(now);
        finishSpin(ctrl.result!);
        return;
      }
      const decel = ctrl.settleV0 / T;
      writeAngle(ctrl.settleFrom + ctrl.settleV0 * tSec - 0.5 * decel * tSec * tSec);
      maybeTick(now);
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);

    // Fetch the provably-fair outcome in parallel with the spin-up animation.
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      const spinId = await ensureCommit();
      const r = await fetch(`${apiBase()}/api/wheel/spin`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spinId }),
        signal: abort.signal,
      });
      const d = await r.json().catch(() => ({} as Record<string, unknown>));
      if (!r.ok) {
        const code = (d as { code?: string }).code;
        const err = (d as { error?: string }).error;
        cancelSpin(
          code === 'NO_SPINS' ? 'You are out of spins — play a game to earn more.'
            : code === 'NO_SESSION' || code === 'BAD_SESSION' ? 'Session expired — reconnect your wallet and try again.'
            : `Spin failed${err ? `: ${err}` : ''}. Please try again.`,
        );
        return;
      }
      ctrl.result = d as SpinResult;   // rAF loop picks this up and coasts to rest
    } catch {
      cancelSpin('Could not reach the wheel — check your connection and try again.');
    } finally {
      clearTimeout(timeout);
    }
  }, [isSpinning, isConnected, spinsAvailable, ensureCommit, segments, showLedger, refreshLedger]);

  // ──── SVG slice math, ported from the original ────
  const sliceElements = useMemo(() => {
    const radius = 200;
    const cx = 200;
    const cy = 200;
    const n = Math.max(1, segments.length);
    const sliceDeg = 360 / n;
    return segments.map((seg, idx) => {
      const startAngle = idx * sliceDeg;
      const endAngle = startAngle + sliceDeg;
      const radStart = ((startAngle - 90) * Math.PI) / 180;
      const radEnd = ((endAngle - 90) * Math.PI) / 180;
      const x1 = cx + radius * Math.cos(radStart);
      const y1 = cy + radius * Math.sin(radStart);
      const x2 = cx + radius * Math.cos(radEnd);
      const y2 = cy + radius * Math.sin(radEnd);

      const midRad = ((startAngle + sliceDeg / 2 - 90) * Math.PI) / 180;
      const tx = cx + 130 * Math.cos(midRad);
      const ty = cy + 130 * Math.sin(midRad);
      const rotationDeg = startAngle + sliceDeg / 2;

      return (
        <g key={`s-${idx}`}>
          <path
            d={`M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`}
            fill={seg.color}
            stroke="rgba(15, 23, 42, 0.4)"
            strokeWidth={2.5}
          />
          <text
            x={tx}
            y={ty}
            fill={seg.textColor}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(${rotationDeg}, ${tx}, ${ty})`}
            fontSize={10}
            fontWeight={900}
            letterSpacing={0.5}
            className="select-none"
            style={{ textTransform: 'uppercase' }}
          >
            {seg.value}
          </text>
        </g>
      );
    });
  }, [segments]);

  const pegElements = useMemo(() => {
    const n = Math.max(1, segments.length);
    return segments.map((_, idx) => {
      const angle = (idx * 360) / n;
      const rad = ((angle - 90) * Math.PI) / 180;
      const px = 200 + 192 * Math.cos(rad);
      const py = 200 + 192 * Math.sin(rad);
      return <circle key={`p-${idx}`} cx={px} cy={py} r={4} fill="#fef08a" />;
    });
  }, [segments]);

  // 24 rim bulbs around the wheel — chaser pattern via CSS animation-delay
  const rimBulbs = useMemo(
    () =>
      Array.from({ length: 24 }).map((_, idx) => {
        const angle = (idx * 360) / 24;
        const rad = ((angle - 90) * Math.PI) / 180;
        const left = 50 + 46.8 * Math.cos(rad);
        const top = 50 + 46.8 * Math.sin(rad);
        const even = idx % 2 === 0;
        const baseColor = even ? '#ec4899' : '#06b6d4';
        const glow = even
          ? '0 0 10px rgba(236, 72, 153, 0.9), 0 0 20px rgba(236, 72, 153, 0.45)'
          : '0 0 10px rgba(6, 182, 212, 0.9), 0 0 20px rgba(6, 182, 212, 0.45)';
        return (
          <div
            key={`b-${idx}`}
            className="absolute w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              backgroundColor: baseColor,
              boxShadow: glow,
              opacity: isSpinning ? 1 : 0.85,
              animation: `pulse ${isSpinning ? '0.45s' : '1.6s'} ease-in-out ${(idx * 60) % (isSpinning ? 450 : 1600)}ms infinite alternate`,
            }}
          />
        );
      }),
    [isSpinning],
  );

  // Distinct prize tiers for the "How it works" panel — collapsed from the live
  // segment table (duplicate slices summed) and sorted big-money first, so the
  // breakdown always matches whatever the wheel can actually land on.
  const prizeTiers = useMemo(() => {
    const total = segments.reduce((sum, s) => sum + s.weight, 0) || 1;
    const byValue = new Map<string, { value: string; label: string; prizeWei: string; freeSpins: number; weight: number; color: string }>();
    for (const s of segments) {
      const ex = byValue.get(s.value);
      if (ex) ex.weight += s.weight;
      else byValue.set(s.value, { value: s.value, label: s.label, prizeWei: s.prize_wei, freeSpins: s.free_spins, weight: s.weight, color: s.color });
    }
    return Array.from(byValue.values())
      .map((t) => ({ ...t, chance: (t.weight / total) * 100 }))
      .sort((a, b) => {
        const av = BigInt(a.prizeWei), bv = BigInt(b.prizeWei);
        if (av !== bv) return av > bv ? -1 : 1;
        return b.freeSpins - a.freeSpins;
      });
  }, [segments]);

  // Outer wrapper switches between full-page (inside GlobalMainNav, /wheel route)
  // and modal overlay (floating launcher, opens over the current game).
  // Modal mode is intentionally chromeless — no container, no border. The wheel
  // floats on a blurred backdrop with a soft radial halo for depth.
  const Wrap = ({ children }: { children: React.ReactNode }) => {
    if (variant === 'modal') {
      return (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overflow-x-hidden"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% 45%, rgba(15,23,42,0.55) 0%, rgba(2,6,17,0.93) 70%)',
            backdropFilter: 'blur(24px) saturate(1.3)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
          }}
        >
          {/* Stage halo — soft radial that paints depth behind the wheel */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] max-w-[140vw] max-h-[140vw] pointer-events-none rounded-full"
            style={{
              background:
                'radial-gradient(circle, rgba(236,72,153,0.22) 0%, rgba(124,58,237,0.14) 28%, rgba(6,182,212,0.06) 50%, transparent 72%)',
            }}
            aria-hidden
          />

          {/* Ground shadow — flat ellipse beneath the wheel that sells the levitation */}
          <div
            className="absolute left-1/2 -translate-x-1/2 pointer-events-none rounded-full"
            style={{
              top: 'calc(50% + 220px)',
              width: '460px',
              height: '60px',
              background:
                'radial-gradient(ellipse at center, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.35) 40%, transparent 75%)',
              filter: 'blur(14px)',
            }}
            aria-hidden
          />

          {/* Viewport-anchored close X */}
          <button
            onClick={(e) => { e.stopPropagation(); onClose?.(); }}
            className="fixed top-4 right-4 sm:top-6 sm:right-6 z-[101] p-2.5 rounded-full bg-slate-900/40 backdrop-blur-md border border-slate-700/40 text-slate-300 hover:text-white hover:bg-slate-800/70 active:scale-95 transition-all shadow-lg"
            aria-label="Close wheel"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Floating, chromeless content stack */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex flex-col items-center justify-center w-full max-w-[560px] px-4 py-8 select-none"
          >
            {children}
          </div>
        </div>
      );
    }
    return (
      <GlobalMainNav>
        <main className="relative flex flex-col items-center justify-center w-full min-h-[100dvh] overflow-hidden px-4 py-8 bg-[#030712] select-none">
          {children}
        </main>
      </GlobalMainNav>
    );
  };

  if (!mounted) {
    return (
      <Wrap>
        <h1 className={`text-4xl sm:text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-tr ${THEME.titleText} tracking-wider mb-6 md:mb-12 text-center uppercase opacity-50`}>
          Daily Wish
        </h1>
        <div className="w-[310px] sm:w-[420px] md:w-[460px] aspect-square rounded-full border border-slate-800 bg-slate-950/40 flex items-center justify-center">
          <div className="text-slate-500 text-xs font-bold uppercase tracking-widest animate-pulse">Loading game engine…</div>
        </div>
      </Wrap>
    );
  }

  return (
    <Wrap>
      {/* keep the original structure as one fragment of content */}
      <>
        {/* Sound toggle — page mode only; modal already has the viewport close X */}
        {variant === 'page' && (
          <button
            onClick={toggleSound}
            className="absolute top-4 right-4 z-50 p-3 rounded-full bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white cursor-pointer active:scale-95 transition-all shadow-md"
            title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
          >
            {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
        )}

        {/* Background magical glow orb — page mode only (modal has its own stage halo) */}
        {variant === 'page' && (
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] sm:w-[450px] md:w-[600px] h-[280px] sm:h-[450px] md:h-[600px] bg-gradient-to-tr ${THEME.orb} rounded-full blur-[100px] sm:blur-[130px] opacity-25 pointer-events-none`} />
        )}

        {/* Decorative sparkles */}
        <Sparkles className={`absolute top-[8%] right-[10%] ${THEME.sparkles[0]} animate-pulse w-8 h-8 blur-[0.5px]`} />
        <Sparkles className={`absolute bottom-[15%] left-[10%] ${THEME.sparkles[1]} animate-pulse w-6 h-6 blur-[1px]`} />

        {/* Animated shimmering title — floats and shifts gradient across the letters */}
        <h1
          className="relative font-black uppercase tracking-wider z-10 text-center pointer-events-none text-5xl sm:text-6xl md:text-7xl mb-3 md:mb-5"
          style={{
            backgroundImage:
              'linear-gradient(110deg, #d946ef 0%, #ec4899 22%, #f59e0b 50%, #ec4899 78%, #d946ef 100%)',
            backgroundSize: '220% 100%',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 0 28px rgba(219, 39, 119, 0.55))',
            animation: 'wheel-title-shimmer 5s linear infinite, wheel-title-float 3.4s ease-in-out infinite',
          }}
        >
          Daily Wish
        </h1>

        {/* Compact status row — single ghost pill */}
        <div className="z-10 flex items-center gap-2 mb-6 md:mb-8">
          <div className="px-4 py-1.5 rounded-full bg-slate-900/40 backdrop-blur-md border border-slate-700/40 text-xs sm:text-sm text-slate-300 shadow-sm">
            {isConnected
              ? <><span className="font-extrabold text-amber-300 tabular-nums">{spinsAvailable}</span> {spinsAvailable === 1 ? 'spin ready' : 'spins ready'}</>
              : <span className="text-slate-400">Connect to claim spins</span>}
          </div>
          {!isConnected && <ConnectButton showBalance={false} />}
          <button
            onClick={() => setShowInfo(true)}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-slate-900/40 backdrop-blur-md border border-slate-700/40 text-xs sm:text-sm text-slate-300 hover:text-white hover:border-amber-300/40 transition-colors"
          >
            <Info className="w-3.5 h-3.5 text-amber-300" />
            How it works
          </button>
          {isConnected && variant === 'page' && (
            <button
              onClick={() => { setShowLedger((s) => !s); if (!showLedger) refreshLedger(); }}
              className="px-4 py-1.5 rounded-full bg-slate-900/40 backdrop-blur-md border border-slate-700/40 text-xs sm:text-sm text-slate-300 hover:text-white"
            >
              History
            </button>
          )}
        </div>

        {/* Spin error — previously a failed /spin reset silently and the wheel just
            sat there ("not spinning"); now the reason is surfaced. */}
        {spinError && (
          <div className="z-10 -mt-3 mb-5 px-4 py-2 rounded-xl bg-rose-950/70 border border-rose-500/40 text-xs sm:text-sm text-rose-200 max-w-sm text-center">
            {spinError}
          </div>
        )}

        {/* Main wheel container */}
        <div className="relative w-full max-w-[310px] sm:max-w-[420px] md:max-w-[460px] aspect-square z-10 flex items-center justify-center">
          {/* Layer 0: deep 3D ambient shadow cast */}
          <div
            className="absolute rounded-full bg-black/[0.92] pointer-events-none"
            style={{ transform: 'translate(-50%, -50%) translate3d(0px, 14px, 0px)', left: '50%', top: '50%', width: '95%', height: '95%', filter: 'blur(16px)', opacity: 0.88 }}
          />

          {/* Layer 1: core dynamic backlight halo */}
          <div
            className="absolute -z-10 rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(236, 72, 153, 0.48) 0%, rgba(219, 39, 119, 0.28) 45%, rgba(6, 182, 212, 0.12) 65%, transparent 85%)',
              transform: 'translate(-50%, -50%)',
              left: '50%', top: '50%', width: '105%', height: '105%',
              animation: isSpinning ? 'wheel-ambient-pulse-fast 0.6s ease-in-out infinite alternate' : 'wheel-ambient-pulse-slow 4s ease-in-out infinite alternate',
            }}
          />

          {/* Layer 2A: clockwise conic ray beams */}
          <div
            className="absolute -z-20 rounded-full pointer-events-none"
            style={{
              background: 'conic-gradient(from 0deg, transparent, rgba(236, 72, 153, 0.25), transparent, rgba(6, 182, 212, 0.18), transparent)',
              transform: 'translate(-50%, -50%)',
              left: '50%', top: '50%', width: '125%', height: '125%',
              opacity: isSpinning ? 0.45 : 0.22,
              filter: 'blur(16px)',
              animation: isSpinning ? 'wheel-underwheel-spin-fast 4s linear infinite' : 'wheel-underwheel-spin 25s linear infinite',
            }}
          />

          {/* Layer 2B: counter-clockwise conic ray beams */}
          <div
            className="absolute -z-20 rounded-full pointer-events-none"
            style={{
              background: 'conic-gradient(from 180deg, transparent, rgba(6, 182, 212, 0.22), transparent, rgba(192, 38, 211, 0.12), transparent)',
              transform: 'translate(-50%, -50%)',
              left: '50%', top: '50%', width: '120%', height: '120%',
              opacity: isSpinning ? 0.42 : 0.2,
              filter: 'blur(20px)',
              animation: isSpinning ? 'wheel-underwheel-spin-fast 6s linear infinite reverse' : 'wheel-underwheel-spin 35s linear infinite reverse',
            }}
          />

          {/* Layer 3: 3D pedestal bezel glass plate */}
          <div
            className="absolute -z-10 rounded-full pointer-events-none border border-slate-700/30 backdrop-blur-[2px]"
            style={{
              transform: 'translate(-50%, -50%) scale(1.04)',
              left: '50%', top: '50%', width: '100%', height: '100%',
              background: 'radial-gradient(circle, rgba(15, 23, 42, 0.2) 60%, rgba(236, 72, 153, 0.1) 100%)',
              animation: 'wheel-ring-shimmer 4s ease-in-out infinite',
            }}
          />

          {/* Layer 4: floor cast lighting */}
          <div
            className="absolute left-1/2 -bottom-14 w-[112%] h-[40px] pointer-events-none -z-20"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(236, 72, 153, 0.45) 0%, rgba(6, 182, 212, 0.15) 50%, transparent 75%)',
              animation: isSpinning ? 'wheel-floor-cast-spinning 0.6s ease-in-out infinite alternate' : 'wheel-floor-cast-idle 4.5s ease-in-out infinite alternate',
            }}
          />

          {/* Pointer (flapper) */}
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-30 drop-shadow-[0_8px_12px_rgba(0,0,0,0.7)] flex flex-col items-center origin-top pointer-events-none">
            <div className="w-0 h-0 border-l-[16px] border-r-[16px] border-t-[32px] border-l-transparent border-r-transparent border-t-red-500 rounded-b-sm" />
            <div className="w-5 h-5 bg-gradient-to-tr from-yellow-400 to-amber-500 border border-slate-950 rounded-full shadow-lg -mt-8" />
          </div>

          {/* Outer frame */}
          <div className="absolute inset-x-0 inset-y-0 rounded-full border-[8px] sm:border-[12px] border-slate-900 bg-slate-950/40 p-4 shadow-[0_0_50px_rgba(0,0,0,0.8)] flex items-center justify-center">
            {/* Dashed inner ring */}
            <div className="absolute inset-0 rounded-full m-1 border-4 border-dashed border-yellow-400/30 animate-[spin_50s_linear_infinite]" />

            {/* Bulb rim */}
            <div className="absolute inset-0 rounded-full pointer-events-none z-20">{rimBulbs}</div>

            {/* Wheel body — SVG slices, rotated imperatively via attachWheel/wheelRef (see handleSpin) */}
            <div
              ref={attachWheel}
              className="w-full h-full rounded-full overflow-hidden relative shadow-[inset_0_0_30px_rgba(0,0,0,0.9)] border-2 border-slate-800/80 will-change-transform"
            >
              <svg viewBox="0 0 400 400" className="w-full h-full block">
                {sliceElements}
                {pegElements}
                <circle cx={200} cy={200} r={48} fill="#0f172a" stroke="#475569" strokeWidth={3} />
                <circle cx={200} cy={200} r={40} fill="#1e293b" />
              </svg>
            </div>
          </div>

          {/* Centered SPIN button */}
          <div className="absolute z-40">
            <button
              disabled={isSpinning || !isConnected || spinsAvailable < 1}
              onClick={handleSpin}
              className={`group relative w-[80px] h-[80px] md:w-[104px] md:h-[104px] rounded-full border-[3px] sm:border-[4px] bg-gradient-to-tr ${THEME.buttonGrad} hover:scale-[1.08] active:scale-95 transition-all duration-300 outline-none disabled:opacity-60 disabled:hover:scale-100 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center`}
              style={{ borderColor: THEME.buttonBorder, boxShadow: `0 0 30px ${THEME.buttonShadow}, inset 0 4px 10px rgba(255,255,255,0.4)` }}
            >
              <div className="absolute top-1 left-[15%] w-[70%] h-[40%] bg-gradient-to-b from-white/35 to-transparent rounded-t-full pointer-events-none" />
              {isSpinning ? (
                <RefreshCw className="w-7 h-7 sm:w-10 sm:h-10 text-white animate-spin drop-shadow-md" />
              ) : (
                <span className="font-extrabold text-white text-lg sm:text-xl md:text-2xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.65)] uppercase tracking-wide">SPIN</span>
              )}
            </button>
          </div>
        </div>

        {/* Footer hint — page mode only; modal stays chromeless */}
        {variant === 'page' && (
          <p className="mt-10 text-center text-xs sm:text-sm text-slate-400 max-w-md z-10">
            Earn spins by playing <span className="text-amber-300">Blackjack</span>, <span className="text-amber-300">Blackjack Multi</span>, and <span className="text-amber-300">Poker</span> — or by entering tournaments. Spins never expire.
          </p>
        )}

        {/* Result dialog */}
        <AnimatePresence>
          {showResult && lastResult && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${lastResult.segment.value === 'NO_WIN' ? 'bg-black/85' : 'bg-black/60 backdrop-blur-md'}`}
              onClick={() => setShowResult(false)}
            >
              <motion.div
                initial={{ scale: 0.5, y: 50, rotate: -4 }}
                animate={{ scale: 1, y: 0, rotate: 0 }}
                exit={{ scale: 0.5, y: 50, opacity: 0 }}
                transition={{ type: 'spring', bounce: 0.45, duration: 0.65 }}
                onClick={(e) => e.stopPropagation()}
                className={`relative p-8 rounded-[2.5rem] text-center overflow-hidden max-w-sm w-full border-4 shadow-3xl ${
                  lastResult.segment.value === 'NO_WIN'
                    ? 'bg-slate-900 border-slate-700 text-slate-300 shadow-[0_0_50px_rgba(0,0,0,0.85)]'
                    : 'bg-slate-900 border-yellow-500 shadow-[0_0_60px_rgba(255,215,0,0.4)]'
                }`}
              >
                {lastResult.segment.value !== 'NO_WIN' && (
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-500/10 via-slate-900 to-slate-900 pointer-events-none" />
                )}
                <button onClick={() => setShowResult(false)} className="absolute top-3 right-3 text-slate-400 hover:text-white z-10" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>

                <div className="relative z-10 flex flex-col items-center">
                  {lastResult.segment.value !== 'NO_WIN' ? (
                    <div className="relative mb-5">
                      <div className="absolute inset-0 bg-yellow-500 blur-xl opacity-40 rounded-full animate-pulse" />
                      <Sparkles className="w-16 h-16 text-yellow-400 relative animate-bounce" style={{ animationDuration: '2s' }} />
                    </div>
                  ) : (
                    <div className="w-14 h-14 mb-5 rounded-full border-4 border-slate-700 text-slate-500 flex items-center justify-center font-bold text-2xl">!</div>
                  )}

                  <h2 className={`text-sm font-black uppercase tracking-widest mb-1.5 ${lastResult.segment.value === 'NO_WIN' ? 'text-slate-500' : 'text-yellow-400'}`}>
                    {lastResult.segment.value === 'NO_WIN' ? 'Hard luck!' : 'Congratulations!'}
                  </h2>

                  <div
                    className={`text-4xl sm:text-5xl font-black mb-4 tracking-tight ${
                      lastResult.segment.value === 'NO_WIN'
                        ? 'text-slate-400'
                        : 'text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-amber-500 drop-shadow-md'
                    }`}
                  >
                    {lastResult.segment.label}
                  </div>

                  {BigInt(lastResult.prizeWei) > 0n && (
                    <div className="text-2xl sm:text-3xl font-bold text-emerald-300 mb-3">
                      +{formatMorbius(lastResult.prizeWei)} MORBIUS
                    </div>
                  )}
                  {lastResult.freeSpins > 0 && (
                    <div className="text-lg font-semibold text-fuchsia-300 mb-3">+{lastResult.freeSpins} free spin</div>
                  )}

                  <div className="text-xs text-slate-500 mb-4">Spins remaining: {lastResult.spinsAvailable}</div>

                  <a
                    href={`${apiBase()}/api/wheel/verify/${lastResult.spinId}`}
                    target="_blank"
                    rel="noopener"
                    className="text-xs text-cyan-400 hover:text-cyan-300 underline mb-4"
                  >
                    Verify outcome (provably fair)
                  </a>

                  <button
                    onClick={() => setShowResult(false)}
                    className={`w-full py-3.5 font-bold text-lg rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all active:scale-95 cursor-pointer ${
                      lastResult.segment.value === 'NO_WIN'
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-b-4 border-slate-950'
                        : 'bg-gradient-to-b from-yellow-400 to-amber-500 text-amber-950 border-b-4 border-amber-600 font-extrabold'
                    }`}
                  >
                    {lastResult.segment.value === 'NO_WIN' ? 'TRY AGAIN' : 'COLLECT LUXURY!'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* How it works — fun, friendly prize breakdown + how to earn spins */}
        <AnimatePresence>
          {showInfo && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md"
              onClick={() => setShowInfo(false)}
            >
              <motion.div
                initial={{ scale: 0.92, y: 40, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.92, y: 40, opacity: 0 }}
                transition={{ type: 'spring', bounce: 0.32, duration: 0.5 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full sm:max-w-md bg-slate-950/95 border border-amber-300/25 rounded-t-3xl sm:rounded-3xl p-6 max-h-[85vh] overflow-y-auto shadow-[0_0_60px_rgba(236,72,153,0.25)]"
              >
                <button
                  onClick={() => setShowInfo(false)}
                  className="absolute top-4 right-4 text-slate-400 hover:text-white"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-2 mb-1.5">
                  <Sparkles className="w-5 h-5 text-amber-300" />
                  <h3 className="text-lg font-black uppercase tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-pink-400 to-fuchsia-400">
                    How it works
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 mb-5">
                  Spin for a shot at <span className="text-amber-300 font-semibold">MORBIUS</span> prizes. Every spin is provably fair — the outcome is locked in before the wheel even turns.
                </p>

                <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2 flex items-center justify-between px-1">
                  <span>Prize</span>
                  <span>Chance</span>
                </div>
                <ul className="space-y-1.5 mb-5">
                  {prizeTiers.map((t) => {
                    const isWin = t.prizeWei !== '0' || t.freeSpins > 0;
                    return (
                      <li
                        key={t.value}
                        className={`flex items-center gap-2.5 rounded-xl px-3 py-2 border ${isWin ? 'bg-slate-900/60 border-slate-700/50' : 'bg-slate-900/20 border-slate-800/40'}`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: t.color, boxShadow: isWin ? `0 0 8px ${t.color}` : 'none' }}
                          aria-hidden
                        />
                        <span className={`flex-1 min-w-0 truncate text-sm font-bold ${isWin ? 'text-slate-100' : 'text-slate-500'}`}>
                          {t.label}
                        </span>
                        <span className="text-sm font-extrabold tabular-nums whitespace-nowrap text-right">
                          {t.prizeWei !== '0' ? (
                            <>
                              <span className="text-emerald-300">{formatMorbius(t.prizeWei)}</span>
                              <span className="text-[9px] font-semibold text-slate-500 ml-1">MORBIUS</span>
                            </>
                          ) : t.freeSpins > 0 ? (
                            <span className="text-fuchsia-300">+{t.freeSpins} spin</span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </span>
                        <span className="w-12 text-right text-[11px] tabular-nums text-slate-500">
                          {t.chance < 1 ? t.chance.toFixed(2) : t.chance.toFixed(1)}%
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <div className="rounded-xl bg-gradient-to-br from-fuchsia-500/10 to-amber-400/10 border border-amber-300/20 p-3.5">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-amber-300 mb-1">Earning spins</div>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    Play <span className="text-amber-200 font-semibold">Blackjack</span>, <span className="text-amber-200 font-semibold">Blackjack Multi</span>, and <span className="text-amber-200 font-semibold">Poker</span>, or jump into a tournament — the more you play, the more you spin. Spins never expire.
                  </p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ledger drawer */}
        {showLedger && (
          <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm px-4">
            <div className="relative max-w-lg w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 sm:p-6 max-h-[80vh] overflow-y-auto">
              <button
                onClick={() => setShowLedger(false)}
                className="absolute top-3 right-3 text-slate-400 hover:text-white"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-lg font-bold text-amber-300 mb-3">Spin History</h3>
              {ledger.length === 0 ? (
                <div className="text-sm text-slate-500">No spin activity yet.</div>
              ) : (
                <ul className="divide-y divide-slate-800">
                  {ledger.map((e) => (
                    <li key={e.id} className="py-2 flex items-start justify-between gap-3 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="text-slate-200">{reasonLabel(e.reason)}</div>
                        <div className="text-xs text-slate-500">{new Date(e.created_at).toLocaleString()}</div>
                      </div>
                      <div className={`font-bold tabular-nums ${e.delta > 0 ? 'text-emerald-300' : e.delta < 0 ? 'text-rose-300' : 'text-slate-400'}`}>
                        {e.delta > 0 ? '+' : ''}
                        {e.delta}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </>
    </Wrap>
  );
}
