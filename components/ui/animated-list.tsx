"use client"

import React, { ComponentPropsWithoutRef, useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion, type MotionProps } from "motion/react"

import { cn } from "@/lib/utils"

export function AnimatedListItem({ children }: { children: React.ReactNode }) {
  const animations: MotionProps = {
    initial: { scale: 0.85, opacity: 0, y: -10 },
    animate: { scale: 1, opacity: 1, y: 0 },
    exit: { scale: 0.85, opacity: 0, y: -10 },
    transition: { type: "spring", stiffness: 380, damping: 42 },
  }

  return (
    <motion.div {...animations} className="mx-auto w-full origin-top">
      {children}
    </motion.div>
  )
}

export interface AnimatedListProps extends ComponentPropsWithoutRef<"div"> {
  children: React.ReactNode
  delay?: number
  /** When true, after the last item appears, the sequence resets (decorative feeds). */
  loop?: boolean
}

export function AnimatedList({
  children,
  className,
  delay = 1000,
  loop = false,
  ...props
}: AnimatedListProps) {
  const [index, setIndex] = useState(0)
  const keyedChildren = useMemo(
    () =>
      React.Children.toArray(children).map((item, originalIndex) => {
        const stableKey =
          React.isValidElement(item) && item.key != null && item.key !== ""
            ? String(item.key)
            : `animated-list-static-${originalIndex}`
        return { item, stableKey }
      }),
    [children]
  )

  useEffect(() => {
    if (keyedChildren.length <= 1) return

    const id = window.setInterval(() => {
      setIndex((prev) => {
        if (prev >= keyedChildren.length - 1) {
          return loop ? 0 : prev
        }
        return prev + 1
      })
    }, delay)

    return () => window.clearInterval(id)
  }, [keyedChildren.length, delay, loop])

  const itemsToShow = useMemo(() => {
    const slice = keyedChildren.slice(0, index + 1)
    return [...slice].reverse()
  }, [index, keyedChildren])

  return (
    <div className={cn("flex flex-col items-center gap-4", className)} {...props}>
      <AnimatePresence initial={false}>
        {itemsToShow.map(({ item, stableKey }) => {
          return (
            <AnimatedListItem key={stableKey}>
              {item}
            </AnimatedListItem>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

AnimatedList.displayName = "AnimatedList"
