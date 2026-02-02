'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { MessageCircle } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ChatPanel } from './ChatPanel';

const breathingKeyframes = `
  @keyframes chat-unread-breathe {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.15); }
  }
`;

const PATH_TO_ROOM: Record<string, { roomId: string; title: string }> = {
  '/': { roomId: 'main', title: 'Lobby Chat' },
  '/home': { roomId: 'main', title: 'Lobby Chat' },
  '/BLACKJACK': { roomId: 'blackjack', title: 'Blackjack Chat' },
  '/PLINKO': { roomId: 'plinko', title: 'Plinko Chat' },
  '/plinko-dashboard': { roomId: 'plinko', title: 'Plinko Chat' },
  '/plinko-stats': { roomId: 'plinko', title: 'Plinko Chat' },
  '/plinko-simulator': { roomId: 'plinko', title: 'Plinko Chat' },
  '/plinko-verifier': { roomId: 'plinko', title: 'Plinko Chat' },
  '/keno': { roomId: 'keno', title: 'Keno Chat' },
  '/keno-dashboard': { roomId: 'keno', title: 'Keno Chat' },
  '/lottery': { roomId: 'lottery', title: 'Lottery Chat' },
  '/lottery-purchase-showcase': { roomId: 'lottery', title: 'Lottery Chat' },
  '/BIG-WHEEL': { roomId: 'bigwheel', title: 'Big Wheel Chat' },
  '/Morb-It': { roomId: 'morb-it', title: 'Morb-It Chat' },
  '/donate': { roomId: 'main', title: 'Lobby Chat' },
  '/swap': { roomId: 'main', title: 'Lobby Chat' },
};

const DEFAULT_ROOM = { roomId: 'main', title: 'Lobby Chat' };

function getRoomForPath(pathname: string): { roomId: string; title: string } {
  const normalized = pathname?.replace(/\/$/, '') || '/';
  return PATH_TO_ROOM[normalized] ?? DEFAULT_ROOM;
}

export function GlobalChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const { roomId, title } = getRoomForPath(pathname ?? '/');

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setHasUnread(false);
  };

  const chatSheet = (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <style dangerouslySetInnerHTML={{ __html: breathingKeyframes }} />
      <SheetTrigger asChild>
        <button
          type="button"
          className="fixed right-0 top-[calc(50%+30px)] z-[100] -translate-y-1/2 flex items-center justify-center w-10 h-24 rounded-l-lg border border-r-0 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 shadow-lg hover:bg-slate-800/90 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-2 focus:ring-offset-background"
          style={{
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.5)',
          }}
          aria-label={hasUnread ? 'Open chat (unread messages)' : 'Open chat'}
        >
          <MessageCircle className="h-5 w-5 text-cyan-400" />
          {hasUnread && (
            <span
              className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-red-500 pointer-events-none"
              style={{ animation: 'chat-unread-breathe 1.5s ease-in-out infinite' }}
              aria-hidden
            />
          )}
          <span className="sr-only">Chat</span>
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        overlayClassName="bg-transparent"
        className="w-[50vw] max-w-[50vw] h-[75vh] max-h-[75vh] pt-12 px-0 pb-0 flex flex-col border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800"
        style={{
          background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
          boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
          border: '1px solid rgba(34, 211, 238, 0.3)',
        }}
      >
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <ChatPanel
            roomId={roomId}
            title={title}
            collapsible={false}
            className="flex-1 flex flex-col min-h-0 overflow-hidden"
            sheetOpen={open}
            onUnreadChange={setHasUnread}
          />
        </div>
      </SheetContent>
    </Sheet>
  );

  // Portal into body so the trigger is never inside app-wrapper (transform/filter on ancestor would make fixed relative to it and push the tag to bottom)
  if (typeof document !== 'undefined' && document.body) {
    return createPortal(chatSheet, document.body);
  }
  return null;
}
