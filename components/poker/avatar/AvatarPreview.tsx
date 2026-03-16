'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import { motion, useMotionValue, useSpring } from 'framer-motion';

export type Emotion =
  | 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'wink'
  | 'dance' | 'flex' | 'jump' | 'spin' | 'think' | 'love' | 'money'
  | 'sick' | 'cool' | 'sleepy' | 'shock' | 'ghost' | 'ninja' | 'king'
  | 'poker' | 'jackpot' | 'chips' | 'cards' | 'dice';

export default function AvatarPreview({
  config,
  emotion: propEmotion = 'neutral',
  glassesAnimationKey = 0,
  compact = false,
  trackMouse = false,
  forceAsleep = false,
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
        const actions: Emotion[] = ['wink', 'surprised', 'think', 'happy'];
        const action = actions[Math.floor(Math.random() * actions.length)];
        setIdleEmotion(action);
        setTimeout(() => setIdleEmotion(null), 1000 + Math.random() * 1000);
      }
    }, 2000);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      clearInterval(idleInterval);
    };
  }, [compact, isAsleep, propEmotion, idleEmotion, mouseX, mouseY]);

  const { skinColor, hairStyle, hairColor, eyeShape, eyeColor, noseShape, lipShape, accessory } = config;

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
      case 'Long Straight': return <rect x="4" y="8" width="16" height="12" fill={hairColor} />;
      case 'Long Wavy': return <g fill={hairColor}><rect x="4" y="8" width="16" height="12" /><rect x="3" y="10" width="1" height="2" /><rect x="3" y="14" width="1" height="2" /><rect x="3" y="18" width="1" height="2" /><rect x="20" y="10" width="1" height="2" /><rect x="20" y="14" width="1" height="2" /><rect x="20" y="18" width="1" height="2" /></g>;
      case 'Bob': return <rect x="4" y="8" width="16" height="7" fill={hairColor} />;
      case 'Ponytail': return <g fill={hairColor}><rect x="18" y="9" width="4" height="3" /><rect x="22" y="10" width="1" height="1" /></g>;
      case 'Dreadlocks': return <g fill={hairColor}><rect x="3" y="8" width="2" height="10" /><rect x="19" y="8" width="2" height="10" /><rect x="5" y="8" width="2" height="12" /><rect x="17" y="8" width="2" height="12" /></g>;
      case 'Afro': return <g fill={hairColor}><rect x="2" y="4" width="20" height="12" rx="4" /></g>;
      case 'Mullet': return <rect x="4" y="12" width="16" height="6" fill={hairColor} />;
      case 'Pigtails': return <g fill={hairColor}><rect x="2" y="9" width="3" height="6" /><rect x="19" y="9" width="3" height="6" /></g>;
      default: return null;
    }
  };

  const renderHairFront = () => {
    switch (hairStyle) {
      case 'Short': return <g fill={hairColor}><rect x="5" y="6" width="14" height="2" /><rect x="5" y="8" width="1" height="2" /><rect x="18" y="8" width="1" height="2" /></g>;
      case 'Buzz': return <rect x="6" y="7" width="12" height="1" fill={hairColor} opacity="0.8" />;
      case 'Curly': return <g fill={hairColor}><rect x="4" y="5" width="16" height="3" /><rect x="3" y="6" width="18" height="3" /><rect x="4" y="9" width="2" height="2" /><rect x="18" y="9" width="2" height="2" /></g>;
      case 'Spiky': return <g fill={hairColor}><rect x="5" y="6" width="14" height="2" /><rect x="6" y="4" width="1" height="2" /><rect x="9" y="3" width="1" height="3" /><rect x="12" y="4" width="1" height="2" /><rect x="15" y="3" width="1" height="3" /><rect x="17" y="5" width="1" height="1" /></g>;
      case 'Fade': return <g><rect x="6" y="6" width="12" height="2" fill={hairColor} /><rect x="5" y="8" width="1" height="3" fill={skinColor} opacity="0.5" /><rect x="18" y="8" width="1" height="3" fill={skinColor} opacity="0.5" /></g>;
      case 'Mohawk': return <g fill={hairColor}><rect x="10" y="2" width="4" height="6" /><rect x="11" y="1" width="2" height="1" /></g>;
      case 'Dreadlocks': return <g fill={hairColor}><rect x="5" y="5" width="14" height="3" /><rect x="4" y="8" width="2" height="4" /><rect x="18" y="8" width="2" height="4" /><rect x="6" y="8" width="2" height="2" /><rect x="16" y="8" width="2" height="2" /></g>;
      case 'Afro': return <g fill={hairColor}><rect x="4" y="4" width="16" height="4" /><rect x="3" y="5" width="18" height="4" /></g>;
      case 'Mullet': return <g fill={hairColor}><rect x="5" y="6" width="14" height="2" /><rect x="5" y="8" width="1" height="2" /><rect x="18" y="8" width="1" height="2" /></g>;
      case 'Pigtails': return <g fill={hairColor}><rect x="5" y="6" width="14" height="2" /><rect x="4" y="8" width="2" height="2" /><rect x="18" y="8" width="2" height="2" /></g>;
      case 'Messy': return <g fill={hairColor}><rect x="4" y="5" width="16" height="3" /><rect x="5" y="4" width="4" height="1" /><rect x="12" y="3" width="3" height="2" /><rect x="17" y="4" width="2" height="2" /><rect x="3" y="7" width="2" height="3" /><rect x="19" y="6" width="2" height="4" /><rect x="6" y="8" width="1" height="2" /><rect x="17" y="8" width="1" height="2" /></g>;
      case 'Ponytail': case 'Long Straight': case 'Long Wavy': case 'Bob':
        return <g fill={hairColor}><rect x="5" y="6" width="14" height="2" /><rect x="5" y="8" width="2" height="3" /><rect x="17" y="8" width="2" height="3" /></g>;
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
        case 'Round': return <g><rect x={x} y="11" width="2" height="2" fill="white" /><motion.rect x={x + 0.5} y="11.5" width="1" height="1" fill={eyeColor} style={(!compact || trackMouse) ? { x: mouseX, y: mouseY } : {}} /></g>;
        case 'Almond': return <g><rect x={x} y="11" width="3" height="1" fill="white" /><motion.rect x={x + 1} y="11" width="1" height="1" fill={eyeColor} style={(!compact || trackMouse) ? { x: mouseX, y: mouseY } : {}} /></g>;
        case 'Narrow': return <g><rect x={x} y="12" width="3" height="1" fill="white" /><motion.rect x={x + 1} y="12" width="1" height="1" fill={eyeColor} style={(!compact || trackMouse) ? { x: mouseX, y: mouseY } : {}} /></g>;
        case 'Wide': return <g><rect x={x} y="11" width="3" height="2" fill="white" /><motion.rect x={x + 0.5} y="11" width="2" height="2" fill={eyeColor} style={(!compact || trackMouse) ? { x: mouseX, y: mouseY } : {}} /></g>;
        default: return null;
      }
    };

    return (
      <g>
        <motion.rect animate={emotion} variants={eyebrowLeftVariants} style={{ transformOrigin: '8.5px 9.5px' }} x="7" y="9" width="3" height="1" fill={hairColor} />
        <motion.rect animate={emotion} variants={eyebrowRightVariants} style={{ transformOrigin: '15.5px 9.5px' }} x="14" y="9" width="3" height="1" fill={hairColor} />
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
      // Open-mouth O shape: 4×4 dark block
      return <rect x="10" y="15" width="4" height="4" fill="rgba(0,0,0,0.75)" />;
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
    switch (accessory) {
      case 'Glasses': return <g fill="#333"><rect x="6" y="10" width="5" height="1" /><rect x="6" y="13" width="5" height="1" /><rect x="6" y="11" width="1" height="2" /><rect x="10" y="11" width="1" height="2" /><rect x="13" y="10" width="5" height="1" /><rect x="13" y="13" width="5" height="1" /><rect x="13" y="11" width="1" height="2" /><rect x="17" y="11" width="1" height="2" /><rect x="11" y="11" width="2" height="1" /><rect x="4" y="11" width="2" height="1" /><rect x="18" y="11" width="2" height="1" /></g>;
      case 'Sunglasses': return <g fill="rgba(0,0,0,0.85)"><rect x="6" y="10" width="5" height="4" /><rect x="13" y="10" width="5" height="4" /><rect x="11" y="11" width="2" height="1" /><rect x="4" y="11" width="2" height="1" /><rect x="18" y="11" width="2" height="1" /></g>;
      case 'Aviators': return <g fill="rgba(0,0,0,0.85)"><rect x="5" y="10" width="6" height="4" /><rect x="6" y="14" width="4" height="1" /><rect x="13" y="10" width="6" height="4" /><rect x="14" y="14" width="4" height="1" /><rect x="11" y="10" width="2" height="1" /><rect x="4" y="10" width="1" height="1" /><rect x="19" y="10" width="1" height="1" /></g>;
      case 'Wayfarers': return <g fill="#111"><rect x="5" y="9" width="6" height="2" /><rect x="13" y="9" width="6" height="2" /><rect x="6" y="11" width="4" height="3" /><rect x="14" y="11" width="4" height="3" /><rect x="11" y="10" width="2" height="1" /><rect x="4" y="10" width="1" height="1" /><rect x="19" y="10" width="1" height="1" /></g>;
      case 'Round Glasses': return <g fill="#333"><rect x="6" y="9" width="4" height="1" /><rect x="6" y="14" width="4" height="1" /><rect x="5" y="10" width="1" height="4" /><rect x="10" y="10" width="1" height="4" /><rect x="14" y="9" width="4" height="1" /><rect x="14" y="14" width="4" height="1" /><rect x="13" y="10" width="1" height="4" /><rect x="18" y="10" width="1" height="4" /><rect x="11" y="11" width="2" height="1" /><rect x="4" y="11" width="1" height="1" /><rect x="19" y="11" width="1" height="1" /><rect x="6" y="10" width="4" height="4" fill="rgba(0,0,0,0.6)" /><rect x="14" y="10" width="4" height="4" fill="rgba(0,0,0,0.6)" /></g>;
      case 'Cyberpunk': return <g><rect x="4" y="10" width="16" height="3" fill="#00ffcc" opacity="0.8" /><rect x="4" y="10" width="16" height="1" fill="#ff00ff" opacity="0.8" /><rect x="4" y="11" width="1" height="2" fill="#111" /><rect x="19" y="11" width="1" height="2" fill="#111" /></g>;
      case 'Voxel Glasses': return <g><rect x="5" y="10" width="6" height="4" fill="url(#custom)" /><rect x="13" y="10" width="6" height="4" fill="url(#custom)" /><rect x="11" y="11" width="2" height="1" fill="#111" /><rect x="4" y="11" width="1" height="1" fill="#111" /><rect x="19" y="11" width="1" height="1" fill="#111" /></g>;
      case 'Earrings': return <g fill="#FFD700"><rect x="4" y="13" width="1" height="1" /><rect x="19" y="13" width="1" height="1" /></g>;
      case 'Headband': return <rect x="5" y="7" width="14" height="2" fill="#E11D48" />;
      case 'None': default: return null;
    }
  };

  const renderHat = () => {
    switch (config.hat) {
      case 'Cap': return <g><rect x="6" y="4" width="12" height="4" fill="#ef4444" /><rect x="6" y="7" width="16" height="1" fill="#ef4444" /></g>;
      case 'Beanie': return <g><rect x="5" y="4" width="14" height="5" rx="2" fill="#3b82f6" /><rect x="5" y="8" width="14" height="2" fill="#2563eb" /></g>;
      case 'Top Hat': return <g><rect x="7" y="0" width="10" height="8" fill="#111" /><rect x="4" y="8" width="16" height="1" fill="#111" /><rect x="7" y="6" width="10" height="2" fill="#dc2626" /></g>;
      case 'Cowboy': return <g><rect x="7" y="2" width="10" height="5" fill="#78350f" /><rect x="3" y="7" width="18" height="2" fill="#78350f" /></g>;
      case 'Crown': return <g fill="#fbbf24"><rect x="5" y="4" width="14" height="4" /><rect x="5" y="2" width="2" height="2" /><rect x="11" y="2" width="2" height="2" /><rect x="17" y="2" width="2" height="2" /></g>;
      case 'Bandana': return <g fill="#ef4444"><rect x="5" y="6" width="14" height="3" /><rect x="18" y="7" width="2" height="4" /></g>;
      default: return null;
    }
  };

  const renderNecklace = () => {
    switch (config.necklace) {
      case 'Gold Chain': return <g fill="#fbbf24"><rect x="9" y="19" width="6" height="1" /><rect x="10" y="20" width="4" height="1" /></g>;
      case 'Silver Chain': return <g fill="#e2e8f0"><rect x="9" y="19" width="6" height="1" /><rect x="10" y="20" width="4" height="1" /></g>;
      case 'Pearl': return <g fill="#fff"><rect x="9" y="19" width="1" height="1" /><rect x="11" y="19" width="1" height="1" /><rect x="13" y="19" width="1" height="1" /><rect x="15" y="19" width="1" height="1" /><rect x="10" y="20" width="1" height="1" /><rect x="12" y="20" width="1" height="1" /><rect x="14" y="20" width="1" height="1" /></g>;
      case 'Pendant': return <g><rect x="9" y="19" width="6" height="1" fill="#e2e8f0" /><rect x="11" y="20" width="2" height="2" fill="#3b82f6" /></g>;
      case 'Voxel Chain': return <g><rect x="8" y="19" width="8" height="1" fill="url(#custom)" /><rect x="10" y="20" width="4" height="2" fill="url(#custom)" /></g>;
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
    // Allow sleepy Z's even in compact mode so sitting-out players are clearly indicated
    if (compact && emotion !== 'sleepy') return null;
    switch (emotion) {
      case 'sad':
        return (
          <g>
            {/* Left eye tears */}
            {[0, 1, 2].map(i => (
              <motion.rect key={`lt${i}`} x="8" y="13" width="1" height="1" fill="#60a5fa"
                animate={{ y: [13, 18], opacity: [0, 1, 0] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.4, ease: 'easeIn' }} />
            ))}
            {/* Right eye tears */}
            {[0, 1, 2].map(i => (
              <motion.rect key={`rt${i}`} x="15" y="13" width="1" height="1" fill="#60a5fa"
                animate={{ y: [13, 18], opacity: [0, 1, 0] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.4 + 0.2, ease: 'easeIn' }} />
            ))}
          </g>
        );
      case 'love':
        return <g>{[0, 1, 2].map(i => (<motion.rect key={i} x={8 + i * 3} y="5" width="2" height="2" fill="#ef4444" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1, 0], y: [0, -5], opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 2, delay: i * 0.6 }} />))}</g>;
      case 'money':
        return <g>{[0, 1, 2, 3, 4].map(i => (<motion.text key={i} x={4 + i * 4} y="-5" fontSize="4" fill="#22c55e" animate={{ y: [0, 30], opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 2, delay: i * 0.4 }}>$</motion.text>))}</g>;
      case 'sleepy':
        return <g>{[0, 1, 2].map(i => (<motion.text key={i} x="18" y="10" fontSize="4" fill="#3b82f6" animate={{ x: [18, 22], y: [10, 4], scale: [0.5, 1.2], opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 3, delay: i * 1 }}>Z</motion.text>))}</g>;
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

  const sizeClass = compact ? 'w-10 h-10' : 'w-64 h-64';

  return (
    <div
      className={`relative overflow-hidden flex items-end justify-center ${sizeClass} ${className ?? ''}`}
      style={{ imageRendering: 'pixelated' }}
    >
      <svg
        ref={svgRef}
        viewBox="0 0 24 24"
        className="w-full h-full absolute top-0 left-0"
        shapeRendering="crispEdges"
      >
        <defs>
          <pattern id="tiger" patternUnits="userSpaceOnUse" width="4" height="4">
            <rect width="4" height="4" fill="#f97316" /><rect x="0" y="1" width="2" height="1" fill="#000" /><rect x="2" y="3" width="2" height="1" fill="#000" />
          </pattern>
          <pattern id="zebra" patternUnits="userSpaceOnUse" width="4" height="4">
            <rect width="4" height="4" fill="#fff" /><rect x="0" y="0" width="1" height="4" fill="#000" /><rect x="2" y="0" width="1" height="4" fill="#000" />
          </pattern>
          <pattern id="leopard" patternUnits="userSpaceOnUse" width="4" height="4">
            <rect width="4" height="4" fill="#facc15" /><rect x="0" y="0" width="1" height="1" fill="#78350f" /><rect x="2" y="2" width="1" height="1" fill="#78350f" />
          </pattern>
          <pattern id="camo" patternUnits="userSpaceOnUse" width="4" height="4">
            <rect width="4" height="4" fill="#4d7c0f" /><rect x="0" y="0" width="2" height="1" fill="#14532d" /><rect x="2" y="2" width="2" height="1" fill="#78350f" /><rect x="1" y="3" width="2" height="1" fill="#14532d" />
          </pattern>
          <linearGradient id="rainbow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" /><stop offset="20%" stopColor="#f97316" /><stop offset="40%" stopColor="#eab308" /><stop offset="60%" stopColor="#22c55e" /><stop offset="80%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <pattern id="galaxy" patternUnits="userSpaceOnUse" width="4" height="4">
            <rect width="4" height="4" fill="#0f172a" /><rect x="1" y="0" width="1" height="1" fill="#fff" /><rect x="3" y="2" width="1" height="1" fill="#c084fc" /><rect x="0" y="3" width="1" height="1" fill="#38bdf8" />
          </pattern>
          <pattern id="checkerboard" patternUnits="userSpaceOnUse" width="2" height="2">
            <rect width="2" height="2" fill="#fff" /><rect x="0" y="0" width="1" height="1" fill="#000" /><rect x="1" y="1" width="1" height="1" fill="#000" />
          </pattern>
          <mask id="faceMask">
            {renderFaceShape('white')}
          </mask>
          <radialGradient id="angryGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(239,68,68,0.4)" /><stop offset="100%" stopColor="rgba(239,68,68,0)" />
          </radialGradient>
          <radialGradient id="sickGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(34,197,94,0.4)" /><stop offset="100%" stopColor="rgba(34,197,94,0)" />
          </radialGradient>
          {config.customPattern && (
            <pattern id="custom" patternUnits="userSpaceOnUse" width="8" height="8">
              <image href={config.customPattern} x="0" y="0" width="8" height="8" preserveAspectRatio="xMidYMid slice" />
            </pattern>
          )}
        </defs>

        {/* Background — outside all animation wrappers, always static */}
        {config.backgroundImage && (
          <image href={config.backgroundImage} x="0" y="0" width="24" height="24" preserveAspectRatio="xMidYMid slice" />
        )}

        {/* Breathing idle animation wrapper */}
        <motion.g
          animate={{ scaleY: [1, 1.01, 1], y: [0, -0.1, 0], rotate: [0, 0.5, -0.5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: '12px 24px' }}
        >
          <motion.g animate={emotion} variants={bodyVariants} style={{ transformOrigin: '12px 24px' }}>

            {/* Shirt + neck */}
            <rect x="4" y="20" width="16" height="4" fill={config.shirtColor || '#3f3f46'} />
            <rect x="9" y="20" width="6" height="1" fill="rgba(0,0,0,0.2)" />
            <rect x="10" y="21" width="4" height="1" fill="rgba(0,0,0,0.2)" />
            <rect x="10" y="18" width="4" height="2" fill={skinColor} />
            <rect x="10" y="18" width="4" height="1" fill="rgba(0,0,0,0.15)" />

            {renderNecklace()}

            {/* Hair back */}
            <motion.g animate={{ y: offsets.head.y }}>
              {renderHairBack()}
            </motion.g>

            {/* Ears */}
            <motion.g animate={{ x: -offsets.ears.x, y: offsets.ears.y }}>
              <rect x="4" y="11" width="2" height="3" fill={skinColor} />
              <rect x="4" y="12" width="2" height="1" fill="rgba(0,0,0,0.1)" />
            </motion.g>
            <motion.g animate={{ x: offsets.ears.x, y: offsets.ears.y }}>
              <rect x="18" y="11" width="2" height="3" fill={skinColor} />
              <rect x="18" y="12" width="2" height="1" fill="rgba(0,0,0,0.1)" />
            </motion.g>

            {/* Face shape */}
            {renderFaceShape(skinColor)}

            {/* Emotion face overlays */}
            {emotion === 'angry' && <g mask="url(#faceMask)">{renderFaceShape('url(#angryGradient)')}</g>}
            {emotion === 'sick'  && <g mask="url(#faceMask)">{renderFaceShape('url(#sickGradient)')}</g>}

            {/* Emotion particle effects */}
            {renderEmotionEffects()}

            {/* Hair front + hat */}
            <motion.g animate={{ y: offsets.head.y }}>
              {renderHairFront()}
              {renderHat()}
            </motion.g>

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
      </svg>
    </div>
  );
}
