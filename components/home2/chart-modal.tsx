'use client';

/**
 * ChartModal — full MORBIUS/WPLS chart in a modal, powered by GeckoTerminal's
 * TradingView-based pool embed. Opened from the Vault price stat and the
 * sidebar "Swap · LP · Chart" row. Escape or overlay click closes it.
 * Styles live in app/home2.css under `.home2 .home2-chart-modal`.
 */

import React, { useEffect } from 'react';
import { WPLS_MORBIUS_PAIR } from '@/lib/contracts';
import { useMorbiusChart } from '@/hooks/use-morbius-chart';

const EMBED_SRC = `https://www.geckoterminal.com/pulsechain/pools/${WPLS_MORBIUS_PAIR}?embed=1&info=0&swaps=0`;

export interface ChartModalProps {
  open: boolean;
  onClose: () => void;
}

export function ChartModal({ open, onClose }: ChartModalProps) {
  const { data } = useMorbiusChart();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  /* live daily change — last close vs previous daily close */
  let change: { pct: number; up: boolean } | null = null;
  if (data && data.length >= 2) {
    const prev = data[data.length - 2].c;
    const last = data[data.length - 1].c;
    if (prev > 0) {
      const pct = ((last - prev) / prev) * 100;
      change = { pct, up: pct >= 0 };
    }
  }

  return (
    <div
      className="home2-chart-modal"
      role="dialog"
      aria-modal="true"
      aria-label="MORBIUS price chart"
      onClick={onClose}
    >
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <b>MORBIUS / WPLS · PulseX</b>
          {change && (
            <span className={`chg ${change.up ? 'up' : 'down'}`}>
              {change.up ? '▲' : '▼'} {change.pct >= 0 ? '+' : ''}
              {change.pct.toFixed(1)}% 24h
            </span>
          )}
          <button type="button" className="x" onClick={onClose} aria-label="Close chart">
            ✕
          </button>
        </div>
        <iframe
          src={EMBED_SRC}
          title="MORBIUS chart"
          style={{ width: '100%', height: '100%', border: 0 }}
          allow="clipboard-write"
        />
      </div>
    </div>
  );
}
