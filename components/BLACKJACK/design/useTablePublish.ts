'use client';

/**
 * Publishing glue for the table designer: list the real multiplayer tables,
 * load a table's saved theme into the editor, and save the editor's diff back.
 *
 * Saving is a two-step pipeline. Local preview media (blob:/data: URLs from
 * uploads, recordings, trims and the card-back picker) is uploaded first and
 * swapped for hosted paths — the server refuses inline URLs by design — then
 * the sparse theme goes to the admin theme endpoint, which broadcasts fresh
 * state so seated players restyle live.
 *
 * All requests carry the connected wallet in x-admin-wallet, the same admin
 * convention the rest of the admin surface uses.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import type { BlackjackTableThemeConfig } from '@/lib/blackjack-table-theme';
import { sanitizeThemeConfig } from '@/lib/blackjack-table-theme';

export interface PublishTableRow {
  id: string;
  status: string;
  minBet: string;
  maxBet: string;
}

export type PublishStatus =
  | { kind: 'idle' }
  | { kind: 'busy'; note: string }
  | { kind: 'ok'; note: string }
  | { kind: 'error'; note: string };

const isLocalMedia = (url: string) => url.startsWith('blob:') || url.startsWith('data:');

async function urlToFile(url: string, fallbackName: string): Promise<File> {
  const blob = await fetch(url).then((r) => r.blob());
  const ext = blob.type.includes('wav')
    ? '.wav'
    : blob.type.includes('mpeg')
      ? '.mp3'
      : blob.type.includes('ogg')
        ? '.ogg'
        : blob.type.includes('webm')
          ? '.webm'
          : blob.type.startsWith('image/')
            ? `.${blob.type.split('/')[1] || 'png'}`
            : '';
  return new File([blob], `${fallbackName}${ext}`, { type: blob.type || 'application/octet-stream' });
}

export function useTablePublish() {
  const { address } = useAccount();
  const [tables, setTables] = useState<PublishTableRow[]>([]);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [status, setStatus] = useState<PublishStatus>({ kind: 'idle' });

  const headers = useCallback(
    (): Record<string, string> => ({ 'x-admin-wallet': address ?? '' }),
    [address],
  );

  // Table list — only attempted once a wallet is connected, since the admin
  // proxy rejects anonymous calls anyway.
  useEffect(() => {
    if (!address) {
      setTables([]);
      setTablesError(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/bj-multi/tables', { headers: headers() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (alive) {
          setTables(Array.isArray(data.tables) ? data.tables : []);
          setTablesError(null);
        }
      } catch (e) {
        if (alive) setTablesError(e instanceof Error ? e.message : 'Failed to list tables');
      }
    })();
    return () => {
      alive = false;
    };
  }, [address, headers]);

  const loadTheme = useCallback(
    // A discriminated result, not a bare theme-or-null: `theme: null` on success
    // legitimately means "stock table, reset the editor", so a failure that
    // ALSO returned null would make the caller wipe an unsaved design over a
    // network hiccup. On `ok: false` the caller must leave the editor alone.
    async (
      tableId: string,
    ): Promise<{ ok: true; theme: BlackjackTableThemeConfig | null } | { ok: false }> => {
      setStatus({ kind: 'busy', note: 'Loading theme…' });
      try {
        const res = await fetch(`/api/admin/bj-multi/tables/${tableId}/theme`, { headers: headers() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setStatus({ kind: 'ok', note: data.themeConfig ? 'Theme loaded' : 'Table is stock' });
        return { ok: true, theme: sanitizeThemeConfig(data.themeConfig) };
      } catch (e) {
        setStatus({
          kind: 'error',
          note: `${e instanceof Error ? e.message : 'Load failed'} — your current design is untouched`,
        });
        return { ok: false };
      }
    },
    [headers],
  );

  const uploadFile = useCallback(
    async (file: File, kind: 'audio' | 'image'): Promise<string> => {
      const form = new FormData();
      form.append('file', file);
      form.append('kind', kind);
      const res = await fetch('/api/admin/upload', { method: 'POST', headers: headers(), body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.path !== 'string') {
        throw new Error(data.error || `Upload failed (HTTP ${res.status})`);
      }
      return data.path;
    },
    [headers],
  );

  /**
   * Uploads every local-preview URL in the theme and returns the theme with
   * hosted paths, so the caller can also adopt them into editor state (a saved
   * theme should survive the editor's own reload too).
   */
  const materializeMedia = useCallback(
    async (theme: BlackjackTableThemeConfig): Promise<BlackjackTableThemeConfig> => {
      const out: BlackjackTableThemeConfig = JSON.parse(JSON.stringify(theme));

      if (out.sounds) {
        for (const [event, pool] of Object.entries(out.sounds)) {
          if (!Array.isArray(pool)) continue;
          for (let i = 0; i < pool.length; i++) {
            if (isLocalMedia(pool[i])) {
              setStatus({ kind: 'busy', note: `Uploading ${event} sound…` });
              const file = await urlToFile(pool[i], `table-${event}-${i + 1}`);
              pool[i] = await uploadFile(file, 'audio');
            }
          }
        }
      }

      const backImage = out.layout?.cards?.backImage;
      if (typeof backImage === 'string' && isLocalMedia(backImage)) {
        setStatus({ kind: 'busy', note: 'Uploading card back…' });
        const file = await urlToFile(backImage, 'card-back');
        out.layout!.cards!.backImage = await uploadFile(file, 'image');
      }

      const tableImage = out.layout?.table?.image;
      if (typeof tableImage === 'string' && isLocalMedia(tableImage)) {
        setStatus({ kind: 'busy', note: 'Uploading table art…' });
        const file = await urlToFile(tableImage, 'table-art');
        out.layout!.table!.image = await uploadFile(file, 'image');
      }

      return out;
    },
    [uploadFile],
  );

  const saveTheme = useCallback(
    async (
      tableId: string,
      theme: BlackjackTableThemeConfig,
    ): Promise<BlackjackTableThemeConfig | null> => {
      if (!address) {
        setStatus({ kind: 'error', note: 'Connect an admin wallet to save' });
        return null;
      }
      try {
        const materialized = await materializeMedia(theme);
        setStatus({ kind: 'busy', note: 'Saving theme…' });
        const res = await fetch(`/api/admin/bj-multi/tables/${tableId}/theme`, {
          method: 'PUT',
          headers: { ...headers(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ themeConfig: materialized }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setStatus({ kind: 'ok', note: 'Saved — live at the table' });
        return materialized;
      } catch (e) {
        setStatus({ kind: 'error', note: e instanceof Error ? e.message : 'Save failed' });
        return null;
      }
    },
    [address, headers, materializeMedia],
  );

  return { address, tables, tablesError, status, loadTheme, saveTheme };
}
