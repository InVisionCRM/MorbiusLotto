'use client';

/**
 * CurvedName — game titles arched along a circle, as live text.
 *
 * The names keep their per-game display face (Titan One, Bungee, …), so the
 * arc has to be applied to real text rather than baked into an SVG path —
 * that keeps them crisp at every zoom, selectable, and styled by the same
 * `.f-*` classes the flat titles used.
 *
 * Each character is rotated about a point far below the line, which both
 * turns it and swings it along the arc. The naive version of that trick also
 * pushes the outer characters sideways (by R·sinθ), which visibly stretches
 * the word; the transform here cancels that shift so the letters only rise
 * and fall. Everything is expressed in `em`, so the arc scales with whatever
 * font-size the card context sets.
 */

import type { CSSProperties } from 'react';

/** Rough advance width of the display faces, in em. Only sets the arc depth. */
const AVG_CHAR_EM = 0.62;
/** Arc depth as a fraction of the word's width. Gentle arch, not a rainbow. */
const SAGITTA = 0.05;
/** Below this, an arc reads as a typo rather than a curve. */
const MIN_CHARS = 3;

export function CurvedName({ text, className, style }: { text: string; className?: string; style?: CSSProperties }) {
  const chars = Array.from(text);
  const n = chars.length;

  if (n < MIN_CHARS) {
    return (
      <div
        className={`curved-name ${className ?? ''}`}
        style={{ ...style, '--name-chars': n } as CSSProperties}
      >
        {text}
      </div>
    );
  }

  const widthEm = n * AVG_CHAR_EM;
  const radiusEm = widthEm / (8 * SAGITTA);
  const sweep = 8 * SAGITTA; // total angular span, radians — constant by construction
  const stepRad = sweep / n;
  /* The outermost letters drop by this much; reserve room so they aren't
     clipped by the meta block's padding. */
  const dropEm = radiusEm * (1 - Math.cos(sweep / 2));

  return (
    <div
      className={`curved-name ${className ?? ''}`}
      style={
        {
          ...style,
          /* Character count drives the container-query size cap in CSS —
             a 12-letter name can't wear the same font-size as a 4-letter one
             on a card this narrow, and an arced title must never wrap. */
          '--name-chars': n,
          paddingBottom: `${dropEm.toFixed(3)}em`,
          lineHeight: 1,
        } as CSSProperties
      }
      aria-label={text}
    >
      {chars.map((ch, i) => {
        const rad = (i - (n - 1) / 2) * stepRad;
        const dxEm = radiusEm * Math.sin(rad);
        return (
          <span
            key={i}
            aria-hidden="true"
            style={{
              display: 'inline-block',
              transformOrigin: `50% ${radiusEm.toFixed(3)}em`,
              transform: `translateX(${(-dxEm).toFixed(4)}em) rotate(${((rad * 180) / Math.PI).toFixed(3)}deg)`,
            }}
          >
            {ch === ' ' ? ' ' : ch}
          </span>
        );
      })}
    </div>
  );
}
