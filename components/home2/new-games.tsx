'use client';

/**
 * NewGames — the "just landed" shelf that sits above the floor.
 *
 * Shows the most recently shipped games, newest first. Recency is not a
 * hand-kept list: every entry in FLOOR_GAMES carries `addedAt` (the date its
 * route first landed in the repo), so adding a game to the catalog puts it at
 * the head of this rail automatically and drops the oldest one off the end.
 *
 * The rail auto-advances one card at a time and loops. It pauses while the
 * pointer is over it, while a finger is on it, while the tab is hidden, and
 * whenever the viewer has asked for reduced motion — an ad that keeps moving
 * under your thumb is the thing people hate about carousels. It is also a
 * plain scroller underneath: the cards live in a scroll-snap track, so swipe
 * and keyboard scrolling work whether or not the timer is running.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { FLOOR_GAMES } from './scenes';

/** How many of the newest games the rail carries. */
const RAIL_SIZE = 10;
/** Dwell time per card before the rail steps on. */
const STEP_MS = 3200;

function daysSince(iso: string, now: number): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.floor((now - t) / 86_400_000);
}

/** "NEW" for the first fortnight, then a quiet age stamp. */
function freshness(iso: string, now: number): { label: string; hot: boolean } | null {
  const d = daysSince(iso, now);
  if (!Number.isFinite(d)) return null;
  if (d <= 14) return { label: 'NEW', hot: true };
  if (d <= 60) return { label: `${Math.max(1, Math.round(d / 7))}w ago`, hot: false };
  return null;
}

export function NewGames() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(false);

  /* Newest first. Ties (a batch shipped the same day) keep catalog order,
     which is the order they were authored in — stable across renders. */
  const games = useMemo(
    () =>
      [...FLOOR_GAMES]
        .map((g, i) => ({ g, i }))
        .sort((a, b) => (a.g.addedAt === b.g.addedAt ? a.i - b.i : a.g.addedAt < b.g.addedAt ? 1 : -1))
        .slice(0, RAIL_SIZE)
        .map((x) => x.g),
    [],
  );

  /* Date-dependent labels are computed after mount so the server and the
     first client render agree (otherwise a day boundary hydration-mismatches). */
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  const step = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('.ng-card');
    if (!card) return;
    const gap = parseFloat(getComputedStyle(el).columnGap || '0') || 0;
    const stride = card.offsetWidth + gap;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - stride * 0.5;
    el.scrollTo({ left: atEnd ? 0 : el.scrollLeft + stride, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      step();
    }, STEP_MS);
    return () => clearInterval(id);
  }, [paused, step]);

  if (games.length === 0) return null;

  return (
    <section className="zone ng-zone">
      <div className="zone-head">
        <h2>
          JUST <em>LANDED</em>
        </h2>
      </div>
      <div
        className="ng-track"
        ref={trackRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        {games.map((g) => {
          const fresh = now == null ? null : freshness(g.addedAt, now);
          const style = (g.glow ? ({ '--glow': g.glow } as React.CSSProperties) : undefined);
          return (
            <Link key={g.key} href={g.href} className="ng-card scene-card" style={style}>
              {fresh && <span className={`badge ${fresh.hot ? 'new' : 'feat'}`}>{fresh.label}</span>}
              <div className="stage">
                <g.Scene />
              </div>
              <div className="meta">
                <div className={`name ${g.fontClass}`} style={{ fontSize: g.nameSize }}>
                  {g.name}
                </div>
                <div className="row">
                  <span className="st">{g.blurb}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
