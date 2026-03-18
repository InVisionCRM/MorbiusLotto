'use client';

import React, { useState, useRef } from 'react';
import { Upload, Trash2 } from 'lucide-react';

type EffectMode = 'none' | 'pixel' | 'dither' | 'posterize' | 'duotone' | 'scanlines' | 'vignette' | 'glitch';

interface Params {
  pixelRes: number;
  ditherLevels: number;
  posterizeLevels: number;
  duoColor1: string;
  duoColor2: string;
  scanlineOpacity: number;
  scanlineSize: number;
  vignetteIntensity: number;
  glitchIntensity: number;
}

const DEFAULT_PARAMS: Params = {
  pixelRes: 32,
  ditherLevels: 4,
  posterizeLevels: 4,
  duoColor1: '#1a1a2e',
  duoColor2: '#e94560',
  scanlineOpacity: 0.45,
  scanlineSize: 2,
  vignetteIntensity: 0.75,
  glitchIntensity: 0.35,
};

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// ── Effect processors ──────────────────────────────────────────────────────────

function ditherColor(data: Uint8ClampedArray, w: number, h: number, levels: number) {
  const step = 255 / Math.max(1, levels - 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const old = data[i + c];
        const nv = Math.round(old / step) * step;
        const err = old - nv;
        data[i + c] = Math.max(0, Math.min(255, nv));
        if (x + 1 < w)  data[i + 4 + c]              = Math.max(0, Math.min(255, data[i + 4 + c]              + err * 7 / 16));
        if (y + 1 < h) {
          if (x > 0)    data[((y+1)*w + x-1)*4 + c]  = Math.max(0, Math.min(255, data[((y+1)*w+x-1)*4+c]  + err * 3 / 16));
                        data[((y+1)*w + x  )*4 + c]  = Math.max(0, Math.min(255, data[((y+1)*w+x  )*4+c]  + err * 5 / 16));
          if (x + 1 < w) data[((y+1)*w + x+1)*4 + c] = Math.max(0, Math.min(255, data[((y+1)*w+x+1)*4+c] + err * 1 / 16));
        }
      }
    }
  }
}

function posterize(data: Uint8ClampedArray, levels: number) {
  const step = 255 / Math.max(1, levels - 1);
  for (let i = 0; i < data.length; i += 4) {
    data[i]   = Math.round(data[i]   / step) * step;
    data[i+1] = Math.round(data[i+1] / step) * step;
    data[i+2] = Math.round(data[i+2] / step) * step;
  }
}

function duotone(data: Uint8ClampedArray, c1: string, c2: string) {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  for (let i = 0; i < data.length; i += 4) {
    const lum = (0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]) / 255;
    data[i]   = Math.round(a.r + (b.r - a.r) * lum);
    data[i+1] = Math.round(a.g + (b.g - a.g) * lum);
    data[i+2] = Math.round(a.b + (b.b - a.b) * lum);
  }
}

function scanlines(ctx: CanvasRenderingContext2D, w: number, h: number, lineH: number, opacity: number) {
  ctx.fillStyle = `rgba(0,0,0,${opacity})`;
  for (let y = 0; y < h; y += lineH * 2) ctx.fillRect(0, y, w, lineH);
}

function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, intensity: number) {
  const g = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, Math.max(w, h) / 1.5);
  g.addColorStop(0,   'rgba(0,0,0,0)');
  g.addColorStop(1,   `rgba(0,0,0,${intensity})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function glitch(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sx: number, sy: number, ss: number,
  w: number, h: number,
  intensity: number
) {
  const slices = Math.floor(6 + intensity * 18);
  for (let i = 0; i < slices; i++) {
    const y  = Math.floor(Math.random() * h);
    const sh = Math.floor(1 + Math.random() * Math.max(2, h * 0.04));
    const dx = Math.floor((Math.random() - 0.5) * w * intensity * 0.5);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y, w, sh);
    ctx.clip();
    ctx.drawImage(img, sx, sy, ss, ss, dx, 0, w, h);
    // Color fringe
    if (Math.random() > 0.55) {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(${Math.random()>0.5?255:0},0,${Math.random()>0.5?255:0},0.25)`;
      ctx.fillRect(0, y, w, sh);
    }
    ctx.restore();
  }
}

// ── Main processor ─────────────────────────────────────────────────────────────

function applyEffect(src: string, effect: EffectMode, params: Params, cb: (url: string) => void) {
  const img = new Image();
  img.onload = () => {
    const ss   = Math.min(img.width, img.height);
    const sx   = (img.width  - ss) / 2;
    const sy   = (img.height - ss) / 2;
    const outW = effect === 'pixel' ? params.pixelRes : 128;
    const outH = outW;

    const canvas = document.createElement('canvas');
    canvas.width  = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d')!;
    if (effect === 'pixel') ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, sx, sy, ss, ss, 0, 0, outW, outH);

    switch (effect) {
      case 'dither': {
        const id = ctx.getImageData(0, 0, outW, outH);
        ditherColor(id.data, outW, outH, params.ditherLevels);
        ctx.putImageData(id, 0, 0);
        break;
      }
      case 'posterize': {
        const id = ctx.getImageData(0, 0, outW, outH);
        posterize(id.data, params.posterizeLevels);
        ctx.putImageData(id, 0, 0);
        break;
      }
      case 'duotone': {
        const id = ctx.getImageData(0, 0, outW, outH);
        duotone(id.data, params.duoColor1, params.duoColor2);
        ctx.putImageData(id, 0, 0);
        break;
      }
      case 'scanlines': {
        scanlines(ctx, outW, outH, params.scanlineSize, params.scanlineOpacity);
        break;
      }
      case 'vignette': {
        vignette(ctx, outW, outH, params.vignetteIntensity);
        break;
      }
      case 'glitch': {
        glitch(ctx, img, sx, sy, ss, outW, outH, params.glitchIntensity);
        break;
      }
    }

    cb(canvas.toDataURL('image/png'));
  };
  img.src = src;
}

// ── Effect metadata ────────────────────────────────────────────────────────────

const EFFECTS: { id: EffectMode; label: string; desc: string }[] = [
  { id: 'none',      label: 'None',      desc: 'Original image' },
  { id: 'pixel',     label: 'Pixel',     desc: '8-bit downsampled' },
  { id: 'dither',    label: 'Dither',    desc: 'Floyd-Steinberg color' },
  { id: 'posterize', label: 'Poster',    desc: 'Flat color zones' },
  { id: 'duotone',   label: 'Duotone',   desc: 'Two-color mapping' },
  { id: 'scanlines', label: 'Scanlines', desc: 'CRT overlay' },
  { id: 'vignette',  label: 'Vignette',  desc: 'Dark edge fade' },
  { id: 'glitch',    label: 'Glitch',    desc: 'Cyberpunk row shift' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function PixelBackgroundUploader({
  currentImage,
  onImageChange,
}: {
  currentImage?: string;
  onImageChange: (dataUrl: string) => void;
}) {
  const [effect,    setEffect]    = useState<EffectMode>('pixel');
  const [params,    setParams]    = useState<Params>(DEFAULT_PARAMS);
  const [originalSrc, setOriginalSrc] = useState<string | null>(null);
  const [preview,   setPreview]   = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reprocess = (src: string, e: EffectMode, p: Params) => {
    applyEffect(src, e, p, url => {
      setPreview(url);
      onImageChange(url);
    });
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const src = ev.target?.result as string;
      setOriginalSrc(src);
      reprocess(src, effect, params);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith('image/')) handleFile(file);
  };

  const setEffectAndReprocess = (e: EffectMode) => {
    setEffect(e);
    if (originalSrc) reprocess(originalSrc, e, params);
  };

  const setParam = <K extends keyof Params>(key: K, val: Params[K]) => {
    const next = { ...params, [key]: val };
    setParams(next);
    if (originalSrc) reprocess(originalSrc, effect, next);
  };

  const displayImage = preview ?? currentImage ?? null;
  const currentEffect = EFFECTS.find(e => e.id === effect)!;

  return (
    <div className="space-y-2">
      {/* Upload zone */}
      <label
        className={`flex items-center justify-center w-full border border-zinc-700 border-dashed rounded-lg cursor-pointer bg-zinc-800/50 hover:bg-zinc-700/60 transition-colors ${displayImage ? 'py-1.5' : 'py-4'}`}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
      >
        <div className="flex items-center gap-1.5 text-zinc-400">
          <Upload size={12} />
          <span className="text-[10px]">{displayImage ? 'Replace image' : 'Upload image'}</span>
        </div>
        <input ref={fileInputRef} type="file" className="hidden" accept="image/*"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </label>

      {displayImage && (
        <div className="space-y-2">
          {/* Preview + remove */}
          <div className="flex items-start gap-2">
            <img src={displayImage} alt="preview"
              className="w-16 h-16 rounded object-cover shrink-0 ring-1 ring-zinc-600"
              style={{ imageRendering: effect === 'pixel' ? 'pixelated' : 'auto' }} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-zinc-300 font-medium">{currentEffect.label}</p>
              <p className="text-[9px] text-zinc-500">{currentEffect.desc}</p>
            </div>
            <button
              onClick={() => { setOriginalSrc(null); setPreview(null); onImageChange(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
              className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-400/10 transition-colors shrink-0"
              title="Remove"
            >
              <Trash2 size={12} />
            </button>
          </div>

          {/* Effect selector */}
          <div>
            <label className="text-[9px] text-zinc-500 uppercase tracking-wide font-medium block mb-1">Effect</label>
            <div className="flex gap-1 flex-wrap">
              {EFFECTS.map(e => (
                <button key={e.id} type="button"
                  onClick={() => setEffectAndReprocess(e.id)}
                  title={e.desc}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                    effect === e.id ? 'bg-zinc-700 border-zinc-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
                  }`}>{e.label}</button>
              ))}
            </div>
          </div>

          {/* Effect-specific params */}
          {effect === 'pixel' && (
            <SliderParam
              label="Resolution" value={params.pixelRes} min={8} max={128} step={4}
              display={`${params.pixelRes}px`} leftLabel="8-bit" rightLabel="HD"
              onChange={v => setParam('pixelRes', v)} />
          )}
          {effect === 'dither' && (
            <SliderParam
              label="Color levels" value={params.ditherLevels} min={2} max={16} step={1}
              display={`${params.ditherLevels}`} leftLabel="2 (B&W)" rightLabel="16"
              onChange={v => setParam('ditherLevels', v)} />
          )}
          {effect === 'posterize' && (
            <SliderParam
              label="Levels" value={params.posterizeLevels} min={2} max={8} step={1}
              display={`${params.posterizeLevels}`} leftLabel="2 (flat)" rightLabel="8 (rich)"
              onChange={v => setParam('posterizeLevels', v)} />
          )}
          {effect === 'duotone' && (
            <div className="space-y-1.5">
              <label className="text-[9px] text-zinc-500 uppercase tracking-wide font-medium block">Colors</label>
              <div className="flex items-center gap-2">
                <div>
                  <div className="text-[9px] text-zinc-500 mb-0.5">Shadows</div>
                  <div className="flex items-center gap-1">
                    <input type="color" value={params.duoColor1} onChange={e => setParam('duoColor1', e.target.value)}
                      className="w-8 h-7 cursor-pointer bg-transparent border-0 p-0 rounded" />
                    <input type="text" value={params.duoColor1} onChange={e => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setParam('duoColor1', e.target.value); }}
                      className="w-16 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-[9px] text-white font-mono focus:outline-none" maxLength={7} />
                  </div>
                </div>
                <div className="text-zinc-600 self-end mb-1">→</div>
                <div>
                  <div className="text-[9px] text-zinc-500 mb-0.5">Highlights</div>
                  <div className="flex items-center gap-1">
                    <input type="color" value={params.duoColor2} onChange={e => setParam('duoColor2', e.target.value)}
                      className="w-8 h-7 cursor-pointer bg-transparent border-0 p-0 rounded" />
                    <input type="text" value={params.duoColor2} onChange={e => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setParam('duoColor2', e.target.value); }}
                      className="w-16 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-[9px] text-white font-mono focus:outline-none" maxLength={7} />
                  </div>
                </div>
              </div>
            </div>
          )}
          {effect === 'scanlines' && (
            <div className="space-y-1.5">
              <SliderParam
                label="Line thickness" value={params.scanlineSize} min={1} max={6} step={1}
                display={`${params.scanlineSize}px`} leftLabel="Fine" rightLabel="Bold"
                onChange={v => setParam('scanlineSize', v)} />
              <SliderParam
                label="Opacity" value={Math.round(params.scanlineOpacity * 100)} min={10} max={90} step={5}
                display={`${Math.round(params.scanlineOpacity * 100)}%`} leftLabel="Subtle" rightLabel="Heavy"
                onChange={v => setParam('scanlineOpacity', v / 100)} />
            </div>
          )}
          {effect === 'vignette' && (
            <SliderParam
              label="Intensity" value={Math.round(params.vignetteIntensity * 100)} min={10} max={100} step={5}
              display={`${Math.round(params.vignetteIntensity * 100)}%`} leftLabel="Light" rightLabel="Dark"
              onChange={v => setParam('vignetteIntensity', v / 100)} />
          )}
          {effect === 'glitch' && (
            <SliderParam
              label="Intensity" value={Math.round(params.glitchIntensity * 100)} min={5} max={100} step={5}
              display={`${Math.round(params.glitchIntensity * 100)}%`} leftLabel="Subtle" rightLabel="Chaos"
              onChange={v => setParam('glitchIntensity', v / 100)} />
          )}
        </div>
      )}
    </div>
  );
}

function SliderParam({ label, value, min, max, step, display, leftLabel, rightLabel, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  display: string; leftLabel: string; rightLabel: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[9px] text-zinc-500 mb-0.5">
        <span className="uppercase tracking-wide font-medium">{label}</span>
        <span className="font-mono text-zinc-300">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full h-1 rounded appearance-none bg-zinc-700 accent-indigo-500 cursor-pointer" />
      <div className="flex justify-between text-[9px] text-zinc-600 mt-0.5">
        <span>{leftLabel}</span><span>{rightLabel}</span>
      </div>
    </div>
  );
}
