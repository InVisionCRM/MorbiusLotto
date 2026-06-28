"use client";

import { cn } from "@/lib/utils";
import React, { useEffect, useRef, useState } from "react";

export type QuoteCardItem = {
  quote: string;
  name: string;
  title: string;
};

export type ImageCardItem = {
  /** Optional image URL; when omitted, card is text-only (no image). */
  src?: string;
  name: string;
  /** Optional second line (e.g. value + duration). */
  subtitle?: string;
  href?: string;
};

export type WinCardItem = {
  /** Stable id for React keys. */
  id?: string;
  /** Game name, e.g. "Plinko". */
  game: string;
  /** Preformatted win amount, e.g. "12,500 MORBIUS". */
  amount: string;
  /** Player label, e.g. "0x12…ab". */
  player: string;
  /** Optional relative time, e.g. "2m ago". */
  timeAgo?: string;
  /** Optional thumbnail node (e.g. game art). Falls back to `accent`. */
  art?: React.ReactNode;
  /** Optional accent color used when no art is provided. */
  accent?: string;
  /** Optional link target. */
  href?: string;
};

export const InfiniteMovingCards = React.memo(function InfiniteMovingCards({
  items,
  variant = "quote",
  direction = "left",
  speed = "fast",
  pixelsPerSecond,
  pauseOnHover = true,
  className,
}: {
  items: QuoteCardItem[] | ImageCardItem[] | WinCardItem[];
  variant?: "quote" | "image" | "win";
  direction?: "left" | "right";
  speed?: "fast" | "normal" | "slow";
  /**
   * Constant-velocity mode: when set, the loop always moves at this many
   * CSS px/second regardless of how many cards there are or the screen size,
   * by measuring the row width and deriving the duration. Falls back to the
   * fixed `speed` durations until the first measurement lands. This keeps the
   * ticker feeling identical on mobile and desktop (the fixed-time `speed`
   * mode crawls on long lists / narrow screens).
   */
  pixelsPerSecond?: number;
  pauseOnHover?: boolean;
  className?: string;
}) {
  const fallbackDuration = speed === "fast" ? "20s" : speed === "normal" ? "40s" : "80s";
  const animDirection = direction === "left" ? "forwards" : "reverse";

  const containerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLUListElement>(null);

  // Constant-velocity + repeat-to-fill mode (used by the win ticker). When on,
  // the items are repeated enough times that the row is always at least 2× the
  // container width, so each -50% half fully covers the viewport — no empty gap
  // and a seamless loop even with only one or two real cards. Duration is then
  // derived from the measured width so the speed (px/sec) stays constant.
  const fill = typeof pixelsPerSecond === "number" && pixelsPerSecond > 0;
  const [copies, setCopies] = useState(2);
  const [measuredDuration, setMeasuredDuration] = useState<string | null>(null);

  // Even, ≥2, capped so a tiny list can't explode the DOM.
  const reps = fill ? Math.min(40, Math.max(2, copies - (copies % 2))) : 2;
  const list = Array.from({ length: reps }, () => items).flat();

  useEffect(() => {
    if (!fill) {
      setMeasuredDuration(null);
      return;
    }
    const row = rowRef.current;
    const container = containerRef.current;
    if (!row || !container) return;
    const measure = () => {
      const total = row.scrollWidth;
      const oneSet = total / reps;
      const containerW = container.clientWidth;
      if (oneSet <= 0 || containerW <= 0) return;
      // Repeat until the whole row is ≥ 2× the container (each half covers it).
      let need = Math.min(40, Math.max(2, Math.ceil((containerW * 2) / oneSet)));
      if (need % 2 === 1) need += 1;
      if (need !== reps) {
        setCopies(need); // re-measure after the re-render with the new count
        return;
      }
      setMeasuredDuration(`${(total / 2 / pixelsPerSecond!).toFixed(2)}s`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(row);
    return () => ro.disconnect();
  }, [fill, pixelsPerSecond, reps, items.length]);

  const duration = measuredDuration ?? fallbackDuration;

  return (
    <div
      ref={containerRef}
      className={cn(
        "scroller relative z-20 max-w-7xl overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_20%,white_80%,transparent)]",
        className,
      )}
      style={
        {
          "--animation-duration": duration,
          "--animation-direction": animDirection,
        } as React.CSSProperties
      }
    >
      <ul
        ref={rowRef}
        className={cn(
          "flex w-max min-w-full shrink-0 flex-nowrap gap-4 py-4 md:gap-6 md:py-6 animate-scroll",
          pauseOnHover && "hover:[animation-play-state:paused]",
        )}
      >
        {list.map((item, idx) => (
          <li
            className={cn(
              "relative shrink-0 rounded-xl border overflow-hidden",
              variant === "win"
                ? "h-[72px] min-w-[210px] w-auto border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.95),rgba(11,16,26,0.92))]"
                : "flex flex-col h-[200px] sm:h-[240px] md:h-[280px] lg:h-[320px]",
              variant === "quote" &&
                "min-w-[200px] max-w-[320px] md:min-w-[280px] md:max-w-[420px] w-auto px-3 py-2 md:px-6 md:py-4 border-zinc-200 bg-[linear-gradient(180deg,#fafafa,#f5f5f5)] dark:border-zinc-700 dark:bg-[linear-gradient(180deg,#27272a,#18181b)]",
              variant === "image" &&
                "min-w-[200px] max-w-[320px] md:min-w-[280px] md:max-w-[400px] w-auto border-cyan-500/20 bg-[linear-gradient(180deg,rgba(15,23,42,0.95),rgba(15,23,42,0.85))] dark:border-cyan-500/20",
            )}
            key={idx}
          >
            {variant === "win" ? (
              (() => {
                const w = item as WinCardItem;
                const content = (
                  <div className="flex h-full items-center gap-3 px-3">
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                      {w.art ?? (w.accent ? <div className="h-full w-full" style={{ background: w.accent }} /> : null)}
                    </div>
                    <div className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {w.game}
                      </span>
                      <span className="truncate text-[14px] font-extrabold tabular-nums text-amber-300">
                        {w.amount}
                      </span>
                      <span className="truncate text-[10px] text-slate-500">
                        {w.player}
                        {w.timeAgo ? ` · ${w.timeAgo}` : ""}
                      </span>
                    </div>
                  </div>
                );
                return w.href ? (
                  <a href={w.href} className="block h-full w-full transition-colors hover:bg-white/[0.03]">
                    {content}
                  </a>
                ) : (
                  content
                );
              })()
            ) : variant === "image" ? (
              (() => {
                const imageItem = item as ImageCardItem;
                const content = (
                  <div className="flex flex-col h-full min-h-0 min-w-0">
                    {imageItem.src ? (
                      <>
                        <div className="relative w-full h-[120px] sm:h-[150px] md:h-[180px] lg:h-[220px] bg-black/30 shrink-0 overflow-hidden">
                          <img
                            src={imageItem.src}
                            alt={imageItem.name}
                            className="w-full h-full object-cover object-center"
                          />
                        </div>
                        <div className="px-3 py-2 md:px-4 md:py-3 text-center shrink-0 min-h-0 flex-1 flex items-center justify-center min-w-0">
                          <span className="text-sm md:text-base lg:text-lg font-medium text-white break-words line-clamp-3">
                            {imageItem.name}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-1 flex-col justify-center px-3 py-2 md:px-4 md:py-3 min-h-0 overflow-hidden min-w-0">
                        <span className="text-sm md:text-base lg:text-lg font-semibold text-cyan-300/95 leading-tight break-words">
                          {imageItem.name}
                        </span>
                        {imageItem.subtitle && (
                          <span className="text-xs md:text-sm text-white/60 mt-0.5 leading-tight tabular-nums break-words line-clamp-2">
                            {imageItem.subtitle}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
                return imageItem.href ? (
                  <a href={imageItem.href} className="block h-full w-full hover:bg-white/[0.03] transition-colors">
                    {content}
                  </a>
                ) : (
                  content
                );
              })()
            ) : (
              <blockquote className="flex flex-col h-full min-h-0 overflow-hidden">
                <div
                  aria-hidden="true"
                  className="user-select-none pointer-events-none absolute -top-0.5 -left-0.5 -z-1 h-[calc(100%_+_4px)] w-[calc(100%_+_4px)]"
                ></div>
                <span className="relative z-20 text-xs md:text-sm leading-[1.5] md:leading-[1.6] font-normal text-neutral-800 dark:text-gray-100 line-clamp-3 flex-1 min-h-0">
                  {(item as QuoteCardItem).quote}
                </span>
                <div className="relative z-20 mt-1 md:mt-2 flex flex-row items-center shrink-0">
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[10px] md:text-sm leading-[1.6] font-normal text-neutral-500 dark:text-gray-400 truncate">
                      {(item as QuoteCardItem).name}
                    </span>
                    <span className="text-[10px] md:text-sm leading-[1.6] font-normal text-neutral-500 dark:text-gray-400 truncate">
                      {(item as QuoteCardItem).title}
                    </span>
                  </span>
                </div>
              </blockquote>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
});
