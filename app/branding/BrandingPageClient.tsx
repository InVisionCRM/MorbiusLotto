'use client'

import { useCallback } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import Footer from '@/components/PLINKO/Footer'

function publicUrl(parts: readonly string[]) {
  return `/${parts.map(encodeURIComponent).join('/')}`
}

/** Branded table card title: basename only, ALL CAPS, no extension. */
function brandedTableTitle(fileName: string): string {
  const stem = fileName.replace(/\.[^./\\]+$/i, '')
  return stem.toUpperCase()
}

const SWATCHES = [
  {
    id: 'black',
    label: 'black',
    hex: '#141414',
    rgba: 'rgba(20, 20, 20, 0.8)',
    copy: 'HEX #141414\nRGBA rgba(20, 20, 20, 0.8)',
  },
  {
    id: 'cyan',
    label: 'cyan',
    hex: '#06b6d4',
    rgba: 'rgba(6, 182, 212, 1)',
    copy: 'HEX #06b6d4\nRGBA rgba(6, 182, 212, 1)',
  },
  {
    id: 'grey',
    label: 'grey',
    hex: '#3C3C3C',
    rgba: 'rgba(60, 60, 60, 0.5)',
    copy: 'HEX #3C3C3C\nRGBA rgba(60, 60, 60, 0.5)',
  },
] as const

const LOGO_PNG_PARTS = ['morbius', 'MorbiusLogo (3).png'] as const

const VIDEO_EXT = /\.(mp4|m4v|webm|mov)$/i

const COOL_STUFF: readonly { parts: readonly string[]; label: string }[] = [
  { parts: ['morbius', 'hero-slide.mp4'], label: 'Cool 1' },
  { parts: ['morbius', 'MobiusChip.mp4'], label: 'Cool 2' },
  { parts: ['morbius', 'Slots.png'], label: 'Cool 3' },
  { parts: ['morbius-rocket.mp4'], label: 'Cool 4' },
  { parts: ['morbius', 'Sponsorship.png'], label: 'Cool 5' },
  { parts: ['be072188-bdcd-41d1-973d-d742282fb87c.MP4'], label: 'Cool 6' },
  { parts: ['morbius', 'MorbiusChip.png'], label: 'Cool 7' },
]

function fileStem(parts: readonly string[]) {
  return parts[parts.length - 1]
}

const CARD_SHELL =
  'rounded-2xl border border-white/[0.08] bg-[#0a0c12]/90 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.35)]'

type BannerAsset = { fileName: string; displayName: string }

type Props = {
  titleFontClassName: string
  nameFontClassName: string
  bannerAsset: BannerAsset | null
  tableFiles: readonly string[]
}

function MediaCard({
  href,
  downloadName,
  displayName,
  nameFontClassName,
  unoptimized,
  isVideo,
}: {
  href: string
  downloadName: string
  displayName: string
  nameFontClassName: string
  unoptimized?: boolean
  isVideo?: boolean
}) {
  return (
    <div className={CARD_SHELL}>
      <div className="relative aspect-[16/10] bg-black/60">
        {isVideo ? (
          <video
            className="absolute inset-0 h-full w-full object-contain p-2"
            controls
            playsInline
            preload="metadata"
            src={href}
            aria-label={displayName}
          />
        ) : (
          <Image
            src={href}
            alt={displayName}
            fill
            className="object-contain p-3"
            sizes="(max-width: 768px) 100vw, 33vw"
            unoptimized={unoptimized}
          />
        )}
      </div>
      <div className={`flex flex-col gap-3 px-4 py-3 border-t border-white/[0.06] ${nameFontClassName}`}>
        <p className="text-[15px] font-medium text-slate-100 tracking-tight">{displayName}</p>
        <div className="flex flex-wrap gap-2">
          <a
            href={href}
            download={downloadName}
            className="text-sm font-medium text-cyan-400/95 hover:text-cyan-300 transition-colors"
          >
            Download
          </a>
          <span className="text-slate-600" aria-hidden>
            ·
          </span>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            View
          </a>
        </div>
      </div>
    </div>
  )
}

export default function BrandingPageClient({
  titleFontClassName,
  nameFontClassName,
  bannerAsset,
  tableFiles,
}: Props) {
  const copyText = useCallback((text: string) => {
    void navigator.clipboard.writeText(text).then(
      () => toast.success('Copied'),
      () => toast.error('Copy failed'),
    )
  }, [])

  return (
    <GlobalMainNav showBackArrow backArrowHref="/" backArrowLabel="Home">
      <div className="min-h-dvh flex flex-col bg-[#060810] text-white">
        <header className="flex justify-center px-4 pt-16 pb-14 md:pt-20 md:pb-16">
          <h1
            className={`text-center text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-white ${titleFontClassName}`}
          >
            Brand KIT
          </h1>
        </header>

        <main className="flex-1 w-full max-w-5xl mx-auto px-4 pb-16 space-y-14 md:space-y-16">
          {/* Brand colors */}
          <section className="space-y-6">
            <h2 className={`text-lg md:text-xl font-semibold text-white tracking-tight ${titleFontClassName}`}>
              Brand colors
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {SWATCHES.map((s) => (
                <div key={s.id} className={CARD_SHELL}>
                  <div className="h-24 w-full" style={{ backgroundColor: s.rgba }} />
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-base font-semibold text-white leading-snug ${titleFontClassName}`}>{s.label}</p>
                      <button
                        type="button"
                        onClick={() => copyText(s.copy)}
                        className="shrink-0 rounded-lg p-2 text-cyan-400/90 hover:bg-white/5 border border-transparent hover:border-cyan-500/25 transition-colors"
                        aria-label={`Copy ${s.label}`}
                      >
                        <Copy className="w-4 h-4" strokeWidth={2} />
                      </button>
                    </div>
                    <dl className="space-y-1.5 text-sm text-slate-400">
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">HEX</dt>
                        <dd className="font-mono text-slate-200 tabular-nums">{s.hex}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">RGBA</dt>
                        <dd className="font-mono text-slate-200 text-right text-[11px] leading-snug break-all">
                          {s.rgba}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Brand logo */}
          <section className="space-y-6">
            <h2 className={`text-lg md:text-xl font-semibold text-white tracking-tight ${titleFontClassName}`}>
              Brand logo
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
              <MediaCard
                href={publicUrl(LOGO_PNG_PARTS)}
                downloadName="MorbiusLogo.png"
                displayName="Morbius Logo.png"
                nameFontClassName={nameFontClassName}
              />
            </div>
          </section>

          {/* Brand banners */}
          <section className="space-y-6">
            <h2 className={`text-lg md:text-xl font-semibold text-white tracking-tight ${titleFontClassName}`}>
              Brand banners
            </h2>
            {bannerAsset ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <MediaCard
                  href={publicUrl(['Morbius Banners', bannerAsset.fileName])}
                  downloadName="Morbius Banner.png"
                  displayName={bannerAsset.displayName}
                  nameFontClassName={nameFontClassName}
                />
              </div>
            ) : null}
          </section>

          {/* Brand tables */}
          <section className="space-y-6">
            <h2 className={`text-lg md:text-xl font-semibold text-white tracking-tight ${titleFontClassName}`}>
              Brand tables
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tableFiles.map((name) => {
                const href = publicUrl(['BlackJack', 'BrandedTable', name])
                return (
                  <MediaCard
                    key={name}
                    href={href}
                    downloadName={name}
                    displayName={brandedTableTitle(name)}
                    nameFontClassName={nameFontClassName}
                    unoptimized={/\.svg$/i.test(name)}
                  />
                )
              })}
            </div>
          </section>

          {/* Cool stuff */}
          <section className="space-y-6">
            <h2 className={`text-lg md:text-xl font-semibold text-white tracking-tight ${titleFontClassName}`}>
              Cool stuff
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {COOL_STUFF.map((item) => {
                const href = publicUrl(item.parts)
                const fname = fileStem(item.parts)
                return (
                  <MediaCard
                    key={item.label}
                    href={href}
                    downloadName={fname}
                    displayName={item.label}
                    nameFontClassName={nameFontClassName}
                    unoptimized={/\.svg$/i.test(fname)}
                    isVideo={VIDEO_EXT.test(fname)}
                  />
                )
              })}
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </GlobalMainNav>
  )
}
