'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { PokerTable } from '@/components/poker/PokerTable';
import { PokerThemeProvider } from '@/components/poker/PokerThemeContext';
import { PokerTableEffectProvider } from '@/hooks/use-poker-table-effect';
import { POKER_TABLE_REF_H, POKER_TABLE_REF_W } from '@/app/poker/[tableId]/PokerMobileZoomLock';
import type { PokerTableState } from '@/lib/websocket-client';
import { DEFAULT_POKER_THEME, getPokerThemeVars } from '@/lib/poker-themes';

const BLACK_AVATAR_DATA_URI =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84 84"><rect width="84" height="84" fill="black"/></svg>';

const MOCK_PLAYERS = [
  { name: 'You', stack: '12450', bet: '1200' },
  { name: 'Vega', stack: '8800', bet: '600' },
  { name: 'Nyx', stack: '16200', bet: '1200' },
  { name: 'Hex', stack: '5400', bet: '0' },
  { name: 'Mako', stack: '21300', bet: '2400' },
  { name: 'Rook', stack: '9700', bet: '0' },
  { name: 'Lux', stack: '15250', bet: '1200' },
  { name: 'Echo', stack: '6800', bet: '600' },
  { name: 'Ash', stack: '11100', bet: '0' },
  { name: 'Zero', stack: '19000', bet: '3600' },
];

function mockAddress(index: number): string {
  return `0x${String(index + 1).padStart(40, '0')}`;
}

const MOCK_TABLE_STATE: PokerTableState = {
  tableId: 'layout-reference',
  smallBlind: '300',
  bigBlind: '600',
  maxSeats: 10,
  status: 'active',
  seats: MOCK_PLAYERS.map((player, index) => ({
    position: index,
    playerAddress: mockAddress(index),
    stack: player.stack,
    status: 'playing',
    isDealer: index === 3,
    isSmallBlind: index === 1,
    isBigBlind: index === 2,
    isActing: index === 0,
    folded: false,
    currentBet: player.bet,
    displayName: player.name,
    profileImageUrl: BLACK_AVATAR_DATA_URI,
    avatarConfig: null,
    profileDisplayMode: 'photo',
  })),
  currentHand: {
    handId: 'layout-hand',
    street: 'river',
    communityCards: [9, 22, 35, 48, 3],
    pot: '13200',
    actingPosition: 0,
    lastAction: { position: 0, action: 'raise', amount: '1200' },
    recentActions: [
      { order: 1, street: 'preflop', position: 1, action: 'small_blind', amount: '300' },
      { order: 2, street: 'preflop', position: 2, action: 'big_blind', amount: '600' },
      { order: 3, street: 'river', position: 0, action: 'raise', amount: '1200' },
    ],
    streetActions: {
      0: { action: 'raise', amount: '1200' },
    },
    minRaise: '1800',
    toCall: '0',
    turnStartedAt: '2026-04-29T00:00:00.000Z',
  },
  myHoleCards: [50, 37],
  tableLogo: null,
  tableLogoOpacity: 0.12,
  tableLogoSponsoredUntil: null,
  tableLogoSponsorAddress: null,
  tableLogoIsDefault: true,
};

function PokerLayoutMockTable() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      const s = Math.min(w / POKER_TABLE_REF_W, h / POKER_TABLE_REF_H, 1);
      setScale(Math.max(0.35, s));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={panelRef}
      className="relative mx-auto flex w-full max-w-[min(100%,1400px)] items-center justify-center overflow-visible rounded-xl border border-cyan-500/15 bg-black/20"
      style={{
        height: 'min(88dvh, 720px)',
        minHeight: 320,
      }}
    >
      {/* Same pattern as mobile `PokerTableView`: inner ref size so ResizeObserver / cqw match production. */}
      <div
        style={{
          position: 'relative',
          width: POKER_TABLE_REF_W * scale,
          height: POKER_TABLE_REF_H * scale,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: POKER_TABLE_REF_W,
            height: POKER_TABLE_REF_H,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <PokerTable
            state={MOCK_TABLE_STATE}
            currentPlayerAddress={mockAddress(0)}
            timeLeft={42}
            showDealerAnchorGuides
          />
        </div>
      </div>
    </div>
  );
}

export default function PokerLayoutReferencePage() {
  return (
    <div
      className="min-h-screen p-4 text-slate-100 md:p-8"
      style={{ background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.95), rgba(40, 40, 40, 0.9))' }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(34,211,238,0.12),transparent_55%)]" />

      <div className="relative mx-auto flex max-w-[1300px] flex-col gap-5">
        <header className="flex flex-col gap-3 border-b border-cyan-500/20 pb-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-cyan-400/80">Reference</p>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Poker layout mock table</h1>
            <p className="max-w-3xl text-sm text-slate-400">
              One production-shaped table using the live rail, card, chip, dealer, and tag styling. Faint{' '}
              <span className="text-amber-200/90">d0–d9</span> markers show every dealer-button anchor; the gold disc is the
              real dealer seat. Edit anchors in{' '}
              <code className="text-cyan-300/90">lib/poker-seat-layout.ts</code> and reload to compare placement.
            </p>
          </div>
          <Link
            href="/poker"
            className="text-sm text-cyan-400 underline-offset-4 hover:text-cyan-300 hover:underline"
          >
            Back to poker
          </Link>
        </header>

        <PokerThemeProvider themeId={DEFAULT_POKER_THEME}>
          <div style={getPokerThemeVars(DEFAULT_POKER_THEME)}>
            <PokerTableEffectProvider>
              <PokerLayoutMockTable />
            </PokerTableEffectProvider>
          </div>
        </PokerThemeProvider>
      </div>
    </div>
  );
}
