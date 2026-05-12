'use client';

import React from 'react';

/**
 * html2canvas 1.x cannot parse CSS Color 4 `oklch()`. Tailwind v4 theme utilities
 * (e.g. text-cyan-300, border-white/10) compile to oklch and crash the export parser.
 * This file uses only inline rgba/hex for anything html2canvas reads inside the capture ref.
 */
const C = {
  white: '#ffffff',
  white88: 'rgba(255,255,255,0.88)',
  white85: 'rgba(255,255,255,0.85)',
  white80: 'rgba(255,255,255,0.8)',
  white75: 'rgba(255,255,255,0.75)',
  white65: 'rgba(255,255,255,0.65)',
  white55: 'rgba(255,255,255,0.55)',
  white50: 'rgba(255,255,255,0.5)',
  white10: 'rgba(255,255,255,0.1)',
  cyanGlow: 'rgba(34, 211, 238, 0.95)',
  cyanLabel: 'rgba(103, 232, 249, 0.9)',
  cyanMuted: 'rgba(34, 211, 238, 0.85)',
  cyanBracket: 'rgba(34, 211, 238, 0.45)',
  cyanCorner: 'rgba(103, 232, 249, 0.8)',
} as const;

const fontJost: React.CSSProperties = { fontFamily: 'Jost, ui-sans-serif, system-ui, sans-serif' };

export type ShareOverlayId = 'neonHero' | 'filmBottom' | 'minimalCorner' | 'bracketTitle';

export type ShareOverlayProps = {
  tournamentName: string;
  fundingLabel: string;
  siteLine: string;
  scheduleLine: string;
  prizeLine: string;
  payoutLine: string;
  /** Token ticker as it appears in `prizeLine` (e.g. MORBIUS, USDC) — used to place the inline logo after the first match. */
  prizeTokenSymbol?: string | null;
  /** PulseChain / same-origin URL for the small inline prize icon and large corner badge. */
  prizeTokenLogoUrl?: string | null;
};

function renderPrizeLineWithInlineLogo(
  prizeLine: string,
  tokenSymbol: string | null | undefined,
  tokenLogoUrl: string | null | undefined,
): React.ReactNode {
  const url = tokenLogoUrl?.trim();
  if (!url) return prizeLine;
  const sym = tokenSymbol?.trim();
  const imgStyle: React.CSSProperties = {
    display: 'inline-block',
    width: '1.1em',
    height: '1.1em',
    marginLeft: '0.22em',
    verticalAlign: '-0.14em',
    objectFit: 'contain',
    flexShrink: 0,
  };
  const img = <img src={url} alt="" style={imgStyle} />;
  if (!sym) {
    return (
      <>
        {prizeLine}
        {img}
      </>
    );
  }
  const idx = prizeLine.indexOf(sym);
  if (idx === -1) {
    return (
      <>
        {prizeLine}
        {img}
      </>
    );
  }
  const end = idx + sym.length;
  return (
    <>
      {prizeLine.slice(0, end)}
      {img}
      {prizeLine.slice(end)}
    </>
  );
}

export const SHARE_OVERLAY_OPTIONS: readonly {
  id: ShareOverlayId;
  title: string;
  description: string;
}[] = [
  { id: 'neonHero', title: 'Neon hero', description: 'Centered title with cyan glow and vignette.' },
  { id: 'filmBottom', title: 'Film lower third', description: 'Dark band at bottom with title and subtitle.' },
  { id: 'minimalCorner', title: 'Minimal corner', description: 'Compact strip in the corner.' },
  { id: 'bracketTitle', title: 'Bracket frame', description: 'Esports-style frame and caps lock line.' },
] as const;

function clampName(s: string, max: number): string {
  const t = s.trim() || 'Tournament';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function NeonHeroOverlay({
  tournamentName,
  fundingLabel,
  siteLine,
  scheduleLine,
  prizeLine,
  payoutLine,
  prizeTokenSymbol = null,
  prizeTokenLogoUrl = null,
}: ShareOverlayProps) {
  const name = clampName(tournamentName, 42);
  const meta: React.CSSProperties = {
    ...fontJost,
    fontSize: '11px',
    lineHeight: 1.35,
    color: C.white88,
    textAlign: 'left',
  };
  const label: React.CSSProperties = {
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: C.cyanLabel,
  };
  return (
    <div
      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center sm:px-8"
      style={fontJost}
    >
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 70% 55% at 50% 45%, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 45%, transparent 72%)',
        }}
        aria-hidden
      />
      <p
        className="relative z-[1] max-w-[95%] font-black uppercase leading-[1.05] tracking-[0.06em] sm:text-4xl md:text-5xl"
        style={{
          ...fontJost,
          fontSize: '1.875rem',
          color: C.white,
          textShadow:
            '0 0 24px rgba(34,211,238,0.55), 0 0 48px rgba(34,211,238,0.25), 0 4px 24px rgba(0,0,0,0.9)',
        }}
      >
        {name}
      </p>
      <p
        className="relative z-[1] mt-3 font-semibold uppercase tracking-[0.28em] sm:mt-4 sm:text-base md:text-lg"
        style={{
          ...fontJost,
          fontSize: '0.875rem',
          color: C.cyanGlow,
          textShadow: '0 2px 12px rgba(0,0,0,0.85)',
        }}
      >
        {fundingLabel}
      </p>
      <div className="relative z-[1] mt-4 max-w-[96%] space-y-1.5 sm:mt-5" style={meta}>
        <p style={{ textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}>
          <span style={label}>Starts</span>
          <span style={{ color: C.white50 }}> · </span>
          {scheduleLine}
        </p>
        <p style={{ textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}>
          <span style={label}>Prize</span>
          <span style={{ color: C.white50 }}> · </span>
          {renderPrizeLineWithInlineLogo(prizeLine, prizeTokenSymbol, prizeTokenLogoUrl)}
        </p>
        <p className="line-clamp-3" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}>
          <span style={label}>Payout</span>
          <span style={{ color: C.white50 }}> · </span>
          {payoutLine}
        </p>
      </div>
      <p
        className="relative z-[1] mt-4 font-medium tracking-wide sm:mt-5 sm:text-sm"
        style={{
          ...fontJost,
          fontSize: '0.75rem',
          color: C.white75,
          textShadow: '0 1px 8px rgba(0,0,0,0.9)',
        }}
      >
        {siteLine}
      </p>
    </div>
  );
}

export function FilmBottomOverlay({
  tournamentName,
  fundingLabel,
  siteLine,
  scheduleLine,
  prizeLine,
  payoutLine,
  prizeTokenSymbol = null,
  prizeTokenLogoUrl = null,
}: ShareOverlayProps) {
  const name = clampName(tournamentName, 48);
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-end" style={fontJost}>
      <div
        className="w-full px-6 pb-8 pt-14 sm:px-8 sm:pb-10 sm:pt-16"
        style={{
          background: 'linear-gradient(to top, rgba(8,10,14,0.94) 0%, rgba(8,10,14,0.75) 45%, transparent 100%)',
        }}
      >
        <p
          className="font-bold leading-tight sm:text-3xl md:text-4xl"
          style={{
            ...fontJost,
            fontSize: '1.5rem',
            color: C.white,
            textShadow: '0 2px 12px rgba(0,0,0,0.85)',
          }}
        >
          {name}
        </p>
        <p
          className="mt-2 font-semibold uppercase tracking-[0.2em] sm:text-base md:text-lg"
          style={{ ...fontJost, fontSize: '0.875rem', color: 'rgba(103, 232, 249, 0.95)' }}
        >
          {fundingLabel}
        </p>
        <div
          className="mt-3 space-y-1 text-[10px] leading-snug sm:text-[11px] md:text-xs"
          style={{ color: C.white85 }}
        >
          <p>
            <span style={{ fontWeight: 600, color: 'rgba(165, 243, 252, 0.9)' }}>Starts</span> · {scheduleLine}
          </p>
          <p>
            <span style={{ fontWeight: 600, color: 'rgba(165, 243, 252, 0.9)' }}>Prize</span> ·{' '}
            {renderPrizeLineWithInlineLogo(prizeLine, prizeTokenSymbol, prizeTokenLogoUrl)}
          </p>
          <p className="line-clamp-3">
            <span style={{ fontWeight: 600, color: 'rgba(165, 243, 252, 0.9)' }}>Payout</span> · {payoutLine}
          </p>
        </div>
        <p className="mt-3 text-xs sm:text-sm" style={{ color: C.white65 }}>
          {siteLine}
        </p>
      </div>
    </div>
  );
}

export function MinimalCornerOverlay({
  tournamentName,
  fundingLabel,
  siteLine,
  scheduleLine,
  prizeLine,
  payoutLine,
  prizeTokenSymbol = null,
  prizeTokenLogoUrl = null,
}: ShareOverlayProps) {
  const name = clampName(tournamentName, 36);
  return (
    <div className="pointer-events-none absolute inset-0 p-4 sm:p-6" style={fontJost}>
      <div
        className="absolute left-4 top-4 max-w-[92%] rounded-lg px-3 py-2.5 sm:left-5 sm:top-5 sm:px-4 sm:py-3"
        style={{
          background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.88), rgba(40, 40, 40, 0.72))',
          boxShadow:
            'inset 0 2px 6px rgba(0, 0, 0, 0.75), inset 0 -2px 6px rgba(255, 255, 255, 0.06), 0 4px 16px rgba(0, 0, 0, 0.5)',
          border: '1px inset rgba(60, 60, 60, 0.5)',
        }}
      >
        <p
          className="text-[9px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: 'rgba(34, 211, 238, 0.9)' }}
        >
          {siteLine}
        </p>
        <p className="mt-1.5 text-base font-bold leading-snug sm:text-lg md:text-xl" style={{ color: C.white }}>
          {name}
        </p>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-wider" style={{ color: C.white55 }}>
          {fundingLabel}
        </p>
        <div
          className="mt-2 space-y-0.5 pt-2 text-[9px] leading-snug sm:text-[10px]"
          style={{ borderTop: `1px solid ${C.white10}`, color: C.white75 }}
        >
          <p>
            <span style={{ color: C.cyanMuted }}>Starts</span> {scheduleLine}
          </p>
          <p>
            <span style={{ color: C.cyanMuted }}>Prize</span>{' '}
            {renderPrizeLineWithInlineLogo(prizeLine, prizeTokenSymbol, prizeTokenLogoUrl)}
          </p>
          <p className="line-clamp-2">
            <span style={{ color: C.cyanMuted }}>Payout</span> {payoutLine}
          </p>
        </div>
      </div>
    </div>
  );
}

export function BracketTitleOverlay({
  tournamentName,
  fundingLabel,
  siteLine,
  scheduleLine,
  prizeLine,
  payoutLine,
  prizeTokenSymbol = null,
  prizeTokenLogoUrl = null,
}: ShareOverlayProps) {
  const name = clampName(tournamentName, 40);
  const corner: React.CSSProperties = {
    position: 'absolute',
    width: '1.5rem',
    height: '1.5rem',
    borderColor: C.cyanCorner,
    borderStyle: 'solid',
  };
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 sm:px-6" style={fontJost}>
      <div className="relative w-full max-w-[90%] py-3 sm:py-5">
        <div
          className="absolute inset-0 rounded-sm"
          style={{
            border: `2px solid ${C.cyanBracket}`,
            boxShadow: '0 0 0 1px rgba(0,0,0,0.6) inset, 0 0 28px rgba(34,211,238,0.12)',
          }}
          aria-hidden
        />
        <div style={{ ...corner, left: -4, top: -4, borderWidth: '2px 0 0 2px' }} aria-hidden />
        <div style={{ ...corner, right: -4, top: -4, borderWidth: '2px 2px 0 0' }} aria-hidden />
        <div style={{ ...corner, left: -4, bottom: -4, borderWidth: '0 0 2px 2px' }} aria-hidden />
        <div style={{ ...corner, right: -4, bottom: -4, borderWidth: '0 2px 2px 0' }} aria-hidden />
        <div className="relative px-3 py-2 text-center sm:px-5 sm:py-3">
          <p
            className="text-[9px] font-bold uppercase tracking-[0.32em] sm:text-[11px]"
            style={{ color: 'rgba(165, 243, 252, 0.9)' }}
          >
            {fundingLabel}
          </p>
          <p
            className="mt-1.5 text-xl font-black uppercase leading-[1.05] tracking-tight sm:mt-2 sm:text-2xl md:text-3xl"
            style={{
              color: C.white,
              textShadow: '0 4px 20px rgba(0,0,0,0.85)',
            }}
          >
            {name}
          </p>
          <div
            className="mx-auto mt-1.5 max-w-[95%] space-y-0.5 py-1.5 text-[9px] leading-snug sm:mt-2 sm:text-[10px]"
            style={{
              borderTop: `1px solid ${C.white10}`,
              borderBottom: `1px solid ${C.white10}`,
              color: C.white80,
            }}
          >
            <p>
              <span style={{ fontWeight: 600, color: 'rgba(103, 232, 249, 0.9)' }}>Starts</span> · {scheduleLine}
            </p>
            <p>
              <span style={{ fontWeight: 600, color: 'rgba(103, 232, 249, 0.9)' }}>Prize</span> ·{' '}
              {renderPrizeLineWithInlineLogo(prizeLine, prizeTokenSymbol, prizeTokenLogoUrl)}
            </p>
            <p className="line-clamp-2">
              <span style={{ fontWeight: 600, color: 'rgba(103, 232, 249, 0.9)' }}>Payout</span> · {payoutLine}
            </p>
          </div>
          <p
            className="mt-1.5 text-[9px] font-medium uppercase tracking-[0.22em] sm:mt-2 sm:text-[10px] md:text-[11px]"
            style={{ color: C.white55 }}
          >
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
