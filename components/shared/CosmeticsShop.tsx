'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingBag, CheckCircle2, Loader2, Lock } from 'lucide-react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { parseEther } from 'viem';
import { toast } from 'sonner';
import { ITEM_CATALOG, type CosmeticItem, type ItemTier } from '@/lib/cosmetics-catalog';
import { useCatalog, purchaseItem } from '@/hooks/use-cosmetics';
import { SHOP_TREASURY_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';

const ERC20_TRANSFER_ABI = [
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable' as const,
    inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
] as const;

// ── Category definitions ───────────────────────────────────────────────────────

type CategoryId = 'all' | 'skin' | 'hair_style' | 'hair_color' | 'accessory' | 'hat' | 'necklace' | 'shirt' | 'pattern' | 'feature';

const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'all',        label: 'All Items' },
  { id: 'skin',       label: 'Skin' },
  { id: 'hair_style', label: 'Hair Style' },
  { id: 'hair_color', label: 'Hair Color' },
  { id: 'accessory',  label: 'Accessories' },
  { id: 'hat',        label: 'Hats' },
  { id: 'necklace',   label: 'Necklaces' },
  { id: 'shirt',      label: 'Shirts' },
  { id: 'pattern',    label: 'Patterns' },
  { id: 'feature',    label: 'Features' },
];

function itemCategory(item: CosmeticItem): CategoryId {
  if (item.itemKey.startsWith('pattern_'))    return 'pattern';
  if (item.itemKey.startsWith('feature_'))    return 'feature';
  if (item.itemKey.startsWith('skin_'))       return 'skin';
  if (item.itemKey.startsWith('hair_style_')) return 'hair_style';
  if (item.itemKey.startsWith('hair_color_')) return 'hair_color';
  if (item.itemKey.startsWith('acc_'))        return 'accessory';
  if (item.itemKey.startsWith('hat_'))        return 'hat';
  if (item.itemKey.startsWith('neck_'))       return 'necklace';
  if (item.itemKey.startsWith('shirt_'))      return 'shirt';
  return 'all';
}

// ── Tier styles ───────────────────────────────────────────────────────────────

const TIER_BADGE: Record<ItemTier, string> = {
  common:    'bg-zinc-700 text-zinc-300',
  uncommon:  'bg-emerald-900/80 text-emerald-300 border border-emerald-700/50',
  rare:      'bg-blue-900/80 text-blue-300 border border-blue-700/50',
  legendary: 'bg-amber-900/80 text-amber-300 border border-amber-600/50',
};

const SHOP_CARD_SHELL =
  'group flex flex-col overflow-hidden rounded-xl border border-cyan-500/15 bg-gradient-to-b from-[rgb(22,28,36)] to-[rgb(16,20,26)] transition-all duration-200';
const SHOP_CARD_SHADOW =
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_3px_rgba(0,0,0,0.45)]';

export const COSMETICS_SHOP_PINS_STORAGE_KEY = 'morblotto_cosmetics_shop_pins';

// ── Item preview ──────────────────────────────────────────────────────────────

function ItemPreview({ item, large }: { item: CosmeticItem; large?: boolean }) {
  const value = item.unlocks[0]?.value ?? '';
  const dim = large ? 'w-[4.5rem] h-[4.5rem]' : 'w-14 h-14';

  if (value.startsWith('#') || value.startsWith('url(#')) {
    const isPattern = value.startsWith('url(#');
    const patternName = isPattern ? value.slice(5, -1) : '';
    return (
      <div className={`${dim} rounded-full overflow-hidden ring-2 ring-white/10 mx-auto`}>
        <svg viewBox="0 0 56 56" className="w-full h-full" style={{ imageRendering: 'pixelated' }}>
          <defs>
            {patternName === 'tiger'        && <pattern id="sp-tiger" patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill="#c2410c"/><rect width="4" height="8" fill="#1a0a00" opacity="0.5"/></pattern>}
            {patternName === 'zebra'        && <pattern id="sp-zebra" patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill="#fff"/><rect width="3" height="8" fill="#000" opacity="0.8"/></pattern>}
            {patternName === 'leopard'      && <pattern id="sp-leopard" patternUnits="userSpaceOnUse" width="10" height="10"><rect width="10" height="10" fill="#c2963b"/><circle cx="3" cy="3" r="2" fill="#1a0a00" opacity="0.5"/><circle cx="8" cy="7" r="2" fill="#1a0a00" opacity="0.5"/></pattern>}
            {patternName === 'camo'         && <pattern id="sp-camo" patternUnits="userSpaceOnUse" width="12" height="12"><rect width="12" height="12" fill="#556b2f"/><rect x="0" y="0" width="5" height="5" fill="#3d5a1f" opacity="0.7"/><rect x="6" y="6" width="6" height="6" fill="#6b8f3f" opacity="0.6"/></pattern>}
            {patternName === 'rainbow'      && <linearGradient id="sp-rainbow" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ef4444"/><stop offset="33%" stopColor="#eab308"/><stop offset="66%" stopColor="#22c55e"/><stop offset="100%" stopColor="#3b82f6"/></linearGradient>}
            {patternName === 'galaxy'       && <radialGradient id="sp-galaxy" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#7c3aed"/><stop offset="60%" stopColor="#1d1b4b"/><stop offset="100%" stopColor="#000"/></radialGradient>}
            {patternName === 'checkerboard' && <pattern id="sp-check" patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill="#fff"/><rect width="4" height="4" fill="#000"/><rect x="4" y="4" width="4" height="4" fill="#000"/></pattern>}
          </defs>
          {isPattern ? (
            <rect width="56" height="56" fill={
              patternName === 'rainbow' ? 'url(#sp-rainbow)' :
              patternName === 'galaxy'  ? 'url(#sp-galaxy)' :
              patternName === 'checkerboard' ? 'url(#sp-check)' :
              `url(#sp-${patternName})`
            } />
          ) : (
            <rect width="56" height="56" fill={value} />
          )}
        </svg>
      </div>
    );
  }

  return (
    <div className={`${dim} rounded-full bg-zinc-800 ring-2 ring-white/10 mx-auto flex items-center justify-center`}>
      <span className={`${large ? 'text-[10px]' : 'text-[9px]'} font-bold text-zinc-300 text-center leading-tight px-1`}>{item.displayName}</span>
    </div>
  );
}

// ── Main shop component ───────────────────────────────────────────────────────

export interface CosmeticsShopProps {
  open: boolean;
  onClose: () => void;
  ownedItems: Set<string>;
  onPurchased: (newItems: string[]) => void;
  /** Apply this catalog item’s unlocks to the avatar preview (parent should update config + save). */
  onWearItem?: (item: CosmeticItem) => void;
  /** Open list-for-sale flow (e.g. parent shows listing modal). */
  onSellItem?: (itemKey: string) => void;
  /** Controlled pins (e.g. profile modal) — pass with `onTogglePin` to sync with Randomize. */
  pinnedItemKeys?: Set<string>;
  onTogglePin?: (itemKey: string) => void;
}

type BuyPhase = 'idle' | 'confirming' | 'pending' | 'done' | 'error';

export function CosmeticsShop({
  open,
  onClose,
  ownedItems,
  onPurchased,
  onWearItem,
  onSellItem,
  pinnedItemKeys: pinnedItemKeysProp,
  onTogglePin: onTogglePinProp,
}: CosmeticsShopProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { items: catalogItems } = useCatalog();

  const pinsControlled = pinnedItemKeysProp != null && onTogglePinProp != null;

  const [category, setCategory]       = useState<CategoryId>('all');
  const [tier, setTier]               = useState<ItemTier | 'all'>('all');
  /** When true, list only cosmetics you do not own (shop/mint view). When false, full catalog — needed for Lock + Wear on owned items. */
  const [unownedOnly, setUnownedOnly] = useState(false);
  const [buying, setBuying]           = useState<string | null>(null);
  const [buyPhase, setBuyPhase]       = useState<BuyPhase>('idle');
  const [confirmItem, setConfirmItem] = useState<CosmeticItem | null>(null);
  const [internalPinnedKeys, setInternalPinnedKeys] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = sessionStorage.getItem(COSMETICS_SHOP_PINS_STORAGE_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as unknown;
      return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set();
    } catch {
      return new Set();
    }
  });

  const pinnedKeys = pinsControlled ? pinnedItemKeysProp! : internalPinnedKeys;

  useEffect(() => {
    if (pinsControlled) return;
    try {
      sessionStorage.setItem(COSMETICS_SHOP_PINS_STORAGE_KEY, JSON.stringify([...internalPinnedKeys]));
    } catch {
      /* ignore */
    }
  }, [internalPinnedKeys, pinsControlled]);

  const togglePin = (itemKey: string) => {
    if (pinsControlled) {
      onTogglePinProp!(itemKey);
      return;
    }
    setInternalPinnedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(itemKey)) next.delete(itemKey);
      else next.add(itemKey);
      return next;
    });
  };

  // Merge static catalog with live supply data
  const catalogWithSupply = useMemo(() => {
    const supplyMap = new Map(catalogItems.map(i => [i.itemKey, i]));
    return ITEM_CATALOG.map(i => ({ ...i, ...(supplyMap.get(i.itemKey) ?? {}) }));
  }, [catalogItems]);

  const filtered = useMemo(() => catalogWithSupply.filter(item => {
    if (category !== 'all' && itemCategory(item) !== category) return false;
    if (tier !== 'all' && item.tier !== tier) return false;
    if (unownedOnly && ownedItems.has(item.itemKey)) return false;
    return true;
  }), [catalogWithSupply, category, tier, unownedOnly, ownedItems]);

  const handleBuy = async () => {
    if (!confirmItem || !address || !publicClient) return;
    setBuying(confirmItem.itemKey);
    setBuyPhase('confirming');
    const toastId = toast.loading('Confirm in wallet…');
    try {
      const wei = parseEther(confirmItem.priceMorbius.toString());
      const txHash = await writeContractAsync({
        address: MORBIUS_TOKEN_ADDRESS,
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [SHOP_TREASURY_ADDRESS, wei],
      } as unknown as Parameters<typeof writeContractAsync>[0]);

      setBuyPhase('pending');
      toast.loading('Confirming on-chain…', { id: toastId });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status === 'reverted') throw new Error('Transaction reverted');

      const newItems = await purchaseItem(address, confirmItem.itemKey, txHash, 'MORBIUS');
      onPurchased(newItems);
      setBuyPhase('done');
      toast.success(`${confirmItem.displayName} unlocked!`, { id: toastId });
      setConfirmItem(null);
      setTimeout(() => setBuyPhase('idle'), 1500);
    } catch (err: any) {
      const cancelled = err?.message?.includes('rejected') || err?.message?.includes('denied');
      setBuyPhase('error');
      toast.error(cancelled ? 'Cancelled' : 'Purchase failed', {
        id: toastId,
        description: cancelled ? undefined : err?.message,
      });
      setTimeout(() => { setBuyPhase('idle'); setBuying(null); }, 3000);
    } finally {
      setBuying(null);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-start sm:items-center justify-center sm:p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-zinc-950 border border-zinc-800 rounded-none sm:rounded-2xl w-full max-w-4xl mt-14 sm:mt-0 h-[calc(100dvh-3.5rem)] sm:h-[88vh] flex flex-col overflow-hidden shadow-2xl"
          initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2.5">
              <div className="flex items-center gap-2.5">
                <ShoppingBag size={18} className="text-amber-400" />
                <h2 className="text-base font-bold text-white">Cosmetics Shop</h2>
                <span className="text-xs text-zinc-500">{ownedItems.size} owned</span>
              </div>
              <p className="text-[11px] text-zinc-500 sm:ml-1">
                <Lock size={10} className="inline mr-1 opacity-70 align-baseline" aria-hidden />
                Lock pins a cosmetic so Randomize keeps it (saved in this browser).
              </p>
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-white p-2 rounded-lg hover:bg-zinc-800 transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Filters */}
          <div className="px-4 py-2.5 border-b border-zinc-800 shrink-0 space-y-2">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {CATEGORIES.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${category === c.id ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {(['all', 'common', 'uncommon', 'rare', 'legendary'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTier(t)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors ${tier === t ? 'bg-zinc-600 text-white' : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'}`}
                >
                  {t === 'all' ? 'All Tiers' : t}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setUnownedOnly(p => !p)}
                className={`ml-auto px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${unownedOnly ? 'bg-amber-900/50 text-amber-200' : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'}`}
                title={unownedOnly ? 'Show full catalog (owned + unowned)' : 'Show only items you can still mint'}
              >
                {unownedOnly ? 'Unowned only' : 'All items'}
              </button>
            </div>
          </div>

          {/* Item grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-zinc-500 gap-2 px-4 text-center">
                <CheckCircle2 size={28} className="text-green-500/60" />
                <p className="text-sm">
                  {unownedOnly
                    ? 'You own every cosmetic in this filter — switch to All items to see Lock / Wear.'
                    : 'No items match this filter.'}
                </p>
              </div>
            ) : (
              <div
                className="grid w-full gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
              >
                {filtered.map(item => {
                  const owned = ownedItems.has(item.itemKey);
                  const isBuying = buying === item.itemKey;
                  const mintedCount = (item as { mintedCount?: number }).mintedCount ?? 0;
                  const soldOut = mintedCount >= item.maxSupply;
                  const remaining = item.maxSupply - mintedCount;
                  const pinned = pinnedKeys.has(item.itemKey);
                  const canMint = !owned && !soldOut;
                  const canWear = owned && !!onWearItem;
                  const canSell = owned && !!onSellItem;

                  const actionBtn =
                    'rounded px-1 py-1 text-[11px] font-semibold tracking-wide transition-colors disabled:cursor-not-allowed';

                  return (
                    <motion.div
                      key={item.itemKey}
                      layout
                      className={`relative ${SHOP_CARD_SHELL} ${SHOP_CARD_SHADOW} ${
                        soldOut && !owned ? 'opacity-65' : 'hover:border-cyan-500/35 hover:shadow-[0_8px_24px_rgba(0,0,0,0.45)]'
                      }`}
                    >
                      {/* Swatch — flush to card top (no top padding) */}
                      <div className="relative flex min-h-[6.25rem] items-center justify-center px-4 pt-0 pb-3">
                        <div
                          className="pointer-events-none absolute inset-0 opacity-90"
                          style={{
                            background:
                              'radial-gradient(circle at 50% 35%, rgba(34, 211, 238, 0.10), transparent 62%)',
                          }}
                        />
                        <div className="relative z-[1]">
                          <ItemPreview item={item} large />
                        </div>
                        {soldOut && !owned && (
                          <span className="absolute right-2 top-2 z-[2] rounded bg-zinc-900/90 px-1.5 py-px text-[8px] font-bold uppercase text-zinc-500 ring-1 ring-zinc-600/50">
                            Sold out
                          </span>
                        )}
                        {owned && (
                          <span className="absolute right-2 top-2 z-[2] rounded bg-emerald-950/90 px-1.5 py-px text-[8px] font-bold uppercase text-emerald-400 ring-1 ring-emerald-600/40">
                            Owned
                          </span>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col px-4 pb-3 pt-0">
                        <p
                          className="line-clamp-2 min-h-[2.25rem] text-center text-sm font-medium leading-snug text-zinc-100"
                          title={item.displayName}
                        >
                          {item.displayName}
                        </p>

                        <div className="mt-2 flex items-center justify-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TIER_BADGE[item.tier]}`}
                          >
                            {item.tier}
                          </span>
                        </div>

                        {!owned && (
                          <div className="mt-2.5 flex items-center justify-center gap-2 text-xs tabular-nums">
                            <span className="font-medium text-amber-300/90">{item.priceMorbius.toLocaleString()}</span>
                            <span className="text-zinc-600">·</span>
                            <span className={soldOut ? 'font-semibold text-red-400' : 'text-zinc-400'}>
                              {remaining} / {item.maxSupply}
                            </span>
                          </div>
                        )}

                        <div
                          role="group"
                          aria-label={`Actions for ${item.displayName}`}
                          className="mt-3 flex flex-wrap items-center justify-center gap-x-0.5 border-t border-cyan-500/15 pt-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            aria-pressed={pinned}
                            title={
                              pinned
                                ? 'Unpin — this cosmetic will change on Randomize'
                                : 'Pin — kept when you Randomize avatar (saved in this browser)'
                            }
                            onClick={() => togglePin(item.itemKey)}
                            className={`${actionBtn} inline-flex items-center gap-0.5 text-zinc-300 hover:text-cyan-300 aria-pressed:text-amber-400 aria-pressed:font-bold`}
                          >
                            <Lock size={11} className="shrink-0 opacity-90" aria-hidden />
                            Lock
                          </button>
                          <span className="select-none px-0.5 text-zinc-600" aria-hidden>
                            /
                          </span>
                          <button
                            type="button"
                            disabled={!canWear}
                            title={owned ? 'Apply to avatar preview' : 'Own this item to wear'}
                            onClick={() => canWear && onWearItem?.(item)}
                            className={`${actionBtn} text-zinc-300 hover:text-blue-500 disabled:opacity-35 disabled:hover:text-zinc-300`}
                          >
                            Wear
                          </button>
                          <span className="select-none px-0.5 text-zinc-600" aria-hidden>
                            /
                          </span>
                          {owned ? (
                            <button
                              type="button"
                              disabled={!canSell}
                              title="List for sale"
                              onClick={() => canSell && onSellItem?.(item.itemKey)}
                              className={`${actionBtn} text-zinc-300 hover:text-amber-400 disabled:opacity-35 disabled:hover:text-zinc-300`}
                            >
                              Sell
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={!canMint || isBuying}
                              title={soldOut ? 'Sold out' : 'Mint from shop'}
                              onClick={() => canMint && setConfirmItem(item)}
                              className={`${actionBtn} text-zinc-300 hover:text-green-600 disabled:opacity-35 disabled:hover:text-zinc-300`}
                            >
                              Mint
                            </button>
                          )}
                        </div>
                      </div>

                      {isBuying && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 z-10">
                          <Loader2 size={22} className="animate-spin text-amber-400" />
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Confirm purchase modal */}
      <AnimatePresence>
        {confirmItem && (
          <motion.div
            className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => buyPhase === 'idle' && setConfirmItem(null)}
          >
            <motion.div
              className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm p-5 shadow-2xl"
              initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.93, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-white">{confirmItem.displayName}</h3>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${TIER_BADGE[confirmItem.tier]}`}>
                    {confirmItem.tier}
                  </span>
                </div>
                <div className="mt-1 w-14 h-14 shrink-0">
                  <ItemPreview item={confirmItem} />
                </div>
              </div>

              <div className="bg-zinc-800/60 rounded-xl p-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Price</span>
                  <span className="text-amber-300 font-bold">{confirmItem.priceMorbius.toLocaleString()} Morbius</span>
                </div>
              </div>

              <p className="text-[11px] text-zinc-500 mb-4">
                Permanent ownership. Can be gifted or listed for sale after purchase.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmItem(null)}
                  disabled={buyPhase !== 'idle'}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm font-medium transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBuy}
                  disabled={!address || buyPhase !== 'idle'}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {buyPhase === 'confirming' || buyPhase === 'pending' ? (
                    <><Loader2 size={14} className="animate-spin" /> {buyPhase === 'confirming' ? 'Confirm…' : 'Pending…'}</>
                  ) : buyPhase === 'done' ? (
                    <><CheckCircle2 size={14} /> Unlocked!</>
                  ) : !address ? 'Connect wallet' : 'Buy with Morbius'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
}
