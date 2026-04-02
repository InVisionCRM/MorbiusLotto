import React from 'react';
import type { AvatarConfig } from '@/lib/websocket-client';
import { AVATAR_VIEWBOX_H, AVATAR_VIEWBOX_W } from '@/lib/avatar-viewbox';

type FacialHairLayerProps = {
  facialHair: AvatarConfig['facialHair'];
  hairFill: string;
  uid: string;
};

/**
 * Facial hair — cohesive silhouettes (pixel-art: one readable mass, not floating tiles).
 * Reference: full / boxed beards read as continuous jaw + chin; stubble as shadow on lower face with lip cutout.
 */
export function FacialHairLayer({ facialHair, hairFill, uid }: FacialHairLayerProps) {
  const F = hairFill;
  const fh = facialHair ?? 'None';
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
            {/* Skin-adjacent warm shadow first (reads as 5 o'clock shadow, not a solid beard) */}
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
}
