'use client'

/**
 * /keno2 — server-side Stake-style Keno (off-chain chips, provably fair).
 *
 * Distinct from the on-chain /keno game: 40 tiles, pick 1–10, the server draws
 * 10, four risk modes, settled in chips via /api/keno/*. Built alongside the
 * on-chain page so it can be promoted to /keno in the nav whenever you're ready.
 *
 * Theme: "Deep-Sea Neon" — abyss #050E16, cyan #22D3EE accents, amber wins.
 * Chakra Petch carries the display type, JetBrains Mono carries every numeral;
 * both are exposed as CSS vars consumed by the .arcade2-scope rules in globals.css.
 */

import { Chakra_Petch, JetBrains_Mono } from 'next/font/google'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import Footer from '@/components/PLINKO/Footer'
import { StakeKenoGame } from '@/components/StakeKeno/StakeKenoGame'

const kenoDisplay = Chakra_Petch({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-arc-display',
})

const kenoMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arc-mono',
})

export default function Keno2Page() {
  return (
    <GlobalMainNav>
      <div
        className={`arcade2-scope relative min-h-screen h-full w-full flex flex-col text-slate-200 ${kenoDisplay.variable} ${kenoMono.variable}`}
        style={{
          backgroundImage:
            "linear-gradient(to bottom, rgba(5,14,22,0.92), rgba(2,6,11,0.96) 55%, rgba(5,14,22,0.98)), url('/morbius/Morbius_Keno.png')",
          backgroundColor: '#050E16',
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed',
        }}
      >
        {/* Abyss lighting: a cold cyan shaft from above, vignette below. */}
        <div className="pointer-events-none absolute inset-0 h-full min-h-screen w-full bg-[radial-gradient(ellipse_75%_55%_at_50%_-5%,rgba(34,211,238,0.13),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 h-full min-h-screen w-full bg-[radial-gradient(ellipse_120%_60%_at_50%_115%,rgba(0,0,0,0.55),transparent_60%)]" />

        <div className="relative flex-1 w-full max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-8">
          <main className="w-full max-w-full overflow-x-hidden pb-16 pt-2">
            <header className="mb-6 text-center">
              <h1 className="arc-display text-3xl font-bold uppercase tracking-[0.08em] text-white sm:text-4xl">
                Keno
                <span className="ml-2 align-middle text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.65)]">
                  ▮▮
                </span>
              </h1>
              <p className="mt-1.5 text-sm text-slate-400">
                Pick up to 10 · we draw 10 · provably fair · played in MORBIUS
              </p>
            </header>
            <StakeKenoGame />
          </main>
        </div>
        <Footer />
      </div>
    </GlobalMainNav>
  )
}
