'use client';

/**
 * TelegramLink — the "Notifications" settings panel.
 *
 * Three states:
 *  - loading: while the first status check is in flight
 *  - not linked: shows a "Link Telegram" button -> code modal (polls for success)
 *  - linked: shows the connected account, a notifications on/off toggle, unlink
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useTelegramStatus } from '@/hooks/useTelegramStatus';

interface LinkCodeResponse {
  code: string;
  expiresAt: string | null;
  botUsername: string | null;
  deepLink: string | null;
  webLink: string | null;
}

export function TelegramLink({ walletAddress }: { walletAddress: string }) {
  const { status, loading, refetch } = useTelegramStatus(walletAddress);

  const [modalOpen, setModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [linkCode, setLinkCode] = useState<LinkCodeResponse | null>(null);
  const [busy, setBusy] = useState(false);

  // While the link modal is open, re-check status every 2s so it closes itself
  // the instant the player finishes linking over in Telegram.
  useEffect(() => {
    if (!modalOpen) return;
    const id = setInterval(() => {
      void refetch();
    }, 2000);
    return () => clearInterval(id);
  }, [modalOpen, refetch]);

  // Auto-close + celebrate once the wallet shows as linked.
  useEffect(() => {
    if (modalOpen && status?.linked) {
      setModalOpen(false);
      setLinkCode(null);
      toast.success("Telegram linked — you're all set!");
    }
  }, [modalOpen, status?.linked]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/telegram/link-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not create a link code.');
      setLinkCode(data as LinkCodeResponse);
      setModalOpen(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }, [walletAddress]);

  const handleToggle = useCallback(
    async (next: boolean) => {
      setBusy(true);
      try {
        const res = await fetch('/api/telegram/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: walletAddress, notificationsEnabled: next }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Could not update preference.');
        await refetch();
        toast.success(next ? 'Notifications turned on.' : 'Notifications paused.');
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [walletAddress, refetch],
  );

  const handleUnlink = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/telegram/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not unlink.');
      await refetch();
      toast.success('Telegram unlinked.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [walletAddress, refetch]);

  const copyCode = useCallback(() => {
    if (!linkCode?.code || !navigator.clipboard) {
      toast.error('Copy not available — select the code manually.');
      return;
    }
    navigator.clipboard.writeText(linkCode.code).then(
      () => toast.success('Code copied.'),
      () => toast.error('Could not copy — select the code manually.'),
    );
  }, [linkCode]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-slate-950/60 p-6">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-xl">
          📣
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-white">Telegram notifications</h2>
          <p className="mt-1 text-sm text-white/60 leading-relaxed">
            Link Telegram and we&apos;ll message you when a poker tournament you&apos;ve
            registered for is about to start — so you can register, walk away, and come
            back right before the cards fly.
          </p>
        </div>
      </div>

      <div className="mt-5">
        {loading && !status && (
          <p className="text-sm text-white/50">Checking your Telegram status…</p>
        )}

        {!loading && status && !status.linked && (
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:opacity-95"
          >
            {generating ? 'Generating code…' : 'Link Telegram'}
          </Button>
        )}

        {!loading && status && status.linked && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
              <span className="text-emerald-300">✓</span>
              <span className="text-sm text-white/85">
                Connected
                {status.username ? (
                  <>
                    {' '}
                    as{' '}
                    <span className="font-semibold text-white">@{status.username}</span>
                  </>
                ) : null}
                {status.linkedAt ? (
                  <span className="text-white/45">
                    {' '}
                    · linked {new Date(status.linkedAt).toLocaleDateString()}
                  </span>
                ) : null}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">Tournament alerts</p>
                <p className="text-xs text-white/50">
                  Turn off to stay linked but stop receiving messages.
                </p>
              </div>
              <Switch
                checked={status.notificationsEnabled}
                onCheckedChange={handleToggle}
                disabled={busy}
                aria-label="Toggle tournament notifications"
              />
            </div>

            <Button
              variant="outline"
              onClick={handleUnlink}
              disabled={busy}
              className="border-white/15 bg-transparent text-white/80 hover:bg-white/5"
            >
              Unlink Telegram
            </Button>
          </div>
        )}
      </div>

      {/* ── Link-code modal ──────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="border-cyan-500/30 bg-slate-950 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link your Telegram</DialogTitle>
            <DialogDescription className="text-white/60">
              Send this 6-character code to the MORBlotto bot. This window updates
              itself the moment you&apos;re connected.
            </DialogDescription>
          </DialogHeader>

          {linkCode && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={copyCode}
                title="Click to copy"
                className="w-full select-all rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-5 text-center font-mono text-3xl font-bold tracking-[0.4em] text-cyan-200 transition-colors hover:bg-cyan-500/20"
              >
                {linkCode.code}
              </button>
              <p className="text-center text-xs text-white/40">
                Tap the code to copy · valid for 10 minutes
              </p>

              {linkCode.webLink ? (
                <>
                  <a
                    href={linkCode.webLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-center text-sm font-semibold text-white transition-opacity hover:opacity-95"
                  >
                    Open Telegram
                  </a>
                  <p className="text-xs text-white/55 leading-relaxed">
                    The button opens a chat with the bot. Tap{' '}
                    <span className="font-semibold text-white/80">Start</span> (the code
                    is sent automatically) — or send{' '}
                    <span className="font-mono text-white/80">/link {linkCode.code}</span>{' '}
                    yourself.
                  </p>
                </>
              ) : (
                <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90 leading-relaxed">
                  Open the MORBlotto bot in Telegram and send it:{' '}
                  <span className="font-mono">/link {linkCode.code}</span>
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
