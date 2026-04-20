'use client';

import { useState } from 'react';
import { GameFAQ } from '@/components/shared/GameFAQ';
import { MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import { DepositWithdrawModal } from '@/components/BLACKJACK/DepositWithdrawModal';
import BlackjackHowToVideoModal from '@/components/BLACKJACK/BlackjackHowToVideoModal';

interface BlackjackHowToSectionProps {
  blackjackAddress: string;
  /** Defaults to canonical MORBIUS token if omitted. */
  morbiusTokenAddress?: string;
  /** Narrow right-column layout (single column, tighter spacing). */
  layout?: 'page' | 'panel';
}

export function BlackjackHowToSection({
  blackjackAddress,
  morbiusTokenAddress = MORBIUS_TOKEN_ADDRESS,
  layout = 'page',
}: BlackjackHowToSectionProps) {
  const [walletOpen, setWalletOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);

  const wrapperClass =
    layout === 'panel'
      ? 'mt-4 border-t border-white/10 pt-4'
      : 'mt-6';

  return (
    <section className={wrapperClass}>
      <GameFAQ
        game="blackjack"
        addresses={[
          { label: 'Blackjack Contract', address: blackjackAddress },
          { label: 'MORBIUS Token', address: morbiusTokenAddress },
        ]}
        onDepositClick={() => setWalletOpen(true)}
        onHowToPlayClick={() => setVideoOpen(true)}
      />
      <DepositWithdrawModal isOpen={walletOpen} onClose={() => setWalletOpen(false)} />
      <BlackjackHowToVideoModal open={videoOpen} onOpenChange={setVideoOpen} />
    </section>
  );
}
