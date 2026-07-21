/**
 * /pai-gow-poker — chips Pai Gow Poker (off-chain chips, provably fair).
 *
 * Seven cards each; you split yours into a 5-card high hand and a 2-card low
 * hand (the high must outrank the low or you foul), the dealer sets by a fixed
 * house way. Win both comparisons → 1:1 minus a 5% commission; win one → push;
 * lose both → bet lost. Copies go to the dealer. Same /api/arcade/pai-gow-poker/*
 * backend and SIWE session + chip wallet as the rest of the arcade2 family.
 *
 * Theme: "Deep-Sea Neon" — the shared arcade2-scope system (abyss #050E16,
 * cyan #22D3EE accents, amber wins, rose losses, Chakra Petch display,
 * JetBrains Mono numerals).
 */

import { Chakra_Petch, JetBrains_Mono } from 'next/font/google';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import Footer from '@/components/PLINKO/Footer';
import { PaiGowPokerGame } from '@/components/PaiGowPoker/PaiGowPokerGame';

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

export default function PaiGowPokerPage() {
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
                Pai Gow Poker
                <span className="ml-2 align-middle text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.65)]">
                  ♣
                </span>
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                seven cards, two hands · beat the dealer twice · push-friendly, 5% commission on wins · provably fair · played in MORBIUS
              </p>
            </header>
            <PaiGowPokerGame />
          </main>
        </div>
        <Footer />
      </div>
    </GlobalMainNav>
  );
}
