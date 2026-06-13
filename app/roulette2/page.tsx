/**
 * /roulette2 — chips Roulette (off-chain chips, provably fair, European).
 *
 * Theme: "Midnight Emerald" (user-approved direction 2) — classic casino
 * green reimagined: #04130D abyss-green base, #34D399 emerald accent, gold
 * #FBBF24 wins, classic red/black pockets, Chakra Petch display + JetBrains
 * Mono numerals (the arcade2 font variables).
 *
 * Backend: /api/arcade/roulette/* — instant atomic spins on the shared
 * provably-fair HMAC pipeline. Same SIWE session + chip wallet as the rest
 * of the arcade2 family (/plinko2, /limbo2, /crash).
 */

import { Chakra_Petch, JetBrains_Mono } from 'next/font/google';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import Footer from '@/components/PLINKO/Footer';
import { StakeRouletteGame } from '@/components/StakeRoulette/StakeRouletteGame';

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

export default function Roulette2Page() {
  return (
    <GlobalMainNav>
      <div
        className={`arcade2-scope relative min-h-screen h-full w-full flex flex-col text-slate-200 ${arcDisplay.variable} ${arcMono.variable}`}
        style={{
          backgroundImage:
            'linear-gradient(to bottom, rgba(4,19,13,0.92), rgba(2,9,6,0.96) 55%, rgba(4,19,13,0.98))',
          backgroundColor: '#04130D',
        }}
      >
        {/* Emerald table lighting: a warm green shaft from above, vignette below. */}
        <div className="pointer-events-none absolute inset-0 h-full min-h-screen w-full bg-[radial-gradient(ellipse_75%_55%_at_50%_-5%,rgba(52,211,153,0.13),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 h-full min-h-screen w-full bg-[radial-gradient(ellipse_120%_60%_at_50%_115%,rgba(0,0,0,0.55),transparent_60%)]" />

        <div className="relative flex-1 w-full mx-auto px-3 py-4 sm:px-6 sm:py-8">
          <main className="w-full max-w-full overflow-x-hidden pb-16 pt-2">
            <header className="mb-6 text-center">
              <h1 className="arc-display text-3xl font-bold uppercase tracking-[0.08em] text-white sm:text-4xl">
                Roulette
                <span className="ml-2 align-middle text-[#34D399] drop-shadow-[0_0_12px_rgba(52,211,153,0.65)]">
                  ◉
                </span>
              </h1>
              <p className="mt-1.5 text-sm text-[#5E8273]">
                european single zero · place your chips · provably fair · played in chips
              </p>
            </header>
            <StakeRouletteGame />
          </main>
        </div>
        <Footer />
      </div>
    </GlobalMainNav>
  );
}
