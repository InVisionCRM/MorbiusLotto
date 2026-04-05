'use client';

import { GameFAQ } from '@/components/shared/GameFAQ';

/** Vercel Blob — blackjack walkthrough is too large for `public/`. */
const BLACKJACK_HOW_TO_VIDEO_URL =
  'https://ivaqyn53qos0zxu5.public.blob.vercel-storage.com/How-To-Video/how_to_play_blackjack.mp4';

interface BlackjackHowToSectionProps {
  blackjackAddress: string;
}

export function BlackjackHowToSection({ blackjackAddress }: BlackjackHowToSectionProps) {
  return (
    <section className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
      {/* Video */}
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

      {/* FAQ */}
      <GameFAQ
        game="blackjack"
        contractAddresses={[
          { label: 'Blackjack Contract', address: blackjackAddress },
        ]}
      />
    </section>
  );
}
