'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingBag, CheckCircle2, Loader2 } from 'lucide-react';
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

const TIER_RING: Record<ItemTier, string> = {
  common:    'ring-zinc-700/60',
  uncommon:  'ring-emerald-700/60',
  rare:      'ring-blue-700/60',
  legendary: 'ring-amber-600/60',
};

const TIER_GLOW: Record<ItemTier, string> = {
  common:    '',
  uncommon:  'shadow-emerald-900/20',
  rare:      'shadow-blue-900/30',
  legendary: 'shadow-amber-900/40',
};

// ── Item preview ──────────────────────────────────────────────────────────────

function ItemPreview({ item }: { item: CosmeticItem }) {
  const value = item.unlocks[0]?.value ?? '';

  if (value.startsWith('#') || value.startsWith('url(#')) {
    const isPattern = value.startsWith('url(#');
    const patternName = isPattern ? value.slice(5, -1) : '';
    return (
      <div className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-white/10 mx-auto">
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
    <div className="w-14 h-14 rounded-full bg-zinc-800 ring-2 ring-white/10 mx-auto flex items-center justify-center">
      <span className="text-[9px] font-bold text-zinc-300 text-center leading-tight px-1">{item.displayName}</span>
    </div>
  );
}

// ── Main shop component ───────────────────────────────────────────────────────

export interface CosmeticsShopProps {
  open: boolean;
  onClose: () => void;
  ownedItems: Set<string>;
  onPurchased: (newItems: string[]) => void;
}

type BuyPhase = 'idle' | 'confirming' | 'pending' | 'done' | 'error';

export function CosmeticsShop({ open, onClose, ownedItems, onPurchased }: CosmeticsShopProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { items: catalogItems } = useCatalog();

  const [category, setCategory]       = useState<CategoryId>('all');
  const [tier, setTier]               = useState<ItemTier | 'all'>('all');
  const [showOwned, setShowOwned]     = useState(false);
  const [buying, setBuying]           = useState<string | null>(null);
  const [buyPhase, setBuyPhase]       = useState<BuyPhase>('idle');
  const [confirmItem, setConfirmItem] = useState<CosmeticItem | null>(null);

  // Merge static catalog with live supply data
  const catalogWithSupply = useMemo(() => {
    const supplyMap = new Map(catalogItems.map(i => [i.itemKey, i]));
    return ITEM_CATALOG.map(i => ({ ...i, ...(supplyMap.get(i.itemKey) ?? {}) }));
  }, [catalogItems]);

  const filtered = useMemo(() => catalogWithSupply.filter(item => {
    if (category !== 'all' && itemCategory(item) !== category) return false;
    if (tier !== 'all' && item.tier !== tier) return false;
    if (!showOwned && ownedItems.has(item.itemKey)) return false;
    return true;
  }), [catalogWithSupply, category, tier, showOwned, ownedItems]);

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
            <div className="flex items-center gap-2.5">
              <ShoppingBag size={18} className="text-amber-400" />
              <h2 className="text-base font-bold text-white">Cosmetics Shop</h2>
              <span className="text-xs text-zinc-500">{ownedItems.size} owned</span>
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
                onClick={() => setShowOwned(p => !p)}
                className={`ml-auto px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${showOwned ? 'bg-green-700/50 text-green-300' : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'}`}
              >
                {showOwned ? 'Showing owned' : 'Hide owned'}
              </button>
            </div>
          </div>

          {/* Item grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-zinc-500 gap-2">
                <CheckCircle2 size={28} className="text-green-500/60" />
                <p className="text-sm">You own everything in this category!</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filtered.map(item => {
                  const owned   = ownedItems.has(item.itemKey);
                  const isBuying = buying === item.itemKey;
                  const mintedCount = (item as any).mintedCount ?? 0;
                  const soldOut = mintedCount >= item.maxSupply;
                  const remaining = item.maxSupply - mintedCount;
                  return (
                    <motion.div
                      key={item.itemKey}
                      layout
                      className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                        owned    ? 'border-green-700/40 bg-green-950/20' :
                        soldOut  ? 'border-zinc-700/30 bg-zinc-900/40 opacity-60 cursor-not-allowed' :
                        `ring-1 ${TIER_RING[item.tier]} bg-zinc-900 hover:bg-zinc-800/80 cursor-pointer shadow-lg ${TIER_GLOW[item.tier]}`
                      }`}
                      onClick={() => !owned && !isBuying && !soldOut && setConfirmItem(item)}
                    >
                      {owned && (
                        <span className="absolute top-1.5 right-1.5">
                          <CheckCircle2 size={14} className="text-green-400" />
                        </span>
                      )}
                      {soldOut && !owned && (
                        <span className="absolute top-1.5 right-1.5 bg-zinc-800 rounded px-1 py-px text-[8px] font-bold text-zinc-500 uppercase">Sold Out</span>
                      )}

                      <ItemPreview item={item} />

                      <div className="text-center w-full">
                        <p className="text-xs font-semibold text-zinc-200 leading-tight truncate">{item.displayName}</p>
                        <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${TIER_BADGE[item.tier]}`}>
                          {item.tier}
                        </span>
                      </div>

                      {!owned && (
                        <div className="w-full text-center">
                          <p className="text-[11px] text-amber-300 font-semibold">{item.priceMorbius.toLocaleString()} Morbius</p>
                          {!soldOut && (
                            <p className="text-[9px] text-zinc-600">{remaining} / {item.maxSupply} left</p>
                          )}
                        </div>
                      )}

                      {isBuying && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60">
                          <Loader2 size={20} className="animate-spin text-amber-400" />
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
