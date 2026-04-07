'use client';

import { GameFAQ } from '@/components/shared/GameFAQ';
import { MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';

/** Vercel Blob — blackjack walkthrough is too large for `public/`. */
const BLACKJACK_HOW_TO_VIDEO_URL =
  'https://ivaqyn53qos0zxu5.public.blob.vercel-storage.com/How-To-Video/how_to_play_blackjack.mp4';

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
  const gridClass =
    layout === 'panel'
      ? 'mt-4 grid grid-cols-1 gap-3 items-start border-t border-white/10 pt-4'
      : 'mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 items-start';

  return (
    <section className={gridClass}>
      <div className="rounded-xl overflow-hidden border border-white/10 bg-black">
        <video
          src={BLACKJACK_HOW_TO_VIDEO_URL}
          controls
          playsInline
          className="w-full"
          poster=""
          preload="metadata"
        />
      </div>

      <GameFAQ
        game="blackjack"
        addresses={[
          { label: 'Blackjack Contract', address: blackjackAddress },
          { label: 'MORBIUS Token', address: morbiusTokenAddress },
        ]}
      />
    </section>
  );
}
