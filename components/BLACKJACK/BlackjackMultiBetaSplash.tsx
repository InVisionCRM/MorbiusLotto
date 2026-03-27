'use client';

import React, { useEffect, useState } from 'react';
import { POKER_BETA_TELEGRAM_URL, POKER_BETA_X_URL } from '@/components/poker/PokerBetaSplash';

/** Same session: dismissed once applies to /blackjack-multi and /blackjack-multi/[tableId]. */
const SESSION_ACK_KEY = 'morbius-bj-multi-beta-splash-ack-v1';

/**
 * Full-screen notice that Multi Player Blackjack is in beta; user must acknowledge before playing.
 * Shown once per browser session until dismissed.
 */
export function BlackjackMultiBetaSplash() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(SESSION_ACK_KEY)) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    try {
      sessionStorage.setItem(SESSION_ACK_KEY, '1');
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bj-multi-beta-splash-title"
      aria-describedby="bj-multi-beta-splash-desc"
    >
      <div
        className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
        style={{ boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)' }}
      >
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.12),transparent_55%)]" />
        <div className="relative px-5 sm:px-7 pt-6 sm:pt-8 pb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400/90 mb-2">Beta</p>
          <h2 id="bj-multi-beta-splash-title" className="text-xl sm:text-2xl font-bold text-white mb-3">
            Multi Player Blackjack is in beta
          </h2>
          <div id="bj-multi-beta-splash-desc" className="text-slate-300 text-sm leading-relaxed space-y-3">
            <p>
              You may run into bugs or rough edges while we polish the experience. If something breaks or feels
              off, please tell us — it helps a lot.
            </p>
            <p>
              <span className="text-slate-200 font-medium">Fastest response:</span>{' '}
              report bugs on{' '}
              <a
                href={POKER_BETA_TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
              >
                Telegram
              </a>
              . You can also @ us or DM us on{' '}
              <a
                href={POKER_BETA_X_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
              >
                X
              </a>
              .
            </p>
            <p className="text-slate-400 text-sm">Thank you for playing and for your support.</p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="mt-6 w-full px-4 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-2 focus:ring-offset-slate-900"
            style={{
              background: 'linear-gradient(to right, rgb(8 145 178), rgb(37 99 235))',
              boxShadow: '0 2px 12px rgba(34, 211, 238, 0.25)',
            }}
          >
            I have read this — continue to Multi Player Blackjack
          </button>
        </div>
      </div>
    </div>
  );
}
