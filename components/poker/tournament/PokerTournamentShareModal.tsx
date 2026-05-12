'use client';

import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  PokerTournamentSharePanel,
  type PokerTournamentSharePanelProps,
} from '@/components/poker/tournament/PokerTournamentSharePanel';

/**
 * Standalone share-image dialog. Wraps `PokerTournamentSharePanel` with the
 * cyan/grey poker-modal shell so it can be opened from outside the tournament
 * creator (post-create confirmation, lobby actions, my-tournaments list).
 *
 * `modal={false}` matches the creator's pattern and avoids focus-trap conflicts
 * when this is layered above another modal (e.g. the post-create confirmation
 * card or the my-tournaments modal). The custom z-index (`z-[100]`) sits well
 * above the lobby's `z-[70]` join flow and the confirmation card's `z-[52]`.
 */
export type PokerTournamentShareModalProps = PokerTournamentSharePanelProps & {
  open: boolean;
  onClose: () => void;
};

export function PokerTournamentShareModal({
  open,
  onClose,
  ...panelProps
}: PokerTournamentShareModalProps) {
  return (
    <Dialog
      modal={false}
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay
          className="z-[100] bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          onClick={onClose}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-0 z-[100] flex flex-col items-center justify-center border-0 bg-transparent p-4 shadow-none outline-none',
            'overflow-y-auto scroll-smooth overscroll-y-contain',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200',
          )}
          // Radix calls these on overlay clicks / Esc when modal=false; route both to onClose.
          onEscapeKeyDown={onClose}
          onPointerDownOutside={onClose}
        >
          <DialogPrimitive.Title className="sr-only">Share tournament image</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Choose a background and overlay style, then download or share a PNG of this poker tournament.
          </DialogPrimitive.Description>
          <div
            className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 shadow-2xl overflow-hidden"
            style={{
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 3px 6px rgba(0,0,0,0.8), inset 0 -3px 6px rgba(255,255,255,0.08)',
            }}
          >
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.12),transparent_55%)]" />
            <div className="relative shrink-0 flex items-center justify-between px-5 pt-5 pb-3 border-b border-cyan-500/20">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-white tracking-tight truncate">Share tournament</h2>
                <p className="text-[11px] text-white/45 mt-0.5 truncate">
                  Generate a PNG you can post to socials or DM to friends.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg p-1.5 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close share dialog"
              >
                ×
              </button>
            </div>
            <div className="relative flex-1 min-h-0 overflow-y-auto scroll-smooth overscroll-y-contain px-5 py-4">
              <PokerTournamentSharePanel {...panelProps} />
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
