'use client'

import { LatestWins } from '@/components/home/latest-wins'
import { AcesParallaxSection } from '@/components/home/aces-parallax-section'

const RESPONSIBLE_GAMING_ITEMS = [
  'Self-exclusion and cool-off options so you can voluntarily step away for a set period.',
  'Session time visibility so you can see how long you’ve been playing.',
  'Easy withdrawals: withdraw your balance anytime from the game menu or by clicking reserve balance.',
  'No credit—play only with what you deposit; no borrowing or chasing losses.',
  'Clear access to responsible gaming tools and info from every game (e.g. Responsible Gaming button in chat).',
]

export default function Page() {
  return (
    <div className="min-h-screen text-white bg-black flex flex-col items-center py-12 px-4 gap-16">
      <LatestWins />

      {/* Aces parallax: slide in then out */}
      <AcesParallaxSection />

      {/* Responsible Gaming Section */}
      <section className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <h2 className="text-3xl md:text-4xl font-russo-one font-normal text-white mb-2">
            Responsible Gaming
          </h2>
          <p className="text-white/50 text-sm">
            We give you the tools to play responsibly and step away when you need to.
          </p>
        </div>
        <div
          className="rounded-2xl border border-cyan-500/30 p-6 space-y-4"
          style={{
            background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
            boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
            border: '1px inset rgba(60, 60, 60, 0.5)',
          }}
        >
          <p className="text-white/90 text-sm leading-relaxed">
            We focus on meeting responsible gaming standards and making sure you have everything you need to pull back from the games whenever you want. Here’s what we offer:
          </p>
          <ul className="space-y-3 text-left">
            {RESPONSIBLE_GAMING_ITEMS.map((item, i) => (
              <li key={i} className="flex gap-2 text-white/90 text-sm">
                <span className="text-cyan-400/90 shrink-0 mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
