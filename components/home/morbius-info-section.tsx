'use client'

import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const
const SUITS = ['C', 'D', 'H', 'S'] as const

/** Full 52-card filenames (matches `/public/BlackJack/Cards/PNG`). */
const ALL_CARD_FILES: string[] = RANKS.flatMap((r) =>
  SUITS.map((s) => `${r}${s}.png`),
)

const SPADE_HIGH_TO_LOW = (
  ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'] as const
).map((r) => `${r}S.png`)

const ANIM_CLASSES = [
  'animate-morbi-card-float',
  'animate-morbi-card-drift',
  'animate-morbi-card-wobble',
  'animate-morbi-card-glow-pulse',
  'animate-morbi-card-flutter',
] as const

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

function CardImg({
  file,
  className,
  style,
  priority,
}: {
  file: string
  className?: string
  style?: React.CSSProperties
  priority?: boolean
}) {
  return (
    <img
      src={`/BlackJack/Cards/PNG/${file}`}
      alt=""
      width={180}
      height={252}
      className={cn(
        'pointer-events-none h-auto max-h-[28vh] w-[clamp(2.25rem,7.5vw,5.75rem)] select-none object-contain',
        'drop-shadow-[0_10px_28px_rgba(0,0,0,0.65)]',
        className,
      )}
      style={style}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
    />
  )
}

function StanzaFan() {
  const accent = ['AH.png', 'AD.png', 'AC.png', 'KH.png', 'KD.png', 'QC.png', 'JD.png']
  const n = SPADE_HIGH_TO_LOW.length
  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col items-center justify-end pb-[6vh] pt-16 md:pb-[10vh]">
      <div className="relative mx-auto h-[min(48vh,380px)] w-full max-w-5xl">
        {SPADE_HIGH_TO_LOW.map((file, i) => {
          const angle = -38 + (76 * i) / Math.max(1, n - 1)
          return (
            <CardImg
              key={file}
              file={file}
              priority={i < 4}
              className={cn(
                'absolute bottom-0 left-1/2 origin-bottom motion-safe:opacity-100',
                ANIM_CLASSES[i % ANIM_CLASSES.length],
              )}
              style={{
                zIndex: i,
                transform: `translateX(-50%) rotate(${angle}deg)`,
                transformOrigin: '50% 100%',
                animationDelay: `${i * 70}ms`,
              }}
            />
          )
        })}
        {accent.map((file, i) => (
          <CardImg
            key={file}
            file={file}
            className={cn(
              'absolute bottom-0 left-1/2 origin-bottom opacity-75 motion-safe:animate-morbi-card-float',
            )}
            style={{
              zIndex: -1,
              transform: `translateX(-50%) translate(${-140 + i * 42}px, 36px) rotate(${-18 + i * 5}deg)`,
              transformOrigin: '50% 100%',
              animationDelay: `${280 + i * 55}ms`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

function StanzaOrbitRing() {
  const outer = ALL_CARD_FILES.slice(0, 18)
  const inner = ALL_CARD_FILES.slice(18, 36)

  const arm = (
    file: string,
    i: number,
    n: number,
    translate: string,
    offset: number,
    compact: boolean,
  ) => {
    const angle = (360 / n) * i + offset
    return (
      <div
        key={`${file}-${translate}-${i}`}
        className="absolute left-1/2 top-1/2 h-0 w-0"
        style={{
          transform: `rotate(${angle}deg) ${translate}`,
        }}
      >
        <div
          className="motion-safe:animate-morbi-orbit-slow-reverse"
          style={{ transform: 'translate(-50%, -50%)' }}
        >
          <CardImg
            file={file}
            className={cn(
              compact
                ? 'w-[clamp(1.75rem,5.5vw,3.5rem)]'
                : 'w-[clamp(2.25rem,7vw,5rem)]',
              ANIM_CLASSES[(i + offset) % ANIM_CLASSES.length],
            )}
            style={{ animationDelay: `${i * 45}ms` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center p-3 md:p-6">
      <div
        className="relative aspect-square w-[min(92vw,580px)] motion-safe:animate-morbi-orbit-slow"
        style={{ contain: 'layout style' }}
      >
        {outer.map((file, i) => arm(file, i, outer.length, 'translateY(-44vmin)', 0, false))}
        {inner.map((file, i) => arm(file, i, inner.length, 'translateY(-26vmin)', 10, true))}
      </div>
    </div>
  )
}

function StanzaWaterfall() {
  const cols: string[][] = [
    ALL_CARD_FILES.filter((_, i) => i % 4 === 0).slice(0, 11),
    ALL_CARD_FILES.filter((_, i) => i % 4 === 1).slice(0, 11),
    ALL_CARD_FILES.filter((_, i) => i % 4 === 2).slice(0, 11),
    ALL_CARD_FILES.filter((_, i) => i % 4 === 3).slice(0, 11),
  ]
  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center px-1 py-6 md:px-4">
      <div className="grid w-full max-w-6xl grid-cols-4 gap-x-0.5 md:gap-x-2">
        {cols.map((column, ci) => (
          <div
            key={ci}
            className="flex flex-col items-center"
            style={{ marginTop: ci % 2 === 1 ? 16 : 0 }}
          >
            {column.map((file, ri) => (
              <CardImg
                key={`${file}-w-${ci}-${ri}`}
                file={file}
                className={cn(
                  'w-[clamp(1.65rem,5vw,3rem)] max-h-none',
                  ri % 3 === 0 && 'motion-safe:animate-morbi-levitate',
                  ri % 3 === 1 && 'motion-safe:animate-morbi-sway',
                  ri % 3 === 2 && 'motion-safe:animate-morbi-tilt',
                  ANIM_CLASSES[(ci + ri) % ANIM_CLASSES.length],
                )}
                style={{
                  marginTop: ri === 0 ? 0 : -38,
                  animationDelay: `${(ci * 8 + ri) * 45}ms`,
                  zIndex: column.length - ri,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function StanzaFaceOff() {
  const left = ALL_CARD_FILES.slice(0, 13)
  const right = ALL_CARD_FILES.slice(13, 26)
  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center gap-10 px-2 py-10 md:flex-row md:gap-6">
      <div className="relative h-[min(52vh,420px)] w-full max-w-md">
        {left.map((file, i) => {
          const angle = -28 + (56 * i) / 12
          return (
            <CardImg
              key={`${file}-l-${i}`}
              file={file}
              className={cn(
                'absolute bottom-0 right-[12%] origin-bottom',
                ANIM_CLASSES[i % ANIM_CLASSES.length],
              )}
              style={{
                zIndex: i,
                transform: `rotate(${angle}deg) translateX(${i * 2}px)`,
                transformOrigin: '100% 100%',
                animationDelay: `${i * 45}ms`,
              }}
            />
          )
        })}
      </div>
      <div className="relative h-[min(52vh,420px)] w-full max-w-md">
        {right.map((file, i) => {
          const angle = 28 - (56 * i) / 12
          return (
            <CardImg
              key={`${file}-r-${i}`}
              file={file}
              className={cn(
                'absolute bottom-0 left-[12%] origin-bottom',
                ANIM_CLASSES[(i + 2) % ANIM_CLASSES.length],
              )}
              style={{
                zIndex: i,
                transform: `rotate(${angle}deg) translateX(${-i * 2}px)`,
                transformOrigin: '0% 100%',
                animationDelay: `${i * 45}ms`,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

function StanzaFullDeckGrid() {
  const rows = SUITS.map((s) => RANKS.map((r) => `${r}${s}.png`))
  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center px-1 py-6 md:px-3">
      <div
        className="grid w-full max-w-7xl gap-1 md:gap-1.5"
        style={{
          gridTemplateColumns: 'repeat(13, minmax(0, 1fr))',
        }}
      >
        {rows.flatMap((row) =>
          row.map((file, i) => (
            <CardImg
              key={`${file}-grid-${i}`}
              file={file}
              className={cn(
                'w-full max-w-[52px] motion-safe:animate-morbi-card-glow-pulse sm:max-w-[56px] md:max-w-[64px]',
                ANIM_CLASSES[i % ANIM_CLASSES.length],
              )}
              style={{
                animationDelay: `${(i % 13) * 35 + Math.floor(i / 13) * 120}ms`,
              }}
            />
          )),
        )}
      </div>
    </div>
  )
}

function MorbiusCardsReduced() {
  const sample = [
    'AS.png',
    'KS.png',
    'QS.png',
    'JS.png',
    '10S.png',
    'AH.png',
    'KH.png',
    'QH.png',
    'JH.png',
    '10H.png',
    'AD.png',
    'KD.png',
  ]
  return (
    <section
      id="what-is-morbius"
      className="relative w-full max-w-6xl scroll-mt-20 px-2 py-12 md:px-4 md:py-16"
      aria-label="Morbius playing card showcase"
    >
      <h2 className="sr-only">Morbius playing card showcase</h2>
      <div
        className="relative overflow-hidden rounded-2xl border border-cyan-500/25 p-8"
        style={{
          background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.85), rgba(40, 40, 40, 0.65))',
          boxShadow:
            'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(34,211,238,0.12),transparent_68%)]" />
        <div className="relative flex flex-wrap items-center justify-center gap-3">
          {sample.map((file, i) => (
            <CardImg key={file} file={file} className="max-h-[20vh] w-[clamp(2.5rem,12vw,4rem)]" />
          ))}
        </div>
      </div>
    </section>
  )
}

function MorbiusCardsSnapTheater() {
  return (
    <section
      id="what-is-morbius"
      className="relative mx-auto w-full max-w-7xl scroll-mt-20"
      aria-label="Morbius playing card showcase"
    >
      <h2 className="sr-only">Morbius playing card showcase</h2>

      <div
        className="relative h-[100dvh] max-h-[100svh] overflow-hidden rounded-2xl border border-cyan-500/30"
        style={{
          background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.88), rgba(40, 40, 40, 0.62))',
          boxShadow:
            'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_42%,rgba(34,211,238,0.14),transparent_65%)]" />
        <div
          className={cn(
            'relative z-[1] h-full w-full snap-y snap-mandatory overflow-x-hidden overflow-y-auto scroll-smooth',
            'overscroll-y-contain',
          )}
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="snap-start snap-always min-h-[100dvh]">
            <StanzaFan />
          </div>
          <div className="snap-start snap-always min-h-[100dvh]">
            <StanzaOrbitRing />
          </div>
          <div className="snap-start snap-always min-h-[100dvh]">
            <StanzaWaterfall />
          </div>
          <div className="snap-start snap-always min-h-[100dvh]">
            <StanzaFaceOff />
          </div>
          <div className="snap-start snap-always min-h-[100dvh]">
            <StanzaFullDeckGrid />
          </div>
        </div>
      </div>
    </section>
  )
}

export function MorbiusInfoSection() {
  const reduced = usePrefersReducedMotion()
  if (reduced) {
    return <MorbiusCardsReduced />
  }
  return <MorbiusCardsSnapTheater />
}
