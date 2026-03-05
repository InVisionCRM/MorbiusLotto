'use client'

import { useMemo } from 'react'
import Image from 'next/image'
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
} from 'motion/react'

// ── Asset sources ──────────────────────────────────────────────

const chipSrcs = [
  '/PokerChips/greenpokerchip005.png',
  '/PokerChips/redpokerchip015.png',
  '/PokerChips/cyanpokerchip020.png',
  '/PokerChips/blackpokerchip000.png',
  '/PokerChips/bluepokerchip010.png',
]

const cardSrcs = [
  '/BlackJack/Cards/PNG/AS.png',
  '/BlackJack/Cards/PNG/KH.png',
  '/BlackJack/Cards/PNG/QS.png',
  '/BlackJack/Cards/PNG/JD.png',
  '/BlackJack/Cards/PNG/AC.png',
  '/BlackJack/Cards/PNG/KD.png',
  '/BlackJack/Cards/PNG/QH.png',
  '/BlackJack/Cards/PNG/JS.png',
  '/BlackJack/Cards/PNG/AH.png',
  '/BlackJack/Cards/PNG/AD.png',
  '/BlackJack/Cards/PNG/KC.png',
  '/BlackJack/Cards/PNG/QC.png',
]

// ── Deterministic pseudo-random (no hydration mismatch) ────────

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

// ── Item config types ──────────────────────────────────────────

interface ParallaxItemConfig {
  id: string
  src: string
  type: 'chip' | 'card'
  x: number // percent from left
  y: number // percent from top
  baseScale: number
  baseRotation: number
  baseOpacity: number
  scrollMultiplier: number
  horizontalDrift: number
  rotateXRange: [number, number]
  rotateYRange: [number, number]
  spinDuration: number
  spinReverse: boolean
  displaySize: number // px
}

interface LayerConfig {
  depth: number
  perspective: number
  items: ParallaxItemConfig[]
}

// ── Layer generation ───────────────────────────────────────────

interface LayerGenParams {
  count: number
  srcs: string[]
  type: 'chip' | 'card'
  scrollMultiplier: number
  baseOpacity: number
  scaleRange: [number, number]
  horizontalDriftRange: [number, number]
  rotateIntensity: number
  spinDurationRange: [number, number]
  xBands: [number, number][]
  ySpread: [number, number]
  displaySize: number
  prefix: string
  seed: number
}

function generateLayerItems(params: LayerGenParams): ParallaxItemConfig[] {
  const rand = seededRandom(params.seed)
  const items: ParallaxItemConfig[] = []

  for (let i = 0; i < params.count; i++) {
    const band = params.xBands[i % params.xBands.length]
    const x = lerp(band[0], band[1], rand())
    const y = lerp(params.ySpread[0], params.ySpread[1], rand())
    const scale = lerp(params.scaleRange[0], params.scaleRange[1], rand())
    const rotation = rand() * 360
    const drift = lerp(params.horizontalDriftRange[0], params.horizontalDriftRange[1], rand())
    const intensity = params.rotateIntensity
    const rxSign = rand() > 0.5 ? 1 : -1
    const rySign = rand() > 0.5 ? 1 : -1
    const spinDur = lerp(params.spinDurationRange[0], params.spinDurationRange[1], rand())

    items.push({
      id: `${params.prefix}-${i}`,
      src: params.srcs[i % params.srcs.length],
      type: params.type,
      x,
      y,
      baseScale: scale,
      baseRotation: rotation,
      baseOpacity: params.baseOpacity,
      scrollMultiplier: params.scrollMultiplier,
      horizontalDrift: drift,
      rotateXRange: [rxSign * intensity * -1, rxSign * intensity],
      rotateYRange: [rySign * intensity * -1, rySign * intensity],
      spinDuration: spinDur,
      spinReverse: rand() > 0.5,
      displaySize: params.displaySize,
    })
  }
  return items
}

function generateAllLayers(): LayerConfig[] {
  return [
    // Layer 0: Far background — small faint cards
    {
      depth: 0.1,
      perspective: 1000,
      items: generateLayerItems({
        count: 20,
        srcs: cardSrcs,
        type: 'card',
        scrollMultiplier: 0.15,
        baseOpacity: 0.03,
        scaleRange: [0.4, 0.6],
        horizontalDriftRange: [-30, 30],
        rotateIntensity: 5,
        spinDurationRange: [28, 42],
        xBands: [[2, 16], [84, 98]],
        ySpread: [0, 100],
        displaySize: 50,
        prefix: 'far',
        seed: 11111,
      }),
    },
    // Layer 1: Mid background — medium cards
    {
      depth: 0.3,
      perspective: 2200,
      items: generateLayerItems({
        count: 15,
        srcs: cardSrcs.slice(4),
        type: 'card',
        scrollMultiplier: 0.35,
        baseOpacity: 0.09,
        scaleRange: [0.1, 1.0],
        horizontalDriftRange: [-50, 50],
        rotateIntensity: 10,
        spinDurationRange: [22, 36],
        xBands: [[5, 22], [78, 95]],
        ySpread: [5, 95],
        displaySize: 65,
        prefix: 'midbg',
        seed: 22222,
      }),
    },
    // Layer 2: Middle — main poker chips
    {
      depth: 0.5,
      perspective: 1600,
      items: generateLayerItems({
        count: 13,
        srcs: chipSrcs,
        type: 'chip',
        scrollMultiplier: 0.6,
        baseOpacity: 0.13,
        scaleRange: [0.3, 1.0],
        horizontalDriftRange: [-40, 40],
        rotateIntensity: 15,
        spinDurationRange: [20, 30],
        xBands: [[0, 12], [88, 100]],
        ySpread: [5, 90],
        displaySize: 120,
        prefix: 'mid',
        seed: 33333,
      }),
    },
    // Layer 3: Mid foreground — larger cards with more movement
    {
      depth: 0.7,
      perspective: 1200,
      items: generateLayerItems({
        count: 10,
        srcs: cardSrcs.slice(0, 4),
        type: 'card',
        scrollMultiplier: 0.85,
        baseOpacity: 0.15,
        scaleRange: [0.1, 1.2],
        horizontalDriftRange: [-70, 70],
        rotateIntensity: 40,
        spinDurationRange: [16, 26],
        xBands: [[3, 18], [82, 97]],
        ySpread: [10, 85],
        displaySize: 75,
        prefix: 'midfg',
        seed: 44444,
      }),
    },
    // Layer 4: Near foreground — large chips that rush past
    {
      depth: 0.9,
      perspective: 800,
      items: generateLayerItems({
        count: 8,
        srcs: chipSrcs.slice(0, 3),
        type: 'chip',
        scrollMultiplier: 1.3,
        baseOpacity: 0.20,
        scaleRange: [0.5, 1.5],
        horizontalDriftRange: [-100, 100],
        rotateIntensity: 50,
        spinDurationRange: [14, 22],
        xBands: [[0, 10], [90, 100]],
        ySpread: [15, 80],
        displaySize: 150,
        prefix: 'near',
        seed: 55555,
      }),
    },
  ]
}

// ── ParallaxItem ───────────────────────────────────────────────

const springConfig = { stiffness: 80, damping: 25, mass: 1.2 }
const opacitySpring = { stiffness: 40, damping: 18 }

function ParallaxItem({ config }: { config: ParallaxItemConfig }) {
  const { scrollYProgress } = useScroll()

  // Vertical parallax — different speeds create depth
  const rawY = useTransform(
    scrollYProgress,
    [0, 1],
    [0, (1 - config.scrollMultiplier) * -2000]
  )
  const y = useSpring(rawY, springConfig)

  // Horizontal drift — diagonal movement paths
  const rawX = useTransform(
    scrollYProgress,
    [0, 0.3, 0.7, 1],
    [0, config.horizontalDrift * 0.6, config.horizontalDrift, config.horizontalDrift * 0.7]
  )
  const x = useSpring(rawX, springConfig)

  // 3D rotations driven by scroll
  const rawRotateX = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    [config.rotateXRange[0], 0, config.rotateXRange[1]]
  )
  const rotateX = useSpring(rawRotateX, springConfig)

  const rawRotateY = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    [config.rotateYRange[0], 0, config.rotateYRange[1]]
  )
  const rotateY = useSpring(rawRotateY, springConfig)

  // Scale breathing — grow mid-page, shrink at edges
  const rawScale = useTransform(
    scrollYProgress,
    [0, 0.4, 0.6, 1],
    [
      config.baseScale * 0.85,
      config.baseScale * 1.12,
      config.baseScale * 1.08,
      config.baseScale * 0.9,
    ]
  )
  const scale = useSpring(rawScale, springConfig)

  // Per-item opacity zone — most visible near its Y position
  const center = config.y / 100
  const zStart = Math.max(0, center - 0.2)
  const zEnd = Math.min(1, center + 0.2)
  const rawOpacity = useTransform(
    scrollYProgress,
    [
      Math.max(0, zStart - 0.1),
      zStart,
      zEnd,
      Math.min(1, zEnd + 0.1),
    ],
    [
      config.baseOpacity * 0.3,
      config.baseOpacity,
      config.baseOpacity,
      config.baseOpacity * 0.3,
    ]
  )
  const opacity = useSpring(rawOpacity, opacitySpring)

  const imgSize = config.type === 'chip' ? 630 : 80

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: `${config.x}%`,
        top: `${config.y}%`,
        x,
        y,
        rotateX,
        rotateY,
        scale,
        opacity,
        willChange: 'transform, opacity',
        transformStyle: 'preserve-3d',
      }}
    >
      <div
        style={{
          animation: `parallax-spin ${config.spinDuration}s linear infinite${config.spinReverse ? ' reverse' : ''}`,
          transform: `rotate(${config.baseRotation}deg)`,
          width: config.displaySize,
          height: config.displaySize,
        }}
      >
        <Image
          src={config.src}
          alt=""
          width={imgSize}
          height={imgSize}
          className="w-full h-full object-contain"
          style={{
            filter:
              'drop-shadow(0 0 8px rgba(6, 182, 212, 0.15)) drop-shadow(0 0 20px rgba(147, 51, 234, 0.1))',
          }}
          aria-hidden
        />
      </div>
    </motion.div>
  )
}

// ── ParallaxLayer ──────────────────────────────────────────────

function ParallaxLayer({
  children,
  perspective,
}: {
  children: React.ReactNode
  perspective: number
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        perspective: `${perspective}px`,
        transformStyle: 'preserve-3d',
        pointerEvents: 'none',
      }}
    >
      {children}
    </div>
  )
}

// ── Root component ─────────────────────────────────────────────

export function FloatingPokerChips() {
  const layers = useMemo(() => generateAllLayers(), [])

  return (
    <>
      <style jsx global>{`
        @keyframes parallax-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .parallax-container * {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
      <div
        className="parallax-container absolute inset-0 overflow-hidden pointer-events-none"
        style={{ zIndex: 0 }}
      >
        {layers.map((layer, layerIndex) => (
          <ParallaxLayer key={layerIndex} perspective={layer.perspective}>
            {layer.items.map((item) => (
              <ParallaxItem key={item.id} config={item} />
            ))}
          </ParallaxLayer>
        ))}
      </div>
    </>
  )
}
