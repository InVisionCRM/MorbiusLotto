"use client";

import { cn } from "@/lib/utils";
import React, { useEffect, useState } from "react";

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

export const InfiniteMovingCards = ({
  items,
  variant = "quote",
  direction = "left",
  speed = "fast",
  pauseOnHover = true,
  className,
}: {
  items: QuoteCardItem[] | ImageCardItem[];
  variant?: "quote" | "image";
  direction?: "left" | "right";
  speed?: "fast" | "normal" | "slow";
  pauseOnHover?: boolean;
  className?: string;
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const scrollerRef = React.useRef<HTMLUListElement>(null);

  useEffect(() => {
    addAnimation();
  }, []);
  const [start, setStart] = useState(false);
  function addAnimation() {
    if (containerRef.current && scrollerRef.current) {
      const scrollerContent = Array.from(scrollerRef.current.children);

      scrollerContent.forEach((item) => {
        const duplicatedItem = item.cloneNode(true);
        if (scrollerRef.current) {
          scrollerRef.current.appendChild(duplicatedItem);
        }
      });

      getDirection();
      getSpeed();
      setStart(true);
    }
  }
  const getDirection = () => {
    if (containerRef.current) {
      if (direction === "left") {
        containerRef.current.style.setProperty(
          "--animation-direction",
          "forwards",
        );
      } else {
        containerRef.current.style.setProperty(
          "--animation-direction",
          "reverse",
        );
      }
    }
  };
  const getSpeed = () => {
    if (containerRef.current) {
      if (speed === "fast") {
        containerRef.current.style.setProperty("--animation-duration", "20s");
      } else if (speed === "normal") {
        containerRef.current.style.setProperty("--animation-duration", "40s");
      } else {
        containerRef.current.style.setProperty("--animation-duration", "80s");
      }
    }
  };
  return (
    <div
      ref={containerRef}
      className={cn(
        "scroller relative z-20 max-w-7xl overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_20%,white_80%,transparent)]",
        className,
      )}
    >
      <ul
        ref={scrollerRef}
        className={cn(
          "flex w-max min-w-full shrink-0 flex-nowrap gap-4 py-4 md:gap-6 md:py-6",
          start && "animate-scroll",
          pauseOnHover && "hover:[animation-play-state:paused]",
        )}
      >
        {items.map((item, idx) => (
          <li
            className={cn(
              "relative shrink-0 rounded-xl border overflow-hidden flex flex-col",
              "h-[200px] sm:h-[240px] md:h-[280px] lg:h-[320px]",
              variant === "quote"
                ? "min-w-[200px] max-w-[320px] md:min-w-[280px] md:max-w-[420px] w-auto px-3 py-2 md:px-6 md:py-4 border-zinc-200 bg-[linear-gradient(180deg,#fafafa,#f5f5f5)] dark:border-zinc-700 dark:bg-[linear-gradient(180deg,#27272a,#18181b)]"
                : "min-w-[200px] max-w-[320px] md:min-w-[280px] md:max-w-[400px] w-auto border-cyan-500/20 bg-[linear-gradient(180deg,rgba(15,23,42,0.95),rgba(15,23,42,0.85))] dark:border-cyan-500/20",
            )}
            key={variant === "image" ? (item as ImageCardItem).name + idx : (item as QuoteCardItem).name + idx}
          >
            {variant === "image" ? (
              (() => {
                const imageItem = item as ImageCardItem;
                const content = (
                  <div className="flex flex-col h-full min-h-0 min-w-0">
                    {imageItem.src ? (
                      <>
                        <div className="relative w-full h-[120px] sm:h-[150px] md:h-[180px] lg:h-[220px] bg-black/30 shrink-0 overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
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
                ) : content;
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
};
