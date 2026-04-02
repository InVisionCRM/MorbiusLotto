'use client';

import React, { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Loader2, Package, Paintbrush } from 'lucide-react';
import { VoxelPainter, type VoxelPainterHandle } from '@/components/avatar';
import type { ItemTier } from '@/lib/cosmetics-catalog';
import { DASH_CARD, DASH_CARD_DIVIDER, DASH_CARD_TOGGLE, MORBIUS_PRICE, TIER_BADGE, TIERS } from '@/components/admin/cosmetics/shared';

export function VoxelPainterDashboardCard({
  address,
  voxelPainterRef,
  onCreated,
  startCollapsed = true,
}: {
  address: string;
  voxelPainterRef: React.RefObject<VoxelPainterHandle | null>;
  onCreated: () => void;
  startCollapsed?: boolean;
}) {
  const [open, setOpen] = useState(!startCollapsed);
  return (
    <div className={DASH_CARD}>
      <button type="button" className={DASH_CARD_TOGGLE} onClick={() => setOpen(o => !o)}>
        <Paintbrush className="text-cyan-400 shrink-0 mt-0.5" size={18} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-zinc-100">Voxel painter</div>
          <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
            48×56 grid — overlays &amp; backgrounds. Variant cards can send a preview here while collapsed.
          </p>
        </div>
        {open ? <ChevronUp size={16} className="text-zinc-500 shrink-0" /> : <ChevronDown size={16} className="text-zinc-500 shrink-0" />}
      </button>
      <div className={open ? `${DASH_CARD_DIVIDER} p-2` : 'hidden'} aria-hidden={!open}>
        <VoxelPainter ref={voxelPainterRef} address={address} onCreated={onCreated} />
      </div>
    </div>
  );
}

export function AdminWalletPlaceholder({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`${DASH_CARD} flex flex-col`}>
      <div className="px-4 py-3">
        <div className="text-sm font-semibold text-zinc-400">{title}</div>
        <p className="text-[11px] text-zinc-600 mt-1">{children}</p>
      </div>
    </div>
  );
}

const TIER_LABEL: Record<ItemTier, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  legendary: 'Legendary',
};

export function TierPricingPanel({
  address,
  onUpdated,
  startCollapsed = true,
}: {
  address: string;
  onUpdated: () => void;
  startCollapsed?: boolean;
}) {
  const [open, setOpen] = useState(!startCollapsed);
  const [prices, setPrices] = useState<Record<ItemTier, string>>({
    common: MORBIUS_PRICE.common.toString(),
    uncommon: MORBIUS_PRICE.uncommon.toString(),
    rare: MORBIUS_PRICE.rare.toString(),
    legendary: MORBIUS_PRICE.legendary.toString(),
  });
  const [busy, setBusy] = useState<ItemTier | null>(null);
  const [status, setStatus] = useState<{ tier: ItemTier; ok: boolean; msg: string } | null>(null);

  const apply = async (tier: ItemTier) => {
    const price = parseInt(prices[tier], 10);
    if (isNaN(price) || price <= 0) {
      setStatus({ tier, ok: false, msg: 'Invalid price' });
      return;
    }
    setBusy(tier);
    setStatus(null);
    try {
      const res = await fetch('/api/cosmetics/admin/tier-pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminAddress: address, tier, priceMorbius: price }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ tier, ok: false, msg: data.error ?? 'Failed' });
        return;
      }
      setStatus({
        tier,
        ok: true,
        msg: `Updated ${data.updatedCount} item${data.updatedCount !== 1 ? 's' : ''}`,
      });
      onUpdated();
    } catch {
      setStatus({ tier, ok: false, msg: 'Network error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={DASH_CARD}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={DASH_CARD_TOGGLE}
      >
        <Package size={18} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-semibold text-zinc-100">Tier pricing defaults</div>
          <p className="text-[11px] text-zinc-500 mt-0.5">Bulk-set MORBIUS price for all active items in a tier.</p>
        </div>
        {open ? <ChevronUp size={16} className="text-zinc-500 shrink-0" /> : <ChevronDown size={16} className="text-zinc-500 shrink-0" />}
      </button>

      {open && (
        <div className={`${DASH_CARD_DIVIDER} px-4 pb-4 pt-3 space-y-2`}>
          <p className="text-[11px] text-zinc-500 mb-3">
            Set a new MORBIUS price for <span className="font-semibold text-zinc-400">all active items</span> of a given tier at once.
          </p>
          {TIERS.map(tier => (
            <div key={tier} className="flex items-center gap-2">
              <span className={`w-24 shrink-0 inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase text-center ${TIER_BADGE[tier]}`}>
                {TIER_LABEL[tier]}
              </span>
              <input
                type="number"
                min="1"
                value={prices[tier]}
                onChange={e => setPrices(p => ({ ...p, [tier]: e.target.value }))}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-500 font-mono"
                placeholder="Price in MORBIUS"
              />
              <span className="text-xs text-zinc-500 shrink-0">MORBIUS</span>
              <button
                onClick={() => apply(tier)}
                disabled={busy === tier}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {busy === tier ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                Apply
              </button>
              {status?.tier === tier && (
                <span className={`text-[10px] shrink-0 ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                  {status.msg}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
