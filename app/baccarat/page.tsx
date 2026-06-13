/**
 * /baccarat — chips Baccarat (off-chain chips, provably fair, punto banco).
 *
 * Theme: "Deep-Sea Neon" — the cyan direction the BaccaratTable/Roads/InfoTabs
 * already commit to: #050E16 abyss base, cyan #22D3EE Player, amber Banker,
 * violet Tie, Chakra Petch display + JetBrains Mono numerals (arcade2 fonts).
 *
 * Backend: /api/arcade/baccarat/* — instant atomic deals on the shared
 * provably-fair shuffle pipeline. Same SIWE session + chip wallet as the rest
 * of the arcade2 family (/dice2, /mines2, /roulette2).
 */

import { Chakra_Petch, JetBrains_Mono } from 'next/font/google';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import Footer from '@/components/PLINKO/Footer';
import { StakeBaccaratGame } from '@/components/StakeBaccarat/StakeBaccaratGame';

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

export default function BaccaratPage() {
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
        <div className="pointer-events-none absolute inset-0 h-full min-h-screen w-full bg-[radial-gradient(ellipse_75%_55%_at_50%_-5%,rgba(34,211,238,0.12),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 h-full min-h-screen w-full bg-[radial-gradient(ellipse_120%_60%_at_50%_115%,rgba(0,0,0,0.55),transparent_60%)]" />

        <div className="relative flex-1 w-full mx-auto px-3 py-4 sm:px-6 sm:py-8">
          <main className="w-full max-w-full overflow-x-hidden pb-16 pt-2">
            <header className="mb-6 text-center">
              <h1 className="arc-display text-3xl font-bold uppercase tracking-[0.08em] text-white sm:text-4xl">
                Baccarat
                <span className="ml-2 align-middle text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.65)]">
                  ◆
                </span>
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                player vs banker · no decisions after the deal · provably fair · played in chips
              </p>
            </header>
            <StakeBaccaratGame />
          </main>
        </div>
        <Footer />
      </div>
    </GlobalMainNav>
  );
}
