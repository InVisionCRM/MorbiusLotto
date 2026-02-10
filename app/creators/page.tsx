'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import { CreatorDashboard } from '@/components/Creators/CreatorDashboard';

export default function CreatorsPage() {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [wsClient, setWsClient] = useState<BlackjackWebSocketClient | null>(null);
  const [wsError, setWsError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const wsRef = useRef<BlackjackWebSocketClient | null>(null);

  const connectWs = useCallback(async () => {
    if (!address) return;
    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl) {
      setWsError('WebSocket server URL not configured');
      return;
    }

    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
    }

    setConnecting(true);
    setWsError(null);

    try {
      const client = new BlackjackWebSocketClient(wsUrl, address, signTypedDataAsync);
      wsRef.current = client;
      await client.connect();
      setWsClient(client);
    } catch (err) {
      setWsError(err instanceof Error ? err.message : 'Failed to connect');
      wsRef.current = null;
    } finally {
      setConnecting(false);
    }
  }, [address, signTypedDataAsync]);

  useEffect(() => {
    if (isConnected && address) {
      connectWs();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current = null;
      }
    };
  }, [isConnected, address, connectWs]);

  return (
    <div
      className="min-h-screen"
      style={{
        background: 'linear-gradient(135deg, #0a0e1a 0%, #0f172a 50%, #0a0e1a 100%)',
      }}
    >
      {/* Simple nav bar */}
      <nav
        className="h-12 flex items-center px-4 border-b border-gray-800"
        style={{
          background: 'linear-gradient(to right, #0f172a, #0f172a, rgba(6, 182, 212, 0.3))',
        }}
      >
        <Link href="/" className="text-lg font-medium text-white mr-4">
          MORBIUS.IO
        </Link>
        <Link
          href="/BLACKJACK"
          className="text-sm text-gray-400 hover:text-white transition-colors mr-4"
        >
          Blackjack
        </Link>
        <span className="text-sm text-cyan-400 font-medium">Creator Dashboard</span>
        <div className="ml-auto">
          <ConnectButton.Custom>
            {({ openConnectModal, account }) =>
              account ? (
                <span className="text-gray-400 text-sm font-mono">
                  {account.displayName}
                </span>
              ) : (
                <button
                  onClick={openConnectModal}
                  className="text-cyan-400 text-sm font-medium hover:text-cyan-300 transition-colors"
                >
                  Connect Wallet
                </button>
              )
            }
          </ConnectButton.Custom>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Not connected */}
        {!isConnected && (
          <div className="flex flex-col items-center justify-center py-20">
            <i className="fas fa-crown text-5xl text-purple-400 mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Creator Dashboard</h1>
            <p className="text-gray-400 mb-6">Connect your wallet to view your tournament creator dashboard</p>
            <ConnectButton />
          </div>
        )}

        {/* Connecting WS */}
        {isConnected && connecting && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <svg className="animate-spin h-8 w-8 text-cyan-400 mx-auto mb-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-gray-400">Connecting to server...</p>
            </div>
          </div>
        )}

        {/* WS Error */}
        {isConnected && wsError && !connecting && (
          <div className="flex flex-col items-center justify-center py-20">
            <i className="fas fa-exclamation-triangle text-4xl text-red-400 mb-4" />
            <p className="text-red-400 mb-4">{wsError}</p>
            <button
              onClick={connectWs}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm transition-colors"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Dashboard */}
        {isConnected && wsClient && address && !connecting && (
          <CreatorDashboard wsClient={wsClient} address={address} />
        )}
      </div>
    </div>
  );
}
