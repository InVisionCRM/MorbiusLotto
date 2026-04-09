'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { homeSectionSubtitleClass, homeSectionTitleClass, homeSectionTitleGradientClass } from '@/lib/home-section-typography'

interface ShowcaseData {
  name: string
  accentColor: string
  glowColor: string
  tableImg: string
  pageImg: string
  tpImg: string
  rotateY: number
}

const SHOWCASES: ShowcaseData[] = [
  {
    name: 'WICK',
    accentColor: '#f97316',
    glowColor: 'rgba(22, 226, 249, 0.25)',
    tableImg: '/Marketing%20/Tables/WickTable.webp',
    pageImg: '/Marketing%20/Page%20View/WickPage.webp',
    tpImg: '/Marketing%20/Token%20Profile/WickTP.png',
    rotateY: 10,
  },
  {
    name: 'LBRTY',
    accentColor: '#a855f7',
    glowColor: 'rgba(22, 226, 249, 0.75)',
    tableImg: '/BlackJack/BrandedTable/Liberty.webp',
    pageImg: '/Marketing%20/Page%20View/LBRTYpv.webp',
    tpImg: '/Marketing%20/Token%20Profile/LBRTYtp.png',
    rotateY: 0,
  },
  {
    name: 'LibertySwap',
    accentColor: '#3b82f6',
    glowColor: 'rgba(22, 226, 249, 0.25)',
    tableImg: '/Marketing%20/Tables/LibertySwapTable.webp',
    pageImg: '/Marketing%20/Page%20View/LibertyPage.webp',
    tpImg: '/Marketing%20/Token%20Profile/LibertyTP.png',
    rotateY: -10,
  },
]

function BrowserMockup({ data, index }: { data: ShowcaseData; index: number }) {
  const isRight = data.rotateY < 0
  const slideX = index % 2 === 0 ? -72 : 72

  return (
    <motion.div
      className="relative flex flex-col items-center"
      initial={{ opacity: 0, x: slideX }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-80px', amount: 0.2 }}
      transition={{
        duration: 0.55,
        delay: index * 0.08,
        type: 'spring',
        stiffness: 120,
        damping: 18,
        mass: 0.8,
      }}
    >
      {/* Outer wrapper gives space for floating cards */}
      <div className="relative w-full" style={{ paddingBottom: '3.5rem', paddingTop: '1.5rem' }}>

        {/* Ambient glow behind the frame */}
        <div
          className="absolute inset-x-8 inset-y-0 rounded-3xl blur-3xl pointer-events-none"
          style={{ background: data.glowColor }}
        />

        {/* 3D Browser frame */}
        <div
          className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10"
          style={{
            transform: `perspective(1100px) rotateY(${data.rotateY}deg) rotateX(4deg) scale(0.97)`,
            transformOrigin: isRight ? 'right center' : 'left center',
            background: 'linear-gradient(160deg, #1e293b 0%, #0f172a 100%)',
            boxShadow: `0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.07)`,
          }}
        >
          {/* Browser chrome */}
          <div
            className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10"
            style={{ background: 'rgba(15,23,42,0.95)' }}
          >
            <div className="flex gap-1.5 shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
            </div>
            <div className="flex-1 px-3 py-1 rounded-md text-[11px] text-slate-500 text-center truncate"
              style={{ background: 'rgba(0,0,0,0.35)' }}>
              morblotto.com/blackjack/{data.name.toLowerCase()}
            </div>
          </div>

          {/* Page screenshot */}
          { }
          <img
            src={data.pageImg}
            alt={`${data.name} page view`}
            className="w-full block"
            style={{ display: 'block' }}
          />
        </div>

        {/* Floating mini-card: Page View (bottom-left) */}
        <div
          className="absolute bottom-0 left-0 w-[30%] rounded-xl overflow-hidden shadow-2xl border border-white/15 z-10"
          style={{
            transform: `perspective(800px) rotateY(${data.rotateY * 0.4}deg) rotateX(-3deg)`,
            boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
          }}
        >
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/10"
            style={{ background: '#1e293b' }}>
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/50" />
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
              <div className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
            </div>
            <span className="text-[8px] text-slate-500 ml-1">Table</span>
          </div>
          { }
          <img src={data.tableImg} alt={`${data.name} custom blackjack table`} className="w-full block" />
        </div>

        {/* Floating mini-card: Token Profile (bottom-right) */}
        <div
          className="absolute bottom-0 right-0 w-[30%] rounded-xl overflow-hidden shadow-2xl border border-white/15 z-10"
          style={{
            transform: `perspective(800px) rotateY(${-data.rotateY * 0.4}deg) rotateX(-3deg)`,
            boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
          }}
        >
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/10"
            style={{ background: '#1e293b' }}>
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/50" />
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
              <div className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
            </div>
            <span className="text-[8px] text-slate-500 ml-1">Token Profile</span>
          </div>
          { }
          <img src={data.tpImg} alt={`${data.name} token profile`} className="w-full block" />
        </div>
      </div>

      {/* Token name badge below the display */}
      <div
        className="mt-2 px-5 py-1.5 rounded-full text-sm font-bold text-white shadow-lg"
        style={{ background: `linear-gradient(135deg, ${data.accentColor}, ${data.accentColor}99)` }}
      >
        {data.name}
      </div>
    </motion.div>
  )
}

export function TableShowcaseDisplay() {
  return (
    <section className="py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className={cn(homeSectionTitleClass, 'mb-2')}>
            <span className="text-white">Already Live on </span>
            <span className={homeSectionTitleGradientClass}>Morbius</span>
          </h2>
          <p className={cn(homeSectionSubtitleClass)}>
            Three custom tables of many that we&apos;ve built for projects in the PulseChain ecosystem.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-10 md:gap-6 items-start">
          {SHOWCASES.map((data, index) => (
            <BrowserMockup key={data.name} data={data} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}
