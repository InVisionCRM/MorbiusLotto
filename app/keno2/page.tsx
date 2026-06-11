'use client'

/**
 * /keno2 — server-side Stake-style Keno (off-chain chips, provably fair).
 *
 * Distinct from the on-chain /keno game: 40 tiles, pick 1–10, the server draws
 * 10, four risk modes, settled in chips via /api/keno/*. Built alongside the
 * on-chain page so it can be promoted to /keno in the nav whenever you're ready.
 */

import GlobalMainNav from '@/components/shared/GlobalMainNav'
import Footer from '@/components/PLINKO/Footer'
import { StakeKenoGame } from '@/components/StakeKeno/StakeKenoGame'

export default function Keno2Page() {
  return (
    <GlobalMainNav>
      <div
        className="relative min-h-screen h-full w-full flex flex-col text-white"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, rgba(8,12,20,0.90), rgba(2,6,17,0.94) 50%, rgba(8,12,20,0.96)), url('/morbius/Morbius_Keno.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed',
        }}
      >
        <div className="absolute inset-0 h-full min-h-screen w-full bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(34,211,238,0.10),transparent_70%)] pointer-events-none" />
        <div className="relative flex-1 w-full max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-8">
          <main className="w-full max-w-full overflow-x-hidden pb-16 pt-2">
            <header className="mb-5 text-center">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Keno</h1>
              <p className="mt-1 text-sm text-slate-400">
                Pick up to 10 · we draw 10 · provably fair · played in chips
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
