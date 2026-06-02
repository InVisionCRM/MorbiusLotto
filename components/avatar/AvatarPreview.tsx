'use client';

import React, { useState, useEffect, useRef, useId } from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import { motion, useMotionValue, useSpring, useAnimationControls } from 'framer-motion';
import {
  resolveColorValue,
  angleToSvgCoords,
  parseGradient,
} from '@/lib/gradient-utils';
import { AvatarPatternDefs } from '@/lib/avatar-svg-patterns';
import {
  AVATAR_VIEWBOX,
  AVATAR_VIEWBOX_W,
  AVATAR_VIEWBOX_H,
  avatarMotionOrigin,
} from '@/lib/avatar-viewbox';
import {
  getAvatarFeature,
  sourcePlacementToAvatarGeometry,
  type AvatarFeatureCategory,
} from '@/lib/avatar-feature-registry';
import {
  hairShadeBaseRgb,
  mixRgb,
  normalizeAvatarRasterUrl,
  rgbaCss,
  MouthAccessoryLayer,
  SmokeAccessoryLayer,
  EmotionEffectsLayer,
  NecklaceLayer,
  AccessoriesLayer,
  HatLayer,
  FacialHairLayer,
  MakeupLayer,
  ShirtBodyLayer,
  TorsoFabricLayer,
  getFaceShapeOffsets,
  renderFaceShapeLayer,
  renderHairBackLayer,
  renderHairFrontLayer,
  renderNoseLayer,
  renderLipsLayer,
  renderEyesLayer,
  AvatarAnimatedBubblegum,
} from './preview';

export type Emotion =
  | 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'wink'
  | 'dance' | 'flex' | 'jump' | 'spin' | 'think' | 'love' | 'money'
  | 'sick' | 'cool' | 'sleepy' | 'shock' | 'ghost' | 'ninja' | 'king'
  | 'poker' | 'jackpot' | 'chips' | 'cards' | 'dice'
  | 'nod' | 'shrug'
  | 'breathe' | 'lean' | 'tilt';

export default function AvatarPreview({
  config,
  emotion: propEmotion = 'neutral',
  glassesAnimationKey = 0,
  compact = false,
  trackMouse = false,
  forceAsleep = false,
  roamEyes = false,
  disableAmbientMotion = false,
  hideBaseMouth = false,
  hideBaseNose = false,
  hideBaseHair = false,
  hit,
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
  /** Disable idle/random drift loops for static editor previews. */
  disableAmbientMotion?: boolean;
  /** Hide default procedural mouth (for placement/edit previews). */
  hideBaseMouth?: boolean;
  /** Hide default procedural nose (for placement/edit previews). */
  hideBaseNose?: boolean;
  /** Hide default procedural hair (for placement/edit previews). */
  hideBaseHair?: boolean;
  /** Transient projectile knock-back. Bump `key` to fire; dir = projectile's on-screen travel unit-vector; power scales the knock. */
  hit?: { key: number; dirX: number; dirY: number; power?: number };
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

  // Transient projectile knock-back: whole-body whip toward the hit (head swings most), then settle.
  const recoilControls = useAnimationControls();
  const lastHitKey = useRef(0);
  useEffect(() => {
    const k = hit?.key ?? 0;
    if (k === 0 || k === lastHitKey.current) return;
    lastHitKey.current = k;
    const dx = hit?.dirX ?? 0;
    const dy = hit?.dirY ?? 0;
    const p = Math.max(0.25, Math.min(1.6, hit?.power ?? 1));
    recoilControls.start({
      x: [0, dx * 3.6 * p, dx * -0.6 * p, 0],
      y: [0, dy * 2.4 * p, dy * -0.4 * p, 0],
      rotate: [0, dx * 9 * p, dx * -2 * p, 0],
    }, { duration: 0.5, times: [0, 0.18, 0.45, 1], ease: 'easeOut' });
  }, [hit?.key, hit?.dirX, hit?.dirY, hit?.power, recoilControls]);

  const emotion = (isAsleep || forceAsleep) ? 'sleepy' : (idleEmotion || propEmotion);

  // Mouse tracking + idle/sleep — for full-size avatars, or when trackMouse is explicitly set
  useEffect(() => {
    if (disableAmbientMotion) return;
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
  }, [compact, isAsleep, propEmotion, idleEmotion, mouseX, mouseY, disableAmbientMotion]);

  // Roaming eye tracking for idle non-acting players
  useEffect(() => {
    if (disableAmbientMotion) return;
    if (!roamEyes || forceAsleep) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const look = () => {
      mouseX.set((Math.random() - 0.5) * 1.4);
      mouseY.set((Math.random() - 0.5) * 0.8);
      timeoutId = setTimeout(look, 1400 + Math.random() * 2800);
    };
    timeoutId = setTimeout(look, 600 + Math.random() * 1000);
    return () => clearTimeout(timeoutId);
  }, [roamEyes, forceAsleep, mouseX, mouseY, disableAmbientMotion]);

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
  const customMouthFeatureId = (config.customMouthFeatureId ?? '').trim();
  const customNoseFeatureId = (config.customNoseFeatureId ?? '').trim();
  const customHairFeatureId = (config.customHairFeatureId ?? '').trim();

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
    neutral: { scaleY: 0.94, y: 0 }, happy: { scaleY: 0.3, y: 0 }, sad: { scaleY: 0.8, y: 1 },
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
    neutral: { scaleY: 0.94, y: 0 }, happy: { scaleY: 0.3, y: 0 }, sad: { scaleY: 0.8, y: 1 },
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
    happy: { y: [0, -5, 0, -2, 0] as number[], transition: { repeat: Infinity, duration: 1.1, ease: 'easeOut' as const } },
    sad: { y: 1 },
    angry: { x: [0, -1.6, 1.6, -1.6, 1.6, 0] as number[], transition: { repeat: Infinity, duration: 0.35 } },
    surprised: { y: [0, -3.5, 0] as number[], scale: [1, 1.06, 1] as number[], transition: { duration: 0.45, ease: 'easeOut' as const } },
    wink: { y: 0 },
    dance: { y: [0, -4, 0] as number[], rotate: [-2, 2, -2] as number[], transition: { repeat: Infinity, duration: 0.8 } },
    flex: { scale: 1.1, y: -2 },
    jump: { y: [0, -16, 0] as number[], scaleY: [1, 0.8, 1.2, 1] as number[], transition: { duration: 0.6 } },
    spin: { rotate: 360, transition: { duration: 0.5 } },
    think: { rotate: -2 }, love: { scale: [1, 1.08, 1] as number[], y: [0, -1.5, 0] as number[], transition: { repeat: Infinity, duration: 0.7, ease: 'easeInOut' as const } },
    money: { y: 2 }, sick: { rotate: 5, y: 4 }, cool: { rotate: -5, x: 4 },
    sleepy: { y: 4, rotate: 3, transition: { repeat: Infinity, duration: 2, repeatType: 'reverse' as const } },
    shock: { x: [0, -1, 1, 0] as number[], transition: { repeat: Infinity, duration: 0.1 } },
    ghost: { y: [0, -8, 0] as number[], opacity: 0.5, transition: { repeat: Infinity, duration: 2 } },
    ninja: { x: [0, 40, -40, 0] as number[], transition: { duration: 0.5 } },
    king: { scale: 1.02 }, poker: { y: 0 }, jackpot: { y: [0, -9, 0, -9, 0] as number[], scale: [1, 1.05, 1, 1.05, 1] as number[], transition: { repeat: Infinity, duration: 0.7 } },
    chips: { y: 0 }, cards: { y: 0 }, dice: { rotate: [0, 5, -5, 0] as number[], transition: { repeat: Infinity, duration: 1 } },
    nod: { y: [0, -1, 0, -0.6, 0] as number[], transition: { repeat: Infinity, duration: 2 } },
    shrug: { y: [0, -8, -8, 0] as number[], transition: { times: [0, 0.3, 0.5, 1], repeat: Infinity, duration: 2.5 } },
    breathe: { scaleY: [1, 1.06, 1] as number[], y: [0, -1, 0] as number[], transition: { repeat: Infinity, duration: 3, ease: 'easeInOut' as const } },
    lean: { rotate: [0, -18, 0] as number[], x: [0, -6, 0] as number[], transition: { repeat: Infinity, duration: 4, ease: 'easeInOut' as const } },
    tilt: { rotate: [0, 12, -12, 0] as number[], transition: { repeat: Infinity, duration: 6, ease: 'easeInOut' as const } },
  };

  // ── face shape ─────────────────────────────────────────────────────────────

  const offsets = getFaceShapeOffsets(config.faceShape);

  /** Base face silhouette only — no baked forehead/mouth/cheek overlays (use Makeup / skin gradients instead). */
  const renderFaceShape = (fillColor: string, detail: 'full' | 'silhouette' = 'full') =>
    renderFaceShapeLayer(config.faceShape, fillColor, detail);

  // ── hair ───────────────────────────────────────────────────────────────────

  const renderHairBack = () => renderHairBackLayer(hairStyle, hairFill.fill, hHi, hLo);
  const renderHairFront = () =>
    renderHairFrontLayer(hairStyle, hairFill.fill, skinFill.fill, hHi, hLo);

  // ── eyes ───────────────────────────────────────────────────────────────────

  const renderEyes = () => renderEyesLayer({
    compact,
    trackMouse,
    roamEyes,
    mouseX,
    mouseY,
    eyeColor,
    emotion,
    eyeShape,
    eyebrowLeftVariants,
    eyebrowRightVariants,
    eyeVariants,
    rightEyeVariants,
    eyebrowFill: hairFill.fill,
    facialHair: config.facialHair ?? 'None',
  });

  // ── face features ──────────────────────────────────────────────────────────

  const renderNose = () => renderNoseLayer();
  const renderLips = () => renderLipsLayer(lipShape, emotion);

  const renderRegisteredFeature = (
    category: AvatarFeatureCategory,
    featureId: string,
  ): React.ReactNode => {
    const def = getAvatarFeature(category, featureId);
    if (!def) return null;
    const g = sourcePlacementToAvatarGeometry(def);
    return (
      <g transform={`rotate(${g.rotation} ${g.pivotX} ${g.pivotY})`}>
        <svg
          x={g.x}
          y={g.y}
          width={g.width}
          height={g.height}
          viewBox={`0 0 ${def.sourceViewBox.width} ${def.sourceViewBox.height}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <g dangerouslySetInnerHTML={{ __html: def.svgMarkup }} />
        </svg>
      </g>
    );
  };

  // ── accessories ────────────────────────────────────────────────────────────

  // ── emotion particle effects (full-size only) ─────────────────────────────

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

        {/* Projectile knock-back recoil — whips toward the hit then settles (no-op until `hit` fires) */}
        <motion.g animate={recoilControls} initial={false} style={{ transformOrigin: avatarMotionOrigin(24, 50) }}>
        {/* Breathing idle animation wrapper */}
        <motion.g
          animate={
            disableAmbientMotion
              ? { scaleY: 1, y: 0, rotate: 0 }
              : { scaleY: [1, 1.01, 1], y: [0, -0.2, 0], rotate: [0, 1, -1, 0] }
          }
          transition={
            disableAmbientMotion
              ? { duration: 0 }
              : { duration: 4, repeat: Infinity, ease: 'easeInOut' }
          }
          style={{ transformOrigin: avatarMotionOrigin(24, 56) }}
        >
          <motion.g animate={emotion} variants={bodyVariants} style={{ transformOrigin: avatarMotionOrigin(24, 48) }}>

            {/* Shirt */}
            <ShirtBodyLayer shirtStyle={config.shirtStyle} shirtFill={shirtFill.fill} />
            <TorsoFabricLayer />
            <rect x="20" y="34" width="8" height="6" fill={skinFill.fill} />

            <NecklaceLayer necklace={config.necklace} uid={uid} />

            {/* Hair back */}
            <motion.g animate={{ y: offsets.head.y }}>
              {!hideBaseHair && config.hat === 'None' && renderHairBack()}
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
              {!hideBaseHair && config.hat === 'None' && renderHairFront()}
              {config.hat === 'None' && customHairFeatureId
                ? renderRegisteredFeature('hair', customHairFeatureId)
                : null}
              <HatLayer hat={config.hat} hatFill={hatFill?.fill ?? null} />
            </motion.g>

            {/* Emotion particle effects — after hair/hat so they always render on top */}
            <EmotionEffectsLayer compact={compact} emotion={emotion} />

            {/* Face features with offsets */}
            <motion.g animate={{ x: offsets.eyes.x, y: offsets.eyes.y }}>
              <motion.g animate={emotion} variants={faceGroupVariants}>
                <MakeupLayer makeup={config.makeup} />
                {renderEyes()}
                <motion.g animate={{ y: offsets.nose.y - offsets.eyes.y }}>
                  {customNoseFeatureId
                    ? renderRegisteredFeature('nose', customNoseFeatureId)
                    : (hideBaseNose ? null : renderNose())}
                </motion.g>
                <motion.g
                  animate={{
                    ...(mouthVariants[emotion as keyof typeof mouthVariants] as object),
                    y: ((mouthVariants[emotion as keyof typeof mouthVariants] as { y?: number })?.y ?? 0) + (offsets.mouth.y - offsets.eyes.y),
                  }}
                  style={{ transformOrigin: avatarMotionOrigin(24, 33) }}
                >
                  {customMouthFeatureId
                    ? renderRegisteredFeature('mouth', customMouthFeatureId)
                    : (hideBaseMouth ? null : renderLips())}
                </motion.g>
                <FacialHairLayer facialHair={config.facialHair} hairFill={hairFill.fill} uid={uid} />
                <motion.g animate={{ y: offsets.mouth.y - offsets.eyes.y }}>
                  <MouthAccessoryLayer
                    mouthAccessory={config.mouthAccessory}
                    renderBubblegum={() => <AvatarAnimatedBubblegum />}
                  />
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
              <AccessoriesLayer accessory={accessory} accessoryFill={accessoryFill.fill} uid={uid} />
            </motion.g>

            {/* Smoke — rendered last so it floats above glasses/accessories */}
            <motion.g animate={{ x: offsets.eyes.x, y: offsets.mouth.y }}>
              <SmokeAccessoryLayer
                mouthAccessory={config.mouthAccessory}
                smokePuffing={smokePuffing}
              />
            </motion.g>
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
