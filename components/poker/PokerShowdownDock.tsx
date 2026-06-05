'use client';

import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AvatarView } from '@/components/avatar';
import { formatChips } from '@/lib/format-poker-chips';
import { bestHand, handRankToName } from '@/lib/poker-hand-eval';
import type { PokerCurrentHand, PokerSeatState } from '@/lib/websocket-client';

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['C', 'D', 'H', 'S'];
/** Same card art the table uses. */
const cardSrc = (i: number) => `/BlackJack/Cards/PNG/${RANKS[i % 13]}${SUITS[Math.floor(i / 13)]}.png`;

/** Bottom-reserve contract shared with PokerBottomBar (kept as a literal to avoid an app→component import). */
const POKER_BOTTOM_RESERVE_VAR = '--poker-bottom-reserve';
const SHELL_SELECTOR = '[data-poker-shell]';

interface ShowdownPlayer {
  address: string;
  name: string;
  avatarConfig: PokerSeatState['avatarConfig'] | null;
  cards: number[];
  handName: string;
  isWinner: boolean;
  /** Gold +amount for winners (chip string). */
  amount: string | null;
  /** Red −loss for losers (chip string), when known. */
  loss: string | null;
  colorIdx: number;
}

const AV_COLORS = ['#3f6e8c', '#b8553f', '#5b8c5a', '#9c6b3f', '#8a6d9e', '#a14d5c', '#4a7c8c', '#c19a3e', '#6b7a8f', '#7a8c4d'];

export interface PokerShowdownDockProps {
  hand: PokerCurrentHand;
  seats: PokerSeatState[];
  myAddress?: string | null;
}

/**
 * Showdown dock (mobile portrait). Appears at real showdown and shows every revealed hand in
 * a tight, ≤⅓-height glance row — avatar, cards, hand rank, and +win / −loss. Tap to expand to
 * a full sheet with the board + every hand. Fed entirely by `currentHand` (showdownHands,
 * winners, communityCards, committedByAddress) — no extra fetches. Returns null when there's no
 * real showdown to show, so the parent can render it unconditionally.
 */
export function PokerShowdownDock({ hand, seats, myAddress }: PokerShowdownDockProps) {
  const [mode, setMode] = useState<'compact' | 'full'>('compact');
  const rootRef = useRef<HTMLDivElement>(null);
  const me = myAddress?.toLowerCase() ?? null;

  const players = useMemo<ShowdownPlayer[]>(() => {
    const sh = hand.showdownHands;
    if (!sh) return [];
    const community = hand.communityCards ?? [];
    const winnersByAddr = new Map<string, { amount: string; handName?: string }>();
    for (const w of hand.winners ?? []) {
      winnersByAddr.set(w.address.toLowerCase(), { amount: w.amount, handName: w.handName });
    }
    const seatByAddr = new Map<string, PokerSeatState>();
    seats.forEach((s) => { if (s.playerAddress) seatByAddr.set(s.playerAddress.toLowerCase(), s); });

    const list: ShowdownPlayer[] = Object.entries(sh).map(([rawAddr, cards], i) => {
      const addr = rawAddr.toLowerCase();
      const seat = seatByAddr.get(addr) ?? null;
      const win = winnersByAddr.get(addr);
      const isWinner = !!win;
      const all = [...(cards ?? []), ...community];
      let handName = win?.handName ?? '';
      if (!handName && all.length >= 5 && all.length <= 7) {
        try { handName = handRankToName(bestHand(all).rank); } catch { handName = ''; }
      }
      const committed = hand.committedByAddress?.[addr];
      return {
        address: addr,
        name: seat?.displayName?.trim() || `${addr.slice(0, 6)}…`,
        avatarConfig: seat?.avatarConfig ?? null,
        cards: (cards ?? []).slice(0, 2),
        handName,
        isWinner,
        amount: isWinner ? (win!.amount ?? null) : null,
        loss: !isWinner && committed != null && committed !== '0' ? committed : null,
        colorIdx: i % AV_COLORS.length,
      };
    });
    return list;
  }, [hand.showdownHands, hand.winners, hand.committedByAddress, hand.communityCards, seats]);

  // Winner(s) first for the full sheet; keep reveal order for the compact row.
  const ordered = useMemo(
    () => [...players].sort((a, b) => (b.isWinner ? 1 : 0) - (a.isWinner ? 1 : 0)),
    [players],
  );

  // Own the table's bottom reserve while mounted so the felt doesn't sit under the dock.
  useLayoutEffect(() => {
    const shell = document.querySelector(SHELL_SELECTOR) as HTMLElement | null;
    if (!shell) return;
    const apply = (px: number) => shell.style.setProperty(POKER_BOTTOM_RESERVE_VAR, `${Math.max(0, Math.round(px))}px`);
    const el = rootRef.current;
    if (!el) { apply(0); return () => shell.style.removeProperty(POKER_BOTTOM_RESERVE_VAR); }
    const measure = () => apply(el.offsetHeight);
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
  }, []);

  // Collapse back to compact when the hand changes (next showdown starts fresh).
  useEffect(() => { setMode('compact'); }, [hand.handId]);

  if (players.length < 2) return null;

  return (
    <>
      <PsdStyles />

      {/* Compact glance dock — fixed at the very bottom, ≤⅓ of the screen. */}
      <div ref={rootRef} className="psd-dock" role="button" tabIndex={0} onClick={() => setMode('full')}>
        <div className="psd-head">
          <span className="psd-title"><span className="psd-dot" /> Showdown</span>
          <span className="psd-expand">Tap to expand</span>
          <span className="psd-spacer" />
        </div>
        <div className="psd-row">
          {players.map((p) => (
            <PsdCell key={p.address} p={p} isMe={!!me && p.address === me} />
          ))}
        </div>
      </div>

      {/* Full sheet — board + every hand. */}
      {mode === 'full' && (
        <>
          <div className="psd-scrim" onClick={() => setMode('compact')} />
          <div className="psd-full">
            <div className="psd-grab" />
            <div className="psd-fhead">
              <span className="psd-title"><span className="psd-dot" /> Showdown</span>
              <span className="psd-pot">POT <b>{formatChips(hand.pot ?? '0')}</b></span>
              <button type="button" className="psd-close" aria-label="Collapse" onClick={() => setMode('compact')}>✕</button>
            </div>
            <div className="psd-boardwrap">
              <span className="psd-cap">Board</span>
              <div className="psd-board">
                {(hand.communityCards ?? []).map((c, i) => (
                  <img key={i} className="psd-bcard" src={cardSrc(c)} alt="" style={{ animationDelay: `${0.12 + i * 0.08}s` }} />
                ))}
              </div>
            </div>
            <div className="psd-cap psd-cap2">Showdown · best to worst</div>
            <div className="psd-list">
              {ordered.map((p, i) => (
                <PsdFullRow key={p.address} p={p} isMe={!!me && p.address === me} delay={0.18 + i * 0.07} />
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

/** Memoized avatar so the heavy AvatarView doesn't re-render on every showdown-window tick. */
const ShowAvatar = memo(
  function ShowAvatar({ config, fallback, color }: { config: ShowdownPlayer['avatarConfig']; fallback: string; color: string; addr?: string }) {
    if (config) return <AvatarView config={config} compact className="w-full h-full" />;
    return (
      <span
        className="flex h-full w-full items-center justify-center font-bold text-white"
        style={{ background: `radial-gradient(circle at 50% 30%, ${color}, color-mix(in srgb, ${color} 70%, #000))` }}
      >
        {fallback}
      </span>
    );
  },
  (a, b) => a.addr === b.addr,
);

function PsdCell({ p, isMe }: { p: ShowdownPlayer; isMe: boolean }) {
  return (
    <div className={`psd-cell${p.isWinner ? ' win' : ''}${isMe ? ' me' : ''}`}>
      {p.isWinner && <span className="psd-crown">👑</span>}
      <span className="psd-ava">
        <ShowAvatar config={p.avatarConfig} fallback={p.name[0]?.toUpperCase() ?? '?'} color={AV_COLORS[p.colorIdx]} addr={p.address} />
      </span>
      <span className="psd-cards">
        {p.cards.map((c, ci) => (
          <img key={ci} className={`psd-card${p.isWinner ? '' : ' lose'}`} src={cardSrc(c)} alt="" style={{ animationDelay: `${0.18 + ci * 0.08}s` }} />
        ))}
      </span>
      <span className="psd-name">{p.name}</span>
      <span className="psd-meta">
        <span className="psd-hand">{p.handName}</span>
        {p.isWinner
          ? <span className="psd-amt win">+{formatChips(p.amount ?? '0')}</span>
          : p.loss
            ? <span className="psd-amt loss">−{formatChips(p.loss)}</span>
            : null}
      </span>
    </div>
  );
}

function PsdFullRow({ p, isMe, delay }: { p: ShowdownPlayer; isMe: boolean; delay: number }) {
  return (
    <div className={`psd-frow${p.isWinner ? ' win' : ''}${isMe ? ' me' : ''}`} style={{ animationDelay: `${delay}s` }}>
      <span className="psd-fava">
        {p.isWinner && <span className="psd-crown">👑</span>}
        <ShowAvatar config={p.avatarConfig} fallback={p.name[0]?.toUpperCase() ?? '?'} color={AV_COLORS[p.colorIdx]} addr={p.address} />
      </span>
      <span className="psd-fid">
        <span className="psd-fname">{p.name}</span>
        <span className="psd-fhand">{p.handName}</span>
      </span>
      <span className="psd-fcards">
        {p.cards.map((c, ci) => (
          <img key={ci} className={`psd-fcard${p.isWinner ? '' : ' lose'}`} src={cardSrc(c)} alt="" />
        ))}
      </span>
      <span className={`psd-famt ${p.isWinner ? 'win' : 'loss'}`}>
        {p.isWinner ? `+${formatChips(p.amount ?? '0')}` : p.loss ? `−${formatChips(p.loss)}` : ''}
      </span>
    </div>
  );
}

/** Scoped styles for the dock (single instance → a global block is fine). */
const PsdStyles = memo(function PsdStyles() {
  return (
    <style>{`
    .psd-dock {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 44; cursor: pointer;
      max-height: 33%; display: flex; flex-direction: column;
      background: linear-gradient(to top, rgba(42,44,50,0.94) 0%, rgba(34,36,42,0.88) 72%, rgba(30,32,38,0.5) 100%);
      -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
      border-top: 1px solid rgba(255,255,255,0.14); box-shadow: 0 -12px 30px rgba(0,0,0,0.45);
      padding: 7px 8px calc(9px + env(safe-area-inset-bottom,0px));
      animation: psdUp .38s cubic-bezier(.2,.8,.2,1) both;
    }
    @keyframes psdUp { from { transform: translateY(105%); } to { transform: translateY(0); } }
    .psd-head { display:flex; align-items:center; margin-bottom:7px; padding:0 2px; }
    .psd-title { display:inline-flex; align-items:center; gap:6px; font-size:9.5px; font-weight:800; letter-spacing:.18em; text-transform:uppercase; color:rgba(255,255,255,0.5); flex:1 1 0; }
    .psd-spacer { flex:1 1 0; }
    .psd-dot { width:6px; height:6px; border-radius:50%; background:#fcd34d; box-shadow:0 0 7px #fcd34d; animation: psdPulse 1.6s ease-in-out infinite; }
    @keyframes psdPulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    .psd-expand { flex:0 0 auto; font-size:10px; font-weight:700; letter-spacing:.04em; color:rgba(255,255,255,0.7); }
    .psd-row { display:flex; gap:8px; justify-content:center; align-items:stretch; flex:1 1 auto; min-height:0; }
    .psd-cell {
      flex:1 1 0; min-width:0; max-width:98px; container-type:inline-size;
      display:flex; flex-direction:column; align-items:center; gap:5px;
      padding:9px 6px 8px; border-radius:12px; position:relative;
      background:rgba(255,255,255,0.035); border:1px solid rgba(255,255,255,0.07);
      opacity:0; transform:translateY(6px) scale(.97); animation: psdPop .36s cubic-bezier(.2,.8,.2,1) forwards;
    }
    @keyframes psdPop { to { opacity:1; transform:none; } }
    .psd-cell.win { background:linear-gradient(180deg, rgba(252,211,77,0.16), rgba(252,211,77,0.05)); border-color:rgba(252,211,77,0.55); box-shadow:0 0 0 1px rgba(252,211,77,0.28), 0 0 20px -5px rgba(252,211,77,0.5); }
    .psd-cell.me { outline:1px solid rgba(34,211,238,0.4); }
    .psd-cell:not(.win) { opacity:.86; }
    .psd-crown { position:absolute; top:-7px; left:50%; transform:translateX(-50%); font-size:12px; z-index:2; filter:drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
    .psd-ava { width:min(27px,36cqw); aspect-ratio:1; border-radius:50%; overflow:hidden; position:relative; z-index:1; margin-bottom:-8px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), 0 1px 3px rgba(0,0,0,0.6); }
    .psd-cell.win .psd-ava { box-shadow:0 0 0 1.5px #fcd34d, 0 0 10px rgba(252,211,77,0.55); }
    .psd-cards { display:flex; gap:3cqw; justify-content:center; width:100%; }
    .psd-card { width:44cqw; border-radius:5cqw; transform: rotateY(90deg); animation: psdFlip .4s cubic-bezier(.3,.7,.3,1) forwards; box-shadow:0 1px 3px rgba(0,0,0,0.5); }
    .psd-card.lose { filter: grayscale(.5) brightness(.84); }
    @keyframes psdFlip { to { transform: rotateY(0); } }
    .psd-name { font-size:10px; font-weight:700; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:1px; color:#e6ebf2; }
    .psd-cell.win .psd-name { color:#fcd34d; }
    .psd-meta { display:flex; align-items:baseline; gap:4px; max-width:100%; line-height:1.1; }
    .psd-hand { font-size:8px; font-weight:800; letter-spacing:.02em; text-transform:uppercase; color:rgba(255,255,255,0.5); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .psd-cell.win .psd-hand { color:rgba(252,211,77,0.85); }
    .psd-amt { font-size:9.5px; font-weight:800; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .psd-amt.win { color:#fcd34d; }
    .psd-amt.loss { color:#f08a8a; opacity:.92; }

    /* Full sheet */
    .psd-scrim { position:fixed; inset:0; z-index:48; background:rgba(0,0,0,0.5); animation: psdFade .25s both; }
    @keyframes psdFade { from{opacity:0} to{opacity:1} }
    .psd-full {
      position:fixed; left:0; right:0; bottom:0; z-index:49; max-height:84%; display:flex; flex-direction:column;
      background: linear-gradient(to top, rgba(38,40,46,0.99), rgba(30,32,38,0.98));
      -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
      border-top:1px solid rgba(255,255,255,0.16); border-radius:18px 18px 0 0;
      box-shadow:0 -16px 40px rgba(0,0,0,0.55); padding:9px 12px calc(12px + env(safe-area-inset-bottom,0px));
      animation: psdUp .4s cubic-bezier(.2,.8,.2,1) both;
    }
    .psd-grab { position:absolute; top:6px; left:50%; transform:translateX(-50%); width:34px; height:4px; border-radius:3px; background:rgba(255,255,255,0.2); }
    .psd-fhead { display:flex; align-items:center; gap:8px; margin:8px 0 4px; }
    .psd-pot { margin-left:auto; font-size:12px; font-weight:700; color:rgba(255,255,255,0.6); }
    .psd-pot b { color:#fcd34d; font-variant-numeric:tabular-nums; }
    .psd-close { width:26px; height:26px; border-radius:8px; border:1px solid rgba(255,255,255,0.14); background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.7); font-size:13px; cursor:pointer; }
    .psd-cap { font-size:9px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; color:rgba(255,255,255,0.4); }
    .psd-boardwrap { display:flex; flex-direction:column; align-items:center; gap:7px; padding:10px 0 12px; }
    .psd-board { display:flex; gap:5px; }
    .psd-bcard { width:46px; border-radius:6px; transform: rotateY(90deg); animation: psdFlip .42s cubic-bezier(.3,.7,.3,1) forwards; box-shadow:0 2px 5px rgba(0,0,0,0.5); }
    .psd-cap2 { margin:2px 0 7px 2px; }
    .psd-list { display:flex; flex-direction:column; gap:7px; overflow-y:auto; min-height:0; scrollbar-width:none; }
    .psd-frow { display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:12px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07); opacity:0; transform:translateX(10px); animation: psdRow .34s cubic-bezier(.2,.8,.2,1) forwards; }
    @keyframes psdRow { to { opacity:1; transform:none; } }
    .psd-frow.win { background:linear-gradient(90deg, rgba(252,211,77,0.16), rgba(252,211,77,0.04)); border-color:rgba(252,211,77,0.5); box-shadow:0 0 18px -6px rgba(252,211,77,0.5); }
    .psd-frow.me { outline:1px solid rgba(34,211,238,0.4); }
    .psd-fava { width:34px; height:34px; border-radius:50%; overflow:hidden; flex:0 0 auto; position:relative; box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), 0 1px 3px rgba(0,0,0,0.5); }
    .psd-frow.win .psd-fava { box-shadow:0 0 0 2px #fcd34d, 0 0 12px rgba(252,211,77,0.5); }
    .psd-fava .psd-crown { top:-10px; }
    .psd-fid { min-width:0; flex:1 1 auto; display:flex; flex-direction:column; gap:2px; }
    .psd-fname { font-size:12.5px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#e6ebf2; }
    .psd-frow.win .psd-fname { color:#fcd34d; }
    .psd-fhand { font-size:9.5px; font-weight:800; letter-spacing:.03em; text-transform:uppercase; color:rgba(255,255,255,0.45); }
    .psd-frow.win .psd-fhand { color:rgba(252,211,77,0.8); }
    .psd-fcards { display:flex; gap:3px; flex:0 0 auto; }
    .psd-fcard { width:27px; border-radius:4px; box-shadow:0 1px 3px rgba(0,0,0,0.5); }
    .psd-fcard.lose { filter: grayscale(.5) brightness(.85); }
    .psd-famt { flex:0 0 auto; font-size:12.5px; font-weight:800; font-variant-numeric:tabular-nums; min-width:62px; text-align:right; }
    .psd-famt.win { color:#fcd34d; }
    .psd-famt.loss { color:#f08a8a; }
    `}</style>
  );
});
