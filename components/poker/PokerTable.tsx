'use client';

import React, { useRef, useState, useEffect } from 'react';
import { formatEther } from 'viem';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { motion, AnimatePresence } from 'framer-motion';
import { PokerSeat, PokerChipStack } from './PokerSeat';
import { PokerBoard } from './PokerBoard';
import { CardDisplay } from './CardDisplay';
import type { PokerTableState as TableState } from '@/lib/websocket-client';
import { PokerTournamentHUD } from './tournament/PokerTournamentHUD';
import type { PokerTournamentState } from '@/hooks/use-poker-tournament';
import { BackgroundBeams, type BeamColorPalette } from '@/components/ui/background-beams';
import { usePokerTableEffect } from '@/hooks/use-poker-table-effect';
import { EncryptedText } from '@/components/ui/encrypted-text';

const BEAM_PALETTES: BeamColorPalette[] = [
  { primary: '#18CCFC', accent: '#6344F5', tail: '#AE48FF' }, // cyan → purple → magenta
  { primary: '#F59E0B', accent: '#DC2626', tail: '#9333EA' }, // gold → red → purple
  { primary: '#10B981', accent: '#06B6D4', tail: '#3B82F6' }, // emerald → cyan → blue
  { primary: '#F43F5E', accent: '#EC4899', tail: '#A855F7' }, // rose → pink → violet
  { primary: '#D4A82A', accent: '#B08820', tail: '#8A6010' }, // gold trim tones (matches table)
];

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatChips(wei: string | number): string {
  try {
    const num = Number(formatEther(toBigIntSafe(wei)));
    return Number.isInteger(num)
      ? num.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return String(wei);
  }
}

const POT_ANCHOR = { fx: 0.50, fy: 0.47 };
const ADJACENT_SEAT_VERTICAL_NUDGE_PX = 50;
const RIGHT_ADJACENT_SEAT_HORIZONTAL_NUDGE_PX = 25;
const LEFT_ADJACENT_SEAT_HORIZONTAL_NUDGE_PX = -25;

// Compute evenly-spaced seat positions around the table oval for any seat count.
// Seat 0 is always bottom-center (current player); seats go clockwise.
// When `mobileNudge` is true, seat 0 (bottom-center) is pushed down so it
// sits just above the betting controls on narrow viewports.
function computeSeatAnchors(n: number, mobileNudge = false): Array<{ fx: number; fy: number }> {
  const cx = 0.50, cy = 0.45;
  const rx = 0.44, ry = 0.36;
  return Array.from({ length: n }, (_, i) => {
    const theta = Math.PI / 2 - (i / n) * 2 * Math.PI;
    let fy = parseFloat((cy + ry * Math.sin(theta)).toFixed(4));
    // Push bottom player (i=0) closer to the controls on mobile
    if (i === 0 && mobileNudge) fy = Math.min(0.92, fy + 0.10);
    return {
      fx: parseFloat((cx + rx * Math.cos(theta)).toFixed(4)),
      fy,
    };
  });
}

export interface PokerTableProps {
  state: TableState;
  currentPlayerAddress: string | null;
  /** Leave table (e.g. opens confirm); wired from seat radial and header. */
  onLeave?: () => void;
  timeLeft?: number;
  /** Chat bubble text to show above each seat (key = seat index). Cleared after ~5s by parent. */
  chatBubbleBySeatIndex?: Record<number, string>;
  /** Called when current player clicks re-up (+). Opens deposit/re-up modal when provided. */
  onReUpClick?: () => void;
  /** Avatar creator / profile editor; opened from current player seat radial. */
  onMenuClick?: () => void;
  /** Per-seat QuickChat phrase to show above seat; key = seat index. */
  reactionBySeatIndex?: Record<number, string>;
  /** Per-seat avatar emotion broadcast to table (so all players see the same animation). */
  broadcastEmotionBySeatIndex?: Record<number, import('@/components/poker/avatar/AvatarView').Emotion>;
  /** Called when current player selects a QuickChat phrase (broadcast to table). */
  onPhraseReaction?: (phrase: string) => void;
  /** Called when current player selects an avatar emotion (broadcast to table). */
  onAnimationReaction?: (emotion: import('@/components/poker/avatar/AvatarView').Emotion) => void;
  /** Called when any player clicks an opponent's avatar. */
  onOpponentClick?: (address: string) => void;
  /** Right-click radial on opponent (profile / follow / gift). */
  onOpponentRadialAction?: (action: 'profile' | 'follow' | 'gift', address: string) => void;
  /** When set, renders the tournament HUD overlay in the top-left corner. */
  tournamentHUD?: {
    state: PokerTournamentState;
    myAddress: string;
  };
  /** QuickChat phrase list (from useQuickChatPhrases). When provided with setQuickChatPhrases and onOpenEditQuickChat, Edit QuickChat can be opened from header Settings. */
  quickChatPhrases?: string[];
  setQuickChatPhrases?: (phrases: string[]) => void;
  /** Called when user wants to open Edit QuickChat (e.g. from seat picker or header Settings). */
  onOpenEditQuickChat?: () => void;
  /** Open Activity drawer on mobile (narrow viewport); parent bumps `PokerActivityFeed` serial. */
  onRequestMobileActivity?: () => void;
  /** Add `data-tutorial-target` on table, board, seats (for `/poker/demo` tutorial). */
  tutorialTargets?: boolean;
  /** Wrap pot for tutorial spotlight (forwarded to `PokerBoard`). */
  dataTutorialTargetPot?: boolean;
}

export function PokerTable({ state, currentPlayerAddress, timeLeft, chatBubbleBySeatIndex, onReUpClick, onMenuClick, reactionBySeatIndex, broadcastEmotionBySeatIndex, onPhraseReaction, onAnimationReaction, onOpponentClick, onOpponentRadialAction, tournamentHUD, quickChatPhrases, setQuickChatPhrases, onOpenEditQuickChat, onLeave, onRequestMobileActivity, tutorialTargets, dataTutorialTargetPot }: PokerTableProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [, setDims] = useState({ w: 640, h: 500 });
  /** Below Tailwind `md` — hide heavy seat avatars to reduce crowding on phones. */
  const [hideSeatAvatars, setHideSeatAvatars] = useState(false);
  const { effect: tableEffect, feltGradient, railStyle } = usePokerTableEffect();

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setHideSeatAvatars(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const update = () => setDims({ w: el.offsetWidth, h: el.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hand = state.currentHand;

  // ── Beam color cycling: cross-fade two layers every 5 hands over 15s ─
  // Two permanent beam layers (A/B). `activeBeamLayer` toggles which is
  // visible; the CSS transition handles the 15s fade between them.
  const handCountRef = useRef(0);
  const lastBeamHandIdRef = useRef<string | null>(null);
  const [activeBeamLayer, setActiveBeamLayer] = useState<'A' | 'B'>('A');
  const [paletteA, setPaletteA] = useState<BeamColorPalette>(BEAM_PALETTES[0]);
  const [paletteB, setPaletteB] = useState<BeamColorPalette>(BEAM_PALETTES[1]);

  useEffect(() => {
    const hid = hand?.handId;
    if (!hid || hid === lastBeamHandIdRef.current) return;
    lastBeamHandIdRef.current = hid;
    handCountRef.current += 1;
    if (handCountRef.current % 5 === 0) {
      const nextIdx = (BEAM_PALETTES.indexOf(activeBeamLayer === 'A' ? paletteA : paletteB) + 1) % BEAM_PALETTES.length;
      // Load the next palette into the hidden layer, then swap visibility
      if (activeBeamLayer === 'A') {
        setPaletteB(BEAM_PALETTES[nextIdx]);
        setActiveBeamLayer('B');
      } else {
        setPaletteA(BEAM_PALETTES[nextIdx]);
        setActiveBeamLayer('A');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hand?.handId]);

  const mySeatIndex = state.seats.findIndex(s => s.playerAddress === currentPlayerAddress);
  const seatAnchors = computeSeatAnchors(state.seats.length, hideSeatAvatars);
  const actingPosition = hand?.actingPosition ?? null;
  const isShowdownWithWinners = hand?.street === 'showdown' && hand?.winners?.length;
  const winnerSeatIndices = isShowdownWithWinners
    ? (hand!.winners!.map((w) => state.seats.findIndex((s) => s.playerAddress === w.address)).filter((i) => i >= 0) as number[])
    : [];
  const winnerDisplaySlots = winnerSeatIndices.map(
    (idx) => (mySeatIndex >= 0 ? (idx - mySeatIndex + state.seats.length) % state.seats.length : idx)
  );
  const firstWinnerAnchor = winnerDisplaySlots.length > 0 ? seatAnchors[winnerDisplaySlots[0]] : null;
  const firstWinner = isShowdownWithWinners ? hand!.winners![0] : null;
  const firstWinnerAddr = firstWinner?.address ?? null;
  const isCurrentPlayerWinner = firstWinnerAddr && currentPlayerAddress && firstWinnerAddr === currentPlayerAddress.toLowerCase();
  const firstWinnerSeat = firstWinnerAddr ? state.seats.find((s) => s.playerAddress === firstWinnerAddr) : null;
  const winnerStack = firstWinnerSeat?.stack ?? '0';
  const winnerAmount = firstWinner?.amount ?? hand?.pot ?? '0';
  const winnerHandName = firstWinner?.handName;
  const winningCardIndices = firstWinner?.winningCardIndices ?? [];
  // Showdown chip destination: land above winner cards (not avatar center).
  const winnerChipYOffsetPx = hideSeatAvatars ? 62 : 86;

  const seatProps = (idx: number) => {
    const seat = state.seats[idx];
    const inHand = !!hand && seat.playerAddress && !seat.folded;
    const isWinnerSeat = !!firstWinnerAddr && seat.playerAddress === firstWinnerAddr;
    return {
      seat,
      index: idx,
      holeCards:
        mySeatIndex === idx
          ? (state.myHoleCards ?? hand?.showdownHands?.[seat.playerAddress!] ?? undefined)
          : (hand?.showdownHands?.[seat.playerAddress!] ?? undefined),
      isCurrentPlayer: idx === mySeatIndex,
      showCardBacks: !!(inHand && idx !== mySeatIndex && !hand?.showdownHands?.[seat.playerAddress!]),
      winningCardIndices: isWinnerSeat ? winningCardIndices : undefined,
      lastAction:
        hand?.lastAction?.position === idx
          ? { action: hand.lastAction.action, amount: hand.lastAction.amount }
          : null,
      timeLeft: actingPosition === idx ? timeLeft : undefined,
      chatBubble: chatBubbleBySeatIndex?.[idx] ?? null,
      onReUpClick,
      onMenuClick,
      overlayPhrase: reactionBySeatIndex?.[idx] ?? null,
      overlayEmotion: broadcastEmotionBySeatIndex?.[idx] ?? null,
      onPhraseReaction: onPhraseReaction,
      onAnimationReaction: onAnimationReaction,
      onOpponentClick: onOpponentClick,
      onOpponentRadialAction: onOpponentRadialAction,
      quickChatPhrases,
      setQuickChatPhrases,
      onOpenEditQuickChat,
      hideSeatAvatar: hideSeatAvatars,
      onLeaveTable: onLeave,
      onRequestMobileActivity,
      includeActivityInPlayerRadial: hideSeatAvatars,
    };
  };

  return (
    <div
      ref={tableRef}
      className="absolute inset-0"
      style={{ overflow: 'visible' }}
      {...(tutorialTargets ? { 'data-tutorial-target': 'table' } : {})}
    >

      {/* Tournament HUD overlay */}
      {tournamentHUD && (
        <PokerTournamentHUD
          state={tournamentHUD.state}
          myAddress={tournamentHUD.myAddress}
        />
      )}

      {/* CSS poker table — padding-based rings so every ring is equal pixel thickness all around */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: '3%', top: '5%', width: '94%', height: '88%',
          borderRadius: '9999px',
          background: '#07090f',
          padding: '7px',
          display: 'flex',
          boxShadow: '0 32px 100px rgba(0,0,0,0.95), 0 10px 40px rgba(0,0,0,0.8)',
        }}
      >
        {/* Outer trim — 8px ring */}
        <div style={{
          flex: 1, borderRadius: '9999px', display: 'flex', padding: '8px',
          background: railStyle.outerRing,
          boxShadow: railStyle.outerGlow,
        }}>
          {/* Dark cushion — 20px ring */}
          <div style={{
            flex: 1, borderRadius: '9999px', display: 'flex', padding: '20px',
            background: railStyle.cushion,
            boxShadow: 'inset 0 4px 16px rgba(0,0,0,0.85), inset 0 -2px 8px rgba(0,0,0,0.6)',
          }}>
            {/* Inner trim — 6px ring */}
            <div style={{
              flex: 1, borderRadius: '9999px', display: 'flex', padding: '6px',
              background: railStyle.innerRing,
              boxShadow: railStyle.innerGlow,
            }}>
              {/* Felt surface — color from user preference */}
              <div style={{
                flex: 1, borderRadius: '9999px', position: 'relative', overflow: 'hidden',
                background: feltGradient,
                boxShadow: 'inset 0 8px 40px rgba(0,0,0,0.55), inset 0 -4px 20px rgba(0,0,0,0.4)',
                outline: '1px dashed rgba(255,255,255,0.08)',
                outlineOffset: '-10px',
              }}>
                {/* Animated effects — PC only (skip on mobile to save GPU) */}
                {!hideSeatAvatars && tableEffect === 'beams' && (
                  <>
                    <div
                      style={{
                        position: 'absolute', inset: 0, pointerEvents: 'none',
                        opacity: activeBeamLayer === 'A' ? 0.12 : 0,
                        mixBlendMode: 'screen',
                        transition: 'opacity 15s ease',
                      }}
                    >
                      <BackgroundBeams palette={paletteA} />
                    </div>
                    <div
                      style={{
                        position: 'absolute', inset: 0, pointerEvents: 'none',
                        opacity: activeBeamLayer === 'B' ? 0.12 : 0,
                        mixBlendMode: 'screen',
                        transition: 'opacity 15s ease',
                      }}
                    >
                      <BackgroundBeams palette={paletteB} />
                    </div>
                  </>
                )}
                {/* Marketing logo — admin-set, rendered centered on felt */}
                {state.tableLogo && (
                  <div
                    style={{
                      position: 'absolute', inset: 0, pointerEvents: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: state.tableLogoOpacity ?? 0.12,
                    }}
                  >
                    <img
                      src={`/Marketing /LOGOS/${state.tableLogo}`}
                      alt=""
                      draggable={false}
                      style={{
                        maxWidth: '38%',
                        maxHeight: '44%',
                        objectFit: 'contain',
                        filter: 'grayscale(0.15)',
                        userSelect: 'none',
                      }}
                    />
                  </div>
                )}
                {/* Felt sheen — sits above effects to preserve the 3D depth / shadow */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'radial-gradient(ellipse at 50% 18%, rgba(255,255,255,0.05) 0%, transparent 55%)',
                  pointerEvents: 'none',
                }} />
                {/* Felt inner shadow overlay — keeps the inset depth on top of effects */}
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  boxShadow: 'inset 0 8px 40px rgba(0,0,0,0.45), inset 0 -4px 20px rgba(0,0,0,0.35)',
                  borderRadius: '9999px',
                }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dealer button holder bump — top center */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: '50%', top: 'calc(5% + 4px)',
          transform: 'translateX(-50%)',
          width: 44, height: 24,
          zIndex: 5,
          borderRadius: '5px 5px 7px 7px',
          background: 'linear-gradient(180deg, #261a06 0%, #160f03 60%, #0c0902 100%)',
          boxShadow: '0 3px 10px rgba(0,0,0,0.75), inset 0 1px 2px rgba(200,160,50,0.15)',
          border: '1px solid rgba(160,120,30,0.3)',
        }}
      />

      {/* Community board — center of felt */}
      <div
        className="absolute flex items-center justify-center"
        style={{ left: '20%', top: '38%', width: '60%', height: '22%', zIndex: 25 }}
        {...(tutorialTargets ? { 'data-tutorial-target': 'community-cards' } : {})}
      >
        {hand ? (
          <PokerBoard
            communityCards={hand.communityCards}
            pot={hand.pot}
            winningCardIndices={winningCardIndices}
            dataTutorialTargetPot={dataTutorialTargetPot}
          />
        ) : (
          <span
            className="text-xl font-bold tracking-[0.25em] uppercase select-none"
            style={{ color: 'rgba(255,255,255,0.07)' }}
          >
            Morbius
          </span>
        )}
      </div>

      {/* Winner announcement — minimal banner above pot (cards stay visible with cyan highlight) */}
      <AnimatePresence>
        {isShowdownWithWinners && firstWinnerAddr && hand && (
          <motion.div
            key="winner-banner"
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-[120] w-[min(92vw,560px)]"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          >
            <div
              className="px-4 py-2 rounded-xl flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
              style={{
                background: 'linear-gradient(145deg, rgba(16, 26, 35, 0.95), rgba(35, 36, 41, 0.95))',
                boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.06), 0 4px 20px rgba(0,0,0,0.6)',
                border: '1px solid rgba(34, 211, 238, 0.35)',
              }}
            >
              <EncryptedText
                text={isCurrentPlayerWinner ? 'You win!' : `${shortAddr(firstWinnerAddr)} wins`}
                className="font-bold text-white"
                revealDelayMs={26}
                flipDelayMs={20}
                encryptedClassName="text-cyan-200/80"
                revealedClassName="text-white"
              />
              <EncryptedText
                text={`+${formatChips(winnerAmount)}`}
                className="font-semibold tabular-nums"
                revealDelayMs={22}
                flipDelayMs={18}
                encryptedClassName="text-emerald-300/80"
                revealedClassName="text-emerald-400"
              />
              {winnerHandName && (
                <EncryptedText
                  text={winnerHandName}
                  className="text-[11px] sm:text-xs uppercase tracking-wide"
                  revealDelayMs={24}
                  flipDelayMs={20}
                  encryptedClassName="text-cyan-300/70"
                  revealedClassName="text-white/75"
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chips sliding from pot to winner at showdown */}
      <AnimatePresence>
        {isShowdownWithWinners && hand?.pot && firstWinnerAnchor && (
          <motion.div
            key={`chips-to-winner-${hand.handId}`}
            className="absolute z-30 pointer-events-none"
            style={{ transform: 'translate(-50%, -50%)' }}
            initial={{
              left: `${POT_ANCHOR.fx * 100}%`,
              top: `${POT_ANCHOR.fy * 100}%`,
            }}
            animate={{
              left: `${firstWinnerAnchor.fx * 100}%`,
              top: `calc(${firstWinnerAnchor.fy * 100}% - ${winnerChipYOffsetPx}px)`,
            }}
            exit={{ opacity: 0 }}
            transition={{
              type: 'spring',
              stiffness: 80,
              damping: 18,
              delay: 0.4,
            }}
          >
            <PokerChipStack weiAmount={hand.pot} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chip stacks — between each seat and pot (hidden at showdown so only sliding pot shows) */}
      {!isShowdownWithWinners && (
      <AnimatePresence>
        {/* Iterate over seat count only — iterating SEAT_ANCHORS (10) causes ghost chips via % wrap-around */}
        {Array.from({ length: state.seats.length }, (_, displaySlot) => {
          const anchor = seatAnchors[displaySlot];
          if (!anchor) return null;
          const actualIdx = mySeatIndex >= 0
            ? (mySeatIndex + displaySlot) % state.seats.length
            : displaySlot;
          const seat = state.seats[actualIdx];
          const hasBet = toBigIntSafe(seat.currentBet ?? 0) > 0n;
          if (!hasBet) return null;

          const frac = displaySlot === 0 ? 0.55 : 0.38;
          const cfx = anchor.fx + (POT_ANCHOR.fx - anchor.fx) * frac;
          const cfy = anchor.fy + (POT_ANCHOR.fy - anchor.fy) * frac;

          return (
            <motion.div
              key={`chips-${actualIdx}`}
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
              <PokerChipStack weiAmount={seat.currentBet} />
            </motion.div>
          );
        })}
      </AnimatePresence>
      )}

      {/* Seats */}
      {state.seats.map((_, idx) => {
        const displaySlot = mySeatIndex >= 0
          ? (idx - mySeatIndex + state.seats.length) % state.seats.length
          : idx;
        const anchor = seatAnchors[displaySlot];
        if (!anchor) return null;
        const isRightAdjacentSeat = displaySlot === 1;
        const isLeftAdjacentSeat = displaySlot === state.seats.length - 1;
        const seatTranslateX = isRightAdjacentSeat
          ? RIGHT_ADJACENT_SEAT_HORIZONTAL_NUDGE_PX
          : isLeftAdjacentSeat
            ? LEFT_ADJACENT_SEAT_HORIZONTAL_NUDGE_PX
            : 0;
        const seatTranslateY = (isRightAdjacentSeat || isLeftAdjacentSeat)
          ? ADJACENT_SEAT_VERTICAL_NUDGE_PX
          : 0;
        return (
          <div
            key={idx}
            className="absolute z-20"
            style={{
              left: `${anchor.fx * 100}%`,
              top:  `${anchor.fy * 100}%`,
              transform: `translate(calc(-50% + ${seatTranslateX}px), calc(-50% + ${seatTranslateY}px))`,
            }}
            {...(tutorialTargets ? { 'data-tutorial-target': `seat-${displaySlot}` } : {})}
          >
            <PokerSeat {...seatProps(idx)} />
          </div>
        );
      })}
    </div>
  );
}
