'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import PlayingCard from '@/components/BLACKJACK/PlayingCard';
import type { Card, Suit } from '@/app/BLACKJACK/types';

type AnimationDef = {
  id: string;
  name: string;
  description: string;
  category: 'realistic' | 'epic';
  /** how the card travels from center to seat */
  travel: 'straight' | 'spin' | 'arc' | 'lightspeed' | 'shockwave' | 'portal' | 'meteor' | 'neon' | 'warp' | 'cascade';
  /** duration of per-card animation in seconds */
  duration: number;
  /** delay between each card in seconds */
  stagger: number;
  /** css easing */
  easing: string;
};

const ANIMATIONS: AnimationDef[] = [
  // --- REALISTIC (5) ---
  {
    id: 'pro-pitch',
    name: 'Pro Pitch',
    description: 'Crisp flat glide from deck to seat — the standard casino pitch.',
    category: 'realistic',
    travel: 'straight',
    duration: 0.55,
    stagger: 0.09,
    easing: 'cubic-bezier(0.3, 0.9, 0.35, 1)',
  },
  {
    id: 'spin-pitch',
    name: 'Spin Pitch',
    description: 'Cards spin naturally as they slide outward — like a real wrist-flick deal.',
    category: 'realistic',
    travel: 'spin',
    duration: 0.6,
    stagger: 0.1,
    easing: 'cubic-bezier(0.25, 0.85, 0.3, 1)',
  },
  {
    id: 'arc-drop',
    name: 'Arc Drop',
    description: 'Cards lift slightly then settle at the seat — a subtle lofted toss.',
    category: 'realistic',
    travel: 'arc',
    duration: 0.7,
    stagger: 0.11,
    easing: 'cubic-bezier(0.34, 1.2, 0.4, 1)',
  },
  {
    id: 'cascade',
    name: 'Cascade',
    description: 'Tight staggered outward cascade — feels like a pro dealer in rhythm.',
    category: 'realistic',
    travel: 'cascade',
    duration: 0.5,
    stagger: 0.06,
    easing: 'cubic-bezier(0.3, 0.9, 0.35, 1)',
  },
  {
    id: 'soft-slide',
    name: 'Soft Slide',
    description: 'Gentle fade + slide, understated and professional.',
    category: 'realistic',
    travel: 'straight',
    duration: 0.7,
    stagger: 0.12,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
  // --- EPIC (5) ---
  {
    id: 'shockwave',
    name: 'Shockwave Burst',
    description: 'Cards erupt from the center with a glow pulse and scale overshoot.',
    category: 'epic',
    travel: 'shockwave',
    duration: 0.85,
    stagger: 0.08,
    easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)',
  },
  {
    id: 'lightspeed',
    name: 'Lightspeed Fan',
    description: 'Blur-streak cards rip outward in sequence — hyperdrive deal.',
    category: 'epic',
    travel: 'lightspeed',
    duration: 0.55,
    stagger: 0.07,
    easing: 'cubic-bezier(0.2, 0.85, 0.2, 1)',
  },
  {
    id: 'portal',
    name: 'Portal Rift',
    description: 'Cards materialize from a swirling portal, hue-shift + blur reveal.',
    category: 'epic',
    travel: 'portal',
    duration: 1.0,
    stagger: 0.1,
    easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
  },
  {
    id: 'meteor',
    name: 'Meteor Shower',
    description: 'Cards streak outward spinning with an orange trail — table-wide meteor deal.',
    category: 'epic',
    travel: 'meteor',
    duration: 0.9,
    stagger: 0.07,
    easing: 'cubic-bezier(0.2, 1.1, 0.35, 1)',
  },
  {
    id: 'neon-warp',
    name: 'Neon Warp',
    description: 'Cyan/magenta 3D barrel roll with glow trail — arcade blackjack energy for poker.',
    category: 'epic',
    travel: 'neon',
    duration: 1.0,
    stagger: 0.09,
    easing: 'cubic-bezier(0.25, 1.1, 0.35, 1)',
  },
];

// 10 seats around an oval table. Percent offsets from center.
// Positive x = right, positive y = down. Ranges tuned to sit just inside the oval edge.
const SEATS: Array<{ x: number; y: number; label: string }> = [
  { x: 0, y: 42, label: 'S1' },       // bottom center
  { x: -22, y: 38, label: 'S2' },     // bottom-left
  { x: -38, y: 20, label: 'S3' },     // left-low
  { x: -44, y: -6, label: 'S4' },     // left
  { x: -32, y: -30, label: 'S5' },    // top-left
  { x: 0, y: -42, label: 'S6' },      // top center
  { x: 32, y: -30, label: 'S7' },     // top-right
  { x: 44, y: -6, label: 'S8' },      // right
  { x: 38, y: 20, label: 'S9' },      // right-low
  { x: 22, y: 38, label: 'S10' },     // bottom-right
];

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const sampleCard = (i: number): Card => ({
  suit: SUITS[i % SUITS.length],
  value: (((i * 3) % 13) + 1) as Card['value'],
});

/** Community card row: 5 cards centered horizontally, slightly above table center. */
const BOARD_COUNT = 5;
const BOARD_SPACING = 52;
const BOARD_Y = -16;
const BOARD_CARDS: Card[] = [
  { suit: 'hearts', value: 10 },
  { suit: 'spades', value: 11 },
  { suit: 'diamonds', value: 4 },
  { suit: 'clubs', value: 9 },
  { suit: 'hearts', value: 1 },
];
function boardX(i: number) {
  return i * BOARD_SPACING - ((BOARD_COUNT - 1) * BOARD_SPACING) / 2;
}

/** Dimensions of the felt area. Used to convert seat % to pixel offsets for animation. */
const FELT_W = 560;
const FELT_H = 320;

function buildKeyframes(def: AnimationDef, seat: { x: number; y: number }, uid: string) {
  // Target position in pixels relative to center of the felt.
  const tx = (seat.x / 100) * FELT_W;
  const ty = (seat.y / 100) * FELT_H;

  // Derived midpoint for arcs (lift slightly toward center)
  const midX = tx * 0.55;
  const midY = ty * 0.55 - 22; // rise

  const kfName = `kf_${uid}`;

  let keyframes = '';
  switch (def.travel) {
    case 'straight':
      keyframes = `
        @keyframes ${kfName} {
          0% { opacity: 0; transform: translate(0,0) scale(0.7); }
          30% { opacity: 1; }
          100% { opacity: 1; transform: translate(${tx}px, ${ty}px) scale(1); }
        }`;
      break;
    case 'spin':
      keyframes = `
        @keyframes ${kfName} {
          0% { opacity: 0; transform: translate(0,0) rotate(0deg) scale(0.7); }
          30% { opacity: 1; }
          100% { opacity: 1; transform: translate(${tx}px, ${ty}px) rotate(360deg) scale(1); }
        }`;
      break;
    case 'arc':
      keyframes = `
        @keyframes ${kfName} {
          0%   { opacity: 0; transform: translate(0,0) scale(0.7) rotate(0); }
          30%  { opacity: 1; }
          60%  { transform: translate(${midX}px, ${midY}px) scale(1.05) rotate(8deg); }
          100% { opacity: 1; transform: translate(${tx}px, ${ty}px) scale(1) rotate(0); }
        }`;
      break;
    case 'cascade':
      keyframes = `
        @keyframes ${kfName} {
          0%   { opacity: 0; transform: translate(0,0) scale(0.85); }
          50%  { opacity: 1; }
          100% { opacity: 1; transform: translate(${tx}px, ${ty}px) scale(1); }
        }`;
      break;
    case 'lightspeed':
      keyframes = `
        @keyframes ${kfName} {
          0%   { opacity: 0; transform: translate(0,0) scale(0.5); filter: blur(0); }
          40%  { opacity: 1; filter: blur(6px); }
          80%  { transform: translate(${tx * 1.08}px, ${ty * 1.08}px) scale(1.05); filter: blur(2px); }
          100% { opacity: 1; transform: translate(${tx}px, ${ty}px) scale(1); filter: blur(0); }
        }`;
      break;
    case 'shockwave':
      keyframes = `
        @keyframes ${kfName} {
          0%   { opacity: 0; transform: translate(0,0) scale(0.3);
                 filter: drop-shadow(0 0 0 rgba(255,200,0,0)); }
          40%  { opacity: 1; }
          70%  { transform: translate(${tx * 1.08}px, ${ty * 1.08}px) scale(1.18);
                 filter: drop-shadow(0 0 22px rgba(255,200,0,0.9)); }
          100% { opacity: 1; transform: translate(${tx}px, ${ty}px) scale(1);
                 filter: drop-shadow(0 0 0 rgba(255,200,0,0)); }
        }`;
      break;
    case 'portal':
      keyframes = `
        @keyframes ${kfName} {
          0%   { opacity: 0; transform: translate(0,0) rotate(-540deg) scale(0);
                 filter: blur(12px) hue-rotate(200deg); }
          55%  { opacity: 1; filter: blur(3px) hue-rotate(40deg); }
          100% { opacity: 1; transform: translate(${tx}px, ${ty}px) rotate(0) scale(1);
                 filter: blur(0) hue-rotate(0); }
        }`;
      break;
    case 'meteor':
      keyframes = `
        @keyframes ${kfName} {
          0%   { opacity: 0; transform: translate(0,0) rotate(-720deg) scale(0.4);
                 filter: drop-shadow(0 0 14px rgba(255,120,0,0.8)); }
          50%  { opacity: 1; }
          80%  { transform: translate(${tx * 1.08}px, ${ty * 1.08}px) rotate(60deg) scale(1.12);
                 filter: drop-shadow(0 0 20px rgba(255,160,0,0.9)); }
          100% { opacity: 1; transform: translate(${tx}px, ${ty}px) rotate(0) scale(1);
                 filter: drop-shadow(0 0 0 rgba(255,120,0,0)); }
        }`;
      break;
    case 'neon':
      keyframes = `
        @keyframes ${kfName} {
          0%   { opacity: 0; transform: translate(0,0) rotateY(720deg) scale(0.5);
                 filter: drop-shadow(0 0 0 rgba(0,255,255,0)); }
          50%  { opacity: 1;
                 filter: drop-shadow(0 0 22px rgba(0,255,255,0.95))
                         drop-shadow(0 0 44px rgba(255,0,200,0.55)); }
          85%  { transform: translate(${tx * 1.05}px, ${ty * 1.05}px) rotateY(10deg) scale(1.06); }
          100% { opacity: 1; transform: translate(${tx}px, ${ty}px) rotateY(0) scale(1);
                 filter: drop-shadow(0 0 0 rgba(0,255,255,0)); }
        }`;
      break;
    case 'warp':
      keyframes = `
        @keyframes ${kfName} {
          0%   { opacity: 0; transform: translate(0,0) scale(0.3) skewX(30deg); }
          100% { opacity: 1; transform: translate(${tx}px, ${ty}px) scale(1) skewX(0); }
        }`;
      break;
  }

  return { kfName, keyframes };
}

function PokerTableDemo({ def }: { def: AnimationDef }) {
  const [cycleKey, setCycleKey] = useState(0);
  const [boardKey, setBoardKey] = useState(0);
  const [showBoard, setShowBoard] = useState(false);
  const [boardExiting, setBoardExiting] = useState(false);
  const [dealing, setDealing] = useState(true);

  const replay = useCallback(() => {
    setDealing(true);
    setShowBoard(false);
    setBoardExiting(false);
    setCycleKey((k) => k + 1);
  }, []);

  const flop = useCallback(() => {
    setBoardExiting(false);
    setShowBoard(true);
    setBoardKey((k) => k + 1);
  }, []);

  const clearBoard = useCallback(() => {
    setBoardExiting(true);
  }, []);

  // After the out-animation finishes, unmount. Out duration = 0.5s + last stagger (4 * 0.08).
  useEffect(() => {
    if (!boardExiting) return;
    const t = setTimeout(() => {
      setShowBoard(false);
      setBoardExiting(false);
    }, 500 + 4 * 80);
    return () => clearTimeout(t);
  }, [boardExiting]);

  // After full deal completes, still leave cards in place; replay re-triggers.
  useEffect(() => {
    if (!dealing) return;
    const total = (def.duration + def.stagger * SEATS.length * 2) * 1000;
    const t = setTimeout(() => setDealing(false), total);
    return () => clearTimeout(t);
  }, [dealing, def.duration, def.stagger]);

  // Pre-build keyframes for each (seat, cardInHand) so each card has unique target.
  // Poker hole cards = 2 per seat. We stagger seat order then card order.
  const pieces = useMemo(() => {
    const uidBase = def.id;
    // Deal order: card 1 to all seats, then card 2 to all seats.
    return [0, 1].flatMap((cardIdx) =>
      SEATS.map((seat, seatIdx) => {
        const uid = `${uidBase}_${seatIdx}_${cardIdx}`;
        const { kfName, keyframes } = buildKeyframes(def, seat, uid);
        // small lateral offset so the two hole cards don't perfectly overlap
        const lateral = cardIdx === 0 ? -10 : 10;
        const dealOrder = cardIdx * SEATS.length + seatIdx;
        return {
          seatIdx,
          cardIdx,
          kfName,
          keyframes,
          lateral,
          dealOrder,
          card: sampleCard(seatIdx * 2 + cardIdx),
        };
      })
    );
  }, [def]);

  // Flip & Drop keyframes, adapted from blackjack css-test so the card lands at
  // its board position (encoded via --bx / --by CSS vars).
  const boardKeyframes = `
    @keyframes pokerBoardFlipIn {
      0%   { opacity: 0; transform: translate(var(--bx), calc(var(--by) - 180px)) rotateY(180deg) scale(0.9); }
      60%  { opacity: 1; }
      100% { opacity: 1; transform: translate(var(--bx), var(--by)) rotateY(0deg) scale(1); }
    }
    @keyframes pokerBoardFlipOut {
      0%   { opacity: 1; transform: translate(var(--bx), var(--by)) rotateX(0) scale(1); }
      100% { opacity: 0; transform: translate(var(--bx), calc(var(--by) + 60px)) rotateX(-60deg) scale(0.95); }
    }
    .poker-board-in {
      animation: pokerBoardFlipIn 0.8s cubic-bezier(0.2, 0.9, 0.25, 1) both;
      transform-style: preserve-3d;
    }
    .poker-board-out {
      animation: pokerBoardFlipOut 0.5s ease-in both;
    }
  `;

  const allKeyframes = pieces.map((p) => p.keyframes).join('\n') + '\n' + boardKeyframes;

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 backdrop-blur p-5 flex flex-col gap-4">
      <style>{allKeyframes}</style>
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-white">{def.name}</h3>
          <span
            className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              def.category === 'epic'
                ? 'border-fuchsia-400/50 text-fuchsia-300 bg-fuchsia-500/10'
                : 'border-emerald-400/50 text-emerald-300 bg-emerald-500/10'
            }`}
          >
            {def.category}
          </span>
        </div>
        <p className="text-sm text-slate-400 mt-1">{def.description}</p>
      </div>

      <div
        className="relative mx-auto"
        style={{ width: FELT_W, height: FELT_H, perspective: '1400px' }}
      >
        {/* Oval felt */}
        <div
          className="absolute inset-0 rounded-[50%] border-4 border-amber-900/70"
          style={{
            background:
              'radial-gradient(ellipse at center, #12623a 0%, #0a3d22 60%, #04180e 100%)',
            boxShadow:
              'inset 0 0 80px rgba(0,0,0,0.65), 0 20px 50px rgba(0,0,0,0.5)',
          }}
        />
        {/* Inner betting line */}
        <div
          className="absolute rounded-[50%] border border-amber-500/20 pointer-events-none"
          style={{
            top: '12%',
            left: '8%',
            right: '8%',
            bottom: '12%',
          }}
        />

        {/* Seat markers */}
        {SEATS.map((seat, i) => (
          <div
            key={`seat-${i}`}
            className="absolute text-[10px] text-amber-200/50 font-mono"
            style={{
              left: `calc(50% + ${(seat.x / 100) * FELT_W}px)`,
              top: `calc(50% + ${(seat.y / 100) * FELT_H}px)`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div
              className="w-14 h-14 rounded-full border border-amber-400/20 bg-black/20"
              style={{ transform: 'translate(0, 0)' }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              {seat.label}
            </div>
          </div>
        ))}

        {/* Dealer center marker */}
        <div
          className="absolute left-1/2 top-1/2 w-8 h-8 rounded-full bg-amber-500/10 border border-amber-400/30"
          style={{ transform: 'translate(-50%, -50%)' }}
        />

        {/* Cards */}
        <div
          key={cycleKey}
          className="absolute left-1/2 top-1/2"
          style={{ transform: 'translate(-50%, -50%)', transformStyle: 'preserve-3d' }}
        >
          {pieces.map((p) => (
            <div
              key={`${cycleKey}-${p.seatIdx}-${p.cardIdx}`}
              className="absolute"
              style={{
                left: p.lateral,
                top: 0,
                animation: `${p.kfName} ${def.duration}s ${def.easing} both`,
                animationDelay: `${p.dealOrder * def.stagger}s`,
                transformStyle: 'preserve-3d',
                transformOrigin: 'center center',
              }}
            >
              <PlayingCard
                card={p.card}
                owner="player"
                index={0}
                isNewCard={false}
                exiting={false}
                exitDelay={0}
                size="small"
              />
            </div>
          ))}

          {/* Community cards — Flip & Drop in, staggered per card. */}
          {showBoard &&
            BOARD_CARDS.map((card, i) => (
              <div
                key={`board-${boardKey}-${i}`}
                className={`absolute ${boardExiting ? 'poker-board-out' : 'poker-board-in'}`}
                style={{
                  left: 0,
                  top: 0,
                  ['--bx' as any]: `${boardX(i)}px`,
                  ['--by' as any]: `${BOARD_Y}px`,
                  animationDelay: boardExiting ? `${i * 0.08}s` : `${i * 0.12}s`,
                  transformStyle: 'preserve-3d',
                }}
              >
                <PlayingCard
                  card={card}
                  owner="player"
                  index={0}
                  isNewCard={false}
                  exiting={false}
                  exitDelay={0}
                  size="small"
                />
              </div>
            ))}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={replay}
          className="px-3 py-1.5 text-sm rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/30 transition"
        >
          Deal
        </button>
        <button
          onClick={flop}
          className="px-3 py-1.5 text-sm rounded-md bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 transition"
        >
          Flop
        </button>
        <button
          onClick={clearBoard}
          disabled={!showBoard || boardExiting}
          className="px-3 py-1.5 text-sm rounded-md bg-rose-500/20 border border-rose-400/40 text-rose-200 hover:bg-rose-500/30 transition disabled:opacity-40"
        >
          Clear board
        </button>
      </div>
    </div>
  );
}

export default function PokerAnimLab() {
  const realistic = ANIMATIONS.filter((a) => a.category === 'realistic');
  const epic = ANIMATIONS.filter((a) => a.category === 'epic');

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-[1600px] mx-auto px-6 py-10">
        <header className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight">Poker Deal Animation Lab</h1>
          <p className="text-slate-400 mt-2">
            10-seat oval table. Cards deal from dealer (center) outward to each seat. 2 hole cards per seat.
          </p>
          <p className="text-slate-500 text-sm mt-1">
            <a className="text-emerald-300 hover:underline" href="/css-test">
              ← Back to blackjack animation lab
            </a>
          </p>
        </header>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-5 flex items-center gap-3">
            <span className="inline-block w-2 h-6 bg-emerald-400 rounded-sm" />
            Realistic
          </h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {realistic.map((def) => (
              <PokerTableDemo key={def.id} def={def} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-5 flex items-center gap-3">
            <span className="inline-block w-2 h-6 bg-fuchsia-400 rounded-sm" />
            Epic
          </h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {epic.map((def) => (
              <PokerTableDemo key={def.id} def={def} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
