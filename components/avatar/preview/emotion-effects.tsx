import React from 'react';
import { motion } from 'framer-motion';
import { avatarMotionOrigin } from '@/lib/avatar-viewbox';
import type { Emotion } from '../AvatarView';

type EmotionEffectsLayerProps = {
  compact: boolean;
  emotion: Emotion;
};

export function EmotionEffectsLayer({ compact, emotion }: EmotionEffectsLayerProps) {
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
    default:
      return null;
  }
}
