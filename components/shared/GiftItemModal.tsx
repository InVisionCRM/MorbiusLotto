'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gift, Search, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ITEM_CATALOG, type CosmeticItem, type ItemTier } from '@/lib/cosmetics-catalog';
import { giftItem } from '@/hooks/use-cosmetics';

const TIER_BADGE: Record<ItemTier, string> = {
  common:    'bg-zinc-700 text-zinc-300',
  rare:      'bg-blue-900/80 text-blue-300 border border-blue-700/50',
  legendary: 'bg-amber-900/80 text-amber-300 border border-amber-600/50',
};

// Small preview for gift list
function MiniPreview({ item }: { item: CosmeticItem }) {
  const value = item.unlocks[0]?.value ?? '';
  if (value.startsWith('#')) {
    return (
      <span className="w-7 h-7 rounded-full overflow-hidden shrink-0 ring-1 ring-white/10 inline-flex">
        <svg viewBox="0 0 28 28" className="w-full h-full"><rect width="28" height="28" fill={value} /></svg>
      </span>
    );
  }
  if (value.startsWith('url(#')) {
    return (
      <span className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-500 to-purple-600 shrink-0 ring-1 ring-white/10 inline-flex" />
    );
  }
  return (
    <span className="w-7 h-7 rounded-full bg-zinc-700 shrink-0 ring-1 ring-white/10 inline-flex items-center justify-center">
      <span className="text-[7px] font-bold text-zinc-400 text-center leading-none px-0.5 truncate">{value.slice(0, 4)}</span>
    </span>
  );
}

interface GiftItemModalProps {
  open: boolean;
  onClose: () => void;
  /** Address of the sender (current user). */
  fromAddress: string;
  /** Pre-fill recipient (e.g. when opened from a player's profile). */
  toAddress?: string;
  /** Item keys the sender owns. */
  ownedItems: Set<string>;
  onGifted: (remainingItems: string[]) => void;
}

type GiftPhase = 'idle' | 'sending' | 'done' | 'error';

export function GiftItemModal({ open, onClose, fromAddress, toAddress: initialTo = '', ownedItems, onGifted }: GiftItemModalProps) {
  const [recipient, setRecipient] = useState(initialTo);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CosmeticItem | null>(null);
  const [phase, setPhase] = useState<GiftPhase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const ownedCatalog = useMemo(() =>
    ITEM_CATALOG.filter(i => ownedItems.has(i.itemKey)),
    [ownedItems],
  );

  const filtered = useMemo(() =>
    ownedCatalog.filter(i =>
      search === '' || i.displayName.toLowerCase().includes(search.toLowerCase()),
    ),
    [ownedCatalog, search],
  );

  const isValidAddress = /^0x[0-9a-fA-F]{40}$/.test(recipient.trim());

  const handleGift = async () => {
    if (!selected || !isValidAddress) return;
    setPhase('sending');
    setErrorMsg(null);
    const toastId = toast.loading(`Gifting ${selected.displayName}…`);
    try {
      const remaining = await giftItem(fromAddress, recipient.trim(), selected.itemKey);
      onGifted(remaining);
      setPhase('done');
      toast.success(`${selected.displayName} gifted!`, { id: toastId });
      setTimeout(onClose, 1500);
    } catch (err: any) {
      setPhase('error');
      setErrorMsg(err.message ?? 'Gift failed');
      toast.error('Gift failed', { id: toastId, description: err.message });
      setTimeout(() => { setPhase('idle'); setErrorMsg(null); }, 3000);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[65] bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center sm:p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-zinc-950 border border-zinc-800 rounded-none sm:rounded-2xl w-full max-w-md mt-14 sm:mt-0 h-[calc(100dvh-3.5rem)] sm:h-auto sm:max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-2.5">
              <Gift size={17} className="text-pink-400" />
              <h2 className="text-base font-bold text-white">Gift an Item</h2>
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-white p-2 rounded-lg hover:bg-zinc-800 transition-colors">
              <X size={17} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Recipient input */}
            <div>
              <label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold block mb-1.5">Recipient wallet</label>
              <input
                type="text"
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                placeholder="0x..."
                className="w-full bg-zinc-800 border border-zinc-700 focus:border-pink-500 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors font-mono"
              />
              {recipient && !isValidAddress && (
                <p className="text-xs text-red-400 mt-1">Invalid wallet address</p>
              )}
            </div>

            {/* Item picker */}
            <div>
              <label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold block mb-1.5">
                Choose item to gift ({ownedCatalog.length} owned)
              </label>

              {ownedCatalog.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-sm">
                  You don't own any items yet. Visit the shop to get started!
                </div>
              ) : (
                <>
                  {/* Search */}
                  <div className="relative mb-2">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search items…"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors"
                    />
                  </div>

                  <div className="space-y-1 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                    {filtered.map(item => (
                      <button
                        key={item.itemKey}
                        onClick={() => setSelected(selected?.itemKey === item.itemKey ? null : item)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left ${selected?.itemKey === item.itemKey ? 'bg-pink-500/15 border border-pink-500/40' : 'bg-zinc-800/50 hover:bg-zinc-800 border border-transparent'}`}
                      >
                        <MiniPreview item={item} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-zinc-200 truncate">{item.displayName}</p>
                          <span className={`inline-block px-1.5 py-px rounded text-[9px] font-bold uppercase mt-0.5 ${TIER_BADGE[item.tier]}`}>
                            {item.tier}
                          </span>
                        </div>
                        {selected?.itemKey === item.itemKey && (
                          <CheckCircle2 size={14} className="text-pink-400 shrink-0" />
                        )}
                      </button>
                    ))}
                    {filtered.length === 0 && (
                      <p className="text-xs text-zinc-500 text-center py-4">No matching items</p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Selected item summary */}
            {selected && (
              <div className="rounded-xl border border-pink-500/20 bg-pink-950/20 p-3 text-sm">
                <p className="text-zinc-300">
                  Gifting <span className="font-semibold text-pink-300">{selected.displayName}</span> — this item will be <span className="text-yellow-300">permanently transferred</span> out of your inventory.
                </p>
              </div>
            )}

            {errorMsg && (
              <div className="flex items-center gap-2 rounded-xl bg-red-950/30 border border-red-700/30 px-3 py-2 text-xs text-red-300">
                <AlertCircle size={13} className="shrink-0" />
                {errorMsg}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 pb-4 pt-2 border-t border-zinc-800 flex gap-2 shrink-0">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGift}
              disabled={!selected || !isValidAddress || phase !== 'idle'}
              className="flex-1 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-sm font-bold transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {phase === 'sending' ? (
                <><Loader2 size={14} className="animate-spin" /> Sending…</>
              ) : phase === 'done' ? (
                <><CheckCircle2 size={14} /> Sent!</>
              ) : (
                <><Gift size={14} /> Send Gift</>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
