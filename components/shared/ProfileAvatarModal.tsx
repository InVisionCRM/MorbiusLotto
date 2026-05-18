'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import type { AvatarConfig } from '@/lib/websocket-client';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import { CharacterCreator, DEFAULT_AVATAR_CONFIG, randomizeConfig } from '@/components/avatar';
import type { RandomizeConfigOptions } from '@/components/avatar';
import { parseAvatarPayload } from '@/lib/avatar-payload';
import { motion, AnimatePresence } from 'framer-motion';
import { useProfileWs } from '@/contexts/profile-ws-context';
import { useInventory } from '@/hooks/use-cosmetics';
import { isAdminWallet, ITEM_CATALOG, type CosmeticItem, type ItemTier } from '@/lib/cosmetics-catalog';
import {
  AVATAR_RANDOMIZE_FIELD_PINS_KEY,
  readRandomizeFieldPinsFromStorage,
  type AvatarRandomizeFieldKey,
} from '@/lib/avatar-randomize-pins';
import { CosmeticsShop, COSMETICS_SHOP_PINS_STORAGE_KEY } from '@/components/shared/CosmeticsShop';
import { CosmeticsMarketplace } from '@/components/shared/CosmeticsMarketplace';
import { ItemPurchaseSheet } from '@/components/shared/ItemPurchaseSheet';
import { GiftItemModal } from '@/components/shared/GiftItemModal';
import { Gift, Package, Shuffle, Tag } from 'lucide-react';
import { createListing } from '@/hooks/use-cosmetics';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

function hydrateAvatarFromServer(raw: unknown): AvatarConfig {
  const parsed = parseAvatarPayload(raw);
  return parsed != null ? { ...parsed } : DEFAULT_AVATAR_CONFIG;
}

const PROFILE_PHOTO_MAX_DIM = 256;
const PROFILE_PHOTO_JPEG_QUALITY = 0.82;

async function fileToDownscaledDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please select an image file.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Image too large (max 10MB).');
  const bitmap = await createImageBitmap(file);
  const { width: w, height: h } = bitmap;
  const scale = Math.min(1, PROFILE_PHOTO_MAX_DIM / Math.max(w, h));
  const targetW = Math.max(1, Math.round(w * scale));
  const targetH = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported.');
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close?.();
  const hasAlpha = file.type === 'image/png' || file.type === 'image/webp';
  return canvas.toDataURL(hasAlpha ? 'image/png' : 'image/jpeg', PROFILE_PHOTO_JPEG_QUALITY);
}

function readCosmeticShopPins(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(COSMETICS_SHOP_PINS_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export function ProfileAvatarModal({ open, onClose, wsClient: wsClientProp, onSave }: ProfileAvatarModalProps) {
  const profileWs = useProfileWs();
  const wsClient = wsClientProp ?? profileWs?.wsClient ?? null;
  const { openConnectModal } = useConnectModal();
  const { address } = useAccount();

  const [displayName, setDisplayName] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [profileDisplayMode, setProfileDisplayMode] = useState<'avatar' | 'photo'>('avatar');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const handlePhotoPicked = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setPhotoError(null);
    try {
      const dataUrl = await fileToDownscaledDataUrl(file);
      setProfileImageUrl(dataUrl);
      setProfileDisplayMode('photo');
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Failed to read image.');
    }
  }, []);

  const handlePhotoToggleClick = useCallback(() => {
    if (profileImageUrl) {
      setProfileDisplayMode('photo');
    } else {
      photoInputRef.current?.click();
    }
  }, [profileImageUrl]);

  const handleRemovePhoto = useCallback(() => {
    setProfileImageUrl(null);
    setProfileDisplayMode('avatar');
    setPhotoError(null);
  }, []);
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
  const [cosmeticShopPins, setCosmeticShopPins] = useState<Set<string>>(readCosmeticShopPins);
  const [randomizePinnedFields, setRandomizePinnedFields] = useState<Set<string>>(readRandomizeFieldPinsFromStorage);

  const toggleRandomPin = useCallback((field: AvatarRandomizeFieldKey) => {
    setRandomizePinnedFields((prev) => {
      const next = new Set(prev);
      const k = field as string;
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const toggleCosmeticShopPin = useCallback((itemKey: string) => {
    setCosmeticShopPins((prev) => {
      const next = new Set(prev);
      if (next.has(itemKey)) next.delete(itemKey);
      else next.add(itemKey);
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(COSMETICS_SHOP_PINS_STORAGE_KEY, JSON.stringify([...cosmeticShopPins]));
    } catch {
      /* ignore */
    }
  }, [cosmeticShopPins]);

  useEffect(() => {
    try {
      sessionStorage.setItem(AVATAR_RANDOMIZE_FIELD_PINS_KEY, JSON.stringify([...randomizePinnedFields]));
    } catch {
      /* ignore */
    }
  }, [randomizePinnedFields]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (wsClient?.isConnected()) {
        const profile = await wsClient.getProfile();
        setDisplayName(profile.displayName ?? '');
        setProfileImageUrl(profile.profileImageUrl ?? null);
        setProfileDisplayMode(profile.profileDisplayMode === 'photo' ? 'photo' : 'avatar');
        setConfig(hydrateAvatarFromServer(profile.avatarConfig));
      } else if (address) {
        const res = await fetch(`/api/player/${address}/profile`);
        if (!res.ok) throw new Error('Failed to load profile');
        const data = await res.json();
        setDisplayName(data.displayName ?? '');
        setProfileImageUrl(data.profileImageUrl ?? null);
        setProfileDisplayMode(data.profileDisplayMode === 'photo' ? 'photo' : 'avatar');
        setConfig(hydrateAvatarFromServer(data.avatarConfig));
      } else {
        setDisplayName('');
        setProfileImageUrl(null);
        setProfileDisplayMode('avatar');
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

  const handleFooterRandomize = useCallback(() => {
    const opts: RandomizeConfigOptions = {};
    if (cosmeticShopPins.size) opts.pinnedItemKeys = cosmeticShopPins;
    if (randomizePinnedFields.size) {
      opts.preserveFrom = config;
      opts.pinnedFields = randomizePinnedFields;
    }
    setConfig(randomizeConfig(ownedSet, Object.keys(opts).length ? opts : undefined));
  }, [config, cosmeticShopPins, ownedSet, randomizePinnedFields]);

  const handleSave = async () => {
    const name = displayName.trim();
    if (name.length > 32) {
      setError('Display name must be at most 32 characters');
      return;
    }
    // Client-side locked-item check before hitting the server
    if (!adminBypass) {
      const { getLockedFields } = await import('@/lib/cosmetics-catalog');
      const locked = getLockedFields(config as unknown as Record<string, string>, ownedSet);
      if (locked.length > 0) {
        const names = locked.map((l) => l.displayName ?? l.value).join(', ');
        setError(`You don't own: ${names}. Purchase or receive these as a gift to save.`);
        return;
      }
    }

    const avatarPayload = config;

    setSaving(true);
    setError(null);
    try {
      if (wsClient?.isConnected()) {
        await wsClient.setDisplayName(name, profileImageUrl ?? '', avatarPayload, undefined, undefined, undefined, profileDisplayMode);
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
          profileImageUrl: profileImageUrl ?? '',
          avatarConfig: avatarPayload,
          profileDisplayMode,
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
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-start sm:items-center justify-center sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => {
          // Close only when the backdrop itself is clicked, never inner controls.
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          className="bg-white border border-gray-100 text-gray-900 rounded-none sm:rounded-[2rem] shadow-2xl max-w-xl w-full mt-14 h-[calc(100dvh-3.5rem)] sm:mt-0 sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col"
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 8, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex px-4 py-2.5 border-b border-gray-100 items-center gap-3 flex-shrink-0 bg-white">
            <Tabs value={view} onValueChange={(value) => setView(value as 'avatar' | 'items')}>
              <TabsList className="h-auto gap-1 rounded-2xl bg-gray-50 p-1">
                <TabsTrigger
                  value="avatar"
                  className="rounded-xl px-3 py-1.5 text-sm font-medium text-gray-500 data-[state=active]:border data-[state=active]:border-gray-100 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm"
                >
                  Avatar
                </TabsTrigger>
                <TabsTrigger
                  value="items"
                  className="rounded-xl px-3 py-1.5 text-sm font-medium text-gray-500 data-[state=active]:border data-[state=active]:border-gray-100 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Package size={11} />
                    My Items
                    {ownedItemKeys.length > 0 && (
                      <span className="bg-amber-500/20 text-amber-300 text-[9px] font-bold px-1 rounded">
                        {ownedItemKeys.length}
                      </span>
                    )}
                  </span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <button
              type="button"
              onClick={() => setMarketOpen(true)}
              title="Player Marketplace"
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-white border border-violet-400/40 bg-[length:200%_100%] bg-[linear-gradient(90deg,#6d28d9,#7c3aed,#6366f1,#7c3aed)] animate-shimmer shadow-[0_8px_20px_rgba(99,102,241,0.28)] hover:brightness-110 transition-all touch-manipulation shrink-0"
            >
              Marketplace
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="hidden sm:flex text-gray-500 hover:text-gray-700 p-2 -m-2 rounded min-w-[44px] min-h-[44px] items-center justify-center touch-manipulation"
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
                      <p className="text-sm">No items yet — visit the marketplace to get started!</p>
                      <button
                        onClick={() => setMarketOpen(true)}
                        className="mt-1 flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold border border-violet-400/40 bg-[length:200%_100%] bg-[linear-gradient(90deg,#6d28d9,#7c3aed,#6366f1,#7c3aed)] animate-shimmer shadow-[0_8px_20px_rgba(99,102,241,0.28)] hover:brightness-110 transition-all"
                      >
                        Marketplace
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
                  <div className="shrink-0 px-3 py-1.5 border-b border-gray-100 bg-gray-50/60 relative z-10">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-2">
                        {profileImageUrl ? (
                          <img
                            src={profileImageUrl}
                            alt="Profile photo"
                            className="h-8 w-8 rounded-full object-cover ring-1 ring-gray-300 shrink-0"
                            draggable={false}
                          />
                        ) : null}
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-gray-700 leading-tight">Show at game tables</p>
                          <p className="text-[10px] text-gray-500 leading-tight">Chat always uses your photo.</p>
                        </div>
                      </div>
                      <div className="inline-flex rounded-lg bg-gray-200 p-0.5 shrink-0" role="group" aria-label="Game seat appearance">
                        <button
                          type="button"
                          onClick={() => setProfileDisplayMode('avatar')}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                            profileDisplayMode === 'avatar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                          }`}
                          aria-pressed={profileDisplayMode === 'avatar'}
                        >
                          Avatar
                        </button>
                        <button
                          type="button"
                          onClick={handlePhotoToggleClick}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                            profileDisplayMode === 'photo' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                          }`}
                          aria-pressed={profileDisplayMode === 'photo'}
                        >
                          {profileImageUrl ? 'Photo' : 'Upload photo'}
                        </button>
                      </div>
                    </div>
                    {profileImageUrl && (
                      <div className="mt-1 flex items-center gap-2 text-[10px]">
                        <button
                          type="button"
                          onClick={() => photoInputRef.current?.click()}
                          className="text-cyan-600 hover:text-cyan-700 underline-offset-2 hover:underline"
                        >
                          Replace
                        </button>
                        <span className="text-gray-300">·</span>
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          className="text-red-500 hover:text-red-600 underline-offset-2 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    {photoError && (
                      <p className="mt-1 text-[10px] text-red-500">{photoError}</p>
                    )}
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={handlePhotoPicked}
                      aria-label="Upload profile photo"
                    />
                  </div>
                  <CharacterCreator
                    config={config}
                    onChange={setConfig}
                    displayName={displayName}
                    onDisplayNameChange={setDisplayName}
                    compact
                    ownedItems={ownedSet}
                    isAdmin={adminBypass}
                    onLockedItemClick={setPurchaseSheetKey}
                    pinnedItemKeys={cosmeticShopPins}
                    pinnedRandomFields={randomizePinnedFields}
                    onToggleRandomPin={toggleRandomPin}
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
                          onPurchased={() => {
                            refreshInventory();
                            setPurchaseSheetKey(null);
                          }}
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
                {/* Gift shortcut */}
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
                {view === 'avatar' && !loading && (
                  <button
                    type="button"
                    onClick={handleFooterRandomize}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-violet-400/50 text-violet-800 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 transition-colors touch-manipulation"
                  >
                    <Shuffle size={15} />
                    Randomize
                  </button>
                )}
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
      onWearItem={(item: CosmeticItem) => {
        setConfig((c) => {
          const next = { ...c };
          for (const u of item.unlocks) {
            (next as Record<string, string>)[u.field] = u.value;
          }
          return next;
        });
        toast.success('Applied to avatar — Save to keep');
      }}
      onSellItem={(itemKey) => {
        setListingItem(itemKey);
        setListingPrice('');
        setListingError(null);
      }}
      pinnedItemKeys={cosmeticShopPins}
      onTogglePin={toggleCosmeticShopPin}
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
