'use client';

import React from 'react';
import { ExternalLink, LayoutGrid, Package, Paintbrush, Plus } from 'lucide-react';
import { DASH_CARD } from '@/components/admin/cosmetics/shared';
import type { ItemRow } from '@/components/admin/cosmetics/types';

export type ActiveToolTab = 'create' | 'variants' | 'voxel' | 'features' | 'pricing';

export function CosmeticsDashboardHeader({
  items,
  activeTab,
  onTabChange,
}: {
  items: ItemRow[];
  activeTab: ActiveToolTab;
  onTabChange: (tab: ActiveToolTab) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`${DASH_CARD} px-5 py-4`}>
          <div className="text-2xl font-bold tabular-nums text-zinc-100">{items.length}</div>
          <div className="text-xs text-zinc-500 mt-1">Total Items</div>
        </div>
        <div className={`${DASH_CARD} px-5 py-4`}>
          <div className="text-2xl font-bold tabular-nums text-emerald-400">{items.filter(i => i.shopListed).length}</div>
          <div className="text-xs text-zinc-500 mt-1">Listed in Store</div>
        </div>
        <div className={`${DASH_CARD} px-5 py-4`}>
          <div className="text-2xl font-bold tabular-nums text-cyan-400">{items.reduce((s, i) => s + i.mintedCount, 0).toLocaleString()}</div>
          <div className="text-xs text-zinc-500 mt-1">Total Minted</div>
        </div>
        <div className={`${DASH_CARD} px-5 py-4`}>
          <div className="text-2xl font-bold tabular-nums text-amber-400">{items.filter(i => i.tier === 'legendary').length}</div>
          <div className="text-xs text-zinc-500 mt-1">Legendary Items</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-px scrollbar-none">
        {([
          { key: 'create' as const, label: 'Create Item', Icon: Plus, active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
          { key: 'variants' as const, label: 'Variant Review', Icon: LayoutGrid, active: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
          { key: 'voxel' as const, label: 'Voxel Painter', Icon: Paintbrush, active: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
          { key: 'features' as const, label: 'Feature Placement', Icon: ExternalLink, active: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30' },
          { key: 'pricing' as const, label: 'Tier Pricing', Icon: Package, active: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap border ${
              activeTab === tab.key
                ? `${tab.active} shadow-sm`
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] border-transparent'
            }`}
          >
            <tab.Icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>
    </>
  );
}
