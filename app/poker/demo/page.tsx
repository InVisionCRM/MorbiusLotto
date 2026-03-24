'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { formatEther, parseEther } from 'viem';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { PokerActions } from '@/components/poker/PokerActions';
import { PokerTutorialOverlay } from '@/components/poker/PokerTutorialOverlay';
import { PokerTable } from '@/components/poker/PokerTable';
import { PokerActivityFeed } from '@/components/poker/PokerActivityFeed';
import { PokerThemeProvider } from '@/components/poker/PokerThemeContext';
import { PokerTableEffectProvider } from '@/hooks/use-poker-table-effect';
import { DEFAULT_POKER_THEME, getPokerThemeVars } from '@/lib/poker-themes';
import { TUTORIAL_STEPS } from '@/lib/poker-tutorial-script';
import type { PokerCurrentHand, PokerSeatState, PokerTableState } from '@/lib/websocket-client';

// ── Constants ──────────────────────────────────────────────────────────────

const W = (n: number) => parseEther(String(n)).toString();
const DEMO_TABLE_ID = 'demo';
const DEMO_HAND_ID = 'demo-hand';

/** Distinct demo addresses (seat i → `playerAddress`). */
function demoPlayerAddress(i: number): string {
  return `0x${(i + 1).toString(16).padStart(40, '0')}`;
}

const DEMO_MY_ADDRESS = demoPlayerAddress(0);

// ── Fake seat metadata (no address — paired with demoPlayerAddress) ────────

interface FakeSeatMeta {
  stack: number;
  isDealer?: boolean;
  isSB?: boolean;
  isBB?: boolean;
  lastAction?: string;
  bet?: number;
  folded?: boolean;
}

const FAKE_META: FakeSeatMeta[] = [
  { stack: 9000 },
  { stack: 5200, lastAction: 'call', bet: 200 },
  { stack: 8100, isDealer: true },
  { stack: 3400, lastAction: 'raise', bet: 800 },
  { stack: 12000, folded: true },
  { stack: 6800 },
  { stack: 4100, lastAction: 'check' },
  { stack: 9300, isSB: true, lastAction: 'call', bet: 100 },
  { stack: 7600, isBB: true, lastAction: 'bet', bet: 400 },
  { stack: 2900, folded: true },
];

type Phase =
  | 'idle'
  | 'dealt'
  | 'my-bet'
  | 'opp-raise'
  | 'flop'
  | 'turn'
  | 'river'
  | 'showdown'
  | 'my-fold';

function phaseToStreet(phase: Phase): PokerCurrentHand['street'] {
  switch (phase) {
    case 'flop':
      return 'flop';
    case 'turn':
      return 'turn';
    case 'river':
      return 'river';
    case 'showdown':
      return 'showdown';
    default:
      return 'preflop';
  }
}

function buildDemoTableState(args: {
  phase: Phase;
  pot: number;
  myBet: number;
  oppBet: number;
  myActing: boolean;
  myFolded: boolean;
  myLastAction: string | null;
  holeCards: number[] | null | undefined;
  communityCards: number[];
}): PokerTableState {
  const seats: PokerSeatState[] = FAKE_META.map((meta, i) => {
    const addr = demoPlayerAddress(i);
    const isMe = i === 0;
    const bet = isMe ? args.myBet : i === 3 ? args.oppBet : meta.bet ?? 0;
    const folded = isMe ? args.myFolded : !!meta.folded;
    const acting = isMe && args.myActing;
    const stackWei = Math.max(0, meta.stack - bet);
    return {
      position: i,
      playerAddress: addr,
      stack: W(stackWei),
      status: 'active',
      isDealer: !!meta.isDealer,
      isSmallBlind: !!meta.isSB,
      isBigBlind: !!meta.isBB,
      isActing: acting,
      folded,
      currentBet: W(bet),
    };
  });

  const oppAddr = demoPlayerAddress(3).toLowerCase();

  let lastAction: PokerCurrentHand['lastAction'] = null;
  if (args.phase === 'idle') {
    lastAction = null;
  } else if (args.phase === 'opp-raise') {
    lastAction = { position: 3, action: 'raise', amount: W(args.oppBet) };
  } else if (args.myLastAction) {
    lastAction = { position: 0, action: args.myLastAction, amount: W(args.myBet) };
  } else if (args.phase === 'my-bet') {
    lastAction = { position: 3, action: 'raise', amount: W(args.oppBet) };
  } else {
    for (let i = 1; i < FAKE_META.length; i++) {
      const m = FAKE_META[i];
      if (m.lastAction) {
        lastAction = { position: i, action: m.lastAction, amount: W(m.bet ?? 0) };
        break;
      }
    }
  }

  // Idle + no pot: no hand (matches live empty table). Idle + pot: synthetic hand so pot/board chrome matches live "between streets" testing.
  const currentHand: PokerCurrentHand | null =
    args.phase === 'idle' && args.pot === 0
      ? null
      : {
          handId: DEMO_HAND_ID,
          street: phaseToStreet(args.phase),
          communityCards: [...args.communityCards],
          pot: W(args.pot),
          actingPosition: args.myActing ? 0 : null,
          lastAction,
          minRaise: W(200),
          toCall: W(Math.max(0, args.oppBet - args.myBet)),
          turnStartedAt: args.myActing ? new Date().toISOString() : null,
          showdownHands:
            args.phase === 'showdown'
              ? { [oppAddr]: [10, 23] }
              : undefined,
          winners:
            args.phase === 'showdown'
              ? [
                  {
                    address: demoPlayerAddress(3),
                    amount: W(args.pot),
                    handName: 'Two pair',
                  },
                ]
              : undefined,
        };

  return {
    tableId: DEMO_TABLE_ID,
    smallBlind: W(10),
    bigBlind: W(20),
    maxSeats: 10,
    status: 'active',
    seats,
    currentHand,
    myHoleCards: args.holeCards ?? null,
  };
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PokerDemoPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isTutorial = searchParams.get('tutorial') === '1';

  const pokerTheme = DEFAULT_POKER_THEME;
  const themeVars = getPokerThemeVars(pokerTheme);
  const cyberpunk = pokerTheme === 'cyberpunk';

  const tableAreaRef = useRef<HTMLDivElement>(null);
  const [activityMobileOpenSerial, setActivityMobileOpenSerial] = useState(0);

  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);

  const [phase, setPhase] = useState<Phase>('idle');
  const [pot, setPot] = useState(0);
  const [myBet, setMyBet] = useState(0);
  const [oppBet, setOppBet] = useState(0);
  const [myActing, setMyActing] = useState(false);
  const [myFolded, setMyFolded] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | undefined>();
  const [myLastAction, setMyLastAction] = useState<string | null>(null);

  useEffect(() => {
    if (!isTutorial || !TUTORIAL_STEPS[tutorialStepIndex]) return;
    const s = TUTORIAL_STEPS[tutorialStepIndex].state;
    setPhase(s.phase as Phase);
    setPot(s.pot);
    setMyBet(s.myBet);
    setOppBet(s.oppBet);
    setMyActing(s.myActing);
    setMyFolded(s.myFolded);
    setMyLastAction(s.myLastAction);
    setTimeLeft(s.timeLeft);
  }, [isTutorial, tutorialStepIndex]);

  const stepState = isTutorial && TUTORIAL_STEPS[tutorialStepIndex] ? TUTORIAL_STEPS[tutorialStepIndex].state : null;
  const holeCards = stepState?.holeCards ?? (phase !== 'idle' ? [1, 14] : undefined);
  const communityCards = stepState?.communityCards ?? (
    phase === 'flop'
      ? [0, 13, 26]
      : phase === 'turn'
        ? [0, 13, 26, 39]
        : phase === 'river' || phase === 'showdown'
          ? [0, 13, 26, 39, 12]
          : []
  );

  const demoState = buildDemoTableState({
    phase,
    pot,
    myBet,
    oppBet,
    myActing,
    myFolded,
    myLastAction,
    holeCards: holeCards ?? null,
    communityCards,
  });

  function deal() {
    setPhase('dealt');
    setMyActing(true);
    setPot(150);
    setMyBet(0);
    setOppBet(0);
    setMyFolded(false);
    setMyLastAction(null);
    setTimeLeft(22);
  }

  function doMyBet() {
    setMyActing(false);
    setTimeLeft(undefined);
    setMyLastAction('bet');
    setPhase('my-bet');
    setMyBet(500);
    setPot((p) => p + 500);
  }

  function doOppRaise() {
    setPhase('opp-raise');
    setOppBet(1500);
    setPot((p) => p + 1500);
    setMyActing(true);
    setTimeLeft(18);
  }

  function doFlop() {
    setPhase('flop');
    setMyActing(false);
    setMyBet(0);
    setOppBet(0);
    setMyLastAction(null);
  }
  function doTurn() {
    setPhase('turn');
  }
  function doRiver() {
    setPhase('river');
  }
  function doShow() {
    setPhase('showdown');
  }

  function doFold() {
    setMyActing(false);
    setMyFolded(true);
    setMyLastAction('fold');
    setTimeLeft(undefined);
    setPhase('my-fold');
  }

  function reset() {
    setPhase('idle');
    setPot(0);
    setMyBet(0);
    setOppBet(0);
    setMyActing(false);
    setMyFolded(false);
    setMyLastAction(null);
    setTimeLeft(undefined);
  }

  const BTNS = [
    { label: '① Deal', fn: deal, disabled: phase !== 'idle', danger: false },
    { label: '② My Bet 500', fn: doMyBet, disabled: !myActing, danger: false },
    { label: '③ Opp Raise 1500', fn: doOppRaise, disabled: phase !== 'my-bet', danger: false },
    { label: '④ Flop', fn: doFlop, disabled: phase === 'idle' || phase === 'flop', danger: false },
    { label: '⑤ Turn', fn: doTurn, disabled: phase !== 'flop', danger: false },
    { label: '⑥ River', fn: doRiver, disabled: phase !== 'turn', danger: false },
    { label: '⑦ Showdown', fn: doShow, disabled: phase !== 'river', danger: false },
    { label: '⑧ My Fold', fn: doFold, disabled: !myActing, danger: false },
    { label: '↺ Reset', fn: reset, disabled: false, danger: true },
  ];

  const fmtChips = (wei: string) => {
    try {
      const n = Number(formatEther(toBigIntSafe(wei)));
      return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    } catch {
      return wei;
    }
  };

  return (
    <PokerThemeProvider themeId={pokerTheme}>
      <PokerTableEffectProvider>
        <div
          className={`flex flex-col ${cyberpunk ? 'font-mono uppercase' : ''}`}
          style={{
            ...themeVars as React.CSSProperties,
            height: '100dvh',
            background: 'rgb(2 6 23)',
            color: 'var(--poker-text)',
            overflow: 'hidden',
            paddingLeft: 'env(safe-area-inset-left, 0px)',
            paddingRight: 'env(safe-area-inset-right, 0px)',
          }}
        >
        {isTutorial && (
          <div
            className="flex-shrink-0 flex items-center justify-between px-3 py-2 z-30"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.5)' }}
          >
            <span className="text-[10px] font-semibold" style={{ color: 'var(--poker-accent)' }}>
              Poker tutorial
            </span>
            <Link
              href="/"
              className="text-[10px] font-semibold hover:opacity-80 transition-opacity"
              style={{ color: 'var(--poker-accent)' }}
            >
              Back to Home
            </Link>
          </div>
        )}

        {/* Same top bar shell as /poker/[tableId] */}
        <div
          className="grid flex-shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 z-30"
          style={{
            background: 'rgba(10,10,10,0.96)',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            paddingTop: 'max(8px, env(safe-area-inset-top, 0px))',
            paddingBottom: '8px',
          }}
        >
          <div aria-hidden className="min-w-0" />
          <div className="flex flex-col items-center justify-center min-w-0 gap-0.5">
            <span className="text-[10px] text-[rgba(255,255,255,0.45)] tabular-nums truncate text-center w-full">
              Demo · {fmtChips(demoState.smallBlind)}/{fmtChips(demoState.bigBlind)} ·{' '}
              {demoState.seats.filter((s) => s.playerAddress).length}/{demoState.maxSeats} seats
            </span>
          </div>
          <div className="flex items-center justify-end gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => router.push('/poker')}
              className="h-9 px-3 rounded-sm text-[11px] font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.97]"
              style={{
                background: 'linear-gradient(180deg, #8b1a1a 0%, #6b1111 100%)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
              }}
            >
              Leave
            </button>
          </div>
        </div>

        {!isTutorial && (
          <div
            className="flex-shrink-0 flex flex-wrap gap-1 px-2 py-1.5 items-center z-20"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.45)' }}
          >
            <span className="text-[10px] mr-1 shrink-0" style={{ color: 'var(--poker-accent)' }}>
              Scene · <span style={{ color: 'var(--poker-chip)' }}>{phase}</span>
            </span>
            {BTNS.map(({ label, fn, disabled, danger }) => (
              <button
                key={label}
                type="button"
                onClick={fn}
                disabled={disabled}
                className="px-2 py-0.5 rounded-sm border text-[10px] font-semibold transition hover:opacity-80 active:scale-95 disabled:opacity-25 disabled:cursor-not-allowed"
                style={{
                  borderColor: danger ? 'var(--poker-danger)' : 'var(--poker-accent)',
                  color: danger ? 'var(--poker-danger)' : 'var(--poker-accent)',
                  background: danger
                    ? 'color-mix(in srgb, var(--poker-danger) 10%, transparent)'
                    : 'color-mix(in srgb, var(--poker-accent) 10%, transparent)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Table region — same flex + maxWidth as live table page */}
        <div
          ref={tableAreaRef}
          className="flex-1 relative"
          style={{
            minHeight: 0,
            maxWidth: 'min(100vw, calc((100dvh - 160px) * 2.4))',
            marginLeft: 'auto',
            marginRight: 'auto',
            width: '100%',
          }}
        >
          <PokerTable
            state={demoState}
            currentPlayerAddress={DEMO_MY_ADDRESS}
            timeLeft={timeLeft}
            tutorialTargets={isTutorial}
            dataTutorialTargetPot={isTutorial}
            onLeave={() => router.push('/poker')}
            onRequestMobileActivity={() => setActivityMobileOpenSerial((n) => n + 1)}
          />
        </div>

        {/* Bottom row — same grid as /poker/[tableId] */}
        <div className="flex-shrink-0 grid grid-cols-1 md:grid-cols-[minmax(260px,1fr)_1fr_minmax(280px,1fr)] gap-0 min-h-0">
          <div className="hidden md:block min-w-0 md:order-1" />
          <div className="hidden md:block min-w-0 md:order-2" />
          <div className="order-1 md:order-3 flex-shrink-0 min-w-0" data-tutorial-target="action-bar">
            <PokerActions
              canAct={myActing}
              canCheck={false}
              minRaise={W(200)}
              stack={W(Math.max(0, 9000 - myBet))}
              callAmount={oppBet > myBet ? W(oppBet - myBet) : '0'}
              pot={W(pot)}
              onFold={doFold}
              onCheck={() => {}}
              onCall={() => {}}
              onBet={() => {}}
              onRaise={() => {}}
            />
          </div>
        </div>

        {/* Match live page: no WS — empty roomId skips internal chat client */}
        <PokerActivityFeed
          wsClient={null}
          wsConnected={false}
          roomId=""
          tableId={DEMO_TABLE_ID}
          state={demoState}
          mobileOpenRequestSerial={activityMobileOpenSerial}
        />

        {isTutorial && (
          <PokerTutorialOverlay
            stepIndex={tutorialStepIndex}
            steps={TUTORIAL_STEPS}
            onNext={() => setTutorialStepIndex((i) => Math.min(i + 1, TUTORIAL_STEPS.length - 1))}
            onBack={() => setTutorialStepIndex((i) => Math.max(0, i - 1))}
            onSkip={() => router.push('/poker')}
            containerRef={tableAreaRef}
          />
        )}
        </div>
      </PokerTableEffectProvider>
    </PokerThemeProvider>
  );
}
