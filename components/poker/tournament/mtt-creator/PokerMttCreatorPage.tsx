'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { BlackjackWebSocketClient, type SignTypedDataFn } from '@/lib/websocket-client';
import { getWebSocketUrlOptional } from '@/lib/api-urls';
import { usePokerTournament, type CreatePokerTournamentParams } from '@/hooks/use-poker-tournament';
import { MttCreatorProvider, useMttCreator } from './MttCreatorContext';
import { MttStepHeader } from './MttStepHeader';
import { MttTemplatePicker } from './MttTemplatePicker';
import { MttStepName } from './steps/MttStepName';
import { MttStepBuyIn } from './steps/MttStepBuyIn';
import { MttStepField } from './steps/MttStepField';
import { MttStepStack } from './steps/MttStepStack';
import { MttStepBlinds } from './steps/MttStepBlinds';
import { MttStepPayouts } from './steps/MttStepPayouts';
import { MttStepReview } from './steps/MttStepReview';

/**
 * Full-screen wizard orchestrator. Bootstraps its own WS client (mirroring the lobby
 * pattern) so the route can be linked directly. On publish, redirects to the lobby with
 * the new tournament selected.
 *
 * Wallet not connected? The page still renders — the template picker + wizard steps are
 * all reactive and a wallet is only required at publish. That way users can build their
 * config first and connect when ready (matches the existing creator behavior).
 */
export function PokerMttCreatorPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [wsClient, setWsClient] = useState<BlackjackWebSocketClient | null>(null);
  const clientRef = useRef<BlackjackWebSocketClient | null>(null);

  // WS client bootstrap. We rebuild whenever address changes so the connection is
  // authenticated with the right wallet for the `poker_tournament_create` request.
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
    myAddress: address?.toLowerCase() ?? null,
  });

  const handleClose = () => {
    router.push('/poker?tab=tournaments');
  };

  const handlePublish = async (
    params: CreatePokerTournamentParams,
  ): Promise<{ tournamentId: string; pinCode?: string | null } | null> => {
    return createTournament(params);
  };

  const handlePublished = (result: { tournamentId: string; pinCode?: string | null }) => {
    const qs = new URLSearchParams({ tab: 'tournaments' });
    if (result.pinCode) qs.set('newPin', result.pinCode);
    router.push(`/poker?${qs.toString()}`);
  };

  return (
    <MttCreatorProvider>
      <MttCreatorBody
        onClose={handleClose}
        onPublish={handlePublish}
        onPublished={handlePublished}
        walletConnected={Boolean(address)}
      />
    </MttCreatorProvider>
  );
}

/** Inner body — has access to the wizard context for screen routing. */
function MttCreatorBody({
  onClose,
  onPublish,
  onPublished,
  walletConnected,
}: {
  onClose: () => void;
  onPublish: (params: CreatePokerTournamentParams) => Promise<{ tournamentId: string; pinCode?: string | null } | null>;
  onPublished: (result: { tournamentId: string; pinCode?: string | null }) => void;
  walletConnected: boolean;
}) {
  const { screen } = useMttCreator();

  if (screen === 'template') {
    return <MttTemplatePicker onClose={onClose} />;
  }
  if (screen === 'review') {
    return (
      <MttStepReview
        onClose={onClose}
        onPublish={async (p) => {
          if (!walletConnected) {
            throw new Error('Connect your wallet to publish a tournament.');
          }
          return onPublish(p);
        }}
        onPublished={onPublished}
      />
    );
  }

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at top, rgba(6,182,212,0.08), transparent 60%), linear-gradient(180deg, #050a14 0%, #020409 100%)',
      }}
    >
      <MttStepHeader onClose={onClose} />
      <div className="mx-auto w-full max-w-3xl px-6 py-10 sm:px-10 sm:py-12">
        {screen === 'name' && <MttStepName />}
        {screen === 'buy-in' && <MttStepBuyIn />}
        {screen === 'field' && <MttStepField />}
        {screen === 'stack' && <MttStepStack />}
        {screen === 'blinds' && <MttStepBlinds />}
        {screen === 'payouts' && <MttStepPayouts />}
      </div>

      {!walletConnected && screen === 'payouts' && (
        <div className="mx-auto mb-8 max-w-3xl px-6 sm:px-10">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200">
            Connect your wallet on the next screen to publish.
          </div>
        </div>
      )}
    </div>
  );
}
