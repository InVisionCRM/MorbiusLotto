'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { MessageCircle, X, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatPanel } from './ChatPanel';

const PATH_TO_ROOM: Record<string, { roomId: string; title: string }> = {
  '/': { roomId: 'main', title: 'Lobby Chat' },
  '/BLACKJACK': { roomId: 'blackjack', title: 'Blackjack Chat' },
  '/keno': { roomId: 'keno', title: 'Keno Chat' },
  '/Morb-It': { roomId: 'morb-it', title: 'Morb-It Chat' },
};

const DEFAULT_ROOM = { roomId: 'main', title: 'Lobby Chat' };

function getRoomForPath(pathname: string): { roomId: string; title: string } {
  const normalized = pathname?.replace(/\/$/, '') || '/';
  return PATH_TO_ROOM[normalized] ?? DEFAULT_ROOM;
}

/** Poker uses table `PokerActivityFeed` + WS rooms; hide global `ChatPanel` on lobby and tables. */
function isPokerRoute(pathname: string | null | undefined): boolean {
  const p = pathname?.replace(/\/$/, '') || '';
  return p === '/poker' || p.startsWith('/poker/');
}

export function ChatSidebar() {
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [activeTab, setActiveTab] = useState<'page' | 'lobby'>('page');
  const pathname = usePathname();
  const hideOnPoker = isPokerRoute(pathname);
  const { roomId: pageRoomId, title: pageTitle } = getRoomForPath(pathname ?? '/');

  // Whether the current page has its own non-lobby chat
  const hasGameChat = pageRoomId !== 'main';

  // Reset to page tab when navigating to a new page
  useEffect(() => {
    setActiveTab('page');
  }, [pathname]);

  useEffect(() => {
    if (hideOnPoker) setOpen(false);
  }, [hideOnPoker]);

  // Resolve which room to show
  const roomId = hasGameChat && activeTab === 'lobby' ? 'main' : pageRoomId;
  const title = hasGameChat && activeTab === 'lobby' ? 'Lobby Chat' : pageTitle;

  // Open by default only on desktop home page
  useEffect(() => {
    const isHome = pathname === '/' || pathname === '';
    const isDesktop = window.innerWidth >= 768;
    if (isHome && isDesktop) setOpen(true);
   
  }, []);

  const closeSheet = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSheet();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, closeSheet]);

  const closeButton = (
    <button
      type="button"
      onClick={closeSheet}
      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border border-white/15 bg-white/5 text-white hover:bg-white/10 transition-colors"
      aria-label="Close chat"
    >
      <X className="w-5 h-5 stroke-[2.5]" />
    </button>
  );

  const tabBtn = (active: boolean) =>
    cn(
      'flex-1 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors',
      active ? 'bg-cyan-500/20 text-cyan-300' : 'text-white hover:bg-white/5',
    );

  if (hideOnPoker) return null;

  return (
    <>
      {/* ── Collapsed tag (always fixed, hidden when open) ── */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="surface-panel-sidebar fixed right-0 z-[500] flex flex-col items-center justify-center gap-1.5 w-6 min-h-[7.5rem] rounded-l-xl text-white hover:bg-white/5 transition-colors bottom-1/4 -translate-y-1/2 md:bottom-1/4"
          aria-label={hasUnread ? 'Open chat (unread messages)' : 'Open chat'}
        >
          <MessageCircle className="w-5 h-5 shrink-0 text-white opacity-90" />
          {hasUnread && (
            <span
              className="absolute top-2 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-slate-950"
              aria-hidden
            />
          )}
          <span
            className="text-[11px] text-white/70 tracking-[0.2em] uppercase font-semibold"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            Chat
          </span>
        </button>
      )}

      {/* Backdrop (outside click) + desktop / mobile drawers */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop: mobile only — desktop drawer doesn't need a full-screen overlay */}
            <motion.div
              key="chat-backdrop"
              className="fixed inset-0 z-[9001] md:hidden bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              aria-hidden
              onClick={closeSheet}
            />
            {/* Desktop */}
            <motion.div
              key="chat-drawer-desktop"
              className="surface-panel-sidebar hidden md:flex fixed right-0 top-0 bottom-0 z-[500] flex-col overflow-hidden text-white rounded-l-xl"
              style={{ width: 300 }}
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              onClick={(e) => e.stopPropagation()}
            >
              {hasGameChat && (
                <div className="flex shrink-0 rounded-none border-b border-white/10 mb-0 p-1 gap-0.5">
                  <button type="button" onClick={() => setActiveTab('page')} className={tabBtn(activeTab === 'page')}>
                    <span className="truncate block max-w-full">{pageTitle}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('lobby')}
                    className={`${tabBtn(activeTab === 'lobby')} flex items-center justify-center gap-1.5`}
                  >
                    <Home className="w-3 h-3 shrink-0 opacity-80" />
                    Lobby
                  </button>
                </div>
              )}
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <ChatPanel
                  key={`${roomId}-desktop`}
                  roomId={roomId}
                  title={title}
                  collapsible={false}
                  fillHeight
                  bareShell
                  className="flex-1 min-h-0 rounded-none border-0"
                  sheetOpen={open}
                  onUnreadChange={setHasUnread}
                  headerActions={closeButton}
                />
              </div>
            </motion.div>
            {/* Mobile */}
            <motion.div
              key="chat-drawer-mobile"
              className="surface-panel-sidebar md:hidden fixed right-0 top-0 bottom-0 z-[9002] flex flex-col overflow-hidden text-white rounded-l-xl"
              style={{ width: 'min(85vw, 320px)' }}
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 h-14" />
              {hasGameChat && (
                <div className="flex shrink-0 rounded-none border-b border-white/10 mb-0 p-1 gap-0.5">
                  <button type="button" onClick={() => setActiveTab('page')} className={tabBtn(activeTab === 'page')}>
                    <span className="truncate block max-w-full">{pageTitle}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('lobby')}
                    className={`${tabBtn(activeTab === 'lobby')} flex items-center justify-center gap-1.5`}
                  >
                    <Home className="w-3 h-3 shrink-0 opacity-80" />
                    Lobby
                  </button>
                </div>
              )}
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <ChatPanel
                  key={`${roomId}-mobile`}
                  roomId={roomId}
                  title={title}
                  collapsible={false}
                  fillHeight
                  bareShell
                  className="flex-1 min-h-0 rounded-none border-0"
                  sheetOpen={open}
                  onUnreadChange={setHasUnread}
                  headerActions={closeButton}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
