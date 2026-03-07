'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { getApiUrlOptional, getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { PokerTableSummary } from '@/lib/websocket-client';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import Footer from '@/components/BIG-WHEEL/Footer';
import { Theme } from '@/lib/theme';

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
  const [joinModal, setJoinModal] = useState<{ tableId: string } | null>(null);
  const [buyIn, setBuyIn] = useState('1000');
  const [balance, setBalance] = useState<string | null>(null);
  const [createModal, setCreateModal] = useState<{ smallBlind: string; bigBlind: string; maxSeats: number } | null>(null);
  const [creating, setCreating] = useState(false);

  const clientRef = React.useRef<BlackjackWebSocketClient | null>(null);

  useEffect(() => {
    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl) {
      setError('WebSocket not configured');
      setLoading(false);
      return;
    }

    const client = new BlackjackWebSocketClient(wsUrl);
    clientRef.current = client;

    // Listen for broadcast table list updates
    client.on('poker_table_list', (payload: { tables: PokerTableSummary[] }) => {
      setTables(payload.tables ?? []);
    });

    client
      .connect()
      .then(() => client.pokerListTables())
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
    };
  }, []);

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

  /** Create a short-lived authenticated WS client for mutations (create table only). Join is done on table page to avoid duplicate auth. */
  const makeAuthClient = async () => {
    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl || !address) return null;
    const client = new BlackjackWebSocketClient(wsUrl, address.toLowerCase(), signTypedDataAsync as any);
    await client.connect();
    return client;
  };

  /** Navigate to table page with join params; table page will connect once and call pokerJoinTable. */
  const handleJoin = () => {
    if (!joinModal || !address) return;
    setError(null);
    let buyInWei: string;
    try {
      buyInWei = parseEther(buyIn.trim().replace(/,/g, '') || '0').toString();
    } catch {
      setError('Invalid buy-in amount');
      return;
    }
    const targetTableId = joinModal.tableId;
    setJoinModal(null);
    router.push(`/poker/${targetTableId}?join=1&buyIn=${encodeURIComponent(buyInWei)}`);
  };

  const handleCreateTable = async () => {
    if (!createModal || !address) return;
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
      const client = await makeAuthClient();
      if (!client) return;
      const { tableId } = await client.pokerCreateTable(sbWei, bbWei, createModal.maxSeats);
      client.disconnect();
      setCreateModal(null);
      router.push(`/poker/${tableId}`);
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
    <GlobalMainNav page="home">
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.3),transparent_70%)]" />
        <div className="relative flex-1 w-full max-w-4xl mx-auto px-3 py-4 sm:px-4 sm:py-8">
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 mb-4 sm:mb-8">
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
              <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-xs sm:text-sm">← Back</Link>
              <Link href="/poker/designer" className="text-slate-400 hover:text-cyan-400 text-xs sm:text-sm">Design layout</Link>
              {isConnected && (
                <>
                  {balance != null && (
                    <span className="text-slate-300 text-xs sm:text-sm">
                      Balance: <span className="text-cyan-400 font-medium">{formatChips(balance)}</span> chips
                    </span>
                  )}
                  <Link
                    href="/BLACKJACK?open=deposit"
                    className="text-xs sm:text-sm px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-700 hover:to-blue-700"
                  >
                    Get chips
                  </Link>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="text-lg sm:text-2xl md:text-3xl font-bold text-cyan-400">Texas Hold&apos;em</h1>
              {isConnected && (
                <button
                  type="button"
                  onClick={() => setCreateModal({ smallBlind: '10', bigBlind: '20', maxSeats: 6 })}
                  className="px-2 py-1.5 sm:px-4 sm:py-2 rounded-lg border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 text-xs sm:text-sm"
                >
                  Create table
                </button>
              )}
            </div>
          </div>
          <p className="text-slate-400 mb-4 sm:mb-6 text-xs sm:text-base">Multiplayer no-limit Hold&apos;em. Join a table and play. Chips are the same balance as Blackjack — deposit on Blackjack to play.</p>

          {loading && <p className="text-slate-400">Loading tables...</p>}
          {error && <p className="text-red-400 mb-4">{error}</p>}
          {!loading && tables.length === 0 && !error && (
            <p className="text-slate-400">
              No tables available. {isConnected ? 'Click "Create table" above to start one.' : 'Connect your wallet to create a table.'}
            </p>
          )}
          {!loading && tables.length > 0 && (
            <div className="grid gap-3 sm:gap-4">
              {tables.map((t) => (
                <div
                  key={t.id}
                  className="rounded-xl border border-cyan-500/30 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-2 sm:gap-4"
                  style={{
                    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  <div className="min-w-0">
                    <span className="text-cyan-400 font-medium text-sm sm:text-base">{formatChips(t.smallBlind)}/{formatChips(t.bigBlind)}</span>
                    <span className="text-slate-400 ml-1 sm:ml-2 text-xs sm:text-sm">
                      {t.seatedCount}/{t.maxSeats} seated
                    </span>
                    <span className="ml-1 sm:ml-2 text-[10px] sm:text-xs font-medium uppercase tracking-wider text-slate-500">
                      {t.status === 'playing' ? 'In progress' : 'Waiting'}
                    </span>
                  </div>
                  <div className="flex gap-1.5 sm:gap-2 shrink-0">
                    <Link
                      href={`/poker/${t.id}`}
                      className="px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-cyan-600/50 text-cyan-200 hover:bg-cyan-600 text-xs sm:text-sm"
                    >
                      Watch
                    </Link>
                    {isConnected && (
                      <button
                        type="button"
                        onClick={() => setJoinModal({ tableId: t.id })}
                        className="px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-700 hover:to-blue-700 text-xs sm:text-sm"
                      >
                        Join
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {joinModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div
              className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
              style={Theme.panel?.base}
            >
              <div className="p-4 border-b border-cyan-500/30">
                <h3 className="text-lg font-semibold text-cyan-400">Join Table</h3>
              </div>
              <div className="p-4 space-y-4">
                {balance != null && (() => {
                  try {
                    return parseEther(buyIn.trim().replace(/,/g, '') || '0') > BigInt(balance);
                  } catch {
                    return false;
                  }
                })() && (
                  <p className="text-amber-400 text-sm">
                    Insufficient balance. <Link href="/BLACKJACK?open=deposit" className="underline hover:text-amber-300">Get chips</Link>
                  </p>
                )}
                <label className="block text-sm text-slate-400">Buy-in (MORBIUS)</label>
                <input
                  type="text"
                  value={buyIn}
                  onChange={(e) => setBuyIn(e.target.value)}
                  placeholder="e.g. 1000"
                  className="w-full rounded-lg bg-slate-800 border border-cyan-500/30 px-3 py-2 text-white"
                />
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
                    disabled={balance != null && (() => {
                      try {
                        return parseEther(buyIn.trim().replace(/,/g, '') || '0') > BigInt(balance);
                      } catch {
                        return false;
                      }
                    })()}
                    className="flex-1 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white disabled:opacity-50"
                  >
                    Join
                  </button>
                </div>
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
                    disabled={creating || !createModal.smallBlind || !createModal.bigBlind}
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
    </GlobalMainNav>
  );
}
