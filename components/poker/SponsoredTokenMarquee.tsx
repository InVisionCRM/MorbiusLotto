'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Globe, Send, Twitter, ExternalLink, X, Megaphone, BarChart3 } from 'lucide-react';
import {
  buildScanMorbiusLink,
  fetchDexScreenerTokenInfo,
  type DexscreenerTokenInfo,
} from '@/lib/dexscreener-token-info';
import { getApiUrlOptional } from '@/lib/api-urls';

const MORBIUS_TOKEN_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1';
const MORBIUS_FALLBACK_LOGO = '/morbius/MorbiusLogo-2.svg';

function DiscordGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.27 5.33A17.09 17.09 0 0 0 14.97 4l-.21.4a14.43 14.43 0 0 0-5.52 0L9.03 4a17.06 17.06 0 0 0-4.3 1.33C2.06 9.27 1.32 13.1 1.7 16.86a17.27 17.27 0 0 0 5.27 2.66l.42-.59a11.5 11.5 0 0 1-1.84-.88l.45-.36a12.36 12.36 0 0 0 12 0l.45.36c-.58.34-1.2.64-1.84.88l.42.59a17.31 17.31 0 0 0 5.27-2.66c.43-4.36-.71-8.16-2.83-11.53ZM8.52 14.34c-1.04 0-1.9-.95-1.9-2.13 0-1.18.84-2.14 1.9-2.14 1.07 0 1.92.96 1.9 2.14 0 1.18-.84 2.13-1.9 2.13Zm6.96 0c-1.04 0-1.9-.95-1.9-2.13 0-1.18.85-2.14 1.9-2.14 1.07 0 1.92.96 1.9 2.14 0 1.18-.84 2.13-1.9 2.13Z" />
    </svg>
  );
}

export interface SponsoredTokenMarqueeProps {
  /** When non-null, renders this token; otherwise falls back to MORBIUS. */
  sponsor?: {
    address: string;
    name: string | null;
    symbol: string | null;
    logoUrl: string | null;
  } | null;
  /** ISO end time of the active sponsorship window (drives the countdown chip). */
  sponsoredUntil?: string | null;
  /** Whole MORBIUS chips required to trump the sponsor right now. */
  priceMorbiusChips?: string | null;
  /** Opens the purchase modal — used by the "Click here" call-to-action chip. */
  onOpenSponsorModal?: () => void;
  /** Compact = mobile/floating variants (smaller text). */
  compact?: boolean;
  /** Tighter typography and icons (poker mobile action strip). */
  density?: 'default' | 'tight';
}

type Chip = {
  key: string;
  /** Inline content for the chip. */
  content: React.ReactNode;
  /** When set, chip is wrapped in an external link. */
  href?: string;
  /** When set, chip becomes a button that calls this on click. */
  onClick?: () => void;
};

function formatTimeRemaining(sponsoredUntil: string | null | undefined): string | null {
  if (!sponsoredUntil) return null;
  const end = new Date(sponsoredUntil).getTime();
  if (Number.isNaN(end)) return null;
  const ms = end - Date.now();
  if (ms <= 0) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function formatUsdPrice(n: number | null): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (n >= 1) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n <= 0) return '$0';
  const magnitude = Math.floor(Math.log10(n));
  const decimals = Math.min(12, Math.max(4, 2 - magnitude));
  return `$${n.toFixed(decimals)}`;
}

function formatNativePrice(n: number | null, symbol: string | null): string | null {
  if (n == null || !Number.isFinite(n) || !symbol) return null;
  if (n >= 1) return `${n.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${symbol}`;
  if (n >= 0.0001) return `${n.toFixed(6)} ${symbol}`;
  if (n <= 0) return `0 ${symbol}`;
  const magnitude = Math.floor(Math.log10(n));
  const decimals = Math.min(12, Math.max(6, 2 - magnitude));
  return `${n.toFixed(decimals)} ${symbol}`;
}

function formatCompactUsd(n: number | null): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function formatPairAge(createdAtMs: number | null): string | null {
  if (createdAtMs == null || !Number.isFinite(createdAtMs)) return null;
  const diffMs = Date.now() - createdAtMs;
  if (diffMs < 0) return null;
  const days = diffMs / 86_400_000;
  if (days < 1) {
    const hours = Math.floor(diffMs / 3_600_000);
    return hours <= 0 ? '<1h' : `${hours}h`;
  }
  if (days < 30) return `${Math.floor(days)}d`;
  const months = days / 30;
  if (months < 12) return `${Math.floor(months)}mo`;
  const years = months / 12;
  return years < 10 ? `${years.toFixed(1)}y` : `${Math.floor(years)}y`;
}

async function fetchHoldersCount(address: string, signal?: AbortSignal): Promise<number | null> {
  try {
    const res = await fetch(`https://api.scan.pulsechain.com/api/v2/tokens/${address}`, { signal });
    if (!res.ok) return null;
    const data: { holders_count?: string | number; holders?: string | number } = await res.json();
    const raw = data.holders_count ?? data.holders;
    if (raw == null) return null;
    const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** One toast per sponsorship window even if multiple `SponsoredTokenMarquee` instances mount. */
const sponsorNoticeShownKeys = new Set<string>();

// ─── Market-view (toggle state 2) data layer ────────────────────────────────
// Shared module-level cache so multiple marquee instances don't refetch.

interface MarketTokenRow {
  address: string;
  ticker: string;
  name: string;
  sortOrder: number;
}

interface MarketPrice {
  priceUsd: number | null;
  priceChangeH24: number | null;
}

const MARKET_TOKENS_TTL_MS = 60_000;
const MARKET_PRICE_TTL_MS = 60_000;

let marketTokensCache: { tokens: MarketTokenRow[]; fetchedAt: number } | null = null;
const marketPriceCache = new Map<string, { value: MarketPrice; fetchedAt: number }>();

async function fetchMarqueeTokens(signal?: AbortSignal): Promise<MarketTokenRow[]> {
  const now = Date.now();
  if (marketTokensCache && now - marketTokensCache.fetchedAt < MARKET_TOKENS_TTL_MS) {
    return marketTokensCache.tokens;
  }
  const api = getApiUrlOptional();
  const url = api ? `${api.replace(/\/$/, '')}/api/marquee/tokens` : '/api/marquee/tokens';
  try {
    const r = await fetch(url, { signal });
    if (!r.ok) return marketTokensCache?.tokens ?? [];
    const j = (await r.json()) as MarketTokenRow[];
    marketTokensCache = { tokens: j, fetchedAt: now };
    return j;
  } catch {
    return marketTokensCache?.tokens ?? [];
  }
}

async function fetchMarketPriceForToken(
  address: string,
  signal?: AbortSignal,
): Promise<MarketPrice | null> {
  const now = Date.now();
  const cached = marketPriceCache.get(address);
  if (cached && now - cached.fetchedAt < MARKET_PRICE_TTL_MS) return cached.value;
  try {
    const info = await fetchDexScreenerTokenInfo(address, signal);
    if (!info) return cached?.value ?? null;
    const value: MarketPrice = {
      priceUsd: info.priceUsd,
      priceChangeH24: info.priceChangeH24,
    };
    marketPriceCache.set(address, { value, fetchedAt: now });
    return value;
  } catch {
    return cached?.value ?? null;
  }
}

type MarketRow = MarketTokenRow & MarketPrice;

async function fetchMarketSnapshot(signal?: AbortSignal): Promise<MarketRow[]> {
  const tokens = await fetchMarqueeTokens(signal);
  const settled = await Promise.allSettled(
    tokens.map(async (t) => {
      const px = await fetchMarketPriceForToken(t.address, signal);
      return { ...t, priceUsd: px?.priceUsd ?? null, priceChangeH24: px?.priceChangeH24 ?? null };
    }),
  );
  return settled
    .map((s) => (s.status === 'fulfilled' ? s.value : null))
    .filter((x): x is MarketRow => x !== null);
}

const MARQUEE_MODE_STORAGE_KEY = 'pokerMarqueeMode';
type MarqueeMode = 'sponsor' | 'market';

function readStoredMode(): MarqueeMode {
  if (typeof window === 'undefined') return 'sponsor';
  try {
    const v = window.localStorage.getItem(MARQUEE_MODE_STORAGE_KEY);
    return v === 'market' ? 'market' : 'sponsor';
  } catch {
    return 'sponsor';
  }
}

export function SponsoredTokenMarquee({
  sponsor,
  sponsoredUntil,
  priceMorbiusChips,
  onOpenSponsorModal,
  compact = false,
  density = 'default',
}: SponsoredTokenMarqueeProps) {
  const [info, setInfo] = useState<DexscreenerTokenInfo | null>(null);
  const [holders, setHolders] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [mode, setMode] = useState<MarqueeMode>('sponsor');
  const [marketRows, setMarketRows] = useState<MarketRow[]>([]);

  // Hydrate the persisted mode after mount (avoids SSR/client mismatch).
  useEffect(() => {
    setMode(readStoredMode());
  }, []);

  const toggleMode = useCallback((next: MarqueeMode) => {
    setMode(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(MARQUEE_MODE_STORAGE_KEY, next);
      } catch {
        /* ignore quota errors */
      }
    }
  }, []);

  // Market data — only fetch while market mode is active. Refresh every 60s.
  useEffect(() => {
    if (mode !== 'market') return;
    const ac = new AbortController();
    let cancelled = false;
    const load = () => {
      void fetchMarketSnapshot(ac.signal).then((rows) => {
        if (!cancelled && !ac.signal.aborted) setMarketRows(rows);
      });
    };
    load();
    const id = setInterval(load, MARKET_PRICE_TTL_MS);
    return () => {
      cancelled = true;
      ac.abort();
      clearInterval(id);
    };
  }, [mode]);

  const targetAddress = (sponsor?.address ?? MORBIUS_TOKEN_ADDRESS).toLowerCase();
  const fallbackName = sponsor?.name ?? 'Morbius';
  const fallbackSymbol = sponsor?.symbol ?? 'MORBIUS';
  const fallbackLogo = sponsor?.logoUrl ?? MORBIUS_FALLBACK_LOGO;

  useEffect(() => {
    const ac = new AbortController();
    setHolders(null);
    void fetchDexScreenerTokenInfo(targetAddress, ac.signal)
      .then((d) => {
        if (!ac.signal.aborted) setInfo(d);
      })
      .catch(() => {
        /* fall through to fallback chips */
      });
    void fetchHoldersCount(targetAddress, ac.signal).then((h) => {
      if (!ac.signal.aborted) setHolders(h);
    });
    return () => ac.abort();
  }, [targetAddress]);

  // Re-render the time-remaining chip every second while a sponsorship is active.
  useEffect(() => {
    if (!sponsoredUntil) return;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [sponsoredUntil]);

  const tokenName = info?.name ?? fallbackName;
  const tokenSymbol = info?.symbol ?? fallbackSymbol;
  const tokenLogo = info?.logoUrl ?? fallbackLogo;
  const socials = info?.socials ?? { twitter: null, telegram: null, discord: null };
  const websites = info?.websites ?? [];
  const isSponsored = !!sponsoredUntil;
  const timeRemaining = useMemo(
    () => formatTimeRemaining(sponsoredUntil ?? null),
    [sponsoredUntil, tick],
  );

  const tight = density === 'tight';
  const iconSz = tight ? 9 : 11;

  const logoSize = tight ? 10 : compact ? 14 : 16;
  const tokenLogoNode = tokenLogo ? (
    <img
      src={tokenLogo}
      alt=""
      className="rounded-full bg-white/5 object-contain"
      style={{ width: logoSize, height: logoSize }}
      draggable={false}
    />
  ) : null;

  const [sponsorToastOpen, setSponsorToastOpen] = useState(false);

  useEffect(() => {
    if (!sponsoredUntil) {
      setSponsorToastOpen(false);
      return;
    }
    const end = new Date(sponsoredUntil).getTime();
    if (Number.isNaN(end) || end <= Date.now()) {
      setSponsorToastOpen(false);
      return;
    }
    const key = `${sponsoredUntil}::${sponsor?.address ?? targetAddress}`;
    if (sponsorNoticeShownKeys.has(key)) return;
    sponsorNoticeShownKeys.add(key);
    setSponsorToastOpen(true);
    const t = window.setTimeout(() => setSponsorToastOpen(false), 10_000);
    return () => {
      window.clearTimeout(t);
      sponsorNoticeShownKeys.delete(key);
    };
  }, [sponsoredUntil, sponsor?.address, targetAddress]);

  const sponsorMinutesRemaining = useMemo(() => {
    if (!sponsoredUntil) return 10;
    const end = new Date(sponsoredUntil).getTime();
    if (Number.isNaN(end)) return 10;
    const ms = end - Date.now();
    if (ms <= 0) return 1;
    return Math.max(1, Math.ceil(ms / 60_000));
  }, [sponsoredUntil, tick]);

  let chips: Chip[] = [];

  // Logo + name (bold) — sole inline logo in the strip
  chips.push({
    key: 'identity',
    content: (
      <span className="inline-flex items-center gap-1.5 font-semibold text-white/85">
        {tokenLogoNode}
        {tokenName}
      </span>
    ),
  });

  // Ticker
  chips.push({
    key: 'ticker',
    content: <span className="text-white/55">${tokenSymbol}</span>,
  });

  // Market data (DexScreener + PulseScan) — only emit a chip when the value resolved.
  const priceUsdText = formatUsdPrice(info?.priceUsd ?? null);
  if (priceUsdText) {
    chips.push({
      key: 'price-usd',
      content: <span className="text-white/75 tabular-nums">{priceUsdText}</span>,
    });
  }

  const priceNativeText = formatNativePrice(info?.priceNative ?? null, info?.quoteSymbol ?? null);
  if (priceNativeText) {
    chips.push({
      key: 'price-native',
      content: <span className="text-white/55 tabular-nums">{priceNativeText}</span>,
    });
  }

  const change = info?.priceChangeH24 ?? null;
  if (change != null && Number.isFinite(change)) {
    const sign = change >= 0 ? '+' : '';
    const color = change >= 0 ? 'text-emerald-400' : 'text-rose-400';
    chips.push({
      key: 'change-24h',
      content: (
        <span className={`tabular-nums ${color}`}>
          {sign}
          {change.toFixed(2)}%{' '}
          <span className="text-white/40">24h</span>
        </span>
      ),
    });
  }

  const mcapValue = info?.marketCap ?? info?.fdv ?? null;
  const mcapLabel = info?.marketCap != null ? 'Mcap' : info?.fdv != null ? 'FDV' : null;
  const mcapText = formatCompactUsd(mcapValue);
  if (mcapText && mcapLabel) {
    chips.push({
      key: 'mcap',
      content: (
        <span className="text-white/65 tabular-nums">
          <span className="text-white/40">{mcapLabel}</span> {mcapText}
        </span>
      ),
    });
  }

  if (holders != null) {
    chips.push({
      key: 'holders',
      content: (
        <span className="text-white/65 tabular-nums">
          {holders.toLocaleString('en-US')} <span className="text-white/40">holders</span>
        </span>
      ),
    });
  }

  const ageText = formatPairAge(info?.pairCreatedAtMs ?? null);
  if (ageText) {
    chips.push({
      key: 'age',
      content: (
        <span className="text-white/65 tabular-nums">
          <span className="text-white/40">Age</span> {ageText}
        </span>
      ),
    });
  }

  // Sponsorship message + click-here CTA
  if (isSponsored && timeRemaining && priceMorbiusChips) {
    const priceLabel = (() => {
      try {
        return BigInt(priceMorbiusChips).toLocaleString();
      } catch {
        return priceMorbiusChips;
      }
    })();
    chips.push({
      key: 'sponsor-msg',
      content: (
        <span className="inline-flex items-center gap-1.5 text-white/65">
          <span>
            The table is now sponsored by{' '}
            <span className="font-semibold text-white/85">{tokenName}</span> for the next{' '}
            <span className="font-semibold text-white/85 tabular-nums">{timeRemaining}</span>. You
            can trump this sponsor with any token you want for just{' '}
            <span className="font-semibold text-white/85 tabular-nums">{priceLabel} MORBIUS</span>.
          </span>
          {onOpenSponsorModal && (
            <span className="font-semibold text-cyan-300 underline underline-offset-2">
              Click Here
            </span>
          )}
        </span>
      ),
      onClick: onOpenSponsorModal,
    });
  }

  // Socials
  if (socials.twitter) {
    chips.push({
      key: 'twitter',
      content: (
        <span className="inline-flex items-center gap-1 text-cyan-300/85">
          <Twitter size={iconSz} /> Twitter
        </span>
      ),
      href: socials.twitter,
    });
  }
  if (socials.telegram) {
    chips.push({
      key: 'telegram',
      content: (
        <span className="inline-flex items-center gap-1 text-cyan-300/85">
          <Send size={iconSz} /> Telegram
        </span>
      ),
      href: socials.telegram,
    });
  }
  if (socials.discord) {
    chips.push({
      key: 'discord',
      content: (
        <span className="inline-flex items-center gap-1 text-cyan-300/85">
          <DiscordGlyph size={iconSz} /> Discord
        </span>
      ),
      href: socials.discord,
    });
  }
  if (websites[0]) {
    chips.push({
      key: 'website',
      content: (
        <span className="inline-flex items-center gap-1 text-cyan-300/85">
          <Globe size={iconSz} /> Website
        </span>
      ),
      href: websites[0],
    });
  }

  // scan.morbius.io link
  chips.push({
    key: 'scan',
    content: (
      <span className="inline-flex items-center gap-1 text-cyan-300/85">
        <ExternalLink size={iconSz} /> scan.morbius.io
      </span>
    ),
    href: buildScanMorbiusLink(targetAddress),
  });

  // Trailing logo + CTA when not currently sponsored — invites users to be the first sponsor.
  if (!isSponsored && onOpenSponsorModal && priceMorbiusChips) {
    const priceLabel = (() => {
      try {
        return BigInt(priceMorbiusChips).toLocaleString();
      } catch {
        return priceMorbiusChips;
      }
    })();
    chips.push({
      key: 'become-sponsor',
      content: (
        <span className="inline-flex items-center gap-1.5 text-white/65">
          <span>
            Promote your token here for{' '}
            <span className="font-semibold text-white/85 tabular-nums">{priceLabel} MORBIUS</span>.
          </span>
          <span className="font-semibold text-cyan-300 underline underline-offset-2">Click Here</span>
        </span>
      ),
      onClick: onOpenSponsorModal,
    });
  }

  // Market mode overrides the sponsor chips with a stock-ticker tape.
  if (mode === 'market') {
    if (marketRows.length === 0) {
      chips = [
        {
          key: 'market-loading',
          content: <span className="text-white/45">Loading market…</span>,
        },
      ];
    } else {
      chips = marketRows.map((r) => {
        const priceText = formatUsdPrice(r.priceUsd);
        const change = r.priceChangeH24;
        const hasChange = change != null && Number.isFinite(change);
        const changeColor = hasChange && (change as number) >= 0 ? 'text-emerald-400' : 'text-rose-400';
        const changeText = hasChange
          ? `${(change as number) >= 0 ? '+' : ''}${(change as number).toFixed(2)}%`
          : null;
        return {
          key: `mkt-${r.address}`,
          content: (
            <span className="inline-flex items-baseline gap-1.5">
              <span className="font-semibold text-white/90">${r.ticker}</span>
              {priceText && <span className="tabular-nums text-white/70">{priceText}</span>}
              {changeText && <span className={`tabular-nums ${changeColor}`}>{changeText}</span>}
            </span>
          ),
          href: buildScanMorbiusLink(r.address),
        };
      });
    }
  }

  // Duplicate items so the CSS marquee loops seamlessly.
  const looped = [...chips, ...chips];
  const textCls = tight ? 'text-[9px]' : compact ? 'text-[10px]' : 'text-[11px] md:text-[12px]';
  const dotCls = tight ? 'mx-1.5' : compact ? 'mx-2' : 'mx-3';

  return (
    <>
      {sponsorToastOpen && isSponsored && (
        <div
          className="font-jost pointer-events-auto fixed z-[200] max-w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-cyan-500/30 p-3 shadow-xl"
          style={{
            top: 'max(1rem, env(safe-area-inset-top, 0px))',
            left: 'max(1rem, env(safe-area-inset-left, 0px))',
            background: 'linear-gradient(to right, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.92))',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          }}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 pr-1">
              <div className="text-base font-bold leading-snug tracking-tight text-white md:text-lg">
                {tokenName}
              </div>
              <p className="mt-1.5 text-xs leading-snug text-white/80 md:text-sm">
                {sponsorMinutesRemaining === 1
                  ? 'is the sponsor for the next minute! Learn more about it below.'
                  : `is the sponsor for the next ${sponsorMinutesRemaining} minutes! Learn more about it below.`}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
              aria-label="Dismiss sponsor notice"
              onClick={() => setSponsorToastOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <div className="relative flex min-w-0 flex-1 items-stretch">
        <div
          className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]"
          data-testid="sponsored-token-marquee"
        >
          <div
            className={`font-jost flex w-max items-center whitespace-nowrap ${tight ? 'leading-none' : 'leading-tight'} tabular-nums ${textCls} animate-poker-marquee`}
          >
          {looped.map((c, i) => {
            const inner = c.content;
            let node: React.ReactNode;
            if (c.href) {
              node = (
                <a
                  href={c.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {inner}
                </a>
              );
            } else if (c.onClick) {
              node = (
                <button
                  type="button"
                  className="text-left hover:opacity-90"
                  onClick={(e) => {
                    e.stopPropagation();
                    c.onClick?.();
                  }}
                >
                  {inner}
                </button>
              );
            } else {
              node = inner;
            }
            return (
              <span key={`${c.key}-${i}`} className="inline-flex items-center">
                {node}
                {i < looped.length - 1 && <span className={`${dotCls} text-white/15`}>·</span>}
              </span>
            );
          })}
          </div>
        </div>

        {/* Toggle pill: sponsor view ⇄ market view */}
        <div
          className="ml-1 flex shrink-0 items-center gap-0.5 self-center rounded-full border border-white/10 bg-white/5 p-0.5"
          role="group"
          aria-label="Marquee view"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleMode('sponsor');
            }}
            aria-label="Sponsor view"
            aria-pressed={mode === 'sponsor'}
            title="Sponsor view"
            className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${
              mode === 'sponsor'
                ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/50'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            <Megaphone size={tight ? 9 : 11} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleMode('market');
            }}
            aria-label="Market view"
            aria-pressed={mode === 'market'}
            title="Market view"
            className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${
              mode === 'market'
                ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/50'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            <BarChart3 size={tight ? 9 : 11} />
          </button>
        </div>
      </div>
    </>
  );
}
