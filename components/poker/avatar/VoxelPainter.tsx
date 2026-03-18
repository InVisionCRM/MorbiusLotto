'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Eraser, Trash2, Eye, EyeOff, ChevronDown, ChevronUp, Plus, Loader2, Check, AlertTriangle } from 'lucide-react';
import AvatarPreview from './AvatarPreview';
import type { AvatarConfig } from '@/lib/websocket-client';
import { MAX_SUPPLY, type ItemTier } from '@/lib/cosmetics-catalog';

// ── Constants ─────────────────────────────────────────────────────────────────

const GRID = 24;   // viewBox width
const GRID_H = 28; // viewBox height (taller to show full shirt)
const CELL = 20;   // px per cell in the painter

const MORBIUS_PRICE: Record<ItemTier, number> = {
  common: 1_000, uncommon: 10_000, rare: 25_000, legendary: 100_000,
};

const DEFAULT_CONFIG: AvatarConfig = {
  skinColor: '#F1C27D', hairStyle: 'Short', hairColor: '#2C222B',
  eyeShape: 'Round', eyeColor: '#634e34', noseShape: 'Small',
  lipShape: 'Smile', accessory: 'None', shirtColor: '#3b82f6',
  hat: 'None', hatColor: '', shirtStyle: 'Default', necklace: 'None', mouthAccessory: 'None',
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function VoxelPainter({ address, onCreated }: { address: string; onCreated: () => void }) {
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

  const gridRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

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
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
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
                {/* Reference ghost avatar */}
                {showRef && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ opacity: 0.35 }}
                  >
                    <AvatarPreview
                      config={{ ...refConfig, overlayImage: '' }}
                      emotion="neutral"
                      compact={false}
                      className="w-full h-full"
                    />
                  </div>
                )}

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

                {/* Painted pixels */}
                <svg
                  viewBox={`0 0 ${GRID} ${GRID_H}`}
                  width={GRID * CELL}
                  height={GRID_H * CELL}
                  className="absolute inset-0"
                  shapeRendering="crispEdges"
                  style={{ zIndex: 1 }}
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
                  style={{ zIndex: 2 }}
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

              {/* Canvas actions */}
              <div className="flex items-center gap-2">
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
                  onClick={() => setGrid(emptyGrid())}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-800 transition-colors"
                  title="Clear canvas"
                >
                  <Trash2 size={11} /> Clear
                </button>
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
}
