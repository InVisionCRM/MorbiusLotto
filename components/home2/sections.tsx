'use client';

/**
 * Home2 sections — faithful port of public/home-nav-lab.html.
 * Markup, class names and behavior mirror the lab exactly; CSS lives in the
 * `.home2`-scoped stylesheet ported separately. Scene art comes from
 * components/home2/scenes.tsx.
 */

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { nextSundayDropUtc } from '@/lib/weekly-drop-time';
import { VipTierBadge } from '@/components/vip/VipTierBadge';
import {
  PlinkoScene,
  CrashScene,
  MinesScene,
  FLOOR_GAMES,
} from '@/components/home2/scenes';
import { SelfExclusionModal } from '@/components/ResponsibleGaming';
import { CurvedName } from '@/components/home2/curved-name';

/* ────────────────────────────────────────────────────────────
   Shared: hero ember particles (port of the lab's embers())
   ──────────────────────────────────────────────────────────── */
function useEmbers(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    let W = 0;
    let H = 0;
    type Part = { x: number; y: number; r: number; vy: number; vx: number; c: string; a: number; ph: number };
    const parts: Part[] = [];
    function size() {
      const parent = cv!.parentElement;
      if (!parent) return;
      const r = parent.getBoundingClientRect();
      W = cv!.width = r.width;
      H = cv!.height = r.height;
    }
    size();
    window.addEventListener('resize', size);
    const COLORS = ['rgba(34,211,238,', 'rgba(251,191,36,', 'rgba(167,139,250,'];
    for (let i = 0; i < 42; i++)
      parts.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.6 + Math.random() * 1.8,
        vy: 0.08 + Math.random() * 0.22,
        vx: (Math.random() - 0.5) * 0.06,
        c: COLORS[i % 3],
        a: 0.15 + Math.random() * 0.4,
        ph: Math.random() * 6.28,
      });
    let raf = 0;
    let stopped = false;
    function draw(t: number) {
      if (stopped) return;
      ctx!.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.y -= p.vy / 100;
        p.x += p.vx / 100;
        if (p.y < -0.05) {
          p.y = 1.05;
          p.x = Math.random();
        }
        const tw = 0.6 + 0.4 * Math.sin(t / 700 + p.ph);
        ctx!.beginPath();
        ctx!.arc(p.x * W, p.y * H, p.r, 0, 6.28);
        ctx!.fillStyle = p.c + p.a * tw + ')';
        ctx!.fill();
      }
      raf = requestAnimationFrame(draw);
    }
    draw(0);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
  }, [canvasRef]);
}

/* ────────────────────────────────────────────────────────────
   1. TICKER — cumulative + highlight events
   ──────────────────────────────────────────────────────────── */
const DEFAULT_TICKER_ITEMS = [
  '<b class="g">🏆 WEEKLY HIGH</b> <b>48,200</b> on Plinko — MorbKing',
  '<b class="e">▲ PRICE</b> MORBIUS $0.00042 · +6.2% 24h',
  '<b class="g">💎 ALL-TIME</b> biggest Crash cashout <b>×124</b>',
  '<b class="c">👑 RANK UP</b> pTIGER hit GOLD — 12% rakeback',
  '<b class="o">🎁 RAKEBACK</b> 84,300 MORBIUS paid back to players',
  '<b class="c">🃏 TABLES</b> Blackjack #4 · 3 seats open now',
  '<b class="g">🎟 WEEKLY DROP</b> top 3 win every Sunday 8PM ET',
];

export function HomeTicker({ items = DEFAULT_TICKER_ITEMS }: { items?: string[] }) {
  /* duplicate the sequence for a seamless loop, exactly like the lab */
  const doubled = [...items, ...items];
  return (
    <div className="ticker">
      <div className="ticker-track" id="tickerTrack">
        {doubled.map((item, i) => (
          <React.Fragment key={i}>
            <span className="tk" dangerouslySetInnerHTML={{ __html: item }} />
            <span className="tk">
              <span className="dot" />
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   2. HERO · PLAYER
   ──────────────────────────────────────────────────────────── */
const DEFAULT_AVATAR = (
  <svg viewBox="0 0 64 64" width="72" height="72">
    <circle cx="32" cy="30" r="14" fill="#e8b98a" />
    <rect x="14" y="44" width="36" height="22" rx="9" fill="#0f172a" />
    <path d="M26 46l6 7 6-7-6-2z" fill="#fff" />
    <rect x="29" y="52" width="6" height="9" rx="2" fill="#b91c1c" />
    <rect x="18" y="22" width="28" height="7" rx="3" fill="#0b0e16" />
    <rect x="22" y="6" width="20" height="18" rx="2" fill="#0b0e16" />
    <rect x="22" y="20" width="20" height="4" rx="2" fill="#1c2333" />
    <rect x="22" y="27" width="9" height="5" rx="2.5" fill="#0ea5b7" />
    <rect x="33" y="27" width="9" height="5" rx="2.5" fill="#0ea5b7" />
    <path d="M31 27h2v3h-2z" fill="#0b0e16" />
    <path d="M27 38q5 4 10 0" stroke="#8a5a2b" strokeWidth="2" fill="none" strokeLinecap="round" />
    <rect x="36" y="36" width="10" height="3" rx="1.5" fill="#7c4a21" transform="rotate(12 36 36)" />
  </svg>
);

export interface HeroPlayerDigestItem {
  html: string;
}

const DEFAULT_DIGEST: HeroPlayerDigestItem[] = [
  { html: '🏆 Weekly high: <b>48,200</b> on Plinko' },
  { html: '📈 MORBIUS <b>+6.2%</b> this week' },
  { html: '🎁 Rakeback ready: <b>1,120</b> — tap to claim' },
];

export interface HeroPlayerProps {
  name?: string;
  tierName?: string;
  nextTierName?: string;
  nextTierRakeback?: string;
  wagerToNext?: string;
  digest?: HeroPlayerDigestItem[];
  resume?: { title: string; sub: string };
  balance?: string;
  balanceUsd?: string;
  avatar?: React.ReactNode;
  /** Optional ambient background layer (e.g. <PriceChartBg />) rendered behind .hero-inner. */
  chartBg?: React.ReactNode;
  onDeposit?: () => void;
  onDashboard?: () => void;
}

/* time-aware greeting — exactly the lab's logic */
function computeGreeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function HeroPlayer({
  name = 'Det',
  tierName = 'SILVER',
  nextTierName = 'GOLD',
  nextTierRakeback = '12%',
  wagerToNext = '2,450',
  digest = DEFAULT_DIGEST,
  resume = {
    title: 'Blackjack — your seat is open',
    sub: "Table #4 · 25–500 MORBIUS · you're up 3,200 lifetime here",
  },
  balance = '128,400',
  balanceUsd = '≈ $53.93 · reserve synced 4s ago',
  avatar = DEFAULT_AVATAR,
  chartBg = null,
  onDeposit,
  onDashboard,
}: HeroPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEmbers(canvasRef);

  /* SSR-safe: same static default as the lab HTML, then set on mount */
  const [greeting, setGreeting] = useState('Good evening');
  useEffect(() => {
    setGreeting(computeGreeting());
  }, []);

  return (
    <header className="hero only-player">
      <canvas id="heroCanvas" ref={canvasRef} />
      {chartBg}
      <div className="hero-inner hp-grid">
        <div>
          <div className="hp-greet">
            <div className="avatar-wrap">
              <div className="avatar-ring" />
              <div className="avatar-face">{avatar}</div>
            </div>
            <div>
              <h1>
                <span id="greeting">{greeting}</span>, <span className="nm">{name}</span>.
              </h1>
              <div className="vipline">
                <span className="tier">{tierName}</span>You&apos;re <b>{wagerToNext} MORBIUS</b> from{' '}
                <b>{nextTierName}</b> — that&apos;s {nextTierRakeback} back on every losing bet.
              </div>
            </div>
          </div>

          <div className="digest">
            <span className="d">
              <span className="k">WHILE YOU WERE AWAY</span>
            </span>
            {digest.map((d, i) => (
              <span key={i} className="d" dangerouslySetInnerHTML={{ __html: d.html }} />
            ))}
          </div>

          <div className="resume">
            <div className="mini">
              <svg viewBox="0 0 80 56" width="70">
                <rect x="14" y="10" width="22" height="30" rx="3" fill="#f8fafc" transform="rotate(-8 25 25)" />
                <rect x="34" y="8" width="22" height="30" rx="3" fill="#f8fafc" transform="rotate(7 45 23)" />
                <text x="21" y="28" fontSize="11" fill="#dc2626" fontWeight="800" transform="rotate(-8 25 25)">
                  A♥
                </text>
                <text x="41" y="26" fontSize="11" fill="#0f172a" fontWeight="800" transform="rotate(7 45 23)">
                  K♠
                </text>
                <ellipse cx="63" cy="42" rx="9" ry="3.4" fill="#f59e0b" />
                <ellipse cx="63" cy="38.5" rx="9" ry="3.4" fill="#fbbf24" />
              </svg>
            </div>
            <div>
              <div className="tt">PICK UP WHERE YOU LEFT OFF</div>
              <h3>{resume.title}</h3>
              <p>{resume.sub}</p>
            </div>
            <div className="go">→</div>
          </div>
        </div>

        <div className="hp-side">
          <div className="chip3d">
            <div className="chip-coin">
              <img src="/morbius/MorbiusLogo (3).png" alt="MORBIUS" />
            </div>
            <div className="lbl">PLAY BALANCE</div>
            <div className="amt">
              {balance} <span>MORBIUS</span>
            </div>
            <div className="usd">{balanceUsd}</div>
            <div className="acts">
              <button className="btn-gold" onClick={onDeposit}>
                Deposit
              </button>
              <button className="btn-ghost" onClick={onDashboard}>
                Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ────────────────────────────────────────────────────────────
   3. HERO · VISITOR
   ──────────────────────────────────────────────────────────── */
export interface HeroVisitorProps {
  gamesPlayed?: number;
  morbiusWon?: number;
  biggestWin?: number;
  players?: number;
  /** Optional ambient background layer (e.g. <PriceChartBg />) rendered behind .hero-inner. */
  chartBg?: React.ReactNode;
  onTakeSeat?: () => void;
}

export function HeroVisitor({
  gamesPlayed = 3412086,
  morbiusWon = 61240000,
  biggestWin = 148200,
  players = 4216,
  chartBg = null,
  onTakeSeat,
}: HeroVisitorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEmbers(canvasRef);

  const proofRef = useRef<HTMLDivElement>(null);

  /* port of the lab's countUp() — eased 1.6s count-up on the .proof numbers */
  useEffect(() => {
    const root = proofRef.current;
    if (!root) return;
    let stopped = false;
    const rafs: number[] = [];
    root.querySelectorAll<HTMLElement>('.n').forEach((el) => {
      const target = parseInt(el.dataset.count ?? '0', 10);
      const t0 = performance.now();
      function step(t: number) {
        if (stopped) return;
        const p = Math.min((t - t0) / 1600, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.floor(target * eased).toLocaleString('en-US');
        if (p < 1) rafs.push(requestAnimationFrame(step));
      }
      rafs.push(requestAnimationFrame(step));
    });
    return () => {
      stopped = true;
      rafs.forEach((r) => cancelAnimationFrame(r));
    };
  }, [gamesPlayed, morbiusWon, biggestWin, players]);

  return (
    <header className="hero only-visitor">
      <canvas id="heroCanvasV" ref={canvasRef} />
      {chartBg}
      <div className="hero-inner hv">
        <div className="kick">THE MORBIUS CASINO · 26 GAMES</div>
        <h1>
          PLAY. RANK UP.<span className="l2">GET PAID BACK.</span>
        </h1>
        <p className="sub">
          Lose a bet, <b>get paid back</b>. Climb six VIP tiers from Bronze at 5% to Obsidian at{' '}
          <b>25% back on every loss</b>. Build your avatar, take your seat, and make the house soften every hit.
        </p>
        <div className="ctas">
          <button className="cta-main" onClick={onTakeSeat}>
            TAKE A SEAT
          </button>
          <button className="cta-sec">See the ladder ↓</button>
        </div>
        <div className="proof" ref={proofRef}>
          <div className="p">
            <div className="n c" data-count={gamesPlayed}>
              0
            </div>
            <div className="l">GAMES PLAYED</div>
          </div>
          <div className="p">
            <div className="n g" data-count={morbiusWon}>
              0
            </div>
            <div className="l">MORBIUS WON</div>
          </div>
          <div className="p">
            <div className="n o" data-count={biggestWin}>
              0
            </div>
            <div className="l">BIGGEST WIN</div>
          </div>
          <div className="p">
            <div className="n e" data-count={players}>
              0
            </div>
            <div className="l">PLAYERS</div>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ────────────────────────────────────────────────────────────
   4. THE VAULT — rolling odometer strip
   ──────────────────────────────────────────────────────────── */
function OdometerDigit({ digit }: { digit: number }) {
  const colRef = useRef<HTMLSpanElement>(null);
  /* like the lab: mount at 0, then roll to the target on the next frame */
  useEffect(() => {
    const col = colRef.current;
    if (!col) return;
    const raf = requestAnimationFrame(() => {
      col.style.transform = `translateY(${-38 * digit}px)`;
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <span className="dg">
      <span className="col" ref={colRef}>
        {'0123456789'.split('').map((d) => (
          <span key={d}>{d}</span>
        ))}
      </span>
    </span>
  );
}

export interface VaultStripProps {
  value?: number;
  gamesPlayed?: string;
  biggestWin?: string;
  price?: string;
  priceLabel?: string;
  /** When provided, the price stat becomes clickable (opens the chart modal). */
  onPriceClick?: () => void;
}

export function VaultStrip({
  value = 61240418,
  gamesPlayed = '3.4M',
  biggestWin = '148,200',
  price = '$0.00042 ▲',
  priceLabel = 'MORBIUS / USD',
  onPriceClick,
}: VaultStripProps) {
  const [val, setVal] = useState(value);

  /* reset when the prop changes */
  useEffect(() => {
    setVal(value);
  }, [value]);

  /* odometer rolls only when the real value changes (analytics refetch) */

  const str = val.toLocaleString('en-US');

  return (
    <section className="furnace">
      <div className="furn-title">
        <div className="fl">🏆</div>
        <div className="tt">
          <b>THE VAULT</b>
          <span>ALL-TIME MORBIUS WON</span>
        </div>
      </div>
      <div className="odometer" id="burnOdo" aria-label="All-time MORBIUS won">
        {str.split('').map((ch, i) =>
          ch === ',' ? (
            <span key={`${val}-${i}`} className="sep">
              ,
            </span>
          ) : (
            /* key includes val so every digit re-rolls from 0 each tick, like the lab's full re-render */
            <OdometerDigit key={`${val}-${i}`} digit={parseInt(ch, 10)} />
          )
        )}
        <span className="unit">MORBIUS</span>
      </div>
      <div className="furn-stats">
        <div className="s">
          <div className="n cy">{gamesPlayed}</div>
          <div className="l">GAMES PLAYED</div>
        </div>
        <div className="s">
          <div className="n gd">{biggestWin}</div>
          <div className="l">BIGGEST WIN</div>
        </div>
        <div
          className="s"
          onClick={onPriceClick}
          role={onPriceClick ? 'button' : undefined}
          tabIndex={onPriceClick ? 0 : undefined}
          onKeyDown={
            onPriceClick
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPriceClick();
                  }
                }
              : undefined
          }
          style={onPriceClick ? { cursor: 'pointer' } : undefined}
        >
          <div className="n up">{price}</div>
          <div className="l">{priceLabel}</div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   5. TONIGHT'S TABLE — deterministic daily spotlight
   ──────────────────────────────────────────────────────────── */
export function TonightsTable({ cards }: { cards?: React.ReactNode }) {
  return (
    <section className="zone">
      <div className="zone-head">
        <h2>
          TONIGHT&apos;S <em>TABLE</em>
        </h2>
      </div>
      <div className="spot-grid">
        {cards ?? (
          <>
            {/* featured: PLINKO */}
            <Link href="/plinko2" className="scene-card big" style={{ '--glow': 'rgba(34,211,238,.25)' } as React.CSSProperties}>
              <span className="badge feat">★ FEATURED TONIGHT</span>
              <div className="stage">
                <PlinkoScene />
              </div>
              <div className="meta">
                <div className="name f-titan">PLINKO</div>
                <div className="row">
                  <span className="st">
                    Weekly high <b>48,200</b>
                  </span>
                  <span>·</span>
                  <span className="st">top slot ×1000</span>
                </div>
              </div>
            </Link>

            {/* runner-up: CRASH */}
            <Link href="/crash" className="scene-card" style={{ '--glow': 'rgba(251,113,133,.22)' } as React.CSSProperties}>
              <span className="badge hot">🔥 HOT STREAK</span>
              <div className="stage">
                <CrashScene />
              </div>
              <div className="meta">
                <div className="name f-bungee" style={{ fontSize: 14 }}>
                  CRASH
                </div>
                <div className="row">
                  <span className="st">
                    Best today <b>×124</b>
                  </span>
                </div>
              </div>
            </Link>

            {/* runner-up: MINES */}
            <Link href="/mines2" className="scene-card" style={{ '--glow': 'rgba(52,211,153,.2)' } as React.CSSProperties}>
              <div className="stage">
                <MinesScene />
              </div>
              <div className="meta">
                <div className="name f-lilita" style={{ fontSize: 15 }}>
                  MINES
                </div>
                <div className="row">
                  <span className="st">24 safe picks record</span>
                </div>
              </div>
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   6. THE FLOOR — unified 3D scene cards + filter pills
   ──────────────────────────────────────────────────────────── */
type FloorFamily = 'blackjack' | 'poker' | 'table' | 'arcade';

interface FloorGameEntry {
  key: string;
  name: string;
  cat: string;
  family: FloorFamily;
  addedAt: string;
  fontClass: string;
  nameSize: number;
  blurb: string;
  Scene: React.ComponentType;
  badge?: string;
  badgeClass?: string;
  glow?: string;
  href: string;
}

/* The floor is grouped by game family so it reads as a menu instead of a
   34-card wall. 'all' shows every shelf with its heading; picking a family
   shows just that shelf. Order runs card games first, then table, then the
   originals — biggest draw to deepest cut. */
const FLOOR_FAMILIES: { f: FloorFamily; label: string; sub: string }[] = [
  { f: 'blackjack', label: 'Blackjack', sub: 'six ways to make 21' },
  { f: 'poker', label: 'Poker', sub: "hold'em, stud & the dealer duels" },
  { f: 'table', label: 'Casino Table', sub: 'the classics, one chip' },
  { f: 'arcade', label: 'Arcade', sub: 'fast originals, instant settle' },
];

const FLOOR_FILTERS: { f: string; label: string }[] = [
  { f: 'all', label: 'All' },
  ...FLOOR_FAMILIES.map((x) => ({ f: x.f as string, label: x.label })),
];

function FloorCard({ g }: { g: FloorGameEntry }) {
  /* `nameSize` stays the per-game *relative* weighting the catalog authored
     (long names smaller). The absolute size is CSS's call — each context
     multiplies it by its own `--name-scale`, so one knob resizes every title
     without touching 30-odd catalog rows. */
  const style = {
    '--name-size': g.nameSize,
    ...(g.glow ? { '--glow': g.glow } : {}),
  } as React.CSSProperties;
  return (
    <Link href={g.href} className="scene-card" data-cat={g.cat} style={style}>
      {g.badge && <span className={`badge ${g.badgeClass ?? 'new'}`}>{g.badge}</span>}
      <div className="stage">
        <g.Scene />
      </div>
      <div className="meta">
        <CurvedName text={g.name} className={`name ${g.fontClass}`} />
        <div className="row">
          <span className="st">{g.blurb}</span>
        </div>
      </div>
    </Link>
  );
}

export function TheFloor() {
  const [filter, setFilter] = useState('all');
  const games = FLOOR_GAMES as unknown as FloorGameEntry[];

  const shelves = FLOOR_FAMILIES
    .filter((fam) => filter === 'all' || filter === fam.f)
    .map((fam) => ({ ...fam, games: games.filter((g) => g.family === fam.f) }))
    .filter((shelf) => shelf.games.length > 0);

  return (
    <section className="zone">
      <div className="zone-head">
        <h2>
          THE <em>FLOOR</em>
        </h2>
        <div className="pills">
          {FLOOR_FILTERS.map((p) => (
            <button
              key={p.f}
              className={`pill${filter === p.f ? ' on' : ''}`}
              data-f={p.f}
              onClick={() => setFilter(p.f)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {shelves.map((shelf) => (
        <div key={shelf.f} className="floor-shelf">
          <div className="shelf-head">
            <h3>{shelf.label}</h3>
            <span className="shelf-sub">{shelf.sub}</span>
            <span className="shelf-count">{shelf.games.length}</span>
          </div>
          <div className="floor-grid">
            {shelf.games.map((g) => (
              <FloorCard key={g.key} g={g} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   6b. CREATE-A-SLOT — build-your-own slot machine promo
   ──────────────────────────────────────────────────────────── */
const FORGE_FEATS = [
  { ic: '🎨', t: 'Design every reel', d: 'symbols, colors, sounds & border FX' },
  { ic: '🎁', t: 'Real bonus rounds', d: 'free spins, wheels & pick games' },
  { ic: '🛡️', t: 'Provably fair', d: 'every spin sealed & verifiable' },
  { ic: '🌐', t: 'Embed anywhere', d: 'one iframe snippet, any website' },
  { ic: '🪙', t: 'Your own token', d: 'run it on any PRC-20 you choose' },
  { ic: '📈', t: 'Creator dashboard', d: 'live RTP, volume & bankroll stats' },
];

export function SlotForge() {
  return (
    <section className="zone forge-zone">
      <div className="zone-head">
        <h2>
          CREATE-A-<em>SLOT</em>
        </h2>
        <span className="soon">COMING SOON</span>
      </div>
      <div className="forge-panel">
        <div className="forge-copy">
          <div className="forge-kicker">CREATOR TOOL &middot; COMING SOON</div>
          <h3>
            Create your own <em>Slot&nbsp;Machine!</em>
          </h3>
          <p>
            Build a machine from scratch — pick the grid, draw the paytable, wire up a bonus
            round — then publish it and drop it on any website with one embed code. Fund it
            with your own token and the house edge is <b>yours</b>.
          </p>
          <ul className="forge-feats">
            {FORGE_FEATS.map((f) => (
              <li key={f.t}>
                <span className="fi">{f.ic}</span>
                <span className="ft">
                  <b>{f.t}</b>
                  <i>{f.d}</i>
                </span>
              </li>
            ))}
          </ul>
          <div className="forge-cta-row">
            <a className="forge-cta" href="/slot-builder-lab.html">
              <span className="fc-ic">🎰</span> OPEN THE BUILDER
            </a>
            <a className="forge-guide" href="/slot-guide.html">
              Read the guide <span aria-hidden="true">→</span>
            </a>
            <span className="forge-cta-sub">free to build &middot; no code needed</span>
          </div>
        </div>
        <div className="forge-shots">
          <div className="fshot fshot-builder">
            <img src="/home2/forge-builder.webp" alt="The Create-A-Slot builder studio" loading="lazy" />
            <span className="fshot-tag">the studio</span>
          </div>
          <div className="fshot fshot-cab">
            <img src="/home2/forge-cabinet.webp" alt="A community-built slot machine hitting a win" loading="lazy" />
            <span className="fshot-tag gold">your machine, live</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   6c. CREATE-A-TOURNAMENT — custom PRC-20 buy-in poker tournaments
   ──────────────────────────────────────────────────────────── */
const TOURNEY_FEATS = [
  { ic: '🪙', t: 'Buy-ins in your token', d: 'any PRC-20 — or MORBIUS' },
  { ic: '🔒', t: 'Escrowed on-chain', d: 'every buy-in sits in the prize escrow' },
  { ic: '💸', t: '2% of the pool is yours', d: 'paid out with the prizes' },
  { ic: '⏱️', t: 'Sit & Go or scheduled', d: 'fires when the seats fill' },
  { ic: '↩️', t: 'Refunds handled', d: 'short table cancels and pays everyone back' },
  { ic: '📣', t: 'Share card built in', d: 'one-click PNG for the timeline' },
];

export function TourneyForge() {
  return (
    <section className="zone forge-zone tourney-zone">
      <div className="zone-head">
        <h2>
          CREATE-A-<em>TOURNAMENT</em>
        </h2>
      </div>
      <div className="forge-panel">
        <div className="forge-copy">
          <div className="forge-kicker">CREATOR TOOL &middot; PRC-20</div>
          <h3>
            Run a <em>poker&nbsp;tournament</em> for your token
          </h3>
          <p>
            Pick your PRC-20, set the buy-in, and every seat pays into the
            on-chain prize escrow. The pool builds as players join, the table
            fires when it fills, and <b>2% of the prize pool is yours</b> when
            the payouts settle.
          </p>
          <ul className="forge-feats">
            {TOURNEY_FEATS.map((f) => (
              <li key={f.t}>
                <span className="fi">{f.ic}</span>
                <span className="ft">
                  <b>{f.t}</b>
                  <i>{f.d}</i>
                </span>
              </li>
            ))}
          </ul>
          <div className="forge-cta-row">
            <Link className="forge-cta" href="/poker/tournaments/create">
              <span className="fc-ic">🏆</span> CREATE A TOURNAMENT
            </Link>
            <Link className="forge-guide" href="/poker">
              See what&apos;s running <span aria-hidden="true">→</span>
            </Link>
            <span className="forge-cta-sub">your token &middot; your rake</span>
          </div>
        </div>
        <div className="forge-shots one">
          <div className="fshot fshot-cab">
            <img
              src="/home2/tourney-share-card.webp"
              alt="A poker tournament share card with a HEX buy-in and prize pool"
              loading="lazy"
            />
            <span className="fshot-tag gold">your tournament, shareable</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   6d. CREATE-A-TABLE — custom blackjack tables
   ──────────────────────────────────────────────────────────── */
const TABLE_FEATS = [
  { ic: '🖼️', t: 'Your art on the felt', d: 'upload a board or start from a preset' },
  { ic: '🃏', t: 'Cards & backs to match', d: 'faces, backs, and how they lie' },
  { ic: '🎬', t: 'Deal animations', d: 'pick how cards land and clear' },
  { ic: '🔊', t: 'Table sounds', d: 'chips, shuffles and the dealer' },
  { ic: '📐', t: 'Nudge everything', d: 'seats, dealer and card angle, to the pixel' },
  { ic: '🎥', t: 'Video tables too', d: 'an MP4 board on a 24-hour cycle' },
];

export function TableForge() {
  return (
    <section className="zone forge-zone table-zone">
      <div className="zone-head">
        <h2>
          CREATE-A-<em>TABLE</em>
        </h2>
        <span className="soon">COMING SOON</span>
      </div>
      <div className="forge-panel">
        <div className="forge-copy">
          <div className="forge-kicker">BLACKJACK &middot; COMING SOON</div>
          <h3>
            Put your project on a <em>blackjack&nbsp;table</em>
          </h3>
          <p>
            Six steps and your board is on the floor: drop in your art, style
            the cards, choose the animations and sounds, then nudge every seat
            into place. Players sit down at <b>your</b> table and play it in
            MORBIUS.
          </p>
          <ul className="forge-feats">
            {TABLE_FEATS.map((f) => (
              <li key={f.t}>
                <span className="fi">{f.ic}</span>
                <span className="ft">
                  <b>{f.t}</b>
                  <i>{f.d}</i>
                </span>
              </li>
            ))}
          </ul>
          <div className="forge-cta-row">
            <Link className="forge-cta" href="/blackjack-multi/design">
              <span className="fc-ic">🎨</span> OPEN THE TABLE BUILDER
            </Link>
            <Link className="forge-guide" href="/blackjack-multi">
              Play the live tables <span aria-hidden="true">→</span>
            </Link>
            <span className="forge-cta-sub">free to build &middot; no code needed</span>
          </div>
        </div>
        <div className="forge-shots">
          <div className="fshot fshot-builder">
            <img src="/home2/tableforge-studio.webp" alt="The Create-A-Table builder studio" loading="lazy" />
            <span className="fshot-tag">the studio</span>
          </div>
          <div className="fshot fshot-cab">
            <img src="/home2/tableforge-preview.webp" alt="A branded blackjack table mid-round" loading="lazy" />
            <span className="fshot-tag gold">your table, in play</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   7. THE WEEKLY DROP — raffle jackpot
   ──────────────────────────────────────────────────────────── */
export interface WeeklyDropWinner {
  letter: string;
  name: string;
  amount: string;
  gradient: string;
}

const DEFAULT_WINNERS: WeeklyDropWinner[] = [
  { letter: 'M', name: 'MorbKing', amount: '15,000', gradient: 'radial-gradient(circle at 32% 28%,#fde68a,#f59e0b)' },
  { letter: 'P', name: 'pTIGER', amount: '6,250', gradient: 'radial-gradient(circle at 32% 28%,#a5f3fc,#0891b2)' },
  { letter: 'L', name: 'LuckyPLS', amount: '3,750', gradient: 'radial-gradient(circle at 32% 28%,#c4b5fd,#7c3aed)' },
];

export interface WeeklyDropProps {
  /** Small line under the unit row, e.g. '+142 fed by bets this week'. */
  accruedNote?: string | null;
  pot?: number;
  entries?: number;
  progress?: number;
  entriesSub?: React.ReactNode;
  winners?: WeeklyDropWinner[];
  /** Pill text above the title (e.g. '🎟 DROP #12 · LIVE'). */
  statusPill?: string;
  /** When provided, count down to this instant instead of the computed next Sunday 8PM. */
  countdownTo?: Date;
  /** When true, the pot is real: skip the fake drip interval and just show `pot`. */
  potLive?: boolean;
  /**
   * Players holding ≥ 1 entry in the open draw. When set (backend live), a
   * "N players entered · View entrants" line shows under the jp-you card in
   * both player and visitor modes; omit to hide the line entirely.
   */
  totalEntrants?: number | null;
  /** Opens the entrants modal (rendered by the page, e.g. Home2Client). */
  onViewEntrants?: () => void;
}

/* Fallback drop time: next Sunday 8 PM Eastern (DST-aware), matching the
 * backend. Only used when the server's closesAt hasn't loaded yet. */
const nextDrop = nextSundayDropUtc;

export function WeeklyDrop({
  pot = 25000,
  entries = 14,
  progress = 68,
  entriesSub = (
    <>
      <b style={{ color: 'var(--gold)' }}>320 MORBIUS</b> wagered to your next entry · +1 free entry for signing in
      today ✓
    </>
  ),
  winners = DEFAULT_WINNERS,
  statusPill = '🎟 LIGHTING SOON',
  countdownTo,
  potLive = false,
  totalEntrants = null,
  onViewEntrants,
  accruedNote = null,
}: WeeklyDropProps) {
  const [potVal, setPotVal] = useState(pot);
  useEffect(() => {
    setPotVal(pot);
  }, [pot]);

  /* lab: v += 1 + floor(random()*6) every 2200ms — disabled when the pot is live */
  useEffect(() => {
    if (potLive) return;
    const id = setInterval(() => {
      setPotVal((v) => v + 1 + Math.floor(Math.random() * 6));
    }, 2200);
    return () => clearInterval(id);
  }, [potLive]);

  /* live countdown — to `countdownTo` when given, else next Sunday 20:00 (lab's tick()) */
  const countdownMs = countdownTo?.getTime();
  const [cd, setCd] = useState({ d: '0', h: '00', m: '00', s: '00' });
  useEffect(() => {
    function tick() {
      let ms = Math.max(0, (countdownMs ?? nextDrop().getTime()) - Date.now());
      const day = Math.floor(ms / 86400000);
      ms -= day * 86400000;
      const hr = Math.floor(ms / 3600000);
      ms -= hr * 3600000;
      const mi = Math.floor(ms / 60000);
      ms -= mi * 60000;
      const se = Math.floor(ms / 1000);
      setCd({
        d: String(day),
        h: String(hr).padStart(2, '0'),
        m: String(mi).padStart(2, '0'),
        s: String(se).padStart(2, '0'),
      });
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [countdownMs]);

  return (
    <section className="jackpot" id="weeklyDrop">
      <div className="soon">{statusPill}</div>
      <h2>
        THE WEEKLY <span>DROP</span>
      </h2>
      <div className="jp-num" id="jpNum">
        {potVal.toLocaleString('en-US')}
      </div>
      <div className="jp-unit">MORBIUS · TOP 3 WIN EVERY SUNDAY · 8PM ET</div>
      {accruedNote && (
        <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: -12, marginBottom: 16, position: 'relative', zIndex: 1 }}>
          {accruedNote}
        </div>
      )}

      <div className="jp-count" id="jpCount">
        <div className="cb">
          <b id="cdD">{cd.d}</b>
          <span>DAYS</span>
        </div>
        <div className="cb">
          <b id="cdH">{cd.h}</b>
          <span>HOURS</span>
        </div>
        <div className="cb">
          <b id="cdM">{cd.m}</b>
          <span>MIN</span>
        </div>
        <div className="cb">
          <b id="cdS">{cd.s}</b>
          <span>SEC</span>
        </div>
      </div>

      <div className="jp-you only-player">
        <div className="t">
          <span>🎟 YOUR ENTRIES</span>
          <b>{entries}</b>
        </div>
        <div className="bar">
          <i style={{ width: `${progress}%` }} />
        </div>
        <div className="sub">{entriesSub}</div>
      </div>
      <div className="jp-you only-visitor" style={{ textAlign: 'center' }}>
        <div className="sub" style={{ margin: 0 }}>
          Every <b style={{ color: 'var(--gold)' }}>1,000 MORBIUS</b> you play is a ticket — plus one free entry every
          day just for signing in. Connect to start earning.
        </div>
      </div>

      {/* live entrant count — hidden entirely when the backend/draw is absent */}
      {totalEntrants != null && (
        <div className="jp-entrants">
          🎟 <b>{totalEntrants.toLocaleString('en-US')}</b> {totalEntrants === 1 ? 'player' : 'players'} entered ·{' '}
          <button type="button" onClick={onViewEntrants}>
            View entrants
          </button>
        </div>
      )}

      {winners.length > 0 && (
        <>
          <div className="jp-wlbl">LAST WEEK&apos;S TOP 3</div>
          <div className="jp-winners">
            {winners.map((w, i) => (
              <div key={w.name} className={`w${i === 0 ? ' first' : ''}`}>
                <div className="av" style={{ background: w.gradient }}>
                  {w.letter}
                </div>
                <span>{w.name}</span>
                <b>{w.amount}</b>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="how">
        <b>0.25% of every bet on every game</b> feeds the pot — guaranteed <b>25,000 MORBIUS minimum</b> each week.
        Entries reset every draw, winners are paid straight to their balance, and every draw is{' '}
        <b>commit-reveal verifiable</b>. Winners wear the aura for a week.
      </p>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   8. THE LADDER — VIP strip
   ──────────────────────────────────────────────────────────── */
const VIP_TIERS = [
  { h: '25', level: 1, name: 'BRONZE', rb: '5%', hex: '#cd7f32' },
  { h: '210', level: 2, name: 'SILVER', rb: '8%', hex: '#cbd5e1' },
  { h: '45', level: 3, name: 'GOLD', rb: '12%', hex: '#f6c445' },
  { h: '190', level: 4, name: 'PLATINUM', rb: '16%', hex: '#e5e4e2' },
  { h: '260', level: 5, name: 'DIAMOND', rb: '20%', hex: '#9fe6ff' },
  { h: '285', level: 6, name: 'OBSIDIAN', rb: '25%', hex: '#6d5ea8' },
];

export function VipLadder({ currentTier = 'SILVER' }: { currentTier?: string }) {
  return (
    <section className="zone">
      <div className="zone-head">
        <h2>
          THE <em>LADDER</em>
        </h2>
      </div>
      <div className="vip-strip">
        {VIP_TIERS.map((t) => (
          <div
            key={t.name}
            className={`vip-card${t.name === currentTier.toUpperCase() ? ' you' : ''}`}
            style={{ '--h': t.h } as React.CSSProperties}
          >
            <VipTierBadge
              tier={{ tierName: t.name, color: t.hex, tierLevel: t.level }}
              size="md"
              className="medal-img"
            />
            <div className="nm">{t.name}</div>
            <div className="rb">{t.rb}</div>
            <div className="rl">RAKEBACK</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   9. FOOTER
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
          <span className="brand">
            MORBIUS<i>.IO</i>
          </span>
          <p className="foot-tag">
            The Web3 casino on PulseChain — 25+ provably-fair games, one chip, VIP rakeback on every
            loss.
          </p>
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
        <span className="fair">Play responsibly · 18+</span>
        <div className="foot-legal">
          <button type="button" className="foot-rg" onClick={() => setRgOpen(true)}>
            Responsible gaming
          </button>
          <span className="foot-copy">© 2026 Morbius.io</span>
        </div>
      </div>

      <SelfExclusionModal isOpen={rgOpen} onClose={() => setRgOpen(false)} />
    </footer>
  );
}
