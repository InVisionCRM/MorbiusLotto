'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { useProfile } from './use-player-profile';

type SetDisplayNameFn = (name: string) => Promise<unknown> | void;

/**
 * Just-in-time display-name prompt. Wraps a "send"-style action so the user
 * is asked to pick a display name at the moment their name first matters
 * (sending chat, sitting down, etc.) instead of being nagged up front.
 *
 * Usage:
 *   const { gate, prompt, openPrompt } = useDisplayNameGate(setDisplayName);
 *   const handleSend = () => {
 *     if (gate(() => sendMessage(text))) return;
 *     sendMessage(text);
 *   };
 *   return <>{prompt}{...rest}</>;
 */
export function useDisplayNameGate(setDisplayName: SetDisplayNameFn | undefined | null) {
  const { address } = useAccount();
  const { profileDisplayName } = useProfile();
  const queryClient = useQueryClient();
  const hasDisplayName = (profileDisplayName?.trim().length ?? 0) > 0;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && hasPending) inputRef.current?.focus();
  }, [open, hasPending]);

  const cancel = useCallback(() => {
    setOpen(false);
    setName('');
    setHasPending(false);
    pendingActionRef.current = null;
  }, []);

  const save = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed.length < 3 || trimmed.length > 32 || saving || !setDisplayName) return;
    setSaving(true);
    try {
      await setDisplayName(trimmed);
      if (address) {
        await queryClient.invalidateQueries({ queryKey: ['playerProfile', address] });
      }
      const pending = pendingActionRef.current;
      pendingActionRef.current = null;
      setHasPending(false);
      setOpen(false);
      setName('');
      pending?.();
    } catch {
      // surfaced upstream by setDisplayName
    } finally {
      setSaving(false);
    }
  }, [name, saving, setDisplayName, address, queryClient]);

  const gate = useCallback(
    (onProceed: () => void): boolean => {
      if (hasDisplayName || !address || !setDisplayName) return false;
      pendingActionRef.current = onProceed;
      setHasPending(true);
      setOpen(true);
      return true;
    },
    [hasDisplayName, address, setDisplayName],
  );

  const openPrompt = useCallback(() => {
    pendingActionRef.current = null;
    setHasPending(false);
    setOpen(true);
  }, []);

  const prompt = open ? (
    <div className="mt-1 flex flex-col gap-1">
      {hasPending && (
        <p className="text-[11px] text-cyan-300/85">
          Pick a display name to continue.
        </p>
      )}
      <div className="flex gap-2 items-center flex-wrap">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim().length >= 3 && !saving) {
              e.preventDefault();
              void save();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          placeholder="Display name (3–32 chars)"
          maxLength={32}
          className="flex-1 min-w-[120px] rounded-lg px-2 py-1.5 text-xs border border-white/20 bg-white/10 text-white placeholder:text-white/45 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={name.trim().length < 3 || saving}
          className="px-2 py-1.5 rounded-lg text-xs font-medium shrink-0 bg-gradient-to-r from-cyan-600 to-cyan-700 text-white border border-cyan-500/40 disabled:opacity-40"
        >
          {saving ? '…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={cancel}
          className="px-2 py-1.5 rounded-lg text-xs shrink-0 text-white/60 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  ) : null;

  return { hasDisplayName, gate, openPrompt, prompt };
}
