'use client'

import GlobalMainNav from '@/components/shared/GlobalMainNav'
import Footer from '@/components/PLINKO/Footer'
import { MonteGame } from '@/components/Monte/MonteGame'

export default function MontePage() {
  return (
    <GlobalMainNav>
      <div className="relative min-h-screen w-full flex flex-col text-white bg-black">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_30%,rgba(34,211,238,0.12),transparent_70%)] pointer-events-none" />

        <div className="relative flex-1 w-full max-w-3xl mx-auto px-4 py-12 flex flex-col items-center justify-center">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold tracking-[0.3em] text-cyan-400 font-mono">MONTE</h1>
            <p className="text-xs text-zinc-500 tracking-[0.3em] mt-2 font-mono">CASINO LOBBY · FIND THE DIAMOND</p>
          </div>

          <div className="w-full border border-cyan-400/15 rounded-md bg-zinc-950/60 backdrop-blur-sm py-8 shadow-[0_0_40px_rgba(34,211,238,0.08)]">
            <MonteGame variant="embedded" />
          </div>

          <div className="mt-6 w-full max-w-sm rounded-md border border-cyan-400/15 bg-zinc-950/60 px-4 py-3 text-center font-mono">
            <div className="text-[10px] tracking-[0.3em] text-zinc-500">THE ODDS</div>
            <div className="mt-1 text-2xl font-bold text-cyan-400">1 in 3</div>
            <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">
              33.3% base chance to find the diamond — track the shuffle to beat it. Nothing is wagered.
            </div>
          </div>

          <p className="mt-6 text-[10px] text-zinc-600 tracking-widest font-mono">
            JUST FOR FUN · NO MORBIUS WAGERED
          </p>
        </div>

        <Footer />
      </div>
    </GlobalMainNav>
  )
}
