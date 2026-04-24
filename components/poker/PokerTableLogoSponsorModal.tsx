'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, RefreshCw, X } from 'lucide-react';
import type { BlackjackWebSocketClient, PokerTableState } from '@/lib/websocket-client';
import { getApiUrlOptional } from '@/lib/api-urls';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';
import { POKER_CHIP_WEI } from '@/lib/poker-buy-in';
import { toBigIntSafe } from '@/lib/safe-bigint';
import {
  POKER_DEFAULT_TABLE_LOGO_FILENAME,
  POKER_TABLE_LOGO_PUBLIC_PREFIX,
} from '@/lib/poker-table-logo-constants';
import { DepositWithdrawModal } from '@/components/BLACKJACK/DepositWithdrawModal';

const MORBIUS_LOGO = '/morbius/MorbiusLogo-2.svg';

function TokenLabel({ symbol, size = 'md' }: { symbol: 'MORBIUS'; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <img src={MORBIUS_LOGO} alt="" className={`${dim} object-contain`} />
      <span>{symbol}</span>
    </span>
  );
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  tableId: string;
  /** Connected wallet — used to load off-chain play balance. */
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

export function PokerTableLogoSponsorModal({
  isOpen,
  onClose,
  tableId,
  walletAddress,
  wsClient,
  tableState,
}: Props) {
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [balanceWei, setBalanceWei] = useState<bigint>(0n);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [fundWalletOpen, setFundWalletOpen] = useState(false);

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
    fetch('/api/poker/logos')
      .then(r => (r.ok ? r.json() : { files: [] }))
      .then((d: { files: string[] }) =>
        setFiles((d.files ?? []).filter(f => f !== POKER_DEFAULT_TABLE_LOGO_FILENAME)),
      )
      .catch(() => setFiles([]));
  }, [isOpen, loadBalance]);

  useEffect(() => {
    if (!isOpen) return;
    if (tableState?.tableLogo && !tableState.tableLogoIsDefault) {
      setSelected(tableState.tableLogo);
    } else {
      setSelected(null);
    }
  }, [isOpen, tableState?.tableLogo, tableState?.tableLogoIsDefault]);

  useEffect(() => {
    if (!isOpen || !tableState?.tableLogoSponsoredUntil) return;
    const t = setInterval(() => setTick(x => x + 1), 1000);
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

  const priceChipsStr = tableState?.tableLogoPriceMorbiusChips ?? '50';
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

  const onBuy = useCallback(async () => {
    if (!selected) {
      setErr('Tap a logo below first.');
      return;
    }
    if (!canAfford) {
      setErr('Not enough MORBIUS in your play balance. Add funds from the wallet in the top bar.');
      return;
    }
    setBuying(true);
    setErr(null);
    try {
      await wsClient.pokerPurchaseTableLogo(tableId, selected);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBuying(false);
    }
  }, [selected, tableId, wsClient, onClose, canAfford]);

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
            onClick={onClose}
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
              onClick={e => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={onClose}
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
                  Change the table logo
                </h2>
                <p className="text-center text-sm sm:text-base text-gray-600 mb-6 px-1 leading-snug">
                  Your logo floats on the felt for <strong className="text-gray-800">10 minutes</strong>. Paying again
                  picks a new image and <strong className="text-gray-800">restarts</strong> the timer. Uses{' '}
                  <strong className="text-gray-800">play balance</strong>, not poker chips.
                </p>

                {/* Play balance — same idea as chip cage */}
                <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-5 mb-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-600 mb-1">Your play balance</p>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        {balanceLoading ? (
                          <Loader2 className="w-8 h-8 animate-spin text-gray-300 mt-1" aria-hidden />
                        ) : (
                          <span className="font-jost text-3xl sm:text-4xl text-gray-900 tabular-nums tracking-tight">
                            {balanceDisplay ?? '—'}
                          </span>
                        )}
                        <span className="text-base text-gray-500 inline-flex items-center gap-1.5 pb-1">
                          <img src={MORBIUS_LOGO} alt="" className="w-5 h-5 object-contain" />
                          MORBIUS
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadBalance()}
                      disabled={balanceLoading || !walletAddress}
                      className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:border-cyan-500/40 hover:text-cyan-700 transition-colors disabled:opacity-40"
                    >
                      <RefreshCw size={18} className={balanceLoading ? 'animate-spin' : ''} />
                      Refresh
                    </button>
                  </div>
                </div>

                {/* Single clear price */}
                <div className="rounded-2xl border-2 border-cyan-500/25 bg-cyan-50/40 px-4 py-5 mb-5 text-center">
                  <p className="text-sm sm:text-base font-medium text-gray-700 mb-2">Price for this change</p>
                  <p className="font-jost text-4xl sm:text-5xl text-cyan-700 tabular-nums tracking-tight">
                    {Number(priceChipsStr || '0').toLocaleString()}
                  </p>
                  <p className="text-base text-gray-600 mt-2 inline-flex items-center justify-center gap-2">
                    <TokenLabel symbol="MORBIUS" size="md" />
                  </p>
                  {remainingLabel != null && (
                    <p className="text-sm sm:text-base text-gray-600 mt-4 pt-3 border-t border-cyan-500/15">
                      Current slot ends in <span className="font-jost font-semibold text-gray-900">{remainingLabel}</span>
                    </p>
                  )}
                </div>

                {tableState?.tableLogoSponsorAddress && (
                  <p className="text-sm text-gray-500 text-center mb-4 truncate px-1">
                    Sponsored by <span className="font-mono text-gray-700">{tableState.tableLogoSponsorAddress}</span>
                  </p>
                )}

                {!canAfford && !balanceLoading && walletAddress && (
                  <p className="text-sm sm:text-base text-amber-900 bg-amber-50 border border-amber-200/80 rounded-xl px-3 py-3 mb-4 text-center leading-snug">
                    Your play balance is below this price. Use the <strong>wallet</strong> in the top bar to add MORBIUS,
                    then tap <strong>Refresh</strong> above.
                  </p>
                )}

                {err && (
                  <p className="text-sm sm:text-base text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 mb-4 text-center">
                    {err}
                  </p>
                )}

                <p className="text-base font-semibold text-gray-800 mb-3">Choose a logo</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-6">
                  {files.map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setSelected(f)}
                      className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-all min-h-[4.5rem] ${
                        selected === f
                          ? 'border-cyan-600 bg-white shadow-md ring-2 ring-cyan-500/25 scale-[1.02]'
                          : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                      }`}
                      aria-pressed={selected === f}
                    >
                      <img
                        src={`${POKER_TABLE_LOGO_PUBLIC_PREFIX}${encodeURIComponent(f)}`}
                        alt=""
                        className="w-full h-full object-contain p-2"
                        draggable={false}
                      />
                    </button>
                  ))}
                </div>
                {files.length === 0 && (
                  <p className="text-base text-gray-600 text-center mb-6">No extra logos are available yet.</p>
                )}

                <button
                  type="button"
                  disabled={buying || !selected || !canAfford}
                  onClick={() => void onBuy()}
                  className="font-jost w-full py-4 sm:py-5 text-base sm:text-lg font-semibold rounded-2xl flex items-center justify-center bg-black text-white hover:bg-gray-800 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  {buying ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin shrink-0" />
                      Processing…
                    </>
                  ) : (
                    <>
                      Pay and apply logo
                      <span className="ml-2 inline-flex items-center">
                        <TokenLabel symbol="MORBIUS" size="md" />
                      </span>
                    </>
                  )}
                </button>

                <p className="text-sm sm:text-base text-gray-600 text-center mt-5 leading-relaxed">
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
