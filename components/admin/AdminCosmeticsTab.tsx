'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import type { AvatarField, ItemTier } from '@/lib/cosmetics-catalog';
import type { VoxelPainterHandle } from '@/components/avatar';
import AvatarFeaturePlacementEditor from '@/components/admin/AvatarFeaturePlacementEditor';
import { GrantItemModal, ItemOwnersModal } from '@/components/admin/cosmetics/CatalogModals';
import { DreadlocksVariantReviewPanel, ItemBuilderPanel } from '@/components/admin/cosmetics/BuilderPanels';
import { CatalogSection } from '@/components/admin/cosmetics/CatalogSection';
import { CosmeticsDashboardHeader, type ActiveToolTab } from '@/components/admin/cosmetics/CosmeticsDashboardHeader';
import { AdminWalletPlaceholder, TierPricingPanel, VoxelPainterDashboardCard } from '@/components/admin/cosmetics/ToolPanels';
import type { EditState, ItemRow } from '@/components/admin/cosmetics/types';
import {
  TIER_SORT,
} from '@/components/admin/cosmetics/shared';
// ─── Main tab ──────────────────────────────────────────────────────────────────

export default function AdminCosmeticsTab() {
  const { address } = useAccount();
  const voxelPainterRef = useRef<VoxelPainterHandle>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<ItemTier | 'all'>('all');
  const [applyFieldFilter, setApplyFieldFilter] = useState<AvatarField | 'all'>('all');
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toggleStoreBusyKey, setToggleStoreBusyKey] = useState<string | null>(null);
  const [ownersModal, setOwnersModal] = useState<{ itemKey: string; displayName: string } | null>(null);
  const [grantModal, setGrantModal] = useState<{ itemKey: string; displayName: string } | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveToolTab>('create');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = address ? `?adminAddress=${encodeURIComponent(address)}` : '';
      const res = await fetch(`/api/cosmetics/items${qs}`);
      const data = await res.json();
      setItems(
        (data as any[]).map(i => ({
          itemKey: i.itemKey,
          displayName: i.displayName,
          tier: i.tier as ItemTier,
          priceMorbius: i.priceMorbius,
          maxSupply: i.maxSupply,
          mintedCount: i.mintedCount ?? 0,
          shopListed: typeof i.shopListed === 'boolean' ? i.shopListed : true,
          unlocks: Array.isArray(i.unlocks) ? i.unlocks : [],
        })),
      );
    } catch {
      setError('Failed to load items');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (item: ItemRow) => {
    setEditKey(item.itemKey);
    setEditState({
      tier: item.tier,
      priceMorbius: item.priceMorbius.toString(),
      maxSupply: item.maxSupply.toString(),
      shopListed: item.shopListed,
    });
    setSaveError(null);
  };

  const cancelEdit = () => { setEditKey(null); setEditState(null); setSaveError(null); };

  const saveEdit = async (item: ItemRow) => {
    if (!editState || !address) return;
    const newPrice = parseInt(editState.priceMorbius, 10);
    const newSupply = parseInt(editState.maxSupply, 10);
    if (isNaN(newPrice) || newPrice <= 0) { setSaveError('Invalid price'); return; }
    if (isNaN(newSupply) || newSupply <= 0) { setSaveError('Invalid supply'); return; }
    if (newSupply < item.mintedCount) { setSaveError(`Supply can't be below already-minted count (${item.mintedCount})`); return; }

    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/cosmetics/admin/item`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminAddress: address,
          itemKey: item.itemKey,
          tier: editState.tier,
          priceMorbius: newPrice,
          maxSupply: newSupply,
          shopListed: editState.shopListed,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setSaveError(data.error ?? 'Save failed'); return; }
      // Update local state
      setItems(prev => prev.map(i =>
        i.itemKey === item.itemKey
          ? { ...i, tier: editState.tier, priceMorbius: newPrice, maxSupply: newSupply, shopListed: editState.shopListed }
          : i,
      ));
      cancelEdit();
    } catch {
      setSaveError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const toggleItemStoreVisibility = async (item: ItemRow, shopListed: boolean) => {
    if (!address) return;
    setToggleStoreBusyKey(item.itemKey);
    setError(null);
    try {
      const res = await fetch('/api/cosmetics/admin/item', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminAddress: address,
          itemKey: item.itemKey,
          tier: item.tier,
          priceMorbius: item.priceMorbius,
          maxSupply: item.maxSupply,
          shopListed,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed to ${shopListed ? 'list' : 'remove'} item`);
        return;
      }
      setItems(prev =>
        prev.map(i => (i.itemKey === item.itemKey ? { ...i, shopListed } : i)),
      );
    } catch {
      setError('Network error while updating store visibility');
    } finally {
      setToggleStoreBusyKey(null);
    }
  };

  const filtered = items.filter(i => {
    if (tierFilter !== 'all' && i.tier !== tierFilter) return false;
    if (applyFieldFilter !== 'all') {
      const hit = i.unlocks.some(u => u.field === applyFieldFilter);
      if (!hit) return false;
    }
    if (search && !i.displayName.toLowerCase().includes(search.toLowerCase()) && !i.itemKey.includes(search.toLowerCase())) return false;
    return true;
  });

  const sortedFiltered = [...filtered].sort(
    (a, b) => TIER_SORT[a.tier] - TIER_SORT[b.tier] || a.displayName.localeCompare(b.displayName),
  );
  const editingItem = editKey ? items.find(i => i.itemKey === editKey) : undefined;

  return (
    <div className="space-y-6 w-full min-w-0 max-w-full">

      <div>
        <CosmeticsDashboardHeader items={items} activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Panels — hidden/shown to keep all mounted (preserves refs & state) */}
        <div className={activeTab === 'create' ? '' : 'hidden'}>
          {address ? (
            <ItemBuilderPanel address={address} onCreated={load} startCollapsed={false} />
          ) : (
            <AdminWalletPlaceholder title="Create new item">
              Connect your admin wallet to add catalog items.
            </AdminWalletPlaceholder>
          )}
        </div>
        <div className={activeTab === 'variants' ? '' : 'hidden'}>
          <DreadlocksVariantReviewPanel
            voxelPainterRef={voxelPainterRef}
            startCollapsed={false}
            adminAddress={address ?? null}
            onStoreSync={load}
          />
        </div>
        <div className={activeTab === 'voxel' ? '' : 'hidden'}>
          {address ? (
            <VoxelPainterDashboardCard
              address={address}
              voxelPainterRef={voxelPainterRef}
              onCreated={load}
              startCollapsed={false}
            />
          ) : (
            <AdminWalletPlaceholder title="Voxel painter">
              Connect to paint overlays / backgrounds and save as shop items.
            </AdminWalletPlaceholder>
          )}
        </div>
        <div className={activeTab === 'features' ? '' : 'hidden'}>
          <AvatarFeaturePlacementEditor />
        </div>
        <div className={activeTab === 'pricing' ? '' : 'hidden'}>
          {address ? (
            <TierPricingPanel address={address} onUpdated={load} startCollapsed={false} />
          ) : (
            <AdminWalletPlaceholder title="Tier pricing defaults">
              Connect to bulk-update MORBIUS prices by tier.
            </AdminWalletPlaceholder>
          )}
        </div>
      </div>

      <CatalogSection
        address={address}
        items={items}
        loading={loading}
        error={error}
        search={search}
        onSearchChange={setSearch}
        applyFieldFilter={applyFieldFilter}
        onApplyFieldFilterChange={setApplyFieldFilter}
        tierFilter={tierFilter}
        onTierFilterChange={setTierFilter}
        onRefresh={load}
        sortedFiltered={sortedFiltered}
        editKey={editKey}
        editState={editState}
        setEditState={setEditState}
        saving={saving}
        saveError={saveError}
        toggleStoreBusyKey={toggleStoreBusyKey}
        onStartEdit={startEdit}
        onCancelEdit={cancelEdit}
        onSaveEdit={saveEdit}
        onToggleItemStoreVisibility={toggleItemStoreVisibility}
        onOpenOwners={(item) => setOwnersModal({ itemKey: item.itemKey, displayName: item.displayName })}
        onOpenGrant={(item) => setGrantModal({ itemKey: item.itemKey, displayName: item.displayName })}
      />

      {ownersModal && address && (
        <ItemOwnersModal
          itemKey={ownersModal.itemKey}
          displayName={ownersModal.displayName}
          adminAddress={address}
          onClose={() => setOwnersModal(null)}
        />
      )}
      {grantModal && address && (
        <GrantItemModal
          itemKey={grantModal.itemKey}
          displayName={grantModal.displayName}
          adminAddress={address}
          onClose={() => setGrantModal(null)}
          onGranted={load}
        />
      )}
    </div>
  );
}
