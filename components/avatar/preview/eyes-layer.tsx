import React from 'react';
import { motion, type MotionValue, type Variants } from 'framer-motion';
import { avatarMotionOrigin } from '@/lib/avatar-viewbox';
import type { AvatarConfig } from '@/lib/websocket-client';
import type { Emotion } from '../AvatarView';

type EyesLayerProps = {
  compact: boolean;
  trackMouse: boolean;
  roamEyes: boolean;
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
  eyeColor: string;
  emotion: Emotion;
  eyeShape: AvatarConfig['eyeShape'];
  eyebrowLeftVariants: Variants;
  eyebrowRightVariants: Variants;
  eyeVariants: Variants;
  rightEyeVariants: Variants;
  eyebrowFill: string;
  facialHair: AvatarConfig['facialHair'];
};

export function renderEyesLayer({
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
  eyebrowFill,
  facialHair,
}: EyesLayerProps) {
  const eyeTrackStyle = (!compact || trackMouse || roamEyes) ? { x: mouseX, y: mouseY } : {};

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
      case 'Almond':
        return (
          <g>
            <rect x={x} y="22" width="6" height="2" rx={0.84} fill="#fffef8" />
            <rect x={x} y="22" width="6" height="0.9" rx={0.7} fill="rgba(0,0,0,0.09)" />
            <rect x={x + 0.05} y="22.1" width="5.8" height="1.8" rx={0.76} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth={0.16} />
            {pupilGroup(x + 2, 22, 2, 2)}
          </g>
        );
      case 'Narrow':
        return (
          <g>
            <rect x={x} y="24" width="6" height="2" rx={0.8} fill="#fffef8" />
            <rect x={x} y="24" width="6" height="0.9" rx={0.64} fill="rgba(0,0,0,0.09)" />
            <rect x={x + 0.05} y="24.1" width="5.8" height="1.8" rx={0.7} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth={0.16} />
            {pupilGroup(x + 2, 24, 2, 2)}
          </g>
        );
      case 'Wide':
        return (
          <g>
            <rect x={x} y="22" width="6" height="4" rx={0.9} fill="#fffef8" />
            <rect x={x} y="22" width="6" height="1.8" rx={0.7} fill="rgba(0,0,0,0.09)" />
            <rect x={x} y="24" width="6" height="2" rx={0.6} fill="rgba(255,240,200,0.32)" />
            <rect x={x + 0.06} y="22.12" width="5.76" height="3.76" rx={0.8} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth={0.16} />
            {pupilGroup(x + 1, 22, 4, 4, 0.55)}
          </g>
        );
      case 'Eye V1':
        return <g><rect x={x} y="22" width="6" height="4" rx={0.7} fill="#fffef8" /><rect x={x + 0.08} y="22.16" width="5.68" height="3.68" rx={0.6} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth={0.16} />{pupilGroup(x + 2, 23, 2, 2)}</g>;
      case 'Eye V3':
        return <g><rect x={x} y="22" width="4" height="4" rx={0.7} fill="#fffef8" /><rect x={x + 2} y="24" width="2" height="2" rx={0.4} fill="#fffef8" />{pupilGroup(x + 1, 23, 2, 2)}</g>;
      case 'Eye V4':
        return <g><rect x={x} y="22" width="6" height="4" rx={0.7} fill="#fffef8" />{pupilGroup(x + 3, 23, 2, 2)}</g>;
      default:
        return null;
    }
  };

  return (
    <g>
      <motion.g animate={emotion} variants={eyebrowLeftVariants} style={{ transformOrigin: avatarMotionOrigin(17, 19) }}>
        <rect x="14" y="18" width="6" height="2" rx={0.7} fill={eyebrowFill} />
      </motion.g>
      <motion.g animate={emotion} variants={eyebrowRightVariants} style={{ transformOrigin: avatarMotionOrigin(31, 19) }}>
        <rect x="28" y="18" width="6" height="2" rx={0.7} fill={eyebrowFill} />
      </motion.g>
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
      {facialHair === 'Eyelashes' && (
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
}
