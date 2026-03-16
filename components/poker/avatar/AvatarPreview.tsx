'use client';

import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import { motion } from 'framer-motion';

export type Emotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'wink';

export default function AvatarPreview({
  config,
  emotion = 'neutral',
  glassesAnimationKey = 0,
  compact = false,
  className,
}: {
  config: AvatarConfig;
  emotion?: Emotion;
  glassesAnimationKey?: number;
  compact?: boolean;
  className?: string;
}) {
  const { skinColor, hairStyle, hairColor, eyeShape, eyeColor, noseShape, lipShape, accessory } = config;

  const eyeVariants = {
    neutral: { scaleY: 1, y: 0 },
    happy: { scaleY: 0.3, y: 0 },
    sad: { scaleY: 0.8, y: 0.5 },
    angry: { scaleY: 0.7, y: 0 },
    surprised: { scaleY: 1.3, y: -0.5 },
    wink: { scaleY: 1, y: 0 }
  };

  const rightEyeVariants = {
    neutral: { scaleY: 1, y: 0 },
    happy: { scaleY: 0.3, y: 0 },
    sad: { scaleY: 0.8, y: 0.5 },
    angry: { scaleY: 0.7, y: 0 },
    surprised: { scaleY: 1.3, y: -0.5 },
    wink: { scaleY: 0.1, y: 0 }
  };

  const eyebrowLeftVariants = {
    neutral: { y: 0, rotate: 0 },
    happy: { y: -1, rotate: 0 },
    sad: { y: 0, rotate: -15 },
    angry: { y: 1, rotate: 15 },
    surprised: { y: -1.5, rotate: 0 },
    wink: { y: 0, rotate: 0 }
  };

  const eyebrowRightVariants = {
    neutral: { y: 0, rotate: 0 },
    happy: { y: -1, rotate: 0 },
    sad: { y: 0, rotate: 15 },
    angry: { y: 1, rotate: -15 },
    surprised: { y: -1.5, rotate: 0 },
    wink: { y: 1, rotate: -10 }
  };

  const mouthVariants = {
    neutral: { scaleY: 1, scaleX: 1, y: 0 },
    happy: { scaleY: 1.2, scaleX: 1.2, y: -0.5 },
    sad: { scaleY: -1, scaleX: 1, y: 1 },
    angry: { scaleY: 0.6, scaleX: 0.9, y: 0 },
    surprised: { scaleY: 2, scaleX: 0.6, y: 1 },
    wink: { scaleY: 1, scaleX: 1.1, y: -0.5, x: 0.5 }
  };

  const faceGroupVariants = {
    neutral: { y: 0, x: 0 },
    happy: { y: -0.5, x: 0 },
    sad: { y: 0.5, x: 0 },
    angry: { x: [-0.5, 0.5, -0.5, 0.5, 0], y: 0, transition: { duration: 0.4 } },
    surprised: { y: -1, x: 0 },
    wink: { y: 0, x: 0 }
  };

  const renderHairBack = () => {
    switch (hairStyle) {
      case 'Long Straight':
        return <rect x="4" y="8" width="16" height="12" fill={hairColor} />;
      case 'Long Wavy':
        return (
          <g fill={hairColor}>
            <rect x="4" y="8" width="16" height="12" />
            <rect x="3" y="10" width="1" height="2" />
            <rect x="3" y="14" width="1" height="2" />
            <rect x="3" y="18" width="1" height="2" />
            <rect x="20" y="10" width="1" height="2" />
            <rect x="20" y="14" width="1" height="2" />
            <rect x="20" y="18" width="1" height="2" />
          </g>
        );
      case 'Bob':
        return <rect x="4" y="8" width="16" height="7" fill={hairColor} />;
      case 'Ponytail':
        return (
          <g fill={hairColor}>
            <rect x="18" y="9" width="4" height="3" />
            <rect x="22" y="10" width="1" height="1" />
          </g>
        );
      case 'Dreadlocks':
        return (
          <g fill={hairColor}>
            <rect x="3" y="8" width="2" height="10" />
            <rect x="19" y="8" width="2" height="10" />
            <rect x="5" y="8" width="2" height="12" />
            <rect x="17" y="8" width="2" height="12" />
          </g>
        );
      case 'Afro':
        return (
          <g fill={hairColor}>
            <rect x="2" y="4" width="20" height="12" rx="4" />
          </g>
        );
      case 'Mullet':
        return <rect x="4" y="12" width="16" height="6" fill={hairColor} />;
      case 'Pigtails':
        return (
          <g fill={hairColor}>
            <rect x="2" y="9" width="3" height="6" />
            <rect x="19" y="9" width="3" height="6" />
          </g>
        );
      default:
        return null;
    }
  };

  const renderHairFront = () => {
    switch (hairStyle) {
      case 'Short':
        return (
          <g fill={hairColor}>
            <rect x="5" y="6" width="14" height="2" />
            <rect x="5" y="8" width="1" height="2" />
            <rect x="18" y="8" width="1" height="2" />
          </g>
        );
      case 'Buzz':
        return <rect x="6" y="7" width="12" height="1" fill={hairColor} opacity="0.8" />;
      case 'Curly':
        return (
          <g fill={hairColor}>
            <rect x="4" y="5" width="16" height="3" />
            <rect x="3" y="6" width="18" height="3" />
            <rect x="4" y="9" width="2" height="2" />
            <rect x="18" y="9" width="2" height="2" />
          </g>
        );
      case 'Spiky':
        return (
          <g fill={hairColor}>
            <rect x="5" y="6" width="14" height="2" />
            <rect x="6" y="4" width="1" height="2" />
            <rect x="9" y="3" width="1" height="3" />
            <rect x="12" y="4" width="1" height="2" />
            <rect x="15" y="3" width="1" height="3" />
            <rect x="17" y="5" width="1" height="1" />
          </g>
        );
      case 'Fade':
        return (
          <g>
            <rect x="6" y="6" width="12" height="2" fill={hairColor} />
            <rect x="5" y="8" width="1" height="3" fill={skinColor} opacity="0.5" />
            <rect x="18" y="8" width="1" height="3" fill={skinColor} opacity="0.5" />
          </g>
        );
      case 'Mohawk':
        return (
          <g fill={hairColor}>
            <rect x="10" y="2" width="4" height="6" />
            <rect x="11" y="1" width="2" height="1" />
          </g>
        );
      case 'Dreadlocks':
        return (
          <g fill={hairColor}>
            <rect x="5" y="5" width="14" height="3" />
            <rect x="4" y="8" width="2" height="4" />
            <rect x="18" y="8" width="2" height="4" />
            <rect x="6" y="8" width="2" height="2" />
            <rect x="16" y="8" width="2" height="2" />
          </g>
        );
      case 'Afro':
        return (
          <g fill={hairColor}>
            <rect x="4" y="4" width="16" height="4" />
            <rect x="3" y="5" width="18" height="4" />
          </g>
        );
      case 'Mullet':
        return (
          <g fill={hairColor}>
            <rect x="5" y="6" width="14" height="2" />
            <rect x="5" y="8" width="1" height="2" />
            <rect x="18" y="8" width="1" height="2" />
          </g>
        );
      case 'Pigtails':
        return (
          <g fill={hairColor}>
            <rect x="5" y="6" width="14" height="2" />
            <rect x="4" y="8" width="2" height="2" />
            <rect x="18" y="8" width="2" height="2" />
          </g>
        );
      case 'Messy':
        return (
          <g fill={hairColor}>
            <rect x="4" y="5" width="16" height="3" />
            <rect x="5" y="4" width="4" height="1" />
            <rect x="12" y="3" width="3" height="2" />
            <rect x="17" y="4" width="2" height="2" />
            <rect x="3" y="7" width="2" height="3" />
            <rect x="19" y="6" width="2" height="4" />
            <rect x="6" y="8" width="1" height="2" />
            <rect x="17" y="8" width="1" height="2" />
          </g>
        );
      case 'Ponytail':
      case 'Long Straight':
      case 'Long Wavy':
      case 'Bob':
        return (
          <g fill={hairColor}>
            <rect x="5" y="6" width="14" height="2" />
            <rect x="5" y="8" width="2" height="3" />
            <rect x="17" y="8" width="2" height="3" />
          </g>
        );
      case 'Bald':
      default:
        return null;
    }
  };

  const renderEyes = () => {
    const renderEye = (x: number) => {
      switch (eyeShape) {
        case 'Round':
          return (
            <g>
              <rect x={x} y="11" width="2" height="2" fill="white" />
              <rect x={x+1} y="11" width="1" height="1" fill={eyeColor} />
            </g>
          );
        case 'Almond':
          return (
            <g>
              <rect x={x-1} y="11" width="3" height="1" fill="white" />
              <rect x={x} y="11" width="1" height="1" fill={eyeColor} />
            </g>
          );
        case 'Narrow':
          return (
            <g>
              <rect x={x-1} y="12" width="3" height="1" fill="white" />
              <rect x={x} y="12" width="1" height="1" fill={eyeColor} />
            </g>
          );
        case 'Wide':
          return (
            <g>
              <rect x={x-1} y="11" width="3" height="2" fill="white" />
              <rect x={x} y="11" width="2" height="2" fill={eyeColor} />
            </g>
          );
        default:
          return null;
      }
    };

    return (
      <g>
        <motion.rect animate={emotion} variants={eyebrowLeftVariants} style={{ transformOrigin: "8.5px 9.5px" }} x="7" y="9" width="3" height="1" fill={hairColor} />
        <motion.rect animate={emotion} variants={eyebrowRightVariants} style={{ transformOrigin: "15.5px 9.5px" }} x="14" y="9" width="3" height="1" fill={hairColor} />
        <motion.g animate={emotion} variants={eyeVariants} style={{ transformOrigin: "9px 11.5px" }}>
          {renderEye(8)}
        </motion.g>
        <motion.g animate={emotion} variants={rightEyeVariants} style={{ transformOrigin: "15px 11.5px" }}>
          {renderEye(14)}
        </motion.g>
      </g>
    );
  };

  const renderNose = () => {
    switch (noseShape) {
      case 'Small':
        return <rect x="11" y="14" width="2" height="1" fill="rgba(0,0,0,0.15)" />;
      case 'Wide':
        return <rect x="10" y="14" width="4" height="1" fill="rgba(0,0,0,0.15)" />;
      case 'Pointy':
        return <rect x="11" y="13" width="2" height="2" fill="rgba(0,0,0,0.15)" />;
      case 'Button':
        return <rect x="11" y="14" width="2" height="2" fill="rgba(0,0,0,0.15)" />;
      default:
        return null;
    }
  };

  const renderLips = () => {
    switch (lipShape) {
      case 'Thin':
        return <rect x="10" y="16" width="4" height="1" fill="rgba(0,0,0,0.4)" />;
      case 'Full':
        return <rect x="10" y="16" width="4" height="2" fill="rgba(180,50,50,0.7)" />;
      case 'Smile':
        return (
          <g fill="rgba(0,0,0,0.6)">
            <rect x="10" y="17" width="4" height="1" />
            <rect x="9" y="16" width="1" height="1" />
            <rect x="14" y="16" width="1" height="1" />
          </g>
        );
      case 'Smirk':
        return (
          <g fill="rgba(0,0,0,0.6)">
            <rect x="10" y="17" width="4" height="1" />
            <rect x="14" y="16" width="1" height="1" />
          </g>
        );
      case 'Pout':
        return <rect x="11" y="16" width="2" height="1" fill="rgba(180,50,50,0.7)" />;
      default:
        return null;
    }
  };

  const renderAccessories = () => {
    switch (accessory) {
      case 'Glasses':
        return (
          <g fill="#333">
            <rect x="6" y="10" width="5" height="1" />
            <rect x="6" y="13" width="5" height="1" />
            <rect x="6" y="11" width="1" height="2" />
            <rect x="10" y="11" width="1" height="2" />
            <rect x="13" y="10" width="5" height="1" />
            <rect x="13" y="13" width="5" height="1" />
            <rect x="13" y="11" width="1" height="2" />
            <rect x="17" y="11" width="1" height="2" />
            <rect x="11" y="11" width="2" height="1" />
            <rect x="4" y="11" width="2" height="1" />
            <rect x="18" y="11" width="2" height="1" />
          </g>
        );
      case 'Sunglasses':
        return (
          <g fill="rgba(0,0,0,0.85)">
            <rect x="6" y="10" width="5" height="4" />
            <rect x="13" y="10" width="5" height="4" />
            <rect x="11" y="11" width="2" height="1" />
            <rect x="4" y="11" width="2" height="1" />
            <rect x="18" y="11" width="2" height="1" />
          </g>
        );
      case 'Aviators':
        return (
          <g fill="rgba(0,0,0,0.85)">
            <rect x="5" y="10" width="6" height="4" />
            <rect x="6" y="14" width="4" height="1" />
            <rect x="13" y="10" width="6" height="4" />
            <rect x="14" y="14" width="4" height="1" />
            <rect x="11" y="10" width="2" height="1" />
            <rect x="4" y="10" width="1" height="1" />
            <rect x="19" y="10" width="1" height="1" />
          </g>
        );
      case 'Wayfarers':
        return (
          <g fill="#111">
            <rect x="5" y="9" width="6" height="2" />
            <rect x="13" y="9" width="6" height="2" />
            <rect x="6" y="11" width="4" height="3" />
            <rect x="14" y="11" width="4" height="3" />
            <rect x="11" y="10" width="2" height="1" />
            <rect x="4" y="10" width="1" height="1" />
            <rect x="19" y="10" width="1" height="1" />
          </g>
        );
      case 'Round Glasses':
        return (
          <g fill="#333">
            <rect x="6" y="9" width="4" height="1" />
            <rect x="6" y="14" width="4" height="1" />
            <rect x="5" y="10" width="1" height="4" />
            <rect x="10" y="10" width="1" height="4" />
            <rect x="14" y="9" width="4" height="1" />
            <rect x="14" y="14" width="4" height="1" />
            <rect x="13" y="10" width="1" height="4" />
            <rect x="18" y="10" width="1" height="4" />
            <rect x="11" y="11" width="2" height="1" />
            <rect x="4" y="11" width="1" height="1" />
            <rect x="19" y="11" width="1" height="1" />
            <rect x="6" y="10" width="4" height="4" fill="rgba(0,0,0,0.6)" />
            <rect x="14" y="10" width="4" height="4" fill="rgba(0,0,0,0.6)" />
          </g>
        );
      case 'Cyberpunk':
        return (
          <g>
            <rect x="4" y="10" width="16" height="3" fill="#00ffcc" opacity="0.8" />
            <rect x="4" y="10" width="16" height="1" fill="#ff00ff" opacity="0.8" />
            <rect x="4" y="11" width="1" height="2" fill="#111" />
            <rect x="19" y="11" width="1" height="2" fill="#111" />
          </g>
        );
      case 'Earrings':
        return (
          <g fill="#FFD700">
            <rect x="4" y="13" width="1" height="1" />
            <rect x="19" y="13" width="1" height="1" />
          </g>
        );
      case 'Headband':
        return <rect x="5" y="7" width="14" height="2" fill="#E11D48" />;
      case 'None':
      default:
        return null;
    }
  };

  const renderHat = () => {
    switch (config.hat) {
      case 'Cap':
        return (
          <g>
            <rect x="6" y="4" width="12" height="4" fill="#ef4444" />
            <rect x="6" y="7" width="16" height="1" fill="#ef4444" />
          </g>
        );
      case 'Beanie':
        return (
          <g>
            <rect x="5" y="4" width="14" height="5" rx="2" fill="#3b82f6" />
            <rect x="5" y="8" width="14" height="2" fill="#2563eb" />
          </g>
        );
      case 'Top Hat':
        return (
          <g>
            <rect x="7" y="0" width="10" height="8" fill="#111" />
            <rect x="4" y="8" width="16" height="1" fill="#111" />
            <rect x="7" y="6" width="10" height="2" fill="#dc2626" />
          </g>
        );
      case 'Cowboy':
        return (
          <g>
            <rect x="7" y="2" width="10" height="5" fill="#78350f" />
            <rect x="3" y="7" width="18" height="2" fill="#78350f" />
          </g>
        );
      case 'Crown':
        return (
          <g fill="#fbbf24">
            <rect x="5" y="4" width="14" height="4" />
            <rect x="5" y="2" width="2" height="2" />
            <rect x="11" y="2" width="2" height="2" />
            <rect x="17" y="2" width="2" height="2" />
          </g>
        );
      case 'Bandana':
        return (
          <g fill="#ef4444">
            <rect x="5" y="6" width="14" height="3" />
            <rect x="18" y="7" width="2" height="4" />
          </g>
        );
      default:
        return null;
    }
  };

  const renderNecklace = () => {
    switch (config.necklace) {
      case 'Gold Chain':
        return (
          <g fill="#fbbf24">
            <rect x="9" y="19" width="6" height="1" />
            <rect x="10" y="20" width="4" height="1" />
          </g>
        );
      case 'Silver Chain':
        return (
          <g fill="#e2e8f0">
            <rect x="9" y="19" width="6" height="1" />
            <rect x="10" y="20" width="4" height="1" />
          </g>
        );
      case 'Pearl':
        return (
          <g fill="#fff">
            <rect x="9" y="19" width="1" height="1" />
            <rect x="11" y="19" width="1" height="1" />
            <rect x="13" y="19" width="1" height="1" />
            <rect x="15" y="19" width="1" height="1" />
            <rect x="10" y="20" width="1" height="1" />
            <rect x="12" y="20" width="1" height="1" />
            <rect x="14" y="20" width="1" height="1" />
          </g>
        );
      case 'Pendant':
        return (
          <g>
            <rect x="9" y="19" width="6" height="1" fill="#e2e8f0" />
            <rect x="11" y="20" width="2" height="2" fill="#3b82f6" />
          </g>
        );
      default:
        return null;
    }
  };

  const renderMouthAccessory = () => {
    switch (config.mouthAccessory) {
      case 'Cigar':
        return (
          <g>
            <rect x="13" y="16" width="4" height="1" fill="#78350f" />
            <rect x="17" y="16" width="1" height="1" fill="#ef4444" />
          </g>
        );
      case 'Cigarette':
        return (
          <g>
            <rect x="13" y="16" width="3" height="1" fill="#fff" />
            <rect x="16" y="16" width="1" height="1" fill="#f97316" />
          </g>
        );
      case 'Pipe':
        return (
          <g>
            <rect x="13" y="16" width="4" height="1" fill="#451a03" />
            <rect x="16" y="15" width="2" height="2" fill="#451a03" />
          </g>
        );
      case 'Bubblegum':
        return <rect x="12" y="14" width="4" height="4" rx="2" fill="#f472b6" opacity="0.9" />;
      case 'Medical Mask':
        return (
          <g>
            <rect x="8" y="14" width="8" height="4" fill="#bae6fd" />
            <rect x="6" y="14" width="2" height="1" fill="#e0f2fe" />
            <rect x="16" y="14" width="2" height="1" fill="#e0f2fe" />
          </g>
        );
      default:
        return null;
    }
  };

  const sizeClass = compact ? 'w-10 h-10' : 'w-64 h-64';

  return (
    <div className={`relative overflow-hidden flex items-end justify-center ${sizeClass} ${className ?? ''}`} style={{ imageRendering: 'pixelated' }}>
      <svg viewBox="0 0 24 24" className="w-full h-full absolute top-0 left-0" shapeRendering="crispEdges">
        <defs>
          <pattern id="tiger" patternUnits="userSpaceOnUse" width="4" height="4">
            <rect width="4" height="4" fill="#f97316" />
            <rect x="0" y="1" width="2" height="1" fill="#000" />
            <rect x="2" y="3" width="2" height="1" fill="#000" />
          </pattern>
          <pattern id="zebra" patternUnits="userSpaceOnUse" width="4" height="4">
            <rect width="4" height="4" fill="#fff" />
            <rect x="0" y="0" width="1" height="4" fill="#000" />
            <rect x="2" y="0" width="1" height="4" fill="#000" />
          </pattern>
          <pattern id="leopard" patternUnits="userSpaceOnUse" width="4" height="4">
            <rect width="4" height="4" fill="#facc15" />
            <rect x="0" y="0" width="1" height="1" fill="#78350f" />
            <rect x="2" y="2" width="1" height="1" fill="#78350f" />
          </pattern>
          <pattern id="camo" patternUnits="userSpaceOnUse" width="4" height="4">
            <rect width="4" height="4" fill="#4d7c0f" />
            <rect x="0" y="0" width="2" height="1" fill="#14532d" />
            <rect x="2" y="2" width="2" height="1" fill="#78350f" />
            <rect x="1" y="3" width="2" height="1" fill="#14532d" />
          </pattern>
          <linearGradient id="rainbow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="20%" stopColor="#f97316" />
            <stop offset="40%" stopColor="#eab308" />
            <stop offset="60%" stopColor="#22c55e" />
            <stop offset="80%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <pattern id="galaxy" patternUnits="userSpaceOnUse" width="4" height="4">
            <rect width="4" height="4" fill="#0f172a" />
            <rect x="1" y="0" width="1" height="1" fill="#fff" />
            <rect x="3" y="2" width="1" height="1" fill="#c084fc" />
            <rect x="0" y="3" width="1" height="1" fill="#38bdf8" />
          </pattern>
          <pattern id="checkerboard" patternUnits="userSpaceOnUse" width="2" height="2">
            <rect width="2" height="2" fill="#fff" />
            <rect x="0" y="0" width="1" height="1" fill="#000" />
            <rect x="1" y="1" width="1" height="1" fill="#000" />
          </pattern>
        </defs>
        {config.backgroundImage && (
          <image href={config.backgroundImage} x="0" y="0" width="24" height="24" preserveAspectRatio="xMidYMid slice" />
        )}
        <rect x="4" y="20" width="16" height="4" fill={config.shirtColor || '#3f3f46'} />
        <rect x="9" y="20" width="6" height="1" fill="rgba(0,0,0,0.2)" />
        <rect x="10" y="21" width="4" height="1" fill="rgba(0,0,0,0.2)" />
        <rect x="10" y="18" width="4" height="2" fill={skinColor} />
        <rect x="10" y="18" width="4" height="1" fill="rgba(0,0,0,0.15)" />
        {renderNecklace()}
        {renderHairBack()}
        <rect x="4" y="11" width="2" height="3" fill={skinColor} />
        <rect x="18" y="11" width="2" height="3" fill={skinColor} />
        <rect x="4" y="12" width="2" height="1" fill="rgba(0,0,0,0.1)" />
        <rect x="18" y="12" width="2" height="1" fill="rgba(0,0,0,0.1)" />
        <rect x="6" y="8" width="12" height="10" fill={skinColor} />
        <rect x="6" y="8" width="12" height="1" fill="rgba(0,0,0,0.1)" />
        {renderHairFront()}
        <motion.g animate={emotion} variants={faceGroupVariants}>
          {renderEyes()}
          {renderNose()}
          <motion.g animate={emotion} variants={mouthVariants} style={{ transformOrigin: "12px 16.5px" }}>
            {renderLips()}
          </motion.g>
          {renderMouthAccessory()}
        </motion.g>
        <motion.g
          key={`glasses-${glassesAnimationKey}`}
          initial={glassesAnimationKey > 0 ? { y: -30, opacity: 0, rotate: -10 } : false}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 10, stiffness: 100, delay: glassesAnimationKey > 0 ? 0.1 : 0 }}
          style={{ transformOrigin: "12px 12px" }}
        >
          {renderAccessories()}
        </motion.g>
        {renderHat()}
      </svg>
      {!compact && (
        <div className="absolute bottom-4 right-4 text-4xl drop-shadow-lg bg-zinc-900/40 rounded-lg w-12 h-12 flex items-center justify-center backdrop-blur-sm border border-white/10">
          {config.flag}
        </div>
      )}
    </div>
  );
}
