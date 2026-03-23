'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { homeSectionTitleClass, homeSectionTitleGradientClass } from '@/lib/home-section-typography'

const panelShell =
  'relative rounded-2xl border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden shadow-2xl'

const panelInset = {
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
} as const

function XLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function TelegramLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.896-.424-1.391.258-2.2.177-.22 3.246-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  )
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-lg md:text-xl font-semibold text-white tracking-tight border-b border-cyan-500/20 pb-2 mb-4">
      {children}
    </h3>
  )
}

export function DevLogSection() {
  return (
    <section className="pt-6 pb-4 md:pb-6 px-4 overflow-x-clip" aria-labelledby="dev-log-heading">
      <div className="container mx-auto max-w-4xl">
        <div className={cn(panelShell, 'p-8 md:p-10')} style={panelInset}>
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.12),transparent_55%)]" aria-hidden />

          <div className="relative">
            <header className="text-center mb-10 md:mb-12">
              <p className="text-cyan-400/90 text-sm font-medium uppercase tracking-widest mb-2">v0.9.2</p>
              <h2 id="dev-log-heading" className={cn(homeSectionTitleClass, 'mb-4')}>
                <span className={homeSectionTitleGradientClass}>DevLog</span>
              </h2>
              <p className="text-slate-400 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
                We are on the road to leaving beta: shipping faster, polishing harder, and leaning on community
                feedback every step of the way. Thank you for the growing support—it keeps the build moving.
              </p>
            </header>

            <div className="space-y-10 text-slate-300 text-[15px] md:text-base leading-relaxed">
              <div>
                <SectionHeading>Games and platform</SectionHeading>
                <ul className="list-disc pl-5 space-y-2 marker:text-cyan-500/80">
                  <li>
                    <span className="text-white font-medium">Poker</span> and{' '}
                    <span className="text-white font-medium">multiplayer blackjack</span> are live in{' '}
                    <span className="text-cyan-400/90 font-medium">BETA</span>—early access with more tuning ahead.
                  </li>
                  <li>
                    New <span className="text-white font-medium">avatar system</span> for richer identity at the
                    tables.
                  </li>
                  <li>
                    <span className="text-white font-medium">Player dashboard</span> upgrades: CSV exports, full
                    transaction history, and a clearer view of your play.
                  </li>
                  <li>
                    Broad <span className="text-white font-medium">UI upgrades and performance work</span> across the
                    app for a smoother day-to-day experience.
                  </li>
                  <li>
                    Fresh table line-up, including{' '}
                    <span className="text-white font-medium">
                      PulseChain Weekly Monster Thread
                    </span>
                    , <span className="text-white font-medium">PLSX.Fun</span>,{' '}
                    <span className="text-white font-medium">PulseChain Pitbull</span>,{' '}
                    <span className="text-white font-medium">ZAPDOS</span>, and{' '}
                    <span className="text-white font-medium">LeFLOWT</span>.
                  </li>
                </ul>
              </div>

              <div>
                <SectionHeading>MORBIUS and burn</SectionHeading>
                <ul className="list-disc pl-5 space-y-2 marker:text-cyan-500/80">
                  <li>
                    MORBIUS has held its footing strongly while much of the PulseChain token landscape pulled back
                    after the launch of Richard Heart&apos;s ProveX.
                  </li>
                  <li>
                    We are approaching <span className="text-white font-medium">12 million tokens burned</span>—a
                    milestone the community built together.
                  </li>
                </ul>
              </div>

              <div>
                <SectionHeading>Scan.Morbius.io</SectionHeading>
                <ul className="list-disc pl-5 space-y-2 marker:text-cyan-500/80">
                  <li>Backend and frontend optimizations for snappier loads and steadier browsing.</li>
                  <li>Moderate UI refinements aimed at clarity and a smoother run day to day.</li>
                </ul>
              </div>

              <div className="rounded-xl border border-cyan-500/25 bg-slate-950/50 p-6 md:p-8">
                <SectionHeading>Follow the build</SectionHeading>
                <p className="text-slate-400 mb-6 max-w-xl">
                  Announcements, betas, and table drops land on X and Telegram first.
                </p>
                <div className="flex flex-col sm:flex-row flex-wrap gap-6 sm:gap-10 justify-center sm:justify-start items-center sm:items-stretch">
                  <a
                    href="https://x.com/morbius_io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-4 rounded-lg px-4 py-3 border border-transparent hover:border-cyan-500/30 hover:bg-slate-900/80 transition-colors"
                  >
                    <div className="text-white group-hover:text-cyan-400 transition-colors shrink-0 drop-shadow-[0_0_20px_rgba(34,211,238,0.25)]">
                      <XLogo className="w-12 h-12 md:w-14 md:h-14" />
                    </div>
                    <div className="text-left">
                      <div className="text-xs uppercase tracking-wider text-slate-500 mb-0.5">X</div>
                      <div className="text-lg font-semibold text-white group-hover:text-cyan-300 transition-colors">
                        @morbius_io
                      </div>
                    </div>
                  </a>
                  <a
                    href="https://t.me/morbius_cash"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-4 rounded-lg px-4 py-3 border border-transparent hover:border-cyan-500/30 hover:bg-slate-900/80 transition-colors"
                  >
                    <div className="text-sky-400 group-hover:text-cyan-400 transition-colors shrink-0 drop-shadow-[0_0_20px_rgba(34,211,238,0.25)]">
                      <TelegramLogo className="w-12 h-12 md:w-14 md:h-14" />
                    </div>
                    <div className="text-left">
                      <div className="text-xs uppercase tracking-wider text-slate-500 mb-0.5">Telegram</div>
                      <div className="text-lg font-semibold text-white group-hover:text-cyan-300 transition-colors">
                        @morbius_cash
                      </div>
                    </div>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
