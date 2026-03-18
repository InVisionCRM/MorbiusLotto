'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import type { AvatarConfig } from '@/lib/websocket-client';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import CharacterCreator, { DEFAULT_AVATAR_CONFIG } from '@/components/poker/avatar/CharacterCreator';
import { motion, AnimatePresence } from 'framer-motion';
import { useProfileWs } from '@/contexts/profile-ws-context';
import { useInventory } from '@/hooks/use-cosmetics';
import { isAdminWallet, ITEM_CATALOG, type ItemTier } from '@/lib/cosmetics-catalog';
import { CosmeticsShop } from '@/components/shared/CosmeticsShop';
import { CosmeticsMarketplace } from '@/components/shared/CosmeticsMarketplace';
import { ItemPurchaseSheet } from '@/components/shared/ItemPurchaseSheet';
import { GiftItemModal } from '@/components/shared/GiftItemModal';
import { ShoppingBag, Gift, Package, Store, Tag } from 'lucide-react';
import { createListing } from '@/hooks/use-cosmetics';

const TIER_BADGE: Record<ItemTier, string> = {
  common:    'bg-zinc-700 text-zinc-300',
  uncommon:  'bg-emerald-900/80 text-emerald-300 border border-emerald-700/40',
  rare:      'bg-blue-900/80 text-blue-300 border border-blue-700/40',
  legendary: 'bg-amber-900/80 text-amber-300 border border-amber-600/40',
};

export interface ProfileAvatarModalProps {
  open: boolean;
  onClose: () => void;
  /** When provided (e.g. from poker table), use for load/save. Else use context or REST. */
  wsClient?: BlackjackWebSocketClient | null;
  onSave?: () => void;
}

function normalizeAvatarConfig(c: unknown): AvatarConfig {
  if (c != null && typeof c === 'object' && 'skinColor' in c) {
    const o = c as Record<string, unknown>;
    return {
      skinColor: typeof o.skinColor === 'string' ? o.skinColor : DEFAULT_AVATAR_CONFIG.skinColor,
      hairStyle: typeof o.hairStyle === 'string' ? o.hairStyle : DEFAULT_AVATAR_CONFIG.hairStyle,
      hairColor: typeof o.hairColor === 'string' ? o.hairColor : DEFAULT_AVATAR_CONFIG.hairColor,
      eyeShape: typeof o.eyeShape === 'string' ? o.eyeShape : DEFAULT_AVATAR_CONFIG.eyeShape,
      eyeColor: typeof o.eyeColor === 'string' ? o.eyeColor : DEFAULT_AVATAR_CONFIG.eyeColor,
      noseShape: typeof o.noseShape === 'string' ? o.noseShape : DEFAULT_AVATAR_CONFIG.noseShape,
      lipShape: typeof o.lipShape === 'string' ? o.lipShape : DEFAULT_AVATAR_CONFIG.lipShape,
      accessory: typeof o.accessory === 'string' ? o.accessory : DEFAULT_AVATAR_CONFIG.accessory,
      shirtColor: typeof o.shirtColor === 'string' ? o.shirtColor : DEFAULT_AVATAR_CONFIG.shirtColor,
      hat: typeof o.hat === 'string' ? o.hat : DEFAULT_AVATAR_CONFIG.hat,
      necklace: typeof o.necklace === 'string' ? o.necklace : DEFAULT_AVATAR_CONFIG.necklace,
      mouthAccessory: typeof o.mouthAccessory === 'string' ? o.mouthAccessory : DEFAULT_AVATAR_CONFIG.mouthAccessory,
      backgroundImage: typeof o.backgroundImage === 'string' ? o.backgroundImage : DEFAULT_AVATAR_CONFIG.backgroundImage,
      overlayImage: typeof o.overlayImage === 'string' ? o.overlayImage : DEFAULT_AVATAR_CONFIG.overlayImage,
      faceShape: typeof o.faceShape === 'string' ? o.faceShape : DEFAULT_AVATAR_CONFIG.faceShape,
      customPattern: typeof o.customPattern === 'string' ? o.customPattern : DEFAULT_AVATAR_CONFIG.customPattern,
    };
  }
  return DEFAULT_AVATAR_CONFIG;
}

export function ProfileAvatarModal({ open, onClose, wsClient: wsClientProp, onSave }: ProfileAvatarModalProps) {
  const profileWs = useProfileWs();
  const wsClient = wsClientProp ?? profileWs?.wsClient ?? null;
  const { openConnectModal } = useConnectModal();
  const { address } = useAccount();

  const [displayName, setDisplayName] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [config, setConfig] = useState<AvatarConfig>(DEFAULT_AVATAR_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { ownedSet, items: ownedItemKeys, refresh: refreshInventory } = useInventory(address);
  const adminBypass = address ? isAdminWallet(address) : false;
  const [shopOpen, setShopOpen]         = useState(false);
  const [marketOpen, setMarketOpen]     = useState(false);
  const [giftOpen, setGiftOpen]         = useState(false);
  const [view, setView]                 = useState<'avatar' | 'items'>('avatar');
  const [listingItem, setListingItem]     = useState<string | null>(null);
  const [purchaseSheetKey, setPurchaseSheetKey] = useState<string | null>(null);
  const [listingPrice, setListingPrice] = useState('');
  const [listingError, setListingError] = useState<string | null>(null);
  const [listingBusy, setListingBusy]   = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (wsClient?.isConnected()) {
        const profile = await wsClient.getProfile();
        setDisplayName(profile.displayName ?? '');
        setProfileImageUrl(profile.profileImageUrl ?? null);
        setConfig(normalizeAvatarConfig(profile.avatarConfig));
      } else if (address) {
        const res = await fetch(`/api/player/${address}/profile`);
        if (!res.ok) throw new Error('Failed to load profile');
        const data = await res.json();
        setDisplayName(data.displayName ?? '');
        setProfileImageUrl(data.profileImageUrl ?? null);
        setConfig(normalizeAvatarConfig(data.avatarConfig));
      } else {
        setDisplayName('');
        setProfileImageUrl(null);
        setConfig(DEFAULT_AVATAR_CONFIG);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [wsClient, address]);

  useEffect(() => {
    if (open) {
      loadProfile();
      refreshInventory();
    }
  }, [open, loadProfile, refreshInventory]);

  const handleSave = async () => {
    const name = displayName.trim();
    if (name.length < 3) {
      setError('Display name must be at least 3 characters');
      return;
    }
    if (name.length > 32) {
      setError('Display name must be at most 32 characters');
      return;
    }
    // Client-side locked-item check before hitting the server
    if (!adminBypass) {
      const { getLockedFields } = await import('@/lib/cosmetics-catalog');
      const locked = getLockedFields(config as unknown as Record<string, string>, ownedSet);
      if (locked.length > 0) {
        const names = locked.map(l => l.displayName ?? l.value).join(', ');
        setError(`You don't own: ${names}. Purchase or receive these as a gift to save.`);
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      if (wsClient?.isConnected()) {
        await wsClient.setDisplayName(name, profileImageUrl, config);
        onSave?.();
        onClose();
        return;
      }
      if (!address) {
        setError('Connect your wallet to save');
        return;
      }
      const res = await fetch('/api/player/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          displayName: name,
          profileImageUrl: profileImageUrl ?? null,
          avatarConfig: config,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save profile');
      }
      onSave?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const canSave = wsClient?.isConnected() || address;

  return (
    <>
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-none sm:rounded-2xl shadow-2xl max-w-4xl w-full mt-14 h-[calc(100dvh-3.5rem)] sm:mt-0 sm:h-auto sm:max-h-[85vh] overflow-hidden flex flex-col"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex px-4 py-2.5 border-b border-white/10 items-center gap-3 flex-shrink-0">
            {/* Tab switcher */}
            <div className="flex gap-1 bg-zinc-800/60 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setView('avatar')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'avatar' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                Avatar
              </button>
              <button
                type="button"
                onClick={() => setView('items')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${view === 'items' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                <Package size={11} />
                My Items
                {ownedItemKeys.length > 0 && (
                  <span className="bg-amber-500/20 text-amber-300 text-[9px] font-bold px-1 rounded">
                    {ownedItemKeys.length}
                  </span>
                )}
              </button>
            </div>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="hidden sm:flex text-white/70 hover:text-white p-2 -m-2 rounded min-w-[44px] min-h-[44px] items-center justify-center touch-manipulation"
              aria-label="Close"
            >
              <span className="text-2xl leading-none">&times;</span>
            </button>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center p-12 text-white/70">Loading profile...</div>
          ) : (
            <>
              {view === 'items' ? (
                /* ── My Items panel ── */
                <div className="flex-1 min-h-0 overflow-y-auto p-4">
                  {ownedItemKeys.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-3 text-zinc-500">
                      <Package size={32} className="opacity-40" />
                      <p className="text-sm">No items yet — visit the shop to get started!</p>
                      <button
                        onClick={() => setShopOpen(true)}
                        className="mt-1 flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-colors"
                      >
                        <ShoppingBag size={14} />
                        Open Shop
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ITEM_CATALOG.filter(i => ownedSet.has(i.itemKey)).map(item => {
                        const value = item.unlocks[0]?.value ?? '';
                        const isHex = value.startsWith('#');
                        return (
                          <div key={item.itemKey} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-zinc-800/60 border border-zinc-700/40">
                            {isHex ? (
                              <span className="w-8 h-8 rounded-full overflow-hidden shrink-0 ring-1 ring-white/10">
                                <svg viewBox="0 0 32 32" className="w-full h-full"><rect width="32" height="32" fill={value} /></svg>
                              </span>
                            ) : value.startsWith('url(#') ? (
                              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-purple-600 shrink-0 ring-1 ring-white/10" />
                            ) : (
                              <span className="w-8 h-8 rounded-full bg-zinc-700 shrink-0 ring-1 ring-white/10 flex items-center justify-center">
                                <span className="text-[8px] font-bold text-zinc-400">{value.slice(0,3)}</span>
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-semibold text-zinc-200 truncate leading-tight">{item.displayName}</p>
                              <span className={`inline-block px-1 py-px rounded text-[8px] font-bold uppercase mt-0.5 ${TIER_BADGE[item.tier]}`}>
                                {item.tier}
                              </span>
                            </div>
                            {address && (
                              <button
                                type="button"
                                title="List for sale"
                                onClick={() => { setListingItem(item.itemKey); setListingPrice(''); setListingError(null); }}
                                className="p-1.5 rounded-lg text-zinc-500 hover:text-cyan-400 hover:bg-cyan-400/10 transition-colors shrink-0"
                              >
                                <Tag size={12} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
              <div className="relative flex-1 min-h-0 overflow-hidden flex flex-col">
                <CharacterCreator
                  config={config}
                  onChange={setConfig}
                  displayName={displayName}
                  onDisplayNameChange={setDisplayName}
                  compact
                  ownedItems={ownedSet}
                  isAdmin={adminBypass}
                  onLockedItemClick={setPurchaseSheetKey}
                />
                <AnimatePresence>
                  {purchaseSheetKey && (
                    <motion.div
                      className="absolute bottom-0 left-0 right-0 z-10 shadow-2xl"
                      initial={{ y: '100%' }}
                      animate={{ y: 0 }}
                      exit={{ y: '100%' }}
                      transition={{ type: 'spring', damping: 35, stiffness: 400 }}
                    >
                      <ItemPurchaseSheet
                        itemKey={purchaseSheetKey}
                        onClose={() => setPurchaseSheetKey(null)}
                        onPurchased={() => { refreshInventory(); setPurchaseSheetKey(null); }}
                        buyerAddress={address}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              )}

              {error && (
                <div className="px-4 py-1.5 text-red-400 text-sm flex-shrink-0">{error}</div>
              )}

              <div className="px-3 py-1.5 border-t border-white/10 flex items-center gap-1 flex-shrink-0">
                {/* Shop + Marketplace + Gift shortcuts */}
                <button
                  type="button"
                  onClick={() => setShopOpen(true)}
                  title="Cosmetics Shop"
                  className="p-1.5 rounded-md text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 transition-colors touch-manipulation flex items-center justify-center"
                >
                  <ShoppingBag size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setMarketOpen(true)}
                  title="Player Marketplace"
                  className="p-1.5 rounded-md text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/10 transition-colors touch-manipulation flex items-center justify-center"
                >
                  <Store size={15} />
                </button>
                {address && ownedItemKeys.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setGiftOpen(true)}
                    title="Gift an item"
                    className="p-1.5 rounded-md text-pink-400 hover:text-pink-300 hover:bg-pink-400/10 transition-colors touch-manipulation flex items-center justify-center"
                  >
                    <Gift size={15} />
                  </button>
                )}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors touch-manipulation"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={canSave ? handleSave : () => openConnectModal?.()}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-md text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 transition-colors touch-manipulation"
                >
                  {saving ? 'Saving...' : !canSave ? 'Connect wallet' : 'Save'}
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>

    {/* Shop modal */}
    <CosmeticsShop
      open={shopOpen}
      onClose={() => setShopOpen(false)}
      ownedItems={ownedSet}
      onPurchased={() => refreshInventory()}
    />

    {/* Marketplace modal */}
    <CosmeticsMarketplace
      open={marketOpen}
      onClose={() => setMarketOpen(false)}
      ownedItems={ownedSet}
      onPurchased={() => refreshInventory()}
    />

    {/* Gift modal */}
    {address && (
      <GiftItemModal
        open={giftOpen}
        onClose={() => setGiftOpen(false)}
        fromAddress={address}
        ownedItems={ownedSet}
        onGifted={() => refreshInventory()}
      />
    )}

    {/* List-for-sale inline mini-modal */}
    {listingItem && address && (() => {
      const item = ITEM_CATALOG.find(i => i.itemKey === listingItem);
      return (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4" onClick={() => setListingItem(null)}>
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-xs" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-white mb-1">{item?.displayName}</p>
            <p className="text-xs text-zinc-400 mb-4">Set your asking price in Morbius tokens.</p>
            <div className="relative mb-1">
              <input
                type="number"
                min="1"
                value={listingPrice}
                onChange={e => setListingPrice(e.target.value)}
                placeholder="e.g. 50000"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm pr-24 focus:outline-none focus:border-cyan-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">Morbius</span>
            </div>
            {item && listingPrice && parseInt(listingPrice) > 0 && (
              <p className="text-[11px] text-zinc-500 mb-3">Shop price: {item.priceMorbius.toLocaleString()} Morbius</p>
            )}
            {listingError && <p className="text-red-400 text-xs mb-3">{listingError}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setListingItem(null)} className="flex-1 px-3 py-2 rounded-xl text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors">Cancel</button>
              <button
                disabled={listingBusy || !listingPrice}
                onClick={async () => {
                  const p = parseInt(listingPrice, 10);
                  if (!p || p <= 0) { setListingError('Enter a valid price'); return; }
                  setListingBusy(true); setListingError(null);
                  try {
                    await createListing(address, listingItem, p);
                    setListingItem(null);
                  } catch (e) {
                    setListingError(e instanceof Error ? e.message : 'Failed');
                  } finally {
                    setListingBusy(false);
                  }
                }}
                className="flex-1 px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {listingBusy ? 'Listing…' : 'List for Sale'}
              </button>
            </div>
          </div>
        </div>
      );
    })()}
  </>
  );
}
