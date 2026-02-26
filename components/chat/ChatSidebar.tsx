'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { MessageCircle, X } from 'lucide-react';
import { ChatPanel } from './ChatPanel';

const PATH_TO_ROOM: Record<string, { roomId: string; title: string }> = {
  '/': { roomId: 'main', title: 'Lobby Chat' },
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
};

const DEFAULT_ROOM = { roomId: 'main', title: 'Lobby Chat' };

function getRoomForPath(pathname: string): { roomId: string; title: string } {
  const normalized = pathname?.replace(/\/$/, '') || '/';
  return PATH_TO_ROOM[normalized] ?? DEFAULT_ROOM;
}

const PANEL_BG: React.CSSProperties = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.8), inset 0 -3px 6px rgba(255,255,255,0.1), -2px 0 8px rgba(0,0,0,0.4)',
};

const TAG_BG: React.CSSProperties = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6), -2px 0 6px rgba(0,0,0,0.4)',
};

export function ChatSidebar() {
  const [open, setOpen] = useState(true);
  const [hasUnread, setHasUnread] = useState(false);
  const pathname = usePathname();
  const { roomId, title } = getRoomForPath(pathname ?? '/');

  const closeButton = (
    <button
      type="button"
      onClick={() => setOpen(false)}
      className="w-6 h-6 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors shrink-0"
      aria-label="Close chat"
    >
      <X className="w-3.5 h-3.5" />
    </button>
  );

  return (
    <>
      {/* ── Collapsed tag (always fixed, hidden when open) ── */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-[500] flex flex-col items-center justify-center gap-1.5 w-8 h-20 rounded-l-xl border border-r-0 border-cyan-500/30 hover:bg-white/10 transition-colors"
          style={TAG_BG}
          aria-label={hasUnread ? 'Open chat (unread messages)' : 'Open chat'}
        >
          <MessageCircle className="w-4 h-4 text-cyan-400 shrink-0" />
          {hasUnread && (
            <span
              className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500"
              aria-hidden
            />
          )}
          <span
            className="text-[9px] text-white/40 tracking-widest uppercase"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            Chat
          </span>
        </button>
      )}

      {/* ── Expanded panel (fixed, slides in from right) ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed right-0 top-0 bottom-0 z-[500] flex flex-col border-l border-cyan-500/20 overflow-hidden"
            style={{ ...PANEL_BG, width: 300 }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <ChatPanel
              roomId={roomId}
              title={title}
              collapsible={false}
              fillHeight
              className="h-full rounded-none border-0"
              sheetOpen={open}
              onUnreadChange={setHasUnread}
              headerActions={closeButton}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mobile: same tag + right slide-in drawer ── */}
      {/* (tag above handles mobile too; drawer is same panel at narrower width) */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="md:hidden fixed right-0 top-0 bottom-0 z-[9002] flex flex-col border-l border-cyan-500/20 overflow-hidden"
            style={{ ...PANEL_BG, width: 'min(85vw, 320px)' }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            {/* Spacer below mobile top bar */}
            <div className="shrink-0 h-14" />
            <ChatPanel
              roomId={roomId}
              title={title}
              collapsible={false}
              fillHeight
              className="flex-1 min-h-0 rounded-none border-0"
              sheetOpen={open}
              onUnreadChange={setHasUnread}
              headerActions={closeButton}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
