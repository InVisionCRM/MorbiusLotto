'use client';

import { useEffect, useRef } from 'react';

type Props = {
  src: string;
  opacity: number;
  /** Fraction of felt's shorter axis the logo's longest side can occupy. */
  maxSizeFraction?: number;
  /** Target speed in pixels per second. */
  speed?: number;
};

/**
 * DVD-screensaver-style floating logo that bounces off the elliptical felt rail.
 * Bounce reflection randomized 15°–37° off the inward surface normal so paths
 * never repeat. Renders absolutely inside the felt container.
 */
export function FloatingTableLogo({
  src,
  opacity,
  maxSizeFraction = 0.22,
  speed = 38,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const posRef = useRef({ x: 0, y: 0 });
  const velRef = useRef({ x: 0, y: 0 });
  const initializedRef = useRef(false);
  const lastTsRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const feltRef = useRef({ cx: 0, cy: 0, a: 0, b: 0 });
  const logoRef = useRef({ w: 0, h: 0, hw: 0, hh: 0 });

  useEffect(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return;

    const measure = () => {
      const rect = container.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      feltRef.current = {
        cx: w / 2,
        cy: h / 2,
        a: w / 2,
        b: h / 2,
      };
      const lw = img.offsetWidth;
      const lh = img.offsetHeight;
      logoRef.current = { w: lw, h: lh, hw: lw / 2, hh: lh / 2 };
      if (!initializedRef.current && w > 0 && h > 0 && lw > 0 && lh > 0) {
        const { cx, cy, a, b } = feltRef.current;
        // Spawn anywhere inside an inner ellipse that keeps the logo off the rail.
        const spawnA = Math.max(0, a - lw / 2 - 4);
        const spawnB = Math.max(0, b - lh / 2 - 4);
        const spawnAngle = Math.random() * Math.PI * 2;
        const spawnRadial = Math.sqrt(Math.random());
        posRef.current = {
          x: cx + Math.cos(spawnAngle) * spawnA * spawnRadial,
          y: cy + Math.sin(spawnAngle) * spawnB * spawnRadial,
        };
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

      const { cx, cy, a, b } = feltRef.current;
      const { hw, hh } = logoRef.current;
      if (a <= 0 || b <= 0 || hw <= 0 || hh <= 0) return;

      let { x, y } = posRef.current;
      let { x: vx, y: vy } = velRef.current;

      x += vx * dt;
      y += vy * dt;

      // Outward unit normal at (x, y) on the ellipse: gradient of (x/a)^2 + (y/b)^2.
      const gx = (x - cx) / (a * a);
      const gy = (y - cy) / (b * b);
      const glen = Math.hypot(gx, gy);
      if (glen > 0) {
        const nx = gx / glen;
        const ny = gy / glen;

        // How far the logo's box reaches along the normal.
        const extent = Math.abs(nx) * hw + Math.abs(ny) * hh;

        // Inward distance from the rail to the box edge along the normal.
        // For an ellipse, signed distance is approximated well by the level-set
        // value scaled by 1 / |∇|, which is ~accurate near the boundary.
        const ex = (x - cx) / a;
        const ey = (y - cy) / b;
        const level = ex * ex + ey * ey - 1;
        const railDist = level / (2 * glen);

        if (railDist > -extent - 2) {
          const dot = vx * nx + vy * ny;
          if (dot > 0) {
            const speedNow = Math.hypot(vx, vy);
            const inwardX = -nx;
            const inwardY = -ny;
            const minDeg = 15;
            const maxDeg = 37;
            const deg = minDeg + Math.random() * (maxDeg - minDeg);
            const sign = Math.random() < 0.5 ? -1 : 1;
            const rad = ((deg * Math.PI) / 180) * sign;
            const c = Math.cos(rad);
            const s = Math.sin(rad);
            vx = (inwardX * c - inwardY * s) * speedNow;
            vy = (inwardX * s + inwardY * c) * speedNow;
          }
          // Push back along the normal so we sit just inside the box-aware boundary.
          const push = railDist + extent + 2;
          if (push > 0) {
            x -= nx * push;
            y -= ny * push;
          }
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
