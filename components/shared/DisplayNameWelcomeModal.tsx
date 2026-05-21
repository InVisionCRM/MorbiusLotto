'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useProfile } from '@/hooks/use-player-profile';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';

const SESSION_DISMISS_KEY = 'displayNameWelcome:dismissedFor';

function readDismissedAddress(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(SESSION_DISMISS_KEY);
  } catch {
    return null;
  }
}

function markDismissed(address: string) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_DISMISS_KEY, address.toLowerCase());
  } catch {
    /* ignore */
  }
}

export interface DisplayNameWelcomeModalProps {
  wsClient: BlackjackWebSocketClient | null;
  wsConnected: boolean;
  /** Optional friendly context — appears below the title. Default reads "you're about to sit down". */
  hint?: string;
}

/**
 * One-time-per-session friendly prompt that appears when a wallet-connected
 * player lands on a game table without a display name set. Asks "what should
 * people call you?" and persists via the websocket setDisplayName flow.
 */
export function DisplayNameWelcomeModal({ wsClient, wsConnected, hint }: DisplayNameWelcomeModalProps) {
  const { address } = useAccount();
  const { profileDisplayName, isLoading } = useProfile();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasName = (profileDisplayName?.trim().length ?? 0) > 0;

  useEffect(() => {
    if (!address || !wsConnected || isLoading || hasName) return;
    if (readDismissedAddress() === address.toLowerCase()) return;
    setOpen(true);
  }, [address, wsConnected, isLoading, hasName]);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  const dismiss = () => {
    if (address) markDismissed(address);
    setOpen(false);
    setError(null);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 3 || trimmed.length > 32) {
      setError('Name must be 3–32 characters.');
      return;
    }
    if (!wsClient?.isConnected()) {
      setError('Not connected — try again in a moment.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await wsClient.setDisplayName(trimmed);
      if (address) {
        await queryClient.invalidateQueries({ queryKey: ['playerProfile', address] });
        markDismissed(address);
      }
      setOpen(false);
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save name.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismiss}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="display-name-welcome-title"
            className="w-full max-w-sm rounded-2xl border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 p-5 shadow-2xl"
            initial={{ y: 16, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 8, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 25, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="display-name-welcome-title" className="text-lg font-semibold text-white">
              Hey, what should people call you?
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {hint ?? "You're about to sit down at the table — pick a display name so other players know who you are."}
            </p>
            <div className="mt-4">
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value.slice(0, 32));
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim().length >= 3 && !saving) {
                    e.preventDefault();
                    void handleSave();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    dismiss();
                  }
                }}
                placeholder="Your display name (3–32 characters)"
                maxLength={32}
                className="w-full rounded-xl border border-cyan-500/30 bg-slate-950/60 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
              {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={dismiss}
                disabled={saving}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-medium text-slate-200 hover:bg-white/10 disabled:opacity-50"
              >
                Maybe later
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || name.trim().length < 3}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save name'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
