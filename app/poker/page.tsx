'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useSignTypedData } from 'wagmi';
import { getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import type { PokerTableSummary } from '@/lib/websocket-client';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import Footer from '@/components/BIG-WHEEL/Footer';
import { Theme } from '@/lib/theme';

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
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [showIntro, setShowIntro] = useState(true);
  const [tables, setTables] = useState<PokerTableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinModal, setJoinModal] = useState<{ tableId: string } | null>(null);
  const [buyIn, setBuyIn] = useState('1000');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl) {
      setError('WebSocket not configured');
      setLoading(false);
      return;
    }
    const client = new BlackjackWebSocketClient(wsUrl);
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
  }, []);

  const handleJoin = async () => {
    if (!joinModal || !address) return;
    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl) return;
    setJoining(true);
    try {
      const client = new BlackjackWebSocketClient(wsUrl, address.toLowerCase(), signTypedDataAsync as any);
      await client.connect();
      await client.pokerJoinTable(joinModal.tableId, buyIn);
      window.location.href = `/poker/${joinModal.tableId}`;
    } catch (err) {
      setError((err as Error).message ?? 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  if (showIntro) {
    return <IntroScreen onComplete={() => setShowIntro(false)} />;
  }

  return (
    <GlobalMainNav page="home">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.3),transparent_70%)]" />
        <div className="relative w-full max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-sm">← Back</Link>
            <h1 className="text-2xl md:text-3xl font-bold text-cyan-400">Texas Hold&apos;em</h1>
          </div>
          <p className="text-slate-400 mb-6">Multiplayer no-limit Hold&apos;em. Join a table and play.</p>

          {loading && <p className="text-slate-400">Loading tables...</p>}
          {error && <p className="text-red-400 mb-4">{error}</p>}
          {!loading && tables.length === 0 && !error && (
            <p className="text-slate-400">No tables available. Create one from the server or run the migration.</p>
          )}
          {!loading && tables.length > 0 && (
            <div className="grid gap-4">
              {tables.map((t) => (
                <div
                  key={t.id}
                  className="rounded-xl border border-cyan-500/30 p-4 flex flex-wrap items-center justify-between gap-4"
                  style={{
                    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  <div>
                    <span className="text-cyan-400 font-medium">{t.smallBlind}/{t.bigBlind}</span>
                    <span className="text-slate-400 ml-2">
                      {t.seatedCount}/{t.maxSeats} seated
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/poker/${t.id}`}
                      className="px-4 py-2 rounded-lg bg-cyan-600/50 text-cyan-200 hover:bg-cyan-600 text-sm"
                    >
                      Watch
                    </Link>
                    {isConnected && (
                      <button
                        type="button"
                        onClick={() => setJoinModal({ tableId: t.id })}
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-700 hover:to-blue-700 text-sm"
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
                <label className="block text-sm text-slate-400">Buy-in (chips)</label>
                <input
                  type="text"
                  value={buyIn}
                  onChange={(e) => setBuyIn(e.target.value)}
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
                    disabled={joining}
                    className="flex-1 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white disabled:opacity-50"
                  >
                    {joining ? 'Joining...' : 'Join'}
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
