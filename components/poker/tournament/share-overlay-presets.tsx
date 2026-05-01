'use client';

import React from 'react';

export type ShareOverlayId = 'neonHero' | 'filmBottom' | 'minimalCorner' | 'bracketTitle';

export type ShareOverlayProps = {
  tournamentName: string;
  fundingLabel: string;
  siteLine: string;
};

export const SHARE_OVERLAY_OPTIONS: readonly {
  id: ShareOverlayId;
  title: string;
  description: string;
}[] = [
  {
    id: 'neonHero',
    title: 'Neon hero',
    description: 'Centered title with cyan glow and vignette.',
  },
  {
    id: 'filmBottom',
    title: 'Film lower third',
    description: 'Dark band at bottom with title and subtitle.',
  },
  {
    id: 'minimalCorner',
    title: 'Minimal corner',
    description: 'Compact strip in the corner.',
  },
  {
    id: 'bracketTitle',
    title: 'Bracket frame',
    description: 'Esports-style frame and caps lock line.',
  },
] as const;

function clampName(s: string, max: number): string {
  const t = s.trim() || 'Tournament';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Large centered glow title — export-safe (no blur filters; use text-shadow). */
export function NeonHeroOverlay({ tournamentName, fundingLabel, siteLine }: ShareOverlayProps) {
  const name = clampName(tournamentName, 42);
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 70% 55% at 50% 45%, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 45%, transparent 72%)',
        }}
        aria-hidden
      />
      <p
        className="relative z-[1] max-w-[95%] font-jost text-3xl font-black uppercase leading-[1.05] tracking-[0.06em] text-white sm:text-4xl md:text-5xl"
        style={{
          textShadow:
            '0 0 24px rgba(34,211,238,0.55), 0 0 48px rgba(34,211,238,0.25), 0 4px 24px rgba(0,0,0,0.9)',
        }}
      >
        {name}
      </p>
      <p
        className="relative z-[1] mt-3 font-jost text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200/95 sm:mt-4 sm:text-base md:text-lg"
        style={{ textShadow: '0 2px 12px rgba(0,0,0,0.85)' }}
      >
        {fundingLabel}
      </p>
      <p
        className="relative z-[1] mt-4 font-jost text-xs font-medium tracking-wide text-white/75 sm:mt-6 sm:text-sm"
        style={{ textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}
      >
        {siteLine}
      </p>
    </div>
  );
}

export function FilmBottomOverlay({ tournamentName, fundingLabel, siteLine }: ShareOverlayProps) {
  const name = clampName(tournamentName, 48);
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-end">
      <div
        className="w-full px-8 pb-10 pt-16"
        style={{
          background: 'linear-gradient(to top, rgba(8,10,14,0.94) 0%, rgba(8,10,14,0.75) 45%, transparent 100%)',
        }}
      >
        <p className="font-jost text-2xl font-bold leading-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] sm:text-3xl md:text-4xl">
          {name}
        </p>
        <p className="mt-2 font-jost text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300/95 sm:text-base md:text-lg">
          {fundingLabel}
        </p>
        <p className="mt-3 font-jost text-xs text-white/65 sm:text-sm">{siteLine}</p>
      </div>
    </div>
  );
}

export function MinimalCornerOverlay({ tournamentName, fundingLabel, siteLine }: ShareOverlayProps) {
  const name = clampName(tournamentName, 36);
  return (
    <div className="pointer-events-none absolute inset-0 p-5 sm:p-6">
      <div
        className="absolute left-5 top-5 max-w-[85%] rounded-lg px-4 py-3 sm:left-6 sm:top-6"
        style={{
          background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.88), rgba(40, 40, 40, 0.72))',
          boxShadow:
            'inset 0 2px 6px rgba(0, 0, 0, 0.75), inset 0 -2px 6px rgba(255, 255, 255, 0.06), 0 4px 16px rgba(0, 0, 0, 0.5)',
          border: '1px inset rgba(60, 60, 60, 0.5)',
        }}
      >
        <p className="font-jost text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400/90">{siteLine}</p>
        <p className="mt-1.5 font-jost text-base font-bold leading-snug text-white sm:text-lg md:text-xl">{name}</p>
        <p className="mt-1 font-jost text-[11px] font-medium uppercase tracking-wider text-white/55">{fundingLabel}</p>
      </div>
    </div>
  );
}

export function BracketTitleOverlay({ tournamentName, fundingLabel, siteLine }: ShareOverlayProps) {
  const name = clampName(tournamentName, 40);
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
      <div className="relative w-full max-w-[90%] py-10">
        <div
          className="absolute inset-0 rounded-sm border-2 border-cyan-400/45"
          style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.6) inset, 0 0 28px rgba(34,211,238,0.12)' }}
          aria-hidden
        />
        <div className="absolute -left-1 -top-1 h-6 w-6 border-l-2 border-t-2 border-cyan-300/80" aria-hidden />
        <div className="absolute -right-1 -top-1 h-6 w-6 border-r-2 border-t-2 border-cyan-300/80" aria-hidden />
        <div className="absolute -bottom-1 -left-1 h-6 w-6 border-b-2 border-l-2 border-cyan-300/80" aria-hidden />
        <div className="absolute -bottom-1 -right-1 h-6 w-6 border-b-2 border-r-2 border-cyan-300/80" aria-hidden />
        <div className="relative px-6 py-8 text-center">
          <p className="font-jost text-[10px] font-bold uppercase tracking-[0.35em] text-cyan-200/90 sm:text-xs">
            {fundingLabel}
          </p>
          <p className="mt-3 font-jost text-3xl font-black uppercase leading-none tracking-tight text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.85)] sm:mt-4 sm:text-4xl md:text-5xl">
            {name}
          </p>
          <p className="mt-4 font-jost text-[10px] font-medium uppercase tracking-[0.22em] text-white/55 sm:mt-6 sm:text-xs md:text-sm">
            {siteLine}
          </p>
        </div>
      </div>
    </div>
  );
}

export function renderShareOverlay(id: ShareOverlayId, props: ShareOverlayProps): React.ReactNode {
  switch (id) {
    case 'neonHero':
      return <NeonHeroOverlay {...props} />;
    case 'filmBottom':
      return <FilmBottomOverlay {...props} />;
    case 'minimalCorner':
      return <MinimalCornerOverlay {...props} />;
    case 'bracketTitle':
      return <BracketTitleOverlay {...props} />;
    default:
      return <NeonHeroOverlay {...props} />;
  }
}
