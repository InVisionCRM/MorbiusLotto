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
}

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
    async (address: string, fallbackName: string, fallbackSymbol: string) => {
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
