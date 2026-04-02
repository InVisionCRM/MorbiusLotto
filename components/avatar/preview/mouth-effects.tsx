import React from 'react';
import { motion } from 'framer-motion';
import type { AvatarConfig } from '@/lib/websocket-client';

type MouthAccessory = AvatarConfig['mouthAccessory'];

type MouthAccessoryLayerProps = {
  mouthAccessory: MouthAccessory;
  renderBubblegum: () => React.ReactNode;
};

export function MouthAccessoryLayer({
  mouthAccessory,
  renderBubblegum,
}: MouthAccessoryLayerProps) {
  switch (mouthAccessory) {
    case 'Cigar':
      return (
        <g>
          <rect x="26" y="32" width="8" height="2" fill="#78350f" rx={0.35} />
          <rect x="28" y="32.15" width="3.2" height="0.45" rx={0.12} fill="rgba(255,255,255,0.12)" />
          <rect x="26.2" y="32.55" width="6.5" height="0.25" rx={0.08} fill="rgba(0,0,0,0.15)" />
          <motion.rect
            x="34"
            y="32"
            width="2"
            height="2"
            animate={{ fill: ['#ef4444', '#ff6b1a', '#ffdd33', '#ff6b1a', '#ef4444'] }}
            transition={{ repeat: Infinity, duration: 2 + Math.random() * 2, ease: 'easeInOut' }}
          />
        </g>
      );
    case 'Cigarette':
      return (
        <g>
          <rect x="26" y="32" width="6" height="2" fill="#fff" rx={0.3} />
          <rect x="26.5" y="32.18" width="4" height="0.35" rx={0.1} fill="rgba(0,0,0,0.06)" />
          <motion.rect
            x="32"
            y="32"
            width="2"
            height="2"
            animate={{ fill: ['#f97316', '#ff8c1a', '#ffcc33', '#ff8c1a', '#f97316'] }}
            transition={{ repeat: Infinity, duration: 1.5 + Math.random() * 2, ease: 'easeInOut' }}
          />
        </g>
      );
    case 'Pipe':
      return (
        <g>
          <rect x="26" y="32" width="8" height="2" fill="#451a03" rx={0.25} />
          <rect x="26.3" y="32.12" width="5" height="0.4" rx={0.1} fill="rgba(255,255,255,0.08)" />
          <rect x="32" y="30" width="4" height="4" fill="#451a03" rx={0.4} />
          <ellipse cx="34" cy="31.2" rx="1.4" ry="0.55" fill="rgba(255,255,255,0.06)" />
          <motion.rect
            x="32.5"
            y="30.2"
            width="3"
            height="1.2"
            rx="0.4"
            animate={{ fill: ['#ef4444', '#ff6b1a', '#ffcc33', '#ff6b1a', '#ef4444'], opacity: [0.6, 0.9, 0.6] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          />
        </g>
      );
    case 'Bubblegum':
      return <>{renderBubblegum()}</>;
    case 'Medical Mask':
      return (
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
    default:
      return null;
  }
}

type SmokeAccessoryLayerProps = {
  mouthAccessory: MouthAccessory;
  smokePuffing: boolean;
};

export function SmokeAccessoryLayer({ mouthAccessory, smokePuffing }: SmokeAccessoryLayerProps) {
  let originX: number;
  let originY: number;
  let kind: 'cigar' | 'cigarette' | 'pipe';
  switch (mouthAccessory) {
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
    const op = halo ? [0.08, 0.5, 0.35, 0] : [0.15, 0.88, 0.62, 0];
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
}
