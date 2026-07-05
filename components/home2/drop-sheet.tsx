'use client';

/**
 * DropSheet — bottom sheet opened by the Pit Rail dock's DROP slot.
 * Weekly Drop essentials: status pill, pot, live countdown, your tickets +
 * entrant count, and a "View full details" CTA that closes the sheet and
 * scrolls to the full #weeklyDrop section.
 *
 * Open/close: toggles an `open` class on its own veil + panel — see nav.tsx.
 */

import React, { useEffect, useState } from 'react';
import { nextSundayDropUtc } from '@/lib/weekly-drop-time';

export interface DropSheetProps {
  open: boolean;
  onClose?: () => void;
  pot?: number;
  /** When provided, count down to this instant instead of next Sunday 8PM. */
  countdownTo?: Date;
  entries?: number;
  totalEntrants?: number | null;
  statusPill?: string;
}

/* same fallback as sections.tsx WeeklyDrop — next Sunday 20:00 */
/* Fallback drop time: next Sunday 8 PM Eastern (DST-aware), matching the
 * backend. Only used when the server's closesAt hasn't loaded yet. */
const nextDrop = nextSundayDropUtc;

export function DropSheet({
  open,
  onClose,
  pot = 25000,
  countdownTo,
  entries,
  totalEntrants = null,
  statusPill = '🎟 LIGHTING SOON',
}: DropSheetProps) {
  const countdownMs = countdownTo?.getTime();
  const [cd, setCd] = useState({ d: '0', h: '00', m: '00', s: '00' });

  /* tick only while the sheet is visible */
  useEffect(() => {
    if (!open) return;
    function tick() {
      let ms = Math.max(0, (countdownMs ?? nextDrop().getTime()) - Date.now());
      const day = Math.floor(ms / 86400000);
      ms -= day * 86400000;
      const hr = Math.floor(ms / 3600000);
      ms -= hr * 3600000;
      const mi = Math.floor(ms / 60000);
      ms -= mi * 60000;
      const se = Math.floor(ms / 1000);
      setCd({
        d: String(day),
        h: String(hr).padStart(2, '0'),
        m: String(mi).padStart(2, '0'),
        s: String(se).padStart(2, '0'),
      });
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [countdownMs, open]);

  const viewDetails = () => {
    onClose?.();
    document.getElementById('weeklyDrop')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <div className={`sheet-veil${open ? ' open' : ''}`} aria-hidden={!open} onClick={onClose}></div>
      <div className={`sheet dropsheet${open ? ' open' : ''}`} aria-hidden={!open}>
        <div className="grab"></div>
        <div className="ds-pill">{statusPill}</div>
        <div className="ds-pot">{pot.toLocaleString('en-US')}</div>
        <div className="ds-unit">MORBIUS · TOP 3 WIN EVERY SUNDAY · 8PM ET</div>
        <div className="ds-count">
          <div className="cb">
            <b>{cd.d}</b>
            <span>DAYS</span>
          </div>
          <div className="cb">
            <b>{cd.h}</b>
            <span>HOURS</span>
          </div>
          <div className="cb">
            <b>{cd.m}</b>
            <span>MIN</span>
          </div>
          <div className="cb">
            <b>{cd.s}</b>
            <span>SEC</span>
          </div>
        </div>
        {(entries != null || totalEntrants != null) && (
          <div className="ds-meta">
            {entries != null && (
              <span>
                🎟 <b>{entries}</b> {entries === 1 ? 'entry' : 'entries'} — yours
              </span>
            )}
            {totalEntrants != null && (
              <span>
                <b>{totalEntrants.toLocaleString('en-US')}</b> {totalEntrants === 1 ? 'player' : 'players'} entered
              </span>
            )}
          </div>
        )}
        <button type="button" className="ds-cta" onClick={viewDetails}>
          View full details
        </button>
      </div>
    </>
  );
}
