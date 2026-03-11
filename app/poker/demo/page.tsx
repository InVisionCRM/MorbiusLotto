'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { parseEther } from 'viem';
import { PokerSeat, PokerChipStack } from '@/components/poker/PokerSeat';
import { PokerBoard } from '@/components/poker/PokerBoard';
import { PokerActions } from '@/components/poker/PokerActions';
import { PokerTutorialOverlay } from '@/components/poker/PokerTutorialOverlay';
import { getPokerThemeVars } from '@/lib/poker-themes';
import { TUTORIAL_STEPS } from '@/lib/poker-tutorial-script';
import { motion, AnimatePresence } from 'framer-motion';
import type { PokerSeatState } from '@/lib/websocket-client';

// ── Constants ──────────────────────────────────────────────────────────────

const W = (n: number) => parseEther(String(n)).toString();
const MY_ADDR  = '0x0000000000000000000000000000000000000000';

/**
 * 10-seat positions as fractions of [tableWidth, tableHeight].
 * Seat 0 = you (bottom center). Evenly distributed around the oval edge.
 */
const SEAT_ANCHORS = [
  { fx: 0.50, fy: 0.90 }, // 0 — you (bottom center)
  { fx: 0.72, fy: 0.83 }, // 1 — bottom right
  { fx: 0.89, fy: 0.63 }, // 2 — right lower
  { fx: 0.89, fy: 0.36 }, // 3 — right upper
  { fx: 0.72, fy: 0.13 }, // 4 — top right
  { fx: 0.50, fy: 0.06 }, // 5 — top center
  { fx: 0.28, fy: 0.13 }, // 6 — top left
  { fx: 0.11, fy: 0.36 }, // 7 — left upper
  { fx: 0.11, fy: 0.63 }, // 8 — left lower
  { fx: 0.28, fy: 0.83 }, // 9 — bottom left
];

/** Pot anchor — center of the table */
const POT_ANCHOR = { fx: 0.50, fy: 0.50 };

// ── Fake seat definitions ──────────────────────────────────────────────────

interface FakeSeat {
  addr: string;
  stack: number;
  isDealer?: boolean;
  isSB?: boolean;
  isBB?: boolean;
  lastAction?: string;
  bet?: number;
  folded?: boolean;
  acting?: boolean;
  showBacks?: boolean;
}

const FAKE_SEATS: FakeSeat[] = [
  { addr: MY_ADDR,               stack: 9000 },                                                  // 0 — you
  { addr: '0x...cafe', stack: 5200,  lastAction: 'call',  bet: 200,  showBacks: true },          // 1
  { addr: '0x...dead', stack: 8100,  isDealer: true,                  showBacks: true },          // 2
  { addr: '0x...beef', stack: 3400,  lastAction: 'raise', bet: 800,  showBacks: true },          // 3
  { addr: '0x...fade', stack: 12000, folded: true },                                             // 4
  { addr: '0x...babe', stack: 6800,  acting: true,                    showBacks: true },          // 5
  { addr: '0x...face', stack: 4100,  lastAction: 'check',             showBacks: true },          // 6
  { addr: '0x...deed', stack: 9300,  isSB: true, lastAction: 'call', bet: 100, showBacks: true }, // 7
  { addr: '0x...feed', stack: 7600,  isBB: true, lastAction: 'bet',  bet: 400, showBacks: true }, // 8
  { addr: '0x...dec0', stack: 2900,  folded: true },                                             // 9
];

function makeSeat(f: FakeSeat, overrideBet?: number, overrideFolded?: boolean, overrideActing?: boolean): PokerSeatState {
  return {
    position: 0,
    playerAddress: f.addr === MY_ADDR ? f.addr : f.addr,
    stack: W(f.stack - (overrideBet ?? f.bet ?? 0)),
    status: 'active',
    isDealer:    !!f.isDealer,
    isSmallBlind: !!f.isSB,
    isBigBlind:  !!f.isBB,
    isActing:    overrideActing ?? !!f.acting,
    folded:      overrideFolded ?? !!f.folded,
    currentBet:  W(overrideBet ?? f.bet ?? 0),
  };
}

// ── Flying chip (PNG) ─────────────────────────────────────────────────────

function FlyChipImg() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/PokerChips/blackpokerchip000.png" alt="" aria-hidden width={26} height={26} />;
}

// ── Types ──────────────────────────────────────────────────────────────────

interface FlyingChip {
  id: string;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
}

type Phase = 'idle' | 'dealt' | 'my-bet' | 'opp-raise' | 'flop' | 'turn' | 'river' | 'showdown' | 'my-fold';

// ── Page ───────────────────────────────────────────────────────────────────

export default function PokerDemoPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isTutorial = searchParams.get('tutorial') === '1';

  const themeVars  = getPokerThemeVars('classic');
  const tableRef   = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 640, h: 500 });

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const update = () => setDims({ w: el.offsetWidth, h: el.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Tutorial step (when in tutorial mode) ─────────────────────────────────
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);

  // ── Game state ────────────────────────────────────────────────────────────
  const [phase,      setPhase]      = useState<Phase>('idle');
  const [pot,        setPot]        = useState(0);
  const [myBet,      setMyBet]      = useState(0);
  const [oppBet,     setOppBet]     = useState(0);
  const [myActing,   setMyActing]   = useState(false);
  const [myFolded,   setMyFolded]   = useState(false);
  const [timeLeft,   setTimeLeft]   = useState<number | undefined>();
  const [myLastAction, setMyLastAction] = useState<string | null>(null);
  const [flyingChips, setFlyingChips]  = useState<FlyingChip[]>([]);

  // When in tutorial mode, sync all state from the current step
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
    setFlyingChips([]);
  }, [isTutorial, tutorialStepIndex]);

  // ── Chip flight helper ────────────────────────────────────────────────────

  const flyChip = useCallback(
    (seatIndex: number, onLand: () => void) => {
      const HALF = 12;
      const src = SEAT_ANCHORS[seatIndex];
      const startX = src.fx * dims.w - HALF;
      const startY = src.fy * dims.h - HALF;
      const potX   = POT_ANCHOR.fx * dims.w - HALF;
      const potY   = POT_ANCHOR.fy * dims.h - HALF;
      const chip: FlyingChip = { id: `${Date.now()}-${Math.random()}`, startX, startY, dx: potX - startX, dy: potY - startY };
      setFlyingChips(prev => [...prev, chip]);
      setTimeout(() => {
        setFlyingChips(prev => prev.filter(c => c.id !== chip.id));
        onLand();
      }, 520);
    },
    [dims],
  );

  // ── Sequences ─────────────────────────────────────────────────────────────

  function deal() {
    setPhase('dealt'); setMyActing(true); setPot(150); setMyBet(0);
    setOppBet(0); setMyFolded(false); setMyLastAction(null); setTimeLeft(22);
  }

  function doMyBet() {
    setMyActing(false); setTimeLeft(undefined); setMyLastAction('bet'); setPhase('my-bet');
    flyChip(0, () => { setMyBet(500); setPot(p => p + 500); });
  }

  function doOppRaise() {
    setPhase('opp-raise');
    flyChip(3, () => { setOppBet(1500); setPot(p => p + 1500); setMyActing(true); setTimeLeft(18); });
  }

  function doFlop()  { setPhase('flop');  setMyActing(false); setMyBet(0); setOppBet(0); setMyLastAction(null); }
  function doTurn()  { setPhase('turn');  }
  function doRiver() { setPhase('river'); }
  function doShow()  { setPhase('showdown'); }

  function doFold() {
    setMyActing(false); setMyFolded(true); setMyLastAction('fold'); setTimeLeft(undefined); setPhase('my-fold');
  }

  function reset() {
    setPhase('idle'); setPot(0); setMyBet(0); setOppBet(0);
    setMyActing(false); setMyFolded(false); setMyLastAction(null); setFlyingChips([]); setTimeLeft(undefined);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const stepState = isTutorial && TUTORIAL_STEPS[tutorialStepIndex] ? TUTORIAL_STEPS[tutorialStepIndex].state : null;
  const holeCards = stepState?.holeCards ?? (phase !== 'idle' ? [1, 14] : undefined);
  const oppShowdown = phase === 'showdown' ? [10, 23] : undefined;
  const communityCards = stepState?.communityCards ?? (
    phase === 'flop'                          ? [0, 13, 26]           :
    phase === 'turn'                          ? [0, 13, 26, 39]       :
    phase === 'river' || phase === 'showdown' ? [0, 13, 26, 39, 12]  : []
  );

  // Build per-seat state; seat 0 = me, seat 3 gets oppBet override
  function seatState(i: number): PokerSeatState {
    const f = FAKE_SEATS[i];
    const isMe = i === 0;
    return makeSeat(
      f,
      isMe ? myBet : (i === 3 ? oppBet : undefined),
      isMe ? myFolded : undefined,
      isMe ? myActing : undefined,
    );
  }

  function seatLastAction(i: number): { action: string; amount: string } | null {
    if (i === 0) return myLastAction ? { action: myLastAction, amount: W(myBet) } : null;
    if (i === 3 && phase === 'opp-raise') return { action: 'raise', amount: W(1500) };
    const f = FAKE_SEATS[i];
    return f.lastAction ? { action: f.lastAction, amount: W(f.bet ?? 0) } : null;
  }

  // ── Buttons ───────────────────────────────────────────────────────────────

  const BTNS = [
    { label: '① Deal',          fn: deal,       disabled: phase !== 'idle' },
    { label: '② My Bet 500',    fn: doMyBet,    disabled: !myActing },
    { label: '③ Opp Raise 1500',fn: doOppRaise, disabled: phase !== 'my-bet' },
    { label: '④ Flop',          fn: doFlop,     disabled: phase === 'idle' || phase === 'flop' },
    { label: '⑤ Turn',          fn: doTurn,     disabled: phase !== 'flop' },
    { label: '⑥ River',         fn: doRiver,    disabled: phase !== 'turn' },
    { label: '⑦ Showdown',      fn: doShow,     disabled: phase !== 'river' },
    { label: '⑧ My Fold',       fn: doFold,     disabled: !myActing },
    { label: '↺ Reset',         fn: reset,      disabled: false, danger: true },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col"
      style={{
        ...themeVars as React.CSSProperties,
        minHeight: '100dvh',
        background: 'rgb(2 6 23)',
        color: 'var(--poker-text)',
        overflow: 'hidden',
      }}
    >
      {/* ── Tutorial top bar (when in tutorial mode) ── */}
      {isTutorial && (
        <div
          className="flex-shrink-0 flex items-center justify-between px-3 py-2"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.5)' }}
        >
          <span className="text-[10px] font-semibold" style={{ color: 'var(--poker-accent)' }}>
            Poker tutorial
          </span>
          <Link
            href="/poker"
            className="text-[10px] font-semibold hover:opacity-80 transition-opacity"
            style={{ color: 'var(--poker-accent)' }}
          >
            Back to lobby
          </Link>
        </div>
      )}

      {/* ── Compact control strip (hidden in tutorial mode) ── */}
      {!isTutorial && (
        <div
          className="flex-shrink-0 flex flex-wrap gap-1 px-2 py-1.5 items-center"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.5)' }}
        >
          <span className="text-[10px] mr-1" style={{ color: 'var(--poker-accent)' }}>
            Demo · <span style={{ color: 'var(--poker-chip)' }}>{phase}</span>
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
                color:        danger ? 'var(--poker-danger)' : 'var(--poker-accent)',
                background:   danger ? 'color-mix(in srgb, var(--poker-danger) 10%, transparent)' : 'color-mix(in srgb, var(--poker-accent) 10%, transparent)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── TABLE ──────────────────────────────────────────────────────────── */}
      <div
        ref={tableRef}
        className="flex-1 relative"
        style={{ minHeight: 0, overflow: 'visible' }}
        data-tutorial-target="table"
      >
        {/* Felt oval */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: '4%', top: '5%', width: '92%', height: '88%',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at 50% 38%, rgb(30,110,50) 0%, rgb(15,72,30) 48%, rgb(9,50,20) 100%)',
            boxShadow:
              '0 0 0 5px rgba(255,255,255,0.04), ' +
              '0 0 0 10px rgba(0,0,0,0.3), ' +
              '0 16px 80px rgba(0,0,0,0.85), ' +
              'inset 0 2px 50px rgba(0,0,0,0.5)',
          }}
        />
        {/* Rail groove */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: '3%', top: '3%', width: '94%', height: '92%',
            borderRadius: '50%',
            border: '4px solid rgba(60,30,5,0.65)',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
          }}
        />

        {/* Community board — center of felt */}
        <div
          className="absolute flex items-center justify-center"
          style={{ left: '20%', top: '37%', width: '60%', height: '24%', zIndex: 10 }}
          data-tutorial-target="community-cards"
        >
          <PokerBoard communityCards={communityCards} pot={W(pot)} dataTutorialTargetPot={isTutorial} />
        </div>

        {/* Flying chips */}
        {flyingChips.map((chip) => (
          <motion.div
            key={chip.id}
            className="absolute z-50 pointer-events-none"
            style={{ left: chip.startX, top: chip.startY }}
            initial={{ x: 0, y: 0, scale: 1.2, opacity: 1, rotate: 0 }}
            animate={{ x: chip.dx, y: chip.dy, scale: 0.4, opacity: 0, rotate: 540 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <FlyChipImg />
          </motion.div>
        ))}

        {/* Chip stacks — positioned between each seat and the pot */}
        <AnimatePresence>
          {SEAT_ANCHORS.map((anchor, i) => {
            const state = seatState(i);
            const hasBet = (() => { try { return BigInt(state.currentBet || '0') > 0n; } catch { return false; } })();
            if (!hasBet) return null;
            const frac = i === 0 ? 0.57 : 0.28;
            const cfx = anchor.fx + (POT_ANCHOR.fx - anchor.fx) * frac;
            const cfy = anchor.fy + (POT_ANCHOR.fy - anchor.fy) * frac;
            return (
              <motion.div
                key={`chips-${i}`}
                className="absolute pointer-events-none"
                style={{
                  left: `${cfx * 100}%`,
                  top:  `${cfy * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 25,
                }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              >
                <PokerChipStack weiAmount={state.currentBet} />
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* 10 seats */}
        {SEAT_ANCHORS.map((anchor, i) => (
          <div
            key={i}
            className="absolute z-20"
            style={{
              left: `${anchor.fx * 100}%`,
              top:  `${anchor.fy * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
            data-tutorial-target={`seat-${i}`}
          >
            <PokerSeat
              seat={seatState(i)}
              index={i}
              holeCards={i === 0 ? holeCards : (i === 3 && phase === 'showdown' ? oppShowdown : undefined)}
              isCurrentPlayer={i === 0}
              showCardBacks={i !== 0 && FAKE_SEATS[i].showBacks && phase !== 'idle'}
              lastAction={seatLastAction(i)}
              timeLeft={
                i === 0 ? (myActing ? timeLeft : undefined) :
                i === 5 ? 11 : undefined
              }
            />
          </div>
        ))}
      </div>

      {/* ── Action bar ── */}
      <div className="flex-shrink-0" data-tutorial-target="action-bar">
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

      {/* ── Tutorial overlay ── */}
      {isTutorial && (
        <PokerTutorialOverlay
          stepIndex={tutorialStepIndex}
          steps={TUTORIAL_STEPS}
          onNext={() => setTutorialStepIndex((i) => Math.min(i + 1, TUTORIAL_STEPS.length - 1))}
          onBack={() => setTutorialStepIndex((i) => Math.max(0, i - 1))}
          onSkip={() => router.push('/poker')}
          containerRef={tableRef}
        />
      )}
    </div>
  );
}
