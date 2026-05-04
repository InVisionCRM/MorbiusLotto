'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDexScreenerProxy } from '@/lib/dexscreener-client';

export interface SelectedPrc20Token {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoUrl: string | null;
}

interface TokenSearchResult {
  address: string;
  name: string;
  symbol: string;
  iconUrl: string | null;
}

export interface Prc20TokenPickerProps {
  value: SelectedPrc20Token | null;
  onChange: (token: SelectedPrc20Token | null) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  resultsClassName?: string;
  /** Hide the quick-pick preset chips above the search input. */
  hidePresets?: boolean;
}

/**
 * Quick-pick presets shown above the search input. The "PLS" preset uses the
 * WPLS contract address (escrow only accepts ERC-20) but the displayed token
 * is overridden to read as PLS — the deposit/join flows wrap native PLS to
 * WPLS automatically when needed (see `lib/ensure-wpls-balance.ts`).
 */
const TOKEN_PRESETS: ReadonlyArray<{
  label: string;
  address: string;
  sublabel?: string;
  /** When set, overrides the on-chain metadata so the picker displays this label everywhere. */
  displayAs?: { name: string; symbol: string };
}> = [
  {
    label: 'PLS',
    address: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27',
    displayAs: { name: 'PulseChain', symbol: 'PLS' },
  },
  { label: 'HEX', address: '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39' },
  { label: 'eHEX', address: '0x57fde0a71132198BBeC939B98976993d8D89D225', sublabel: 'from Ethereum' },
  { label: 'DAI', address: '0xefD766cCb38EaF1dfd701853BFCe31359239F305', sublabel: 'from Ethereum' },
  { label: 'PRVX', address: '0xF6f8Db0aBa00007681F8fAF16A0FDa1c9B030b11' },
  { label: 'PLSX', address: '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab' },
];

/**
 * PulseChain ERC-20 token picker.
 * Searches by name/symbol via PulseChain scan API; accepts raw 0x... addresses.
 * Falls back to DexScreener for token logos when scan does not provide one.
 *
 * Stateless w.r.t. parent — emits the resolved token (with decimals + logo) via onChange.
 */
export function Prc20TokenPicker({
  value,
  onChange,
  placeholder = 'Search token (e.g. HEX, WPLS) or paste 0x...',
  className,
  inputClassName,
  resultsClassName,
  hidePresets,
}: Prc20TokenPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TokenSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setResults([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchTokenDetails = useCallback(
    async (
      address: string,
      fallbackName: string,
      fallbackSymbol: string,
      displayOverride?: { name: string; symbol: string },
    ) => {
      let name = fallbackName;
      let symbol = fallbackSymbol;
      let decimals = 18;
      let logoUrl: string | null = null;
      try {
        const res = await fetch(`https://api.scan.pulsechain.com/api/v2/tokens/${address}`);
        const data = await res.json();
        if (data.decimals != null) decimals = Number(data.decimals);
        if (data.name) name = data.name;
        if (data.symbol) symbol = data.symbol;
        if (data.icon_url) logoUrl = data.icon_url;
      } catch { /* defaults */ }

      if (!logoUrl) {
        try {
          const res = await fetchDexScreenerProxy('tokens', address);
          const data = await res.json();
          const img = data.pairs?.[0]?.info?.imageUrl;
          if (img) logoUrl = img;
        } catch { /* no logo */ }
      }

      if (displayOverride) {
        name = displayOverride.name;
        symbol = displayOverride.symbol;
      }

      onChange({ address, name, symbol, decimals, logoUrl });
      setQuery('');
      setResults([]);
    },
    [onChange],
  );

  const handleQueryChange = useCallback((next: string) => {
    setQuery(next);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!next.trim() || next.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.scan.pulsechain.com/api/v2/search?q=${encodeURIComponent(next.trim())}`,
        );
        const data = await res.json();
        const items = (data.items || [])
          .filter((item: any) => item.type === 'token')
          .slice(0, 8)
          .map((item: any) => ({
            address: item.address,
            name: item.name || 'Unknown',
            symbol: item.symbol || '???',
            iconUrl: item.icon_url || null,
          }));
        setResults(items);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, []);

  const handleRawAddressSubmit = useCallback(() => {
    const addr = query.trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      void fetchTokenDetails(addr, 'Unknown Token', '???');
    }
  }, [query, fetchTokenDetails]);

  const handleClear = useCallback(() => {
    onChange(null);
    setQuery('');
    setResults([]);
  }, [onChange]);

  const inputCls =
    inputClassName ??
    'w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm';
  const resultsCls =
    resultsClassName ??
    'mt-1 max-h-32 overflow-y-auto rounded-lg border border-gray-600 bg-gray-800';

  if (value) {
    return (
      <div className={`flex items-center gap-2 p-2 rounded-lg bg-gray-900 ${className ?? ''}`}>
        {value.logoUrl && (
          <img src={value.logoUrl} alt="" className="w-5 h-5 rounded-full" />
        )}
        <span className="text-white text-sm truncate">{value.symbol}</span>
        <span className="text-gray-500 text-xs truncate">{value.name}</span>
        <button
          type="button"
          onClick={handleClear}
          className="ml-auto text-gray-400 hover:text-white text-xs"
        >
          Clear
        </button>
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className={className}>
      {!hidePresets && !query.trim() && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {TOKEN_PRESETS.map((p) => (
            <button
              key={p.address}
              type="button"
              onClick={() => fetchTokenDetails(p.address, p.label, p.label, p.displayAs)}
              title={p.sublabel ? `${p.label} (${p.sublabel})` : p.label}
              className="px-2.5 py-1 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-600 text-xs text-white"
            >
              <span className="font-medium">{p.label}</span>
              {p.sublabel && (
                <span className="ml-1 text-gray-400">{p.sublabel}</span>
              )}
            </button>
          ))}
        </div>
      )}
      <input
        type="text"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleRawAddressSubmit();
        }}
        onBlur={handleRawAddressSubmit}
        placeholder={placeholder}
        className={inputCls}
      />
      {results.length > 0 && (
        <div className={resultsCls}>
          {results.map((r) => (
            <button
              key={r.address}
              type="button"
              onClick={() => fetchTokenDetails(r.address, r.name, r.symbol)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-700 flex items-center gap-2"
            >
              {r.iconUrl && <img src={r.iconUrl} alt="" className="w-4 h-4 rounded-full" />}
              <span className="text-white truncate">{r.symbol}</span>
              <span className="text-gray-500 text-xs truncate">{r.name}</span>
            </button>
          ))}
        </div>
      )}
      {results.length === 0 && query.trim().length >= 2 && !searching && (
        <p className="mt-1 text-gray-500 text-xs px-1">
          No results — try pasting the token contract address (0x...)
        </p>
      )}
    </div>
  );
}
