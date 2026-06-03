'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type React from 'react';
import type { PokerTableState } from '@/lib/websocket-client';
import { formatChips } from '@/lib/format-poker-chips';
import { toBigIntSafe } from '@/lib/safe-bigint';

interface PortraitDockTournament {
  blinds?: string | null;
  levelCountdown?: string | null;
  rank?: number | string | null;
  playersLeft?: number | null;
}

interface PokerBottomBarProps {
  fullscreen?: boolean;
  /** Mobile landscape: render the actions as a fixed RIGHT-SIDE vertical strip
   * so the felt can use the full landscape height instead of being squished
   * by a bottom bar. */
  mobileLandscape?: boolean;
  /** Mobile portrait: off-turn, show a Live Action bar (acting player · timer · last action)
   * instead of the idle betting area. On your turn, the betting controls render as normal. */
  portrait?: boolean;
  /** Portrait off-turn dock Info panel — tournament/level summary. */
  tournament?: PortraitDockTournament | null;
  /** Portrait off-turn dock Quick-Chat panel. */
  quickChatPhrases?: string[];
  onPhraseReaction?: (phrase: string) => void;
  renderedState: PokerTableState | null;
  mySeat: PokerTableState['seats'][number] | null;
  actions: React.ReactNode;
}

const POKER_TURN_SECONDS = 30;

function DockStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-md bg-white/[0.05] py-1">
      <span className="text-[8.5px] font-semibold uppercase tracking-wide text-white/40">{label}</span>
      <span className="text-[13px] font-bold tabular-nums text-white/90">{value}</span>
    </div>
  );
}

/** Off-turn dock carousel — Live · Info/Stats · Quick-Chat. Swipeable with page dots,
 * collapsible to a slim Live strip (sticky). Full chat lives in the drawer, not here. */
function PortraitDockCarousel({
  state,
  tournament,
  quickChatPhrases,
  onPhraseReaction,
}: {
  state: PokerTableState | null;
  tournament?: PortraitDockTournament | null;
  quickChatPhrases?: string[];
  onPhraseReaction?: (phrase: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [page, setPage] = useState(0);
  const pagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem('poker.portraitDockCollapsed') === '1'); } catch { /* ignore */ }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem('poker.portraitDockCollapsed', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };
  const onScroll = () => {
    const el = pagesRef.current;
    if (!el || !el.clientWidth) return;
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  };

  if (collapsed) {
    return (
      <div className="relative">
        <button type="button" onClick={toggleCollapsed} aria-label="Expand dock" className="w-full">
          <PortraitLiveBar state={state} />
        </button>
        <span className="pointer-events-none absolute right-2 top-1 text-[10px] text-white/40">▴</span>
      </div>
    );
  }

  const ranked = (state?.seats ?? [])
    .filter((s) => s.playerAddress)
    .slice()
    .sort((a, b) => {
      const x = toBigIntSafe(a.stack ?? '0');
      const y = toBigIntSafe(b.stack ?? '0');
      return x < y ? 1 : x > y ? -1 : 0;
    })
    .slice(0, 6);
  const phrases = quickChatPhrases ?? [];
  const PAGES = 3;

  return (
    <div className="relative" style={{ height: 134 }}>
      <div className="absolute right-2 top-1 z-10 flex items-center gap-2">
        <div className="flex items-center gap-1">
          {Array.from({ length: PAGES }, (_, i) => (
            <span key={i} className="rounded-full transition-all" style={{ width: page === i ? 14 : 5, height: 5, background: page === i ? '#22d3ee' : 'rgba(255,255,255,0.25)' }} />
          ))}
        </div>
        <button type="button" onClick={toggleCollapsed} aria-label="Collapse dock" className="text-[11px] text-white/45">▾</button>
      </div>
      <div
        ref={pagesRef}
        onScroll={onScroll}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {/* Page 0 — Live */}
        <div className="h-full w-full flex-[0_0_100%] snap-start">
          <PortraitLiveBar state={state} />
        </div>

        {/* Page 1 — Info / Stats: tournament summary + chip leaderboard */}
        <div className="flex h-full w-full flex-[0_0_100%] snap-start flex-col overflow-hidden px-3 pt-2.5">
          <div className="mb-1.5 flex items-stretch gap-1.5">
            <DockStat label="Blinds" value={tournament?.blinds || '—'} />
            <DockStat label="Players" value={tournament?.playersLeft != null ? String(tournament.playersLeft) : '—'} />
            <DockStat label="Rank" value={tournament?.rank != null ? `#${tournament.rank}` : '—'} />
            <DockStat label="Next lvl" value={tournament?.levelCountdown || '—'} />
          </div>
          <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/40">Chip leaderboard</div>
          <div className="flex flex-col gap-0.5 overflow-y-auto pr-1" style={{ maxHeight: 62, scrollbarWidth: 'none' }}>
            {ranked.length === 0 ? (
              <span className="text-[12px] text-white/40">No players yet.</span>
            ) : (
              ranked.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px]">
                  <span className="w-3.5 text-right text-white/40">{i + 1}</span>
                  <span className="flex-1 truncate text-white/80">{s.displayName || `${s.playerAddress?.slice(0, 6)}…`}</span>
                  <span className="tabular-nums" style={{ color: '#fde68a' }}>{formatChips(s.stack ?? '0')}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Page 2 — Quick chat (buttons only, no message feed) */}
        <div className="flex h-full w-full flex-[0_0_100%] snap-start flex-col overflow-hidden px-3 pt-2.5">
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-white/40">Quick chat</div>
          {phrases.length && onPhraseReaction ? (
            <div className="grid grid-cols-2 gap-1.5 overflow-y-auto pr-1" style={{ maxHeight: 92, scrollbarWidth: 'none' }}>
              {phrases.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPhraseReaction(p)}
                  className="truncate rounded-md border border-white/10 bg-white/[0.06] px-2 py-1.5 text-[12px] font-medium text-white/85 active:bg-white/15"
                >
                  {p}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-[12px] text-white/40">Quick chat unavailable.</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Off-turn portrait dock: who's acting, a draining timer, and the latest action. */
function PortraitLiveBar({ state, onChat }: { state: PokerTableState | null; onChat?: () => void }) {
  const hand = state?.currentHand ?? null;
  const actingPos = hand?.actingPosition ?? null;
  const acting = actingPos != null ? state?.seats?.[actingPos] ?? null : null;
  const name =
    acting?.displayName ||
    (acting?.playerAddress ? `${acting.playerAddress.slice(0, 6)}…` : null);

  const turnStartedAt = hand?.turnStartedAt ?? null;
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!turnStartedAt) { setNow(0); return; }
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [turnStartedAt]);

  let pct = 0;
  let remaining = 0;
  if (turnStartedAt && now > 0) {
    const elapsed = (now - new Date(turnStartedAt).getTime()) / 1000;
    remaining = Math.max(0, POKER_TURN_SECONDS - elapsed);
    pct = Math.max(0, Math.min(1, remaining / POKER_TURN_SECONDS));
  }

  const la = hand?.recentActions?.length
    ? hand.recentActions[hand.recentActions.length - 1]
    : hand?.lastAction ?? null;
  const laName = la ? state?.seats?.[la.position]?.displayName : null;
  const amt = la && la.amount && la.amount !== '0' ? ` ${Number(la.amount).toLocaleString()}` : '';
  const laText = la ? `${laName ?? 'Player'} ${la.action}${amt}` : 'Hand in progress';
  const urgent = remaining > 0 && remaining <= 6;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5" style={{ minHeight: 58 }}>
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold"
        style={{ background: 'rgba(34,211,238,0.14)', color: '#67e8f9', border: '1px solid rgba(34,211,238,0.3)' }}
      >
        {(name?.[0] ?? '·').toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-white">
          <span className="truncate">{name ?? 'Waiting for players'}</span>
          {name && <span className="text-[11px] font-medium text-cyan-400">acting…</span>}
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-200"
            style={{ width: `${pct * 100}%`, background: urgent ? '#f87171' : '#22d3ee' }}
          />
        </div>
        <div className="mt-1 truncate text-[11px] text-white/55">{laText}</div>
      </div>
      {turnStartedAt && (
        <div
          className="flex-shrink-0 text-[12px] font-semibold tabular-nums"
          style={{ color: urgent ? '#f87171' : 'rgba(255,255,255,0.7)' }}
        >
          {Math.ceil(remaining)}s
        </div>
      )}
      {onChat && (
        <button
          type="button"
          onClick={onChat}
          aria-label="Open chat"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.72)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 13.5a2 2 0 0 1-2 2H9l-4 3v-3.2A2 2 0 0 1 4 13.5v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}
    </div>
  );
}

const SHELL_SELECTOR = '[data-poker-shell]';

/** Measured bar height (px). Consumed by fullscreen overlay padding AND landscape CSS
 * (legacy bottom-strip path). The mobile-landscape side-strip path uses
 * `POKER_SIDE_STRIP_W` instead — the bar's height is the viewport height there. */
export const POKER_BOTTOM_RESERVE_VAR = '--poker-bottom-reserve';

/** Width of the mobile-landscape right-side action strip. Consumed by the strip itself,
 * by `PokerMobileZoomLock` (subtracted from available width when scaling the table),
 * and by the shell row's `padding-right` so the felt doesn't sit under the strip. */
export const POKER_SIDE_STRIP_W = 96;

export function PokerBottomBar({
  fullscreen = false,
  mobileLandscape = false,
  portrait = false,
  tournament,
  quickChatPhrases,
  onPhraseReaction,
  renderedState,
  mySeat,
  actions,
}: PokerBottomBarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const show = !!(renderedState && mySeat && actions);
  // Portrait off-turn: swap the idle betting area for the Live Action bar.
  const actingPos = renderedState?.currentHand?.actingPosition ?? null;
  const myTurn = actingPos != null && mySeat != null && actingPos === (mySeat.position ?? -1);
  const portraitOffTurn = portrait && !myTurn;

  // Measure the bar's height into a CSS var on the shell. Consumed by:
  //   • Fullscreen overlay: pads the main flex row by this amount (bar is absolute).
  //   • Legacy landscape bottom-strip path (no longer used now that mobile-landscape
  //     renders a side strip — see the mobileLandscape branch below).
  // Side-strip mode skips this measurement: it's a viewport-tall fixed column, not
  // a content-sized strip, and reservation is by fixed width (POKER_SIDE_STRIP_W).
  useLayoutEffect(() => {
    const shell = document.querySelector(SHELL_SELECTOR) as HTMLElement | null;
    if (!shell) return;

    const applyReserve = (px: number) => {
      shell.style.setProperty(POKER_BOTTOM_RESERVE_VAR, `${Math.max(0, Math.round(px))}px`);
    };

    if (!show || mobileLandscape) {
      applyReserve(0);
      return () => {
        shell.style.removeProperty(POKER_BOTTOM_RESERVE_VAR);
      };
    }

    const el = rootRef.current;
    if (!el) {
      applyReserve(0);
      return () => {
        shell.style.removeProperty(POKER_BOTTOM_RESERVE_VAR);
      };
    }

    const measure = () => applyReserve(el.offsetHeight);

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      shell.style.removeProperty(POKER_BOTTOM_RESERVE_VAR);
    };
  }, [show, fullscreen, mobileLandscape]);

  if (!show) return null;

  // Mobile landscape: viewport-tall right-side column. Sits over the felt's right
  // edge; the shell row reserves the matching `padding-right` so the felt scales
  // into the remaining width (handled in page.tsx).
  if (mobileLandscape) {
    return (
      <div
        ref={rootRef}
        data-poker-bottom
        data-poker-bottom-side
        className="pointer-events-auto fixed right-0 top-0 bottom-0 z-40"
        style={{
          width: POKER_SIDE_STRIP_W,
          background: 'linear-gradient(to left, rgba(5,8,20,0.92), rgba(5,8,20,0.78))',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        {actions}
      </div>
    );
  }

  if (fullscreen) {
    return (
      <div
        ref={rootRef}
        data-poker-bottom
        className="pointer-events-auto absolute bottom-0 left-0 right-0 z-40"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.75) 60%, transparent)',
        }}
      >
        <div className="px-4 pb-1 pt-2">
          <div
            className="mx-auto w-full max-w-[900px] rounded-sm px-4 py-2.5"
            style={{
              background: 'rgba(5,8,20,0.72)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            {actions}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      data-poker-bottom
      className="relative z-40 w-full shrink-0 pointer-events-auto"
      style={{
        background: 'linear-gradient(to top, rgba(0,0,0,0.35) 0%, transparent 100%)',
      }}
    >
      <div className="w-full max-sm:px-0 max-sm:pt-0 max-sm:pb-0 sm:px-3 sm:pt-1.5 sm:pb-[max(6px,env(safe-area-inset-bottom,0px))]">
        {portraitOffTurn ? (
          <PortraitDockCarousel
            state={renderedState}
            tournament={tournament}
            quickChatPhrases={quickChatPhrases}
            onPhraseReaction={onPhraseReaction}
          />
        ) : actions}
      </div>
    </div>
  );
}
