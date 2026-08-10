'use client';

/**
 * WhatsNewSplash — the "here is what we built" dialog, shown once on a first
 * visit to the home page.
 *
 * One slide per entry: a shot of the real screen, a headline, and a short line
 * about it. Paged rather than scrolled, because a splash a visitor did not ask
 * for has to be skimmable and escapable — every slide can be left from, and the
 * whole thing is dismissed for good the moment it closes.
 *
 * SEEN STATE is a versioned localStorage key. Bumping WHATS_NEW_VERSION shows
 * the splash again to everyone, which is the only sane way to ship a second
 * edition; leaving it alone means a returning visitor never sees this twice.
 *
 * It renders nothing until mounted. localStorage does not exist during the
 * server render, so anything that reads it has to wait for the client or the
 * markup will not match and the splash will flash on every page load.
 */

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DEVLOG_ENTRIES } from '@/components/DevLog/devlog-entries';

/** Bump to re-show the splash to everyone who has already dismissed it. */
export const WHATS_NEW_VERSION = 1;
const SEEN_KEY = `morb.whatsnew.v${WHATS_NEW_VERSION}`;

/** Let the page paint first — arriving on top of a blank screen feels broken. */
const OPEN_DELAY_MS = 700;

function hasSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    // Private mode or storage disabled: treat as seen rather than showing the
    // splash on every single visit with no way to make it stop.
    return true;
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* nothing to do — worst case it shows again next time */
  }
}

export function WhatsNewSplash() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (hasSeen()) return;
    const t = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Dismissed however it was closed — Escape, the X, the overlay, or Done.
  const close = useCallback(() => {
    markSeen();
    setOpen(false);
  }, []);

  const total = DEVLOG_ENTRIES.length;
  const entry = DEVLOG_ENTRIES[i];
  const last = i === total - 1;

  const next = useCallback(() => {
    setI((n) => Math.min(total - 1, n + 1));
  }, [total]);
  const prev = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  // Arrow keys page the splash; Escape is already Radix's job.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, next, prev]);

  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <DialogContent
        className="max-w-lg gap-0 overflow-hidden border border-cyan-500/20 bg-[#07131F] p-0 text-slate-200 sm:max-w-xl"
        style={{ backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% 0%,rgba(34,211,238,.10),transparent 70%)' }}
      >
        {/* Radix needs both for screen readers even though the visual design
            carries its own heading. */}
        <DialogTitle className="sr-only">What&apos;s new on MORBIUS</DialogTitle>
        <DialogDescription className="sr-only">
          {`Update ${i + 1} of ${total}: ${entry.title}`}
        </DialogDescription>

        <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#050E16]">
          <Image
            key={entry.src}
            src={entry.src}
            alt={entry.title}
            fill
            sizes="(max-width: 640px) 100vw, 576px"
            className="object-cover"
            priority={i === 0}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#07131F] via-transparent to-transparent" />
        </div>

        <div className="px-6 pt-5 pb-6 sm:px-8">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.26em] text-cyan-400">
            {entry.category}
          </div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
            {entry.title}
          </h2>
          <p className="mt-2.5 text-[14.5px] leading-relaxed text-slate-400">{entry.blurb}</p>

          <div className="mt-6 flex items-center justify-between gap-4">
            {/* Dots double as jumps, so a visitor can get to the one they care
                about without paging through the rest. */}
            <div className="flex items-center gap-1.5">
              {DEVLOG_ENTRIES.map((e, n) => (
                <button
                  key={e.src}
                  type="button"
                  onClick={() => setI(n)}
                  aria-label={`Go to ${e.title}`}
                  aria-current={n === i || undefined}
                  className={`h-1.5 rounded-full transition-all ${
                    n === i ? 'w-5 bg-cyan-400' : 'w-1.5 bg-slate-600 hover:bg-slate-500'
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {i > 0 && (
                <button
                  type="button"
                  onClick={prev}
                  aria-label="Previous"
                  className="grid h-9 w-9 place-items-center rounded-full border border-slate-700 text-slate-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-300"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              {last ? (
                <button
                  type="button"
                  onClick={close}
                  className="rounded-full bg-cyan-500 px-5 py-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#04202A] transition-colors hover:bg-cyan-400"
                >
                  Start playing
                </button>
              ) : (
                <button
                  type="button"
                  onClick={next}
                  className="flex items-center gap-1.5 rounded-full bg-cyan-500/15 px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-cyan-300 ring-1 ring-cyan-400/30 transition-colors hover:bg-cyan-500/25"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              onClick={close}
              className="text-[12px] text-slate-600 underline-offset-4 transition-colors hover:text-slate-400 hover:underline"
            >
              Skip
            </button>
            {/* Marks it seen on the way out, so following the link does not
                leave the splash queued up for the next visit. */}
            <Link
              href="/devlog"
              onClick={close}
              className="text-[12px] text-slate-500 underline-offset-4 transition-colors hover:text-cyan-300 hover:underline"
            >
              Read the full dev log
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
