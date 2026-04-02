'use client';

import React from 'react';
import { AlertTriangle, Check, Gift, Loader2, Pencil, RefreshCw, Search, Users, X } from 'lucide-react';
import type { AvatarField, ItemTier } from '@/lib/cosmetics-catalog';
import { CatalogItemPreview } from '@/components/admin/cosmetics/CatalogItemPreview';
import type { EditState, ItemRow } from '@/components/admin/cosmetics/types';
import { APPLIES_TO_FIELDS_SORTED, APPLIES_TO_LABELS, DASH_CARD, TIER_BADGE, TIERS } from '@/components/admin/cosmetics/shared';

export function CatalogSection({
  address,
  items,
  loading,
  error,
  search,
  onSearchChange,
  applyFieldFilter,
  onApplyFieldFilterChange,
  tierFilter,
  onTierFilterChange,
  onRefresh,
  sortedFiltered,
  editKey,
  editState,
  setEditState,
  saving,
  saveError,
  toggleStoreBusyKey,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleItemStoreVisibility,
  onOpenOwners,
  onOpenGrant,
}: {
  address?: string;
  items: ItemRow[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  applyFieldFilter: AvatarField | 'all';
  onApplyFieldFilterChange: (value: AvatarField | 'all') => void;
  tierFilter: ItemTier | 'all';
  onTierFilterChange: (value: ItemTier | 'all') => void;
  onRefresh: () => void;
  sortedFiltered: ItemRow[];
  editKey: string | null;
  editState: EditState | null;
  setEditState: React.Dispatch<React.SetStateAction<EditState | null>>;
  saving: boolean;
  saveError: string | null;
  toggleStoreBusyKey: string | null;
  onStartEdit: (item: ItemRow) => void;
  onCancelEdit: () => void;
  onSaveEdit: (item: ItemRow) => void;
  onToggleItemStoreVisibility: (item: ItemRow, shopListed: boolean) => void;
  onOpenOwners: (item: ItemRow) => void;
  onOpenGrant: (item: ItemRow) => void;
}) {
  const editingItem = editKey ? items.find(i => i.itemKey === editKey) : undefined;

  return (
    <div className={`${DASH_CARD} min-w-0`}>
      <div className="px-5 py-5 border-b border-cyan-500/15">
        <div className="flex items-center gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Item Catalog</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Manage tiers, pricing, supply, and ownership. Use the gift icon to grant items to wallets.
            </p>
          </div>
        </div>
        <div className="flex flex-col lg:flex-row lg:flex-wrap items-stretch lg:items-end gap-3">
          <div className="relative flex-1 max-w-md min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Search items…"
              className="w-full bg-zinc-900/80 border border-zinc-700/80 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/40"
            />
          </div>
          <label className="flex flex-col gap-1 min-w-[12rem] max-w-xs">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500 font-semibold">Applies to</span>
            <select
              value={applyFieldFilter}
              onChange={e => onApplyFieldFilterChange(e.target.value as AvatarField | 'all')}
              className="w-full bg-zinc-900/80 border border-zinc-700/80 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/40"
              title="Show items that unlock this avatar field (patterns may unlock several)"
            >
              <option value="all">All fields</option>
              {APPLIES_TO_FIELDS_SORTED.map(f => (
                <option key={f} value={f}>
                  {APPLIES_TO_LABELS[f]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5 bg-zinc-900/80 border border-zinc-700/80 rounded-lg p-0.5">
              {(['all', ...TIERS] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onTierFilterChange(t)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
                    tierFilter === t ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50 border border-transparent hover:border-zinc-700"
              title="Refresh"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <span className="text-xs text-zinc-500 tabular-nums whitespace-nowrap">{sortedFiltered.length} items</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-4 flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {loading && !items.length ? (
        <div className="flex items-center justify-center py-20 text-zinc-500 gap-2">
          <Loader2 size={18} className="animate-spin" /> Loading items…
        </div>
      ) : (
        <>
          <div className="p-5 min-w-0 overflow-x-auto">
            <div className="grid w-full gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {sortedFiltered.map(item => {
                const isEditing = editKey === item.itemKey;
                const soldOut = item.mintedCount >= item.maxSupply;
                return (
                  <div
                    key={item.itemKey}
                    className={`group flex flex-col overflow-hidden rounded-xl border transition-all duration-200 ${
                      isEditing
                        ? 'border-cyan-400/50 bg-zinc-800/70 shadow-[0_0_0_1px_rgba(34,211,238,0.2)] ring-2 ring-cyan-500/20'
                        : 'border-cyan-500/15 bg-gradient-to-b from-[rgb(22,28,36)] to-[rgb(16,20,26)] hover:border-cyan-500/35 hover:shadow-[0_8px_24px_rgba(0,0,0,0.45)]'
                    }`}
                    style={{ boxShadow: isEditing ? undefined : 'inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 3px rgba(0,0,0,0.45)' }}
                  >
                    <div className="relative flex min-h-[6.5rem] items-center justify-center px-4 pt-4">
                      <div
                        className="pointer-events-none absolute inset-0 opacity-90"
                        style={{ background: 'radial-gradient(circle at 50% 35%, rgba(34, 211, 238, 0.10), transparent 62%)' }}
                      />
                      <CatalogItemPreview item={item} size="lg" />
                    </div>

                    <div className="flex flex-1 flex-col px-4 pb-4 pt-2">
                      <p className="line-clamp-2 min-h-[2.5rem] text-center text-sm font-medium leading-snug text-zinc-100" title={`${item.displayName} · ${item.itemKey}`}>
                        {item.displayName}
                      </p>

                      <div className="mt-2.5 flex items-center justify-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TIER_BADGE[item.tier]}`}>
                          {item.tier}
                        </span>
                        {!item.shopListed && (
                          <span className="rounded-full bg-amber-900/50 px-2 py-0.5 text-[10px] font-semibold text-amber-400/95">
                            Off store
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-center gap-3 text-xs tabular-nums">
                        <span className="text-amber-300/90 font-medium">{item.priceMorbius.toLocaleString()}</span>
                        <span className="text-zinc-600">·</span>
                        <span className={soldOut ? 'font-semibold text-red-400' : 'text-zinc-400'}>
                          {item.mintedCount}/{item.maxSupply} minted
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-4 gap-2">
                        <button
                          type="button"
                          onClick={() => (isEditing ? onCancelEdit() : onStartEdit(item))}
                          className={`flex items-center justify-center rounded-lg py-2.5 text-xs font-medium transition-colors ${
                            isEditing
                              ? 'bg-zinc-700 text-zinc-100 hover:bg-zinc-600'
                              : 'border border-zinc-600/60 bg-zinc-900/50 text-zinc-300 hover:border-cyan-500/30 hover:bg-zinc-800 hover:text-white'
                          }`}
                          title={isEditing ? 'Close editor' : 'Edit'}
                        >
                          {isEditing ? <X size={14} /> : <Pencil size={14} />}
                        </button>
                        <button
                          type="button"
                          disabled={!address}
                          onClick={() => onOpenOwners(item)}
                          className="flex items-center justify-center rounded-lg border border-zinc-600/60 bg-zinc-900/50 py-2.5 text-xs font-medium text-cyan-400/95 transition-colors hover:border-cyan-500/35 hover:bg-zinc-800 hover:text-cyan-300 disabled:pointer-events-none disabled:opacity-40"
                          title="Owners"
                        >
                          <Users size={14} />
                        </button>
                        <button
                          type="button"
                          disabled={!address}
                          onClick={() => onOpenGrant(item)}
                          className="flex items-center justify-center rounded-lg border border-zinc-600/60 bg-zinc-900/50 py-2.5 text-xs font-medium text-amber-400/95 transition-colors hover:border-amber-500/35 hover:bg-zinc-800 hover:text-amber-300 disabled:pointer-events-none disabled:opacity-40"
                          title="Grant to wallet"
                        >
                          <Gift size={14} />
                        </button>
                        <button
                          type="button"
                          disabled={!address || toggleStoreBusyKey === item.itemKey}
                          onClick={() => onToggleItemStoreVisibility(item, !item.shopListed)}
                          className={`flex items-center justify-center rounded-lg border py-2.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 ${
                            item.shopListed
                              ? 'border-red-700/60 bg-red-950/30 text-red-300 hover:border-red-500/70 hover:bg-red-900/40 hover:text-red-200'
                              : 'border-emerald-700/60 bg-emerald-950/30 text-emerald-300 hover:border-emerald-500/70 hover:bg-emerald-900/40 hover:text-emerald-200'
                          }`}
                          title={item.shopListed ? 'Remove from store' : 'List in store'}
                        >
                          {toggleStoreBusyKey === item.itemKey ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : item.shopListed ? (
                            'Off'
                          ) : (
                            'On'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {editingItem && editState && (
            <div className="border-t border-cyan-500/15 px-5 py-5 bg-black/20">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{editingItem.displayName}</p>
                  <code className="text-[11px] text-zinc-500 font-mono truncate block mt-0.5">{editingItem.itemKey}</code>
                </div>
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="shrink-0 p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  aria-label="Close editor"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex flex-col sm:flex-row items-start gap-5">
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <CatalogItemPreview item={editingItem} size="lg" />
                  <p className="text-xs text-amber-300/90 tabular-nums font-medium">{editingItem.priceMorbius.toLocaleString()} MORBIUS</p>
                </div>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full min-w-0">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">Tier</label>
                    <select
                      value={editState.tier}
                      onChange={e => setEditState(s => (s ? { ...s, tier: e.target.value as ItemTier } : s))}
                      className="bg-zinc-800 border border-zinc-600 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-cyan-500/40"
                    >
                      {TIERS.map(t => (
                        <option key={t} value={t} className="capitalize">
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">Price (MORBIUS)</label>
                    <input
                      type="number"
                      min={1}
                      value={editState.priceMorbius}
                      onChange={e => setEditState(s => (s ? { ...s, priceMorbius: e.target.value } : s))}
                      className="bg-zinc-800 border border-zinc-600 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-cyan-500/40"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">
                      Max supply
                      {editingItem.mintedCount > 0 && (
                        <span className="ml-1 text-zinc-600 normal-case">(min {editingItem.mintedCount} minted)</span>
                      )}
                    </label>
                    <input
                      type="number"
                      min={editingItem.mintedCount}
                      value={editState.maxSupply}
                      onChange={e => setEditState(s => (s ? { ...s, maxSupply: e.target.value } : s))}
                      className="bg-zinc-800 border border-zinc-600 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-cyan-500/40"
                    />
                  </div>
                  <div className="flex flex-col gap-1 sm:col-span-3">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">Store visibility</label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={editState.shopListed}
                        onChange={e => setEditState(s => (s ? { ...s, shopListed: e.target.checked } : s))}
                        className="rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500/30"
                      />
                      <span>Listed in store</span>
                      <span className="text-[10px] text-zinc-500 font-normal">
                        (off = hidden from shop; owners keep item; new purchases blocked)
                      </span>
                    </label>
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0 sm:pt-5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => onSaveEdit(editingItem)}
                    disabled={saving}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
              {saveError && (
                <div className="mt-4 flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3">
                  <AlertTriangle size={13} /> {saveError}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
