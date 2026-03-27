'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { getApiUrlOptional, getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { PokerTableSummary, PokerSeatState } from '@/lib/websocket-client';
import Footer from '@/components/BIG-WHEEL/Footer';
import { Theme } from '@/lib/theme';
import { GameWalletModal } from '@/components/shared/GameWalletModal';
import { GameFAQ } from '@/components/shared/GameFAQ';
import { MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import { isAdminWallet } from '@/lib/admin';
import {
  getCashBuyInBoundsWei,
  POKER_CASH_MAX_BUY_IN_BB,
  POKER_CASH_MIN_BUY_IN_BB,
} from '@/lib/poker-buy-in';
import { PokerBetaSplash } from '@/components/poker/PokerBetaSplash';
import { MorbiusLoadingChip } from '@/components/shared/MorbiusLoadingChip';
// import { PokerTournamentLobby } from '@/components/poker/tournament/PokerTournamentLobby';

/** Format a wei string to human-readable chips (e.g. "10000000000000000000" -> "10") */
function formatChips(wei: string): string {
  try {
    const num = Number(formatEther(BigInt(wei)));
    return Number.isInteger(num)
      ? num.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return wei;
  }
}

/** Blind-based accent for lobby card blob (yellow → green → cyan → red → purple → gold) */
const BLIND_COLORS = [
  { max: 200, color: 'rgba(59, 130, 246, 0.35)' }, // blue (lowest blinds)
  { max: 1000, color: 'rgba(34, 197, 94, 0.35)' },
  { max: 5000, color: 'rgba(34, 211, 238, 0.35)' },
  { max: 20000, color: 'rgba(239, 68, 68, 0.35)' },
  { max: 100000, color: 'rgba(168, 85, 247, 0.35)' },
  { max: Infinity, color: 'rgba(245, 158, 11, 0.4)' },
];
function getBlindAccentColor(bigBlindWei: string): string {
  try {
    const total = Number(formatEther(BigInt(bigBlindWei)));
    const tier = BLIND_COLORS.find((t) => total <= t.max) ?? BLIND_COLORS[BLIND_COLORS.length - 1];
    return tier.color;
  } catch {
    return BLIND_COLORS[0].color;
  }
}

/** Solid version of accent color for icons (same RGB, full opacity). */
function getBlindAccentSolid(bigBlindWei: string): string {
  const rgba = getBlindAccentColor(bigBlindWei);
  return rgba.replace(/[\d.]+\)$/, '1)');
}

// Intro screen component (same style as Blackjack)
function IntroScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const duration = 2500;
    const fallbackTimeout = setTimeout(() => {
      setTimeout(onComplete, 200);
    }, duration);

    return () => clearTimeout(fallbackTimeout);
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 z-50"
      style={{
        background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(10, 15, 20))',
      }}
      suppressHydrationWarning
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-[30px]">
        <div className="relative w-24 h-32 shrink-0 overflow-visible">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute items-center justify-center w-20 h-28 bg-white rounded-lg border-2 border-gray-300 shadow-lg"
              style={{
                transform: `translate(${i * 2}px, ${i * 2}px) rotate(${i * 10}deg)`,
                animation: `dealCard 0.5s ease-out ${i * 0.1}s both`,
                zIndex: 6 - i,
              }}
            >
              <div className="w-full h-full bg-gradient-to-br from-cyan-500 to-purple-700 rounded-lg flex items-center justify-center">
                <span className="text-white text-2xl font-bold">♠</span>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center shrink-0">
          <div className="text-white text-xl font-bold animate-pulse mb-2">
            DEALING CARDS...
          </div>
          <div className="text-gray-400 text-sm">
            Preparing provably fair Texas Hold&apos;em
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes dealCard {
          0% {
            transform: translate(0, -100px) rotate(0deg);
            opacity: 0;
          }
          100% {
            transform: translate(12px, 12px) rotate(30deg);
            opacity: 1;
          }
        }
      `}</style>
      <MorbiusLoadingChip />
    </div>
  );
}

export default function PokerLobbyPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [showIntro, setShowIntro] = useState(true);
  const [tables, setTables] = useState<PokerTableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinModal, setJoinModal] = useState<{ tableId: string; hasPin: boolean; bigBlindWei: string } | null>(null);
  const [buyIn, setBuyIn] = useState('');
  const [joinPin, setJoinPin] = useState('');
  const [balance, setBalance] = useState<string | null>(null);
  const [createModal, setCreateModal] = useState<{ smallBlind: string; bigBlind: string; maxSeats: number; pinCode: string; pinEnabled: boolean } | null>(null);
  const [creating, setCreating] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [playersDropdownTableId, setPlayersDropdownTableId] = useState<string | null>(null);
  const [tablePlayers, setTablePlayers] = useState<{ tableId: string; seats: PokerSeatState[] } | null>(null);
  const [tablePlayersLoading, setTablePlayersLoading] = useState(false);
  const [removingTableId, setRemovingTableId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cash' | 'tournaments'>('cash');
  const [wsClient, setWsClient] = useState<BlackjackWebSocketClient | null>(null);

  const clientRef = React.useRef<BlackjackWebSocketClient | null>(null);
  const isAdmin = isAdminWallet(address);

  const joinBuyInOutOfRange = React.useMemo(() => {
    if (!joinModal) return false;
    try {
      const w = parseEther(buyIn.trim().replace(/,/g, '') || '0');
      const { minWei, maxWei } = getCashBuyInBoundsWei(BigInt(joinModal.bigBlindWei));
      return w < minWei || w > maxWei;
    } catch {
      return true;
    }
  }, [joinModal, buyIn]);

  const fetchTablePlayers = React.useCallback((tableId: string) => {
    const client = clientRef.current;
    if (!client) return;
    setTablePlayersLoading(true);
    client
      .pokerGetState(tableId)
      .then((state) => setTablePlayers({ tableId, seats: state.seats }))
      .catch(() => setTablePlayers({ tableId, seats: [] }))
      .finally(() => setTablePlayersLoading(false));
  }, []);

  const openPlayersDropdown = React.useCallback((tableId: string) => {
    if (playersDropdownTableId === tableId) {
      setPlayersDropdownTableId(null);
      return;
    }
    setPlayersDropdownTableId(tableId);
    if (tablePlayers?.tableId !== tableId) fetchTablePlayers(tableId);
  }, [playersDropdownTableId, tablePlayers?.tableId, fetchTablePlayers]);

  function truncateAddress(addr: string): string {
    if (!addr || addr.length < 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  }

  const removeTable = React.useCallback(async (tableId: string) => {
    if (!address || !isAdmin) return;
    setRemovingTableId(tableId);
    try {
      const res = await fetch(`/api/admin/poker/tables/${tableId}`, {
        method: 'DELETE',
        headers: { 'x-admin-wallet': address },
      });
      if (res.status === 204) {
        setTables((prev) => prev.filter((t) => t.id !== tableId));
        setPlayersDropdownTableId((id) => (id === tableId ? null : id));
        setTablePlayers((p) => (p?.tableId === tableId ? null : p));
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data.error || data.message || 'Failed to remove table') as string);
      }
    } catch (e) {
      setError((e as Error).message ?? 'Failed to remove table');
    } finally {
      setRemovingTableId(null);
    }
  }, [address, isAdmin]);

  useEffect(() => {
    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl) {
      setError('WebSocket not configured');
      setLoading(false);
      return;
    }

    // Authenticated when wallet is connected so tournament join/create/events all work
    const client = address
      ? new BlackjackWebSocketClient(wsUrl, address.toLowerCase(), signTypedDataAsync as any)
      : new BlackjackWebSocketClient(wsUrl);
    clientRef.current = client;

    // Listen for broadcast table list updates
    client.on('poker_table_list', (payload: { tables: PokerTableSummary[] }) => {
      setTables(payload.tables ?? []);
    });

    // Navigate to tournament table when tournament starts (regardless of active tab)
    client.on('poker_tournament_started', (payload: { tournamentId: string; tableId: string }) => {
      if (payload?.tableId && payload?.tournamentId) {
        router.push(`/poker/${payload.tableId}?tournament=${payload.tournamentId}`);
      }
    });

    client
      .connect()
      .then(() => {
        setWsClient(client);
        return client.pokerListTables();
      })
      .then((res) => {
        setTables(res.tables ?? []);
        setError(null);
      })
      .catch((err) => {
        setError(err?.message ?? 'Failed to load tables');
        setTables([]);
      })
      .finally(() => setLoading(false));

    // Poll every 5s for fresh table list (lobby broadcasts not guaranteed)
    const interval = setInterval(() => {
      client
        .pokerListTables()
        .then((res) => setTables(res.tables ?? []))
        .catch(() => {});
    }, 5000);

    return () => {
      clearInterval(interval);
      client.disconnect();
      clientRef.current = null;
      setWsClient(null);
    };
  }, [address, signTypedDataAsync]);

  useEffect(() => {
    if (!address || !getApiUrlOptional()) {
      setBalance(null);
      return;
    }
    const apiUrl = getApiUrlOptional();
    if (!apiUrl) return;
    fetch(`${apiUrl}/api/player/${address.toLowerCase()}/balance`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => (data?.balance != null ? setBalance(String(data.balance)) : setBalance(null)))
      .catch(() => setBalance(null));
  }, [address]);

  /** Navigate to table page with join params; table page will connect once and call pokerJoinTable. */
  const handleJoin = () => {
    if (!joinModal || !address) return;
    setError(null);
    if (joinModal.hasPin && !/^\d{4}$/.test(joinPin)) {
      setError('Enter the 4-digit PIN to join this private table');
      return;
    }
    let buyInWei: string;
    try {
      buyInWei = parseEther(buyIn.trim().replace(/,/g, '') || '0').toString();
    } catch {
      setError('Invalid buy-in amount');
      return;
    }
    const bbWei = BigInt(joinModal.bigBlindWei);
    const { minWei, maxWei } = getCashBuyInBoundsWei(bbWei);
    const bi = BigInt(buyInWei);
    if (bi < minWei || bi > maxWei) {
      setError(
        `Buy-in must be between ${POKER_CASH_MIN_BUY_IN_BB} and ${POKER_CASH_MAX_BUY_IN_BB} big blinds (${formatEther(minWei)}–${formatEther(maxWei)} MORBIUS).`
      );
      return;
    }
    const targetTableId = joinModal.tableId;
    const pin = joinModal.hasPin ? joinPin : '';
    setJoinModal(null);
    setJoinPin('');
    const pinParam = pin ? `&pin=${encodeURIComponent(pin)}` : '';
    router.push(`/poker/${targetTableId}?join=1&buyIn=${encodeURIComponent(buyInWei)}${pinParam}`);
  };

  const handleCreateTable = async () => {
    if (!createModal || !address || !wsClient) return;
    if (createModal.pinEnabled && !/^\d{4}$/.test(createModal.pinCode)) {
      setError('PIN must be exactly 4 digits');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const sbWei = (() => {
        try { return parseEther(createModal.smallBlind.trim().replace(/,/g, '') || '0').toString(); }
        catch { return createModal.smallBlind; }
      })();
      const bbWei = (() => {
        try { return parseEther(createModal.bigBlind.trim().replace(/,/g, '') || '0').toString(); }
        catch { return createModal.bigBlind; }
      })();
      const pinCode = createModal.pinEnabled ? createModal.pinCode : undefined;
      const { tableId } = await wsClient.pokerCreateTable(sbWei, bbWei, createModal.maxSeats, pinCode);
      const createdPin = pinCode || '';
      setCreateModal(null);
      // Auto-join creator at max buy-in (100 BB) — matches cash-game rules
      let bbBig: bigint;
      try {
        bbBig = parseEther(createModal.bigBlind.trim().replace(/,/g, '') || '0');
      } catch {
        bbBig = 0n;
      }
      const { maxWei } = getCashBuyInBoundsWei(bbBig);
      const buyInWei = maxWei.toString();
      const pinParam = createdPin ? `&pin=${encodeURIComponent(createdPin)}` : '';
      router.push(`/poker/${tableId}?join=1&buyIn=${encodeURIComponent(buyInWei)}${pinParam}`);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to create table');
    } finally {
      setCreating(false);
    }
  };

  if (showIntro) {
    return <IntroScreen onComplete={() => setShowIntro(false)} />;
  }

  return (
    <>
      <PokerBetaSplash />
      <div className="relative min-h-screen h-full w-full flex flex-col bg-gradient-to-b from-[#080c14] via-slate-950 to-[#080c14] text-white">
        <div className="absolute inset-0 h-full min-h-screen w-full bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(34,211,238,0.10),transparent_70%)] pointer-events-none" />
        <div className="relative flex-1 w-full max-w-4xl mx-auto px-3 py-4 sm:px-4 sm:py-8">
          {/* ── Hero Section ── */}
          <div
            className="relative rounded-3xl overflow-hidden mb-6 sm:mb-8 border border-cyan-400/10"
            style={{
              background: 'linear-gradient(170deg, #0c1929 0%, #0a0f1a 40%, #0d1117 100%)',
              boxShadow: '0 0 80px rgba(34,211,238,0.07), 0 2px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(34,211,238,0.1)',
            }}
          >
            {/* Top glow line */}
            <div className="h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

            {/* Decorative card fan — positioned behind content */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[45%] pointer-events-none select-none opacity-[0.04]">
              <div className="relative w-[400px] h-[300px]">
                {[
                  { r: -25, x: -60, y: 0 },
                  { r: -10, x: -20, y: -10 },
                  { r: 5, x: 20, y: -10 },
                  { r: 20, x: 60, y: 0 },
                ].map((c, i) => (
                  <div
                    key={i}
                    className="absolute left-1/2 top-1/2 w-[140px] h-[200px] rounded-2xl border-2 border-white/30 bg-white/10"
                    style={{
                      transform: `translate(-50%, -50%) rotate(${c.r}deg) translateX(${c.x}px) translateY(${c.y}px)`,
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="relative overflow-hidden">
              {/* Layered radial glows */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(34,211,238,0.18),transparent_70%)] pointer-events-none" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_60%_at_20%_100%,rgba(59,130,246,0.08),transparent_60%)] pointer-events-none" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_60%_at_80%_100%,rgba(99,102,241,0.06),transparent_60%)] pointer-events-none" />

              {/* Subtle grid overlay */}
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.03]"
                style={{
                  backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                  backgroundSize: '40px 40px',
                }}
              />

              {/* Top bar */}
              <div className="relative flex justify-between items-center px-5 sm:px-10 pt-5 sm:pt-8">
                <Link href="/" className="inline-flex items-center gap-2 text-slate-500 hover:text-cyan-400 text-xs sm:text-sm font-medium transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                  Back to Home
                </Link>
                {isConnected && (
                  <div className="flex items-center gap-2.5">
                    {balance != null && (
                      <div
                        className="flex items-center gap-2 px-4 py-2 rounded-full border border-cyan-500/20"
                        style={{ background: 'rgba(8,12,20,0.8)', boxShadow: 'inset 0 1px 0 rgba(34,211,238,0.08)' }}
                      >
                        <span className="text-sm font-bold text-cyan-400 tabular-nums">{formatChips(balance)}</span>
                        <span className="text-[11px] text-slate-500 font-medium">MORBIUS</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowDepositModal(true)}
                      className="px-4 py-2 rounded-full text-white text-xs sm:text-sm font-semibold hover:-translate-y-0.5 transition-all"
                      style={{
                        background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                        boxShadow: '0 2px 12px rgba(6,182,212,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
                      }}
                    >
                      + Get Chips
                    </button>
                  </div>
                )}
              </div>

              {/* Centered hero content */}
              <div className="relative text-center px-5 sm:px-10 pt-10 sm:pt-14 pb-12 sm:pb-16">
                {/* Live badge */}
                <div
                  className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full mb-6 sm:mb-8"
                  style={{
                    background: 'rgba(34,211,238,0.06)',
                    border: '1px solid rgba(34,211,238,0.15)',
                    boxShadow: '0 0 20px rgba(34,211,238,0.08)',
                  }}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
                  </span>
                  <span className="text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase text-cyan-400">
                    {tables.length > 0 ? `${tables.length} Live Table${tables.length !== 1 ? 's' : ''}` : 'No Active Tables'}
                  </span>
                </div>

                {/* Main title */}
                <h1
                  className="text-5xl sm:text-6xl md:text-7xl font-black tracking-[-3px] leading-[1] mb-4"
                  style={{
                    background: 'linear-gradient(180deg, #ffffff 0%, #e2e8f0 40%, #64748b 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))',
                  }}
                >
                  Texas Hold&apos;em
                </h1>
                <p className="text-sm sm:text-base text-slate-500 mb-10 sm:mb-12 max-w-md mx-auto">
                  No-limit multiplayer poker. Join a table or start your own.
                </p>

                {/* CTA buttons */}
                <div className="flex justify-center gap-3 flex-wrap">
                  {isConnected && (
                    <button
                      type="button"
                      onClick={() => setCreateModal({ smallBlind: '10', bigBlind: '20', maxSeats: 6, pinCode: '', pinEnabled: false })}
                      className="flex items-center gap-2 px-7 py-3.5 rounded-2xl text-white text-sm font-bold hover:-translate-y-0.5 transition-all"
                      style={{
                        background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                        boxShadow: '0 4px 24px rgba(6,182,212,0.3), 0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
                      }}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14" /></svg>
                      Create Table
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowHowToPlay(true)}
                    className="flex items-center gap-2 px-6 py-3.5 rounded-2xl text-slate-400 text-sm font-medium hover:text-white transition-all"
                    style={{
                      background: 'rgba(30,41,59,0.5)',
                      border: '1px solid rgba(51,65,85,0.5)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                    }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                    How to Play
                  </button>
                  <Link
                    href="/poker/demo?tutorial=1"
                    className="flex items-center px-5 py-3.5 rounded-2xl text-slate-600 hover:text-slate-300 text-sm font-medium transition-colors"
                  >
                    Tutorial
                  </Link>
                </div>
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex items-center gap-1 px-5 sm:px-10 py-3.5 sm:py-4 border-t border-white/[0.04]" style={{ background: 'rgba(0,0,0,0.2)' }}>
              <button
                type="button"
                onClick={() => setActiveTab('cash')}
                className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  activeTab === 'cash'
                    ? 'bg-cyan-500/[0.12] text-cyan-400'
                    : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                Cash Games
                {tables.length > 0 && activeTab === 'cash' && (
                  <span className="ml-2 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400">{tables.length}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('tournaments')}
                className={`relative px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  activeTab === 'tournaments'
                    ? 'bg-cyan-500/[0.12] text-cyan-400'
                    : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                Tournaments
                <span className="ml-2 text-[9px] sm:text-[10px] font-bold tracking-wider uppercase text-amber-400/80">Soon</span>
              </button>
            </div>
          </div>

          {/* Tournament Coming Soon */}
          {activeTab === 'tournaments' && (
            <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-cyan-500/[0.08] border border-cyan-500/15 flex items-center justify-center text-3xl sm:text-4xl mb-5">
                🏆
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-200 mb-2">Tournaments Coming Soon</h3>
              <p className="text-sm sm:text-base text-slate-500 max-w-md leading-relaxed mb-6">
                Multi-table tournaments with structured blind levels, guaranteed prize pools, and satellite qualifiers are on the way.
              </p>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                </span>
                <span className="text-xs sm:text-sm font-medium text-amber-400/90">In Development</span>
              </div>
            </div>
          )}

          {activeTab === 'cash' && error && <p className="text-red-400 mb-4">{error}</p>}
          {activeTab === 'cash' && !loading && tables.length === 0 && !error && (
            <p className="text-slate-400">
              No tables available. {isConnected ? 'Click "Create table" above to start one.' : 'Connect your wallet to create a table.'}
            </p>
          )}
          {activeTab === 'cash' && !loading && tables.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {tables.map((t) => {
                const isPlaying = t.status === 'playing';
                const openSeats = t.maxSeats - t.seatedCount;
                const accentSolid = getBlindAccentSolid(t.bigBlind);
                return (
                  <div
                    key={t.id}
                    className="relative bg-[#e0e5ec] rounded-[2rem] p-6 flex flex-col justify-between gap-6 overflow-hidden"
                    style={{ boxShadow: '2px 2px 6px rgba(163,177,198,0.25), -2px -2px 6px rgba(255,255,255,0.25)' }}
                  >
                    {/* Content */}
                    <div className="relative z-10 flex flex-col justify-between gap-6">
                    <div className="flex justify-between items-center">
                      <div
                        className="w-11 h-11 rounded-full bg-[#e0e5ec] flex items-center justify-center text-lg"
                        style={{ boxShadow: 'inset 2px 2px 4px rgba(163,177,198,0.5), inset -2px -2px 4px rgba(255,255,255,0.4)', color: accentSolid }}
                      >
                        ♠
                      </div>
                      <div className="flex items-center gap-1.5">
                        {t.hasPin && (
                          <div
                            className="w-8 h-8 rounded-full bg-[#e0e5ec] flex items-center justify-center"
                            style={{ boxShadow: '2px 2px 4px rgba(163,177,198,0.4), -2px -2px 4px rgba(255,255,255,0.4)' }}
                            title="Private table — PIN required"
                          >
                            <svg className="w-3.5 h-3.5 text-amber-600" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C9.24 2 7 4.24 7 7v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V7c0-2.76-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3v3H9V7c0-1.66 1.34-3 3-3zm0 10c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z" /></svg>
                          </div>
                        )}
                        <div
                          className="px-3 py-1.5 rounded-full bg-[#e0e5ec]"
                          style={{ boxShadow: '2px 2px 4px rgba(163,177,198,0.4), -2px -2px 4px rgba(255,255,255,0.4)' }}
                        >
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${isPlaying ? 'text-emerald-600' : 'text-slate-500'}`}>
                            {isPlaying ? 'In Progress' : 'Waiting'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: blinds + game type */}
                    <div className="text-center">
                      <h3 className="text-2xl font-bold text-slate-700 tracking-tight mb-1">
                        {formatChips(t.smallBlind)} / {formatChips(t.bigBlind)}
                      </h3>
                      <p className="text-slate-500 font-medium text-sm">No-Limit Texas Hold&apos;em</p>
                    </div>

                    {/* Stats row */}
                    <div className="flex justify-between items-center px-1">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Players</span>
                        <span className="text-base font-bold text-slate-700 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" /></svg>
                          {t.seatedCount}/{t.maxSeats}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 items-end">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Open Seats</span>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold text-slate-700">{openSeats}</span>
                          <button
                            type="button"
                            onClick={() => openPlayersDropdown(t.id)}
                            className="text-[10px] font-bold text-slate-500 hover:text-slate-700 uppercase tracking-wider underline"
                          >
                            {playersDropdownTableId === t.id ? 'Hide' : 'View'}
                          </button>
                        </div>
                      </div>
                    </div>
                    {/* Players dropdown */}
                    {playersDropdownTableId === t.id && (
                      <div
                        className="rounded-xl bg-[#e0e5ec] border border-slate-300/50 overflow-hidden"
                        style={{ boxShadow: 'inset 2px 2px 4px rgba(163,177,198,0.4), inset -2px -2px 4px rgba(255,255,255,0.4)' }}
                      >
                        <div className="px-3 py-2 border-b border-slate-300/50">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Seated players</span>
                        </div>
                        <div className="p-2 max-h-32 overflow-y-auto">
                          {tablePlayersLoading ? (
                            <p className="text-slate-500 text-xs">Loading…</p>
                          ) : tablePlayers?.tableId === t.id ? (
                            (() => {
                              const seated = tablePlayers.seats.filter((s) => s.playerAddress);
                              if (seated.length === 0) {
                                return <p className="text-slate-500 text-xs">No players seated</p>;
                              }
                              return (
                                <ul className="space-y-1.5 text-xs">
                                  {seated.map((s) => (
                                    <li key={s.position} className="flex items-center justify-between gap-2 text-slate-700">
                                      <span className="font-medium">Seat {s.position + 1}</span>
                                      <span className="font-mono text-slate-600 truncate max-w-[140px]" title={s.playerAddress ?? ''}>
                                        {s.playerAddress ? truncateAddress(s.playerAddress) : '—'}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              );
                            })()
                          ) : (
                            <p className="text-slate-500 text-xs">No players seated</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-3">
                        <Link
                          href={`/poker/${t.id}`}
                          className="flex-1 py-3 rounded-2xl bg-[#e0e5ec] text-slate-500 font-bold uppercase tracking-widest text-xs text-center transition-all duration-200"
                          style={{ boxShadow: '2px 2px 4px rgba(163,177,198,0.4), -2px -2px 4px rgba(255,255,255,0.4)' }}
                          onMouseDown={(e) => { e.currentTarget.style.boxShadow = 'inset 2px 2px 4px rgba(163,177,198,0.5), inset -2px -2px 4px rgba(255,255,255,0.4)'; }}
                          onMouseUp={(e) => { e.currentTarget.style.boxShadow = '2px 2px 4px rgba(163,177,198,0.4), -2px -2px 4px rgba(255,255,255,0.4)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '2px 2px 4px rgba(163,177,198,0.4), -2px -2px 4px rgba(255,255,255,0.4)'; }}
                        >
                          Watch
                        </Link>
                        {isConnected && (
                          <button
                            type="button"
                            onClick={() => {
                              const bb = BigInt(t.bigBlind);
                              const { maxWei } = getCashBuyInBoundsWei(bb);
                              setBuyIn(formatEther(maxWei));
                              setJoinModal({ tableId: t.id, hasPin: t.hasPin, bigBlindWei: t.bigBlind });
                              setJoinPin('');
                            }}
                            className="flex-1 py-3 rounded-2xl font-bold uppercase tracking-widest text-xs text-white transition-all duration-200 active:scale-95 shadow"
                            style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', boxShadow: '2px 2px 6px rgba(0,0,0,0.2)' }}
                          >
                            Sit
                          </button>
                        )}
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => removeTable(t.id)}
                          disabled={removingTableId === t.id}
                          className="text-[10px] font-medium text-slate-400 hover:text-red-500 uppercase tracking-wider transition-colors disabled:opacity-50"
                        >
                          {removingTableId === t.id ? 'Removing…' : 'Remove table'}
                        </button>
                      )}
                    </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6">
            <GameFAQ
              game="poker"
              addresses={[
                { label: 'MORBIUS Token', address: MORBIUS_TOKEN_ADDRESS },
              ]}
            />
          </div>
        </div>

        {joinModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div
              className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
              style={Theme.panel?.base}
            >
              <div className="p-4 border-b border-cyan-500/30">
                <h3 className="text-lg font-semibold text-cyan-400 flex items-center gap-2">
                  Join Table
                  {joinModal.hasPin && (
                    <span className="flex items-center gap-1 text-xs font-medium text-amber-400">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C9.24 2 7 4.24 7 7v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V7c0-2.76-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3v3H9V7c0-1.66 1.34-3 3-3zm0 10c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z" /></svg>
                      Private
                    </span>
                  )}
                </h3>
              </div>
              <div className="p-4 space-y-4">
                {joinModal.hasPin && (
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Table PIN</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={joinPin}
                      onChange={(e) => setJoinPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="Enter 4-digit PIN"
                      className="w-full rounded-lg bg-slate-800 border border-amber-500/40 px-3 py-2 text-white text-center tracking-[0.5em] text-lg font-mono"
                      autoFocus
                    />
                  </div>
                )}
                {balance != null && (() => {
                  try {
                    return parseEther(buyIn.trim().replace(/,/g, '') || '0') > BigInt(balance);
                  } catch {
                    return false;
                  }
                })() && (
                  <p className="text-amber-400 text-sm">
                    Insufficient balance. <button type="button" onClick={() => setShowDepositModal(true)} className="underline hover:text-amber-300">Get chips</button>
                  </p>
                )}
                <div className="rounded-lg bg-slate-800/80 border border-cyan-500/20 px-3 py-2.5 space-y-1">
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    <span className="text-cyan-400/90 font-medium">Cash buy-in:</span>{' '}
                    {joinModal ? (
                      <>
                        For this table:{' '}
                        <span className="text-slate-300 tabular-nums">
                          {formatEther(getCashBuyInBoundsWei(BigInt(joinModal.bigBlindWei)).minWei)} –{' '}
                          {formatEther(getCashBuyInBoundsWei(BigInt(joinModal.bigBlindWei)).maxWei)}
                        </span>{' '}
                        MORBIUS.
                      </>
                    ) : null}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    No in-table top-ups — leave and rejoin to change your stack.
                  </p>
                </div>
                <label className="block text-sm text-slate-400">Buy-in (MORBIUS)</label>
                <input
                  type="text"
                  value={buyIn}
                  onChange={(e) => setBuyIn(e.target.value)}
                  placeholder="e.g. 100"
                  className="w-full rounded-lg bg-slate-800 border border-cyan-500/30 px-3 py-2 text-white"
                />
                {joinBuyInOutOfRange && buyIn.trim() !== '' && (
                  <p className="text-amber-400/90 text-xs">
                    Enter an amount between {formatEther(getCashBuyInBoundsWei(BigInt(joinModal.bigBlindWei)).minWei)} and{' '}
                    {formatEther(getCashBuyInBoundsWei(BigInt(joinModal.bigBlindWei)).maxWei)} MORBIUS.
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setJoinModal(null)}
                    className="flex-1 py-2 rounded-lg border border-slate-500 text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleJoin}
                    disabled={
                      joinBuyInOutOfRange
                      || (joinModal.hasPin && !/^\d{4}$/.test(joinPin))
                      || (balance != null && (() => {
                        try {
                          return parseEther(buyIn.trim().replace(/,/g, '') || '0') > BigInt(balance);
                        } catch {
                          return false;
                        }
                      })())
                    }
                    className="flex-1 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white disabled:opacity-50"
                  >
                    Join
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showHowToPlay && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div
              className="bg-[#e0e5ec] rounded-[2rem] max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
              style={{ boxShadow: '4px 4px 8px rgba(163,177,198,0.4), -4px -4px 8px rgba(255,255,255,0.4)' }}
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-300/60 shrink-0">
                <div className="w-10 h-10 rounded-full bg-[#e0e5ec] flex items-center justify-center text-slate-500 text-lg" style={{ boxShadow: 'inset 2px 2px 4px rgba(163,177,198,0.5), inset -2px -2px 4px rgba(255,255,255,0.4)' }}>
                  ♠
                </div>
                <h2 className="text-xl font-bold text-slate-700">How to Play</h2>
                <button
                  type="button"
                  onClick={() => setShowHowToPlay(false)}
                  className="w-10 h-10 rounded-full bg-[#e0e5ec] flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors"
                  style={{ boxShadow: '2px 2px 4px rgba(163,177,198,0.4), -2px -2px 4px rgba(255,255,255,0.4)' }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
                <section>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Overview</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">
                    Texas Hold&apos;em is a community-card poker game. Each player gets two private cards (hole cards) and shares five community cards. You make the best five-card hand using any combination of your two cards and the five on the table.
                  </p>
                </section>

                <section>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Objective</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">
                    Win chips by having the best hand at showdown, or by making all other players fold. In no-limit Hold&apos;em you can bet any amount up to your full stack at any time.
                  </p>
                </section>

                <section>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Game flow</h3>
                  <ul className="text-slate-700 text-sm space-y-2 list-disc pl-4">
                    <li><strong className="text-slate-600">Blinds:</strong> Before each hand, the two players to the left of the dealer post the small blind and big blind.</li>
                    <li><strong className="text-slate-600">Pre-flop:</strong> You receive two hole cards. First betting round (everyone can fold, call the big blind, or raise).</li>
                    <li><strong className="text-slate-600">Flop:</strong> Three community cards are dealt. Second betting round.</li>
                    <li><strong className="text-slate-600">Turn:</strong> One more community card. Third betting round.</li>
                    <li><strong className="text-slate-600">River:</strong> Final community card. Fourth betting round.</li>
                    <li><strong className="text-slate-600">Showdown:</strong> Remaining players reveal their hands. Best five-card hand wins the pot.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Actions</h3>
                  <ul className="text-slate-700 text-sm space-y-1.5 list-none">
                    <li><strong className="text-slate-600">Fold</strong> — Drop out of the hand and give up your cards.</li>
                    <li><strong className="text-slate-600">Check</strong> — Stay in without betting (only when no one has bet this round).</li>
                    <li><strong className="text-slate-600">Bet</strong> — Put chips into the pot (first to act in a round).</li>
                    <li><strong className="text-slate-600">Call</strong> — Match the current bet to stay in.</li>
                    <li><strong className="text-slate-600">Raise</strong> — Increase the bet; others must call the new amount or fold.</li>
                    <li><strong className="text-slate-600">All-in</strong> — Bet your entire stack. You can only win up to what each opponent has put in for that hand.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Hand rankings</h3>
                  <p className="text-slate-500 text-xs mb-3">Best (1) to worst (10). Examples use cards from the deck.</p>
                  <ol className="space-y-4 text-sm">
                    {[
                      { rank: 1, name: 'Royal Flush', desc: 'A, K, Q, J, 10 of the same suit.', cards: ['AS', 'KS', 'QS', 'JS', '10S'] },
                      { rank: 2, name: 'Straight Flush', desc: 'Five consecutive cards of the same suit.', cards: ['9H', '8H', '7H', '6H', '5H'] },
                      { rank: 3, name: 'Four of a Kind', desc: 'Four cards of the same rank.', cards: ['KC', 'KH', 'KD', 'KS', '3D'] },
                      { rank: 4, name: 'Full House', desc: 'Three of a kind plus a pair.', cards: ['AC', 'AD', 'AH', 'KS', 'KD'] },
                      { rank: 5, name: 'Flush', desc: 'Five cards of the same suit (not in sequence).', cards: ['AH', 'JH', '9H', '6H', '2H'] },
                      { rank: 6, name: 'Straight', desc: 'Five consecutive cards of mixed suits.', cards: ['10C', '9D', '8H', '7S', '6C'] },
                      { rank: 7, name: 'Three of a Kind', desc: 'Three cards of the same rank.', cards: ['QC', 'QD', 'QH', '5S', '2D'] },
                      { rank: 8, name: 'Two Pair', desc: 'Two different pairs.', cards: ['JC', 'JD', '9H', '9S', '3C'] },
                      { rank: 9, name: 'One Pair', desc: 'Two cards of the same rank.', cards: ['KC', 'KD', '10H', '5D', '2S'] },
                      { rank: 10, name: 'High Card', desc: 'No pair; highest card wins.', cards: ['AS', 'KD', '10C', '5H', '2S'] },
                    ].map(({ rank, name, desc, cards }) => (
                      <li key={rank} className="flex gap-3 items-start">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-[#e0e5ec] flex items-center justify-center text-[10px] font-bold text-slate-500" style={{ boxShadow: 'inset 2px 2px 4px rgba(163,177,198,0.5), inset -2px -2px 4px rgba(255,255,255,0.4)' }}>{rank}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 mb-1">
                            {cards.map((c) => (
                              <Image
                                key={c}
                                src={`/BlackJack/Cards/PNG/${c}.png`}
                                alt={c}
                                width={36}
                                height={50}
                                className="rounded shadow-sm object-contain"
                              />
                            ))}
                          </div>
                          <span className="font-bold text-slate-700">{name}</span>
                          <span className="text-slate-600"> — {desc}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
              <div className="p-4 border-t border-slate-300/60 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowHowToPlay(false)}
                  className="w-full py-3 rounded-2xl font-bold uppercase tracking-widest text-xs text-white transition-all duration-200 active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', boxShadow: '2px 2px 6px rgba(0,0,0,0.2)' }}
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}

        {createModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div
              className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
              style={Theme.panel?.base}
            >
              <div className="p-4 border-b border-cyan-500/30">
                <h3 className="text-lg font-semibold text-cyan-400">Create Table</h3>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-xs text-slate-500">Blinds in MORBIUS (e.g. 10 = 10 MORBIUS)</p>
                <label className="block text-sm text-slate-400">Small blind</label>
                <input
                  type="text"
                  value={createModal.smallBlind}
                  onChange={(e) => setCreateModal((m) => m ? { ...m, smallBlind: e.target.value } : null)}
                  className="w-full rounded-lg bg-slate-800 border border-cyan-500/30 px-3 py-2 text-white"
                />
                <label className="block text-sm text-slate-400">Big blind</label>
                <input
                  type="text"
                  value={createModal.bigBlind}
                  onChange={(e) => setCreateModal((m) => m ? { ...m, bigBlind: e.target.value } : null)}
                  className="w-full rounded-lg bg-slate-800 border border-cyan-500/30 px-3 py-2 text-white"
                />
                <label className="block text-sm text-slate-400">Max seats (2–10)</label>
                <input
                  type="number"
                  min={2}
                  max={10}
                  value={createModal.maxSeats}
                  onChange={(e) => setCreateModal((m) => m ? { ...m, maxSeats: Math.min(10, Math.max(2, Number(e.target.value) || 6)) } : null)}
                  className="w-full rounded-lg bg-slate-800 border border-cyan-500/30 px-3 py-2 text-white"
                />
                {/* Private table PIN toggle */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C9.24 2 7 4.24 7 7v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V7c0-2.76-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3v3H9V7c0-1.66 1.34-3 3-3zm0 10c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z" /></svg>
                    <span className="text-sm text-slate-400">Private table</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCreateModal((m) => m ? { ...m, pinEnabled: !m.pinEnabled, pinCode: '' } : null)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${createModal.pinEnabled ? 'bg-cyan-500' : 'bg-slate-700'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${createModal.pinEnabled ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
                {createModal.pinEnabled && (
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">4-digit PIN</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={createModal.pinCode}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setCreateModal((m) => m ? { ...m, pinCode: v } : null);
                      }}
                      placeholder="0000"
                      className="w-full rounded-lg bg-slate-800 border border-cyan-500/30 px-3 py-2 text-white text-center tracking-[0.5em] text-lg font-mono"
                    />
                    <p className="text-[11px] text-slate-600 mt-1">Share this PIN with players you want to invite.</p>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateModal(null)}
                    className="flex-1 py-2 rounded-lg border border-slate-500 text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateTable}
                    disabled={creating || !createModal.smallBlind || !createModal.bigBlind || (createModal.pinEnabled && !/^\d{4}$/.test(createModal.pinCode))}
                    className="flex-1 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <Footer />
      </div>

      <GameWalletModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        balanceLabel="Poker Balance"
      />
    </>
  );
}
