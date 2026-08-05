/**
 * /spanish-21 — Spanish 21 (off-chain chips, provably fair).
 *
 * Blackjack with every 10 stripped out of the deck, and a pile of bonuses handed back in exchange.
 *
 * One of the four blackjack variants served by
 * /api/arcade/blackjack-variants/*, all sharing BlackjackVariantGame — the felt
 * renders whatever rules the server hands back for this variant, so there is no
 * second copy of them here to drift out of step with the one that pays.
 *
 * Theme: "Deep-Sea Neon" — the shared arcade2-scope system (abyss #050E16,
 * cyan #22D3EE accents, amber wins, rose losses, Chakra Petch display,
 * JetBrains Mono numerals).
 */

import { Chakra_Petch, JetBrains_Mono } from 'next/font/google';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import Footer from '@/components/PLINKO/Footer';
import { BlackjackVariantGame } from '@/components/BlackjackVariants/BlackjackVariantGame';

const arcDisplay = Chakra_Petch({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-arc-display',
});

const arcMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arc-mono',
});

export default function Spanish21Page() {
  return (
    <GlobalMainNav>
      <div
        className={`arcade2-scope relative min-h-screen h-full w-full flex flex-col text-slate-200 ${arcDisplay.variable} ${arcMono.variable}`}
        style={{
          backgroundImage:
            'linear-gradient(to bottom, rgba(5,14,22,0.92), rgba(2,7,11,0.96) 55%, rgba(5,14,22,0.98))',
          backgroundColor: '#050E16',
        }}
      >
        {/* Deep-sea lighting: a cool cyan shaft from above, vignette below. */}
        <div className="pointer-events-none absolute inset-0 h-full min-h-screen w-full bg-[radial-gradient(ellipse_75%_55%_at_50%_-5%,rgba(34,211,238,0.13),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 h-full min-h-screen w-full bg-[radial-gradient(ellipse_120%_60%_at_50%_115%,rgba(0,0,0,0.55),transparent_60%)]" />

        <div className="relative flex-1 w-full mx-auto px-3 py-4 sm:px-6 sm:py-8">
          <main className="w-full max-w-full overflow-x-hidden pb-16 pt-2">
            <header className="mb-6 text-center">
              <h1 className="arc-display text-3xl font-bold uppercase tracking-[0.08em] text-white sm:text-4xl">
                Spanish 21
                <span className="ml-2 align-middle text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.65)]">
                  ♠
                </span>
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                48-card deck · your 21 always wins · bonuses for long 21s · provably fair · played in MORBIUS
              </p>
            </header>
            <BlackjackVariantGame variant="spanish21" />
          </main>
        </div>
        <Footer />
      </div>
    </GlobalMainNav>
  );
}
