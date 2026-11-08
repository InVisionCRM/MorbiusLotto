'use client';

/**
 * GameLauncherSheet — bottom sheet opened by the Pit Rail dock's GAMES slot.
 * Search input + 3-col grid of mini game tiles (the same art as The Floor);
 * tapping a tile navigates to the game route.
 *
 * Open/close: toggles an `open` class on its own veil + panel
 * (`.home2 .sheet.open` / `.home2 .sheet-veil.open`) — see nav.tsx.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { FLOOR_GAMES } from './scenes';
import { GameTile } from './game-tile';

export interface GameLauncherSheetProps {
  open: boolean;
  onClose?: () => void;
}

export function GameLauncherSheet({ open, onClose }: GameLauncherSheetProps) {
  const [q, setQ] = useState('');

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
      <div className={`sheet launcher${open ? ' open' : ''}`} aria-hidden={!open}>
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
            <GameTile key={g.key} game={g} badge={null} className="gl-tile" onClick={onClose} />
          ))}
          {games.length === 0 && <div className="gl-empty">No games match &ldquo;{q}&rdquo;</div>}
        </div>
      </div>
    </>
  );
}
