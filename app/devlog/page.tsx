'use client';

/**
 * /devlog — the long version of the first-visit splash.
 *
 * The splash gives each update one line; this gives it the whole thing. It
 * exists so the dialog has somewhere to send anyone who wants the detail, and
 * so there is a permanent link to point at.
 *
 * Laid out as a stack of wide sections rather than a carousel: the images are
 * screenshots, which are landscape, and a portrait card rail would centre-crop
 * them to a narrow strip. Copy lives in components/DevLog/devlog-entries.tsx.
 */

import Image from 'next/image';

import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { DEVLOG_ENTRIES } from '@/components/DevLog/devlog-entries';

export default function DevLogPage() {
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
        <div className="mx-auto w-full max-w-3xl px-5 pt-10 pb-2 sm:pt-16">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-400">
            Dev log
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
            What we&apos;ve been building
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-400 sm:text-base">
            New tables, multiplayer rooms, and the plumbing underneath them.
          </p>
        </div>

        <div className="mx-auto w-full max-w-3xl px-5 pb-24">
          {DEVLOG_ENTRIES.map((entry) => (
            <section
              key={entry.src}
              id={entry.src.split('/').pop()?.replace(/\.\w+$/, '')}
              className="mt-14 scroll-mt-24 border-t border-cyan-500/10 pt-12 first:mt-8 first:border-0 first:pt-0"
            >
              <div className="relative mb-7 aspect-[16/10] w-full overflow-hidden rounded-2xl bg-[#07131F] ring-1 ring-cyan-500/15">
                <Image
                  src={entry.src}
                  alt={entry.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 768px"
                  className="object-cover"
                />
              </div>

              <div className="text-[10.5px] font-semibold uppercase tracking-[0.26em] text-cyan-400">
                {entry.category}
              </div>
              <h2 className="mt-2 mb-6 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {entry.title}
              </h2>
              {entry.content}
            </section>
          ))}

          <p className="mt-20 border-t border-cyan-500/10 pt-8 text-[13px] leading-relaxed text-slate-600">
            Every claim here is checked against what actually ships. Game logic runs on our servers,
            not on-chain — so fairness is proven by seed commitment, and each game carries its own
            verifier.
          </p>
        </div>
      </div>
    </GlobalMainNav>
  );
}
