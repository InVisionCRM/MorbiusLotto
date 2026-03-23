'use client';

import React, { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Eraser, Trash2, Eye, EyeOff, ChevronDown, ChevronUp, Plus, Loader2, Check, AlertTriangle, Upload, Shuffle } from 'lucide-react';
import AvatarView from './AvatarView';
import type { AvatarConfig } from '@/lib/websocket-client';
import { MAX_SUPPLY, type ItemTier } from '@/lib/cosmetics-catalog';
import { angleToSvgCoords, parseGradient, serializeGradient, type GradientDef } from '@/lib/gradient-utils';
import { rasterizeAvatarConfigToGrid } from './avatar-to-voxel-grid';
import { AVATAR_VIEWBOX_W as GRID, AVATAR_VIEWBOX_H as GRID_H } from '@/lib/avatar-viewbox';

// ── Constants ─────────────────────────────────────────────────────────────────
/** px per cell — total frame matches v1 viewBox 48×56 (10px/cell → ~480×560 canvas). */
const CELL = 10;

const MORBIUS_PRICE: Record<ItemTier, number> = {
  common: 1_000, uncommon: 10_000, rare: 25_000, legendary: 100_000,
};

const DEFAULT_CONFIG: AvatarConfig = {
  skinColor: '#F1C27D', hairStyle: 'Short', hairColor: '#2C222B',
  accessoryColor: '#111111',
  eyeShape: 'Round', eyeColor: '#634e34', noseShape: 'Small',
  lipShape: 'Smile', accessory: 'None', shirtColor: '#3b82f6',
  hat: 'None', hatColor: '', shirtStyle: 'Default', necklace: 'None', mouthAccessory: 'None',
  makeup: 'None', facialHair: 'None',
  backgroundImage: '', overlayImage: '', faceShape: 'Round', customPattern: '',
};

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7',
  '#ec4899', '#ffffff', '#9ca3af', '#3f3f46', '#000000', '#00000000',
];

// ── Types ─────────────────────────────────────────────────────────────────────

type Grid = (string | null)[][]; // null = transparent

type SaveTarget = 'overlayImage' | 'backgroundImage';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyGrid(): Grid {
  return Array.from({ length: GRID_H }, () => Array(GRID).fill(null));
}

function gridToDataUrl(grid: Grid): string {
  const canvas = document.createElement('canvas');
  canvas.width = GRID;
  canvas.height = GRID_H;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, GRID, GRID_H);
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID; x++) {
      const color = grid[y][x];
      if (color && color !== '#00000000') {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return canvas.toDataURL('image/png');
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Generate a random palette of 2-5 colors using HSL for nice distribution. */
function randomPalette(count?: number): string[] {
  const n = count ?? (2 + Math.floor(Math.random() * 4));
  const baseHue = Math.random() * 360;
  const spread = 30 + Math.random() * 180; // how far apart hues are
  return Array.from({ length: n }, (_, i) => {
    const hue = (baseHue + (i / n) * spread) % 360;
    const sat = 50 + Math.floor(Math.random() * 45);
    const lit = 25 + Math.floor(Math.random() * 50);
    return hslToHex(hue, sat, lit);
  });
}

function hslToHex(h: number, s: number, l: number): string {
  const a = (s * Math.min(l, 100 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round((255 * c) / 100).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Simple 2D value noise for organic patterns. */
function valueNoise(x: number, y: number, seed: number): number {
  // Hash function
  const hash = (ix: number, iy: number) => {
    let h = ix * 374761393 + iy * 668265263 + seed;
    h = (h ^ (h >> 13)) * 1274126177;
    h = h ^ (h >> 16);
    return (h & 0x7fffffff) / 0x7fffffff;
  };
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  // Smooth interpolation
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const v00 = hash(ix, iy);
  const v10 = hash(ix + 1, iy);
  const v01 = hash(ix, iy + 1);
  const v11 = hash(ix + 1, iy + 1);
  return v00 * (1 - sx) * (1 - sy) + v10 * sx * (1 - sy) + v01 * (1 - sx) * sy + v11 * sx * sy;
}

/** Generate a truly random pattern grid. Picks a random algorithm each time. */
function generateRandomPattern(): { grid: Grid; label: string } {
  const algorithms = [
    generateNoisePattern,
    generateStripesPattern,
    generateSpotsPattern,
    generateBlocksPattern,
    generateWavesPattern,
    generatePlasmaPattern,
  ];
  const pick = algorithms[Math.floor(Math.random() * algorithms.length)];
  return pick();
}

function generateNoisePattern(): { grid: Grid; label: string } {
  const palette = randomPalette();
  const seed = Math.floor(Math.random() * 100000);
  const scale = 2 + Math.random() * 6; // controls "zoom" of noise
  const g = emptyGrid();
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID; x++) {
      const n = valueNoise(x / scale, y / scale, seed);
      const idx = Math.floor(n * palette.length) % palette.length;
      g[y][x] = palette[idx];
    }
  }
  return { grid: g, label: `Noise (${palette.length} colors)` };
}

function generateStripesPattern(): { grid: Grid; label: string } {
  const palette = randomPalette(2 + Math.floor(Math.random() * 3));
  const angle = Math.random() * Math.PI; // random stripe angle
  const width = 2 + Math.floor(Math.random() * 5); // stripe width
  const g = emptyGrid();
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID; x++) {
      const proj = x * Math.cos(angle) + y * Math.sin(angle);
      const idx = Math.floor(proj / width) % palette.length;
      g[y][x] = palette[(idx + palette.length) % palette.length];
    }
  }
  return { grid: g, label: `Stripes (${palette.length} colors)` };
}

function generateSpotsPattern(): { grid: Grid; label: string } {
  const bgColor = hslToHex(Math.random() * 360, 20 + Math.random() * 30, 15 + Math.random() * 25);
  const spotColors = randomPalette(1 + Math.floor(Math.random() * 3));
  const numSpots = 8 + Math.floor(Math.random() * 20);
  const g = emptyGrid();
  // Fill background
  for (let y = 0; y < GRID_H; y++)
    for (let x = 0; x < GRID; x++)
      g[y][x] = bgColor;
  // Place random spots
  for (let i = 0; i < numSpots; i++) {
    const cx = Math.random() * GRID;
    const cy = Math.random() * GRID_H;
    const r = 1 + Math.random() * 3;
    const sc = spotColors[Math.floor(Math.random() * spotColors.length)];
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(GRID_H - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(GRID - 1, Math.ceil(cx + r)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
          g[y][x] = sc;
        }
      }
    }
  }
  return { grid: g, label: `Spots (${numSpots} dots)` };
}

function generateBlocksPattern(): { grid: Grid; label: string } {
  const palette = randomPalette(3 + Math.floor(Math.random() * 4));
  const g = emptyGrid();
  // Fill with base color
  const base = palette[0];
  for (let y = 0; y < GRID_H; y++)
    for (let x = 0; x < GRID; x++)
      g[y][x] = base;
  // Place random rectangles
  const numRects = 6 + Math.floor(Math.random() * 12);
  for (let i = 0; i < numRects; i++) {
    const rx = Math.floor(Math.random() * GRID);
    const ry = Math.floor(Math.random() * GRID_H);
    const rw = 2 + Math.floor(Math.random() * 8);
    const rh = 2 + Math.floor(Math.random() * 8);
    const rc = palette[1 + Math.floor(Math.random() * (palette.length - 1))];
    for (let y = ry; y < Math.min(GRID_H, ry + rh); y++)
      for (let x = rx; x < Math.min(GRID, rx + rw); x++)
        g[y][x] = rc;
  }
  return { grid: g, label: `Blocks (${numRects} rects)` };
}

function generateWavesPattern(): { grid: Grid; label: string } {
  const palette = randomPalette(3 + Math.floor(Math.random() * 3));
  const freq = 0.15 + Math.random() * 0.4;
  const amp = 2 + Math.random() * 6;
  const phase = Math.random() * Math.PI * 2;
  const g = emptyGrid();
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID; x++) {
      const wave = Math.sin(x * freq + phase) * amp + y;
      const band = Math.floor(wave / (GRID_H / palette.length));
      const idx = ((band % palette.length) + palette.length) % palette.length;
      g[y][x] = palette[idx];
    }
  }
  return { grid: g, label: `Waves (${palette.length} bands)` };
}

function generatePlasmaPattern(): { grid: Grid; label: string } {
  const palette = randomPalette(4 + Math.floor(Math.random() * 4));
  const seed1 = Math.random() * 100;
  const seed2 = Math.random() * 100;
  const g = emptyGrid();
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID; x++) {
      const v = (
        Math.sin(x * 0.3 + seed1) +
        Math.sin(y * 0.3 + seed2) +
        Math.sin((x + y) * 0.2) +
        Math.sin(Math.sqrt(x * x + y * y) * 0.3)
      ) / 4; // -1 to 1
      const norm = (v + 1) / 2; // 0 to 1
      const idx = Math.floor(norm * palette.length) % palette.length;
      g[y][x] = palette[idx];
    }
  }
  return { grid: g, label: `Plasma (${palette.length} colors)` };
}

function gridFromGradientDef(def: GradientDef): Grid {
  const w = GRID;
  const h = GRID_H;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return emptyGrid();
  const c = angleToSvgCoords(def.angle);
  const x1 = (parseFloat(c.x1.replace('%', '')) / 100) * w;
  const y1 = (parseFloat(c.y1.replace('%', '')) / 100) * h;
  const x2 = (parseFloat(c.x2.replace('%', '')) / 100) * w;
  const y2 = (parseFloat(c.y2.replace('%', '')) / 100) * h;
  const lg = ctx.createLinearGradient(x1, y1, x2, y2);
  const stops = [...def.stops].sort((a, b) => a.offset - b.offset);
  for (const s of stops) {
    lg.addColorStop(s.offset, hexToRgba(s.color, s.opacity));
  }
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const out = emptyGrid();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data.data[i + 3];
      if (a < 8) out[y][x] = null;
      else {
        const r = data.data[i];
        const gg = data.data[i + 1];
        const b = data.data[i + 2];
        out[y][x] = `#${r.toString(16).padStart(2, '0')}${gg.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      }
    }
  }
  return out;
}

function randomHex(): string {
  const hue = Math.floor(Math.random() * 360);
  const s = 50 + Math.floor(Math.random() * 40);
  const l = 35 + Math.floor(Math.random() * 40);
  const a = (s * Math.min(l, 100 - l)) / 100;
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round((255 * color) / 100)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Random linear gradient JSON; preserves stop count when `existing` parses. */
function randomGradientJson(existing?: string): string {
  const angle = Math.floor(Math.random() * 360);
  const parsed = existing ? parseGradient(existing) : null;
  const numStops = Math.max(
    2,
    Math.min(5, parsed?.stops?.length ?? (2 + (Math.random() > 0.6 ? 1 : 0))),
  );
  const offsets =
    numStops <= 2
      ? [0, 1]
      : [0, ...Array.from({ length: numStops - 2 }, () => Math.random()).sort((a, b) => a - b), 1];
  const stops = Array.from({ length: numStops }, (_, i) => ({
    color: randomHex(),
    offset: offsets[i],
    opacity: 1,
  }));
  return serializeGradient({ type: 'linearGradient', angle, stops });
}

function gridFromImageBitmap(img: HTMLImageElement): Grid {
  const canvas = document.createElement('canvas');
  canvas.width = GRID;
  canvas.height = GRID_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return emptyGrid();
  ctx.clearRect(0, 0, GRID, GRID_H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, GRID, GRID_H);
  const data = ctx.getImageData(0, 0, GRID, GRID_H);
  const out = emptyGrid();
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = (y * GRID + x) * 4;
      const a = data.data[i + 3];
      if (a < 12) out[y][x] = null;
      else {
        const r = data.data[i];
        const g = data.data[i + 1];
        const b = data.data[i + 2];
        out[y][x] = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      }
    }
  }
  return out;
}

// ── Component ─────────────────────────────────────────────────────────────────

export type VoxelPainterHandle = {
  /** Rasterizes the avatar at 48×56 and loads into the grid; opens the painter panel. */
  importFromAvatarConfig: (config: AvatarConfig) => Promise<void>;
};

const VoxelPainter = forwardRef<VoxelPainterHandle, { address: string; onCreated: () => void }>(
  function VoxelPainter({ address, onCreated }, ref) {
  const [open, setOpen] = useState(false);
  const [grid, setGrid] = useState<Grid>(emptyGrid);
  const [color, setColor] = useState('#ef4444');
  const [eraser, setEraser] = useState(false);
  const [showRef, setShowRef] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [painting, setPainting] = useState(false);

  // Reference avatar config
  const [refConfig, setRefConfig] = useState<AvatarConfig>(DEFAULT_CONFIG);

  // Save form
  const [displayName, setDisplayName] = useState('');
  const [tier, setTier] = useState<ItemTier>('uncommon');
  const [saveTarget, setSaveTarget] = useState<SaveTarget>('overlayImage');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Keeps stop count stable across repeated gradient randomize clicks (same as admin gradient tool). */
  const lastGradientJsonRef = useRef('');

  useImperativeHandle(ref, () => ({
    importFromAvatarConfig: async (config: AvatarConfig) => {
      setErr(null);
      setSuccess(null);
      try {
        const g = await rasterizeAvatarConfigToGrid(config);
        setGrid(g);
        setOpen(true);
        setSuccess('Loaded from preview — erase/recolor, then Save as Item');
        queueMicrotask(() =>
          containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Could not import preview into grid');
      }
    },
  }));

  // Close picker when clicking outside
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  const paint = useCallback((cellX: number, cellY: number) => {
    setGrid(prev => {
      const next = prev.map(r => [...r]);
      next[cellY][cellX] = eraser ? null : (color === '#00000000' ? null : color);
      return next;
    });
  }, [eraser, color]);

  const getCellFromEvent = (e: React.MouseEvent | MouseEvent): [number, number] | null => {
    if (!gridRef.current) return null;
    const rect = gridRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / CELL);
    const y = Math.floor((e.clientY - rect.top) / CELL);
    if (x < 0 || x >= GRID || y < 0 || y >= GRID_H) return null;
    return [x, y];
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setPainting(true);
    const cell = getCellFromEvent(e);
    if (cell) paint(cell[0], cell[1]);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!painting) return;
    const cell = getCellFromEvent(e);
    if (cell) paint(cell[0], cell[1]);
  }, [painting, paint]);

  const handleMouseUp = useCallback(() => setPainting(false), []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErr('Please choose an image file');
      setSuccess(null);
      return;
    }
    setErr(null);
    setSuccess(null);
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      try {
        setGrid(gridFromImageBitmap(img));
        setSuccess('Image sampled into grid (48×56)');
      } catch {
        setErr('Could not sample image');
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setErr('Failed to load image');
    };
    img.src = url;
  };

  const handleRandomPattern = () => {
    setErr(null);
    setSuccess(null);
    const { grid: g, label } = generateRandomPattern();
    setGrid(g);
    setSuccess(`Pattern: ${label}`);
  };

  const handleRecolorGrid = () => {
    setErr(null);
    setSuccess(null);
    // Collect unique colors in the current grid
    const uniqueColors = new Set<string>();
    for (let y = 0; y < GRID_H; y++)
      for (let x = 0; x < GRID; x++) {
        const c = grid[y][x];
        if (c) uniqueColors.add(c);
      }
    if (uniqueColors.size === 0) { setErr('Nothing to recolor — draw something first'); return; }
    // Map each existing color to a new random one
    const palette = randomPalette(uniqueColors.size);
    const colorMap = new Map<string, string>();
    let i = 0;
    for (const old of uniqueColors) {
      colorMap.set(old, palette[i++]);
    }
    setGrid(prev => prev.map(row => row.map(c => (c ? colorMap.get(c) ?? c : null))));
    setSuccess(`Recolored ${uniqueColors.size} colors`);
  };

  const handleRandomGradient = () => {
    setErr(null);
    setSuccess(null);
    const json = randomGradientJson(lastGradientJsonRef.current || undefined);
    lastGradientJsonRef.current = json;
    const def = parseGradient(json);
    if (!def) return;
    setGrid(gridFromGradientDef(def));
    setSuccess('Random gradient applied');
  };

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleSave = async () => {
    setErr(null);
    setSuccess(null);
    if (!displayName.trim()) { setErr('Name is required'); return; }
    const hasPixels = grid.some(row => row.some(c => c !== null));
    if (!hasPixels) { setErr('Draw something first'); return; }

    const dataUrl = gridToDataUrl(grid);
    // Generate a deterministic item key from the image content
    let h = 0;
    for (let i = 0; i < Math.min(dataUrl.length, 512); i++) {
      h = (Math.imul(31, h) + dataUrl.charCodeAt(i)) >>> 0;
    }
    const itemKey = `${saveTarget === 'overlayImage' ? 'overlay' : 'bg'}_voxel_${h.toString(36)}`;

    setBusy(true);
    try {
      const res = await fetch('/api/cosmetics/admin/create-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminAddress: address,
          itemKey,
          displayName: displayName.trim(),
          tier,
          priceMorbius: MORBIUS_PRICE[tier],
          maxSupply: MAX_SUPPLY[tier],
          unlocksField: saveTarget,
          unlocksValue: dataUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Create failed'); return; }
      setSuccess(`"${displayName.trim()}" created!`);
      setGrid(emptyGrid());
      setDisplayName('');
      onCreated();
    } catch {
      setErr('Network error');
    } finally {
      setBusy(false);
    }
  };

  const price = MORBIUS_PRICE[tier];
  const supply = MAX_SUPPLY[tier];

  return (
    <div ref={containerRef} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
      >
        <span className="text-lg leading-none">🎨</span>
        Voxel Painter
        <span className="text-[10px] text-zinc-500 font-normal">— draw directly on a {GRID}×{GRID_H} avatar grid</span>
        <div className="ml-auto text-zinc-600">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {open && (
        <div className="border-t border-zinc-800 p-4 space-y-4">
          <div className="flex gap-4 flex-wrap">
            {/* ── Canvas area ── */}
            <div className="shrink-0 space-y-2">
              {/* The paint grid + ghost avatar */}
              <div
                ref={gridRef}
                className="relative select-none"
                style={{
                  width: GRID * CELL,
                  height: GRID_H * CELL,
                  cursor: eraser ? 'cell' : 'crosshair',
                  touchAction: 'none',
                }}
                onMouseDown={handleMouseDown}
              >
                {/* Checkerboard transparency indicator */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage:
                      'repeating-conic-gradient(#2d2d2d 0% 25%, #1a1a1a 0% 50%)',
                    backgroundSize: `${CELL * 2}px ${CELL * 2}px`,
                    opacity: 0.4,
                    zIndex: 0,
                  }}
                />

                {/* Reference ghost avatar */}
                {showRef && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ opacity: 1, zIndex: 1 }}
                  >
                    <AvatarView
                      config={{ ...refConfig, overlayImage: '' }}
                      emotion="neutral"
                      compact={false}
                      className="w-full h-full"
                    />
                  </div>
                )}

                {/* Painted pixels */}
                <svg
                  viewBox={`0 0 ${GRID} ${GRID_H}`}
                  width={GRID * CELL}
                  height={GRID_H * CELL}
                  className="absolute inset-0"
                  shapeRendering="crispEdges"
                  style={{ zIndex: 2 }}
                >
                  {grid.flatMap((row, y) =>
                    row.map((c, x) =>
                      c ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={c} /> : null
                    )
                  )}
                </svg>

                {/* Grid lines */}
                <svg
                  viewBox={`0 0 ${GRID} ${GRID_H}`}
                  width={GRID * CELL}
                  height={GRID_H * CELL}
                  className="absolute inset-0 pointer-events-none"
                  style={{ zIndex: 3 }}
                >
                  {/* Vertical lines */}
                  {Array.from({ length: GRID + 1 }, (_, i) => (
                    <line key={`v${i}`} x1={i} y1={0} x2={i} y2={GRID_H} stroke="rgba(255,255,255,0.06)" strokeWidth="0.04" />
                  ))}
                  {/* Horizontal lines */}
                  {Array.from({ length: GRID_H + 1 }, (_, i) => (
                    <line key={`h${i}`} x1={0} y1={i} x2={GRID} y2={i} stroke="rgba(255,255,255,0.06)" strokeWidth="0.04" />
                  ))}
                </svg>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />

              {/* Canvas actions */}
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRef(r => !r)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                      showRef ? 'bg-zinc-700 border-zinc-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white'
                    }`}
                    title="Toggle reference avatar"
                  >
                    {showRef ? <Eye size={11} /> : <EyeOff size={11} />}
                    Ghost
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-zinc-700 text-zinc-400 hover:text-cyan-300 hover:border-cyan-600/50 transition-colors"
                    title="Upload image — scaled to 48×56 cells (transparent where alpha is low)"
                  >
                    <Upload size={11} /> Upload image
                  </button>
                  <button
                    type="button"
                    onClick={() => setGrid(emptyGrid())}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-800 transition-colors"
                    title="Clear canvas"
                  >
                    <Trash2 size={11} /> Clear
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRandomPattern}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-fuchsia-500/35 text-fuchsia-300/90 hover:text-white hover:border-fuchsia-400/60 transition-colors"
                    title="Fill grid with a random tiger / zebra / leopard / camo / galaxy / checkerboard tile pattern"
                  >
                    <Shuffle size={11} /> Random pattern
                  </button>
                  <button
                    type="button"
                    onClick={handleRandomGradient}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-indigo-500/35 text-indigo-300/90 hover:text-white hover:border-indigo-400/60 transition-colors"
                    title="Fill grid with a random linear gradient (keeps stop count on repeat clicks)"
                  >
                    <Shuffle size={11} /> Random gradient
                  </button>
                  <button
                    type="button"
                    onClick={handleRecolorGrid}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-amber-500/35 text-amber-300/90 hover:text-white hover:border-amber-400/60 transition-colors"
                    title="Keep the current pattern but randomize all colors"
                  >
                    <Shuffle size={11} /> Recolor
                  </button>
                </div>
              </div>
            </div>

            {/* ── Tools column ── */}
            <div className="flex-1 min-w-48 space-y-4">
              {/* Tool selector */}
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium block mb-1.5">Tool</label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEraser(false)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      !eraser ? 'bg-zinc-700 border-zinc-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white'
                    }`}
                  >
                    ✏️ Paint
                  </button>
                  <button
                    type="button"
                    onClick={() => setEraser(true)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      eraser ? 'bg-zinc-700 border-zinc-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Eraser size={11} /> Erase
                  </button>
                </div>
              </div>

              {/* Color picker */}
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium block mb-1.5">Color</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { setColor(c); setEraser(false); }}
                      title={c === '#00000000' ? 'Transparent (eraser)' : c}
                      className={`w-6 h-6 rounded border-2 transition-all ${
                        color === c && !eraser ? 'border-white scale-110' : 'border-zinc-600 hover:border-zinc-400'
                      } ${c === '#00000000' ? 'bg-transparent' : ''}`}
                      style={c !== '#00000000' ? { backgroundColor: c } : {
                        backgroundImage: 'repeating-conic-gradient(#555 0% 25%, #333 0% 50%)',
                        backgroundSize: '8px 8px',
                      }}
                    />
                  ))}
                  {/* Custom color button */}
                  <div className="relative" ref={pickerRef}>
                    <button
                      type="button"
                      onClick={() => setShowPicker(p => !p)}
                      className="w-6 h-6 rounded border-2 border-dashed border-zinc-500 hover:border-zinc-300 flex items-center justify-center transition-colors"
                      title="Custom color"
                    >
                      <Plus size={10} className="text-zinc-400" />
                    </button>
                    {showPicker && (
                      <div className="absolute left-0 top-8 z-50 shadow-2xl rounded-xl overflow-hidden border border-zinc-700">
                        <HexColorPicker
                          color={color}
                          onChange={c => { setColor(c); setEraser(false); }}
                        />
                      </div>
                    )}
                  </div>
                </div>
                {/* Active color swatch */}
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg border border-white/20 shadow-inner"
                    style={{ backgroundColor: color === '#00000000' ? 'transparent' : color,
                      backgroundImage: color === '#00000000' ? 'repeating-conic-gradient(#555 0% 25%, #333 0% 50%)' : undefined,
                      backgroundSize: '8px 8px',
                    }}
                  />
                  <span className="text-xs font-mono text-zinc-300">{eraser ? 'Eraser active' : color}</span>
                </div>
              </div>

              {/* Reference avatar skin tone quick-set */}
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium block mb-1.5">Reference skin</label>
                <div className="flex gap-1.5 flex-wrap">
                  {['#FFF5EE', '#F1C27D', '#C68642', '#8D5524', '#3E2723'].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setRefConfig(c => ({ ...c, skinColor: s }))}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${
                        refConfig.skinColor === s ? 'border-white scale-110' : 'border-zinc-600'
                      }`}
                      style={{ backgroundColor: s }}
                    />
                  ))}
                </div>
              </div>

              {/* Save target */}
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium block mb-1.5">Save as</label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSaveTarget('overlayImage')}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs border transition-colors text-center ${
                      saveTarget === 'overlayImage' ? 'bg-indigo-700 border-indigo-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white'
                    }`}
                  >
                    Overlay
                    <div className="text-[9px] opacity-60">on top of avatar</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaveTarget('backgroundImage')}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs border transition-colors text-center ${
                      saveTarget === 'backgroundImage' ? 'bg-indigo-700 border-indigo-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white'
                    }`}
                  >
                    Background
                    <div className="text-[9px] opacity-60">behind avatar</div>
                  </button>
                </div>
              </div>

              {/* Item details */}
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium block mb-1">Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="e.g. Flame Tattoo"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium block mb-1">Tier</label>
                  <select
                    value={tier}
                    onChange={e => setTier(e.target.value as ItemTier)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-500"
                  >
                    {(['common', 'uncommon', 'rare', 'legendary'] as ItemTier[]).map(t => (
                      <option key={t} value={t} className="capitalize">{t}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-800/50 border border-zinc-800 rounded-lg text-xs">
                  <span className="font-semibold text-amber-300">{price.toLocaleString()} MORBIUS</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-400">{supply} max</span>
                </div>
              </div>

              {err && (
                <div className="flex items-center gap-2 text-red-400 text-xs bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
                  <AlertTriangle size={11} /> {err}
                </div>
              )}
              {success && (
                <div className="flex items-center gap-2 text-emerald-400 text-xs bg-emerald-900/20 border border-emerald-800/40 rounded-lg px-3 py-2">
                  <Check size={11} /> {success}
                </div>
              )}

              <button
                type="button"
                onClick={handleSave}
                disabled={busy}
                className="w-full px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                {busy ? 'Saving…' : 'Save as Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default VoxelPainter;
