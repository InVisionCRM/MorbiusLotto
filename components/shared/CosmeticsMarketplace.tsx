'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Tag, Store, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAccount, useWriteContract, usePublicClient } from 'wagmi';
import { parseEther } from 'viem';
import { toast } from 'sonner';
import { ITEM_CATALOG, type ItemTier } from '@/lib/cosmetics-catalog';
import { useMarketListings, buyListing, createListing, cancelListing, type MarketListing } from '@/hooks/use-cosmetics';
import { MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';

const ERC20_TRANSFER_ABI = [
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable' as const,
    inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
] as const;

const TIER_STYLE: Record<ItemTier, string> = {
  common:    'bg-zinc-700 text-zinc-300',
  uncommon:  'bg-emerald-900/80 text-emerald-300 border border-emerald-700/40',
  rare:      'bg-blue-900/80 text-blue-300 border border-blue-700/40',
  legendary: 'bg-amber-900/80 text-amber-300 border border-amber-600/40',
};

const TIER_ORDER: ItemTier[] = ['legendary', 'rare', 'uncommon', 'common'];

type FilterTier = 'all' | ItemTier;

function ItemPreview({ itemKey, className }: { itemKey: string; className?: string }) {
  const catalog = ITEM_CATALOG.find(i => i.itemKey === itemKey);
  const value = catalog?.unlocks[0]?.value ?? '';
  const isHex = value.startsWith('#');
  return (
    <span className={`w-9 h-9 rounded-full overflow-hidden shrink-0 ring-1 ring-white/10 flex items-center justify-center ${className ?? ''}`}>
      {isHex ? (
        <svg viewBox="0 0 32 32" className="w-full h-full"><rect width="32" height="32" fill={value} /></svg>
      ) : value.startsWith('url(#') ? (
        <span className="w-full h-full bg-gradient-to-br from-amber-500 to-purple-600" />
      ) : (
        <span className="text-[8px] font-bold text-zinc-400 bg-zinc-700 w-full h-full flex items-center justify-center">
          {value.slice(0, 3)}
        </span>
      )}
    </span>
  );
}

// ── List-item-for-sale modal ───────────────────────────────────────────────────

interface ListItemModalProps {
  itemKey: string;
  onClose: () => void;
  onListed: () => void;
  sellerAddress: string;
}

function ListItemModal({ itemKey, onClose, onListed, sellerAddress }: ListItemModalProps) {
  const catalog = ITEM_CATALOG.find(i => i.itemKey === itemKey);
  const [price, setPrice] = useState('');
  const [listing, setListing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleList = async () => {
    const p = parseInt(price, 10);
    if (!p || p <= 0) { setError('Enter a valid price'); return; }
    setListing(true);
    setError(null);
    try {
      await createListing(sellerAddress, itemKey, p);
      toast.success('Item listed for sale!');
      onListed();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Listing failed');
    } finally {
      setListing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <ItemPreview itemKey={itemKey} />
          <div>
            <p className="font-semibold text-white">{catalog?.displayName}</p>
            <span className={`inline-block px-1.5 py-px rounded text-[9px] font-bold uppercase ${TIER_STYLE[catalog?.tier ?? 'common']}`}>
              {catalog?.tier}
            </span>
          </div>
        </div>
        <p className="text-sm text-zinc-400 mb-3">Set your asking price in Morbius tokens.</p>
        <div className="relative mb-1">
          <input
            type="number"
            min="1"
            value={price}
            onChange={e => setPrice(e.target.value)}
            placeholder="e.g. 50000"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm pr-24 focus:outline-none focus:border-cyan-500"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 font-medium">Morbius</span>
        </div>
        {catalog && price && parseInt(price) > 0 && (
          <p className="text-[11px] text-zinc-500 mb-3">
            Shop price: {catalog.priceMorbius.toLocaleString()} Morbius
          </p>
        )}
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleList}
            disabled={listing || !price}
            className="flex-1 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {listing ? <Loader2 size={14} className="animate-spin" /> : <Tag size={14} />}
            List for Sale
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Buy confirmation modal ─────────────────────────────────────────────────────

interface BuyModalProps {
  listing: MarketListing;
  onClose: () => void;
  onBought: (items: string[]) => void;
  buyerAddress: string;
}

function BuyModal({ listing, onClose, onBought, buyerAddress }: BuyModalProps) {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [step, setStep] = useState<'confirm' | 'sending' | 'verifying'>('confirm');
  const [error, setError] = useState<string | null>(null);

  const handleBuy = async () => {
    setStep('sending');
    setError(null);
    try {
      const priceWei = parseEther(listing.priceMorbius.toString());
      const hash = await writeContractAsync({
        address: MORBIUS_TOKEN_ADDRESS as `0x${string}`,
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [listing.sellerAddress as `0x${string}`, priceWei],
      } as unknown as Parameters<typeof writeContractAsync>[0]);

      setStep('verifying');
      await publicClient!.waitForTransactionReceipt({ hash });

      const items = await buyListing(buyerAddress, listing.id, hash);
      toast.success(`You now own ${listing.displayName}!`);
      onBought(items);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Purchase failed');
      setStep('confirm');
    }
  };

  const catalog = ITEM_CATALOG.find(i => i.itemKey === listing.itemKey);

  return (
    <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-5">
          <ItemPreview itemKey={listing.itemKey} />
          <div>
            <p className="font-semibold text-white">{listing.displayName}</p>
            <span className={`inline-block px-1.5 py-px rounded text-[9px] font-bold uppercase ${TIER_STYLE[(catalog?.tier ?? 'common') as ItemTier]}`}>
              {catalog?.tier}
            </span>
          </div>
        </div>

        <div className="bg-zinc-800/60 rounded-xl p-3 mb-4 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Price</span>
            <span className="text-white font-semibold">{listing.priceMorbius.toLocaleString()} Morbius</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500">Seller</span>
            <span className="text-zinc-400 font-mono">{listing.sellerAddress.slice(0, 6)}…{listing.sellerAddress.slice(-4)}</span>
          </div>
        </div>

        <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-700/30 rounded-lg p-3 mb-4">
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-300/80">
            You will send {listing.priceMorbius.toLocaleString()} Morbius directly to the seller's wallet. This cannot be undone.
          </p>
        </div>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        {step !== 'confirm' ? (
          <div className="flex items-center justify-center gap-2 py-3 text-sm text-zinc-400">
            <Loader2 size={16} className="animate-spin" />
            {step === 'sending' ? 'Waiting for wallet…' : 'Confirming on-chain…'}
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleBuy}
              className="flex-1 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle2 size={14} />
              Confirm Purchase
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main marketplace component ─────────────────────────────────────────────────

export interface CosmeticsMarketplaceProps {
  open: boolean;
  onClose: () => void;
  ownedItems: Set<string>;
  onPurchased: (newItems: string[]) => void;
}

export function CosmeticsMarketplace({ open, onClose, ownedItems, onPurchased }: CosmeticsMarketplaceProps) {
  const { address } = useAccount();
  const { listings, loading, refresh } = useMarketListings();

  const [tierFilter, setTierFilter] = useState<FilterTier>('all');
  const [showMine, setShowMine] = useState(false);
  const [buyTarget, setBuyTarget] = useState<MarketListing | null>(null);
  const [listTarget, setListTarget] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return listings.filter(l => {
      if (tierFilter !== 'all' && l.tier !== tierFilter) return false;
      if (showMine && l.sellerAddress.toLowerCase() !== address?.toLowerCase()) return false;
      return true;
    }).sort((a, b) => {
      const ta = TIER_ORDER.indexOf(a.tier as ItemTier);
      const tb = TIER_ORDER.indexOf(b.tier as ItemTier);
      if (ta !== tb) return ta - tb;
      return a.priceMorbius - b.priceMorbius;
    });
  }, [listings, tierFilter, showMine, address]);

  if (!open) return null;

  return (
    <>
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center sm:p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-none sm:rounded-2xl shadow-2xl max-w-3xl w-full mt-14 h-[calc(100dvh-3.5rem)] sm:mt-0 sm:h-auto sm:max-h-[85vh] flex flex-col overflow-hidden"
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0">
            <Store size={18} className="text-cyan-400" />
            <h2 className="font-semibold text-white">Player Marketplace</h2>
            <div className="flex-1" />
            {address && ownedItems.size > 0 && (
              <button
                onClick={() => setShowMine(p => !p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showMine ? 'bg-cyan-600 text-white' : 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/60'}`}
              >
                My Listings
              </button>
            )}
            <button onClick={onClose} className="hidden sm:flex text-white/70 hover:text-white p-2 -m-2 rounded min-w-[44px] min-h-[44px] items-center justify-center">
              <X size={18} />
            </button>
          </div>

          {/* Tier filters */}
          <div className="flex gap-1.5 px-4 py-2.5 border-b border-white/10 flex-wrap flex-shrink-0">
            {(['all', 'legendary', 'rare', 'uncommon', 'common'] as FilterTier[]).map(t => (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors capitalize ${
                  tierFilter === t
                    ? t === 'all' ? 'bg-zinc-700 text-white'
                    : t === 'legendary' ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
                    : t === 'rare' ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50'
                    : t === 'uncommon' ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                    : 'bg-zinc-700 text-zinc-300'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t === 'all' ? 'All' : t}
              </button>
            ))}
          </div>

          {/* Listings */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-zinc-500">
                <Loader2 size={20} className="animate-spin mr-2" /> Loading listings…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-zinc-500">
                <Store size={28} className="opacity-40" />
                <p className="text-sm">No listings found</p>
                {address && ownedItems.size > 0 && (
                  <p className="text-xs text-zinc-600">List your items from the My Items tab</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {filtered.map(listing => {
                  const isOwn = listing.sellerAddress.toLowerCase() === address?.toLowerCase();
                  const alreadyOwned = ownedItems.has(listing.itemKey);
                  return (
                    <div
                      key={listing.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/60 border border-zinc-700/40 hover:border-zinc-600/60 transition-colors"
                    >
                      <ItemPreview itemKey={listing.itemKey} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-200 truncate">{listing.displayName}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`inline-block px-1 py-px rounded text-[8px] font-bold uppercase ${TIER_STYLE[listing.tier as ItemTier]}`}>
                            {listing.tier}
                          </span>
                          <span className="text-[11px] text-zinc-400">{listing.priceMorbius.toLocaleString()} Morbius</span>
                        </div>
                        <p className="text-[10px] text-zinc-600 mt-0.5 font-mono">
                          {listing.sellerAddress.slice(0, 6)}…{listing.sellerAddress.slice(-4)}
                        </p>
                      </div>
                      {isOwn ? (
                        <button
                          onClick={async () => {
                            try {
                              await cancelListing(listing.sellerAddress, listing.id);
                              toast.success('Listing cancelled');
                              refresh();
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : 'Failed to cancel');
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors shrink-0"
                        >
                          Cancel
                        </button>
                      ) : alreadyOwned ? (
                        <span className="px-2 py-1.5 rounded-lg text-xs font-medium text-zinc-500 bg-zinc-800 shrink-0">Owned</span>
                      ) : (
                        <button
                          onClick={() => setBuyTarget(listing)}
                          disabled={!address}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-40 shrink-0"
                        >
                          Buy
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-white/10 flex-shrink-0 flex items-center justify-between">
            <p className="text-xs text-zinc-500">{filtered.length} listing{filtered.length !== 1 ? 's' : ''}</p>
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors">
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>

    {buyTarget && address && (
      <BuyModal
        listing={buyTarget}
        buyerAddress={address}
        onClose={() => setBuyTarget(null)}
        onBought={items => { onPurchased(items); refresh(); }}
      />
    )}

    {listTarget && address && (
      <ListItemModal
        itemKey={listTarget}
        sellerAddress={address}
        onClose={() => setListTarget(null)}
        onListed={refresh}
      />
    )}
    </>
  );
}
