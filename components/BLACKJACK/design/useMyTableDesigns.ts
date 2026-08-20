'use client';

/**
 * useMyTableDesigns — Create-A-Table saves for the connected wallet.
 *
 * Separate from useTablePublish on purpose. That hook writes a theme onto an
 * existing multiplayer table through the admin API, which only admins can do;
 * this one is the player-facing half — anyone who can sign in gets their own
 * saved designs, and saving here never touches a live table.
 *
 * Auth is the ordinary session: apiFetch turns a 401 into a sign-in prompt and
 * retries once, so nothing here has to orchestrate SIWE itself.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { apiFetch } from '@/lib/api-auth';
import type { BlackjackTableThemeConfig } from '@/lib/blackjack-table-theme';

export interface SavedTableDesign {
  id: string;
  slug: string;
  owner_address: string;
  name: string;
  design: BlackjackTableThemeConfig;
  status: 'saved' | 'published' | 'disabled';
  created_at: string;
  updated_at: string;
}

export type DesignStatus =
  | { kind: 'idle' }
  | { kind: 'busy'; note: string }
  | { kind: 'ok'; note: string }
  | { kind: 'error'; note: string };

/** Pull the server's message out of a failed response, falling back to the code. */
async function errNote(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body?.error) return String(body.error);
  } catch { /* non-JSON error body */ }
  return `${fallback} (${res.status})`;
}

export function useMyTableDesigns() {
  const { address, isConnected } = useAccount();
  const [designs, setDesigns] = useState<SavedTableDesign[]>([]);
  const [status, setStatus] = useState<DesignStatus>({ kind: 'idle' });
  /** The design the studio is currently editing, so Save overwrites it. */
  const [activeSlug, setActiveSlug] = useState<string>('');

  const refresh = useCallback(async () => {
    if (!isConnected) { setDesigns([]); return; }
    try {
      const res = await apiFetch('/api/table-designs/mine');
      if (!res.ok) {
        // A signed-out visitor is the normal case, not an error worth shouting
        // about — the panel just shows the connect prompt instead.
        if (res.status === 401) { setDesigns([]); return; }
        setStatus({ kind: 'error', note: await errNote(res, 'could not load your tables') });
        return;
      }
      const data = await res.json();
      setDesigns(Array.isArray(data?.designs) ? data.designs : []);
    } catch {
      setStatus({ kind: 'error', note: 'could not reach the server' });
    }
  }, [isConnected]);

  useEffect(() => { void refresh(); }, [refresh]);

  /** Save a new design. Returns the created row, or null when it failed. */
  const create = useCallback(async (name: string, design: BlackjackTableThemeConfig) => {
    setStatus({ kind: 'busy', note: 'Saving…' });
    try {
      const res = await apiFetch('/api/table-designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, design }),
      });
      if (!res.ok) {
        setStatus({ kind: 'error', note: await errNote(res, 'save failed') });
        return null;
      }
      const row: SavedTableDesign = await res.json();
      setActiveSlug(row.slug);
      await refresh();
      setStatus({ kind: 'ok', note: `Saved “${row.name}”.` });
      return row;
    } catch {
      setStatus({ kind: 'error', note: 'could not reach the server' });
      return null;
    }
  }, [refresh]);

  /** Overwrite an existing design. */
  const update = useCallback(async (slug: string, name: string, design: BlackjackTableThemeConfig) => {
    setStatus({ kind: 'busy', note: 'Saving…' });
    try {
      const res = await apiFetch(`/api/table-designs/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, design }),
      });
      if (!res.ok) {
        setStatus({ kind: 'error', note: await errNote(res, 'save failed') });
        return null;
      }
      const row: SavedTableDesign = await res.json();
      await refresh();
      setStatus({ kind: 'ok', note: `Saved “${row.name}”.` });
      return row;
    } catch {
      setStatus({ kind: 'error', note: 'could not reach the server' });
      return null;
    }
  }, [refresh]);

  const remove = useCallback(async (slug: string) => {
    setStatus({ kind: 'busy', note: 'Deleting…' });
    try {
      const res = await apiFetch(`/api/table-designs/${encodeURIComponent(slug)}`, { method: 'DELETE' });
      if (!res.ok) {
        setStatus({ kind: 'error', note: await errNote(res, 'delete failed') });
        return false;
      }
      if (activeSlug === slug) setActiveSlug('');
      await refresh();
      setStatus({ kind: 'ok', note: 'Deleted.' });
      return true;
    } catch {
      setStatus({ kind: 'error', note: 'could not reach the server' });
      return false;
    }
  }, [activeSlug, refresh]);

  return { address, isConnected, designs, status, setStatus, activeSlug, setActiveSlug, refresh, create, update, remove };
}
