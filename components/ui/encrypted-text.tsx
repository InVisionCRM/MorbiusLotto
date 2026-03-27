"use client";
import React, { useEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import { cn } from "@/lib/utils";

type EncryptedTextProps = {
  text: string;
  className?: string;
  /**
   * Time in milliseconds between revealing each subsequent real character.
   * Lower is faster. Defaults to 50ms per character.
   */
  revealDelayMs?: number;
  /** Optional custom character set to use for the gibberish effect. */
  charset?: string;
  /**
   * Time in milliseconds between gibberish flips for unrevealed characters.
   * Lower is more jittery. Defaults to 50ms.
   */
  flipDelayMs?: number;
  /** CSS class for styling the encrypted/scrambled characters */
  encryptedClassName?: string;
  /** CSS class for styling the revealed characters */
  revealedClassName?: string;
  /**
   * When true, characters scramble indefinitely without revealing.
   * When switched to false, the reveal animation begins.
   */
  hold?: boolean;
};

const DEFAULT_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-={}[];:,.<>/?";

function generateRandomCharacter(
  charset: string,
  excludeChar?: string,
): string {
  if (!charset) return "";
  if (charset.length === 1) return charset;

  let next = charset.charAt(Math.floor(Math.random() * charset.length));
  if (!excludeChar) return next;

  // Prevent unrevealed characters from "accidentally" showing the final char.
  let guard = 0;
  while (next === excludeChar && guard < 8) {
    next = charset.charAt(Math.floor(Math.random() * charset.length));
    guard += 1;
  }

  if (next === excludeChar) {
    const idx = charset.indexOf(excludeChar);
    if (idx >= 0) {
      const fallback = (idx + 1) % charset.length;
      next = charset.charAt(fallback);
    }
  }

  return next;
}

function generateGibberishPreservingSpaces(
  original: string,
  charset: string,
): string {
  if (!original) return "";
  let result = "";
  for (let i = 0; i < original.length; i += 1) {
    const ch = original[i];
    result += ch === " " ? " " : generateRandomCharacter(charset, ch);
  }
  return result;
}

export const EncryptedText: React.FC<EncryptedTextProps> = ({
  text,
  className,
  revealDelayMs = 1000,
  charset = DEFAULT_CHARSET,
  flipDelayMs = 50,
  encryptedClassName,
  revealedClassName,
  hold = false,
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  const [revealCount, setRevealCount] = useState<number>(0);
  const [, setScrambleTick] = useState<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastFlipTimeRef = useRef<number>(0);
  const holdReleasedRef = useRef(false);
  const scrambleCharsRef = useRef<string[]>(
    text ? generateGibberishPreservingSpaces(text, charset).split("") : [],
  );

  // Track when hold transitions from true → false to start revealing
  useEffect(() => {
    if (!hold && !holdReleasedRef.current && isInView) {
      holdReleasedRef.current = true;
      startTimeRef.current = performance.now();
      setRevealCount(0);
    }
  }, [hold, isInView]);

  useEffect(() => {
    if (!isInView) return;

    // Reset state for a fresh animation whenever dependencies change
    const initial = text
      ? generateGibberishPreservingSpaces(text, charset)
      : "";
    scrambleCharsRef.current = initial.split("");
    lastFlipTimeRef.current = performance.now();

    // If hold is active, don't start reveal timer
    if (hold) {
      holdReleasedRef.current = false;
      startTimeRef.current = 0;
      setRevealCount(0);
    } else {
      holdReleasedRef.current = true;
      startTimeRef.current = performance.now();
      setRevealCount(0);
    }

    let isCancelled = false;

    const update = (now: number) => {
      if (isCancelled) return;

      const totalLength = text.length;

      let currentRevealCount = revealCount;

      // Only reveal if hold has been released
      if (holdReleasedRef.current && startTimeRef.current > 0) {
        const elapsedMs = now - startTimeRef.current;
        currentRevealCount = Math.min(
          totalLength,
          Math.floor(elapsedMs / Math.max(1, revealDelayMs)),
        );
        setRevealCount((prev) =>
          prev === currentRevealCount ? prev : currentRevealCount,
        );

        if (currentRevealCount >= totalLength) {
          return;
        }
      }

      // Re-randomize unrevealed scramble characters on an interval
      const timeSinceLastFlip = now - lastFlipTimeRef.current;
      if (timeSinceLastFlip >= Math.max(0, flipDelayMs)) {
        const currentRevealed = holdReleasedRef.current ? currentRevealCount : 0;
        for (let index = 0; index < totalLength; index += 1) {
          if (index >= currentRevealed) {
            if (text[index] !== " ") {
              scrambleCharsRef.current[index] =
                generateRandomCharacter(charset, text[index]);
            } else {
              scrambleCharsRef.current[index] = " ";
            }
          }
        }
        lastFlipTimeRef.current = now;
        setScrambleTick((prev) => prev + 1);
      }

      animationFrameRef.current = requestAnimationFrame(update);
    };

    animationFrameRef.current = requestAnimationFrame(update);

    return () => {
      isCancelled = true;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInView, text, revealDelayMs, charset, flipDelayMs, hold]);

  if (!text) return null;

  return (
    <motion.span
      ref={ref}
      className={cn(className)}
      aria-label={text}
      role="text"
    >
      {text.split("").map((char, index) => {
        const isRevealed = index < revealCount;
        const displayChar = isRevealed
          ? char
          : char === " "
            ? " "
            : (scrambleCharsRef.current[index] ??
              generateRandomCharacter(charset, char));

        return (
          <span
            key={index}
            className={cn(isRevealed ? revealedClassName : encryptedClassName)}
          >
            {displayChar}
          </span>
        );
      })}
    </motion.span>
  );
};
