"use client";

import { cn } from "@/lib/utils";
import Image from "next/image";
import React, { useEffect, useState } from "react";

export type QuoteCardItem = {
  quote: string;
  name: string;
  title: string;
};

export type ImageCardItem = {
  src?: string;
  name: string;
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
          "flex w-max min-w-full shrink-0 flex-nowrap gap-4 py-4",
          start && "animate-scroll",
          pauseOnHover && "hover:[animation-play-state:paused]",
        )}
      >
        {items.map((item, idx) => (
          <li
            className={cn(
              "relative shrink-0 rounded-2xl border border-b-0 overflow-hidden",
              variant === "quote"
                ? "w-[350px] max-w-full px-8 py-6 md:w-[450px] border-zinc-200 bg-[linear-gradient(180deg,#fafafa,#f5f5f5)] dark:border-zinc-700 dark:bg-[linear-gradient(180deg,#27272a,#18181b)]"
                : "w-[280px] md:w-[320px] border-cyan-500/30 bg-gradient-to-b from-slate-950 to-slate-900 dark:border-cyan-500/30",
            )}
            key={variant === "image" ? (item as ImageCardItem).name + idx : (item as QuoteCardItem).name + idx}
          >
            {variant === "image" ? (
              (() => {
                const imageItem = item as ImageCardItem;
                const content = (
                  <div className="flex flex-col h-full">
                    {imageItem.src ? (
                      <>
                        <div className="relative aspect-[4/3] w-full bg-black/40">
                          <Image
                            src={imageItem.src}
                            alt={imageItem.name}
                            fill
                            className="object-cover object-center"
                            sizes="(max-width: 768px) 280px, 320px"
                          />
                        </div>
                        <div className="px-4 py-3 text-center">
                          <span className="text-sm font-semibold text-white">
                            {imageItem.name}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-1 min-h-[140px] items-center justify-center p-6">
                        <span className="text-xl md:text-2xl font-bold text-cyan-300/90 text-center">
                          {imageItem.name}
                        </span>
                      </div>
                    )}
                  </div>
                );
                return imageItem.href ? (
                  <a href={imageItem.href} className="block h-full w-full">
                    {content}
                  </a>
                ) : content;
              })()
            ) : (
              <blockquote>
                <div
                  aria-hidden="true"
                  className="user-select-none pointer-events-none absolute -top-0.5 -left-0.5 -z-1 h-[calc(100%_+_4px)] w-[calc(100%_+_4px)]"
                ></div>
                <span className="relative z-20 text-sm leading-[1.6] font-normal text-neutral-800 dark:text-gray-100">
                  {(item as QuoteCardItem).quote}
                </span>
                <div className="relative z-20 mt-6 flex flex-row items-center">
                  <span className="flex flex-col gap-1">
                    <span className="text-sm leading-[1.6] font-normal text-neutral-500 dark:text-gray-400">
                      {(item as QuoteCardItem).name}
                    </span>
                    <span className="text-sm leading-[1.6] font-normal text-neutral-500 dark:text-gray-400">
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
