'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { getWebSocketUrlOptional, getApiUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { BJMultiTableState, BJMultiSeatState, BJMultiHandObj } from '@/lib/websocket-client';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { Input } from '@/components/ui/input';
import { useChat } from '@/hooks/use-chat';
import PlayingCard from '@/components/BLACKJACK/PlayingCard';
import WinNotification from '@/components/BLACKJACK/WinNotification';
import { BlackjackMobileActionBar } from '@/components/BLACKJACK/BlackjackMobileActionBar';
import { BettingPanelMobile } from '@/components/BLACKJACK/BettingPanelMobile';
import { PlayerStatsDashboard } from '@/components/BLACKJACK/PlayerStatsDashboard';
import AvatarPreview from '@/components/poker/avatar/AvatarPreview';
import type { Emotion } from '@/components/poker/avatar/AvatarPreview';
import type { AvatarConfig } from '@/lib/websocket-client';
import { UserPlus, MessageCircle, ChevronDown, Volume2, VolumeX } from 'lucide-react';
import { CardValue, Suit } from '@/app/BLACKJACK/types';
import Image from 'next/image';
import { BLACKJACK_VIDEO_BACKGROUNDS, BLACKJACK_IMAGE_BACKGROUNDS, SOUNDS_BETTING_OPEN, SOUNDS_BETTING_CLOSED, SOUNDS_DEALER_PHRASE, SOUNDS_PLAYER_WINS, SOUNDS_DEALER_WINS, SOUNDS_TIP, SOUND_PUSH, SOUND_PLAYER_BLACKJACK, pickRandom } from '@/app/BLACKJACK/constants';
import { useAudio, AudioManager } from '@/hooks/use-audio';
import { usePlayerStatsEnhanced } from '@/hooks/use-blackjack-stats';

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

// Avatar animation constants — matches poker system
const AVATAR_EMOTION_DURATION_MS = 3000;
const AVATAR_EMOTION_WINK_MS = 1200;
const AVATAR_ANIMATIONS: { title: string; emotion: Emotion }[] = [
  { title: 'Happy',     emotion: 'happy'     },
  { title: 'Wink',      emotion: 'wink'      },
  { title: 'Surprised', emotion: 'surprised' },
  { title: 'Angry',     emotion: 'angry'     },
  { title: 'Sad',       emotion: 'sad'       },
  { title: 'Dance',     emotion: 'dance'     },
  { title: 'Jackpot',   emotion: 'jackpot'   },
  { title: 'Sink',      emotion: 'sink'      },
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
  seat, position, isMe, isEmpty, isActing, phase, onTakeSeat, canTakeSeat, turnStartedAt, bettingStartedAt, balanceLabel,
}: {
  seat: BJMultiSeatState | null; position: number; isMe: boolean; isEmpty: boolean;
  isActing: boolean; phase: string; onTakeSeat: () => void; canTakeSeat: boolean;
  turnStartedAt: string | null; bettingStartedAt: string | null;
  balanceLabel?: string | null;
}) {
  const turnRemaining = useCountdown(isActing ? turnStartedAt : null, TURN_TIMEOUT);
  const betRemaining = useCountdown(phase === 'betting' && !isEmpty ? bettingStartedAt : null, BETTING_TIMEOUT);
  const resultColor = (r: string | null | undefined) =>
    r === 'win' || r === 'blackjack' ? 'text-green-400' :
    r === 'loss' ? 'text-red-400' :
    r === 'push' ? 'text-yellow-400' : '';

  // Avatar animations — matches poker system
  const [localEmotion, setLocalEmotion] = useState<Emotion | null>(null);
  const [animPickerOpen, setAnimPickerOpen] = useState(false);
  const localEmotionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-emotion based on round result
  const resultEmotion: Emotion = useMemo(() => {
    if (!seat?.result) return 'neutral';
    if (seat.result === 'blackjack') return 'jackpot';
    if (seat.result === 'win') return 'happy';
    if (seat.result === 'loss') return 'sad';
    if (seat.result === 'push') return 'surprised';
    return 'neutral';
  }, [seat?.result]);

  // Priority: local pick > result-driven > neutral
  const activeEmotion: Emotion = localEmotion ?? (phase === 'completed' ? resultEmotion : 'neutral');

  // Close animation picker when phase changes
  useEffect(() => { setAnimPickerOpen(false); }, [phase]);

  const handleAnimationSelect = useCallback((emotion: Emotion) => {
    setAnimPickerOpen(false);
    setLocalEmotion(emotion);
    if (localEmotionTimerRef.current) clearTimeout(localEmotionTimerRef.current);
    localEmotionTimerRef.current = setTimeout(() => {
      setLocalEmotion(null);
    }, emotion === 'wink' ? AVATAR_EMOTION_WINK_MS : AVATAR_EMOTION_DURATION_MS);
  }, []);

  return (
    <div className="relative flex flex-col items-center gap-2 min-w-0">
      {/* Cards area */}
      {isEmpty ? (
        <div
          className={`flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-4 min-h-[80px] border-2 border-dashed transition-all cursor-pointer ${
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
                          <PlayingCard card={indexToCard(c)} owner="player" className="" size="small" />
                        </div>
                      ))}
                    </div>
                    {/* Score counter */}
                    <div className={`ml-1 flex items-center gap-1 ${isActing && seat.activeHandIndex === hi ? 'card-counter-active' : ''}`}
                      style={{ padding: isActing && seat.activeHandIndex === hi ? '4px' : '2px' }}>
                      <span className={`font-black text-lg ${hand.isBust ? 'text-red-400' : hand.isBlackjack ? 'text-yellow-400' : 'text-white'}`}>
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
            <div className="flex gap-0 min-h-[60px] items-center justify-center">
              {phase !== 'waiting' && phase !== 'betting' ? null : (
                <div className="w-14 h-20 rounded-lg border border-dashed border-white/10" />
              )}
            </div>
          )}

          {/* Chip stack for bet */}
          {seat && BigInt(seat.pendingBet) > 0n && (
            <div className="flex flex-col items-center">
              <div className="relative w-7 h-7">
                <div className="w-7 h-7 rounded-full"
                  style={{ background: `url('/PokerChips/greenpokerchip005.png') center/contain no-repeat` }} />
              </div>
              <span className="text-white text-xs font-bold mt-0.5" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>
                {formatMorbius(seat.pendingBet)}
              </span>
            </div>
          )}

          {seat?.seatStatus === 'sitting_out' && (
            <span className="text-[9px] text-white/30">sitting out</span>
          )}

          {/* Player avatar + name — pinned to bottom */}
          <div className="absolute bottom-[-32px] left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            <div className="relative flex-shrink-0" style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>
              {isActing && <CircularTimerRing size={AVATAR_SIZE} timeLeft={turnRemaining} maxTime={TURN_TIMEOUT} />}
              {!isActing && phase === 'betting' && <CircularTimerRing size={AVATAR_SIZE} timeLeft={betRemaining} maxTime={BETTING_TIMEOUT} />}
              <div
                className="w-full h-full rounded-full overflow-hidden bg-slate-800"
                style={{ border: isMe ? '2px solid rgba(34,211,238,0.6)' : isActing ? '2px solid transparent' : '2px solid rgba(255,255,255,0.15)', cursor: isMe ? 'pointer' : 'default' }}
                onClick={isMe ? () => setAnimPickerOpen(o => !o) : undefined}
              >
                {seat?.avatarConfig ? (
                  <AvatarPreview
                    config={seat.avatarConfig as unknown as AvatarConfig}
                    emotion={activeEmotion}
                    trackMouse={isMe}
                    roamEyes={!isMe && !isActing}
                    forceAsleep={seat?.seatStatus === 'sitting_out'}
                    compact
                    className="w-full h-full"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-400">
                    {seat?.displayName?.[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
              </div>

              {/* Animation picker — appears above avatar on click (current player only) */}
              {isMe && animPickerOpen && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 bg-black/90 border border-white/20 rounded-lg p-1.5 backdrop-blur-md"
                  style={{ width: 160 }}
                >
                  <div className="grid grid-cols-4 gap-1">
                    {AVATAR_ANIMATIONS.map(({ title, emotion }) => (
                      <button
                        key={emotion}
                        type="button"
                        onClick={() => handleAnimationSelect(emotion)}
                        className="flex flex-col items-center gap-0.5 p-1 rounded hover:bg-white/10 transition-colors"
                        title={title}
                      >
                        <div className="w-7 h-7 rounded-full overflow-hidden">
                          {seat?.avatarConfig && (
                            <AvatarPreview
                              config={seat.avatarConfig as unknown as AvatarConfig}
                              emotion={emotion}
                              compact
                              className="w-full h-full"
                            />
                          )}
                        </div>
                        <span className="text-[7px] text-white/50 leading-none">{title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className={`text-[10px] font-medium truncate max-w-[80px] leading-tight ${isMe ? 'text-cyan-300' : 'text-white/80'}`}>
                {seat?.displayName ?? (seat?.playerAddress ? seat.playerAddress.slice(0, 6) + '…' : '—')}
                {isMe && <span className="text-[8px] text-white/40 ml-0.5">(you)</span>}
              </span>
              {balanceLabel != null && (
                <span className="text-[9px] text-white/50 tabular-nums leading-tight">{balanceLabel}</span>
              )}
            </div>
          </div>
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
  const stateRef = useRef<BJMultiTableState | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'failed'>('connecting');
  const [reconnectInfo, setReconnectInfo] = useState<{ attempt: number; maxAttempts: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roundHistory, setRoundHistory] = useState<any[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [tipNotification, setTipNotification] = useState<{ name: string } | null>(null);
  const [tipAnimating, setTipAnimating] = useState(false);
  const wsClientRef = useRef<BlackjackWebSocketClient | null>(null);
  const [wsClient, setWsClient] = useState<BlackjackWebSocketClient | null>(null);

  // Bet panel state — string to match BettingPanelMobile interface
  const [betAmount, setBetAmount] = useState('0'); // whole MORBIUS

  // Sound effects
  const [soundEnabled, setSoundEnabled] = useState(true);
  const { playSound } = useAudio(soundEnabled);
  const dealerVoiceRef = useRef<{ source: AudioBufferSourceNode; gain: GainNode } | null>(null);
  const prevSeatAddrsRef = useRef<(string | null)[]>([null, null, null]);

  // Play a dealer voice line on a dedicated channel (stops any currently playing voice)
  const playDealerVoice = useCallback(async (path: string, volume = 0.5) => {
    if (!soundEnabled) return;
    // Stop any currently playing dealer voice
    if (dealerVoiceRef.current) {
      try { dealerVoiceRef.current.source.stop(); } catch { /* already stopped */ }
      dealerVoiceRef.current = null;
    }
    // Reuse the global AudioContext from AudioManager
    const ctx = AudioManager.getContext();
    if (!ctx || ctx.state !== 'running') { playSound(path, volume); return; }
    try {
      const buf = await AudioManager.loadSound(path);
      if (!buf) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buf;
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.onended = () => { if (dealerVoiceRef.current?.source === source) dealerVoiceRef.current = null; };
      source.start(0);
      dealerVoiceRef.current = { source, gain };
    } catch {
      playSound(path, volume);
    }
  }, [soundEnabled, playSound]);

  // Dealer random phrase timer during betting
  const dealerPhraseTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Player stats — combined single + multiplayer via updated SQL functions
  const { data: playerStatsData, isLoading: playerStatsLoading } = usePlayerStatsEnhanced();
  const playerStats = playerStatsData ? {
    totalGames: Number(playerStatsData.total_games) || 0,
    totalBet: playerStatsData.total_bet || BigInt(0),
    totalWin: playerStatsData.total_win || BigInt(0),
    winRate: Number(playerStatsData.win_rate) || 0,
    blackjackCount: Number(playerStatsData.blackjack_count) || 0,
    currentStreak: Number(playerStatsData.current_streak) || 0,
    bestStreak: Number(playerStatsData.best_streak) || 0,
    biggestWin: playerStatsData.biggest_win || BigInt(0),
    biggestLoss: playerStatsData.biggest_loss || BigInt(0),
    averageBet: Number(playerStatsData.average_bet) || 0,
    averagePayout: Number(playerStatsData.average_payout) || 0,
    profitLoss: Number(formatEther(playerStatsData.profit_loss || BigInt(0))),
    roi: Number(playerStatsData.roi) || 0,
    gamesToday: Number(playerStatsData.games_today) || 0,
    gamesThisWeek: Number(playerStatsData.games_this_week) || 0,
    favoriteBetAmount: Number(formatEther(playerStatsData.favorite_bet_amount || BigInt(0))),
    lastGameTimestamp: playerStatsData.last_game_timestamp ? new Date(playerStatsData.last_game_timestamp).getTime() : undefined,
  } : null;

  // Chat dropdown overlay
  const [chatOpen, setChatOpen] = useState(false);

  // Win notification — reuses WinNotification from single player
  const [showWin, setShowWin] = useState<{ amount: bigint; isBlackjack: boolean } | null>(null);
  const prevPhaseRef = useRef<string>('');

  // Progressive dealer card reveal — matches single-player BlackjackTable behavior
  const [visibleDealerCards, setVisibleDealerCards] = useState(0);
  const prevDealerCardCountRef = useRef(0);
  const dealerRevealTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Platform balance (for display under avatar when seated)
  const [playerBalance, setPlayerBalance] = useState<bigint>(0n);

  const fetchBalance = useCallback(async () => {
    const apiUrl = getApiUrlOptional();
    if (!apiUrl || !address) return;
    try {
      const res = await fetch(`${apiUrl}/api/player/${address}/balance`);
      if (!res.ok) return;
      const data = await res.json();
      setPlayerBalance(BigInt(data?.balance ?? 0));
    } catch {
      // ignore
    }
  }, [address]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // Sound effects + win notification on phase transitions
  useEffect(() => {
    if (!state) return;
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;
    if (!prevPhase) return;

    // ── Betting opens: announce + schedule a random dealer phrase ──
    if (prevPhase !== 'betting' && state.phase === 'betting') {
      playDealerVoice(pickRandom(SOUNDS_BETTING_OPEN));
      // Clear any lingering phrase timer
      if (dealerPhraseTimerRef.current) clearTimeout(dealerPhraseTimerRef.current);
      // Play a random dealer phrase partway through the betting window
      dealerPhraseTimerRef.current = setTimeout(() => {
        playDealerVoice(pickRandom(SOUNDS_DEALER_PHRASE));
      }, 5000 + Math.random() * 4000); // 5–9s into betting
    }

    // ── Betting closes → dealing: stop any phrase, announce, then deal sound ──
    if (prevPhase === 'betting' && state.phase === 'playing') {
      if (dealerPhraseTimerRef.current) { clearTimeout(dealerPhraseTimerRef.current); dealerPhraseTimerRef.current = null; }
      playDealerVoice(pickRandom(SOUNDS_BETTING_CLOSED));
      // Card deal sound slightly after the voice starts
      setTimeout(() => playSound('/BlackJack/sounds/cards.wav'), 600);
    }

    // ── Cards dealt sound for non-betting→playing transitions ──
    if (prevPhase !== 'betting' && prevPhase !== 'playing' && state.phase === 'playing') {
      playSound('/BlackJack/sounds/cards.wav');
    }

    // ── Round completes: outcome voice lines + WinNotification ──
    if (prevPhase !== 'completed' && state.phase === 'completed') {
      const seat = state.seats.find(s =>
        s.playerAddress && address && s.playerAddress.toLowerCase() === address.toLowerCase()
      );
      if (seat && seat.hands.length > 0) {
        const totalPayout = BigInt(seat.payout || '0');
        const hasBlackjack = seat.hands.some(h => h.result === 'blackjack');
        const hasWin = seat.hands.some(h => h.result === 'win' || h.result === 'blackjack');
        const allLoss = seat.hands.every(h => h.result === 'loss');
        const allPush = seat.hands.every(h => h.result === 'push');

        if (hasBlackjack) {
          playDealerVoice(SOUND_PLAYER_BLACKJACK);
          setShowWin({ amount: totalPayout, isBlackjack: true });
        } else if (hasWin) {
          playDealerVoice(pickRandom(SOUNDS_PLAYER_WINS));
          setShowWin({ amount: totalPayout, isBlackjack: false });
        } else if (allPush) {
          playDealerVoice(SOUND_PUSH);
        } else if (allLoss) {
          playDealerVoice(pickRandom(SOUNDS_DEALER_WINS));
        }
      }
      fetchBalance();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, address]);

  // Play join/leave sounds when seat occupancy changes
  useEffect(() => {
    if (!state) return;
    const current = state.seats.map(s => s.playerAddress?.toLowerCase() ?? null);
    const prev = prevSeatAddrsRef.current;
    for (let i = 0; i < 3; i++) {
      if (!prev[i] && current[i]) {
        // Someone joined
        if (current[i] !== address?.toLowerCase()) playSound('/Poker/PokerSounds/OpponentJoined.mp3');
      } else if (prev[i] && !current[i]) {
        // Someone left
        if (prev[i] !== address?.toLowerCase()) playSound('/Poker/PokerSounds/OpponentLeft.mp3');
      }
    }
    prevSeatAddrsRef.current = current;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.seats]);

  // Progressive dealer card reveal — matches single-player BlackjackTable
  // During 'playing': show 1 card + face-down hole card (server only sends 1)
  // On 'dealer_turn'/'completed': reveal cards one at a time with delays
  useEffect(() => {
    const dealerCards = state?.dealerCards ?? [];
    const totalCards = dealerCards.length;
    const phase = state?.phase ?? 'waiting';
    const prevCount = prevDealerCardCountRef.current;

    // Phase reset: no cards → reset visible count
    if (totalCards === 0) {
      setVisibleDealerCards(0);
      prevDealerCardCountRef.current = 0;
      if (dealerRevealTimerRef.current) {
        clearTimeout(dealerRevealTimerRef.current);
        dealerRevealTimerRef.current = null;
      }
      return;
    }

    // During playing phase: always show just the 1 card server sends
    if (phase === 'playing') {
      setVisibleDealerCards(totalCards); // server sends only 1 during playing
      prevDealerCardCountRef.current = totalCards;
      return;
    }

    // New cards arrived (dealer_turn or completed) — reveal progressively
    if (totalCards > prevCount && (phase === 'dealer_turn' || phase === 'completed')) {
      // Clear any existing reveal timer
      if (dealerRevealTimerRef.current) {
        clearTimeout(dealerRevealTimerRef.current);
        dealerRevealTimerRef.current = null;
      }

      // Start from the hole card (index 1) if we were only showing 1
      const startFrom = Math.max(visibleDealerCards, 1);
      let idx = startFrom;

      const revealNext = () => {
        idx++;
        if (idx <= totalCards) {
          setVisibleDealerCards(idx);
          playSound('/BlackJack/sounds/cards.wav');
          if (idx < totalCards) {
            dealerRevealTimerRef.current = setTimeout(revealNext, 1200);
          }
        }
      };

      // Reveal hole card after 800ms, then each additional card every 1200ms
      dealerRevealTimerRef.current = setTimeout(revealNext, 800);
      prevDealerCardCountRef.current = totalCards;
      return;
    }

    prevDealerCardCountRef.current = totalCards;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.dealerCards?.length, state?.phase]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (dealerRevealTimerRef.current) clearTimeout(dealerRevealTimerRef.current);
      if (dealerPhraseTimerRef.current) clearTimeout(dealerPhraseTimerRef.current);
      if (dealerVoiceRef.current) { try { dealerVoiceRef.current.source.stop(); } catch {} }
    };
  }, []);

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
    client.on('disconnected', () => { setWsConnected(false); setWsStatus('reconnecting'); });
    client.on('reconnecting', (info: any) => { setWsStatus('reconnecting'); setReconnectInfo(info); });
    client.on('reconnected', async () => {
      setWsConnected(true); setWsStatus('connected'); setReconnectInfo(null); setError(null);
      // Re-join room and refresh state after reconnect
      await client.sendRequest('join_room', { roomId: `blackjack:table:${tableId}` }).catch(() => {});
      try { setState(await client.sendRequest('bj_multi_get_state', { tableId }) as BJMultiTableState); }
      catch { /* state will come via broadcast */ }
    });
    client.on('reconnect_failed', () => { setWsStatus('failed'); setReconnectInfo(null); });
    client.on('error', (err: any) => setError(err?.message || 'Connection error'));
    client.on('bj_multi_table_state', (p: BJMultiTableState) => { setState(p); stateRef.current = p; });
    client.on('bj_multi_tip_notification', (p: any) => {
      const addr = (p.playerAddress ?? '').toLowerCase();
      // Resolve name from current seat state
      const seatMatch = stateRef.current?.seats.find(
        (s: any) => s.playerAddress?.toLowerCase() === addr
      );
      const name = (seatMatch as any)?.displayName || addr.slice(-4);
      setTipNotification({ name });
      setTimeout(() => setTipNotification(null), 5000);
    });

    setWsStatus('connecting');
    client.connect()
      .then(async () => {
        setWsConnected(true); setWsStatus('connected'); setError(null);
        await client.sendRequest('join_room', { roomId: `blackjack:table:${tableId}` }).catch(() => {});
        try { setState(await client.sendRequest('bj_multi_get_state', { tableId }) as BJMultiTableState); }
        catch { setError('Failed to load table state'); }
      })
      .catch((err: any) => { setError(err?.message || 'Connection failed'); setWsStatus('failed'); });
    wsClientRef.current = client; setWsClient(client);
    return () => { client.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, address]);

  const takeSeat = useCallback(async (pos: number) => {
    if (!wsClient?.isConnected() || !address) return;
    playSound('/Poker/PokerSounds/PlayerClickConfirmation1.mp3');
    try { await wsClient.sendRequest('bj_multi_join_table', { tableId, seatPosition: pos }); }
    catch (e) { setError((e as Error).message); }
  }, [wsClient, tableId, address, playSound]);

  const leaveSeat = useCallback(async () => {
    if (!wsClient?.isConnected()) return;
    playSound('/Poker/PokerSounds/PlayerClickConfirmation1.mp3');
    try { await wsClient.sendRequest('bj_multi_leave_table', { tableId }); }
    catch (e) { setError((e as Error).message); }
  }, [wsClient, tableId, playSound]);

  const placeBet = useCallback(async () => {
    const amt = parseInt(betAmount || '0', 10);
    if (!wsClient?.isConnected() || amt <= 0) return;
    playSound('/Poker/PokerSounds/PlayerClickConfirmation1.mp3');
    try {
      await wsClient.sendRequest('bj_multi_place_bet', { tableId, amount: parseEther(String(amt)).toString() });
      fetchBalance();
    } catch (e) { setError((e as Error).message); }
  }, [wsClient, tableId, betAmount, fetchBalance, playSound]);

  const doAction = useCallback(async (action: 'hit' | 'stand' | 'double_down' | 'split') => {
    if (!wsClient?.isConnected()) return;
    // Sound: knock for hit, click confirmation for everything else
    if (action === 'hit') {
      playSound('/BlackJack/sounds/knock.wav');
    } else {
      playSound('/Poker/PokerSounds/PlayerClickConfirmation1.mp3');
    }
    try { await wsClient.sendRequest('bj_multi_action', { tableId, action, handIndex: mySeat?.activeHandIndex ?? 0 }); }
    catch (e) { setError((e as Error).message); }
  }, [wsClient, tableId, mySeat, playSound]);

  const theme = resolveTheme(state?.themeKind ?? 'video', state?.themeId ?? 'glowingTable');

  // Scale board content to fill the 16:9 container at any size
  const tableRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(0);
  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    setTableWidth(el.clientWidth);
    const ro = new ResizeObserver(entries => setTableWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const boardScale = tableWidth > 0 ? tableWidth / 800 : 1;

  if (!tableId) return null;

  return (
    <GlobalMainNav page="blackjack" showBackArrow backArrowHref="/blackjack-multi" backArrowLabel="Lobby">
      <style>{`
        .card-overlap-dealer { margin-left: -12px; }
        .card-overlap-player { margin-left: -16px; }
        .card-slide-in {
          animation: cardSlideIn 0.4s ease-out forwards;
        }
        @keyframes cardSlideIn {
          from { opacity: 0; transform: translateX(60px) translateY(-40px); }
          to { opacity: 1; transform: translateX(0) translateY(0); }
        }
        .betting-breathe {
          animation: breathe 3s ease-in-out infinite;
        }
        @keyframes breathe {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        .tip-chip-fly {
          animation: tipChipFly 0.7s ease-in forwards;
        }
        @keyframes tipChipFly {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          60% { opacity: 1; transform: translateY(-80px) scale(0.8); }
          100% { opacity: 0; transform: translateY(-120px) scale(0.3); }
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {/* 2-column layout on md+: table (left) + sidebar controls (right) — matches single player */}
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-2 md:gap-4 min-h-0">

      {/* ── Table container — locked to 16:9 so full table image is always visible ── */}
      <div
        ref={tableRef}
        className="relative w-full blackjack-table overflow-hidden md:row-start-1 md:col-start-1"
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

        {/* Content — always 800×450, scaled to fill the container */}
        <div
          className="absolute top-0 left-0 z-10 flex flex-col"
          style={{ width: 800, height: 450, transform: `scale(${boardScale})`, transformOrigin: 'top left' }}
        >

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
              {(state as any)?.viewerCount > 0 && (
                <span className="text-[10px] text-white/40 flex items-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  {(state as any).viewerCount}
                </span>
              )}
              {myPosition !== null && (
                <button onClick={leaveSeat} className="text-xs text-white/40 hover:text-red-400 transition-colors">
                  Leave seat
                </button>
              )}
            </div>
          </div>

          {/* Tip dealer button — top center */}
          {address && wsConnected && wsClient && myPosition !== null && (
            <div className="flex flex-col items-center" style={{ position: 'relative', zIndex: 12 }}>
              <button
                onClick={async () => {
                  if (tipAnimating) return;
                  playSound('/Poker/PokerSounds/PlayerClickConfirmation1.mp3');
                  setTipAnimating(true);
                  try {
                    await wsClient.sendRequest('bj_multi_tip_dealer', {
                      tableId,
                      amount: (BigInt(2000) * BigInt('1000000000000000000')).toString(),
                    });
                    // Dealer thanks voice line after tip succeeds
                    playDealerVoice(pickRandom(SOUNDS_TIP));
                    fetchBalance();
                  } catch (e) { setError((e as Error).message); setTipAnimating(false); }
                }}
                disabled={tipAnimating}
                className="px-3 py-1 rounded bg-amber-900/50 border border-amber-600/40 text-amber-300 text-[11px] font-medium hover:bg-amber-800/60 transition-all disabled:opacity-50"
              >
                Tip 2,000
              </button>

              {/* Chip animation — flies up to dealer */}
              {tipAnimating && (
                <div
                  className="absolute pointer-events-none"
                  style={{ top: 0, left: '50%', transform: 'translateX(-50%)' }}
                  onAnimationEnd={() => setTipAnimating(false)}
                >
                  <div className="tip-chip-fly">
                    <div className="w-6 h-6 rounded-full border-2 border-amber-400 bg-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/40">
                      <span className="text-white text-[8px] font-bold">$</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Thank you message */}
              {tipNotification && (
                <div className="mt-1 px-3 py-1 rounded bg-black/70 border border-amber-600/30 text-amber-300 text-[10px] text-center animate-fade-in whitespace-nowrap">
                  Thanks for the tip! Best of luck to you, {tipNotification.name}
                </div>
              )}
            </div>
          )}

          {!wsConnected && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-lg px-6 py-4 text-center max-w-xs">
                {!address ? (
                  <p className="text-amber-400 text-sm">Connect your wallet to play</p>
                ) : wsStatus === 'failed' ? (
                  <>
                    <p className="text-red-400 text-sm font-medium mb-2">Connection lost</p>
                    <p className="text-slate-400 text-xs mb-3">Could not reconnect to the server.</p>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs rounded transition-colors"
                    >
                      Reload Page
                    </button>
                  </>
                ) : wsStatus === 'reconnecting' ? (
                  <>
                    <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-amber-400 text-sm font-medium">Reconnecting...</p>
                    {reconnectInfo && (
                      <p className="text-slate-400 text-xs mt-1">
                        Attempt {reconnectInfo.attempt} of {reconnectInfo.maxAttempts}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-cyan-400 text-sm">Connecting...</p>
                  </>
                )}
              </div>
            </div>
          )}
          {error && wsConnected && <div className="bg-red-900/80 text-red-200 text-xs text-center py-1 px-4">{error}</div>}

          {/* Win notification — reused from single player */}
          {showWin && (
            <WinNotification
              amount={showWin.amount}
              isBlackjack={showWin.isBlackjack}
              onComplete={() => setShowWin(null)}
            />
          )}

          {/* ── Play area ── */}
          <div className="flex-1 flex flex-col justify-center items-center gap-4 px-4 pb-4">

            {/* DEALER — progressive card reveal matching single-player */}
            <div className="flex items-center justify-center" style={{ transform: 'translateY(-20px)' }}>
              <div className="flex">
                {(state?.dealerCards ?? []).map((c, i) => {
                  // Only render cards up to visibleDealerCards count
                  if (i >= visibleDealerCards) return null;
                  return (
                    <div key={i} className={i > 0 ? 'card-overlap-dealer' : ''} style={{ zIndex: i }}>
                      <PlayingCard
                        card={indexToCard(c)}
                        owner="dealer"
                        className=""
                        size="small"
                        index={i}
                        isNewCard={i >= 2 && i === visibleDealerCards - 1}
                      />
                    </div>
                  );
                })}
                {/* Face-down hole card during playing phase (server only sends 1 card) */}
                {state?.phase === 'playing' && (state.dealerCards?.length ?? 0) === 1 && (
                  <div className="card-overlap-dealer" style={{ zIndex: 1 }}>
                    <PlayingCard card={{ value: 1 as CardValue, suit: 'spades' }} hidden owner="dealer" className="" size="small" />
                  </div>
                )}
                {/* Empty placeholders before deal */}
                {(!state || (state.dealerCards?.length ?? 0) === 0) && (
                  <>
                    <div className="w-14 h-20 rounded-lg border border-dashed border-white/10 mr-[-18px]" />
                    <div className="w-14 h-20 rounded-lg border border-dashed border-white/10" />
                  </>
                )}
              </div>
              {/* Dealer score — only shown once all cards are revealed */}
              {state && visibleDealerCards >= (state.dealerCards?.length ?? 0) && state.dealerTotal > 0 && (
                <div className="ml-2 flex items-center gap-1">
                  <span className={`font-black text-xl ${state.dealerTotal > 21 ? 'text-red-400' : 'text-white'}`}>
                    {state.dealerTotal > 21 ? 'BUST' : state.dealerTotal}
                  </span>
                </div>
              )}
            </div>

            {/* "Place your bets!" breathing text during betting phase */}
            {state?.phase === 'betting' && (
              <div className="betting-breathe rounded-xl px-6 py-2" style={{ background: 'rgba(0,0,0,0.45)' }}>
                <span className="text-white font-bold text-lg tracking-wide" style={{ fontFamily: 'Jost, sans-serif' }}>
                  Place your bets!
                </span>
              </div>
            )}

            {/* 3 SEATS — same translateY offset as BlackjackTable player row */}
            <div className="grid grid-cols-3 gap-4 w-full max-w-3xl" style={{ transform: 'translateY(20px)' }}>
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
                    balanceLabel={isMe ? formatMorbius(playerBalance.toString()) : null}
                  />
                );
              })}
            </div>
          </div>


        </div>

        {/* Chat + sound overlay — top-left over the table */}
        <div className="absolute top-12 left-2 z-20" style={{ maxWidth: '280px' }}>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setChatOpen(o => !o)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-black/60 border border-white/15 text-white/70 hover:text-white hover:bg-black/75 transition-colors text-xs backdrop-blur-sm"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Chat</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${chatOpen ? 'rotate-180' : ''}`} />
              {chatMessages.length > 0 && !chatOpen && (
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setSoundEnabled(e => !e)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-black/60 border border-white/15 text-white/70 hover:text-white hover:bg-black/75 transition-colors text-xs backdrop-blur-sm"
              title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-red-400" />}
              <span>{soundEnabled ? 'Sounds' : 'Muted'}</span>
            </button>
          </div>
          {chatOpen && (
            <div className="mt-1 bg-black/80 border border-white/15 rounded p-2.5 backdrop-blur-md w-[260px]">
              <div className="max-h-32 overflow-y-auto space-y-0.5 min-h-0">
                {chatMessages.slice(-12).map(m => (
                  <div key={m.id} className="text-xs text-white/70">
                    <span className="text-cyan-400">{m.displayName ?? m.senderAddress?.slice(0, 6)}: </span>
                    {m.text}
                  </div>
                ))}
                {chatMessages.length === 0 && (
                  <div className="text-xs text-white/30 text-center py-2">No messages yet</div>
                )}
              </div>
              {address && wsConnected && <ChatInput onSend={sendChatMessage} />}
            </div>
          )}
        </div>
      </div>

      {/* ── Controls — sidebar on md+, below table on mobile ── */}
      <div className="px-4 py-4 space-y-3 bg-slate-950 md:row-start-1 md:col-start-2 md:py-0 md:px-0 md:flex md:flex-col md:gap-3 md:overflow-y-auto">

        {/* Betting panel — always visible when seated, disabled when not in betting phase or bet already placed */}
        {myPosition !== null && (
          <div className="w-full max-w-md mx-auto space-y-2">
            <BettingPanelMobile
              onStartGame={() => {}} // not used — confirm bet button below handles this
              isPlaying={state?.phase !== 'betting' || hasBet}
              onBetAmountChange={(val) => setBetAmount(val)}
              currentBetAmount={betAmount}
              onHalfBet={() => {
                const cur = parseInt(betAmount || '0', 10);
                const half = Math.max(500, Math.floor(cur / 2));
                setBetAmount(String(half));
              }}
              onDoubleBet={() => {
                const cur = parseInt(betAmount || '0', 10);
                const doubled = Math.min(50000, cur * 2);
                setBetAmount(String(doubled));
              }}
              playerReserves={BigInt(playerBalance)}
            />
            {/* CONFIRM BET button — only active during betting phase */}
            {state?.phase === 'betting' && !hasBet && (
              <div className="px-2">
                <button
                  onClick={placeBet}
                  disabled={parseInt(betAmount || '0', 10) < 500}
                  className="w-full py-2.5 rounded-xl font-black text-sm tracking-wider transition-all active:scale-95 disabled:opacity-40"
                  style={{
                    background: parseInt(betAmount || '0', 10) >= 500
                      ? 'linear-gradient(180deg, #22c55e 0%, #16a34a 50%, #15803d 100%)'
                      : 'rgba(0,0,0,0.4)',
                    boxShadow: parseInt(betAmount || '0', 10) >= 500
                      ? '0 4px 0 0 rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15)'
                      : 'none',
                  }}
                >
                  <span className="text-white">CONFIRM BET</span>
                </button>
              </div>
            )}
            {/* Bet placed confirmation */}
            {state?.phase === 'betting' && hasBet && (
              <div className="text-center py-1 text-green-400 font-semibold text-sm">
                Bet placed ({formatMorbius(mySeat?.pendingBet ?? '0')} MORBIUS) — waiting for round to start
              </div>
            )}
          </div>
        )}

        {/* MY TURN — reuses BlackjackMobileActionBar from single player */}
        {isMyTurn && activeHand && (
          <div className="w-full max-w-md mx-auto">
            <BlackjackMobileActionBar
              onAction={(action) => doAction(action as 'hit' | 'stand' | 'double_down' | 'split')}
              isPlaying={true}
              canHit={activeHand.canHit}
              canStand={activeHand.canStand}
              canDoubleDown={activeHand.canDoubleDown}
              canSplit={activeHand.canSplit}
              canDeal={false}
              chipStackLength={0}
              lastBetAmount="0"
              soundEnabled={soundEnabled}
              onPlaySfx={playSound}
              alwaysVisible
              hideDealRow
            />
          </div>
        )}

        {/* Not seated CTA */}
        {state && myPosition === null && address && wsConnected && (
          <div className="text-center text-white/40 text-sm py-2">
            {state.seats.every(s => s.playerAddress) ? 'Table full — spectating' : 'Click an empty seat to join'}
          </div>
        )}

        {/* Round history — collapsible */}
        {wsConnected && wsClient && (
          <div className="border border-slate-800 rounded-lg overflow-hidden">
            <button
              onClick={async () => {
                const opening = !historyOpen;
                setHistoryOpen(opening);
                if (opening && roundHistory.length === 0) {
                  try {
                    const res = await wsClient.sendRequest('bj_multi_table_history', { tableId, limit: 15 });
                    setRoundHistory(res?.rounds ?? []);
                  } catch { /* ignore */ }
                }
              }}
              className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/50 hover:bg-slate-800 transition-colors text-xs text-white/70"
            >
              <span>Round History</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
            </button>
            {historyOpen && (
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/50">
                {roundHistory.length === 0 ? (
                  <div className="text-xs text-white/30 text-center py-3">No completed rounds yet</div>
                ) : roundHistory.map((r: any) => (
                  <div key={r.id} className="px-3 py-2 text-xs space-y-0.5">
                    <div className="flex justify-between text-white/60">
                      <span>Round #{r.round_number}</span>
                      <span>Dealer: {r.dealer_total}</span>
                    </div>
                    {(r.seats ?? []).map((s: any, i: number) => {
                      const result = s.result;
                      const color = result === 'win' || result === 'blackjack' ? 'text-green-400' : result === 'push' ? 'text-yellow-400' : 'text-red-400';
                      return (
                        <div key={i} className={`flex justify-between ${color}`}>
                          <span>{s.playerAddress?.slice(0, 6)}…{s.playerAddress?.slice(-4)}</span>
                          <span>{result ?? '?'} · {formatMorbius(s.payout ?? '0')}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Player stats — combined single + multiplayer */}
        {address && playerStats && (
          <PlayerStatsDashboard
            stats={playerStats}
            isLoading={playerStatsLoading}
            playerAddress={address}
            reserveBalance={BigInt(playerBalance)}
          />
        )}

      </div>
      </div>{/* close grid */}
    </GlobalMainNav>
  );
}

const CHAT_MAX_LENGTH = 150;
const CHAT_BURST_LIMIT = 3;
const CHAT_COOLDOWN_MS = 30_000;

function ChatInput({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const sentTimestamps = useRef<number[]>([]);
  const [cooldownEnd, setCooldownEnd] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  // Tick cooldown display
  useEffect(() => {
    if (cooldownEnd <= Date.now()) { setCooldownLeft(0); return; }
    const tick = () => setCooldownLeft(Math.max(0, Math.ceil((cooldownEnd - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [cooldownEnd]);

  const handleSend = () => {
    const msg = text.trim();
    if (!msg) return;
    const now = Date.now();
    if (now < cooldownEnd) return;

    // Prune timestamps older than cooldown window
    sentTimestamps.current = sentTimestamps.current.filter(t => now - t < CHAT_COOLDOWN_MS);

    if (sentTimestamps.current.length >= CHAT_BURST_LIMIT) {
      const end = sentTimestamps.current[0] + CHAT_COOLDOWN_MS;
      setCooldownEnd(end);
      setCooldownLeft(Math.ceil((end - now) / 1000));
      return;
    }

    sentTimestamps.current.push(now);
    onSend(msg);
    setText('');
  };

  const onCooldown = cooldownLeft > 0;

  return (
    <form className="flex gap-2 mt-1.5"
      onSubmit={e => { e.preventDefault(); handleSend(); }}>
      <div className="relative flex-1">
        <Input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={onCooldown ? `Wait ${cooldownLeft}s…` : 'Table chat…'}
          className="h-7 text-xs bg-white/10 border-white/20 text-slate-200 placeholder:text-white/30 pr-8"
          maxLength={CHAT_MAX_LENGTH}
          disabled={onCooldown}
        />
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-white/25 tabular-nums pointer-events-none">
          {text.length}/{CHAT_MAX_LENGTH}
        </span>
      </div>
      <button type="submit" disabled={onCooldown || !text.trim()}
        className="px-3 h-7 text-xs rounded-md bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-colors disabled:opacity-40 disabled:pointer-events-none">
        Send
      </button>
    </form>
  );
}
