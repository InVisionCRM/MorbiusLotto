'use client'

import Image from 'next/image'
import { Theme } from '@/lib/theme'

export function BlackjackTournamentsCard() {
  return (
    <div className="group block w-full cursor-default">
      <div
        className="relative overflow-hidden rounded-2xl w-full aspect-[4/3] max-w-lg mx-auto"
        style={Theme.panel.base}
      >
        <div className="relative h-full w-full rounded-2xl overflow-hidden">
          <Image
            src="/BlackJack/TableBackground1.png"
            alt="BlackJack Tournaments"
            fill
            className="object-cover opacity-50"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/40" />
          {/* Coming Soon overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
            <div className="text-center px-6">
              <div className="text-4xl sm:text-5xl mb-3 opacity-80">🚧</div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">BlackJack Tournaments</h3>
              <p className="text-cyan-400/90 text-sm sm:text-base font-medium">Coming Soon</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
