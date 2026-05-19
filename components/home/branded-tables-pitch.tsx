'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Marquee } from '@/components/ui/marquee'
import { ChevronRight } from 'lucide-react'

// ── Branded table assets for marquee rows (3 × 5) ───────────────────────────

const TABLE_PRODUCTS = [
  { title: 'LBRTY',      link: '/marketing', thumbnail: '/BlackJack/BrandedTable/Liberty.webp'      },
  { title: 'WICK',       link: '/marketing', thumbnail: '/BlackJack/BrandedTable/GreenWick.webp'     },
  { title: 'TIME',       link: '/marketing', thumbnail: '/BlackJack/BrandedTable/InternetMoney.webp' },
  { title: 'pTIGER',    link: '/marketing', thumbnail: '/BlackJack/BrandedTable/pTiger.webp'        },
  { title: 'EMIT',       link: '/marketing', thumbnail: '/BlackJack/BrandedTable/EMIT.webp'          },
  { title: 'PeaCock',   link: '/marketing', thumbnail: '/BlackJack/BrandedTable/PeaCock-2.webp'     },
  { title: 'PewPew',    link: '/marketing', thumbnail: '/BlackJack/BrandedTable/PewPew.webp'        },
  { title: 'SuperStake',link: '/marketing', thumbnail: '/BlackJack/BrandedTable/SuperStake.webp'    },
  { title: 'CRVE',      link: '/marketing', thumbnail: '/BlackJack/BrandedTable/CRVE.webp'          },
  { title: 'BigRich',   link: '/marketing', thumbnail: '/BlackJack/BrandedTable/BigRich.webp'      },
  { title: 'WhaleBay',  link: '/marketing', thumbnail: '/BlackJack/BrandedTable/WhaleBay.webp'      },
  { title: 'Dr.Doge',   link: '/marketing', thumbnail: '/BlackJack/BrandedTable/Dr.Doge.webp'      },
  { title: 'MVS',       link: '/marketing', thumbnail: '/BlackJack/BrandedTable/MVS.webp'           },
  { title: 'moonlight', link: '/marketing', thumbnail: '/BlackJack/BrandedTable/moonlight.webp'     },
  { title: 'pTGC',      link: '/marketing', thumbnail: '/BlackJack/BrandedTable/pTGC.webp'          },
]

// ── Section header (above marquee strips) ─────────────────────────────────────

function ParallaxHeader() {
  return (
    <div className="max-w-7xl relative mx-auto flex w-full flex-col items-center px-4 pt-4 pb-2 text-center md:pt-6 md:pb-3">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.3em] text-cyan-300/80">
        Want yours next?
      </p>
      <h2 className="mb-4 max-w-3xl text-3xl font-bold leading-tight text-white sm:text-4xl">
        Bring your brand <span className="text-cyan-300">to the table.</span>
      </h2>

      <div className="flex flex-wrap justify-center gap-3">
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
    </div>
  )
}

function TableMarqueeStrip({
  products,
  reverse,
}: {
  products: { title: string; link: string; thumbnail: string }[]
  reverse?: boolean
}) {
  return (
    <Marquee
      reverse={reverse}
      pauseOnHover
      className="[--duration:45s] border-y border-white/5 bg-black/20 py-3"
    >
      {products.map((p) => (
        <Link
          key={p.title}
          href={p.link}
          className="group relative mx-2 flex h-36 w-56 shrink-0 overflow-hidden rounded-xl border border-cyan-500/20 shadow-lg shadow-black/40 transition hover:border-cyan-400/50"
          style={{
            background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.9), rgba(40, 40, 40, 0.7))',
            boxShadow:
              'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.06), 0 4px 12px rgba(0, 0, 0, 0.5)',
          }}
        >
          <Image
            src={p.thumbnail}
            alt={p.title}
            fill
            sizes="224px"
            loading="lazy"
            className="object-cover object-left-top transition group-hover:scale-[1.02]"
          />
          <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
            {p.title}
          </span>
        </Link>
      ))}
    </Marquee>
  )
}

// ── Section export (marquee strips + parallax header) ─

export function BrandedTablesPitch() {
  const row1 = TABLE_PRODUCTS.slice(0, 5)
  const row2 = TABLE_PRODUCTS.slice(5, 10)
  const row3 = TABLE_PRODUCTS.slice(10, 15)

  return (
    <div className="w-full overflow-hidden pb-6 antialiased">
      <ParallaxHeader />
      <div className="mt-2 space-y-3 md:mt-4">
        <TableMarqueeStrip products={row1} />
        <TableMarqueeStrip products={row2} reverse />
        <TableMarqueeStrip products={row3} />
      </div>
    </div>
  )
}
