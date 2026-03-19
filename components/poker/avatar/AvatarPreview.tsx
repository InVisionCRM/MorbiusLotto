'use client';

import React, { useState, useEffect, useRef, useId } from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { resolveColorValue, angleToSvgCoords, parseGradient } from '@/lib/gradient-utils';
import { AvatarPatternDefs } from '@/lib/avatar-svg-patterns';

export type Emotion =
  | 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'wink'
  | 'dance' | 'flex' | 'jump' | 'spin' | 'think' | 'love' | 'money'
  | 'sick' | 'cool' | 'sleepy' | 'shock' | 'ghost' | 'ninja' | 'king'
  | 'poker' | 'jackpot' | 'chips' | 'cards' | 'dice'
  | 'slouch' | 'bored' | 'nod' | 'shrug'
  | 'drift' | 'sink' | 'breathe' | 'lean' | 'tilt';

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
        const actions: Emotion[] = ['wink', 'surprised', 'think', 'happy', 'slouch', 'bored', 'nod', 'shrug', 'drift', 'sink', 'breathe', 'lean', 'tilt'];
        const action = actions[Math.floor(Math.random() * actions.length)];
        setIdleEmotion(action);
        const duration =
          action === 'bored' || action === 'slouch' ? 4500 :
          action === 'nod' || action === 'shrug' ? 2500 :
          action === 'sink' || action === 'drift' ? 5000 :
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

  const { skinColor, hairStyle, hairColor, eyeShape, eyeColor, noseShape, lipShape, accessory } = config;

  // Resolve gradient-aware fills for the three color fields
  const skinFill  = resolveColor(skinColor,               `${uid}grad_skin`);
  const hairFill  = resolveColor(hairColor,               `${uid}grad_hair`);
  const accessoryFill = resolveColor(config.accessoryColor || '#111111', `${uid}grad_accessory`);
  const shirtFill = resolveColor(config.shirtColor || '#3f3f46', `${uid}grad_shirt`);
  const hatFill   = config.hatColor ? resolveColor(config.hatColor, `${uid}grad_hat`) : null;
  const bgGradDef = config.backgroundImage?.startsWith('{') ? parseGradient(config.backgroundImage) : null;
  const sortedStops = (stops: Array<{ color: string; offset: number; opacity: number }>) =>
    [...stops].sort((a, b) => a.offset - b.offset);

  // ── emotion variants ───────────────────────────────────────────────────────

  const eyeVariants = {
    neutral: { scaleY: 1, y: 0 }, happy: { scaleY: 0.3, y: 0 }, sad: { scaleY: 0.8, y: 0.5 },
    angry: { scaleY: 0.7, y: 0 }, surprised: { scaleY: 1.3, y: -0.5 }, wink: { scaleY: 1, y: 0 },
    dance: { scaleY: 1 }, flex: { scaleY: 0.8 }, jump: { scaleY: 1.1 }, spin: { scaleY: 1 },
    think: { scaleY: 0.9, y: -0.5 }, love: { scale: 1.2 }, money: { scaleY: 0.8 },
    sick: { scaleY: 0.4, y: 0.5 }, cool: { scaleY: 0.2 }, sleepy: { scaleY: 0.1, y: 0.5 },
    shock: { scaleY: 1.5, scaleX: 1.2 }, ghost: { scaleY: 0.8, opacity: 0.6 },
    ninja: { scaleY: 0.2, y: 0.2 }, king: { scaleY: 1.1 }, poker: { scaleY: 0.6, y: 0.2 },
    jackpot: { scaleY: 0.3, y: 0 }, chips: { scaleY: 1 }, cards: { scaleY: 1 }, dice: { scaleY: 1.2 },
    slouch: { scaleY: 0.2, y: 0.5 }, bored: { scaleY: 0.3, y: 0.3 },
    nod: { scaleY: 1 }, shrug: { scaleY: 1.1, y: -0.5 },
    drift: { scaleY: 1, y: 0 }, sink: { scaleY: 0.2, y: 0.5 }, breathe: { scaleY: 0.9, y: 0 },
    lean: { scaleY: 0.4, y: 0.3 }, tilt: { scaleY: 0.5, y: 0.3 },
  };

  const rightEyeVariants = {
    neutral: { scaleY: 1, y: 0 }, happy: { scaleY: 0.3, y: 0 }, sad: { scaleY: 0.8, y: 0.5 },
    angry: { scaleY: 0.7, y: 0 }, surprised: { scaleY: 1.3, y: -0.5 }, wink: { scaleY: 0.1, y: 0 },
    dance: { scaleY: 1 }, flex: { scaleY: 0.8 }, jump: { scaleY: 1.1 }, spin: { scaleY: 1 },
    think: { scaleY: 1.1, y: 0.5 }, love: { scale: 1.2 }, money: { scaleY: 0.8 },
    sick: { scaleY: 0.4, y: 0.5 }, cool: { scaleY: 0.2 }, sleepy: { scaleY: 0.1, y: 0.5 },
    shock: { scaleY: 1.5, scaleX: 1.2 }, ghost: { scaleY: 0.8, opacity: 0.6 },
    ninja: { scaleY: 0.2, y: 0.2 }, king: { scaleY: 1.1 }, poker: { scaleY: 0.6, y: 0.2 },
    jackpot: { scaleY: 0.3, y: 0 }, chips: { scaleY: 1 }, cards: { scaleY: 1 }, dice: { scaleY: 1.2 },
    slouch: { scaleY: 0.2, y: 0.5 }, bored: { scaleY: 0.3, y: 0.3 },
    nod: { scaleY: 1 }, shrug: { scaleY: 1.1, y: -0.5 },
    drift: { scaleY: 1, y: 0 }, sink: { scaleY: 0.2, y: 0.5 }, breathe: { scaleY: 0.9, y: 0 },
    lean: { scaleY: 0.3, y: 0.4 }, tilt: { scaleY: 0.5, y: 0.3 },
  };

  const eyebrowLeftVariants = {
    neutral: { y: 0, rotate: 0 }, happy: { y: -1, rotate: 0 }, sad: { y: 0, rotate: -15 },
    angry: { y: 1, rotate: 15 }, surprised: { y: -1.5, rotate: 0 }, wink: { y: 0, rotate: 0 },
    dance: { y: [0, -1, 0] as number[], transition: { repeat: Infinity, duration: 0.5 } },
    flex: { y: -0.5, rotate: -10 }, jump: { y: -1 }, spin: { y: 0 },
    think: { y: -1, rotate: -10 }, love: { y: -1.5, rotate: 5 }, money: { y: -1, rotate: 0 },
    sick: { y: 0.5, rotate: -5 }, cool: { y: -0.5, rotate: 0 }, sleepy: { y: 0, rotate: 0 },
    shock: { y: -2, rotate: -20 }, ghost: { y: -1, opacity: 0.5 }, ninja: { y: 1, rotate: 20 },
    king: { y: -1, rotate: 0 }, poker: { y: 0.5, rotate: 0 }, jackpot: { y: -1.5, rotate: 0 },
    chips: { y: -0.5, rotate: 0 }, cards: { y: -0.5, rotate: 0 }, dice: { y: -1, rotate: 0 },
    slouch: { y: 0.5, rotate: -8 }, bored: { y: 0.5, rotate: -5 },
    nod: { y: [0, 1, 0] as number[], transition: { repeat: Infinity, duration: 2 } }, shrug: { y: -1.5, rotate: 5 },
    drift: { y: 0, rotate: 0 }, sink: { y: 0.5, rotate: -5 }, breathe: { y: -0.5, rotate: 0 },
    lean: { y: 0.3, rotate: -5 }, tilt: { y: 0.2, rotate: -8 },
  };

  const eyebrowRightVariants = {
    neutral: { y: 0, rotate: 0 }, happy: { y: -1, rotate: 0 }, sad: { y: 0, rotate: 15 },
    angry: { y: 1, rotate: -15 }, surprised: { y: -1.5, rotate: 0 }, wink: { y: 1, rotate: -10 },
    dance: { y: [0, -1, 0] as number[], transition: { repeat: Infinity, duration: 0.5, delay: 0.25 } },
    flex: { y: -0.5, rotate: 10 }, jump: { y: -1 }, spin: { y: 0 },
    think: { y: 0.5, rotate: 10 }, love: { y: -1.5, rotate: -5 }, money: { y: -1, rotate: 0 },
    sick: { y: 0.5, rotate: 5 }, cool: { y: -0.5, rotate: 0 }, sleepy: { y: 0, rotate: 0 },
    shock: { y: -2, rotate: 20 }, ghost: { y: -1, opacity: 0.5 }, ninja: { y: 1, rotate: -20 },
    king: { y: -1, rotate: 0 }, poker: { y: 0.5, rotate: 0 }, jackpot: { y: -1.5, rotate: 0 },
    chips: { y: -0.5, rotate: 0 }, cards: { y: -0.5, rotate: 0 }, dice: { y: -1, rotate: 0 },
    slouch: { y: 0.5, rotate: 8 }, bored: { y: 0.5, rotate: 5 },
    nod: { y: [0, 1, 0] as number[], transition: { repeat: Infinity, duration: 2 } }, shrug: { y: -1.5, rotate: -5 },
    drift: { y: 0, rotate: 0 }, sink: { y: 0.5, rotate: 5 }, breathe: { y: -0.5, rotate: 0 },
    lean: { y: 0.5, rotate: 10 }, tilt: { y: 0.2, rotate: 8 },
  };

  const mouthVariants = {
    neutral: { scaleY: 1, scaleX: 1, y: 0 }, happy: { scaleY: 1.2, scaleX: 1.2, y: -0.5 },
    sad: { scaleY: -1, scaleX: 1, y: 1 }, angry: { scaleY: 0.6, scaleX: 0.9, y: 0 },
    surprised: { scaleY: 1, scaleX: 1, y: 0 }, wink: { scaleY: 1, scaleX: 1.1, y: -0.5, x: 0.5 },
    dance: { scaleX: [1, 1.3, 1] as number[], transition: { repeat: Infinity, duration: 0.5 } },
    flex: { scaleX: 0.8, scaleY: 0.5 }, jump: { scaleY: 1.5 }, spin: { scale: 1 },
    think: { scaleX: 0.5, scaleY: 0.5, x: -1 }, love: { scale: 1.5, y: -0.5 },
    money: { scaleX: 1.5, scaleY: 0.3 }, sick: { scaleY: 0.2, rotate: 5 },
    cool: { scaleX: 1.2, scaleY: 0.8 }, sleepy: { scale: 0.4, y: 1 },
    shock: { scale: 2.5, y: 1 }, ghost: { scaleY: 1.5, opacity: 0.4 },
    ninja: { scaleX: 0.1, scaleY: 0.1 }, king: { scaleX: 1.2, scaleY: 0.8 },
    poker: { scaleX: 0.8, scaleY: 0.2 }, jackpot: { scaleX: 1.5, scaleY: 1.2, y: -1 },
    chips: { scaleX: 1, scaleY: 1 }, cards: { scaleX: 1, scaleY: 1 }, dice: { scaleX: 1.2, scaleY: 1.2 },
    slouch: { scaleX: 0.7, scaleY: 0.4, y: 0.5 },
    bored: { scaleX: 0.6, scaleY: 0.4, y: 0.3 },
    nod: { scaleY: [1, 0.8, 1] as number[], transition: { repeat: Infinity, duration: 2 } },
    shrug: { scaleX: 0.8, y: 0.5 },
    drift: { scaleX: 1, scaleY: 1, y: 0 }, sink: { scaleX: 0.6, scaleY: 0.3, y: 0.5 },
    breathe: { scaleX: 1.1, scaleY: 0.6, y: 0 }, lean: { scaleX: 0.9, scaleY: 0.5, x: -0.5, y: 0.3 },
    tilt: { scaleX: 0.7, scaleY: 0.5, y: 0.2 },
  };

  const faceGroupVariants = {
    neutral: { y: 0, x: 0, rotate: 0, scale: 1 }, happy: { y: -0.5, x: 0 }, sad: { y: 0.5, x: 0 },
    angry: { x: [-0.5, 0.5, -0.5, 0.5, 0] as number[], y: 0, transition: { duration: 0.4 } },
    surprised: { y: -1, x: 0 }, wink: { y: 0, x: 0 },
    dance: { y: [0, -1, 0] as number[], x: [-1, 1, -1] as number[], transition: { repeat: Infinity, duration: 1 } },
    flex: { y: 0.5, scale: 1.05 }, jump: { y: -2, scale: 0.95 },
    spin: { rotate: 360, transition: { duration: 0.5 } },
    think: { rotate: -5, x: -0.5 }, love: { scale: 1.1, y: -0.5 }, money: { y: 0.5 },
    sick: { y: 1, rotate: 2 }, cool: { y: -0.5, rotate: -2 }, sleepy: { y: 1.5, rotate: 5 },
    shock: { scale: 1.2, x: [0, -1, 1, -1, 1, 0] as number[], transition: { repeat: Infinity, duration: 0.2 } },
    ghost: { y: -2, opacity: 0.7 }, ninja: { y: 1, x: 1 }, king: { y: -0.5 },
    poker: { y: 0, x: 0 }, jackpot: { y: -1, scale: 1.1 },
    chips: { y: 0 }, cards: { y: 0 }, dice: { y: -0.5 },
    slouch: { y: [0, 1.5, 0] as number[], transition: { repeat: Infinity, duration: 4.5, ease: 'easeInOut' as const } },
    bored: { rotate: [0, -7, 0, 7, 0] as number[], transition: { repeat: Infinity, duration: 6, ease: 'easeInOut' as const } },
    nod: { y: [0, 2.5, 0, 1.5, 0] as number[], transition: { repeat: Infinity, duration: 2 } },
    shrug: { y: -1.5 },
    drift: { x: [0, 0.5, -0.5, 0] as number[], transition: { repeat: Infinity, duration: 5, ease: 'easeInOut' as const } },
    sink: { y: [0, 2, 0] as number[], transition: { repeat: Infinity, duration: 6, ease: 'easeInOut' as const } },
    breathe: { y: [0, -0.2, 0] as number[], transition: { repeat: Infinity, duration: 3, ease: 'easeInOut' as const } },
    lean: { rotate: [0, 8, 0] as number[], transition: { repeat: Infinity, duration: 4, ease: 'easeInOut' as const } },
    tilt: { rotate: [0, -6, 6, 0] as number[], transition: { repeat: Infinity, duration: 6, ease: 'easeInOut' as const } },
  };

  const bodyVariants = {
    neutral: { y: 0, x: 0, rotate: 0, scale: 1, opacity: 1 },
    happy: { y: 0, x: 0 }, sad: { y: 0 }, angry: { y: 0 }, surprised: { y: 0 }, wink: { y: 0 },
    dance: { y: [0, -2, 0] as number[], rotate: [-2, 2, -2] as number[], transition: { repeat: Infinity, duration: 0.8 } },
    flex: { scale: 1.1, y: -1 },
    jump: { y: [0, -8, 0] as number[], scaleY: [1, 0.8, 1.2, 1] as number[], transition: { duration: 0.6 } },
    spin: { rotate: 360, transition: { duration: 0.5 } },
    think: { rotate: -2 }, love: { scale: 1.05, transition: { repeat: Infinity, duration: 0.6, repeatType: 'reverse' as const } },
    money: { y: 1 }, sick: { rotate: 5, y: 2 }, cool: { rotate: -5, x: 2 },
    sleepy: { y: 2, rotate: 3, transition: { repeat: Infinity, duration: 2, repeatType: 'reverse' as const } },
    shock: { x: [0, -0.5, 0.5, 0] as number[], transition: { repeat: Infinity, duration: 0.1 } },
    ghost: { y: [0, -4, 0] as number[], opacity: 0.5, transition: { repeat: Infinity, duration: 2 } },
    ninja: { x: [0, 20, -20, 0] as number[], transition: { duration: 0.5 } },
    king: { scale: 1.02 }, poker: { y: 0 }, jackpot: { y: [0, -2, 0] as number[], transition: { repeat: Infinity, duration: 0.5 } },
    chips: { y: 0 }, cards: { y: 0 }, dice: { rotate: [0, 5, -5, 0] as number[], transition: { repeat: Infinity, duration: 1 } },
    slouch: { y: [0, 7, 0] as number[], opacity: [1, 0.3, 1], transition: { repeat: Infinity, duration: 4.5, ease: 'easeInOut' as const } },
    bored: { rotate: [0, -2, 0, 2, 0] as number[], transition: { repeat: Infinity, duration: 6, ease: 'easeInOut' as const } },
    nod: { y: [0, -0.5, 0, -0.3, 0] as number[], transition: { repeat: Infinity, duration: 2 } },
    shrug: { y: [0, -4, -4, 0] as number[], transition: { times: [0, 0.3, 0.5, 1], repeat: Infinity, duration: 2.5 } },
    drift: { x: [0, 10, -10, 0] as number[], opacity: [1, 0.85, 0.85, 1], transition: { repeat: Infinity, duration: 5, ease: 'easeInOut' as const } },
    sink: { y: [0, 14, 0] as number[], opacity: [1, 0.1, 1], transition: { repeat: Infinity, duration: 6, ease: 'easeInOut' as const } },
    breathe: { scaleY: [1, 1.06, 1] as number[], y: [0, -0.5, 0] as number[], transition: { repeat: Infinity, duration: 3, ease: 'easeInOut' as const } },
    lean: { rotate: [0, -18, 0] as number[], x: [0, -3, 0] as number[], transition: { repeat: Infinity, duration: 4, ease: 'easeInOut' as const } },
    tilt: { rotate: [0, 12, -12, 0] as number[], transition: { repeat: Infinity, duration: 6, ease: 'easeInOut' as const } },
  };

  // ── face shape ─────────────────────────────────────────────────────────────

  const getFaceShapeOffsets = () => {
    switch (config.faceShape) {
      case 'Round':      return { eyes: { y: 0.5, x: 0 }, nose: { y: 0.5 }, mouth: { y: 0.5 }, ears: { x: 0.5, y: 0.5 }, head: { y: 0 } };
      case 'Oval':       return { eyes: { y: 0.5, x: 0 }, nose: { y: 1 }, mouth: { y: 1.5 }, ears: { x: 0, y: 0.5 }, head: { y: -1 } };
      case 'Heart':      return { eyes: { y: -0.5, x: 0.5 }, nose: { y: 0 }, mouth: { y: 0.5 }, ears: { y: -0.5, x: 0.5 }, head: { y: 0 } };
      case 'Diamond':    return { eyes: { y: 0, x: -0.5 }, nose: { y: 0 }, mouth: { y: 0 }, ears: { x: -0.5, y: 0 }, head: { y: 0 } };
      case 'Triangle':   return { eyes: { y: 1, x: -0.5 }, nose: { y: 1 }, mouth: { y: 1 }, ears: { y: 1, x: -0.5 }, head: { y: 0 } };
      case 'Inverted Triangle': return { eyes: { y: -1, x: 0.5 }, nose: { y: -0.5 }, mouth: { y: -0.5 }, ears: { y: -1, x: 0.5 }, head: { y: 0 } };
      case 'Long':       return { eyes: { y: -0.5, x: 0 }, nose: { y: 0.5 }, mouth: { y: 1.5 }, ears: { y: 0, x: 0 }, head: { y: -1 } };
      case 'Wide':       return { eyes: { x: 1, y: 0 }, nose: { y: 0 }, mouth: { y: 0 }, ears: { x: 1, y: 0 }, head: { y: 1 } };
      case 'Slim':       return { eyes: { x: -1, y: 0 }, nose: { y: 0 }, mouth: { y: 0 }, ears: { x: -1, y: 0 }, head: { y: 0 } };
      default:           return { eyes: { y: 0, x: 0 }, nose: { y: 0 }, mouth: { y: 0 }, ears: { x: 0, y: 0 }, head: { y: 0 } };
    }
  };
  const offsets = getFaceShapeOffsets();

  const renderFaceShape = (fillColor: string) => {
    switch (config.faceShape) {
      case 'Round':
        return <g fill={fillColor}><rect x="7" y="8" width="10" height="10" /><rect x="6" y="9" width="12" height="8" /></g>;
      case 'Oval':
        return <g fill={fillColor}><rect x="7" y="8" width="10" height="11" /><rect x="8" y="7" width="8" height="1" /><rect x="8" y="19" width="8" height="1" /></g>;
      case 'Heart':
        return <g fill={fillColor}><rect x="6" y="8" width="12" height="7" /><rect x="7" y="15" width="10" height="2" /><rect x="9" y="17" width="6" height="1" /></g>;
      case 'Diamond':
        return <g fill={fillColor}><rect x="6" y="11" width="12" height="4" /><rect x="7" y="9" width="10" height="2" /><rect x="7" y="15" width="10" height="2" /><rect x="9" y="8" width="6" height="1" /><rect x="9" y="17" width="6" height="1" /></g>;
      case 'Triangle':
        return <g fill={fillColor}><rect x="8" y="8" width="8" height="3" /><rect x="7" y="11" width="10" height="3" /><rect x="6" y="14" width="12" height="4" /></g>;
      case 'Inverted Triangle':
        return <g fill={fillColor}><rect x="6" y="8" width="12" height="4" /><rect x="7" y="12" width="10" height="3" /><rect x="8" y="15" width="8" height="3" /></g>;
      case 'Long':
        return <rect x="7" y="7" width="10" height="12" fill={fillColor} />;
      case 'Wide':
        return <rect x="5" y="9" width="14" height="8" fill={fillColor} />;
      case 'Slim':
        return <rect x="8" y="8" width="8" height="10" fill={fillColor} />;
      default: // Square
        return <rect x="6" y="8" width="12" height="10" fill={fillColor} />;
    }
  };

  // ── hair ───────────────────────────────────────────────────────────────────

  const renderHairBack = () => {
    switch (hairStyle) {
      case 'Long Straight': return <rect x="4" y="8" width="16" height="12" fill={hairFill.fill} />;
      case 'Long Wavy': return <g fill={hairFill.fill}><rect x="4" y="8" width="16" height="12" /><rect x="3" y="10" width="1" height="2" /><rect x="3" y="14" width="1" height="2" /><rect x="3" y="18" width="1" height="2" /><rect x="20" y="10" width="1" height="2" /><rect x="20" y="14" width="1" height="2" /><rect x="20" y="18" width="1" height="2" /></g>;
      case 'Bob': return <rect x="4" y="8" width="16" height="7" fill={hairFill.fill} />;
      case 'Ponytail': return <g fill={hairFill.fill}><rect x="18" y="9" width="4" height="3" /><rect x="22" y="10" width="1" height="1" /></g>;
      case 'Dreadlocks': return <g fill={hairFill.fill}><rect x="3" y="8" width="2" height="10" /><rect x="19" y="8" width="2" height="10" /><rect x="5" y="8" width="2" height="12" /><rect x="17" y="8" width="2" height="12" /></g>;
      case 'Dreadlocks V1': return <g fill={hairFill.fill}><rect x="5" y="7" width="14" height="2" /><rect x="6" y="9" width="2" height="10" /><rect x="9" y="9" width="2" height="11" /><rect x="12" y="9" width="2" height="11" /><rect x="15" y="9" width="2" height="10" /></g>;
      case 'Dreadlocks V2': return <g fill={hairFill.fill}><rect x="5" y="7" width="14" height="2" /><rect x="6" y="9" width="2" height="9" /><rect x="9" y="9" width="2" height="10" /><rect x="12" y="9" width="2" height="10" /><rect x="15" y="9" width="2" height="9" /><rect x="9" y="13" width="2" height="1" fill="#f59e0b" /><rect x="12" y="15" width="2" height="1" fill="#22c55e" /></g>;
      case 'Dreadlocks V3': return <g fill={hairFill.fill}><rect x="4" y="7" width="16" height="2" /><rect x="3" y="9" width="2" height="10" /><rect x="6" y="9" width="2" height="11" /><rect x="9" y="9" width="2" height="10" /><rect x="12" y="9" width="2" height="10" /><rect x="15" y="9" width="2" height="11" /><rect x="18" y="9" width="2" height="10" /></g>;
      case 'Dreadlocks V4': return <g fill={hairFill.fill}><rect x="4" y="7" width="16" height="2" /><rect x="3" y="9" width="2" height="9" /><rect x="6" y="9" width="2" height="10" /><rect x="9" y="9" width="2" height="10" /><rect x="12" y="9" width="2" height="10" /><rect x="15" y="9" width="2" height="10" /><rect x="18" y="9" width="2" height="9" /><rect x="6" y="13" width="2" height="1" fill="#ef4444" /><rect x="15" y="14" width="2" height="1" fill="#f59e0b" /></g>;
      case 'Dreadlocks V5': return <g fill={hairFill.fill}><rect x="5" y="7" width="14" height="2" /><rect x="6" y="9" width="2" height="9" /><rect x="9" y="9" width="2" height="10" /><rect x="12" y="9" width="2" height="10" /><rect x="15" y="9" width="2" height="9" /><rect x="5" y="10" width="1" height="7" /><rect x="18" y="10" width="1" height="7" /></g>;
      case 'Dreadlocks V6': return <g fill={hairFill.fill}><rect x="5" y="7" width="14" height="2" /><rect x="6" y="9" width="2" height="12" /><rect x="9" y="9" width="2" height="13" /><rect x="12" y="9" width="2" height="13" /><rect x="15" y="9" width="2" height="12" /></g>;
      case 'Dreadlocks V7': return <g fill={hairFill.fill}><rect x="5" y="7" width="14" height="2" /><rect x="6" y="9" width="2" height="12" /><rect x="9" y="9" width="2" height="13" /><rect x="12" y="9" width="2" height="13" /><rect x="15" y="9" width="2" height="12" /><rect x="9" y="17" width="2" height="1" fill="#f59e0b" /><rect x="12" y="18" width="2" height="1" fill="#22c55e" /></g>;
      case 'Dreadlocks V8': return <g fill={hairFill.fill}><rect x="4" y="7" width="16" height="2" /><rect x="3" y="9" width="2" height="12" /><rect x="6" y="9" width="2" height="11" /><rect x="9" y="9" width="2" height="12" /><rect x="12" y="9" width="2" height="12" /><rect x="15" y="9" width="2" height="11" /><rect x="18" y="9" width="2" height="12" /></g>;
      case 'Dreadlocks V9': return <g fill={hairFill.fill}><rect x="4" y="7" width="16" height="2" /><rect x="2" y="9" width="2" height="12" /><rect x="5" y="9" width="2" height="11" /><rect x="8" y="9" width="2" height="12" /><rect x="11" y="9" width="2" height="12" /><rect x="14" y="9" width="2" height="11" /><rect x="17" y="9" width="2" height="11" /><rect x="20" y="9" width="2" height="12" /></g>;
      case 'Dreadlocks V10': return <g fill={hairFill.fill}><rect x="4" y="7" width="16" height="2" /><rect x="3" y="9" width="2" height="11" /><rect x="6" y="9" width="2" height="12" /><rect x="9" y="9" width="2" height="13" /><rect x="12" y="9" width="2" height="13" /><rect x="15" y="9" width="2" height="12" /><rect x="18" y="9" width="2" height="11" /><rect x="9" y="16" width="2" height="1" fill="#ef4444" /><rect x="12" y="17" width="2" height="1" fill="#f59e0b" /></g>;
      case 'Locks V1': return <g fill={hairFill.fill}><rect x="5" y="7" width="14" height="2" /><rect x="6" y="9" width="2" height="9" /><rect x="9" y="9" width="2" height="10" /><rect x="12" y="9" width="2" height="10" /><rect x="15" y="9" width="2" height="9" /></g>;
      case 'Locks V2': return <g fill={hairFill.fill}><rect x="4" y="7" width="16" height="2" /><rect x="4" y="9" width="2" height="10" /><rect x="7" y="9" width="2" height="11" /><rect x="10" y="9" width="2" height="10" /><rect x="13" y="9" width="2" height="10" /><rect x="16" y="9" width="2" height="11" /><rect x="18" y="9" width="2" height="10" /></g>;
      case 'Locks V3': return <g fill={hairFill.fill}><rect x="5" y="7" width="14" height="2" /><rect x="6" y="9" width="2" height="11" /><rect x="9" y="9" width="2" height="12" /><rect x="12" y="9" width="2" height="12" /><rect x="15" y="9" width="2" height="11" /></g>;
      case 'Locks V4': return <g fill={hairFill.fill}><rect x="4" y="7" width="16" height="2" /><rect x="3" y="9" width="2" height="11" /><rect x="6" y="9" width="2" height="12" /><rect x="9" y="9" width="2" height="11" /><rect x="12" y="9" width="2" height="11" /><rect x="15" y="9" width="2" height="12" /><rect x="18" y="9" width="2" height="11" /></g>;
      case 'Locks V5': return <g fill={hairFill.fill}><rect x="5" y="7" width="14" height="2" /><rect x="5" y="9" width="2" height="10" /><rect x="8" y="9" width="2" height="11" /><rect x="11" y="9" width="2" height="12" /><rect x="14" y="9" width="2" height="11" /><rect x="17" y="9" width="2" height="10" /></g>;
      case 'Locks V6': return <g fill={hairFill.fill}><rect x="5" y="7" width="14" height="2" /><rect x="6" y="9" width="2" height="12" /><rect x="9" y="9" width="2" height="13" /><rect x="12" y="9" width="2" height="13" /><rect x="15" y="9" width="2" height="12" /></g>;
      case 'Locks V7': return <g fill={hairFill.fill}><rect x="4" y="7" width="16" height="2" /><rect x="3" y="9" width="2" height="12" /><rect x="6" y="9" width="2" height="13" /><rect x="9" y="9" width="2" height="12" /><rect x="12" y="9" width="2" height="12" /><rect x="15" y="9" width="2" height="13" /><rect x="18" y="9" width="2" height="12" /></g>;
      case 'Locks V8': return <g fill={hairFill.fill}><rect x="5" y="7" width="14" height="2" /><rect x="4" y="9" width="2" height="11" /><rect x="7" y="9" width="2" height="12" /><rect x="10" y="9" width="2" height="13" /><rect x="13" y="9" width="2" height="12" /><rect x="16" y="9" width="2" height="11" /></g>;
      case 'Locks V9': return <g fill={hairFill.fill}><rect x="4" y="7" width="16" height="2" /><rect x="2" y="9" width="2" height="12" /><rect x="5" y="9" width="2" height="12" /><rect x="8" y="9" width="2" height="13" /><rect x="11" y="9" width="2" height="12" /><rect x="14" y="9" width="2" height="12" /><rect x="17" y="9" width="2" height="12" /><rect x="20" y="9" width="2" height="12" /></g>;
      case 'Locks V10': return <g fill={hairFill.fill}><rect x="4" y="7" width="16" height="2" /><rect x="3" y="9" width="2" height="12" /><rect x="6" y="9" width="2" height="13" /><rect x="9" y="9" width="2" height="14" /><rect x="12" y="9" width="2" height="14" /><rect x="15" y="9" width="2" height="13" /><rect x="18" y="9" width="2" height="12" /></g>;
      case 'Afro': return <g fill={hairFill.fill}><rect x="2" y="4" width="20" height="12" rx="4" /></g>;
      case 'Mullet': return <rect x="4" y="12" width="16" height="6" fill={hairFill.fill} />;
      case 'Pigtails': return <g fill={hairFill.fill}><rect x="2" y="9" width="3" height="6" /><rect x="19" y="9" width="3" height="6" /></g>;
      default: return null;
    }
  };

  const renderHairFront = () => {
    switch (hairStyle) {
      case 'Short': return <g fill={hairFill.fill}><rect x="5" y="6" width="14" height="2" /><rect x="5" y="8" width="1" height="2" /><rect x="18" y="8" width="1" height="2" /></g>;
      case 'Buzz': return <rect x="6" y="7" width="12" height="1" fill={hairFill.fill} opacity="0.8" />;
      case 'Curly': return <g fill={hairFill.fill}><rect x="4" y="5" width="16" height="3" /><rect x="3" y="6" width="18" height="3" /><rect x="4" y="9" width="2" height="2" /><rect x="18" y="9" width="2" height="2" /></g>;
      case 'Spiky': return <g fill={hairFill.fill}><rect x="5" y="6" width="14" height="2" /><rect x="6" y="4" width="1" height="2" /><rect x="9" y="3" width="1" height="3" /><rect x="12" y="4" width="1" height="2" /><rect x="15" y="3" width="1" height="3" /><rect x="17" y="5" width="1" height="1" /></g>;
      case 'Fade': return <g><rect x="6" y="6" width="12" height="2" fill={hairFill.fill} /><rect x="5" y="8" width="1" height="3" fill={skinFill.fill} opacity="0.5" /><rect x="18" y="8" width="1" height="3" fill={skinFill.fill} opacity="0.5" /></g>;
      case 'Mohawk': return <g fill={hairFill.fill}><rect x="10" y="2" width="4" height="6" /><rect x="11" y="1" width="2" height="1" /></g>;
      case 'Dreadlocks': return <g fill={hairFill.fill}><rect x="5" y="5" width="14" height="3" /><rect x="4" y="8" width="2" height="4" /><rect x="18" y="8" width="2" height="4" /><rect x="6" y="8" width="2" height="2" /><rect x="16" y="8" width="2" height="2" /></g>;
      case 'Dreadlocks V1': return <g fill={hairFill.fill}><rect x="5" y="6" width="14" height="2" /><rect x="6" y="8" width="2" height="3" /><rect x="9" y="8" width="2" height="4" /><rect x="12" y="8" width="2" height="4" /><rect x="15" y="8" width="2" height="3" /></g>;
      case 'Dreadlocks V2': return <g fill={hairFill.fill}><rect x="5" y="6" width="14" height="2" /><rect x="6" y="8" width="2" height="3" /><rect x="9" y="8" width="2" height="4" /><rect x="12" y="8" width="2" height="4" /><rect x="15" y="8" width="2" height="3" /><rect x="9" y="10" width="2" height="1" fill="#f59e0b" /></g>;
      case 'Dreadlocks V3': return <g fill={hairFill.fill}><rect x="4" y="6" width="16" height="2" /><rect x="4" y="8" width="2" height="3" /><rect x="7" y="8" width="2" height="4" /><rect x="10" y="8" width="2" height="3" /><rect x="13" y="8" width="2" height="3" /><rect x="16" y="8" width="2" height="4" /><rect x="18" y="8" width="2" height="3" /></g>;
      case 'Dreadlocks V4': return <g fill={hairFill.fill}><rect x="4" y="6" width="16" height="2" /><rect x="4" y="8" width="2" height="3" /><rect x="7" y="8" width="2" height="4" /><rect x="10" y="8" width="2" height="3" /><rect x="13" y="8" width="2" height="3" /><rect x="16" y="8" width="2" height="4" /><rect x="18" y="8" width="2" height="3" /><rect x="16" y="10" width="2" height="1" fill="#22c55e" /></g>;
      case 'Dreadlocks V5': return <g fill={hairFill.fill}><rect x="5" y="6" width="14" height="2" /><rect x="5" y="8" width="2" height="3" /><rect x="8" y="8" width="2" height="4" /><rect x="11" y="8" width="2" height="4" /><rect x="14" y="8" width="2" height="3" /><rect x="17" y="8" width="2" height="3" /></g>;
      case 'Dreadlocks V6': return <g fill={hairFill.fill}><rect x="5" y="6" width="14" height="2" /><rect x="6" y="8" width="2" height="4" /><rect x="9" y="8" width="2" height="5" /><rect x="12" y="8" width="2" height="5" /><rect x="15" y="8" width="2" height="4" /></g>;
      case 'Dreadlocks V7': return <g fill={hairFill.fill}><rect x="5" y="6" width="14" height="2" /><rect x="6" y="8" width="2" height="4" /><rect x="9" y="8" width="2" height="5" /><rect x="12" y="8" width="2" height="5" /><rect x="15" y="8" width="2" height="4" /><rect x="12" y="11" width="2" height="1" fill="#f59e0b" /></g>;
      case 'Dreadlocks V8': return <g fill={hairFill.fill}><rect x="4" y="6" width="16" height="2" /><rect x="4" y="8" width="2" height="4" /><rect x="7" y="8" width="2" height="4" /><rect x="10" y="8" width="2" height="5" /><rect x="13" y="8" width="2" height="5" /><rect x="16" y="8" width="2" height="4" /><rect x="18" y="8" width="2" height="4" /></g>;
      case 'Dreadlocks V9': return <g fill={hairFill.fill}><rect x="4" y="6" width="16" height="2" /><rect x="3" y="8" width="2" height="4" /><rect x="6" y="8" width="2" height="4" /><rect x="9" y="8" width="2" height="5" /><rect x="12" y="8" width="2" height="5" /><rect x="15" y="8" width="2" height="4" /><rect x="18" y="8" width="2" height="4" /><rect x="19" y="8" width="2" height="4" /></g>;
      case 'Dreadlocks V10': return <g fill={hairFill.fill}><rect x="4" y="6" width="16" height="2" /><rect x="4" y="8" width="2" height="4" /><rect x="7" y="8" width="2" height="5" /><rect x="10" y="8" width="2" height="5" /><rect x="13" y="8" width="2" height="5" /><rect x="16" y="8" width="2" height="5" /><rect x="18" y="8" width="2" height="4" /><rect x="7" y="11" width="2" height="1" fill="#ef4444" /></g>;
      case 'Locks V1': return <g fill={hairFill.fill}><rect x="5" y="6" width="14" height="2" /><rect x="6" y="8" width="2" height="3" /><rect x="9" y="8" width="2" height="4" /><rect x="12" y="8" width="2" height="4" /><rect x="15" y="8" width="2" height="3" /></g>;
      case 'Locks V2': return <g fill={hairFill.fill}><rect x="4" y="6" width="16" height="2" /><rect x="4" y="8" width="2" height="3" /><rect x="7" y="8" width="2" height="4" /><rect x="10" y="8" width="2" height="3" /><rect x="13" y="8" width="2" height="3" /><rect x="16" y="8" width="2" height="4" /><rect x="18" y="8" width="2" height="3" /></g>;
      case 'Locks V3': return <g fill={hairFill.fill}><rect x="5" y="6" width="14" height="2" /><rect x="6" y="8" width="2" height="4" /><rect x="9" y="8" width="2" height="5" /><rect x="12" y="8" width="2" height="5" /><rect x="15" y="8" width="2" height="4" /></g>;
      case 'Locks V4': return <g fill={hairFill.fill}><rect x="4" y="6" width="16" height="2" /><rect x="4" y="8" width="2" height="4" /><rect x="7" y="8" width="2" height="5" /><rect x="10" y="8" width="2" height="4" /><rect x="13" y="8" width="2" height="4" /><rect x="16" y="8" width="2" height="5" /><rect x="18" y="8" width="2" height="4" /></g>;
      case 'Locks V5': return <g fill={hairFill.fill}><rect x="5" y="6" width="14" height="2" /><rect x="5" y="8" width="2" height="3" /><rect x="8" y="8" width="2" height="4" /><rect x="11" y="8" width="2" height="5" /><rect x="14" y="8" width="2" height="4" /><rect x="17" y="8" width="2" height="3" /></g>;
      case 'Locks V6': return <g fill={hairFill.fill}><rect x="5" y="6" width="14" height="2" /><rect x="6" y="8" width="2" height="4" /><rect x="9" y="8" width="2" height="5" /><rect x="12" y="8" width="2" height="5" /><rect x="15" y="8" width="2" height="4" /></g>;
      case 'Locks V7': return <g fill={hairFill.fill}><rect x="4" y="6" width="16" height="2" /><rect x="4" y="8" width="2" height="4" /><rect x="7" y="8" width="2" height="5" /><rect x="10" y="8" width="2" height="5" /><rect x="13" y="8" width="2" height="5" /><rect x="16" y="8" width="2" height="5" /><rect x="18" y="8" width="2" height="4" /></g>;
      case 'Locks V8': return <g fill={hairFill.fill}><rect x="5" y="6" width="14" height="2" /><rect x="4" y="8" width="2" height="4" /><rect x="7" y="8" width="2" height="5" /><rect x="10" y="8" width="2" height="5" /><rect x="13" y="8" width="2" height="5" /><rect x="16" y="8" width="2" height="4" /></g>;
      case 'Locks V9': return <g fill={hairFill.fill}><rect x="4" y="6" width="16" height="2" /><rect x="3" y="8" width="2" height="4" /><rect x="6" y="8" width="2" height="5" /><rect x="9" y="8" width="2" height="5" /><rect x="12" y="8" width="2" height="5" /><rect x="15" y="8" width="2" height="5" /><rect x="18" y="8" width="2" height="4" /><rect x="19" y="8" width="2" height="4" /></g>;
      case 'Locks V10': return <g fill={hairFill.fill}><rect x="4" y="6" width="16" height="2" /><rect x="4" y="8" width="2" height="4" /><rect x="7" y="8" width="2" height="5" /><rect x="10" y="8" width="2" height="6" /><rect x="13" y="8" width="2" height="6" /><rect x="16" y="8" width="2" height="5" /><rect x="18" y="8" width="2" height="4" /></g>;
      case 'Afro': return <g fill={hairFill.fill}><rect x="4" y="4" width="16" height="4" /><rect x="3" y="5" width="18" height="4" /></g>;
      case 'Mullet': return <g fill={hairFill.fill}><rect x="5" y="6" width="14" height="2" /><rect x="5" y="8" width="1" height="2" /><rect x="18" y="8" width="1" height="2" /></g>;
      case 'Pigtails': return <g fill={hairFill.fill}><rect x="5" y="6" width="14" height="2" /><rect x="4" y="8" width="2" height="2" /><rect x="18" y="8" width="2" height="2" /></g>;
      case 'Messy': return <g fill={hairFill.fill}><rect x="4" y="5" width="16" height="3" /><rect x="5" y="4" width="4" height="1" /><rect x="12" y="3" width="3" height="2" /><rect x="17" y="4" width="2" height="2" /><rect x="3" y="7" width="2" height="3" /><rect x="19" y="6" width="2" height="4" /><rect x="6" y="8" width="1" height="2" /><rect x="17" y="8" width="1" height="2" /></g>;
      case 'Ponytail': case 'Long Straight': case 'Long Wavy': case 'Bob':
        return <g fill={hairFill.fill}><rect x="5" y="6" width="14" height="2" /><rect x="5" y="8" width="2" height="3" /><rect x="17" y="8" width="2" height="3" /></g>;
      case 'Bald': default: return null;
    }
  };

  // ── eyes ───────────────────────────────────────────────────────────────────

  const renderEyes = () => {
    const renderEye = (x: number) => {
      const isRightEye = x === 14;
      const isWinking = emotion === 'wink' && isRightEye;
      if (isWinking || emotion === 'sleepy' || emotion === 'cool' || emotion === 'ninja') {
        return <rect x={x} y="11" width="3" height="1" fill="rgba(0,0,0,0.6)" />;
      }
      switch (eyeShape) {
        case 'Round': return <g><rect x={x} y="11" width="2" height="2" fill="white" /><motion.rect x={x + 0.5} y="11.5" width="1" height="1" fill={eyeColor} style={(!compact || trackMouse || roamEyes) ? { x: mouseX, y: mouseY } : {}} /></g>;
        case 'Almond': return <g><rect x={x} y="11" width="3" height="1" fill="white" /><motion.rect x={x + 1} y="11" width="1" height="1" fill={eyeColor} style={(!compact || trackMouse || roamEyes) ? { x: mouseX, y: mouseY } : {}} /></g>;
        case 'Narrow': return <g><rect x={x} y="12" width="3" height="1" fill="white" /><motion.rect x={x + 1} y="12" width="1" height="1" fill={eyeColor} style={(!compact || trackMouse || roamEyes) ? { x: mouseX, y: mouseY } : {}} /></g>;
        case 'Wide': return <g><rect x={x} y="11" width="3" height="2" fill="white" /><motion.rect x={x + 0.5} y="11" width="2" height="2" fill={eyeColor} style={(!compact || trackMouse || roamEyes) ? { x: mouseX, y: mouseY } : {}} /></g>;
        case 'Eye V1': return <g><rect x={x} y="11" width="3" height="2" fill="white" /><motion.rect x={x + 1} y="11.5" width="1" height="1" fill={eyeColor} style={(!compact || trackMouse || roamEyes) ? { x: mouseX, y: mouseY } : {}} /></g>;
        case 'Eye V2': return <g><rect x={x} y="11" width="3" height="1" fill="white" /><rect x={x} y="12" width="2" height="1" fill="white" /><motion.rect x={x + 1} y="11.5" width="1" height="1" fill={eyeColor} style={(!compact || trackMouse || roamEyes) ? { x: mouseX, y: mouseY } : {}} /></g>;
        case 'Eye V3': return <g><rect x={x} y="11" width="2" height="2" fill="white" /><rect x={x + 2} y="12" width="1" height="1" fill="white" /><motion.rect x={x + 0.5} y="11.5" width="1" height="1" fill={eyeColor} style={(!compact || trackMouse || roamEyes) ? { x: mouseX, y: mouseY } : {}} /></g>;
        case 'Eye V4': return <g><rect x={x} y="11" width="3" height="2" fill="white" /><motion.rect x={x + 1.5} y="11.5" width="1" height="1" fill={eyeColor} style={(!compact || trackMouse || roamEyes) ? { x: mouseX, y: mouseY } : {}} /></g>;
        case 'Eye V5': return <g><rect x={x} y="12" width="3" height="1" fill="white" /><rect x={x + 1} y="11" width="1" height="1" fill="white" /><motion.rect x={x + 1} y="12" width="1" height="1" fill={eyeColor} style={(!compact || trackMouse || roamEyes) ? { x: mouseX, y: mouseY } : {}} /></g>;
        case 'Eye V6': return <g><rect x={x} y="11" width="3" height="2" fill="white" /><rect x={x + 1} y="10" width="1" height="1" fill="white" /><motion.rect x={x + 1} y="11.5" width="1" height="1" fill={eyeColor} style={(!compact || trackMouse || roamEyes) ? { x: mouseX, y: mouseY } : {}} /></g>;
        case 'Eye V7': return <g><rect x={x} y="11" width="3" height="2" fill="white" /><rect x={x} y="10" width="1" height="1" fill="white" /><rect x={x + 2} y="10" width="1" height="1" fill="white" /><motion.rect x={x + 1} y="11.5" width="1" height="1" fill={eyeColor} style={(!compact || trackMouse || roamEyes) ? { x: mouseX, y: mouseY } : {}} /></g>;
        case 'Eye V8': return <g><rect x={x} y="11" width="3" height="1" fill="white" /><rect x={x + 1} y="12" width="2" height="1" fill="white" /><motion.rect x={x + 1.2} y="11.5" width="1" height="1" fill={eyeColor} style={(!compact || trackMouse || roamEyes) ? { x: mouseX, y: mouseY } : {}} /></g>;
        case 'Eye V9': return <g><rect x={x} y="11" width="2" height="2" fill="white" /><motion.rect x={x + 1} y="11.5" width="1" height="1" fill={eyeColor} style={(!compact || trackMouse || roamEyes) ? { x: mouseX, y: mouseY } : {}} /></g>;
        case 'Eye V10': return <g><rect x={x} y="11" width="3" height="2" fill="white" /><rect x={x + 1} y="12" width="1" height="1" fill={eyeColor} /><motion.rect x={x + 0.8} y="11.2" width="1" height="1" fill={eyeColor} style={(!compact || trackMouse || roamEyes) ? { x: mouseX, y: mouseY } : {}} /></g>;
        default: return null;
      }
    };

    return (
      <g>
        <motion.rect animate={emotion} variants={eyebrowLeftVariants} style={{ transformOrigin: '8.5px 9.5px' }} x="7" y="9" width="3" height="1" fill={hairFill.fill} />
        <motion.rect animate={emotion} variants={eyebrowRightVariants} style={{ transformOrigin: '15.5px 9.5px' }} x="14" y="9" width="3" height="1" fill={hairFill.fill} />
        {/* Auto-blink wrapper */}
        <motion.g
          animate={{ scaleY: [1, 1, 0.1, 1] }}
          transition={{ duration: 4, repeat: Infinity, times: [0, 0.9, 0.95, 1], ease: 'easeInOut' }}
          style={{ transformOrigin: '12px 11.5px' }}
        >
          <motion.g animate={emotion} variants={eyeVariants} style={{ transformOrigin: '8.5px 11.5px' }}>
            {renderEye(7)}
          </motion.g>
          <motion.g animate={emotion} variants={rightEyeVariants} style={{ transformOrigin: '15.5px 11.5px' }}>
            {renderEye(14)}
          </motion.g>
        </motion.g>
      </g>
    );
  };

  // ── face features ──────────────────────────────────────────────────────────

  const renderNose = () => {
    switch (noseShape) {
      case 'Small':  return <rect x="11" y="14" width="2" height="1" fill="rgba(0,0,0,0.15)" />;
      case 'Wide':   return <rect x="10" y="14" width="4" height="1" fill="rgba(0,0,0,0.15)" />;
      case 'Pointy': return <rect x="11" y="13" width="2" height="2" fill="rgba(0,0,0,0.15)" />;
      case 'Button': return <rect x="11" y="14" width="2" height="2" fill="rgba(0,0,0,0.15)" />;
      default: return null;
    }
  };

  const renderLips = () => {
    if (emotion === 'surprised') {
      // Open-mouth O shape: 2×2 dark block
      return <rect x="11" y="16" width="2" height="2" fill="rgba(0,0,0,0.75)" />;
    }
    switch (lipShape) {
      case 'Thin':  return <rect x="10" y="16" width="4" height="1" fill="rgba(0,0,0,0.4)" />;
      case 'Full':  return <rect x="10" y="16" width="4" height="2" fill="rgba(180,50,50,0.7)" />;
      case 'Smile': return <g fill="rgba(0,0,0,0.6)"><rect x="10" y="17" width="4" height="1" /><rect x="9" y="16" width="1" height="1" /><rect x="14" y="16" width="1" height="1" /></g>;
      case 'Smirk': return <g fill="rgba(0,0,0,0.6)"><rect x="10" y="17" width="4" height="1" /><rect x="14" y="16" width="1" height="1" /></g>;
      case 'Pout':  return <rect x="11" y="16" width="2" height="1" fill="rgba(180,50,50,0.7)" />;
      default: return null;
    }
  };

  // ── accessories ────────────────────────────────────────────────────────────

  const renderAccessories = () => {
    const ac = accessoryFill.fill;
    switch (accessory) {
      case 'Glasses': return <g fill={ac}><rect x="6" y="10" width="5" height="1" /><rect x="6" y="13" width="5" height="1" /><rect x="6" y="11" width="1" height="2" /><rect x="10" y="11" width="1" height="2" /><rect x="13" y="10" width="5" height="1" /><rect x="13" y="13" width="5" height="1" /><rect x="13" y="11" width="1" height="2" /><rect x="17" y="11" width="1" height="2" /><rect x="11" y="11" width="2" height="1" /><rect x="4" y="11" width="2" height="1" /><rect x="18" y="11" width="2" height="1" /></g>;
      case 'Sunglasses': return <g fill={ac}><rect x="6" y="10" width="5" height="4" /><rect x="13" y="10" width="5" height="4" /><rect x="11" y="11" width="2" height="1" /><rect x="4" y="11" width="2" height="1" /><rect x="18" y="11" width="2" height="1" /></g>;
      case 'Aviators': return <g fill={ac}><rect x="5" y="10" width="6" height="4" /><rect x="6" y="14" width="4" height="1" /><rect x="13" y="10" width="6" height="4" /><rect x="14" y="14" width="4" height="1" /><rect x="11" y="10" width="2" height="1" /><rect x="4" y="10" width="1" height="1" /><rect x="19" y="10" width="1" height="1" /></g>;
      case 'Wayfarers': return <g fill={ac}><rect x="5" y="9" width="6" height="2" /><rect x="13" y="9" width="6" height="2" /><rect x="6" y="11" width="4" height="3" /><rect x="14" y="11" width="4" height="3" /><rect x="11" y="10" width="2" height="1" /><rect x="4" y="10" width="1" height="1" /><rect x="19" y="10" width="1" height="1" /></g>;
      case 'Round Glasses': return <g fill={ac}><rect x="6" y="9" width="4" height="1" /><rect x="6" y="14" width="4" height="1" /><rect x="5" y="10" width="1" height="4" /><rect x="10" y="10" width="1" height="4" /><rect x="14" y="9" width="4" height="1" /><rect x="14" y="14" width="4" height="1" /><rect x="13" y="10" width="1" height="4" /><rect x="18" y="10" width="1" height="4" /><rect x="11" y="11" width="2" height="1" /><rect x="4" y="11" width="1" height="1" /><rect x="19" y="11" width="1" height="1" /><rect x="6" y="10" width="4" height="4" fill="rgba(0,0,0,0.6)" /><rect x="14" y="10" width="4" height="4" fill="rgba(0,0,0,0.6)" /></g>;
      case 'Cyberpunk': return <g><rect x="4" y="10" width="16" height="3" fill="#00ffcc" opacity="0.8" /><rect x="4" y="10" width="16" height="1" fill="#ff00ff" opacity="0.8" /><rect x="4" y="11" width="1" height="2" fill="#111" /><rect x="19" y="11" width="1" height="2" fill="#111" /></g>;
      case 'Shades V1': return <g fill={ac}><rect x="5" y="10" width="6" height="3" /><rect x="13" y="10" width="6" height="3" /><rect x="11" y="11" width="2" height="1" /></g>;
      case 'Shades V2': return <g fill={ac}><rect x="5" y="9" width="6" height="4" /><rect x="13" y="9" width="6" height="4" /><rect x="11" y="10" width="2" height="1" /><rect x="4" y="10" width="1" height="2" /><rect x="19" y="10" width="1" height="2" /></g>;
      case 'Shades V3': return <g fill={ac}><rect x="6" y="10" width="4" height="3" /><rect x="14" y="10" width="4" height="3" /><rect x="10" y="11" width="4" height="1" /></g>;
      case 'Shades V4': return <g fill={ac}><rect x="5" y="10" width="6" height="4" /><rect x="13" y="10" width="6" height="4" /><rect x="11" y="11" width="2" height="2" /><rect x="6" y="9" width="4" height="1" /><rect x="14" y="9" width="4" height="1" /></g>;
      case 'Shades V5': return <g fill={ac}><rect x="5" y="11" width="6" height="2" /><rect x="13" y="11" width="6" height="2" /><rect x="11" y="11" width="2" height="1" /></g>;
      case 'Shades V6': return <g fill={ac}><rect x="5" y="10" width="5" height="4" /><rect x="14" y="10" width="5" height="4" /><rect x="10" y="11" width="4" height="1" /></g>;
      case 'Shades V7': return <g fill={ac}><rect x="6" y="9" width="5" height="4" /><rect x="13" y="9" width="5" height="4" /><rect x="11" y="10" width="2" height="1" /><rect x="5" y="10" width="1" height="2" /><rect x="18" y="10" width="1" height="2" /></g>;
      case 'Shades V8': return <g fill={ac}><rect x="5" y="10" width="6" height="3" /><rect x="13" y="10" width="6" height="3" /><rect x="11" y="10" width="2" height="1" /><rect x="6" y="13" width="4" height="1" /><rect x="14" y="13" width="4" height="1" /></g>;
      case 'Shades V9': return <g fill={ac}><rect x="5" y="10" width="6" height="4" /><rect x="13" y="10" width="6" height="4" /><rect x="11" y="11" width="2" height="1" /><rect x="4" y="11" width="1" height="1" /><rect x="19" y="11" width="1" height="1" /></g>;
      case 'Shades V10': return <g fill={ac}><rect x="5" y="9" width="6" height="3" /><rect x="13" y="9" width="6" height="3" /><rect x="11" y="10" width="2" height="1" /><rect x="6" y="12" width="4" height="2" /><rect x="14" y="12" width="4" height="2" /></g>;
      case 'Voxel Glasses': return <g><rect x="5" y="10" width="6" height="4" fill={`url(#${uid}custom)`} /><rect x="13" y="10" width="6" height="4" fill={`url(#${uid}custom)`} /><rect x="11" y="11" width="2" height="1" fill="#111" /><rect x="4" y="11" width="1" height="1" fill="#111" /><rect x="19" y="11" width="1" height="1" fill="#111" /></g>;
      case 'Earrings': return <g fill="#FFD700"><rect x="4" y="13" width="1" height="1" /><rect x="19" y="13" width="1" height="1" /></g>;
      case 'Headband': return <rect x="5" y="7" width="14" height="2" fill="#E11D48" />;
      case 'None': default: return null;
    }
  };

  const renderHat = () => {
    const hc = hatFill?.fill ?? null;
    switch (config.hat) {
      case 'Cap': return <g><rect x="6" y="4" width="12" height="4" fill={hc ?? '#ef4444'} /><rect x="6" y="7" width="16" height="1" fill={hc ?? '#ef4444'} /></g>;
      case 'Beanie': return <g><rect x="5" y="4" width="14" height="5" rx="2" fill={hc ?? '#3b82f6'} /><rect x="5" y="8" width="14" height="2" fill={hc ?? '#2563eb'} /></g>;
      case 'Top Hat': return <g><rect x="7" y="0" width="10" height="8" fill={hc ?? '#111'} /><rect x="4" y="8" width="16" height="1" fill={hc ?? '#111'} /><rect x="7" y="6" width="10" height="2" fill={hc ? 'rgba(0,0,0,0.35)' : '#dc2626'} /></g>;
      case 'Cowboy': return <g><rect x="7" y="2" width="10" height="5" fill={hc ?? '#78350f'} /><rect x="3" y="7" width="18" height="2" fill={hc ?? '#78350f'} /></g>;
      case 'Crown': return <g fill={hc ?? '#fbbf24'}><rect x="5" y="4" width="14" height="4" /><rect x="5" y="2" width="2" height="2" /><rect x="11" y="2" width="2" height="2" /><rect x="17" y="2" width="2" height="2" /></g>;
      case 'Bandana': return <g fill={hc ?? '#ef4444'}><rect x="5" y="6" width="14" height="3" /><rect x="18" y="7" width="2" height="4" /></g>;
      case 'Hat V1': return <g><rect x="5" y="4" width="14" height="3" fill={hc ?? '#1f2937'} /><rect x="4" y="7" width="16" height="1" fill={hc ?? '#1f2937'} /></g>;
      case 'Hat V2': return <g><rect x="6" y="3" width="12" height="4" fill={hc ?? '#111827'} /><rect x="4" y="7" width="16" height="2" fill={hc ?? '#111827'} /></g>;
      case 'Hat V3': return <g><rect x="7" y="2" width="10" height="5" fill={hc ?? '#334155'} /><rect x="4" y="7" width="16" height="1" fill={hc ?? '#334155'} /></g>;
      case 'Hat V4': return <g><rect x="6" y="4" width="12" height="4" fill={hc ?? '#7c2d12'} /><rect x="5" y="8" width="14" height="1" fill={hc ?? '#7c2d12'} /><rect x="10" y="5" width="4" height="1" fill="rgba(255,255,255,0.2)" /></g>;
      case 'Hat V5': return <g><rect x="5" y="4" width="14" height="4" fill={hc ?? '#0f766e'} /><rect x="5" y="8" width="14" height="1" fill={hc ?? '#0f766e'} /><rect x="9" y="4" width="6" height="1" fill="rgba(255,255,255,0.2)" /></g>;
      case 'Hat V6': return <g><rect x="4" y="5" width="16" height="3" fill={hc ?? '#1d4ed8'} /><rect x="6" y="4" width="12" height="1" fill={hc ?? '#1d4ed8'} /></g>;
      case 'Hat V7': return <g><rect x="5" y="3" width="14" height="5" fill={hc ?? '#6b21a8'} /><rect x="4" y="8" width="16" height="1" fill={hc ?? '#6b21a8'} /></g>;
      case 'Hat V8': return <g><rect x="6" y="4" width="12" height="3" fill={hc ?? '#854d0e'} /><rect x="5" y="7" width="14" height="2" fill={hc ?? '#854d0e'} /><rect x="10" y="4" width="4" height="1" fill="rgba(255,255,255,0.2)" /></g>;
      case 'Hat V9': return <g><rect x="6" y="3" width="12" height="4" fill={hc ?? '#374151'} /><rect x="5" y="7" width="14" height="1" fill={hc ?? '#374151'} /><rect x="8" y="8" width="8" height="1" fill={hc ?? '#374151'} /></g>;
      case 'Hat V10': return <g><rect x="5" y="4" width="14" height="3" fill={hc ?? '#0f172a'} /><rect x="4" y="7" width="16" height="2" fill={hc ?? '#0f172a'} /><rect x="11" y="4" width="2" height="1" fill="rgba(255,255,255,0.25)" /></g>;
      default: return null;
    }
  };

  const renderShirtBody = () => {
    const c = shirtFill.fill;
    const style = config.shirtStyle || 'Default';
    switch (style) {
      case 'Streetwear V1': return <g><rect x="4" y="20" width="16" height="8" fill={c} /><rect x="4" y="22" width="16" height="1" fill="rgba(255,255,255,0.15)" /><rect x="7" y="24" width="10" height="2" fill="rgba(0,0,0,0.12)" /></g>;
      case 'Streetwear V2': return <g><rect x="4" y="20" width="16" height="8" fill={c} /><rect x="4" y="20" width="16" height="2" fill="rgba(0,0,0,0.2)" /><rect x="11" y="22" width="2" height="6" fill="rgba(255,255,255,0.12)" /></g>;
      case 'Streetwear V3': return <g><rect x="4" y="20" width="16" height="8" fill={c} /><rect x="5" y="21" width="3" height="3" fill="rgba(255,255,255,0.18)" /><rect x="16" y="21" width="3" height="3" fill="rgba(255,255,255,0.18)" /><rect x="8" y="26" width="8" height="1" fill="rgba(0,0,0,0.2)" /></g>;
      case 'Streetwear V4': return <g><rect x="4" y="20" width="16" height="8" fill={c} /><rect x="4" y="24" width="16" height="1" fill="rgba(255,255,255,0.2)" /><rect x="9" y="20" width="6" height="2" fill="rgba(0,0,0,0.15)" /></g>;
      case 'Streetwear V5': return <g><rect x="4" y="20" width="16" height="8" fill={c} /><rect x="4" y="20" width="2" height="8" fill="rgba(0,0,0,0.12)" /><rect x="18" y="20" width="2" height="8" fill="rgba(0,0,0,0.12)" /><rect x="10" y="22" width="4" height="2" fill="rgba(255,255,255,0.18)" /></g>;
      case 'Streetwear V6': return <g><rect x="4" y="20" width="16" height="8" fill={c} /><rect x="6" y="21" width="12" height="1" fill="rgba(255,255,255,0.2)" /><rect x="6" y="25" width="12" height="1" fill="rgba(255,255,255,0.15)" /><rect x="11" y="22" width="2" height="5" fill="rgba(0,0,0,0.15)" /></g>;
      case 'Streetwear V7': return <g><rect x="4" y="20" width="16" height="8" fill={c} /><rect x="5" y="23" width="14" height="1" fill="rgba(0,0,0,0.15)" /><rect x="8" y="24" width="8" height="3" fill="rgba(255,255,255,0.12)" /></g>;
      case 'Streetwear V8': return <g><rect x="4" y="20" width="16" height="8" fill={c} /><rect x="4" y="21" width="16" height="1" fill="rgba(255,255,255,0.18)" /><rect x="9" y="22" width="6" height="2" fill="rgba(0,0,0,0.2)" /><rect x="10" y="25" width="4" height="2" fill="rgba(0,0,0,0.1)" /></g>;
      case 'Streetwear V9': return <g><rect x="4" y="20" width="16" height="8" fill={c} /><rect x="6" y="20" width="12" height="2" fill="rgba(0,0,0,0.12)" /><rect x="6" y="26" width="12" height="1" fill="rgba(255,255,255,0.18)" /><rect x="11" y="22" width="2" height="4" fill="rgba(255,255,255,0.12)" /></g>;
      case 'Streetwear V10': return <g><rect x="4" y="20" width="16" height="8" fill={c} /><rect x="5" y="21" width="3" height="2" fill="rgba(0,0,0,0.15)" /><rect x="16" y="21" width="3" height="2" fill="rgba(0,0,0,0.15)" /><rect x="8" y="24" width="8" height="2" fill="rgba(255,255,255,0.16)" /><rect x="10" y="26" width="4" height="1" fill="rgba(0,0,0,0.15)" /></g>;
      case 'Tuxedo': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill="#1a1a1a" />
          {/* white shirt center */}
          <rect x="10" y="20" width="4" height="8" fill="#f0f0f0" />
          {/* lapels */}
          <rect x="8" y="20" width="2" height="5" fill="#1a1a1a" />
          <rect x="14" y="20" width="2" height="5" fill="#1a1a1a" />
          <rect x="9" y="20" width="1" height="3" fill="#f0f0f0" />
          <rect x="14" y="20" width="1" height="3" fill="#f0f0f0" />
          {/* bow tie */}
          <rect x="10" y="21" width="4" height="1" fill="#1a0030" />
          <rect x="11" y="20" width="2" height="3" fill="#1a0030" />
          {/* pocket square */}
          <rect x="5" y="21" width="2" height="2" fill="#f0f0f0" />
          {/* buttons */}
          <rect x="11" y="24" width="2" height="1" fill="#ccc" />
        </g>
      );
      case 'Cheetah Print': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill="#d4882a" />
          {/* spots */}
          <rect x="5" y="21" width="2" height="1" fill="#3d2000" /><rect x="5" y="22" width="1" height="1" fill="#3d2000" />
          <rect x="9" y="20" width="1" height="2" fill="#3d2000" /><rect x="10" y="20" width="1" height="1" fill="#3d2000" />
          <rect x="14" y="22" width="2" height="1" fill="#3d2000" /><rect x="15" y="23" width="1" height="1" fill="#3d2000" />
          <rect x="7" y="24" width="2" height="1" fill="#3d2000" /><rect x="8" y="25" width="1" height="1" fill="#3d2000" />
          <rect x="12" y="25" width="2" height="1" fill="#3d2000" /><rect x="11" y="26" width="1" height="1" fill="#3d2000" />
          <rect x="17" y="21" width="1" height="2" fill="#3d2000" /><rect x="18" y="22" width="1" height="1" fill="#3d2000" />
          <rect x="5" y="26" width="2" height="1" fill="#3d2000" />
        </g>
      );
      case 'Hawaiian': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill={c} />
          {/* flower dots */}
          <rect x="6" y="21" width="1" height="1" fill="#ff6b6b" /><rect x="5" y="22" width="1" height="1" fill="#ff6b6b" /><rect x="7" y="22" width="1" height="1" fill="#ff6b6b" /><rect x="6" y="23" width="1" height="1" fill="#ff6b6b" />
          <rect x="14" y="22" width="1" height="1" fill="#ffd93d" /><rect x="13" y="23" width="1" height="1" fill="#ffd93d" /><rect x="15" y="23" width="1" height="1" fill="#ffd93d" /><rect x="14" y="24" width="1" height="1" fill="#ffd93d" />
          <rect x="9" y="25" width="1" height="1" fill="#6bcb77" /><rect x="8" y="26" width="1" height="1" fill="#6bcb77" /><rect x="10" y="26" width="1" height="1" fill="#6bcb77" />
          <rect x="17" y="24" width="1" height="1" fill="#ff6b6b" /><rect x="16" y="25" width="1" height="1" fill="#ff6b6b" /><rect x="18" y="25" width="1" height="1" fill="#ff6b6b" />
        </g>
      );
      case 'Pinstripe': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill="#1e2030" />
          {/* vertical pinstripes */}
          <rect x="6" y="20" width="1" height="8" fill="rgba(255,255,255,0.18)" />
          <rect x="9" y="20" width="1" height="8" fill="rgba(255,255,255,0.18)" />
          <rect x="12" y="20" width="1" height="8" fill="rgba(255,255,255,0.18)" />
          <rect x="15" y="20" width="1" height="8" fill="rgba(255,255,255,0.18)" />
          <rect x="18" y="20" width="1" height="8" fill="rgba(255,255,255,0.18)" />
        </g>
      );
      case 'Flannel': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill={c} />
          {/* horizontal plaid lines */}
          <rect x="4" y="22" width="16" height="1" fill="rgba(255,255,255,0.22)" />
          <rect x="4" y="25" width="16" height="1" fill="rgba(255,255,255,0.22)" />
          {/* vertical plaid lines */}
          <rect x="7" y="20" width="1" height="8" fill="rgba(0,0,0,0.2)" />
          <rect x="11" y="20" width="1" height="8" fill="rgba(0,0,0,0.2)" />
          <rect x="15" y="20" width="1" height="8" fill="rgba(0,0,0,0.2)" />
          {/* cross intersections highlight */}
          <rect x="7" y="22" width="1" height="1" fill="rgba(255,255,255,0.3)" />
          <rect x="11" y="22" width="1" height="1" fill="rgba(255,255,255,0.3)" />
          <rect x="15" y="22" width="1" height="1" fill="rgba(255,255,255,0.3)" />
          <rect x="7" y="25" width="1" height="1" fill="rgba(255,255,255,0.3)" />
          <rect x="11" y="25" width="1" height="1" fill="rgba(255,255,255,0.3)" />
        </g>
      );
      case 'Denim Jacket': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill="#4a6fa5" />
          {/* darker collar area */}
          <rect x="4" y="20" width="16" height="2" fill="#3a5f95" />
          {/* center seam */}
          <rect x="11" y="20" width="2" height="8" fill="#3a5f95" />
          {/* chest pockets */}
          <rect x="5" y="22" width="3" height="2" fill="#3a5f95" />
          <rect x="16" y="22" width="3" height="2" fill="#3a5f95" />
          {/* stitching lines */}
          <rect x="5" y="25" width="14" height="1" fill="rgba(255,255,255,0.15)" />
          {/* buttons */}
          <rect x="11" y="23" width="2" height="1" fill="#6080b0" />
          <rect x="11" y="26" width="2" height="1" fill="#6080b0" />
        </g>
      );
      case 'Leather Jacket': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill="#1a1a1a" />
          {/* collar/lapels */}
          <rect x="4" y="20" width="4" height="4" fill="#222" />
          <rect x="16" y="20" width="4" height="4" fill="#222" />
          <rect x="6" y="20" width="2" height="5" fill="#2d2d2d" />
          <rect x="16" y="20" width="2" height="5" fill="#2d2d2d" />
          {/* zipper */}
          <rect x="11" y="20" width="2" height="8" fill="#444" />
          <rect x="11" y="20" width="2" height="1" fill="#888" />
          <rect x="11" y="23" width="2" height="1" fill="#888" />
          {/* shine */}
          <rect x="4" y="20" width="1" height="8" fill="rgba(255,255,255,0.08)" />
          <rect x="19" y="20" width="1" height="8" fill="rgba(255,255,255,0.08)" />
        </g>
      );
      case 'Varsity': return (
        <g>
          {/* body */}
          <rect x="4" y="20" width="16" height="8" fill={c} />
          {/* sleeves (sides) in contrasting white */}
          <rect x="4" y="20" width="3" height="8" fill="#f0f0f0" />
          <rect x="17" y="20" width="3" height="8" fill="#f0f0f0" />
          {/* collar */}
          <rect x="4" y="20" width="16" height="2" fill="#f0f0f0" />
          {/* stripes on sleeves */}
          <rect x="4" y="23" width="3" height="1" fill={c} />
          <rect x="17" y="23" width="3" height="1" fill={c} />
          {/* letter M on chest */}
          <rect x="10" y="22" width="1" height="3" fill="#f0f0f0" />
          <rect x="13" y="22" width="1" height="3" fill="#f0f0f0" />
          <rect x="11" y="22" width="2" height="1" fill="#f0f0f0" />
        </g>
      );
      case 'Hoodie': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill={c} />
          {/* hood/collar V-shape */}
          <rect x="9" y="20" width="6" height="1" fill="rgba(0,0,0,0.2)" />
          <rect x="10" y="21" width="4" height="1" fill="rgba(0,0,0,0.2)" />
          {/* front pocket */}
          <rect x="7" y="24" width="10" height="3" fill="rgba(0,0,0,0.15)" />
          <rect x="11" y="24" width="2" height="3" fill="rgba(0,0,0,0.1)" />
          {/* drawstrings */}
          <rect x="10" y="20" width="1" height="2" fill="rgba(0,0,0,0.3)" />
          <rect x="13" y="20" width="1" height="2" fill="rgba(0,0,0,0.3)" />
        </g>
      );
      case 'Camo': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill="#4a5e35" />
          {/* camo blotches */}
          <rect x="4" y="20" width="3" height="2" fill="#3a4a28" />
          <rect x="9" y="21" width="4" height="2" fill="#6b7c45" />
          <rect x="15" y="20" width="3" height="3" fill="#3a4a28" />
          <rect x="5" y="23" width="2" height="2" fill="#6b7c45" />
          <rect x="8" y="24" width="3" height="2" fill="#3a4a28" />
          <rect x="13" y="23" width="4" height="2" fill="#6b7c45" />
          <rect x="4" y="25" width="4" height="3" fill="#3a4a28" />
          <rect x="11" y="26" width="3" height="2" fill="#6b7c45" />
          <rect x="17" y="24" width="3" height="4" fill="#3a4a28" />
          <rect x="7" y="26" width="2" height="2" fill="#4a5e35" />
        </g>
      );
      case 'Suit': return (
        <g>
          {/* dark grey suit */}
          <rect x="4" y="20" width="16" height="8" fill="#2d2d3a" />
          {/* white shirt center */}
          <rect x="10" y="20" width="4" height="8" fill="#f5f5f5" />
          {/* lapels */}
          <rect x="8" y="20" width="3" height="5" fill="#2d2d3a" />
          <rect x="13" y="20" width="3" height="5" fill="#2d2d3a" />
          <rect x="9" y="20" width="1" height="4" fill="#f5f5f5" />
          <rect x="14" y="20" width="1" height="4" fill="#f5f5f5" />
          {/* tie */}
          <rect x="11" y="21" width="2" height="6" fill="#8b0000" />
          <rect x="11" y="21" width="2" height="1" fill="#a00000" />
          {/* button */}
          <rect x="11" y="24" width="2" height="1" fill="#ddd" />
        </g>
      );
      case 'Blazer': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill={c} />
          {/* white shirt peek */}
          <rect x="10" y="20" width="4" height="8" fill="#f5f5f5" />
          {/* lapels */}
          <rect x="7" y="20" width="4" height="5" fill={c} />
          <rect x="13" y="20" width="4" height="5" fill={c} />
          <rect x="9" y="20" width="1" height="4" fill="#f5f5f5" />
          <rect x="14" y="20" width="1" height="4" fill="#f5f5f5" />
          {/* pocket square */}
          <rect x="5" y="21" width="2" height="2" fill="#f5f5f5" />
          {/* button */}
          <rect x="11" y="24" width="2" height="1" fill="rgba(255,255,255,0.4)" />
        </g>
      );
      case 'Kimono': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill={c} />
          {/* wide diagonal collar */}
          <rect x="4" y="20" width="5" height="8" fill="rgba(0,0,0,0.2)" />
          <rect x="15" y="20" width="5" height="8" fill="rgba(0,0,0,0.2)" />
          <rect x="4" y="20" width="16" height="2" fill="rgba(255,255,255,0.15)" />
          {/* decorative border at bottom */}
          <rect x="4" y="26" width="16" height="2" fill="rgba(255,255,255,0.2)" />
          {/* decorative pattern on border */}
          <rect x="5" y="26" width="1" height="2" fill="rgba(0,0,0,0.2)" />
          <rect x="8" y="26" width="1" height="2" fill="rgba(0,0,0,0.2)" />
          <rect x="11" y="26" width="1" height="2" fill="rgba(0,0,0,0.2)" />
          <rect x="14" y="26" width="1" height="2" fill="rgba(0,0,0,0.2)" />
          <rect x="17" y="26" width="1" height="2" fill="rgba(0,0,0,0.2)" />
          {/* sash */}
          <rect x="9" y="23" width="6" height="2" fill="rgba(255,255,200,0.4)" />
        </g>
      );
      case 'Polo': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill={c} />
          {/* collar */}
          <rect x="8" y="20" width="8" height="2" fill="rgba(255,255,255,0.25)" />
          <rect x="9" y="19" width="6" height="2" fill={c} />
          {/* button placket */}
          <rect x="11" y="20" width="2" height="4" fill="rgba(0,0,0,0.15)" />
          <rect x="11" y="21" width="2" height="1" fill="rgba(255,255,255,0.4)" />
          <rect x="11" y="23" width="2" height="1" fill="rgba(255,255,255,0.4)" />
          {/* side stripe */}
          <rect x="4" y="20" width="1" height="8" fill="rgba(255,255,255,0.2)" />
          <rect x="19" y="20" width="1" height="8" fill="rgba(255,255,255,0.2)" />
        </g>
      );
      case 'Zebra Print': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill="#f5f5f5" />
          {/* diagonal black stripes */}
          <rect x="4" y="20" width="2" height="8" fill="#111" />
          <rect x="7" y="20" width="2" height="8" fill="#111" />
          <rect x="11" y="20" width="2" height="8" fill="#111" />
          <rect x="15" y="20" width="2" height="8" fill="#111" />
          <rect x="19" y="20" width="1" height="8" fill="#111" />
        </g>
      );
      case 'Leopard Print': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill="#c8922a" />
          {/* rosette spots */}
          <rect x="5" y="21" width="3" height="2" fill="#8b5e0a" opacity="0.7" />
          <rect x="6" y="20" width="1" height="1" fill="#8b5e0a" opacity="0.7" />
          <rect x="6" y="23" width="1" height="1" fill="#8b5e0a" opacity="0.7" />
          <rect x="11" y="22" width="3" height="2" fill="#8b5e0a" opacity="0.7" />
          <rect x="12" y="21" width="1" height="1" fill="#8b5e0a" opacity="0.7" />
          <rect x="12" y="24" width="1" height="1" fill="#8b5e0a" opacity="0.7" />
          <rect x="16" y="20" width="3" height="2" fill="#8b5e0a" opacity="0.7" />
          <rect x="17" y="22" width="1" height="1" fill="#8b5e0a" opacity="0.7" />
          <rect x="8" y="25" width="3" height="2" fill="#8b5e0a" opacity="0.7" />
          <rect x="9" y="24" width="1" height="1" fill="#8b5e0a" opacity="0.7" />
          <rect x="14" y="25" width="2" height="2" fill="#8b5e0a" opacity="0.7" />
        </g>
      );
      case 'Snake Skin': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill="#4a7a3a" />
          {/* scale diamond pattern */}
          <rect x="4" y="20" width="2" height="2" fill="#3a6a2a" />
          <rect x="7" y="20" width="2" height="2" fill="#3a6a2a" />
          <rect x="10" y="20" width="2" height="2" fill="#3a6a2a" />
          <rect x="13" y="20" width="2" height="2" fill="#3a6a2a" />
          <rect x="16" y="20" width="2" height="2" fill="#3a6a2a" />
          <rect x="5" y="22" width="2" height="2" fill="#3a6a2a" />
          <rect x="8" y="22" width="2" height="2" fill="#3a6a2a" />
          <rect x="11" y="22" width="2" height="2" fill="#3a6a2a" />
          <rect x="14" y="22" width="2" height="2" fill="#3a6a2a" />
          <rect x="17" y="22" width="2" height="2" fill="#3a6a2a" />
          <rect x="4" y="24" width="2" height="2" fill="#3a6a2a" />
          <rect x="7" y="24" width="2" height="2" fill="#3a6a2a" />
          <rect x="10" y="24" width="2" height="2" fill="#3a6a2a" />
          <rect x="13" y="24" width="2" height="2" fill="#3a6a2a" />
          <rect x="16" y="24" width="2" height="2" fill="#3a6a2a" />
          <rect x="5" y="26" width="2" height="2" fill="#3a6a2a" />
          <rect x="8" y="26" width="2" height="2" fill="#3a6a2a" />
          <rect x="11" y="26" width="2" height="2" fill="#3a6a2a" />
          <rect x="14" y="26" width="2" height="2" fill="#3a6a2a" />
          <rect x="17" y="26" width="2" height="2" fill="#3a6a2a" />
          {/* scale highlight dots */}
          <rect x="5" y="20" width="1" height="1" fill="rgba(255,255,255,0.2)" />
          <rect x="8" y="20" width="1" height="1" fill="rgba(255,255,255,0.2)" />
          <rect x="11" y="20" width="1" height="1" fill="rgba(255,255,255,0.2)" />
        </g>
      );
      case 'Tie-Dye': return (
        <g>
          {/* concentric rings from center */}
          <rect x="4" y="20" width="16" height="8" fill="#ff6b6b" />
          <rect x="5" y="21" width="14" height="6" fill="#ffd93d" />
          <rect x="6" y="22" width="12" height="4" fill="#6bcb77" />
          <rect x="7" y="23" width="10" height="2" fill="#4d96ff" />
          <rect x="9" y="23" width="6" height="1" fill="#c77dff" />
          <rect x="11" y="23" width="2" height="1" fill="#ff6b6b" />
          {/* swirl dots */}
          <rect x="4" y="24" width="1" height="1" fill="#6bcb77" />
          <rect x="19" y="22" width="1" height="1" fill="#4d96ff" />
          <rect x="5" y="27" width="1" height="1" fill="#ffd93d" />
          <rect x="18" y="26" width="1" height="1" fill="#ff6b6b" />
        </g>
      );
      case 'Neon Crop': return (
        <g>
          {/* cropped at y=24 (shorter shirt) */}
          <rect x="4" y="20" width="16" height="5" fill={c} />
          {/* neon glow edge */}
          <rect x="4" y="24" width="16" height="1" fill="rgba(255,255,255,0.5)" />
          {/* horizontal stripe detail */}
          <rect x="4" y="22" width="16" height="1" fill="rgba(255,255,255,0.2)" />
          {/* no lower body (crop) */}
          <rect x="4" y="25" width="16" height="3" fill="rgba(0,0,0,0)" />
        </g>
      );
      case 'Biker': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill="#111" />
          {/* open collar V */}
          <rect x="9" y="20" width="6" height="3" fill="#222" />
          <rect x="10" y="20" width="4" height="5" fill="#111" />
          {/* studs along shoulders */}
          <rect x="4" y="20" width="1" height="1" fill="#aaa" />
          <rect x="6" y="20" width="1" height="1" fill="#aaa" />
          <rect x="8" y="20" width="1" height="1" fill="#aaa" />
          <rect x="15" y="20" width="1" height="1" fill="#aaa" />
          <rect x="17" y="20" width="1" height="1" fill="#aaa" />
          <rect x="19" y="20" width="1" height="1" fill="#aaa" />
          {/* patch outline */}
          <rect x="5" y="22" width="5" height="4" fill="#222" />
          <rect x="5" y="22" width="5" height="1" fill="#555" />
          <rect x="5" y="25" width="5" height="1" fill="#555" />
          {/* zipper */}
          <rect x="11" y="20" width="2" height="6" fill="#333" />
          <rect x="11" y="22" width="2" height="1" fill="#777" />
        </g>
      );
      case 'Sailor': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill="#f5f5f5" />
          {/* navy blue stripes */}
          <rect x="4" y="21" width="16" height="1" fill="#1e3a6e" />
          <rect x="4" y="23" width="16" height="1" fill="#1e3a6e" />
          <rect x="4" y="25" width="16" height="1" fill="#1e3a6e" />
          <rect x="4" y="27" width="16" height="1" fill="#1e3a6e" />
          {/* sailor collar */}
          <rect x="4" y="20" width="6" height="4" fill="#1e3a6e" />
          <rect x="14" y="20" width="6" height="4" fill="#1e3a6e" />
          <rect x="4" y="20" width="16" height="2" fill="#1e3a6e" />
          {/* anchor emblem */}
          <rect x="11" y="25" width="2" height="3" fill="#1e3a6e" />
          <rect x="10" y="25" width="4" height="1" fill="#1e3a6e" />
          <rect x="10" y="27" width="1" height="1" fill="#1e3a6e" />
          <rect x="13" y="27" width="1" height="1" fill="#1e3a6e" />
        </g>
      );
      case 'Space Suit': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill="#c8c8d4" />
          {/* suit panels */}
          <rect x="4" y="20" width="16" height="2" fill="#a0a0b0" />
          <rect x="4" y="26" width="16" height="2" fill="#a0a0b0" />
          {/* tech panel left */}
          <rect x="5" y="22" width="4" height="4" fill="#888898" />
          <rect x="5" y="22" width="4" height="1" fill="#6a6a7a" />
          <rect x="6" y="23" width="1" height="1" fill="#44f" opacity="0.6" />
          <rect x="8" y="23" width="1" height="1" fill="#f44" opacity="0.6" />
          <rect x="6" y="24" width="3" height="1" fill="#6a6a7a" />
          {/* center seal */}
          <rect x="10" y="22" width="4" height="4" fill="#8898b0" />
          <rect x="11" y="23" width="2" height="2" fill="#aabbcc" />
          {/* right panel */}
          <rect x="15" y="22" width="4" height="4" fill="#888898" />
          <rect x="15" y="23" width="4" height="1" fill="#6a6a7a" />
          {/* side stripes */}
          <rect x="4" y="20" width="1" height="8" fill="#8888a0" />
          <rect x="19" y="20" width="1" height="8" fill="#8888a0" />
        </g>
      );
      case 'Grim Reaper': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill="#111118" />
          {/* dark purple inner lining */}
          <rect x="7" y="20" width="10" height="8" fill="#1a0030" />
          {/* robe folds */}
          <rect x="7" y="20" width="2" height="8" fill="#0d001a" />
          <rect x="15" y="20" width="2" height="8" fill="#0d001a" />
          <rect x="11" y="20" width="2" height="8" fill="#0d001a" />
          {/* skull emblem */}
          <rect x="10" y="22" width="4" height="3" fill="#ddd" />
          <rect x="10" y="21" width="4" height="1" fill="#ddd" />
          <rect x="10" y="25" width="1" height="1" fill="#ddd" />
          <rect x="13" y="25" width="1" height="1" fill="#ddd" />
          <rect x="11" y="25" width="2" height="1" fill="#111118" />
          {/* skull eyes */}
          <rect x="10" y="22" width="1" height="1" fill="#111118" />
          <rect x="13" y="22" width="1" height="1" fill="#111118" />
          {/* glow trim */}
          <rect x="4" y="27" width="16" height="1" fill="#4b0082" opacity="0.6" />
        </g>
      );
      case 'Golden Armor': return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill="#b8860b" />
          {/* chest plate */}
          <rect x="6" y="20" width="12" height="8" fill="#daa520" />
          {/* plate segments */}
          <rect x="6" y="23" width="12" height="1" fill="#b8860b" />
          <rect x="6" y="26" width="12" height="1" fill="#b8860b" />
          {/* vertical center line */}
          <rect x="11" y="20" width="2" height="8" fill="#b8860b" />
          {/* shoulder pauldrons */}
          <rect x="4" y="20" width="3" height="4" fill="#daa520" />
          <rect x="17" y="20" width="3" height="4" fill="#daa520" />
          <rect x="4" y="23" width="3" height="1" fill="#b8860b" />
          <rect x="17" y="23" width="3" height="1" fill="#b8860b" />
          {/* metallic shine */}
          <rect x="7" y="20" width="2" height="3" fill="#ffd700" opacity="0.5" />
          <rect x="13" y="20" width="2" height="3" fill="#ffd700" opacity="0.5" />
          <rect x="4" y="20" width="1" height="8" fill="rgba(255,215,0,0.3)" />
          {/* gem on chest */}
          <rect x="11" y="21" width="2" height="2" fill="#00bcd4" />
        </g>
      );
      default: return (
        <g>
          <rect x="4" y="20" width="16" height="8" fill={c} />
          <rect x="4" y="27" width="16" height="1" fill="rgba(0,0,0,0.08)" />
        </g>
      );
    }
  };

  const renderNecklace = () => {
    switch (config.necklace) {
      case 'Gold Chain': return <g fill="#fbbf24"><rect x="9" y="19" width="6" height="1" /><rect x="10" y="20" width="4" height="1" /></g>;
      case 'Silver Chain': return <g fill="#e2e8f0"><rect x="9" y="19" width="6" height="1" /><rect x="10" y="20" width="4" height="1" /></g>;
      case 'Pearl': return <g fill="#fff"><rect x="9" y="19" width="1" height="1" /><rect x="11" y="19" width="1" height="1" /><rect x="13" y="19" width="1" height="1" /><rect x="15" y="19" width="1" height="1" /><rect x="10" y="20" width="1" height="1" /><rect x="12" y="20" width="1" height="1" /><rect x="14" y="20" width="1" height="1" /></g>;
      case 'Pendant': return <g><rect x="9" y="19" width="6" height="1" fill="#e2e8f0" /><rect x="11" y="20" width="2" height="2" fill="#3b82f6" /></g>;
      case 'Voxel Chain': return <g><rect x="8" y="19" width="8" height="1" fill={`url(#${uid}custom)`} /><rect x="10" y="20" width="4" height="2" fill={`url(#${uid}custom)`} /></g>;
      default: return null;
    }
  };

  const renderMouthAccessory = () => {
    switch (config.mouthAccessory) {
      case 'Cigar': return <g><rect x="13" y="16" width="4" height="1" fill="#78350f" /><rect x="17" y="16" width="1" height="1" fill="#ef4444" /></g>;
      case 'Cigarette': return <g><rect x="13" y="16" width="3" height="1" fill="#fff" /><rect x="16" y="16" width="1" height="1" fill="#f97316" /></g>;
      case 'Pipe': return <g><rect x="13" y="16" width="4" height="1" fill="#451a03" /><rect x="16" y="15" width="2" height="2" fill="#451a03" /></g>;
      case 'Bubblegum': return <rect x="12" y="14" width="4" height="4" rx="2" fill="#f472b6" opacity="0.9" />;
      case 'Medical Mask': return <g><rect x="8" y="14" width="8" height="4" fill="#bae6fd" /><rect x="6" y="14" width="2" height="1" fill="#e0f2fe" /><rect x="16" y="14" width="2" height="1" fill="#e0f2fe" /></g>;
      default: return null;
    }
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
              <motion.rect key={`lt${i}`} x="8" y="13" width="1" height="1" fill="#60a5fa"
                animate={{ y: [0, 5], opacity: [0, 1, 0] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.4, ease: 'easeIn' }} />
            ))}
            {/* Right eye tears */}
            {[0, 1, 2].map(i => (
              <motion.rect key={`rt${i}`} x="15" y="13" width="1" height="1" fill="#60a5fa"
                animate={{ y: [0, 5], opacity: [0, 1, 0] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.4 + 0.2, ease: 'easeIn' }} />
            ))}
          </g>
        );
      case 'love':
        return <g>{[0, 1, 2].map(i => (<motion.rect key={i} x={8 + i * 3} y="5" width="2" height="2" fill="#ef4444" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1, 0], y: [0, -5], opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 2, delay: i * 0.6 }} />))}</g>;
      case 'money':
        return <g>{[0, 1, 2, 3, 4].map(i => (<motion.text key={i} x={4 + i * 4} y="-5" fontSize="4" fill="#22c55e" animate={{ y: [0, 30], opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 2, delay: i * 0.4 }}>$</motion.text>))}</g>;
      case 'sleepy': {
        const zDefs = [
          { x: 15, y: 7,   tx: 17.5, ty: -3,  size: 2.5, delay: 0   },
          { x: 16.5, y: 6, tx: 20,   ty: -2,  size: 3.8, delay: 1.3 },
          { x: 13.5, y: 8, tx: 16,   ty: -0.5,size: 2,   delay: 2.6 },
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
        return <motion.rect x="11" y="2" width="2" height="4" fill="#eab308" animate={{ opacity: [0, 1, 0], scaleY: [0.5, 1.5, 0.5] }} transition={{ repeat: Infinity, duration: 0.2 }} style={{ transformOrigin: '12px 4px' }} />;
      case 'jackpot':
        return <g>{[0, 1, 2, 3, 4, 5].map(i => (<motion.rect key={i} x={4 + i * 3} y="-3" width="1" height="1" fill="#eab308" animate={{ y: [0, 30], opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }} />))}</g>;
      case 'think':
        return <g><motion.rect x="18" y="5" width="4" height="4" rx="1" fill="white" stroke="#d4d4d8" strokeWidth="0.3" animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2 }} /><rect x="17" y="8" width="1" height="1" rx="0.5" fill="white" stroke="#d4d4d8" strokeWidth="0.3" /><text x="18.5" y="8.5" fontSize="3" fill="#71717a">?</text></g>;
      case 'king':
        return <g fill="#fbbf24"><rect x="7" y="3" width="10" height="3" /><rect x="5" y="3" width="2" height="2" /><rect x="11" y="2" width="2" height="2" /><rect x="17" y="3" width="2" height="2" /><rect x="9" y="4" width="1" height="1" fill="#ef4444" /><rect x="14" y="4" width="1" height="1" fill="#3b82f6" /></g>;
      case 'chips':
        return <g><rect x="18" y="16" width="4" height="1" fill="#ef4444" rx="0.5" /><rect x="18" y="14.5" width="4" height="1" fill="#3b82f6" rx="0.5" /><rect x="18" y="13" width="4" height="1" fill="#22c55e" rx="0.5" /><rect x="2" y="16" width="4" height="1" fill="#3b82f6" rx="0.5" /><rect x="2" y="14.5" width="4" height="1" fill="#ef4444" rx="0.5" /></g>;
      case 'cards':
        return <g><motion.g animate={{ rotate: [-5, 5, -5] }} transition={{ repeat: Infinity, duration: 2 }} style={{ transformOrigin: '20px 15px' }}><rect x="18" y="12" width="4" height="6" fill="white" stroke="#d4d4d8" strokeWidth="0.2" rx="0.5" /><rect x="19" y="13" width="2" height="4" fill="#ef4444" opacity="0.2" /></motion.g><motion.g animate={{ rotate: [5, -5, 5] }} transition={{ repeat: Infinity, duration: 2 }} style={{ transformOrigin: '4px 15px' }}><rect x="2" y="12" width="4" height="6" fill="white" stroke="#d4d4d8" strokeWidth="0.2" rx="0.5" /><rect x="3" y="13" width="2" height="4" fill="#000" opacity="0.2" /></motion.g></g>;
      case 'dice':
        return <motion.g animate={{ x: [0, 2, -2, 0], y: [0, -2, 0], rotate: [0, 90, 180, 270, 360] }} transition={{ repeat: Infinity, duration: 1 }} style={{ transformOrigin: '20px 18px' }}><rect x="18" y="16" width="4" height="4" fill="white" rx="0.5" /><circle cx="19" cy="17" r="0.5" fill="black" /><circle cx="21" cy="19" r="0.5" fill="black" /></motion.g>;
      case 'ninja':
        return <motion.g animate={{ x: [0, 20, -20, 0] }} transition={{ duration: 0.5 }}><rect x="19" y="10" width="1" height="8" fill="#71717a" /><rect x="18" y="17" width="3" height="1" fill="#18181b" /></motion.g>;
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
        viewBox="0 0 24 28"
        className="w-full h-full absolute top-0 left-0"
        shapeRendering="geometricPrecision"
      >
        <defs>
          {/* Decorative patterns — instance-scoped via uid prefix */}
          <AvatarPatternDefs prefix={uid} />
          <mask id={`${uid}faceMask`}>
            {renderFaceShape('white')}
          </mask>
          <radialGradient id={`${uid}angryGradient`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(239,68,68,0.4)" /><stop offset="100%" stopColor="rgba(239,68,68,0)" />
          </radialGradient>
          <radialGradient id={`${uid}sickGradient`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(34,197,94,0.4)" /><stop offset="100%" stopColor="rgba(34,197,94,0)" />
          </radialGradient>
          {config.customPattern && (
            <pattern id={`${uid}custom`} patternUnits="userSpaceOnUse" width="8" height="8">
              <image href={config.customPattern} x="0" y="0" width="8" height="8" preserveAspectRatio="xMidYMid slice" />
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
        {config.backgroundImage && (
          bgGradDef
            ? <rect x="0" y="0" width="24" height="28" fill={`url(#${uid}grad_bg)`} />
            : <image href={config.backgroundImage} x="0" y="0" width="24" height="28" preserveAspectRatio="xMidYMid slice" />
        )}

        {/* Breathing idle animation wrapper */}
        <motion.g
          animate={{ scaleY: [1, 1.01, 1], y: [0, -0.1, 0], rotate: [0, 0.5, -0.5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: '12px 28px' }}
        >
          <motion.g animate={emotion} variants={bodyVariants} style={{ transformOrigin: '12px 24px' }}>

            {/* Shirt */}
            {renderShirtBody()}
            <rect x="10" y="18" width="4" height="2" fill={skinFill.fill} />
            <rect x="10" y="18" width="4" height="1" fill="rgba(0,0,0,0.15)" />

            {renderNecklace()}

            {/* Hair back */}
            <motion.g animate={{ y: offsets.head.y }}>
              {config.hat === 'None' && renderHairBack()}
            </motion.g>

            {/* Ears */}
            <motion.g animate={{ x: -offsets.ears.x, y: offsets.ears.y }}>
              <rect x="4" y="11" width="4" height="3" fill={skinFill.fill} />
              <rect x="4" y="12" width="4" height="1" fill="rgba(0,0,0,0.1)" />
            </motion.g>
            <motion.g animate={{ x: offsets.ears.x, y: offsets.ears.y }}>
              <rect x="16" y="11" width="4" height="3" fill={skinFill.fill} />
              <rect x="16" y="12" width="4" height="1" fill="rgba(0,0,0,0.1)" />
            </motion.g>

            {/* Face shape */}
            {renderFaceShape(skinFill.fill)}

            {/* Emotion face overlays */}
            {emotion === 'angry' && <g mask={`url(#${uid}faceMask)`}>{renderFaceShape(`url(#${uid}angryGradient)`)}</g>}
            {emotion === 'sick'  && <g mask={`url(#${uid}faceMask)`}>{renderFaceShape(`url(#${uid}sickGradient)`)}</g>}

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
                {renderEyes()}
                <motion.g animate={{ y: offsets.nose.y - offsets.eyes.y }}>
                  {renderNose()}
                </motion.g>
                <motion.g
                  animate={{
                    ...(mouthVariants[emotion as keyof typeof mouthVariants] as object),
                    y: ((mouthVariants[emotion as keyof typeof mouthVariants] as { y?: number })?.y ?? 0) + (offsets.mouth.y - offsets.eyes.y),
                  }}
                  style={{ transformOrigin: '12px 16.5px' }}
                >
                  {renderLips()}
                </motion.g>
                <motion.g animate={{ y: offsets.mouth.y - offsets.eyes.y }}>
                  {renderMouthAccessory()}
                </motion.g>
              </motion.g>
            </motion.g>

            {/* Accessories (glasses drop-in) */}
            <motion.g
              key={`glasses-${glassesAnimationKey}`}
              initial={glassesAnimationKey > 0 ? { y: -30, opacity: 0, rotate: -10 } : false}
              animate={{ y: offsets.eyes.y, x: offsets.eyes.x, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 10, stiffness: 100, delay: glassesAnimationKey > 0 ? 0.1 : 0 }}
              style={{ transformOrigin: '12px 12px' }}
            >
              {renderAccessories()}
            </motion.g>
          </motion.g>
        </motion.g>

        {/* Overlay — voxel-painted layer on top of everything, no animation */}
        {config.overlayImage && (
          <image
            href={config.overlayImage}
            x="0" y="0" width="24" height="28"
            preserveAspectRatio="xMidYMid meet"
          />
        )}
      </svg>
    </div>
  );
}
