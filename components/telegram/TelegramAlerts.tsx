'use client';

/**
 * TelegramAlerts — compact, reusable Telegram notification control.
 *
 * Lives wherever it's useful: the wallet dropdown, the poker page, the
 * tournament-create success popup. Two placements:
 *  - placement="menu"  — a row that matches the wallet dropdown's menu items.
 *  - placement="panel" — a small bordered panel for pages / popups.
 *
 * It's a "smart toggle" — because Telegram alerts can't be a plain switch:
 *  - Not linked -> flipping it on opens the one-time link flow (code -> bot).
 *  - Linked     -> a real on/off switch for notifications + a small Unlink.
 *
 * Resilient: if the status check fails it still shows an actionable control
 * instead of rendering empty.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { IconBrandTelegram } from '@tabler/icons-react';
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

export interface TelegramAlertsProps {
  walletAddress: string;
  /** "menu" = wallet-dropdown row; "panel" = bordered panel. Default "panel". */
  placement?: 'menu' | 'panel';
  /**
   * Called when the link modal opens/closes. A parent dropdown can use this to
   * keep itself open while the modal is up (otherwise it would unmount the
   * modal). Optional — only the wallet dropdown needs it.
   */
  onModalOpenChange?: (open: boolean) => void;
}

export function TelegramAlerts({
  walletAddress,
  placement = 'panel',
  onModalOpenChange,
}: TelegramAlertsProps) {
  const { status, loading, error, refetch } = useTelegramStatus(walletAddress);
  const [modalOpen, setModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [linkCode, setLinkCode] = useState<LinkCodeResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const setModal = useCallback(
    (open: boolean) => {
      setModalOpen(open);
      onModalOpenChange?.(open);
    },
    [onModalOpenChange],
  );

  const linked = status?.linked === true;
  const switchOn = linked && status?.notificationsEnabled === true;
  const checking = loading && !status && !error;

  // While the link modal is open, re-check status every 2s so it closes itself
  // the instant the player finishes linking in Telegram.
  useEffect(() => {
    if (!modalOpen) return;
    const id = setInterval(() => {
      void refetch();
    }, 2000);
    return () => clearInterval(id);
  }, [modalOpen, refetch]);

  useEffect(() => {
    if (modalOpen && linked) {
      setModal(false);
      setLinkCode(null);
      toast.success('Telegram linked — alerts are on!');
    }
  }, [modalOpen, linked, setModal]);

  const startLinking = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/telegram/link-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not start linking.');
      setLinkCode(data as LinkCodeResponse);
      setModal(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }, [walletAddress, setModal]);

  // The on/off switch. Linked -> toggles notifications. Not linked -> turning
  // "on" kicks off the link flow (you can't toggle something that isn't linked).
  const handleSwitch = useCallback(
    async (next: boolean) => {
      if (!linked) {
        if (next) void startLinking();
        return;
      }
      setBusy(true);
      try {
        const res = await fetch('/api/telegram/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: walletAddress, notificationsEnabled: next }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Could not update.');
        await refetch();
        toast.success(next ? 'Telegram alerts on.' : 'Telegram alerts paused.');
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [linked, startLinking, walletAddress, refetch],
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

  const switchDisabled = busy || generating || checking;

  // ── Shared link-code modal ────────────────────────────────────────────────
  const modal = (
    <Dialog open={modalOpen} onOpenChange={setModal}>
      <DialogContent className="border-cyan-500/30 bg-slate-950 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link your Telegram</DialogTitle>
          <DialogDescription className="text-white/60">
            Send this 6-character code to the MORBIUS bot. This window updates
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
                Open the MORBIUS bot in Telegram and send it:{' '}
                <span className="font-mono">/link {linkCode.code}</span>
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  // ── placement="menu" — a wallet-dropdown row ──────────────────────────────
  if (placement === 'menu') {
    return (
      <>
        {linked ? (
          <div className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-white/90">
            <IconBrandTelegram size={16} className="text-cyan-300/90 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Telegram alerts</div>
              <button
                type="button"
                onClick={handleUnlink}
                disabled={busy}
                className="text-[11px] text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
              >
                Unlink
              </button>
            </div>
            <Switch
              checked={switchOn}
              onCheckedChange={handleSwitch}
              disabled={switchDisabled}
              aria-label="Telegram alerts"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void startLinking()}
            disabled={generating || checking}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-white/90 transition-colors hover:bg-white/5 disabled:opacity-60"
          >
            <IconBrandTelegram size={16} className="text-cyan-300/90 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1 text-left">
              <div className="text-sm font-medium">Telegram alerts</div>
              <div className="text-[11px] text-white/40">
                {checking ? 'Checking…' : generating ? 'Setting up…' : 'Off — tap to turn on'}
              </div>
            </div>
          </button>
        )}
        {modal}
      </>
    );
  }

  // ── placement="panel" — bordered panel for pages / popups ─────────────────
  return (
    <>
      <div className="flex items-center gap-3 rounded-xl border border-cyan-500/20 bg-slate-950/50 px-4 py-3">
        <IconBrandTelegram size={22} className="shrink-0 text-cyan-300/90" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">Telegram alerts</div>
          <div className="text-xs text-white/55 leading-snug">
            {linked
              ? switchOn
                ? "On — we'll ping you before your poker games start."
                : 'Paused — flip on to get game-start pings.'
              : checking
                ? 'Checking…'
                : 'Get pinged before your poker games start.'}
            {linked && (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={handleUnlink}
                  disabled={busy}
                  className="text-white/40 underline-offset-2 hover:text-white/70 hover:underline transition-colors disabled:opacity-50"
                >
                  Unlink
                </button>
              </>
            )}
          </div>
        </div>
        <Switch
          checked={switchOn}
          onCheckedChange={handleSwitch}
          disabled={switchDisabled}
          aria-label="Telegram alerts"
        />
      </div>
      {modal}
    </>
  );
}
