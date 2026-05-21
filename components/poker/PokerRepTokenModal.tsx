'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Trash2 } from 'lucide-react';
import { Prc20TokenPicker, type SelectedPrc20Token } from '@/components/shared/Prc20TokenPicker';
import type { PokerRepToken } from '@/hooks/use-poker-rep-token';

export interface PokerRepTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Token currently set on the badge (or null if empty). */
  currentToken: PokerRepToken | null;
  /** Called when the user selects a token in the picker. */
  onSelect: (token: PokerRepToken) => void;
  /** Called when the user clears the current rep token. */
  onClear: () => void;
}

export function PokerRepTokenModal({
  isOpen,
  onClose,
  currentToken,
  onSelect,
  onClear,
}: PokerRepTokenModalProps) {
  // Local controlled value for the picker. Initialized from currentToken so the
  // chip+clear UI shows immediately, but we treat any change as a "new pick"
  // and propagate it to the parent.
  const [picked, setPicked] = useState<SelectedPrc20Token | null>(
    currentToken
      ? {
          address: currentToken.address,
          name: currentToken.name,
          symbol: currentToken.symbol,
          decimals: 18,
          logoUrl: currentToken.logoUrl,
        }
      : null,
  );

  // Reset local state whenever the modal opens.
  React.useEffect(() => {
    if (isOpen) {
      setPicked(
        currentToken
          ? {
              address: currentToken.address,
              name: currentToken.name,
              symbol: currentToken.symbol,
              decimals: 18,
              logoUrl: currentToken.logoUrl,
            }
          : null,
      );
    }
  }, [isOpen, currentToken]);

  const handlePickerChange = (token: SelectedPrc20Token | null) => {
    setPicked(token);
    if (token) {
      onSelect({
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        logoUrl: token.logoUrl,
      });
    }
  };

  const handleClear = () => {
    setPicked(null);
    onClear();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="rep-token-backdrop"
            className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              key="rep-token-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="poker-rep-token-title"
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="pointer-events-auto relative w-full max-w-md rounded-2xl overflow-hidden border-2 border-cyan-500/30 shadow-2xl shadow-cyan-500/10"
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
                      id="poker-rep-token-title"
                      className="text-white"
                      style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 600, fontSize: 22, letterSpacing: '-0.01em' }}
                    >
                      Choose your rep token
                    </h2>
                    <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                      Pick any PulseChain token and its logo will show up as your{' '}
                      <span className="text-cyan-300 font-semibold">REP</span> badge on your avatar.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="relative px-6 py-5 space-y-4">
                <Prc20TokenPicker
                  value={picked}
                  onChange={handlePickerChange}
                  placeholder="Search PulseChain tokens or paste 0x…"
                  inputClassName="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/15 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/50 transition-colors"
                  resultsClassName="mt-2 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-black/60 divide-y divide-white/[0.05]"
                />

                {currentToken && (
                  <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
                    <div className="text-[11px] text-slate-500 font-mono tracking-wider">
                      Linked: <span className="text-slate-300">{currentToken.symbol}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleClear}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-rose-300 border border-rose-500/30 hover:border-rose-400/60 hover:text-rose-200 transition-colors"
                    >
                      <Trash2 size={12} />
                      Remove rep token
                    </button>
                  </div>
                )}
              </div>

              {/* Footer hint */}
              <div className="relative px-6 py-3 border-t border-white/[0.06] bg-black/20">
                <p className="text-[10px] text-slate-500 font-mono tracking-wider">
                  Token data via <span className="text-slate-400">scan.pulsechain.com</span>
                  <span className="mx-1.5 text-slate-700">·</span>
                  logo fallback via <span className="text-slate-400">dexscreener</span>
                </p>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
