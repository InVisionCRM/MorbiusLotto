'use client';

/**
 * Home2 sections — Chronograph port (design option 11, with approved Liquid
 * Chrome touches from option 12). Markup follows the option-11 mockup's
 * structure and class names (`.tick`, `.mc`, `.gauge`, `.rows`, `.sh`, `.tabs`,
 * `.grid`, `.duo`, `.drop`, `.vip`, `.lad`); CSS lives in app/home2.css under
 * `.home2`. Game cards come from game-tile.tsx; the catalog from scenes.tsx.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { nextSundayDropUtc } from '@/lib/weekly-drop-time';
import { FLOOR_GAMES, type FloorGame } from '@/components/home2/scenes';
import { GameTile } from '@/components/home2/game-tile';
import { SelfExclusionModal } from '@/components/ResponsibleGaming';

/* ────────────────────────────────────────────────────────────
   Shared line icons (mockup stroke set)
   ──────────────────────────────────────────────────────────── */
const ICONS = {
  plus: 'M12 5v14M5 12h14',
  bars: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  play: 'M7 5v14l11-7z',
  ticket: 'M3 9a2 2 0 0 0 0 4v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5a2 2 0 0 1 0-4V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z',
  crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z',
  share: 'M16 7a3 3 0 1 0 0-.01M8 12a3 3 0 1 0 0-.01M16 17a3 3 0 1 0 0-.01M10.6 10.7l2.8-1.6M10.6 13.3l2.8 1.6',
  scan: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.6-4.6',
  wallet: 'M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12M16.5 13.5h.01',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  chev: 'm9 6 6 6-6 6',
} as const;

export function Icon({ d, w = 1.6 }: { d: keyof typeof ICONS; w?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[d]} />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────
   1. TICKER — mono marquee of live facts
   ──────────────────────────────────────────────────────────── */
export interface TickerItem {
  /** Gold lead-in, e.g. "Weekly Drop". */
  k: string;
  /** Plain text after it. Rendered as text — never HTML. */
  v: string;
}

/* Every item comes from the page (live wins + standing facts) — the ticker
 * never invents an event. A short list is repeated until the strip is wider
 * than the screen, then tripled so the -33.33% loop is seamless. */
const TICKER_MIN_ITEMS = 6;

export function HomeTicker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;
  const filled: TickerItem[] = [];
  while (filled.length < TICKER_MIN_ITEMS) filled.push(...items);
  const loop = [...filled, ...filled, ...filled];
  return (
    <div className="tickwrap" aria-label="Live at Morbius">
      <div className="tick">
        <div>
          {loop.map((it, i) => (
            <span key={i} aria-hidden={i >= filled.length ? true : undefined}>
              <b>{it.k}</b> {it.v}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   2. MEMBER CARD — the connected player's gauge card
   ──────────────────────────────────────────────────────────── */

/** Tier ink, matched to the mockup's bronze (#e3a878) and the shared palette. */
export const TIER_INK: Record<string, string> = {
  BRONZE: '#e3a878',
  SILVER: '#c7ccd8',
  GOLD: '#e9c46a',
  PLATINUM: '#e8e6e1',
  DIAMOND: '#9fe6ff',
  OBSIDIAN: '#a99cf0',
};

/**
 * Two letters for the monogram. A display name gives its initials; a single
 * word gives first + last; a bare wallet address gives the two hex digits
 * after 0x, so the tile is stable identity rather than noise.
 */
function monogramFor(name: string): string {
  const hex = /^0x([0-9a-f]{2})/i.exec(name.trim());
  if (hex) return hex[1].toUpperCase();
  const words = name.replace(/[….]/g, '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const w = words[0] ?? '';
  if (w.length >= 2) return (w[0] + w[w.length - 1]).toUpperCase();
  return (w || '?').toUpperCase();
}

interface RowProps {
  icon: keyof typeof ICONS;
  title: string;
  sub: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
}

function Row({ icon, title, sub, href, external, onClick }: RowProps) {
  const inner = (
    <>
      <span className="ic">
        <Icon d={icon} />
      </span>
      <span className="tx">
        <b>{title}</b>
        <small>{sub}</small>
      </span>
      <span className="go">
        <Icon d="chev" w={1.9} />
      </span>
    </>
  );
  if (href && external)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  if (href) return <Link href={href}>{inner}</Link>;
  return (
    <button type="button" onClick={onClick}>
      {inner}
    </button>
  );
}

/** Half-circle gauge: dotted track, cyan→gold arc and the gold needle, both sweeping to `pct` on load. */
function Gauge({ pct, children }: { pct: number; children: React.ReactNode }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="gauge" style={{ '--p': p } as React.CSSProperties}>
      <svg viewBox="0 0 200 120" aria-hidden="true">
        <path className="g0" d="M20 110 A80 80 0 0 1 180 110" />
        {p > 0 && <path className="g1" pathLength={100} d="M20 110 A80 80 0 0 1 180 110" />}
      </svg>
      <i className="needle" aria-hidden="true" />
      <div className="gl">{children}</div>
    </div>
  );
}

export interface HeroPlayerProps {
  name?: string;
  address?: string;
  avatarUrl?: string | null;
  tierName?: string;
  /** null when the player is already at the top rung. */
  nextTierName?: string | null;
  nextTierRakeback?: string;
  wagerToNext?: string;
  /** 0-100 along the current rung — drives the gauge needle. */
  progressPct?: number;
  balance?: string;
  /** First action row — where the player left off. Omitted if they have no history. */
  resume?: { title: string; sub: string; href?: string };
  onDeposit?: () => void;
  onDashboard?: () => void;
}

export function HeroPlayer({
  name = 'Player',
  address,
  avatarUrl = null,
  tierName = 'BRONZE',
  nextTierName = 'SILVER',
  nextTierRakeback = '8%',
  wagerToNext = '0',
  progressPct = 0,
  balance = '0',
  resume,
  onDeposit,
  onDashboard,
}: HeroPlayerProps) {
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;
  const nameIsAddress = /^0x/i.test(name.trim());
  const atTop = !nextTierName;

  return (
    <section className="mem" aria-label="Your Morbius membership">
      <div className="mc">
        <div className="mc-top">
          <span className="brand">MORBIUS · MEMBER</span>
          <span className="tier" style={{ color: TIER_INK[tierName] ?? TIER_INK.BRONZE }}>
            {tierName}
          </span>
        </div>
        <Gauge pct={atTop ? 100 : progressPct}>
          <small>Play balance</small>
          <b>{balance}</b>
          <span>MORBIUS</span>
        </Gauge>
        <div className="who">
          {avatarUrl ? (
            <img className="av" src={avatarUrl} alt="" />
          ) : (
            <span className="av">{monogramFor(name)}</span>
          )}
          <div>
            <b>{name}</b>
            {short && !nameIsAddress && <small>{short}</small>}
          </div>
        </div>
        <div className="ml">
          {atTop ? (
            <>
              <span>
                <b>Top tier</b> reached
              </span>
              <span>{nextTierRakeback} back on losses</span>
            </>
          ) : (
            <>
              <span>
                <b>{wagerToNext}</b> to {nextTierName}
              </span>
              <span>
                {nextTierRakeback} at {nextTierName}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="rows">
        {resume && <Row icon="play" title={resume.title} sub={resume.sub} href={resume.href} />}
        <Row icon="plus" title="Deposit" sub="Top up your play balance" onClick={onDeposit} />
        <Row icon="bars" title="Dashboard" sub="History, stats & verify" onClick={onDashboard} />
        <Row icon="share" title="Refer & earn" sub="Bring a friend, get paid for it" href="/referrals" />
      </div>
    </section>
  );
}

/**
 * The same column for a visitor: an unset gauge and a Connect button — no
 * sample member, no invented numbers — plus the doors the old promo carousel
 * used to open (VIP, the Weekly Drop, referrals, the token analyzer).
 */
export function HeroVisitor({ onConnect, onOpenDrop }: { onConnect?: () => void; onOpenDrop?: () => void }) {
  return (
    <section className="mem" aria-label="Take a seat">
      <div className="mc visitor">
        <div className="mc-top">
          <span className="brand">MORBIUS · MEMBER</span>
          <span className="tier">NOT SEATED</span>
        </div>
        <Gauge pct={0}>
          <small>Play balance</small>
          <b className="dim">—</b>
          <span>Connect to begin</span>
        </Gauge>
        <div className="ml">
          <span>
            <b>Rakeback</b> on losses
          </span>
          <span>Bronze 5% → Obsidian 25%</span>
        </div>
        <button type="button" className="btn-steel" onClick={onConnect}>
          <span>Connect wallet</span>
          <i>
            <Icon d="arrow" w={1.9} />
          </i>
        </button>
      </div>
      <div className="rows">
        <Row icon="crown" title="VIP club" sub="Six tiers of rakeback on losses" href="/vip" />
        <Row icon="ticket" title="The Weekly Drop" sub="Top 3 win every Sunday · 8 PM ET" onClick={onOpenDrop} />
        <Row icon="share" title="Refer & earn" sub="Bring a friend, get paid for it" href="/referrals" />
        <Row icon="scan" title="Token analyzer" sub="Scan any PulseChain token" href="https://scan.morbius.io" external />
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   3. THE COLLECTION — every game, category tabs
   ──────────────────────────────────────────────────────────── */
const MULTIPLAYER_KEYS = new Set(['poker', 'blackjack']);

export const FLOOR_TABS: { f: string; label: string; test: (g: FloorGame) => boolean }[] = [
  { f: 'all', label: 'All', test: () => true },
  { f: 'blackjack', label: 'Blackjack', test: (g) => g.family === 'blackjack' },
  { f: 'poker', label: 'Poker', test: (g) => g.family === 'poker' },
  { f: 'table', label: 'Table', test: (g) => g.family === 'table' },
  { f: 'orig', label: 'Originals', test: (g) => g.cat === 'orig' },
  { f: 'multi', label: 'Multiplayer', test: (g) => g.badge?.kind === 'multi' || MULTIPLAYER_KEYS.has(g.key) },
];

export function TheFloor({ filter, onFilter }: { filter: string; onFilter: (f: string) => void }) {
  const tab = FLOOR_TABS.find((t) => t.f === filter) ?? FLOOR_TABS[0];
  const games = FLOOR_GAMES.filter(tab.test);

  return (
    <>
      <div className="sh" id="collection">
        <h2>
          The <em>collection</em>
        </h2>
        <span className="meta">
          {FLOOR_GAMES.length} references{tab.f !== 'all' ? ` · ${games.length} ${tab.label.toLowerCase()}` : ''}
        </span>
      </div>
      <div className="tabs" role="tablist" aria-label="Filter games">
        {FLOOR_TABS.map((t) => (
          <button
            key={t.f}
            type="button"
            role="tab"
            aria-selected={tab.f === t.f}
            className={tab.f === t.f ? 'on' : undefined}
            onClick={() => onFilter(t.f)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <section className="grid" aria-label={`${tab.label} games`} key={tab.f}>
        {games.map((g, i) => (
          <GameTile key={g.key} game={g} order={i} />
        ))}
      </section>
    </>
  );
}

/* ────────────────────────────────────────────────────────────
   4. THE WORKSHOP — creator tools (Create-a-Slot / -Tournament / -Table)
   ──────────────────────────────────────────────────────────── */
/** Static-file links (the builder lab pages) use <a>; app routes use <Link>. */
function A({ href, plain, className, children }: { href: string; plain?: boolean; className: string; children: React.ReactNode }) {
  return plain ? (
    <a className={className} href={href}>
      {children}
    </a>
  ) : (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}

interface Feat {
  t: string;
  d: string;
}

function Atelier({
  id,
  calibre,
  kick,
  title,
  body,
  feats,
  cta,
  guide,
  ctaSub,
  shots,
}: {
  id: string;
  calibre: string;
  kick: string;
  title: React.ReactNode;
  body: React.ReactNode;
  feats: Feat[];
  cta: { label: string; href: string; plain?: boolean };
  guide: { label: string; href: string; plain?: boolean };
  ctaSub: string;
  shots: { src: string; alt: string; tag: string; gold?: boolean }[];
}) {
  return (
    <article className={`atelier at-${id}`}>
      <div className="at-copy">
        <span className="kick">
          {calibre} · {kick}
        </span>
        <h3>{title}</h3>
        <p>{body}</p>
        <ol className="at-feats">
          {feats.map((f, i) => (
            <li key={f.t}>
              <span className="n">{String(i + 1).padStart(2, '0')}</span>
              <span>
                <b>{f.t}</b>
                <small>{f.d}</small>
              </span>
            </li>
          ))}
        </ol>
        <div className="at-cta">
          <A className="btn-steel" href={cta.href} plain={cta.plain}>
            <span>{cta.label}</span>
            <i>
              <Icon d="arrow" w={1.9} />
            </i>
          </A>
          <A className="at-guide" href={guide.href} plain={guide.plain}>
            {guide.label} <span aria-hidden="true">→</span>
          </A>
          <span className="at-sub">{ctaSub}</span>
        </div>
      </div>
      <div className={`at-shots${shots.length === 1 ? ' one' : ''}`}>
        {shots.map((s) => (
          <figure key={s.src}>
            <img src={s.src} alt={s.alt} loading="lazy" />
            <figcaption className={s.gold ? 'g' : undefined}>{s.tag}</figcaption>
          </figure>
        ))}
      </div>
    </article>
  );
}

export function WorkshopHead() {
  return (
    <div className="sh" id="workshop">
      <h2>
        The <em>workshop</em>
      </h2>
      <span className="meta">Creator tools · 03</span>
    </div>
  );
}

export function SlotForge() {
  return (
    <Atelier
      id="slot"
      calibre="Create-a-Slot"
      kick="Coming soon"
      title={
        <>
          Create your own <em>slot&nbsp;machine</em>
        </>
      }
      body={
        <>
          Build a machine from scratch — pick the grid, draw the paytable, wire up a bonus round — then publish it and drop it on any
          website with one embed code. Fund it with your own token and the house edge is <b>yours</b>.
        </>
      }
      feats={[
        { t: 'Design every reel', d: 'symbols, colors, sounds & border FX' },
        { t: 'Real bonus rounds', d: 'free spins, wheels & pick games' },
        { t: 'Provably fair', d: 'every spin sealed & verifiable' },
        { t: 'Embed anywhere', d: 'one iframe snippet, any website' },
        { t: 'Your own token', d: 'run it on any PRC-20 you choose' },
        { t: 'Creator dashboard', d: 'live RTP, volume & bankroll stats' },
      ]}
      cta={{ label: 'Open the builder', href: '/slot-builder-lab.html', plain: true }}
      guide={{ label: 'Read the guide', href: '/slot-guide.html', plain: true }}
      ctaSub="free to build · no code needed"
      shots={[
        { src: '/home2/forge-builder.webp', alt: 'The Create-A-Slot builder studio', tag: 'the studio' },
        { src: '/home2/forge-cabinet.webp', alt: 'A community-built slot machine hitting a win', tag: 'your machine, live', gold: true },
      ]}
    />
  );
}

export function TourneyForge() {
  return (
    <Atelier
      id="tourney"
      calibre="Create-a-Tournament"
      kick="PRC-20"
      title={
        <>
          Run a <em>poker&nbsp;tournament</em> for your token
        </>
      }
      body={
        <>
          Pick your PRC-20, set the buy-in, and every seat pays into the on-chain prize escrow. The pool builds as players join, the
          table fires when it fills, and <b>2% of the prize pool is yours</b> when the payouts settle.
        </>
      }
      feats={[
        { t: 'Buy-ins in your token', d: 'any PRC-20 — or MORBIUS' },
        { t: 'Escrowed on-chain', d: 'every buy-in sits in the prize escrow' },
        { t: '2% of the pool is yours', d: 'paid out with the prizes' },
        { t: 'Sit & Go or scheduled', d: 'fires when the seats fill' },
        { t: 'Refunds handled', d: 'short table cancels and pays everyone back' },
        { t: 'Share card built in', d: 'one-click PNG for the timeline' },
      ]}
      cta={{ label: 'Create a tournament', href: '/poker/tournaments/create' }}
      guide={{ label: "See what's running", href: '/poker' }}
      ctaSub="your token · your rake"
      shots={[
        {
          src: '/home2/tourney-share-card.webp',
          alt: 'A poker tournament share card with a HEX buy-in and prize pool',
          tag: 'your tournament, shareable',
          gold: true,
        },
      ]}
    />
  );
}

export function TableForge() {
  return (
    <Atelier
      id="table"
      calibre="Create-a-Table"
      kick="Blackjack · Coming soon"
      title={
        <>
          Put your project on a <em>blackjack&nbsp;table</em>
        </>
      }
      body={
        <>
          Six steps and your board is on the floor: drop in your art, style the cards, choose the animations and sounds, then nudge
          every seat into place. Players sit down at <b>your</b> table and play it in MORBIUS.
        </>
      }
      feats={[
        { t: 'Your art on the felt', d: 'upload a board or start from a preset' },
        { t: 'Cards & backs to match', d: 'faces, backs, and how they lie' },
        { t: 'Deal animations', d: 'pick how cards land and clear' },
        { t: 'Table sounds', d: 'chips, shuffles and the dealer' },
        { t: 'Nudge everything', d: 'seats, dealer and card angle, to the pixel' },
        { t: 'Video tables too', d: 'an MP4 board on a 24-hour cycle' },
      ]}
      cta={{ label: 'Open the table builder', href: '/blackjack-multi/design' }}
      guide={{ label: 'Play the live tables', href: '/blackjack-multi' }}
      ctaSub="free to build · no code needed"
      shots={[
        { src: '/home2/tableforge-studio.webp', alt: 'The Create-A-Table builder studio', tag: 'the studio' },
        { src: '/home2/tableforge-preview.webp', alt: 'A branded blackjack table mid-round', tag: 'your table, in play', gold: true },
      ]}
    />
  );
}

/* ────────────────────────────────────────────────────────────
   5. THE WEEKLY DROP — duo, left
   ──────────────────────────────────────────────────────────── */
export interface WeeklyDropWinner {
  letter: string;
  name: string;
  amount: string;
}

export interface WeeklyDropProps {
  /** Small line under the pot, e.g. '+142 fed by bets this week'. */
  accruedNote?: string | null;
  pot?: number;
  entries: number;
  progress: number;
  entriesSub: React.ReactNode;
  winners: WeeklyDropWinner[];
  /** Status kicker, e.g. 'Live' / 'Lighting soon'. */
  status?: string;
  /** When provided, count down to this instant instead of the computed next Sunday 8PM ET. */
  countdownTo?: Date;
  /** Players holding ≥ 1 entry in the open draw; null hides the entrants line. */
  totalEntrants?: number | null;
  onViewEntrants?: () => void;
}

/** Live d/h/m/s to `target` (or the next Sunday 8 PM ET fallback). */
export function useCountdown(targetMs: number | undefined, active = true) {
  const [cd, setCd] = useState({ d: '0', h: '00', m: '00', s: '00' });
  useEffect(() => {
    if (!active) return;
    function tick() {
      let ms = Math.max(0, (targetMs ?? nextSundayDropUtc().getTime()) - Date.now());
      const day = Math.floor(ms / 86400000);
      ms -= day * 86400000;
      const hr = Math.floor(ms / 3600000);
      ms -= hr * 3600000;
      const mi = Math.floor(ms / 60000);
      ms -= mi * 60000;
      const se = Math.floor(ms / 1000);
      setCd({ d: String(day), h: String(hr).padStart(2, '0'), m: String(mi).padStart(2, '0'), s: String(se).padStart(2, '0') });
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetMs, active]);
  return cd;
}

export function WeeklyDrop({
  // 25,000 is the guaranteed weekly minimum — the pot shown before a draw opens.
  pot = 25000,
  entries,
  progress,
  entriesSub,
  winners,
  status = 'Lighting soon',
  countdownTo,
  totalEntrants = null,
  onViewEntrants,
  accruedNote = null,
}: WeeklyDropProps) {
  const cd = useCountdown(countdownTo?.getTime());

  return (
    <div className="drop" id="weeklyDrop">
      <span className="kick">Weekly Drop · {status}</span>
      <div className="pot">
        {pot.toLocaleString('en-US')}
        <span>MORBIUS</span>
      </div>
      <p>Top 3 win every Sunday · 8 PM ET</p>
      {accruedNote && <p className="note">{accruedNote}</p>}

      <div className="cd" role="timer" aria-label="Time until the draw">
        <div>
          <b>{cd.d}</b>
          <small>days</small>
        </div>
        <div>
          <b>{cd.h}</b>
          <small>hrs</small>
        </div>
        <div>
          <b>{cd.m}</b>
          <small>min</small>
        </div>
        <div>
          <b>{cd.s}</b>
          <small>sec</small>
        </div>
      </div>

      <div className="drop-you only-player">
        <div className="t">
          <span>Your entries</span>
          <b>{entries}</b>
        </div>
        <div className="meter" style={{ '--p': `${Math.max(0, Math.min(100, progress))}%` } as React.CSSProperties}>
          <i />
        </div>
        <div className="sub">{entriesSub}</div>
      </div>
      <p className="drop-you only-visitor">
        Every <b>1,000 MORBIUS</b> you play is a ticket — plus one free entry every day just for signing in. Connect to start earning.
      </p>

      {totalEntrants != null && (
        <div className="drop-ent">
          <b>{totalEntrants.toLocaleString('en-US')}</b> {totalEntrants === 1 ? 'player' : 'players'} entered ·{' '}
          <button type="button" onClick={onViewEntrants}>
            View entrants
          </button>
        </div>
      )}

      {winners.length > 0 && (
        <div className="drop-win">
          <span className="lbl">Last week&apos;s top 3</span>
          <ol>
            {winners.map((w) => (
              <li key={w.name}>
                <span className="av">{w.letter}</span>
                <span className="nm">{w.name}</span>
                <b>{w.amount}</b>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="how">
        0.25% of every bet on every game feeds the pot — guaranteed <b>25,000 MORBIUS minimum</b> each week. Entries reset every draw,
        winners are paid straight to their balance, and every draw is commit-reveal verifiable.
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   6. VIP LADDER — duo, right
   ──────────────────────────────────────────────────────────── */
const VIP_TIERS = [
  { name: 'BRONZE', rb: '5%', h: 30 },
  { name: 'SILVER', rb: '8%', h: 44 },
  { name: 'GOLD', rb: '12%', h: 58 },
  { name: 'PLATINUM', rb: '16%', h: 72 },
  { name: 'DIAMOND', rb: '20%', h: 86 },
  { name: 'OBSIDIAN', rb: '25%', h: 100 },
];

export function VipLadder({ currentTier = '' }: { currentTier?: string }) {
  const cur = currentTier.toUpperCase();
  return (
    <div className="vip" id="vip">
      <span className="kick">VIP ladder</span>
      <h3>
        Play. Rank up. <em>Get paid back.</em>
      </h3>
      <div className="lad" role="list" aria-label="Rakeback on losses by tier">
        {VIP_TIERS.map((t, i) => (
          <div
            key={t.name}
            role="listitem"
            className={t.name === cur ? 'cur' : undefined}
            style={{ '--h': `${t.h}%`, '--d': `${i * 80}ms`, '--ink': TIER_INK[t.name] } as React.CSSProperties}
            aria-current={t.name === cur ? 'true' : undefined}
          >
            <b>{t.rb}</b>
            <small>{t.name.toLowerCase()}</small>
          </div>
        ))}
      </div>
      <div className="vip-foot">
        <span>Rakeback on net losses · paid back to your balance</span>
        <Link href="/vip">
          VIP club <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   7. FOOTER
   ──────────────────────────────────────────────────────────── */
const MORBIUS_TOKEN = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';
const X_URL = 'https://x.com/Morbius_io';
const TELEGRAM_URL = 'https://t.me/Morbius_cash';

const FOOTER_COLUMNS: Array<{
  title: string;
  links: Array<{ label: string; href: string; external?: boolean }>;
}> = [
  {
    title: 'Games',
    links: [
      { label: 'Plinko', href: '/plinko2' },
      { label: 'Blackjack', href: '/BLACKJACK' },
      { label: "Ruby's Table", href: '/ruby' },
      { label: 'Poker', href: '/poker' },
      { label: 'Keno', href: '/keno' },
      { label: 'Crash', href: '/crash' },
      { label: 'Lottery', href: '/lottery' },
    ],
  },
  {
    title: 'Platform',
    links: [
      { label: 'VIP Club', href: '/vip' },
      { label: 'Buy MORBIUS', href: '/swap' },
      { label: 'Referrals', href: '/referrals' },
      { label: 'Creators', href: '/creators' },
      { label: 'Brand kit', href: '/branding' },
    ],
  },
  {
    title: 'Token',
    links: [
      { label: 'Token Analyzer', href: 'https://scan.morbius.io', external: true },
      { label: 'Live Chart', href: `https://scan.morbius.io/geicko?address=${MORBIUS_TOKEN}&tab=chart`, external: true },
      { label: 'Buy on PulseX', href: `https://app.pulsex.com/swap?outputCurrency=${MORBIUS_TOKEN}`, external: true },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'X / Twitter', href: X_URL, external: true },
      { label: 'Telegram', href: TELEGRAM_URL, external: true },
    ],
  },
];

export function HomeFooter() {
  const [rgOpen, setRgOpen] = useState(false);

  return (
    <footer className="foot">
      <div className="foot-top">
        <div className="foot-brand">
          <span className="logo">
            <img src="/home2/m-mark.png" alt="" />
            <span>Morbius</span>
          </span>
          <p>The Web3 casino on PulseChain — {FLOOR_GAMES.length} games, one chip, VIP rakeback on losses.</p>
          <div className="foot-social">
            <a href={X_URL} target="_blank" rel="noopener noreferrer" aria-label="Morbius on X">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Morbius on Telegram">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zM5.573 11.72c3.497-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.1-.002.321.023.465.14a.51.51 0 0 1 .171.327c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.209.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.061 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663z" />
              </svg>
            </a>
          </div>
        </div>

        <nav className="foot-cols" aria-label="Footer">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title} className="foot-col">
              <h4>{col.title}</h4>
              {col.links.map((l) =>
                l.external ? (
                  <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer">
                    {l.label}
                  </a>
                ) : (
                  <Link key={l.label} href={l.href}>
                    {l.label}
                  </Link>
                ),
              )}
            </div>
          ))}
        </nav>
      </div>

      <div className="foot-bottom">
        <span>Play responsibly · 18+</span>
        <button type="button" onClick={() => setRgOpen(true)}>
          Responsible gaming
        </button>
        <span>© 2026 Morbius.io</span>
      </div>

      <SelfExclusionModal isOpen={rgOpen} onClose={() => setRgOpen(false)} />
    </footer>
  );
}
