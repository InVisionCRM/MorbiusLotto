'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { BJMultiTableState, BJMultiSeatState, BJMultiHandObj } from '@/lib/websocket-client';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { Input } from '@/components/ui/input';
import { useChat } from '@/hooks/use-chat';
import PlayingCard from '@/components/BLACKJACK/PlayingCard';
import AvatarPreview from '@/components/poker/avatar/AvatarPreview';
import type { AvatarConfig } from '@/lib/websocket-client';
import { Plus, Hand, Copy, Split, UserPlus } from 'lucide-react';
import { CardValue, Suit } from '@/app/BLACKJACK/types';
import Image from 'next/image';
import { BLACKJACK_VIDEO_BACKGROUNDS, BLACKJACK_IMAGE_BACKGROUNDS } from '@/app/BLACKJACK/constants';

const TURN_TIMEOUT = 30;
const BETTING_TIMEOUT = 15;

function resolveTheme(kind: 'video' | 'image', id: string) {
  if (kind === 'video') {
    const v = BLACKJACK_VIDEO_BACKGROUNDS.find(v => v.id === id);
    return { kind: 'video' as const, src: v?.src ?? BLACKJACK_VIDEO_BACKGROUNDS[0].src };
  }
  const img = BLACKJACK_IMAGE_BACKGROUNDS.find(i => i.id === id);
  return { kind: 'image' as const, src: img?.src ?? BLACKJACK_IMAGE_BACKGROUNDS[0].src };
}

function CircularTimerRing({ size, timeLeft, maxTime }: { size: number; timeLeft: number; maxTime: number }) {
  const pad = 5;
  const total = size + pad * 2;
  const cx = total / 2;
  const strokeWidth = 3.5;
  const radius = cx - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, timeLeft / maxTime));
  const hue = progress * 120;
  const color = `hsl(${hue}, 90%, 52%)`;
  return (
    <svg aria-hidden style={{ position: 'absolute', top: -pad, left: -pad, width: total, height: total, pointerEvents: 'none', zIndex: 5, transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cx} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
      <circle cx={cx} cy={cx} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)}
        style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }} />
    </svg>
  );
}

function useCountdown(startedAt: string | null, maxSeconds: number) {
  const [remaining, setRemaining] = useState(maxSeconds);
  useEffect(() => {
    if (!startedAt) { setRemaining(maxSeconds); return; }
    const start = new Date(startedAt).getTime();
    const tick = () => setRemaining(Math.max(0, maxSeconds - (Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [startedAt, maxSeconds]);
  return remaining;
}

const POSITIONS = [0, 1, 2] as const;
const AVATAR_SIZE = 56;

const CHIP_PRESETS = [
  { value: 500,   label: '500',  img: '/PokerChips/greenpokerchip005.png' },
  { value: 5000,  label: '5k',   img: '/PokerChips/bluepokerchip010.png' },
  { value: 25000, label: '25k',  img: '/PokerChips/redpokerchip015.png' },
  { value: 50000, label: '50k',  img: '/PokerChips/blackpokerchip000.png' },
];

function indexToCard(idx: number) {
  const rank = (idx % 13) + 1;
  const suitIdx = Math.floor(idx / 13);
  const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  return { value: rank as CardValue, suit: SUITS[suitIdx] };
}

function formatMorbius(wei: string): string {
  try {
    const n = Number(formatEther(BigInt(wei)));
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  } catch { return '0'; }
}


// ──────────────────────────────────────────────────────────────────────────────
// Seat component — cards rendered like BlackjackTable (card-overlap-player)
// ──────────────────────────────────────────────────────────────────────────────
function Seat({
  seat, position, isMe, isEmpty, isActing, phase, onTakeSeat, canTakeSeat, turnStartedAt, bettingStartedAt,
}: {
  seat: BJMultiSeatState | null; position: number; isMe: boolean; isEmpty: boolean;
  isActing: boolean; phase: string; onTakeSeat: () => void; canTakeSeat: boolean;
  turnStartedAt: string | null; bettingStartedAt: string | null;
}) {
  const turnRemaining = useCountdown(isActing ? turnStartedAt : null, TURN_TIMEOUT);
  const betRemaining = useCountdown(phase === 'betting' && !isEmpty ? bettingStartedAt : null, BETTING_TIMEOUT);
  const resultColor = (r: string | null | undefined) =>
    r === 'win' || r === 'blackjack' ? 'text-green-400' :
    r === 'loss' ? 'text-red-400' :
    r === 'push' ? 'text-yellow-400' : '';

  return (
    <div className="flex flex-col items-center gap-2 min-w-0">
      {/* Cards area */}
      {isEmpty ? (
        <div
          className={`flex flex-col items-center justify-center gap-2 rounded-2xl px-4 py-6 min-h-[120px] border-2 border-dashed transition-all cursor-pointer ${
            canTakeSeat ? 'border-white/20 hover:border-cyan-400/50 hover:bg-cyan-900/10' : 'border-white/10'
          }`}
          onClick={canTakeSeat ? onTakeSeat : undefined}
        >
          {canTakeSeat && (
            <>
              <UserPlus className="w-6 h-6 text-white/30" />
              <span className="text-xs text-white/30">Seat {position + 1}</span>
            </>
          )}
          {!canTakeSeat && <span className="text-xs text-white/20">Seat {position + 1}</span>}
        </div>
      ) : (
        <>
          {/* Hands */}
          {seat && seat.hands.length > 0 ? (
            <div className="flex flex-col items-center gap-3">
              {seat.hands.map((hand, hi) => (
                <div key={hi} className="flex flex-col items-center gap-1">
                  <div className="flex items-center">
                    {/* Cards with overlap */}
                    <div className="flex">
                      {hand.cards.map((c, ci) => (
                        <div key={ci} className={ci > 0 ? 'card-overlap-player' : ''} style={{ zIndex: ci }}>
                          <PlayingCard card={indexToCard(c)} owner="player" className="" />
                        </div>
                      ))}
                    </div>
                    {/* Score counter */}
                    <div className={`ml-2 flex items-center gap-1 ${isActing && seat.activeHandIndex === hi ? 'card-counter-active' : ''}`}
                      style={{ padding: isActing && seat.activeHandIndex === hi ? '6px' : '3px' }}>
                      <span className={`font-black text-2xl ${hand.isBust ? 'text-red-400' : hand.isBlackjack ? 'text-yellow-400' : 'text-white'}`}>
                        {hand.isBust ? 'BUST' : hand.isBlackjack ? 'BJ!' : hand.total}
                      </span>
                    </div>
                  </div>
                  {/* Result */}
                  {hand.result && (
                    <div className={`text-xs font-bold ${resultColor(hand.result)}`}>
                      {hand.result === 'blackjack' ? 'Blackjack! 🎉' :
                       hand.result === 'win' ? `Won +${formatMorbius(hand.payout)}` :
                       hand.result === 'loss' ? 'Lost' : 'Push'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* Placeholder cards when seated but no hand yet */
            <div className="flex gap-0 min-h-[80px] items-center justify-center">
              {phase !== 'waiting' && phase !== 'betting' ? null : (
                <div className="w-16 h-24 rounded-lg border border-dashed border-white/10" />
              )}
            </div>
          )}

          {/* Chip stack for bet */}
          {seat && BigInt(seat.pendingBet) > 0n && (
            <div className="flex flex-col items-center">
              <div className="relative w-10 h-10">
                <div className="w-10 h-10 rounded-full"
                  style={{ background: `url('/PokerChips/greenpokerchip005.png') center/contain no-repeat` }} />
              </div>
              <span className="text-white text-xs font-bold mt-0.5" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>
                {formatMorbius(seat.pendingBet)}
              </span>
            </div>
          )}

          {/* Player avatar with circular timer ring */}
          <div className="flex flex-col items-center gap-1">
            <div className="relative" style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>
              {/* Turn timer ring */}
              {isActing && <CircularTimerRing size={AVATAR_SIZE} timeLeft={turnRemaining} maxTime={TURN_TIMEOUT} />}
              {/* Betting timer ring */}
              {!isActing && phase === 'betting' && <CircularTimerRing size={AVATAR_SIZE} timeLeft={betRemaining} maxTime={BETTING_TIMEOUT} />}
              <div className="w-full h-full rounded-full overflow-hidden bg-slate-800"
                style={{ border: isMe ? '2px solid rgba(34,211,238,0.6)' : isActing ? '2px solid transparent' : '2px solid rgba(255,255,255,0.15)' }}>
                {seat?.avatarConfig ? (
                  <AvatarPreview config={seat.avatarConfig as unknown as AvatarConfig} emotion="neutral" className="w-full h-full" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-bold text-slate-400">
                    {seat?.displayName?.[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
              </div>
            </div>
            <span className={`text-xs font-medium truncate max-w-[90px] ${isMe ? 'text-cyan-300' : 'text-white/80'}`}>
              {seat?.displayName ?? (seat?.playerAddress ? seat.playerAddress.slice(0, 6) + '…' : '—')}
              {isMe && <span className="text-[9px] text-white/40 ml-1">(you)</span>}
            </span>
          </div>

          {seat?.seatStatus === 'sitting_out' && (
            <span className="text-[9px] text-white/30">sitting out</span>
          )}
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────────────────────
export default function BlackjackMultiTablePage() {
  const params = useParams();
  const tableId = typeof params.tableId === 'string' ? params.tableId : '';
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [state, setState] = useState<BJMultiTableState | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsClientRef = useRef<BlackjackWebSocketClient | null>(null);
  const [wsClient, setWsClient] = useState<BlackjackWebSocketClient | null>(null);

  // Bet panel state
  const [betAmount, setBetAmount] = useState(0); // whole MORBIUS

  const roomId = `blackjack:table:${tableId}`;
  const { messages: chatMessages, sendMessage: sendChatMessage } = useChat(roomId, { wsClient, wsConnected });

  const mySeat = state?.seats.find(s =>
    s.playerAddress && address && s.playerAddress.toLowerCase() === address.toLowerCase()
  ) ?? null;
  const myPosition = mySeat?.position ?? null;
  const isMyTurn = mySeat !== null && state?.phase === 'playing' && state?.actingSeatPosition === myPosition;
  const activeHand: BJMultiHandObj | null = mySeat ? mySeat.hands[mySeat.activeHandIndex] ?? null : null;
  const hasBet = mySeat ? BigInt(mySeat.pendingBet) > 0n : false;

  useEffect(() => {
    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl || !address) return;
    const client = new BlackjackWebSocketClient(wsUrl, address, signTypedDataAsync as any);
    client.on('disconnected', () => setWsConnected(false));
    client.on('error', (err: any) => setError(err?.message || 'Connection error'));
    client.on('bj_multi_table_state', (p: BJMultiTableState) => setState(p));

    client.connect()
      .then(async () => {
        setWsConnected(true); setError(null);
        await client.sendRequest('join_room', { roomId: `blackjack:table:${tableId}` }).catch(() => {});
        try { setState(await client.sendRequest('bj_multi_get_state', { tableId }) as BJMultiTableState); }
        catch { setError('Failed to load table state'); }
      })
      .catch((err: any) => setError(err?.message || 'Connection failed'));
    wsClientRef.current = client; setWsClient(client);
    return () => { client.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, address]);

  const takeSeat = useCallback(async (pos: number) => {
    if (!wsClient?.isConnected() || !address) return;
    try { await wsClient.sendRequest('bj_multi_join_table', { tableId, seatPosition: pos }); }
    catch (e) { setError((e as Error).message); }
  }, [wsClient, tableId, address]);

  const leaveSeat = useCallback(async () => {
    if (!wsClient?.isConnected()) return;
    try { await wsClient.sendRequest('bj_multi_leave_table', { tableId }); }
    catch (e) { setError((e as Error).message); }
  }, [wsClient, tableId]);

  const placeBet = useCallback(async () => {
    if (!wsClient?.isConnected() || betAmount <= 0) return;
    try { await wsClient.sendRequest('bj_multi_place_bet', { tableId, amount: parseEther(String(betAmount)).toString() }); }
    catch (e) { setError((e as Error).message); }
  }, [wsClient, tableId, betAmount]);

  const doAction = useCallback(async (action: 'hit' | 'stand' | 'double_down' | 'split') => {
    if (!wsClient?.isConnected()) return;
    try { await wsClient.sendRequest('bj_multi_action', { tableId, action, handIndex: mySeat?.activeHandIndex ?? 0 }); }
    catch (e) { setError((e as Error).message); }
  }, [wsClient, tableId, mySeat]);

  const minBetNum = state?.minBet ? Math.ceil(Number(formatEther(BigInt(state.minBet)))) : 500;
  const maxBetNum = state?.maxBet ? Math.floor(Number(formatEther(BigInt(state.maxBet)))) : 50000;
  const filteredChips = CHIP_PRESETS.filter(c => c.value <= maxBetNum);
  const theme = resolveTheme(state?.themeKind ?? 'video', state?.themeId ?? 'glowingTable');

  if (!tableId) return null;

  return (
    <GlobalMainNav page="blackjack" showBackArrow backArrowHref="/blackjack-multi" backArrowLabel="Lobby">
      {/* ── Table container — locked to 16:9 so full table image is always visible ── */}
      <div
        className="relative w-full blackjack-table flex flex-col"
        style={{
          aspectRatio: '16 / 9',
          boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.9), inset 0 -2px 8px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.3)',
          border: '1px inset rgba(60,60,60,0.5)',
        }}
      >
        {/* Table background — video or image based on admin theme selection */}
        {theme.kind === 'video' ? (
          <video key={theme.src} autoPlay muted loop playsInline
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            style={{ zIndex: 0 }}>
            <source src={theme.src} type="video/mp4" />
          </video>
        ) : (
          <Image src={theme.src} alt="Table" fill className="absolute inset-0 object-contain pointer-events-none" style={{ zIndex: 0 }} priority unoptimized />
        )}

        {/* Dark overlay */}
        <div className="absolute inset-0" style={{ zIndex: 1, background: 'linear-gradient(145deg, rgba(0,0,0,0.22), rgba(0,0,0,0.12))' }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col flex-1">

          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-2 bg-black/30 backdrop-blur-sm">
            <div className="text-xs text-white/50">
              {state ? `Round #${state.roundNumber} · ${formatMorbius(state.minBet ?? '0')}–${formatMorbius(state.maxBet ?? '0')} MORBIUS` : 'Multiplayer Blackjack'}
            </div>
            <div className="flex items-center gap-2">
              {state && (
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                  state.phase === 'betting'     ? 'bg-yellow-900/80 text-yellow-300' :
                  state.phase === 'playing'     ? 'bg-green-900/80 text-green-300' :
                  state.phase === 'dealer_turn' ? 'bg-blue-900/80 text-blue-300' :
                  'bg-white/10 text-white/60'
                }`}>
                  {state.phase === 'waiting'     ? 'Waiting for players' :
                   state.phase === 'betting'     ? 'Place your bets' :
                   state.phase === 'playing'     ? 'Players acting' :
                   state.phase === 'dealer_turn' ? 'Dealer turn' : 'Round complete'}
                </span>
              )}
              {myPosition !== null && (
                <button onClick={leaveSeat} className="text-xs text-white/40 hover:text-red-400 transition-colors">
                  Leave seat
                </button>
              )}
            </div>
          </div>

          {!wsConnected && (
            <div className="bg-black/60 text-amber-400 text-xs text-center py-1.5 animate-pulse">
              {address ? 'Connecting…' : 'Connect your wallet to play'}
            </div>
          )}
          {error && <div className="bg-red-900/80 text-red-200 text-xs text-center py-1 px-4">{error}</div>}

          {/* ── Play area ── */}
          <div className="flex-1 flex flex-col justify-center items-center gap-8 sm:gap-4 px-4 pb-4">

            {/* DEALER — same translateY as BlackjackTable */}
            <div className="flex items-center justify-center" style={{ transform: 'translateY(-20px)' }}>
              <div className="flex">
                {(state?.dealerCards ?? []).map((c, i) => (
                  <div key={i} className={i > 0 ? 'card-overlap-dealer' : ''} style={{ zIndex: i }}>
                    <PlayingCard card={indexToCard(c)} owner="dealer" className="" />
                  </div>
                ))}
                {/* Hidden hole card placeholder */}
                {state && state.dealerCardCount > (state.dealerCards?.length ?? 0) && (
                  <div className="card-overlap-dealer" style={{ zIndex: 1 }}>
                    <PlayingCard card={{ value: 1, suit: 'spades' }} owner="dealer" hidden className="" />
                  </div>
                )}
                {/* Empty placeholders before deal */}
                {(!state || state.dealerCardCount === 0) && (
                  <>
                    <div className="w-16 h-24 rounded-lg border border-dashed border-white/10 mr-[-28px]" />
                    <div className="w-16 h-24 rounded-lg border border-dashed border-white/10" />
                  </>
                )}
              </div>
              {/* Dealer score */}
              {state && state.dealerCardCount > 0 && ['dealer_turn', 'completed'].includes(state.phase) && state.dealerTotal > 0 && (
                <div className="ml-3 flex items-center gap-1">
                  <span className={`font-black text-3xl ${state.dealerTotal > 21 ? 'text-red-400' : 'text-white'}`}>
                    {state.dealerTotal > 21 ? 'BUST' : state.dealerTotal}
                  </span>
                </div>
              )}
            </div>

            {/* 3 SEATS — same translateY offset as BlackjackTable player row */}
            <div className="grid grid-cols-3 gap-4 sm:gap-8 w-full max-w-3xl" style={{ transform: 'translateY(30px)' }}>
              {POSITIONS.map(pos => {
                const seat = state?.seats.find(s => s.position === pos);
                const isEmpty = !seat?.playerAddress;
                const isMe = seat?.playerAddress?.toLowerCase() === address?.toLowerCase();
                return (
                  <Seat
                    key={pos}
                    seat={seat ?? null}
                    position={pos}
                    isMe={isMe}
                    isEmpty={isEmpty}
                    isActing={state?.actingSeatPosition === pos && state?.phase === 'playing'}
                    phase={state?.phase ?? 'waiting'}
                    onTakeSeat={() => takeSeat(pos)}
                    canTakeSeat={!!address && myPosition === null && isEmpty && wsConnected}
                    turnStartedAt={state?.actingSeatPosition === pos ? state?.turnStartedAt ?? null : null}
                    bettingStartedAt={state?.bettingStartedAt ?? null}
                  />
                );
              })}
            </div>
          </div>

          {/* ── Bottom controls — same style as BlackjackMobileActionBar ── */}
          <div className="px-4 pb-4 pt-2 space-y-2">

            {/* BETTING PHASE: chip panel + Confirm bet */}
            {state?.phase === 'betting' && myPosition !== null && !hasBet && (
              <div className="w-full max-w-md mx-auto space-y-2">
                {/* Chip row */}
                <div className="grid grid-cols-5 gap-1 sm:gap-2 place-items-center">
                  {filteredChips.map(chip => (
                    <button
                      key={chip.value}
                      onClick={() => setBetAmount(a => Math.min(maxBetNum, a + chip.value))}
                      className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-bold text-[10px] sm:text-xs transition-all hover:scale-110 active:scale-95 shadow-md"
                      style={{ background: `url('${chip.img}') center/contain no-repeat`, border: '1px solid rgba(36,30,30,0.5)' }}
                    >
                      <span className="text-white font-bold z-10 relative" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.8)', fontSize: chip.value >= 25000 ? '8px' : undefined }}>
                        {chip.label}
                      </span>
                    </button>
                  ))}
                  <button onClick={() => setBetAmount(0)} className="text-[10px] sm:text-xs text-cyan-300/80 font-bold uppercase tracking-wider hover:text-cyan-300 transition-colors">
                    Clear
                  </button>
                </div>

                {/* Amount display + Confirm */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-center bg-black/40 rounded-xl py-2 border border-white/10">
                    <span className="text-white font-black text-xl" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      {betAmount.toLocaleString()}
                    </span>
                    <span className="text-white/50 text-xs ml-1">MORBIUS</span>
                  </div>
                  <button
                    onClick={placeBet}
                    disabled={betAmount < minBetNum}
                    className="px-6 py-2 rounded-xl font-black text-sm tracking-wider transition-all active:scale-95 disabled:opacity-40"
                    style={{
                      background: betAmount >= minBetNum ? 'linear-gradient(180deg, #22c55e 0%, #16a34a 50%, #15803d 100%)' : 'rgba(0,0,0,0.4)',
                      boxShadow: betAmount >= minBetNum ? '0 4px 0 0 rgba(0,0,0,0.25)' : 'none',
                    }}
                  >
                    <span className="text-white">CONFIRM BET</span>
                  </button>
                </div>
              </div>
            )}

            {/* Bet placed — waiting */}
            {state?.phase === 'betting' && myPosition !== null && hasBet && (
              <div className="text-center py-3 text-green-400 font-semibold text-sm">
                ✓ Bet placed ({formatMorbius(mySeat?.pendingBet ?? '0')} MORBIUS) — waiting for round to start…
              </div>
            )}

            {/* MY TURN — action buttons, same style as BlackjackMobileActionBar */}
            {isMyTurn && activeHand && (
              <div className="w-full max-w-md mx-auto">
                <style>{`.multi-action-btn:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 1px 0 0 rgba(0,0,0,0.25) !important; }`}</style>
                <div className="grid grid-cols-4 gap-2">
                  {/* HIT */}
                  <button onClick={() => doAction('hit')} disabled={!activeHand.canHit}
                    className="multi-action-btn h-14 flex flex-col items-center justify-center rounded-xl border-2 border-red-400/50 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(180deg, #ef4444 0%, #b91c1c 50%, #991b1b 100%)', boxShadow: activeHand.canHit ? '0 4px 0 0 rgba(0,0,0,0.25)' : 'none' }}>
                    <Plus className="w-5 h-5 text-white drop-shadow-sm" strokeWidth={2.5} />
                    <span className="text-white text-[10px] font-medium">Hit</span>
                  </button>
                  {/* STAND */}
                  <button onClick={() => doAction('stand')} disabled={!activeHand.canStand}
                    className="multi-action-btn h-14 flex flex-col items-center justify-center rounded-xl border-2 border-blue-400/50 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%)', boxShadow: activeHand.canStand ? '0 4px 0 0 rgba(0,0,0,0.25)' : 'none' }}>
                    <Hand className="w-5 h-5 text-white drop-shadow-sm" strokeWidth={2.5} />
                    <span className="text-white text-[10px] font-medium">Stand</span>
                  </button>
                  {/* DOUBLE */}
                  <button onClick={() => doAction('double_down')} disabled={!activeHand.canDoubleDown}
                    className="multi-action-btn h-14 flex flex-col items-center justify-center rounded-xl border-2 border-amber-400/50 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(180deg, #f59e0b 0%, #d97706 50%, #b45309 100%)', boxShadow: activeHand.canDoubleDown ? '0 4px 0 0 rgba(0,0,0,0.25)' : 'none' }}>
                    <Copy className="w-5 h-5 text-white drop-shadow-sm" strokeWidth={2.5} />
                    <span className="text-white text-[10px] font-medium">Double</span>
                  </button>
                  {/* SPLIT */}
                  <button onClick={() => doAction('split')} disabled={!activeHand.canSplit}
                    className="multi-action-btn h-14 flex flex-col items-center justify-center rounded-xl border-2 border-emerald-400/50 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(180deg, #10b981 0%, #059669 50%, #047857 100%)', boxShadow: activeHand.canSplit ? '0 4px 0 0 rgba(0,0,0,0.25)' : 'none' }}>
                    <Split className="w-5 h-5 text-white drop-shadow-sm" strokeWidth={2.5} />
                    <span className="text-white text-[10px] font-medium">Split</span>
                  </button>
                </div>
              </div>
            )}

            {/* Not seated CTA */}
            {state && myPosition === null && address && wsConnected && (
              <div className="text-center text-white/40 text-sm py-2">
                {state.seats.every(s => s.playerAddress) ? 'Table full — spectating' : 'Click an empty seat to join'}
              </div>
            )}

            {/* Chat */}
            <div className="mt-2 bg-black/40 border border-white/10 rounded-xl p-3 max-h-28 flex flex-col backdrop-blur-sm">
              <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0">
                {chatMessages.slice(-10).map(m => (
                  <div key={m.id} className="text-xs text-white/70">
                    <span className="text-cyan-400">{m.displayName ?? m.senderAddress?.slice(0, 6)}: </span>
                    {m.text}
                  </div>
                ))}
              </div>
              {address && wsConnected && <ChatInput onSend={sendChatMessage} />}
            </div>
          </div>

        </div>
      </div>
    </GlobalMainNav>
  );
}

function ChatInput({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <form className="flex gap-2 mt-1.5"
      onSubmit={e => { e.preventDefault(); if (text.trim()) { onSend(text.trim()); setText(''); } }}>
      <Input value={text} onChange={e => setText(e.target.value)} placeholder="Table chat…"
        className="h-7 text-xs bg-white/10 border-white/20 text-slate-200 placeholder:text-white/30" maxLength={200} />
      <button type="submit" className="px-3 h-7 text-xs rounded-md bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-colors">
        Send
      </button>
    </form>
  );
}
