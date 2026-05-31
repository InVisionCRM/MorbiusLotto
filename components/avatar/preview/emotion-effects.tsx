import React from 'react';
import { motion } from 'framer-motion';
import { avatarMotionOrigin } from '@/lib/avatar-viewbox';
import type { Emotion } from '../AvatarView';

type EmotionEffectsLayerProps = {
  compact: boolean;
  emotion: Emotion;
};

const CONFETTI = ['#a855f7', '#6366f1', '#fbbf24', '#34d399', '#f472b6', '#22d3ee', '#ef4444'];
// scaled/rotated particles need their own box as the transform origin (SVG default is 0,0)
const SPIN_STYLE: React.CSSProperties = { transformBox: 'fill-box', transformOrigin: 'center' };

/** Confetti burst from the top of the head — varied colors fly out, tumble, and fall. */
function Confetti({ n = 16 }: { n?: number }) {
  return (
    <g>
      {Array.from({ length: n }).map((_, i) => {
        const dx = (i % 2 ? 1 : -1) * (4 + (i * 2.3) % 20);
        const dy = 26 + (i * 3.1) % 26;
        const rot = 220 + (i * 53) % 560;
        return (
          <motion.rect
            key={i} x="23" y="7" width={1.3 + (i % 3) * 0.5} height={1.3 + (i % 2) * 0.7} rx="0.3"
            fill={CONFETTI[i % CONFETTI.length]} style={SPIN_STYLE}
            initial={{ opacity: 0 }}
            animate={{ x: [0, dx * 0.5, dx], y: [0, dy * 0.4, dy], rotate: [0, rot], opacity: [1, 1, 0] }}
            transition={{ repeat: Infinity, duration: 1.4 + (i % 4) * 0.3, delay: (i * 0.06) % 1.1, ease: 'easeOut' }}
          />
        );
      })}
    </g>
  );
}

/** Coins raining down (with a $ face + edge-on spin via rx pulse). */
function Coins({ n = 8 }: { n?: number }) {
  return (
    <g>
      {Array.from({ length: n }).map((_, i) => {
        const cx = 7 + (i * 5.3) % 34;
        return (
          <motion.g
            key={i}
            initial={{ opacity: 0 }}
            animate={{ y: [-8, 58], opacity: [0, 1, 1, 0] }}
            transition={{ repeat: Infinity, duration: 1.6 + (i % 3) * 0.35, delay: (i * 0.19) % 1.5, ease: 'easeIn' }}
          >
            <motion.ellipse
              cx={cx} cy={-4} rx="2.2" ry="2.2" fill="#fcd34d" stroke="#b45309" strokeWidth="0.35" style={SPIN_STYLE}
              animate={{ rx: [2.2, 0.4, 2.2] }} transition={{ repeat: Infinity, duration: 0.7, delay: i * 0.12 }}
            />
            <text x={cx} y={-2.7} fontSize="3" fill="#7c4a02" textAnchor="middle" fontWeight="bold">$</text>
          </motion.g>
        );
      })}
    </g>
  );
}

/** Sparkle ring popping around the head. */
function Sparkles({ n = 5, cy = 13, fill = '#fde047' }: { n?: number; cy?: number; fill?: string }) {
  return (
    <g>
      {Array.from({ length: n }).map((_, i) => {
        const a = (i / n) * Math.PI * 2;
        const x = 24 + Math.cos(a) * 13;
        const y = cy + Math.sin(a) * 7;
        return (
          <motion.text
            key={i} x={x} y={y} fontSize={2.6 + (i % 2) * 1.4} fill={fill} textAnchor="middle" style={SPIN_STYLE}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ scale: [0, 1.25, 0], opacity: [0, 1, 0] }}
            transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.16 + (i % 2) * 0.3 }}
          >✦</motion.text>
        );
      })}
    </g>
  );
}

/** Hearts streaming up. */
function Hearts({ n = 6 }: { n?: number }) {
  return (
    <g>
      {Array.from({ length: n }).map((_, i) => {
        const x = 12 + (i * 5.1) % 26;
        return (
          <motion.text
            key={i} x={x} y="22" fontSize={3.4 + (i % 3) * 1.1} fill={i % 2 ? '#ff4d79' : '#f472b6'} textAnchor="middle" style={SPIN_STYLE}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ y: [0, -19], scale: [0, 1, 0.6], opacity: [0, 1, 0] }}
            transition={{ repeat: Infinity, duration: 1.8 + (i % 3) * 0.3, delay: (i * 0.3) % 1.6, ease: 'easeOut' }}
          >♥</motion.text>
        );
      })}
    </g>
  );
}

/** Steam puffs rising off the sides (fuming). */
function Steam() {
  return (
    <g>
      {[-1, 1].map((s, k) => {
        const x = s < 0 ? 9 : 39;
        return (
          <motion.circle
            key={k} cx={x} cy="22" r="1.3" fill="rgba(255,255,255,0.6)" style={SPIN_STYLE}
            animate={{ cy: [22, 7], r: [0.8, 3], opacity: [0, 0.7, 0] }}
            transition={{ repeat: Infinity, duration: 1.2, delay: k * 0.35 }}
          />
        );
      })}
    </g>
  );
}

/** Triple-7 jackpot pop. */
function Sevens() {
  return (
    <g>
      {[16, 24, 32].map((x, i) => (
        <motion.text
          key={x} x={x} y="9" fontSize="6" fontWeight="900" fill="#fbbf24" stroke="#7c4a02" strokeWidth="0.3"
          textAnchor="middle" style={SPIN_STYLE}
          initial={{ opacity: 0, scale: 0.2 }}
          animate={{ scale: [0.2, 1.25, 1, 1, 0.6], opacity: [0, 1, 1, 1, 0], y: [-4, 0, 0, 0, -2] }}
          transition={{ repeat: Infinity, duration: 2, delay: i * 0.12 }}
        >7</motion.text>
      ))}
    </g>
  );
}

/** Music notes drifting up (dance). */
function Notes({ n = 4 }: { n?: number }) {
  return (
    <g>
      {Array.from({ length: n }).map((_, i) => {
        const x = 12 + (i * 7) % 28;
        return (
          <motion.text
            key={i} x={x} y="20" fontSize={3.5 + (i % 2) * 1.5} fill={['#a855f7', '#22d3ee', '#f472b6'][i % 3]} textAnchor="middle" style={SPIN_STYLE}
            initial={{ opacity: 0 }}
            animate={{ y: [0, -18], x: [0, (i % 2 ? 5 : -5)], rotate: [-12, 12], opacity: [0, 1, 0] }}
            transition={{ repeat: Infinity, duration: 1.6, delay: i * 0.3, ease: 'easeOut' }}
          >{i % 2 ? '♫' : '♪'}</motion.text>
        );
      })}
    </g>
  );
}

export function EmotionEffectsLayer({ compact, emotion }: EmotionEffectsLayerProps) {
  // In compact mode, let the impactful reactions through; suppress only the static decorative ones.
  if (compact && ['king', 'chips', 'cards', 'dice', 'ninja', 'think'].includes(emotion)) return null;
  switch (emotion) {
    case 'sad':
      return (
        <g>
          {[0, 1, 2].map(i => (
            <motion.rect key={`lt${i}`} x="16" y="26" width="2" height="2" rx="0.6" fill="#60a5fa"
              animate={{ y: [0, 20], opacity: [0, 1, 0] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.4, ease: 'easeIn' }} />
          ))}
          {[0, 1, 2].map(i => (
            <motion.rect key={`rt${i}`} x="30" y="26" width="2" height="2" rx="0.6" fill="#60a5fa"
              animate={{ y: [0, 20], opacity: [0, 1, 0] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.4 + 0.2, ease: 'easeIn' }} />
          ))}
        </g>
      );
    case 'happy':
      return <Sparkles n={5} fill="#fde047" />;
    case 'love':
      return <Hearts n={7} />;
    case 'money':
      return <g><Coins n={6} /><Sparkles n={4} cy={12} fill="#34d399" /></g>;
    case 'jackpot':
      return <g><Coins n={10} /><Confetti n={18} /><Sevens /><Sparkles n={6} fill="#fbbf24" /></g>;
    case 'surprised':
      return <Sparkles n={4} cy={11} fill="#e2e8f0" />;
    case 'shock':
      return (
        <g>
          <motion.rect x="22" y="3" width="4" height="8" fill="#eab308" style={SPIN_STYLE}
            animate={{ opacity: [0, 1, 0], scaleY: [0.5, 1.5, 0.5] }} transition={{ repeat: Infinity, duration: 0.2 }} />
          <Sparkles n={6} cy={12} fill="#fde047" />
        </g>
      );
    case 'angry':
      return (
        <g>
          <Steam />
          {[0, 1, 2].map(i => (
            <motion.text key={i} x={32 + i * 3} y={8 + i * 2} fontSize="5" fill="#ef4444" fontWeight="900" style={SPIN_STYLE}
              animate={{ scale: [0.4, 1.1, 0.4], opacity: [0, 1, 0], rotate: [0, 10, 0] }}
              transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}>#</motion.text>
          ))}
        </g>
      );
    case 'dance':
      return <Notes n={5} />;
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
              key={i} x={z.x} y={z.y} fontSize={z.size} fill="#93c5fd" fontWeight="bold" style={SPIN_STYLE}
              animate={{ x: [z.x, z.tx], y: [z.y, z.ty], opacity: [0, 0.9, 0.9, 0], scale: [0.3, 0.7, 1.1, 1.6] }}
              transition={{ repeat: Infinity, duration: 4, delay: z.delay, ease: 'easeOut' }}
            >Z</motion.text>
          ))}
        </g>
      );
    }
    case 'think':
      return <g><motion.rect x="36" y="10" width="8" height="8" rx="2" fill="white" stroke="#d4d4d8" strokeWidth="0.3" animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2 }} style={SPIN_STYLE} /><rect x="34" y="16" width="2" height="2" rx="1" fill="white" stroke="#d4d4d8" strokeWidth="0.3" /><text x="37" y="17" fontSize="6" fill="#71717a">?</text></g>;
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
    default:
      return null;
  }
}
