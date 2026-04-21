'use client';

import React, { useState, useCallback, useRef } from 'react';
import PlayingCard from '@/components/BLACKJACK/PlayingCard';
import type { Card } from '@/app/BLACKJACK/types';

type AnimationDef = {
  id: string;
  name: string;
  description: string;
  category: 'realistic' | 'epic' | 'signature';
  /** class applied while dealing in */
  inClass: string;
  /** class applied while clearing out */
  outClass: string;
  /** per-card stagger in seconds */
  stagger: number;
};

const ANIMATIONS: AnimationDef[] = [
  // --- REALISTIC ---
  {
    id: 'deal-arc',
    name: 'Dealer Arc',
    description: 'Cards arc in from the dealer shoe (top-right) with a subtle rotation — the quiet professional.',
    category: 'realistic',
    inClass: 'anim-in-arc',
    outClass: 'anim-out-sweep',
    stagger: 0.18,
  },
  {
    id: 'pitch',
    name: 'Pitch Slide',
    description: 'Smooth low pitch across the felt, as if slid from the dealer\'s hand.',
    category: 'realistic',
    inClass: 'anim-in-pitch',
    outClass: 'anim-out-slide-down',
    stagger: 0.16,
  },
  {
    id: 'flip-drop',
    name: 'Flip & Drop',
    description: '3D flip from face-down to face-up as the card settles onto the table.',
    category: 'realistic',
    inClass: 'anim-in-flip-drop',
    outClass: 'anim-out-fade-down',
    stagger: 0.2,
  },
  {
    id: 'hand-toss',
    name: 'Hand Toss',
    description: 'Card floats in with a natural rotation and settles — a gentle hand toss.',
    category: 'realistic',
    inClass: 'anim-in-toss',
    outClass: 'anim-out-sweep',
    stagger: 0.17,
  },
  {
    id: 'soft-glide',
    name: 'Soft Glide',
    description: 'Minimal easing slide from the shoe with a small rise — crisp and casino-like.',
    category: 'realistic',
    inClass: 'anim-in-glide',
    outClass: 'anim-out-slide-down',
    stagger: 0.14,
  },
  // --- EPIC ---
  {
    id: 'lightspeed',
    name: 'Lightspeed Deal',
    description: 'Cards rip across the screen with skew and motion blur — hyperdrive blackjack.',
    category: 'epic',
    inClass: 'anim-in-lightspeed',
    outClass: 'anim-out-lightspeed',
    stagger: 0.1,
  },
  {
    id: 'shockwave',
    name: 'Shockwave Slam',
    description:
      'Cards slam in from above with a glow pulse and scale overshoot — clears with the smooth Pitch Slide drop-off.',
    category: 'epic',
    inClass: 'anim-in-shockwave',
    outClass: 'anim-out-slide-down',
    stagger: 0.18,
  },
  {
    id: 'portal',
    name: 'Portal Rift',
    description: 'Cards materialize out of a rotating blur portal.',
    category: 'epic',
    inClass: 'anim-in-portal',
    outClass: 'anim-out-portal',
    stagger: 0.22,
  },
  {
    id: 'neon-flip',
    name: 'Neon Flip',
    description: 'Aggressive 3D barrel roll with a neon glow trail and snap-settle.',
    category: 'epic',
    inClass: 'anim-in-neon-flip',
    outClass: 'anim-out-implode',
    stagger: 0.22,
  },
  {
    id: 'meteor',
    name: 'Meteor Strike',
    description: 'Cards streak in like meteors from the top-left corner, spinning and trailing shadow.',
    category: 'epic',
    inClass: 'anim-in-meteor',
    outClass: 'anim-out-lightspeed',
    stagger: 0.15,
  },
  // --- 10 MORE EPIC ---
  {
    id: 'voltage',
    name: 'Voltage Strike',
    description: 'Cards crack into view with electric jitter and white-hot edge glow.',
    category: 'epic',
    inClass: 'anim-in-voltage',
    outClass: 'anim-out-voltage',
    stagger: 0.14,
  },
  {
    id: 'phoenix',
    name: 'Phoenix Rise',
    description: 'Cards rise from below with a fiery orange/red halo, wings of heat fading as they settle.',
    category: 'epic',
    inClass: 'anim-in-phoenix',
    outClass: 'anim-out-ash',
    stagger: 0.18,
  },
  {
    id: 'cyber-glitch',
    name: 'Cyber Glitch',
    description: 'Cards glitch in with horizontal scanline shears and chromatic aberration.',
    category: 'epic',
    inClass: 'anim-in-glitch',
    outClass: 'anim-out-glitch',
    stagger: 0.12,
  },
  {
    id: 'gravity-drop',
    name: 'Gravity Drop',
    description: 'Cards plunge from high above with heavy bounce and an impact shake.',
    category: 'epic',
    inClass: 'anim-in-gravity',
    outClass: 'anim-out-freefall',
    stagger: 0.2,
  },
  {
    id: 'mirror-split',
    name: 'Mirror Split',
    description: 'Two ghost copies converge from left + right into a single solid card.',
    category: 'epic',
    inClass: 'anim-in-mirror',
    outClass: 'anim-out-mirror',
    stagger: 0.18,
  },
  {
    id: 'sonic-boom',
    name: 'Sonic Boom',
    description: 'Cards punch through with an expanding ring shockwave and low-frequency blur.',
    category: 'epic',
    inClass: 'anim-in-sonic',
    outClass: 'anim-out-implode',
    stagger: 0.15,
  },
  {
    id: 'icy-shatter',
    name: 'Icy Shatter In',
    description: 'Cards crystallize into view cyan-white, then out by shattering forward.',
    category: 'epic',
    inClass: 'anim-in-icy',
    outClass: 'anim-out-shatter',
    stagger: 0.16,
  },
  {
    id: 'warp-zoom',
    name: 'Warp Zoom',
    description: 'Massive Z-axis zoom from deep space with radial blur streaks.',
    category: 'epic',
    inClass: 'anim-in-warp',
    outClass: 'anim-out-warp',
    stagger: 0.13,
  },
  {
    id: 'kaiju-slam',
    name: 'Kaiju Slam',
    description: 'Oversized cards crash in, settle with a screen-shake and dust-shadow.',
    category: 'epic',
    inClass: 'anim-in-kaiju',
    outClass: 'anim-out-implode',
    stagger: 0.22,
  },
  {
    id: 'hologram',
    name: 'Hologram Rez',
    description: 'Cards resolve from a cyan scan-line projection sweep — top-down holographic print.',
    category: 'epic',
    inClass: 'anim-in-hologram',
    outClass: 'anim-out-hologram',
    stagger: 0.2,
  },
  // --- SIGNATURE (5 most unique) ---
  {
    id: 'sig-origami',
    name: 'Origami Unfold',
    description: 'Card enters folded flat as a crease, then unfolds across X and Y like paper being revealed.',
    category: 'signature',
    inClass: 'anim-in-origami',
    outClass: 'anim-out-origami',
    stagger: 0.28,
  },
  {
    id: 'sig-inkbleed',
    name: 'Ink Bleed',
    description: 'Card emerges from an ink-drop: saturated blur compresses inward until sharp.',
    category: 'signature',
    inClass: 'anim-in-inkbleed',
    outClass: 'anim-out-inkbleed',
    stagger: 0.26,
  },
  {
    id: 'sig-dimension',
    name: 'Dimensional Step',
    description: 'Card appears to step forward from a deeper dimension — triple-exposure 3D offset resolves into one.',
    category: 'signature',
    inClass: 'anim-in-dimension',
    outClass: 'anim-out-dimension',
    stagger: 0.3,
  },
  {
    id: 'sig-crystal',
    name: 'Crystal Forge',
    description: 'Card assembles from shard-like facets converging inward with refraction glints.',
    category: 'signature',
    inClass: 'anim-in-crystal',
    outClass: 'anim-out-crystal',
    stagger: 0.3,
  },
  {
    id: 'sig-timerip',
    name: 'Time Rip',
    description: 'Card leaves an echo-trail as if time is catching up — motion ghosts collapse into the final card.',
    category: 'signature',
    inClass: 'anim-in-timerip',
    outClass: 'anim-out-timerip',
    stagger: 0.25,
  },
];

const SAMPLE_HAND: Card[] = [
  { suit: 'spades', value: 1 },
  { suit: 'hearts', value: 13 },
  { suit: 'clubs', value: 10 },
];

const LAST_CARD_INDEX = SAMPLE_HAND.length - 1;

function AnimationDemo({ def }: { def: AnimationDef }) {
  // 'in' → 'out' → 'idle'; hover / tap / focus on the felt runs one full cycle
  const [phase, setPhase] = useState<'in' | 'out' | 'idle'>('idle');
  const [cycleKey, setCycleKey] = useState(0);
  const playTokenRef = useRef(0);

  const startCycle = useCallback(() => {
    playTokenRef.current += 1;
    setPhase('in');
    setCycleKey((k) => k + 1);
  }, []);

  const handleLastCardAnimationEnd = useCallback(
    (e: React.AnimationEvent<HTMLDivElement>, cardIndex: number) => {
      if (cardIndex !== LAST_CARD_INDEX) return;
      if (e.target !== e.currentTarget) return;
      const token = playTokenRef.current;
      requestAnimationFrame(() => {
        if (token !== playTokenRef.current) return;
        setPhase((p) => {
          if (p === 'in') return 'out';
          if (p === 'out') return 'idle';
          return p;
        });
      });
    },
    [],
  );

  const onFeltKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      startCycle();
    },
    [startCycle],
  );

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 backdrop-blur p-5 flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-white">{def.name}</h3>
          <span
            className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              def.category === 'epic'
                ? 'border-fuchsia-400/50 text-fuchsia-300 bg-fuchsia-500/10'
                : def.category === 'signature'
                  ? 'border-cyan-400/45 text-cyan-200 bg-cyan-500/10'
                  : 'border-emerald-400/50 text-emerald-300 bg-emerald-500/10'
            }`}
          >
            {def.category}
          </span>
        </div>
        <p className="text-sm text-slate-400 mt-1">{def.description}</p>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label={`Preview ${def.name} deal animation`}
        onPointerEnter={startCycle}
        onFocus={startCycle}
        onKeyDown={onFeltKeyDown}
        className="relative h-48 rounded-lg overflow-hidden outline-none cursor-pointer border border-white/5 transition-[box-shadow,border-color] hover:border-cyan-500/35 hover:shadow-[0_0_0_1px_rgba(34,211,238,0.15),inset_0_0_60px_rgba(0,0,0,0.6)] focus-visible:border-cyan-500/40 focus-visible:ring-2 focus-visible:ring-cyan-400/30"
        style={{
          background:
            'radial-gradient(ellipse at center, #0f4d2b 0%, #082917 70%, #050f0a 100%)',
          boxShadow: 'inset 0 0 60px rgba(0,0,0,0.6)',
        }}
      >
        {phase === 'idle' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <span className="text-xs uppercase tracking-widest text-white/35 select-none">
              Hover to preview
            </span>
          </div>
        )}
        <div
          key={cycleKey}
          className="absolute inset-0 flex items-center justify-center gap-3"
          style={{ perspective: '1200px' }}
        >
          {phase !== 'idle' &&
            SAMPLE_HAND.map((card, i) => {
              const cls = phase === 'in' ? def.inClass : def.outClass;
              const delay = i * def.stagger;
              return (
                <div
                  key={`${cycleKey}-${i}`}
                  className={cls}
                  style={{
                    animationDelay: `${delay}s`,
                    transformStyle: 'preserve-3d',
                  }}
                  onAnimationEnd={(e) => handleLastCardAnimationEnd(e, i)}
                >
                  <PlayingCard
                    card={card}
                    owner="player"
                    index={i}
                    isNewCard={false}
                    exiting={false}
                    exitDelay={0}
                    size="small"
                  />
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

export default function CssTestPage() {
  const realistic = ANIMATIONS.filter((a) => a.category === 'realistic');
  const epic = ANIMATIONS.filter((a) => a.category === 'epic');
  const signature = ANIMATIONS.filter((a) => a.category === 'signature');

  return (
    <div className="min-h-screen w-full bg-slate-950 text-white">
      <style jsx global>{`
        /* =================== REALISTIC =================== */

        /* 1. Dealer Arc — from dealer shoe, top-right, with gentle rotation */
        @keyframes inArc {
          0% {
            opacity: 0;
            transform: translate(220px, -140px) rotate(-18deg) scale(0.85);
          }
          60% {
            opacity: 1;
          }
          100% {
            opacity: 1;
            transform: translate(0, 0) rotate(0deg) scale(1);
          }
        }
        .anim-in-arc {
          animation: inArc 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        /* 2. Pitch Slide — low, flat pitch from the right */
        @keyframes inPitch {
          0% {
            opacity: 0;
            transform: translateX(340px) rotate(-4deg);
          }
          100% {
            opacity: 1;
            transform: translateX(0) rotate(0);
          }
        }
        .anim-in-pitch {
          animation: inPitch 0.55s cubic-bezier(0.25, 0.8, 0.3, 1) both;
        }

        /* 3. Flip & Drop — drops and flips 180 on Y */
        @keyframes inFlipDrop {
          0% {
            opacity: 0;
            transform: translateY(-180px) rotateY(180deg) scale(0.9);
          }
          60% {
            opacity: 1;
          }
          100% {
            opacity: 1;
            transform: translateY(0) rotateY(0deg) scale(1);
          }
        }
        .anim-in-flip-drop {
          animation: inFlipDrop 0.8s cubic-bezier(0.2, 0.9, 0.25, 1) both;
        }

        /* 4. Hand Toss — a natural lofted toss with rotation */
        @keyframes inToss {
          0% {
            opacity: 0;
            transform: translate(180px, -90px) rotate(25deg);
          }
          55% {
            opacity: 1;
            transform: translate(-12px, 8px) rotate(-6deg);
          }
          100% {
            opacity: 1;
            transform: translate(0, 0) rotate(0);
          }
        }
        .anim-in-toss {
          animation: inToss 0.75s cubic-bezier(0.34, 1.2, 0.4, 1) both;
        }

        /* 5. Soft Glide — minimal, crisp professional glide */
        @keyframes inGlide {
          0% {
            opacity: 0;
            transform: translate(120px, -30px) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: translate(0, 0) scale(1);
          }
        }
        .anim-in-glide {
          animation: inGlide 0.45s cubic-bezier(0.3, 0.9, 0.35, 1) both;
        }

        /* Realistic outs */
        @keyframes outSweep {
          0% {
            opacity: 1;
            transform: translate(0, 0) rotate(0);
          }
          100% {
            opacity: 0;
            transform: translate(-220px, 80px) rotate(-15deg) scale(0.85);
          }
        }
        .anim-out-sweep {
          animation: outSweep 0.5s cubic-bezier(0.4, 0, 0.7, 0.4) both;
        }
        @keyframes outSlideDown {
          0% {
            opacity: 1;
            transform: translateY(0);
          }
          100% {
            opacity: 0;
            transform: translateY(180px) scale(0.92);
          }
        }
        .anim-out-slide-down {
          animation: outSlideDown 0.45s cubic-bezier(0.5, 0, 0.75, 0) both;
        }
        @keyframes outFadeDown {
          0% {
            opacity: 1;
            transform: translateY(0) rotateX(0);
          }
          100% {
            opacity: 0;
            transform: translateY(60px) rotateX(-60deg);
          }
        }
        .anim-out-fade-down {
          animation: outFadeDown 0.5s ease-in both;
        }

        /* =================== EPIC =================== */

        /* 1. Lightspeed — skew + blur rip */
        @keyframes inLightspeed {
          0% {
            opacity: 0;
            transform: translateX(800px) skewX(-35deg) scale(0.8);
            filter: blur(6px);
          }
          60% {
            opacity: 1;
            transform: translateX(-18px) skewX(6deg) scale(1.02);
            filter: blur(0);
          }
          100% {
            opacity: 1;
            transform: translateX(0) skewX(0) scale(1);
            filter: blur(0);
          }
        }
        .anim-in-lightspeed {
          animation: inLightspeed 0.55s cubic-bezier(0.2, 0.85, 0.2, 1) both;
        }
        @keyframes outLightspeed {
          0% {
            opacity: 1;
            transform: translateX(0) skewX(0);
            filter: blur(0);
          }
          100% {
            opacity: 0;
            transform: translateX(-800px) skewX(35deg) scale(0.7);
            filter: blur(8px);
          }
        }
        .anim-out-lightspeed {
          animation: outLightspeed 0.5s cubic-bezier(0.7, 0, 0.9, 0.2) both;
        }

        /* 2. Shockwave Slam */
        @keyframes inShockwave {
          0% {
            opacity: 0;
            transform: translateY(-300px) scale(0.4);
            filter: drop-shadow(0 0 0 rgba(255, 200, 0, 0));
          }
          70% {
            opacity: 1;
            transform: translateY(14px) scale(1.15);
            filter: drop-shadow(0 0 28px rgba(255, 200, 0, 0.9));
          }
          85% {
            transform: translateY(-4px) scale(0.97);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: drop-shadow(0 0 0 rgba(255, 200, 0, 0));
          }
        }
        .anim-in-shockwave {
          animation: inShockwave 0.85s cubic-bezier(0.2, 1.4, 0.4, 1) both;
        }
        @keyframes outImplode {
          0% {
            opacity: 1;
            transform: scale(1) rotate(0);
            filter: blur(0);
          }
          100% {
            opacity: 0;
            transform: scale(0) rotate(180deg);
            filter: blur(6px);
          }
        }
        .anim-out-implode {
          animation: outImplode 0.45s cubic-bezier(0.6, 0, 0.8, 0.2) both;
        }

        /* 3. Portal Rift — blur + rotate + scale */
        @keyframes inPortal {
          0% {
            opacity: 0;
            transform: rotate(-540deg) scale(0);
            filter: blur(14px) hue-rotate(200deg);
          }
          60% {
            opacity: 1;
            filter: blur(2px) hue-rotate(40deg);
          }
          100% {
            opacity: 1;
            transform: rotate(0) scale(1);
            filter: blur(0) hue-rotate(0);
          }
        }
        .anim-in-portal {
          animation: inPortal 1s cubic-bezier(0.2, 0.9, 0.3, 1) both;
        }
        @keyframes outPortal {
          0% {
            opacity: 1;
            transform: rotate(0) scale(1);
            filter: blur(0);
          }
          100% {
            opacity: 0;
            transform: rotate(720deg) scale(0);
            filter: blur(14px);
          }
        }
        .anim-out-portal {
          animation: outPortal 0.65s cubic-bezier(0.5, 0, 0.75, 0.2) both;
        }

        /* 4. Neon Flip — 3D barrel roll with glow */
        @keyframes inNeonFlip {
          0% {
            opacity: 0;
            transform: translateX(260px) rotateY(720deg) rotateZ(25deg) scale(0.5);
            filter: drop-shadow(0 0 0 rgba(0, 255, 255, 0));
          }
          50% {
            opacity: 1;
            filter: drop-shadow(0 0 24px rgba(0, 255, 255, 0.95))
              drop-shadow(0 0 48px rgba(255, 0, 200, 0.6));
          }
          85% {
            transform: translateX(-6px) rotateY(10deg) rotateZ(-3deg) scale(1.06);
          }
          100% {
            opacity: 1;
            transform: translateX(0) rotateY(0) rotateZ(0) scale(1);
            filter: drop-shadow(0 0 0 rgba(0, 255, 255, 0));
          }
        }
        .anim-in-neon-flip {
          animation: inNeonFlip 1.05s cubic-bezier(0.25, 1.1, 0.35, 1) both;
        }

        /* 5. Meteor Strike — streaks in from top-left, spinning */
        @keyframes inMeteor {
          0% {
            opacity: 0;
            transform: translate(-520px, -360px) rotate(-720deg) scale(0.4);
            filter: drop-shadow(8px 8px 14px rgba(255, 120, 0, 0.8));
          }
          70% {
            opacity: 1;
            transform: translate(14px, 10px) rotate(18deg) scale(1.1);
            filter: drop-shadow(4px 4px 20px rgba(255, 160, 0, 0.9));
          }
          100% {
            opacity: 1;
            transform: translate(0, 0) rotate(0) scale(1);
            filter: drop-shadow(0 0 0 rgba(255, 120, 0, 0));
          }
        }
        .anim-in-meteor {
          animation: inMeteor 0.9s cubic-bezier(0.2, 1.1, 0.35, 1) both;
        }

        /* --- More epic: Voltage --- */
        @keyframes inVoltage {
          0% {
            opacity: 0;
            transform: translate(120px, -40px) rotate(-12deg) scale(0.4);
            filter: brightness(3) contrast(2) blur(4px)
              drop-shadow(0 0 0 rgba(200, 240, 255, 0));
          }
          15% {
            transform: translate(-8px, 6px) rotate(8deg) scale(1.08);
            filter: brightness(1.4) contrast(1.4) blur(0)
              drop-shadow(0 0 18px rgba(180, 230, 255, 0.95));
          }
          18% {
            transform: translate(4px, -3px) rotate(-4deg) scale(0.96);
          }
          22% {
            transform: translate(-2px, 1px) rotate(2deg) scale(1.02);
          }
          100% {
            opacity: 1;
            transform: translate(0, 0) rotate(0) scale(1);
            filter: brightness(1) contrast(1) blur(0)
              drop-shadow(0 0 0 rgba(200, 240, 255, 0));
          }
        }
        .anim-in-voltage {
          animation: inVoltage 0.75s cubic-bezier(0.25, 1, 0.35, 1) both;
        }
        @keyframes outVoltage {
          0% {
            opacity: 1;
            transform: scale(1) rotate(0);
            filter: blur(0);
          }
          35% {
            transform: scale(1.06) rotate(-6deg);
            filter: brightness(1.8) contrast(1.5) blur(1px)
              drop-shadow(0 0 22px rgba(200, 240, 255, 0.8));
          }
          100% {
            opacity: 0;
            transform: translate(100px, -60px) scale(0.2) rotate(24deg);
            filter: brightness(2) blur(10px);
          }
        }
        .anim-out-voltage {
          animation: outVoltage 0.55s cubic-bezier(0.55, 0, 0.85, 0.15) both;
        }

        /* Phoenix / ash */
        @keyframes inPhoenix {
          0% {
            opacity: 0;
            transform: translateY(160px) scale(0.5) rotate(-8deg);
            filter: blur(8px) drop-shadow(0 0 0 rgba(255, 80, 0, 0));
          }
          55% {
            opacity: 1;
            transform: translateY(-10px) scale(1.08) rotate(4deg);
            filter: blur(0) drop-shadow(0 0 32px rgba(255, 120, 40, 0.9))
              drop-shadow(0 -20px 40px rgba(255, 60, 0, 0.45));
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1) rotate(0);
            filter: blur(0) drop-shadow(0 0 0 rgba(255, 80, 0, 0));
          }
        }
        .anim-in-phoenix {
          animation: inPhoenix 0.95s cubic-bezier(0.2, 1.1, 0.32, 1) both;
        }
        @keyframes outAsh {
          0% {
            opacity: 1;
            transform: translate(0, 0) scale(1);
            filter: sepia(0) blur(0);
          }
          100% {
            opacity: 0;
            transform: translate(12px, -100px) scale(0.55) rotate(12deg);
            filter: sepia(1) grayscale(1) blur(5px)
              drop-shadow(0 0 12px rgba(120, 120, 120, 0.5));
          }
        }
        .anim-out-ash {
          animation: outAsh 0.65s cubic-bezier(0.45, 0, 0.75, 0) both;
        }

        /* Cyber glitch */
        @keyframes inGlitch {
          0% {
            opacity: 0;
            transform: translate(50px, 0) skewX(-22deg);
            filter: hue-rotate(110deg) blur(3px) saturate(2);
          }
          12% {
            transform: translate(-35px, 2px) skewX(18deg);
            filter: hue-rotate(-60deg) blur(0);
          }
          16% {
            transform: translate(18px, -4px) skewX(-10deg);
            filter: hue-rotate(40deg) blur(1px);
          }
          22% {
            transform: translate(-10px, 0) skewX(6deg);
            filter: hue-rotate(0) blur(0);
          }
          28% {
            transform: translate(6px, 1px) skewX(-3deg);
          }
          100% {
            opacity: 1;
            transform: translate(0, 0) skewX(0);
            filter: hue-rotate(0) blur(0) saturate(1);
          }
        }
        .anim-in-glitch {
          animation: inGlitch 0.7s cubic-bezier(0.3, 0.9, 0.35, 1) both;
        }
        @keyframes outGlitch {
          0% {
            opacity: 1;
            transform: translate(0, 0) skewX(0);
            filter: blur(0);
          }
          20% {
            transform: translate(-16px, 0) skewX(12deg);
            filter: hue-rotate(90deg);
          }
          40% {
            transform: translate(20px, 0) skewX(-14deg);
            filter: hue-rotate(-70deg) blur(2px);
          }
          100% {
            opacity: 0;
            transform: translate(-60px, 20px) skewX(25deg) scale(0.85);
            filter: hue-rotate(180deg) blur(8px);
          }
        }
        .anim-out-glitch {
          animation: outGlitch 0.55s cubic-bezier(0.55, 0, 0.85, 0.1) both;
        }

        /* Gravity drop / freefall out */
        @keyframes inGravity {
          0% {
            opacity: 0;
            transform: translateY(-280px) scale(0.92);
            filter: blur(2px);
          }
          62% {
            opacity: 1;
            transform: translateY(22px) scale(1.04) rotate(-2deg);
            filter: blur(0);
          }
          78% {
            transform: translateY(-8px) scale(0.98) rotate(1deg);
          }
          88% {
            transform: translateY(4px) scale(1.01);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1) rotate(0);
          }
        }
        .anim-in-gravity {
          animation: inGravity 0.95s cubic-bezier(0.3, 1.2, 0.35, 1) both;
        }
        @keyframes outFreefall {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
          100% {
            opacity: 0;
            transform: translateY(260px) scale(0.82) rotate(8deg);
            filter: blur(7px);
          }
        }
        .anim-out-freefall {
          animation: outFreefall 0.5s cubic-bezier(0.55, 0, 0.95, 0.35) both;
        }

        /* Mirror split — single card “twin” convergence */
        @keyframes inMirror {
          0% {
            opacity: 0;
            transform: translateX(-90px) scaleX(0.25) skewX(12deg);
            filter: blur(4px);
          }
          45% {
            opacity: 1;
            transform: translateX(90px) scaleX(0.25) skewX(-12deg);
            filter: blur(3px);
          }
          100% {
            opacity: 1;
            transform: translateX(0) scaleX(1) skewX(0);
            filter: blur(0);
          }
        }
        .anim-in-mirror {
          animation: inMirror 0.85s cubic-bezier(0.45, 0, 0.15, 1) both;
        }
        @keyframes outMirror {
          0% {
            opacity: 1;
            transform: scaleX(1) translateX(0);
            filter: blur(0);
          }
          100% {
            opacity: 0;
            transform: scaleX(0.2) translateX(-140px) skewX(20deg);
            filter: blur(6px);
          }
        }
        .anim-out-mirror {
          animation: outMirror 0.55s cubic-bezier(0.6, 0, 0.85, 0.2) both;
        }

        /* Sonic boom — punch + shock blur */
        @keyframes inSonic {
          0% {
            opacity: 0;
            transform: scale(0.15) translateX(400px);
            filter: blur(12px) brightness(2);
          }
          45% {
            opacity: 1;
            transform: scale(1.12) translateX(-14px);
            filter: blur(0) brightness(1.15)
              drop-shadow(0 0 0 rgba(34, 211, 238, 0));
          }
          55% {
            transform: scale(0.97) translateX(4px);
            filter: drop-shadow(0 0 24px rgba(34, 211, 238, 0.5));
          }
          100% {
            opacity: 1;
            transform: scale(1) translateX(0);
            filter: brightness(1) drop-shadow(0 0 0 rgba(34, 211, 238, 0));
          }
        }
        .anim-in-sonic {
          animation: inSonic 0.7s cubic-bezier(0.15, 0.95, 0.2, 1) both;
        }

        /* Icy shatter */
        @keyframes inIcy {
          0% {
            opacity: 0;
            transform: translateY(-120px) scale(0.6) rotate(-12deg);
            filter: blur(6px) brightness(1.8) hue-rotate(160deg)
              drop-shadow(0 0 0 rgba(180, 240, 255, 0));
          }
          70% {
            opacity: 1;
            transform: translateY(6px) scale(1.05) rotate(3deg);
            filter: blur(0) brightness(1.1) hue-rotate(0)
              drop-shadow(0 0 26px rgba(180, 240, 255, 0.85));
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1) rotate(0);
            filter: brightness(1) drop-shadow(0 0 0 rgba(180, 240, 255, 0));
          }
        }
        .anim-in-icy {
          animation: inIcy 0.8s cubic-bezier(0.22, 1.15, 0.32, 1) both;
        }
        @keyframes outShatter {
          0% {
            opacity: 1;
            transform: rotate(0) scale(1);
            filter: blur(0);
          }
          30% {
            transform: rotate(-6deg) scale(1.06);
            filter: blur(1px) brightness(1.3);
          }
          100% {
            opacity: 0;
            transform: rotate(28deg) scale(0.35) translate(40px, 70px);
            filter: blur(10px) brightness(1.6);
          }
        }
        .anim-out-shatter {
          animation: outShatter 0.55s cubic-bezier(0.55, 0, 0.8, 0.15) both;
        }

        /* Warp zoom */
        @keyframes inWarp {
          0% {
            opacity: 0;
            transform: perspective(400px) translateZ(-420px) scale(2.4)
              rotateX(12deg);
            filter: blur(14px);
          }
          70% {
            opacity: 1;
            transform: perspective(400px) translateZ(20px) scale(0.96)
              rotateX(-2deg);
            filter: blur(0);
          }
          100% {
            opacity: 1;
            transform: perspective(400px) translateZ(0) scale(1) rotateX(0);
            filter: blur(0);
          }
        }
        .anim-in-warp {
          animation: inWarp 0.85s cubic-bezier(0.2, 0.95, 0.25, 1) both;
        }
        @keyframes outWarp {
          0% {
            opacity: 1;
            transform: perspective(400px) translateZ(0) scale(1);
            filter: blur(0);
          }
          100% {
            opacity: 0;
            transform: perspective(400px) translateZ(-320px) scale(1.8)
              rotateX(-18deg);
            filter: blur(12px);
          }
        }
        .anim-out-warp {
          animation: outWarp 0.55s cubic-bezier(0.55, 0, 0.85, 0.2) both;
        }

        /* Kaiju slam */
        @keyframes inKaiju {
          0% {
            opacity: 0;
            transform: translateY(-340px) scale(1.55) rotate(-6deg);
            filter: blur(3px) drop-shadow(0 24px 0 rgba(0, 0, 0, 0.5));
          }
          72% {
            opacity: 1;
            transform: translateY(16px) scale(1.08) rotate(2deg);
            filter: blur(0) drop-shadow(0 8px 20px rgba(0, 0, 0, 0.55));
          }
          82% {
            transform: translateY(-6px) scale(0.98);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1) rotate(0);
            filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.35));
          }
        }
        .anim-in-kaiju {
          animation: inKaiju 1s cubic-bezier(0.18, 1.25, 0.28, 1) both;
        }

        /* Hologram rez / de-rez */
        @keyframes inHologram {
          0% {
            opacity: 0;
            clip-path: inset(0 0 100% 0);
            transform: translateY(-12px) scale(0.98);
            filter: brightness(1.6) hue-rotate(160deg) blur(1px);
          }
          40% {
            opacity: 0.85;
            clip-path: inset(0 0 35% 0);
          }
          100% {
            opacity: 1;
            clip-path: inset(0 0 0 0);
            transform: translateY(0) scale(1);
            filter: brightness(1) hue-rotate(0) blur(0);
          }
        }
        .anim-in-hologram {
          animation: inHologram 0.9s cubic-bezier(0.25, 0.9, 0.35, 1) both;
        }
        @keyframes outHologram {
          0% {
            opacity: 1;
            clip-path: inset(0 0 0 0);
            filter: blur(0);
          }
          100% {
            opacity: 0;
            clip-path: inset(100% 0 0 0);
            transform: translateY(8px) scale(0.96);
            filter: brightness(1.8) hue-rotate(200deg) blur(2px);
          }
        }
        .anim-out-hologram {
          animation: outHologram 0.6s cubic-bezier(0.55, 0, 0.85, 0.15) both;
        }

        /* =================== SIGNATURE =================== */

        @keyframes inOrigami {
          0% {
            opacity: 0;
            transform: rotateX(88deg) scaleY(0.08) scaleX(0.85);
            filter: brightness(0.6);
          }
          55% {
            opacity: 1;
            transform: rotateX(40deg) scaleY(0.45) scaleX(0.95);
            filter: brightness(1.1);
          }
          100% {
            opacity: 1;
            transform: rotateX(0) scaleY(1) scaleX(1);
            filter: brightness(1);
          }
        }
        .anim-in-origami {
          animation: inOrigami 1.05s cubic-bezier(0.3, 1.1, 0.35, 1) both;
        }
        @keyframes outOrigami {
          0% {
            opacity: 1;
            transform: rotateX(0) scaleY(1);
          }
          100% {
            opacity: 0;
            transform: rotateX(-92deg) scaleY(0.06) translateY(24px);
            filter: brightness(0.5);
          }
        }
        .anim-out-origami {
          animation: outOrigami 0.65s cubic-bezier(0.55, 0, 0.85, 0.2) both;
        }

        @keyframes inInkbleed {
          0% {
            opacity: 0;
            transform: scale(1.35) rotate(-4deg);
            filter: blur(14px) saturate(2.5) contrast(0.6);
          }
          65% {
            opacity: 1;
            transform: scale(0.96) rotate(1deg);
            filter: blur(2px) saturate(1.4) contrast(1.1);
          }
          100% {
            opacity: 1;
            transform: scale(1) rotate(0);
            filter: blur(0) saturate(1) contrast(1);
          }
        }
        .anim-in-inkbleed {
          animation: inInkbleed 1s cubic-bezier(0.2, 1, 0.28, 1) both;
        }
        @keyframes outInkbleed {
          0% {
            opacity: 1;
            filter: blur(0);
            transform: scale(1);
          }
          100% {
            opacity: 0;
            filter: blur(12px) saturate(2);
            transform: scale(1.25) rotate(6deg);
          }
        }
        .anim-out-inkbleed {
          animation: outInkbleed 0.65s cubic-bezier(0.5, 0, 0.85, 0.15) both;
        }

        @keyframes inDimension {
          0% {
            opacity: 0;
            transform: translate(24px, 8px) scale(0.92) rotateY(55deg);
            filter: blur(4px) drop-shadow(-16px 0 0 rgba(34, 211, 238, 0.35))
              drop-shadow(16px 0 0 rgba(168, 85, 247, 0.28));
          }
          50% {
            opacity: 0.95;
            transform: translate(-10px, -4px) scale(1.04) rotateY(-18deg);
            filter: blur(1px)
              drop-shadow(-8px 0 0 rgba(34, 211, 238, 0.2))
              drop-shadow(8px 0 0 rgba(168, 85, 247, 0.18));
          }
          100% {
            opacity: 1;
            transform: translate(0, 0) scale(1) rotateY(0);
            filter: blur(0) drop-shadow(0 0 0 transparent);
          }
        }
        .anim-in-dimension {
          animation: inDimension 1.1s cubic-bezier(0.25, 1, 0.35, 1) both;
        }
        @keyframes outDimension {
          0% {
            opacity: 1;
            transform: rotateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-20px, 12px) scale(0.85) rotateY(-70deg);
            filter: blur(8px)
              drop-shadow(0 0 20px rgba(34, 211, 238, 0.25));
          }
        }
        .anim-out-dimension {
          animation: outDimension 0.65s cubic-bezier(0.55, 0, 0.85, 0.2) both;
        }

        @keyframes inCrystal {
          0% {
            opacity: 0;
            transform: rotate(52deg) scale(0.15) skewX(-8deg);
            filter: blur(3px) brightness(1.8)
              drop-shadow(0 0 12px rgba(200, 230, 255, 0.9));
          }
          45% {
            opacity: 1;
            transform: rotate(-8deg) scale(1.05) skewX(2deg);
            filter: blur(0) brightness(1.1)
              drop-shadow(0 0 18px rgba(180, 220, 255, 0.5));
          }
          100% {
            opacity: 1;
            transform: rotate(0) scale(1) skewX(0);
            filter: brightness(1) drop-shadow(0 0 0 transparent);
          }
        }
        .anim-in-crystal {
          animation: inCrystal 1.05s cubic-bezier(0.22, 1.1, 0.32, 1) both;
        }
        @keyframes outCrystal {
          0% {
            opacity: 1;
            transform: scale(1) rotate(0);
          }
          100% {
            opacity: 0;
            transform: rotate(-40deg) scale(0.2) translate(30px, 40px);
            filter: blur(6px) brightness(1.5);
          }
        }
        .anim-out-crystal {
          animation: outCrystal 0.65s cubic-bezier(0.55, 0, 0.85, 0.15) both;
        }

        @keyframes inTimerip {
          0% {
            opacity: 0;
            transform: translateX(-70px) scale(0.9);
            filter: blur(6px);
          }
          30% {
            opacity: 0.65;
            transform: translateX(40px) scale(1.02);
            filter: blur(2px);
          }
          55% {
            opacity: 0.85;
            transform: translateX(-22px) scale(0.98);
            filter: blur(1px);
          }
          75% {
            opacity: 1;
            transform: translateX(10px) scale(1.01);
            filter: blur(0);
          }
          100% {
            opacity: 1;
            transform: translateX(0) scale(1);
            filter: blur(0);
          }
        }
        .anim-in-timerip {
          animation: inTimerip 1.15s cubic-bezier(0.25, 0.85, 0.35, 1) both;
        }
        @keyframes outTimerip {
          0% {
            opacity: 1;
            transform: translateX(0);
            filter: blur(0);
          }
          35% {
            opacity: 0.9;
            transform: translateX(-28px);
            filter: blur(3px);
          }
          70% {
            opacity: 0.5;
            transform: translateX(36px);
            filter: blur(5px);
          }
          100% {
            opacity: 0;
            transform: translateX(-80px) scale(0.75);
            filter: blur(10px);
          }
        }
        .anim-out-timerip {
          animation: outTimerip 0.75s cubic-bezier(0.45, 0, 0.75, 0) both;
        }
      `}</style>

      <div className="w-full max-w-none px-6 sm:px-8 py-10">
        <header className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight">CSS Deal Animation Lab</h1>
          <p className="text-slate-400 mt-2">
            Hover any felt preview to run deal-in, then deal-out. Tap or focus works too.
          </p>
          <p className="text-slate-500 text-sm mt-1">
            <a className="text-emerald-300 hover:underline" href="/css-test/poker">
              → Poker 10-seat deal animation lab
            </a>
          </p>
        </header>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-5 flex items-center gap-3">
            <span className="inline-block w-2 h-6 bg-emerald-400 rounded-sm" />
            Realistic
          </h2>
          <div className="grid w-full min-w-0 grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-5 [&>*]:min-w-0">
            {realistic.map((def) => (
              <AnimationDemo key={def.id} def={def} />
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-5 flex items-center gap-3">
            <span className="inline-block w-2 h-6 bg-fuchsia-400 rounded-sm" />
            Epic
          </h2>
          <div className="grid w-full min-w-0 grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-5 [&>*]:min-w-0">
            {epic.map((def) => (
              <AnimationDemo key={def.id} def={def} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-5 flex items-center gap-3">
            <span className="inline-block w-2 h-6 bg-cyan-400 rounded-sm" />
            Signature
          </h2>
          <div className="grid w-full min-w-0 grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-5 [&>*]:min-w-0">
            {signature.map((def) => (
              <AnimationDemo key={def.id} def={def} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
