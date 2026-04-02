import React, { useEffect, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { avatarMotionOrigin } from '@/lib/avatar-viewbox';

const BUBBLEGUM_CYCLE_IDLE_MS = 60_000;

export function AvatarAnimatedBubblegum() {
  const controls = useAnimationControls();
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const [burstKey, setBurstKey] = useState(0);

  const lipCX = 24;
  const lipCY = 32.85;
  const bubbleSize = 8;
  const bubbleX = lipCX - bubbleSize / 2;
  const bubbleY = lipCY - bubbleSize / 2;

  useEffect(() => {
    let cancelled = false;
    const timeoutIds: number[] = [];

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = window.setTimeout(() => resolve(), ms);
        timeoutIds.push(id as unknown as number);
      });

    const loop = async () => {
      while (!cancelled) {
        await sleep(BUBBLEGUM_CYCLE_IDLE_MS);
        if (cancelled) break;

        const c = controlsRef.current;
        const blowDur = 4.8 + Math.random() * 3.2;
        const fadeIn = Math.min(0.55, blowDur * 0.18);

        await c.start({
          scale: 2.08,
          opacity: 1,
          transition: {
            scale: {
              duration: blowDur,
              ease: [0.45, 0.02, 0.25, 1],
            },
            opacity: {
              duration: fadeIn,
              ease: [0.33, 0, 0.2, 1],
            },
          },
        });
        if (cancelled) break;

        setBurstKey((k) => k + 1);

        await c.start({
          scale: 3.38,
          opacity: 1,
          rotate: -7,
          transition: { duration: 0.09, ease: [0.2, 0.9, 0.3, 1] },
        });
        if (cancelled) break;

        await c.start({
          scale: 0.12,
          opacity: 0,
          rotate: 0,
          transition: { duration: 0.24, ease: [0.55, 0, 0.95, 0.35] },
        });
      }
    };

    void loop();
    return () => {
      cancelled = true;
      timeoutIds.forEach((id) => window.clearTimeout(id));
      controlsRef.current.stop();
    };
  }, []);

  const burstAngles = [0, 55, 110, 180, 235, 305] as const;

  return (
    <g pointerEvents="none">
      <motion.g
        initial={{ scale: 0.12, opacity: 0, rotate: 0 }}
        animate={controls}
        style={{ transformOrigin: avatarMotionOrigin(lipCX, lipCY) }}
      >
        <rect
          x={bubbleX}
          y={bubbleY}
          width={bubbleSize}
          height={bubbleSize}
          rx={bubbleSize / 2}
          fill="#f472b6"
          opacity="0.92"
        />
        <ellipse
          cx={lipCX - 1.5}
          cy={lipCY - 1.95}
          rx="1.55"
          ry="1.05"
          fill="rgba(255,255,255,0.28)"
        />
      </motion.g>
      {burstKey > 0 ? (
        <g key={burstKey}>
          {burstAngles.map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            const dx = Math.cos(rad) * 8.5;
            const dy = Math.sin(rad) * 7.2;
            return (
              <motion.circle
                key={i}
                r={0.62}
                cx={lipCX}
                cy={lipCY}
                fill={i % 2 === 0 ? '#fbcfe8' : '#ffffff'}
                initial={{ opacity: 0, scale: 0 }}
                animate={{
                  opacity: [0, 1, 0],
                  cx: [lipCX, lipCX + dx * 0.4, lipCX + dx],
                  cy: [lipCY, lipCY + dy * 0.4, lipCY + dy],
                  scale: [0, 1.5, 0.2],
                }}
                transition={{
                  duration: 0.44,
                  ease: [0.25, 0.9, 0.2, 1],
                  times: [0, 0.12, 1],
                }}
              />
            );
          })}
        </g>
      ) : null}
    </g>
  );
}
