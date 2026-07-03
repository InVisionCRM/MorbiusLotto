'use client';

/**
 * GameLauncherSheet — bottom sheet opened by the Pit Rail dock's GAMES slot.
 * Search input + 3-col grid of mini game cards (Scene thumbnails from
 * FLOOR_GAMES); tapping a card navigates to the game route.
 *
 * Open/close: toggles an `open` class on its own veil + panel
 * (`.home2 .sheet.open` / `.home2 .sheet-veil.open`) — see nav.tsx.
 */

import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FLOOR_GAMES } from './scenes';

export interface GameLauncherSheetProps {
  open: boolean;
  onClose?: () => void;
}

export function GameLauncherSheet({ open, onClose }: GameLauncherSheetProps) {
  const [q, setQ] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  /* owner: the game menu must not be animated — freeze the SMIL animations
     inside every scene thumbnail (CSS can't stop <animate> elements) */
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelectorAll('svg').forEach((s) => {
      try {
        (s as SVGSVGElement).pauseAnimations();
      } catch {
        /* older engines without SMIL API — nothing to pause */
      }
    });
  }, [open, q]);

  /* reset the filter whenever the sheet closes */
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const games = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? FLOOR_GAMES.filter((g) => g.name.toLowerCase().includes(s)) : FLOOR_GAMES;
  }, [q]);

  return (
    <>
      <div className={`sheet-veil gl-veil${open ? ' open' : ''}`} aria-hidden={!open} onClick={onClose}></div>
      <div ref={panelRef} className={`sheet launcher${open ? ' open' : ''}`} aria-hidden={!open}>
        <div className="grab"></div>
        <h3>All games</h3>
        <div className="sub">{FLOOR_GAMES.length} games, one chip — tap to play</div>
        <input
          className="gl-search"
          type="search"
          placeholder="Search games…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search games"
        />
        <div className="gl-grid">
          {games.map((g) => (
            <Link key={g.key} href={g.href} className="gl-card" onClick={onClose}>
              <span className="gl-stage">
                <g.Scene />
              </span>
              <span className={`gl-name ${g.fontClass}`} style={{ fontSize: '10px' }}>
                {g.name}
              </span>
            </Link>
          ))}
          {games.length === 0 && <div className="gl-empty">No games match &ldquo;{q}&rdquo;</div>}
        </div>
      </div>
    </>
  );
}
