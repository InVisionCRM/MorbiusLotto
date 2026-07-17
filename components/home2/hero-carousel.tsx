'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Users2, Crown, Gift, Radar, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';

/* ────────────────────────────────────────────────────────────────────────────
   HERO CAROUSEL — auto-rotating promo cards in the sportsbook-ad style.
   Four glossy slides (Refer & Earn · Tier System · Weekly Drop · Token Analyzer)
   auto-advance to the right; a 3-stat proof strip sits below. Facts used are
   real (25% top-tier rakeback, Sunday 8PM drop, scan.morbius.io) — no invented
   numbers. Replaces the old static HeroVisitor.
   ──────────────────────────────────────────────────────────────────────────── */

export interface HeroCarouselProps {
  gamesPlayed?: number;
  morbiusWon?: number;
  biggestWin?: number;
  onTakeSeat?: () => void;
  onOpenDrop?: () => void;
  onRefer?: () => void;
  chartBg?: React.ReactNode;
}

type Slide = {
  key: string;
  accent: string;      // main accent
  accent2: string;     // secondary accent (gradient partner)
  kick: string;
  title: React.ReactNode;
  sub: React.ReactNode;
  cta: string;
  ctaHref?: string;
  action?: 'seat' | 'drop' | 'refer';
  art: React.ReactNode;
};

const AUTO_MS = 5600;

export function HeroCarousel({
  gamesPlayed,
  morbiusWon,
  biggestWin,
  onTakeSeat,
  onOpenDrop,
  onRefer,
  chartBg = null,
}: HeroCarouselProps) {
  const slides: Slide[] = useMemo(
    () => [
      {
        key: 'refer',
        accent: '#34d399',
        accent2: '#22d3ee',
        kick: 'REFER & EARN',
        title: (
          <>
            BRING A FRIEND.
            <span className="l2">GET PAID FOR IT.</span>
          </>
        ),
        sub: (
          <>
            Share your link — earn <b>MORBIUS</b> on everything your crew plays, for life. The more
            they run it, the more you stack.
          </>
        ),
        cta: 'GET MY LINK',
        action: 'refer',
        art: <ReferArt />,
      },
      {
        key: 'tier',
        accent: '#fbbf24',
        accent2: '#f59e0b',
        kick: 'VIP TIER SYSTEM',
        title: (
          <>
            PLAY. RANK UP.
            <span className="l2">GET PAID BACK.</span>
          </>
        ),
        sub: (
          <>
            Lose a bet, <b>get paid back</b>. Six VIP tiers from Bronze at 5% to Obsidian at{' '}
            <b>25% back on every loss</b>. The house softens every hit.
          </>
        ),
        cta: 'TAKE A SEAT',
        action: 'seat',
        art: <TierArt />,
      },
      {
        key: 'drop',
        accent: '#a78bfa',
        accent2: '#f472b6',
        kick: 'THE WEEKLY DROP',
        title: (
          <>
            ONE POT.
            <span className="l2">EVERY SUNDAY.</span>
          </>
        ),
        sub: (
          <>
            Play all week to earn entries. The <b>top 3</b> split the pot live every{' '}
            <b>Sunday 8PM ET</b> — no ticket to buy, your play is your entry.
          </>
        ),
        cta: 'ENTER THE DROP',
        action: 'drop',
        art: <DropArt />,
      },
      {
        key: 'scan',
        accent: '#22d3ee',
        accent2: '#38bdf8',
        kick: 'TOKEN ANALYZER',
        title: (
          <>
            SCAN ANY TOKEN.
            <span className="l2">IN ONE TAP.</span>
          </>
        ),
        sub: (
          <>
            Instant PulseChain token analysis — liquidity, holders, risk flags and charts at{' '}
            <b>Scan.Morbius.io</b>. Know before you ape.
          </>
        ),
        cta: 'SCAN A TOKEN',
        ctaHref: 'https://scan.morbius.io',
        art: <ScanArt />,
      },
    ],
    []
  );

  const [[page, dir], setPage] = useState<[number, number]>([0, 1]);
  const [paused, setPaused] = useState(false);
  const idx = ((page % slides.length) + slides.length) % slides.length;
  const slide = slides[idx];

  const go = useCallback((d: number) => setPage(([p]) => [p + d, d]), []);
  const jump = useCallback(
    (target: number) => setPage(([p]) => [target, target > (((p % slides.length) + slides.length) % slides.length) ? 1 : -1]),
    [slides.length]
  );

  // auto-advance to the right, paused on hover/focus
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => go(1), AUTO_MS);
    return () => clearTimeout(t);
  }, [page, paused, go]);

  const fireCta = useCallback(
    (s: Slide) => {
      if (s.ctaHref) {
        window.open(s.ctaHref, '_blank', 'noopener,noreferrer');
        return;
      }
      if (s.action === 'drop') return onOpenDrop?.();
      if (s.action === 'refer') return (onRefer ?? onTakeSeat)?.();
      return onTakeSeat?.();
    },
    [onOpenDrop, onRefer, onTakeSeat]
  );

  return (
    <header
      className="hero only-visitor"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {chartBg}
      <div className="hero-inner">
        <div className="hc" style={{ '--acc': slide.accent, '--acc2': slide.accent2 } as React.CSSProperties}>
          <div className="hc-viewport">
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              <motion.div
                key={slide.key}
                className="hc-slide"
                custom={dir}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ x: { type: 'spring', stiffness: 260, damping: 32 }, opacity: { duration: 0.3 } }}
                style={{ '--acc': slide.accent, '--acc2': slide.accent2 } as React.CSSProperties}
              >
                <div className="hc-halftone" />
                <div className="hc-text">
                  <div className="hc-kick">
                    <span className="hc-kdot" />
                    {slide.kick}
                  </div>
                  <h1 className="hc-title">{slide.title}</h1>
                  <p className="hc-sub">{slide.sub}</p>
                  <div className="hc-ctas">
                    <button className="hc-cta" onClick={() => fireCta(slide)}>
                      {slide.cta}
                      <ArrowUpRight size={18} strokeWidth={2.6} />
                    </button>
                  </div>
                </div>
                <div className="hc-art">{slide.art}</div>
              </motion.div>
            </AnimatePresence>

            <button className="hc-arrow left" aria-label="Previous" onClick={() => go(-1)}>
              <ChevronLeft size={20} />
            </button>
            <button className="hc-arrow right" aria-label="Next" onClick={() => go(1)}>
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="hc-dots" role="tablist" aria-label="Promotions">
            {slides.map((s, i) => (
              <button
                key={s.key}
                className={'hc-dot' + (i === idx ? ' on' : '')}
                aria-label={s.kick}
                aria-selected={i === idx}
                role="tab"
                onClick={() => jump(i)}
              >
                <span className="hc-dot-fill" style={{ animationDuration: paused ? '0s' : `${AUTO_MS}ms` }} />
              </button>
            ))}
          </div>
        </div>

        <StatStrip gamesPlayed={gamesPlayed} morbiusWon={morbiusWon} biggestWin={biggestWin} />
      </div>
    </header>
  );
}

const slideVariants = {
  enter: (d: number) => ({ x: d > 0 ? '102%' : '-102%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? '-102%' : '102%', opacity: 0 }),
};

/* ── stat strip (3 tiles, real data, eased count-up) ───────────────────────── */
function StatStrip({
  gamesPlayed,
  morbiusWon,
  biggestWin,
}: {
  gamesPlayed?: number;
  morbiusWon?: number;
  biggestWin?: number;
}) {
  return (
    <div className="hc-stats">
      <Stat cls="c" value={gamesPlayed} label="GAMES PLAYED" />
      <Stat cls="g" value={morbiusWon} label="MORBIUS WON" />
      <Stat cls="o" value={biggestWin} label="BIGGEST WIN" />
    </div>
  );
}

function Stat({ cls, value, label }: { cls: string; value?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value == null) {
      el.textContent = '—';
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min((t - t0) / 1600, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.floor(value * eased).toLocaleString('en-US');
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <div className="hc-stat">
      <div className={'hc-stat-n ' + cls} ref={ref}>
        {value == null ? '—' : '0'}
      </div>
      <div className="hc-stat-l">{label}</div>
    </div>
  );
}

/* ── per-card SVG graphics ─────────────────────────────────────────────────── */

function ReferArt() {
  return (
    <div className="hc-graphic">
      <div className="hc-glow" />
      <svg viewBox="0 0 260 220" className="hc-svg" aria-hidden>
        <defs>
          <radialGradient id="rf-core" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#d1fae5" />
            <stop offset="55%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#0f7a5a" />
          </radialGradient>
          <linearGradient id="rf-node" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#0e7490" />
          </linearGradient>
        </defs>
        {/* links */}
        {[
          [130, 110, 44, 52],
          [130, 110, 214, 44],
          [130, 110, 42, 168],
          [130, 110, 210, 176],
        ].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#34d399" strokeWidth="2" strokeOpacity="0.5" strokeDasharray="4 5">
            <animate attributeName="stroke-dashoffset" from="0" to="-18" dur="1.1s" repeatCount="indefinite" />
          </line>
        ))}
        {/* friend nodes */}
        {[
          [44, 52],
          [214, 44],
          [42, 168],
          [210, 176],
        ].map(([cx, cy], i) => (
          <g key={i}>
            <circle cx={cx} cy={cy} r="20" fill="url(#rf-node)" stroke="#a5f3fc" strokeWidth="1.5" />
            <circle cx={cx} cy={cy - 5} r="6" fill="#04121c" opacity="0.85" />
            <path d={`M${cx - 10} ${cy + 12} a10 8 0 0 1 20 0`} fill="#04121c" opacity="0.85" />
          </g>
        ))}
        {/* central coin */}
        <circle cx="130" cy="110" r="42" fill="url(#rf-core)" stroke="#ecfdf5" strokeWidth="2.5" />
        <text x="130" y="122" textAnchor="middle" fontFamily="'Bowlby One SC',sans-serif" fontSize="34" fill="#04231a">
          M
        </text>
        {/* floating coins */}
        <g className="hc-coin">
          <circle cx="196" cy="112" r="11" fill="#fbbf24" stroke="#fef3c7" strokeWidth="1.5" />
          <text x="196" y="117" textAnchor="middle" fontSize="12" fontWeight="700" fill="#5b3d05">
            +
          </text>
        </g>
      </svg>
      <div className="hc-badge-icon">
        <Users2 size={16} strokeWidth={2.4} />
      </div>
    </div>
  );
}

function TierArt() {
  const tiers = [
    { c: '#a16207', y: 172, w: 128 },
    { c: '#94a3b8', y: 146, w: 116 },
    { c: '#e5e7eb', y: 120, w: 104 },
    { c: '#22d3ee', y: 94, w: 92 },
    { c: '#a78bfa', y: 68, w: 80 },
    { c: '#fbbf24', y: 42, w: 68 },
  ];
  return (
    <div className="hc-graphic">
      <div className="hc-glow" />
      <svg viewBox="0 0 260 220" className="hc-svg" aria-hidden>
        <defs>
          <linearGradient id="tr-crown" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fef3c7" />
            <stop offset="55%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
        </defs>
        {tiers.map((t, i) => (
          <g key={i}>
            <rect x={130 - t.w / 2} y={t.y} width={t.w} height="20" rx="5" fill={t.c} opacity={0.28 + i * 0.12} />
            <rect x={130 - t.w / 2} y={t.y} width={t.w} height="6" rx="3" fill="#ffffff" opacity="0.25" />
          </g>
        ))}
        {/* crown on top */}
        <g transform="translate(130 30)">
          <path d="M-26 6 L-16 -14 L-6 2 L0 -20 L6 2 L16 -14 L26 6 L20 16 L-20 16 Z" fill="url(#tr-crown)" stroke="#fffbeb" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="0" cy="-20" r="3.4" fill="#fff7ed" />
          <circle cx="-16" cy="-14" r="2.6" fill="#fff7ed" />
          <circle cx="16" cy="-14" r="2.6" fill="#fff7ed" />
        </g>
        <text x="212" y="60" textAnchor="middle" fontFamily="'Bowlby One SC',sans-serif" fontSize="20" fill="#fbbf24">
          25%
        </text>
      </svg>
      <div className="hc-badge-icon">
        <Crown size={16} strokeWidth={2.4} />
      </div>
    </div>
  );
}

function DropArt() {
  return (
    <div className="hc-graphic">
      <div className="hc-glow" />
      <svg viewBox="0 0 260 220" className="hc-svg" aria-hidden>
        <defs>
          <linearGradient id="dr-vault" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#312e81" />
            <stop offset="100%" stopColor="#1e1b4b" />
          </linearGradient>
          <radialGradient id="dr-door" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="100%" stopColor="#7c3aed" />
          </radialGradient>
        </defs>
        {/* vault body */}
        <rect x="74" y="58" width="112" height="112" rx="16" fill="url(#dr-vault)" stroke="#a78bfa" strokeWidth="2" />
        <circle cx="130" cy="114" r="40" fill="url(#dr-door)" stroke="#ede9fe" strokeWidth="2.5" />
        {/* handle spokes */}
        <g stroke="#1e1b4b" strokeWidth="4" strokeLinecap="round">
          <line x1="130" y1="88" x2="130" y2="140">
            <animateTransform attributeName="transform" type="rotate" from="0 130 114" to="360 130 114" dur="7s" repeatCount="indefinite" />
          </line>
          <line x1="104" y1="114" x2="156" y2="114">
            <animateTransform attributeName="transform" type="rotate" from="0 130 114" to="360 130 114" dur="7s" repeatCount="indefinite" />
          </line>
        </g>
        <circle cx="130" cy="114" r="7" fill="#faf5ff" />
        {/* spilling coins */}
        {[
          [70, 150, 12, 0],
          [190, 140, 10, 0.4],
          [60, 100, 9, 0.8],
          [198, 92, 11, 1.1],
        ].map(([cx, cy, r, delay], i) => (
          <g key={i} className="hc-coin" style={{ animationDelay: `${delay}s` }}>
            <circle cx={cx} cy={cy} r={r} fill="#fbbf24" stroke="#fffbeb" strokeWidth="1.4" />
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize={r} fontWeight="700" fill="#5b3d05">
              M
            </text>
          </g>
        ))}
      </svg>
      <div className="hc-badge-icon">
        <Gift size={16} strokeWidth={2.4} />
      </div>
    </div>
  );
}

function ScanArt() {
  return (
    <div className="hc-graphic">
      <div className="hc-glow" />
      <svg viewBox="0 0 260 220" className="hc-svg" aria-hidden>
        <defs>
          <linearGradient id="sc-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.55" />
          </linearGradient>
          <clipPath id="sc-clip">
            <circle cx="130" cy="110" r="76" />
          </clipPath>
        </defs>
        {/* scope rings */}
        <circle cx="130" cy="110" r="76" fill="#04121c" stroke="#22d3ee" strokeWidth="2" strokeOpacity="0.6" />
        <circle cx="130" cy="110" r="52" fill="none" stroke="#22d3ee" strokeWidth="1" strokeOpacity="0.3" />
        <circle cx="130" cy="110" r="28" fill="none" stroke="#22d3ee" strokeWidth="1" strokeOpacity="0.3" />
        <g clipPath="url(#sc-clip)">
          {/* candlesticks */}
          {[
            [86, 96, 40, '#34d399'],
            [104, 78, 66, '#34d399'],
            [122, 108, 30, '#fb7185'],
            [140, 66, 78, '#34d399'],
            [158, 90, 50, '#34d399'],
            [176, 116, 26, '#fb7185'],
          ].map(([x, y, h, c], i) => (
            <g key={i}>
              <line x1={x} y1={y - 8} x2={x} y2={y + h + 8} stroke={c as string} strokeWidth="1.5" />
              <rect x={x - 5} y={y} width="10" height={h as number} rx="2" fill={c as string} />
            </g>
          ))}
          {/* sweep */}
          <g className="hc-sweep">
            <path d="M130 110 L130 34 A76 76 0 0 1 206 110 Z" fill="url(#sc-sweep)" />
            <line x1="130" y1="110" x2="130" y2="34" stroke="#a5f3fc" strokeWidth="2" />
          </g>
        </g>
        {/* token chip */}
        <circle cx="130" cy="110" r="17" fill="#0d1120" stroke="#22d3ee" strokeWidth="2" />
        <text x="130" y="116" textAnchor="middle" fontFamily="'Bowlby One SC',sans-serif" fontSize="15" fill="#22d3ee">
          M
        </text>
        <circle cx="130" cy="110" r="76" fill="none" stroke="#a5f3fc" strokeWidth="1" strokeOpacity="0.25" strokeDasharray="2 6" />
      </svg>
      <div className="hc-badge-icon">
        <Radar size={16} strokeWidth={2.4} />
      </div>
    </div>
  );
}
