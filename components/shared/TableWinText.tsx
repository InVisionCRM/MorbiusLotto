'use client';

/**
 * TableWinText — the word that lands when a hand pays.
 *
 * A flat line of type saying "You win" is a caption. This is the opposite: a
 * fat display face with real extruded depth, split into letters that arrive one
 * at a time so the word assembles itself instead of appearing.
 *
 * THE DEPTH is two stacked renderings of the same glyph. The letter itself is
 * the extrude — solid dark fill, a stroke widening the silhouette, and a stack
 * of stepped shadows walking down-right to build the slab. The lit gradient
 * face rides on ::after above it.
 *
 * That order is not arbitrary and not interchangeable. The face has to be a
 * transparent glyph over a clipped background, so it can never also carry the
 * shadow — a transparent glyph shows whatever is behind it, shadow included.
 * Putting the depth on a ::before with z-index:-1 looks like the equivalent
 * arrangement and is not: the letters carry transforms, a transform makes a
 * stacking context, and inside one a negative z-index child still paints above
 * its parent's own background. The extrude would cover the gradient and every
 * win would read as flat brown. ::after paints above parent content
 * unconditionally, with no z-index to be clamped.
 *
 * THE LETTERS are spans with a --i index driving animation-delay, so every
 * variant staggers from the same mechanism and adding a new one is a keyframe
 * rather than new markup. --dir alternates per letter for the variants that
 * come in from both sides.
 *
 * Fonts come from the Google stylesheet already in app/layout.tsx — Titan One,
 * Bangers, Lilita One, Bungee, Bowlby One SC and Shrikhand are all loaded
 * there, so this adds no font loading of its own. Anything not on that list
 * will silently fall back, so extend the <head> link before adding a face here.
 */

import { useEffect, useState } from 'react';

/** How the word arrives. */
export type WinTextVariant =
  | 'slam'
  | 'drop'
  | 'spin'
  | 'slide'
  | 'pop'
  | 'flip'
  | 'zoom'
  | 'roll'
  | 'bounce'
  | 'wave';

export const WIN_TEXT_VARIANTS: WinTextVariant[] = [
  'slam',
  'drop',
  'spin',
  'slide',
  'pop',
  'flip',
  'zoom',
  'roll',
  'bounce',
  'wave',
];

/** The display faces loaded in app/layout.tsx. */
export type WinTextFont = 'titan' | 'bangers' | 'lilita' | 'bungee' | 'bowlby' | 'shrikhand';

export const WIN_TEXT_FONT_STACKS: Record<WinTextFont, string> = {
  titan: "'Titan One', system-ui, sans-serif",
  bangers: "'Bangers', system-ui, sans-serif",
  lilita: "'Lilita One', system-ui, sans-serif",
  bungee: "'Bungee', system-ui, sans-serif",
  bowlby: "'Bowlby One SC', system-ui, sans-serif",
  shrikhand: "'Shrikhand', system-ui, sans-serif",
};

/** Face gradient, extrude colour and glow, per mood. */
export type WinTextPalette = 'gold' | 'cyan' | 'violet' | 'rose';

interface PaletteSpec {
  face: string;
  depth: string;
  stroke: string;
  glow: string;
}

const PALETTES: Record<WinTextPalette, PaletteSpec> = {
  gold: {
    face: 'linear-gradient(180deg,#FFFBE6 0%,#FFE585 34%,#F7B733 62%,#D2820B 100%)',
    depth: '#7A3E02',
    stroke: '#3E1E01',
    glow: 'rgba(251,191,36,.55)',
  },
  cyan: {
    face: 'linear-gradient(180deg,#EAFEFF 0%,#9BF1FF 34%,#22D3EE 64%,#0E7490 100%)',
    depth: '#0A4A5C',
    stroke: '#04202A',
    glow: 'rgba(34,211,238,.55)',
  },
  violet: {
    face: 'linear-gradient(180deg,#F7EEFF 0%,#D9B4FF 34%,#A855F7 64%,#6B21A8 100%)',
    depth: '#4A1878',
    stroke: '#240B3C',
    glow: 'rgba(168,85,247,.55)',
  },
  rose: {
    face: 'linear-gradient(180deg,#FFF0F2 0%,#FFC0CB 34%,#FB7185 64%,#9F1239 100%)',
    depth: '#7A1029',
    stroke: '#3A0713',
    glow: 'rgba(251,113,133,.5)',
  },
};

/**
 * Pick a variant deterministically from a seed, so a felt gets a different
 * arrival each round without a random value that would differ between the
 * server render and the client one.
 */
export function pickWinTextVariant(pool: WinTextVariant[], seed: string | number = 0): WinTextVariant {
  const s = String(seed);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}

/** The bigger the win, the more theatrical the arrivals it can draw from. */
export const WIN_TEXT_POOLS: Record<'small' | 'big' | 'huge', WinTextVariant[]> = {
  small: ['pop', 'drop', 'slide'],
  big: ['slam', 'drop', 'flip', 'roll', 'bounce'],
  huge: ['spin', 'slam', 'zoom', 'wave'],
};

/**
 * What a tier says and how it arrives. The word escalates so the size of the
 * hand is legible before the number is read, and the arrival is drawn from the
 * tier's pool by round id — so consecutive wins of the same size still differ,
 * without a random value that would disagree between server and client render.
 */
export function winTextForTier(
  tier: 'small' | 'big' | 'huge',
  seed: string | number = 0,
): { text: string; variant: WinTextVariant; shockwave: boolean } {
  const text = tier === 'huge' ? 'MEGA WIN' : tier === 'big' ? 'BIG WIN' : 'WIN';
  const variant = pickWinTextVariant(WIN_TEXT_POOLS[tier], seed);
  return { text, variant, shockwave: variant === 'slam' || variant === 'zoom' };
}

export interface TableWinTextProps {
  /** The word. Spaces break it into words that never split across lines. */
  text: string;
  variant?: WinTextVariant;
  font?: WinTextFont;
  palette?: WinTextPalette;
  /** Any CSS length — drives the whole thing, depth included. */
  size?: string;
  /** Milliseconds between letters. */
  stagger?: number;
  /** Keep the word alive after it lands: a slow bob and a gloss sweep. */
  idle?: boolean;
  /** A ring of light thrown off on impact. Suits the heavier arrivals. */
  shockwave?: boolean;
  /** Change to replay — a new round should land again, not sit there landed. */
  replayKey?: string | number;
  className?: string;
}

export function TableWinText({
  text,
  variant = 'slam',
  font = 'titan',
  palette = 'gold',
  size = 'clamp(34px, 11vw, 68px)',
  stagger = 62,
  idle = true,
  shockwave = false,
  replayKey,
  className = '',
}: TableWinTextProps) {
  // Remounts the letters so their animations run from the top again. Without
  // it a second win in a row would render an already-finished animation.
  const [run, setRun] = useState(0);
  useEffect(() => setRun((n) => n + 1), [replayKey, variant, text]);

  const pal = PALETTES[palette];
  const words = text.split(' ').filter(Boolean);

  // Continuous across words so the stagger doesn't restart at each space.
  let index = 0;

  return (
    <div
      key={run}
      className={`tw-root ${idle ? "tw-idle" : ""} ${className}`}
      style={
        {
          '--tw-face': pal.face,
          '--tw-depth': pal.depth,
          '--tw-stroke': pal.stroke,
          '--tw-glow': pal.glow,
          '--tw-size': size,
          '--tw-stagger': `${stagger}ms`,
          fontFamily: WIN_TEXT_FONT_STACKS[font],
        } as React.CSSProperties
      }
      role="img"
      aria-label={text}
    >
      {shockwave && <span className="tw-shock" aria-hidden />}

      <span className={`tw-word-wrap tw-v-${variant}`}>
        {words.map((word, w) => (
          <span className="tw-word" key={w}>
            {Array.from(word).map((ch, c) => {
              const i = index++;
              return (
                <span
                  key={c}
                  className="tw-letter"
                  data-ch={ch}
                  style={
                    {
                      '--i': i,
                      // Alternating entry side for the two-sided arrivals.
                      '--dir': i % 2 === 0 ? 1 : -1,
                    } as React.CSSProperties
                  }
                >
                  {ch}
                </span>
              );
            })}
          </span>
        ))}
      </span>

    </div>
  );
}

/** Mounted once per felt, next to <TableCardStyles />. */
export function TableWinTextStyles() {
  return (
    <style jsx global>{`
      .tw-root {
        position: relative;
        display: inline-block;
        /* Never wider than the felt — the words wrap onto two lines on a
           narrow phone rather than running off both edges. */
        max-width: 100%;
        line-height: 1.02;
        font-size: var(--tw-size);
        letter-spacing: 0.012em;
        /* Depth needs somewhere to go — the 3D arrivals rotate in this space. */
        perspective: 620px;
        /* Tight enough to halo the letters rather than fog them. */
        filter: drop-shadow(0 0 12px var(--tw-glow));
      }

      .tw-word-wrap {
        display: inline-block;
        transform-style: preserve-3d;
      }
      /* A word never breaks across lines, however narrow the felt gets. */
      .tw-word {
        display: inline-block;
        white-space: nowrap;
      }
      .tw-word + .tw-word {
        margin-left: 0.26em;
      }

      /* The slab, drawn as the letter's own text: solid dark fill, a stroke
         widening the silhouette, and a stack of steps walking down-right to
         build the extrude.
         The face goes on ::after rather than the depth on ::before, which
         looks equivalent and is not: the letters carry transforms, a transform
         establishes a stacking context, and inside one a z-index:-1 child
         still paints above the element's own background. Done the other way
         round the extrude covers the gradient and every win reads as flat
         brown. ::after paints above its parent's content unconditionally, so
         the face lands on top with no z-index to be clamped. */
      .tw-letter {
        position: relative;
        display: inline-block;
        transform-style: preserve-3d;
        color: var(--tw-depth);
        -webkit-text-fill-color: var(--tw-depth);
        -webkit-text-stroke: 0.055em var(--tw-stroke);
        text-shadow:
          0.014em 0.014em 0 var(--tw-depth),
          0.028em 0.028em 0 var(--tw-depth),
          0.042em 0.042em 0 var(--tw-depth),
          0.056em 0.056em 0 var(--tw-depth),
          0.07em 0.07em 0 var(--tw-depth),
          0.084em 0.084em 0 var(--tw-depth),
          0.098em 0.098em 0 var(--tw-depth),
          0.112em 0.112em 0 var(--tw-depth),
          0.126em 0.126em 0.02em rgba(0, 0, 0, 0.5),
          0.14em 0.16em 0.08em rgba(0, 0, 0, 0.55);
      }

      /* The lit face. Sits inside the stroked silhouette, so the dark outline
         reads as a keyline around the gradient.
         The gloss travels here rather than in an overlay above the word: an
         overlay is a rectangle, and a rectangle blended over a dark felt is a
         visible grey bar sitting next to the letters. Riding it as a second
         background layer on the same clipped face means the shine can only
         ever appear on the glyphs. */
      .tw-letter::after {
        content: attr(data-ch);
        position: absolute;
        left: 0;
        top: 0;
        background-image: linear-gradient(
            104deg,
            transparent 43%,
            rgba(255, 255, 255, 0.9) 50%,
            transparent 57%
          ),
          var(--tw-face);
        background-size:
          320% 100%,
          100% 100%;
        background-position:
          210% 0,
          0 0;
        background-repeat: no-repeat;
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        -webkit-text-fill-color: transparent;
        -webkit-text-stroke: 0;
        text-shadow: none;
      }

      /* ── Arrivals ───────────────────────────────────────────────────────
         Every variant is one keyframe set plus the same --i stagger, so a new
         arrival is a keyframe and nothing else. */
      .tw-v-slam .tw-letter,
      .tw-v-drop .tw-letter,
      .tw-v-spin .tw-letter,
      .tw-v-slide .tw-letter,
      .tw-v-pop .tw-letter,
      .tw-v-flip .tw-letter,
      .tw-v-zoom .tw-letter,
      .tw-v-roll .tw-letter,
      .tw-v-bounce .tw-letter,
      .tw-v-wave .tw-letter {
        animation-delay: calc(var(--i) * var(--tw-stagger));
        animation-fill-mode: both;
      }

      .tw-v-slam .tw-letter {
        animation-name: tw-slam;
        animation-duration: 0.64s;
        animation-timing-function: cubic-bezier(0.2, 1.5, 0.4, 1);
      }
      @keyframes tw-slam {
        0% {
          transform: scale(4.2) translateY(-6%);
          opacity: 0;
          filter: blur(7px);
        }
        52% {
          transform: scale(0.84);
          opacity: 1;
          filter: blur(0);
        }
        70% {
          transform: scale(1.12) scaleY(0.92);
        }
        85% {
          transform: scale(0.96) scaleY(1.04);
        }
        100% {
          transform: scale(1);
        }
      }

      .tw-v-drop .tw-letter {
        animation-name: tw-drop;
        animation-duration: 0.78s;
        animation-timing-function: cubic-bezier(0.3, 0.9, 0.3, 1);
      }
      @keyframes tw-drop {
        0% {
          transform: translateY(-280%) rotate(-14deg);
          opacity: 0;
        }
        48% {
          transform: translateY(0) rotate(0);
          opacity: 1;
        }
        /* Squash on landing, then a smaller rebound — the cartoon beat. */
        60% {
          transform: translateY(0) scaleY(0.76) scaleX(1.16);
        }
        74% {
          transform: translateY(-26%) scaleY(1.08) scaleX(0.95);
        }
        88% {
          transform: translateY(0) scaleY(0.93) scaleX(1.04);
        }
        100% {
          transform: translateY(0) scale(1);
        }
      }

      .tw-v-spin .tw-letter {
        animation-name: tw-spin;
        animation-duration: 0.92s;
        animation-timing-function: cubic-bezier(0.22, 0.9, 0.25, 1);
      }
      @keyframes tw-spin {
        0% {
          transform: rotateY(900deg) scale(0.18);
          opacity: 0;
        }
        58% {
          transform: rotateY(0deg) scale(1.2);
          opacity: 1;
        }
        78% {
          transform: rotateY(0deg) scale(0.92);
        }
        100% {
          transform: rotateY(0deg) scale(1);
        }
      }

      .tw-v-slide .tw-letter {
        animation-name: tw-slide;
        animation-duration: 0.6s;
        animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes tw-slide {
        0% {
          transform: translateX(calc(var(--dir) * 160%)) skewX(calc(var(--dir) * -14deg));
          opacity: 0;
        }
        72% {
          transform: translateX(calc(var(--dir) * -9%)) skewX(calc(var(--dir) * 4deg));
          opacity: 1;
        }
        100% {
          transform: none;
        }
      }

      .tw-v-pop .tw-letter {
        animation-name: tw-pop;
        animation-duration: 0.56s;
        animation-timing-function: cubic-bezier(0.2, 1.7, 0.4, 1);
      }
      @keyframes tw-pop {
        0% {
          transform: scale(0) rotate(-28deg);
          opacity: 0;
        }
        62% {
          transform: scale(1.26) rotate(7deg);
          opacity: 1;
        }
        80% {
          transform: scale(0.9) rotate(-4deg);
        }
        100% {
          transform: scale(1) rotate(0);
        }
      }

      .tw-v-flip .tw-letter {
        animation-name: tw-flip;
        animation-duration: 0.7s;
        animation-timing-function: cubic-bezier(0.25, 1.1, 0.3, 1);
      }
      @keyframes tw-flip {
        0% {
          transform: rotateX(-115deg) translateY(-45%);
          opacity: 0;
        }
        58% {
          transform: rotateX(20deg) translateY(0);
          opacity: 1;
        }
        78% {
          transform: rotateX(-10deg);
        }
        100% {
          transform: rotateX(0);
        }
      }

      .tw-v-zoom .tw-letter {
        animation-name: tw-zoom;
        animation-duration: 0.72s;
        animation-timing-function: cubic-bezier(0.18, 1, 0.28, 1);
      }
      @keyframes tw-zoom {
        0% {
          transform: translateZ(-820px) rotate(14deg);
          opacity: 0;
        }
        70% {
          transform: translateZ(70px) rotate(-4deg);
          opacity: 1;
        }
        100% {
          transform: translateZ(0) rotate(0);
        }
      }

      .tw-v-roll .tw-letter {
        animation-name: tw-roll;
        animation-duration: 0.78s;
        animation-timing-function: cubic-bezier(0.2, 1, 0.3, 1);
      }
      @keyframes tw-roll {
        0% {
          transform: translateX(-240%) rotate(-540deg);
          opacity: 0;
        }
        72% {
          transform: translateX(8%) rotate(14deg);
          opacity: 1;
        }
        100% {
          transform: none;
        }
      }

      .tw-v-bounce .tw-letter {
        animation-name: tw-bounce;
        animation-duration: 1s;
        animation-timing-function: linear;
      }
      @keyframes tw-bounce {
        0% {
          transform: translateY(-300%);
          opacity: 0;
        }
        30% {
          transform: translateY(0);
          opacity: 1;
        }
        42% {
          transform: translateY(-46%);
        }
        54% {
          transform: translateY(0) scaleY(0.86) scaleX(1.1);
        }
        66% {
          transform: translateY(-20%) scale(1);
        }
        78% {
          transform: translateY(0) scaleY(0.94) scaleX(1.03);
        }
        88% {
          transform: translateY(-7%);
        }
        100% {
          transform: translateY(0) scale(1);
        }
      }

      .tw-v-wave .tw-letter {
        animation-name: tw-wave;
        animation-duration: 0.86s;
        animation-timing-function: cubic-bezier(0.25, 1.2, 0.35, 1);
      }
      @keyframes tw-wave {
        0% {
          transform: translateY(120%) rotate(calc(var(--dir) * 20deg)) scale(0.6);
          opacity: 0;
        }
        55% {
          transform: translateY(-24%) rotate(calc(var(--dir) * -6deg)) scale(1.12);
          opacity: 1;
        }
        78% {
          transform: translateY(8%) rotate(0) scale(0.97);
        }
        100% {
          transform: translateY(0) rotate(0) scale(1);
        }
      }

      /* ── After it lands ────────────────────────────────────────────────
         A slow bob so the word breathes rather than freezing, and a gloss
         travelling across the face. Both start once the letters are home. */
      .tw-root.tw-idle .tw-word-wrap {
        animation: tw-bob 2.6s ease-in-out 1.1s infinite;
      }
      @keyframes tw-bob {
        0%,
        100% {
          transform: translateY(0) rotate(0);
        }
        50% {
          transform: translateY(-3.5%) rotate(-0.5deg);
        }
      }

      .tw-root.tw-idle .tw-letter::after {
        animation: tw-gloss 3.4s cubic-bezier(0.4, 0, 0.2, 1) 1.1s infinite;
      }
      @keyframes tw-gloss {
        0% {
          background-position:
            210% 0,
            0 0;
        }
        /* Long tail so the sweep is an occasional glint, not a strobe. */
        38%,
        100% {
          background-position:
            -110% 0,
            0 0;
        }
      }

      /* Ring of light thrown off on impact. */
      .tw-shock {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 1.4em;
        height: 1.4em;
        margin: -0.7em 0 0 -0.7em;
        border-radius: 999px;
        border: 0.06em solid var(--tw-glow);
        pointer-events: none;
        animation: tw-shock 0.72s cubic-bezier(0.2, 0.7, 0.3, 1) 0.16s both;
      }
      @keyframes tw-shock {
        0% {
          transform: scale(0.2);
          opacity: 0;
        }
        22% {
          opacity: 0.95;
        }
        100% {
          transform: scale(4.6);
          opacity: 0;
        }
      }

      /* Someone who asked for less motion still gets the word, at full size
         and with its depth — it simply arrives instead of performing. */
      @media (prefers-reduced-motion: reduce) {
        .tw-root .tw-letter,
        .tw-root .tw-letter::after,
        .tw-root .tw-word-wrap,
        .tw-shock {
          animation: none !important;
          transform: none !important;
          opacity: 1 !important;
        }
        .tw-shock {
          display: none;
        }
      }
    `}</style>
  );
}
