'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, RefreshCw, X, Search, Globe, Twitter, Send } from 'lucide-react';
import type { BlackjackWebSocketClient, PokerTableState } from '@/lib/websocket-client';
import { getApiUrlOptional } from '@/lib/api-urls';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';
import { POKER_CHIP_WEI } from '@/lib/poker-buy-in';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { fetchDexScreenerTokenInfo, type DexscreenerTokenInfo } from '@/lib/dexscreener-token-info';
import { DepositWithdrawModal } from '@/components/BLACKJACK/DepositWithdrawModal';

const MORBIUS_LOGO = '/morbius/MorbiusLogo-2.svg';

function TokenLabel({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <img src={MORBIUS_LOGO} alt="" className={`${dim} object-contain`} />
      <span>MORBIUS</span>
    </span>
  );
}

type FeaturedToken = {
  address: string;
  name: string;
  symbol: string;
  logoUrl: string | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  tableId: string;
  walletAddress: string | null;
  wsClient: BlackjackWebSocketClient;
  tableState: PokerTableState | null;
};

async function fetchPlayBalanceWei(address: string): Promise<bigint> {
  const api = getApiUrlOptional();
  const path = `/api/player/${encodeURIComponent(address.toLowerCase())}/balance`;
  const url = api ? `${api.replace(/\/$/, '')}${path}` : path;
  const r = await fetch(url);
  if (!r.ok) return 0n;
  const j = (await r.json()) as { balance?: string };
  return toBigIntSafe(j?.balance ?? '0');
}

async function fetchFeaturedTokens(): Promise<FeaturedToken[]> {
  const api = getApiUrlOptional();
  const url = api
    ? `${api.replace(/\/$/, '')}/api/blackjack/tables?enabledOnly=true`
    : '/api/blackjack/tables?enabledOnly=true';
  const r = await fetch(url);
  if (!r.ok) return [];
  const j = (await r.json()) as Array<{
    name?: string;
    ticker?: string | null;
    logo_url?: string | null;
    token_contract_address?: string | null;
  }>;
  const seen = new Set<string>();
  const out: FeaturedToken[] = [];
  for (const row of j) {
    const addr = (row.token_contract_address ?? '').trim().toLowerCase();
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) continue;
    if (seen.has(addr)) continue;
    seen.add(addr);
    out.push({
      address: addr,
      name: (row.name ?? '').trim() || 'Unknown',
      symbol: (row.ticker ?? '').trim() || '???',
      logoUrl: row.logo_url ?? null,
    });
  }
  return out;
}

type SearchResultItem = { address: string; name: string; symbol: string; iconUrl: string | null };

export function PokerTableLogoSponsorModal({
  isOpen,
  onClose,
  tableId,
  walletAddress,
  wsClient,
  tableState,
}: Props) {
  const [tab, setTab] = useState<'featured' | 'custom'>('featured');
  const [featured, setFeatured] = useState<FeaturedToken[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(false);

  // Selection state — applies to both tabs (the Buy button reads this).
  const [selected, setSelected] = useState<FeaturedToken | null>(null);

  // Custom-tab state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [customPreview, setCustomPreview] = useState<DexscreenerTokenInfo | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [buying, setBuying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [balanceWei, setBalanceWei] = useState<bigint>(0n);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [fundWalletOpen, setFundWalletOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadBalance = useCallback(async () => {
    const addr = walletAddress?.trim();
    if (!addr || !/^0x[a-fA-F0-9]{40}$/i.test(addr)) {
      setBalanceWei(0n);
      return;
    }
    setBalanceLoading(true);
    try {
      const wei = await fetchPlayBalanceWei(addr);
      setBalanceWei(wei);
    } catch {
      setBalanceWei(0n);
    } finally {
      setBalanceLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!isOpen) return;
    setErr(null);
    void loadBalance();
    setFeaturedLoading(true);
    fetchFeaturedTokens()
      .then(setFeatured)
      .catch(() => setFeatured([]))
      .finally(() => setFeaturedLoading(false));
  }, [isOpen, loadBalance]);

  useEffect(() => {
    if (!isOpen || !tableState?.tableLogoSponsoredUntil) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [isOpen, tableState?.tableLogoSponsoredUntil]);

  const remainingLabel = useMemo(() => {
    if (!tableState?.tableLogoSponsoredUntil) return null;
    const end = new Date(tableState.tableLogoSponsoredUntil).getTime();
    const ms = end - Date.now();
    if (Number.isNaN(end)) return null;
    if (ms <= 0) return '0:00';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  }, [tableState?.tableLogoSponsoredUntil, tick]);

  const priceChipsStr = tableState?.tableLogoPriceMorbiusChips ?? '0';
  const priceWei = useMemo(() => {
    try {
      const chips = BigInt(priceChipsStr || '0');
      if (chips < 0n || chips > BigInt(Number.MAX_SAFE_INTEGER)) return 0n;
      return chips * POKER_CHIP_WEI;
    } catch {
      return 0n;
    }
  }, [priceChipsStr]);

  const canAfford = balanceWei >= priceWei && priceWei > 0n;
  const balanceDisplay = balanceLoading ? null : formatMorbiusFloor(balanceWei);

  // Custom tab — name/address search via PulseChain scan; on pick, fetch DexScreener for socials.
  useEffect(() => {
    if (tab !== 'custom') return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`https://api.scan.pulsechain.com/api/v2/search?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        const items: SearchResultItem[] = (j.items || [])
          .filter((it: any) => it.type === 'token')
          .slice(0, 8)
          .map((it: any) => ({
            address: String(it.address ?? '').toLowerCase(),
            name: it.name || 'Unknown',
            symbol: it.symbol || '???',
            iconUrl: it.icon_url || null,
          }))
          .filter((x: SearchResultItem) => /^0x[a-fA-F0-9]{40}$/.test(x.address));
        setResults(items);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(id);
  }, [tab, query]);

  const pickCustomToken = useCallback(async (address: string) => {
    setPreviewLoading(true);
    setErr(null);
    try {
      const info = await fetchDexScreenerTokenInfo(address);
      if (!info) {
        setErr('No DexScreener data found for that address.');
        setCustomPreview(null);
        return;
      }
      setCustomPreview(info);
      setSelected({
        address: info.address,
        name: info.name,
        symbol: info.symbol,
        logoUrl: info.logoUrl,
      });
      setResults([]);
      setQuery('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const handleRawAddressEnter = useCallback(() => {
    const addr = query.trim().toLowerCase();
    if (/^0x[a-fA-F0-9]{40}$/.test(addr)) void pickCustomToken(addr);
  }, [query, pickCustomToken]);

  const onBuy = useCallback(async () => {
    if (!selected) {
      setErr('Pick a token first.');
      return;
    }
    if (!canAfford) {
      setErr('Not enough MORBIUS in your play balance. Add funds from the wallet in the top bar.');
      return;
    }
    setBuying(true);
    setErr(null);
    try {
      await wsClient.pokerPurchaseTableLogo(tableId, {
        address: selected.address,
        name: selected.name,
        symbol: selected.symbol,
        logoUrl: selected.logoUrl,
      });
      setConfirmOpen(false);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBuying(false);
    }
  }, [selected, tableId, wsClient, onClose, canAfford]);

  const onPickFeatured = useCallback((token: FeaturedToken) => {
    setSelected(token);
    setCustomPreview(null);
  }, []);

  const handleClose = useCallback(() => {
    setConfirmOpen(false);
    onClose();
  }, [onClose]);

  const ConfirmDialog = () =>
    confirmOpen && selected ? (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
        onClick={() => !buying && setConfirmOpen(false)}
      >
        <div
          className="bg-white text-gray-900 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="font-jost text-xl sm:text-2xl text-center font-semibold mb-1">Confirm sponsorship</h3>
          <p className="text-sm text-gray-600 text-center mb-5">
            This is what will be displayed on the felt and in the betting strip for{' '}
            <strong>10 minutes</strong>.
          </p>
          <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4 mb-5">
            <div className="flex items-center gap-3 mb-3">
              {selected.logoUrl ? (
                <img
                  src={selected.logoUrl}
                  alt=""
                  className="w-12 h-12 rounded-full object-contain bg-white border border-gray-200"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gray-200" />
              )}
              <div className="min-w-0">
                <div className="font-jost text-lg font-semibold truncate">{selected.name}</div>
                <div className="text-sm text-gray-500 truncate">{selected.symbol}</div>
              </div>
            </div>
            <div className="text-xs text-gray-500 font-mono break-all mb-3">{selected.address}</div>
            {customPreview && (
              <div className="flex flex-wrap gap-2">
                {customPreview.socials.twitter && (
                  <span className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 px-2 py-1 rounded-full">
                    <Twitter size={12} /> Twitter
                  </span>
                )}
                {customPreview.socials.telegram && (
                  <span className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 px-2 py-1 rounded-full">
                    <Send size={12} /> Telegram
                  </span>
                )}
                {customPreview.socials.discord && (
                  <span className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 px-2 py-1 rounded-full">
                    Discord
                  </span>
                )}
                {customPreview.websites.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 px-2 py-1 rounded-full">
                    <Globe size={12} /> Website
                  </span>
                )}
              </div>
            )}
          </div>
          {err && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3 text-center">
              {err}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={buying}
              className="flex-1 py-3 rounded-2xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onBuy()}
              disabled={buying || !canAfford}
              className="flex-1 py-3 rounded-2xl bg-black text-white hover:bg-gray-800 font-semibold disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {buying ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Processing…
                </>
              ) : (
                <>
                  Pay {Number(priceChipsStr || '0').toLocaleString()} <TokenLabel size="sm" />
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    ) : null;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-md"
              onClick={handleClose}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none p-4"
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="poker-logo-sponsor-title"
                className="font-jost-normal bg-white text-gray-900 p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-lg relative border border-gray-100 pointer-events-auto overflow-y-auto max-h-[92vh]"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={handleClose}
                  className="absolute top-5 right-5 z-20 text-gray-400 hover:text-black bg-gray-100 p-2.5 rounded-full transition-colors"
                  aria-label="Close"
                >
                  <X size={22} />
                </button>

                <div className="relative pr-2 pt-1">
                  <h2
                    id="poker-logo-sponsor-title"
                    className="font-jost text-center text-xl sm:text-2xl text-gray-900 font-semibold tracking-tight mb-2 pr-8"
                  >
                    Sponsor a token spotlight
                  </h2>
                  <p className="text-center text-sm sm:text-base text-gray-600 mb-5 px-1 leading-snug">
                    Your token's logo floats on the felt and its info shows in the betting strip for{' '}
                    <strong className="text-gray-800">10 minutes</strong>. Uses{' '}
                    <strong className="text-gray-800">play balance</strong>, not poker chips.
                  </p>

                  {/* Play balance */}
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-4 mb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-600 mb-1">Your play balance</p>
                        <div className="flex items-baseline gap-2 flex-wrap">
                          {balanceLoading ? (
                            <Loader2 className="w-7 h-7 animate-spin text-gray-300 mt-1" aria-hidden />
                          ) : (
                            <span className="font-jost text-2xl sm:text-3xl text-gray-900 tabular-nums tracking-tight">
                              {balanceDisplay ?? '—'}
                            </span>
                          )}
                          <TokenLabel size="sm" />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void loadBalance()}
                        disabled={balanceLoading || !walletAddress}
                        className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:border-cyan-500/40 hover:text-cyan-700 transition-colors disabled:opacity-40"
                      >
                        <RefreshCw size={16} className={balanceLoading ? 'animate-spin' : ''} />
                        Refresh
                      </button>
                    </div>
                  </div>

                  {/* Price + remaining */}
                  <div className="rounded-2xl border-2 border-cyan-500/25 bg-cyan-50/40 px-4 py-3 mb-4 text-center">
                    <p className="text-xs sm:text-sm font-medium text-gray-700">Price for this change</p>
                    <p className="font-jost text-3xl sm:text-4xl text-cyan-700 tabular-nums tracking-tight">
                      {Number(priceChipsStr || '0').toLocaleString()}{' '}
                      <span className="text-base text-gray-600 font-normal">MORBIUS</span>
                    </p>
                    {remainingLabel != null && (
                      <p className="text-sm text-gray-600 mt-2">
                        Current slot ends in{' '}
                        <span className="font-jost font-semibold text-gray-900">{remainingLabel}</span>
                      </p>
                    )}
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
                    <button
                      type="button"
                      onClick={() => setTab('featured')}
                      className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
                        tab === 'featured' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Featured
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('custom')}
                      className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
                        tab === 'custom' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Promote any token
                    </button>
                  </div>

                  {tab === 'featured' && (
                    <>
                      {featuredLoading ? (
                        <div className="flex items-center justify-center py-8 text-gray-400">
                          <Loader2 size={20} className="animate-spin mr-2" /> Loading featured tokens…
                        </div>
                      ) : featured.length === 0 ? (
                        <p className="text-sm text-gray-600 text-center py-6">
                          No featured tokens yet. Try the “Promote any token” tab.
                        </p>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 mb-2">
                          {featured.map((t) => (
                            <button
                              key={t.address}
                              type="button"
                              onClick={() => onPickFeatured(t)}
                              className={`relative rounded-2xl overflow-hidden border-2 transition-all p-2 flex flex-col items-center justify-center gap-1.5 ${
                                selected?.address === t.address
                                  ? 'border-cyan-600 bg-white shadow-md ring-2 ring-cyan-500/25 scale-[1.02]'
                                  : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                              }`}
                              aria-pressed={selected?.address === t.address}
                            >
                              <div className="aspect-square w-full flex items-center justify-center">
                                {t.logoUrl ? (
                                  <img
                                    src={t.logoUrl}
                                    alt=""
                                    className="w-full h-full object-contain"
                                    draggable={false}
                                  />
                                ) : (
                                  <div className="w-full h-full bg-gray-200 rounded-full" />
                                )}
                              </div>
                              <span className="text-[11px] font-semibold text-gray-700 truncate max-w-full">
                                {t.symbol}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {tab === 'custom' && (
                    <div className="space-y-3">
                      <div className="relative">
                        <Search
                          size={16}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                          aria-hidden
                        />
                        <input
                          type="text"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRawAddressEnter();
                          }}
                          placeholder="Search token name or paste 0x… address"
                          className="w-full pl-9 pr-3 py-3 rounded-xl border border-gray-300 text-gray-900 text-sm focus:border-cyan-500 focus:outline-none"
                        />
                        {searching && (
                          <Loader2
                            size={16}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin"
                          />
                        )}
                      </div>

                      {results.length > 0 && (
                        <div className="rounded-xl border border-gray-200 max-h-64 overflow-y-auto">
                          {results.map((r) => (
                            <button
                              key={r.address}
                              type="button"
                              onClick={() => void pickCustomToken(r.address)}
                              className="w-full px-3 py-2.5 text-left hover:bg-gray-50 flex items-center gap-2.5 border-b border-gray-100 last:border-b-0"
                            >
                              {r.iconUrl ? (
                                <img src={r.iconUrl} alt="" className="w-7 h-7 rounded-full object-contain" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-gray-200" />
                              )}
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-gray-900 truncate">{r.symbol}</div>
                                <div className="text-xs text-gray-500 truncate">{r.name}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {previewLoading && (
                        <div className="flex items-center justify-center py-3 text-gray-500 text-sm">
                          <Loader2 size={16} className="animate-spin mr-2" /> Pulling token info from DexScreener…
                        </div>
                      )}

                      {customPreview && selected && (
                        <div className="rounded-2xl border-2 border-cyan-500/40 bg-cyan-50/30 p-3">
                          <div className="flex items-center gap-3 mb-2">
                            {selected.logoUrl ? (
                              <img
                                src={selected.logoUrl}
                                alt=""
                                className="w-10 h-10 rounded-full object-contain bg-white border border-gray-200"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gray-200" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold truncate">{selected.name}</div>
                              <div className="text-xs text-gray-500 truncate">{selected.symbol}</div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-[11px]">
                            {customPreview.socials.twitter && (
                              <span className="inline-flex items-center gap-1 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                                <Twitter size={11} /> Twitter
                              </span>
                            )}
                            {customPreview.socials.telegram && (
                              <span className="inline-flex items-center gap-1 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                                <Send size={11} /> Telegram
                              </span>
                            )}
                            {customPreview.socials.discord && (
                              <span className="inline-flex items-center gap-1 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                                Discord
                              </span>
                            )}
                            {customPreview.websites.length > 0 && (
                              <span className="inline-flex items-center gap-1 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                                <Globe size={11} /> {customPreview.websites.length} site
                                {customPreview.websites.length === 1 ? '' : 's'}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!canAfford && !balanceLoading && walletAddress && (
                    <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200/80 rounded-xl px-3 py-2 mt-4 text-center leading-snug">
                      Your play balance is below this price. Use the <strong>wallet</strong> in the top bar to add MORBIUS.
                    </p>
                  )}

                  {err && !confirmOpen && (
                    <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-4 text-center">
                      {err}
                    </p>
                  )}

                  <button
                    type="button"
                    disabled={!selected || !canAfford}
                    onClick={() => {
                      setErr(null);
                      setConfirmOpen(true);
                    }}
                    className="font-jost w-full mt-4 py-4 sm:py-5 text-base sm:text-lg font-semibold rounded-2xl flex items-center justify-center bg-black text-white hover:bg-gray-800 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    Review & confirm
                    <span className="ml-2 inline-flex items-center">
                      <TokenLabel size="md" />
                    </span>
                  </button>

                  <p className="text-xs sm:text-sm text-gray-600 text-center mt-4 leading-relaxed">
                    Need more MORBIUS? Fund your{' '}
                    <button
                      type="button"
                      onClick={() => setFundWalletOpen(true)}
                      className="font-jost font-bold text-cyan-700 underline decoration-cyan-600/60 underline-offset-2 hover:text-cyan-900"
                    >
                      WALLET
                    </button>
                    .
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <AnimatePresence>{ConfirmDialog()}</AnimatePresence>
      <DepositWithdrawModal
        isOpen={fundWalletOpen}
        onClose={() => setFundWalletOpen(false)}
        defaultTab="deposit"
        onBalanceSync={async () => {
          await loadBalance();
        }}
      />
    </>
  );
}
