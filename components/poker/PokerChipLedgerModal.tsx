'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { usePokerChipLedger, type PokerChipLedgerCategory } from '@/hooks/use-poker-chip-ledger';
import { ledgerDisplay, formatRelativeTime, formatDelta } from '@/lib/poker-chip-ledger-display';
import { formatChips } from '@/lib/format-poker-chips';
import { LedgerDirectionIcon } from './LedgerDirectionIcon';

export interface PokerChipLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  address: string | null;
}

const PAGE_SIZE = 25;

const CATEGORIES: Array<{ id: PokerChipLedgerCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'cash', label: 'Cash tables' },
  { id: 'tournaments', label: 'Tournaments' },
  { id: 'exchanges', label: 'Exchanges' },
];

export function PokerChipLedgerModal({ isOpen, onClose, address }: PokerChipLedgerModalProps) {
  const [category, setCategory] = useState<PokerChipLedgerCategory>('all');
  const [page, setPage] = useState(0);

  // Reset to page 0 whenever the filter changes.
  React.useEffect(() => { setPage(0); }, [category]);
  // Reset to first page each time the modal opens.
  React.useEffect(() => { if (isOpen) setPage(0); }, [isOpen]);

  const { data, isLoading, isError } = usePokerChipLedger({
    address: isOpen ? address : null,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    category,
    refetchInterval: false,
  });

  const total = data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const showingFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min((page + 1) * PAGE_SIZE, total);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="ledger-backdrop"
            className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              key="ledger-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="poker-ledger-title"
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="pointer-events-auto relative w-full max-w-3xl max-h-[90vh] rounded-2xl overflow-hidden border-2 border-cyan-500/30 shadow-2xl shadow-cyan-500/10 flex flex-col"
              style={{ background: 'linear-gradient(155deg, #0c1929 0%, #0a0f1a 50%, #0d1117 100%)' }}
            >
              <div
                className="absolute inset-x-0 top-0 h-px"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.55), transparent)' }}
                aria-hidden
              />

              {/* Header */}
              <div className="relative px-6 pt-5 pb-4 border-b border-white/[0.06]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2
                      id="poker-ledger-title"
                      className="text-white"
                      style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 600, fontSize: 22, letterSpacing: '-0.01em' }}
                    >
                      Transaction history
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 font-mono tracking-wider">
                      {total.toLocaleString()} {total === 1 ? 'event' : 'events'} · all-time chip ledger
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Filters */}
                <div className="mt-4 flex gap-1.5 flex-wrap">
                  {CATEGORIES.map((c) => {
                    const active = category === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCategory(c.id)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-colors ${
                          active
                            ? 'bg-cyan-500/[0.15] border border-cyan-400/40 text-cyan-200'
                            : 'border border-white/[0.12] text-slate-400 hover:text-white hover:border-white/25'
                        }`}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Body */}
              <div className="relative flex-1 overflow-y-auto px-6 py-4">
                {!address ? (
                  <EmptyMessage text="Connect your wallet to see your ledger." />
                ) : isLoading ? (
                  <EmptyMessage text="Loading…" />
                ) : isError ? (
                  <EmptyMessage text="Could not load ledger. Try again in a moment." />
                ) : !data || data.entries.length === 0 ? (
                  <EmptyMessage text={`No ${category === 'all' ? 'events' : category} yet.`} />
                ) : (
                  <div>
                    {/* Table header (desktop only) */}
                    <div className="hidden md:grid grid-cols-[52px_1fr_1fr_120px_120px] gap-3 pb-2 mb-1 border-b border-white/[0.06] text-[9px] uppercase tracking-[0.2em] text-slate-500 font-semibold">
                      <div />
                      <div>Event</div>
                      <div>Reference</div>
                      <div className="text-right">Delta</div>
                      <div className="text-right">Balance after</div>
                    </div>

                    {data.entries.map((entry) => {
                      const d = ledgerDisplay(entry);
                      const { display: deltaText, isCredit } = formatDelta(entry.delta);
                      let balanceAfter = '—';
                      try {
                        balanceAfter = formatChips(BigInt(entry.balanceAfter));
                      } catch { /* ignore */ }
                      return (
                        <div
                          key={entry.id}
                          className="grid grid-cols-1 md:grid-cols-[52px_1fr_1fr_120px_120px] gap-2 md:gap-3 py-3 border-b border-white/[0.05] items-center"
                        >
                          <div className="flex md:block">
                            <LedgerDirectionIcon direction={d.direction} size="md" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[13px] text-white font-medium leading-tight">{d.label}</div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">{d.meta}</div>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono leading-tight">
                            <div>{formatRelativeTime(entry.createdAt)}</div>
                            {entry.refId && <div className="text-slate-600 mt-0.5">{shortId(entry.refId)}</div>}
                          </div>
                          <div
                            className={`text-right tabular-nums ${isCredit ? 'text-emerald-300' : 'text-rose-300'}`}
                            style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em' }}
                          >
                            {deltaText}
                          </div>
                          <div className="text-right text-xs text-slate-300 font-mono tabular-nums">{balanceAfter}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="relative px-6 py-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
                <div className="text-[11px] text-slate-500 font-mono tracking-wider">
                  Showing {showingFrom}–{showingTo} of {total.toLocaleString()}
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1.5 rounded-md border border-white/[0.12] text-[11px] text-slate-300 hover:border-white/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                    disabled={page >= lastPage}
                    className="px-3 py-1.5 rounded-md border border-white/[0.12] text-[11px] text-slate-300 hover:border-white/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <div className="py-12 text-center text-sm text-slate-500 font-mono tracking-wider">
      {text}
    </div>
  );
}

function shortId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}
