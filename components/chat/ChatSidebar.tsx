'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { MessageCircle, X, Home } from 'lucide-react';
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

/** Slide-in drawer shell (matches ChatPanel / site chrome) */
const CHAT_DRAWER_STYLE: React.CSSProperties = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.98), rgba(35, 36, 41, 0.96))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.75), inset 0 -2px 6px rgba(255, 255, 255, 0.05), -4px 0 24px rgba(0, 0, 0, 0.45)',
  borderLeft: '1px solid rgba(34, 211, 238, 0.28)',
};

const CHAT_TAG_STYLE: React.CSSProperties = {
  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.08), 0 1px 3px rgba(0, 0, 0, 0.5)',
  borderLeft: '1px solid rgba(34, 211, 238, 0.35)',
  borderTop: '1px solid rgba(60, 60, 60, 0.45)',
  borderBottom: '1px solid rgba(60, 60, 60, 0.45)',
};

export function ChatSidebar() {
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [activeTab, setActiveTab] = useState<'page' | 'lobby'>('page');
  const pathname = usePathname();
  const { roomId: pageRoomId, title: pageTitle } = getRoomForPath(pathname ?? '/');

  // Whether the current page has its own non-lobby chat
  const hasGameChat = pageRoomId !== 'main';

  // Reset to page tab when navigating to a new page
  useEffect(() => {
    setActiveTab('page');
  }, [pathname]);

  // Resolve which room to show
  const roomId = hasGameChat && activeTab === 'lobby' ? 'main' : pageRoomId;
  const title = hasGameChat && activeTab === 'lobby' ? 'Lobby Chat' : pageTitle;

  // Open by default only on desktop home page
  useEffect(() => {
    const isHome = pathname === '/' || pathname === '';
    const isDesktop = window.innerWidth >= 768;
    if (isHome && isDesktop) setOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeButton = (
    <button
      type="button"
      onClick={() => setOpen(false)}
      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-slate-800 border border-cyan-500/35 text-cyan-200 hover:bg-slate-700 hover:text-white transition-colors shadow-lg"
      aria-label="Close chat"
    >
      <X className="w-5 h-5 stroke-[2.5]" />
    </button>
  );

  const tabBtn = (active: boolean) =>
    active
      ? 'flex-1 px-3 py-2.5 text-xs font-semibold text-cyan-400 bg-slate-900/80 border-b-2 border-cyan-500 transition-colors'
      : 'flex-1 px-3 py-2.5 text-xs font-medium text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors';

  return (
    <>
      {/* ── Collapsed tag (always fixed, hidden when open) ── */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative flex flex-col items-center justify-center gap-1.5 w-9 min-h-[7.5rem] rounded-l-xl text-cyan-400 hover:text-cyan-300 transition-colors"
          style={{
            position: 'fixed',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 500,
            ...CHAT_TAG_STYLE,
          }}
          aria-label={hasUnread ? 'Open chat (unread messages)' : 'Open chat'}
        >
          <MessageCircle className="w-5 h-5 shrink-0 opacity-90" />
          {hasUnread && (
            <span
              className="absolute top-2 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-slate-900"
              aria-hidden
            />
          )}
          <span
            className="text-[11px] text-slate-500 tracking-[0.2em] uppercase font-semibold"
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
            className="fixed right-0 top-0 bottom-0 z-[500] flex flex-col overflow-hidden text-slate-200"
            style={{ ...CHAT_DRAWER_STYLE, width: 300 }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            {hasGameChat && (
              <div className="hidden md:flex shrink-0 rounded-none border-b border-cyan-500/15 bg-slate-950/50 mb-0">
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
                key={roomId}
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
        )}
      </AnimatePresence>

      {/* ── Mobile: same tag + right slide-in drawer ── */}
      {/* (tag above handles mobile too; drawer is same panel at narrower width) */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="md:hidden fixed right-0 top-0 bottom-0 z-[9002] flex flex-col overflow-hidden text-slate-200"
            style={{ ...CHAT_DRAWER_STYLE, width: 'min(85vw, 320px)' }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            {/* Spacer below mobile top bar */}
            <div className="shrink-0 h-14" />
            {hasGameChat && (
              <div className="flex shrink-0 rounded-none border-b border-cyan-500/15 bg-slate-950/50 mb-0">
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
                key={roomId}
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
        )}
      </AnimatePresence>
    </>
  );
}
