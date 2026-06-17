/**
 * /dragon-tiger — chips Dragon Tiger (off-chain chips, provably fair).
 *
 * The fastest card game on the floor: one card to Dragon, one to Tiger, the
 * higher rank wins (Ace is LOW). Same /api/arcade/dragon-tiger/* backend and
 * SIWE session + chip wallet as the rest of the arcade2 family
 * (/baccarat, /dicex2, /keno2, /plinko2, /mines2).
 *
 * Theme: "Deep-Sea Neon" — the shared arcade2-scope system (abyss #050E16,
 * cyan #22D3EE accents, amber wins, rose losses, Chakra Petch display,
 * JetBrains Mono numerals).
 */

import { Chakra_Petch, JetBrains_Mono } from 'next/font/google'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import Footer from '@/components/PLINKO/Footer'
import { DragonTigerGame } from '@/components/DragonTiger/DragonTigerGame'

const arcDisplay = Chakra_Petch({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-arc-display',
})

const arcMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arc-mono',
})

export default function DragonTigerPage() {
  return (
    <GlobalMainNav>
      <div
        className={`arcade2-scope relative min-h-screen h-full w-full flex flex-col text-slate-200 ${arcDisplay.variable} ${arcMono.variable}`}
        style={{
          backgroundImage:
            'linear-gradient(to bottom, rgba(5,14,22,0.92), rgba(2,6,11,0.96) 55%, rgba(5,14,22,0.98))',
          backgroundColor: '#050E16',
        }}
      >
        {/* Abyss lighting: a cold cyan shaft from above, vignette below. */}
        <div className="pointer-events-none absolute inset-0 h-full min-h-screen w-full bg-[radial-gradient(ellipse_75%_55%_at_50%_-5%,rgba(34,211,238,0.13),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 h-full min-h-screen w-full bg-[radial-gradient(ellipse_120%_60%_at_50%_115%,rgba(0,0,0,0.55),transparent_60%)]" />

        <div className="relative flex-1 w-full max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-8">
          <main className="w-full max-w-full overflow-x-hidden pb-16 pt-2">
            <header className="mb-6 text-center">
              <h1 className="arc-display text-3xl font-bold uppercase tracking-[0.08em] text-white sm:text-4xl">
                Dragon Tiger
                <span className="ml-2 align-middle text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.65)]">
                  ⚔
                </span>
              </h1>
              <p className="mt-1.5 text-sm text-slate-400">
                one card each · higher rank wins · ace is low · provably fair · played in chips
              </p>
            </header>
            <DragonTigerGame />
          </main>
        </div>
        <Footer />
      </div>
    </GlobalMainNav>
  )
}
