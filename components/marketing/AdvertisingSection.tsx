'use client'

import { useState } from 'react'
import {
  Crown,
  Flame,
  Zap,
  BarChart2,
  Layers,
  LayoutGrid,
  Tv2,
  MessagesSquare,
  X,
  Tag,
} from 'lucide-react'
import { CryptoPaymentPanel } from './CryptoPaymentPanel'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SelectedAd {
  placementName: string
  duration: string
  usdPrice: number
}

interface PriceTier {
  label: string
  price: number
  wasPrice: number
}

type TrafficLevel = 'very-high' | 'high' | 'medium' | 'low'

interface PlacementCard {
  id: string
  icon: React.ElementType
  name: string
  description: string
  traffic: TrafficLevel
  tiers: PriceTier[]
  note?: string
}

// ── Data ──────────────────────────────────────────────────────────────────────

const TRAFFIC_LABELS: Record<TrafficLevel, { label: string; color: string; bg: string }> = {
  'very-high': { label: 'Very High Traffic', color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
  high:        { label: 'High Traffic',      color: '#22c55e', bg: 'rgba(34,197,94,0.12)'  },
  medium:      { label: 'Medium Traffic',    color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  low:         { label: 'Lower Traffic',     color: '#94a3b8', bg: 'rgba(148,163,184,0.10)' },
}

const PLACEMENTS: PlacementCard[] = [
  {
    id: 'hero',
    icon: Flame,
    name: 'Home Page Hero',
    description: 'Prime banner placement at the top of the Morbius home page. First thing every visitor sees.',
    traffic: 'very-high',
    tiers: [
      { label: '1 Day',  price: 49,  wasPrice: 99  },
      { label: '3 Days', price: 124, wasPrice: 249 },
      { label: '1 Week', price: 274, wasPrice: 549 },
    ],
  },
  {
    id: 'bj-loading',
    icon: Zap,
    name: 'Blackjack Loading Screen',
    description: 'Full-screen ad shown each time a player loads a Blackjack table. Massive captive audience.',
    traffic: 'very-high',
    tiers: [
      { label: '1 Day',  price: 39,  wasPrice: 79  },
      { label: '3 Days', price: 99,  wasPrice: 199 },
      { label: '1 Week', price: 224, wasPrice: 449 },
    ],
  },
  {
    id: 'plinko-loading',
    icon: Zap,
    name: 'Plinko Loading Screen',
    description: 'Full-screen brand placement every time players enter the Plinko game.',
    traffic: 'high',
    tiers: [
      { label: '1 Day',  price: 39,  wasPrice: 79  },
      { label: '3 Days', price: 99,  wasPrice: 199 },
      { label: '1 Week', price: 224, wasPrice: 449 },
    ],
  },
  {
    id: 'keno-loading',
    icon: Tv2,
    name: 'Keno Loading Screen',
    description: 'Brand placement on the Keno game loading screen.',
    traffic: 'medium',
    tiers: [
      { label: '1 Day',  price: 14, wasPrice: 29  },
      { label: '3 Days', price: 34, wasPrice: 69  },
      { label: '1 Week', price: 74, wasPrice: 149 },
    ],
  },
  {
    id: 'lotto-loading',
    icon: Tv2,
    name: 'Lotto Loading Screen',
    description: 'Brand placement on the Lotto game loading screen.',
    traffic: 'low',
    tiers: [
      { label: '1 Day',  price: 14, wasPrice: 29  },
      { label: '3 Days', price: 34, wasPrice: 69  },
      { label: '1 Week', price: 74, wasPrice: 149 },
    ],
  },
  {
    id: 'all-loading',
    icon: Layers,
    name: 'ALL Loading Screens',
    description: 'Bundle deal — your brand on every single game loading screen across Morbius. Best value for broad exposure.',
    traffic: 'very-high',
    tiers: [
      { label: '1 Day',  price: 74,  wasPrice: 149 },
      { label: '3 Days', price: 189, wasPrice: 379 },
      { label: '1 Week', price: 399, wasPrice: 799 },
    ],
    note: 'Includes Blackjack, Plinko, Keno & Lotto loading screens',
  },
  {
    id: 'game-pages',
    icon: LayoutGrid,
    name: 'All Game Pages',
    description: 'Ad placement across all game pages on Morbius — Blackjack, Plinko, Keno, and Lotto. Does not include custom table art.',
    traffic: 'high',
    tiers: [
      { label: '1 Day',  price: 64,  wasPrice: 129 },
      { label: '3 Days', price: 149, wasPrice: 299 },
      { label: '1 Week', price: 324, wasPrice: 649 },
    ],
  },
]

// ── Payment Modal ─────────────────────────────────────────────────────────────

function PaymentModal({ selected, onClose }: { selected: SelectedAd; onClose: () => void }) {
  const telegramText =
    `Hi! I just sent payment for an ad placement on Morbius:\n` +
    `• Placement: ${selected.placementName}\n` +
    `• Duration: ${selected.duration}\n` +
    `• Price: $${selected.usdPrice} USD\n\n` +
    `My TX Hash: `

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-slate-700/80 hover:bg-slate-600/80 text-slate-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div
          className="px-6 py-4 rounded-t-2xl border-b"
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(10,15,30,0.95))',
            borderColor: 'rgba(99,102,241,0.25)',
          }}
        >
          <p className="text-xs text-indigo-400 font-semibold uppercase tracking-wider mb-0.5">Ad Purchase</p>
          <p className="text-white font-bold text-base">{selected.placementName}</p>
          <p className="text-slate-400 text-sm">{selected.duration} — ${selected.usdPrice} USD</p>
        </div>

        <CryptoPaymentPanel
          usdPrice={selected.usdPrice}
          title={`Ad: ${selected.placementName}`}
          subtitle={`${selected.duration} placement — paid in PLS at live rate`}
          telegramText={telegramText}
          accent="cyan"
        />
      </div>
    </div>
  )
}

// ── Standard Placement Card ───────────────────────────────────────────────────

function PlacementCardItem({ card, onBuy }: { card: PlacementCard; onBuy: (ad: SelectedAd) => void }) {
  const traffic = TRAFFIC_LABELS[card.traffic]
  const Icon = card.icon

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, rgba(15,20,40,0.95), rgba(10,14,30,0.95))',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <div className="p-5 pb-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: 'rgba(99,102,241,0.15)' }}>
          <Icon className="w-5 h-5 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-white font-bold text-sm leading-tight">{card.name}</h3>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: traffic.bg, color: traffic.color }}>
              {traffic.label}
            </span>
          </div>
          <p className="text-slate-500 text-xs leading-relaxed">{card.description}</p>
          {card.note && <p className="text-indigo-400/70 text-[10px] mt-1 font-medium">{card.note}</p>}
        </div>
      </div>

      <div className="mx-5 border-t border-white/[0.06]" />

      <div className="p-5 pt-4 flex flex-col gap-3 flex-1">
        <div className="grid grid-cols-3 gap-2">
          {card.tiers.map((tier) => (
            <button
              key={tier.label}
              type="button"
              onClick={() => onBuy({ placementName: card.name, duration: tier.label, usdPrice: tier.price })}
              className="flex flex-col items-center p-2.5 rounded-xl text-center transition-all group"
              style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.15)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(99,102,241,0.3)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.035)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.06)'
              }}
            >
              <span className="text-[10px] text-slate-500 font-medium mb-1 group-hover:text-indigo-400 transition-colors">
                {tier.label}
              </span>
              <span className="text-white font-black text-sm">${tier.price}</span>
              <span className="text-[9px] text-slate-600 line-through">${tier.wasPrice}</span>
            </button>
          ))}
        </div>

        <a
          href="https://t.me/kylecruise"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors"
          style={{
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.18)',
            color: '#818cf8',
          }}
        >
          <MessagesSquare className="w-3.5 h-3.5" />
          Custom Duration / Partnership
        </a>
      </div>
    </div>
  )
}

// ── Premium Default Table Theme Card ─────────────────────────────────────────

function PremiumCard({ onBuy }: { onBuy: (ad: SelectedAd) => void }) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden col-span-full"
      style={{
        background: 'linear-gradient(135deg, rgba(120,53,15,0.25) 0%, rgba(10,14,30,0.97) 60%)',
        border: '1px solid rgba(245,158,11,0.35)',
        boxShadow: '0 0 60px rgba(245,158,11,0.08)',
      }}
    >
      <div className="absolute top-0 left-0 w-72 h-48 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at top left, rgba(245,158,11,0.12), transparent 70%)' }}
      />

      <div className="relative p-6 md:p-8">
        <div className="flex flex-wrap items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.3)' }}>
            <Crown className="w-6 h-6 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="text-white font-black text-lg">Default Table Theme — Site Wide</h3>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide"
                style={{ background: 'rgba(245,158,11,0.2)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' }}>
                Most Exposure
              </span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed max-w-2xl">
              Your branded table becomes the <span className="text-white font-semibold">default theme site-wide</span>.
              Every single player on Morbius interacts with your table, sees your Token Profile, and your
              brand is front and center during every game session.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {[
            {
              duration: '3 Days',
              tiers: [
                { label: 'Without custom table', subLabel: 'Includes table build', price: 199, wasPrice: 399 },
                { label: 'Already have a table', subLabel: 'Save $25', price: 175, wasPrice: 350 },
              ],
            },
            {
              duration: '1 Week',
              tiers: [
                { label: 'Without custom table', subLabel: 'Includes table build', price: 299, wasPrice: 599 },
                { label: 'Already have a table', subLabel: 'Save $25', price: 274, wasPrice: 549 },
              ],
            },
          ].map(({ duration, tiers }) => (
            <div key={duration} className="rounded-xl p-5"
              style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}>
              <p className="text-amber-400 font-bold text-sm mb-4">{duration}</p>
              <div className="flex gap-3 flex-wrap">
                {tiers.map((tier) => (
                  <button
                    key={tier.price}
                    type="button"
                    onClick={() => onBuy({
                      placementName: `Default Table Theme Site-Wide (${tier.label})`,
                      duration,
                      usdPrice: tier.price,
                    })}
                    className="flex-1 min-w-0 text-left rounded-xl p-3 transition-all"
                    style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,158,11,0.15)'
                      ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(245,158,11,0.4)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,158,11,0.06)'
                      ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(245,158,11,0.15)'
                    }}
                  >
                    <p className="text-[10px] text-slate-500 mb-1">{tier.label}</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-white font-black text-xl">${tier.price}</p>
                      <p className="text-slate-600 text-xs line-through">${tier.wasPrice}</p>
                    </div>
                    <p className="text-[10px] mt-0.5 font-semibold"
                      style={{ color: tier.subLabel.startsWith('Save') ? '#f59e0b' : '#475569' }}>
                      {tier.subLabel}
                    </p>
                    <p className="text-[9px] text-amber-400/50 mt-1.5 font-medium">Tap to purchase →</p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl p-4 flex flex-wrap gap-x-6 gap-y-2" style={{ background: 'rgba(0,0,0,0.2)' }}>
          {[
            'Site-wide default table theme',
            'Token Profile displayed to every player',
            'Custom branded table build (if needed)',
            'All custom table package perks included',
          ].map((item) => (
            <span key={item} className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Section Export ────────────────────────────────────────────────────────────

export function AdvertisingSection() {
  const [selected, setSelected] = useState<SelectedAd | null>(null)

  return (
    <section className="py-16 px-4">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-semibold uppercase tracking-wider mb-5"
            style={{ background: 'rgba(99,102,241,0.1)', borderColor: 'rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
            <BarChart2 className="w-3.5 h-3.5" />
            Advertising — Reach PulseChain Traders
          </div>

          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Want to Advertise on{' '}
            <span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              Morbius?
            </span>
          </h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto mb-5">
            Put your token in front of active PulseChain players. Tap any price to purchase
            directly — payment is in PLS at the live rate.
          </p>

          {/* Limited time sale banner */}
          <div
            className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-xl"
            style={{
              background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.08))',
              border: '1px solid rgba(239,68,68,0.3)',
            }}
          >
            <Tag className="w-4 h-4 text-red-400" />
            <span className="text-red-300 font-bold text-sm">LIMITED TIME — All prices 50% off!</span>
            <span className="text-red-500 text-xs">Crossed-out prices show regular rates</span>
          </div>
        </div>

        {/* Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
          {PLACEMENTS.map((card) => (
            <PlacementCardItem key={card.id} card={card} onBuy={setSelected} />
          ))}
        </div>

        {/* Premium card */}
        <div className="grid">
          <PremiumCard onBuy={setSelected} />
        </div>

        {/* Partnership footer */}
        <div
          className="mt-8 rounded-2xl p-6 md:p-8 text-center"
          style={{
            background: 'linear-gradient(135deg, rgba(15,20,40,0.97), rgba(10,14,30,0.97))',
            border: '1px solid rgba(99,102,241,0.2)',
          }}
        >
          <MessagesSquare className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
          <h3 className="text-white font-bold text-lg mb-2">Have a Bigger Vision?</h3>
          <p className="text-slate-400 text-sm max-w-md mx-auto mb-5">
            Looking for a long-term partnership or a custom strategy tailored to your project?
            Let&apos;s talk and build something together.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="https://t.me/kylecruise"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 4px 20px rgba(99,102,241,0.3)' }}
            >
              <MessagesSquare className="w-4 h-4" />
              Reach Out — Telegram
            </a>
            <a
              href="https://x.com/Morbius_io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#cbd5e1' }}
            >
              X @Morbius_io
            </a>
          </div>
          <p className="text-slate-600 text-xs mt-4">All ad placements are paid in PLS at live market rate</p>
        </div>
      </div>

      {selected && <PaymentModal selected={selected} onClose={() => setSelected(null)} />}
    </section>
  )
}
