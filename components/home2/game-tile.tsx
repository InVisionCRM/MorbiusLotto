'use client';

/**
 * GameTile — one lobby tile in the FanDuel-style art system.
 *
 * The art is a pre-rendered image at /home2/tiles/<key>.webp (432×544, 108:136),
 * with the game's title and tagline painted into it. The corner ribbon and the
 * ⓘ mark sit on top as live HTML, so they stay crisp at every size and change
 * with the catalog without re-rendering art. Both are sized in cqw against the
 * tile, so a launcher thumbnail and a floor card keep the same proportions.
 *
 * Used by The Floor, the Just Landed rail and the game launcher sheet.
 */

import Link from 'next/link';
import type { FloorGame, TileBadgeKind } from './scenes';

export type TileBadge = { kind: TileBadgeKind | 'age'; label: string };

export interface GameTileProps {
  game: FloorGame;
  /** Ribbon to show. Defaults to the catalog's; pass null for none. */
  badge?: TileBadge | null;
  className?: string;
  onClick?: () => void;
}

export function GameTile({ game, badge = game.badge, className, onClick }: GameTileProps) {
  return (
    <Link
      href={game.href}
      className={className ? `game-tile ${className}` : 'game-tile'}
      onClick={onClick}
      aria-label={`${game.name} — ${game.blurb}`}
      data-cat={game.cat}
    >
      <img
        className="gt-art"
        src={`/home2/tiles/${game.key}.webp`}
        alt=""
        width={432}
        height={544}
        loading="lazy"
        decoding="async"
        draggable={false}
      />
      {badge && (
        <span className={`gt-badge ${badge.kind}`}>
          {badge.kind === 'exclusive' && <img className="gt-mark" src="/home2/m-mark.png" alt="" />}
          {badge.kind === 'live' && <i className="gt-dot" />}
          {badge.label}
        </span>
      )}
      <span className="gt-info" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10.6" fill="rgba(0,0,0,.12)" stroke="#fff" strokeOpacity=".9" strokeWidth="1.4" />
          <circle cx="12" cy="7.4" r="1.25" fill="#fff" />
          <rect x="11.15" y="10" width="1.7" height="7.6" rx=".85" fill="#fff" />
        </svg>
      </span>
    </Link>
  );
}
