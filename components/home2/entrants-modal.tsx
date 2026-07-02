'use client';

/**
 * EntrantsModal — who's in this week's Weekly Drop. Opened from the
 * "View entrants" link under the jackpot's jp-you card. Fetches
 * GET /api/drop/entrants only while open (useWeeklyDropEntrants). Follows the
 * ChartModal overlay pattern (Escape / overlay click closes); styles live in
 * app/home2.css under `.home2 .home2-entrants-modal`.
 */

import React, { useEffect } from 'react';
import { useWeeklyDropEntrants } from '@/hooks/use-weekly-drop';

/** Same visual family as the winner avatar circles (radial highlight top-left). */
const ENTRANT_GRADIENTS = [
  'radial-gradient(circle at 32% 28%,#fde68a,#f59e0b)',
  'radial-gradient(circle at 32% 28%,#a5f3fc,#0891b2)',
  'radial-gradient(circle at 32% 28%,#c4b5fd,#7c3aed)',
  'radial-gradient(circle at 32% 28%,#a7f3d0,#059669)',
  'radial-gradient(circle at 32% 28%,#fecaca,#dc2626)',
  'radial-gradient(circle at 32% 28%,#fbcfe8,#db2777)',
];

function gradientFor(address: string): string {
  // Deterministic per wallet so an entrant keeps their color between opens.
  let h = 0;
  for (let i = 2; i < Math.min(address.length, 10); i++) h = (h * 31 + address.charCodeAt(i)) | 0;
  return ENTRANT_GRADIENTS[Math.abs(h) % ENTRANT_GRADIENTS.length];
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export interface EntrantsModalProps {
  open: boolean;
  onClose: () => void;
}

export function EntrantsModal({ open, onClose }: EntrantsModalProps) {
  const { data, isLoading } = useWeeklyDropEntrants(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const entrants = data?.entrants ?? [];

  return (
    <div
      className="home2-entrants-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Weekly Drop entrants"
      onClick={onClose}
    >
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <b>🎟 THIS WEEK&apos;S ENTRANTS</b>
          {data && (
            <span className="count">
              {data.totalEntrants.toLocaleString('en-US')} players · {data.totalEntries.toLocaleString('en-US')}{' '}
              entries
            </span>
          )}
          <button type="button" className="x" onClick={onClose} aria-label="Close entrants">
            ✕
          </button>
        </div>
        <div className="body">
          {isLoading && <div className="empty">Loading entrants…</div>}
          {!isLoading && entrants.length === 0 && (
            <div className="empty">No entries yet — every 1,000 MORBIUS played is a ticket.</div>
          )}
          {entrants.map((e, i) => {
            const name = e.displayName ?? shortAddress(e.address);
            return (
              <div className="row" key={e.address}>
                <span className="rank">#{i + 1}</span>
                <span className="av" style={{ background: gradientFor(e.address) }}>
                  {(name[0] ?? '?').toUpperCase()}
                </span>
                <span className="name" title={e.address}>
                  {name}
                </span>
                <b className="tix">
                  {e.entries.toLocaleString('en-US')} {e.entries === 1 ? 'entry' : 'entries'}
                </b>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
