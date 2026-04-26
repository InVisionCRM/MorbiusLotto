'use client';

import { useEffect, useRef, useState } from 'react';
import { Globe, Send, Twitter, ExternalLink } from 'lucide-react';
import {
  buildScanMorbiusLink,
  fetchDexScreenerTokenInfo,
  type DexscreenerTokenInfo,
} from '@/lib/dexscreener-token-info';

const DISCORD_ICON = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M19.27 5.33A17.09 17.09 0 0 0 14.97 4l-.21.4a14.43 14.43 0 0 0-5.52 0L9.03 4a17.06 17.06 0 0 0-4.3 1.33C2.06 9.27 1.32 13.1 1.7 16.86a17.27 17.27 0 0 0 5.27 2.66l.42-.59a11.5 11.5 0 0 1-1.84-.88l.45-.36a12.36 12.36 0 0 0 12 0l.45.36c-.58.34-1.2.64-1.84.88l.42.59a17.31 17.31 0 0 0 5.27-2.66c.43-4.36-.71-8.16-2.83-11.53ZM8.52 14.34c-1.04 0-1.9-.95-1.9-2.13 0-1.18.84-2.14 1.9-2.14 1.07 0 1.92.96 1.9 2.14 0 1.18-.84 2.13-1.9 2.13Zm6.96 0c-1.04 0-1.9-.95-1.9-2.13 0-1.18.85-2.14 1.9-2.14 1.07 0 1.92.96 1.9 2.14 0 1.18-.84 2.13-1.9 2.13Z" />
  </svg>
);

/** Hardcoded MORBIUS default — used when no sponsor is active. */
const MORBIUS_TOKEN_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';

export interface SponsoredTokenMarqueeProps {
  /** When non-null, renders this token; otherwise falls back to MORBIUS. */
  sponsor?: {
    address: string;
    name: string | null;
    symbol: string | null;
    logoUrl: string | null;
  } | null;
  /** Compact = mobile/floating variants (smaller text). */
  compact?: boolean;
}

type Chip = {
  key: string;
  label: string;
  href?: string;
  icon?: React.ReactNode;
  bold?: boolean;
};

function buildChips(
  info: { name: string; symbol: string; address: string },
  socials: { twitter: string | null; telegram: string | null; discord: string | null },
  websites: string[],
): Chip[] {
  const chips: Chip[] = [];
  chips.push({ key: 'name', label: info.name, bold: true });
  chips.push({ key: 'ticker', label: `$${info.symbol}` });
  if (socials.twitter) chips.push({ key: 'twitter', label: 'Twitter', href: socials.twitter, icon: <Twitter size={11} /> });
  if (socials.telegram) chips.push({ key: 'telegram', label: 'Telegram', href: socials.telegram, icon: <Send size={11} /> });
  if (socials.discord) chips.push({ key: 'discord', label: 'Discord', href: socials.discord, icon: DISCORD_ICON });
  if (websites[0]) chips.push({ key: 'website', label: 'Website', href: websites[0], icon: <Globe size={11} /> });
  chips.push({
    key: 'scan',
    label: 'scan.morbius.io',
    href: buildScanMorbiusLink(info.address),
    icon: <ExternalLink size={11} />,
  });
  return chips;
}

/**
 * Slim auto-scrolling marquee for the poker betting panel.
 * Always renders (defaults to MORBIUS). Fits inside the existing strip height —
 * does NOT add vertical space.
 */
export function SponsoredTokenMarquee({ sponsor, compact = false }: SponsoredTokenMarqueeProps) {
  const [info, setInfo] = useState<DexscreenerTokenInfo | null>(null);

  // Effective sponsor — fall back to MORBIUS when no active sponsorship.
  const targetAddress = (sponsor?.address ?? MORBIUS_TOKEN_ADDRESS).toLowerCase();
  const fallbackName = sponsor?.name ?? 'Morbius';
  const fallbackSymbol = sponsor?.symbol ?? 'MORBIUS';

  useEffect(() => {
    const ac = new AbortController();
    void fetchDexScreenerTokenInfo(targetAddress, ac.signal)
      .then((d) => {
        if (!ac.signal.aborted) setInfo(d);
      })
      .catch(() => {
        /* fall through to fallback chips */
      });
    return () => ac.abort();
  }, [targetAddress]);

  const chips = buildChips(
    {
      name: info?.name ?? fallbackName,
      symbol: info?.symbol ?? fallbackSymbol,
      address: targetAddress,
    },
    info?.socials ?? { twitter: null, telegram: null, discord: null },
    info?.websites ?? [],
  );

  // Duplicate items so the CSS marquee loops seamlessly.
  const looped = [...chips, ...chips];
  const textCls = compact ? 'text-[10px]' : 'text-[11px] md:text-[12px]';
  const dotCls = compact ? 'mx-2' : 'mx-3';
  const linkColor = 'text-cyan-300/85 hover:text-cyan-200';
  const baseColor = 'text-white/55';

  return (
    <div
      className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]"
      data-testid="sponsored-token-marquee"
    >
      <div
        className={`flex w-max items-center whitespace-nowrap leading-tight tabular-nums ${textCls} animate-poker-marquee`}
      >
        {looped.map((c, i) => {
          const content = (
            <span
              className={`inline-flex items-center gap-1 ${c.href ? linkColor : baseColor} ${c.bold ? 'font-semibold' : ''}`}
            >
              {c.icon}
              {c.label}
            </span>
          );
          return (
            <span key={`${c.key}-${i}`} className="inline-flex items-center">
              {c.href ? (
                <a
                  href={c.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {content}
                </a>
              ) : (
                content
              )}
              {i < looped.length - 1 && <span className={`${dotCls} text-white/15`}>·</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}
