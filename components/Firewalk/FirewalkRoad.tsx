'use client';

/**
 * FirewalkRoad — the Deep-Sea Neon crumbling-stone crossing for /firewalk.
 *
 * Faithful port of public/firewalk-lab.html's play area: a glowing bed of coals,
 * rising embers and heat haze, and a scrolling row of stones (each posting the
 * ×100 multiplier you'd hold after crossing it). A cyan walker is absolutely
 * positioned and re-centred on its stone by measuring the real stone geometry
 * from the DOM (offsetLeft + offsetWidth/2) — never from the clamp() stone-width
 * token — so it stays centred at every viewport width.
 *
 * Interaction mirrors Chicken's road: the next stone is the clickable surface
 * (tap to step at the current pace); the stones inside the staged leap glow so
 * you can see how far you're committing. Cash-out lives in the control rail. On
 * settle the parent passes `crumbleStones` (every crumble, revealed) and, on a
 * bust, `bustStone` (the stone the walker fell through) so the road can crumble
 * it and drop the walker into the coals.
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { formatMultiplier, type FirewalkPace } from '@/lib/firewalk-client';
import './firewalk.css';

interface FirewalkRoadProps {
  stones: number;
  /** Stones crossed so far (0 = on the starting ledge). */
  position: number;
  /** ladder[N] = ×100 multiplier after N crossed stones (index 0 = 100). */
  ladder: number[];
  /** The selected pace (1/2/3) — drives the staged-leap highlight. */
  pace: FirewalkPace;
  /** Every crumbling stone (1-based), revealed once the round settles; else null. */
  crumbleStones: number[] | null;
  /** The crumbling stone that ended the round on a bust (1-based), else null. */
  bustStone: number | null;
  /** True when it isn't the player's turn to step (starting / settled / busy). */
  disabled: boolean;
  onStep: () => void;
}

function WalkerSprite() {
  return (
    <svg viewBox="0 0 34 46" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="17" cy="44" rx="10" ry="2.5" fill="rgba(0,0,0,.4)" />
      <circle cx="17" cy="9" r="6" fill="#cbeefb" />
      <path d="M17 15c5 0 8 4 8 9v8c0 3-2 5-5 5h-6c-3 0-5-2-5-5v-8c0-5 3-9 8-9z" fill="#22D3EE" />
      <path d="M11 24l-4 8M23 24l4 7" stroke="#7be9fb" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M13 33l-2 11M21 33l2 11" stroke="#cbeefb" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Stable ember field. Positions are DETERMINISTIC (a sin-hash of the index, not
 * Math.random()) so the server and client render byte-identical markup — random
 * positions would differ between SSR and hydration and trip a React hydration
 * warning. Computed once at module load and shared by every instance.
 */
function buildEmbers() {
  const hash = (i: number, salt: number) => {
    const x = Math.sin((i + 1) * salt) * 10000;
    return x - Math.floor(x); // fractional part → pseudo-random in [0,1)
  };
  return Array.from({ length: 14 }, (_, i) => ({
    key: i,
    left: 4 + hash(i, 12.9898) * 92,
    duration: 2.4 + hash(i, 78.233) * 2.4,
    delay: hash(i, 43.7585) * 3,
  }));
}

const EMBERS = buildEmbers();

export function FirewalkRoad({
  stones,
  position,
  ladder,
  pace,
  crumbleStones,
  bustStone,
  disabled,
  onStep,
}: FirewalkRoadProps) {
  const roadRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const walkerRef = useRef<HTMLDivElement>(null);
  const prevPos = useRef(position);
  const prevBusted = useRef(false);

  const revealed = crumbleStones != null;
  const busted = bustStone != null;
  const won = revealed && !busted && position >= stones;
  const crumbleSet = crumbleStones ? new Set(crumbleStones) : null;

  // Stone indices currently in the staged leap (the next 1..pace stones).
  const leapEnd = Math.min(position + pace, stones);

  const stoneEl = useCallback((i: number): HTMLElement | null => {
    const track = trackRef.current;
    if (!track) return null;
    return i === 0
      ? track.querySelector<HTMLElement>('[data-start]')
      : track.querySelector<HTMLElement>(`[data-stone="${i}"]`);
  }, []);

  const position_ = useCallback(
    (animate: boolean) => {
      const road = roadRef.current;
      const track = trackRef.current;
      const walker = walkerRef.current;
      if (!road || !track || !walker) return;

      const target = stoneEl(position);
      if (!target) return;

      const centerInTrack = target.offsetLeft + target.offsetWidth / 2;
      const viewport = road.clientWidth;
      const maxScroll = Math.max(0, track.scrollWidth - viewport);
      const scroll = Math.min(Math.max(0, centerInTrack - viewport * 0.32), maxScroll);
      track.style.transform = `translateX(${-scroll}px)`;

      const centerOnScreen = centerInTrack - scroll;
      const wx = centerOnScreen - walker.offsetWidth / 2;
      walker.style.setProperty('--fw-wxn', `${wx}px`);
      if (!animate) walker.style.transform = `translateX(${wx}px)`;
    },
    [position, stoneEl],
  );

  useLayoutEffect(() => {
    const walker = walkerRef.current;
    const advanced = position > prevPos.current;
    const freshBust = busted && !prevBusted.current;
    const animate = (advanced || freshBust) && !!walker;

    if (animate && walker) {
      walker.classList.remove('fall');
      walker.style.setProperty('--fw-wx', walker.style.getPropertyValue('--fw-wxn') || '0px');
    }
    position_(animate);

    const timers: number[] = [];
    if (animate && walker) {
      walker.classList.add('hop');
      timers.push(
        window.setTimeout(() => {
          // Commit the resting transform to the stone the hop landed on (the
          // fw-whop keyframe has no fill-mode, so it reverts to the inline
          // transform — which position_() only writes when NOT animating).
          walker.style.transform = `translateX(${walker.style.getPropertyValue('--fw-wxn') || '0px'})`;
          walker.classList.remove('hop');
        }, 300),
      );
      if (freshBust) {
        timers.push(
          window.setTimeout(() => {
            walker.classList.add('fall');
          }, 280),
        );
      }
    }
    prevPos.current = position;
    prevBusted.current = busted;
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [position, stones, busted, won, bustStone, position_]);

  useEffect(() => {
    const onResize = () => position_(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [position_]);

  const stoneIndices = Array.from({ length: stones }, (_, i) => i + 1);

  return (
    <div className="firewalk-board">
      <div className="fw-road" ref={roadRef}>
        <div className="fw-heat" />
        <div className="fw-embers">
          {EMBERS.map((e) => (
            <span
              key={e.key}
              className="fw-ember"
              style={{
                left: `${e.left}%`,
                animationDuration: `${e.duration}s`,
                animationDelay: `${e.delay}s`,
              }}
            />
          ))}
        </div>

        <div className="fw-track" ref={trackRef}>
          <div className="fw-stone start" data-start />
          {stoneIndices.map((s) => {
            const crossed = s <= position && !(busted && s === bustStone);
            const isNext = !revealed && s === position + 1;
            const isLeap = !revealed && s > position + 1 && s <= leapEnd;
            const isCrumble = crumbleSet?.has(s) ?? false;
            const isHit = busted && s === bustStone;
            const cls = [
              'fw-stone',
              crossed ? 'safe' : '',
              isNext ? 'next' : '',
              isLeap ? 'leap' : '',
              isHit ? 'gone' : '',
            ]
              .join(' ')
              .trim();
            return (
              <div
                key={s}
                data-stone={s}
                className={cls}
                onClick={isNext && !disabled ? onStep : undefined}
                role={isNext && !disabled ? 'button' : undefined}
                aria-label={isNext && !disabled ? `Step to ×${(ladder[leapEnd] ?? 100) / 100}` : undefined}
              >
                <span className="fw-mv">{formatMultiplier(ladder[s] ?? 100)}</span>
              </div>
            );
          })}
        </div>

        <div className="fw-walker" ref={walkerRef}>
          <WalkerSprite />
        </div>

        <div className="fw-coalbar" />
      </div>
    </div>
  );
}
