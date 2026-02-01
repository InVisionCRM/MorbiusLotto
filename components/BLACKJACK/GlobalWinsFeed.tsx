'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { AnimatedList, AnimatedListItem } from '@/components/ui/animated-list';
import { formatEther } from 'viem';
import Image from 'next/image';

export interface GlobalWinEntry {
  id: string;
  playerAddress: string;
  result: 'win' | 'loss' | 'push' | 'blackjack';
  amount: bigint;
  payout: bigint;
  timestamp: number;
}

interface GlobalWinsFeedProps {
  wsClient?: any;
  wsConnected?: boolean;
  className?: string;
}

function WinEntry({ entry }: { entry: GlobalWinEntry }) {
  const isWin = entry.result === 'win' || entry.result === 'blackjack';
  const isPush = entry.result === 'push';
  const profit = entry.payout - entry.amount;

  const shortAddress = `${entry.playerAddress.slice(0, 4)}...${entry.playerAddress.slice(-4)}`;
  const profitAmount = Math.abs(Math.floor(Number(formatEther(profit))));

  const timeAgo = () => {
    const seconds = Math.floor((Date.now() - entry.timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  };

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-lg w-full"
      style={{
        background: isWin
          ? 'linear-gradient(145deg, rgba(34, 197, 94, 0.15), rgba(22, 163, 74, 0.1))'
          : isPush
          ? 'linear-gradient(145deg, rgba(234, 179, 8, 0.15), rgba(202, 138, 4, 0.1))'
          : 'linear-gradient(145deg, rgba(239, 68, 68, 0.15), rgba(185, 28, 28, 0.1))',
        border: isWin
          ? '1px solid rgba(34, 197, 94, 0.3)'
          : isPush
          ? '1px solid rgba(234, 179, 8, 0.3)'
          : '1px solid rgba(239, 68, 68, 0.3)',
      }}
    >
      {/* Result Icon */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${
          entry.result === 'blackjack'
            ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-black'
            : isWin
            ? 'bg-gradient-to-br from-green-500 to-green-700 text-white'
            : isPush
            ? 'bg-gradient-to-br from-yellow-500 to-yellow-700 text-black'
            : 'bg-gradient-to-br from-red-500 to-red-700 text-white'
        }`}
      >
        {entry.result === 'blackjack' ? 'BJ' : isWin ? 'W' : isPush ? 'P' : 'L'}
      </div>

      {/* Player & Amount */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white/80 text-sm font-medium truncate">
            {shortAddress}
          </span>
          <span className="text-white/40 text-xs">
            {timeAgo()}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isWin ? (
            <>
              <span className="text-green-400 font-bold text-sm">+{profitAmount.toLocaleString()}</span>
              <Image
                src="/morbius/MorbiusLogo (3).png"
                alt="MORBIUS"
                width={14}
                height={14}
                className="object-contain"
              />
            </>
          ) : isPush ? (
            <span className="text-yellow-400 font-bold text-sm">Push (returned)</span>
          ) : (
            <>
              <span className="text-red-400 font-bold text-sm">-{profitAmount.toLocaleString()}</span>
              <Image
                src="/morbius/MorbiusLogo (3).png"
                alt="MORBIUS"
                width={14}
                height={14}
                className="object-contain"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function GlobalWinsFeed({ wsClient, wsConnected, className = '' }: GlobalWinsFeedProps) {
  const [entries, setEntries] = useState<GlobalWinEntry[]>([]);

  // Subscribe to global game completions
  useEffect(() => {
    if (!wsClient || !wsConnected) return;

    const handleGlobalGameComplete = (data: any) => {
      try {
        const entry: GlobalWinEntry = {
          id: data.gameId || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          playerAddress: data.playerAddress || '0x0000...0000',
          result: data.result || 'loss',
          amount: BigInt(String(data.betAmount || '0')),
          payout: BigInt(String(data.payout || '0')),
          timestamp: Date.now(),
        };

        setEntries(prev => {
          // Avoid duplicates
          if (prev.some(e => e.id === entry.id)) return prev;
          // Add new entry at the beginning, keep last 20
          const updated = [entry, ...prev].slice(0, 20);
          return updated;
        });
      } catch (error) {
        console.error('Error processing global game event:', error);
      }
    };

    // Register handler for global game events
    wsClient.on('global_game_completed', handleGlobalGameComplete);

    return () => {
      wsClient.off('global_game_completed');
    };
  }, [wsClient, wsConnected]);

  // Also add entries from local game completions for immediate feedback
  const addLocalEntry = useCallback((entry: GlobalWinEntry) => {
    setEntries(prev => {
      // Avoid duplicates
      if (prev.some(e => e.id === entry.id)) return prev;
      return [entry, ...prev].slice(0, 20);
    });
  }, []);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className={`${className}`}>
      <div className="flex items-center gap-2 mb-3 px-1">
        <i className="fas fa-globe text-cyan-400 text-sm"></i>
        <span className="text-cyan-300/80 text-xs font-bold uppercase tracking-wider">Live Results</span>
      </div>
      <AnimatedList delay={2000} className="!gap-2">
        {entries.map((entry) => (
          <WinEntry key={entry.id} entry={entry} />
        ))}
      </AnimatedList>
    </div>
  );
}

export default GlobalWinsFeed;
