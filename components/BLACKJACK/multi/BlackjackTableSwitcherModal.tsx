'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { BJMultiTableSummary } from '@/lib/websocket-client';
import type { TableProfileData } from '@/hooks/use-blackjack-tables';

const DEFAULT_TOKEN_LOGO = '/morbius/MorbiusLogo (3).png';
const DEFAULT_TOKEN_TICKER = 'MORBIUS';

const PANEL_STYLE = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.95), rgba(40, 40, 40, 0.9))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px solid rgba(34, 211, 238, 0.3)',
} as const;

function statusLabel(status: string): string {
  switch (status) {
    case 'waiting': return 'Open';
    case 'betting': return 'Betting';
    case 'playing': return 'In Play';
    case 'dealer_turn': return 'Dealer';
    case 'completed': return 'Round End';
    default: return status;
  }
}

function formatThousands(n: number): string {
  return n.toLocaleString('en-US');
}

function weiToWhole(wei: string): number {
  try {
    const n = BigInt(wei);
    return Number(n / 10n ** 18n);
  } catch {
    return 0;
  }
}

export interface BlackjackTableSwitcherModalProps {
  open: boolean;
  onClose: () => void;
  currentTableId: string;
  getTableProfile: (kind: 'image' | 'video', id: string) => TableProfileData | null;
}

export function BlackjackTableSwitcherModal({
  open,
  onClose,
  currentTableId,
  getTableProfile,
}: BlackjackTableSwitcherModalProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [tables, setTables] = useState<BJMultiTableSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/bj-multi/admin/tables')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load'))))
      .then((data: { tables?: BJMultiTableSummary[] }) => {
        if (cancelled) return;
        setTables(Array.isArray(data.tables) ? data.tables : []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load tables');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open]);

  const otherTables = useMemo(
    () => tables.filter((t) => t.id !== currentTableId),
    [tables, currentTableId],
  );

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl flex flex-col"
        style={PANEL_STYLE}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Switch table"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div>
            <h2 className="text-lg font-semibold text-cyan-300">Switch table</h2>
            <p className="text-xs text-white/50 mt-0.5">Hop to another table — token logo updates instantly.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-md transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {loading && (
            <div className="text-center text-white/50 text-sm py-10">Loading tables…</div>
          )}
          {error && !loading && (
            <div className="text-center text-red-400/80 text-sm py-10">{error}</div>
          )}
          {!loading && !error && otherTables.length === 0 && (
            <div className="text-center text-white/50 text-sm py-10">
              No other tables right now.
            </div>
          )}
          {!loading && !error && otherTables.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {otherTables.map((t) => {
                const profile = getTableProfile(t.themeKind, t.themeId);
                const logo = profile?.logo_url && profile.logo_url.trim() !== '' ? profile.logo_url : DEFAULT_TOKEN_LOGO;
                const ticker = profile?.ticker && profile.ticker.trim() !== '' ? profile.ticker : DEFAULT_TOKEN_TICKER;
                const name = profile?.name ?? null;
                const min = weiToWhole(t.minBet);
                const max = weiToWhole(t.maxBet);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      onClose();
                      router.push(`/blackjack-multi/${t.id}`);
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/10 hover:border-cyan-400/40 hover:bg-cyan-400/5 transition-colors text-left min-w-0"
                  >
                    <div className="relative w-10 h-10 shrink-0 rounded-full overflow-hidden border border-white/15 bg-slate-900/70">
                      <Image
                        src={logo}
                        alt={ticker}
                        fill
                        className="object-contain"
                        sizes="40px"
                        unoptimized
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-white text-sm font-bold truncate">{ticker}</span>
                        {name && <span className="text-white/45 text-[11px] truncate">{name}</span>}
                      </div>
                      <div className="text-[11px] text-white/55 font-poppins tabular-nums truncate">
                        {formatThousands(min)}–{formatThousands(max)} · {statusLabel(t.status)} · {t.seatedCount}/3
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 px-4 py-2.5 flex items-center justify-end">
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push('/blackjack-multi');
            }}
            className="text-cyan-300/80 hover:text-cyan-300 text-xs font-medium transition-colors"
          >
            Browse all tables →
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default BlackjackTableSwitcherModal;
