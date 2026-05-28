'use client';

/**
 * Slim top bar for the mobile-landscape poker layout.
 *
 * Replaces the desktop tournament-HUD sidebar, promo banner, and token-info
 * row at narrow viewports. Sits flush against the top of the table area.
 *
 * Layout:
 *
 *   [≡]  25/50  04:23  #4/10        [ⓘ] [💬•] [9,975]
 *
 *   ^-- left cluster ----^           ^-- right cluster --^
 *
 * Buttons:
 *   - ≡           menu (settings, leave, etc.) → onMenuClick
 *   - ⓘ           hand info (pot odds, history) → onHandInfoClick
 *   - 💬           chat / activity drawer (unread dot when chatUnreadCount > 0) → onChatClick
 *
 * Heights: target 28px so the table gets the rest of the screen back.
 */

import React from 'react';

type Props = {
  /** "25/50" — already-formatted blind string. */
  blinds?: string | null;
  /** "04:23" — countdown to next level. Hidden when null. */
  levelCountdown?: string | null;
  /** Current tournament rank, e.g. 4. Hidden when null. */
  rank?: number | null;
  /** Total players left in the tournament. Hidden when null. */
  playersLeft?: number | null;
  /** "9,975" — already-formatted hero stack. Hidden when null. */
  stack?: string | null;
  /** Unread chat message count. Drives the red dot on the chat icon. */
  chatUnreadCount?: number;
  /** Open settings / leave menu. */
  onMenuClick?: () => void;
  /** Open hand info overlay (pot odds, hand history, etc.). */
  onHandInfoClick?: () => void;
  /** Open the chat/activity drawer. */
  onChatClick?: () => void;
};

const btnBase =
  'flex h-6 w-6 items-center justify-center rounded-md border border-white/10 ' +
  'bg-white/[0.06] text-white/85 text-[12px] leading-none ' +
  'transition-colors hover:bg-white/10 hover:text-white active:scale-95';

const pillBase =
  'inline-flex h-6 items-center rounded-full px-2 text-[11px] font-mono font-bold leading-none whitespace-nowrap';

export function PokerMobileTopBar({
  blinds,
  levelCountdown,
  rank,
  playersLeft,
  stack,
  chatUnreadCount = 0,
  onMenuClick,
  onHandInfoClick,
  onChatClick,
}: Props) {
  return (
    <div
      role="banner"
      aria-label="Tournament status"
      className="
        pointer-events-auto absolute top-0 left-0 right-0 z-30
        flex h-7 items-center justify-between gap-2
        px-2
        bg-gradient-to-b from-black/55 via-black/25 to-transparent
      "
      style={{
        paddingLeft: 'max(0.5rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.5rem, env(safe-area-inset-right, 0px))',
      }}
    >
      {/* ── Left cluster: menu + blinds + timer + rank ── */}
      <div className="flex min-w-0 items-center gap-1.5">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Menu"
            className="text-white/60 text-[16px] leading-none px-1 hover:text-white transition-colors"
          >
            ≡
          </button>
        )}
        {blinds && (
          <span className="font-mono text-[11px] font-bold text-amber-300 leading-none whitespace-nowrap">
            {blinds}
          </span>
        )}
        {levelCountdown && (
          <span className="font-mono text-[11px] text-white/55 leading-none whitespace-nowrap">
            {levelCountdown}
          </span>
        )}
        {rank != null && (
          <span
            className="
              inline-flex items-center rounded-full px-1.5 py-0.5
              text-[10px] font-semibold leading-none
              text-violet-200
              border border-violet-400/35 bg-violet-500/15
            "
          >
            #{rank}
            {playersLeft != null && (
              <span className="ml-0.5 text-violet-200/60"> / {playersLeft}</span>
            )}
          </span>
        )}
      </div>

      {/* ── Right cluster: info + chat + stack ── */}
      <div className="flex items-center gap-1.5">
        {onHandInfoClick && (
          <button
            type="button"
            onClick={onHandInfoClick}
            aria-label="Hand info"
            className={btnBase}
          >
            <span aria-hidden>ⓘ</span>
          </button>
        )}
        {onChatClick && (
          <button
            type="button"
            onClick={onChatClick}
            aria-label={
              chatUnreadCount > 0
                ? `Chat — ${chatUnreadCount} unread`
                : 'Chat'
            }
            className={`${btnBase} relative`}
          >
            <span aria-hidden>💬</span>
            {chatUnreadCount > 0 && (
              <span
                aria-hidden
                className="
                  absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full
                  bg-rose-500 ring-2 ring-[#0a0c14]
                "
              />
            )}
          </button>
        )}
        {stack && (
          <span
            className={`${pillBase} border border-amber-400/30 bg-amber-400/12 text-amber-300`}
          >
            {stack}
          </span>
        )}
      </div>
    </div>
  );
}

export default PokerMobileTopBar;
