'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';

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
  accent: string;      // main accent — drives the CTA colour
  accent2: string;     // secondary accent (gradient partner)
  img: string;         // full-bleed promo artwork
  alt: string;
  cta: string;
  ctaHref?: string;
  action?: 'seat' | 'drop' | 'refer';
  ctaSide?: 'left' | 'right';   // corner the CTA sits in (default left)
};

const AUTO_MS = 5600;

export function HeroCarousel({
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
        img: '/promo/refer.jpg',
        alt: 'Refer & Earn — bring a friend, get paid for it',
        cta: 'GET MY LINK',
        action: 'refer',
      },
      {
        key: 'tier',
        accent: '#fbbf24',
        accent2: '#f59e0b',
        img: '/promo/tier.jpg',
        alt: 'VIP Tier System — play, rank up, get paid back',
        cta: 'TAKE A SEAT',
        action: 'seat',
      },
      {
        key: 'drop',
        accent: '#a78bfa',
        accent2: '#f472b6',
        img: '/promo/drop.jpg',
        alt: 'The Weekly Drop — one pot, every Sunday',
        cta: 'ENTER THE DROP',
        action: 'drop',
      },
      {
        key: 'scan',
        accent: '#22d3ee',
        accent2: '#38bdf8',
        img: '/promo/scan.jpg',
        alt: 'Token Analyzer — scan any token in one tap',
        cta: 'SCAN A TOKEN',
        ctaHref: 'https://scan.morbius.io',
        ctaSide: 'right',
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
      className="hero hc-hero"
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
                <img className="hc-img" src={slide.img} alt={slide.alt} draggable={false} />
                <div className={'hc-cta-wrap ' + (slide.ctaSide === 'right' ? 'right' : 'left')}>
                  <button className="hc-cta" onClick={() => fireCta(slide)}>
                    {slide.cta}
                    <ArrowUpRight size={18} strokeWidth={2.6} />
                  </button>
                </div>
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
                aria-label={s.alt}
                aria-selected={i === idx}
                role="tab"
                onClick={() => jump(i)}
              >
                <span className="hc-dot-fill" style={{ animationDuration: paused ? '0s' : `${AUTO_MS}ms` }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

const slideVariants = {
  enter: (d: number) => ({ x: d > 0 ? '102%' : '-102%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? '-102%' : '102%', opacity: 0 }),
};
