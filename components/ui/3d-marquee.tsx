"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Theme } from "@/lib/theme";

/** Seeded RNG for deterministic shuffle (Mulberry32). */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic shuffle so each row/col gets a mixed order; same input => same layout. */
function shuffleImages<T>(arr: readonly T[], seed: number): T[] {
  const out = [...arr];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const ThreeDMarquee = ({
  images,
  className,
}: {
  images: string[];
  className?: string;
}) => {
  // Shuffle so columns/rows aren't the same sequence, then split into 4 columns
  const shuffled = useMemo(
    () => shuffleImages(images, 31),
    [images]
  );
  const chunkSize = Math.ceil(shuffled.length / 4);
  const chunks = Array.from({ length: 4 }, (_, colIndex) => {
    const start = colIndex * chunkSize;
    return shuffled.slice(start, start + chunkSize);
  });
  return (
    <div
      className={cn(
        "mx-auto block h-[400px] sm:h-[300px] md:h-[500px] overflow-hidden border border-cyan-500 rounded-xl relative box-border",
        className,
      )}
      style={{
        ...Theme.panel.base,
        padding: '36px',
        // Shadow on top, glow on bottom (recessed well); larger offset/blur = deeper z-height
        boxShadow: [
          'inset 12px 24px 36px rgba(0, 0, 0, 0.96)',
          'inset 0 12px 64px rgb(11, 93, 112)',
          'inset 1px 128px 228px rgb(0, 238, 238)',
          '1px 3px 4px rgba(11, 190, 230, 0.39)',
        ].join(', '),
      }}
    >
      {/* Content inset so the theme’s inset shadow band is visible */}
      <div className="absolute inset-0 flex items-center justify-center p-[0px] box-border">
        <div className="relative w-full h-full min-h-0">
          <div
            className="absolute inset-0 z-10 pointer-events-none rounded-lg"
            style={{ background: 'rgba(32, 167, 230, 0.15)' }}
            aria-hidden
          />
          <div className="relative flex size-full min-h-0 items-center justify-center z-0">
            <div
              className="absolute shrink-0"
              style={{ width: '2400px', height: '1200px', transform: 'scale(1) translate(-70%, -50%)', transformOrigin: '0% 0%', top: '0%', left: '70%' }}
            >
          <div
            style={{
              transform: "rotateX(55deg) rotateY(0deg) rotateZ(-45deg)",
              transformStyle: "preserve-3d",
            }}
            className="relative top-1 grid size-full origin-top grid-cols-8 gap-8"
          >
            {chunks.map((subarray, colIndex) => {
              // Double the images so the loop is seamless: animate -50% = one full set scrolls off,
              // then instantly reset to 0 — the doubled tail looks identical to the head.
              const doubled = [...subarray, ...subarray];
              const goUp = colIndex % 2 === 0;
              return (
                <motion.div
                  key={colIndex + "marquee"}
                  initial={{ y: goUp ? "0%" : "-50%" }}
                  animate={{ y: goUp ? "-50%" : "0%" }}
                  transition={{
                    duration: 18 + colIndex * 4,   // stagger speeds so columns feel independent
                    repeat: Infinity,
                    repeatType: "loop",
                    ease: "linear",
                  }}
                  className="flex flex-col items-start gap-4"
                >
                  <GridLineVertical className="-left-4" offset="50px" />
                  {doubled.map((image, imageIndex) => (
                    <div className="relative" key={imageIndex + image}>
                      <GridLineHorizontal className="-top-4" offset="10px" />
                      <motion.img
                        whileHover={{ y: -10 }}
                        transition={{ duration: 0.6, ease: "easeInOut" }}
                        src={image}
                        alt={`Image ${imageIndex + 1}`}
                        className="aspect-auto rounded-2xl object-cover ring ring-red-950/50 hover:shadow-2xl"
                        width={970}
                        height={700}
                      />
                    </div>
                  ))}
                </motion.div>
              );
            })}
          </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const GridLineHorizontal = ({
  className,
  offset,
}: {
  className?: string;
  offset?: string;
}) => {
  return (
    <div
      style={
        {
          "--background": "#ffffff",
          "--color": "rgba(0, 0, 0, 0.89)",
          "--height": "1px",
          "--width": "5px",
          "--fade-stop": "20%",
          "--offset": offset || "200px", //-100px if you want to keep the line inside
          "--color-dark": "rgba(21, 15, 15, 0.39)",
          maskComposite: "exclude",
        } as React.CSSProperties
      }
      className={cn(
        "absolute left-[calc(var(--offset)/2*-1)] h-[var(--height)] w-[calc(100%+var(--offset))]",
        "bg-[linear-gradient(to_right,var(--color),var(--color)_50%,transparent_0,transparent)]",
        "[background-size:var(--width)_var(--height)]",
        "[mask:linear-gradient(to_left,var(--background)_var(--fade-stop),transparent),_linear-gradient(to_right,var(--background)_var(--fade-stop),transparent),_linear-gradient(black,black)]",
        "[mask-composite:exclude]",
        "z-30",
        "dark:bg-[linear-gradient(to_right,var(--color-dark),var(--color-dark)_50%,transparent_0,transparent)]",
        className,
      )}
    ></div>
  );
};

const GridLineVertical = ({
  className,
  offset,
}: {
  className?: string;
  offset?: string;
}) => {
  return (
    <div
      style={
        {
          "--background": "#ffffff",
          "--color": "rgba(93, 28, 205, 0.65)",
          "--height": "48px",
          "--width": "2px",
          "--fade-stop": "90%",
          "--offset": offset || "150px", //-100px if you want to keep the line inside
          "--color-dark": "rgba(9, 78, 217, 0.75)",
          maskComposite: "exclude",
        } as React.CSSProperties
      }
      className={cn(
        "absolute top-[calc(var(--offset)/2*-1)] h-[calc(100%+var(--offset))] w-[var(--width)]",
        "bg-[linear-gradient(to_bottom,var(--color),var(--color)_50%,transparent_0,transparent)]",
        "[background-size:var(--width)_var(--height)]",
        "[mask:linear-gradient(to_top,var(--background)_var(--fade-stop),transparent),_linear-gradient(to_bottom,var(--background)_var(--fade-stop),transparent),_linear-gradient(black,black)]",
        "[mask-composite:exclude]",
        "z-30",
        "dark:bg-[linear-gradient(to_bottom,var(--color-dark),var(--color-dark)_50%,transparent_0,transparent)]",
        className,
      )}
    ></div>
  );
};
