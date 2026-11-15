'use client';

/**
 * GameTile — one Chronograph "reference" card.
 *
 * Port of the option-11 mockup's `.card`: a numbered reference, the game art
 * set inside a watch dial (tick ring, glass highlight, gold hand that sweeps
 * on hover), then a live badge, the title lockup and the blurb. Nothing is
 * baked into the art — /home2/clean/<key>.webp is title-free — so every title
 * is HTML set in that game's own lockup (components/home2/card-styles.ts).
 *
 * Used by The Collection, the Just Landed rail and the game launcher sheet
 * (`compact`: dial + title only).
 */

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { FLOOR_GAMES, type FloorGame, type TileBadgeKind } from './scenes';
import { CARD_FONTS, lockupFor, titleFit } from './card-styles';

export type TileBadge = { kind: TileBadgeKind | 'age'; label: string };

export interface GameTileProps {
  game: FloorGame;
  /** Badge to show. Defaults to the catalog's; pass null for none. */
  badge?: TileBadge | null;
  className?: string;
  onClick?: () => void;
  /** Position in its grid/rail — staggers the load-in. */
  order?: number;
  /** Launcher thumbnail: no reference number, badge or blurb. */
  compact?: boolean;
}

const refNo = (key: string) => {
  const i = FLOOR_GAMES.findIndex((g) => g.key === key);
  return String(i < 0 ? 0 : i + 1).padStart(2, '0');
};

export function GameTile({ game, badge = game.badge, className, onClick, order = 0, compact = false }: GameTileProps) {
  const l = lockupFor(game.key, game.name);
  const font = CARD_FONTS[l.font];

  const style = {
    '--d': `${Math.min(order, 9) * 70}ms`,
    '--tf': font.family,
    '--ts': `${l.size}px`,
    '--tfit': `${titleFit(l).toFixed(2)}cqw`,
    '--tw': l.weight ?? 400,
    '--tt': `${l.tracking ?? 0}em`,
    '--ttx': l.upper ? 'uppercase' : 'none',
    '--tst': l.italic ? 'italic' : 'normal',
    '--tsc': l.smallCaps ? 'small-caps' : 'normal',
    '--apos': l.pos ?? '50% 50%',
    '--az': l.zoom ?? 1,
  } as CSSProperties;

  const cls = [
    'ch-card',
    `ly-${l.arrangement}`,
    `fm-${l.frame}`,
    `tk-${l.ticks ?? 'steel'}`,
    `hd-${l.hand ?? 'gold'}`,
    compact ? 'compact' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const title =
    l.arrangement === 'split' || l.arrangement === 'inline' ? (
      <b>
        {l.title}
        {l.tail ? (
          <>
            {l.arrangement === 'split' ? ' ' : null}
            <i>{l.tail}</i>
          </>
        ) : null}
      </b>
    ) : (
      <b>{l.title}</b>
    );
  const sub = l.sub ? <em>{l.sub}</em> : null;

  return (
    <Link
      href={game.href}
      className={cls}
      style={style}
      onClick={onClick}
      aria-label={`${l.title}${l.tail ? ` ${l.tail}` : ''} — ${game.blurb}`}
      data-cat={game.cat}
    >
      {!compact && <span className="num">REF. {refNo(game.key)}</span>}
      {!compact && (
        <span className="gt-info" aria-hidden="true">
          i
        </span>
      )}
      <span className="dial">
        <span className="pic">
          <img
            className={`art fx-${l.tone}`}
            src={`/home2/clean/${game.key}.webp`}
            alt=""
            width={432}
            height={330}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
          <i className="ov" />
        </span>
        <i className="hand" />
        <i className="pin" />
      </span>
      {!compact && (
        <span className={`badge${badge ? ` b-${badge.kind}` : ' none'}`}>
          {badge?.kind === 'live' && <i className="dot" />}
          {badge ? badge.label : ' '}
        </span>
      )}
      <span className="ttl">
        {l.arrangement === 'sub' ? (
          <>
            {!compact && sub}
            {title}
          </>
        ) : (
          <>
            {title}
            {!compact && sub}
          </>
        )}
      </span>
      {!compact && <span className="blurb">{game.blurb}</span>}
    </Link>
  );
}
