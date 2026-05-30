'use client';

/**
 * Floating Daily Wish launcher — fixed bottom-right pill that surfaces the
 * player's spin balance from anywhere on the site and opens the wheel as a
 * modal overlay so they never leave their current game (blackjack, poker,
 * etc.) to claim a spin.
 *
 * Live count: subscribes to the `wheel_balance` WebSocket event, which the
 * backend pushes to a specific wallet from server.ts whenever
 * applyWheelSpinDelta or applyWheelWagerCredit mutates the balance. REST
 * /api/wheel/balance is fetched once at mount as a baseline, and on tab
 * focus, so the count is correct even when the socket was disconnected.
 *
 * Mounted globally from app/layout.tsx. Renders nothing when the wallet is
 * not connected, when /wheel is the current page (avoid double UI), or when
 * the modal is open (the modal hosts its own close affordance).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAccount } from 'wagmi';
import { usePathname } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';
import { getWebSocketUrlOptional } from '@/lib/api-urls';

const WheelClient = dynamic(() => import('@/components/wheel/WheelClient'), { ssr: false });

const apiBase = (): string => {
  const v = process.env.NEXT_PUBLIC_API_URL;
  return v && v.trim() !== '' ? v.trim() : '';
};

export default function WheelLauncher() {
  const { address, isConnected } = useAccount();
  const pathname = usePathname();
  const onWheelPage = pathname === '/wheel' || pathname?.startsWith('/wheel/');

  const [spins, setSpins] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [bump, setBump] = useState(0);          // tick on grant → triggers attention animation
  const lastBalanceRef = useRef(0);
  const wsRef = useRef<BlackjackWebSocketClient | null>(null);

  // REST sync — used at mount, on wallet change, and on window focus as a
  // safety net when WS push was missed.
  const fetchBalance = useCallback(async () => {
    if (!isConnected) return;
    try {
      const r = await fetch(`${apiBase()}/api/wheel/balance`, { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      const next = Number(d.spinsAvailable ?? 0);
      if (next > lastBalanceRef.current) setBump((b) => b + 1);
      lastBalanceRef.current = next;
      setSpins(next);
    } catch { /* network blip; keep previous */ }
  }, [isConnected]);

  useEffect(() => { fetchBalance(); }, [fetchBalance, address]);

  useEffect(() => {
    const onFocus = () => fetchBalance();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchBalance]);

  // WS subscription — push the count live as the backend mints/spends spins.
  useEffect(() => {
    if (!isConnected || !address) return;
    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl) return;

    const ws = new BlackjackWebSocketClient(wsUrl, address.toLowerCase());
    wsRef.current = ws;

    const onBalance = (payload: { spinsAvailable: number; delta: number }) => {
      const next = Number(payload?.spinsAvailable ?? 0);
      if (Number.isFinite(next)) {
        if (payload.delta > 0) setBump((b) => b + 1);
        lastBalanceRef.current = next;
        setSpins(next);
      }
    };

    ws.connect().then(() => {
      ws.on('wheel_balance', onBalance);
    }).catch(() => { /* REST + focus refresh keeps us roughly in sync */ });

    return () => {
      try { ws.off('wheel_balance', onBalance); } catch { /* noop */ }
      try { (ws as unknown as { disconnect?: () => void }).disconnect?.(); } catch { /* noop */ }
      wsRef.current = null;
    };
  }, [isConnected, address]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
  }, []);
  const handleClose = useCallback(() => {
    setIsOpen(false);
    fetchBalance();
  }, [fetchBalance]);

  // Hide states — keep the FAB out of the way in the cases below.
  const hideFab = !isConnected || onWheelPage || isOpen;

  return (
    <>
      {!hideFab && (
        <button
          onClick={handleOpen}
          aria-label={`Open Daily Wish wheel — ${spins} spins available`}
          className="group fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[90] flex items-center gap-2 pl-2 pr-4 py-2 rounded-full bg-gradient-to-br from-fuchsia-500 via-pink-500 to-amber-400 text-white font-bold uppercase tracking-wider text-sm shadow-[0_10px_30px_rgba(236,72,153,0.45)] hover:shadow-[0_14px_40px_rgba(236,72,153,0.65)] border border-amber-300/70 active:scale-95 transition-all"
          style={{ animation: bump > 0 ? `wheel-launcher-bump 0.7s ease-out ${bump}` : undefined }}
        >
          <span
            className="relative inline-flex items-center justify-center w-9 h-9 rounded-full bg-slate-950/60 border border-amber-300/50"
            aria-hidden
          >
            <Sparkles className="w-5 h-5 text-amber-200 drop-shadow" />
            {/* subtle perpetual pulse so it reads as a live element */}
            <span className="absolute inset-0 rounded-full border border-amber-300/30 animate-ping" />
          </span>
          <span className="flex flex-col items-start leading-none">
            <span className="text-[10px] font-semibold text-amber-100 opacity-90">Daily Wish</span>
            <span className="text-base font-black tabular-nums">
              {spins} {spins === 1 ? 'spin' : 'spins'}
            </span>
          </span>
        </button>
      )}

      {isOpen && <WheelClient variant="modal" onClose={handleClose} />}
    </>
  );
}
