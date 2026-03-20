"use client"

import { type ComponentPropsWithoutRef, type ReactNode } from "react"

import { cn } from "@/lib/utils"

export type MarqueeEdgeFade = boolean | "soft" | "medium" | "strong"

interface MarqueeProps extends ComponentPropsWithoutRef<"div"> {
  className?: string
  reverse?: boolean
  pauseOnHover?: boolean
  children: ReactNode
  vertical?: boolean
  repeat?: number
  /**
   * Horizontal (or vertical) edge mask.
   * - `false`: none
   * - `true` / `"strong"`: narrow band (legacy Magic UI–style)
   * - `"medium"`: wider readable center, smooth ramps (good for text cards)
   * - `"soft"`: gentle vignette at edges only
   */
  fadeEdges?: MarqueeEdgeFade
}

/* True 0 alpha at edges: rgba avoids transparent↔black interpolation haze */
const EDGE_FADE_H_STRONG =
  "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 6%, rgba(0,0,0,1) 45%, rgba(0,0,0,1) 55%, rgba(0,0,0,0) 94%, rgba(0,0,0,0) 100%)"
const EDGE_FADE_V_STRONG =
  "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 6%, rgba(0,0,0,1) 45%, rgba(0,0,0,1) 55%, rgba(0,0,0,0) 94%, rgba(0,0,0,0) 100%)"

/** ~60% width fully opaque; noticeable edge feather, still readable */
const EDGE_FADE_H_MEDIUM =
  "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 4%, rgba(0,0,0,1) 20%, rgba(0,0,0,1) 80%, rgba(0,0,0,0.5) 96%, rgba(0,0,0,0) 100%)"
const EDGE_FADE_V_MEDIUM =
  "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 4%, rgba(0,0,0,1) 20%, rgba(0,0,0,1) 80%, rgba(0,0,0,0.5) 96%, rgba(0,0,0,0) 100%)"

/** ~88% width opaque; light edge feather */
const EDGE_FADE_H_SOFT =
  "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 6%, rgba(0,0,0,1) 94%, rgba(0,0,0,0) 100%)"
const EDGE_FADE_V_SOFT =
  "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 6%, rgba(0,0,0,1) 94%, rgba(0,0,0,0) 100%)"

function edgeMaskFor(
  vertical: boolean,
  fade: MarqueeEdgeFade | undefined
): { maskImage: string; WebkitMaskImage: string } | null {
  if (fade === false) return null
  const mode = fade === true || fade === undefined ? "strong" : fade
  const h =
    mode === "strong"
      ? EDGE_FADE_H_STRONG
      : mode === "medium"
        ? EDGE_FADE_H_MEDIUM
        : EDGE_FADE_H_SOFT
  const v =
    mode === "strong"
      ? EDGE_FADE_V_STRONG
      : mode === "medium"
        ? EDGE_FADE_V_MEDIUM
        : EDGE_FADE_V_SOFT
  const mask = vertical ? v : h
  return { maskImage: mask, WebkitMaskImage: mask }
}

export function Marquee({
  className,
  reverse = false,
  pauseOnHover = false,
  children,
  vertical = false,
  repeat = 4,
  fadeEdges = true,
  style,
  ...props
}: MarqueeProps) {
  const mask = edgeMaskFor(vertical, fadeEdges)

  return (
    <div
      {...props}
      style={{
        ...(mask ?? {}),
        ...style,
      }}
      className={cn(
        "group flex gap-(--gap) overflow-hidden p-2 [--duration:40s] [--gap:1rem]",
        {
          "flex-row": !vertical,
          "flex-col": vertical,
        },
        className
      )}
    >
      {Array.from({ length: repeat }, (_, i) => (
        <div
          key={i}
          className={cn("flex shrink-0 justify-around gap-(--gap)", {
            "animate-marquee flex-row": !vertical,
            "animate-marquee-vertical flex-col": vertical,
            "group-hover:[animation-play-state:paused]": pauseOnHover,
            "[animation-direction:reverse]": reverse,
          })}
        >
          {children}
        </div>
      ))}
    </div>
  )
}
