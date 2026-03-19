'use client';

import { createRoot, type Root } from 'react-dom/client';
import type { AvatarConfig } from '@/lib/websocket-client';
import AvatarPreview from './AvatarPreview';

const W = 24;
const H = 28;

export type AvatarVoxelGrid = (string | null)[][];

function buildGridFromImageData(data: ImageData): AvatarVoxelGrid {
  const grid: AvatarVoxelGrid = Array.from({ length: H }, () => Array<string | null>(W).fill(null));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const a = data.data[i + 3];
      if (a < 12) grid[y][x] = null;
      else {
        const r = data.data[i];
        const g = data.data[i + 1];
        const b = data.data[i + 2];
        grid[y][x] = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      }
    }
  }
  return grid;
}

/**
 * Renders AvatarPreview off-screen, rasterizes SVG to 24×28 pixels, returns voxel grid (one hex per cell).
 * Used to seed the voxel painter from any avatar config (e.g. variant review cards).
 */
export function rasterizeAvatarConfigToGrid(config: AvatarConfig): Promise<AvatarVoxelGrid> {
  return new Promise((resolve, reject) => {
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
      'position:fixed;left:-9999px;top:0;width:24px;height:28px;overflow:hidden;pointer-events:none;visibility:hidden';
    document.body.appendChild(host);

    let root: Root | null = createRoot(host);
    root.render(
      <AvatarPreview
        config={config}
        emotion="neutral"
        compact
        className="block h-full w-full"
        trackMouse={false}
        roamEyes={false}
      />,
    );

    const teardown = () => {
      if (root) {
        root.unmount();
        root = null;
      }
      host.remove();
    };

    const capture = () => {
      const svg = host.querySelector('svg');
      if (!svg) {
        teardown();
        reject(new Error('No SVG from avatar preview'));
        return;
      }
      svg.setAttribute('width', String(W));
      svg.setAttribute('height', String(H));
      let svgStr = new XMLSerializer().serializeToString(svg);
      if (!svgStr.includes('xmlns=')) {
        svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      }

      teardown();

      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = W;
          canvas.height = H;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error('Canvas unavailable'));
            return;
          }
          ctx.clearRect(0, 0, W, H);
          ctx.drawImage(img, 0, 0, W, H);
          const grid = buildGridFromImageData(ctx.getImageData(0, 0, W, H));
          URL.revokeObjectURL(url);
          resolve(grid);
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e instanceof Error ? e : new Error('Raster failed'));
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not load SVG image'));
      };
      img.src = url;
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(capture, 64);
      });
    });
  });
}
