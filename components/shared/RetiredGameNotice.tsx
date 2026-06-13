/**
 * RetiredGameNotice — the standard "this game is no longer available" page,
 * shown on routes that have been disabled (legacy Plinko/Roulette, Lottery,
 * Wheel). Renders inside the normal nav chrome with a back-to-lobby CTA and an
 * optional pointer to the game's modern replacement. Nothing playable here.
 */

import Link from 'next/link';
import GlobalMainNav from '@/components/shared/GlobalMainNav';

interface RetiredGameNoticeProps {
  title: string;
  message: string;
  /** Optional CTA to the game's modern replacement (e.g. Plinko → /plinko2). */
  primary?: { href: string; label: string };
}

export function RetiredGameNotice({ title, message, primary }: RetiredGameNoticeProps) {
  return (
    <GlobalMainNav>
      <div
        className="relative flex min-h-screen w-full flex-col items-center justify-center px-6 py-16 text-slate-200"
        style={{ backgroundColor: '#050E16' }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(34,211,238,0.10),transparent_70%)]" />
        <div className="relative w-full max-w-md rounded-2xl border border-cyan-950/70 bg-[#07131F] p-8 text-center shadow-[0_20px_60px_-20px_rgba(0,0,0,0.85)]">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500/10 ring-1 ring-cyan-500/40">
            <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="#67E8F9" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M5.6 5.6 L18.4 18.4" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-400">{message}</p>
          <div className="mt-7 flex flex-col items-center gap-3">
            {primary && (
              <Link
                href={primary.href}
                className="w-full rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold uppercase tracking-wide text-[#03121B] transition-colors hover:bg-cyan-400"
              >
                {primary.label}
              </Link>
            )}
            <Link
              href="/"
              className="w-full rounded-lg border border-cyan-950 px-5 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-cyan-500/10 hover:text-cyan-200"
            >
              Back to lobby
            </Link>
          </div>
        </div>
      </div>
    </GlobalMainNav>
  );
}
