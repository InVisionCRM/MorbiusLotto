'use client';

/**
 * DropSheet — bottom sheet opened by the Pit Rail dock's DROP slot.
 * Weekly Drop essentials: status pill, pot, live countdown, your tickets +
 * entrant count, and a "View full details" CTA that closes the sheet and
 * scrolls to the full #weeklyDrop section.
 *
 * Open/close: toggles an `open` class on its own veil + panel — see nav.tsx.
 */

import React from 'react';
import { useCountdown } from './sections';

export interface DropSheetProps {
  open: boolean;
  onClose?: () => void;
  pot?: number;
  /** When provided, count down to this instant instead of next Sunday 8PM. */
  countdownTo?: Date;
  entries?: number;
  totalEntrants?: number | null;
  /** Status word for the kicker, e.g. 'Live'. */
  status?: string;
}

export function DropSheet({
  open,
  onClose,
  pot = 25000,
  countdownTo,
  entries,
  totalEntrants = null,
  status = 'Lighting soon',
}: DropSheetProps) {
  /* tick only while the sheet is visible */
  const cd = useCountdown(countdownTo?.getTime(), open);

  const viewDetails = () => {
    onClose?.();
    document.getElementById('weeklyDrop')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <div className={`sheet-veil${open ? ' open' : ''}`} aria-hidden={!open} onClick={onClose}></div>
      <div className={`sheet dropsheet${open ? ' open' : ''}`} aria-hidden={!open}>
        <div className="grab"></div>
        <div className="kick">Weekly Drop · {status}</div>
        <div className="ds-pot">{pot.toLocaleString('en-US')}</div>
        <div className="ds-unit">MORBIUS · top 3 win every Sunday · 8 PM ET</div>
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
                <b>{entries}</b> {entries === 1 ? 'entry' : 'entries'} — yours
              </span>
            )}
            {totalEntrants != null && (
              <span>
                <b>{totalEntrants.toLocaleString('en-US')}</b> {totalEntrants === 1 ? 'player' : 'players'} entered
              </span>
            )}
          </div>
        )}
        <button type="button" className="btn-steel ds-cta" onClick={viewDetails}>
          <span>View full details</span>
          <i>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </i>
        </button>
      </div>
    </>
  );
}
