'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { ChatPanel } from './ChatPanel';

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
  const [mounted, setMounted] = useState(false);
  const { roomId, title } = getRoomForPath(pathname ?? '/');

  useEffect(() => {
    setMounted(true);
  }, []);

  const chat = <ChatPanel roomId={roomId} title={title} collapsible />;

  // After mount, render chat into body so it isn't scaled by .app-content-wrapper's transform
  if (mounted && typeof document !== 'undefined') {
    return createPortal(chat, document.body);
  }
  return chat;
}
