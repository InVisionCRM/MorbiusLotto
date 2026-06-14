'use client';

/**
 * ChickenRoad — the Deep-Sea Neon lane road for /chicken.
 *
 * Renders a scrolling road: a curb, `lanes` crossing lanes (each posting the
 * ×100 multiplier you'd hold after clearing it), then a finish strip. The
 * chicken is absolutely positioned and re-centred on its lane by measuring the
 * real lane geometry from the DOM (offsetLeft + offsetWidth/2) — never from the
 * clamp() lane-width token, so it stays centred at every viewport width.
 *
 * Interaction mirrors Towers' board: the next lane is the clickable surface
 * (tap to step). Cash-out lives in the control rail. On settle the parent
 * passes `bumperLanes` (every bumper, revealed) and, on a bust, `bustLane`
 * (the lane that caught the chicken) so the road can show the traffic + splat.
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { formatMultiplier } from '@/lib/chicken-client';
import './chicken.css';

interface ChickenRoadProps {
  lanes: number;
  /** Lanes crossed so far (0 = on the curb). */
  currentLane: number;
  /** ladder[L] = ×100 multiplier after L crossed lanes (index 0 = 100). */
  ladder: number[];
  /** Every bumper lane (0-based), revealed once the round settles; else null. */
  bumperLanes: number[] | null;
  /** The bumper lane that ended the round on a bust (0-based), else null. */
  bustLane: number | null;
  /** True when it isn't the player's turn to step (starting / settled / busy). */
  disabled: boolean;
  onStep: () => void;
}

function ChickenSprite() {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="32" cy="58" rx="15" ry="4" fill="rgba(0,0,0,.35)" />
      <path
        d="M30 8c4 0 5 3 4 6 3-1 6 1 5 4 7 1 12 8 12 17 0 11-9 19-21 19s-21-7-21-18c0-8 4-14 10-16-1-3 2-6 5-5-1-4 1-7 5-7z"
        fill="#F8FAFC"
      />
      <path d="M22 20c-2-3-1-7 2-8 1 3 0 6-2 8z" fill="#EF4444" />
      <circle cx="38" cy="30" r="3" fill="#0B1220" />
      <path d="M44 32l9-2-9 5z" fill="#F59E0B" />
      <path d="M16 40c-4 1-7 4-7 4 3 1 6 0 8-2z" fill="#22D3EE" opacity=".9" />
      <path d="M26 56l-2 6M34 56l0 6M40 55l3 6" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function CarSprite() {
  return (
    <svg viewBox="0 0 44 70" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="6" y="6" width="32" height="58" rx="9" fill="#0a1a24" stroke="#22D3EE" strokeWidth="2" />
      <rect x="11" y="12" width="22" height="13" rx="4" fill="#22D3EE" opacity=".85" />
      <rect x="11" y="42" width="22" height="12" rx="4" fill="#22D3EE" opacity=".6" />
      <circle cx="13" cy="62" r="3" fill="#fde68a" />
      <circle cx="31" cy="62" r="3" fill="#fde68a" />
    </svg>
  );
}

export function ChickenRoad({
  lanes,
  currentLane,
  ladder,
  bumperLanes,
  bustLane,
  disabled,
  onStep,
}: ChickenRoadProps) {
  const roadRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const chickenRef = useRef<HTMLDivElement>(null);
  const prevLane = useRef(currentLane);
  const prevBusted = useRef(false);

  const revealed = bumperLanes != null;
  const busted = bustLane != null;
  const won = revealed && !busted && currentLane >= lanes;
  const bumperSet = bumperLanes ? new Set(bumperLanes) : null;

  const position = useCallback(
    (animate: boolean) => {
      const road = roadRef.current;
      const track = trackRef.current;
      const chick = chickenRef.current;
      if (!road || !track || !chick) return;

      let target: HTMLElement | null;
      if (busted && bustLane != null) {
        target = track.querySelector<HTMLElement>(`[data-lane="${bustLane}"]`);
      } else if (won) {
        target = track.querySelector<HTMLElement>('[data-finish]');
      } else if (currentLane === 0) {
        target = track.querySelector<HTMLElement>('[data-curb]');
      } else {
        target = track.querySelector<HTMLElement>(`[data-lane="${currentLane - 1}"]`);
      }
      if (!target) return;

      const centerInTrack = target.offsetLeft + target.offsetWidth / 2;
      const viewport = road.clientWidth;
      const maxScroll = Math.max(0, track.scrollWidth - viewport);
      const scroll = Math.min(Math.max(0, centerInTrack - viewport * 0.3), maxScroll);
      track.style.transform = `translateX(${-scroll}px)`;

      const centerOnScreen = centerInTrack - scroll;
      const cx = centerOnScreen - chick.offsetWidth / 2;
      chick.style.setProperty('--cb-cxn', `${cx}px`);
      if (!animate) chick.style.transform = `translateX(${cx}px)`;
      road.style.setProperty('--cb-chick-x', `${(centerOnScreen / viewport) * 100}%`);
    },
    [busted, bustLane, won, currentLane],
  );

  const spawnFeathers = useCallback(() => {
    const road = roadRef.current;
    const chick = chickenRef.current;
    if (!road || !chick) return;
    const rr = road.getBoundingClientRect();
    const cr = chick.getBoundingClientRect();
    for (let i = 0; i < 7; i++) {
      const f = document.createElement('div');
      f.className = 'cb-feather';
      f.textContent = '🪶';
      f.style.left = `${cr.left - rr.left + cr.width / 2}px`;
      f.style.top = `${cr.top - rr.top}px`;
      f.style.setProperty('--fx', `${Math.random() * 120 - 60}px`);
      f.style.setProperty('--fy', `${-40 - Math.random() * 60}px`);
      f.style.setProperty('--fr', `${Math.random() * 360 - 180}deg`);
      road.appendChild(f);
      window.setTimeout(() => f.remove(), 720);
    }
  }, []);

  useLayoutEffect(() => {
    const chick = chickenRef.current;
    const advanced = currentLane > prevLane.current;
    const freshBust = busted && !prevBusted.current;
    const animate = (advanced || freshBust) && !!chick;

    if (animate && chick) {
      chick.classList.remove('splat');
      chick.style.setProperty('--cb-cx', chick.style.getPropertyValue('--cb-cxn') || '0px');
    }
    position(animate);

    const timers: number[] = [];
    if (animate && chick) {
      chick.classList.add('hop');
      timers.push(window.setTimeout(() => chick.classList.remove('hop'), 300));
      if (freshBust) {
        timers.push(
          window.setTimeout(() => {
            chick.classList.add('splat');
            spawnFeathers();
          }, 280),
        );
      }
    }
    prevLane.current = currentLane;
    prevBusted.current = busted;
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [currentLane, lanes, busted, won, bustLane, position, spawnFeathers]);

  useEffect(() => {
    const onResize = () => position(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [position]);

  const laneIndices = Array.from({ length: lanes }, (_, i) => i);

  return (
    <div className="chicken-board">
      <div className="cb-road" ref={roadRef}>
        <div className="cb-track" ref={trackRef}>
          <div className="cb-lane curb" data-curb />
          {laneIndices.map((i) => {
            const cleared = i < currentLane;
            const isNext = !revealed && i === currentLane;
            const isBumper = bumperSet?.has(i) ?? false;
            const isHit = busted && i === bustLane;
            const showAmbient = !revealed && i > currentLane && (i - currentLane) % 3 === 1;
            return (
              <div
                key={i}
                data-lane={i}
                className={['cb-lane', cleared ? 'cleared' : '', isNext ? 'next' : ''].join(' ').trim()}
                onClick={isNext && !disabled ? onStep : undefined}
                role={isNext && !disabled ? 'button' : undefined}
                aria-label={isNext && !disabled ? `Cross to ×${(ladder[i + 1] ?? 100) / 100}` : undefined}
              >
                <span className="cb-mult">{formatMultiplier(ladder[i + 1] ?? 100)}</span>
                {cleared && <span className="cb-tick">✓</span>}
                {isBumper && (
                  <div className={`cb-car ${isHit ? 'zoom' : 'parked'}`}>
                    <CarSprite />
                  </div>
                )}
                {showAmbient && (
                  <div
                    className="cb-car ambient"
                    style={{ animationDuration: `${2.6 + (i % 4) * 0.5}s`, animationDelay: `${(i % 5) * 0.4}s` }}
                  >
                    <CarSprite />
                  </div>
                )}
              </div>
            );
          })}
          <div className="cb-lane finish" data-finish />
        </div>

        <div className={`cb-chicken ${busted ? 'splat' : ''}`} ref={chickenRef}>
          <ChickenSprite />
        </div>
      </div>
    </div>
  );
}
