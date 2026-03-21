"use client"

import { useEffect, useLayoutEffect, useMemo, useState } from "react"

import { cn } from "@/lib/utils"

type Grid = {
  rows: number
  cols: number
}

const DEFAULT_GRIDS: Record<string, Grid> = {
  "6x4": { rows: 4, cols: 6 },
  "8x8": { rows: 8, cols: 8 },
  "16x16": { rows: 16, cols: 16 },
  "8x3": { rows: 3, cols: 8 },
  "4x6": { rows: 6, cols: 4 },
  "3x8": { rows: 8, cols: 3 },
}

const FALLBACK_GRID: Grid = { rows: 8, cols: 8 }

type PredefinedGridKey = keyof typeof DEFAULT_GRIDS

export interface PixelImageProps {
  src: string
  /** Predefined grid layout (registry default: 8x8). */
  grid?: PredefinedGridKey
  customGrid?: Grid
  grayscaleAnimation?: boolean
  /** When false, tiles use square corners (e.g. full-bleed hero). */
  rounded?: boolean
  /** Keep CSS grayscale on permanently (no color reveal). */
  alwaysGrayscale?: boolean
  /** Duration (ms) for each tile’s opacity fade-in. */
  pixelFadeInDuration?: number
  /** Max random stagger delay (ms) before each tile’s fade starts. */
  maxAnimationDelay?: number
  /** Delay (ms) before grayscale → color (when grayscaleAnimation is true). */
  colorRevealDelay?: number
  className?: string
}

export const PixelImage = ({
  src,
  grid = "8x8",
  grayscaleAnimation = true,
  rounded = true,
  alwaysGrayscale = false,
  pixelFadeInDuration = 100,
  maxAnimationDelay = 200,
  colorRevealDelay = 1500,
  customGrid,
  className,
}: PixelImageProps) => {
  const [isVisible, setIsVisible] = useState(false)
  const [showColor, setShowColor] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  const MIN_GRID = 1
  const MAX_GRID = 32

  const { rows, cols } = useMemo(() => {
    const isValidGrid = (g?: Grid) => {
      if (!g) return false
      const { rows, cols } = g
      return (
        Number.isInteger(rows) &&
        Number.isInteger(cols) &&
        rows >= MIN_GRID &&
        cols >= MIN_GRID &&
        rows <= MAX_GRID &&
        cols <= MAX_GRID
      )
    }

    if (isValidGrid(customGrid)) return customGrid!
    const preset = DEFAULT_GRIDS[grid]
    return preset ?? FALLBACK_GRID
  }, [customGrid, grid])

  useLayoutEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReducedMotion(mq.matches)
    const onChange = () => setReducedMotion(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  /** Opacity transitions often skip on first paint unless we yield after layout (double rAF). */
  useLayoutEffect(() => {
    if (reducedMotion) {
      setIsVisible(true)
      return
    }
    let cancelled = false
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setIsVisible(true)
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(id)
    }
  }, [reducedMotion])

  useEffect(() => {
    if (alwaysGrayscale || !grayscaleAnimation) return
    const t = setTimeout(() => setShowColor(true), colorRevealDelay)
    return () => clearTimeout(t)
  }, [colorRevealDelay, alwaysGrayscale, grayscaleAnimation])

  const pieces = useMemo(() => {
    const total = rows * cols
    return Array.from({ length: total }, (_, index) => {
      const row = Math.floor(index / cols)
      const col = index % cols

      const clipPath = `polygon(
        ${col * (100 / cols)}% ${row * (100 / rows)}%,
        ${(col + 1) * (100 / cols)}% ${row * (100 / rows)}%,
        ${(col + 1) * (100 / cols)}% ${(row + 1) * (100 / rows)}%,
        ${col * (100 / cols)}% ${(row + 1) * (100 / rows)}%
      )`

      const delay = reducedMotion ? 0 : Math.random() * maxAnimationDelay
      return { clipPath, delay }
    })
  }, [rows, cols, maxAnimationDelay, reducedMotion])

  return (
    <div
      className={cn(
        "relative select-none hover:scale-110 transition-transform duration-300 ease-in-out",
        className || "h-72 w-72 md:h-96 md:w-96"
      )}
    >
      {pieces.map((piece, index) => (
        <div
          key={index}
          className="absolute inset-0 overflow-hidden"
          style={{
            clipPath: piece.clipPath,
            WebkitClipPath: piece.clipPath,
            opacity: isVisible ? 1 : 0,
            transition: reducedMotion
              ? "none"
              : `opacity ${pixelFadeInDuration}ms ease-out ${piece.delay}ms`,
          }}
        >
          <img
            src={src}
            alt=""
            className={cn(
              "h-full w-full object-cover",
              rounded && "rounded-[2.5rem]",
              alwaysGrayscale && "grayscale",
              !alwaysGrayscale && grayscaleAnimation && (showColor ? "grayscale-0" : "grayscale")
            )}
            style={{
              transition:
                grayscaleAnimation && !alwaysGrayscale
                  ? `filter ${pixelFadeInDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`
                  : "none",
            }}
            draggable={false}
          />
        </div>
      ))}
    </div>
  )
}
