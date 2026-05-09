'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { IconDownload, IconPhoto, IconShare } from '@tabler/icons-react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import {
  type ShareOverlayId,
  SHARE_OVERLAY_OPTIONS,
  renderShareOverlay,
} from '@/components/poker/tournament/share-overlay-presets';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg';

type ShareBackgroundPreset = { id: string; label: string; src: string };

/** Served from `public/images/poker-tournament-share/` (same-origin for html2canvas). */
const SHARE_BACKGROUND_PRESETS: ShareBackgroundPreset[] = [
  { id: 'tower', label: 'Morbius tower', src: '/images/poker-tournament-share/morbius-tower-night.png' },
  { id: 'poker-room', label: 'Poker room', src: '/images/poker-tournament-share/poker-room-neon.png' },
  { id: 'holdem-teal', label: 'Texas Holdem (teal)', src: '/images/poker-tournament-share/texas-holdem-teal.png' },
  { id: 'holdem-purple', label: 'Texas Holdem (purple)', src: '/images/poker-tournament-share/texas-holdem-purple.png' },
  { id: 'lobby', label: 'Casino lobby', src: '/images/poker-tournament-share/casino-lobby-triptych.png' },
];

function revokeIfBlobUrl(url: string | null): void {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}

/**
 * html2canvas 1.x cannot parse CSS Color 4 (`oklch()`, `lab()`, etc.). Tailwind v4 theme
 * utilities often serialize to those functions in computed styles — including on properties
 * we did not previously mirror (box-shadow, text-shadow, border shorthand, background-image).
 * Resolve any offending value through a live probe so the clone only sees rgb/rgba/hex.
 */
const MODERN_COLOR_SYNTAX = /oklch\s*\(|lab\s*\(|lch\s*\(|hwb\s*\(|color\s*\(/i;

const PROBE_OUT_OF_FLOW =
  'position:fixed!important;left:-99999px!important;top:0!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;visibility:hidden!important';

function mirrorModernColorsOntoClone(
  originalRoot: HTMLElement,
  clonedRoot: HTMLElement,
  colorCtx: CanvasRenderingContext2D | null,
): void {
  const doc = originalRoot.ownerDocument;
  const win = doc.defaultView;
  const probe = doc.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  doc.documentElement.appendChild(probe);

  try {
    const stack: Array<[Element, Element]> = [[originalRoot, clonedRoot]];
    while (stack.length) {
      const [orig, clone] = stack.pop()!;
      if (orig instanceof HTMLElement && clone instanceof HTMLElement) {
        const cs = win?.getComputedStyle(orig);
        if (cs) {
          for (let i = 0; i < cs.length; i++) {
            const prop = cs.item(i);
            const raw = cs.getPropertyValue(prop).trim();
            if (!raw || !MODERN_COLOR_SYNTAX.test(raw)) continue;

            let resolved: string | null = null;
            try {
              probe.style.cssText = PROBE_OUT_OF_FLOW;
              probe.style.setProperty(prop, raw);
              const fromProbe = win?.getComputedStyle(probe).getPropertyValue(prop).trim();
              if (fromProbe && !MODERN_COLOR_SYNTAX.test(fromProbe)) resolved = fromProbe;
            } catch {
              /* leave resolved null */
            }

            if (!resolved && colorCtx) {
              try {
                colorCtx.fillStyle = raw;
                const s = String(colorCtx.fillStyle);
                if (!MODERN_COLOR_SYNTAX.test(s)) resolved = s;
              } catch {
                /* complex values (e.g. shadow) are not fillStyle-parseable */
              }
            }

            if (resolved) clone.style.setProperty(prop, resolved);
          }
        }
      }
      const oCh = orig.children;
      const cCh = clone.children;
      const n = Math.min(oCh.length, cCh.length);
      for (let i = 0; i < n; i++) stack.push([oCh[i], cCh[i]]);
    }
  } finally {
    probe.remove();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality = 0.92): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}

export type PokerTournamentSharePanelProps = {
  tournamentName: string;
  isFreeroll: boolean;
  /** Shown on overlays (e.g. site + chain). */
  siteLine?: string;
  scheduleLine: string;
  prizeLine: string;
  payoutLine: string;
};

export function PokerTournamentSharePanel({
  tournamentName,
  isFreeroll,
  siteLine = 'Morbius.io · PulseChain',
  scheduleLine,
  prizeLine,
  payoutLine,
}: PokerTournamentSharePanelProps) {
  const shareCardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /**
   * Pre-rendered PNG blob URL from the share preview. We render it BEFORE the user
   * clicks Download/Share so the actual click handler can fire `<a download>` or
   * `navigator.share()` synchronously — awaiting html2canvas inside the click
   * handler destroys the user-gesture token and browsers silently drop both.
   */
  const exportBlobUrlRef = useRef<string | null>(null);
  const [overlayStyle, setOverlayStyle] = useState<ShareOverlayId>('neonHero');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [exportPayload, setExportPayload] = useState<{
    blobUrl: string;
    file: File;
    filename: string;
  } | null>(null);
  const [exportPreparing, setExportPreparing] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const groupId = useId();

  useEffect(() => {
    return () => {
      revokeIfBlobUrl(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (exportBlobUrlRef.current) {
        URL.revokeObjectURL(exportBlobUrlRef.current);
        exportBlobUrlRef.current = null;
      }
    };
  }, []);

  const fundingLabel = isFreeroll ? 'Freeroll' : 'Buy-in';

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFileError(null);
    if (!f) return;
    if (!ACCEPT.split(',').some((t) => f.type === t.trim())) {
      setFileError('Use PNG or JPEG.');
      return;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      setFileError('Image must be 8 MB or smaller.');
      return;
    }
    setPreviewUrl((prev) => {
      revokeIfBlobUrl(prev);
      return URL.createObjectURL(f);
    });
  };

  const onSelectPreset = (src: string) => {
    setFileError(null);
    setPreviewUrl((prev) => {
      revokeIfBlobUrl(prev);
      return src;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearImage = () => {
    setPreviewUrl((prev) => {
      revokeIfBlobUrl(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    setFileError(null);
  };

  const runExportCanvas = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    const el = shareCardRef.current;
    if (!el) return null;
    try {
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        await document.fonts.ready;
      }
    } catch {
      /* ignore */
    }

    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#0c1222',
      logging: false,
      foreignObjectRendering: false,
      scrollX: 0,
      scrollY: -window.scrollY,
      onclone: (_doc, clonedEl) => {
        if (!(clonedEl instanceof HTMLElement)) return;
        const scratch = document.createElement('canvas');
        scratch.width = 1;
        scratch.height = 1;
        const colorCtx = scratch.getContext('2d');
        mirrorModernColorsOntoClone(el, clonedEl, colorCtx);
      },
    });
    return canvas;
  }, []);

  const blobFromCanvas = useCallback(async (canvas: HTMLCanvasElement): Promise<Blob | null> => {
    let blob = await canvasToBlob(canvas);
    if (blob) return blob;
    try {
      const dataUrl = canvas.toDataURL('image/png', 0.92);
      const res = await fetch(dataUrl);
      return await res.blob();
    } catch {
      return null;
    }
  }, []);

  const overlayProps = {
    tournamentName: tournamentName.trim() || 'My tournament',
    fundingLabel,
    siteLine,
    scheduleLine,
    prizeLine,
    payoutLine,
  };

  /**
   * Re-render the share PNG whenever any input that affects it changes.
   * Debounced so each keystroke in the parent name field doesn't kick off
   * a new html2canvas pass. Cancellation guards against out-of-order writes.
   */
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setExportPreparing(true);
      setExportError(null);
      try {
        const canvas = await runExportCanvas();
        if (cancelled) return;
        if (!canvas) {
          setExportError('Could not prepare image.');
          return;
        }
        const blob = await blobFromCanvas(canvas);
        if (cancelled) return;
        if (!blob) {
          setExportError('Could not prepare image.');
          return;
        }
        const filename = `poker-tournament-share-${Date.now()}.png`;
        const url = URL.createObjectURL(blob);
        const file = new File([blob], filename, { type: 'image/png' });
        const previous = exportBlobUrlRef.current;
        exportBlobUrlRef.current = url;
        if (previous) URL.revokeObjectURL(previous);
        setExportPayload({ blobUrl: url, file, filename });
      } catch (err) {
        if (cancelled) return;
        console.error('[PokerTournamentSharePanel] prepare failed', err);
        setExportError('Could not prepare image. Try another background.');
      } finally {
        if (!cancelled) setExportPreparing(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    previewUrl,
    overlayStyle,
    tournamentName,
    fundingLabel,
    siteLine,
    scheduleLine,
    prizeLine,
    payoutLine,
    runExportCanvas,
    blobFromCanvas,
  ]);

  const downloadReady = !!exportPayload && !exportPreparing;

  const onDownloadClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!downloadReady) {
      e.preventDefault();
      setStatusMsg(exportPreparing ? 'Image still preparing…' : 'Image not ready — try again.');
      return;
    }
    setStatusMsg('Download started — check your downloads folder.');
  };

  /**
   * Sync share — keep the user-gesture token. We pass the pre-rendered File
   * directly to navigator.share() WITHOUT awaiting beforehand. Awaiting
   * html2canvas here would cause the share sheet to be silently blocked.
   */
  const onShareClick = () => {
    if (!exportPayload) {
      setStatusMsg(exportPreparing ? 'Image still preparing…' : 'Image not ready — try again.');
      return;
    }
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
      share?: (data: ShareData) => Promise<void>;
    };
    const data: ShareData = {
      files: [exportPayload.file],
      title: overlayProps.tournamentName,
      text: `${overlayProps.tournamentName} — ${overlayProps.scheduleLine}`,
    };
    if (!nav.share || !nav.canShare?.(data)) {
      setStatusMsg('Sharing not supported here — use Download.');
      return;
    }
    setStatusMsg(null);
    nav
      .share(data)
      .then(() => setStatusMsg('Shared.'))
      .catch((err: unknown) => {
        if ((err as DOMException)?.name === 'AbortError') return;
        setStatusMsg('Share failed — use Download.');
      });
  };

  return (
    <div className="space-y-5">
      <p className="text-center text-sm text-white/70 leading-relaxed">
        Pick a preset background or upload your own, choose an overlay style, then download or share a PNG for social posts.
      </p>

      <div className="space-y-2">
        <Label className="text-sm font-semibold text-white/90">Overlay style</Label>
        <RadioGroup
          value={overlayStyle}
          onValueChange={(v) => setOverlayStyle(v as ShareOverlayId)}
          className="grid gap-3 sm:grid-cols-2"
          aria-label="Overlay style for share image"
        >
          {SHARE_OVERLAY_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              htmlFor={`${groupId}-${opt.id}`}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border border-cyan-500/20 bg-black/25 p-3 shadow-[inset_0_2px_6px_rgba(0,0,0,0.45)] transition-colors hover:border-cyan-500/35',
                overlayStyle === opt.id && 'border-cyan-500/45 bg-cyan-500/[0.08]',
              )}
            >
              <RadioGroupItem
                value={opt.id}
                id={`${groupId}-${opt.id}`}
                className="mt-0.5 border-cyan-500/50 text-cyan-400 focus-visible:ring-cyan-500/45"
              />
              <span className="min-w-0">
                <span className="block font-jost text-sm font-semibold text-white/95">{opt.title}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-white/55">{opt.description}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold text-white/90">Background image</Label>
        <p className="text-[11px] text-white/50">Preset art</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SHARE_BACKGROUND_PRESETS.map((p) => {
            const selected = previewUrl === p.src;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPreset(p.src)}
                className={cn(
                  'group relative aspect-[1200/630] overflow-hidden rounded-lg text-left shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)] transition-colors',
                  selected
                    ? 'border-2 border-cyan-500/55 ring-1 ring-cyan-400/30'
                    : 'border border-cyan-500/25 hover:border-cyan-500/45',
                )}
                style={{
                  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.95), rgba(40, 40, 40, 0.75))',
                }}
                aria-label={`Use ${p.label} background`}
                aria-pressed={selected}
              >
                <img src={p.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <span
                  className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pb-1.5 pt-6 text-[10px] font-semibold uppercase tracking-wide text-white/95"
                  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.85)' }}
                >
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="pt-1 text-[11px] text-white/50">Or upload</p>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileInputRef} type="file" accept={ACCEPT} className="hidden" onChange={onPickFile} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-gradient-to-r from-cyan-600/25 to-blue-600/20 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:from-cyan-600/35 hover:to-blue-600/30"
          >
            <IconPhoto className="h-4 w-4 opacity-90" aria-hidden />
            Choose image
          </button>
          {previewUrl ? (
            <button
              type="button"
              onClick={clearImage}
              className="rounded-lg px-3 py-2 text-sm text-white/60 underline-offset-2 hover:text-white hover:underline"
            >
              Clear background
            </button>
          ) : null}
        </div>
        {fileError ? <p className="text-[11px] text-amber-200/90">{fileError}</p> : null}
      </div>

      <div className="space-y-2">
        <p className="text-center text-xs font-medium uppercase tracking-wide text-white/50">Preview</p>
        <div className="flex justify-center overflow-x-auto pb-1">
          <div
            ref={shareCardRef}
            className="relative aspect-[1200/630] w-full max-w-[600px] shrink-0 overflow-hidden rounded-xl"
            style={{
              background: 'linear-gradient(145deg, #0f172a 0%, #0c1524 45%, #0f172a 100%)',
              border: '1px solid rgba(6, 182, 212, 0.28)',
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.45)',
              /* Avoid inheriting theme oklch() from ancestors — html2canvas cannot parse it. */
              color: 'rgb(255, 255, 255)',
            }}
          >
            {previewUrl ? (
              <>
                <img
                  src={previewUrl}
                  alt=""
                  crossOrigin="anonymous"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {/* Dim the underlying image so overlay text stays readable. */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{ background: 'rgba(0, 0, 0, 0.45)' }}
                  aria-hidden
                />
              </>
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.95), rgba(40, 40, 40, 0.75))',
                }}
              />
            )}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: 'radial-gradient(circle at 50% 40%, rgba(34,211,238,0.06), transparent 65%)',
              }}
              aria-hidden
            />
            {renderShareOverlay(overlayStyle, overlayProps)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <a
          href={exportPayload?.blobUrl ?? '#'}
          download={exportPayload?.filename ?? 'poker-tournament-share.png'}
          role="button"
          aria-disabled={!downloadReady}
          onClick={onDownloadClick}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg border border-cyan-500/35 bg-gradient-to-r from-cyan-600/30 to-blue-600/25 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:from-cyan-600/40 hover:to-blue-600/35',
            !downloadReady && 'cursor-not-allowed opacity-60 hover:from-cyan-600/30 hover:to-blue-600/25',
          )}
        >
          <IconDownload className="h-4 w-4" aria-hidden />
          {exportPreparing && !exportPayload ? 'Preparing…' : 'Download PNG'}
        </a>
        <button
          type="button"
          disabled={!exportPayload}
          onClick={onShareClick}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconShare className="h-4 w-4" aria-hidden />
          Share
        </button>
      </div>
      {statusMsg ? (
        <p
          role="status"
          aria-live="polite"
          className="mx-auto max-w-md rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-center text-xs font-medium text-cyan-100"
        >
          {statusMsg}
        </p>
      ) : exportError ? (
        <p
          role="status"
          aria-live="polite"
          className="mx-auto max-w-md rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-center text-xs font-medium text-amber-100"
        >
          {exportError}
        </p>
      ) : exportPreparing ? (
        <p className="text-center text-[11px] text-white/55">Preparing image…</p>
      ) : null}
    </div>
  );
}
