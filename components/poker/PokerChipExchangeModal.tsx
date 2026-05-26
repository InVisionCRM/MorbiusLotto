'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Loader2, RefreshCw, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getApiUrlOptional } from '@/lib/api-urls';
import { formatChips, parseChipInput } from '@/lib/format-poker-chips';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';
import { POKER_CHIP_WEI } from '@/lib/poker-buy-in';
import { toBigIntSafe } from '@/lib/safe-bigint';

const MORBIUS_LOGO = '/morbius/MorbiusLogo-2.svg';

function TokenLabel({ symbol, size = 'md' }: { symbol: 'MORBIUS'; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <img src={MORBIUS_LOGO} alt="" className={`${dim} object-contain`} />
      <span>{symbol}</span>
    </span>
  );
}

type ExchangeTab = 'buy' | 'cashout';

export type PokerChipExchangeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string | null;
  /** Called after a successful buy or cash-out so the parent can refetch lobby balances. */
  onExchangeComplete?: () => void;
};

async function readJsonError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j && typeof j.error === 'string') return j.error;
  } catch {
    /* ignore */
  }
  return res.statusText || 'Request failed';
}

export function PokerChipExchangeModal({
  isOpen,
  onClose,
  walletAddress,
  onExchangeComplete,
}: PokerChipExchangeModalProps) {
  const [tab, setTab] = useState<ExchangeTab>('buy');
  const [morbiusWeiStr, setMorbiusWeiStr] = useState('0');
  const [chipStr, setChipStr] = useState('0');
  const [buyInput, setBuyInput] = useState('');
  const [sellInput, setSellInput] = useState('');
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const morbiusWei = useMemo(() => toBigIntSafe(morbiusWeiStr), [morbiusWeiStr]);
  const chipsBn = useMemo(() => toBigIntSafe(chipStr), [chipStr]);
  const maxBuyChips = useMemo(() => {
    if (morbiusWei <= 0n) return 0n;
    return morbiusWei / POKER_CHIP_WEI;
  }, [morbiusWei]);

  const loadBalances = useCallback(async () => {
    const api = getApiUrlOptional();
    const addr = walletAddress?.toLowerCase();
    if (!api || !addr || !/^0x[a-fA-F0-9]{40}$/i.test(addr)) return;
    setLoadingBalances(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch(`${api}/api/player/${encodeURIComponent(addr)}/balance`),
        fetch(`${api}/api/poker/chips/balance?address=${encodeURIComponent(addr)}`),
      ]);
      if (r1.ok) {
        const j = await r1.json();
        setMorbiusWeiStr(String(j?.balance ?? '0'));
      } else {
        setMorbiusWeiStr('0');
      }
      if (r2.ok) {
        const j = await r2.json();
        setChipStr(String(j?.balance ?? '0'));
      } else {
        setChipStr('0');
      }
    } catch {
      setMorbiusWeiStr('0');
      setChipStr('0');
    } finally {
      setLoadingBalances(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!isOpen) return;
    setTab('buy');
    setBuyInput('');
    setSellInput('');
    void loadBalances();
  }, [isOpen, loadBalances]);

  const buyChipsParsed = useMemo(() => parseChipInput(buyInput), [buyInput]);
  const sellChipsParsed = useMemo(() => parseChipInput(sellInput), [sellInput]);

  const buyChipsBn = useMemo(() => {
    try {
      return BigInt(buyChipsParsed);
    } catch {
      return 0n;
    }
  }, [buyChipsParsed]);

  const sellChipsBn = useMemo(() => {
    try {
      return BigInt(sellChipsParsed);
    } catch {
      return 0n;
    }
  }, [sellChipsParsed]);

  const playBalanceWholeDisplay = useMemo(
    () => (loadingBalances ? null : formatMorbiusFloor(morbiusWei)),
    [loadingBalances, morbiusWei]
  );

  const handleBuy = async () => {
    const api = getApiUrlOptional();
    const addr = walletAddress?.toLowerCase();
    if (!api || !addr) {
      toast.error('Server URL is not configured');
      return;
    }
    if (buyChipsBn <= 0n) {
      toast.error('Enter a positive whole number of chips');
      return;
    }
    if (buyChipsBn > maxBuyChips) {
      toast.error('Not enough MORBIUS in your play balance for that many chips');
      return;
    }
    if (buyChipsBn > BigInt(Number.MAX_SAFE_INTEGER)) {
      toast.error('Amount too large');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${api}/api/poker/chips/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr, chips: buyChipsParsed }),
      });
      if (!res.ok) {
        throw new Error(await readJsonError(res));
      }
      await res.json();
      setBuyInput('');
      toast.success(`Received ${formatChips(buyChipsParsed)} chips`);
      onExchangeComplete?.();
      void loadBalances();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Purchase failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCashout = async () => {
    const api = getApiUrlOptional();
    const addr = walletAddress?.toLowerCase();
    if (!api || !addr) {
      toast.error('Server URL is not configured');
      return;
    }
    if (sellChipsBn <= 0n) {
      toast.error('Enter a positive whole number of chips');
      return;
    }
    if (sellChipsBn > chipsBn) {
      toast.error('Not enough chips in your poker chip wallet');
      return;
    }
    if (sellChipsBn > BigInt(Number.MAX_SAFE_INTEGER)) {
      toast.error('Amount too large');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${api}/api/poker/chips/cashout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr, chips: sellChipsParsed }),
      });
      if (!res.ok) {
        throw new Error(await readJsonError(res));
      }
      const j = await res.json();
      const creditedWei = toBigIntSafe(j?.morbiusCreditedWei);
      setSellInput('');
      toast.success(`Credited ${formatMorbiusFloor(creditedWei)} MORBIUS to your play balance`);
      onExchangeComplete?.();
      void loadBalances();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cash-out failed');
    } finally {
      setSubmitting(false);
    }
  };

  const tabs: { id: ExchangeTab; label: string }[] = [
    { id: 'buy', label: 'Buy chips' },
    { id: 'cashout', label: 'Cash out' },
  ];

  return (
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
              aria-labelledby="poker-chip-exchange-title"
              className="bg-white text-gray-900 p-6 sm:p-10 rounded-[2.5rem] shadow-2xl w-full max-w-md relative border border-gray-100 pointer-events-auto overflow-y-auto max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={onClose}
                className="absolute top-6 right-6 z-20 text-gray-400 hover:text-black bg-gray-100 p-2 rounded-full transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>

              <div className="relative min-h-[260px]">
                <p
                  id="poker-chip-exchange-title"
                  className="text-center text-sm text-gray-500 uppercase tracking-widest font-semibold mb-1 pr-10"
                >
                  Chip cage
                </p>
                <p className="text-center text-xs text-gray-400 mb-6 px-2 leading-relaxed">
                  Move MORBIUS between your play balance and your poker chip wallet. 1 chip = 1 <TokenLabel symbol="MORBIUS" size="sm" />.
                </p>

                {/* Dual balance row — same visual language as wallet balance + refresh */}
                <div className="grid grid-cols-2 gap-3 mb-8">
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 px-3 py-4 text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Play balance</p>
                    <div className="flex items-center justify-center gap-1.5 min-h-[2.5rem]">
                      {loadingBalances ? (
                        <Loader2 className="w-7 h-7 animate-spin text-gray-300" />
                      ) : (
                        <span className="text-2xl sm:text-3xl font-light tracking-tight text-gray-900 tabular-nums">
                          {playBalanceWholeDisplay ?? '0'}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 font-medium mt-2 text-xs inline-flex items-center justify-center gap-1">
                      <img src={MORBIUS_LOGO} alt="" className="w-3.5 h-3.5 object-contain" />
                      MORBIUS
                    </p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 px-3 py-4 text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Poker chips</p>
                    <div className="flex items-center justify-center gap-1.5 min-h-[2.5rem]">
                      {loadingBalances ? (
                        <Loader2 className="w-7 h-7 animate-spin text-gray-300" />
                      ) : (
                        <span className="text-2xl sm:text-3xl font-light tracking-tight text-cyan-600 tabular-nums">
                          {formatChips(chipStr)}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 font-medium mt-2 text-xs">Off-chain</p>
                  </div>
                </div>

                <div className="flex justify-end mb-4 -mt-2">
                  <button
                    type="button"
                    onClick={() => void loadBalances()}
                    disabled={loadingBalances || !walletAddress}
                    className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-cyan-600 transition-colors disabled:opacity-40"
                  >
                    <RefreshCw size={14} className={loadingBalances ? 'animate-spin' : ''} />
                    Refresh balances
                  </button>
                </div>

                <div className="flex gap-2 mb-6 bg-gray-50 p-1 rounded-2xl">
                  {tabs.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className={`flex-1 py-3 text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                        tab === t.id ? 'bg-white text-cyan-600 shadow-sm' : 'text-gray-600 hover:text-black'
                      }`}
                    >
                      {t.id === 'buy' ? (
                        <ArrowDownCircle size={16} className="opacity-80 shrink-0" />
                      ) : (
                        <ArrowUpCircle size={16} className="opacity-80 shrink-0" />
                      )}
                      {t.label}
                    </button>
                  ))}
                </div>

                {tab === 'buy' && (
                  <div className="space-y-4">
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Whole chips only. The same number of MORBIUS is deducted from your play balance (floored to whole
                      MORBIUS).
                    </p>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-sm font-medium text-gray-700">Chips to buy</label>
                        <span className="text-xs text-gray-500">
                          Max: {formatChips(maxBuyChips)} chips
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={buyInput}
                          onChange={(e) => setBuyInput(e.target.value)}
                          placeholder="0"
                          disabled={submitting}
                          className="flex-1 w-full bg-white text-black/90 placeholder:text-black/30 border border-gray-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-black/5 transition-all tabular-nums"
                        />
                        <button
                          type="button"
                          disabled={submitting || maxBuyChips <= 0n}
                          onClick={() => setBuyInput(maxBuyChips > 0n ? maxBuyChips.toString() : '')}
                          className="px-4 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-40"
                        >
                          MAX
                        </button>
                      </div>
                    </div>
                    {buyChipsBn > 0n && (
                      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                        You pay{' '}
                        <span className="font-semibold text-cyan-600 tabular-nums">
                          {formatMorbiusFloor(buyChipsBn * POKER_CHIP_WEI)}
                        </span>{' '}
                        <TokenLabel symbol="MORBIUS" size="sm" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleBuy}
                      disabled={submitting || buyChipsBn <= 0n || buyChipsBn > maxBuyChips}
                      className="w-full py-4 text-sm font-medium rounded-xl flex items-center justify-center bg-black text-white hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processing…
                        </>
                      ) : (
                        <>
                          Buy chips
                          <span className="ml-1.5 inline-flex items-center">
                            <TokenLabel symbol="MORBIUS" size="sm" />
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {tab === 'cashout' && (
                  <div className="space-y-4">
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Return chips to your MORBIUS play balance. Chips that are still on a table cannot be cashed out
                      here — leave the table first.
                    </p>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-sm font-medium text-gray-700">Chips to cash out</label>
                        <span className="text-xs text-gray-500">
                          Avail: {formatChips(chipStr)} chips
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={sellInput}
                          onChange={(e) => setSellInput(e.target.value)}
                          placeholder="0"
                          disabled={submitting}
                          className="flex-1 w-full bg-white text-black/90 placeholder:text-black/30 border border-gray-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-black/5 transition-all tabular-nums"
                        />
                        <button
                          type="button"
                          disabled={submitting || chipsBn <= 0n}
                          onClick={() => setSellInput(chipsBn > 0n ? chipsBn.toString() : '')}
                          className="px-4 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-40"
                        >
                          MAX
                        </button>
                      </div>
                    </div>
                    {sellChipsBn > 0n && (
                      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                        You receive{' '}
                        <span className="font-semibold text-cyan-600 tabular-nums">
                          {formatMorbiusFloor(sellChipsBn * POKER_CHIP_WEI)}
                        </span>{' '}
                        <TokenLabel symbol="MORBIUS" size="sm" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleCashout}
                      disabled={submitting || sellChipsBn <= 0n || sellChipsBn > chipsBn}
                      className="w-full py-4 text-sm font-medium rounded-xl flex items-center justify-center bg-black text-white hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processing…
                        </>
                      ) : (
                        <>
                          Cash out to <span className="ml-1"><TokenLabel symbol="MORBIUS" size="sm" /></span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                <p className="text-[10px] text-gray-400 text-center mt-6 leading-relaxed">
                  Need MORBIUS in your play balance? Use the wallet from the top nav to deposit. This cage only swaps
                  between play balance and poker chips.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
