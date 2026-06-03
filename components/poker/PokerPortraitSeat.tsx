'use client';

/**
 * Portrait seat — faithful reproduction of the poker-mobile-lab seat, wired to real data.
 * Uses the real AvatarView + the real card art (/BlackJack/Cards/PNG), arranged exactly like
 * the lab: avatar with acting/winner/sitting-out treatment, bet pill centered on the avatar's
 * top edge, nameplate below (gold stack). Opponent cards are two clean, separated cards tucked
 * tight on the inward side — small backs during play, grown face-up at showdown, hero hand large.
 * Styling lives in globals.css under `.pps*`. Rendered by PokerTable when layoutVariant==='portrait'.
 */

import { memo, type ComponentProps } from 'react';
import { AvatarView } from '@/components/avatar';
import { formatChips } from '@/lib/format-poker-chips';
import type { PokerTableState } from '@/lib/websocket-client';

type Seat = PokerTableState['seats'][number];

/**
 * Memoized avatar — the heavy animated AvatarPreview (idle/eye-roam timers, ~700 lines) must
 * NOT re-render on every WS state tick. A seat's avatar only changes when the occupant or their
 * sit-out state changes, so we key on `configKey` (player address) + `sittingOut` and ignore the
 * per-tick-fresh `config` object reference. Stops ~10 avatar re-renders per server update.
 */
const PortraitSeatAvatar = memo(
  function PortraitSeatAvatar({
    config,
    sittingOut,
    fallbackChar,
  }: {
    config: ComponentProps<typeof AvatarView>['config'];
    configKey?: string | null;
    sittingOut: boolean;
    fallbackChar: string;
  }) {
    return config
      ? <AvatarView config={config} compact forceAsleep={sittingOut} className="w-full h-full" />
      : <span>{fallbackChar}</span>;
  },
  (a, b) =>
    a.configKey === b.configKey && a.sittingOut === b.sittingOut && a.fallbackChar === b.fallbackChar,
);

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['C', 'D', 'H', 'S'];
/** 0–51 cardIndex → the same PNG the lab + CardDisplay use. */
function cardSrc(i: number): string {
  return `/BlackJack/Cards/PNG/${RANKS[i % 13]}${SUITS[Math.floor(i / 13)]}.png`;
}

export interface PokerPortraitSeatProps {
  seat: Seat;
  index: number;
  holeCards?: number[] | null;
  isCurrentPlayer?: boolean;
  showCardBacks?: boolean;
  isHandWinner?: boolean;
  handName?: string;
  /** Cards tuck/peek to the right (left-wall seats) when true, else left. From the seat anchor's fx. */
  inwardRight?: boolean;
  cardBackSrc?: string | null;
  /** Quick-chat reaction or chat message to float over the seat (transient). */
  bubble?: string | null;
}

function CardBack({ src }: { src?: string | null }) {
  return src ? <img className="pps-cardimg" src={src} alt="" /> : <div className="pps-cardback" />;
}

export function PokerPortraitSeat({
  seat,
  holeCards,
  isCurrentPlayer = false,
  showCardBacks = false,
  isHandWinner = false,
  handName,
  inwardRight = true,
  cardBackSrc,
  bubble,
}: PokerPortraitSeatProps) {
  if (!seat.playerAddress) {
    return (
      <div className="pps-empty"><span>Open<br />seat</span></div>
    );
  }

  const sittingOut = seat.status === 'sitting_out';
  const folded = !!seat.folded;
  const acting = !!seat.isActing && !folded;
  const name = isCurrentPlayer
    ? 'You'
    : seat.displayName || `${seat.playerAddress.slice(0, 6)}…`;
  const stack = formatChips(seat.stack ?? '0');
  const bet = seat.currentBet && seat.currentBet !== '0' ? formatChips(seat.currentBet) : null;

  const cards = (holeCards ?? []).slice(0, 2);
  const showHero = isCurrentPlayer && cards.length > 0;
  const showReveal = !isCurrentPlayer && cards.length > 0 && !folded;
  const showTuck = showCardBacks && !showReveal && !showHero && !folded;

  const cls = ['pps', acting && 'acting', isHandWinner && 'winner', sittingOut && 'sitting_out', folded && 'folded']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls}>
      {/* Hero hand — large, rising behind the dock (felt-wrap clips the lower half). */}
      {showHero && (
        <div className="pps-hero-cards">
          {cards.map((c, ci) => <img key={ci} className="pps-herocard" src={cardSrc(c)} alt="" />)}
        </div>
      )}

      <div className="pps-ava-wrap">
        {showTuck && (
          <div className={`pps-cards tuck ${inwardRight ? 'peek-right' : 'peek-left'}`}>
            <CardBack src={cardBackSrc} />
            <CardBack src={cardBackSrc} />
          </div>
        )}
        {showReveal && (
          <div className={`pps-cards reveal ${inwardRight ? 'peek-right' : 'peek-left'}`}>
            {cards.map((c, ci) => <img key={ci} className="pps-cardimg" src={cardSrc(c)} alt="" />)}
          </div>
        )}

        <div className="pps-ava">
          <PortraitSeatAvatar
            config={seat.avatarConfig}
            configKey={seat.playerAddress}
            sittingOut={sittingOut}
            fallbackChar={name.slice(0, 1).toUpperCase()}
          />
        </div>

        {isHandWinner && <div className="pps-win">🏆</div>}
        {bet && <div className="pps-bet"><span className="pps-chip" />{bet}</div>}
        {bubble && <div className="pps-bubble">{bubble}</div>}
      </div>

      <div className="pps-name">
        <span className="pps-nm">{name}</span>
        <span className="pps-st">{stack}</span>
      </div>
      {isHandWinner && handName ? <div className="pps-tag win">{handName}</div>
        : sittingOut ? <div className="pps-tag">Sitting out</div> : null}
    </div>
  );
}
