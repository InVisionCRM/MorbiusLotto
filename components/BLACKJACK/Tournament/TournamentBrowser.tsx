'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { formatEther } from 'viem';
import { AnimatePresence, motion } from 'motion/react';
import {
  TournamentListItem,
  formatTimeRemaining,
  getDefaultTourCard,
  getExamplePrizeDistribution,
  PRIZE_PRESETS,
  PRIZE_DISTRIBUTION_LABELS,
  PrizeDistributionType,
  TIME_LIMIT_LABELS,
  MAX_REBUYS_LABELS,
} from '@/lib/tournament-types';
import { getTableThemeInfo } from '@/app/BLACKJACK/constants';
import { FreerollList } from './FreerollList';
import { useOutsideClick } from '@/hooks/use-outside-click';
import type { BlackjackWebSocketClient, ChatMessagePayload } from '@/lib/websocket-client';

// Cache for resolved token info (shared across all cards)
interface TokenInfo {
  name: string;
  symbol: string;
  logoUrl: string | null;
}
const tokenInfoCache: Record<string, TokenInfo> = {};

interface LeaderboardEntry {
  entry_id: string;
  player_address: string;
  chips_remaining: number;
  hands_played: number;
  highest_chip_count: number;
  status: string;
  current_rank: number;
}

type LobbyTab = 'join' | 'my' | 'freeroll';

interface TournamentBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: (tournamentId: string, isPrivate: boolean) => void;
  onCreateNew: () => void;
  onRefresh: () => Promise<TournamentListItem[]>;
  onFetchLeaderboard?: (tournamentId: string) => Promise<LeaderboardEntry[]>;
  tournaments: TournamentListItem[];
  isLoading: boolean;
  playerBalance: bigint;
  /** For "My Tournaments" tab: filter by creator address */
  playerAddress?: string | null;
  /** Required to show Freeroll tab; when user joins a freeroll this is called */
  wsClient?: BlackjackWebSocketClient | null;
  onFreerollJoined?: (tournamentId: string) => void;
}

// ============================
// Token info fetcher hook
// ============================
function useTokenInfo(address?: string | null): TokenInfo | null {
  const [info, setInfo] = useState<TokenInfo | null>(
    address ? tokenInfoCache[address] ?? null : null
  );

  useEffect(() => {
    if (!address) return;
    if (tokenInfoCache[address]) {
      setInfo(tokenInfoCache[address]);
      return;
    }
    let cancelled = false;
    (async () => {
      let name = 'Unknown';
      let symbol = '???';
      let logoUrl: string | null = null;
      try {
        const res = await fetch(`https://api.scan.pulsechain.com/api/v2/tokens/${address}`);
        const data = await res.json();
        if (data.name) name = data.name;
        if (data.symbol) symbol = data.symbol;
        if (data.icon_url) logoUrl = data.icon_url;
      } catch { /* ignore */ }
      if (!logoUrl) {
        try {
          const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
          const data = await res.json();
          const img = data.pairs?.[0]?.info?.imageUrl;
          if (img) logoUrl = img;
        } catch { /* ignore */ }
      }
      const result = { name, symbol, logoUrl };
      tokenInfoCache[address] = result;
      if (!cancelled) setInfo(result);
    })();
    return () => { cancelled = true; };
  }, [address]);

  return info;
}

// ============================
// Dynamic tournament timer
// ============================
// Formats a millisecond duration into a short human string
function formatMs(ms: number): string {
  if (ms <= 0) return '0m';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

// Component for countdown timer badge
function CountdownTimer({ targetDate, label, color, size = 'small' }: { targetDate: string | null | undefined; label: string; color: string; size?: 'small' | 'medium' }) {
  const [, setTick] = useState(0);
  
  useEffect(() => {
    if (!targetDate) return;
    const target = new Date(targetDate).getTime();
    const update = () => {
      const now = Date.now();
      if (now < target) {
        setTick((v) => v + 1);
      }
    };
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);
  
  if (!targetDate) return null;
  const target = new Date(targetDate).getTime();
  const now = Date.now();
  const remaining = Math.max(0, target - now);
  
  if (remaining === 0 || now >= target) return null;
  
  const textSize = size === 'small' ? 'text-[9px]' : 'text-[10px]';
  const displayText = label ? `${label}: ${formatMs(remaining)}` : formatMs(remaining);
  
  return (
    <span className={`px-2 py-0.5 rounded-full ${color} text-white ${textSize} font-medium shadow-lg`}>
      {displayText}
    </span>
  );
}

interface TimerInput {
  endsAt: string | null;
  tournamentType?: string | null;
  scheduledStartAt?: string | null;
  registrationOpensAt?: string | null;
  currentPhase?: string | null;
}

function useTournamentTimer(t: TimerInput): { label: string; color: string } | null {
  const [, setTick] = useState(0);

  // Find the nearest future timestamp we need to count down to
  const targetTs = useMemo(() => {
    const now = Date.now();
    const candidates: number[] = [];
    if (t.endsAt) candidates.push(new Date(t.endsAt).getTime());
    if (t.scheduledStartAt) candidates.push(new Date(t.scheduledStartAt).getTime());
    if (t.registrationOpensAt) candidates.push(new Date(t.registrationOpensAt).getTime());
    // Pick the earliest future timestamp, or the most recent past one for "Ended" display
    const future = candidates.filter((c) => c > now);
    if (future.length > 0) return Math.min(...future);
    if (candidates.length > 0) return Math.max(...candidates);
    return null;
  }, [t.endsAt, t.scheduledStartAt, t.registrationOpensAt]);

  useEffect(() => {
    if (targetTs === null) return;
    const getInterval = () => {
      const remaining = targetTs - Date.now();
      return remaining < 5 * 60 * 1000 ? 1000 : 60_000;
    };
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setTick((v) => v + 1);
        if (Date.now() < targetTs) schedule();
      }, getInterval());
    };
    schedule();
    return () => clearTimeout(timer);
  }, [targetTs]);

  // Compute display state
  const now = Date.now();
  const isFreeroll = t.tournamentType === 'freeroll';

  if (isFreeroll) {
    const regOpens = t.registrationOpensAt ? new Date(t.registrationOpensAt).getTime() : null;
    const startAt = t.scheduledStartAt ? new Date(t.scheduledStartAt).getTime() : null;
    const phase = t.currentPhase;

    // Before registration opens
    if (regOpens && now < regOpens) {
      return { label: `Reg opens ${formatMs(regOpens - now)}`, color: 'bg-blue-500/90' };
    }

    // Registration phase — countdown to start
    if (phase === 'registration' && startAt && now < startAt) {
      return { label: `Starts in ${formatMs(startAt - now)}`, color: 'bg-cyan-500/90' };
    }

    // Active / elimination round — show time remaining via endsAt or calculated end
    if (phase === 'active' || phase === 'elimination_round') {
      const endsAtMs = t.endsAt ? new Date(t.endsAt).getTime() : null;
      // Freerolls without explicit endsAt: compute from scheduledStartAt + durationMinutes if available
      if (endsAtMs && now < endsAtMs) {
        const rem = endsAtMs - now;
        if (rem < 5 * 60 * 1000) return { label: `${formatMs(rem)} left`, color: 'bg-red-500/90' };
        if (rem < 30 * 60 * 1000) return { label: `${formatMs(rem)} left`, color: 'bg-orange-500/90' };
        return { label: `${formatMs(rem)} left`, color: 'bg-green-500/90' };
      }
      return { label: 'Live', color: 'bg-green-500/90' };
    }

    if (phase === 'completed') {
      return { label: 'Completed', color: 'bg-gray-500/90' };
    }

    // Fallback for freerolls with a start time in the future
    if (startAt && now < startAt) {
      return { label: `Starts ${formatMs(startAt - now)}`, color: 'bg-cyan-500/90' };
    }
  }

  // Standard tournaments — use endsAt
  if (!t.endsAt) return null;

  const endTime = new Date(t.endsAt).getTime();
  const remaining = endTime - now;
  if (remaining <= 0) return { label: 'Ended', color: 'bg-red-500/90' };

  const text = formatMs(remaining);
  if (remaining < 5 * 60 * 1000) return { label: `${text} left`, color: 'bg-red-500/90' };
  if (remaining < 30 * 60 * 1000) return { label: `${text} left`, color: 'bg-orange-500/90' };
  return { label: `${text} left`, color: 'bg-amber-500/90' };
}

// ============================
// Truncate address helper
// ============================
function truncAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ============================
// Section Header
// ============================
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-gray-300 text-sm font-semibold mb-2 flex items-center gap-2 border-b border-gray-700 pb-1">
      {children}
    </h4>
  );
}

// ============================
// Tournament Comments
// ============================
function TournamentComments({
  tournamentId,
  wsClient,
  isParticipant,
}: {
  tournamentId: string;
  wsClient: BlackjackWebSocketClient | null;
  isParticipant: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessagePayload[]>([]);
  const [input, setInput] = useState('');
  const [joined, setJoined] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const roomId = `tournament:${tournamentId}`;

  useEffect(() => {
    if (!wsClient || !isParticipant) return;

    let mounted = true;

    const joinChat = async () => {
      try {
        const result = await wsClient.joinRoom(roomId);
        if (mounted) {
          setMessages(result.recentMessages || []);
          setJoined(true);
        }
      } catch {
        // Participant check may fail — that's OK
      }
    };

    const handleMessage = (payload: ChatMessagePayload) => {
      if (payload.roomId === roomId) {
        setMessages((prev) => [...prev, payload]);
      }
    };

    wsClient.on('chat_message', handleMessage);
    joinChat();

    return () => {
      mounted = false;
      wsClient.off('chat_message');
    };
  }, [wsClient, isParticipant, roomId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!wsClient || !input.trim() || !joined) return;
    wsClient.sendChatMessage(roomId, input.trim());
    setInput('');
  };

  if (!isParticipant) {
    return (
      <div className="text-center py-4 text-gray-500 text-sm">
        Join tournament to comment
      </div>
    );
  }

  return (
    <div>
      <div className="max-h-40 overflow-y-auto space-y-1.5 mb-2 scrollbar-thin">
        {messages.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-2">No comments yet</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="flex gap-2 text-xs">
              <span className="text-cyan-400 font-mono shrink-0">
                {m.displayName || (m.senderAddress ? truncAddr(m.senderAddress) : 'System')}
              </span>
              <span className="text-gray-300 break-all">{m.text}</span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a comment..."
          maxLength={500}
          className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ============================
// Expanded Card Detail View
// ============================
function ExpandedCardContent({
  tournament,
  tokenInfo,
  playerBalance,
  playerAddress,
  wsClient,
  onJoin,
  entries,
  loadingEntries,
}: {
  tournament: TournamentListItem;
  tokenInfo: TokenInfo | null;
  playerBalance: bigint;
  playerAddress?: string | null;
  wsClient?: BlackjackWebSocketClient | null;
  onJoin: (tournamentId: string, isPrivate: boolean) => void;
  entries: LeaderboardEntry[];
  loadingEntries: boolean;
}) {
  const buyInBigInt = BigInt(tournament.buyInAmount);
  const canAfford = playerBalance >= buyInBigInt;
  const isFull = tournament.maxPlayers !== null && tournament.entryCount >= tournament.maxPlayers;

  // Determine if current player is a participant
  const isParticipant = useMemo(() => {
    if (!playerAddress) return false;
    const norm = playerAddress.toLowerCase();
    return entries.some((e) => e.player_address.toLowerCase() === norm);
  }, [entries, playerAddress]);

  // Prize distribution
  const prizePreset = PRIZE_PRESETS.find((p) => p.id === tournament.prizeDistributionType);
  const prizePercentages = prizePreset?.percentages ?? [40, 20, 10, 2, 2, 2, 2, 2, 2, 2];
  const prizePool = BigInt(tournament.prizePool);
  const prizeDistribution = getExamplePrizeDistribution(prizePool, prizePercentages);
  const decimals = tournament.prizeTokenDecimals ?? 18;

  // Table theme info
  const themeInfo = getTableThemeInfo(tournament.tableTheme);

  // Time limit label
  const timeLimitLabel =
    tournament.timeLimitMinutes === null
      ? TIME_LIMIT_LABELS['null']
      : TIME_LIMIT_LABELS[tournament.timeLimitMinutes] ?? `${tournament.timeLimitMinutes}m`;

  const formatPrize = (amount: bigint) => {
    if (tournament.prizeTokenAddress) {
      return `${Number(amount / BigInt(10 ** Math.max(0, decimals - 4))) / 10000} ${tokenInfo?.symbol || '???'}`;
    }
    return `${Number(formatEther(amount)).toLocaleString()} MORBIUS`;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5 [scrollbar-width:thin]">
        {/* a. Overview Section */}
        <div>
          <SectionHeader>Overview</SectionHeader>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <div className="text-gray-500">Creator</div>
            <div className="text-gray-200 font-mono">
              {tournament.creatorAddress ? truncAddr(tournament.creatorAddress) : 'System'}
            </div>
            <div className="text-gray-500">Type</div>
            <div className="text-gray-200">{tournament.tournamentType === 'freeroll' ? 'Freeroll' : 'Standard'}</div>
            <div className="text-gray-500">Private</div>
            <div className="text-gray-200">{tournament.isPrivate ? 'Yes' : 'No'}</div>
            <div className="text-gray-500">Time Limit</div>
            <div className="text-gray-200">{timeLimitLabel}</div>
            <div className="text-gray-500">Max Hands</div>
            <div className="text-gray-200">{tournament.maxHands}</div>
            <div className="text-gray-500">Starting Chips</div>
            <div className="text-gray-200">{tournament.startingChips.toLocaleString()}</div>
            <div className="text-gray-500">Players</div>
            <div className="text-gray-200">
              {tournament.entryCount} {tournament.maxPlayers ? `/ ${tournament.maxPlayers}` : ''}
            </div>
            <div className="text-gray-500">Created</div>
            <div className="text-gray-200">
              {new Date(tournament.createdAt).toLocaleDateString()}
            </div>
            {tournament.tournamentType === 'freeroll' && tournament.registrationOpensAt && (
              <>
                <div className="text-gray-500">Registration Opens</div>
                <div className="text-gray-200 flex items-center gap-2">
                  <span>{new Date(tournament.registrationOpensAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <CountdownTimer targetDate={tournament.registrationOpensAt} label="" color="bg-blue-500/80" size="medium" />
                </div>
              </>
            )}
            {tournament.tournamentType === 'freeroll' && tournament.scheduledStartAt && (
              <>
                <div className="text-gray-500">Scheduled Start</div>
                <div className="text-gray-200 flex items-center gap-2">
                  <span>{new Date(tournament.scheduledStartAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <CountdownTimer targetDate={tournament.scheduledStartAt} label="" color="bg-cyan-500/80" size="medium" />
                </div>
              </>
            )}
            {tournament.tournamentType === 'freeroll' && tournament.durationMinutes && (
              <>
                <div className="text-gray-500">Duration</div>
                <div className="text-gray-200">
                  {tournament.durationMinutes >= 60 ? `${Math.floor(tournament.durationMinutes / 60)}h ${tournament.durationMinutes % 60}m` : `${tournament.durationMinutes}m`}
                </div>
              </>
            )}
            {tournament.tournamentType === 'freeroll' && tournament.currentPhase && (
              <>
                <div className="text-gray-500">Phase</div>
                <div className="text-gray-200 capitalize">{tournament.currentPhase.replace(/_/g, ' ')}</div>
              </>
            )}
          </div>
        </div>

        {/* b. Prize Structure Section */}
        <div>
          <SectionHeader>Prize Structure</SectionHeader>
          <p className="text-xs text-gray-400 mb-2">
            {PRIZE_DISTRIBUTION_LABELS[tournament.prizeDistributionType as PrizeDistributionType] || tournament.prizeDistributionType.replace(/_/g, ' ')}
            {tournament.prizeTokenAddress && tokenInfo && (
              <span className="ml-2 inline-flex items-center gap-1">
                {tokenInfo.logoUrl && (
                  <img src={tokenInfo.logoUrl} alt="" className="w-3.5 h-3.5 rounded-full inline" />
                )}
                <span className="text-cyan-400">{tokenInfo.name}</span>
                <span className="font-mono text-gray-600 text-[10px]">
                  {truncAddr(tournament.prizeTokenAddress)}
                </span>
              </span>
            )}
          </p>
          {prizeDistribution.length > 0 ? (
            <div className="rounded-lg overflow-hidden border border-gray-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-800/80 text-gray-400">
                    <th className="text-left px-3 py-1.5">Rank</th>
                    <th className="text-right px-3 py-1.5">%</th>
                    <th className="text-right px-3 py-1.5">Est. Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {prizeDistribution.map((d) => (
                    <tr
                      key={d.rank}
                      className={`border-t border-gray-700/50 ${
                        d.rank === 1
                          ? 'bg-yellow-500/5'
                          : d.rank === 2
                          ? 'bg-gray-400/5'
                          : d.rank === 3
                          ? 'bg-orange-500/5'
                          : ''
                      }`}
                    >
                      <td className="px-3 py-1.5 text-gray-300">
                        {d.rank === 1 ? '1st' : d.rank === 2 ? '2nd' : d.rank === 3 ? '3rd' : `${d.rank}th`}
                      </td>
                      <td className="px-3 py-1.5 text-right text-gray-300">{d.percentage}%</td>
                      <td className="px-3 py-1.5 text-right text-green-400 font-mono">
                        {formatPrize(d.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-xs">No prize pool yet</p>
          )}
        </div>

        {/* c. Table Theme Preview */}
        <div>
          <SectionHeader>Table Theme</SectionHeader>
          <div className="flex items-center gap-3">
            <div className="w-24 h-16 rounded-lg overflow-hidden border border-gray-700 bg-gray-800 shrink-0">
              {themeInfo.kind === 'video' ? (
                <video
                  src={themeInfo.src}
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                  onMouseOver={(e) => (e.target as HTMLVideoElement).play()}
                  onMouseOut={(e) => {
                    const v = e.target as HTMLVideoElement;
                    v.pause();
                    v.currentTime = 0;
                  }}
                />
              ) : (
                <img src={themeInfo.src} alt={themeInfo.label} className="w-full h-full object-cover" />
              )}
            </div>
            <span className="text-gray-300 text-sm">{themeInfo.label}</span>
          </div>
        </div>

        {/* d. Rebuys Section */}
        <div>
          <SectionHeader>Rebuys</SectionHeader>
          <div className="text-sm text-gray-300">
            {tournament.rebuyConfig.enabled ? (
              <p>
                Enabled &mdash;{' '}
                {tournament.rebuyConfig.maxRebuys === 0
                  ? 'Unlimited'
                  : MAX_REBUYS_LABELS[tournament.rebuyConfig.maxRebuys] ?? `${tournament.rebuyConfig.maxRebuys} rebuys`}
              </p>
            ) : (
              <p className="text-gray-500">Disabled</p>
            )}
          </div>
        </div>

        {/* e. Players Section */}
        <div>
          <SectionHeader>Players ({entries.length})</SectionHeader>
          {loadingEntries ? (
            <div className="flex justify-center py-4">
              <svg className="animate-spin h-5 w-5 text-cyan-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : entries.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-2">No players yet</p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1 scrollbar-thin">
              {entries.map((entry, index) => (
                <div
                  key={entry.entry_id}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs ${
                    index === 0
                      ? 'bg-yellow-500/10 border border-yellow-500/30'
                      : index === 1
                      ? 'bg-gray-400/10 border border-gray-400/30'
                      : index === 2
                      ? 'bg-orange-500/10 border border-orange-500/30'
                      : 'bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        index === 0
                          ? 'bg-yellow-500 text-black'
                          : index === 1
                          ? 'bg-gray-400 text-black'
                          : index === 2
                          ? 'bg-orange-500 text-black'
                          : 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      {entry.current_rank || index + 1}
                    </span>
                    <span className="text-gray-300 font-mono">
                      {truncAddr(entry.player_address)}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        entry.status === 'playing'
                          ? 'bg-green-500/20 text-green-400'
                          : entry.status === 'busted'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}
                    >
                      {entry.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-400">
                    <span>{entry.hands_played} hands</span>
                    <span className="text-cyan-400 font-semibold">
                      {entry.chips_remaining.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* f. Share Section */}
        <div>
          <SectionHeader>Share</SectionHeader>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const url = `${window.location.origin}/BLACKJACK?tournament=${tournament.id}`;
                navigator.clipboard.writeText(url);
              }}
              className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium transition-colors"
            >
              Copy Link
            </button>
            <button
              onClick={() => {
                const url = `${window.location.origin}/BLACKJACK?tournament=${tournament.id}`;
                const text = `Join "${tournament.name}" tournament on MORBlotto! ${url}`;
                window.open(
                  `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
                  '_blank'
                );
              }}
              className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium transition-colors"
            >
              Share on X
            </button>
          </div>
        </div>

        {/* g. Comments Section */}
        <div>
          <SectionHeader>Comments</SectionHeader>
          <TournamentComments
            tournamentId={tournament.id}
            wsClient={wsClient ?? null}
            isParticipant={isParticipant}
          />
        </div>
      </div>

      {/* h. Join Button - sticky bottom */}
      <div className="p-4 border-t border-gray-700 bg-gray-900/80">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onJoin(tournament.id, tournament.isPrivate);
          }}
          disabled={!canAfford || isFull}
          className={`w-full py-3 rounded-xl font-semibold transition-all ${
            canAfford && !isFull
              ? 'bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white shadow-lg shadow-cyan-500/20'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isFull ? 'Tournament Full' : !canAfford ? 'Insufficient Balance' : 'Join Tournament'}
        </button>
      </div>
    </div>
  );
}

// ============================
// Compact Tournament Card
// ============================
function TournamentCard({
  tournament,
  playerBalance,
  onJoin,
  onSelect,
}: {
  tournament: TournamentListItem;
  playerBalance: bigint;
  onJoin: (tournamentId: string, isPrivate: boolean) => void;
  onSelect: (tournament: TournamentListItem) => void;
}) {
  const tokenInfo = useTokenInfo(tournament.prizeTokenAddress);
  const timer = useTournamentTimer(tournament);

  const buyInBigInt = BigInt(tournament.buyInAmount);
  const tournamentImage = tournament.customImage || getDefaultTourCard(tournament.id);

  return (
    <motion.div
      layoutId={`card-${tournament.id}`}
      onClick={() => onSelect(tournament)}
      className="bg-gray-800/50 rounded-xl border border-gray-700 hover:border-cyan-500/50 transition-all overflow-hidden cursor-pointer group"
    >
      {/* Tournament Image (3:2 aspect ratio) */}
      <motion.div layoutId={`image-${tournament.id}`} className="relative">
        <div className="aspect-[3/2] overflow-hidden">
          <img
            src={tournamentImage}
            alt={tournament.name}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
          />
          {/* Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent">
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <motion.h3
                layoutId={`title-${tournament.id}`}
                className="text-white font-bold text-lg truncate"
              >
                {tournament.name}
              </motion.h3>
              {tournament.creatorAddress && (
                <p className="text-gray-400 text-xs">
                  by {truncAddr(tournament.creatorAddress)}
                </p>
              )}
            </div>
          </div>

          {/* Badges top-right */}
          <div className="absolute top-2.5 right-2.5 flex flex-wrap gap-1.5 justify-end">
            {tournament.tournamentType === 'freeroll' && (
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/90 text-white text-[10px] font-medium shadow-lg">
                Freeroll
              </span>
            )}
            {tournament.isPrivate && (
              <span className="px-2 py-0.5 rounded-full bg-purple-500/90 text-white text-[10px] font-medium shadow-lg">
                Private
              </span>
            )}
            {tournament.rebuyConfig.enabled && (
              <span className="px-2 py-0.5 rounded-full bg-green-500/90 text-white text-[10px] font-medium shadow-lg">
                Rebuys
              </span>
            )}
            {timer && (
              <span className={`px-2 py-0.5 rounded-full ${timer.color} text-white text-[10px] font-medium shadow-lg`}>
                {timer.label}
              </span>
            )}
          </div>

          {/* Freeroll timers - registration opens and game starts */}
          {tournament.tournamentType === 'freeroll' && (
            <div className="absolute bottom-2.5 left-2.5 flex flex-col gap-1">
              <CountdownTimer targetDate={tournament.registrationOpensAt} label="Reg" color="bg-blue-500/80" />
              <CountdownTimer targetDate={tournament.scheduledStartAt} label="Start" color="bg-cyan-500/80" />
            </div>
          )}

          {/* Quick stats top-left */}
          <div className="absolute top-2.5 left-2.5 flex flex-col gap-1">
            <span className="px-2 py-0.5 rounded-full bg-black/60 text-yellow-400 text-[10px] font-bold">
              {Number(formatEther(buyInBigInt)).toLocaleString()} MORBIUS
            </span>
            <span className="px-2 py-0.5 rounded-full bg-black/60 text-cyan-400 text-[10px] font-bold">
              {tournament.entryCount}{tournament.maxPlayers ? `/${tournament.maxPlayers}` : ''} players
            </span>
          </div>
        </div>
      </motion.div>

      {/* Quick info bar */}
      <div className="px-3 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">
            Pool:{' '}
            <span className="text-green-400 font-semibold">
              {tournament.prizeTokenAddress && tokenInfo
                ? `${Number(BigInt(tournament.prizePool) / BigInt(10 ** (tournament.prizeTokenDecimals ?? 18))).toLocaleString()} ${tokenInfo.symbol}`
                : `${Number(formatEther(BigInt(tournament.prizePool))).toLocaleString()} MORBIUS`}
            </span>
          </span>
        </div>
        <span className="text-gray-500">
          {PRIZE_DISTRIBUTION_LABELS[tournament.prizeDistributionType as PrizeDistributionType] ?? tournament.prizeDistributionType.replace(/_/g, ' ')}
        </span>
      </div>
    </motion.div>
  );
}

// ============================
// Expanded Card Overlay
// ============================
function ExpandedCard({
  tournament,
  onClose,
  onJoin,
  playerBalance,
  playerAddress,
  wsClient,
}: {
  tournament: TournamentListItem;
  onClose: () => void;
  onJoin: (tournamentId: string, isPrivate: boolean) => void;
  playerBalance: bigint;
  playerAddress?: string | null;
  wsClient?: BlackjackWebSocketClient | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tokenInfo = useTokenInfo(tournament.prizeTokenAddress);
  const timer = useTournamentTimer(tournament);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);

  const tournamentImage = tournament.customImage || getDefaultTourCard(tournament.id);

  useOutsideClick(ref as React.RefObject<HTMLDivElement>, onClose);

  // Escape key to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = 'auto';
    };
  }, [onClose]);

  // Fetch entries
  useEffect(() => {
    if (!wsClient) {
      setLoadingEntries(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await wsClient.sendRequest('tournament_entries_list', { tournamentId: tournament.id });
        if (!cancelled && result?.entries) {
          setEntries(result.entries);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingEntries(false);
      }
    })();
    return () => { cancelled = true; };
  }, [wsClient, tournament.id]);

  return (
    <div className="fixed inset-0 grid place-items-center z-[100] p-4">
      {/* Close button - mobile */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.05 } }}
        className="absolute top-4 right-4 z-[110] flex items-center justify-center bg-gray-800 border border-gray-600 rounded-full w-8 h-8 text-white hover:bg-gray-700"
        onClick={onClose}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </motion.button>

      <motion.div
        layoutId={`card-${tournament.id}`}
        ref={ref}
        className="w-full max-w-lg h-full max-h-[90vh] flex flex-col bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden shadow-2xl shadow-cyan-500/10"
      >
        {/* Image header */}
        <motion.div layoutId={`image-${tournament.id}`} className="relative shrink-0">
          <div className="aspect-[3/1] overflow-hidden">
            <img
              src={tournamentImage}
              alt={tournament.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-black/40 to-transparent" />
          </div>

          {/* Badges */}
          <div className="absolute top-3 right-3 flex flex-wrap gap-1.5 justify-end">
            {tournament.isPrivate && (
              <span className="px-2 py-0.5 rounded-full bg-purple-500/90 text-white text-[10px] font-medium">
                Private
              </span>
            )}
            {tournament.rebuyConfig.enabled && (
              <span className="px-2 py-0.5 rounded-full bg-green-500/90 text-white text-[10px] font-medium">
                Rebuys
              </span>
            )}
            {timer && (
              <span className={`px-2 py-0.5 rounded-full ${timer.color} text-white text-[10px] font-medium`}>
                {timer.label}
              </span>
            )}
          </div>

          {/* Title overlay */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
            <motion.h3
              layoutId={`title-${tournament.id}`}
              className="text-white font-bold text-xl"
            >
              {tournament.name}
            </motion.h3>
            <div className="flex items-center gap-3 mt-1 text-xs">
              <span className="text-yellow-400 font-bold">
                {Number(formatEther(BigInt(tournament.buyInAmount))).toLocaleString()} MORBIUS
              </span>
              <span className="text-cyan-400 font-bold">
                {tournament.entryCount}{tournament.maxPlayers ? `/${tournament.maxPlayers}` : ''} players
              </span>
              <span className="text-green-400 font-bold">
                Pool: {tournament.prizeTokenAddress && tokenInfo
                  ? `${Number(BigInt(tournament.prizePool) / BigInt(10 ** (tournament.prizeTokenDecimals ?? 18))).toLocaleString()} ${tokenInfo.symbol}`
                  : `${Number(formatEther(BigInt(tournament.prizePool))).toLocaleString()} MORBIUS`}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Scrollable content + join button */}
        <motion.div
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex-1 flex flex-col overflow-hidden min-h-0"
        >
          <ExpandedCardContent
            tournament={tournament}
            tokenInfo={tokenInfo}
            playerBalance={playerBalance}
            playerAddress={playerAddress}
            wsClient={wsClient}
            onJoin={onJoin}
            entries={entries}
            loadingEntries={loadingEntries}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}

// ============================
// Main TournamentBrowser
// ============================
export function TournamentBrowser({
  isOpen,
  onClose,
  onJoin,
  onCreateNew,
  onRefresh,
  onFetchLeaderboard,
  tournaments,
  isLoading,
  playerBalance,
  playerAddress,
  wsClient,
  onFreerollJoined,
}: TournamentBrowserProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<LobbyTab>('join');
  const [activeTournament, setActiveTournament] = useState<TournamentListItem | null>(null);

  // Auto-refresh on open for Browse and My Tournaments
  useEffect(() => {
    if (isOpen && (activeTab === 'join' || activeTab === 'my')) {
      handleRefresh();
    }
  }, [isOpen, activeTab]);

  // Close expanded card when browser closes
  useEffect(() => {
    if (!isOpen) setActiveTournament(null);
  }, [isOpen]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const normalizedAddress = playerAddress?.toLowerCase() ?? '';
  const myTournaments = normalizedAddress
    ? tournaments.filter((t) => (t.creatorAddress ?? '').toLowerCase() === normalizedAddress)
    : [];
  const displayList = activeTab === 'my' ? myTournaments : tournaments;
  const showEmptyMessage = activeTab === 'my' ? myTournaments.length === 0 : tournaments.length === 0;
  const emptyCopy =
    activeTab === 'my'
      ? "You haven't created any tournaments yet."
      : 'No active tournaments. Be the first to create one!';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl border border-cyan-500/30 shadow-2xl shadow-cyan-500/20 max-w-4xl w-full mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-600 to-purple-600 p-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Tournament Lobby</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <svg
                className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs: Browse | My Tournaments | Freeroll */}
        <div className="flex gap-1 px-4 pt-2 pb-0 border-b border-gray-700 bg-gray-900/30">
          <button
            onClick={() => setActiveTab('join')}
            className={`px-4 py-2.5 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === 'join' ? 'bg-gray-800 text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            Browse
          </button>
          <button
            onClick={() => setActiveTab('my')}
            className={`px-4 py-2.5 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === 'my' ? 'bg-gray-800 text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            My Tournaments
          </button>
          {wsClient && (
            <button
              onClick={() => setActiveTab('freeroll')}
              className={`px-4 py-2.5 rounded-t-lg text-sm font-medium transition-colors ${
                activeTab === 'freeroll' ? 'bg-gray-800 text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-white'
              }`}
            >
              Freeroll
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'freeroll' && wsClient ? (
            <FreerollList wsClient={wsClient} onJoined={onFreerollJoined} />
          ) : isLoading && displayList.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <svg className="animate-spin h-8 w-8 text-cyan-400 mx-auto mb-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-gray-400">Loading tournaments...</p>
              </div>
            </div>
          ) : showEmptyMessage ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="text-6xl mb-4">🏆</div>
                <p className="text-gray-400 mb-2">{emptyCopy}</p>
                {activeTab === 'my' && (
                  <button
                    onClick={onCreateNew}
                    className="mt-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium"
                  >
                    Create Tournament
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayList.map((tournament) => (
                <TournamentCard
                  key={tournament.id}
                  tournament={tournament}
                  playerBalance={playerBalance}
                  onJoin={onJoin}
                  onSelect={setActiveTournament}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900/50">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="text-gray-400">Your Balance: </span>
              <span className="text-green-400 font-semibold">
                {Number(formatEther(playerBalance)).toLocaleString()} MORBIUS
              </span>
            </div>
            <button
              onClick={onCreateNew}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-semibold transition-all shadow-lg shadow-purple-500/30"
            >
              + Create Tournament
            </button>
          </div>
        </div>
      </div>

      {/* Expanded card overlay */}
      <AnimatePresence>
        {activeTournament && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-[90]"
              onClick={() => setActiveTournament(null)}
            />
            <ExpandedCard
              tournament={activeTournament}
              onClose={() => setActiveTournament(null)}
              onJoin={onJoin}
              playerBalance={playerBalance}
              playerAddress={playerAddress}
              wsClient={wsClient}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default TournamentBrowser;
