'use client';

/**
 * /devlog — what has shipped, as a carousel of cards you can open.
 *
 * The carousel is components/ui/apple-cards-carousel: a horizontal rail where
 * each card expands into a modal. That shape suits this content exactly — the
 * rail stays a headline per card, and the detail (eight games, six tiers, three
 * fairness mechanisms) lives in the expanded view instead of being cut to fit.
 *
 * Copy lives in components/DevLog/devlog-entries.tsx so it can be edited
 * without touching layout.
 */

import { Carousel, Card } from '@/components/ui/apple-cards-carousel';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { DEVLOG_ENTRIES } from '@/components/DevLog/devlog-entries';

export default function DevLogPage() {
  const cards = DEVLOG_ENTRIES.map((entry, i) => (
    <Card key={entry.src} card={entry} index={i} layout />
  ));

  return (
    <GlobalMainNav>
      <div
        className="relative min-h-screen w-full text-slate-200"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 70% 45% at 50% 0%,rgba(34,211,238,.08),transparent 70%),' +
            'linear-gradient(to bottom,rgba(5,14,22,0.94),rgba(2,7,11,0.97) 55%,rgba(5,14,22,0.99))',
          backgroundColor: '#050E16',
        }}
      >
        <div className="mx-auto w-full max-w-7xl px-5 pt-10 pb-4 sm:pt-14">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-400">
            Dev log
          </div>
          <h1
            className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl"
            style={{ textWrap: 'balance' } as React.CSSProperties}
          >
            What we&apos;ve been building
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-400 sm:text-base">
            New tables, multiplayer rooms, and the plumbing underneath them. Open any card for the
            detail.
          </p>
        </div>

        <Carousel items={cards} />

        <div className="mx-auto w-full max-w-7xl px-5 pb-20">
          <p className="text-[13px] leading-relaxed text-slate-600">
            Every claim here is checked against what actually ships. Game logic runs on our servers,
            not on-chain — so fairness is proven by seed commitment, and each game carries its own
            verifier.
          </p>
        </div>
      </div>
    </GlobalMainNav>
  );
}
