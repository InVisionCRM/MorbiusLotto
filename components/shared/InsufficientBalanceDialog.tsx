'use client';

import React from 'react';
import { Theme } from '@/lib/theme';

export interface InsufficientBalanceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Title — defaults to "Not Enough Chips". */
  title?: string;
  /** Message body. Falls back to a sensible default mentioning the required amount. */
  message?: string;
  /** Required amount, e.g. "5,000 MORBIUS". Used when message is not supplied. */
  required?: string;
  /** Current balance, e.g. "1,250 MORBIUS". Optional. */
  balance?: string;
  /** Label for the primary action — defaults to "Open Exchange". */
  actionLabel?: string;
  /** Custom handler. If omitted, dispatches "sophie:open_game_wallet" globally. */
  onOpenExchange?: () => void;
}

export function InsufficientBalanceDialog({
  isOpen,
  onClose,
  title = 'Not Enough Chips',
  message,
  required,
  balance,
  actionLabel = 'Open Exchange',
  onOpenExchange,
}: InsufficientBalanceDialogProps) {
  if (!isOpen) return null;

  const handleOpenExchange = () => {
    onClose();
    if (onOpenExchange) {
      onOpenExchange();
      return;
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sophie:open_game_wallet'));
    }
  };

  const defaultMessage = required
    ? `You need ${required} to enter, but your balance isn't enough yet. Top up your chips and you'll be ready to play.`
    : `Your chip balance isn't enough to enter. Top up from the exchange and try again.`;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-cyan-500/30 overflow-hidden shadow-2xl shadow-cyan-500/10"
        style={Theme.panel.base}
      >
        <div className="bg-gradient-to-r from-amber-600/90 to-orange-600/90 px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white truncate">{title}</h2>
            <p className="text-amber-50/90 text-xs truncate">Insufficient balance</p>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-gray-200 leading-relaxed">
            {message ?? defaultMessage}
          </p>

          {(required || balance) && (
            <div className="rounded-xl border border-white/10 bg-black/30 divide-y divide-white/8">
              {required && (
                <div className="flex items-center justify-between px-3.5 py-2.5">
                  <span className="text-xs text-gray-400">Required</span>
                  <span className="text-sm font-semibold text-yellow-300">{required}</span>
                </div>
              )}
              {balance && (
                <div className="flex items-center justify-between px-3.5 py-2.5">
                  <span className="text-xs text-gray-400">Your balance</span>
                  <span className="text-sm font-semibold text-white">{balance}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 pt-1 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold transition-colors"
          >
            Not Now
          </button>
          <button
            type="button"
            onClick={handleOpenExchange}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${Theme.cyan.gradient.button} ${Theme.cyan.gradient.buttonHover} text-white shadow-lg shadow-cyan-500/20`}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
