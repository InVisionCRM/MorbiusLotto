'use client';

import React, { useState, useEffect, useRef, useId } from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import { motion, useAnimationControls, useMotionValue, useSpring } from 'framer-motion';
import {
  resolveColorValue,
  angleToSvgCoords,
  parseGradient,
  type GradientDef,
} from '@/lib/gradient-utils';
import { AvatarPatternDefs } from '@/lib/avatar-svg-patterns';
import {
  AVATAR_VIEWBOX,
  AVATAR_VIEWBOX_W,
  AVATAR_VIEWBOX_H,
  avatarMotionOrigin,
} from '@/lib/avatar-viewbox';

export type Emotion =
  | 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'wink'
  | 'dance' | 'flex' | 'jump' | 'spin' | 'think' | 'love' | 'money'
  | 'sick' | 'cool' | 'sleepy' | 'shock' | 'ghost' | 'ninja' | 'king'
  | 'poker' | 'jackpot' | 'chips' | 'cards' | 'dice'
  | 'nod' | 'shrug'
  | 'breathe' | 'lean' | 'tilt';

type HairRgb = { r: number; g: number; b: number };

function parseHexRgb(hex: string): HairRgb | null {
  let s = hex.trim();
  if (s.startsWith('#')) s = s.slice(1);
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixRgb(a: HairRgb, b: HairRgb, t: number): HairRgb {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function rgbaCss(c: HairRgb, a: number): string {
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

/** Mid-tone RGB for hair depth passes (solid hex or blend of gradient endpoints). */
function hairShadeBaseRgb(hairColorRaw: string, gradientDef: GradientDef | null): HairRgb {
  if (gradientDef?.stops?.length) {
    const a = parseHexRgb(gradientDef.stops[0].color);
    const b = parseHexRgb(gradientDef.stops[gradientDef.stops.length - 1].color);
    if (a && b) return mixRgb(a, b, 0.5);
    if (a) return a;
    if (b) return b;
  }
  const c = parseHexRgb(hairColorRaw);
  return c ?? { r: 72, g: 52, b: 40 };
}

/** Split each lock rect into twin strands + part shadow — uses the 48×56 grid for real detail, not just scaled chunks. */
function hairTwinLocks(
  hairFill: string,
  locks: [number, number, number, number][],
  rxScale = 1,
  lockShadow = 'rgba(0,0,0,0.11)',
): React.ReactNode[] {
  return locks.map(([x, y, w, h], i) => {
    const lw = Math.max(0.82, w * 0.36);
    const gap = Math.max(0.16, w - 2 * lw);
    const inset = (w - 2 * lw - gap) / 2;
    const rxv = Math.min(1.12 * rxScale, lw * 0.5);
    const shH = Math.max(1.1, h * 0.33);
    const shY = y + Math.max(0.45, h * 0.06);
    return (
      <g key={i}>
        <rect x={x + inset} y={y} width={lw} height={h} rx={rxv} fill={hairFill} />
        <rect x={x + inset + lw + gap} y={y} width={lw} height={h} rx={rxv} fill={hairFill} />
        <rect x={x + inset + lw * 0.1} y={shY} width={0.42} height={shH} rx={0.1} fill={lockShadow} />
      </g>
    );
  });
}

/**
 * Sits at the neck base / top of torso (neck rect y=34–40, shirt starts y=40), not mid-neck.
 * Short L legs from the lower front corners into the cubic drape.
 */
const NECKLACE_DRAPE = {
  /** Full stroke: corner → drape → corner */
  d: 'M 20 39.75 L 20.08 39.92 C 20.08 49.35 27.92 49.35 27.92 39.92 L 28 39.75',
  /** Cubic segment only (bead samples skip the tiny L legs). */
  p0: [20.08, 39.92],
  p1: [20.08, 49.35],
  p2: [27.92, 49.35],
  p3: [27.92, 39.92],
} as const;

function sampleNecklaceDrape(t: number): [number, number] {
  const [x0, y0] = NECKLACE_DRAPE.p0;
  const [x1, y1] = NECKLACE_DRAPE.p1;
  const [x2, y2] = NECKLACE_DRAPE.p2;
  const [x3, y3] = NECKLACE_DRAPE.p3;
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return [a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3];
}

const NECKLACE_CHAIN_TS = [0.06, 0.18, 0.32, 0.5, 0.68, 0.82, 0.94] as const;

/**
 * SVG `<image href>` needs a bare URL or path — not CSS `url("...")`.
 * Trims whitespace from stored profile JSON.
 */
function normalizeAvatarRasterUrl(raw: string): string {
  let s = raw.trim();
  if (!s) return '';
  if (/^url\s*\(/i.test(s) && s.endsWith(')')) {
    s = s.slice(s.indexOf('(') + 1, -1).trim();
    if (
      (s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))
    ) {
      s = s.slice(1, -1);
    }
  }
  return s.trim();
}

/** Idle between bubblegum cycles (ms). Kept stable so effect deps don’t restart the loop. */
const BUBBLEGUM_CYCLE_IDLE_MS = 60_000;

/** Bubblegum: hidden between cycles; 60s idle → blow → pop + burst. */
function AvatarAnimatedBubblegum() {
  const controls = useAnimationControls();
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const [burstKey, setBurstKey] = useState(0);

  /** Lip midline (matches Thin lips ~32.85); bubble geom center = (24, 32.85). */
  const lipCX = 24;
  const lipCY = 32.85;
  const bubbleSize = 8;
  const bubbleX = lipCX - bubbleSize / 2;
  const bubbleY = lipCY - bubbleSize / 2;

  // Empty deps: do not tie to `controls` — unstable identity would clear the 60s timer every re-run.
  useEffect(() => {
    let cancelled = false;
    const timeoutIds: number[] = [];

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = window.setTimeout(() => resolve(), ms);
        timeoutIds.push(id as unknown as number);
      });

    const loop = async () => {
      while (!cancelled) {
        await sleep(BUBBLEGUM_CYCLE_IDLE_MS);
        if (cancelled) break;

        const c = controlsRef.current;

        // Blow: one continuous tween — opacity catches up quickly
        const blowDur = 4.8 + Math.random() * 3.2;
        const fadeIn = Math.min(0.55, blowDur * 0.18);
        await c.start({
          scale: 2.08,
          opacity: 1,
          transition: {
            scale: {
              duration: blowDur,
              ease: [0.45, 0.02, 0.25, 1],
            },
            opacity: {
              duration: fadeIn,
              ease: [0.33, 0, 0.2, 1],
            },
          },
        });
        if (cancelled) break;

        setBurstKey((k) => k + 1);

        await c.start({
          scale: 3.38,
          rotate: -7,
          transition: { duration: 0.09, ease: [0.2, 0.9, 0.3, 1] },
        });
        if (cancelled) break;
        await c.start({
          scale: 0.12,
          opacity: 0,
          rotate: 0,
          transition: { duration: 0.24, ease: [0.55, 0, 0.95, 0.35] },
        });
      }
    };

    void loop();
    return () => {
      cancelled = true;
      timeoutIds.forEach((id) => window.clearTimeout(id));
      controlsRef.current.stop();
    };
  }, []);

  const burstAngles = [0, 55, 110, 180, 235, 305] as const;

  return (
    <g pointerEvents="none">
      <motion.g
        initial={{ scale: 0.12, opacity: 0, rotate: 0 }}
        animate={controls}
        style={{ transformOrigin: avatarMotionOrigin(lipCX, lipCY) }}
      >
        <rect
          x={bubbleX}
          y={bubbleY}
          width={bubbleSize}
          height={bubbleSize}
          rx={bubbleSize / 2}
          fill="#f472b6"
          opacity="0.92"
        />
        <ellipse
          cx={lipCX - 1.5}
          cy={lipCY - 1.95}
          rx="1.55"
          ry="1.05"
          fill="rgba(255,255,255,0.28)"
        />
      </motion.g>
      {burstKey > 0 ? (
        <g key={burstKey}>
          {burstAngles.map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            const dx = Math.cos(rad) * 8.5;
            const dy = Math.sin(rad) * 7.2;
            return (
              <motion.circle
                key={i}
                r={0.62}
                cx={lipCX}
                cy={lipCY}
                fill={i % 2 === 0 ? '#fbcfe8' : '#ffffff'}
                initial={{ opacity: 0, scale: 0 }}
                animate={{
                  opacity: [0, 1, 0],
                  cx: [lipCX, lipCX + dx * 0.4, lipCX + dx],
                  cy: [lipCY, lipCY + dy * 0.4, lipCY + dy],
                  scale: [0, 1.5, 0.2],
                }}
                transition={{
                  duration: 0.44,
                  ease: [0.25, 0.9, 0.2, 1],
                  times: [0, 0.12, 1],
                }}
              />
            );
          })}
        </g>
      ) : null}
    </g>
  );
}

export default function AvatarPreview({
  config,
  emotion: propEmotion = 'neutral',
  glassesAnimationKey = 0,
  compact = false,
  trackMouse = false,
  forceAsleep = false,
  roamEyes = false,
  className,
}: {
  config: AvatarConfig;
  emotion?: Emotion;
  glassesAnimationKey?: number;
  compact?: boolean;
  /** Enable mouse eye-tracking (for current player at poker table). */
  trackMouse?: boolean;
  /** Force sleep state externally (e.g. sitting-out players). */
  forceAsleep?: boolean;
  /** Randomly roam eyes (for idle non-acting players). */
  roamEyes?: boolean;
  className?: string;
}) {
  const [idleEmotion, setIdleEmotion] = useState<Emotion | null>(null);
  const [isAsleep, setIsAsleep] = useState(false);
  /** Cigar / cigarette / pipe: smoke only during short bursts, not always on. */
  const [smokePuffing, setSmokePuffing] = useState(false);
  const lastActivityRef = useRef(0);
  const svgRef = useRef<SVGSVGElement>(null);

  const mouseX = useSpring(useMotionValue(0), { damping: 20, stiffness: 150 });
  const mouseY = useSpring(useMotionValue(0), { damping: 20, stiffness: 150 });

  const emotion = (isAsleep || forceAsleep) ? 'sleepy' : (idleEmotion || propEmotion);

  // Mouse tracking + idle/sleep — for full-size avatars, or when trackMouse is explicitly set
  useEffect(() => {
    if (compact && !trackMouse) return;
    lastActivityRef.current = Date.now();

    const handleMouseMove = (e: MouseEvent) => {
      lastActivityRef.current = Date.now();
      if (isAsleep) {
        setIsAsleep(false);
        setIdleEmotion('surprised');
        setTimeout(() => setIdleEmotion(null), 500);
      }
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const dx = (e.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2);
        const dy = (e.clientY - (rect.top + rect.height / 2)) / (window.innerHeight / 2);
        mouseX.set(Math.max(-0.8, Math.min(0.8, dx)));
        mouseY.set(Math.max(-0.5, Math.min(0.5, dy)));
      }
    };

    const handleInteraction = () => {
      lastActivityRef.current = Date.now();
      if (isAsleep) {
        setIsAsleep(false);
        setIdleEmotion('surprised');
        setTimeout(() => setIdleEmotion(null), 500);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleInteraction);
    window.addEventListener('keydown', handleInteraction);

    const idleInterval = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityRef.current;
      if (timeSinceActivity > 30000 && !isAsleep) {
        setIsAsleep(true);
        setIdleEmotion(null);
      }
      if (!isAsleep && propEmotion === 'neutral' && !idleEmotion && Math.random() > 0.8) {
        const actions: Emotion[] = ['wink', 'surprised', 'think', 'happy', 'nod', 'shrug', 'breathe', 'lean', 'tilt'];
        const action = actions[Math.floor(Math.random() * actions.length)];
        setIdleEmotion(action);
        const duration =
          action === 'nod' || action === 'shrug' ? 2500 :
          action === 'breathe' || action === 'lean' || action === 'tilt' ? 4000 :
          1000 + Math.random() * 1000;
        setTimeout(() => setIdleEmotion(null), duration);
      }
    }, 2000);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      clearInterval(idleInterval);
    };
  }, [compact, isAsleep, propEmotion, idleEmotion, mouseX, mouseY]);

  // Roaming eye tracking for idle non-acting players
  useEffect(() => {
    if (!roamEyes || forceAsleep) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const look = () => {
      mouseX.set((Math.random() - 0.5) * 1.4);
      mouseY.set((Math.random() - 0.5) * 0.8);
      timeoutId = setTimeout(look, 1400 + Math.random() * 2800);
    };
    timeoutId = setTimeout(look, 600 + Math.random() * 1000);
    return () => clearTimeout(timeoutId);
  }, [roamEyes, forceAsleep, mouseX, mouseY]);

  // Occasional smoke puffs (cigar / cigarette / pipe) — idle between bursts
  useEffect(() => {
    const acc = config.mouthAccessory;
    if (acc !== 'Cigar' && acc !== 'Cigarette' && acc !== 'Pipe') {
      setSmokePuffing(false);
      return;
    }

    let cancelled = false;
    const timeoutIds: number[] = [];

    const after = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timeoutIds.push(id as unknown as number);
    };

    const cycle = () => {
      const idleMs = 5000 + Math.random() * 10000; // 5–15s quiet
      after(() => {
        if (cancelled) return;
        setSmokePuffing(true);
        const puffMs = 2800 + Math.random() * 4200; // ~2.8–7s of smoke
        after(() => {
          if (cancelled) return;
          setSmokePuffing(false);
          cycle();
        }, puffMs);
      }, idleMs);
    };

    cycle();
    return () => {
      cancelled = true;
      timeoutIds.forEach((id) => window.clearTimeout(id));
    };
  }, [config.mouthAccessory]);

  // Unique per-instance gradient ID prefix to avoid SVG ID collisions across multiple AvatarPreviews
  const uid = useId().replace(/:/g, '');

  // Wrapper that also scopes static pattern URL references (url(#tiger) → url(#${uid}tiger))
  const resolveColor = (value: string, gradientId: string) => {
    const result = resolveColorValue(value, gradientId);
    if (!result.gradientDef) {
      const m = result.fill.match(/^url\(#(\w+)\)$/);
      if (m) result.fill = `url(#${uid}${m[1]})`;
    }
    return result;
  };

  const { skinColor, hairStyle, hairColor, eyeShape, eyeColor, lipShape, accessory } = config;

  // Resolve gradient-aware fills for the three color fields
  const skinFill  = resolveColor(skinColor,               `${uid}grad_skin`);
  const hairFill  = resolveColor(hairColor,               `${uid}grad_hair`);
  const hairRgb = hairShadeBaseRgb(hairColor, hairFill.gradientDef);
  const hHi = (mixW: number, opacity: number) =>
    rgbaCss(mixRgb(hairRgb, { r: 255, g: 255, b: 255 }, mixW), opacity);
  const hLo = (mixB: number, opacity: number) =>
    rgbaCss(mixRgb(hairRgb, { r: 0, g: 0, b: 0 }, mixB), opacity);
  const accessoryFill = resolveColor(config.accessoryColor || '#111111', `${uid}grad_accessory`);
  const shirtFill = resolveColor(config.shirtColor || '#3f3f46', `${uid}grad_shirt`);
  const hatFill   = config.hatColor ? resolveColor(config.hatColor, `${uid}grad_hat`) : null;
  const bgStr = (config.backgroundImage ?? '').trim();
  const bgGradDef = bgStr.startsWith('{') ? parseGradient(bgStr) : null;
  const bgRasterHref = bgStr && !bgStr.startsWith('{') ? normalizeAvatarRasterUrl(bgStr) : '';
  const showAvatarBackground = Boolean(bgGradDef || bgRasterHref);
  const overlayRasterHref = normalizeAvatarRasterUrl(config.overlayImage ?? '');
  const sortedStops = (stops: Array<{ color: string; offset: number; opacity: number }>) =>
    [...stops].sort((a, b) => a.offset - b.offset);

  // ── emotion variants ───────────────────────────────────────────────────────

  const eyeVariants = {
    neutral: { scaleY: 1, y: 0 }, happy: { scaleY: 0.3, y: 0 }, sad: { scaleY: 0.8, y: 1 },
    angry: { scaleY: 0.7, y: 0 }, surprised: { scaleY: 1.3, y: -1 }, wink: { scaleY: 1, y: 0 },
    dance: { scaleY: 1 }, flex: { scaleY: 0.8 }, jump: { scaleY: 1.1 }, spin: { scaleY: 1 },
    think: { scaleY: 0.9, y: -1 }, love: { scale: 1.2 }, money: { scaleY: 0.8 },
    sick: { scaleY: 0.4, y: 1 }, cool: { scaleY: 0.2 }, sleepy: { scaleY: 0.1, y: 1 },
    shock: { scaleY: 1.5, scaleX: 1.2 }, ghost: { scaleY: 0.8, opacity: 0.6 },
    ninja: { scaleY: 0.2, y: 0.4 }, king: { scaleY: 1.1 }, poker: { scaleY: 0.6, y: 0.4 },
    jackpot: { scaleY: 0.3, y: 0 }, chips: { scaleY: 1 }, cards: { scaleY: 1 }, dice: { scaleY: 1.2 },
    nod: { scaleY: 1 }, shrug: { scaleY: 1.1, y: -1 },
    breathe: { scaleY: 0.9, y: 0 },
    lean: { scaleY: 0.4, y: 0.6 }, tilt: { scaleY: 0.5, y: 0.6 },
  };

  const rightEyeVariants = {
    neutral: { scaleY: 1, y: 0 }, happy: { scaleY: 0.3, y: 0 }, sad: { scaleY: 0.8, y: 1 },
    angry: { scaleY: 0.7, y: 0 }, surprised: { scaleY: 1.3, y: -1 }, wink: { scaleY: 0.1, y: 0 },
    dance: { scaleY: 1 }, flex: { scaleY: 0.8 }, jump: { scaleY: 1.1 }, spin: { scaleY: 1 },
    think: { scaleY: 1.1, y: 1 }, love: { scale: 1.2 }, money: { scaleY: 0.8 },
    sick: { scaleY: 0.4, y: 1 }, cool: { scaleY: 0.2 }, sleepy: { scaleY: 0.1, y: 1 },
    shock: { scaleY: 1.5, scaleX: 1.2 }, ghost: { scaleY: 0.8, opacity: 0.6 },
    ninja: { scaleY: 0.2, y: 0.4 }, king: { scaleY: 1.1 }, poker: { scaleY: 0.6, y: 0.4 },
    jackpot: { scaleY: 0.3, y: 0 }, chips: { scaleY: 1 }, cards: { scaleY: 1 }, dice: { scaleY: 1.2 },
    nod: { scaleY: 1 }, shrug: { scaleY: 1.1, y: -1 },
    breathe: { scaleY: 0.9, y: 0 },
    lean: { scaleY: 0.3, y: 0.8 }, tilt: { scaleY: 0.5, y: 0.6 },
  };

  const eyebrowLeftVariants = {
    neutral: { y: 0, rotate: 0 }, happy: { y: -2, rotate: 0 }, sad: { y: 0, rotate: -15 },
    angry: { y: 2, rotate: 15 }, surprised: { y: -3, rotate: 0 }, wink: { y: 0, rotate: 0 },
    dance: { y: [0, -2, 0] as number[], transition: { repeat: Infinity, duration: 0.5 } },
    flex: { y: -1, rotate: -10 }, jump: { y: -2 }, spin: { y: 0 },
    think: { y: -2, rotate: -10 }, love: { y: -3, rotate: 5 }, money: { y: -2, rotate: 0 },
    sick: { y: 1, rotate: -5 }, cool: { y: -1, rotate: 0 }, sleepy: { y: 0, rotate: 0 },
    shock: { y: -4, rotate: -20 }, ghost: { y: -2, opacity: 0.5 }, ninja: { y: 2, rotate: 20 },
    king: { y: -2, rotate: 0 }, poker: { y: 1, rotate: 0 }, jackpot: { y: -3, rotate: 0 },
    chips: { y: -1, rotate: 0 }, cards: { y: -1, rotate: 0 }, dice: { y: -2, rotate: 0 },
    nod: { y: [0, 2, 0] as number[], transition: { repeat: Infinity, duration: 2 } }, shrug: { y: -3, rotate: 5 },
    breathe: { y: -1, rotate: 0 },
    lean: { y: 0.6, rotate: -5 }, tilt: { y: 0.4, rotate: -8 },
  };

  const eyebrowRightVariants = {
    neutral: { y: 0, rotate: 0 }, happy: { y: -2, rotate: 0 }, sad: { y: 0, rotate: 15 },
    angry: { y: 2, rotate: -15 }, surprised: { y: -3, rotate: 0 }, wink: { y: 2, rotate: -10 },
    dance: { y: [0, -2, 0] as number[], transition: { repeat: Infinity, duration: 0.5, delay: 0.25 } },
    flex: { y: -1, rotate: 10 }, jump: { y: -2 }, spin: { y: 0 },
    think: { y: 1, rotate: 10 }, love: { y: -3, rotate: -5 }, money: { y: -2, rotate: 0 },
    sick: { y: 1, rotate: 5 }, cool: { y: -1, rotate: 0 }, sleepy: { y: 0, rotate: 0 },
    shock: { y: -4, rotate: 20 }, ghost: { y: -2, opacity: 0.5 }, ninja: { y: 2, rotate: -20 },
    king: { y: -2, rotate: 0 }, poker: { y: 1, rotate: 0 }, jackpot: { y: -3, rotate: 0 },
    chips: { y: -1, rotate: 0 }, cards: { y: -1, rotate: 0 }, dice: { y: -2, rotate: 0 },
    nod: { y: [0, 2, 0] as number[], transition: { repeat: Infinity, duration: 2 } }, shrug: { y: -3, rotate: -5 },
    breathe: { y: -1, rotate: 0 },
    lean: { y: 1, rotate: 10 }, tilt: { y: 0.4, rotate: 8 },
  };

  const mouthVariants = {
    neutral: { scaleY: 1, scaleX: 1, y: 0 }, happy: { scaleY: 1.2, scaleX: 1.2, y: -1 },
    sad: { scaleY: -1, scaleX: 1, y: 2 }, angry: { scaleY: 0.6, scaleX: 0.9, y: 0 },
    surprised: { scaleY: 1, scaleX: 1, y: 0 }, wink: { scaleY: 1, scaleX: 1.1, y: -1, x: 1 },
    dance: { scaleX: [1, 1.3, 1] as number[], transition: { repeat: Infinity, duration: 0.5 } },
    flex: { scaleX: 0.8, scaleY: 0.5 }, jump: { scaleY: 1.5 }, spin: { scale: 1 },
    think: { scaleX: 0.5, scaleY: 0.5, x: -2 }, love: { scale: 1.5, y: -1 },
    money: { scaleX: 1.5, scaleY: 0.3 }, sick: { scaleY: 0.2, rotate: 5 },
    cool: { scaleX: 1.2, scaleY: 0.8 }, sleepy: { scale: 0.4, y: 2 },
    shock: { scale: 2.5, y: 2 }, ghost: { scaleY: 1.5, opacity: 0.4 },
    ninja: { scaleX: 0.1, scaleY: 0.1 }, king: { scaleX: 1.2, scaleY: 0.8 },
    poker: { scaleX: 0.8, scaleY: 0.2 }, jackpot: { scaleX: 1.5, scaleY: 1.2, y: -2 },
    chips: { scaleX: 1, scaleY: 1 }, cards: { scaleX: 1, scaleY: 1 }, dice: { scaleX: 1.2, scaleY: 1.2 },
    nod: { scaleY: [1, 0.8, 1] as number[], transition: { repeat: Infinity, duration: 2 } },
    shrug: { scaleX: 0.8, y: 1 },
    breathe: { scaleX: 1.1, scaleY: 0.6, y: 0 }, lean: { scaleX: 0.9, scaleY: 0.5, x: -1, y: 0.6 },
    tilt: { scaleX: 0.7, scaleY: 0.5, y: 0.4 },
  };

  const faceGroupVariants = {
    neutral: { y: 0, x: 0, rotate: 0, scale: 1 }, happy: { y: -1, x: 0 }, sad: { y: 1, x: 0 },
    angry: { x: [-1, 1, -1, 1, 0] as number[], y: 0, transition: { duration: 0.4 } },
    surprised: { y: -2, x: 0 }, wink: { y: 0, x: 0 },
    dance: { y: [0, -2, 0] as number[], x: [-2, 2, -2] as number[], transition: { repeat: Infinity, duration: 1 } },
    flex: { y: 1, scale: 1.05 }, jump: { y: -4, scale: 0.95 },
    spin: { rotate: 360, transition: { duration: 0.5 } },
    think: { rotate: -5, x: -1 }, love: { scale: 1.1, y: -1 }, money: { y: 1 },
    sick: { y: 2, rotate: 2 }, cool: { y: -1, rotate: -2 }, sleepy: { y: 3, rotate: 5 },
    shock: { scale: 1.2, x: [0, -2, 2, -2, 2, 0] as number[], transition: { repeat: Infinity, duration: 0.2 } },
    ghost: { y: -4, opacity: 0.7 }, ninja: { y: 2, x: 2 }, king: { y: -1 },
    poker: { y: 0, x: 0 }, jackpot: { y: -2, scale: 1.1 },
    chips: { y: 0 }, cards: { y: 0 }, dice: { y: -1 },
    nod: { y: [0, 5, 0, 3, 0] as number[], transition: { repeat: Infinity, duration: 2 } },
    shrug: { y: -3 },
    breathe: { y: [0, -0.4, 0] as number[], transition: { repeat: Infinity, duration: 3, ease: 'easeInOut' as const } },
    lean: { rotate: [0, 8, 0] as number[], transition: { repeat: Infinity, duration: 4, ease: 'easeInOut' as const } },
    tilt: { rotate: [0, -6, 6, 0] as number[], transition: { repeat: Infinity, duration: 6, ease: 'easeInOut' as const } },
  };

  const bodyVariants = {
    neutral: { y: 0, x: 0, rotate: 0, scale: 1, opacity: 1 },
    happy: { y: 0, x: 0 }, sad: { y: 0 }, angry: { y: 0 }, surprised: { y: 0 }, wink: { y: 0 },
    dance: { y: [0, -4, 0] as number[], rotate: [-2, 2, -2] as number[], transition: { repeat: Infinity, duration: 0.8 } },
    flex: { scale: 1.1, y: -2 },
    jump: { y: [0, -16, 0] as number[], scaleY: [1, 0.8, 1.2, 1] as number[], transition: { duration: 0.6 } },
    spin: { rotate: 360, transition: { duration: 0.5 } },
    think: { rotate: -2 }, love: { scale: 1.05, transition: { repeat: Infinity, duration: 0.6, repeatType: 'reverse' as const } },
    money: { y: 2 }, sick: { rotate: 5, y: 4 }, cool: { rotate: -5, x: 4 },
    sleepy: { y: 4, rotate: 3, transition: { repeat: Infinity, duration: 2, repeatType: 'reverse' as const } },
    shock: { x: [0, -1, 1, 0] as number[], transition: { repeat: Infinity, duration: 0.1 } },
    ghost: { y: [0, -8, 0] as number[], opacity: 0.5, transition: { repeat: Infinity, duration: 2 } },
    ninja: { x: [0, 40, -40, 0] as number[], transition: { duration: 0.5 } },
    king: { scale: 1.02 }, poker: { y: 0 }, jackpot: { y: [0, -4, 0] as number[], transition: { repeat: Infinity, duration: 0.5 } },
    chips: { y: 0 }, cards: { y: 0 }, dice: { rotate: [0, 5, -5, 0] as number[], transition: { repeat: Infinity, duration: 1 } },
    nod: { y: [0, -1, 0, -0.6, 0] as number[], transition: { repeat: Infinity, duration: 2 } },
    shrug: { y: [0, -8, -8, 0] as number[], transition: { times: [0, 0.3, 0.5, 1], repeat: Infinity, duration: 2.5 } },
    breathe: { scaleY: [1, 1.06, 1] as number[], y: [0, -1, 0] as number[], transition: { repeat: Infinity, duration: 3, ease: 'easeInOut' as const } },
    lean: { rotate: [0, -18, 0] as number[], x: [0, -6, 0] as number[], transition: { repeat: Infinity, duration: 4, ease: 'easeInOut' as const } },
    tilt: { rotate: [0, 12, -12, 0] as number[], transition: { repeat: Infinity, duration: 6, ease: 'easeInOut' as const } },
  };

  // ── face shape ─────────────────────────────────────────────────────────────

  const getFaceShapeOffsets = () => {
    switch (config.faceShape) {
      /* Ears tuned for small shell geometry: less lateral nudge than old 8×6 slabs (Wide/Slim/Round). */
      case 'Round':      return { eyes: { y: 1, x: 0 }, nose: { y: 1 }, mouth: { y: 1 }, ears: { x: 0.45, y: 0.65 }, head: { y: 0 } };
      case 'Oval':       return { eyes: { y: 1, x: 0 }, nose: { y: 2 }, mouth: { y: 3 }, ears: { x: 0, y: 0.85 }, head: { y: -2 } };
      case 'Heart':      return { eyes: { y: -1, x: 1 }, nose: { y: 0 }, mouth: { y: 1 }, ears: { y: -0.65, x: 0.65 }, head: { y: 0 } };
      case 'Diamond':    return { eyes: { y: 0, x: -1 }, nose: { y: 0 }, mouth: { y: 0 }, ears: { x: -0.65, y: 0 }, head: { y: 0 } };
      case 'Triangle':   return { eyes: { y: 2, x: -1 }, nose: { y: 2 }, mouth: { y: 2 }, ears: { y: 1.65, x: -0.65 }, head: { y: 0 } };
      case 'Inverted Triangle': return { eyes: { y: -2, x: 1 }, nose: { y: -1 }, mouth: { y: -1 }, ears: { y: -1.65, x: 0.65 }, head: { y: 0 } };
      case 'Long':       return { eyes: { y: -1, x: 0 }, nose: { y: 1 }, mouth: { y: 3 }, ears: { y: 0.4, x: 0 }, head: { y: -2 } };
      case 'Wide':       return { eyes: { x: 2, y: 0 }, nose: { y: 0 }, mouth: { y: 0 }, ears: { x: 0.85, y: 0.15 }, head: { y: 2 } };
      case 'Slim':       return { eyes: { x: -2, y: 0 }, nose: { y: 0 }, mouth: { y: 0 }, ears: { x: -0.85, y: 0.15 }, head: { y: 0 } };
      default:           return { eyes: { y: 0, x: 0 }, nose: { y: 0 }, mouth: { y: 0 }, ears: { x: 0, y: 0 }, head: { y: 0 } };
    }
  };
  const offsets = getFaceShapeOffsets();

  /** Hair back/sides: darker same-hue strips (not neutral gray/black). */
  const hairSideShade = (x: number, y: number, w: number, h: number) => (
    <g pointerEvents="none">
      <rect x={x} y={y + 0.7} width={0.84} height={Math.max(0, h - 1)} rx={0.6} fill={hLo(0.32, 0.11)} />
      <rect x={x + w - 0.84} y={y + 0.7} width={0.84} height={Math.max(0, h - 1)} rx={0.6} fill={hLo(0.48, 0.13)} />
    </g>
  );

  /** Torso / neck seam shading — applies to every shirt style uniformly. */
  const renderTorsoFabricFinish = () => (
    <g pointerEvents="none">
      <rect x="8.1" y="41.35" width="0.32" height="11.05" rx={0.05} fill="rgba(0,0,0,0.048)" />
      <rect x="39.58" y="41.35" width="0.32" height="11.05" rx={0.05} fill="rgba(0,0,0,0.078)" />
      {/* Neck seam: slight center dip matches Default shirt crew; still reads ok on flat y=40 shirts */}
      <path d="M 10.2 40.42 Q 24 41.05 37.8 40.42" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.26" strokeLinecap="round" />
      <rect x="10.5" y="54.45" width="27" height="0.3" rx={0.1} fill="rgba(0,0,0,0.06)" />
    </g>
  );

  /** Base face silhouette only — no baked forehead/mouth/cheek overlays (use Makeup / skin gradients instead). */
  const renderFaceShape = (fillColor: string, _detail: 'full' | 'silhouette' = 'full') => {
    switch (config.faceShape) {
      case 'Round':
        /* Forehead lift vs legacy (+3u total): hair sits above skin; outer band tracks inner. */
        return (
          <g fill={fillColor}>
            <rect x="14" y="13" width="20" height="23" rx={1.1} />
            <rect x="12" y="15" width="24" height="19" rx={0.9} />
          </g>
        );
      case 'Oval':
        return (
          <g fill={fillColor}>
            <rect x="14" y="16" width="20" height="22" rx={1} />
            <rect x="16" y="14" width="16" height="2" rx={0.7} />
            <rect x="16" y="38" width="16" height="2" rx={0.7} />
          </g>
        );
      case 'Heart':
        return (
          <g fill={fillColor}>
            <rect x="12" y="16" width="24" height="14" rx={0.9} />
            <rect x="14" y="30" width="20" height="4" rx={0.7} />
            <rect x="18" y="34" width="12" height="2" rx={0.5} />
          </g>
        );
      case 'Diamond':
        return (
          <g fill={fillColor}>
            <rect x="12" y="22" width="24" height="8" rx={0.7} />
            <rect x="14" y="18" width="20" height="4" rx={0.7} />
            <rect x="14" y="30" width="20" height="4" rx={0.7} />
            <rect x="18" y="16" width="12" height="2" rx={0.5} />
            <rect x="18" y="34" width="12" height="2" rx={0.5} />
          </g>
        );
      case 'Triangle':
        return (
          <g fill={fillColor}>
            <rect x="16" y="16" width="16" height="6" rx={0.7} />
            <rect x="14" y="22" width="20" height="6" rx={0.7} />
            <rect x="12" y="28" width="24" height="8" rx={0.9} />
          </g>
        );
      case 'Inverted Triangle':
        return (
          <g fill={fillColor}>
            <rect x="12" y="16" width="24" height="8" rx={0.8} />
            <rect x="14" y="24" width="20" height="6" rx={0.7} />
            <rect x="16" y="30" width="16" height="6" rx={0.7} />
          </g>
        );
      case 'Long':
        return <rect x="14" y="14" width="20" height="24" rx={1} fill={fillColor} />;
      case 'Wide':
        return <rect x="10" y="18" width="28" height="16" rx={1.1} fill={fillColor} />;
      case 'Slim':
        return <rect x="16" y="16" width="16" height="20" rx={0.9} fill={fillColor} />;
      default: // Square — softened "portrait oval"; +1u taller top (forehead under hair) for same chin line
        return <rect x="11.95" y="15.35" width="24.1" height="20.3" rx="2.25" fill={fillColor} />;
    }
  };

  // ── hair ───────────────────────────────────────────────────────────────────

  const renderHairBack = () => {
    const H = hairFill.fill;
    const d = (xs: [number, number, number, number][], r = 1.2) =>
      xs.map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} rx={r} fill={H} />);
    const lockSh = hLo(0.42, 0.12);
    const dTwin = (locks: [number, number, number, number][], rxScale = 1) =>
      hairTwinLocks(H, locks, rxScale, lockSh);
    /** Top band of locs / dread cap — same-hue highlight (applied per style below). */
    const capHi = (x: number, w: number, y = 13.32) => (
      <rect
        x={x + 1.15}
        y={y}
        width={Math.max(2, w - 2.3)}
        height={0.92}
        rx={0.4}
        fill={hHi(0.16, 0.15)}
      />
    );
    switch (hairStyle) {
      case 'Long Straight': return (
        <g>
          {/* Main flowing silhouette — neck gap at center bottom */}
          <path
            d="M 24 11.5 C 29 11.5 34 12 37.5 13.5 C 40 14.5 41.5 16.5 42 19.5 C 42.5 23 42.5 27 42 32 C 41.5 36.5 40.5 40 38.5 42.5 C 36.5 44 34 45 31 45 C 30 45 29.5 42 29 39 C 28.5 37 27 36 24 36 C 21 36 19.5 37 19 39 C 18.5 42 18 45 17 45 C 14 45 11.5 44 9.5 42.5 C 7.5 40 6.5 36.5 6 32 C 5.5 27 5.5 23 6 19.5 C 6.5 16.5 8 14.5 10.5 13.5 C 14 12 19 11.5 24 11.5 Z"
            fill={H}
          />
          {/* Center-back depth shadow */}
          <path
            d="M 18 16 C 16 19 15 24 15 30 C 15 34 16 36 18 36 L 24 36 L 30 36 C 32 36 33 34 33 30 C 33 24 32 19 30 16 Z"
            fill={hLo(0.12, 0.06)}
          />
          {/* Broad left-side highlight */}
          <path d="M 8.5 16 C 7.5 22 7 29 7.5 36 C 8 40 9 42 10.5 43.5" fill="none" stroke={hHi(0.2, 0.14)} strokeWidth={1} strokeLinecap="round" />
          {/* Broad right-side highlight */}
          <path d="M 40 17 C 40.5 23 41 29 40.5 36 C 40 40 39 42 37.5 43.5" fill="none" stroke={hHi(0.15, 0.1)} strokeWidth={0.8} strokeLinecap="round" />
          {/* Left flowing strands */}
          <path d="M 10 15 C 9 21 8.5 28 9 36 C 9.3 40 10 42.5 11.5 44" fill="none" stroke={hLo(0.2, 0.08)} strokeWidth={0.4} strokeLinecap="round" />
          <path d="M 12.5 15 C 11.5 21 11 29 11.5 37 C 11.8 41 12.5 43 14 44.5" fill="none" stroke={hLo(0.18, 0.07)} strokeWidth={0.35} strokeLinecap="round" />
          <path d="M 15 15 C 14 22 13.5 30 14 38 C 14.3 41 15 43 16.5 44.5" fill="none" stroke={hLo(0.14, 0.06)} strokeWidth={0.3} strokeLinecap="round" />
          {/* Right flowing strands */}
          <path d="M 38 15 C 39 21 39.5 28 39 36 C 38.7 40 38 42.5 36.5 44" fill="none" stroke={hLo(0.2, 0.08)} strokeWidth={0.4} strokeLinecap="round" />
          <path d="M 35.5 15 C 36.5 21 37 29 36.5 37 C 36.2 41 35.5 43 34 44.5" fill="none" stroke={hLo(0.18, 0.07)} strokeWidth={0.35} strokeLinecap="round" />
          <path d="M 33 15 C 34 22 34.5 30 34 38 C 33.7 41 33 43 31.5 44.5" fill="none" stroke={hLo(0.14, 0.06)} strokeWidth={0.3} strokeLinecap="round" />
          {/* Secondary inner highlight accents */}
          <path d="M 9.5 20 C 9 26 9 32 9.5 38" fill="none" stroke={hHi(0.14, 0.1)} strokeWidth={0.6} strokeLinecap="round" />
          <path d="M 39 21 C 39.5 27 39.5 32 39 38" fill="none" stroke={hHi(0.12, 0.08)} strokeWidth={0.5} strokeLinecap="round" />
        </g>
      );
      case 'Long Wavy': return (
        <g fill={H}>
          {/* Main mass — neck gap at center bottom */}
          <path
            d="M 9 15 C 8 15 7 15.5 7 17 L 7 32 C 7 36 8 39 10 41 C 11.5 42.5 14 43 17 43 C 18 43 18.5 40 19 38 C 19.5 36.5 21 36 24 36 C 27 36 28.5 36.5 29 38 C 29.5 40 30 43 31 43 C 34 43 36.5 42.5 38 41 C 40 39 41 36 41 32 L 41 17 C 41 15.5 40 15 39 15 Z"
          />
          {d([[5, 19, 3, 5], [5, 26, 3, 5], [5, 33, 3, 5], [40, 19, 3, 5], [40, 26, 3, 5], [40, 33, 3, 5]])}
          {d([[6, 22, 2.4, 3.5], [6, 29.5, 2.4, 3.5], [39.6, 22, 2.4, 3.5], [39.6, 29.5, 2.4, 3.5]], 0.85)}
          {/* Bottom waves — sides only, avoiding neck center */}
          {d([[9, 36, 5, 3], [33, 36, 5, 3]], 0.9)}
          <rect x="9" y="20" width="6" height="4" rx={1.5} fill={hHi(0.2, 0.16)} />
          <rect x="33" y="24" width="6" height="4" rx={1.5} fill={hHi(0.16, 0.13)} />
          {/* Depth under lower waves */}
          <rect x="10" y="31.6" width="7" height="0.55" rx={0.12} fill={hLo(0.35, 0.14)} />
          <rect x="31" y="31.6" width="7" height="0.55" rx={0.12} fill={hLo(0.35, 0.14)} />
          {hairSideShade(7, 15, 34, 21)}
        </g>
      );
      case 'Bob': return (
        <g>
          {/* Main bob silhouette — rounded, ends at chin */}
          <path
            d="M 24 12.5 C 29 12.5 34 13 37 14.5 C 39.5 16 40.5 18 41 21 C 41.5 24 41 27 40 29.5 C 39 31.5 37 33 34 33.5 C 30.5 34 27.5 33.5 24 33 C 20.5 33.5 17.5 34 14 33.5 C 11 33 9 31.5 8 29.5 C 7 27 6.5 24 7 21 C 7.5 18 8.5 16 11 14.5 C 14 13 19 12.5 24 12.5 Z"
            fill={H}
          />
          {/* Center-back depth shadow */}
          <path
            d="M 17 17 C 15.5 19 15 22 15 25 C 15 28 16 30 18 31.5 L 24 32.5 L 30 31.5 C 32 30 33 28 33 25 C 33 22 32.5 19 31 17 Z"
            fill={hLo(0.12, 0.06)}
          />
          {/* Left highlight band */}
          <path d="M 8.5 17 C 8 21 8 25 8.5 28.5 C 9 30.5 10 32 11.5 33" fill="none" stroke={hHi(0.18, 0.12)} strokeWidth={0.7} strokeLinecap="round" />
          {/* Right highlight band */}
          <path d="M 39.5 18 C 40 22 40 25 39.5 28 C 39 30 38 31.5 36.5 32.5" fill="none" stroke={hHi(0.14, 0.1)} strokeWidth={0.6} strokeLinecap="round" />
          {/* Strand lines */}
          <path d="M 10 16 C 9 20 8.5 24 9 28 C 9.3 30 10 31.5 11.5 32.5" fill="none" stroke={hLo(0.18, 0.07)} strokeWidth={0.35} strokeLinecap="round" />
          <path d="M 38 16 C 39 20 39.5 24 39 28 C 38.7 30 38 31.5 36.5 32.5" fill="none" stroke={hLo(0.18, 0.07)} strokeWidth={0.35} strokeLinecap="round" />
          <path d="M 13 16 C 12 20 11.5 24 12 28 C 12.3 30 13 31.5 14.5 32.5" fill="none" stroke={hLo(0.14, 0.06)} strokeWidth={0.3} strokeLinecap="round" />
          <path d="M 35 16 C 36 20 36.5 24 36 28 C 35.7 30 35 31.5 33.5 32.5" fill="none" stroke={hLo(0.14, 0.06)} strokeWidth={0.3} strokeLinecap="round" />
          {/* Bottom curl-under shadow */}
          <path d="M 12 32 C 16 33.5 20 34 24 33.5 C 28 34 32 33.5 36 32" fill="none" stroke={hLo(0.25, 0.1)} strokeWidth={0.5} strokeLinecap="round" />
        </g>
      );
      case 'Ponytail': {
        const tie = '#22c55e';
        return (
          <g>
            {/* Single tail — same language as pigtails back: out, down, taper in; highlight outside, shadow inside */}
            <path
              d="M 32.4 17.6 L 30.2 17 C 26.2 17.4 23.4 20.6 22.4 25.8 C 21.4 30.4 21.6 34.8 23.4 38 C 25 40.6 27.8 42.1 30.8 41.9 L 32.6 40.4 C 30.8 39 29.6 36.5 29.8 33.4 C 30.2 29.2 32 25.5 34.8 23.2 C 36.4 21.8 35.4 19.5 33.8 18.2 L 32.4 17.6 Z"
              fill={H}
            />
            <path
              d="M 23.2 24.8 C 22.6 29.2 23 33.4 24.6 36.6"
              fill="none"
              stroke={hHi(0.3, 0.32)}
              strokeWidth={0.65}
              strokeLinecap="round"
            />
            <path
              d="M 33.2 19.5 Q 31.2 26.5 30.8 33.2"
              fill="none"
              stroke={hLo(0.45, 0.2)}
              strokeWidth={0.5}
              strokeLinecap="round"
            />
            <rect x="30.6" y="16.95" width="2.65" height="0.95" rx={0.35} fill={tie} transform="rotate(-20 31.9 17.4)" />
            <rect x="30.85" y="17.1" width="2.2" height="0.34" rx={0.12} fill="rgba(255,255,255,0.22)" transform="rotate(-20 31.9 17.4)" />
          </g>
        );
      }
      case 'Dreadlocks': {
        const dHi = hHi(0.26, 0.2);
        const dLo = hLo(0.48, 0.18);
        const dDeep = hLo(0.6, 0.12);
        /* Dreadloc with twist-band texture via dashed strokes + extra depth shadow */
        const loc = (d: string, w: number, k: string) => (
          <g key={k}>
            <path d={d} fill="none" stroke={H} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
            <path d={d} fill="none" stroke={dLo} strokeWidth={w * 0.82} strokeLinecap="butt" strokeDasharray={`${w * 0.3} ${w * 0.52}`} />
            <path d={d} fill="none" stroke={dDeep} strokeWidth={w * 0.4} strokeLinecap="butt" strokeDasharray={`${w * 0.18} ${w * 0.72}`} strokeDashoffset={w * 0.35} />
            <path d={d} fill="none" stroke={dHi} strokeWidth={w * 0.14} strokeLinecap="round" strokeDasharray={`${w * 0.38} ${w * 0.92}`} strokeDashoffset={w * 0.22} />
          </g>
        );
        return (
          <g>
            {/* Scalp mass */}
            <path
              d="M 24 11.5 C 16 11.5 8 14.5 7 21 C 6.5 25 7 30 8 34 L 9.5 35 C 9 30 9.5 24 11 19 L 24 16.5 L 37 19 C 38.5 24 39 30 38.5 35 L 41 34 C 42 30 42.5 25 42 21 C 41 14.5 33 11.5 24 11.5 Z"
              fill={H}
            />
            {/* Left locs — S-curves with curling tips, varied lengths */}
            {loc('M 6 16 C 3 20 0.5 27 1 34 C 1.5 39 3 44 5 47 C 6.5 48 7 46.5 6 45', 3.5, 'lb0')}
            {loc('M 7.5 15 C 5 20 3 26 3.5 33 C 4 38 5.5 42 7.5 44 C 8.5 44.5 9 43.5 8 42', 3.2, 'lb1')}
            {loc('M 9.5 14.5 C 7.5 19 6 25 7 32 C 7.5 36 9 40 11 42 C 12 42.5 12 41 11 40', 3, 'lb2')}
            {loc('M 11.5 14 C 10 18 9 23 10 30 C 10.5 34 12 38 14 40 C 15 40.5 15 39 14 38', 2.8, 'lb3')}
            {loc('M 14 14 C 13 18 12 22 13 28 C 13.5 31 14.5 33 15.5 34', 2.5, 'lb4')}
            {loc('M 16 14.5 C 15.5 18 15 22 16 27 C 16.5 30 17.5 33 18.5 35', 2.3, 'lb5')}
            {/* Right locs — mirrored, rb1 runs longer for asymmetry */}
            {loc('M 42 16 C 45 20 47.5 27 47 34 C 46.5 39 45 43 43 45 C 41.5 46 41 44.5 42 43', 3.5, 'rb0')}
            {loc('M 40.5 15 C 43 20 45 26 44.5 34 C 44 39 42.5 44 40.5 46 C 39.5 47 39 45.5 40 44', 3.2, 'rb1')}
            {loc('M 38.5 14.5 C 40.5 19 42 25 41 32 C 40.5 36 39 40 37 42 C 36 42.5 36 41 37 40', 3, 'rb2')}
            {loc('M 36.5 14 C 38 18 39 23 38 30 C 37.5 34 36 38 34 40 C 33 40.5 33 39 34 38', 2.8, 'rb3')}
            {loc('M 34 14 C 35 18 36 22 35 28 C 34.5 32 33 35 31.5 37 C 31 37.5 31 36.5 31.5 36', 2.5, 'rb4')}
            {loc('M 32 14.5 C 32.5 18 33 22 32 27 C 31.5 30 30.5 33 29.5 35', 2.3, 'rb5')}
            {/* Center-back locs — shorter, neck gap */}
            {loc('M 19 15 C 18 19 17 24 18 29 C 18.5 32 19 34 19.5 35', 2.2, 'cb0')}
            {loc('M 22 15.5 C 21.5 19 21 23 21.5 27 C 22 29 22.5 30.5 23 31', 2, 'cb1')}
            {loc('M 26 15.5 C 26.5 19 27 23 26.5 27 C 26 29 25.5 30.5 25 31', 2, 'cb2')}
            {loc('M 29 15 C 30 19 31 24 30 29 C 29.5 32 29 34 28.5 35', 2.2, 'cb3')}
            {/* Crown highlight */}
            <path d="M 10 13 C 15 11.5 20 11 24 11 C 28 11 33 11.5 38 13" fill="none" stroke={dHi} strokeWidth={1.2} strokeLinecap="round" opacity={0.8} />
          </g>
        );
      }
      case 'Dreadlocks V1': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={1.8} />
          {capHi(9, 30)}
          {dTwin([[11, 18, 4, 20], [17, 18, 4, 22], [23, 18, 4, 22], [29, 18, 4, 20]])}
        </g>
      );
      case 'Dreadlocks V2': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={1.8} />
          {capHi(9, 30)}
          {dTwin([[11, 18, 4, 18], [17, 18, 4, 20], [23, 18, 4, 20], [29, 18, 4, 18]])}
          <rect x="18" y="26" width="4" height="3" rx={0.8} fill="#f59e0b" />
          <rect x="24" y="30" width="4" height="3" rx={0.8} fill="#22c55e" />
        </g>
      );
      case 'Dreadlocks V3': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[5, 18, 4, 20], [11, 18, 4, 22], [17, 18, 4, 20], [23, 18, 4, 20], [29, 18, 4, 22], [35, 18, 4, 20]])}
        </g>
      );
      case 'Dreadlocks V4': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[5, 18, 4, 18], [11, 18, 4, 20], [17, 18, 4, 20], [23, 18, 4, 20], [29, 18, 4, 20], [35, 18, 4, 18]])}
          <rect x="12" y="26" width="4" height="3" rx={0.8} fill="#ef4444" />
          <rect x="30" y="28" width="4" height="3" rx={0.8} fill="#f59e0b" />
        </g>
      );
      case 'Dreadlocks V5': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={1.8} />
          {capHi(9, 30)}
          {dTwin([[11, 18, 4, 18], [17, 18, 4, 20], [23, 18, 4, 20], [29, 18, 4, 18]])}
          {dTwin([[9.2, 19, 2.6, 14], [36.2, 19, 2.6, 14]], 0.75)}
        </g>
      );
      case 'Dreadlocks V6': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={1.8} />
          {capHi(9, 30)}
          {dTwin([[11, 18, 4, 24], [17, 18, 4, 26], [23, 18, 4, 26], [29, 18, 4, 24]])}
        </g>
      );
      case 'Dreadlocks V7': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={1.8} />
          {capHi(9, 30)}
          {dTwin([[11, 18, 4, 24], [17, 18, 4, 26], [23, 18, 4, 26], [29, 18, 4, 24]])}
          <rect x="18" y="34" width="4" height="3" rx={0.8} fill="#f59e0b" />
          <rect x="24" y="36" width="4" height="3" rx={0.8} fill="#22c55e" />
        </g>
      );
      case 'Dreadlocks V8': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[5, 18, 4, 24], [11, 18, 4, 22], [17, 18, 4, 24], [23, 18, 4, 24], [29, 18, 4, 22], [35, 18, 4, 24]])}
        </g>
      );
      case 'Dreadlocks V9': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[3, 18, 4, 24], [9, 18, 4, 22], [15, 18, 4, 24], [21, 18, 4, 24], [27, 18, 4, 22], [33, 18, 4, 22], [39, 18, 4, 24]])}
        </g>
      );
      case 'Dreadlocks V10': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[5, 18, 4, 22], [11, 18, 4, 24], [17, 18, 4, 26], [23, 18, 4, 26], [29, 18, 4, 24], [35, 18, 4, 22]])}
          <rect x="18" y="32" width="4" height="3" rx={0.8} fill="#ef4444" />
          <rect x="24" y="34" width="4" height="3" rx={0.8} fill="#f59e0b" />
        </g>
      );
      case 'Locks V1': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={2} />
          {capHi(9, 30)}
          {dTwin([[12, 18, 3.5, 18], [18, 18, 3.5, 20], [24, 18, 3.5, 20], [30, 18, 3.5, 18]], 0.92)}
        </g>
      );
      case 'Locks V2': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[8, 18, 3.5, 20], [14, 18, 3.5, 22], [20, 18, 3.5, 20], [26, 18, 3.5, 20], [32, 18, 3.5, 22], [36.5, 18, 3.5, 20]], 0.92)}
        </g>
      );
      case 'Locks V3': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={2} />
          {capHi(9, 30)}
          {dTwin([[12, 18, 3.5, 22], [18, 18, 3.5, 24], [24, 18, 3.5, 24], [30, 18, 3.5, 22]], 0.92)}
        </g>
      );
      case 'Locks V4': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[5, 18, 3.5, 22], [11, 18, 3.5, 24], [17, 18, 3.5, 22], [23, 18, 3.5, 22], [29, 18, 3.5, 24], [35, 18, 3.5, 22]], 0.92)}
        </g>
      );
      case 'Locks V5': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={2} />
          {capHi(9, 30)}
          {dTwin([[10, 18, 3.5, 20], [16, 18, 3.5, 22], [22, 18, 3.5, 24], [28, 18, 3.5, 22], [34, 18, 3.5, 20]], 0.92)}
        </g>
      );
      case 'Locks V6': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={2} />
          {capHi(9, 30)}
          {dTwin([[12, 18, 3.5, 24], [18, 18, 3.5, 26], [24, 18, 3.5, 26], [30, 18, 3.5, 24]], 0.92)}
        </g>
      );
      case 'Locks V7': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[5, 18, 3.5, 24], [11, 18, 3.5, 26], [17, 18, 3.5, 24], [23, 18, 3.5, 24], [29, 18, 3.5, 26], [35, 18, 3.5, 24]], 0.92)}
        </g>
      );
      case 'Locks V8': return (
        <g fill={H}>
          <rect x="9" y="13" width="30" height="5" rx={2} />
          {capHi(9, 30)}
          {dTwin([[8, 18, 3.5, 22], [14, 18, 3.5, 24], [20, 18, 3.5, 26], [26, 18, 3.5, 24], [32, 18, 3.5, 22]], 0.92)}
        </g>
      );
      case 'Locks V9': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[3, 18, 3.5, 24], [9, 18, 3.5, 24], [15, 18, 3.5, 26], [21, 18, 3.5, 24], [27, 18, 3.5, 24], [33, 18, 3.5, 24], [39, 18, 3.5, 24]], 0.92)}
        </g>
      );
      case 'Locks V10': return (
        <g fill={H}>
          <rect x="7" y="13" width="34" height="5" rx={2} />
          {capHi(7, 34)}
          {dTwin([[5, 18, 3.5, 24], [11, 18, 3.5, 26], [17, 18, 3.5, 28], [23, 18, 3.5, 28], [29, 18, 3.5, 26], [35, 18, 3.5, 24]], 0.92)}
        </g>
      );
      case 'Afro': {
        /*
         * Single mass only (no hair-front layer): face + ears paint on top of the center; outline is the dome itself.
         * Curved bottom: stepped arc (center y higher on screen than corners) — not a flat horizontal cut.
         * Texture: mirrored 2×1 / 1×2 clusters only — no stroke ring.
         */
        /* Outline includes small outward steps so "fringe" is part of the same fill — no detached 1×1 rects. */
        const afroD =
          'M 4 28 L 4 25 3 25 3 20 2 20 2 18 3 18 3 16 4 13 5 10 6 8 8 6 10 5 11 4 11 3 12 3 13 4 14 3 16 3 18 3 20 3 22 3 24 3 L 26 3 28 3 30 3 32 3 34 3 36 4 37 3 37 4 38 5 40 6 42 8 43 10 44 13 45 16 46 16 46 18 46 20 45 20 L 44 23 44 26 43 27 41 28 38 27 35 26 32 25 28 24 24 24 20 24 16 25 13 26 10 27 7 28 L 4 28 Z';
        const afroHi = hHi(0.32, 0.24);
        const afroLo = hLo(0.36, 0.16);
        const afroHiL: [number, number, number, number][] = [
          [14, 6, 2, 1], [10, 7, 2, 1], [13, 10, 2, 1], [18, 12, 1, 2], [20, 9, 2, 1], [22, 6, 2, 1],
        ];
        const afroLoL: [number, number, number, number][] = [
          [16, 21, 2, 1], [13, 25, 2, 1],
        ];
        const mirrorPair = (cells: [number, number, number, number][], fill: string, prefix: string) =>
          cells.flatMap(([x, y, w, h], i) => {
            const mx = 48 - x - w;
            const els = [<rect key={`${prefix}-l-${i}`} x={x} y={y} width={w} height={h} fill={fill} />];
            if (mx !== x) els.push(<rect key={`${prefix}-r-${i}`} x={mx} y={y} width={w} height={h} fill={fill} />);
            return els;
          });
        return (
          <g>
            <path d={afroD} fill={H} />
            {mirrorPair(afroHiL, afroHi, 'af')}
            {mirrorPair(afroLoL, afroLo, 'aflo')}
          </g>
        );
      }
      case 'Mullet': return (
        <g>
          <rect x="7" y="22" width="34" height="16" rx={2} fill={H} />
          <rect x="10" y="24" width="10" height="3" rx={1} fill={hHi(0.18, 0.16)} />
          <rect x="14" y="28" width="20" height="8" rx={1.5} fill={hLo(0.2, 0.09)} />
          {[9, 12, 15, 18, 38, 35, 32].map((sx) => (
            <rect key={sx} x={sx} y="25" width="0.36" height="10" rx={0.1} fill={hLo(0.32, 0.16)} />
          ))}
          {hairSideShade(7, 22, 34, 16)}
        </g>
      );
      case 'Pigtails': {
        const tie = '#22c55e';
        return (
          <g>
            {/* Chunky tail: steps outward, then down & slightly in — ends ~chin; outer edge reads lighter */}
            <path
              d="M 11.4 18.8 L 9.2 18.4 C 5.8 18.6 3.2 21.2 2.2 25.5 C 1.2 30 1.4 34.2 3 37.2 C 4.2 39.5 6.5 40.8 8.8 40.6 L 10.2 39.2 C 8.6 38 7.6 35.8 7.8 33.2 C 8.2 29.5 9.8 26 12.4 23.5 C 13.8 22.2 12.8 20 11.4 18.8 Z"
              fill={H}
            />
            <path
              d="M 36.6 18.8 L 38.8 18.4 C 42.2 18.6 44.8 21.2 45.8 25.5 C 46.8 30 46.6 34.2 45 37.2 C 43.8 39.5 41.5 40.8 39.2 40.6 L 37.8 39.2 C 39.4 38 40.4 35.8 40.2 33.2 C 39.8 29.5 38.2 26 35.6 23.5 C 34.2 22.2 35.2 20 36.6 18.8 Z"
              fill={H}
            />
            <path
              d="M 2.8 24.5 C 2.2 28.5 2.6 32.5 4.2 35.8"
              fill="none"
              stroke={hHi(0.3, 0.32)}
              strokeWidth={0.65}
              strokeLinecap="round"
            />
            <path
              d="M 45.2 24.5 C 45.8 28.5 45.4 32.5 43.8 35.8"
              fill="none"
              stroke={hHi(0.3, 0.32)}
              strokeWidth={0.65}
              strokeLinecap="round"
            />
            <path
              d="M 10.5 20 Q 11.8 26 10.8 32"
              fill="none"
              stroke={hLo(0.45, 0.2)}
              strokeWidth={0.5}
              strokeLinecap="round"
            />
            <path
              d="M 37.5 20 Q 36.2 26 37.2 32"
              fill="none"
              stroke={hLo(0.45, 0.2)}
              strokeWidth={0.5}
              strokeLinecap="round"
            />
            <rect x="9.8" y="18.1" width="2.4" height="0.95" rx={0.35} fill={tie} />
            <rect x="35.8" y="18.1" width="2.4" height="0.95" rx={0.35} fill={tie} />
            <rect x="10.05" y="18.25" width="2.1" height="0.35" rx={0.12} fill="rgba(255,255,255,0.22)" />
            <rect x="36.05" y="18.25" width="2.1" height="0.35" rx={0.12} fill="rgba(255,255,255,0.22)" />
          </g>
        );
      }
      default: return null;
    }
  };

  const renderHairFront = () => {
    const H = hairFill.fill;
    const S = skinFill.fill;
    const lockShF = hLo(0.42, 0.12);
    const dTwinF = (locks: [number, number, number, number][], rxScale = 0.9) =>
      hairTwinLocks(H, locks, rxScale, lockShF);
    const capHiF = (x: number, w: number, y = 11.28) => (
      <rect
        x={x + 1.05}
        y={y}
        width={Math.max(2, w - 2.1)}
        height={0.84}
        rx={0.34}
        fill={hHi(0.12, 0.13)}
      />
    );
    const puff = (cx: number, cy: number, w: number, h: number) => (
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={Math.min(w, h) / 2} fill={H} />
    );
    switch (hairStyle) {
      case 'Short': {
        const shHi = hHi(0.3, 0.2);
        const shLo = hLo(0.38, 0.1);
        const sh1: [number, number, number, number][] = [
          [11, 13, 2, 1], [15, 12, 2, 1], [19, 11, 2, 1], [23, 13, 2, 1], [27, 12, 2, 1], [31, 11, 2, 1],
        ];
        const sh1px: [number, number][] = [
          [10, 16], [13, 17], [16, 16], [34, 16], [37, 17],
        ];
        const mirW = (cells: [number, number, number, number][], fill: string, p: string) =>
          cells.flatMap(([x, y, w, h], i) => {
            const mx = 48 - x - w;
            const o = [<rect key={`${p}a${i}`} x={x} y={y} width={w} height={h} fill={fill} />];
            if (mx !== x) o.push(<rect key={`${p}b${i}`} x={mx} y={y} width={w} height={h} fill={fill} />);
            return o;
          });
        const mirP = (pts: [number, number][], fill: string, p: string) =>
          pts.flatMap(([x, y], i) => {
            const mx = 47 - x;
            const o = [<rect key={`${p}a${i}`} x={x} y={y} width={1} height={1} fill={fill} />];
            if (mx !== x) o.push(<rect key={`${p}b${i}`} x={mx} y={y} width={1} height={1} fill={fill} />);
            return o;
          });
        return (
          <g fill={H}>
            {/* Top mass — wider than temple strips below */}
            <rect x="9.5" y="11.85" width="29" height="5.05" rx={2.05} />
            {/* Temple / side locks: inner edge flush with face (11.95 / 36.05), thinner than top */}
            <rect x="10.75" y="13.95" width="1.2" height="3.55" rx={0.55} />
            <rect x="11.03" y="16.95" width="0.92" height="4.45" rx={0.48} />
            <rect x="36.05" y="13.95" width="1.2" height="3.55" rx={0.55} />
            <rect x="36.05" y="16.95" width="0.92" height="4.45" rx={0.48} />
            {[[14.2, 13.55, 3.8, 2.9], [19.5, 13.05, 4.6, 3.2], [24, 13, 4.8, 3.25], [28.5, 13.05, 4.6, 3.2], [33.8, 13.55, 3.8, 2.9]].map(([x, y, w, h], i) => (
              <rect key={i} x={x} y={y} width={w} height={h} rx={1.05} />
            ))}
            {[[16, 13.15, 1.6, 2], [21.5, 12.8, 1.7, 2.1], [24.15, 12.7, 1.8, 2.15], [26.8, 12.8, 1.7, 2.1], [31.4, 13.15, 1.6, 2]].map(([x, y, w, h], i) => (
              <rect key={`s-${i}`} x={x} y={y} width={w} height={h} rx={0.5} fill={hLo(0.32, 0.12)} />
            ))}
            <rect x="10.75" y="14.2" width="0.55" height="6.85" rx={0.28} fill={hLo(0.4, 0.13)} />
            <rect x="36.7" y="14.2" width="0.55" height="6.85" rx={0.28} fill={hLo(0.44, 0.14)} />
            {mirW(sh1, shHi, 'sh')}
            {mirP(sh1px, shLo, 'shp')}
            {mirP(
              [[9, 12], [10, 11], [11, 11], [9, 14], [9, 15]],
              H,
              'she',
            )}
          </g>
        );
      }
      case 'Buzz': return (
        <g fill={H}>
          <rect x="11" y="13" width="26" height="3" rx={1.4} opacity={0.88} />
          {[[13, 14], [17, 13.5], [21, 13.5], [25, 13.5], [29, 13.5], [33, 14]].map(([x, y], i) => (
            <rect key={i} x={x} y={y} width="1.2" height="1.2" rx={0.4} fill={hHi(0.28, 0.22)} />
          ))}
          {[[12.2, 13.6], [15.4, 13.2], [19.2, 13.1], [23.2, 13.1], [27.2, 13.2], [30.6, 13.5], [34.2, 13.7]].map(([x, y], i) => (
            <rect key={`b-${i}`} x={x} y={y} width="0.65" height="0.65" rx={0.2} fill={hLo(0.35, 0.14)} />
          ))}
        </g>
      );
      case 'Curly': {
        /* Sparse depth pixels + edge fill — no horizontal highlight band. */
        const cuLo = hLo(0.42, 0.12);
        const cuP: [number, number][] = [
          [11, 15], [15, 16], [19, 15], [10, 18], [14, 19],
        ];
        const mirP = (pts: [number, number][], fill: string, p: string) =>
          pts.flatMap(([x, y], i) => {
            const mx = 47 - x;
            const o = [<rect key={`${p}a${i}`} x={x} y={y} width={1} height={1} fill={fill} />];
            if (mx !== x) o.push(<rect key={`${p}b${i}`} x={mx} y={y} width={1} height={1} fill={fill} />);
            return o;
          });
        return (
          <g>
            {/* Temple strips — puffs alone stopped ~x11 / x37; face starts ~12 / ends ~36, leaving bare sides. */}
            <rect x="9.25" y="14.25" width="4.25" height="7.25" rx={1.35} fill={H} />
            <rect x="34.5" y="14.25" width="4.25" height="7.25" rx={1.35} fill={H} />
            {puff(12, 14, 8, 7)}
            {puff(20, 13, 9, 8)}
            {puff(28, 13, 9, 8)}
            {puff(36, 14, 8, 7)}
            {puff(10, 17, 10, 7)}
            {puff(16, 17, 7, 7)}
            {puff(24, 16, 8, 8)}
            {puff(32, 17, 7, 7)}
            {puff(38, 17, 10, 7)}
            {puff(10, 15, 4, 4)}
            {puff(18, 15, 5, 5)}
            {puff(26, 15, 5, 5)}
            {puff(34, 15, 4, 4)}
            {mirP(cuP, cuLo, 'cup')}
            {mirP(
              [[5, 16], [6, 14], [7, 13], [11, 12], [8, 19], [9, 20], [13, 10], [20, 13]],
              H,
              'cue',
            )}
          </g>
        );
      }
      case 'Spiky': return (
        <g fill={H}>
          <rect x="10" y="12" width="28" height="4" rx={1.2} />
          <path d="M 14 12 L 15 4 L 16 12 Z" fill={H} />
          <path d="M 20 12 L 22 2 L 24 12 Z" fill={H} />
          <path d="M 28 12 L 30 3 L 32 12 Z" fill={H} />
          <path d="M 32 12 L 34 5 L 36 12 Z" fill={H} />
          <path d="M 11 12 L 11.8 7 L 12.6 12 Z" fill={H} opacity={0.85} />
          <path d="M 17 12 L 18 6 L 19 12 Z" fill={H} opacity={0.85} />
          <path d="M 35 12 L 35.8 7 L 36.6 12 Z" fill={H} opacity={0.85} />
          <rect x="12" y="12.5" width="24" height="1" rx={0.5} fill={hHi(0.22, 0.18)} />
        </g>
      );
      case 'Fade': return (
        <g>
          <rect x="11" y="11" width="26" height="5" rx={1.6} fill={H} />
          <rect x="12" y="11.6" width="24" height="1.2" rx={0.6} fill={hHi(0.2, 0.18)} />
          <rect x="8" y="15" width="4" height="8" rx={1} fill={S} opacity={0.55} />
          <rect x="36" y="15" width="4" height="8" rx={1} fill={S} opacity={0.55} />
          <rect x="10" y="17" width="2" height="5" fill={hLo(0.25, 0.1)} />
          <rect x="36" y="17" width="2" height="5" fill={hLo(0.28, 0.11)} />
        </g>
      );
      case 'Mohawk': return (
        <g fill={H}>
          <path d="M 20 14 L 22 2 L 26 2 L 28 14 Z" />
          <rect x="21" y="3" width="6" height="12" rx={1.5} />
          <rect x="20.5" y="5" width="2" height="10" rx={0.8} fill={hLo(0.4, 0.16)} />
          <rect x="25.5" y="5" width="2" height="10" rx={0.8} fill={hHi(0.24, 0.14)} />
          <rect x="18" y="12" width="12" height="3" rx={1} />
        </g>
      );
      case 'Dreadlocks': {
        const fHi = hHi(0.24, 0.18);
        const fLo = hLo(0.48, 0.18);
        const fDeep = hLo(0.6, 0.12);
        const fLoc = (d: string, w: number, k: string) => (
          <g key={k}>
            <path d={d} fill="none" stroke={H} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
            <path d={d} fill="none" stroke={fLo} strokeWidth={w * 0.82} strokeLinecap="butt" strokeDasharray={`${w * 0.3} ${w * 0.52}`} />
            <path d={d} fill="none" stroke={fDeep} strokeWidth={w * 0.4} strokeLinecap="butt" strokeDasharray={`${w * 0.18} ${w * 0.72}`} strokeDashoffset={w * 0.35} />
            <path d={d} fill="none" stroke={fHi} strokeWidth={w * 0.14} strokeLinecap="round" strokeDasharray={`${w * 0.38} ${w * 0.92}`} strokeDashoffset={w * 0.22} />
          </g>
        );
        return (
          <g>
            {/* Crown dome */}
            <path
              d="M 6 15 L 6 12 C 6 9 9 7 14 6.2 C 18 5.6 21 5.5 24 5.5 C 27 5.5 30 5.6 34 6.2 C 39 7 42 9 42 12 L 42 15 Z"
              fill={H}
            />
            {/* Crown highlight */}
            <path d="M 10 7.5 C 15 6.2 20 5.8 24 5.8 C 28 5.8 33 6.2 38 7.5" fill="none" stroke={fHi} strokeWidth={1.2} strokeLinecap="round" opacity={0.85} />
            {/* Top locs — shorter curls just above crown */}
            {fLoc('M 18 7 C 17.5 6 17 5.2 17.5 4.8 C 17.8 4.6 18 5 18 5.5', 2.2, 'dt0')}
            {fLoc('M 21 6.5 C 20.5 5.5 20.8 4.8 21.5 4.5 C 21.8 4.5 21.8 5 21.5 5.5', 2, 'dt1')}
            {fLoc('M 24 6 C 24.2 5 24 4.5 23.5 4.2 C 23.3 4.2 23.3 4.6 23.5 5', 2, 'dt2')}
            {fLoc('M 27 6.5 C 27.5 5.5 27.2 4.8 26.5 4.5 C 26.2 4.5 26.2 5 26.5 5.5', 2, 'dt3')}
            {fLoc('M 30 7 C 30.5 6 31 5.2 30.5 4.8 C 30.2 4.6 30 5 30 5.5', 2.2, 'dt4')}
            {fLoc('M 15 7.5 C 14 6.5 13.8 5.8 14.2 5.3 C 14.5 5.2 14.8 5.5 14.8 6', 2, 'dt5')}
            {fLoc('M 33 7.5 C 34 6.5 34.2 5.8 33.8 5.3 C 33.5 5.2 33.2 5.5 33.2 6', 2, 'dt6')}
            {/* Left front locs — S-curves, curling tips */}
            {fLoc('M 7 14 C 5 17 3.5 20.5 4 23.5 C 4.5 25 5.5 25 5.5 24', 3.2, 'df0')}
            {fLoc('M 9 13 C 7 16 6 19.5 7 22.5 C 7.5 23.5 8.5 23 8 22', 2.9, 'df1')}
            {fLoc('M 11 12.5 C 9.5 15.5 9 18 10 21 C 10.5 22 11 21.5 11 20.5', 2.7, 'df2')}
            {fLoc('M 13.5 12 C 12 14.5 11.5 17 12.5 19.5 C 13 20 13.5 19.5 13.5 19', 2.5, 'df3')}
            {fLoc('M 16 11.5 C 15 13.5 14.5 16 15.5 18.5', 2.3, 'df4')}
            {fLoc('M 18.5 11 C 17.5 13 17 15 17.5 17.5', 2.1, 'df5')}
            {/* Center front locs */}
            {fLoc('M 21 10 C 20 12.5 19.5 14.5 20 16.5', 2, 'df6')}
            {fLoc('M 24 9.5 C 24 12 24.5 14 24 16', 2, 'df7')}
            {fLoc('M 27 10 C 28 12.5 28.5 14.5 28 16.5', 2, 'df8')}
            {/* Right front locs — mirrored */}
            {fLoc('M 29.5 11 C 30.5 13 31 15 30.5 17.5', 2.1, 'df9')}
            {fLoc('M 32 11.5 C 33 13.5 33.5 16 32.5 18.5', 2.3, 'dfa')}
            {fLoc('M 34.5 12 C 36 14.5 36.5 17 35.5 19.5 C 35 20 34.5 19.5 34.5 19', 2.5, 'dfb')}
            {fLoc('M 37 12.5 C 38.5 15.5 39 18 38 21 C 37.5 22 37 21.5 37 20.5', 2.7, 'dfc')}
            {fLoc('M 39 13 C 41 16 42 19.5 41 22.5 C 40.5 23.5 39.5 23 40 22', 2.9, 'dfd')}
            {fLoc('M 41 14 C 43 17 44.5 20.5 44 23.5 C 43.5 25 42.5 25 42.5 24', 3.2, 'dfe')}
            {/* Side connections to back */}
            <path d="M 6.5 14 C 5.5 17 5 19.5 5.5 22" fill="none" stroke={H} strokeWidth={3.5} strokeLinecap="round" />
            <path d="M 41.5 14 C 42.5 17 43 19.5 42.5 22" fill="none" stroke={H} strokeWidth={3.5} strokeLinecap="round" />
          </g>
        );
      }
      case 'Dreadlocks V1': return (
        <g fill={H}>
          <rect x="9" y="11" width="30" height="5" rx={1.8} />
          {capHiF(9, 30)}
          {dTwinF([[12, 16, 3.5, 6], [18, 16, 3.5, 8], [24, 16, 3.5, 8], [30, 16, 3.5, 6]])}
        </g>
      );
      case 'Dreadlocks V2': return (
        <g fill={H}>
          <rect x="9" y="11" width="30" height="5" rx={1.8} />
          {capHiF(9, 30)}
          {dTwinF([[12, 16, 3.5, 6], [18, 16, 3.5, 8], [24, 16, 3.5, 8], [30, 16, 3.5, 6]])}
          <rect x="18" y="20" width="4" height="2" rx={0.6} fill="#f59e0b" />
        </g>
      );
      case 'Dreadlocks V3': return (
        <g fill={H}>
          <rect x="7" y="11" width="34" height="5" rx={2} />
          {capHiF(7, 34)}
          {dTwinF([[8, 16, 3.5, 6], [14, 16, 3.5, 8], [20, 16, 3.5, 7], [26, 16, 3.5, 7], [32, 16, 3.5, 8], [36, 16, 3.5, 6]])}
        </g>
      );
      case 'Dreadlocks V4': return (
        <g fill={H}>
          <rect x="7" y="11" width="34" height="5" rx={2} />
          {capHiF(7, 34)}
          {dTwinF([[8, 16, 3.5, 6], [14, 16, 3.5, 8], [20, 16, 3.5, 7], [26, 16, 3.5, 7], [32, 16, 3.5, 8], [36, 16, 3.5, 6]])}
          <rect x="32" y="20" width="4" height="2" rx={0.6} fill="#22c55e" />
        </g>
      );
      case 'Dreadlocks V5': return (
        <g fill={H}>
          <rect x="9" y="11" width="30" height="5" rx={1.8} />
          {capHiF(9, 30)}
          {dTwinF([[10, 16, 3.5, 6], [16, 16, 3.5, 8], [22, 16, 3.5, 8], [28, 16, 3.5, 8], [34, 16, 3.5, 6]])}
        </g>
      );
      case 'Dreadlocks V6': return (
        <g fill={H}>
          <rect x="9" y="11" width="30" height="5" rx={1.8} />
          {capHiF(9, 30)}
          {dTwinF([[12, 16, 3.5, 8], [18, 16, 3.5, 10], [24, 16, 3.5, 10], [30, 16, 3.5, 8]])}
        </g>
      );
      case 'Dreadlocks V7': return (
        <g fill={H}>
          <rect x="9" y="11" width="30" height="5" rx={1.8} />
          {capHiF(9, 30)}
          {dTwinF([[12, 16, 3.5, 8], [18, 16, 3.5, 10], [24, 16, 3.5, 10], [30, 16, 3.5, 8]])}
          <rect x="24" y="22" width="4" height="2" rx={0.6} fill="#f59e0b" />
        </g>
      );
      case 'Dreadlocks V8': return (
        <g fill={H}>
          <rect x="7" y="11" width="34" height="5" rx={2} />
          {capHiF(7, 34)}
          {dTwinF([[8, 16, 3.5, 8], [14, 16, 3.5, 8], [20, 16, 3.5, 10], [26, 16, 3.5, 10], [32, 16, 3.5, 8], [36, 16, 3.5, 8]])}
        </g>
      );
      case 'Dreadlocks V9': return (
        <g fill={H}>
          <rect x="7" y="11" width="34" height="5" rx={2} />
          {capHiF(7, 34)}
          {dTwinF([[6, 16, 3.5, 8], [12, 16, 3.5, 8], [18, 16, 3.5, 10], [24, 16, 3.5, 10], [30, 16, 3.5, 8], [36, 16, 3.5, 8], [38, 16, 3.5, 8]])}
        </g>
      );
      case 'Dreadlocks V10': return (
        <g fill={H}>
          <rect x="7" y="11" width="34" height="5" rx={2} />
          {capHiF(7, 34)}
          {dTwinF([[8, 16, 3.5, 8], [14, 16, 3.5, 10], [20, 16, 3.5, 10], [26, 16, 3.5, 10], [32, 16, 3.5, 10], [36, 16, 3.5, 8]])}
          <rect x="14" y="22" width="4" height="2" rx={0.6} fill="#ef4444" />
        </g>
      );
      case 'Locks V1': return (
        <g fill={H}>
          <rect x="9" y="11" width="30" height="5" rx={2} />
          {capHiF(9, 30)}
          {dTwinF([[13, 16, 3, 6], [19, 16, 3, 7], [25, 16, 3, 7], [31, 16, 3, 6]], 0.82)}
        </g>
      );
      case 'Locks V2': return (
        <g fill={H}>
          <rect x="7" y="11" width="34" height="5" rx={2} />
          {capHiF(7, 34)}
          {dTwinF([[8, 16, 3, 6], [14, 16, 3, 8], [20, 16, 3, 7], [26, 16, 3, 7], [32, 16, 3, 8], [37, 16, 3, 6]], 0.82)}
        </g>
      );
      case 'Locks V3': return (
        <g fill={H}>
          <rect x="9" y="11" width="30" height="5" rx={2} />
          {capHiF(9, 30)}
          {dTwinF([[12, 16, 3, 8], [18, 16, 3, 10], [24, 16, 3, 10], [30, 16, 3, 8]], 0.82)}
        </g>
      );
      case 'Locks V4': return (
        <g fill={H}>
          <rect x="7" y="11" width="34" height="5" rx={2} />
          {capHiF(7, 34)}
          {dTwinF([[8, 16, 3, 8], [14, 16, 3, 10], [20, 16, 3, 8], [26, 16, 3, 8], [32, 16, 3, 10], [37, 16, 3, 8]], 0.82)}
        </g>
      );
      case 'Locks V5': return (
        <g fill={H}>
          <rect x="9" y="11" width="30" height="5" rx={2} />
          {capHiF(9, 30)}
          {dTwinF([[10, 16, 3, 6], [16, 16, 3, 8], [22, 16, 3, 10], [28, 16, 3, 8], [34, 16, 3, 6]], 0.82)}
        </g>
      );
      case 'Locks V6': return (
        <g fill={H}>
          <rect x="9" y="11" width="30" height="5" rx={2} />
          {capHiF(9, 30)}
          {dTwinF([[12, 16, 3, 8], [18, 16, 3, 10], [24, 16, 3, 10], [30, 16, 3, 8]], 0.82)}
        </g>
      );
      case 'Locks V7': return (
        <g fill={H}>
          <rect x="7" y="11" width="34" height="5" rx={2} />
          {capHiF(7, 34)}
          {dTwinF([[8, 16, 3, 8], [14, 16, 3, 10], [20, 16, 3, 10], [26, 16, 3, 10], [32, 16, 3, 10], [37, 16, 3, 8]], 0.82)}
        </g>
      );
      case 'Locks V8': return (
        <g fill={H}>
          <rect x="9" y="11" width="30" height="5" rx={2} />
          {capHiF(9, 30)}
          {dTwinF([[8, 16, 3, 8], [14, 16, 3, 10], [20, 16, 3, 10], [26, 16, 3, 10], [32, 16, 3, 8]], 0.82)}
        </g>
      );
      case 'Locks V9': return (
        <g fill={H}>
          <rect x="7" y="11" width="34" height="5" rx={2} />
          {capHiF(7, 34)}
          {dTwinF([[6, 16, 3, 8], [12, 16, 3, 10], [18, 16, 3, 10], [24, 16, 3, 10], [30, 16, 3, 10], [36, 16, 3, 8], [38, 16, 3, 8]], 0.82)}
        </g>
      );
      case 'Locks V10': return (
        <g fill={H}>
          <rect x="7" y="11" width="34" height="5" rx={2} />
          {capHiF(7, 34)}
          {dTwinF([[8, 16, 3, 8], [14, 16, 3, 10], [20, 16, 3, 12], [26, 16, 3, 12], [32, 16, 3, 10], [37, 16, 3, 8]], 0.82)}
        </g>
      );
      /* Afro: one silhouette behind the face only — avoids tiered "front + back" bowl. */
      case 'Afro':
        return null;
      case 'Mullet': return (
        <g fill={H}>
          <rect x="9" y="11" width="30" height="5" rx={2} />
          {capHiF(9, 30)}
          <rect x="9" y="15" width="3" height="5" rx={1} />
          <rect x="36" y="15" width="3" height="5" rx={1} />
          <rect x="10" y="11.5" width="28" height="1.2" rx={0.6} fill={hHi(0.2, 0.18)} />
        </g>
      );
      case 'Pigtails': {
        const tie = '#22c55e';
        return (
          <g fill={H}>
            {/* Cap + center part (notch at midline ~24) */}
            <path d="M 9 12.1 L 22.6 12.1 L 23.5 10.85 L 24.5 10.85 L 25.4 12.1 L 39 12.1 L 39 15.6 L 37.2 15.85 L 37.2 19.2 L 35.8 19.5 L 34.2 18.1 L 34.2 15.4 L 24.2 15.15 L 13.8 15.4 L 13.8 18.1 L 12.2 19.5 L 10.8 19.2 L 10.8 15.85 L 9 15.6 Z" />
            <rect x="10.2" y="11.35" width="12.8" height="0.95" rx={0.35} fill={hHi(0.22, 0.2)} />
            <rect x="25" y="11.35" width="12.8" height="0.95" rx={0.35} fill={hHi(0.2, 0.18)} />
            <path d="M 23.6 10.9 L 24 11.35 L 24.4 10.9" fill="none" stroke={hLo(0.35, 0.35)} strokeWidth={0.28} strokeLinecap="round" />
            {/* Temple framing — stops just above tie / eye line */}
            <rect x="10.85" y="15.2" width="1.15" height="5.2" rx={0.45} fill={H} />
            <rect x="36" y="15.2" width="1.15" height="5.2" rx={0.45} fill={H} />
            <rect x="10.95" y="15.35" width="0.45" height="4.8" rx={0.15} fill={hLo(0.4, 0.14)} />
            <rect x="36.6" y="15.35" width="0.45" height="4.8" rx={0.15} fill={hLo(0.44, 0.15)} />
            {/* Front bulge of pigtail — out then down, chunky */}
            <path
              d="M 10.8 19.4 C 8.2 19.8 6.4 21.6 6.2 23.8 C 6 26 7 27.8 8.8 28.6 L 10.2 27.4 C 9 26.8 8.4 25.5 8.5 24.2 C 8.7 22.5 9.8 21.2 11.6 20.8 Z"
              fill={H}
            />
            <path
              d="M 37.2 19.4 C 39.8 19.8 41.6 21.6 41.8 23.8 C 42 26 41 27.8 39.2 28.6 L 37.8 27.4 C 39 26.8 39.6 25.5 39.5 24.2 C 39.3 22.5 38.2 21.2 36.4 20.8 Z"
              fill={H}
            />
            <path
              d="M 7.2 23.5 C 7 25.5 7.6 27.2 8.8 28.5"
              fill="none"
              stroke={hHi(0.28, 0.28)}
              strokeWidth={0.48}
              strokeLinecap="round"
            />
            <path
              d="M 40.8 23.5 C 41 25.5 40.4 27.2 39.2 28.5"
              fill="none"
              stroke={hHi(0.28, 0.28)}
              strokeWidth={0.48}
              strokeLinecap="round"
            />
            <path
              d="M 10.2 21 Q 11 24.5 10.5 27.5"
              fill="none"
              stroke={hLo(0.42, 0.18)}
              strokeWidth={0.42}
              strokeLinecap="round"
            />
            <path
              d="M 37.8 21 Q 37 24.5 37.5 27.5"
              fill="none"
              stroke={hLo(0.42, 0.18)}
              strokeWidth={0.42}
              strokeLinecap="round"
            />
            <rect x="9.35" y="18.85" width="2.35" height="0.88" rx={0.32} fill={tie} />
            <rect x="36.3" y="18.85" width="2.35" height="0.88" rx={0.32} fill={tie} />
            <rect x="9.55" y="19.02" width="2" height="0.32" rx={0.1} fill="rgba(255,255,255,0.2)" />
            <rect x="36.5" y="19.02" width="2" height="0.32" rx={0.1} fill="rgba(255,255,255,0.2)" />
            <rect x="11.8" y="12.4" width="0.35" height="2.6" rx={0.08} fill={hLo(0.32, 0.12)} />
            <rect x="35.85" y="12.4" width="0.35" height="2.6" rx={0.08} fill={hLo(0.36, 0.13)} />
          </g>
        );
      }
      case 'Messy': {
        /* Pixel-messy: jagged 3-peak crown, tufts at sides, center-right fringe; hHi on tips/upper-left; hLo specks = curls */
        const hiPx = (pts: [number, number][], w = 0.74, h = 0.74, keyP = 'h') =>
          pts.map(([x, y], i) => (
            <rect key={`m${keyP}-${i}`} x={x} y={y} width={w} height={h} rx={0.07} fill={hHi(0.36, 0.42)} />
          ));
        const hiCluster = (cx: number, cy: number, k: string) => (
          <g key={k}>
            <rect x={cx} y={cy} width={1.05} height={0.62} rx={0.1} fill={hHi(0.32, 0.38)} />
            <rect x={cx + 0.35} y={cy - 0.35} width={0.72} height={0.72} rx={0.08} fill={hHi(0.4, 0.45)} />
          </g>
        );
        const curlPx = (pts: [number, number][]) =>
          pts.map(([x, y], i) => (
            <rect key={`mcl-${i}`} x={x} y={y} width={0.46} height={0.46} rx={0.05} fill={hLo(0.48, 0.2)} />
          ));
        return (
          <g>
            <path
              d="M 7.5 15.35 L 7.25 13.5 L 7.85 11.1 L 9.35 9.35 L 11.4 7.75 L 13.9 6.95 L 16.3 7.35 L 18.9 6.05 L 21.6 4.85 L 24.3 4.15 L 27.4 4.55 L 30.1 5.35 L 32.7 6.55 L 35.2 8.15 L 37.2 10 L 38.6 12 L 39.15 13.8 L 38.95 15.15 L 36.4 15.55 L 32.6 15.25 L 28.9 15.45 L 24.8 15.2 L 20.2 15.38 L 15.6 15.32 L 11.4 15.42 L 8.6 15.38 Z"
              fill={H}
            />
            <path d="M 9 15.25 L 8.55 17.85 L 10.85 18.35 L 11.75 16.55 L 11.15 15.2 Z" fill={H} />
            <path d="M 39 15.25 L 39.45 17.9 L 37.15 18.35 L 36.25 16.5 L 36.85 15.2 Z" fill={H} />
            <rect x="25.6" y="13.85" width="0.95" height="2.35" rx={0.11} fill={H} />
            <rect x="26.45" y="14.15" width="0.82" height="1.95" rx={0.09} fill={hLo(0.28, 0.15)} />
            <rect x="25.85" y="14.05" width={0.42} height={0.55} rx={0.07} fill={hHi(0.3, 0.36)} />
            <path
              d="M 9.5 14.95 L 37.2 14.95 L 36.6 15.28 L 10.1 15.28 Z"
              fill={hLo(0.32, 0.14)}
            />
            <path
              d="M 8.2 12.8 L 38.8 12.8 L 38.2 13.05 L 8.8 13.05 Z"
              fill={hLo(0.18, 0.09)}
            />
            {hiCluster(11.2, 7.35, 'mc-l')}
            {hiCluster(23.6, 4.05, 'mc-c')}
            {hiCluster(31.8, 5.85, 'mc-r')}
            {hiPx([
              [10.1, 9.8], [10.9, 8.9], [14.2, 8.4], [17.5, 7.8], [20.2, 6.6], [26.8, 6.2], [29.4, 6.9],
              [33.2, 8.2], [35.5, 9.6], [36.8, 11.2], [9.2, 11.5], [12.8, 6.2], [25.2, 5.1], [27.8, 5.5],
            ])}
            {hiPx([[24.1, 4.35], [24.9, 4.2]], 0.68, 0.68, 'hc')}
            {curlPx([
              [13.2, 10.4], [15.8, 9.6], [18.4, 11.2], [20.8, 9.1], [22.5, 10.8], [25.1, 8.9], [27.6, 10.2],
              [30.2, 9.4], [28.4, 7.8], [19.2, 8.5], [16.5, 10.8], [23.3, 7.5], [26.3, 7.2], [31.5, 10.5],
              [34.2, 9.8], [14.8, 12.5], [21.5, 12.8], [29.8, 12.2], [11.8, 13.2], [33.5, 13.5], [24.6, 11.5],
            ])}
            <path
              d="M 8.9 17.4 L 9.35 16.1 L 10.1 16.05 Z"
              fill={hLo(0.4, 0.16)}
            />
            <path
              d="M 39.1 17.45 L 38.65 16.1 L 37.9 16.05 Z"
              fill={hLo(0.42, 0.17)}
            />
          </g>
        );
      }
      case 'Ponytail': {
        const tie = '#22c55e';
        return (
          <g fill={H}>
            {/* Center part cap — right side scoops toward single gather (pigtails family) */}
            <path d="M 9 12.1 L 22.6 12.1 L 23.5 10.85 L 24.5 10.85 L 25.4 12.1 L 39 12.1 L 39 15.5 L 37.8 15.65 L 37.4 17.2 L 36.8 19.5 L 35.4 20.2 L 33.8 19.4 L 33.2 17.2 L 33.6 15.35 L 24.2 15.15 L 13.8 15.4 L 13.8 18.1 L 12.2 19.5 L 10.8 19.2 L 10.8 15.85 L 9 15.6 Z" />
            <rect x="10.2" y="11.35" width="12.8" height="0.95" rx={0.35} fill={hHi(0.22, 0.2)} />
            <rect x="25" y="11.35" width="12.8" height="0.95" rx={0.35} fill={hHi(0.2, 0.18)} />
            <path d="M 23.6 10.9 L 24 11.35 L 24.4 10.9" fill="none" stroke={hLo(0.35, 0.35)} strokeWidth={0.28} strokeLinecap="round" />
            <rect x="10.85" y="15.2" width="1.15" height="5.2" rx={0.45} fill={H} />
            <rect x="36" y="15.2" width="1.15" height="5.2" rx={0.45} fill={H} />
            <rect x="10.95" y="15.35" width="0.45" height="4.8" rx={0.15} fill={hLo(0.4, 0.14)} />
            <rect x="36.6" y="15.35" width="0.45" height="4.8" rx={0.15} fill={hLo(0.44, 0.15)} />
            {/* Right gather only — one ponytail; left stays smooth */}
            <path
              d="M 34.5 18.8 C 37.2 18.2 40.2 20 41 22.8 C 41.8 25.5 40.8 28.2 38.6 29.5 L 37 28.2 C 38.2 27.4 38.8 25.8 38.4 24.2 C 38 22 36.2 20.5 34 20.2 L 32.8 19.2 Z"
              fill={H}
            />
            <path
              d="M 40.2 24 C 40.4 26.2 39.6 28 38 29"
              fill="none"
              stroke={hHi(0.28, 0.28)}
              strokeWidth={0.48}
              strokeLinecap="round"
            />
            <path
              d="M 35.5 20.5 Q 36.8 24 36.2 27.5"
              fill="none"
              stroke={hLo(0.42, 0.18)}
              strokeWidth={0.42}
              strokeLinecap="round"
            />
            <rect x="9" y="15" width="4.8" height="7" rx={1.45} fill={H} />
            <rect x="9.55" y="16.1" width="0.55" height="5.6" rx={0.12} fill={hLo(0.38, 0.12)} />
            <rect x="35.4" y="18.75" width="2.45" height="0.88" rx={0.32} fill={tie} transform="rotate(-14 36.6 19.2)" />
            <rect x="35.6" y="18.92" width="2.05" height="0.32" rx={0.1} fill="rgba(255,255,255,0.2)" transform="rotate(-14 36.6 19.2)" />
            <rect x="11.8" y="12.4" width="0.35" height="2.6" rx={0.08} fill={hLo(0.32, 0.12)} />
            <rect x="35.85" y="12.4" width="0.35" height="2.6" rx={0.08} fill={hLo(0.36, 0.13)} />
          </g>
        );
      }
      case 'Long Straight': return (
        <g>
          {/* Full crown + side strips as one continuous shape */}
          <path
            d="M 9 16 L 9 14 C 9 11 11.5 9 15 8 C 18 7 21 6.8 24 6.8 C 27 6.8 30 7 33 8 C 36.5 9 39 11 39 14 L 39 16 Z"
            fill={H}
          />
          {/* Left side strip */}
          <path
            d="M 9 14 L 8 15 C 7.5 16.5 7 18.5 7 20.5 C 7 22 7.5 23 8.5 23.5 C 9.5 24 10.5 23.5 11.5 22.5 L 12 16 Z"
            fill={H}
          />
          {/* Right side strip */}
          <path
            d="M 39 14 L 40 15 C 40.5 16.5 41 18.5 41 20.5 C 41 22 40.5 23 39.5 23.5 C 38.5 24 37.5 23.5 36.5 22.5 L 36 16 Z"
            fill={H}
          />
          {/* Crown highlight band */}
          <path d="M 13 9 C 17 7.8 21 7.3 24 7.3 C 27 7.3 31 7.8 35 9" fill="none" stroke={hHi(0.24, 0.18)} strokeWidth={1.4} strokeLinecap="round" />
          <path d="M 15 10 C 19 8.8 22 8.5 24 8.5 C 26 8.5 29 8.8 33 10" fill="none" stroke={hHi(0.18, 0.14)} strokeWidth={0.8} strokeLinecap="round" />
          {/* Center part */}
          <path d="M 24 7 L 24 15.5" fill="none" stroke={hLo(0.28, 0.14)} strokeWidth={0.4} strokeLinecap="round" />
          {/* Crown strands from part */}
          <path d="M 24 8 C 20 9.5 16 12 13 15" fill="none" stroke={hLo(0.18, 0.07)} strokeWidth={0.35} strokeLinecap="round" />
          <path d="M 24 8 C 28 9.5 32 12 35 15" fill="none" stroke={hLo(0.18, 0.07)} strokeWidth={0.35} strokeLinecap="round" />
          <path d="M 24 8 C 19 10 15 13 12 16" fill="none" stroke={hLo(0.14, 0.05)} strokeWidth={0.28} strokeLinecap="round" />
          <path d="M 24 8 C 29 10 33 13 36 16" fill="none" stroke={hLo(0.14, 0.05)} strokeWidth={0.28} strokeLinecap="round" />
          {/* Side strip inner shadows */}
          <path d="M 9 16 C 8.5 18 8 20 8.5 22" fill="none" stroke={hLo(0.35, 0.12)} strokeWidth={0.55} strokeLinecap="round" />
          <path d="M 39 16 C 39.5 18 40 20 39.5 22" fill="none" stroke={hLo(0.38, 0.13)} strokeWidth={0.55} strokeLinecap="round" />
        </g>
      );
      case 'Bob': return (
        <g>
          {/* Full crown dome — thick, voluminous */}
          <path
            d="M 7 16 L 7 14 C 7 11 9.5 9 14 8 C 17 7.2 20.5 7 24 7 C 27.5 7 31 7.2 34 8 C 38.5 9 41 11 41 14 L 41 16 Z"
            fill={H}
          />
          {/* Left face-framing curtain — wide bob shape */}
          <path
            d="M 7 14 C 6.5 17 6.5 20 7 23 C 7.5 26 8 28.5 9 30 C 10 31.5 11.5 32 13 31.5 C 13.5 30.5 13 28 12.5 25 C 12.5 22 12 18 12 16 Z"
            fill={H}
          />
          {/* Right face-framing curtain */}
          <path
            d="M 41 14 C 41.5 17 41.5 20 41 23 C 40.5 26 40 28.5 39 30 C 38 31.5 36.5 32 35 31.5 C 34.5 30.5 35 28 35.5 25 C 35.5 22 36 18 36 16 Z"
            fill={H}
          />
          {/* Swept bangs across forehead */}
          <path
            d="M 12.5 15.5 C 14 12.5 17 11 21 10.5 C 24 10.2 27 10.5 29 12 C 30 13 29.5 14.5 28.5 15.5 Z"
            fill={H}
          />
          {/* Crown highlight arc */}
          <path d="M 12 9 C 16 7.8 20 7.5 24 7.5 C 28 7.5 32 7.8 36 9" fill="none" stroke={hHi(0.25, 0.18)} strokeWidth={1.3} strokeLinecap="round" />
          {/* Secondary crown highlight */}
          <path d="M 14 10 C 18 9 22 8.5 24 8.5 C 26 8.5 30 9 34 10" fill="none" stroke={hHi(0.18, 0.13)} strokeWidth={0.7} strokeLinecap="round" />
          {/* Crown strand detail */}
          <path d="M 21 8.5 C 19 10 17 12 15 15" fill="none" stroke={hLo(0.2, 0.09)} strokeWidth={0.35} strokeLinecap="round" />
          <path d="M 27 8.5 C 29 10 31 12 33 15" fill="none" stroke={hLo(0.18, 0.08)} strokeWidth={0.35} strokeLinecap="round" />
          {/* Side curtain inner shadows */}
          <path d="M 9 17 C 8.5 20 8.5 24 9 28" fill="none" stroke={hLo(0.32, 0.11)} strokeWidth={0.55} strokeLinecap="round" />
          <path d="M 39 17 C 39.5 20 39.5 24 39 28" fill="none" stroke={hLo(0.35, 0.12)} strokeWidth={0.55} strokeLinecap="round" />
          {/* Side curtain outer highlights */}
          <path d="M 7.5 18 C 7.3 22 7.5 25 8 29" fill="none" stroke={hHi(0.16, 0.1)} strokeWidth={0.6} strokeLinecap="round" />
          <path d="M 40.5 18 C 40.7 22 40.5 25 40 29" fill="none" stroke={hHi(0.13, 0.08)} strokeWidth={0.5} strokeLinecap="round" />
          {/* Bottom curl-under hints */}
          <path d="M 9.5 30 C 10.5 31 11.5 31.5 12.5 31" fill="none" stroke={hLo(0.25, 0.1)} strokeWidth={0.4} strokeLinecap="round" />
          <path d="M 38.5 30 C 37.5 31 36.5 31.5 35.5 31" fill="none" stroke={hLo(0.25, 0.1)} strokeWidth={0.4} strokeLinecap="round" />
        </g>
      );
      case 'Long Wavy':
        return (
          <g fill={H}>
            <rect x="9" y="11" width="30" height="5" rx={2} />
            {capHiF(9, 30)}
            <rect x="9" y="15" width="5" height="7" rx={1.5} />
            <rect x="34" y="15" width="5" height="7" rx={1.5} />
            {/* Cap depth: soft bands + staggered highlights — no curved stroke "arc" */}
            <rect x="10.5" y="11.05" width="27" height="2.35" rx={0.95} fill={hHi(0.1, 0.16)} />
            <rect x="12" y="11.2" width="5.2" height="1.05" rx={0.4} fill={hHi(0.28, 0.2)} />
            <rect x="19" y="11.08" width="7" height="1.15" rx={0.45} fill={hHi(0.32, 0.22)} />
            <rect x="27.5" y="11.15" width="6" height="1.05" rx={0.42} fill={hHi(0.26, 0.19)} />
            <rect x="34.5" y="11.22" width="4.8" height="0.98" rx={0.38} fill={hHi(0.24, 0.17)} />
            {[11.2, 14.5, 18, 21.5, 26, 29.5, 33, 36.5].map((sx) => (
              <rect key={sx} x={sx} y="12" width="0.32" height="3.2" rx={0.08} fill={hLo(0.3, 0.18)} />
            ))}
            <rect x="9.5" y="16" width="1.2" height="5" fill={hLo(0.38, 0.12)} />
            <rect x="37.3" y="16" width="1.2" height="5" fill={hLo(0.42, 0.13)} />
          </g>
        );
      case 'Bald': default: return null;
    }
  };

  // ── eyes ───────────────────────────────────────────────────────────────────

  const renderEyes = () => {
    const eyeTrackStyle = (!compact || trackMouse || roamEyes) ? { x: mouseX, y: mouseY } : {};

    /** Iris + tiny highlight share the same translate so the glint tracks pupil motion. */
    const pupilGroup = (px: number, py: number, w: number, h: number, glintOpacity = 0.88) => {
      const gl = Math.min(0.34, Math.min(w, h) * 0.34);
      const irisRx = Math.min(0.32, Math.min(w, h) * 0.22);
      return (
        <motion.g style={eyeTrackStyle}>
          <rect
            x={px}
            y={py}
            width={w}
            height={h}
            fill={eyeColor}
            rx={irisRx}
            stroke="rgba(0,0,0,0.18)"
            strokeWidth={0.24}
          />
          <rect
            x={px + 0.1}
            y={py + 0.1}
            width={Math.max(0.2, w - 0.2)}
            height={Math.max(0.2, h - 0.2)}
            rx={irisRx * 0.92}
            fill="none"
            stroke="rgba(0,0,0,0.2)"
            strokeWidth={0.09}
          />
          <rect
            x={px + w * 0.1}
            y={py + h * 0.1}
            width={gl}
            height={gl}
            rx={gl * 0.25}
            fill={`rgba(255,255,255,${glintOpacity})`}
          />
        </motion.g>
      );
    };

    const renderEye = (x: number) => {
      const isRightEye = x === 28;
      const isWinking = emotion === 'wink' && isRightEye;
      if (isWinking || emotion === 'sleepy' || emotion === 'cool' || emotion === 'ninja') {
        return <rect x={x} y="22" width="6" height="2" fill="rgba(0,0,0,0.6)" />;
      }
      switch (eyeShape) {
        case 'Round': {
          // Center 4×4 sclera in the same 6-unit column as Almond/Wide (x..x+6) so both eyes mirror around face midline x=24.
          const ox = x + 1;
          return (
            <g>
              <rect x={ox} y="22" width="4" height="4" rx={0.96} fill="#fffef8" />
              <rect x={ox + 0.05} y="22" width="3.8" height="1.7" rx={0.7} fill="rgba(0,0,0,0.1)" />
              <rect x={ox} y="24" width="4" height="2" rx={0.5} fill="rgba(255,245,220,0.45)" />
              <rect x={ox + 0.08} y="22.16" width="3.68" height="3.68" rx={0.84} fill="none" stroke="rgba(0,0,0,0.14)" strokeWidth={0.16} />
              {pupilGroup(ox + 1, 23, 2, 2)}
            </g>
          );
        }
        case 'Almond': return (
          <g>
            <rect x={x} y="22" width="6" height="2" rx={0.84} fill="#fffef8" />
            <rect x={x} y="22" width="6" height="0.9" rx={0.7} fill="rgba(0,0,0,0.09)" />
            <rect x={x + 0.05} y="22.1" width="5.8" height="1.8" rx={0.76} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth={0.16} />
            {pupilGroup(x + 2, 22, 2, 2)}
          </g>
        );
        case 'Narrow': return (
          <g>
            <rect x={x} y="24" width="6" height="2" rx={0.8} fill="#fffef8" />
            <rect x={x} y="24" width="6" height="0.9" rx={0.64} fill="rgba(0,0,0,0.09)" />
            <rect x={x + 0.05} y="24.1" width="5.8" height="1.8" rx={0.7} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth={0.16} />
            {pupilGroup(x + 2, 24, 2, 2)}
          </g>
        );
        case 'Wide': return (
          <g>
            <rect x={x} y="22" width="6" height="4" rx={0.9} fill="#fffef8" />
            <rect x={x} y="22" width="6" height="1.8" rx={0.7} fill="rgba(0,0,0,0.09)" />
            <rect x={x} y="24" width="6" height="2" rx={0.6} fill="rgba(255,240,200,0.32)" />
            <rect x={x + 0.06} y="22.12" width="5.76" height="3.76" rx={0.8} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth={0.16} />
            {pupilGroup(x + 1, 22, 4, 4, 0.55)}
          </g>
        );
        case 'Eye V1': return <g><rect x={x} y="22" width="6" height="4" rx={0.7} fill="#fffef8" /><rect x={x + 0.08} y="22.16" width="5.68" height="3.68" rx={0.6} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth={0.16} />{pupilGroup(x + 2, 23, 2, 2)}</g>;
        case 'Eye V3': return <g><rect x={x} y="22" width="4" height="4" rx={0.7} fill="#fffef8" /><rect x={x + 2} y="24" width="2" height="2" rx={0.4} fill="#fffef8" />{pupilGroup(x + 1, 23, 2, 2)}</g>;
        case 'Eye V4': return <g><rect x={x} y="22" width="6" height="4" rx={0.7} fill="#fffef8" />{pupilGroup(x + 3, 23, 2, 2)}</g>;
        default: return null;
      }
    };

    return (
      <g>
        <motion.g animate={emotion} variants={eyebrowLeftVariants} style={{ transformOrigin: avatarMotionOrigin(17, 19) }}>
          <rect x="14" y="18" width="6" height="2" rx={0.7} fill={hairFill.fill} />
        </motion.g>
        <motion.g animate={emotion} variants={eyebrowRightVariants} style={{ transformOrigin: avatarMotionOrigin(31, 19) }}>
          <rect x="28" y="18" width="6" height="2" rx={0.7} fill={hairFill.fill} />
        </motion.g>
        {/* Auto-blink wrapper */}
        <motion.g
          animate={{ scaleY: [1, 1, 0.1, 1] }}
          transition={{ duration: 4, repeat: Infinity, times: [0, 0.9, 0.95, 1], ease: 'easeInOut' }}
          style={{ transformOrigin: avatarMotionOrigin(24, 23) }}
        >
          <motion.g animate={emotion} variants={eyeVariants} style={{ transformOrigin: avatarMotionOrigin(17, 23) }}>
            {renderEye(14)}
          </motion.g>
          <motion.g animate={emotion} variants={rightEyeVariants} style={{ transformOrigin: avatarMotionOrigin(31, 23) }}>
            {renderEye(28)}
        </motion.g>
        </motion.g>
        {(config.facialHair ?? 'None') === 'Eyelashes' && (
          <g pointerEvents="none" fill="none" stroke="rgba(18,12,10,0.5)" strokeWidth="0.2" strokeLinecap="round">
            {[
              [14.05, 21.35, 14.15, 20.05],
              [14.85, 21.28, 15.05, 19.92],
              [15.65, 21.22, 15.95, 19.82],
              [16.45, 21.2, 16.85, 19.78],
              [17.25, 21.22, 17.75, 19.82],
              [18.05, 21.28, 18.55, 19.92],
              [18.85, 21.35, 19.15, 20.08],
            ].map(([x1, y1, x2, y2], i) => (
              <path key={`ll${i}`} d={`M ${x1} ${y1} Q ${(Number(x1) + Number(x2)) / 2} ${(Number(y1) + Number(y2)) / 2 - 0.35} ${x2} ${y2}`} />
            ))}
            {[
              [29.15, 21.35, 28.95, 20.05],
              [30.15, 21.28, 29.95, 19.92],
              [31.35, 21.22, 31.05, 19.82],
              [32.55, 21.2, 32.15, 19.78],
              [33.75, 21.22, 33.25, 19.82],
              [34.95, 21.28, 34.45, 19.92],
              [35.95, 21.35, 35.85, 20.08],
            ].map(([x1, y1, x2, y2], i) => (
              <path key={`lr${i}`} d={`M ${x1} ${y1} Q ${(Number(x1) + Number(x2)) / 2} ${(Number(y1) + Number(y2)) / 2 - 0.35} ${x2} ${y2}`} />
            ))}
          </g>
        )}
      </g>
    );
  };

  // ── face features ──────────────────────────────────────────────────────────

  const renderNose = () => (
    <g>
      <rect x="22.15" y="28.05" width="3.7" height="1.85" rx={0.65} fill="rgba(0,0,0,0.12)" />
      <rect x="22.35" y="28.18" width="1.65" height="0.55" rx={0.2} fill="rgba(255,255,255,0.1)" />
      <ellipse cx="22.78" cy="29.02" rx="0.32" ry="0.26" fill="rgba(0,0,0,0.2)" />
      <ellipse cx="25.22" cy="29.02" rx="0.32" ry="0.26" fill="rgba(0,0,0,0.2)" />
      <path d="M 23.65 27.72 Q 24 27.38 24.35 27.72" fill="none" stroke="rgba(0,0,0,0.14)" strokeWidth="0.12" strokeLinecap="round" />
    </g>
  );

  const renderLips = () => {
    if (emotion === 'surprised') {
      return (
        <g>
          <rect x="22" y="32" width="4" height="4" rx={1.1} fill="rgba(30,10,15,0.88)" />
          <rect x="22.5" y="32.5" width="3" height="1.1" rx={0.5} fill="rgba(255,255,255,0.08)" />
          <rect x="22.7" y="34.3" width="2.6" height="1.1" rx={0.4} fill="rgba(200,80,90,0.35)" />
          <ellipse cx="24" cy="33.6" rx="1.1" ry="0.85" fill="rgba(0,0,0,0.35)" />
        </g>
      );
    }
    switch (lipShape) {
      case 'Thin':
      case 'Full': // legacy — coerced to Thin in `mergeV1AvatarPartial`; keep for in-memory configs
        return (
          <g>
            <rect x="20" y="32.3" width="8" height="1.1" rx={0.44} fill="rgba(90,30,40,0.55)" />
            <rect x="20" y="33.2" width="8" height="1.1" rx={0.56} fill="rgba(0,0,0,0.32)" />
            <path d="M 20.35 32.85 L 27.65 32.85" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="0.12" strokeLinecap="round" />
          </g>
        );
      case 'Smile':
      case 'Smirk': // legacy — coerced to Smile in `mergeV1AvatarPartial`
        return (
          <g>
            <path
              d="M 20.2 32.78 Q 24 31.38 27.8 32.78"
              fill="none"
              stroke="rgba(42,20,28,0.5)"
              strokeWidth="0.36"
              strokeLinecap="round"
            />
            <rect x="20.65" y="32.82" width="6.7" height="1.12" rx={0.24} fill="rgba(255,252,248,0.97)" />
            <rect x="21" y="33.02" width="6" height="0.3" rx={0.09} fill="rgba(0,0,0,0.055)" />
            <path
              d="M 20.38 34.18 Q 24 35.38 27.62 34.18"
              fill="none"
              stroke="rgba(34,14,20,0.46)"
              strokeWidth="0.4"
              strokeLinecap="round"
            />
            <rect x="20.05" y="33.42" width="0.44" height="0.34" rx={0.1} fill="rgba(0,0,0,0.11)" />
            <rect x="27.51" y="33.42" width="0.44" height="0.34" rx={0.1} fill="rgba(0,0,0,0.11)" />
          </g>
        );
      default:
        return (
          <g>
            <rect x="20" y="31.9" width="8" height="1.1" rx={0.44} fill="rgba(95,35,45,0.45)" />
            <rect x="20" y="32.8" width="8" height="1.1" rx={0.5} fill="rgba(0,0,0,0.36)" />
            <path d="M 20.4 32.35 L 27.6 32.35" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="0.1" strokeLinecap="round" />
          </g>
        );
    }
  };

  /** Optional cosmetics — blush / contour / freckles (base face stays clean). */
  const renderMakeup = () => {
    const m = config.makeup ?? 'None';
    switch (m) {
      case 'Blush Soft':
        return (
          <g pointerEvents="none">
            <ellipse cx="17" cy="26.5" rx="3.2" ry="2.4" fill="rgba(220,100,120,0.22)" />
            <ellipse cx="31" cy="26.5" rx="3.2" ry="2.4" fill="rgba(220,100,120,0.22)" />
          </g>
        );
      case 'Blush Rosy':
        return (
          <g pointerEvents="none">
            <ellipse cx="17" cy="26.5" rx="3.5" ry="2.7" fill="rgba(210,70,100,0.38)" />
            <ellipse cx="31" cy="26.5" rx="3.5" ry="2.7" fill="rgba(210,70,100,0.38)" />
          </g>
        );
      case 'Contour':
        return (
          <g pointerEvents="none">
            <ellipse cx="12.5" cy="27" rx="2.8" ry="7" fill="rgba(80,40,30,0.07)" />
            <ellipse cx="35.5" cy="27" rx="2.8" ry="7" fill="rgba(80,40,30,0.09)" />
            <ellipse cx="24" cy="32" rx="5" ry="2.2" fill="rgba(60,35,28,0.05)" />
          </g>
        );
      case 'Highlighter':
        return (
          <g pointerEvents="none">
            <ellipse cx="18" cy="19" rx="1.6" ry="0.85" fill="rgba(255,255,255,0.14)" />
            <ellipse cx="30" cy="19" rx="1.6" ry="0.85" fill="rgba(255,255,255,0.13)" />
            <ellipse cx="24" cy="20.5" rx="2.2" ry="0.9" fill="rgba(255,255,255,0.08)" />
            <ellipse cx="17" cy="25.5" rx="1.2" ry="0.9" fill="rgba(255,255,255,0.1)" />
            <ellipse cx="31" cy="25.5" rx="1.2" ry="0.9" fill="rgba(255,255,255,0.1)" />
          </g>
        );
      case 'Freckles':
        return (
          <g pointerEvents="none" fill="rgba(120,72,48,0.45)">
            {[
              [15.2, 24.1], [16.8, 25.3], [18.1, 24.6], [29.2, 24.2], [30.6, 25.4], [32.1, 24.7],
              [17.5, 26.8], [19.2, 27.5], [28.8, 26.9], [30.4, 27.6], [22, 25.2], [26, 25.3],
            ].map(([x, y], i) => (
              <rect key={i} x={x} y={y} width="0.45" height="0.45" rx={0.12} />
            ))}
          </g>
        );
      case 'Eye Shadow':
        return (
          <g pointerEvents="none">
            <rect x="13.5" y="20" width="7" height="2.2" rx={0.6} fill="rgba(90,50,110,0.18)" />
            <rect x="27.5" y="20" width="7" height="2.2" rx={0.6} fill="rgba(90,50,110,0.18)" />
            <rect x="14.2" y="20.2" width="5.5" height="0.55" rx={0.2} fill="rgba(255,255,255,0.06)" />
            <rect x="28.2" y="20.2" width="5.5" height="0.55" rx={0.2} fill="rgba(255,255,255,0.06)" />
          </g>
        );
      case 'Glam Full':
        return (
          <g pointerEvents="none">
            <ellipse cx="17" cy="26.5" rx="3" ry="2.3" fill="rgba(220,90,120,0.2)" />
            <ellipse cx="31" cy="26.5" rx="3" ry="2.3" fill="rgba(220,90,120,0.2)" />
            <ellipse cx="12.8" cy="27" rx="2.4" ry="6.5" fill="rgba(70,35,40,0.06)" />
            <ellipse cx="35.2" cy="27" rx="2.4" ry="6.5" fill="rgba(70,35,40,0.08)" />
            <ellipse cx="18" cy="19" rx="1.4" ry="0.75" fill="rgba(255,255,255,0.12)" />
            <ellipse cx="30" cy="19" rx="1.4" ry="0.75" fill="rgba(255,255,255,0.11)" />
          </g>
        );
      case 'None':
      default:
        return null;
    }
  };

  /**
   * Facial hair — cohesive silhouettes (pixel-art: one readable mass, not floating tiles).
   * Reference: full / boxed beards read as continuous jaw + chin; stubble as shadow on lower face with lip cutout.
   */
  const renderFacialHair = () => {
    const F = hairFill.fill;
    const fh = config.facialHair ?? 'None';
    switch (fh) {
      case 'Eyelashes':
        return null;
      case 'Stubble': {
        const mid = `${uid}maskStubble`;
        const jaw = 'M 11.6 31.35 L 36.4 31.35 L 36.65 35.4 Q 36.7 36.35 35.2 36.55 Q 24 37.35 12.8 36.55 Q 11.3 36.35 11.35 35.4 Z';
        return (
          <g pointerEvents="none">
            <defs>
              <mask id={mid}>
                <rect x="0" y="0" width={AVATAR_VIEWBOX_W} height={AVATAR_VIEWBOX_H} fill="black" />
                <path fill="white" d={jaw} />
                <ellipse cx="24" cy="33.55" rx="3.75" ry="1.9" fill="black" />
              </mask>
            </defs>
            <g mask={`url(#${mid})`}>
              {/* Skin-adjacent warm shadow first (reads as 5 o’clock shadow, not a solid beard) */}
              <path d={jaw} fill="rgba(45,28,22,0.22)" />
              <path d={jaw} fill="rgba(28,18,14,0.14)" />
              {/* Hair-tint grain: low opacity so it tints shadow rather than sitting opaque on top */}
              <path d={jaw} fill={F} opacity={0.12} />
              {[
                [13.2, 32.1], [15.8, 33.4], [18.4, 32.5], [21.2, 34.0], [24.0, 32.8], [26.8, 34.0], [29.6, 32.5], [32.2, 33.4], [34.6, 32.2],
                [14.5, 34.5], [19.0, 35.2], [24.0, 35.5], [29.0, 35.2], [33.4, 34.4],
              ].map(([cx, cy], i) => (
                <rect key={i} x={cx - 0.12} y={cy - 0.1} width="0.24" height="0.22" rx={0.06} fill={F} opacity={0.18} />
              ))}
            </g>
          </g>
        );
      }
      case 'Mustache':
        return (
          <g pointerEvents="none" fill={F}>
            <path
              d="M 18.2 30.15 Q 20.8 29.55 23.15 30.05 L 23.35 30.05 Q 24.65 29.85 24.85 30.05 Q 27.2 29.55 29.8 30.15 L 30.35 30.95 Q 27.4 31.45 24 31.25 Q 20.6 31.45 17.65 30.95 Z"
            />
            <path
              d="M 19.1 30.35 Q 21.4 30.05 23.9 30.45"
              fill="none"
              stroke="rgba(255,255,255,0.09)"
              strokeWidth="0.35"
              strokeLinecap="round"
            />
            <path
              d="M 24.1 30.45 Q 26.6 30.05 28.9 30.35"
              fill="none"
              stroke="rgba(255,255,255,0.09)"
              strokeWidth="0.35"
              strokeLinecap="round"
            />
          </g>
        );
      case 'Goatee':
        return (
          <g pointerEvents="none">
            <path
              fill={F}
              d="M 23.25 31.42 L 24.75 31.42 L 25.05 32.38 L 25.48 33.22 Q 26.32 35.05 24 36.42 Q 21.68 35.05 22.52 33.22 L 22.95 32.38 Z"
            />
            <path
              fill="rgba(0,0,0,0.15)"
              d="M 23.05 34.55 Q 24 35.32 24.95 34.55 Q 24 35.9 23.05 34.55 Z"
            />
          </g>
        );
      case 'Short Beard': {
        const mid = `${uid}maskShortBeard`;
        return (
          <g pointerEvents="none">
            <defs>
              <mask id={mid}>
                <rect x="0" y="0" width={AVATAR_VIEWBOX_W} height={AVATAR_VIEWBOX_H} fill="black" />
                <path
                  fill="white"
                  d="M 13.8 30.85 Q 13.2 32.8 14.2 36.1 Q 24 37.45 33.8 36.1 Q 34.8 32.8 34.2 30.85 Q 30.5 30.05 24 30.35 Q 17.5 30.05 13.8 30.85 Z"
                />
                <ellipse cx="24" cy="33.55" rx="3.9" ry="2" fill="black" />
              </mask>
            </defs>
            <g mask={`url(#${mid})`}>
              <path
                d="M 13.8 30.85 Q 13.2 32.8 14.2 36.1 Q 24 37.45 33.8 36.1 Q 34.8 32.8 34.2 30.85 Q 30.5 30.05 24 30.35 Q 17.5 30.05 13.8 30.85 Z"
                fill={F}
              />
              <path
                d="M 15.2 34.2 Q 24 36.2 32.8 34.2"
                fill="none"
                stroke="rgba(0,0,0,0.16)"
                strokeWidth="0.45"
                strokeLinecap="round"
              />
              <path
                d="M 17.5 31.1 Q 20.5 30.55 23.2 30.75"
                fill="none"
                stroke="rgba(255,255,255,0.07)"
                strokeWidth="0.28"
                strokeLinecap="round"
              />
              <path
                d="M 24.8 30.75 Q 27.5 30.55 30.5 31.1"
                fill="none"
                stroke="rgba(255,255,255,0.07)"
                strokeWidth="0.28"
                strokeLinecap="round"
              />
            </g>
          </g>
        );
      }
      case 'Full Beard': {
        const mid = `${uid}maskFullBeard`;
        return (
          <g pointerEvents="none">
            <defs>
              <mask id={mid}>
                <rect x="0" y="0" width={AVATAR_VIEWBOX_W} height={AVATAR_VIEWBOX_H} fill="black" />
                <path
                  fill="white"
                  d="M 12.9 29.35 Q 12.2 33.5 13.6 36.35 Q 24 38.05 34.4 36.35 Q 35.8 33.5 35.1 29.35 Q 31.2 28.45 24 28.85 Q 16.8 28.45 12.9 29.35 Z"
                />
                <ellipse cx="24" cy="33.55" rx="4.05" ry="2.05" fill="black" />
              </mask>
            </defs>
            <g mask={`url(#${mid})`}>
              <path
                d="M 12.9 29.35 Q 12.2 33.5 13.6 36.35 Q 24 38.05 34.4 36.35 Q 35.8 33.5 35.1 29.35 Q 31.2 28.45 24 28.85 Q 16.8 28.45 12.9 29.35 Z"
                fill={F}
              />
              <path
                d="M 14.5 33.8 Q 24 36.4 33.5 33.8"
                fill="none"
                stroke="rgba(0,0,0,0.18)"
                strokeWidth="0.55"
                strokeLinecap="round"
              />
              <path
                d="M 16.2 30.2 Q 20 29.35 23.4 29.55"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="0.32"
                strokeLinecap="round"
              />
              <path
                d="M 24.6 29.55 Q 28 29.35 31.8 30.2"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="0.32"
                strokeLinecap="round"
              />
            </g>
          </g>
        );
      }
      case 'Soul Patch':
        return (
          <g pointerEvents="none" fill={F}>
            <ellipse cx="24" cy="34.35" rx="1.35" ry="1.85" />
            <ellipse cx="24" cy="33.95" rx="0.55" ry="0.35" fill="rgba(255,255,255,0.1)" />
          </g>
        );
      case 'None':
      default:
        return null;
    }
  };

  // ── accessories ────────────────────────────────────────────────────────────

  const renderAccessories = () => {
    const ac = accessoryFill.fill;
    const fitGlasses = (inner: React.ReactNode) => (
      <g transform="translate(24 21.5) scale(0.89 1) translate(-24 -21.5)">{inner}</g>
    );
    switch (accessory) {
      case 'Glasses': return fitGlasses(<g fill={ac}><rect x="12" y="20" width="10" height="2" rx={0.4} /><rect x="12" y="26" width="10" height="2" rx={0.4} /><rect x="12" y="22" width="2" height="4" rx={0.24} /><rect x="20" y="22" width="2" height="4" rx={0.24} /><rect x="26" y="20" width="10" height="2" rx={0.4} /><rect x="26" y="26" width="10" height="2" rx={0.4} /><rect x="26" y="22" width="2" height="4" rx={0.24} /><rect x="34" y="22" width="2" height="4" rx={0.24} /><rect x="22" y="22" width="4" height="2" rx={0.3} /><rect x="8" y="22" width="4" height="2" rx={0.3} /><rect x="36" y="22" width="4" height="2" rx={0.3} /><rect x="12.3" y="21.7" width="9.4" height="0.7" rx={0.3} fill="rgba(255,255,255,0.15)" /><rect x="26.3" y="21.7" width="9.4" height="0.7" rx={0.3} fill="rgba(255,255,255,0.15)" /></g>);
      case 'Sunglasses': return fitGlasses(<g fill={ac}><rect x="12" y="20" width="10" height="8" rx={0.7} /><rect x="26" y="20" width="10" height="8" rx={0.7} /><rect x="12.4" y="20.4" width="9.2" height="0.9" rx={0.4} fill="rgba(255,255,255,0.12)" /><rect x="26.4" y="20.4" width="9.2" height="0.9" rx={0.4} fill="rgba(255,255,255,0.12)" /><rect x="22" y="22" width="4" height="2" rx={0.3} /><rect x="8" y="22" width="4" height="2" rx={0.3} /><rect x="36" y="22" width="4" height="2" rx={0.3} /></g>);
      case 'Aviators': return fitGlasses(
        <g fill={ac}>
          <path d="M 10 20 L 22 20 L 22 24.2 Q 16 30.35 10 24.2 Z" />
          <path d="M 26 20 L 38 20 L 38 24.2 Q 32 30.35 26 24.2 Z" />
          <rect x="22" y="20" width="4" height="2" rx={0.35} />
          <rect x="8" y="20" width="2" height="2" rx={0.25} />
          <rect x="38" y="20" width="2" height="2" rx={0.25} />
          <path d="M 10.6 20.45 L 21.4 20.45" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={0.45} strokeLinecap="round" />
          <path d="M 26.6 20.45 L 37.4 20.45" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={0.45} strokeLinecap="round" />
        </g>,
      );
      case 'Cyberpunk': return fitGlasses(<g><rect x="8" y="20" width="32" height="6" fill="#00ffcc" opacity="0.8" /><rect x="8" y="20" width="32" height="2" fill="#ff00ff" opacity="0.8" /><rect x="8" y="22" width="2" height="4" fill="#111" /><rect x="38" y="22" width="2" height="4" fill="#111" /></g>);
      case 'Shades V1': return fitGlasses(<g fill={ac}><rect x="10" y="20" width="12" height="6" /><rect x="26" y="20" width="12" height="6" /><rect x="22" y="22" width="4" height="2" /></g>);
      case 'Shades V2': return fitGlasses(<g fill={ac}><rect x="10" y="18" width="12" height="8" /><rect x="26" y="18" width="12" height="8" /><rect x="22" y="20" width="4" height="2" /><rect x="8" y="20" width="2" height="4" /><rect x="38" y="20" width="2" height="4" /></g>);
      case 'Shades V3': return fitGlasses(<g fill={ac}><rect x="12" y="20" width="8" height="6" /><rect x="28" y="20" width="8" height="6" /><rect x="20" y="22" width="8" height="2" /></g>);
      case 'Shades V4': return fitGlasses(<g fill={ac}><rect x="10" y="20" width="12" height="8" /><rect x="26" y="20" width="12" height="8" /><rect x="22" y="22" width="4" height="4" /><rect x="12" y="18" width="8" height="2" /><rect x="28" y="18" width="8" height="2" /></g>);
      case 'Shades V5': return fitGlasses(<g fill={ac}><rect x="10" y="22" width="12" height="4" /><rect x="26" y="22" width="12" height="4" /><rect x="22" y="22" width="4" height="2" /></g>);
      case 'Shades V6': return fitGlasses(<g fill={ac}><rect x="10" y="20" width="10" height="8" /><rect x="28" y="20" width="10" height="8" /><rect x="20" y="22" width="8" height="2" /></g>);
      case 'Shades V7': return fitGlasses(<g fill={ac}><rect x="12" y="18" width="10" height="8" /><rect x="26" y="18" width="10" height="8" /><rect x="22" y="20" width="4" height="2" /><rect x="10" y="20" width="2" height="4" /><rect x="36" y="20" width="2" height="4" /></g>);
      case 'Shades V8': return fitGlasses(<g fill={ac}><rect x="10" y="20" width="12" height="6" /><rect x="26" y="20" width="12" height="6" /><rect x="22" y="20" width="4" height="2" /><rect x="12" y="26" width="8" height="2" /><rect x="28" y="26" width="8" height="2" /></g>);
      case 'Shades V9': return fitGlasses(<g fill={ac}><rect x="10" y="20" width="12" height="8" /><rect x="26" y="20" width="12" height="8" /><rect x="22" y="22" width="4" height="2" /><rect x="8" y="22" width="2" height="2" /><rect x="38" y="22" width="2" height="2" /></g>);
      case 'Shades V10': return fitGlasses(<g fill={ac}><rect x="10" y="18" width="12" height="6" /><rect x="26" y="18" width="12" height="6" /><rect x="22" y="20" width="4" height="2" /><rect x="12" y="24" width="8" height="4" /><rect x="28" y="24" width="8" height="4" /></g>);
      case 'Voxel Glasses': return fitGlasses(<g><rect x="10" y="20" width="12" height="8" fill={`url(#${uid}custom)`} /><rect x="26" y="20" width="12" height="8" fill={`url(#${uid}custom)`} /><rect x="22" y="22" width="4" height="2" fill="#111" /><rect x="8" y="22" width="2" height="2" fill="#111" /><rect x="38" y="22" width="2" height="2" fill="#111" /></g>);
      case 'Earrings': return <g fill="#FFD700"><rect x="8" y="26" width="2" height="2" /><rect x="38" y="26" width="2" height="2" /></g>;
      case 'Headband': return <rect x="10" y="14" width="28" height="4" fill="#E11D48" />;
      case 'None': default: return null;
    }
  };

  const renderHat = () => {
    const hc = hatFill?.fill ?? null;
    switch (config.hat) {
      case 'Cap': return (
        <g>
          <rect x="12" y="8" width="24" height="8" rx={0.7} fill={hc ?? '#ef4444'} />
          <rect x="12.8" y="8.7" width="22.4" height="1.3" rx={0.4} fill="rgba(255,255,255,0.14)" />
          {[13.2, 16.5, 20, 23.5, 27, 30.5, 33.8].map((sx) => (
            <rect key={sx} x={sx} y="8.35" width="0.22" height="6.8" rx={0.04} fill="rgba(0,0,0,0.055)" />
          ))}
          <path d="M 13.5 10.2 Q 24 9.2 34.5 10.2" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.22" strokeLinecap="round" />
          <rect x="12" y="14" width="32" height="2" rx={0.3} fill={hc ?? '#ef4444'} />
          <rect x="14" y="14.16" width="24" height="0.7" rx={0.2} fill="rgba(0,0,0,0.12)" />
          <rect x="16" y="14.05" width="16" height="0.28" rx={0.1} fill="rgba(255,255,255,0.08)" />
        </g>
      );
      case 'Beanie': return (
        <g>
          <rect x="10" y="8" width="28" height="10" rx="4" fill={hc ?? '#3b82f6'} />
          {[10.5, 13.5, 16.5, 19.5, 22.5, 25.5, 28.5, 31.5, 34.5, 37.5].map((sx) => (
            <rect key={sx} x={sx} y="9" width="0.26" height="7.5" rx={0.05} fill="rgba(0,0,0,0.065)" />
          ))}
          <rect x="11" y="8.35" width="26" height="0.4" rx={0.15} fill="rgba(255,255,255,0.1)" />
          <rect x="10" y="16" width="28" height="4" fill={hc ?? '#2563eb'} />
          <rect x="10.5" y="16.15" width="27" height="0.35" rx={0.1} fill="rgba(0,0,0,0.12)" />
        </g>
      );
      case 'Top Hat': return (
        <g>
          <rect x="14" y="0" width="20" height="16" fill={hc ?? '#111'} />
          {[14.8, 17.5, 20.2, 22.9, 25.6, 28.3, 31].map((sx) => (
            <rect key={sx} x={sx} y="1" width="0.2" height="13" rx={0.04} fill="rgba(255,255,255,0.04)" />
          ))}
          <rect x="14.4" y="0.35" width="19.2" height="0.45" rx={0.12} fill="rgba(255,255,255,0.08)" />
          <rect x="8" y="16" width="32" height="2" fill={hc ?? '#111'} />
          <rect x="8.3" y="16.12" width="31.4" height="0.35" rx={0.1} fill="rgba(255,255,255,0.06)" />
          <rect x="14" y="12" width="20" height="4" fill={hc ? 'rgba(0,0,0,0.35)' : '#dc2626'} />
        </g>
      );
      case 'Cowboy': return (
        <g>
          <rect x="14" y="4" width="20" height="10" fill={hc ?? '#78350f'} />
          <path d="M 15 6 Q 24 4.5 33 6" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.24" strokeLinecap="round" />
          {[14.5, 18, 22, 26, 30, 33.5].map((sx) => (
            <rect key={sx} x={sx} y="5" width="0.22" height="7.5" rx={0.04} fill="rgba(0,0,0,0.08)" />
          ))}
          <rect x="6" y="14" width="36" height="4" fill={hc ?? '#78350f'} />
          <rect x="8" y="14.12" width="32" height="0.4" rx={0.1} fill="rgba(255,255,255,0.06)" />
          <rect x="10" y="16.2" width="28" height="0.35" rx={0.08} fill="rgba(0,0,0,0.15)" />
        </g>
      );
      case 'Crown': return (
        <g fill={hc ?? '#fbbf24'}>
          <rect x="12" y="9" width="24" height="8" rx={0.6} />
          <rect x="12.5" y="9.4" width="23" height="1.1" rx={0.4} fill="rgba(255,255,255,0.2)" />
          <rect x="12" y="13.7" width="24" height="0.9" rx={0.3} fill="rgba(0,0,0,0.12)" />
          <rect x="12" y="5" width="4" height="4" rx={0.5} /><rect x="22" y="5" width="4" height="4" rx={0.5} /><rect x="32" y="5" width="4" height="4" rx={0.5} />
          <rect x="12.4" y="5.3" width="1.8" height="1.1" rx={0.24} fill="rgba(255,255,255,0.25)" />
          <rect x="22.4" y="5.3" width="1.8" height="1.1" rx={0.24} fill="rgba(255,255,255,0.25)" />
          <rect x="32.4" y="5.3" width="1.8" height="1.1" rx={0.24} fill="rgba(255,255,255,0.25)" />
        </g>
      );
      case 'Bandana': return <g fill={hc ?? '#ef4444'}><rect x="10" y="12" width="28" height="6" /><rect x="36" y="14" width="4" height="8" /></g>;
      case 'Hat V1': return <g><rect x="10" y="8" width="28" height="6" fill={hc ?? '#1f2937'} /><rect x="8" y="14" width="32" height="2" fill={hc ?? '#1f2937'} /></g>;
      case 'Hat V2': return <g><rect x="12" y="6" width="24" height="8" fill={hc ?? '#111827'} /><rect x="8" y="14" width="32" height="4" fill={hc ?? '#111827'} /></g>;
      case 'Hat V3': return <g><rect x="14" y="4" width="20" height="10" fill={hc ?? '#334155'} /><rect x="8" y="14" width="32" height="2" fill={hc ?? '#334155'} /></g>;
      case 'Hat V4': return <g><rect x="12" y="8" width="24" height="8" fill={hc ?? '#7c2d12'} /><rect x="10" y="16" width="28" height="2" fill={hc ?? '#7c2d12'} /><rect x="20" y="10" width="8" height="2" fill="rgba(255,255,255,0.2)" /></g>;
      case 'Hat V5': return <g><rect x="10" y="8" width="28" height="8" fill={hc ?? '#0f766e'} /><rect x="10" y="16" width="28" height="2" fill={hc ?? '#0f766e'} /><rect x="18" y="8" width="12" height="2" fill="rgba(255,255,255,0.2)" /></g>;
      case 'Hat V7': return <g><rect x="10" y="6" width="28" height="10" fill={hc ?? '#6b21a8'} /><rect x="8" y="16" width="32" height="2" fill={hc ?? '#6b21a8'} /></g>;
      case 'Hat V8': return <g><rect x="12" y="8" width="24" height="6" fill={hc ?? '#854d0e'} /><rect x="10" y="14" width="28" height="4" fill={hc ?? '#854d0e'} /><rect x="20" y="8" width="8" height="2" fill="rgba(255,255,255,0.2)" /></g>;
      case 'Hat V10': return <g><rect x="10" y="8" width="28" height="6" fill={hc ?? '#0f172a'} /><rect x="8" y="14" width="32" height="4" fill={hc ?? '#0f172a'} /><rect x="22" y="8" width="4" height="2" fill="rgba(255,255,255,0.25)" /></g>;
      default: return null;
    }
  };

  const renderShirtBody = () => {
    const c = shirtFill.fill;
    const style = config.shirtStyle || 'Default';
    switch (style) {
      case 'Streetwear V1': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="8" y="44" width="32" height="2" fill="rgba(255,255,255,0.15)" /><rect x="14" y="48" width="20" height="4" fill="rgba(0,0,0,0.12)" /></g>;
      case 'Streetwear V2': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="8" y="40" width="32" height="4" fill="rgba(0,0,0,0.2)" /><rect x="22" y="44" width="4" height="12" fill="rgba(255,255,255,0.12)" /></g>;
      case 'Streetwear V3': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="10" y="42" width="6" height="6" fill="rgba(255,255,255,0.18)" /><rect x="32" y="42" width="6" height="6" fill="rgba(255,255,255,0.18)" /><rect x="16" y="52" width="16" height="2" fill="rgba(0,0,0,0.2)" /></g>;
      case 'Streetwear V4': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="8" y="48" width="32" height="2" fill="rgba(255,255,255,0.2)" /><rect x="18" y="40" width="12" height="4" fill="rgba(0,0,0,0.15)" /></g>;
      case 'Streetwear V5': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="8" y="40" width="4" height="16" fill="rgba(0,0,0,0.12)" /><rect x="36" y="40" width="4" height="16" fill="rgba(0,0,0,0.12)" /><rect x="20" y="44" width="8" height="4" fill="rgba(255,255,255,0.18)" /></g>;
      case 'Streetwear V6': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="12" y="42" width="24" height="2" fill="rgba(255,255,255,0.2)" /><rect x="12" y="50" width="24" height="2" fill="rgba(255,255,255,0.15)" /><rect x="22" y="44" width="4" height="10" fill="rgba(0,0,0,0.15)" /></g>;
      case 'Streetwear V7': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="10" y="46" width="28" height="2" fill="rgba(0,0,0,0.15)" /><rect x="16" y="48" width="16" height="6" fill="rgba(255,255,255,0.12)" /></g>;
      case 'Streetwear V8': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="8" y="42" width="32" height="2" fill="rgba(255,255,255,0.18)" /><rect x="18" y="44" width="12" height="4" fill="rgba(0,0,0,0.2)" /><rect x="20" y="50" width="8" height="4" fill="rgba(0,0,0,0.1)" /></g>;
      case 'Streetwear V9': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="12" y="40" width="24" height="4" fill="rgba(0,0,0,0.12)" /><rect x="12" y="52" width="24" height="2" fill="rgba(255,255,255,0.18)" /><rect x="22" y="44" width="4" height="8" fill="rgba(255,255,255,0.12)" /></g>;
      case 'Streetwear V10': return <g><rect x="8" y="40" width="32" height="16" fill={c} /><rect x="10" y="42" width="6" height="4" fill="rgba(0,0,0,0.15)" /><rect x="32" y="42" width="6" height="4" fill="rgba(0,0,0,0.15)" /><rect x="16" y="48" width="16" height="4" fill="rgba(255,255,255,0.16)" /><rect x="20" y="52" width="8" height="2" fill="rgba(0,0,0,0.15)" /></g>;
      case 'Tuxedo': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill="#1a1a1a" />
          {/* white shirt center */}
          <rect x="20" y="40" width="8" height="16" fill="#f0f0f0" />
          {/* lapels */}
          <rect x="16" y="40" width="4" height="10" fill="#1a1a1a" />
          <rect x="28" y="40" width="4" height="10" fill="#1a1a1a" />
          <rect x="18" y="40" width="2" height="6" fill="#f0f0f0" />
          <rect x="28" y="40" width="2" height="6" fill="#f0f0f0" />
          {/* bow tie */}
          <rect x="20" y="42" width="8" height="2" fill="#1a0030" />
          <rect x="22" y="40" width="4" height="6" fill="#1a0030" />
          {/* pocket square */}
          <rect x="10" y="42" width="4" height="4" fill="#f0f0f0" />
          {/* buttons */}
          <rect x="22" y="48" width="4" height="2" fill="#ccc" />
        </g>
      );
      case 'Cheetah Print': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill="#d4882a" />
          {/* spots */}
          <rect x="10" y="42" width="4" height="2" fill="#3d2000" /><rect x="10" y="44" width="2" height="2" fill="#3d2000" />
          <rect x="18" y="40" width="2" height="4" fill="#3d2000" /><rect x="20" y="40" width="2" height="2" fill="#3d2000" />
          <rect x="28" y="44" width="4" height="2" fill="#3d2000" /><rect x="30" y="46" width="2" height="2" fill="#3d2000" />
          <rect x="14" y="48" width="4" height="2" fill="#3d2000" /><rect x="16" y="50" width="2" height="2" fill="#3d2000" />
          <rect x="24" y="50" width="4" height="2" fill="#3d2000" /><rect x="22" y="52" width="2" height="2" fill="#3d2000" />
          <rect x="34" y="42" width="2" height="4" fill="#3d2000" /><rect x="36" y="44" width="2" height="2" fill="#3d2000" />
          <rect x="10" y="52" width="4" height="2" fill="#3d2000" />
        </g>
      );
      case 'Hawaiian': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill={c} />
          {/* flower dots */}
          <rect x="12" y="42" width="2" height="2" fill="#ff6b6b" /><rect x="10" y="44" width="2" height="2" fill="#ff6b6b" /><rect x="14" y="44" width="2" height="2" fill="#ff6b6b" /><rect x="12" y="46" width="2" height="2" fill="#ff6b6b" />
          <rect x="28" y="44" width="2" height="2" fill="#ffd93d" /><rect x="26" y="46" width="2" height="2" fill="#ffd93d" /><rect x="30" y="46" width="2" height="2" fill="#ffd93d" /><rect x="28" y="48" width="2" height="2" fill="#ffd93d" />
          <rect x="18" y="50" width="2" height="2" fill="#6bcb77" /><rect x="16" y="52" width="2" height="2" fill="#6bcb77" /><rect x="20" y="52" width="2" height="2" fill="#6bcb77" />
          <rect x="34" y="48" width="2" height="2" fill="#ff6b6b" /><rect x="32" y="50" width="2" height="2" fill="#ff6b6b" /><rect x="36" y="50" width="2" height="2" fill="#ff6b6b" />
        </g>
      );
      case 'Pinstripe': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill="#1e2030" />
          {/* vertical pinstripes */}
          <rect x="12" y="40" width="2" height="16" fill="rgba(255,255,255,0.18)" />
          <rect x="18" y="40" width="2" height="16" fill="rgba(255,255,255,0.18)" />
          <rect x="24" y="40" width="2" height="16" fill="rgba(255,255,255,0.18)" />
          <rect x="30" y="40" width="2" height="16" fill="rgba(255,255,255,0.18)" />
          <rect x="36" y="40" width="2" height="16" fill="rgba(255,255,255,0.18)" />
        </g>
      );
      case 'Flannel': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill={c} />
          {/* horizontal plaid lines */}
          <rect x="8" y="44" width="32" height="2" fill="rgba(255,255,255,0.22)" />
          <rect x="8" y="50" width="32" height="2" fill="rgba(255,255,255,0.22)" />
          {/* vertical plaid lines */}
          <rect x="14" y="40" width="2" height="16" fill="rgba(0,0,0,0.2)" />
          <rect x="22" y="40" width="2" height="16" fill="rgba(0,0,0,0.2)" />
          <rect x="30" y="40" width="2" height="16" fill="rgba(0,0,0,0.2)" />
          {/* cross intersections highlight */}
          <rect x="14" y="44" width="2" height="2" fill="rgba(255,255,255,0.3)" />
          <rect x="22" y="44" width="2" height="2" fill="rgba(255,255,255,0.3)" />
          <rect x="30" y="44" width="2" height="2" fill="rgba(255,255,255,0.3)" />
          <rect x="14" y="50" width="2" height="2" fill="rgba(255,255,255,0.3)" />
          <rect x="22" y="50" width="2" height="2" fill="rgba(255,255,255,0.3)" />
        </g>
      );
      case 'Denim Jacket': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill="#4a6fa5" />
          {/* darker collar area */}
          <rect x="8" y="40" width="32" height="4" fill="#3a5f95" />
          {/* center seam */}
          <rect x="22" y="40" width="4" height="16" fill="#3a5f95" />
          {/* chest pockets */}
          <rect x="10" y="44" width="6" height="4" fill="#3a5f95" />
          <rect x="32" y="44" width="6" height="4" fill="#3a5f95" />
          {/* stitching lines */}
          <rect x="10" y="50" width="28" height="2" fill="rgba(255,255,255,0.15)" />
          {/* buttons */}
          <rect x="22" y="46" width="4" height="2" fill="#6080b0" />
          <rect x="22" y="52" width="4" height="2" fill="#6080b0" />
        </g>
      );
      case 'Leather Jacket': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill="#1a1a1a" />
          {/* collar/lapels */}
          <rect x="8" y="40" width="8" height="8" fill="#222" />
          <rect x="32" y="40" width="8" height="8" fill="#222" />
          <rect x="12" y="40" width="4" height="10" fill="#2d2d2d" />
          <rect x="32" y="40" width="4" height="10" fill="#2d2d2d" />
          {/* zipper */}
          <rect x="22" y="40" width="4" height="16" fill="#444" />
          <rect x="22" y="40" width="4" height="2" fill="#888" />
          <rect x="22" y="46" width="4" height="2" fill="#888" />
          {/* shine */}
          <rect x="8" y="40" width="2" height="16" fill="rgba(255,255,255,0.08)" />
          <rect x="38" y="40" width="2" height="16" fill="rgba(255,255,255,0.08)" />
        </g>
      );
      case 'Varsity': return (
        <g>
          {/* body */}
          <rect x="8" y="40" width="32" height="16" fill={c} />
          {/* sleeves (sides) in contrasting white */}
          <rect x="8" y="40" width="6" height="16" fill="#f0f0f0" />
          <rect x="34" y="40" width="6" height="16" fill="#f0f0f0" />
          {/* collar */}
          <rect x="8" y="40" width="32" height="4" fill="#f0f0f0" />
          {/* stripes on sleeves */}
          <rect x="8" y="46" width="6" height="2" fill={c} />
          <rect x="34" y="46" width="6" height="2" fill={c} />
          {/* letter M on chest */}
          <rect x="20" y="44" width="2" height="6" fill="#f0f0f0" />
          <rect x="26" y="44" width="2" height="6" fill="#f0f0f0" />
          <rect x="22" y="44" width="4" height="2" fill="#f0f0f0" />
        </g>
      );
      case 'Hoodie': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill={c} />
          {/* hood/collar V-shape */}
          <rect x="18" y="40" width="12" height="2" fill="rgba(0,0,0,0.2)" />
          <rect x="20" y="42" width="8" height="2" fill="rgba(0,0,0,0.2)" />
          {/* front pocket */}
          <rect x="14" y="48" width="20" height="6" fill="rgba(0,0,0,0.15)" />
          <rect x="22" y="48" width="4" height="6" fill="rgba(0,0,0,0.1)" />
          {/* drawstrings */}
          <rect x="20" y="40" width="2" height="4" fill="rgba(0,0,0,0.3)" />
          <rect x="26" y="40" width="2" height="4" fill="rgba(0,0,0,0.3)" />
        </g>
      );
      case 'Camo': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill="#4a5e35" />
          {/* camo blotches */}
          <rect x="8" y="40" width="6" height="4" fill="#3a4a28" />
          <rect x="18" y="42" width="8" height="4" fill="#6b7c45" />
          <rect x="30" y="40" width="6" height="6" fill="#3a4a28" />
          <rect x="10" y="46" width="4" height="4" fill="#6b7c45" />
          <rect x="16" y="48" width="6" height="4" fill="#3a4a28" />
          <rect x="26" y="46" width="8" height="4" fill="#6b7c45" />
          <rect x="8" y="50" width="8" height="6" fill="#3a4a28" />
          <rect x="22" y="52" width="6" height="4" fill="#6b7c45" />
          <rect x="34" y="48" width="6" height="8" fill="#3a4a28" />
          <rect x="14" y="52" width="4" height="4" fill="#4a5e35" />
        </g>
      );
      case 'Suit': return (
        <g>
          {/* dark grey suit */}
          <rect x="8" y="40" width="32" height="16" fill="#2d2d3a" />
          {/* white shirt center */}
          <rect x="20" y="40" width="8" height="16" fill="#f5f5f5" />
          {/* lapels */}
          <rect x="16" y="40" width="6" height="10" fill="#2d2d3a" />
          <rect x="26" y="40" width="6" height="10" fill="#2d2d3a" />
          <rect x="18" y="40" width="2" height="8" fill="#f5f5f5" />
          <rect x="28" y="40" width="2" height="8" fill="#f5f5f5" />
          {/* tie */}
          <rect x="22" y="42" width="4" height="12" fill="#8b0000" />
          <rect x="22" y="42" width="4" height="2" fill="#a00000" />
          {/* button */}
          <rect x="22" y="48" width="4" height="2" fill="#ddd" />
        </g>
      );
      case 'Blazer': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill={c} />
          {/* white shirt peek */}
          <rect x="20" y="40" width="8" height="16" fill="#f5f5f5" />
          {/* lapels */}
          <rect x="14" y="40" width="8" height="10" fill={c} />
          <rect x="26" y="40" width="8" height="10" fill={c} />
          <rect x="18" y="40" width="2" height="8" fill="#f5f5f5" />
          <rect x="28" y="40" width="2" height="8" fill="#f5f5f5" />
          {/* pocket square */}
          <rect x="10" y="42" width="4" height="4" fill="#f5f5f5" />
          {/* button */}
          <rect x="22" y="48" width="4" height="2" fill="rgba(255,255,255,0.4)" />
        </g>
      );
      case 'Kimono': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill={c} />
          {/* wide diagonal collar */}
          <rect x="8" y="40" width="10" height="16" fill="rgba(0,0,0,0.2)" />
          <rect x="30" y="40" width="10" height="16" fill="rgba(0,0,0,0.2)" />
          <rect x="8" y="40" width="32" height="4" fill="rgba(255,255,255,0.15)" />
          {/* decorative border at bottom */}
          <rect x="8" y="52" width="32" height="4" fill="rgba(255,255,255,0.2)" />
          {/* decorative pattern on border */}
          <rect x="10" y="52" width="2" height="4" fill="rgba(0,0,0,0.2)" />
          <rect x="16" y="52" width="2" height="4" fill="rgba(0,0,0,0.2)" />
          <rect x="22" y="52" width="2" height="4" fill="rgba(0,0,0,0.2)" />
          <rect x="28" y="52" width="2" height="4" fill="rgba(0,0,0,0.2)" />
          <rect x="34" y="52" width="2" height="4" fill="rgba(0,0,0,0.2)" />
          {/* sash */}
          <rect x="18" y="46" width="12" height="4" fill="rgba(255,255,200,0.4)" />
        </g>
      );
      case 'Polo': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill={c} />
          {/* collar */}
          <rect x="16" y="40" width="16" height="4" fill="rgba(255,255,255,0.25)" />
          <rect x="18" y="38" width="12" height="4" fill={c} />
          {/* button placket */}
          <rect x="22" y="40" width="4" height="8" fill="rgba(0,0,0,0.15)" />
          <rect x="22" y="42" width="4" height="2" fill="rgba(255,255,255,0.4)" />
          <rect x="22" y="46" width="4" height="2" fill="rgba(255,255,255,0.4)" />
          {/* side stripe */}
          <rect x="8" y="40" width="2" height="16" fill="rgba(255,255,255,0.2)" />
          <rect x="38" y="40" width="2" height="16" fill="rgba(255,255,255,0.2)" />
        </g>
      );
      case 'Zebra Print': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill="#f5f5f5" />
          {/* diagonal black stripes */}
          <rect x="8" y="40" width="4" height="16" fill="#111" />
          <rect x="14" y="40" width="4" height="16" fill="#111" />
          <rect x="22" y="40" width="4" height="16" fill="#111" />
          <rect x="30" y="40" width="4" height="16" fill="#111" />
          <rect x="38" y="40" width="2" height="16" fill="#111" />
        </g>
      );
      case 'Leopard Print': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill="#c8922a" />
          {/* rosette spots */}
          <rect x="10" y="42" width="6" height="4" fill="#8b5e0a" opacity="0.7" />
          <rect x="12" y="40" width="2" height="2" fill="#8b5e0a" opacity="0.7" />
          <rect x="12" y="46" width="2" height="2" fill="#8b5e0a" opacity="0.7" />
          <rect x="22" y="44" width="6" height="4" fill="#8b5e0a" opacity="0.7" />
          <rect x="24" y="42" width="2" height="2" fill="#8b5e0a" opacity="0.7" />
          <rect x="24" y="48" width="2" height="2" fill="#8b5e0a" opacity="0.7" />
          <rect x="32" y="40" width="6" height="4" fill="#8b5e0a" opacity="0.7" />
          <rect x="34" y="44" width="2" height="2" fill="#8b5e0a" opacity="0.7" />
          <rect x="16" y="50" width="6" height="4" fill="#8b5e0a" opacity="0.7" />
          <rect x="18" y="48" width="2" height="2" fill="#8b5e0a" opacity="0.7" />
          <rect x="28" y="50" width="4" height="4" fill="#8b5e0a" opacity="0.7" />
        </g>
      );
      case 'Snake Skin': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill="#4a7a3a" />
          {/* scale diamond pattern */}
          <rect x="8" y="40" width="4" height="4" fill="#3a6a2a" />
          <rect x="14" y="40" width="4" height="4" fill="#3a6a2a" />
          <rect x="20" y="40" width="4" height="4" fill="#3a6a2a" />
          <rect x="26" y="40" width="4" height="4" fill="#3a6a2a" />
          <rect x="32" y="40" width="4" height="4" fill="#3a6a2a" />
          <rect x="10" y="44" width="4" height="4" fill="#3a6a2a" />
          <rect x="16" y="44" width="4" height="4" fill="#3a6a2a" />
          <rect x="22" y="44" width="4" height="4" fill="#3a6a2a" />
          <rect x="28" y="44" width="4" height="4" fill="#3a6a2a" />
          <rect x="34" y="44" width="4" height="4" fill="#3a6a2a" />
          <rect x="8" y="48" width="4" height="4" fill="#3a6a2a" />
          <rect x="14" y="48" width="4" height="4" fill="#3a6a2a" />
          <rect x="20" y="48" width="4" height="4" fill="#3a6a2a" />
          <rect x="26" y="48" width="4" height="4" fill="#3a6a2a" />
          <rect x="32" y="48" width="4" height="4" fill="#3a6a2a" />
          <rect x="10" y="52" width="4" height="4" fill="#3a6a2a" />
          <rect x="16" y="52" width="4" height="4" fill="#3a6a2a" />
          <rect x="22" y="52" width="4" height="4" fill="#3a6a2a" />
          <rect x="28" y="52" width="4" height="4" fill="#3a6a2a" />
          <rect x="34" y="52" width="4" height="4" fill="#3a6a2a" />
          {/* scale highlight dots */}
          <rect x="10" y="40" width="2" height="2" fill="rgba(255,255,255,0.2)" />
          <rect x="16" y="40" width="2" height="2" fill="rgba(255,255,255,0.2)" />
          <rect x="22" y="40" width="2" height="2" fill="rgba(255,255,255,0.2)" />
        </g>
      );
      case 'Tie-Dye': return (
        <g>
          {/* concentric rings from center */}
          <rect x="8" y="40" width="32" height="16" fill="#ff6b6b" />
          <rect x="10" y="42" width="28" height="12" fill="#ffd93d" />
          <rect x="12" y="44" width="24" height="8" fill="#6bcb77" />
          <rect x="14" y="46" width="20" height="4" fill="#4d96ff" />
          <rect x="18" y="46" width="12" height="2" fill="#c77dff" />
          <rect x="22" y="46" width="4" height="2" fill="#ff6b6b" />
          {/* swirl dots */}
          <rect x="8" y="48" width="2" height="2" fill="#6bcb77" />
          <rect x="38" y="44" width="2" height="2" fill="#4d96ff" />
          <rect x="10" y="54" width="2" height="2" fill="#ffd93d" />
          <rect x="36" y="52" width="2" height="2" fill="#ff6b6b" />
        </g>
      );
      case 'Neon Crop': return (
        <g>
          {/* cropped at y=24 (shorter shirt) */}
          <rect x="8" y="40" width="32" height="10" fill={c} />
          {/* neon glow edge */}
          <rect x="8" y="48" width="32" height="2" fill="rgba(255,255,255,0.5)" />
          {/* horizontal stripe detail */}
          <rect x="8" y="44" width="32" height="2" fill="rgba(255,255,255,0.2)" />
          {/* no lower body (crop) */}
          <rect x="8" y="50" width="32" height="6" fill="rgba(0,0,0,0)" />
        </g>
      );
      case 'Biker': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill="#111" />
          {/* open collar V */}
          <rect x="18" y="40" width="12" height="6" fill="#222" />
          <rect x="20" y="40" width="8" height="10" fill="#111" />
          {/* studs along shoulders */}
          <rect x="8" y="40" width="2" height="2" fill="#aaa" />
          <rect x="12" y="40" width="2" height="2" fill="#aaa" />
          <rect x="16" y="40" width="2" height="2" fill="#aaa" />
          <rect x="30" y="40" width="2" height="2" fill="#aaa" />
          <rect x="34" y="40" width="2" height="2" fill="#aaa" />
          <rect x="38" y="40" width="2" height="2" fill="#aaa" />
          {/* patch outline */}
          <rect x="10" y="44" width="10" height="8" fill="#222" />
          <rect x="10" y="44" width="10" height="2" fill="#555" />
          <rect x="10" y="50" width="10" height="2" fill="#555" />
          {/* zipper */}
          <rect x="22" y="40" width="4" height="12" fill="#333" />
          <rect x="22" y="44" width="4" height="2" fill="#777" />
        </g>
      );
      case 'Sailor': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill="#f5f5f5" />
          {/* navy blue stripes */}
          <rect x="8" y="42" width="32" height="2" fill="#1e3a6e" />
          <rect x="8" y="46" width="32" height="2" fill="#1e3a6e" />
          <rect x="8" y="50" width="32" height="2" fill="#1e3a6e" />
          <rect x="8" y="54" width="32" height="2" fill="#1e3a6e" />
          {/* sailor collar */}
          <rect x="8" y="40" width="12" height="8" fill="#1e3a6e" />
          <rect x="28" y="40" width="12" height="8" fill="#1e3a6e" />
          <rect x="8" y="40" width="32" height="4" fill="#1e3a6e" />
          {/* anchor emblem */}
          <rect x="22" y="50" width="4" height="6" fill="#1e3a6e" />
          <rect x="20" y="50" width="8" height="2" fill="#1e3a6e" />
          <rect x="20" y="54" width="2" height="2" fill="#1e3a6e" />
          <rect x="26" y="54" width="2" height="2" fill="#1e3a6e" />
        </g>
      );
      case 'Space Suit': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill="#c8c8d4" />
          {/* suit panels */}
          <rect x="8" y="40" width="32" height="4" fill="#a0a0b0" />
          <rect x="8" y="52" width="32" height="4" fill="#a0a0b0" />
          {/* tech panel left */}
          <rect x="10" y="44" width="8" height="8" fill="#888898" />
          <rect x="10" y="44" width="8" height="2" fill="#6a6a7a" />
          <rect x="12" y="46" width="2" height="2" fill="#44f" opacity="0.6" />
          <rect x="16" y="46" width="2" height="2" fill="#f44" opacity="0.6" />
          <rect x="12" y="48" width="6" height="2" fill="#6a6a7a" />
          {/* center seal */}
          <rect x="20" y="44" width="8" height="8" fill="#8898b0" />
          <rect x="22" y="46" width="4" height="4" fill="#aabbcc" />
          {/* right panel */}
          <rect x="30" y="44" width="8" height="8" fill="#888898" />
          <rect x="30" y="46" width="8" height="2" fill="#6a6a7a" />
          {/* side stripes */}
          <rect x="8" y="40" width="2" height="16" fill="#8888a0" />
          <rect x="38" y="40" width="2" height="16" fill="#8888a0" />
        </g>
      );
      case 'Grim Reaper': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill="#111118" />
          {/* dark purple inner lining */}
          <rect x="14" y="40" width="20" height="16" fill="#1a0030" />
          {/* robe folds */}
          <rect x="14" y="40" width="4" height="16" fill="#0d001a" />
          <rect x="30" y="40" width="4" height="16" fill="#0d001a" />
          <rect x="22" y="40" width="4" height="16" fill="#0d001a" />
          {/* skull emblem */}
          <rect x="20" y="44" width="8" height="6" fill="#ddd" />
          <rect x="20" y="42" width="8" height="2" fill="#ddd" />
          <rect x="20" y="50" width="2" height="2" fill="#ddd" />
          <rect x="26" y="50" width="2" height="2" fill="#ddd" />
          <rect x="22" y="50" width="4" height="2" fill="#111118" />
          {/* skull eyes */}
          <rect x="20" y="44" width="2" height="2" fill="#111118" />
          <rect x="26" y="44" width="2" height="2" fill="#111118" />
          {/* glow trim */}
          <rect x="8" y="54" width="32" height="2" fill="#4b0082" opacity="0.6" />
        </g>
      );
      case 'Golden Armor': return (
        <g>
          <rect x="8" y="40" width="32" height="16" fill="#b8860b" />
          {/* chest plate */}
          <rect x="12" y="40" width="24" height="16" fill="#daa520" />
          {/* plate segments */}
          <rect x="12" y="46" width="24" height="2" fill="#b8860b" />
          <rect x="12" y="52" width="24" height="2" fill="#b8860b" />
          {/* vertical center line */}
          <rect x="22" y="40" width="4" height="16" fill="#b8860b" />
          {/* shoulder pauldrons */}
          <rect x="8" y="40" width="6" height="8" fill="#daa520" />
          <rect x="34" y="40" width="6" height="8" fill="#daa520" />
          <rect x="8" y="46" width="6" height="2" fill="#b8860b" />
          <rect x="34" y="46" width="6" height="2" fill="#b8860b" />
          {/* metallic shine */}
          <rect x="14" y="40" width="4" height="6" fill="#ffd700" opacity="0.5" />
          <rect x="26" y="40" width="4" height="6" fill="#ffd700" opacity="0.5" />
          <rect x="8" y="40" width="2" height="16" fill="rgba(255,215,0,0.3)" />
          {/* gem on chest */}
          <rect x="22" y="42" width="4" height="4" fill="#00bcd4" />
        </g>
      );
      default: return (
        <g>
          {/* Shoulders + torso: rounded outer shoulder caps; crew curve under neck */}
          <path
            d="M 8 56 L 8 40.35 Q 8.85 38.95 10.85 38.62 Q 12.9 38.45 14.5 38.55 L 19.5 39.95 L 20.2 40.35 Q 24 41.15 27.8 40.35 L 28.5 39.95 L 33.5 38.55 Q 35.1 38.45 37.15 38.62 Q 39.15 38.95 40 40.35 L 40 56 Q 24 55.4 8 56 Z"
            fill={c}
          />
          <path
            d="M 8.6 41.2 L 8.6 55.2 Q 24 54.65 39.4 55.2 L 39.4 41.2 Q 37.35 39.35 33.2 39.35 L 28.4 40.65 Q 24 41.35 19.6 40.65 L 14.8 39.35 Q 10.65 39.35 8.6 41.2 Z"
            fill="rgba(255,255,255,0.06)"
          />
          <path
            d="M 19.2 40.5 Q 24 41.45 28.8 40.5"
            fill="none"
            stroke="rgba(0,0,0,0.14)"
            strokeWidth="0.35"
            strokeLinecap="round"
          />
          <rect x="8" y="53.5" width="32" height="2.35" rx={0.45} fill="rgba(0,0,0,0.1)" />
          <rect x="22.5" y="44.5" width="3.2" height="7.5" rx={0.35} fill="rgba(0,0,0,0.06)" />
          <rect x="10.2" y="44" width="3.6" height="9.5" rx={0.4} fill="rgba(255,255,255,0.05)" />
          <rect x="34.2" y="44" width="3.6" height="9.5" rx={0.4} fill="rgba(0,0,0,0.05)" />
        </g>
      );
    }
  };

  const renderNecklace = () => {
    const d = NECKLACE_DRAPE.d;
    switch (config.necklace) {
      case 'Gold Chain': {
        const beads = NECKLACE_CHAIN_TS.map((t) => sampleNecklaceDrape(t));
        return (
          <g>
            <path d={d} fill="none" stroke="#b45309" strokeWidth={1.45} strokeLinecap="round" />
            <path d={d} fill="none" stroke="#fbbf24" strokeWidth={0.9} strokeLinecap="round" />
            {beads.map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r={0.52} fill="#fcd34d" stroke="#b45309" strokeWidth={0.12} />
            ))}
          </g>
        );
      }
      case 'Silver Chain': {
        const beads = NECKLACE_CHAIN_TS.map((t) => sampleNecklaceDrape(t));
        return (
          <g>
            <path d={d} fill="none" stroke="#64748b" strokeWidth={1.35} strokeLinecap="round" />
            <path d={d} fill="none" stroke="#e2e8f0" strokeWidth={0.85} strokeLinecap="round" />
            {beads.map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r={0.5} fill="#f1f5f9" stroke="#94a3b8" strokeWidth={0.1} />
            ))}
          </g>
        );
      }
      case 'Voxel Chain': {
        const [mx, my] = sampleNecklaceDrape(0.5);
        return (
          <g>
            <path d={d} fill="none" stroke={`url(#${uid}custom)`} strokeWidth={1.55} strokeLinecap="round" />
            <path d={d} fill="none" stroke="rgba(0,0,0,0.22)" strokeWidth={1.55} strokeLinecap="round" opacity={0.4} />
            <rect x={mx - 3.25} y={my + 0.35} width="6.5" height="5.8" fill={`url(#${uid}custom)`} rx={0.45} />
            <rect x={mx - 2.2} y={my + 0.7} width="2.4" height="1.75" rx={0.28} fill="rgba(255,255,255,0.22)" />
          </g>
        );
      }
      default: return null;
    }
  };

  const renderMouthAccessory = () => {
    switch (config.mouthAccessory) {
      case 'Cigar': return (
        <g>
          <rect x="26" y="32" width="8" height="2" fill="#78350f" rx={0.35} />
          <rect x="28" y="32.15" width="3.2" height="0.45" rx={0.12} fill="rgba(255,255,255,0.12)" />
          <rect x="26.2" y="32.55" width="6.5" height="0.25" rx={0.08} fill="rgba(0,0,0,0.15)" />
          {/* Animated ember tip */}
          <motion.rect x="34" y="32" width="2" height="2"
            animate={{ fill: ['#ef4444', '#ff6b1a', '#ffdd33', '#ff6b1a', '#ef4444'] }}
            transition={{ repeat: Infinity, duration: 2 + Math.random() * 2, ease: 'easeInOut' }}
          />
        </g>
      );
      case 'Cigarette': return (
        <g>
          <rect x="26" y="32" width="6" height="2" fill="#fff" rx={0.3} />
          <rect x="26.5" y="32.18" width="4" height="0.35" rx={0.1} fill="rgba(0,0,0,0.06)" />
          {/* Animated ember tip */}
          <motion.rect x="32" y="32" width="2" height="2"
            animate={{ fill: ['#f97316', '#ff8c1a', '#ffcc33', '#ff8c1a', '#f97316'] }}
            transition={{ repeat: Infinity, duration: 1.5 + Math.random() * 2, ease: 'easeInOut' }}
          />
        </g>
      );
      case 'Pipe': return (
        <g>
          <rect x="26" y="32" width="8" height="2" fill="#451a03" rx={0.25} />
          <rect x="26.3" y="32.12" width="5" height="0.4" rx={0.1} fill="rgba(255,255,255,0.08)" />
          <rect x="32" y="30" width="4" height="4" fill="#451a03" rx={0.4} />
          <ellipse cx="34" cy="31.2" rx="1.4" ry="0.55" fill="rgba(255,255,255,0.06)" />
          {/* Animated ember glow inside bowl */}
          <motion.rect x="32.5" y="30.2" width="3" height="1.2" rx="0.4"
            animate={{ fill: ['#ef4444', '#ff6b1a', '#ffcc33', '#ff6b1a', '#ef4444'], opacity: [0.6, 0.9, 0.6] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          />
        </g>
      );
      case 'Bubblegum':
        return <AvatarAnimatedBubblegum />;
      case 'Medical Mask': return (
        <g>
          <rect x="16" y="28" width="16" height="8" fill="#bae6fd" rx={0.6} />
          <rect x="16.3" y="28.25" width="15.4" height="0.45" rx={0.15} fill="rgba(255,255,255,0.35)" />
          {[17, 20, 23, 26, 29].map((sx) => (
            <rect key={sx} x={sx} y="30" width="0.22" height="4.5" rx={0.05} fill="rgba(0,0,0,0.06)" />
          ))}
          <rect x="12" y="28" width="4" height="2" fill="#e0f2fe" rx={0.25} />
          <rect x="32" y="28" width="4" height="2" fill="#e0f2fe" rx={0.25} />
        </g>
      );
      default: return null;
    }
  };

  /** Smoke particles rising from cigar / cigarette / pipe — white, layered wisps; cigar = largest billows */
  const renderSmokingEffects = () => {
    let originX: number;
    let originY: number;
    let kind: 'cigar' | 'cigarette' | 'pipe';
    switch (config.mouthAccessory) {
      case 'Cigar':
        originX = 35.2;
        originY = 30.4;
        kind = 'cigar';
        break;
      case 'Cigarette':
        originX = 33;
        originY = 31;
        kind = 'cigarette';
        break;
      case 'Pipe':
        originX = 34;
        originY = 28.6;
        kind = 'pipe';
        break;
      default:
        return null;
    }

    if (!smokePuffing) return null;

    type SmokeP = { dx: number; rise: number; size: number; dur: number; delay: number; drift: number };
    const cigarParticles: SmokeP[] = [
      { dx: 0.2, rise: -24, size: 4.2, dur: 3.4, delay: 0, drift: 2.4 },
      { dx: -1.8, rise: -28, size: 5, dur: 3.9, delay: 0.28, drift: -1.9 },
      { dx: 2.2, rise: -30, size: 5.4, dur: 4.2, delay: 0.55, drift: 2.8 },
      { dx: -0.6, rise: -20, size: 3.6, dur: 3.0, delay: 0.82, drift: -1.2 },
      { dx: 1.4, rise: -26, size: 4.8, dur: 3.7, delay: 1.1, drift: 2.1 },
      { dx: -2.4, rise: -22, size: 4, dur: 3.2, delay: 1.38, drift: -2.6 },
      { dx: 0.8, rise: -32, size: 5.8, dur: 4.5, delay: 1.65, drift: 1.5 },
      { dx: 2.8, rise: -18, size: 3.4, dur: 2.9, delay: 1.92, drift: 3.2 },
      { dx: -1.2, rise: -27, size: 4.6, dur: 3.6, delay: 2.2, drift: -2 },
      { dx: 1.6, rise: -21, size: 3.8, dur: 3.1, delay: 2.48, drift: 1.8 },
    ];
    const smallParticles: SmokeP[] = [
      { dx: 0.5, rise: -16, size: 2.4, dur: 2.9, delay: 0, drift: 1.4 },
      { dx: -1.2, rise: -19, size: 2.8, dur: 3.2, delay: 0.45, drift: -1.1 },
      { dx: 1.6, rise: -21, size: 3, dur: 3.4, delay: 0.9, drift: 1.8 },
      { dx: -0.3, rise: -14, size: 2, dur: 2.6, delay: 1.35, drift: -0.6 },
      { dx: 2, rise: -23, size: 3.2, dur: 3.6, delay: 1.8, drift: 2.2 },
      { dx: -1.6, rise: -17, size: 2.5, dur: 2.8, delay: 2.25, drift: -1.5 },
      { dx: 0.9, rise: -20, size: 2.7, dur: 3.0, delay: 2.7, drift: 1.2 },
    ];
    const particles: SmokeP[] = kind === 'cigar' ? cigarParticles : smallParticles;

    const renderWisp = (p: SmokeP, i: number, layer: 'halo' | 'core') => {
      const halo = layer === 'halo';
      const mul = kind === 'cigar' ? 1 : 0.92;
      const base = p.size * mul * (halo ? 1.35 : 1);
      const startSize = base * 0.42;
      const midSize = base * 0.92;
      const endSize = base * (kind === 'cigar' ? 3.15 : 2.45);
      const rise = p.rise * (halo ? 0.92 : 1);
      const drift = p.drift * (halo ? 1.15 : 1);
      const fill = halo ? 'rgba(255,255,255,0.42)' : 'rgba(252,252,255,0.92)';
      const op = halo
        ? [0.08, 0.5, 0.35, 0]
        : [0.15, 0.88, 0.62, 0];
      return (
        <motion.rect
          key={`smoke-${layer}-${i}`}
          fill={fill}
          pointerEvents="none"
          initial={false}
          animate={{
            y: [originY, originY + rise * 0.28, originY + rise],
            x: [
              originX - startSize / 2,
              originX - midSize / 2 + p.dx * 0.55,
              originX - endSize / 2 + drift,
            ],
            width: [startSize, midSize, endSize],
            height: [startSize, midSize, endSize],
            rx: [startSize / 2, midSize / 2, endSize / 2],
            opacity: op,
          }}
          transition={{
            repeat: Infinity,
            duration: p.dur * (halo ? 1.08 : 1),
            delay: p.delay + (halo ? 0.04 : 0),
            ease: 'easeOut',
            times: [0, 0.22, 0.58, 1],
          }}
        />
      );
    };

    return (
      <g pointerEvents="none">
        {particles.map((p, i) => (
          <g key={`smoke-g-${i}`}>
            {renderWisp(p, i, 'halo')}
            {renderWisp(p, i, 'core')}
          </g>
        ))}
      </g>
    );
  };

  // ── emotion particle effects (full-size only) ─────────────────────────────

  const renderEmotionEffects = () => {
    // In compact mode, allow key emotional effects through; suppress heavy/decorative ones
    if (compact && !['sleepy', 'sad', 'love', 'money', 'shock', 'jackpot'].includes(emotion)) return null;
    switch (emotion) {
      case 'sad':
        return (
          <g>
            {/* Left eye tears */}
            {[0, 1, 2].map(i => (
              <motion.rect key={`lt${i}`} x="16" y="26" width="2" height="2" fill="#60a5fa"
                animate={{ y: [0, 20], opacity: [0, 1, 0] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.4, ease: 'easeIn' }} />
            ))}
            {/* Right eye tears */}
            {[0, 1, 2].map(i => (
              <motion.rect key={`rt${i}`} x="30" y="26" width="2" height="2" fill="#60a5fa"
                animate={{ y: [0, 20], opacity: [0, 1, 0] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.4 + 0.2, ease: 'easeIn' }} />
            ))}
          </g>
        );
      case 'love':
        return <g>{[0, 1, 2].map(i => (<motion.rect key={i} x={16 + i * 6} y="10" width="4" height="4" fill="#ef4444" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1, 0], y: [0, -10], opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 2, delay: i * 0.6 }} />))}</g>;
      case 'money':
        return <g>{[0, 1, 2, 3, 4].map(i => (<motion.text key={i} x={8 + i * 8} y="-5" fontSize="8" fill="#22c55e" animate={{ y: [0, 120], opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 2, delay: i * 0.4 }}>$</motion.text>))}</g>;
      case 'sleepy': {
        const zDefs = [
          { x: 30, y: 14, tx: 35, ty: -6, size: 5, delay: 0 },
          { x: 33, y: 12, tx: 40, ty: -4, size: 7.6, delay: 1.3 },
          { x: 27, y: 16, tx: 32, ty: -1, size: 4, delay: 2.6 },
        ];
        return (
          <g>
            {zDefs.map((z, i) => (
              <motion.text
                key={i} x={z.x} y={z.y} fontSize={z.size}
                fill="#93c5fd" fontWeight="bold"
                animate={{ x: [z.x, z.tx], y: [z.y, z.ty], opacity: [0, 0.9, 0.9, 0], scale: [0.3, 0.7, 1.1, 1.6] }}
                transition={{ repeat: Infinity, duration: 4, delay: z.delay, ease: 'easeOut' }}
              >Z</motion.text>
            ))}
          </g>
        );
      }
      case 'shock':
        return <motion.rect x="22" y="4" width="4" height="8" fill="#eab308" animate={{ opacity: [0, 1, 0], scaleY: [0.5, 1.5, 0.5] }} transition={{ repeat: Infinity, duration: 0.2 }} style={{ transformOrigin: avatarMotionOrigin(24, 8) }} />;
      case 'jackpot':
        return <g>{[0, 1, 2, 3, 4, 5].map(i => (<motion.rect key={i} x={8 + i * 6} y="-3" width="2" height="2" fill="#eab308" animate={{ y: [0, 120], opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }} />))}</g>;
      case 'think':
        return <g><motion.rect x="36" y="10" width="8" height="8" rx="2" fill="white" stroke="#d4d4d8" strokeWidth="0.3" animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2 }} /><rect x="34" y="16" width="2" height="2" rx="1" fill="white" stroke="#d4d4d8" strokeWidth="0.3" /><text x="37" y="17" fontSize="6" fill="#71717a">?</text></g>;
      case 'king':
        return <g fill="#fbbf24"><rect x="14" y="6" width="20" height="6" /><rect x="10" y="6" width="4" height="4" /><rect x="22" y="4" width="4" height="4" /><rect x="34" y="6" width="4" height="4" /><rect x="18" y="8" width="2" height="2" fill="#ef4444" /><rect x="28" y="8" width="2" height="2" fill="#3b82f6" /></g>;
      case 'chips':
        return <g><rect x="36" y="32" width="8" height="2" fill="#ef4444" rx="1" /><rect x="36" y="29" width="8" height="2" fill="#3b82f6" rx="1" /><rect x="36" y="26" width="8" height="2" fill="#22c55e" rx="1" /><rect x="4" y="32" width="8" height="2" fill="#3b82f6" rx="1" /><rect x="4" y="29" width="8" height="2" fill="#ef4444" rx="1" /></g>;
      case 'cards':
        return <g><motion.g animate={{ rotate: [-5, 5, -5] }} transition={{ repeat: Infinity, duration: 2 }} style={{ transformOrigin: avatarMotionOrigin(40, 30) }}><rect x="36" y="24" width="8" height="12" fill="white" stroke="#d4d4d8" strokeWidth="0.2" rx="1" /><rect x="38" y="26" width="4" height="8" fill="#ef4444" opacity="0.2" /></motion.g><motion.g animate={{ rotate: [5, -5, 5] }} transition={{ repeat: Infinity, duration: 2 }} style={{ transformOrigin: avatarMotionOrigin(8, 30) }}><rect x="4" y="24" width="8" height="12" fill="white" stroke="#d4d4d8" strokeWidth="0.2" rx="1" /><rect x="6" y="26" width="4" height="8" fill="#000" opacity="0.2" /></motion.g></g>;
      case 'dice':
        return <motion.g animate={{ x: [0, 2, -2, 0], y: [0, -2, 0], rotate: [0, 90, 180, 270, 360] }} transition={{ repeat: Infinity, duration: 1 }} style={{ transformOrigin: avatarMotionOrigin(40, 36) }}><rect x="36" y="32" width="8" height="8" fill="white" rx="1" /><circle cx="38" cy="34" r="1" fill="black" /><circle cx="42" cy="38" r="1" fill="black" /></motion.g>;
      case 'ninja':
        return <motion.g animate={{ x: [0, 20, -20, 0] }} transition={{ duration: 0.5 }}><rect x="38" y="20" width="2" height="16" fill="#71717a" /><rect x="36" y="34" width="6" height="2" fill="#18181b" /></motion.g>;
      default: return null;
    }
  };

  // ── size ───────────────────────────────────────────────────────────────────

  const sizeClass = compact ? 'w-10 aspect-[6/7]' : 'w-64 aspect-[6/7]';

  return (
    <div
      className={`relative overflow-hidden flex items-end justify-center ${sizeClass} ${className ?? ''}`}
    >
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        viewBox={AVATAR_VIEWBOX}
        className="w-full h-full absolute top-0 left-0"
        shapeRendering="geometricPrecision"
      >
        <defs>
          {/* Decorative patterns — instance-scoped via uid prefix */}
          <AvatarPatternDefs prefix={uid} />
          <mask id={`${uid}faceMask`}>
            {renderFaceShape('white', 'silhouette')}
          </mask>
          <radialGradient id={`${uid}angryGradient`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(239,68,68,0.4)" /><stop offset="100%" stopColor="rgba(239,68,68,0)" />
          </radialGradient>
          <radialGradient id={`${uid}sickGradient`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(34,197,94,0.4)" /><stop offset="100%" stopColor="rgba(34,197,94,0)" />
          </radialGradient>
          {config.customPattern && (
            <pattern id={`${uid}custom`} patternUnits="userSpaceOnUse" width="16" height="16">
              <image
                href={normalizeAvatarRasterUrl(config.customPattern)}
                xlinkHref={normalizeAvatarRasterUrl(config.customPattern)}
                x="0"
                y="0"
                width="16"
                height="16"
                preserveAspectRatio="xMidYMid slice"
              />
            </pattern>
          )}
          {/* Dynamic gradient defs — IDs are instance-unique to avoid collisions */}
          {skinFill.gradientDef && (
            <linearGradient id={`${uid}grad_skin`} {...angleToSvgCoords(skinFill.gradientDef.angle)}>
              {sortedStops(skinFill.gradientDef.stops).map((s, i) => (
                <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} stopOpacity={s.opacity} />
              ))}
            </linearGradient>
          )}
          {hairFill.gradientDef && (
            <linearGradient id={`${uid}grad_hair`} {...angleToSvgCoords(hairFill.gradientDef.angle)}>
              {sortedStops(hairFill.gradientDef.stops).map((s, i) => (
                <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} stopOpacity={s.opacity} />
              ))}
            </linearGradient>
          )}
          {shirtFill.gradientDef && (
            <linearGradient id={`${uid}grad_shirt`} {...angleToSvgCoords(shirtFill.gradientDef.angle)}>
              {sortedStops(shirtFill.gradientDef.stops).map((s, i) => (
                <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} stopOpacity={s.opacity} />
              ))}
            </linearGradient>
          )}
          {accessoryFill.gradientDef && (
            <linearGradient id={`${uid}grad_accessory`} {...angleToSvgCoords(accessoryFill.gradientDef.angle)}>
              {sortedStops(accessoryFill.gradientDef.stops).map((s, i) => (
                <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} stopOpacity={s.opacity} />
              ))}
            </linearGradient>
          )}
          {hatFill?.gradientDef && (
            <linearGradient id={`${uid}grad_hat`} {...angleToSvgCoords(hatFill.gradientDef.angle)}>
              {sortedStops(hatFill.gradientDef.stops).map((s, i) => (
                <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} stopOpacity={s.opacity} />
              ))}
            </linearGradient>
          )}
          {bgGradDef && (
            <linearGradient id={`${uid}grad_bg`} {...angleToSvgCoords(bgGradDef.angle)}>
              {sortedStops(bgGradDef.stops).map((s, i) => (
                <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} stopOpacity={s.opacity} />
              ))}
            </linearGradient>
          )}
        </defs>
        {/* Background — outside all animation wrappers, always static */}
        {showAvatarBackground && (
          bgGradDef
            ? <rect x="0" y="0" width="48" height="56" fill={`url(#${uid}grad_bg)`} />
            : (
              <image
                href={bgRasterHref}
                xlinkHref={bgRasterHref}
                x="0"
                y="0"
                width="48"
                height="56"
                preserveAspectRatio="xMidYMid slice"
              />
            )
        )}

        {/* Breathing idle animation wrapper */}
        <motion.g
          animate={{ scaleY: [1, 1.01, 1], y: [0, -0.2, 0], rotate: [0, 1, -1, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: avatarMotionOrigin(24, 56) }}
        >
          <motion.g animate={emotion} variants={bodyVariants} style={{ transformOrigin: avatarMotionOrigin(24, 48) }}>

            {/* Shirt */}
            {renderShirtBody()}
            {renderTorsoFabricFinish()}
            <rect x="20" y="34" width="8" height="6" fill={skinFill.fill} />

            {renderNecklace()}

            {/* Hair back */}
            <motion.g animate={{ y: offsets.head.y }}>
              {config.hat === 'None' && renderHairBack()}
            </motion.g>

            {/* Ears — small portrait-style shells + inner bowl (not wide side slabs) */}
            <motion.g animate={{ x: -offsets.ears.x, y: offsets.ears.y }}>
              <path
                d="M 10.6 22.35 Q 8.85 23.5 9.05 25.9 Q 9.25 27.85 10.95 27.45 L 12.05 26.15 Q 11.35 25.35 10.75 24.2 Q 10.45 23.05 10.6 22.35 Z"
                fill={skinFill.fill}
              />
              {/* Wide cheek strip moves with ear offset so it still reaches x≈12 face edge (fixed bridges left a BG gap). */}
              <rect x="11.35" y="21.85" width="2.35" height="5.45" rx={0.25} fill={skinFill.fill} />
              <ellipse cx="10.35" cy="25.05" rx="1.35" ry="1.65" fill="rgba(0,0,0,0.13)" />
              <path d="M 9.55 23.65 Q 10.05 24.9 10.85 25.35" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="0.28" strokeLinecap="round" />
            </motion.g>
            <motion.g animate={{ x: offsets.ears.x, y: offsets.ears.y }}>
              <path
                d="M 37.4 22.35 Q 39.15 23.5 38.95 25.9 Q 38.75 27.85 37.05 27.45 L 35.95 26.15 Q 36.65 25.35 37.25 24.2 Q 37.55 23.05 37.4 22.35 Z"
                fill={skinFill.fill}
              />
              <rect x="34.3" y="21.85" width="2.35" height="5.45" rx={0.25} fill={skinFill.fill} />
              <ellipse cx="37.65" cy="25.05" rx="1.35" ry="1.65" fill="rgba(0,0,0,0.13)" />
              <path d="M 38.45 23.65 Q 37.95 24.9 37.15 25.35" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="0.28" strokeLinecap="round" />
            </motion.g>

            {/* Face shape */}
            {renderFaceShape(skinFill.fill)}

            {/* Emotion face overlays */}
            {emotion === 'angry' && (
              <g mask={`url(#${uid}faceMask)`}>{renderFaceShape(`url(#${uid}angryGradient)`, 'silhouette')}</g>
            )}
            {emotion === 'sick' && (
              <g mask={`url(#${uid}faceMask)`}>{renderFaceShape(`url(#${uid}sickGradient)`, 'silhouette')}</g>
            )}

            {/* Hair front + hat */}
            <motion.g animate={{ y: offsets.head.y }}>
              {config.hat === 'None' && renderHairFront()}
              {renderHat()}
            </motion.g>

            {/* Emotion particle effects — after hair/hat so they always render on top */}
            {renderEmotionEffects()}

            {/* Face features with offsets */}
            <motion.g animate={{ x: offsets.eyes.x, y: offsets.eyes.y }}>
              <motion.g animate={emotion} variants={faceGroupVariants}>
                {renderMakeup()}
                {renderEyes()}
                <motion.g animate={{ y: offsets.nose.y - offsets.eyes.y }}>
                  {renderNose()}
                </motion.g>
                <motion.g
                  animate={{
                    ...(mouthVariants[emotion as keyof typeof mouthVariants] as object),
                    y: ((mouthVariants[emotion as keyof typeof mouthVariants] as { y?: number })?.y ?? 0) + (offsets.mouth.y - offsets.eyes.y),
                  }}
                  style={{ transformOrigin: avatarMotionOrigin(24, 33) }}
                >
                  {renderLips()}
                </motion.g>
                {renderFacialHair()}
                <motion.g animate={{ y: offsets.mouth.y - offsets.eyes.y }}>
                  {renderMouthAccessory()}
                </motion.g>
              </motion.g>
            </motion.g>

            {/* Accessories (glasses drop-in) */}
            <motion.g
              key={`glasses-${glassesAnimationKey}`}
              initial={glassesAnimationKey > 0 ? { y: -60, opacity: 0, rotate: -10 } : false}
              animate={{ y: offsets.eyes.y, x: offsets.eyes.x, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 10, stiffness: 100, delay: glassesAnimationKey > 0 ? 0.1 : 0 }}
              style={{ transformOrigin: avatarMotionOrigin(24, 24) }}
            >
              {renderAccessories()}
            </motion.g>

            {/* Smoke — rendered last so it floats above glasses/accessories */}
            <motion.g animate={{ x: offsets.eyes.x, y: offsets.mouth.y }}>
              {renderSmokingEffects()}
            </motion.g>
          </motion.g>
        </motion.g>

        {/* Overlay — voxel-painted layer on top of everything, no animation */}
        {overlayRasterHref ? (
          <image
            href={overlayRasterHref}
            xlinkHref={overlayRasterHref}
            x="0"
            y="0"
            width={AVATAR_VIEWBOX_W}
            height={AVATAR_VIEWBOX_H}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : null}
      </svg>
    </div>
  );
}
