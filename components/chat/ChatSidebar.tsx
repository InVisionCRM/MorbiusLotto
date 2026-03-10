'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { MessageCircle, X, Home } from 'lucide-react';
import { Theme } from '@/lib/theme';
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

/** LightModal panel with Theme.inset offset shadows (recessed look) */
const LIGHT_PANEL_STYLE: React.CSSProperties = {
  background: 'white',
  boxShadow: Theme.inset.boxShadow,
  border: Theme.inset.border,
};

/** Collapsed chat tag: light panel + inset shadow */
const LIGHT_TAG_STYLE: React.CSSProperties = {
  background: 'white',
  boxShadow: Theme.inset.light.boxShadow,
  border: Theme.inset.light.border,
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

  const lm = Theme.lightModal;
  const closeButton = (
    <button
      type="button"
      onClick={() => setOpen(false)}
      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-gray-200 border-2 border-gray-400 text-gray-700 hover:bg-gray-300 hover:text-black hover:border-gray-500 transition-colors shadow-sm"
      aria-label="Close chat"
    >
      <X className="w-5 h-5 stroke-[2.5]" />
    </button>
  );

  return (
    <>
      {/* ── Collapsed tag (always fixed, hidden when open) ── */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`flex flex-col items-center justify-center gap-1.5 w-8 h-30 rounded-l-xl border-l-2 border-gray-200 hover:bg-gray-50 transition-colors ${lm.accentText}`}
          style={{
            position: 'fixed',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 500,
            ...LIGHT_TAG_STYLE,
          }}
          aria-label={hasUnread ? 'Open chat (unread messages)' : 'Open chat'}
        >
          <MessageCircle className="w-6 h-6 shrink-0" />
          {hasUnread && (
            <span
              className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500"
              aria-hidden
            />
          )}
          <span
            className={`text-[18px] ${lm.mutedText} tracking-widest uppercase`}
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
            className={`fixed right-0 top-0 bottom-0 z-[500] flex flex-col border-l-2 border-gray-200 overflow-hidden ${lm.bodyText}`}
            style={{ ...LIGHT_PANEL_STYLE, width: 300 }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            {hasGameChat && (
              <div className={`hidden md:flex shrink-0 ${lm.tabsList} rounded-none border-b border-gray-200 mb-0`}>
                <button
                  type="button"
                  onClick={() => setActiveTab('page')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors rounded-none ${
                    activeTab === 'page'
                      ? 'bg-white text-cyan-500 shadow-sm border-b-2 border-cyan-500'
                      : `${lm.mutedText} hover:bg-gray-100 hover:text-gray-900`
                  }`}
                >
                  {pageTitle}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('lobby')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 rounded-none ${
                    activeTab === 'lobby'
                      ? 'bg-white text-cyan-500 shadow-sm border-b-2 border-cyan-500'
                      : `${lm.mutedText} hover:bg-gray-100 hover:text-gray-900`
                  }`}
                >
                  <Home className="w-3 h-3" />
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
            className={`md:hidden fixed right-0 top-0 bottom-0 z-[9002] flex flex-col border-l-2 border-gray-200 overflow-hidden ${lm.bodyText}`}
            style={{ ...LIGHT_PANEL_STYLE, width: 'min(85vw, 320px)' }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            {/* Spacer below mobile top bar */}
            <div className="shrink-0 h-14" />
            {hasGameChat && (
              <div className={`flex shrink-0 ${lm.tabsList} rounded-none border-b border-gray-200 mb-0`}>
                <button
                  type="button"
                  onClick={() => setActiveTab('page')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors rounded-none ${
                    activeTab === 'page'
                      ? 'bg-white text-cyan-500 shadow-sm border-b-2 border-cyan-500'
                      : `${lm.mutedText} hover:bg-gray-100 hover:text-gray-900`
                  }`}
                >
                  {pageTitle}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('lobby')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 rounded-none ${
                    activeTab === 'lobby'
                      ? 'bg-white text-cyan-500 shadow-sm border-b-2 border-cyan-500'
                      : `${lm.mutedText} hover:bg-gray-100 hover:text-gray-900`
                  }`}
                >
                  <Home className="w-3 h-3" />
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
