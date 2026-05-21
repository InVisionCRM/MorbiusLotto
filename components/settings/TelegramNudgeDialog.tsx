'use client';

/**
 * TelegramNudgeDialog — a one-time pop-up shown right after a player creates a
 * poker tournament. If that wallet has NOT linked Telegram yet, it gently
 * suggests doing so (so they get pinged before their tournament starts).
 *
 * Renders nothing when: no wallet, status still loading, already linked, or the
 * player dismissed it.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useTelegramStatus } from '@/hooks/useTelegramStatus';

export function TelegramNudgeDialog({
  walletAddress,
}: {
  walletAddress?: string | null;
}) {
  const { status, loading } = useTelegramStatus(walletAddress ?? null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (dismissed || !walletAddress || loading) return;
    if (status && !status.linked) setOpen(true);
  }, [walletAddress, loading, status, dismissed]);

  if (!walletAddress) return null;

  const close = () => {
    setDismissed(true);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="border-cyan-500/30 bg-slate-950 text-white sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 inline-flex h-12 w-12 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-2xl">
            📣
          </div>
          <DialogTitle>Want a heads-up before it starts?</DialogTitle>
          <DialogDescription className="text-white/65 leading-relaxed">
            Link Telegram and we&apos;ll message you when your tournament is about to
            start. Register now, walk away, and come back right before the cards fly —
            no sitting at an empty table.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-2">
          <Button
            onClick={() => {
              close();
              router.push('/settings');
            }}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:opacity-95"
          >
            Set up notifications
          </Button>
          <Button
            variant="ghost"
            onClick={close}
            className="text-white/70 hover:bg-white/5 hover:text-white"
          >
            Maybe later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
