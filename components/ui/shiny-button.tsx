"use client"

import React from "react"
import Link from "next/link"
import { motion, type MotionProps } from "motion/react"

import { cn } from "@/lib/utils"

const animationProps: MotionProps = {
  initial: { "--x": "100%", scale: 0.8 },
  animate: { "--x": "-100%", scale: 1 },
  whileTap: { scale: 0.95 },
  transition: {
    repeat: Infinity,
    repeatType: "loop",
    repeatDelay: 1,
    type: "spring",
    stiffness: 20,
    damping: 15,
    mass: 2,
    scale: {
      type: "spring",
      stiffness: 200,
      damping: 5,
      mass: 0.5,
    },
  },
}

const MotionLink = motion(Link)

/** Valid CSS for alpha stops — `var(--primary)/10%` is invalid in raw CSS and ignores local `--primary`. */
function primaryMix(alphaPercent: number) {
  return `color-mix(in srgb, var(--primary) ${alphaPercent}%, transparent)`
}

interface ShinyButtonProps
  extends
    Omit<React.HTMLAttributes<HTMLElement>, keyof MotionProps>,
    MotionProps {
  children: React.ReactNode
  className?: string
  /** When set, renders as Next.js `Link` (same visuals, valid navigation). */
  href?: string
  type?: React.ButtonHTMLAttributes<HTMLButtonElement>["type"]
}

function ShinyButtonInner({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Light text by default: this app is dark UI but does not set class="dark" on <html>, so dark: never matched and the old black label was nearly invisible. */}
      <span
        className="relative z-20 block size-full font-medium tracking-wide text-white/95 uppercase"
        style={{
          maskImage: `linear-gradient(-75deg, var(--primary) calc(var(--x) + 20%), transparent calc(var(--x) + 30%), var(--primary) calc(var(--x) + 100%))`,
        }}
      >
        {children}
      </span>
      <span
        aria-hidden
        style={{
          mask: "linear-gradient(rgb(0,0,0), rgb(0,0,0)) content-box exclude,linear-gradient(rgb(0,0,0), rgb(0,0,0))",
          WebkitMask:
            "linear-gradient(rgb(0,0,0), rgb(0,0,0)) content-box exclude,linear-gradient(rgb(0,0,0), rgb(0,0,0))",
          backgroundImage: `linear-gradient(-75deg, ${primaryMix(10)} calc(var(--x) + 20%), ${primaryMix(50)} calc(var(--x) + 25%), ${primaryMix(10)} calc(var(--x) + 100%))`,
        }}
        className="pointer-events-none absolute inset-0 z-10 block rounded-[inherit] p-px"
      />
    </>
  )
}

const shellClass = cn(
  "relative inline-flex min-h-[2.75rem] cursor-pointer items-center justify-center rounded-xl border px-8 py-3 text-base font-medium backdrop-blur-xl transition-shadow duration-300 ease-in-out hover:shadow sm:min-h-[3rem] sm:px-10 sm:py-3.5 sm:text-lg",
  /* Same radial for light + dark: without class="dark" on html, dark:* utilities never run */
  "bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--primary)_10%,transparent)_0%,transparent_60%)]",
  "hover:shadow-[0_0_20px_color-mix(in_srgb,var(--primary)_30%,transparent)]",
  "dark:bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--primary)_10%,transparent)_0%,transparent_60%)]",
  "dark:hover:shadow-[0_0_20px_color-mix(in_srgb,var(--primary)_30%,transparent)]"
)

export const ShinyButton = React.forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ShinyButtonProps
>(({ children, className, href, type = "button", ...props }, ref) => {
  const merged = cn(shellClass, className)

  if (href) {
    return (
      <MotionLink
        href={href}
        ref={ref as React.Ref<HTMLAnchorElement>}
        className={merged}
        {...animationProps}
        {...props}
      >
        <ShinyButtonInner>{children}</ShinyButtonInner>
      </MotionLink>
    )
  }

  return (
    <motion.button
      ref={ref as React.Ref<HTMLButtonElement>}
      type={type}
      className={merged}
      {...animationProps}
      {...props}
    >
      <ShinyButtonInner>{children}</ShinyButtonInner>
    </motion.button>
  )
})

ShinyButton.displayName = "ShinyButton"
