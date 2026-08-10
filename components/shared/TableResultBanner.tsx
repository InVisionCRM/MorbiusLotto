'use client';

/**
 * TableResultBanner — what the felt says once the last card is over.
 *
 * The three house-banked felts each carried their own copy of the same banner
 * markup: a bordered box, an uppercase title, a big mono number. This is that
 * banner, once, with one difference — a paying hand gets the animated word
 * instead of a line of type, sized by tier.
 *
 * A win is deliberately not boxed. The border and plate exist to hold a small
 * caption together; put them behind a 60px slab of extruded gold and they only
 * crop it. Losses and pushes keep the plate, because a quiet result needs the
 * containment to read at all.
 */

import { TableWinText, winTextForTier } from '@/components/shared/TableWinText';
import type { WinTier } from '@/components/shared/TableWinFx';

export interface TableResultBannerProps {
  /** Null hides the banner entirely. */
  kind: 'win' | 'loss' | 'push' | null;
  /** How the hand finished — "Dealer doesn't qualify", "Folded", etc. */
  title: string;
  /** The signed amount, already formatted. */
  value: string;
  /** Drives the word and how theatrically it arrives. */
  tier?: WinTier | null;
  /** Re-runs the animation on a new hand rather than leaving it landed. */
  round?: string | number;
}

export function TableResultBanner({ kind, title, value, tier, round }: TableResultBannerProps) {
  if (!kind) return null;

  const paying = kind === 'win' && (tier === 'small' || tier === 'big' || tier === 'huge');

  if (paying) {
    const { text, variant, shockwave } = winTextForTier(tier, round ?? 0);
    // All three felts use this exact string as their generic "nothing more to
    // say about it" win title. Under a word that already says WIN it is just
    // the same sentence twice, so it goes — while the titles that carry real
    // information ("Dealer doesn't qualify", "Blackjack!", "Folded · Trips
    // hit") stay.
    const caption = title === 'You win' ? '' : title;
    return (
      <div className="pointer-events-none absolute inset-0 grid place-items-center px-3">
        {/* Wins are not boxed, so nothing else separates the word from the
            cards it lands over. This darkens what's behind it just enough that
            the caption and the number stay readable against a face card. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 62% 46% at 50% 50%,rgba(3,10,16,.82),rgba(3,10,16,.45) 55%,transparent 78%)',
          }}
          aria-hidden
        />
        <div className="relative text-center">
          {/* Why it paid, when that isn't obvious from the cards. */}
          {caption && (
            <div className="mb-1 text-[11px] uppercase tracking-[0.22em] text-amber-200/80">
              {caption}
            </div>
          )}
          <TableWinText
            text={text}
            variant={variant}
            shockwave={shockwave}
            palette="gold"
            replayKey={`${round ?? ''}:${text}`}
            size={
              tier === 'huge'
                ? 'clamp(34px, 10vw, 64px)'
                : tier === 'big'
                  ? 'clamp(30px, 8.5vw, 54px)'
                  : 'clamp(26px, 7vw, 44px)'
            }
          />
          <div
            className="arc-mono mt-1.5 font-bold text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]"
            style={{ fontSize: 'clamp(18px,5vw,28px)' }}
          >
            {value}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div
        className={`tbl-banner-in rounded-2xl px-7 py-4 text-center ${
          kind === 'loss' ? 'border border-rose-400/40' : 'border border-slate-400/35'
        }`}
        style={{
          background:
            kind === 'loss'
              ? 'radial-gradient(ellipse at center,rgba(251,113,133,.16),rgba(4,12,19,.65))'
              : 'radial-gradient(ellipse at center,rgba(148,163,184,.16),rgba(4,12,19,.6))',
        }}
      >
        <div
          className={`text-[12px] uppercase tracking-[0.22em] ${
            kind === 'loss' ? 'text-rose-400' : 'text-slate-400'
          }`}
        >
          {title}
        </div>
        <div className="arc-mono mt-1 font-bold text-white" style={{ fontSize: 'clamp(24px,7vw,38px)' }}>
          {value}
        </div>
      </div>
    </div>
  );
}
