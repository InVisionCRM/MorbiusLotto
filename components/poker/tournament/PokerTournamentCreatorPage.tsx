'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { toast } from 'sonner';
import { BlackjackWebSocketClient, type SignTypedDataFn } from '@/lib/websocket-client';
import { getWebSocketUrlOptional } from '@/lib/api-urls';
import { usePokerTournament, type CreatePokerTournamentParams } from '@/hooks/use-poker-tournament';
import { PokerTournamentCreator } from './PokerTournamentCreator';

/** Mirrors the lobby's `requestTournamentBotBootstrap` so the standalone page supports admin bot spawning. */
async function requestTournamentBotBootstrap(
  tournamentId: string,
  numBots: number,
  walletAddress: string,
  pinCode?: string,
): Promise<{ numBots: number }> {
  const res = await fetch('/api/admin/poker/tournament-bots/bootstrap', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-wallet': walletAddress,
    },
    body: JSON.stringify({
      tournamentId,
      numBots,
      ...(pinCode && pinCode.length > 0 ? { pinCode } : {}),
    }),
  });
  const raw = await res.text().catch(() => '');
  let data: { error?: string; numBots?: number } = {};
  if (raw) {
    try { data = JSON.parse(raw) as typeof data; } catch { /* ignore */ }
  }
  if (!res.ok) throw new Error(data.error || raw || `HTTP ${res.status}`);
  return { numBots: typeof data.numBots === 'number' ? data.numBots : numBots };
}

/**
 * Standalone page wrapper for the single-table (SNG) poker tournament creator.
 * Mirrors the MTT page pattern: bootstraps its own WS client so the route can be linked
 * directly. On publish, the underlying creator shows its own success card with a link
 * back to the creator dashboard — we don't auto-redirect.
 *
 * Wallet not connected? The underlying creator handles that itself with its own
 * connect-wallet card — no extra gating needed here.
 */
export function PokerTournamentCreatorPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const myAddress = address?.toLowerCase() ?? null;

  const [wsClient, setWsClient] = useState<BlackjackWebSocketClient | null>(null);
  const clientRef = useRef<BlackjackWebSocketClient | null>(null);

  useEffect(() => {
    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl) return;
    const signFn: SignTypedDataFn | undefined = address ? (signTypedDataAsync as SignTypedDataFn) : undefined;
    const client = address
      ? new BlackjackWebSocketClient(wsUrl, address.toLowerCase(), signFn)
      : new BlackjackWebSocketClient(wsUrl);
    clientRef.current = client;
    client.connect().then(() => setWsClient(client)).catch(() => {
      // Connection retries are handled inside the client; surface nothing here.
    });
    return () => {
      try { client.disconnect?.(); } catch { /* best-effort */ }
      clientRef.current = null;
    };
  }, [address, signTypedDataAsync]);

  const { createTournament } = usePokerTournament({
    wsClient,
    myAddress,
  });

  const handleClose = () => {
    router.push('/poker?tab=tournaments');
  };

  const handleCreate = async (
    params: CreatePokerTournamentParams,
    opts: { addBots: number },
  ): Promise<{ tournamentId: string; pinCode?: string | null } | null> => {
    try {
      const result = await createTournament(params);
      if (!result?.tournamentId) {
        toast.error('Failed to create tournament');
        return null;
      }
      if (opts.addBots > 0 && myAddress) {
        try {
          const pinForBots = params.isPrivate ? (result.pinCode ?? undefined) : undefined;
          const { numBots: started } = await requestTournamentBotBootstrap(
            result.tournamentId,
            opts.addBots,
            myAddress,
            pinForBots,
          );
          toast.success(`Started ${started} poker bot(s) for this tournament`);
        } catch (botErr) {
          const bmsg = (botErr as Error).message ?? 'Bots failed to start';
          toast.error(`${bmsg} You can retry from Staff tools if needed.`);
        }
      }
      return result;
    } catch (err) {
      const msg = (err as Error).message ?? 'Failed to create';
      toast.error(msg);
      return null;
    }
  };

  return (
    <PokerTournamentCreator
      variant="page"
      creatorAddress={address ?? undefined}
      onClose={handleClose}
      onCreate={handleCreate}
    />
  );
}
