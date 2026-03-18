'use client';

import React, { useState } from 'react';
import { X, ShoppingBag, Store, Lock, Loader2 } from 'lucide-react';
import { usePublicClient, useWriteContract } from 'wagmi';
import { parseEther } from 'viem';
import { toast } from 'sonner';
import { ITEM_CATALOG, type ItemTier } from '@/lib/cosmetics-catalog';
import { useCatalog, useMarketListings, purchaseItem, buyListing, type MarketListing } from '@/hooks/use-cosmetics';
import { SHOP_TREASURY_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';

const ERC20_TRANSFER_ABI = [
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable' as const,
    inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
] as const;

const TIER_BADGE: Record<ItemTier, string> = {
  common:    'bg-zinc-700 text-zinc-300',
  uncommon:  'bg-emerald-900/80 text-emerald-300 border border-emerald-700/40',
  rare:      'bg-blue-900/80 text-blue-300 border border-blue-700/40',
  legendary: 'bg-amber-900/80 text-amber-300 border border-amber-600/40',
};

function ItemSwatchSmall({ itemKey }: { itemKey: string }) {
  const item = ITEM_CATALOG.find(i => i.itemKey === itemKey);
  const value = item?.unlocks[0]?.value ?? '';
  const isHex = value.startsWith('#');
  const isPattern = value.startsWith('url(#');
  const patternName = isPattern ? value.slice(5, -1) : '';

  if (isHex || isPattern) {
    return (
      <div className="w-7 h-7 rounded-lg overflow-hidden ring-1 ring-white/10 shrink-0">
        <svg viewBox="0 0 28 28" className="w-full h-full" style={{ imageRendering: 'pixelated' }}>
          <defs>
            {patternName === 'tiger'        && <pattern id="sw-tiger"  patternUnits="userSpaceOnUse" width="8"  height="8" ><rect width="8" height="8" fill="#c2410c"/><rect width="4" height="8" fill="#1a0a00" opacity="0.5"/></pattern>}
            {patternName === 'zebra'        && <pattern id="sw-zebra"  patternUnits="userSpaceOnUse" width="8"  height="8" ><rect width="8" height="8" fill="#fff"/><rect width="3" height="8" fill="#000" opacity="0.8"/></pattern>}
            {patternName === 'leopard'      && <pattern id="sw-leopard" patternUnits="userSpaceOnUse" width="10" height="10"><rect width="10" height="10" fill="#c2963b"/><circle cx="3" cy="3" r="2" fill="#1a0a00" opacity="0.5"/><circle cx="8" cy="7" r="2" fill="#1a0a00" opacity="0.5"/></pattern>}
            {patternName === 'camo'         && <pattern id="sw-camo"   patternUnits="userSpaceOnUse" width="12" height="12"><rect width="12" height="12" fill="#556b2f"/><rect x="0" y="0" width="5" height="5" fill="#3d5a1f" opacity="0.7"/><rect x="6" y="6" width="6" height="6" fill="#6b8f3f" opacity="0.6"/></pattern>}
            {patternName === 'rainbow'      && <linearGradient id="sw-rainbow" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ef4444"/><stop offset="33%" stopColor="#eab308"/><stop offset="66%" stopColor="#22c55e"/><stop offset="100%" stopColor="#3b82f6"/></linearGradient>}
            {patternName === 'galaxy'       && <radialGradient id="sw-galaxy" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#7c3aed"/><stop offset="60%" stopColor="#1d1b4b"/><stop offset="100%" stopColor="#000"/></radialGradient>}
            {patternName === 'checkerboard' && <pattern id="sw-check"  patternUnits="userSpaceOnUse" width="8"  height="8" ><rect width="8" height="8" fill="#fff"/><rect width="4" height="4" fill="#000"/><rect x="4" y="4" width="4" height="4" fill="#000"/></pattern>}
          </defs>
          <rect width="28" height="28" fill={
            !isPattern ? value :
            patternName === 'rainbow'      ? 'url(#sw-rainbow)' :
            patternName === 'galaxy'       ? 'url(#sw-galaxy)' :
            patternName === 'checkerboard' ? 'url(#sw-check)' :
            `url(#sw-${patternName})`
          } />
        </svg>
      </div>
    );
  }

  return (
    <div className="w-7 h-7 rounded-lg bg-zinc-800 ring-1 ring-white/10 flex items-center justify-center shrink-0">
      <span className="text-[7px] font-bold text-zinc-400 text-center px-0.5 leading-tight">
        {item?.displayName?.slice(0, 3) ?? '?'}
      </span>
    </div>
  );
}

export interface ItemPurchaseSheetProps {
  itemKey: string | null;
  onClose: () => void;
  onPurchased: (items: string[]) => void;
  buyerAddress: string | undefined;
}

export function ItemPurchaseSheet({ itemKey, onClose, onPurchased, buyerAddress }: ItemPurchaseSheetProps) {
  const { items: catalogItems } = useCatalog();
  const { listings } = useMarketListings(itemKey ? { itemKey } : undefined);
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [phase, setPhase] = useState<'idle' | 'shop' | 'market'>('idle');

  if (!itemKey) return null;

  const staticItem = ITEM_CATALOG.find(i => i.itemKey === itemKey);
  const liveItem = catalogItems.find(i => i.itemKey === itemKey);
  const item = liveItem ?? staticItem;
  if (!item) return null;

  const mintedCount = (liveItem as any)?.mintedCount ?? 0;
  const soldOut = mintedCount >= item.maxSupply;
  const remaining = item.maxSupply - mintedCount;

  const cheapestListing = listings
    .filter(l => l.sellerAddress.toLowerCase() !== (buyerAddress ?? '').toLowerCase())
    .sort((a, b) => a.priceMorbius - b.priceMorbius)[0] ?? null;

  const handleBuyShop = async () => {
    if (!publicClient || !buyerAddress) return;
    setPhase('shop');
    const toastId = toast.loading('Confirm in wallet…');
    try {
      const wei = parseEther(item.priceMorbius.toString());
      const txHash = await writeContractAsync({
        address: MORBIUS_TOKEN_ADDRESS,
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [SHOP_TREASURY_ADDRESS, wei],
      } as unknown as Parameters<typeof writeContractAsync>[0]);
      toast.loading('Confirming on-chain…', { id: toastId });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status === 'reverted') throw new Error('Transaction reverted');
      const newItems = await purchaseItem(buyerAddress, itemKey, txHash, 'MORBIUS');
      toast.success(`${item.displayName} unlocked!`, { id: toastId });
      onPurchased(newItems);
    } catch (err: any) {
      const cancelled = err?.message?.includes('rejected') || err?.message?.includes('denied');
      toast.error(cancelled ? 'Cancelled' : 'Purchase failed', {
        id: toastId,
        description: cancelled ? undefined : err?.message,
      });
    } finally {
      setPhase('idle');
    }
  };

  const handleBuyListing = async (listing: MarketListing) => {
    if (!publicClient || !buyerAddress) return;
    setPhase('market');
    const toastId = toast.loading('Confirm in wallet…');
    try {
      const wei = parseEther(listing.priceMorbius.toString());
      const txHash = await writeContractAsync({
        address: MORBIUS_TOKEN_ADDRESS,
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [listing.sellerAddress as `0x${string}`, wei],
      } as unknown as Parameters<typeof writeContractAsync>[0]);
      toast.loading('Confirming on-chain…', { id: toastId });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      const newItems = await buyListing(buyerAddress, listing.id, txHash);
      toast.success(`${listing.displayName ?? item.displayName} purchased!`, { id: toastId });
      onPurchased(newItems);
    } catch (err: any) {
      const cancelled = err?.message?.includes('rejected') || err?.message?.includes('denied');
      toast.error(cancelled ? 'Cancelled' : 'Purchase failed', {
        id: toastId,
        description: cancelled ? undefined : err?.message,
      });
    } finally {
      setPhase('idle');
    }
  };

  return (
    <div className="flex-shrink-0 border-t border-zinc-800 bg-zinc-900 px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <ItemSwatchSmall itemKey={itemKey} />

        <span className="text-sm font-semibold text-white">{item.displayName}</span>
        <span className={`inline-block px-1.5 py-px rounded text-[9px] font-bold uppercase ${TIER_BADGE[item.tier as ItemTier]}`}>
          {item.tier}
        </span>

        <span className="text-zinc-700 text-xs">·</span>

        {!buyerAddress ? (
          <span className="text-xs text-zinc-400 flex items-center gap-1">
            <Lock size={11} className="text-yellow-400" /> Connect wallet to purchase
          </span>
        ) : soldOut ? (
          <>
            <span className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded font-bold uppercase">Sold Out</span>
            {cheapestListing ? (
              <>
                <span className="text-xs text-zinc-400">Market: <span className="font-semibold text-white">{cheapestListing.priceMorbius.toLocaleString()} Morbius</span></span>
                <button
                  onClick={() => handleBuyListing(cheapestListing)}
                  disabled={phase !== 'idle'}
                  className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1 shrink-0"
                >
                  {phase === 'market' ? <Loader2 size={10} className="animate-spin" /> : <Store size={10} />}
                  {phase === 'market' ? '…' : 'Buy'}
                </button>
              </>
            ) : (
              <span className="text-xs text-zinc-500">No market listings</span>
            )}
          </>
        ) : (
          <>
            <span className="text-sm font-semibold text-amber-300">{item.priceMorbius.toLocaleString()} Morbius</span>
            <span className="text-[10px] text-zinc-500">{remaining}/{item.maxSupply} left</span>
            <button
              onClick={handleBuyShop}
              disabled={phase !== 'idle'}
              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1 shrink-0"
            >
              {phase === 'shop' ? <Loader2 size={10} className="animate-spin" /> : <ShoppingBag size={10} />}
              {phase === 'shop' ? '…' : 'Buy'}
            </button>
            {cheapestListing && (
              <>
                <span className="text-zinc-700 text-xs">·</span>
                <span className="text-xs text-zinc-400">Market: <span className="font-semibold text-zinc-200">{cheapestListing.priceMorbius.toLocaleString()}</span></span>
                <button
                  onClick={() => handleBuyListing(cheapestListing)}
                  disabled={phase !== 'idle'}
                  className="px-2.5 py-1 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1 shrink-0"
                >
                  {phase === 'market' ? <Loader2 size={10} className="animate-spin" /> : <Store size={10} />}
                  {phase === 'market' ? '…' : 'Market'}
                </button>
              </>
            )}
          </>
        )}

        <div className="ml-auto shrink-0">
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
