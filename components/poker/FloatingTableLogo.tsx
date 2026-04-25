'use client';

import { useEffect, useRef } from 'react';

type Props = {
  src: string;
  opacity: number;
  /** Fraction of felt diameter the logo's longest side can occupy. */
  maxSizeFraction?: number;
  /** Target speed in pixels per second. */
  speed?: number;
};

/**
 * DVD-screensaver-style floating logo that bounces off the circular felt rail.
 * Renders absolutely inside a round felt container; caller handles opacity wrapper.
 */
export function FloatingTableLogo({
  src,
  opacity,
  maxSizeFraction = 0.22,
  speed = 90,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const posRef = useRef({ x: 0, y: 0 });
  const velRef = useRef({ x: 0, y: 0 });
  const initializedRef = useRef(false);
  const lastTsRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const feltRef = useRef({ w: 0, h: 0, cx: 0, cy: 0, r: 0 });
  const logoRef = useRef({ w: 0, h: 0, half: 0, hw: 0, hh: 0 });

  useEffect(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return;

    const measure = () => {
      const rect = container.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      feltRef.current = {
        w,
        h,
        cx: w / 2,
        cy: h / 2,
        r: Math.min(w, h) / 2,
      };
      const lw = img.offsetWidth;
      const lh = img.offsetHeight;
      logoRef.current = {
        w: lw,
        h: lh,
        half: Math.hypot(lw, lh) / 2,
        hw: lw / 2,
        hh: lh / 2,
      };
      if (!initializedRef.current && w > 0 && h > 0 && lw > 0 && lh > 0) {
        posRef.current = { x: feltRef.current.cx, y: feltRef.current.cy };
        const angle = Math.random() * Math.PI * 2;
        velRef.current = {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        };
        initializedRef.current = true;
      }
    };

    measure();

    const ro = new ResizeObserver(() => measure());
    ro.observe(container);
    if (img.complete) measure();
    else img.addEventListener('load', measure, { once: true });

    const step = (ts: number) => {
      rafRef.current = requestAnimationFrame(step);
      if (document.hidden) {
        lastTsRef.current = ts;
        return;
      }
      const last = lastTsRef.current;
      lastTsRef.current = ts;
      if (last == null) return;
      const dt = Math.min(0.05, (ts - last) / 1000);

      const { cx, cy, r } = feltRef.current;
      const { hw, hh } = logoRef.current;
      if (r <= 0 || hw <= 0 || hh <= 0) return;

      let { x, y } = posRef.current;
      let { x: vx, y: vy } = velRef.current;

      x += vx * dt;
      y += vy * dt;

      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > 0) {
        const nx = dx / dist;
        const ny = dy / dist;
        // Farthest extent of the logo's bounding box along the radial normal.
        const extent = Math.abs(nx) * hw + Math.abs(ny) * hh;
        const maxR = Math.max(0, r - extent - 2);
        if (dist > maxR) {
          const dot = vx * nx + vy * ny;
          if (dot > 0) {
            vx -= 2 * dot * nx;
            vy -= 2 * dot * ny;
          }
          x = cx + nx * maxR;
          y = cy + ny * maxR;
        }
      }

      posRef.current = { x, y };
      velRef.current = { x: vx, y: vy };

      if (imgRef.current) {
        imgRef.current.style.transform = `translate3d(${x - logoRef.current.w / 2}px, ${y - logoRef.current.h / 2}px, 0)`;
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      ro.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
      initializedRef.current = false;
    };
  }, [src, speed]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        opacity,
        overflow: 'hidden',
      }}
    >
      <img
        ref={imgRef}
        src={src}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          maxWidth: `${maxSizeFraction * 100}%`,
          maxHeight: `${maxSizeFraction * 100}%`,
          objectFit: 'contain',
          filter: 'grayscale(0.15)',
          userSelect: 'none',
          willChange: 'transform',
          transform: 'translate3d(-9999px, -9999px, 0)',
        }}
      />
    </div>
  );
}
