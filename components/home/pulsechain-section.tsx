'use client'

import Link from 'next/link'
import { HeroParallax } from '@/components/ui/hero-parallax'
import { CometCard } from '@/components/ui/comet-card'
import {
  Zap,
  Clock,
  BadgeCheck,
  Star,
  Layers,
  ChevronRight,
  Tag,
  Spade,
  MessagesSquare,
} from 'lucide-react'

// ── Products for HeroParallax (3 rows × 5) ────────────────────────────────────

const TABLE_PRODUCTS = [
  { title: 'LBRTY',      link: '/marketing', thumbnail: '/BlackJack/BrandedTable/Liberty.png'       },
  { title: 'WICK',       link: '/marketing', thumbnail: '/BlackJack/BrandedTable/GreenWick.png'     },
  { title: 'TIME',       link: '/marketing', thumbnail: '/BlackJack/BrandedTable/InternetMoney.png' },
  { title: 'pTIGER',    link: '/marketing', thumbnail: '/BlackJack/BrandedTable/pTiger.png'        },
  { title: 'EMIT',       link: '/marketing', thumbnail: '/BlackJack/BrandedTable/EMIT.png'          },
  { title: 'PeaCock',   link: '/marketing', thumbnail: '/BlackJack/BrandedTable/PeaCock-2.png'     },
  { title: 'PewPew',    link: '/marketing', thumbnail: '/BlackJack/BrandedTable/PewPew.png'        },
  { title: 'SuperStake',link: '/marketing', thumbnail: '/BlackJack/BrandedTable/SuperStake.png'    },
  { title: 'CRVE',      link: '/marketing', thumbnail: '/BlackJack/BrandedTable/CRVE.png'          },
  { title: 'BigRich',   link: '/marketing', thumbnail: '/BlackJack/BrandedTable/BigRich.png'       },
  { title: 'WhaleBay',  link: '/marketing', thumbnail: '/BlackJack/BrandedTable/WhaleBay.png'      },
  { title: 'Dr.Doge',   link: '/marketing', thumbnail: '/BlackJack/BrandedTable/Dr.Doge.png'       },
  { title: 'MVS',       link: '/marketing', thumbnail: '/BlackJack/BrandedTable/MVS.png'           },
  { title: 'moonlight', link: '/marketing', thumbnail: '/BlackJack/BrandedTable/moonlight.png'     },
  { title: 'pTGC',      link: '/marketing', thumbnail: '/BlackJack/BrandedTable/pTGC.png'          },
]

// ── HeroParallax custom header ────────────────────────────────────────────────

function ParallaxHeader() {
  return (
    <div className="max-w-7xl relative mx-auto pt-10 md:pt-16 pb-2 md:pb-4 px-4 w-full left-0 top-0">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-xs font-semibold uppercase tracking-wider mb-2">
        <Zap className="w-3.5 h-3.5" />
        Custom Blackjack Tables &mdash; Limited Spots
      </div>

      <div className="flex justify-start mb-2">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
          style={{
            background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.1))',
            border: '1px solid rgba(239,68,68,0.4)',
          }}
        >
          <Tag className="w-3.5 h-3.5 text-red-400" />
          <span className="text-red-300 font-black uppercase tracking-wide">
            Limited Time — 50% Off All Packages!
          </span>
        </div>
      </div>

      <h1 className="text-3xl md:text-6xl font-extrabold text-white leading-tight mb-3">
        Bring Your Brand<br />
        <span className="bg-gradient-to-r from-cyan-400 to-blue-400 text-transparent bg-clip-text">
          To The Table
        </span>
      </h1>

      <p className="max-w-2xl md:text-lg text-slate-300 leading-relaxed mb-4">
        Morbius builds a fully branded game table for your token — live in{' '}
        <span className="text-white font-semibold">24 hours</span>, with a token profile,
        Gold Badge, and your design auto-applied to every future game we launch.
      </p>

      <div className="flex flex-wrap gap-3 mb-4">
        <Link
          href="/marketing#payment"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-cyan-900/30 transition-all"
        >
          Get Started — $49
          <span className="text-cyan-200/70 line-through text-xs font-normal">$99</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
        <Link
          href="/marketing"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-white font-semibold text-sm transition-all"
        >
          See Full Details
        </Link>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-slate-400 mb-0">
        <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-cyan-500" /> 24hr turnaround</span>
        <span className="flex items-center gap-1.5"><BadgeCheck className="w-3.5 h-3.5 text-amber-400" /> Gold Badge included</span>
        <span className="flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-violet-400" /> Featured on PulseChainAi.com</span>
        <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-green-400" /> All future games included</span>
      </div>
    </div>
  )
}

// ── Package summary (used below TableShowcaseDisplay on home) ─────────────────

export function PackageSummarySection() {
  return (
    <section className="py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <CometCard>
          <div
            className="rounded-2xl p-6"
            style={{
              background: 'linear-gradient(135deg, rgba(10,15,30,0.9), rgba(15,20,45,0.9))',
              border: '1px solid rgba(99,102,241,0.25)',
            }}
          >
            <h3 className="text-lg font-bold text-white mb-4">
              Package Summary — $49{' '}
              <span className="text-slate-600 line-through text-base font-normal">$99</span>
            </h3>
            <ul className="space-y-3 text-sm mb-6">
              {[
                'Custom branded table on Morbius (Blackjack + all future games)',
                'TableProfile card with logo, socials & contract',
                'GOLD badge on PulseChainAi.com',
                'Custom token description on PulseChainAi.com',
                'Featured on the front page of PulseChainAi.com',
                '24hr delivery guaranteed',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-slate-300">
                  <BadgeCheck className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/marketing#payment"
                className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-cyan-900/30 transition-all"
              >
                <Spade className="w-4 h-4" />
                Get Your Custom Table
                <ChevronRight className="w-4 h-4" />
              </Link>
              <a
                href="https://t.me/kylecruise"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl bg-blue-900/40 hover:bg-blue-900/60 border border-blue-500/30 text-blue-300 text-sm transition-colors font-semibold"
              >
                <MessagesSquare className="w-4 h-4" />
                Telegram @kylecruise
              </a>
            </div>
          </div>
        </CometCard>
      </div>
    </section>
  )
}

// ── Section export (parallax only; 3D table + package summary live on home page) ─

export function PulseChainSection() {
  return (
    <div className="w-full">
      <HeroParallax products={TABLE_PRODUCTS} header={<ParallaxHeader />} />
    </div>
  )
}
